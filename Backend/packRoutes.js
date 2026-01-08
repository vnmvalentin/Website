// backend/packRoutes.js
const express = require("express");
const fs = require("fs");
const path = require("path");

// DATEI-PFADE
const CARDS_DEF_PATH = path.join(__dirname, "cards-def.json");
const CARDS_USER_DB_PATH = path.join(__dirname, "cards-users.json");
const CARD_SUGGESTIONS_PATH = path.join(__dirname, "card-suggestions.json");
const CARDS_USER_BACKUP_DIR = path.join(__dirname, "cards-users-backups");
const CASINO_DB_PATH = path.join(__dirname, "casinoData.json");

// KONFIGURATION
const PACK_PRICE = 500; 

// Credits-Werte für Verkauf
const REFUND_VALUES = {
  common: 10,
  uncommon: 25,
  rare: 50,
  "very-rare": 100,
  mythic: 250,
  secret: 500,
  legendary: 2500
};

const ACHIEVEMENT_REWARDS = {
  "first_blood": 100,
  "collector_100": 1000,
  "mythic_full": 2000,
  "secret_full": 5000,
  "legend_found": 5000,
  "ultimate_collector": 25000,
  "collection_natur": 1500,
  "collection_bestie": 1500,
  "collection_drache": 1500,
  "collection_dunkelheit": 1500,
  "collection_cyber": 1500,
  "collection_magie": 1500,
  "collection_ozean": 1500,
  "collection_himmel": 1500,
  "collection_mechanisch": 1500,
  "collection_kristall": 1500,
  "collection_hoelle": 1500,
  "collection_wueste": 1500,
  "collection_untergrund": 1500
};

// HELPER
function loadCasinoDb() { try { if (!fs.existsSync(CASINO_DB_PATH)) return {}; return JSON.parse(fs.readFileSync(CASINO_DB_PATH, "utf8")); } catch (e) { return {}; } }
function saveCasinoDb(db) { try { fs.writeFileSync(CASINO_DB_PATH, JSON.stringify(db, null, 2), "utf8"); } catch (e) {} }
function loadCardsDef() { try { if (!fs.existsSync(CARDS_DEF_PATH)) return []; return JSON.parse(fs.readFileSync(CARDS_DEF_PATH, "utf8")); } catch (e) { return []; } }
function loadUserCardsDb() { try { if (!fs.existsSync(CARDS_USER_DB_PATH)) return {}; return JSON.parse(fs.readFileSync(CARDS_USER_DB_PATH, "utf8")); } catch (e) { return {}; } }
function saveUserCardsDb(db) { try { fs.writeFileSync(CARDS_USER_DB_PATH, JSON.stringify(db, null, 2), "utf8"); } catch (e) {} }
function loadCardSuggestions() { try { if (!fs.existsSync(CARD_SUGGESTIONS_PATH)) return []; return JSON.parse(fs.readFileSync(CARD_SUGGESTIONS_PATH, "utf8")); } catch (e) { return []; } }
function saveCardSuggestions(list) { try { fs.writeFileSync(CARD_SUGGESTIONS_PATH, JSON.stringify(list, null, 2), "utf8"); } catch (e) {} }

const RARITY_ORDER = ["common", "uncommon", "rare", "very-rare", "mythic", "secret", "legendary"];
const RARITY_WEIGHTS = { common: 55, uncommon: 22, rare: 15, "very-rare": 8, mythic: 3.5, secret: 0.8, legendary: 0.1 };
const PACK_SIZE = 4;

function ensureUserCardsEntry(db, twitchId) {
  const id = String(twitchId);
  if (!db[id]) {
    db[id] = {
      twitchId: id,
      twitchLogin: "",
      owned: {},
      gallery: [],
      galleryPublished: false,
      lastPack: null,
      claimedAchievements: [] 
    };
  }
  if (!db[id].claimedAchievements) db[id].claimedAchievements = [];
  return db[id];
}

function pickRarityRandom() {
  const entries = Object.entries(RARITY_WEIGHTS);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [rarity, weight] of entries) {
    if (r < weight) return rarity;
    r -= weight;
  }
  return "common";
}

function sortByRarityIncreasing(cards) {
  return [...cards].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
}

