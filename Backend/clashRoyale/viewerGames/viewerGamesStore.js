// viewerGamesStore.js — Viewer Games (Chat-Quiz im Stream): Einstellungen + Overlay-Key je Streamer und die
// Punkte der Zuschauer. Keine Zugangsdaten — der Chat läuft über den gemeinsamen Bot (lib/winchallengeIrc.js).
// Pfad per CR_VIEWER_GAMES_DB umlenkbar (Prüfstände nie gegen die echte DB).
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { nanoid } = require("nanoid");

const file = process.env.CR_VIEWER_GAMES_DB || path.join(__dirname, "../../data/cr_viewer_games.db");
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new Database(file);
db.pragma("journal_mode = WAL");

db.exec(`CREATE TABLE IF NOT EXISTS vg_settings (
  user_id TEXT PRIMARY KEY,
  twitch_login TEXT NOT NULL DEFAULT '',
  overlay_key TEXT NOT NULL UNIQUE,
  settings TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS vg_scores (
  user_id TEXT NOT NULL,
  viewer TEXT NOT NULL,
  display TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, viewer)
)`);

const q = {
  byUser: db.prepare("SELECT * FROM vg_settings WHERE user_id = ?"),
  byKey: db.prepare("SELECT * FROM vg_settings WHERE overlay_key = ?"),
  insert: db.prepare("INSERT INTO vg_settings (user_id, twitch_login, overlay_key, settings, updated_at) VALUES (?, ?, ?, ?, ?)"),
  update: db.prepare("UPDATE vg_settings SET settings = ?, twitch_login = ?, updated_at = ? WHERE user_id = ?"),
  newKey: db.prepare("UPDATE vg_settings SET overlay_key = ?, updated_at = ? WHERE user_id = ?"),
  addScore: db.prepare(`INSERT INTO vg_scores (user_id, viewer, display, points, wins, updated_at) VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(user_id, viewer) DO UPDATE SET points = points + excluded.points, wins = wins + 1, display = excluded.display, updated_at = excluded.updated_at`),
  top: db.prepare("SELECT viewer, display, points, wins FROM vg_scores WHERE user_id = ? ORDER BY points DESC, updated_at ASC LIMIT ?"),
  reset: db.prepare("DELETE FROM vg_scores WHERE user_id = ?"),
};

const parse = (row) => (row ? { ...row, settings: safeJson(row.settings) } : null);
function safeJson(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

/** Eintrag holen, beim ersten Mal anlegen (mit neuem Overlay-Key) */
function ensure(userId, login) {
  let row = q.byUser.get(String(userId));
  if (!row) {
    q.insert.run(String(userId), String(login || "").toLowerCase(), nanoid(16), "{}", Date.now());
    row = q.byUser.get(String(userId));
  } else if (login && row.twitch_login !== String(login).toLowerCase()) {
    q.update.run(row.settings, String(login).toLowerCase(), Date.now(), String(userId));
    row = q.byUser.get(String(userId));
  }
  return parse(row);
}

module.exports = {
  ensure,
  get: (userId) => parse(q.byUser.get(String(userId))),
  byKey: (key) => parse(q.byKey.get(String(key))),
  saveSettings: (userId, login, settings) => q.update.run(JSON.stringify(settings), String(login || "").toLowerCase(), Date.now(), String(userId)),
  regenerateKey: (userId) => { const k = nanoid(16); q.newKey.run(k, Date.now(), String(userId)); return k; },
  addScore: (userId, viewer, display, points) => q.addScore.run(String(userId), viewer, display, points, Date.now()),
  top: (userId, n = 5) => q.top.all(String(userId), n),
  resetScores: (userId) => q.reset.run(String(userId)),
};
