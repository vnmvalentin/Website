const express = require("express");
const fs = require("fs");
const path = require("path");
const createWinchallengeRouter = require("./winchallengeRoutes");
const { farmStates, setFarmState, scheduleFarmsSave } = require("../gardenFarmsStore");

const ROOT_DIR = process.cwd();

const PATHS = {
  casino: path.join(ROOT_DIR, "data/casinoData.json"),
  adventure: path.join(ROOT_DIR, "data/adventures-users.json"),
  bingo: path.join(ROOT_DIR, "data/bingo-sessions.json"),
  cards: path.join(ROOT_DIR, "data/cards-users.json"),
  promo: path.join(ROOT_DIR, "data/promo-codes.json"),
};

function loadJson(key) {
  try {
    if (!fs.existsSync(PATHS[key])) return {};
    return JSON.parse(fs.readFileSync(PATHS[key], "utf8"));
  } catch (e) {
    console.error(`Fehler beim Laden von ${key}:`, e.message);
    return {}; 
  }
}

function saveJson(key, data) {
  try {
    fs.writeFileSync(PATHS[key], JSON.stringify(data, null, 2));
    return true;
  } catch (e) { 
    console.error(`Fehler beim Speichern von ${key}:`, e.message);
    return false; 
  }
}

// HIER: 'io' aus den Argumenten entpacken
module.exports = function createAdminRouter({ requireAuth, STREAMER_TWITCH_ID, io }) {
  const router = express.Router();

  // Helper Funktion: Sendet Update-Signal an das Dashboard
  const notifyUpdate = (types) => {
      // Wir senden an den Raum "streamer:ID" (da ist das Dashboard drin)
      // types kann z.B. ["codes", "stats"] sein
      io.to(`streamer:${STREAMER_TWITCH_ID}`).emit("admin_data_changed", types);
  };

  // Middleware: Auth Check
  router.use(requireAuth, (req, res, next) => {
    if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
      return res.status(403).json({ error: "Access Denied" });
    }
    next();
  });

  // --- STATS OVERVIEW ---
  router.get("/stats", (req, res) => {
      const casino = loadJson("casino");
      const adventure = loadJson("adventure");
      const bingo = loadJson("bingo");
      const winchallenge = createWinchallengeRouter.loadDb();
      const promo = loadJson("promo");

      const totalCredits = Object.values(casino).reduce((acc, u) => acc + (parseInt(u.credits) || 0), 0);
      const totalUsers = Object.keys(casino).length;
      const advPlayers = Object.keys(adventure).length;
      const activeBingoSessions = Object.values(bingo).length;
      const activeChallenges = Object.values(winchallenge).length;
      const activeCodes = Object.values(promo).length;

      res.json({ totalCredits, totalUsers, advPlayers, activeBingoSessions, activeChallenges, activeCodes });
  });

  // --- GENERIC GETTER ---
  router.get("/data/:type", (req, res) => {
    const { type } = req.params;
    if (type === "winchallenge") {
      return res.json(createWinchallengeRouter.loadDb());
    }
    if (!PATHS[type]) return res.status(400).json({ error: "Unknown DB type" });
    const data = loadJson(type);
    res.json(data);
  });

  // --- SPECIFIC UPDATES ---

  // CASINO & ADVENTURE CREDITS UPDATE
  router.post("/update/user", (req, res) => {
    const { targetId, changes } = req.body; 
    if (!targetId) return res.status(400).json({ error: "No ID" });

    let updatedCasino = false;
    let updatedAdventure = false;

    // Casino Data
    const casinoDb = loadJson("casino");
    if (!casinoDb[targetId]) casinoDb[targetId] = { credits: 0 };
    if (changes.credits !== undefined) {
        casinoDb[targetId].credits = parseInt(changes.credits);
        saveJson("casino", casinoDb);
        updatedCasino = true;
    }

    // Adventure Data
    const advDb = loadJson("adventure");
    if (advDb[targetId] || changes.skins || changes.highScore) { 
       if (!advDb[targetId]) advDb[targetId] = {};
       if (changes.skins) advDb[targetId].skins = changes.skins;
       if (changes.powerups) advDb[targetId].powerups = changes.powerups;
       if (changes.unlockedSlots) advDb[targetId].unlockedSlots = parseInt(changes.unlockedSlots);
       if (changes.highScore) advDb[targetId].highScore = parseInt(changes.highScore);
       saveJson("adventure", advDb);
       updatedAdventure = true;
    }

    res.json({ success: true });

    // SOCKET UPDATE TRIGGERN
    const updates = ["stats"]; // Stats ändern sich immer bei Credits
    if (updatedCasino) updates.push("casino");
    if (updatedAdventure) updates.push("adventure");
    notifyUpdate(updates);
  });
  
  // DELETE ROUTEN
  router.delete("/winchallenge/:targetId", async (req, res) => {
      const ok = await createWinchallengeRouter.removeWinchallengeUser(
        String(req.params.targetId)
      );
      if (ok) {
          res.json({ success: true });
          notifyUpdate(["winchallenge", "stats"]);
      } else {
          res.status(404).json({ error: "Not found" });
      }
  });

  router.delete("/bingo/:sessionId", (req, res) => {
      const db = loadJson("bingo");
      if (db[req.params.sessionId]) {
          delete db[req.params.sessionId];
          saveJson("bingo", db);
          res.json({ success: true });

          // Notify
          notifyUpdate(["bingo", "stats"]);
      } else {
          res.status(404).json({ error: "Not found" });
      }
  });

  router.delete("/promo/:code", (req, res) => {
    const db = loadJson("promo");
    if (db[req.params.code]) {
        delete db[req.params.code];
        saveJson("promo", db);
        res.json({ success: true });

        // Notify
        notifyUpdate(["codes", "stats"]);
    } else {
        res.status(404).json({ error: "Not found" });
    }
  });

  // ─── GARDEN ADMIN ─────────────────────────────────────────────────────────────

  // GET /api/admin/garden/users  — summary list of all garden players
  router.get("/garden/users", (req, res) => {
    const rows = [];
    for (const [userId, state] of farmStates.entries()) {
      rows.push({
        userId,
        twitchLogin: state.twitchLogin || null,
        gold: state.gold || 0,
        inventoryCount: (state.inventory || []).length,
        harvestedCount: (state.harvestedItems || []).length,
        petCount: (state.petInventory || []).length,
        plantCount: Object.keys(state.plotPlants || {}).length,
        expansions: state.plotExpansions || 0,
        updatedAt: state.updatedAt || 0,
      });
    }
    rows.sort((a, b) => b.gold - a.gold);
    res.json({ users: rows });
  });

  // GET /api/admin/garden/user/:userId  — full state for one player
  router.get("/garden/user/:userId", (req, res) => {
    const state = farmStates.get(String(req.params.userId));
    if (!state) return res.status(404).json({ error: "Nicht gefunden" });
    res.json({ userId: req.params.userId, state });
  });

  // PUT /api/admin/garden/user/:userId  — patch specific fields (gold, etc.)
  router.put("/garden/user/:userId", (req, res) => {
    const uid = String(req.params.userId);
    const existing = farmStates.get(uid);
    if (!existing) return res.status(404).json({ error: "Nicht gefunden" });
    const { gold } = req.body || {};
    const updated = { ...existing };
    if (typeof gold === "number" && gold >= 0) updated.gold = Math.floor(gold);
    updated.updatedAt = Date.now();
    setFarmState(farmStates, uid, updated);
    scheduleFarmsSave(farmStates);
    res.json({ success: true, gold: updated.gold });
  });

  return router;
};