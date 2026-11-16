// alertsCore.js — die Logik des Overlay-Moduls „Alerts“ ohne Datenbank und ohne Twitch (testbar).
//
// Ein Alert ist ein kurzer Hinweis im Stream: neuer Follower, Abo, Verlängerung, Geschenk-Abos, Bits, Raid.
// Die Ereignisse sammelt streamToolAlerts.js (Chat-Bot und Follower-Liste) und legt sie hier in eine kurze Liste;
// die OBS-Quelle holt die Liste ab und spielt neue Einträge nacheinander ab.

const KINDS = ['follow', 'sub', 'resub', 'gift', 'bits', 'raid'];

/** So viele Alerts hält der Server je Kanal vor — ältere fallen heraus. */
const MAX_EVENTS = 40;
/** So lange bleibt ein Alert abrufbar. Die OBS-Quelle fragt alle zwei Sekunden, das reicht weit. */
const KEEP_MS = 10 * 60 * 1000;
/** Ein Geschenkpaket kündigt Twitch vorab an; die einzelnen Geschenke dazu kommen kurz danach. */
const BUNDLE_MS = 60 * 1000;
/** So viele Follower merkt sich der Server je Kanal, damit Entfolgen und erneutes Folgen keinen zweiten Alert gibt. */
const MAX_SEEN_FOLLOWERS = 1000;

