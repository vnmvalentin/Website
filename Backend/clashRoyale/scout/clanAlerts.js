// clanAlerts.js — Discord-Erinnerungen der Clan-Zentrale (Ausbauplan „clan-zentrale", Spur B).
//
// Wer angemeldet ist (jedes Konto: Twitch, Discord oder Gast), trägt für einen Clan einen Discord-Webhook ein — den legt
// man in Discord unter Kanal bearbeiten → Integrationen → Webhooks selbst an. Der Server schickt dorthin:
//   • vor dem Ende jedes Kriegstags, wer noch Decks offen hat (wie viele Stunden vorher, stellt man ein)
//   • nach Ende des Rennens am Montag einen Wochenbericht (Platz, Decks je Mitglied, Spender, Vorschläge)
// Läuft über den Webhook, nicht über den Discord-Bot der Website — der Bot muss dafür auf keinem Server sein.
//
// Speicher: eigene Datei Backend/data/cr_clan_alerts.db (Pfad per CR_CLAN_ALERTS_DB, Tests ':memory:'), getrennt von
// cr_scout.db, weil Webhook-Adressen Zugangsdaten sind: verschlüsselt mit AES-256-GCM, Schlüssel aus
// CR_CLAN_ALERTS_SECRET oder einer Schlüsseldatei daneben (gitignored wie die DB).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { dataPath } = require('../../lib/dataDir');
const central = require('./clanCentral');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/(\d{15,22})\/([\w-]{20,120})\/?$/;
const MAX_PER_KONTO = 3;
const MAX_TOTAL = 2000;
const REMIND_HOURS = [0, 1, 2, 3, 4, 6, 8, 12];
const LANGS = new Set(['de', 'en']);
// Nach so vielen Fehlversuchen in Folge (Discord nicht erreichbar) pausiert die Erinnerung, bis sie neu gespeichert wird
const MAX_FAILS = 6;

// ── Speicher ─────────────────────────────────────────────────────────────────

function loadKey(file) {
  const fromEnv = process.env.CR_CLAN_ALERTS_SECRET;
  if (fromEnv) return crypto.createHash('sha256').update(String(fromEnv)).digest();
  if (file === ':memory:') return crypto.randomBytes(32);
  const keyFile = path.join(path.dirname(file), 'cr_clan_alerts.key');
  try {
    if (fs.existsSync(keyFile)) return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
  } catch { /* unlesbar → neu erzeugen */ }
  const key = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyFile, key.toString('hex'), { mode: 0o600 });
  } catch (err) {
    console.warn('[clan-alerts] Schlüsseldatei nicht schreibbar — Webhooks überleben keinen Neustart:', err.message);
  }
  return key;
}

/** Normalisierte Webhook-Adresse oder null. */
function parseWebhook(raw) {
  const url = String(raw || '').trim().replace(/^https:\/\/discordapp\.com/, 'https://discord.com');
  const m = WEBHOOK_RE.exec(url);
  return m ? { url: url.replace(/\/$/, ''), id: m[1] } : null;
}

/**
 * @param {{ file?: string }} [opts] file: Pfad der DB (Standard CR_CLAN_ALERTS_DB oder Backend/data/cr_clan_alerts.db)
 */
