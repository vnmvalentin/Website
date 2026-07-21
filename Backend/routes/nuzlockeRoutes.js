// nuzlockeRoutes.js — Clash Royale Nuzlocke: verknüpfte Accounts, Deck, Glücksrad-Bans
const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../lib/bannedCardsStore");
const { ALL_CARDS } = require("./clashRoyaleRoutes");

const CARD_BY_ID = new Map(ALL_CARDS.map(c => [c.id, c]));
const DECK_SIZE = 8;

const CR_API_TOKEN = process.env.CLASH_ROYALE_API_TOKEN || "";
const CR_API_BASE = process.env.CLASH_ROYALE_API_BASE || "https://api.clashroyale.com/v1";
const REFRESH_STALE_MS = 6 * 60 * 60 * 1000; 

const TAG_CHARS = /^[0289PYLQGRJCUV]{3,12}$/;

function normalizeTag(raw) {
  const tag = String(raw || "").trim().toUpperCase().replace(/^#/, "").replace(/O/g, "0");
  return TAG_CHARS.test(tag) ? tag : null;
}

async function fetchPlayer(tag) {
  if (!CR_API_TOKEN) return null;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${CR_API_BASE}/players/%23${tag}`, {
      headers: { Authorization: `Bearer ${CR_API_TOKEN}` },
      signal: ctrl.signal,
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`Royale API HTTP ${res.status}`);
    const data = await res.json();

    let currentDeck = [];
    if (data.currentDeck) {
      currentDeck = data.currentDeck.map(apiCard => {
        const match = ALL_CARDS.find(c => c.name === apiCard.name);
        return match ? match.id : null;
      }).filter(Boolean);
    }

    return { 
      name: data.name || "", 
      bestTrophies: data.bestTrophies || data.trophies || 0,
      currentDeck 
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Prepared Statements ───────────────────────────────────────────────────────
const getAccountsByUser = db.prepare("SELECT * FROM nuzlocke_accounts WHERE user_id = ? ORDER BY created_at ASC");
const getAccountById = db.prepare("SELECT * FROM nuzlocke_accounts WHERE account_id = ?");
const getAccountByTag = db.prepare("SELECT * FROM nuzlocke_accounts WHERE player_tag = ?");
const getAllAccounts = db.prepare("SELECT * FROM nuzlocke_accounts ORDER BY best_trophies DESC, created_at ASC");
const insertAccount = db.prepare(`INSERT INTO nuzlocke_accounts
  (account_id, user_id, twitch_login, player_tag, player_name, best_trophies, deck, attempts, is_active, last_fetched, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`);
const deleteAccountStmt = db.prepare("DELETE FROM nuzlocke_accounts WHERE account_id = ?");
const updateDeck = db.prepare("UPDATE nuzlocke_accounts SET deck = ? WHERE account_id = ?");
const updatePlayerData = db.prepare("UPDATE nuzlocke_accounts SET player_name = ?, best_trophies = ?, last_fetched = ? WHERE account_id = ?");
const updateTwitchLogin = db.prepare("UPDATE nuzlocke_accounts SET twitch_login = ? WHERE user_id = ?");
const deactivateAll = db.prepare("UPDATE nuzlocke_accounts SET is_active = 0 WHERE user_id = ?");
const activateOne = db.prepare("UPDATE nuzlocke_accounts SET is_active = 1 WHERE account_id = ?");
const toggleFinishAccountStmt = db.prepare("UPDATE nuzlocke_accounts SET is_finished = CASE WHEN is_finished = 1 THEN 0 ELSE 1 END WHERE account_id = ?");

const getBans = db.prepare("SELECT * FROM nuzlocke_banned WHERE account_id = ? ORDER BY banned_at ASC");
const getBanCount = db.prepare("SELECT COUNT(*) AS n FROM nuzlocke_banned WHERE account_id = ?");
const getBanByCard = db.prepare("SELECT * FROM nuzlocke_banned WHERE account_id = ? AND card_id = ?");
const insertBan = db.prepare("INSERT INTO nuzlocke_banned (entry_id, account_id, card_id, name, rarity, banned_at) VALUES (?, ?, ?, ?, ?, ?)");
const deleteBan = db.prepare("DELETE FROM nuzlocke_banned WHERE account_id = ? AND entry_id = ?");

// Globaler Counter (banned_cards_lists Tabelle wird wiederverwendet)
const updateGlobalAttempts = db.prepare("UPDATE banned_cards_lists SET attempts = ?, updated_at = ? WHERE user_id = ?");

function getOrCreateGlobalAttempts(userId) {
  let list = db.prepare("SELECT attempts FROM banned_cards_lists WHERE user_id = ?").get(userId);
  if (!list) {
    db.prepare("INSERT INTO banned_cards_lists (user_id, mod_key, overlay_key, attempts, updated_at) VALUES (?, ?, ?, 0, ?)")
      .run(userId, nanoid(16), nanoid(16), Date.now());
    list = { attempts: 0 };
  }
  return list.attempts;
}

// ── Serialisierung ────────────────────────────────────────────────────────────
function banRowToEntry(row) {
  return { entryId: row.entry_id, id: row.card_id, name: row.name, rarity: row.rarity || "", bannedAt: row.banned_at };
}

function accountSummary(row) {
  return {
    accountId: row.account_id,
    playerTag: row.player_tag,
    playerName: row.player_name || row.player_tag,
    bestTrophies: row.best_trophies,
    isActive: !!row.is_active,
    isFinished: !!row.is_finished, // <-- NEU
    deckSize: JSON.parse(row.deck || "[]").length,
    bannedCount: getBanCount.get(row.account_id).n,
    lastFetched: row.last_fetched,
  };
}

function accountDetail(row) {
  return {
    ...accountSummary(row),
    deck: JSON.parse(row.deck || "[]"),
    banned: getBans.all(row.account_id).map(banRowToEntry),
  };
}

function refreshStaleAccounts(rows) {
  if (!CR_API_TOKEN) return;
  const now = Date.now();
  rows.filter(r => now - r.last_fetched > REFRESH_STALE_MS).forEach(r => {
    fetchPlayer(r.player_tag)
      .then(p => { if (p && !p.notFound) updatePlayerData.run(p.name, p.bestTrophies, Date.now(), r.account_id); })
      .catch(() => {});
  });
}

module.exports = function createNuzlockeRouter({ requireAuth } = {}) {
  const router = express.Router();

  function ownAccount(req, res) {
    const row = getAccountById.get(req.params.accountId);
    if (!row || row.user_id !== String(req.twitchId)) {
      res.status(404).json({ error: "Account nicht gefunden" });
      return null;
    }
    return row;
  }

  // ── Öffentlich: Leaderboard (höchste Trophäen zuerst) ─────────────────────
  router.get("/leaderboard", (req, res) => {
    res.json(getAllAccounts.all().map(row => {
      const globalAttempts = getOrCreateGlobalAttempts(row.user_id);
      return {
        playerTag: row.player_tag,
        playerName: row.player_name || row.player_tag,
        twitchLogin: row.twitch_login || "",
        bestTrophies: row.best_trophies,
        attempts: globalAttempts,
        bannedCount: getBanCount.get(row.account_id).n,
        isActive: !!row.is_active,
        isFinished: !!row.is_finished, // <-- NEU
        deck: JSON.parse(row.deck || "[]"),
      };
    }));
  });

  // ── Eigene Accounts ────────────────────────────────────────────────────────
  router.get("/me", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    if (req.twitchLogin) updateTwitchLogin.run(String(req.twitchLogin), userId);
    const rows = getAccountsByUser.all(userId);
    refreshStaleAccounts(rows);
    res.json({ 
      accounts: rows.map(accountSummary), 
      apiConfigured: !!CR_API_TOKEN,
      globalAttempts: getOrCreateGlobalAttempts(userId) // <-- Neu: Globaler Zähler im me-Endpoint
    });
  });

  router.post("/accounts", requireAuth, async (req, res) => {
    const userId = String(req.twitchId);
    const tag = normalizeTag(req.body?.tag);
    if (!tag) return res.status(400).json({ error: "Ungültiges Spieler-Kürzel (z.B. #2PP0V9YLL)" });
    if (getAccountByTag.get(tag)) return res.status(400).json({ error: "Dieser Account ist bereits verknüpft" });

    let playerName = tag;
    let bestTrophies = 0;
    let lastFetched = 0;
    let deckStr = "[]";
    if (CR_API_TOKEN) {
      try {
        const p = await fetchPlayer(tag);
        if (p?.notFound) return res.status(404).json({ error: "Kein Spieler mit diesem Kürzel gefunden" });
        if (p) { 
          playerName = p.name || tag; 
          bestTrophies = p.bestTrophies; 
          lastFetched = Date.now(); 
          deckStr = JSON.stringify(p.currentDeck.slice(0, 8));
        }
      } catch (e) {
        return res.status(502).json({ error: "Royale API nicht erreichbar — versuche es später erneut" });
      }
    }

    const isFirst = getAccountsByUser.all(userId).length === 0;
    const accountId = nanoid(12);
    insertAccount.run(accountId, userId, String(req.twitchLogin || ""), tag, playerName, bestTrophies, deckStr, isFirst ? 1 : 0, lastFetched, Date.now());
    res.json({ ok: true, account: accountSummary(getAccountById.get(accountId)) });
  });

  router.get("/accounts/:accountId", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (row) res.json(accountDetail(row));
  });

  router.delete("/accounts/:accountId", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    db.prepare("DELETE FROM nuzlocke_banned WHERE account_id = ?").run(row.account_id);
    deleteAccountStmt.run(row.account_id);
    if (row.is_active) {
      const rest = getAccountsByUser.all(row.user_id);
      if (rest.length) activateOne.run(rest[0].account_id);
    }
    res.json({ ok: true });
  });

  router.post("/accounts/:accountId/activate", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    deactivateAll.run(row.user_id);
    activateOne.run(row.account_id);
    res.json({ ok: true });
  });

  router.put("/accounts/:accountId/deck", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    const deck = req.body?.deck;
    if (!Array.isArray(deck) || deck.length > DECK_SIZE) return res.status(400).json({ error: "Ungültiges Deck" });
    if (new Set(deck).size !== deck.length) return res.status(400).json({ error: "Doppelte Karten im Deck" });
    for (const id of deck) {
      if (!CARD_BY_ID.has(id)) return res.status(400).json({ error: `Unbekannte Karte: ${id}` });
      if (getBanByCard.get(row.account_id, id)) return res.status(400).json({ error: "Gebannte Karten können nicht ins Deck" });
    }
    updateDeck.run(JSON.stringify(deck), row.account_id);
    res.json({ ok: true, deck });
  });

  // Glücksrad: Server wählt zufällige Karte aus dem Deck
  router.post("/accounts/:accountId/spin", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    const deck = JSON.parse(row.deck || "[]");
    if (deck.length === 0) return res.status(400).json({ error: "Das Deck ist leer — füge zuerst Karten hinzu" });

    const cardId = deck[Math.floor(Math.random() * deck.length)];
    const card = CARD_BY_ID.get(cardId) || { id: cardId, name: cardId, rarity: "" };
    const entry = { entryId: nanoid(10), id: card.id, name: card.name, rarity: card.rarity || "", bannedAt: Date.now() };
    insertBan.run(entry.entryId, row.account_id, entry.id, entry.name, entry.rarity, entry.bannedAt);
    const newDeck = deck.filter(id => id !== cardId);
    updateDeck.run(JSON.stringify(newDeck), row.account_id);

    res.json({ ok: true, card: entry, deck: newDeck, banned: getBans.all(row.account_id).map(banRowToEntry) });
  });

  // Manuelles Bannen einer beliebigen Karte
  router.post("/accounts/:accountId/ban", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    const cardId = String(req.body?.cardId || "");
    if (!cardId) return res.status(400).json({ error: "Keine Karte ausgewählt" });

    if (getBanByCard.get(row.account_id, cardId)) {
      return res.status(400).json({ error: "Diese Karte ist bereits gebannt" });
    }

    const card = CARD_BY_ID.get(cardId) || { id: cardId, name: cardId, rarity: "" };
    const entry = { entryId: nanoid(10), id: card.id, name: card.name, rarity: card.rarity || "", bannedAt: Date.now() };
    insertBan.run(entry.entryId, row.account_id, entry.id, entry.name, entry.rarity, entry.bannedAt);

    // Aus dem Deck werfen, falls die gebannte Karte im Deck lag
    const deck = JSON.parse(row.deck || "[]");
    const newDeck = deck.filter(id => id !== cardId);
    updateDeck.run(JSON.stringify(newDeck), row.account_id);

    res.json({ ok: true, card: entry, deck: newDeck, banned: getBans.all(row.account_id).map(banRowToEntry) });
  });

  // Globaler Versuchszähler
  router.post("/global-attempts", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    const delta = Number(req.body?.delta) || 0;
    const current = getOrCreateGlobalAttempts(userId);
    const next = Math.max(0, current + delta);
    updateGlobalAttempts.run(next, Date.now(), userId);
    res.json({ ok: true, globalAttempts: next });
  });

  router.post("/accounts/:accountId/unban", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    const result = deleteBan.run(row.account_id, String(req.body?.entryId || ""));
    if (result.changes === 0) return res.status(404).json({ error: "Eintrag nicht gefunden" });
    res.json({ ok: true, banned: getBans.all(row.account_id).map(banRowToEntry) });
  });

  router.post("/accounts/:accountId/refresh", requireAuth, async (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    if (!CR_API_TOKEN) return res.status(400).json({ error: "Royale API ist nicht konfiguriert" });
    try {
      const p = await fetchPlayer(row.player_tag);
      if (p?.notFound) return res.status(404).json({ error: "Spieler nicht mehr gefunden" });
      if (p) {
        updatePlayerData.run(p.name, p.bestTrophies, Date.now(), row.account_id);
        const bans = getBans.all(row.account_id).map(b => b.card_id);
        const validDeck = p.currentDeck.filter(id => !bans.includes(id)).slice(0, 8);
        updateDeck.run(JSON.stringify(validDeck), row.account_id);
      }
      res.json({ ok: true, account: accountDetail(getAccountById.get(row.account_id)) });
    } catch (e) {
      res.status(502).json({ error: "Royale API nicht erreichbar" });
    }
  });
  
  // Run final beenden
  router.post("/accounts/:accountId/finish", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    toggleFinishAccountStmt.run(row.account_id);
    res.json({ ok: true });
  });

  return router;
};