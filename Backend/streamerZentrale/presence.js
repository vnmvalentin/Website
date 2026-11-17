// presence.js — wann die OBS-Quelle eines Werkzeugs zuletzt abgefragt hat (für die Streamer-Zentrale).
//
// Die Overlay-Routen von Twitch-Overlays, Win Challenge und Bingo rufen seen() bei jedem Abruf auf (alle paar
// Sekunden, solange die Quelle in OBS offen ist). Gemerkt wird im Speicher; in die Datenbank geht es höchstens einmal
// pro Minute je Streamer und Werkzeug — so überlebt „zuletzt da“ einen Neustart des Servers, ohne dass jede Abfrage
// schreibt. Die Datenbank öffnet erst beim ersten Gebrauch; ein Fehler hier darf ein Overlay nie stören.
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { DATA_DIR } = require("../lib/dataDir");

/** Werkzeuge mit eigener Overlay-Route in Spur C. Win Tracker und Viewer Games liefern ihren Stand selbst. */
const TOOLS = ["twitch", "wc", "bingo"];
/** So oft schreibt seen() höchstens in die Datenbank (je Streamer und Werkzeug). */
const FLUSH_MS = 60 * 1000;

let stmts = null;
function open() {
  if (stmts) return stmts;
  // STREAMER_ZENTRALE_DB: andere Datei (oder ':memory:') für Prüfläufe — nie gegen die Live-Daten testen
  const file = process.env.STREAMER_ZENTRALE_DB || path.join(DATA_DIR, "streamer_zentrale.db");
  if (file !== ":memory:" && !fs.existsSync(path.dirname(file))) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS overlay_seen (
    user_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    seen_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, tool)
  )`);
  stmts = {
    upsert: db.prepare(`INSERT INTO overlay_seen (user_id, tool, seen_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id, tool) DO UPDATE SET seen_at = excluded.seen_at`),
    byUser: db.prepare("SELECT tool, seen_at FROM overlay_seen WHERE user_id = ?"),
  };
  return stmts;
}

// `${userId}:${tool}` -> { at, flushedAt }
const memory = new Map();

/** Die OBS-Quelle dieses Werkzeugs hat gerade abgefragt. */
function seen(tool, userId, now = Date.now()) {
  if (!TOOLS.includes(tool) || !userId) return;
  const key = `${userId}:${tool}`;
  const cur = memory.get(key) || { at: 0, flushedAt: 0 };
  cur.at = now;
  if (now - cur.flushedAt >= FLUSH_MS) {
    try {
      open().upsert.run(String(userId), tool, now);
      cur.flushedAt = now;
    } catch (e) {
      console.warn("[streamer-zentrale] Anwesenheit nicht gespeichert:", e.message);
      cur.flushedAt = now; // nicht bei jeder Abfrage erneut versuchen
    }
  }
  memory.set(key, cur);
}

/** @returns {{ twitch?: number, wc?: number, bingo?: number }} Zeitpunkte der letzten Abfrage je Werkzeug */
function lastSeen(userId) {
  const out = {};
  try {
    for (const r of open().byUser.all(String(userId))) out[r.tool] = r.seen_at;
  } catch { /* ohne Datenbank bleibt der Speicher */ }
  for (const tool of TOOLS) {
    const m = memory.get(`${userId}:${tool}`);
    if (m && m.at > (out[tool] || 0)) out[tool] = m.at;
  }
  return out;
}

/** Nur für Tests: Speicher leeren. */
function _reset() {
  memory.clear();
}

module.exports = { TOOLS, FLUSH_MS, seen, lastSeen, _reset };