// Check Logic für Achievements
function checkAchievement(achId, allOwnedCards, ownedStats) {
    const defs = loadCardsDef(); 
    
    if (achId === "first_blood") return ownedStats.totalOwned > 0;
    if (achId === "collector_100") return ownedStats.uniqueOwned >= 100;
    if (achId === "ultimate_collector") return ownedStats.uniqueOwned >= defs.length && defs.length > 0;
    if (achId === "legend_found") return allOwnedCards.some(c => c.rarity === "legendary" && c.count > 0);
    
    if (achId === "mythic_full") {
        const mythics = defs.filter(c => c.rarity === "mythic");
        if (mythics.length === 0) return false;
        return mythics.every(m => allOwnedCards.some(owned => owned.id === m.id && owned.count > 0));
    }
    if (achId === "secret_full") {
        const secrets = defs.filter(c => c.rarity === "secret");
        if (secrets.length === 0) return false;
        return secrets.every(s => allOwnedCards.some(owned => owned.id === s.id && owned.count > 0));
    }
    
    if (achId.startsWith("collection_")) {
        const typeId = achId.replace("collection_", "");
        const TYPE_RANGES = {
            "natur": [1, 50], "bestie": [51, 100], "drache": [101, 150],
            "dunkelheit": [151, 200], "cyber": [201, 250], "magie": [251, 300],
            "ozean": [301, 350], "himmel": [351, 400], "mechanisch": [401, 450],
            "kristall": [451, 500], "hoelle": [501, 550], "wueste": [551, 600],
            "untergrund": [601, 650]
        };
        const range = TYPE_RANGES[typeId];
        if (!range) return false;
        
        const cardsInType = defs.filter(c => {
            const num = parseInt(c.number || "0", 10);
            return num >= range[0] && num <= range[1];
        });
        if (cardsInType.length === 0) return false;
        return cardsInType.every(target => allOwnedCards.some(owned => owned.id === target.id && owned.count > 0));
    }
    return false;
}

