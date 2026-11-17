// subathonCore.js — die Logik des Overlay-Moduls „Subathon-Timer“ ohne Datenbank und ohne Twitch (testbar).
//
// Ein Subathon ist ein Countdown, den Abos, Bits und Spenden verlängern. Die Ereignisse sammelt
// streamToolSubathon.js (Chat-Bot, Dashboard, Mod-Befehle im Chat) und legt den Zustand in der Zeile des Streamers ab.
//
// Gespeichert wird beim Laufen der Endzeitpunkt (endsAt), sonst die Restzeit (remainingMs). Abgelaufen ist der Timer,
// sobald die Uhr endsAt erreicht — das entscheidet tick() bei jedem Lesen; einen Server-Timer gibt es nicht.
// Dieselbe Rechnung macht die OBS-Quelle zwischen zwei Abrufen (Frontend: streamToolConfig.js, subathonRemaining).

/** Obergrenze jeder Zeitangabe (wie beim Timer der Win Challenge). */
const MAX_MS = 999 * 3600 * 1000;
/** So viele Einträge behält der Verlauf. */
const MAX_LOG = 200;
/** Höchstwert einer Regel in Sekunden (ein Abo = höchstens ein Tag). */
const RULE_MAX_S = 24 * 3600;
/** Höchstbetrag einer Spende — darüber ist es ein Tippfehler. */
const MAX_DONATION = 100000;
/** Höchstens so viel Zeit auf einmal per Hand oder Chat-Befehl. */
const MAX_MANUAL_MS = 99 * 3600 * 1000;

