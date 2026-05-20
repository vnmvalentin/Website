// gardenFarmsStore.js — Farm-States in SQLite (sql.js / WASM, kein nativer Build, funktioniert z. B. mit Node 24)
const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "garden_farms.db");
const JSON_LEGACY = path.join(DATA_DIR, "garden_farms.json");

/** Ein gemeinsames Map-Objekt; wird in initGardenFarmsStore befüllt, bevor der Server hört. */
const farmStates = new Map();

let _SQL = null;
let _db = null;
let _farmsSaveTimer = null;
const dirtyUserIds = new Set();
let _activeFarmStatesMap = null;
let _inited = false;
let _initPromise = null;

const FARMS_SAVE_DEBOUNCE_MS = 2500;

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function wasmLocateFile(f) {
    return path.join(__dirname, "node_modules", "sql.js", "dist", f);
}

function rowCount() {
    if (!_db) return 0;
    const r = _db.exec("SELECT COUNT(1) AS c FROM garden_farms");
    if (!r || !r[0] || !r[0].values || !r[0].values[0]) return 0;
    return Number(r[0].values[0][0]) || 0;
}

function runExec(sql) {
    _db.run(sql);
}

/**
 * @param {string} sql
 * @param {any[]} params
 */
function runParams(sql, params) {
    _db.run(sql, params);
}

