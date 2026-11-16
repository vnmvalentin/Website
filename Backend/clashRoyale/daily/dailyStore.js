// dailyStore.js — Bestenliste der CR-Tagesrunde (/clash/heute; Frontend: pages/ClashRoyale/clash/dailyRound.js).
//
// Eine Zeile je Tag und Twitch-Konto mit den Punkten je Spiel (0–100). Je Spiel zählt nur die ERSTE Meldung des Tages:
// wer seinen Browser-Speicher leert und eine Runde nachspielt, verbessert sich dadurch nicht. Die Punkte rechnet der
// Browser aus (die Spiele laufen nur dort) — die Liste ist ein Spaß-Vergleich, keine geprüfte Wertung.
//
// Pfad per CR_DAILY_DB umbiegbar (Tests und Prüfstände — nie gegen Backend/data testen).

const Database = require('better-sqlite3');
const { dataPath } = require('../../lib/dataDir');

/** Die Spiele der Tagesrunde — dieselben Schlüssel wie DAILY_GAMES im Frontend. */
const GAMES = ['wordle', 'kartenraten', 'zoom', 'pixel', 'farbe'];
const KEEP_DAYS = 400;

let db = null;
let stmts = null;

function open() {
  if (db) return db;
  db = new Database(process.env.CR_DAILY_DB || dataPath('cr_daily.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_scores (
      day TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      scores TEXT NOT NULL,
      total INTEGER NOT NULL,
      games INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (day, user_id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_daily_rank ON daily_scores(day, total DESC, updated_at ASC);
  `);
  stmts = {
    get: db.prepare('SELECT * FROM daily_scores WHERE day = ? AND user_id = ?'),
    put: db.prepare(`INSERT INTO daily_scores (day, user_id, name, scores, total, games, updated_at)
      VALUES (@day, @userId, @name, @scores, @total, @games, @now)
      ON CONFLICT(day, user_id) DO UPDATE SET name = excluded.name, scores = excluded.scores, total = excluded.total,
        games = excluded.games, updated_at = excluded.updated_at`),
    top: db.prepare('SELECT * FROM daily_scores WHERE day = ? ORDER BY total DESC, updated_at ASC LIMIT ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE day = ?'),
    // Platz: wer mehr Punkte hat oder bei Gleichstand früher fertig war, steht davor
    better: db.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE day = @day AND (total > @total OR (total = @total AND updated_at < @at))'),
    prune: db.prepare('DELETE FROM daily_scores WHERE day < ?'),
  };
  return db;
}

const parseScores = (raw) => {
  try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
};

/** Nur bekannte Spiele, ganze Zahlen 0–100. */
function cleanScores(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of GAMES) {
    const v = Number(input[k]);
    if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(100, Math.round(v)));
  }
  return out;
}

function shape(row, rank) {
  const scores = parseScores(row.scores);
  return { rank, name: row.name, total: row.total, games: row.games, scores, at: row.updated_at };
}

/**
 * Ergebnisse melden. Je Spiel bleibt ein schon gemeldeter Wert stehen; neue Spiele kommen dazu.
 * @returns {object} der eigene Eintrag mit Platz
 */
function submit(day, userId, name, input, now = Date.now()) {
  open();
  const prev = stmts.get.get(day, userId);
  const scores = { ...cleanScores(input), ...(prev ? parseScores(prev.scores) : {}) };
  const games = GAMES.filter((k) => typeof scores[k] === 'number').length;
  const total = GAMES.reduce((s, k) => s + (typeof scores[k] === 'number' ? scores[k] : 0), 0);
  const changed = !prev || prev.total !== total || prev.games !== games || prev.name !== name;
  if (changed) {
    stmts.put.run({ day, userId, name: String(name || '').slice(0, 40) || '?', scores: JSON.stringify(scores), total, games, now: prev && prev.total === total && prev.games === games ? prev.updated_at : now });
  }
  return entry(day, userId);
}

/** Eigener Eintrag mit Platz oder null. */
function entry(day, userId) {
  open();
  const row = stmts.get.get(day, userId);
  if (!row) return null;
  return shape(row, stmts.better.get({ day, total: row.total, at: row.updated_at }).n + 1);
}

/** Die besten eines Tages und wie viele mitgespielt haben. */
function board(day, limit = 50) {
  open();
  const rows = stmts.top.all(day, Math.max(1, Math.min(200, limit)));
  return { players: stmts.count.get(day).n, top: rows.map((r, i) => shape(r, i + 1)) };
}

/** Alte Tage wegräumen (Tag als „JJJJ-MM-TT“). */
function prune(beforeDay) {
  open();
  stmts.prune.run(beforeDay);
}

function close() {
  if (db) db.close();
  db = null;
  stmts = null;
}

module.exports = { GAMES, KEEP_DAYS, submit, entry, board, prune, cleanScores, close };
