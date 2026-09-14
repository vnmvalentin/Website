// crStreamerStore.js — Clash Royale Streamer-Konfiguration in SQLite (better-sqlite3)
// Pro Twitch-ID: OBS-Verbindung, Automatik-Aktionen (Minigame-Start / Draft-Ende)
// und der Feed für das globale Deck-Overlay.
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { nanoid } = require("nanoid");

const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "cr_streamer.db");

let _db = null;

const DEFAULT_EVENT_ACTION = {
  /** Programm-Szene wechseln zu … (null = keine Szenen-Aktion) */
  sceneName: null,
  /** Quelle ein-/ausblenden: { sceneName, sourceName, action: 'show'|'hide' } | null */
  source: null,
};

const DEFAULT_CONFIG = {
  twitchLogin: "",
  obs: {
    host: "127.0.0.1",
    port: 4455,
    password: "",
  },
  actions: {
    gameStart: { ...DEFAULT_EVENT_ACTION },
    draftEnd: { ...DEFAULT_EVENT_ACTION },
  },
  /** Letzter abgeschlossener Draft für das Deck-Overlay */
  lastDecks: null,
  updatedAt: 0,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initCrStreamerStore() {
  if (_db) return;
  ensureDataDir();
  _db = new Database(DB_PATH);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS cr_streamer_configs (
      twitch_id   TEXT PRIMARY KEY,
      data        TEXT NOT NULL,
      overlay_key TEXT NOT NULL
    );
  `);
  _db.exec(
    `CREATE INDEX IF NOT EXISTS idx_crs_overlay ON cr_streamer_configs(overlay_key);`
  );
}

function normalizeEventAction(a) {
  const src = a && typeof a === "object" ? a : {};
  const out = { ...DEFAULT_EVENT_ACTION };
  if (typeof src.sceneName === "string" && src.sceneName.trim()) {
    out.sceneName = src.sceneName.trim().slice(0, 100);
  }
  const s = src.source;
  if (
    s && typeof s === "object" &&
    typeof s.sceneName === "string" && s.sceneName.trim() &&
    typeof s.sourceName === "string" && s.sourceName.trim() &&
    (s.action === "show" || s.action === "hide")
  ) {
    out.source = {
      sceneName: s.sceneName.trim().slice(0, 100),
      sourceName: s.sourceName.trim().slice(0, 100),
      action: s.action,
    };
  }
  return out;
}

function normalizeConfig(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const obs = c.obs && typeof c.obs === "object" ? c.obs : {};
  return {
    ...DEFAULT_CONFIG,
    ...c,
    twitchLogin: String(c.twitchLogin || "").slice(0, 60),
    obs: {
      host: String(obs.host || "127.0.0.1").trim().slice(0, 100) || "127.0.0.1",
      port: Math.max(1, Math.min(65535, parseInt(obs.port, 10) || 4455)),
      password: String(obs.password || "").slice(0, 200),
    },
    actions: {
      gameStart: normalizeEventAction(c.actions?.gameStart),
      draftEnd: normalizeEventAction(c.actions?.draftEnd),
    },
    lastDecks:
      c.lastDecks && typeof c.lastDecks === "object" ? c.lastDecks : null,
    updatedAt: Number(c.updatedAt) || 0,
  };
}

function rowToConfig(row) {
  if (!row) return null;
  let data = {};
  try {
    data = JSON.parse(row.data);
  } catch {
    /* korrupte Zeile → Defaults */
  }
  const cfg = normalizeConfig(data);
  cfg.overlayKey = row.overlay_key;
  cfg.twitchId = row.twitch_id;
  return cfg;
}

/** Config laden; legt bei Bedarf einen Default-Eintrag mit frischem Overlay-Key an. */
function getOrCreateConfig(twitchId, twitchLogin = "") {
  if (!_db) return null;
  const id = String(twitchId);
  const row = _db
    .prepare("SELECT * FROM cr_streamer_configs WHERE twitch_id = ?")
    .get(id);
  if (row) {
    const cfg = rowToConfig(row);
    if (twitchLogin && cfg.twitchLogin !== twitchLogin) {
      cfg.twitchLogin = twitchLogin;
      // Direkt persistieren statt über saveConfig()/getOrCreateConfig() zu gehen —
      // sonst würde der DB-Stand (noch alter Login) bei jedem Aufruf erneut einen
      // Mismatch erkennen und in unbegrenzte Rekursion laufen.
      persist(id, cfg);
    }
    return cfg;
  }
  const cfg = normalizeConfig({ twitchLogin });
  cfg.overlayKey = nanoid(14);
  cfg.twitchId = id;
  cfg.updatedAt = Date.now();
  persist(id, cfg);
  return cfg;
}

/** Config lesen ohne anzulegen (für Event-Hooks aus Lobbys). */
function getConfig(twitchId) {
  if (!_db) return null;
  const row = _db
    .prepare("SELECT * FROM cr_streamer_configs WHERE twitch_id = ?")
    .get(String(twitchId));
  return rowToConfig(row);
}

function findByOverlayKey(overlayKey) {
  if (!_db || !overlayKey) return null;
  const row = _db
    .prepare("SELECT * FROM cr_streamer_configs WHERE overlay_key = ?")
    .get(String(overlayKey));
  return rowToConfig(row);
}

function persist(twitchId, cfg) {
  const { overlayKey, twitchId: _tid, ...data } = cfg;
  _db
    .prepare(
      "INSERT OR REPLACE INTO cr_streamer_configs (twitch_id, data, overlay_key) VALUES (?, ?, ?)"
    )
    .run(String(twitchId), JSON.stringify(data), String(overlayKey || ""));
}

/** Teil-Update: obs/actions aus Nutzereingabe übernehmen, Rest (lastDecks, Key) behalten. */
function saveConfig(twitchId, patch) {
  if (!_db) return null;
  const current = getOrCreateConfig(twitchId, patch?.twitchLogin || "");
  const next = normalizeConfig({
    ...current,
    ...(patch && typeof patch === "object" ? patch : {}),
    // lastDecks wird nur über setLastDecks geschrieben, nie vom Client
    lastDecks: current.lastDecks,
    updatedAt: Date.now(),
  });
  next.overlayKey = current.overlayKey;
  next.twitchId = String(twitchId);
  persist(twitchId, next);
  return next;
}

function regenerateOverlayKey(twitchId) {
  if (!_db) return null;
  const cfg = getOrCreateConfig(twitchId);
  cfg.overlayKey = nanoid(14);
  cfg.updatedAt = Date.now();
  persist(twitchId, cfg);
  return cfg;
}

/** Nach einem abgeschlossenen Draft: Decks für das globale Overlay speichern. */
function setLastDecks(twitchId, decksPayload) {
  if (!_db) return null;
  const cfg = getConfig(twitchId);
  if (!cfg) return null; // kein Streamer-Setup → nichts zu speichern
  cfg.lastDecks = decksPayload;
  cfg.updatedAt = Date.now();
  persist(twitchId, cfg);
  return cfg;
}

module.exports = {
  initCrStreamerStore,
  getOrCreateConfig,
  getConfig,
  findByOverlayKey,
  saveConfig,
  regenerateOverlayKey,
  setLastDecks,
  getDbPath: () => DB_PATH,
};