function createClanAlertStore({ file } = {}) {
  let db = null;
  let st = null;
  let key = null;
  const dbFile = () => file || process.env.CR_CLAN_ALERTS_DB || dataPath('cr_clan_alerts.db');

  function open() {
    if (db) return st;
    const f = dbFile();
    db = new Database(f);
    if (f !== ':memory:') db.pragma('journal_mode = WAL');
    key = loadKey(f);
    db.exec(`
      CREATE TABLE IF NOT EXISTS clan_alerts (
        konto_id TEXT NOT NULL,
        clan_tag TEXT NOT NULL,
        clan_name TEXT NOT NULL DEFAULT '',
        webhook TEXT NOT NULL,
        hook_id TEXT NOT NULL DEFAULT '',
        hook_name TEXT NOT NULL DEFAULT '',
        remind_hours INTEGER NOT NULL DEFAULT 3,
        weekly INTEGER NOT NULL DEFAULT 1,
        lang TEXT NOT NULL DEFAULT 'de',
        last_remind TEXT NOT NULL DEFAULT '',
        last_weekly TEXT NOT NULL DEFAULT '',
        last_sent INTEGER NOT NULL DEFAULT 0,
        fails INTEGER NOT NULL DEFAULT 0,
        broken INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (konto_id, clan_tag)
      );
      CREATE INDEX IF NOT EXISTS idx_clan_alerts_tag ON clan_alerts(clan_tag);
    `);
    st = {
      get: db.prepare('SELECT * FROM clan_alerts WHERE konto_id = ? AND clan_tag = ?'),
      ofKonto: db.prepare('SELECT * FROM clan_alerts WHERE konto_id = ? ORDER BY created_at'),
      countKonto: db.prepare('SELECT COUNT(*) AS n FROM clan_alerts WHERE konto_id = ?'),
      countAll: db.prepare('SELECT COUNT(*) AS n FROM clan_alerts'),
      all: db.prepare('SELECT * FROM clan_alerts WHERE broken = 0'),
      insert: db.prepare(`INSERT INTO clan_alerts (konto_id, clan_tag, clan_name, webhook, hook_id, hook_name, remind_hours, weekly, lang, created_at, updated_at)
        VALUES (@konto, @tag, @clanName, @webhook, @hookId, @hookName, @remind, @weekly, @lang, @now, @now)`),
      update: db.prepare(`UPDATE clan_alerts SET clan_name = @clanName, remind_hours = @remind, weekly = @weekly, lang = @lang, updated_at = @now
        WHERE konto_id = @konto AND clan_tag = @tag`),
      updateHook: db.prepare(`UPDATE clan_alerts SET webhook = @webhook, hook_id = @hookId, hook_name = @hookName, fails = 0, broken = 0, updated_at = @now
        WHERE konto_id = @konto AND clan_tag = @tag`),
      remove: db.prepare('DELETE FROM clan_alerts WHERE konto_id = ? AND clan_tag = ?'),
      removeKonto: db.prepare('DELETE FROM clan_alerts WHERE konto_id = ?'),
      markRemind: db.prepare('UPDATE clan_alerts SET last_remind = ?, last_sent = ?, fails = 0 WHERE konto_id = ? AND clan_tag = ?'),
      markWeekly: db.prepare('UPDATE clan_alerts SET last_weekly = ?, last_sent = ?, fails = 0 WHERE konto_id = ? AND clan_tag = ?'),
      markFail: db.prepare('UPDATE clan_alerts SET fails = fails + 1, broken = CASE WHEN fails + 1 >= ? THEN 1 ELSE broken END WHERE konto_id = ? AND clan_tag = ?'),
      markBroken: db.prepare('UPDATE clan_alerts SET broken = 1 WHERE konto_id = ? AND clan_tag = ?'),
      kontos: db.prepare('SELECT DISTINCT konto_id FROM clan_alerts'),
      move: db.prepare('UPDATE OR IGNORE clan_alerts SET konto_id = ? WHERE konto_id = ?'),
    };
    return st;
  }

  function encrypt(plain) {
    open();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
  }
  function decrypt(stored) {
    try {
      const [ivHex, tagHex, dataHex] = String(stored || '').split(':');
      if (!ivHex || !tagHex || !dataHex) return '';
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      // Schlüssel geändert: Webhook gilt als weg, der Nutzer trägt ihn neu ein
      return '';
    }
  }

  /** Öffentliche Sicht (ohne Webhook-Adresse) */
  const view = (row) => (row ? {
    clanTag: row.clan_tag,
    clanName: row.clan_name,
    hookName: row.hook_name,
    hookHint: row.hook_id ? `…${row.hook_id.slice(-4)}` : '',
    remindHours: row.remind_hours,
    weekly: Boolean(row.weekly),
    lang: row.lang,
    lastSent: row.last_sent || null,
    broken: Boolean(row.broken),
    createdAt: row.created_at,
  } : null);

  return {
    view: (kontoId, tag) => view(open().get.get(kontoId, tag)),
    listOfKonto: (kontoId) => open().ofKonto.all(kontoId).map(view),
    /**
     * Anlegen oder ändern. webhook nur beim Anlegen nötig (dann { url, id, name }); fehlt er beim Ändern, bleibt der alte.
     * @returns {{ ok: true } | { ok: false, key: 'limitKonto'|'limitTotal'|'webhookMissing' }}
     */
    save(kontoId, tag, { clanName = '', webhook = null, remindHours = 3, weekly = true, lang = 'de' }) {
      const s = open();
      const now = Date.now();
      const base = {
        konto: kontoId,
        tag,
        clanName: String(clanName || '').slice(0, 60),
        remind: REMIND_HOURS.includes(remindHours) ? remindHours : 3,
        weekly: weekly ? 1 : 0,
        lang: LANGS.has(lang) ? lang : 'de',
        now,
      };
      const exists = s.get.get(kontoId, tag);
      if (!exists) {
        if (!webhook) return { ok: false, key: 'webhookMissing' };
        if (s.countKonto.get(kontoId).n >= MAX_PER_KONTO) return { ok: false, key: 'limitKonto' };
        if (s.countAll.get().n >= MAX_TOTAL) return { ok: false, key: 'limitTotal' };
        s.insert.run({ ...base, webhook: encrypt(webhook.url), hookId: webhook.id, hookName: String(webhook.name || '').slice(0, 80) });
        return { ok: true };
      }
      db.transaction(() => {
        s.update.run(base);
        if (webhook) s.updateHook.run({ konto: kontoId, tag, webhook: encrypt(webhook.url), hookId: webhook.id, hookName: String(webhook.name || '').slice(0, 80), now });
      })();
      return { ok: true };
    },
    remove: (kontoId, tag) => open().remove.run(kontoId, tag).changes > 0,
    removeKonto: (kontoId) => open().removeKonto.run(kontoId).changes,
    /**
     * Andockstelle für das Zusammenführen zweier Konten (Spur A, konto/kontoStore.fasseZusammen): Erinnerungen von
     * `quelle` gehen an `ziel`; hat `ziel` denselben Clan schon, bleibt dessen Eintrag. Liefert die Zahl umgehängter.
     */
    moveKonto(quelle, ziel) {
      const s = open();
      if (!quelle || !ziel || quelle === ziel) return 0;
      return db.transaction(() => {
        const moved = s.move.run(ziel, quelle).changes;
        s.removeKonto.run(quelle); // was wegen eines doppelten Clans nicht umziehen konnte
        return moved;
      })();
    },
    /** Alle aktiven Einträge samt entschlüsselter Adresse — nur für den Hintergrund-Job */
    active: () => open().all.all().map((r) => ({ ...r, webhookUrl: decrypt(r.webhook) })),
    webhookOf: (kontoId, tag) => {
      const r = open().get.get(kontoId, tag);
      return r ? decrypt(r.webhook) : '';
    },
    kontoIds: () => open().kontos.all().map((r) => r.konto_id),
    markReminded: (kontoId, tag, dayKey) => open().markRemind.run(dayKey, Date.now(), kontoId, tag),
    markWeekly: (kontoId, tag, weekKey) => open().markWeekly.run(weekKey, Date.now(), kontoId, tag),
    markFailed: (kontoId, tag) => open().markFail.run(MAX_FAILS, kontoId, tag),
    markBroken: (kontoId, tag) => open().markBroken.run(kontoId, tag),
    close() {
      if (db) db.close();
      db = null;
      st = null;
    },
  };
}

