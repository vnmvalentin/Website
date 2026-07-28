// crPresetStore.js — Karten-Presets für den Kartenpool der Clash-Royale-Minigames.
//
// Zwei Quellen:
//   source='admin'  vom Streamer selbst angelegte Presets (Name + Kartenauswahl)
//   source='auto'   automatisch erkannte Kartenpools offizieller Clash-Royale-Spezialmodi
//                   (siehe clashRoyale/core/officialModeScanner.js)
//
// Auto-Presets sammeln ihre Karten über mehrere Scans hinweg an: die offizielle API verrät
// den erlaubten Kartenpool eines Modus nicht direkt, er wird aus echten Battlelogs
// zusammengetragen und wächst mit jedem Scan, bis er gesättigt ist.
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
    -- 1 = die Sichtbarkeit wurde von Hand gesetzt; der Auto-Scan lässt sie dann in Ruhe
    publish_locked INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
)`);
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_presets_mode
         ON cr_card_presets(game_mode_key) WHERE game_mode_key != ''`);

// Jede Spalte, die nach dem ersten Release dazukam, braucht hier ihr ALTER TABLE — das
// CREATE TABLE oben läuft bei einer bereits existierenden Datei nicht mehr.
try { db.exec("ALTER TABLE cr_card_presets ADD COLUMN publish_locked INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
// Vom Admin gesetzter Anzeigename. Die offizielle API liefert für Spielmodi nur interne
// Codenamen ("Crazy_Arena"); wer den echten Namen kennt, trägt ihn hier ein — der Scan
// überschreibt nur `name` und lässt diese Spalte in Ruhe.
try { db.exec("ALTER TABLE cr_card_presets ADD COLUMN display_name TEXT NOT NULL DEFAULT ''"); } catch { /* Spalte existiert bereits */ }
// Zeitstempel pro Karte ({ kartenId: zuletztGesehenMs }). Grundlage dafür, dass Karten aus
// einer alten Modus-Phase wieder aus dem Pool fallen — siehe upsertAutoPreset().
try { db.exec("ALTER TABLE cr_card_presets ADD COLUMN card_seen TEXT NOT NULL DEFAULT '{}'"); } catch { /* Spalte existiert bereits */ }
// Letzte Änderung des Kartenpools, damit die Admin-Seite Phasenwechsel sichtbar machen kann
try { db.exec("ALTER TABLE cr_card_presets ADD COLUMN pool_changed_at INTEGER NOT NULL DEFAULT 0"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_card_presets ADD COLUMN last_added TEXT NOT NULL DEFAULT '[]'"); } catch { /* Spalte existiert bereits */ }
try { db.exec("ALTER TABLE cr_card_presets ADD COLUMN last_removed TEXT NOT NULL DEFAULT '[]'"); } catch { /* Spalte existiert bereits */ }

// Zeitpunkt des letzten Scans, damit die Admin-Seite ihn anzeigen kann
db.exec(`CREATE TABLE IF NOT EXISTS cr_preset_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
)`);

const stmt = {
  all: db.prepare('SELECT * FROM cr_card_presets ORDER BY source ASC, sort_order ASC, name ASC'),
  published: db.prepare("SELECT * FROM cr_card_presets WHERE is_published = 1 ORDER BY source ASC, sort_order ASC, name ASC"),
  byId: db.prepare('SELECT * FROM cr_card_presets WHERE preset_id = ?'),
  byModeKey: db.prepare("SELECT * FROM cr_card_presets WHERE game_mode_key = ?"),
  insert: db.prepare(`INSERT INTO cr_card_presets
    (preset_id, name, description, card_ids, source, game_mode_key, games_seen, is_published, publish_locked, sort_order, first_seen, last_seen, created_at, updated_at)
    VALUES (@preset_id, @name, @description, @card_ids, @source, @game_mode_key, @games_seen, @is_published, 0, @sort_order, @first_seen, @last_seen, @created_at, @updated_at)`),
  update: db.prepare(`UPDATE cr_card_presets
    SET name = @name, display_name = @display_name, description = @description, card_ids = @card_ids,
        is_published = @is_published, publish_locked = @publish_locked,
        sort_order = @sort_order, updated_at = @updated_at
    WHERE preset_id = @preset_id`),
  updateAuto: db.prepare(`UPDATE cr_card_presets
    SET name = @name, card_ids = @card_ids, card_seen = @card_seen, games_seen = @games_seen,
        is_published = @is_published, last_seen = @last_seen, updated_at = @updated_at,
        pool_changed_at = @pool_changed_at, last_added = @last_added, last_removed = @last_removed
    WHERE preset_id = @preset_id`),
  remove: db.prepare('DELETE FROM cr_card_presets WHERE preset_id = ?'),
  getMeta: db.prepare('SELECT value FROM cr_preset_meta WHERE key = ?'),
  setMeta: db.prepare('INSERT INTO cr_preset_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
};

const parseJson = (raw, fallback) => {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch { return fallback; }
};

function rowToPublic(row) {
  const cardIds = parseJson(row.card_ids, []);
  return {
    presetId: row.preset_id,
    // `name` ist immer der Name, der angezeigt werden soll: der vom Admin gesetzte
    // Anzeigename schlägt den Codenamen aus dem Scan.
    name: row.display_name || row.name,
    rawName: row.name,
    displayName: row.display_name || '',
    description: row.description || '',
    cardIds: Array.isArray(cardIds) ? cardIds : [],
    source: row.source,
    gameModeKey: row.game_mode_key || '',
    gamesSeen: row.games_seen,
    isPublished: !!row.is_published,
    publishLocked: !!row.publish_locked,
    sortOrder: row.sort_order,
    firstSeen: row.first_seen || null,
    lastSeen: row.last_seen || null,
    // Phasenwechsel des Kartenpools: wann er sich zuletzt geändert hat und wie
    poolChangedAt: row.pool_changed_at || null,
    lastAdded: parseJson(row.last_added, []),
    lastRemoved: parseJson(row.last_removed, []),
    updatedAt: row.updated_at,
  };
}

const listAll = () => stmt.all.all().map(rowToPublic);
const listPublished = () => stmt.published.all().map(rowToPublic);
const getById = (id) => { const r = stmt.byId.get(id); return r ? rowToPublic(r) : null; };
const getByModeKey = (key) => { const r = stmt.byModeKey.get(key); return r ? rowToPublic(r) : null; };

function createPreset({ presetId, name, displayName = '', description = '', cardIds = [], source = 'admin', gameModeKey = '', gamesSeen = 0, isPublished = true, sortOrder = 0, cardSeen = null }) {
  const now = Date.now();
  stmt.insert.run({
    preset_id: presetId,
    name,
    display_name: displayName,
    description,
    card_ids: JSON.stringify(cardIds),
    card_seen: JSON.stringify(cardSeen ?? Object.fromEntries(cardIds.map(id => [id, now]))),
    source,
    game_mode_key: gameModeKey,
    games_seen: gamesSeen,
    is_published: isPublished ? 1 : 0,
    sort_order: sortOrder,
    first_seen: now,
    last_seen: now,
    created_at: now,
    updated_at: now,
  });
  return getById(presetId);
}

function updatePreset(presetId, { name, displayName, description, cardIds, isPublished, sortOrder }) {
  const existing = stmt.byId.get(presetId);
  if (!existing) return null;
  stmt.update.run({
    preset_id: presetId,
    name: name ?? existing.name,
    display_name: displayName ?? existing.display_name ?? '',
    description: description ?? existing.description,
    card_ids: cardIds ? JSON.stringify(cardIds) : existing.card_ids,
    is_published: (isPublished ?? !!existing.is_published) ? 1 : 0,
    // Wer die Sichtbarkeit von Hand setzt, behält sie: der Auto-Scan überschreibt sie danach nicht mehr
    publish_locked: isPublished === undefined ? existing.publish_locked : 1,
    sort_order: sortOrder ?? existing.sort_order,
    updated_at: Date.now(),
  });
  return getById(presetId);
}

// Auto-Preset eines offiziellen Spielmodus fortschreiben.
//
// GLEITENDES FENSTER statt "ewig ansammeln": Für jede Karte wird gemerkt, wann sie zuletzt in
// diesem Modus gespielt wurde. Der Pool sind alle Karten, die innerhalb der letzten
// `windowMs` gesehen wurden. Das ist wichtig, weil Supercell den Kartenpool eines Modus
// mitten im Event ändert (der Chaos-Modus lief in mehreren Phasen mit unterschiedlichen
// Karten). Würden wir nur addieren, wäre am Ende die Vereinigung ALLER Phasen im Preset —
// also ein Pool, den es im Spiel nie gab. So fallen Karten einer alten Phase von selbst
// wieder heraus, und neue kommen dazu.
//
// Läuft ein Modus aus (keine Battles mehr), wird hier nichts mehr aufgerufen: der Pool
// friert auf seinem letzten Stand ein statt langsam leerzulaufen.
//
// shouldPublish({ cardCount, gamesSeen }) -> boolean entscheidet über die Sichtbarkeit,
// wird aber ignoriert, sobald ein Admin sie von Hand gesetzt hat (publish_locked).
function upsertAutoPreset({ gameModeKey, name, cardIds, gamesSeen, windowMs, shouldPublish }) {
  const existing = stmt.byModeKey.get(gameModeKey);
  const now = Date.now();
  const decide = (cardCount, games) =>
    (typeof shouldPublish === 'function' ? !!shouldPublish({ cardCount, gamesSeen: games }) : true);

  if (!existing) {
    return createPreset({
      presetId: `auto-${gameModeKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 60),
      name, cardIds, source: 'auto', gameModeKey, gamesSeen,
      isPublished: decide(cardIds.length, gamesSeen),
    });
  }

  const prevIds = parseJson(existing.card_ids, []);
  // Karten ohne Zeitstempel (Presets von vor dieser Spalte) zählen als "jetzt gesehen",
  // damit sie nicht beim ersten Lauf mit dem neuen Fenster verschwinden.
  const seen = parseJson(existing.card_seen, null) || Object.fromEntries(prevIds.map(id => [id, now]));
  for (const id of cardIds) seen[id] = now;

  const cutoff = windowMs ? now - windowMs : 0;
  const inWindow = Object.entries(seen).filter(([, ts]) => ts >= cutoff);
  const nextIds = inWindow.map(([id]) => id);

  const prevSet = new Set(prevIds);
  const nextSet = new Set(nextIds);
  const added = nextIds.filter(id => !prevSet.has(id));
  const removed = prevIds.filter(id => !nextSet.has(id));
  const changed = added.length > 0 || removed.length > 0;
  const games = (existing.games_seen || 0) + gamesSeen;

  stmt.updateAuto.run({
    preset_id: existing.preset_id,
    name,
    card_ids: JSON.stringify(nextIds),
    card_seen: JSON.stringify(Object.fromEntries(inWindow)),
    games_seen: games,
    is_published: existing.publish_locked ? existing.is_published : (decide(nextIds.length, games) ? 1 : 0),
    last_seen: now,
    updated_at: now,
    pool_changed_at: changed ? now : (existing.pool_changed_at || 0),
    last_added: changed ? JSON.stringify(added) : existing.last_added,
    last_removed: changed ? JSON.stringify(removed) : existing.last_removed,
  });
  return getById(existing.preset_id);
}

const deletePreset = (presetId) => stmt.remove.run(presetId).changes > 0;
const getMeta = (key) => stmt.getMeta.get(key)?.value ?? null;
const setMeta = (key, value) => stmt.setMeta.run(key, String(value));

module.exports = {
  db,
  listAll,
  listPublished,
  getById,
  getByModeKey,
  createPreset,
  updatePreset,
  upsertAutoPreset,
  deletePreset,
  getMeta,
  setMeta,
};