/** Arten im Verlauf. manual = von Hand im Dashboard oder per Mod-Befehl. */
const KINDS = ['sub', 'resub', 'gift', 'bits', 'donation', 'manual'];
/** Regeln in Sekunden: je Abo nach Stufe, je 100 Bits, je ganzer Währungseinheit einer Spende. */
const RULE_KEYS = ['sub1', 'sub2', 'sub3', 'bits100', 'donation'];
const DEFAULT_RULES = { sub1: 300, sub2: 600, sub3: 1500, bits100: 60, donation: 60 };
const DEFAULT_START_MINUTES = 60;
/** Happy Hour (Abo-Extra): Faktoren und längste Dauer. Gilt für Abos, Bits und Spenden, nie für Zeit von Hand. */
const HAPPY_FACTORS = [2, 3];
const HAPPY_MAX_MINUTES = 240;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const clean = (s, max) => String(s ?? '')
  .replace(/[\u0000-\u001f\u007f]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

/** Die Regeln eines Moduls, jede Zahl geprüft. 0 heißt: diese Art verlängert nicht. */
function rulesOf(mod) {
  const out = {};
  for (const k of RULE_KEYS) {
    const v = Number(mod?.rules?.[k]);
    out[k] = Number.isFinite(v) ? clamp(v, 0, RULE_MAX_S) : DEFAULT_RULES[k];
  }
  return out;
}

/** Startzeit in ms (mindestens eine Minute). */
function startMsOf(mod) {
  const v = Number(mod?.startMinutes);
  const minutes = Number.isFinite(v) && v > 0 ? v : DEFAULT_START_MINUTES;
  return clamp(Math.round(minutes * 60000), 60000, MAX_MS);
}

/** Obergrenze der Gesamtdauer in ms; 0 = keine. Gesamtdauer = schon gelaufen + noch übrig. */
function capMsOf(mod) {
  const h = Number(mod?.capHours);
  return Number.isFinite(h) && h > 0 ? clamp(Math.round(h * 3600000), 60000, MAX_MS) : 0;
}

function emptyState() {
  return { status: 'idle', remainingMs: 0, endsAt: 0, startedAt: 0, endedAt: 0, runMs: 0, runSince: 0, addedMs: 0, rev: 0, log: [], happy: null };
}

/** Gespeicherte Happy Hour prüfen: { factor, until } oder null. */
function normalizeHappy(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const factor = Number(raw.factor);
  const until = num(raw.until);
  return HAPPY_FACTORS.includes(factor) && until > 0 ? { factor, until } : null;
}

const STATUSES = ['idle', 'running', 'paused', 'ended'];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Gespeicherten Zustand prüfen — kaputte oder fehlende Felder ergeben einen sauberen Leerlauf. */
function normalize(raw) {
  if (!raw || typeof raw !== 'object' || !STATUSES.includes(raw.status)) return emptyState();
  const s = {
    status: raw.status,
    remainingMs: clamp(num(raw.remainingMs), 0, MAX_MS),
    endsAt: num(raw.endsAt),
    startedAt: num(raw.startedAt),
    endedAt: num(raw.endedAt),
    runMs: Math.max(0, num(raw.runMs)),
    runSince: num(raw.runSince),
    addedMs: num(raw.addedMs),
    rev: Math.max(0, Math.round(num(raw.rev))),
    log: Array.isArray(raw.log) ? raw.log.filter((e) => e && typeof e === 'object' && KINDS.includes(e.kind)).slice(-MAX_LOG) : [],
    happy: normalizeHappy(raw.happy),
  };
  if (s.status === 'running' && !(s.endsAt > 0 && s.runSince > 0)) return { ...s, status: 'paused', endsAt: 0, runSince: 0 };
  return s;
}

/** Restzeit jetzt. */
function remainingNow(s, now = Date.now()) {
  return s.status === 'running' ? Math.max(0, s.endsAt - now) : Math.max(0, s.remainingMs);
}

/** Wie lange der Timer insgesamt schon läuft (Pausen zählen nicht). */
function elapsedNow(s, now = Date.now()) {
  const current = s.status === 'running' ? Math.max(0, Math.min(now, s.endsAt) - s.runSince) : 0;
  return s.runMs + current;
}

/** Abgelaufen? Dann gilt der Subathon als beendet. Gibt denselben Zustand zurück, wenn sich nichts ändert. */
function tick(s, now = Date.now()) {
  if (s.status !== 'running' || s.endsAt > now) return s;
  return {
    ...s,
    status: 'ended',
    remainingMs: 0,
    runMs: s.runMs + Math.max(0, s.endsAt - s.runSince),
    runSince: 0,
    endedAt: s.endsAt,
    endsAt: 0,
    rev: s.rev + 1,
  };
}

/** Starten (aus dem Leerlauf mit der Startzeit) oder nach einer Pause weiterlaufen lassen. */
function start(s, mod, now = Date.now()) {
  const cur = tick(s, now);
  if (cur.status === 'paused') {
    return tick({ ...cur, status: 'running', endsAt: now + cur.remainingMs, remainingMs: 0, runSince: now, rev: cur.rev + 1 }, now);
  }
  if (cur.status !== 'idle') return cur;
  const cap = capMsOf(mod);
  const first = cap ? Math.min(startMsOf(mod), cap) : startMsOf(mod);
  return { ...emptyState(), status: 'running', endsAt: now + first, startedAt: now, runSince: now, rev: cur.rev + 1 };
}

function pause(s, now = Date.now()) {
  const cur = tick(s, now);
  if (cur.status !== 'running') return cur;
  return {
    ...cur,
    status: 'paused',
    remainingMs: Math.max(0, cur.endsAt - now),
    runMs: cur.runMs + Math.max(0, now - cur.runSince),
    endsAt: 0,
    runSince: 0,
    rev: cur.rev + 1,
  };
}

/** Alles auf Anfang, Verlauf eingeschlossen. */
function reset(s) {
  return { ...emptyState(), rev: (Number(s?.rev) || 0) + 1 };
}

let counter = 0;
function makeEntry({ kind, name = '', amount = 0, tier = '', factor = 1 }, ms, capped, now) {
  counter = (counter + 1) % 1e6;
  const amt = Number(amount) || 0;
  return {
    id: `${now.toString(36)}-${counter.toString(36)}`,
    at: now,
    kind,
    name: clean(name, 40),
    // Spenden mit Cent, alles andere ganzzahlig
    amount: kind === 'donation' ? Math.round(Math.max(0, amt) * 100) / 100 : Math.max(0, Math.round(amt)),
    tier: tier ? String(tier) : '',
    ms,
    ...(capped ? { capped: true } : {}),
    // Während einer Happy Hour gutgeschrieben (×2, ×3)
    ...(HAPPY_FACTORS.includes(factor) ? { x: factor } : {}),
  };
}

/* ── Happy Hour ──────────────────────────────────────────────────────────────
   Für eine feste Zeit zählen Abos, Bits und Spenden doppelt oder dreifach. Sie läuft nach der Uhr (auch während
   einer Pause) und endet von selbst. Ob sie zählt, entscheidet streamToolSubathon.js (nur mit Abo). */

/** Laufende Happy Hour oder null. */
function happyOf(s, now = Date.now()) {
  const h = s && s.happy;
  return h && h.until > now && (s.status === 'running' || s.status === 'paused') ? h : null;
}

/** Faktor für ein Ereignis jetzt (1 ohne Happy Hour). */
const happyFactor = (s, now = Date.now()) => happyOf(s, now)?.factor || 1;

/**
 * Happy Hour starten (oder eine laufende ersetzen). Nur während der Subathon läuft oder pausiert ist.
 * @returns {object | { error: string }}
 */
function startHappy(s, minutes, factor, now = Date.now()) {
  const cur = tick(s, now);
  if (cur.status !== 'running' && cur.status !== 'paused') return { error: 'subathon_not_running' };
  const f = Number(factor);
  const m = Number(minutes);
  if (!HAPPY_FACTORS.includes(f) || !Number.isFinite(m) || m < 1 || m > HAPPY_MAX_MINUTES) return { error: 'subathon_bad_amount' };
  return { ...cur, happy: { factor: f, until: now + Math.round(m) * 60000 }, rev: cur.rev + 1 };
}

function stopHappy(s, now = Date.now()) {
  const cur = tick(s, now);
  return cur.happy ? { ...cur, happy: null, rev: cur.rev + 1 } : cur;
}

/**
 * Zeit dazu (oder bei ms < 0 abziehen). Zählt nur, solange der Subathon läuft oder pausiert ist. Von Hand
 * hinzugefügte Zeit holt einen abgelaufenen Subathon als pausiert zurück — für den Fall, dass er durch einen
 * Tippfehler („-50m“ statt „-5m“) zu früh auf null fiel.
 * @param {{ kind: string, name?: string, amount?: number, tier?: string }} info  Eintrag für den Verlauf
 * @returns {{ state: object, entry: object|null }}  entry null = nichts verändert
 */
function addTime(s, mod, ms, info, now = Date.now()) {
  let cur = tick(s, now);
  const want = Math.round(Number(ms) || 0);
  if (!want || !info || !KINDS.includes(info.kind)) return { state: cur, entry: null };
  if (cur.status === 'ended' && info.kind === 'manual' && want > 0) {
    cur = { ...cur, status: 'paused', remainingMs: 0, endedAt: 0 };
  }
  if (cur.status !== 'running' && cur.status !== 'paused') return { state: cur, entry: null };

  const rem = remainingNow(cur, now);
  let applied = want;
  let capped = false;
  if (want > 0) {
    const cap = capMsOf(mod);
    if (cap) {
      const room = Math.max(0, cap - elapsedNow(cur, now) - rem);
      if (room < want) {
        applied = room;
        capped = true;
      }
    }
    applied = Math.min(applied, MAX_MS - rem);
  } else {
    // Nie unter null
    applied = Math.max(want, -rem);
  }

  const entry = makeEntry(info, applied, capped, now);
  const next = { ...cur, addedMs: cur.addedMs + applied, rev: cur.rev + 1, log: [...cur.log, entry].slice(-MAX_LOG) };
  if (cur.status === 'running') next.endsAt = cur.endsAt + applied;
  else next.remainingMs = rem + applied;
  return { state: tick(next, now), entry };
}

/**
 * Wie viel Zeit ein Ereignis bringt, nach den Regeln des Moduls.
 * @param {{ kind: string, amount?: number, tier?: string }} ev  amount: Anzahl Abos, Bits oder Spendenbetrag
 */
function msForEvent(mod, ev) {
  if (!ev) return 0;
  const r = rulesOf(mod);
  const amount = Math.max(0, Number(ev.amount) || 0);
  if (ev.kind === 'sub' || ev.kind === 'resub' || ev.kind === 'gift') {
    if (ev.kind === 'resub' && mod?.countResubs === false) return 0;
    if (ev.kind === 'gift' && mod?.countGifts === false) return 0;
    const per = ev.tier === '3' ? r.sub3 : ev.tier === '2' ? r.sub2 : r.sub1;
    return Math.round(per * 1000 * Math.max(1, Math.round(amount) || 1));
  }
  if (ev.kind === 'bits') return Math.round(amount * r.bits100 * 10);
  if (ev.kind === 'donation') return Math.round(Math.min(amount, MAX_DONATION) * r.donation * 1000);
  return 0;
}

const publicEntry = (e) => ({
  id: e.id, at: e.at, kind: e.kind, name: e.name, amount: e.amount, tier: e.tier, ms: e.ms,
  ...(e.capped ? { capped: true } : {}), ...(HAPPY_FACTORS.includes(e.x) ? { x: e.x } : {}),
});

/** Was die OBS-Quelle braucht. Die Restzeit rechnet sie zwischen den Abrufen selbst aus endsAt weiter. */
function publicView(s, mod, now = Date.now()) {
  const cur = tick(s, now);
  const cap = capMsOf(mod);
  const rem = remainingNow(cur, now);
  const elapsed = elapsedNow(cur, now);
  const happy = happyOf(cur, now);
  return {
    happy: happy ? { factor: happy.factor, until: happy.until } : null,
    status: cur.status,
    remainingMs: rem,
    endsAt: cur.status === 'running' ? cur.endsAt : 0,
    elapsedMs: elapsed,
    addedMs: cur.addedMs,
    capMs: cap,
    // Eine Sekunde Spielraum: die Restzeit läuft beim Rechnen ja weiter
    capReached: !!cap && cur.status !== 'idle' && elapsed + rem >= cap - 1000,
    recent: cur.log.slice(-5).map(publicEntry),
  };
}

/** Für das Dashboard: dazu der Verlauf (neueste zuerst) und Beginn/Ende. */
function dashboardView(s, mod, now = Date.now(), limit = 50) {
  const cur = tick(s, now);
  return {
    ...publicView(cur, mod, now),
    startedAt: cur.startedAt,
    endedAt: cur.endedAt,
    log: cur.log.slice(-limit).reverse().map(publicEntry),
  };
}

/* ── Chat-Befehl ─────────────────────────────────────────────────────────────
   !subathon                  Restzeit (alle, mit Abklingzeit)
   !subathon +10m [Name]      Zeit dazu; auch -5m, +90s, +1h30m, +10 (= Minuten)
   !subathon spende 10 [Name] Spende nach der Regel „je Einheit“ (auch tip / donation)
   !subathon pause | start    anhalten und weiterlaufen lassen (auch weiter / resume)
   !subathon happy 30m x3     Happy Hour (Abo-Extra), „happy stop“ beendet sie
   Die Befehle sind in jeder Overlay-Sprache dieselben — Streamer.bot & Co. schicken sie fest verdrahtet. */

/** "+10m", "-5m", "+90s", "+1h30m", "+10" (Minuten) → ms mit Vorzeichen; sonst null. */
function parseDuration(text) {
  const s = String(text || '').trim().toLowerCase();
  const full = /^([+-])(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/.exec(s);
  let ms = null;
  let sign = '';
  if (full && (full[2] || full[3] || full[4])) {
    sign = full[1];
    ms = (((Number(full[2]) || 0) * 60 + (Number(full[3]) || 0)) * 60 + (Number(full[4]) || 0)) * 1000;
  } else {
    const minutes = /^([+-])(\d{1,4})$/.exec(s);
    if (!minutes) return null;
    sign = minutes[1];
    ms = Number(minutes[2]) * 60000;
  }
  if (!(ms > 0) || ms > MAX_MANUAL_MS) return null;
  return sign === '-' ? -ms : ms;
}

/** "10", "10,50", "10.50€", "$5" → Zahl > 0; sonst null. */
function parseAmount(text) {
  const s = String(text || '').trim().replace(/[€$£]|eur|usd/gi, '').replace(',', '.');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
  const v = Number(s);
  return v > 0 && v <= MAX_DONATION ? v : null;
}

/**
 * „!subathon happy 30m x3“, „happy 1h“ (Faktor 2), „happy 45“ (Minuten), „happy stop“.
 * @returns {{ action: 'happy', minutes: number, factor: number } | { action: 'happyStop' } | { action: 'invalid' }}
 */
function parseHappy(words) {
  const parts = words.map((w) => w.toLowerCase());
  if (parts.some((w) => ['stop', 'aus', 'off', 'ende', 'end'].includes(w))) return { action: 'happyStop' };
  let factor = 2;
  let minutes = 0;
  for (const w of parts) {
    const f = /^(?:x([23])|([23])x)$/.exec(w);
    if (f) { factor = Number(f[1] || f[2]); continue; }
    const d = /^(?:(\d{1,2})h)?(?:(\d{1,3})m?)?$/.exec(w);
    if (d && (d[1] || d[2])) minutes = (Number(d[1]) || 0) * 60 + (Number(d[2]) || 0);
    else return { action: 'invalid' };
  }
  if (!(minutes >= 1 && minutes <= HAPPY_MAX_MINUTES)) return { action: 'invalid' };
  return { action: 'happy', minutes, factor };
}

/**
 * @returns {null | { action: 'info'|'start'|'pause'|'add'|'donation'|'happy'|'happyStop'|'invalid', ms?: number, amount?: number, name?: string, minutes?: number, factor?: number }}
 *   null = kein !subathon-Befehl
 */
function parseCommand(message) {
  const m = /^!subathon(?:\s+([\s\S]*))?$/i.exec(String(message || '').trim());
  if (!m) return null;
  const rest = (m[1] || '').trim();
  if (!rest) return { action: 'info' };
  const [head, ...tail] = rest.split(/\s+/);
  const h = head.toLowerCase();
  if (['start', 'weiter', 'resume', 'go'].includes(h)) return { action: 'start' };
  if (['pause', 'stop'].includes(h)) return { action: 'pause' };
  if (['happy', 'happyhour', 'hh'].includes(h)) return parseHappy(tail);
  if (['spende', 'tip', 'donation', 'dono'].includes(h)) {
    const amount = parseAmount(tail[0]);
    return amount ? { action: 'donation', amount, name: clean(tail.slice(1).join(' '), 40) } : { action: 'invalid' };
  }
  const ms = parseDuration(head);
  if (ms !== null) return { action: 'add', ms, name: clean(tail.join(' '), 40) };
  return { action: 'invalid' };
}

/** Zeit für den Chat, immer mit Stunden wie im Overlay: "3:05:09", "0:12:04". */
function clockText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Differenz für den Chat: "+5:00", "-1:30", "+1:02:00". */
function deltaText(ms) {
  const sign = ms < 0 ? '-' : '+';
  const total = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0
    ? `${sign}${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${sign}${m}:${String(sec).padStart(2, '0')}`;
}

module.exports = {
  MAX_MS, MAX_LOG, KINDS, RULE_KEYS, DEFAULT_RULES, DEFAULT_START_MINUTES, MAX_DONATION, MAX_MANUAL_MS,
  HAPPY_FACTORS, HAPPY_MAX_MINUTES,
  rulesOf, startMsOf, capMsOf, emptyState, normalize, remainingNow, elapsedNow, tick, start, pause, reset,
  addTime, msForEvent, publicView, dashboardView, parseDuration, parseAmount, parseCommand, clockText, deltaText,
  happyOf, happyFactor, startHappy, stopHappy,
};
