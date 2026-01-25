const express = require("express");
const fs = require("fs");
const path = require("path");

// FIX: Nutze process.cwd(), damit die Dateien im Hauptverzeichnis gesucht werden
// anstatt im Unterordner der Route.
const ROOT_DIR = process.cwd();

const PATHS = {
  casino: path.join(ROOT_DIR, "casinoData.json"),
  adventure: path.join(ROOT_DIR, "adventures-users.json"),
  winchallenge: path.join(ROOT_DIR, "winchallenge.json"),
  bingo: path.join(ROOT_DIR, "bingo-sessions.json"),
  cards: path.join(ROOT_DIR, "cards-users.json"),
  promo: path.join(ROOT_DIR, "promo-codes.json"),
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

module.exports = function createAdminRouter({ requireAuth, STREAMER_TWITCH_ID }) {
  const router = express.Router();

  // Middleware: Auth Check
  router.use(requireAuth, (req, res, next) => {
    if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
      return res.status(403).json({ error: "Access Denied" });
    }
    next();
  });

  // --- STATS OVERVIEW ---
  router.get("/stats", (req, res) => {
      // Nutze überall die sichere loadJson Funktion
      const casino = loadJson("casino");
      const adventure = loadJson("adventure");
      const bingo = loadJson("bingo");
      const winchallenge = loadJson("winchallenge");
      const promo = loadJson("promo"); // FIX: Nutze loadJson statt direktem fs.readFileSync (verhinder Absturz)

      // Berechnungen (sicherstellen, dass Werte existieren)
      const totalCredits = Object.values(casino).reduce((acc, u) => acc + (parseInt(u.credits) || 0), 0);
      const totalUsers = Object.keys(casino).length;
      
      const advPlayers = Object.keys(adventure).length;
      
      const activeBingoSessions = Object.values(bingo).length;
      
      const activeChallenges = Object.values(winchallenge).length;
      
      const activeCodes = Object.values(promo).length;

      res.json({
          totalCredits,
          totalUsers,
          advPlayers,
          activeBingoSessions,
          activeChallenges,
          activeCodes
      });
  });

  // --- GENERIC GETTER ---
  router.get("/data/:type", (req, res) => {
    const { type } = req.params;
    if (!PATHS[type]) return res.status(400).json({ error: "Unknown DB type" });
    const data = loadJson(type);
    res.json(data);
  });

  // --- SPECIFIC UPDATES ---

  // CASINO & ADVENTURE CREDITS UPDATE
  router.post("/update/user", (req, res) => {
    const { targetId, changes } = req.body; 
    
    if (!targetId) return res.status(400).json({ error: "No ID" });

    // Casino Data
    const casinoDb = loadJson("casino");
    if (!casinoDb[targetId]) casinoDb[targetId] = { credits: 0 };
    
    if (changes.credits !== undefined) {
        casinoDb[targetId].credits = parseInt(changes.credits);
    }
    saveJson("casino", casinoDb);

    // Adventure Data
    const advDb = loadJson("adventure");
    // Nur updaten wenn User im Adventure existiert oder spezifische Adventure-Werte geändert werden
    if (advDb[targetId] || changes.skins || changes.highScore) { 
       if (!advDb[targetId]) advDb[targetId] = {}; // Erstelle User falls nötig

       if (changes.skins) advDb[targetId].skins = changes.skins;
       if (changes.powerups) advDb[targetId].powerups = changes.powerups;
       if (changes.unlockedSlots) advDb[targetId].unlockedSlots = parseInt(changes.unlockedSlots);
       if (changes.highScore) advDb[targetId].highScore = parseInt(changes.highScore);
    }
    saveJson("adventure", advDb);

    res.json({ success: true });
  });
  
  // DELETE ROUTEN
  router.delete("/winchallenge/:targetId", (req, res) => {
      const db = loadJson("winchallenge");
      if (db[req.params.targetId]) {
          delete db[req.params.targetId];
          saveJson("winchallenge", db);
          res.json({ success: true });
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
      } else {
          res.status(404).json({ error: "Not found" });
      }
  });

  // PROMO DELETE (Fehlte im originalen Snippet, aber Dashboard ruft es auf)
  router.delete("/promo/:code", (req, res) => {
    const db = loadJson("promo");
    if (db[req.params.code]) {
        delete db[req.params.code];
        saveJson("promo", db);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Not found" });
    }
  });

  return router;
};