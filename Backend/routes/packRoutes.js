// backend/packRoutes.js
const express = require("express");
const fs = require("fs");
const path = require("path");

// DATEI-PFADE
const CARDS_DEF_PATH = path.join(__dirname, "../data/cards-def.json");
const CARDS_USER_DB_PATH = path.join(__dirname, "../data/cards-users.json");
const CARD_SUGGESTIONS_PATH = path.join(__dirname, "../data/card-suggestions.json");
const CARDS_USER_BACKUP_DIR = path.join(__dirname, "../data/cards-users-backups");
const CASINO_DB_PATH = path.join(__dirname, "../data/casinoData.json");

// --- NEUE KONFIGURATION ---
const PACK_PRICE = 250; // Neuer günstigerer Preis

// ALTE Refund-Werte (NUR für das Migrations-Skript, damit niemand Coins verliert)
const OLD_REFUND_VALUES = {
  common: 10, uncommon: 25, rare: 50, "very-rare": 100, mythic: 250, secret: 500, legendary: 2500
};

const MAX_BANK_DAYS = 5;

// --- NEUE IDLE & CRAFTING KONSTANTEN ---
const IDLE_BASE_RATES = {
  common: 10,       // 10 Coins / Tag
  uncommon: 20,
  rare: 35,
  epic: 50,
  mythic: 100,
  legendary: 250,     
};

// Spezifische Set-Boni (IDs der Katzen anpassen, falls nötig!)
const CAT_SETS = [
    { id: "heroes", name: "Die Helden", cats: ["13", "50", "51"], bonus: 100 },
    { id: "elements", name: "Elemente", cats: ["25", "70", "71"], bonus: 100 },
    { id: "heavenhell", name: "Himmel & Hölle", cats: ["43", "44"], bonus: 200 },
    { id: "sweet", name: "Süße Katzen", cats: ["75", "77", "74"], bonus: 250 },
    { id: "gems", name: "Edelsteine", cats: ["73", "40", "79"], bonus: 300 },
    { id: "dn", name: "Tag & Nacht", cats: ["48", "63"], bonus: 500 },
    { id: "yy", name: "Yin & Yang", cats: ["67", "68"], bonus: 1500},
    { id: "flower", name: "Flowerpower", cats: ["32", "34", "57", "82"], bonus: 1500 }
];

const LEVEL_MULTIPLIERS = [1.0, 1.4, 1.9, 2.5, 3.2]; // Level 1 bis 5

function calculateIdleRate(equippedIds, levels, defs) {
    if (!equippedIds || equippedIds.length === 0) return { base: 0, total: 0, setBonusTotal: 0, activeSets: [] };
    
    let baseRate = 0;
    
    equippedIds.forEach(id => {
       const def = defs.find(c => String(c.id) === String(id));
       if (def) {
           const base = IDLE_BASE_RATES[def.rarity] || 10;
           const lvl = levels[id] || 1;
           const multiplier = LEVEL_MULTIPLIERS[lvl - 1] || 1.0; // Holt den passenden Multiplikator
           baseRate += (base * multiplier);
       }
    });

    let setBonusTotal = 0;
    let activeSets = [];

    // Prüfe alle Sets
    CAT_SETS.forEach(set => {
        const hasAllCats = set.cats.every(catId => equippedIds.includes(String(catId)));
        if (hasAllCats) {
            setBonusTotal += set.bonus;
            activeSets.push(set.id);
        }
    });

    const totalRate = Math.floor(baseRate + setBonusTotal);

    return { 
        base: Math.floor(baseRate), 
        total: totalRate, 
        setBonusTotal, 
        activeSets 
    };
}

// Crafting Kosten abhängig von der Seltenheit
const CRAFT_COSTS = {
    common:    { dupes: [3, 4, 5, 6], coins: [50, 100, 200, 400] },
    uncommon:  { dupes: [2, 3, 4, 5], coins: [100, 250, 500, 1000] },
    rare:      { dupes: [2, 3, 3, 4], coins: [250, 500, 1000, 2000] },
    epic:      { dupes: [1, 2, 2, 3], coins: [500, 1000, 2500, 5000] },
    mythic:    { dupes: [1, 1, 2, 2], coins: [1000, 2500, 5000, 10000] },
    legendary: { dupes: [1, 1, 1, 1], coins: [5000, 10000, 25000, 50000] }, 
};

