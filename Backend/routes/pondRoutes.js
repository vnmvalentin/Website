const express = require("express");
const fs = require("fs");
const path = require("path");

const POND_FILE = path.join(__dirname, "../data/pondUsers.json");
const CONFIG_FILE = path.join(__dirname, "../data/pondConfig.json"); // Nur noch EINE Config!

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
        height: 5, 
        opacity: 0.5, 
        color: "#06b6d4", 
        sharkEnabled: true, 
        showBubbles: true, 
        waveIntensity: 1,
        position: "bottom",
        fishScale: 1.0,
        decoScale: 1.0
    },
    eventSettings: {
        hypeTrain: true,
        raid: true
    },
    excludedUsers: "StreamElements, Nightbot, StreamerBot, Moobot, Wizebot",
    updatedAt: 0
};

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
      // Sicherheits-Check: Nur du darfst das ändern! (Ersetze die ID falls nötig)
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
  router.get("/user", requireAuth, (req, res) => {
      const users = loadJson(POND_FILE);
      res.json(users[req.twitchId] || {});
  });

  router.get("/all-users", (req, res) => {
      const users = loadJson(POND_FILE);
      const result = {};
      
      // NEU: Wir senden jetzt ein Objekt { skin, color } statt nur den Skin-String
      for (const id in users) {
          result[id] = {
              skin: users[id].selectedFish || "goldfish",
              color: users[id].selectedColor || "default" // Neue Eigenschaft
          };
      }
      res.json(result);
  });

  router.post("/user", requireAuth, (req, res) => {
      const { selectedFish, selectedColor } = req.body; // Color empfangen
      const users = loadJson(POND_FILE);
      
      if (!users[req.twitchId]) users[req.twitchId] = {};
      
      if (selectedFish) users[req.twitchId].selectedFish = selectedFish;
      if (selectedColor) users[req.twitchId].selectedColor = selectedColor; // Color speichern
      
      users[req.twitchId].displayName = req.twitchLogin;
      
      saveJson(POND_FILE, users);
      
      // Socket Event für Live-Updates senden
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