let shared = null;
/** Der Speicher, den der Server benutzt (Backend/data/cr_clan_alerts.db) — auch für andere Bereiche (moveKonto). */
function defaultAlertStore() {
  if (!shared) shared = createClanAlertStore();
  return shared;
}

// ── Discord ──────────────────────────────────────────────────────────────────

/** Spielernamen dürfen in Discord nichts formatieren oder erwähnen */
const esc = (s) => String(s || '').replace(/([\\*_~`|>#[\]()-])/g, '\\$1').replace(/@/g, '@\u200b').slice(0, 40);
const fmtN = (n, lang) => Number(n || 0).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE');

/** Webhook bei Discord nachschlagen: { ok, name } — ok false, wenn es ihn nicht (mehr) gibt. */
async function lookupWebhook(url, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (res.status === 404 || res.status === 401) return { ok: false, key: 'webhookInvalid' };
    if (!res.ok) return { ok: false, key: 'discordDown' };
    const data = await res.json().catch(() => ({}));
    return { ok: true, name: String(data?.name || '').slice(0, 80) };
  } catch {
    return { ok: false, key: 'discordDown' };
  }
}

/**
 * Nachricht senden. { ok } oder { ok: false, gone: true } (Webhook gelöscht) bzw. { ok: false } (später nochmal).
 */
async function postWebhook(url, payload, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${url}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Clan-Zentrale', allowed_mentions: { parse: [] }, ...payload }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404 || res.status === 401) return { ok: false, gone: true };
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

const TEXT = {
  de: {
    roles: { member: 'Mitglied', elder: 'Ältester', coLeader: 'Vize', leader: 'Anführer' },
    remindTitle: (day) => (day ? `Kampftag ${day} endet bald` : 'Kampftag endet bald'),
    remindBody: (n, decks, endsAt) => `**${n}** ${n === 1 ? 'Mitglied hat' : 'Mitglieder haben'} heute noch **${decks}** ${decks === 1 ? 'Deck' : 'Decks'} offen. Ende <t:${Math.floor(endsAt / 1000)}:R>.`,
    allDone: (endsAt) => `Alle haben heute ihre 4 Decks gespielt. Ende <t:${Math.floor(endsAt / 1000)}:R>.`,
    left: (n) => `${n} offen`,
    more: (n) => `… und ${n} weitere`,
    weekTitle: (s, w) => `Wochenbericht · Saison ${s ?? '–'}, Woche ${w ?? '–'}`,
    weekHead: (rank, fame, lang) => `Platz **${rank ?? '–'}** · **${fmtN(fame, lang)}** Ruhm`,
    allDecks: 'Alle Decks gespielt',
    missing: 'Nicht alle Decks gespielt',
    none: 'Kein einziges Deck',
    donors: 'Meiste Spenden',
    promote: 'Zum Befördern',
    kick: 'Zum Entfernen',
    demote: 'Zum Zurückstufen',
    nobody: '–',
    players: (n) => `${n} ${n === 1 ? 'Spieler' : 'Spieler'}`,
    testTitle: 'Test der Clan-Zentrale',
    testBody: 'Diese Erinnerungen kommen ab jetzt in diesen Kanal.',
    footer: 'Clan-Zentrale',
  },
  en: {
    roles: { member: 'Member', elder: 'Elder', coLeader: 'Co-leader', leader: 'Leader' },
    remindTitle: (day) => (day ? `Battle day ${day} ends soon` : 'Battle day ends soon'),
    remindBody: (n, decks, endsAt) => `**${n}** ${n === 1 ? 'member has' : 'members have'} **${decks}** ${decks === 1 ? 'deck' : 'decks'} left today. Ends <t:${Math.floor(endsAt / 1000)}:R>.`,
    allDone: (endsAt) => `Everyone has played their 4 decks today. Ends <t:${Math.floor(endsAt / 1000)}:R>.`,
    left: (n) => `${n} left`,
    more: (n) => `… and ${n} more`,
    weekTitle: (s, w) => `Weekly report · Season ${s ?? '–'}, week ${w ?? '–'}`,
    weekHead: (rank, fame, lang) => `Rank **${rank ?? '–'}** · **${fmtN(fame, lang)}** fame`,
    allDecks: 'Played every deck',
    missing: 'Missed decks',
    none: 'No decks at all',
    donors: 'Top donors',
    promote: 'To promote',
    kick: 'To remove',
    demote: 'To demote',
    nobody: '–',
    players: (n) => `${n} ${n === 1 ? 'player' : 'players'}`,
    testTitle: 'Clan HQ test',
    testBody: 'Reminders will be posted in this channel from now on.',
    footer: 'Clan HQ',
  },
};

/** Liste in ein Embed-Feld (höchstens 1024 Zeichen) */
function fieldList(lines, t, max = 1000) {
  const out = [];
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    if (len + lines[i].length + 1 > max - 30) {
      out.push(t.more(lines.length - i));
      break;
    }
    out.push(lines[i]);
    len += lines[i].length + 1;
  }
  return out.join('\n') || t.nobody;
}

/** Erinnerung vor Ende des Kriegstags (Eingabe: clanCentral.warDayStatus) */
function reminderMessage(status, clan, { lang = 'de', url = '' } = {}) {
  const t = TEXT[lang] || TEXT.de;
  const lines = status.open.map((p) => `${esc(p.name)} — ${t.left(p.left)}`);
  return {
    embeds: [{
      title: t.remindTitle(status.day),
      url: url || undefined,
      color: status.open.length ? 0xffb02e : 0x3fbf6f,
      description: status.open.length ? `${t.remindBody(status.open.length, status.decksLeft, status.endsAt)}\n\n${fieldList(lines, t, 3800)}` : t.allDone(status.endsAt),
      footer: { text: `${clan?.name || ''} · ${t.footer}` },
    }],
  };
}

/** Wochenbericht nach Ende des Rennens (Eingabe: clanCentral.buildClanCentral) */
function weeklyMessage(c, clan, { lang = 'de', url = '' } = {}) {
  const t = TEXT[lang] || TEXT.de;
  const week = c.weeks[0];
  const rows = c.members.map((m) => ({ m, w: m.war[0] })).filter((x) => x.w);
  const full = rows.filter((x) => x.w.decks >= week.possible);
  const partial = rows.filter((x) => x.w.decks > 0 && x.w.decks < week.possible).sort((a, b) => a.w.decks - b.w.decks);
  const zero = rows.filter((x) => x.w.decks === 0);
  // Spenden: die abgeschlossene Woche, sonst die laufende
  const dIdx = c.donationWeeks.findIndex((w) => !w.current);
  const donors = c.members
    .map((m) => ({ m, n: dIdx >= 0 ? m.donationWeeks[dIdx]?.given ?? 0 : m.donations }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5);
  const hints = (k) => c.members.filter((m) => m.hint?.k === k).map((m) => `${esc(m.name)} (${t.roles[m.role] || m.role})`);
  const fields = [
    { name: `${t.allDecks} · ${t.players(full.length)}`, value: fieldList(full.map((x) => esc(x.m.name)), t, 600), inline: false },
    { name: `${t.missing} · ${t.players(partial.length)}`, value: fieldList(partial.map((x) => `${esc(x.m.name)} — ${x.w.decks}/${week.possible}`), t), inline: false },
    { name: `${t.none} · ${t.players(zero.length)}`, value: fieldList(zero.map((x) => esc(x.m.name)), t), inline: false },
    { name: t.donors, value: fieldList(donors.map((x, i) => `${i + 1}. ${esc(x.m.name)} — ${fmtN(x.n, lang)}`), t), inline: false },
  ];
  for (const k of ['promote', 'kick', 'demote']) {
    const list = hints(k);
    if (list.length) fields.push({ name: t[k], value: fieldList(list, t), inline: false });
  }
  return {
    embeds: [{
      title: t.weekTitle(week.season, week.week),
      url: url || undefined,
      color: 0x5b8def,
      description: t.weekHead(week.rank, week.fame, lang),
      fields,
      footer: { text: `${clan?.name || ''} · ${t.footer}` },
    }],
  };
}

function testMessage(clan, { lang = 'de', url = '' } = {}) {
  const t = TEXT[lang] || TEXT.de;
  return { embeds: [{ title: t.testTitle, url: url || undefined, color: 0x8b5cf6, description: t.testBody, footer: { text: `${clan?.name || ''} · ${t.footer}` } }] };
}

// ── Hintergrund-Job ──────────────────────────────────────────────────────────

const weekKeyOf = (w) => (w ? `${w.season ?? 'x'}-${w.week ?? 'x'}` : '');
const dayKeyOf = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * Prüft alle 10 Minuten, ob etwas zu senden ist. Abrufe bei der Clash-API nur in den Zeitfenstern, in denen etwas
 * fällig sein kann: vor dem Ende eines Kriegstags (Fr–Mo früh, UTC) und am Montag nach Ende des Rennens.
 *
 * @param {object} deps
 * @param {object} deps.store            createClanAlertStore()
 * @param {(tag) => Promise<object>} deps.loadClan   aufbereiteter Clan (shapeClan) oder null
 * @param {(tag) => Promise<object>} deps.loadRace   laufender Krieg (shapeRiverRace) oder null
 * @param {(tag) => Promise<Array>}  deps.loadLog    Kriegsverlauf (shapeWarLog)
 * @param {(tag, clan, race, log) => object} deps.buildCentral   Zentrale für den Wochenbericht
 * @param {(tag) => void} [deps.keepWatching]       Clan weiter verfolgen (Schnappschüsse)
 * @param {(kontoId) => boolean} [deps.kontoGibtEs] gelöschte Konten verlieren ihre Erinnerungen
 * @param {Function} [deps.post]                     Ersatz für postWebhook (Tests)
 * @param {() => number} [deps.now]
 * @param {string} [deps.siteUrl]
 */
function createClanAlertWorker({ store, loadClan, loadRace, loadLog, buildCentral, keepWatching = () => {}, kontoGibtEs = null, post = postWebhook, now = () => Date.now(), siteUrl = '' }) {
  let timer = null;
  let running = false;
  let lastSweep = 0;
  const clanUrl = (tag) => (siteUrl ? `${siteUrl.replace(/\/+$/, '')}/clash/clan/${tag}?reiter=zentrale` : '');

  async function deliver(alert, payload) {
    const res = await post(alert.webhookUrl, payload);
    if (res.gone) store.markBroken(alert.konto_id, alert.clan_tag);
    else if (!res.ok) store.markFailed(alert.konto_id, alert.clan_tag);
    return res.ok;
  }

  /** Kann gerade eine Erinnerung fällig sein? Grob nach Uhrzeit, bevor die API gefragt wird. */
  function remindWindow(t, hours) {
    if (!hours) return false;
    // Kriegstage enden zwischen etwa 09:30 und 10:00 UTC; die enden Fr, Sa, So und Mo
    const end = central.nextDayEnd(t, 10 * 60);
    if (![5, 6, 0, 1].includes(new Date(end).getUTCDay())) return false;
    return t >= end - hours * HOUR - 30 * 60 * 1000;
  }
  /** Wochenbericht: Montag zwischen 09:30 und 16:00 UTC */
  function weeklyWindow(t) {
    const d = new Date(t);
    const min = d.getUTCHours() * 60 + d.getUTCMinutes();
    return d.getUTCDay() === 1 && min >= 9 * 60 + 30 && min < 16 * 60;
  }

  async function handle(alert, t, perClan) {
    const tag = alert.clan_tag;
    const get = async (kind, load) => {
      const key = `${kind}:${tag}`;
      if (!perClan.has(key)) perClan.set(key, Promise.resolve().then(() => load(tag)).catch(() => null));
      return perClan.get(key);
    };

    if (alert.remind_hours > 0 && remindWindow(t, alert.remind_hours)) {
      const [race, log] = await Promise.all([get('race', loadRace), get('log', loadLog)]);
      if (race) {
        const day = central.nextDayEnd(t, central.resetMinuteOf(log || []).minute);
        const key = dayKeyOf(day);
        if (alert.last_remind !== key) {
          if (!central.isWarPeriod(race)) {
            store.markReminded(alert.konto_id, tag, key); // Trainingstag: heute nichts
          } else if (t >= day - alert.remind_hours * HOUR && t < day - 2 * 60 * 1000) {
            const clan = await get('clan', loadClan);
            if (clan) {
              const status = central.warDayStatus(race, clan, log || [], t);
              if (await deliver(alert, reminderMessage(status, clan, { lang: alert.lang, url: clanUrl(tag) }))) store.markReminded(alert.konto_id, tag, key);
            }
          }
        }
      }
    }

    if (alert.weekly && weeklyWindow(t)) {
      const log = await get('log', loadLog);
      const week = Array.isArray(log) ? log.find((w) => w?.own) : null;
      // Nur das gerade beendete Rennen (höchstens 12 h alt) — nicht nachträglich ein altes
      if (week && Number.isFinite(week.date) && t - week.date < 12 * HOUR && alert.last_weekly !== weekKeyOf(week)) {
        const [clan, race] = await Promise.all([get('clan', loadClan), get('race', loadRace)]);
        if (clan) {
          const c = buildCentral(tag, clan, race, log);
          if (c?.weeks?.length && await deliver(alert, weeklyMessage(c, clan, { lang: alert.lang, url: clanUrl(tag) }))) {
            store.markWeekly(alert.konto_id, tag, weekKeyOf(week));
          }
        }
      }
    }
  }

  async function tick() {
    if (running) return 0;
    running = true;
    let n = 0;
    try {
      const t = now();
      let alerts = [];
      try { alerts = store.active(); } catch (err) { console.warn('[clan-alerts]', err?.message || err); return 0; }
      // Einmal am Tag: verfolgte Clans weiter beobachten, Erinnerungen gelöschter Konten entfernen
      if (t - lastSweep > DAY) {
        lastSweep = t;
        for (const tag of new Set(alerts.map((a) => a.clan_tag))) { try { keepWatching(tag); } catch { /* weiter */ } }
        if (kontoGibtEs) {
          for (const id of store.kontoIds()) { try { if (!kontoGibtEs(id)) store.removeKonto(id); } catch { /* weiter */ } }
          alerts = store.active();
        }
      }
      const perClan = new Map(); // je Durchgang ein Abruf je Clan und Art
      for (const a of alerts) {
        if (!a.webhookUrl) continue;
        try { await handle(a, t, perClan); n += 1; } catch (err) { console.warn('[clan-alerts]', a.clan_tag, err?.message || err); }
      }
    } finally {
      running = false;
    }
    return n;
  }

  return {
    tick,
    start(everyMs = 10 * 60 * 1000) {
      if (timer) return;
      timer = setInterval(() => { tick().catch(() => {}); }, everyMs);
      timer.unref?.();
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}

module.exports = {
  createClanAlertStore, defaultAlertStore, createClanAlertWorker, parseWebhook, lookupWebhook, postWebhook,
  reminderMessage, weeklyMessage, testMessage, REMIND_HOURS, MAX_PER_KONTO,
};
