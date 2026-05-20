// winchallengeStore.js — Win-Challenge in SQLite (sql.js), Migration von winchallenge.json
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "winchallenge.db");
const JSON_LEGACY = path.join(DATA_DIR, "winchallenge.json");

let _SQL = null;
let _db = null;
let _inited = false;
let _initPromise = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function wasmLocateFile(f) {
  return path.join(__dirname, "node_modules", "sql.js", "dist", f);
}

function persistDbFile() {
  if (!_db) return;
  ensureDataDir();
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function runExec(sql) {
  _db.run(sql);
}

function runParams(sql, params) {
  _db.run(sql, params);
}

function rowCount() {
  if (!_db) return 0;
  const r = _db.exec("SELECT COUNT(1) AS c FROM winchallenge_users");
  if (!r || !r[0] || !r[0].values || !r[0].values[0]) return 0;
  return Number(r[0].values[0][0]) || 0;
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
    for (const [userId, doc] of Object.entries(obj)) {
      if (!doc || typeof doc !== "object") continue;
      const j = JSON.stringify(doc);
      const ok = doc.overlayKey || "";
      const ck = doc.controlKey || "";
      runParams(
        "INSERT OR REPLACE INTO winchallenge_users (user_id, data, overlay_key, control_key) VALUES (?, ?, ?, ?)",
        [userId, j, ok, ck]
      );
    }
    fs.renameSync(JSON_LEGACY, JSON_LEGACY + ".migrated.bak");
    console.log(
      "[winchallenge] Migrated winchallenge.json to SQLite — backup: winchallenge.json.migrated.bak"
    );
    persistDbFile();
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
  const r = _db.exec("SELECT user_id, data FROM winchallenge_users");
  if (!r || !r[0] || !r[0].values) return out;
  for (const row of r[0].values) {
    const uid = row[0];
    try {
      out[uid] = JSON.parse(row[1]);
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
  ensureDataDir();
  runExec("DELETE FROM winchallenge_users");
  for (const [userId, doc] of Object.entries(obj || {})) {
    if (!doc || typeof doc !== "object") continue;
    const j = JSON.stringify(doc);
    const ok = String(doc.overlayKey || "");
    const ck = String(doc.controlKey || "");
    runParams(
      "INSERT OR REPLACE INTO winchallenge_users (user_id, data, overlay_key, control_key) VALUES (?, ?, ?, ?)",
      [userId, j, ok, ck]
    );
  }
  persistDbFile();
}

function initWinchallengeStore() {
  if (_inited) return Promise.resolve();
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _SQL = await initSqlJs({ locateFile: wasmLocateFile });
    ensureDataDir();
    if (fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 0) {
      const buf = fs.readFileSync(DB_PATH);
      _db = new _SQL.Database(new Uint8Array(buf));
    } else {
      _db = new _SQL.Database();
    }
    runExec(`
            CREATE TABLE IF NOT EXISTS winchallenge_users (
                user_id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                overlay_key TEXT,
                control_key TEXT
            );
        `);
    runExec(
      `CREATE INDEX IF NOT EXISTS idx_wc_overlay ON winchallenge_users(overlay_key);`
    );
    runExec(
      `CREATE INDEX IF NOT EXISTS idx_wc_control ON winchallenge_users(control_key);`
    );
    migrateFromJsonIfEmpty();
    _inited = true;
  })();
  return _initPromise;
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
  _SQL = null;
}

module.exports = {
  initWinchallengeStore,
  loadAllDocsObject,
  persistAllDocsObject,
  getDb,
  getDbPath: () => DB_PATH,
  saveAllOnExit,
};