function persistDbFile() {
    if (!_db) return;
    ensureDataDir();
    const data = _db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function migrateFromLegacyJsonIfEmpty() {
    if (rowCount() > 0) return;
    if (!fs.existsSync(JSON_LEGACY)) return;
    let raw;
    try {
        raw = fs.readFileSync(JSON_LEGACY, "utf8").trim();
    } catch (e) {
        console.error("[garden] legacy JSON read failed:", e.message);
        return;
    }
    if (!raw) {
        try {
            fs.renameSync(JSON_LEGACY, JSON_LEGACY + ".migrated.bak");
        } catch { /* */ }
        return;
    }
    let obj;
    try {
        obj = JSON.parse(raw);
    } catch (e) {
        console.error("[garden] legacy JSON parse failed:", e.message);
        return;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    try {
        for (const [userId, state] of Object.entries(obj)) {
            const t = (state && state.updatedAt) || Date.now();
            runParams(
                "INSERT OR REPLACE INTO garden_farms (user_id, data, updated_at) VALUES (?, ?, ?)",
                [userId, JSON.stringify(state), t]
            );
        }
        fs.renameSync(JSON_LEGACY, JSON_LEGACY + ".migrated.bak");
        console.log("[garden] Migrated garden_farms.json to SQLite (sql.js) — backup: garden_farms.json.migrated.bak");
        persistDbFile();
    } catch (e) {
        console.error("[garden] JSON→SQLite migration failed:", e.message);
    }
}

function loadMapFromDb() {
    farmStates.clear();
    if (!_db) return;
    const r = _db.exec("SELECT user_id, data FROM garden_farms");
    if (!r || !r[0] || !r[0].values) return;
    for (const row of r[0].values) {
        // uid IMMER als String erzwingen
        const uid = String(row[0]); 
        try {
            farmStates.set(uid, JSON.parse(row[1]));
        } catch { /* skip */ }
    }
}

/**
 * Muss einmal vor server.listen (siehe index.js) laufen. sql.js: keine Python-/VS-Build-Tools nötig.
 * @returns {Promise<void>}
 */
function initGardenFarmsStore() {
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
            CREATE TABLE IF NOT EXISTS garden_farms (
                user_id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `);
        migrateFromLegacyJsonIfEmpty();
        loadMapFromDb();
        registerActiveFarmStatesMap(farmStates);
        runRollingBackup();
        _inited = true;
    })();
    return _initPromise;
}

function setFarmState(farmStatesParam, userId, state) {
    const stringId = String(userId); // Sicherstellen, dass es ein String ist
    farmStatesParam.set(stringId, state);
    dirtyUserIds.add(stringId);
}

function flushDirtyToDb(farmStatesParam) {
    if (dirtyUserIds.size === 0 || !_db) return;
    const ids = [...dirtyUserIds];
    dirtyUserIds.clear();
    try {
        for (const uid of ids) {
            const state = farmStatesParam.get(uid);
            if (!state) continue;
            const t = state.updatedAt != null ? Number(state.updatedAt) : Date.now();
            runParams(
                "INSERT OR REPLACE INTO garden_farms (user_id, data, updated_at) VALUES (?, ?, ?)",
                [uid, JSON.stringify(state), t]
            );
        }
        persistDbFile();
    } catch (e) {
        console.error("[garden] SQLite (sql.js) flush failed:", e.message);
        for (const uid of ids) dirtyUserIds.add(uid);
    }
}

function scheduleFarmsSave(farmStatesParam) {
    if (_farmsSaveTimer) clearTimeout(_farmsSaveTimer);
    _farmsSaveTimer = setTimeout(() => {
        _farmsSaveTimer = null;
        flushDirtyToDb(farmStatesParam);
    }, FARMS_SAVE_DEBOUNCE_MS);
}

function saveAllFarmsSync(farmStatesParam) {
    if (!_db) return;
    try {
        for (const [userId, state] of farmStatesParam) {
            const t = state.updatedAt != null ? Number(state.updatedAt) : Date.now();
            runParams(
                "INSERT OR REPLACE INTO garden_farms (user_id, data, updated_at) VALUES (?, ?, ?)",
                [userId, JSON.stringify(state), t]
            );
        }
        persistDbFile();
        dirtyUserIds.clear();
    } catch (e) {
        console.error("[garden] SQLite (sql.js) saveAll failed:", e.message);
    }
}

function closeDb() {
    if (_db) {
        try {
            // Wir speichern nur noch die Datei. 
            // _db.close() lassen wir weg, um den Windows libuv-Crash bei Strg+C zu vermeiden!
            persistDbFile();
        } catch (e) {
            console.error("[garden] Fehler beim finalen Speichern:", e.message);
        }
        // Wir nullen die Referenz nicht mal mehr, der Prozess stirbt eh gleich.
    }
}

function registerActiveFarmStatesMap(map) {
    _activeFarmStatesMap = map;
}

function saveAllFarmsOnExit() {
    if (_activeFarmStatesMap) {
        saveAllFarmsSync(_activeFarmStatesMap);
    }
    closeDb();
}
// ==========================================
// 🔄 ROLLING BACKUP SYSTEM (Alle 6 Stunden)
// ==========================================
function runRollingBackup() {
    if (!fs.existsSync(DB_PATH)) {
        console.log("[Backup] Übersprungen: Noch keine Hauptdatenbank vorhanden.");
        return;
    }

    const backupDir = path.join(DATA_DIR, "backups");
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const now = new Date();
    const hour = now.getHours();
    
    // Berechnet den Slot (0, 1, 2 oder 3)
    const slotIndex = Math.floor(hour / 6);
    const backupFileName = `garden_farms_backup_slot_${slotIndex}.db`;
    const targetPath = path.join(backupDir, backupFileName);

    try {
        // Da sql.js die Datei atomar schreibt, können wir sie einfach kopieren
        fs.copyFileSync(DB_PATH, targetPath);
        console.log(`[Backup] ✅ Success: Slot ${slotIndex} aktualisiert (${now.toLocaleTimeString()}) -> ${backupFileName}`);
    } catch (err) {
        console.error(`[Backup] ❌ Fehler beim Erstellen von Slot ${slotIndex}:`, err);
    }
}

// Prüft alle 30 Minuten, ob der aktuelle Slot überschrieben werden soll
// (So bist du sicher, dass das Backup auch passiert, wenn der Server mal um 06:05 Uhr neugestartet wird)
setInterval(runRollingBackup, 30 * 60 * 1000);

// ==========================================

module.exports = {
    farmStates,
    initGardenFarmsStore,
    setFarmState,
    scheduleFarmsSave,
    saveAllFarmsSync,
    closeDb,
    getDbPath: () => DB_PATH,
    registerActiveFarmStatesMap,
    saveAllFarmsOnExit,
};
