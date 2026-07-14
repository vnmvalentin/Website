const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../lib/bannedCardsStore");

const getListByUser = db.prepare("SELECT * FROM banned_cards_lists WHERE user_id = ?");
const getListByModKey = db.prepare("SELECT * FROM banned_cards_lists WHERE mod_key = ?");
const getListByOverlayKey = db.prepare("SELECT * FROM banned_cards_lists WHERE overlay_key = ?");
const insertList = db.prepare(
  "INSERT INTO banned_cards_lists (user_id, mod_key, overlay_key, attempts, updated_at) VALUES (?, ?, ?, 0, ?)"
);
const updateModKey = db.prepare("UPDATE banned_cards_lists SET mod_key = ?, updated_at = ? WHERE user_id = ?");
const updateOverlayKey = db.prepare("UPDATE banned_cards_lists SET overlay_key = ?, updated_at = ? WHERE user_id = ?");
const updateAttempts = db.prepare("UPDATE banned_cards_lists SET attempts = ?, updated_at = ? WHERE user_id = ?");
const touchList = db.prepare("UPDATE banned_cards_lists SET updated_at = ? WHERE user_id = ?");

const getEntries = db.prepare("SELECT * FROM banned_cards_entries WHERE user_id = ? ORDER BY banned_at ASC");
const getEntryByCardId = db.prepare("SELECT * FROM banned_cards_entries WHERE user_id = ? AND card_id = ?");
const insertEntry = db.prepare(
  "INSERT INTO banned_cards_entries (entry_id, user_id, card_id, name, rarity, banned_at) VALUES (?, ?, ?, ?, ?, ?)"
);
const deleteEntry = db.prepare("DELETE FROM banned_cards_entries WHERE user_id = ? AND entry_id = ?");
const deleteAllEntries = db.prepare("DELETE FROM banned_cards_entries WHERE user_id = ?");

function rowToEntry(row) {
  return { entryId: row.entry_id, id: row.card_id, name: row.name, rarity: row.rarity || "", bannedAt: row.banned_at };
}

function getOrCreateList(userId) {
  let list = getListByUser.get(userId);
  if (!list) {
    insertList.run(userId, nanoid(16), nanoid(16), Date.now());
    list = getListByUser.get(userId);
  }
  return list;
}

function docForList(list) {
  return {
    userId: list.user_id,
    modKey: list.mod_key,
    overlayKey: list.overlay_key,
    attempts: list.attempts,
    updatedAt: list.updated_at,
    cards: getEntries.all(list.user_id).map(rowToEntry),
  };
}

module.exports = function createBannedCardsRouter({ requireAuth } = {}) {
  const router = express.Router();

  // ========== Eigene Liste (Twitch-Login nötig) ==========

  router.get("/me", requireAuth, (req, res) => {
    const list = getOrCreateList(String(req.twitchId));
    res.json(docForList(list));
  });

  router.post("/me/regenerate", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    const list = getOrCreateList(userId);
    const which = req.body?.which === "overlay" ? "overlay" : "mod";

    if (which === "overlay") updateOverlayKey.run(nanoid(16), Date.now(), userId);
    else updateModKey.run(nanoid(16), Date.now(), userId);

    res.json(docForList(getListByUser.get(userId)));
  });

  // ========== Moderator-Link (kein Login — teilbar) ==========

  router.get("/mod/:modKey", (req, res) => {
    const list = getListByModKey.get(req.params.modKey);
    if (!list) return res.status(403).json({ error: "Ungültiger Moderator-Link" });
    res.json({
      cards: getEntries.all(list.user_id).map(rowToEntry),
      attempts: list.attempts,
      overlayKey: list.overlay_key,
    });
  });

  router.post("/mod/:modKey", (req, res) => {
    const list = getListByModKey.get(req.params.modKey);
    if (!list) return res.status(403).json({ error: "Ungültiger Moderator-Link" });

    const { id, name, rarity } = req.body || {};
    if (!id || !name) return res.status(400).json({ error: "id und name erforderlich" });
    if (getEntryByCardId.get(list.user_id, id)) {
      return res.status(400).json({ error: "Karte ist bereits gebannt" });
    }

    const entry = { entryId: nanoid(10), id, name, rarity: rarity || "", bannedAt: Date.now() };
    insertEntry.run(entry.entryId, list.user_id, entry.id, entry.name, entry.rarity, entry.bannedAt);
    touchList.run(entry.bannedAt, list.user_id);
    res.json({ ok: true, card: entry });
  });

  router.delete("/mod/:modKey/:entryId", (req, res) => {
    const list = getListByModKey.get(req.params.modKey);
    if (!list) return res.status(403).json({ error: "Ungültiger Moderator-Link" });

    const result = deleteEntry.run(list.user_id, req.params.entryId);
    if (result.changes === 0) return res.status(404).json({ error: "Eintrag nicht gefunden" });
    touchList.run(Date.now(), list.user_id);
    res.json({ ok: true });
  });

  router.delete("/mod/:modKey", (req, res) => {
    const list = getListByModKey.get(req.params.modKey);
    if (!list) return res.status(403).json({ error: "Ungültiger Moderator-Link" });

    deleteAllEntries.run(list.user_id);
    touchList.run(Date.now(), list.user_id);
    res.json({ ok: true });
  });

  router.post("/mod/:modKey/attempts", (req, res) => {
    const list = getListByModKey.get(req.params.modKey);
    if (!list) return res.status(403).json({ error: "Ungültiger Moderator-Link" });

    const delta = Number(req.body?.delta) || 0;
    const attempts = Math.max(0, list.attempts + delta);
    updateAttempts.run(attempts, Date.now(), list.user_id);
    res.json({ ok: true, attempts });
  });

  // ========== Overlay (kein Login — read-only für OBS) ==========

  router.get("/overlay/:overlayKey", (req, res) => {
    const list = getListByOverlayKey.get(req.params.overlayKey);
    if (!list) return res.status(403).json({ error: "Ungültiger Overlay-Link" });
    res.json({ cards: getEntries.all(list.user_id).map(rowToEntry), attempts: list.attempts });
  });

  return router;
};
