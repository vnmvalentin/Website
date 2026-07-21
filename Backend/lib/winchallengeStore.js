// winchallengeStore.js — Win-Challenge in SQLite (better-sqlite3), Migration von winchallenge.json
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { step } = require("./startupLog");

const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "winchallenge.db");
const JSON_LEGACY = path.join(DATA_DIR, "winchallenge.json");

let _db = null;
let _inited = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function rowCount() {
  if (!_db) return 0;
  const r = _db.prepare("SELECT COUNT(1) AS c FROM winchallenge_users").get();
  return r ? Number(r.c) || 0 : 0;
}

function migrateFromJsonIfEmpty() {
  if (rowCount() > 0) return;
  if (!fs.existsSync(JSON_LEGACY)) return;
  let raw;
  try {
    raw = fs.readFileSync(JSON_LEGACY, "utf8").trim();
  } catch (e) {
    console.error("[winchallenge] legacy JSON read failed:", e.message);
    return;
  }
  if (!raw) {
    try {
      fs.renameSync(JSON_LEGACY, JSON_LEGACY + ".migrated.bak");
    } catch {
      /* */
    }
    return;
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    console.error("[winchallenge] legacy JSON parse failed:", e.message);
    return;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  try {
    const insert = _db.prepare(
      "INSERT OR REPLACE INTO winchallenge_users (user_id, data, overlay_key, control_key) VALUES (?, ?, ?, ?)"
    );
    const run = _db.transaction((entries) => {
      for (const [userId, doc] of entries) {
        if (!doc || typeof doc !== "object") continue;
        insert.run(userId, JSON.stringify(doc), doc.overlayKey || "", doc.controlKey || "");
      }
    });
    run(Object.entries(obj));
    fs.renameSync(JSON_LEGACY, JSON_LEGACY + ".migrated.bak");
    step("Winchallenge-JSON-Migration", true, "winchallenge.json → SQLite");
  } catch (e) {
    console.error("[winchallenge] JSON→SQLite migration failed:", e.message);
  }
}

/**
 * Lädt alle Benutzer-Dokumente als Objekt (wie bisher winchallenge.json).
 * @returns {Record<string, object>}
 */
function loadAllDocsObject() {
  const out = {};
  if (!_db) return out;
  const rows = _db.prepare("SELECT user_id, data FROM winchallenge_users").all();
  for (const row of rows) {
    try {
      out[row.user_id] = JSON.parse(row.data);
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Vollständiges Objekt in die DB schreiben (entspricht früherem writeDbAtomic).
 */
function persistAllDocsObject(obj) {
  if (!_db) return;
  const insert = _db.prepare(
    "INSERT OR REPLACE INTO winchallenge_users (user_id, data, overlay_key, control_key) VALUES (?, ?, ?, ?)"
  );
  const run = _db.transaction((entries) => {
    _db.prepare("DELETE FROM winchallenge_users").run();
    for (const [userId, doc] of entries) {
      if (!doc || typeof doc !== "object") continue;
      insert.run(userId, JSON.stringify(doc), String(doc.overlayKey || ""), String(doc.controlKey || ""));
    }
  });
  run(Object.entries(obj || {}));
}

function initWinchallengeStore() {
  if (_inited) return Promise.resolve();
  ensureDataDir();
  _db = new Database(DB_PATH);
  _db.exec(`
            CREATE TABLE IF NOT EXISTS winchallenge_users (
                user_id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                overlay_key TEXT,
                control_key TEXT
            );
        `);
  _db.exec(
    `CREATE INDEX IF NOT EXISTS idx_wc_overlay ON winchallenge_users(overlay_key);`
  );
  _db.exec(
    `CREATE INDEX IF NOT EXISTS idx_wc_control ON winchallenge_users(control_key);`
  );
  migrateFromJsonIfEmpty();
  _inited = true;
  return Promise.resolve();
}

function getDb() {
  return _db;
}

function saveAllOnExit(dbCache) {
  if (!dbCache || !_db) return;
  try {
    persistAllDocsObject(dbCache);
  } catch (e) {
    console.error("[winchallenge] saveAllOnExit failed:", e.message);
  }
  try {
    if (_db) {
      _db.close();
    }
  } catch {
    /* */
  }
  _db = null;
}

module.exports = {
  initWinchallengeStore,
  loadAllDocsObject,
  persistAllDocsObject,
  getDb,
  getDbPath: () => DB_PATH,
  saveAllOnExit,
};