function getUpgradeCost(currentLevel, rarity) {
    if (currentLevel >= 5) return null;
    const rarityCosts = CRAFT_COSTS[rarity] || CRAFT_COSTS.common;
    const index = currentLevel - 1;
    return {
        dupes: rarityCosts.dupes[index],
        coins: rarityCosts.coins[index]
    };
}


// NEUE Achievements (Mit Platzhaltern für Fische und Farben)
const ACHIEVEMENT_REWARDS = {
  "first_blood": { coins: 100 },
  "collector_50": { coins: 500, color: "blue" },
  "collector_75": { coins: 1000, fish: "rainbow" },
  "epic_found": { coins: 500 },
  "mythic_found": { coins: 1000, color: "purple" },
  "legend_found": { coins: 5000, fish: "sharky" },
  "ultimate_collector": { coins: 25000, fish: "orca", color: "rainbow-animated" },
};

// --- Helper: JSON ---
function loadJson(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) { return {}; }
}

function loadCardsDef() {
  try {
    if (!fs.existsSync(CARDS_DEF_PATH)) return [];
    return JSON.parse(fs.readFileSync(CARDS_DEF_PATH, "utf8"));
  } catch (e) { return []; }
}

function loadUserCardsDb() {
  try {
    if (!fs.existsSync(CARDS_USER_DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(CARDS_USER_DB_PATH, "utf8"));
  } catch (e) { return {}; }
}

function saveUserCardsDb(data) {
  try {
    fs.writeFileSync(CARDS_USER_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) { console.error("Konnte User-Cards DB nicht speichern", e); }
}

// Backup-Helper
function backupUserCardsDb() {
  try {
    if (!fs.existsSync(CARDS_USER_BACKUP_DIR)) {
      fs.mkdirSync(CARDS_USER_BACKUP_DIR, { recursive: true });
    }
    
    // Fester Dateiname, damit das Backup immer überschrieben wird
    const dest = path.join(CARDS_USER_BACKUP_DIR, "cards-users-backup.json");
    
    if (fs.existsSync(CARDS_USER_DB_PATH)) {
      fs.copyFileSync(CARDS_USER_DB_PATH, dest);
    }
  } catch (e) { console.error("Backup failed", e); }
}

// Jeden Tag um 4 Uhr morgens Backup
setInterval(() => {
  const h = new Date().getHours();
  if (h === 4) backupUserCardsDb();
}, 1000 * 60 * 60);

// ==========================================
// ROUTER EXPORT
// ==========================================
module.exports = function createPackRouter({ requireAuth, wss }) {
  const router = express.Router();

  // --- MIGRATIONS-SKRIPT ---
  router.post("/cards/admin/migrate-to-cats", requireAuth, (req, res) => {
    const STREAMER_ID = "160224748";
    if (req.twitchId !== STREAMER_ID) return res.status(403).json({ error: "Admin only" });

    backupUserCardsDb();
    const userDb = loadUserCardsDb();
    const casinoDb = loadJson(CASINO_DB_PATH);
    const defs = loadCardsDef();

    const getOldRarity = (cardId) => {
        const card = defs.find(c => c.id === cardId);
        return card ? card.rarity : "common"; 
    };

    let totalRefunded = 0, usersRefunded = 0;

    for (const [userId, userData] of Object.entries(userDb)) {
        let userTotalValue = 0;
        if (userData.owned) {
            for (const [cardId, amount] of Object.entries(userData.owned)) {
                const rarity = getOldRarity(cardId);
                const cardValue = OLD_REFUND_VALUES[rarity] || 10;
                userTotalValue += (amount * cardValue);
            }
        }
        if (userTotalValue > 0) {
            if (!casinoDb[userId]) casinoDb[userId] = { credits: 0, name: userData.twitchLogin || userId };
            casinoDb[userId].credits += userTotalValue;
            totalRefunded += userTotalValue;
            usersRefunded++;
        }

        // RESET & SETUP NEUES IDLE SYSTEM
        userDb[userId].owned = {};
        userDb[userId].claimedAchievements = [];
        // Neue Idle-Felder:
        userDb[userId].equipped = [];
        userDb[userId].cardLevels = {};
        userDb[userId].lastClaimed = Date.now();
        
        // Müll löschen
        delete userDb[userId].gallery;
        delete userDb[userId].galleryPublished;
        delete userDb[userId].lastPack; 
        delete userDb[userId].packTokens;        
        delete userDb[userId].lastTokenEarnedAt; 
    }
    saveUserCardsDb(userDb);
    fs.writeFileSync(CASINO_DB_PATH, JSON.stringify(casinoDb, null, 2), "utf8");
    res.json({ success: true, message: `Refunded: ${totalRefunded} Coins to ${usersRefunded} Users. Idle System initialized.` });
  });

  // --- KARTEN & USER LADEN ---
  router.get("/cards/def", (req, res) => res.json(loadCardsDef()));

  router.get("/cards/user", requireAuth, (req, res) => {
    const db = loadUserCardsDb();
    const user = db[req.twitchId] || { 
        owned: {}, equipped: [], cardLevels: {}, lastClaimed: Date.now(), claimedAchievements: [], unclaimedCoins: 0 
    };
    res.json(user);
  });

  // --- PACK ÖFFNEN (wie zuvor) ---
  router.post("/cards/open", requireAuth, (req, res) => {
    const casinoDb = loadJson(CASINO_DB_PATH);
    const cUser = casinoDb[req.twitchId];
    const userCredits = cUser ? cUser.credits : 0;
    const cardsDb = loadUserCardsDb();
    
    if (!cardsDb[req.twitchId]) {
      cardsDb[req.twitchId] = {
        twitchId: req.twitchId, twitchLogin: req.twitchLogin,
        owned: {}, equipped: [], cardLevels: {}, lastClaimed: Date.now(), claimedAchievements: []
      };
    }
    const userCards = cardsDb[req.twitchId];
    userCards.twitchLogin = req.twitchLogin; 

    if (userCredits < PACK_PRICE) return res.status(400).json({ error: "Zu wenig Credits" });
    casinoDb[req.twitchId].credits -= PACK_PRICE;
    fs.writeFileSync(CASINO_DB_PATH, JSON.stringify(casinoDb, null, 2));

    const defs = loadCardsDef();
    if (defs.length === 0) return res.status(500).json({ error: "Keine Karten-Definitionen" });

    const rarityPools = { common: [], uncommon: [], rare: [], epic: [], mythic: [], legendary: [] };
    for (const c of defs) {
      if (rarityPools[c.rarity]) rarityPools[c.rarity].push(c);
      else rarityPools.common.push(c);
    }

    function getRandomCard() {
      const r = Math.random() * 100;
      let rarity = "common";
      if (r < 0.05) rarity = "legendary";
      else if (r < 3.0) rarity = "mythic";
      else if (r < 15.0) rarity = "epic";
      else if (r < 30.0) rarity = "rare";
      else if (r < 65.0) rarity = "uncommon";

      const pool = rarityPools[rarity] && rarityPools[rarity].length > 0 ? rarityPools[rarity] : rarityPools.common;
      if (pool.length === 0) return defs[Math.floor(Math.random() * defs.length)];
      return pool[Math.floor(Math.random() * pool.length)];
    }

    const pulled = [];
    for (let i = 0; i < 3; i++) pulled.push(getRandomCard());

    if (!userCards.owned) userCards.owned = {};
    for (const c of pulled) {
      userCards.owned[c.id] = (userCards.owned[c.id] || 0) + 1;
    }

    userCards.lastPack = { openedAt: Date.now(), cardIds: pulled.map((c) => c.id) };
    saveUserCardsDb(cardsDb);

    res.json({ ok: true, newCredits: userCredits - PACK_PRICE, cards: pulled });
  });

  // --- NEUE ACHIEVEMENT ROUTE (Unterstützt Fische & Farben) ---
  router.post("/cards/achievements/claim", requireAuth, (req, res) => {
    const { achId } = req.body;
    const db = loadUserCardsDb();
    if (!db[req.twitchId]) return res.status(400).json({ error: "Kein User" });
    const user = db[req.twitchId];

    if (!user.claimedAchievements) user.claimedAchievements = [];
    if (user.claimedAchievements.includes(achId)) return res.status(400).json({ error: "Bereits abgeholt" });

    const reward = ACHIEVEMENT_REWARDS[achId];
    if (!reward) return res.status(400).json({ error: "Unbekanntes Achievement" });

    // (Die Validierung, ob er es wirklich verdient hat, geschieht sicherheitshalber im Frontend, 
    // aber wir nehmen es hier für den Moment als valide an)
    user.claimedAchievements.push(achId);
    saveUserCardsDb(db);

    const casinoDb = loadJson(CASINO_DB_PATH);
    if (!casinoDb[req.twitchId]) casinoDb[req.twitchId] = { credits: 0, name: req.twitchLogin };
    
    const coinsEarned = reward.coins || 0;
    if (coinsEarned > 0) {
        casinoDb[req.twitchId].credits += coinsEarned;
        fs.writeFileSync(CASINO_DB_PATH, JSON.stringify(casinoDb, null, 2));
    }
    
    res.json({ 
        ok: true, 
        reward: coinsEarned, 
        unlockedFish: reward.fish || null,
        unlockedColor: reward.color || null,
        claimed: user.claimedAchievements 
    });
  });

  // --- GALERIE ROUTEN (Bleiben gleich) ---
  router.post("/cards/gallery", requireAuth, (req, res) => {
    const { cardIds } = req.body;
    if (!Array.isArray(cardIds) || cardIds.length > 10) return res.status(400).json({ error: "Max 10 Karten" });

    const db = loadUserCardsDb();
    if (!db[req.twitchId]) db[req.twitchId] = { owned: {}, gallery: [] };
    const user = db[req.twitchId];

    for (const id of cardIds) {
      if (!user.owned[id] || user.owned[id] < 1) return res.status(400).json({ error: "Du besitzt nicht alle dieser Karten." });
    }

    user.gallery = cardIds;
    user.twitchLogin = req.twitchLogin; 
    saveUserCardsDb(db);
    res.json({ ok: true, gallery: user.gallery });
  });

  router.post("/cards/gallery/publish", requireAuth, (req, res) => {
    const { published } = req.body;
    const db = loadUserCardsDb();
    if (!db[req.twitchId]) return res.status(400).json({ error: "Kein Profil" });
    const user = db[req.twitchId];
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
        return { twitchLogin: u.twitchLogin, preview: cards.slice(0, 3) };
      });
    res.json({ galleries });
  });

  // --- VORSCHLÄGE (Bleiben gleich) ---
  router.get("/cards/suggestions", (req, res) => {
    try {
      if (!fs.existsSync(CARD_SUGGESTIONS_PATH)) return res.json([]);
      res.json(JSON.parse(fs.readFileSync(CARD_SUGGESTIONS_PATH, "utf8")));
    } catch (e) { res.json([]); }
  });

  router.post("/cards/suggestions", requireAuth, (req, res) => {
    const { title, description, category, rarity } = req.body;
    if (!title || !category || !rarity) return res.status(400).json({ error: "Pflichtfelder fehlen" });
    let suggestions = [];
    try {
      if (fs.existsSync(CARD_SUGGESTIONS_PATH)) {
        suggestions = JSON.parse(fs.readFileSync(CARD_SUGGESTIONS_PATH, "utf8"));
      }
    } catch (e) {}

    const newSuggestion = {
      id: "sugg-" + Date.now(),
      title,
      description,
      category,
      rarity,
      authorTwitchId: req.twitchId,
      authorTwitchLogin: req.twitchLogin,
      createdAt: Date.now(),
      votes: {}
    };
    suggestions.push(newSuggestion);
    fs.writeFileSync(CARD_SUGGESTIONS_PATH, JSON.stringify(suggestions, null, 2), "utf8");
    res.json({ ok: true, suggestion: newSuggestion });
  });

  router.delete("/cards/suggestions/:id", requireAuth, (req, res) => {
    const STREAMER_ID = "160224748";
    if (req.twitchId !== STREAMER_ID) return res.status(403).json({ error: "Only streamer" });
    let suggestions = [];
    try {
      if (fs.existsSync(CARD_SUGGESTIONS_PATH)) {
        suggestions = JSON.parse(fs.readFileSync(CARD_SUGGESTIONS_PATH, "utf8"));
      }
    } catch (e) {}
    suggestions = suggestions.filter(s => s.id !== req.params.id);
    fs.writeFileSync(CARD_SUGGESTIONS_PATH, JSON.stringify(suggestions, null, 2), "utf8");
    res.json({ ok: true });
  });

  // 1. Ausrüstung speichern
  router.post("/cards/idle/equip", requireAuth, (req, res) => {
      const { equipped } = req.body;
      if (!Array.isArray(equipped) || equipped.length > 5) return res.status(400).json({ error: "Maximal 5 Katzen" });
      
      const db = loadUserCardsDb();
      if (!db[req.twitchId]) return res.status(400).json({ error: "User nicht gefunden" });
      
      const user = db[req.twitchId];
      for (const id of equipped) {
          if (!user.owned[id]) return res.status(400).json({ error: "Du besitzt diese Katze nicht." });
      }

      const defs = loadCardsDef();
      const rateObj = calculateIdleRate(user.equipped || [], user.cardLevels || {}, defs);
      
      const now = Date.now();
      const daysPassed = (now - (user.lastClaimed || now)) / (1000 * 60 * 60 * 24);
      
      // Limit anwenden
      const maxCapacity = MAX_BANK_DAYS * rateObj.total;
      let generated = daysPassed * rateObj.total;
      
      // Das neue Limit auf die unbeanspruchten Coins anwenden
      user.unclaimedCoins = Math.min(maxCapacity, (user.unclaimedCoins || 0) + generated);
      
      user.equipped = equipped;
      user.lastClaimed = now; 
      saveUserCardsDb(db);

      res.json({ ok: true, equipped: user.equipped });
  });

  // 2. Passives Einkommen abholen
  router.post("/cards/idle/claim", requireAuth, (req, res) => {
      const db = loadUserCardsDb();
      if (!db[req.twitchId]) return res.status(400).json({ error: "User nicht gefunden" });
      
      const user = db[req.twitchId];
      const defs = loadCardsDef();
      const rateObj = calculateIdleRate(user.equipped || [], user.cardLevels || {}, defs);

      const now = Date.now();
      const daysPassed = (now - (user.lastClaimed || now)) / (1000 * 60 * 60 * 24);
      
      const maxCapacity = MAX_BANK_DAYS * rateObj.total;
      const totalGeneratedExact = Math.min(maxCapacity, (user.unclaimedCoins || 0) + (daysPassed * rateObj.total));
      const totalToClaim = Math.floor(totalGeneratedExact); 

      if (totalToClaim <= 0) return res.status(400).json({ error: "Nichts zu claimen" });

      const casinoDb = loadJson(CASINO_DB_PATH);
      if (!casinoDb[req.twitchId]) casinoDb[req.twitchId] = { credits: 0, name: req.twitchLogin };
      casinoDb[req.twitchId].credits += totalToClaim;
      fs.writeFileSync(CASINO_DB_PATH, JSON.stringify(casinoDb, null, 2));

      // Komma-Rest behalten
      user.unclaimedCoins = totalGeneratedExact - totalToClaim; 
      user.lastClaimed = now;
      saveUserCardsDb(db);

      res.json({ ok: true, claimed: totalToClaim, newCredits: casinoDb[req.twitchId].credits });
  });

  // 3. Karten leveln (Crafting)
  router.post("/cards/idle/craft", requireAuth, (req, res) => {
      const { cardId } = req.body;
      const db = loadUserCardsDb();
      if (!db[req.twitchId]) return res.status(400).json({ error: "User nicht gefunden" });
      
      const user = db[req.twitchId];
      const currentLevel = (user.cardLevels && user.cardLevels[cardId]) ? user.cardLevels[cardId] : 1;
      const amountOwned = user.owned[cardId] || 0;

      const defs = loadCardsDef();
      const cardDef = defs.find(c => String(c.id) === String(cardId));
      if (!cardDef) return res.status(400).json({ error: "Karte existiert nicht." });

      const cost = getUpgradeCost(currentLevel, cardDef.rarity);
      if (!cost) return res.status(400).json({ error: "Maximales Level erreicht!" });

      if (amountOwned < (cost.dupes + 1)) {
          return res.status(400).json({ error: `Du brauchst ${cost.dupes} Duplikate. Du hast nur ${amountOwned - 1}.` });
      }

      const casinoDb = loadJson(CASINO_DB_PATH);
      const userCredits = casinoDb[req.twitchId] ? casinoDb[req.twitchId].credits : 0;
      if (userCredits < cost.coins) {
          return res.status(400).json({ error: `Nicht genug Coins. Brauche ${cost.coins}.` });
      }

      casinoDb[req.twitchId].credits -= cost.coins;
      fs.writeFileSync(CASINO_DB_PATH, JSON.stringify(casinoDb, null, 2));

      user.owned[cardId] -= cost.dupes;
      if (!user.cardLevels) user.cardLevels = {};
      user.cardLevels[cardId] = currentLevel + 1;
      
      saveUserCardsDb(db);

      res.json({ ok: true, newLevel: currentLevel + 1, newCredits: casinoDb[req.twitchId].credits });
  });

  return router;
};