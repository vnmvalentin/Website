// Seed Runners — Speicher der Tages-Rangliste (better-sqlite3, eine eigene .db-Datei unter data/).
//
// Gespeichert werden nur GEPRÜFTE Läufe (siehe daily.js): Pro Tag und Spieler steht die beste
// nachgespielte Zeit samt Input-Log da. Das Log bleibt liegen, damit sich ein Eintrag später erneut
// prüfen lässt (etwa nach einer Änderung der Sim) — und weil es bei Streit der Beweis ist. Alte Logs
// räumt `pruneLogs()` weg; der Eintrag selbst (Name, Zeit) bleibt.
//
// Folgt dem Muster von dle/store/dleStore.js. Anders als dort eine Fabrik statt eines Moduls mit
// festem Pfad: Die Tests legen ihre Datenbank in einem Wegwerf-Ordner an (Projekt-Konvention: nie
// gegen die echte Backend/data/*.db testen).
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { createLevelStore } = require('./levelStore');

function defaultPath() {
  if (process.env.SEEDRUNNERS_DB_PATH) return process.env.SEEDRUNNERS_DB_PATH;
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'seedrunners.db');
}

/** @param {string} [dbPath]  Standard: Backend/data/seedrunners.db (oder SEEDRUNNERS_DB_PATH) */
function createStore(dbPath = defaultPath()) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // PRIMARY KEY (date_key, player_key): Eine Person steht pro Tag höchstens einmal in der Liste,
  // mit ihrer besten geprüften Zeit. `source` sagt, woher der Eintrag kam ('solo' oder 'raum').
  db.exec(`CREATE TABLE IF NOT EXISTS sr_daily_runs (
    date_key TEXT NOT NULL,
    player_key TEXT NOT NULL,
    player_name TEXT NOT NULL,
    ticks INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    splits_json TEXT NOT NULL,
    log_json TEXT,
    sim_fp TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (date_key, player_key)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sr_daily_board ON sr_daily_runs(date_key, ticks, created_at)');

  // Verifizierungen eigener Level (Editor): Pro Konto und Inhalts-Hash steht die beste GEPRÜFTE Zeit da, samt Log — das
  // Log wird später zum Ersteller-Geist. `sim_fp` ist der Stand der Physik, gegen den geprüft wurde: Eine Verifizierung
  // gilt nur, solange er dem aktuellen entspricht (siehe levelVerify.js). Das Dokument selbst liegt hier NICHT — es
  // wird beim Veröffentlichen gespeichert.
  db.exec(`CREATE TABLE IF NOT EXISTS sr_level_verifications (
    account_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    sim_fp TEXT NOT NULL,
    ticks INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    splits_json TEXT NOT NULL,
    log_json TEXT NOT NULL,
    verified_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, content_hash)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sr_level_ver_account ON sr_level_verifications(account_id, verified_at)');

  const stmt = {
    get: db.prepare('SELECT * FROM sr_daily_runs WHERE date_key = ? AND player_key = ?'),
    verGet: db.prepare('SELECT * FROM sr_level_verifications WHERE account_id = ? AND content_hash = ?'),
    // Ersetzt nur, wenn schneller — oder wenn die alte Verifizierung gegen einen anderen Stand der Physik lief
    verUpsert: db.prepare(`INSERT INTO sr_level_verifications
      (account_id, content_hash, sim_fp, ticks, deaths, splits_json, log_json, verified_at)
      VALUES (@accountId, @contentHash, @simFp, @ticks, @deaths, @splitsJson, @logJson, @verifiedAt)
      ON CONFLICT(account_id, content_hash) DO UPDATE SET
        sim_fp = excluded.sim_fp, ticks = excluded.ticks, deaths = excluded.deaths,
        splits_json = excluded.splits_json, log_json = excluded.log_json, verified_at = excluded.verified_at
      WHERE excluded.ticks < sr_level_verifications.ticks OR excluded.sim_fp != sr_level_verifications.sim_fp`),
    verCount: db.prepare('SELECT COUNT(*) AS c FROM sr_level_verifications WHERE account_id = ?'),
    verPrune: db.prepare(`DELETE FROM sr_level_verifications WHERE account_id = ? AND content_hash IN (
      SELECT content_hash FROM sr_level_verifications WHERE account_id = ? ORDER BY verified_at DESC LIMIT -1 OFFSET ?)`),
    upsert: db.prepare(`INSERT INTO sr_daily_runs
      (date_key, player_key, player_name, ticks, deaths, splits_json, log_json, sim_fp, source, created_at)
      VALUES (@dateKey, @playerKey, @playerName, @ticks, @deaths, @splitsJson, @logJson, @simFp, @source, @createdAt)
      ON CONFLICT(date_key, player_key) DO UPDATE SET
        player_name = excluded.player_name, ticks = excluded.ticks, deaths = excluded.deaths,
        splits_json = excluded.splits_json, log_json = excluded.log_json, sim_fp = excluded.sim_fp,
        source = excluded.source, created_at = excluded.created_at
      WHERE excluded.ticks < sr_daily_runs.ticks`),
    board: db.prepare(`SELECT player_key, player_name, ticks, deaths, splits_json, source, created_at FROM sr_daily_runs
      WHERE date_key = ? ORDER BY ticks ASC, created_at ASC LIMIT ?`),
    count: db.prepare('SELECT COUNT(*) AS c FROM sr_daily_runs WHERE date_key = ?'),
    ahead: db.prepare(`SELECT COUNT(*) AS c FROM sr_daily_runs
      WHERE date_key = ? AND (ticks < ? OR (ticks = ? AND created_at < ?))`),
    pruneLogs: db.prepare('UPDATE sr_daily_runs SET log_json = NULL WHERE date_key < ? AND log_json IS NOT NULL'),
  };

  const parseSplits = (json) => {
    try {
      const s = JSON.parse(json);
      return Array.isArray(s) ? s : [];
    } catch {
      return [];
    }
  };
  const toEntry = (row) => ({
    // Zwischenzeiten [[Checkpoint, Tick], …] — die aus dem Nachspielen des Servers, also so fälschungssicher wie die Zeit
    ...(row.splits_json !== undefined ? { splits: parseSplits(row.splits_json) } : {}),
    playerKey: row.player_key,
    name: row.player_name,
    ticks: row.ticks,
    deaths: row.deaths,
    source: row.source,
    createdAt: row.created_at,
  });

  return {
    /** Veröffentlichte Level: Tabellen, Bestenlisten, Likes, Meldungen, Sperren (levelStore.js; dieselbe Datenbank) */
    levels: createLevelStore(db),

    /** Bester Lauf dieser Person an diesem Tag oder null */
    getRun(dateKey, playerKey) {
      const row = stmt.get.get(dateKey, playerKey);
      return row ? { ...toEntry(row), splits: JSON.parse(row.splits_json), log: row.log_json ? JSON.parse(row.log_json) : null } : null;
    },

    /**
     * Speichert den Lauf, falls er besser ist als der bisherige (oder es keinen gibt).
     * @returns {boolean} true = gespeichert
     */
    saveRun({ dateKey, playerKey, playerName, ticks, deaths, splits, log, simFp, source, createdAt = Date.now() }) {
      const res = stmt.upsert.run({
        dateKey, playerKey, playerName, ticks, deaths,
        splitsJson: JSON.stringify(splits || []),
        logJson: log ? JSON.stringify(log) : null,
        simFp, source, createdAt,
      });
      return res.changes > 0;
    },

    /**
     * Verifizierung dieses Kontos für einen Level-Inhalt oder null. `withLog`: auch das Input-Log (groß) liefern.
     */
    getVerification(accountId, contentHash, { withLog = false } = {}) {
      const row = stmt.verGet.get(accountId, contentHash);
      if (!row) return null;
      const out = {
        accountId: row.account_id,
        contentHash: row.content_hash,
        simFp: row.sim_fp,
        ticks: row.ticks,
        deaths: row.deaths,
        splits: JSON.parse(row.splits_json),
        verifiedAt: row.verified_at,
      };
      if (withLog) out.log = JSON.parse(row.log_json);
      return out;
    },

    /**
     * Speichert eine geprüfte Verifizierung, wenn sie schneller ist als die vorhandene oder die vorhandene gegen einen
     * anderen Stand der Physik lief. Pro Konto bleiben höchstens `keep` Einträge (die zuletzt verifizierten).
     * @returns {boolean} true = gespeichert
     */
    saveVerification({ accountId, contentHash, simFp, ticks, deaths, splits, log, verifiedAt = Date.now() }, keep = 50) {
      const res = stmt.verUpsert.run({
        accountId, contentHash, simFp, ticks, deaths,
        splitsJson: JSON.stringify(splits || []), logJson: JSON.stringify(log), verifiedAt,
      });
      if (res.changes > 0 && stmt.verCount.get(accountId).c > keep) stmt.verPrune.run(accountId, accountId, keep);
      return res.changes > 0;
    },

    /** Rangliste eines Tages, beste Zeit zuerst; Gleichstand entscheidet, wer zuerst da war */
    getBoard(dateKey, limit = 50) {
      return stmt.board.all(dateKey, limit).map((row, i) => ({ rank: i + 1, ...toEntry(row) }));
    },

    count(dateKey) {
      return stmt.count.get(dateKey).c;
    },

    /** Platz dieses Eintrags in der Rangliste (1 = beste Zeit) */
    rankOf(dateKey, ticks, createdAt) {
      return stmt.ahead.get(dateKey, ticks, ticks, createdAt).c + 1;
    },

    /** Entfernt die Logs von Tagen vor `beforeDateKey` (Einträge bleiben) */
    pruneLogs(beforeDateKey) {
      return stmt.pruneLogs.run(beforeDateKey).changes;
    },

    close() {
      db.close();
    },
  };
}

module.exports = { createStore };