module.exports = function createPackRouter({ requireAuth, ADMIN_PW: ADMIN_PW_IN, STREAMER_TWITCH_ID: STREAMER_TWITCH_ID_IN } = {}) {
  const router = express.Router();
  const ADMIN_PW = typeof ADMIN_PW_IN === "string" ? ADMIN_PW_IN : (process.env.ADMIN_PW || "");
  const STREAMER_TWITCH_ID = (STREAMER_TWITCH_ID_IN ?? process.env.STREAMER_TWITCH_ID) || "";

  router.get("/cards/all", (req, res) => {
    res.json(loadCardsDef());
  });

  // GET USER DATA + ACHIEVEMENT CHECK
  router.get("/cards/user/:twitchId", requireAuth, (req, res) => {
    const authId = String(req.twitchId);
    const twitchId = String(req.params.twitchId);
    if (authId !== twitchId) return res.status(403).json({ error: "Forbidden" });

    let cardsDb = loadUserCardsDb();
    const userEntry = ensureUserCardsEntry(cardsDb, twitchId);
    userEntry.twitchLogin = String(req.twitchLogin || userEntry.twitchLogin || "");
    saveUserCardsDb(cardsDb);

    const casinoDb = loadCasinoDb();
    const casinoUser = casinoDb[twitchId] || { credits: 0, lastDaily: 0 };

    const defs = loadCardsDef();
    const ownedArray = defs.map((card) => ({
      ...card,
      count: userEntry.owned[card.id] || 0,
    }));

    // --- Achievements Status ---
    const claimed = userEntry.claimedAchievements || [];
    const stats = {
        totalOwned: ownedArray.reduce((acc, c) => acc + c.count, 0),
        uniqueOwned: ownedArray.filter(c => c.count > 0).length
    };
    
    let achievementsReadyToClaim = 0;
    for (const achId of Object.keys(ACHIEVEMENT_REWARDS)) {
        if (!claimed.includes(achId)) {
            if (checkAchievement(achId, ownedArray, stats)) {
                achievementsReadyToClaim++;
            }
        }
    }

    let lastPack = null;
    if (userEntry.lastPack) {
      if (Array.isArray(userEntry.lastPack.cards)) {
        lastPack = userEntry.lastPack;
      } else if (Array.isArray(userEntry.lastPack.cardIds)) {
        const cardsById = new Map(defs.map((c) => [c.id, c]));
        const newSet = new Set(userEntry.lastPack.newCardIds || []);
        const cards = userEntry.lastPack.cardIds
          .map((id) => {
            const base = cardsById.get(id);
            if (!base) return null;
            return { ...base, isNew: newSet.has(id) };
          })
          .filter(Boolean);
        lastPack = { openedAt: userEntry.lastPack.openedAt || 0, cards };
      }
    }

    res.json({
      twitchId,
      twitchLogin: userEntry.twitchLogin,
      galleryPublished: !!userEntry.galleryPublished,
      gallery: userEntry.gallery || [],
      owned: ownedArray,
      lastPack,
      credits: casinoUser.credits || 0,
      lastDaily: casinoUser.lastDaily || 0,
      packPrice: PACK_PRICE,
      claimedAchievements: claimed,
      achievementsReadyToClaim 
    });
  });

  // PACK KAUFEN (KEIN Refund hier, nur Karten sammeln)
  router.post("/cards/open-pack/:twitchId", requireAuth, (req, res) => {
    const authId = String(req.twitchId);
    const twitchId = String(req.params.twitchId);
    if (authId !== twitchId) return res.status(403).json({ error: "Forbidden" });

    const casinoDb = loadCasinoDb();
    if (!casinoDb[twitchId]) {
      casinoDb[twitchId] = { credits: 0, lastDaily: 0 };
    }
    const userCredits = casinoDb[twitchId].credits || 0;

    if (userCredits < PACK_PRICE) {
      return res.status(400).json({ error: "Nicht genug Credits!", credits: userCredits });
    }

    const defs = loadCardsDef();
    if (!defs.length) return res.status(500).json({ error: "Keine Karten definiert" });

    const packCards = [];
    for (let i = 0; i < PACK_SIZE; i++) {
      const rarity = pickRarityRandom();
      const pool = defs.filter((c) => c.rarity === rarity);
      if (!pool.length) packCards.push(defs[Math.floor(Math.random() * defs.length)]);
      else packCards.push(pool[Math.floor(Math.random() * pool.length)]);
    }

    const sortedPack = sortByRarityIncreasing(packCards);

    let cardsDb = loadUserCardsDb();
    const userCardEntry = ensureUserCardsEntry(cardsDb, twitchId);
    userCardEntry.twitchLogin = String(req.twitchLogin || userCardEntry.twitchLogin || "");

    const newCardIds = [];

    // HIER GEÄNDERT: Kein Refund mehr, nur Zähler hoch
    for (const card of sortedPack) {
      const prevCount = userCardEntry.owned[card.id] || 0;
      if (prevCount === 0) {
        newCardIds.push(card.id);
        userCardEntry.owned[card.id] = 1;
      } else {
        // Karte einfach addieren -> erlaubt späteres Verkaufen im Album
        userCardEntry.owned[card.id] += 1;
      }
    }

    userCardEntry.lastPack = {
      openedAt: Date.now(),
      cardIds: sortedPack.map((c) => c.id),
      newCardIds,
    };

    saveUserCardsDb(cardsDb);

    // Vollen Preis abziehen
    casinoDb[twitchId].credits = userCredits - PACK_PRICE;
    saveCasinoDb(casinoDb);

    const cardsWithNewFlag = sortedPack.map((c) => ({
      ...c,
      isNew: newCardIds.includes(c.id),
    }));

    res.json({
      twitchId,
      openedAt: Date.now(),
      cards: cardsWithNewFlag,
      lastPack: userCardEntry.lastPack,
      credits: casinoDb[twitchId].credits,
      packPrice: PACK_PRICE,
      refundAmount: 0 // Immer 0 hier
    });
  });

  // ALTE DUPLIKATE VERKAUFEN (Trade-In)
  router.post("/cards/sell-duplicates/:twitchId", requireAuth, (req, res) => {
      const authId = String(req.twitchId);
      const twitchId = String(req.params.twitchId);
      if (authId !== twitchId) return res.status(403).json({ error: "Forbidden" });

      const defs = loadCardsDef();
      const byId = new Map(defs.map(c => [c.id, c]));

      let cardsDb = loadUserCardsDb();
      const userEntry = ensureUserCardsEntry(cardsDb, twitchId);
      
      let totalRefund = 0;
      let soldCount = 0;

      for (const [cardId, count] of Object.entries(userEntry.owned)) {
          if (count > 1) {
              const cardDef = byId.get(cardId);
              if (!cardDef) continue;
              
              const rarity = cardDef.rarity || "common";
              const valuePerCard = REFUND_VALUES[rarity] || 5;
              const toSell = count - 1;

              totalRefund += (toSell * valuePerCard);
              soldCount += toSell;
              userEntry.owned[cardId] = 1; // Reset auf 1
          }
      }

      if (soldCount === 0) {
          return res.status(400).json({ error: "Keine doppelten Karten vorhanden." });
      }

      saveUserCardsDb(cardsDb);

      const casinoDb = loadCasinoDb();
      if (!casinoDb[twitchId]) casinoDb[twitchId] = { credits: 0, lastDaily: 0 };
      casinoDb[twitchId].credits += totalRefund;
      saveCasinoDb(casinoDb);

      res.json({ 
          ok: true, 
          soldCount, 
          creditsEarned: totalRefund, 
          newCredits: casinoDb[twitchId].credits 
      });
  });

  // CLAIM ACHIEVEMENT
  router.post("/cards/achievement/claim/:twitchId", requireAuth, (req, res) => {
      const authId = String(req.twitchId);
      const twitchId = String(req.params.twitchId);
      if (authId !== twitchId) return res.status(403).json({ error: "Forbidden" });

      const { achievementId } = req.body;
      if (!achievementId) return res.status(400).json({ error: "Missing ID" });

      let cardsDb = loadUserCardsDb();
      const userEntry = ensureUserCardsEntry(cardsDb, twitchId);
      
      if (userEntry.claimedAchievements.includes(achievementId)) {
          return res.status(400).json({ error: "Bereits abgeholt!" });
      }

      const defs = loadCardsDef();
      const ownedArray = defs.map((card) => ({
        ...card,
        count: userEntry.owned[card.id] || 0,
      }));
      const stats = {
          totalOwned: ownedArray.reduce((acc, c) => acc + c.count, 0),
          uniqueOwned: ownedArray.filter(c => c.count > 0).length
      };

      const isDone = checkAchievement(achievementId, ownedArray, stats);
      if (!isDone) {
          return res.status(400).json({ error: "Achievement noch nicht erreicht!" });
      }

      const reward = ACHIEVEMENT_REWARDS[achievementId] || 100;
      
      const casinoDb = loadCasinoDb();
      if (!casinoDb[twitchId]) casinoDb[twitchId] = { credits: 0, lastDaily: 0 };
      
      casinoDb[twitchId].credits += reward;
      userEntry.claimedAchievements.push(achievementId);

      saveCasinoDb(casinoDb);
      saveUserCardsDb(cardsDb);

      res.json({ 
          ok: true, 
          credits: casinoDb[twitchId].credits,
          claimedId: achievementId,
          reward
      });
  });
  
  router.all("/cards/admin/add-credits", (req, res) => {
    const data = { ...req.query, ...req.body };
    const { adminPw, twitchId, amount } = data;
    const serverPw = process.env.ADMIN_PW || ADMIN_PW;
    if (!adminPw || adminPw !== serverPw) return res.status(401).json({ error: "Unauthorized" });
    if (!twitchId) return res.status(400).json({ error: "Missing twitchId" });
    const delta = parseInt(amount, 10);
    if (!Number.isFinite(delta)) return res.status(400).json({ error: "Invalid amount" });
    const casinoDb = loadCasinoDb();
    if (!casinoDb[twitchId]) casinoDb[twitchId] = { credits: 0, lastDaily: 0 };
    casinoDb[twitchId].credits = Math.max(0, (casinoDb[twitchId].credits || 0) + delta);
    saveCasinoDb(casinoDb);
    res.json({ twitchId, credits: casinoDb[twitchId].credits, added: delta });
  });

  router.get("/card-suggestions", (req, res) => {
    const list = loadCardSuggestions();
    const usersDb = loadUserCardsDb();
    let changed = false;
    for (const s of list) {
      if (!s.authorTwitchLogin && s.authorTwitchId) {
        const u = usersDb[String(s.authorTwitchId)];
        if (u?.twitchLogin) { s.authorTwitchLogin = String(u.twitchLogin); changed = true; }
      }
    }
    if (changed) saveCardSuggestions(list);
    const sorted = [...list].sort((a, b) => (b.votes || 0) - (a.votes || 0) || (b.createdAt || 0) - (a.createdAt || 0));
    res.json(sorted.map((s) => ({ ...s, authorName: s.authorTwitchLogin || s.authorTwitchId || "unknown" })));
  });

  router.post("/card-suggestions", requireAuth, (req, res) => {
    const twitchId = String(req.twitchId);
    const { name, type, rarity, description } = req.body || {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "Invalid name" });
    let authorLogin = String(req.twitchLogin || "").trim();
    if (!authorLogin) {
      const usersDb = loadUserCardsDb();
      const u = usersDb[twitchId];
      if (u?.twitchLogin) authorLogin = String(u.twitchLogin).trim();
    }
    const now = Date.now();
    const list = loadCardSuggestions();
    const suggestion = {
      id: now.toString(),
      name: name.trim(),
      type: typeof type === "string" ? type.trim() : "",
      rarity: typeof rarity === "string" ? rarity.trim() : "",
      description: typeof description === "string" ? description.trim() : "",
      votes: 0,
      createdAt: now,
      authorTwitchId: twitchId,
      authorTwitchLogin: authorLogin,
    };
    list.push(suggestion);
    saveCardSuggestions(list);
    res.status(201).json(suggestion);
  });

  router.post("/card-suggestions/:id/vote", requireAuth, (req, res) => {
    const { id } = req.params;
    const { delta } = req.body || {};
    const d = Number(delta);
    if (!Number.isFinite(d) || ![1, -1].includes(d)) return res.status(400).json({ error: "Invalid vote" });
    const twitchId = String(req.twitchId);
    const list = loadCardSuggestions();
    const idx = list.findIndex((s) => String(s.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const suggestion = list[idx];
    if (!suggestion.voters) suggestion.voters = {};
    const prev = Number(suggestion.voters[twitchId] || 0);
    if (prev === d) return res.json(suggestion);
    suggestion.votes = (suggestion.votes || 0) - prev + d;
    suggestion.voters[twitchId] = d;
    list[idx] = suggestion;
    saveCardSuggestions(list);
    res.json(suggestion);
  });

  router.delete("/card-suggestions/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const authId = String(req.twitchId);
    if (authId !== STREAMER_TWITCH_ID) return res.status(403).json({ error: "Admin only" });
    const list = loadCardSuggestions();
    const updated = list.filter((s) => String(s.id) !== String(id));
    saveCardSuggestions(updated);
    res.json({ ok: true });
  });

  router.put("/cards/user/:twitchId/gallery", requireAuth, (req, res) => {
    const authId = String(req.twitchId);
    const twitchId = String(req.params.twitchId);
    if (authId !== twitchId) return res.status(403).json({ error: "Forbidden" });
    const raw = Array.isArray(req.body?.gallery) ? req.body.gallery : [];
    const ids = [...new Set(raw.map((x) => String(x)).filter(Boolean))];
    if (ids.length > 10) return res.status(400).json({ error: "Max 10 cards" });
    const defs = loadCardsDef();
    const validIds = new Set(defs.map((c) => String(c.id)));
    let db = loadUserCardsDb();
    const user = ensureUserCardsEntry(db, twitchId);
    for (const id of ids) {
      if (!validIds.has(id) || !user.owned?.[id]) return res.status(400).json({ error: "Invalid/Not owned" });
    }
    user.gallery = ids;
    saveUserCardsDb(db);
    res.json({ ok: true, gallery: user.gallery });
  });

  router.put("/cards/user/:twitchId/gallery/publish", requireAuth, (req, res) => {
    const authId = String(req.twitchId);
    const twitchId = String(req.params.twitchId);
    if (authId !== twitchId) return res.status(403).json({ error: "Forbidden" });
    const published = !!req.body?.published;
    let db = loadUserCardsDb();
    const user = ensureUserCardsEntry(db, twitchId);
    user.galleryPublished = published;
    saveUserCardsDb(db);
    res.json({ ok: true, galleryPublished: user.galleryPublished });
  });

  function normalizeLogin(s) { return String(s || "").trim().toLowerCase(); }

  router.get("/cards/gallery/:twitchLogin", (req, res) => {
    const login = normalizeLogin(req.params.twitchLogin);
    if (!login) return res.status(400).json({ error: "Missing login" });
    const db = loadUserCardsDb();
    const user = Object.values(db).find((u) => normalizeLogin(u?.twitchLogin) === login);
    if (!user || !user.galleryPublished) return res.status(404).json({ error: "Not found" });
    const defs = loadCardsDef();
    const byId = new Map(defs.map((c) => [String(c.id), c]));
    const cards = (user.gallery || []).map((id) => byId.get(String(id))).filter(Boolean);
    res.json({ twitchLogin: user.twitchLogin || login, cards });
  });

  router.get("/cards/galleries", (req, res) => {
    const db = loadUserCardsDb();
    const defs = loadCardsDef();
    const byId = new Map(defs.map((c) => [String(c.id), c]));
    const galleries = Object.values(db)
      .filter((u) => u && u.galleryPublished && u.twitchLogin)
      .map((u) => {
        const cards = (u.gallery || []).map((id) => byId.get(String(id))).filter(Boolean);
        return { twitchLogin: u.twitchLogin, cardsCount: cards.length, previewCards: cards.slice(0, 3) };
      })
      .sort((a, b) => a.twitchLogin.localeCompare(b.twitchLogin, "de"));
    res.json({ galleries });
  });

  return router;
};