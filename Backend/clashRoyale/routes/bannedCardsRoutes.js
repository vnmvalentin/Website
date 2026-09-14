// bannedCardsRoutes.js — OBS-Overlay für gebannte Karten (Nuzlocke).
const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../lib/bannedCardsStore");

const getListByUser = db.prepare("SELECT * FROM banned_cards_lists WHERE user_id = ?");
const getListByOverlayKey = db.prepare("SELECT * FROM banned_cards_lists WHERE overlay_key = ?");
const insertList = db.prepare(
  "INSERT INTO banned_cards_lists (user_id, mod_key, overlay_key, attempts, updated_at) VALUES (?, ?, ?, 0, ?)"
);
const updateOverlayKey = db.prepare("UPDATE banned_cards_lists SET overlay_key = ?, updated_at = ? WHERE user_id = ?");

// Legacy-Einträge (alte Liste pro User, vor dem Account-System)
const getLegacyEntries = db.prepare("SELECT * FROM banned_cards_entries WHERE user_id = ? ORDER BY banned_at ASC");

// Aktiver Nuzlocke-Account des Users speist das Overlay
const getActiveAccount = db.prepare("SELECT * FROM nuzlocke_accounts WHERE user_id = ? AND is_active = 1");
const getAccountBans = db.prepare("SELECT * FROM nuzlocke_banned WHERE account_id = ? ORDER BY banned_at ASC");

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

module.exports = function createBannedCardsRouter({ requireAuth } = {}) {
  const router = express.Router();

  // Overlay-Key des eingeloggten Users (für den Einstellungen-Tab der Nuzlocke-Seite)
  router.get("/me", requireAuth, (req, res) => {
    const list = getOrCreateList(String(req.twitchId));
    res.json({ userId: list.user_id, overlayKey: list.overlay_key });
  });

  router.post("/me/regenerate", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    getOrCreateList(userId);
    updateOverlayKey.run(nanoid(16), Date.now(), userId);
    res.json({ overlayKey: getListByUser.get(userId).overlay_key });
  });

  // ========== Overlay (kein Login — read-only für OBS) ==========
  // Spiegelt die Bans des aktiven Accounts + den GLOBALEN Versuchszähler.
  router.get("/overlay/:overlayKey", (req, res) => {
    const list = getListByOverlayKey.get(req.params.overlayKey);
    if (!list) return res.status(403).json({ error: "Ungültiger Overlay-Link" });

    const active = getActiveAccount.get(list.user_id);
    if (active) {
      return res.json({
        cards: getAccountBans.all(active.account_id).map(rowToEntry),
        attempts: list.attempts, // <-- HIER GEÄNDERT: Liest jetzt global aus der Liste
      });
    }
    // Fallback: alte Liste (vor dem Account-System), damit bestehende Overlays weiterlaufen
    res.json({ cards: getLegacyEntries.all(list.user_id).map(rowToEntry), attempts: list.attempts });
  });

  return router;
};