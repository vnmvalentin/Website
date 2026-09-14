// crPresetStore.js — private, selbst angelegte Karten-Presets für den Kartenpool der
// Clash-Royale-Minigames. Jeder Twitch-Account verwaltet seine eigenen Presets, sichtbar und
// anwendbar nur für ihn selbst beim Hosten einer Lobby — kein gemeinsamer, öffentlicher
// Presets-Pool.
//
// Vorher gab es zusätzlich admin-only globale Presets und automatisch aus Battlelogs erkannte
// Presets offizieller Spezialmodi (clashRoyale/core/officialModeScanner.js, inzwischen
// entfernt). Die Migration unten ordnet bestehende Admin-Presets dem Seiten-Admin als seine
// eigenen Presets zu, statt sie zu verlieren, und räumt die Auto-Presets weg.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'cr_presets.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS cr_card_presets (
    preset_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    card_ids TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'admin',
    game_mode_key TEXT NOT NULL DEFAULT '',
    games_seen INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    publish_locked INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
)`);
// source/game_mode_key/games_seen/is_published/publish_locked/first_seen/last_seen sowie die
// per ALTER TABLE nachgerüsteten display_name/card_seen/pool_changed_at/last_added/last_removed
// (siehe Git-Historie) sind seit dem Umbau auf private Presets nur noch Altlasten aus dem
// Admin/Auto-Modell — bewusst nicht per DROP COLUMN entfernt (Projektkonvention: Migrationen
// fügen nur hinzu), aber im Code hier unten nicht mehr gepflegt.
try { db.exec("ALTER TABLE cr_card_presets ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }
db.exec(`CREATE INDEX IF NOT EXISTS idx_cr_presets_user ON cr_card_presets(user_id)`);

// Einmalige (aber gefahrlos wiederholbare) Aufräumaktion von vor diesem Umbau: Auto-Presets
// raus, bestehende Admin-Presets dem Seiten-Admin zuordnen statt sie zu verlieren.
try {
  db.prepare("DELETE FROM cr_card_presets WHERE source = 'auto'").run();
  const streamerId = process.env.STREAMER_TWITCH_ID || '';
  if (streamerId) {
    db.prepare("UPDATE cr_card_presets SET user_id = ? WHERE source = 'admin' AND (user_id IS NULL OR user_id = '')").run(streamerId);
  }
} catch { /* best effort — betrifft nur den einmaligen Übergang */ }

const stmt = {
  byUser: db.prepare('SELECT * FROM cr_card_presets WHERE user_id = ? ORDER BY sort_order ASC, name ASC'),
  byId: db.prepare('SELECT * FROM cr_card_presets WHERE preset_id = ?'),
  insert: db.prepare(`INSERT INTO cr_card_presets
    (preset_id, user_id, name, description, card_ids, sort_order, created_at, updated_at)
    VALUES (@preset_id, @user_id, @name, @description, @card_ids, @sort_order, @created_at, @updated_at)`),
  update: db.prepare(`UPDATE cr_card_presets
    SET name = @name, description = @description, card_ids = @card_ids, sort_order = @sort_order, updated_at = @updated_at
    WHERE preset_id = @preset_id AND user_id = @user_id`),
  remove: db.prepare('DELETE FROM cr_card_presets WHERE preset_id = ? AND user_id = ?'),
};

const parseJson = (raw, fallback) => {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch { return fallback; }
};

function rowToPublic(row) {
  return {
    presetId: row.preset_id,
    name: row.name,
    description: row.description || '',
    cardIds: parseJson(row.card_ids, []),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const listByUser = (userId) => stmt.byUser.all(String(userId)).map(rowToPublic);
const getById = (presetId) => {
  const row = stmt.byId.get(presetId);
  return row ? rowToPublic(row) : null;
};

function createPreset({ presetId, userId, name, description = '', cardIds = [], sortOrder = 0 }) {
  const now = Date.now();
  stmt.insert.run({
    preset_id: presetId,
    user_id: String(userId),
    name,
    description,
    card_ids: JSON.stringify(cardIds),
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  });
  return getById(presetId);
}

// Nur der Eigentümer darf ändern — liefert null sowohl bei unbekannter ID als auch bei
// fremdem Preset, damit die Route beides gleich (404) behandeln kann.
function updatePreset(presetId, userId, { name, description, cardIds, sortOrder }) {
  const existing = stmt.byId.get(presetId);
  if (!existing || String(existing.user_id) !== String(userId)) return null;
  stmt.update.run({
    preset_id: presetId,
    user_id: String(userId),
    name: name ?? existing.name,
    description: description ?? existing.description,
    card_ids: cardIds ? JSON.stringify(cardIds) : existing.card_ids,
    sort_order: sortOrder ?? existing.sort_order,
    updated_at: Date.now(),
  });
  return getById(presetId);
}

const deletePreset = (presetId, userId) => stmt.remove.run(presetId, String(userId)).changes > 0;

module.exports = {
  db,
  listByUser,
  getById,
  createPreset,
  updatePreset,
  deletePreset,
};
