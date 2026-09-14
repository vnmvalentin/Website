// dleStore.js — Tagesergebnisse & Bestenliste für alle -dle-Spiele, in einer gemeinsamen
// Tabelle (game_id unterscheidet die Spiele). Folgt demselben better-sqlite3-Muster wie
// clashRoyale/lib/crPresetStore.js: eigene .db-Datei unter data/, WAL-Modus, vorbereitete
// Statements.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Override nur für isolierte Tests (siehe Projekt-Konvention: nie gegen die echte
// Backend/data/*.db testen) — im Betrieb ist die Variable nie gesetzt.
const dbPath = process.env.DLE_DB_PATH || path.join(dataDir, 'dle.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// PRIMARY KEY (game_id, date_key, player_key) verhindert von der DB erzwungen, dass
// dieselbe Person an einem Tag zweimal in einem Spiel in der Bestenliste landet — siehe
// recordRun() unten, das VOR dem Insert ohnehin schon auf ein bestehendes Ergebnis prüft.
db.exec(`CREATE TABLE IF NOT EXISTS dle_daily_scores (
  game_id TEXT NOT NULL,
  date_key TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  rounds_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, date_key, player_key)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_dle_scores_leaderboard ON dle_daily_scores(game_id, date_key, total_score DESC)');

const stmt = {
  get: db.prepare('SELECT * FROM dle_daily_scores WHERE game_id = ? AND date_key = ? AND player_key = ?'),
  insert: db.prepare(`INSERT INTO dle_daily_scores
    (game_id, date_key, player_key, player_name, total_score, rounds_json, created_at)
    VALUES (@gameId, @dateKey, @playerKey, @playerName, @totalScore, @roundsJson, @createdAt)`),
  leaderboard: db.prepare(`SELECT player_name, total_score, created_at FROM dle_daily_scores
    WHERE game_id = ? AND date_key = ? ORDER BY total_score DESC, created_at ASC LIMIT ?`),
  countToday: db.prepare('SELECT COUNT(*) AS c FROM dle_daily_scores WHERE game_id = ? AND date_key = ?'),
};

function rowToPublic(row) {
  return {
    playerName: row.player_name,
    totalScore: row.total_score,
    rounds: JSON.parse(row.rounds_json),
    createdAt: row.created_at,
  };
}

function getExistingRun(gameId, dateKey, playerKey) {
  const row = stmt.get.get(gameId, dateKey, playerKey);
  return row ? rowToPublic(row) : null;
}

// Erstes Ergebnis des Tages zählt — ein zweiter Aufruf (egal ob Doppelklick oder
// absichtlicher erneuter Versuch) überschreibt nichts, sondern gibt einfach das bereits
// gespeicherte Ergebnis zurück.
function recordRun({ gameId, dateKey, playerKey, playerName, totalScore, rounds }) {
  const existing = getExistingRun(gameId, dateKey, playerKey);
  if (existing) return existing;
  stmt.insert.run({
    gameId,
    dateKey,
    playerKey,
    playerName: playerName || 'Anonym',
    totalScore,
    roundsJson: JSON.stringify(rounds),
    createdAt: Date.now(),
  });
  return getExistingRun(gameId, dateKey, playerKey);
}

function getLeaderboard(gameId, dateKey, limit = 20) {
  return stmt.leaderboard.all(gameId, dateKey, limit).map((r) => ({
    playerName: r.player_name,
    totalScore: r.total_score,
    createdAt: r.created_at,
  }));
}

function countPlayedToday(gameId, dateKey) {
  return stmt.countToday.get(gameId, dateKey).c;
}

module.exports = { recordRun, getExistingRun, getLeaderboard, countPlayedToday };
