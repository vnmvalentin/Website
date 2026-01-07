// backend/packRoutes.js
const express = require("express");
const fs = require("fs");
const path = require("path");

// DATEI-PFADE
const CARDS_DEF_PATH = path.join(__dirname, "cards-def.json");
const CARDS_USER_DB_PATH = path.join(__dirname, "cards-users.json");
const CARD_SUGGESTIONS_PATH = path.join(__dirname, "card-suggestions.json");
const CARDS_USER_BACKUP_DIR = path.join(__dirname, "cards-users-backups");
// WICHTIG: Wir greifen jetzt auch auf die Casino-DB zu
const CASINO_DB_PATH = path.join(__dirname, "casinoData.json");

// KONFIGURATION
const PACK_PRICE = 500; // Preis pro Pack in Credits

// ================= HELPER =================

// --- Casino Data Helper (Credits lesen/schreiben) ---
function loadCasinoDb() {
  try {
    if (!fs.existsSync(CASINO_DB_PATH)) return {};
    const raw = fs.readFileSync(CASINO_DB_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Fehler beim Laden von casinoData.json:", e);
    return {};
  }
}

function saveCasinoDb(db) {
  try {
    fs.writeFileSync(CASINO_DB_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (e) {
    console.error("Fehler beim Speichern von casinoData.json:", e);
  }
}

// --- Cards Helper ---
function loadCardsDef() {
  try {
    if (!fs.existsSync(CARDS_DEF_PATH)) return [];
    const raw = fs.readFileSync(CARDS_DEF_PATH, "utf8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function loadUserCardsDb() {
  try {
    if (!fs.existsSync(CARDS_USER_DB_PATH)) return {};
    const raw = fs.readFileSync(CARDS_USER_DB_PATH, "utf8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveUserCardsDb(db) {
  try {
    const json = JSON.stringify(db, null, 2);
    const tmpPath = CARDS_USER_DB_PATH + ".tmp";
    fs.writeFileSync(tmpPath, json, "utf8");
    fs.renameSync(tmpPath, CARDS_USER_DB_PATH);

    // Backup
    try {
      if (!fs.existsSync(CARDS_USER_BACKUP_DIR)) {
        fs.mkdirSync(CARDS_USER_BACKUP_DIR, { recursive: true });
      }
      const day = new Date().toISOString().slice(0, 10);
      const backupPath = path.join(CARDS_USER_BACKUP_DIR, `cards-users-${day}.json`);
      fs.writeFileSync(backupPath, json, "utf8");
    } catch (e) {}
  } catch (e) {
    console.error("Fehler beim Speichern von cards-users.json:", e);
  }
}

function loadCardSuggestions() {
  try {
    if (!fs.existsSync(CARD_SUGGESTIONS_PATH)) return [];
    return JSON.parse(fs.readFileSync(CARD_SUGGESTIONS_PATH, "utf8"));
  } catch (e) { return []; }
}

function saveCardSuggestions(list) {
  try {
    fs.writeFileSync(CARD_SUGGESTIONS_PATH, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {}
}

// --- Game Logic Helper ---
const RARITY_ORDER = ["common", "uncommon", "rare", "very-rare", "mythic", "secret", "legendary"];
const RARITY_WEIGHTS = {
  common: 55, uncommon: 22, rare: 15, "very-rare": 8, mythic: 3.5, secret: 0.8, legendary: 0.1,
};
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
    };
  } else {
    // Cleanup alter Token-Felder (optional, stört aber nicht)
    if (db[id].packTokens !== undefined) delete db[id].packTokens;
    if (db[id].lastTokenEarnedAt !== undefined) delete db[id].lastTokenEarnedAt;
  }
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
  return [...cards].sort((a, b) => {
    return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
  });
}

// =================== ROUTER ====================

module.exports = function createPackRouter({ requireAuth, ADMIN_PW: ADMIN_PW_IN, STREAMER_TWITCH_ID: STREAMER_TWITCH_ID_IN } = {}) {
  const router = express.Router();
  const ADMIN_PW = typeof ADMIN_PW_IN === "string" ? ADMIN_PW_IN : (process.env.ADMIN_PW || "");
  const STREAMER_TWITCH_ID = (STREAMER_TWITCH_ID_IN ?? process.env.STREAMER_TWITCH_ID) || "";

  router.get("/cards/all", (req, res) => {
    res.json(loadCardsDef());
  });

  // User Info abrufen (Karten + Credits + Daily Info)
  router.get("/cards/user/:twitchId", requireAuth, (req, res) => {
    const authId = String(req.twitchId);
    const twitchId = String(req.params.twitchId);
    if (authId !== twitchId) return res.status(403).json({ error: "Forbidden" });

    // 1. Karten DB laden
    let cardsDb = loadUserCardsDb();
    const userEntry = ensureUserCardsEntry(cardsDb, twitchId);
    userEntry.twitchLogin = String(req.twitchLogin || userEntry.twitchLogin || "");
    saveUserCardsDb(cardsDb); // Login update speichern

    // 2. Casino DB laden (für Credits & Daily Timer)
    const casinoDb = loadCasinoDb();
    const casinoUser = casinoDb[twitchId] || { credits: 0, lastDaily: 0 }; // Default falls noch nie Casino gespielt

    const defs = loadCardsDef();
    const ownedArray = defs.map((card) => ({
      ...card,
      count: userEntry.owned[card.id] || 0,
    }));

    // Last Pack Logik
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
      // NEU: Credits & Daily Info direkt mitgeben
      credits: casinoUser.credits || 0,
      lastDaily: casinoUser.lastDaily || 0,
      packPrice: PACK_PRICE
    });
  });

  // PACK KAUFEN & ÖFFNEN
  router.post("/cards/open-pack/:twitchId", requireAuth, (req, res) => {
    const authId = String(req.twitchId);
    const twitchId = String(req.params.twitchId);
    if (authId !== twitchId) return res.status(403).json({ error: "Forbidden" });

    // 1. Credits prüfen
    const casinoDb = loadCasinoDb();
    if (!casinoDb[twitchId]) {
      casinoDb[twitchId] = { credits: 0, lastDaily: 0 }; // Init falls leer
    }
    const userCredits = casinoDb[twitchId].credits || 0;

    if (userCredits < PACK_PRICE) {
      return res.status(400).json({ 
        error: "Nicht genug Credits!", 
        credits: userCredits,
        packPrice: PACK_PRICE 
      });
    }

    // 2. Credits abziehen & speichern
    casinoDb[twitchId].credits = userCredits - PACK_PRICE;
    saveCasinoDb(casinoDb);

    // 3. Karten generieren
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

    // 4. Karten DB aktualisieren
    let cardsDb = loadUserCardsDb();
    const userCardEntry = ensureUserCardsEntry(cardsDb, twitchId);
    userCardEntry.twitchLogin = String(req.twitchLogin || userCardEntry.twitchLogin || "");

    const newCardIds = [];
    for (const card of sortedPack) {
      const prevCount = userCardEntry.owned[card.id] || 0;
      if (prevCount === 0) newCardIds.push(card.id);
    }

    for (const card of sortedPack) {
      if (!userCardEntry.owned[card.id]) userCardEntry.owned[card.id] = 0;
      userCardEntry.owned[card.id] += 1;
    }

    // Last Pack speichern
    userCardEntry.lastPack = {
      openedAt: Date.now(),
      cardIds: sortedPack.map((c) => c.id),
      newCardIds,
    };

    saveUserCardsDb(cardsDb);

    // 5. Response mit neuen Karten und neuem Kontostand
    const cardsWithNewFlag = sortedPack.map((c) => ({
      ...c,
      isNew: newCardIds.includes(c.id),
    }));

    res.json({
      twitchId,
      openedAt: Date.now(),
      cards: cardsWithNewFlag,
      lastPack: userCardEntry.lastPack,
      credits: casinoDb[twitchId].credits, // Neuer Kontostand zurückgeben
      packPrice: PACK_PRICE
    });
  });

  // ADMIN: CREDITS GEBEN (statt Tokens)
  // Aufrufbar via POST oder GET (für Twitch StreamElements/MixItUp Webhooks)
  router.all("/cards/admin/add-credits", (req, res) => {
    const data = { ...req.query, ...req.body };
    const { adminPw, twitchId, amount } = data;

    const serverPw = process.env.ADMIN_PW || ADMIN_PW;
    if (!adminPw || adminPw !== serverPw) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!twitchId) return res.status(400).json({ error: "Missing twitchId" });

    const delta = parseInt(amount, 10);
    if (!Number.isFinite(delta)) return res.status(400).json({ error: "Invalid amount" });

    // Casino DB laden
    const casinoDb = loadCasinoDb();
    if (!casinoDb[twitchId]) {
      casinoDb[twitchId] = { credits: 0, lastDaily: 0 };
    }

    // Credits addieren
    const oldCredits = casinoDb[twitchId].credits || 0;
    casinoDb[twitchId].credits = Math.max(0, oldCredits + delta);
    saveCasinoDb(casinoDb);

    console.log(`[Admin] Added ${delta} credits to ${twitchId}. New balance: ${casinoDb[twitchId].credits}`);

    res.json({
      twitchId,
      credits: casinoDb[twitchId].credits,
      added: delta
    });
  });

  // ================= ROUTEN: CARD SUGGESTIONS (Unverändert) =================
  router.get("/card-suggestions", (req, res) => {
    const list = loadCardSuggestions();
    const usersDb = loadUserCardsDb();
    let changed = false;
    for (const s of list) {
      if (!s.authorTwitchLogin && s.authorTwitchId) {
        const u = usersDb[String(s.authorTwitchId)];
        if (u?.twitchLogin) {
          s.authorTwitchLogin = String(u.twitchLogin);
          changed = true;
        }
      }
    }
    if (changed) saveCardSuggestions(list);
    const sorted = [...list].sort((a, b) => {
      const va = a.votes || 0;
      const vb = b.votes || 0;
      if (vb !== va) return vb - va;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
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

  // ================= ROUTEN GALERIE (Unverändert) =================
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