const clean = (s, max) => String(s ?? '')
  // Steuerzeichen raus; Zeilenumbrüche würden die Karte sprengen
  .replace(/[\u0000-\u001f\u007f]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

/** Cheermotes („Cheer100“, „Kappa50“) aus einer Bits-Nachricht entfernen — sie stehen schon als Zahl im Alert. */
function stripCheermotes(message) {
  return clean(String(message || '').split(/\s+/).filter((w) => !/^[A-Za-z]+\d+$/.test(w)).join(' '), 200);
}

/** Abo-Stufe aus tmi.js-„methods“: '1' | '2' | '3' | 'prime'. */
function tierOf(methods) {
  if (!methods || typeof methods !== 'object') return '1';
  if (methods.prime || String(methods.plan).toLowerCase() === 'prime') return 'prime';
  if (String(methods.plan) === '3000') return '3';
  if (String(methods.plan) === '2000') return '2';
  return '1';
}

let counter = 0;
/**
 * Ein Alert. name leer = anonym (Geschenke ohne Namen).
 * @param {'follow'|'sub'|'resub'|'gift'|'bits'|'raid'} kind
 */
function makeEvent(kind, { name = '', amount = 0, months = 0, tier = '', message = '', test = false } = {}, now = Date.now()) {
  counter = (counter + 1) % 1e6;
  return {
    id: `${now.toString(36)}-${counter.toString(36)}`,
    kind,
    name: clean(name, 40),
    amount: Math.max(0, Math.round(Number(amount) || 0)),
    months: Math.max(0, Math.round(Number(months) || 0)),
    tier: tier ? String(tier) : '',
    message: clean(message, 200),
    at: now,
    ...(test ? { test: true } : {}),
  };
}

/** Ob ein Alert laut Einstellungen gezeigt wird (Art eingeschaltet, Schwellen erreicht). */
function allowed(mod, ev) {
  if (!mod || !mod.enabled || !ev || !KINDS.includes(ev.kind)) return false;
  if (mod.kinds && mod.kinds[ev.kind] === false) return false;
  if (ev.kind === 'bits' && ev.amount < Math.max(1, Number(mod.minBits) || 1)) return false;
  if (ev.kind === 'raid' && ev.amount < Math.max(0, Number(mod.minRaidViewers) || 0)) return false;
  return true;
}

/** Liste mit neuem Alert, gekürzt auf MAX_EVENTS und KEEP_MS. Gibt eine neue Liste zurück. */
function pushEvent(list, ev, now = Date.now()) {
  const kept = (list || []).filter((e) => now - e.at < KEEP_MS);
  kept.push(ev);
  return kept.slice(-MAX_EVENTS);
}

/** Alerts, die die OBS-Quelle noch braucht. */
function recent(list, now = Date.now()) {
  return (list || []).filter((e) => now - e.at < KEEP_MS);
}

/**
 * Geschenkpakete: Twitch meldet erst „X verschenkt 5 Abos“ und danach jedes Geschenk einzeln. Gezeigt wird nur der
 * eine Alert für das Paket; die Einzelgeschenke werden hier geschluckt.
 */
class GiftBundles {
  constructor() { this.open = new Map(); }

  /** Paket angekündigt. gifter '' = anonym. */
  note(channel, gifter, count, now = Date.now()) {
    const key = `${channel}:${String(gifter || '').toLowerCase()}`;
    const prev = this.open.get(key);
    const left = (prev && now < prev.until ? prev.left : 0) + Math.max(0, Math.round(Number(count) || 0));
    this.open.set(key, { left, until: now + BUNDLE_MS });
  }

  /** true, wenn dieses Einzelgeschenk zu einem angekündigten Paket gehört (und damit keinen eigenen Alert bekommt). */
  absorb(channel, gifter, now = Date.now()) {
    const key = `${channel}:${String(gifter || '').toLowerCase()}`;
    const b = this.open.get(key);
    if (!b || now >= b.until || b.left <= 0) {
      this.open.delete(key);
      return false;
    }
    b.left -= 1;
    if (b.left <= 0) this.open.delete(key);
    return true;
  }
}

/**
 * Neue Follower aus der Liste von Twitch (neueste zuerst, wie GET channels/followers sie liefert).
 * Beim ersten Abruf gibt es keine Alerts — sonst käme beim Öffnen der Quelle ein Schwall alter Follows.
 * @param {{ lastAt?: number, seen?: string[] } | null} state
 * @param {Array<{ user_id: string, user_name: string, user_login?: string, followed_at: string }>} list
 * @returns {{ state: { lastAt: number, seen: string[] }, fresh: Array<{ id: string, name: string, at: number }> }}
 */
function diffFollows(state, list, now = Date.now()) {
  const rows = (Array.isArray(list) ? list : [])
    .map((f) => ({ id: String(f.user_id || ''), name: String(f.user_name || f.user_login || ''), at: Date.parse(f.followed_at) || 0 }))
    .filter((f) => f.id && f.at > 0);
  const newest = rows.reduce((max, f) => Math.max(max, f.at), 0);

  if (!state || !state.lastAt) {
    return { state: { lastAt: newest || now, seen: rows.map((f) => f.id).slice(0, MAX_SEEN_FOLLOWERS) }, fresh: [] };
  }

  const seen = new Set(state.seen || []);
  const fresh = rows
    .filter((f) => f.at > state.lastAt && !seen.has(f.id))
    .sort((a, b) => a.at - b.at);
  const nextSeen = [...fresh.map((f) => f.id), ...(state.seen || [])].slice(0, MAX_SEEN_FOLLOWERS);
  return { state: { lastAt: Math.max(state.lastAt, newest), seen: nextSeen }, fresh };
}

/** Beispiel-Alerts für den Testknopf. Namen bewusst erfunden und als Test markiert; Nachrichten je Overlay-Sprache. */
const TEST_SAMPLES = {
  follow: { name: 'Testfollower' },
  sub: { name: 'Testabo', tier: '1' },
  resub: { name: 'Treue_Seele', months: 14 },
  gift: { name: 'Spendabel', amount: 5 },
  bits: { name: 'Bitregen', amount: 500 },
  raid: { name: 'Nachbarkanal', amount: 42 },
};
const TEST_MESSAGES = {
  de: { resub: 'Schon über ein Jahr dabei!', bits: 'Viel Glück im nächsten Match!' },
  en: { resub: 'Over a year already!', bits: 'Good luck in the next match!' },
};

function testEvent(kind, now = Date.now(), lang = 'de') {
  if (!KINDS.includes(kind)) return null;
  const message = (TEST_MESSAGES[lang] || TEST_MESSAGES.de)[kind] || '';
  return makeEvent(kind, { ...TEST_SAMPLES[kind], message, test: true }, now);
}

module.exports = {
  KINDS, MAX_EVENTS, KEEP_MS, BUNDLE_MS,
  stripCheermotes, tierOf, makeEvent, allowed, pushEvent, recent, GiftBundles, diffFollows, testEvent,
};
