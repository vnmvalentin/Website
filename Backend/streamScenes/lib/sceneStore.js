// sceneStore.js — 3D-Stream-Szenen (Stream Starting / Ending): Steuerpult und Figurbaukasten.
//
// Zwei Tabellen:
//   • scene_controls — je Streamer: Overlay-Key (steckt im OBS-Link), Einstellungen des
//     Steuerpults und der zuletzt ausgelöste Befehl (Drop, Fläche räumen …). Die OBS-Quelle
//     fragt das alle ~1,5 s ab; ein Befehl gilt einmal (Zähler `command_seq`).
//   • avatar_looks — je Zuschauer (Twitch-ID) die selbst gebaute Figur. Öffentlich lesbar,
//     damit die Szenen sie ohne Login laden können.
//
// Keine Zugangsdaten in dieser DB; sie liegt trotzdem nicht im Repo (data/ ist ausgenommen),
// damit ein Deploy nie die echten Looks mit Testdaten überschreibt. STREAM_SCENES_DB lenkt die
// Datei für Prüfstände um.
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const dbFile = process.env.STREAM_SCENES_DB || path.join(__dirname, '../data/stream_scenes.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS scene_controls (
    user_id TEXT PRIMARY KEY,
    overlay_key TEXT UNIQUE NOT NULL,
    twitch_login TEXT NOT NULL DEFAULT '',
    settings TEXT NOT NULL DEFAULT '',
    settings_seq INTEGER NOT NULL DEFAULT 0,
    command TEXT NOT NULL DEFAULT '',
    command_seq INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS avatar_looks (
    twitch_id TEXT PRIMARY KEY,
    twitch_login TEXT NOT NULL DEFAULT '',
    look TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
)`);

const newKey = () => crypto.randomBytes(12).toString('base64url');

// ── Steuerpult ──────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  hypeMode: 'auto',          // auto: volle Fläche / viel Chat; on: immer; off: nie
  hypeDancers: 22,           // ab so vielen Chattern auf der Fläche
  hypeMsgs: 28,              // … oder so vielen Nachrichten in 30 s
  maxDancers: 60,
  extras: 0,                 // Statisten ohne Namensschild
  danceStyle: 'auto',        // auto | mixed | rave | classic
  bpm: 124,                  // Takt ohne Musik-Anbindung
  music: { enabled: false, port: 9500, reactive: true, showSong: true, sensitivity: 1 },
  effects: { confetti: true, fire: true, strobe: true, fog: true },
  title: '',
  countdownTo: null,         // Zeitpunkt (ms), auf den der Countdown zählt
  demo: false,               // Testmodus: simulierte Zuschauer tanzen (zum Ausprobieren, vor dem Stream ausschalten)
  theme: 'party',            // party | halloween (Deko, Lichtfarben, verkleidete Tänzer)
  dj: true,                  // Streamer steht als Figur hinter dem DJ-Pult
  // BRB-Planet (/overlay/brb): Modus, Thema (auto = Halloween-Thema oder Jahreszeit), Rückkehr-Zeitpunkt, eigene Zeile
  // showCard: Tafel unten links; race: Planetenlauf per !rennen (Anmeldezeit s, Pause zwischen Läufen min)
  brb: {
    mode: 'brb', theme: 'auto', backAt: null, text: '', showCard: true,
    race: { enabled: true, modsOnly: false, joinSec: 30, cooldownMin: 3 },
  },
};

const clampNum = (v, lo, hi, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);

/** Eingehende Einstellungen prüfen; Unbekanntes fällt weg, Fehlendes kommt aus `base`. */
function sanitizeSettings(input, base = DEFAULT_SETTINGS) {
  const s = input && typeof input === 'object' ? input : {};
  const m = s.music && typeof s.music === 'object' ? s.music : {};
  const e = s.effects && typeof s.effects === 'object' ? s.effects : {};
  const cd = s.countdownTo == null ? null : clampNum(s.countdownTo, 0, Date.now() + 24 * 3600e3, null);
  const brbIn = s.brb && typeof s.brb === 'object' ? s.brb : {};
  const brbBase = base.brb || DEFAULT_SETTINGS.brb;
  const raceIn = brbIn.race && typeof brbIn.race === 'object' ? brbIn.race : {};
  const raceBase = brbBase.race || DEFAULT_SETTINGS.brb.race;
  const backAt = brbIn.backAt == null ? null : clampNum(brbIn.backAt, 0, Date.now() + 24 * 3600e3, null);
  return {
    hypeMode: oneOf(s.hypeMode, ['auto', 'on', 'off'], base.hypeMode),
    hypeDancers: Math.round(clampNum(s.hypeDancers, 3, 60, base.hypeDancers)),
    hypeMsgs: Math.round(clampNum(s.hypeMsgs, 5, 150, base.hypeMsgs)),
    maxDancers: Math.round(clampNum(s.maxDancers, 5, 60, base.maxDancers)),
    extras: Math.round(clampNum(s.extras, 0, 40, base.extras)),
    danceStyle: oneOf(s.danceStyle, ['auto', 'mixed', 'rave', 'classic'], base.danceStyle),
    bpm: Math.round(clampNum(s.bpm, 60, 200, base.bpm)),
    music: {
      enabled: bool(m.enabled, base.music.enabled),
      port: Math.round(clampNum(m.port, 1024, 65535, base.music.port)),
      reactive: bool(m.reactive, base.music.reactive),
      showSong: bool(m.showSong, base.music.showSong),
      sensitivity: clampNum(m.sensitivity, 0.4, 2.5, base.music.sensitivity),
    },
    effects: {
      confetti: bool(e.confetti, base.effects.confetti),
      fire: bool(e.fire, base.effects.fire),
      strobe: bool(e.strobe, base.effects.strobe),
      fog: bool(e.fog, base.effects.fog),
    },
    title: typeof s.title === 'string' ? s.title.slice(0, 120) : base.title,
    countdownTo: s.countdownTo === undefined ? base.countdownTo : cd,
    demo: bool(s.demo, base.demo ?? false),
    theme: oneOf(s.theme, ['party', 'halloween'], base.theme ?? 'party'),
    dj: bool(s.dj, base.dj ?? true),
    brb: {
      mode: oneOf(brbIn.mode, ['brb', 'difficulties'], brbBase.mode),
      theme: oneOf(brbIn.theme, ['auto', 'day', 'halloween', 'winter'], brbBase.theme),
      backAt: brbIn.backAt === undefined ? brbBase.backAt : backAt,
      text: typeof brbIn.text === 'string' ? brbIn.text.slice(0, 80) : brbBase.text,
      showCard: bool(brbIn.showCard, brbBase.showCard ?? true),
      race: {
        enabled: bool(raceIn.enabled, raceBase.enabled),
        modsOnly: bool(raceIn.modsOnly, raceBase.modsOnly),
        joinSec: Math.round(clampNum(raceIn.joinSec, 10, 120, raceBase.joinSec)),
        cooldownMin: Math.round(clampNum(raceIn.cooldownMin, 0, 30, raceBase.cooldownMin)),
      },
    },
  };
}

function parseSettings(text) {
  try { return sanitizeSettings(JSON.parse(text)); } catch { return { ...DEFAULT_SETTINGS }; }
}

const COMMANDS = new Set(['drop', 'fire', 'clearFloor', 'brbRace', 'brbRaceStop']);

function getOrCreateControl(userId, login) {
  let row = db.prepare('SELECT * FROM scene_controls WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare(`INSERT INTO scene_controls (user_id, overlay_key, twitch_login, settings, updated_at)
      VALUES (?, ?, ?, ?, ?)`).run(userId, newKey(), login || '', JSON.stringify(DEFAULT_SETTINGS), Date.now());
    row = db.prepare('SELECT * FROM scene_controls WHERE user_id = ?').get(userId);
  } else if (login && row.twitch_login !== login) {
    db.prepare('UPDATE scene_controls SET twitch_login = ? WHERE user_id = ?').run(login, userId);
    row.twitch_login = login;
  }
  return row;
}

// ── Geänderte Figuren (nur im Speicher) ─────────────────────────────────────
// Die OBS-Quellen fragen /live alle 1,5 s ab; darüber erfahren sie, wer gerade im Figurbaukasten
// gespeichert hat, und bauen genau diese Figur live um. Nach einem Neustart beginnt der Zähler bei 0
// (die Szenen erkennen das am kleineren Wert und fangen neu an).
let lookSeq = 0;
const lookChanges = [];          // { seq, id, login, at }
const LOOK_CHANGE_KEEP_MS = 5 * 60e3;

function noteLookChange(twitchId, login) {
  lookChanges.push({ seq: ++lookSeq, id: String(twitchId), login: String(login || '').toLowerCase(), at: Date.now() });
  while (lookChanges.length > 100 || (lookChanges.length && Date.now() - lookChanges[0].at > LOOK_CHANGE_KEEP_MS)) lookChanges.shift();
}

const controlView = (row) => ({
  overlayKey: row.overlay_key,
  channel: row.twitch_login,
  settings: parseSettings(row.settings),
  settingsSeq: row.settings_seq,
  command: row.command ? JSON.parse(row.command) : null,
  commandSeq: row.command_seq,
  lookSeq,
  lookChanges: lookChanges.slice(-50).map(({ seq, id, login }) => ({ seq, id, login })),
});

function getControl(userId, login) {
  return controlView(getOrCreateControl(userId, login));
}

function saveSettings(userId, login, input) {
  const row = getOrCreateControl(userId, login);
  const next = sanitizeSettings(input, parseSettings(row.settings));
  db.prepare('UPDATE scene_controls SET settings = ?, settings_seq = settings_seq + 1, updated_at = ? WHERE user_id = ?')
    .run(JSON.stringify(next), Date.now(), userId);
  return getControl(userId, login);
}

function sendCommand(userId, login, type) {
  if (!COMMANDS.has(type)) return null;
  getOrCreateControl(userId, login);
  db.prepare('UPDATE scene_controls SET command = ?, command_seq = command_seq + 1, updated_at = ? WHERE user_id = ?')
    .run(JSON.stringify({ type, at: Date.now() }), Date.now(), userId);
  return getControl(userId, login);
}

function rotateKey(userId, login) {
  getOrCreateControl(userId, login);
  db.prepare('UPDATE scene_controls SET overlay_key = ? WHERE user_id = ?').run(newKey(), userId);
  return getControl(userId, login);
}

/**
 * Für die OBS-Quelle ohne Key: die Szenen sind nur für den Kanalbetreiber, also gelten seine Einstellungen.
 * Hat er das Steuerpult noch nie geöffnet, kommen die Standardwerte.
 */
function getLiveForUser(userId) {
  const row = userId ? db.prepare('SELECT * FROM scene_controls WHERE user_id = ?').get(String(userId)) : null;
  if (!row) {
    return {
      overlayKey: '', channel: '', settings: { ...DEFAULT_SETTINGS }, settingsSeq: 0, command: null, commandSeq: 0,
      lookSeq, lookChanges: lookChanges.slice(-50).map(({ seq, id, login }) => ({ seq, id, login })),
    };
  }
  return controlView(row);
}

/** Für die OBS-Quelle: Einstellungen + letzter Befehl zum Overlay-Key (oder null). */
function getLiveByKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(key)) return null;
  const row = db.prepare('SELECT * FROM scene_controls WHERE overlay_key = ?').get(key);
  return row ? controlView(row) : null;
}

// ── Figurbaukasten ──────────────────────────────────────────────────────────
const SLOTS = ['hat', 'head', 'body', 'legs', 'shoes'];
const PART_ID = /^[A-Za-z0-9_]{1,40}$/;

/** Form prüfen; ob es die Teile gibt, prüft die Szene (unbekannte Teile → Standard). */
function sanitizeLook(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const slot of SLOTS) {
    if (typeof input[slot] !== 'string' || !PART_ID.test(input[slot])) return null;
    out[slot] = input[slot];
  }
  const skin = Number(input.skin);
  if (!Number.isInteger(skin) || skin < 0 || skin > 15) return null;
  out.skin = skin;
  return out;
}

function getLook(twitchId) {
  const row = db.prepare('SELECT look, updated_at FROM avatar_looks WHERE twitch_id = ?').get(String(twitchId));
  if (!row) return null;
  try { return { look: JSON.parse(row.look), updatedAt: row.updated_at }; } catch { return null; }
}

function saveLook(twitchId, login, look) {
  const clean = sanitizeLook(look);
  if (!clean) return null;
  db.prepare(`INSERT INTO avatar_looks (twitch_id, twitch_login, look, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(twitch_id) DO UPDATE SET twitch_login = excluded.twitch_login, look = excluded.look, updated_at = excluded.updated_at`)
    .run(String(twitchId), login || '', JSON.stringify(clean), Date.now());
  noteLookChange(twitchId, login);
  return getLook(twitchId);
}

function deleteLook(twitchId) {
  const row = db.prepare('SELECT twitch_login FROM avatar_looks WHERE twitch_id = ?').get(String(twitchId));
  db.prepare('DELETE FROM avatar_looks WHERE twitch_id = ?').run(String(twitchId));
  if (row) noteLookChange(twitchId, row.twitch_login);
}

/** Viele Looks auf einmal (für die Szenen). ids: Twitch-IDs als Strings. */
function getLooks(ids) {
  if (!ids.length) return {};
  const rows = db.prepare(`SELECT twitch_id, look, updated_at FROM avatar_looks WHERE twitch_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const out = {};
  for (const r of rows) {
    try { out[r.twitch_id] = { look: JSON.parse(r.look), updatedAt: r.updated_at }; } catch { /* kaputte Zeile überspringen */ }
  }
  return out;
}

/** Looks nach Login (Abspann-Namen kommen ohne Twitch-ID). Schlüssel: Login in Kleinbuchstaben. */
function getLooksByLogins(logins) {
  if (!logins.length) return {};
  const rows = db.prepare(`SELECT lower(twitch_login) AS login, look, updated_at FROM avatar_looks
    WHERE lower(twitch_login) IN (${logins.map(() => '?').join(',')})`).all(...logins);
  const out = {};
  for (const r of rows) {
    try { out[r.login] = { look: JSON.parse(r.look), updatedAt: r.updated_at }; } catch { /* kaputte Zeile überspringen */ }
  }
  return out;
}

module.exports = {
  DEFAULT_SETTINGS, sanitizeSettings, sanitizeLook,
  getControl, saveSettings, sendCommand, rotateKey, getLiveByKey, getLiveForUser,
  getLook, saveLook, deleteLook, getLooks, getLooksByLogins,
};
