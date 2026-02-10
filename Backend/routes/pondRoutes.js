const express = require("express");
const fs = require("fs");
const path = require("path");

const POND_FILE = path.join(__dirname, "../data/pondUsers.json");
const STREAMER_CONFIG_FILE = path.join(__dirname, "../data/pondStreamerConfig.json");
const MAPPING_FILE = path.join(__dirname, "../data/streamerMapping.json");

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
    // NEU: Default Event Settings hinzufügen
    eventSettings: {
        hypeTrain: true,
        raid: true
    },
    excludedUsers: "StreamElements, Nightbot, StreamerBot, Moobot, Wizebot"
};

module.exports = function ({ requireAuth }) {
  const router = express.Router();

  // Liste aller aktiven Streamer
  router.get("/active-streamers", (req, res) => {
      const configData = loadJson(STREAMER_CONFIG_FILE);
      const mappingData = loadJson(MAPPING_FILE);
      const idToName = {};
      Object.entries(mappingData).forEach(([name, id]) => { idToName[id] = name; });
      
      const activeStreamers = Object.keys(configData).map(id => ({
          id: id, displayName: idToName[id] || id
      }));
      res.json(activeStreamers);
  });

  // User Settings (Override speichern)
  router.post("/settings", requireAuth, (req, res) => {
    const { fishId, targetStreamerId } = req.body;
    const twitchId = req.twitchId;
    if (!fishId || !targetStreamerId) return res.status(400).json({ error: "Fehler" });

    const data = loadJson(POND_FILE);
    if (!data[twitchId]) data[twitchId] = {};
    if (!data[twitchId].overrides) data[twitchId].overrides = {};
    data[twitchId].overrides[targetStreamerId] = fishId;
    saveJson(POND_FILE, data);
    res.json({ success: true, fishId });
  });

  // User Settings laden (für Frontend)
  router.get("/me", requireAuth, (req, res) => {
    const data = loadJson(POND_FILE);
    const userData = data[req.twitchId] || {};
    res.json({ overrides: userData.overrides || {} });
  });

  // Skins für Active Viewers abrufen
  router.post("/users", (req, res) => {
    const { ids, streamerId } = req.body; 
    if (!Array.isArray(ids) || !streamerId) return res.json({});
    
    const data = loadJson(POND_FILE);
    const result = {};
    
    const targetStreamerId = String(streamerId);

    ids.forEach((userId) => { 
        const uId = String(userId);

        if (data[uId] && data[uId].overrides && data[uId].overrides[targetStreamerId]) {
            result[uId] = data[uId].overrides[targetStreamerId];
        } else {
            result[uId] = "goldfish"; 
        }
    });
    res.json(result);
  });

  // Config speichern (Streamer Dashboard)
  router.post("/config", requireAuth, (req, res) => {
    // 1. NEU: eventSettings auslesen
    const { fishRequirements, waterSettings, excludedUsers, streamerLogin, eventSettings } = req.body; 
    const twitchId = req.twitchId;
    const configData = loadJson(STREAMER_CONFIG_FILE);
    const currentConfig = configData[twitchId] || DEFAULT_CONFIG;
    
    configData[twitchId] = {
      ...currentConfig,
      fishRequirements: fishRequirements || currentConfig.fishRequirements,
      waterSettings: waterSettings || currentConfig.waterSettings,
      excludedUsers: excludedUsers !== undefined ? excludedUsers : currentConfig.excludedUsers,
      // 2. NEU: eventSettings speichern
      eventSettings: eventSettings || currentConfig.eventSettings,
      updatedAt: Date.now() 
    };
    saveJson(STREAMER_CONFIG_FILE, configData);

    if (streamerLogin) {
        const mapData = loadJson(MAPPING_FILE);
        mapData[streamerLogin.toLowerCase()] = twitchId;
        saveJson(MAPPING_FILE, mapData);
    }
    res.json({ success: true });
  });

  // Config laden (Streamer Dashboard)
  router.get("/config/me", requireAuth, (req, res) => {
      const id = req.twitchId;
      const data = loadJson(STREAMER_CONFIG_FILE);
      const savedConfig = data[id] || {};
      // Merge sicherstellen, damit eventSettings dabei sind
      const finalConfig = { ...DEFAULT_CONFIG, ...savedConfig, resolvedStreamerId: id };
      res.json(finalConfig);
  });

  // Public Config Route für Overlay
  router.get("/config/public/:idOrName", (req, res) => {
    let id = req.params.idOrName.toLowerCase();
    const mapData = loadJson(MAPPING_FILE);
    if (mapData[id]) id = mapData[id];

    const data = loadJson(STREAMER_CONFIG_FILE);
    const savedConfig = data[id] || {};
    
    const finalConfig = { 
        ...DEFAULT_CONFIG, 
        ...savedConfig,
        fishRequirements: { ...DEFAULT_CONFIG.fishRequirements, ...(savedConfig.fishRequirements || {}) },
        waterSettings: { ...DEFAULT_CONFIG.waterSettings, ...(savedConfig.waterSettings || {}) },
        // 3. NEU: eventSettings explizit mergen für Sicherheit
        eventSettings: { ...DEFAULT_CONFIG.eventSettings, ...(savedConfig.eventSettings || {}) },
        version: savedConfig.updatedAt || 0,
        resolvedStreamerId: id
    };
    res.json(finalConfig);
  });

  // Check Version (für Polling)
  router.get("/config/version/:idOrName", (req, res) => {
    let id = req.params.idOrName.toLowerCase();
    const mapData = loadJson(MAPPING_FILE);
    if (mapData[id]) id = mapData[id];
    const data = loadJson(STREAMER_CONFIG_FILE);
    res.json({ version: (data[id] && data[id].updatedAt) || 0 });
  });

  // Trigger Reload (Update Timestamp)
  router.post("/trigger-reload", requireAuth, (req, res) => {
      const twitchId = req.twitchId;
      const configData = loadJson(STREAMER_CONFIG_FILE);
      if (!configData[twitchId]) configData[twitchId] = { ...DEFAULT_CONFIG };
      
      configData[twitchId].updatedAt = Date.now();
      saveJson(STREAMER_CONFIG_FILE, configData);
      res.json({ success: true });
  });

  return router;
};