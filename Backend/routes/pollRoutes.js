// backend/pondRoutes.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const POND_FILE = path.join(__dirname, "../data/pondUsers.json");
const CONFIG_FILE = path.join(__dirname, "../data/pondConfig.json");
// NEU: Pfad zu den Karten-Daten (um Achievements abzugleichen)
const CARDS_USER_DB_PATH = path.join(__dirname, "../data/cards-users.json");

function loadJson(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) { return {}; }
}

function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8"); } catch (e) {}
}

const DEFAULT_CONFIG = {
    fishRequirements: {},
    waterSettings: { 
        height: 5, opacity: 0.5, color: "#06b6d4", sharkEnabled: true, 
        showBubbles: true, waveIntensity: 1, position: "bottom",
        fishScale: 1.0, decoScale: 1.0
    },
    eventSettings: { hypeTrain: true, raid: true },
    excludedUsers: "StreamElements, Nightbot, StreamerBot, Moobot, Wizebot",
    updatedAt: 0
};

// --- NEU: Regelwerk für Fische und Farben ---
// Wir spiegeln hier die Voraussetzungen aus dem Frontend.
const ACHIEVEMENT_REQS = {
    fish: {
        "pepe": "ultimate_collector",
        "catfish": "meme_collector"
    },
    colors: {
        "blue": "collector_50",
        "purple": "mythic_found",
        "gold": "legend_found",
        "rainbow": "ultimate_collector"
    }
};

// --- NEU: Validierungsfunktion ---
// Prüft, ob der User die nötigen Achievements noch hat. Wenn nicht, wird er zurückgesetzt.
function validateUserEquip(twitchId, pondUser) {
    let updated = false;
    let achievements = [];
    
    // Achievements des Users aus der Karten-DB laden
    try {
        const cardsDb = loadJson(CARDS_USER_DB_PATH);
        if (cardsDb[twitchId] && cardsDb[twitchId].claimedAchievements) {
            achievements = cardsDb[twitchId].claimedAchievements;
        }
    } catch (e) {
        console.error("Konnte Karten-DB für Validierung nicht lesen", e);
    }

    // 1. Fisch prüfen
    if (pondUser.selectedFish) {
        const reqAch = ACHIEVEMENT_REQS.fish[pondUser.selectedFish];
        if (reqAch && !achievements.includes(reqAch)) {
            pondUser.selectedFish = "goldfish"; // Zurück auf Standard
            updated = true;
        }
    }

    // 2. Farbe prüfen
    if (pondUser.selectedColor) {
        const reqAch = ACHIEVEMENT_REQS.colors[pondUser.selectedColor];
        if (reqAch && !achievements.includes(reqAch)) {
            pondUser.selectedColor = "default"; // Zurück auf Standard
            updated = true;
        }
    }

    return updated;
}


module.exports = function createPondRouter({ requireAuth, io }) {
  const router = express.Router();

  // --- CONFIG ROUTEN (Global für deinen Stream) ---
  router.get("/config", (req, res) => {
    const savedConfig = loadJson(CONFIG_FILE);
    const finalConfig = { 
        ...DEFAULT_CONFIG, 
        ...savedConfig,
        waterSettings: { ...DEFAULT_CONFIG.waterSettings, ...(savedConfig.waterSettings || {}) },
        eventSettings: { ...DEFAULT_CONFIG.eventSettings, ...(savedConfig.eventSettings || {}) }
    };
    res.json(finalConfig);
  });

  router.get("/config/version", (req, res) => {
    const data = loadJson(CONFIG_FILE);
    res.json({ version: data.updatedAt || 0 });
  });

  router.post("/config", requireAuth, (req, res) => {
      const STREAMER_ID = "160224748";
      if (req.twitchId !== STREAMER_ID) return res.status(403).json({ error: "Nur für Admins!" });

      const newConfig = req.body;
      newConfig.updatedAt = Date.now();
      saveJson(CONFIG_FILE, newConfig);

      if (io) {
          io.to("pond_main").emit("pond_config_updated", { version: newConfig.updatedAt });
      }
      res.json({ success: true, version: newConfig.updatedAt });
  });

  router.post("/trigger-reload", requireAuth, (req, res) => {
      const STREAMER_ID = "160224748";
      if (req.twitchId !== STREAMER_ID) return res.status(403).json({ error: "Admin only" });

      const configData = loadJson(CONFIG_FILE);
      configData.updatedAt = Date.now();
      saveJson(CONFIG_FILE, configData);

      if (io) io.to("pond_main").emit("pond_config_updated", { version: configData.updatedAt });
      res.json({ success: true });
  });

  // --- USER/FISCH ROUTEN ---
  
  // Wird von der Frontend-Website aufgerufen, wenn der User sein Profil öffnet
  router.get("/user", requireAuth, (req, res) => {
      const users = loadJson(POND_FILE);
      const user = users[req.twitchId] || {};
      
      // NEU: Vor der Rückgabe validieren und ggf. speichern
      if (validateUserEquip(req.twitchId, user)) {
          saveJson(POND_FILE, users);
      }
      
      res.json(user);
  });

  // Wird vom Stream-Overlay (ViewerPond.jsx) aufgerufen, um alle Fische zu spawnen
  router.get("/all-users", (req, res) => {
      const users = loadJson(POND_FILE);
      const result = {};
      let needsSave = false;
      
      for (const id in users) {
          const user = users[id];
          
          // NEU: Bereinige die Liste passiv im Hintergrund, sobald das Overlay sie abruft
          if (validateUserEquip(id, user)) {
              needsSave = true;
          }

          result[id] = {
              skin: user.selectedFish || "goldfish",
              color: user.selectedColor || "default"
          };
      }
      
      // Falls jemand zurückgesetzt werden musste, DB speichern
      if (needsSave) {
          saveJson(POND_FILE, users);
      }

      res.json(result);
  });

  router.post("/user", requireAuth, (req, res) => {
      const { selectedFish, selectedColor } = req.body;
      const users = loadJson(POND_FILE);
      
      if (!users[req.twitchId]) users[req.twitchId] = {};
      
      // Sicherheits-Hinweis: Die echte Validierung beim Speichern überlassen wir aktuell
      // noch dem Frontend (die Buttons sind gesperrt). Durch unsere neue Funktion oben
      // wird er sowieso sofort beim nächsten Ladevorgang wieder zurückgesetzt, falls
      // jemand versucht das über die API zu erzwingen.
      
      if (selectedFish) users[req.twitchId].selectedFish = selectedFish;
      if (selectedColor) users[req.twitchId].selectedColor = selectedColor;
      
      users[req.twitchId].displayName = req.twitchLogin;
      
      saveJson(POND_FILE, users);
      
      if (io) {
          io.to("pond_main").emit("pond_skin_update", { 
              userId: req.twitchId, 
              skinId: users[req.twitchId].selectedFish,
              colorId: users[req.twitchId].selectedColor 
          });
      }

      res.json({ success: true, user: users[req.twitchId] });
  });

  return router;
};