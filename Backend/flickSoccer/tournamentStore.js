// flickSoccer/tournamentStore.js — Turniere von Flick Soccer überleben einen Backend-Neustart.
//
// Ein Turnier = eine Zeile mit dem ganzen Stand als JSON (Spieler, Baum, Regeln). Geschrieben wird bei jeder Änderung
// (tournamentManager.js persist) — das sind wenige Schreibvorgänge pro Minute. Die Datei enthält die Token der
// Spieler und steht deshalb in .gitignore; deploy.sh lässt Backend/data/ ohnehin aus.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Umbiegbar für Prüfstände — nie gegen die echte Datei testen.
const DB_PATH = process.env.FLICK_TOURNAMENT_DB || path.join(__dirname, '..', 'data', 'flick_tournaments.db');

function openTournamentStore(file = DB_PATH) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS flick_tournaments (
    code TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  )`);
  const upsert = db.prepare(
    'INSERT INTO flick_tournaments (code, data, saved_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at',
  );
  const del = db.prepare('DELETE FROM flick_tournaments WHERE code = ?');
  const all = db.prepare('SELECT code, data FROM flick_tournaments');

  return {
    save: (code, tournament) => upsert.run(code, JSON.stringify(tournament), Date.now()),
    remove: (code) => del.run(code),
    loadAll: () => {
      const out = [];
      for (const row of all.all()) {
        try {
          out.push(JSON.parse(row.data));
        } catch (e) {
          console.error(`[flick-soccer] Turnier ${row.code} ist nicht lesbar und wird übersprungen:`, e.message);
        }
      }
      return out;
    },
    close: () => db.close(),
  };
}

module.exports = { openTournamentStore };
