// garden/store/farms.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { step } = require("../../lib/startupLog");

// Backend/garden/store/ -> Backend/data. Die Datei lag bis zur Umstrukturierung in
// lib/, also eine Ebene höher — deshalb hier zwei Schritte hinauf statt einem.
const DATA_DIR = path.join(__dirname, "../../data");
const DB_PATH = path.join(DATA_DIR, "garden_farms.db");
const JSON_LEGACY = path.join(DATA_DIR, "garden_farms.json");

/** Ein gemeinsames Map-Objekt; wird in initGardenFarmsStore befüllt, bevor der Server hört. */
const farmStates = new Map();

let _db = null;
let _farmsSaveTimer = null;
const dirtyUserIds = new Set();
let _activeFarmStatesMap = null;
let _inited = false;

const FARMS_SAVE_DEBOUNCE_MS = 2500;

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function rowCount() {
    if (!_db) return 0;
    const r = _db.prepare("SELECT COUNT(1) AS c FROM garden_farms").get();
    return r ? Number(r.c) || 0 : 0;
}

function upsertMany(entries) {
    const insert = _db.prepare(
        "INSERT OR REPLACE INTO garden_farms (user_id, data, updated_at) VALUES (?, ?, ?)"
    );
    const run = _db.transaction((rows) => {
        for (const [userId, state] of rows) {
            if (!state) continue;
            const t = state.updatedAt != null ? Number(state.updatedAt) : Date.now();
            insert.run(String(userId), JSON.stringify(state), t);
        }
    });
    run(entries);
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
        upsertMany(Object.entries(obj));
        fs.renameSync(JSON_LEGACY, JSON_LEGACY + ".migrated.bak");
        step("Garden-JSON-Migration", true, "garden_farms.json → SQLite");
    } catch (e) {
        console.error("[garden] JSON→SQLite migration failed:", e.message);
    }
}

function loadMapFromDb() {
    farmStates.clear();
    if (!_db) return;
    const rows = _db.prepare("SELECT user_id, data FROM garden_farms").all();
    for (const row of rows) {
        // uid IMMER als String erzwingen
        const uid = String(row.user_id);
        try {
            farmStates.set(uid, JSON.parse(row.data));
        } catch { /* skip */ }
    }
}

/**
 * Muss einmal vor server.listen (siehe index.js) laufen.
 * @returns {Promise<void>}
 */
function initGardenFarmsStore() {
    if (_inited) return Promise.resolve();
    ensureDataDir();
    _db = new Database(DB_PATH);
    _db.exec(`
        CREATE TABLE IF NOT EXISTS garden_farms (
            user_id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
    `);
    migrateFromLegacyJsonIfEmpty();
    loadMapFromDb();
    registerActiveFarmStatesMap(farmStates);
    runRollingBackup({ silent: true });
    _inited = true;
    return Promise.resolve();
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
        upsertMany(ids.map((uid) => [uid, farmStatesParam.get(uid)]));
    } catch (e) {
        console.error("[garden] SQLite flush failed:", e.message);
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
        upsertMany([...farmStatesParam]);
        dirtyUserIds.clear();
    } catch (e) {
        console.error("[garden] SQLite saveAll failed:", e.message);
    }
}

function closeDb() {
    // better-sqlite3 schreibt synchron bei jedem Statement — kein manuelles Export/Persist nötig.
    // _db.close() lassen wir weg, um den Windows libuv-Crash bei Strg+C zu vermeiden!
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
function runRollingBackup(opts = {}) {
    const { silent = false } = opts;
    if (!fs.existsSync(DB_PATH)) {
        if (!silent) console.log("[Backup] Übersprungen: Noch keine Hauptdatenbank vorhanden.");
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
        // better-sqlite3 (Standard Journal-Mode) hält DB_PATH stets aktuell — einfaches Kopieren reicht.
        fs.copyFileSync(DB_PATH, targetPath);
        if (!silent) console.log(`[Backup] ✅ Success: Slot ${slotIndex} aktualisiert (${now.toLocaleTimeString()}) -> ${backupFileName}`);
    } catch (err) {
        console.error(`[Backup] ❌ Fehler beim Erstellen von Slot ${slotIndex}:`, err);
    }
}

// Prüft alle 30 Minuten, ob der aktuelle Slot überschrieben werden soll
// (So bist du sicher, dass das Backup auch passiert, wenn der Server mal um 06:05 Uhr neugestartet wird)
// unref(): der laufende Server hält den Event-Loop ohnehin offen. Ohne das hier
// blieb jedes Skript, das dieses Modul nur einlädt, für immer hängen.
const _backupTimer = setInterval(runRollingBackup, 30 * 60 * 1000);
if (typeof _backupTimer.unref === "function") _backupTimer.unref();

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
