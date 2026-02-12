// backend/adVenturesRoutes.js
const express = require("express");
const fs = require("fs");
const path = require("path");

const GAME_DATA_PATH = path.join(__dirname, "../data/adventures-users.json");
const CASINO_PATH = path.join(__dirname, "../data/casinoData.json");

const SKINS_DEF = {
    "default": { name: "Standard", price: 0, file: "skins/player.png" },
    "ninja": { name: "Ninja", price: 2000, file: "skins/player_ninja.png" },
    "knight": { name: "Ritter", price: 5000, file: "skins/player_knight.png" },
    "wizard": { name: "Magier", price: 8000, file: "skins/player_wizard.png" },
    "cyber": { name: "Cyberpunk", price: 15000, file: "skins/player_cyber.png" },
    "gh0stqq": { name: "Gh0stQQ", price: 15000, file: "skins/gh0stqq.png" },
    "bestmod": { name: "Best Mod", price: 15000, file: "skins/bestmod.png" }
};

const POWERUPS_DEF = {
    "potion": { name: "Heiltrank", price: 500, desc: "Heilt 50 HP", cooldown: 60000, icon: "assets/adventure/powerups/healpotion.png" },
    "shield": { name: "Schutzschild", price: 1500, desc: "3 Sekunden unverwundbar", cooldown: 6000, icon: "assets/adventure/powerups/shield.png" },
    "spin": { name: "Wirbelwind", price: 2500, desc: "Schaden um dich herum", cooldown: 50000, icon: "assets/adventure/powerups/spinattack.png" },
    "decoy": { name: "Köder", price: 2000, desc: "Lenkt Gegner ab", cooldown: 60000, icon: "assets/adventure/powerups/decoy.png" },
    "grenade": { name: "Granate", price: 3000, desc: "Explosiver Flächenschaden", cooldown: 50000, icon: "assets/adventure/projectiles/grenade.png" },
    "fastshot": { name: "Hyperfeuer", price: 4000, desc: "Doppelte Feuerrate (5s)", cooldown: 40000, icon: "assets/adventure/powerups/rapidfire.png" },
    "fastboots": { name: "Speedboots", price: 3500, desc: "Doppelter Speed (5s)", cooldown: 40000, icon: "assets/adventure/powerups/fastboots.png" }
};

function loadGameData() { try { if (!fs.existsSync(GAME_DATA_PATH)) return {}; return JSON.parse(fs.readFileSync(GAME_DATA_PATH, "utf8")); } catch (e) { return {}; } }
function saveGameData(data) { try { fs.writeFileSync(GAME_DATA_PATH, JSON.stringify(data, null, 2)); } catch (e) {} }
function loadCasinoData() { try { if (!fs.existsSync(CASINO_PATH)) return {}; return JSON.parse(fs.readFileSync(CASINO_PATH, "utf8")); } catch (e) { return {}; } }
function saveCasinoData(data) { try { fs.writeFileSync(CASINO_PATH, JSON.stringify(data, null, 2)); } catch (e) {} }

module.exports = function createGameRouter({ requireAuth }) {
  const router = express.Router();

  function ensureUser(db, id, name) {
    if (!db[id]) {
        db[id] = { 
            name: name || "Unknown", 
            highScore: 0, 
            skins: ["default"], 
            activeSkin: "default",
            powerups: [], 
            unlockedSlots: 1, // STARTET MIT 1 SLOT
            loadout: [null, null, null, null] // Bis zu 4 Slots möglich
        };
    }
    // Migrationen für bestehende User
    if (!db[id].unlockedSlots) db[id].unlockedSlots = 1; 
    if (!db[id].loadout || db[id].loadout.length < 4) {
        // Altes Loadout migrieren und auffüllen
        const old = db[id].loadout || [null, null, null];
        while(old.length < 4) old.push(null);
        db[id].loadout = old;
    }
    // ... Rest der Funktion
    return db[id];
}

  // Profil abrufen
  router.get("/profile", requireAuth, (req, res) => {
    const db = loadGameData();
    const user = ensureUser(db, req.twitchId, req.twitchLogin);
    
    res.json({ 
        ...user, 
        skinDefs: SKINS_DEF,
        powerupDefs: POWERUPS_DEF,
        hasActiveRun: !!user.activeRun 
    });
  });

  // Powerup kaufen
  router.post("/buy-powerup", requireAuth, (req, res) => {
      const { powerupId } = req.body;
      const userId = req.twitchId;
      const def = POWERUPS_DEF[powerupId];
      if(!def) return res.status(400).json({ error: "Item existiert nicht" });

      const gameDb = loadGameData();
      const casinoDb = loadCasinoData();
      const user = ensureUser(gameDb, userId, req.twitchLogin);

      if(user.powerups.includes(powerupId)) return res.status(400).json({ error: "Bereits im Besitz" });
      if(!casinoDb[userId] || casinoDb[userId].credits < def.price) return res.status(400).json({ error: "Zu wenig Credits" });

      casinoDb[userId].credits -= def.price;
      user.powerups.push(powerupId);
      
      saveCasinoData(casinoDb);
      saveGameData(gameDb);
      res.json({ success: true, powerups: user.powerups, credits: casinoDb[userId].credits });
  });

  // 3. Neue Route zum Slot kaufen (irgendwo vor return router):
  router.post("/buy-slot", requireAuth, (req, res) => {
      const userId = req.twitchId;
      const db = loadGameData();
      const casinoDb = loadCasinoData();
      const user = ensureUser(db, userId, req.twitchLogin);

      if (user.unlockedSlots >= 4) return res.status(400).json({ error: "Max Slots erreicht" });
      
      // Preisformel: 2. Slot = 5000, 3. = 10000, 4. = 20000
      const price = 5000 * Math.pow(2, user.unlockedSlots - 1);
      
      if (!casinoDb[userId] || casinoDb[userId].credits < price) {
          return res.status(400).json({ error: `Du brauchst ${price} Credits` });
      }

      casinoDb[userId].credits -= price;
      user.unlockedSlots++;
      
      saveCasinoData(casinoDb);
      saveGameData(db);
      res.json({ success: true, unlockedSlots: user.unlockedSlots, credits: casinoDb[userId].credits });
  });



  // 4. In /equip-powerup Validierung anpassen:
  router.post("/equip-powerup", requireAuth, (req, res) => {
        const { slotIndex, powerupId } = req.body;
        const userId = req.twitchId;
        const db = loadGameData();
        const user = ensureUser(db, userId, req.twitchLogin);

        // Check ob Slot unlocked ist
        if (slotIndex < 0 || slotIndex >= user.unlockedSlots) {
            return res.status(400).json({ error: "Slot gesperrt" });
        }
      
      if (powerupId) {
        if(!user.powerups.includes(powerupId)) return res.status(400).json({ error: "Nicht im Besitz" });
        // Prüfen ob schon woanders ausgerüstet
        const existingIdx = user.loadout.indexOf(powerupId);
        if (existingIdx !== -1 && existingIdx !== slotIndex) {
            user.loadout[existingIdx] = null; // Dort entfernen
        }
      }

      user.loadout[slotIndex] = powerupId;
      saveGameData(db);
      res.json({ success: true, loadout: user.loadout });
  });

  // --- REST WIE ZUVOR ---
  
  router.post("/save-run", requireAuth, (req, res) => {
      const { gameState } = req.body;
      const userId = req.twitchId;
      const db = loadGameData();
      const user = ensureUser(db, userId, req.twitchLogin);
      user.activeRun = gameState;
      saveGameData(db);
      res.json({ success: true });
  });

  router.get("/load-run", requireAuth, (req, res) => {
      const userId = req.twitchId;
      const db = loadGameData();
      const user = ensureUser(db, userId);
      if(user.activeRun) res.json({ success: true, run: user.activeRun });
      else res.json({ success: false });
  });

  router.post("/clear-run", requireAuth, (req, res) => {
      const userId = req.twitchId;
      const db = loadGameData();
      if(db[userId]) { delete db[userId].activeRun; saveGameData(db); }
      res.json({ success: true });
  });

  router.post("/buy-skin", requireAuth, (req, res) => {
      const { skinId } = req.body;
      const userId = req.twitchId;
      const skin = SKINS_DEF[skinId];
      if(!skin) return res.status(400).json({ error: "Skin existiert nicht" });
      const gameDb = loadGameData();
      const casinoDb = loadCasinoData();
      const user = ensureUser(gameDb, userId, req.twitchLogin);
      if(user.skins.includes(skinId)) return res.status(400).json({ error: "Besitzt du schon" });
      if(!casinoDb[userId] || casinoDb[userId].credits < skin.price) return res.status(400).json({ error: "Zu wenig Credits" });
      casinoDb[userId].credits -= skin.price;
      user.skins.push(skinId);
      saveCasinoData(casinoDb);
      saveGameData(gameDb);
      res.json({ success: true, skins: user.skins, credits: casinoDb[userId].credits });
  });

  router.post("/equip-skin", requireAuth, (req, res) => {
      const { skinId } = req.body;
      const userId = req.twitchId;
      const gameDb = loadGameData();
      const user = ensureUser(gameDb, userId, req.twitchLogin);
      if(!user.skins.includes(skinId)) return res.status(400).json({ error: "Nicht im Besitz" });
      user.activeSkin = skinId;
      saveGameData(gameDb);
      res.json({ success: true, activeSkin: skinId });
  });

  router.get("/leaderboard", (req, res) => {
    const db = loadGameData();
    const sorted = Object.values(db)
        .filter(u => u.highScore > 0)
        .sort((a, b) => (b.highScore || 0) - (a.highScore || 0))
        .slice(0, 10)
        .map(u => ({ name: u.name, score: u.highScore }));
    res.json(sorted);
  });

  router.post("/end-run", requireAuth, (req, res) => {
    const { kills, stage } = req.body;
    const userId = req.twitchId;
    if (kills === undefined || stage === undefined) return res.status(400).json({ error: "Invalid Data" });
    const killBonus = kills * 3;
    const stageBonus = (stage * 50) + (3 * Math.pow(stage, 2));
    const earnedCredits = Math.floor(killBonus + stageBonus);
    const gameDb = loadGameData();
    const casinoDb = loadCasinoData();
    const user = ensureUser(gameDb, userId, req.twitchLogin);
    if (!casinoDb[userId]) casinoDb[userId] = { credits: 0 };
    if (stage > (gameDb[userId].highScore || 0)) gameDb[userId].highScore = stage;
    delete user.activeRun;
    casinoDb[userId].credits += earnedCredits;
    saveGameData(gameDb);
    saveCasinoData(casinoDb);
    res.json({ success: true, earnedCredits, highScore: gameDb[userId].highScore });
  });

  router.post("/feedback", requireAuth, async (req, res) => {
      const { message } = req.body;
      const username = req.twitchLogin || "Unbekannt";
      
      // HIER DEINE WEBHOOK URL EINTRAGEN:
      const WEBHOOK_URL = "https://discord.com/api/webhooks/1462290359202615347/I5kLNO6HwScgJ2-ONt0MBtwVQ-y-C_QFpbJF1PiYOwmGC3ccJ46iVMOroPL1zqCoc0_J"; 

      if (!message || message.trim().length === 0) {
          return res.status(400).json({ error: "Nachricht darf nicht leer sein." });
      }
      
      if (WEBHOOK_URL.includes("HIER_EINFÜGEN")) {
          console.error("Discord Webhook URL wurde nicht konfiguriert!");
          return res.status(500).json({ error: "Server Konfigurationsfehler" });
      }

      try {
          // Wir senden ein schönes Embed an Discord
          const discordPayload = {
              username: "Adventure Feedback Bot",
              avatar_url: "https://cdn-icons-png.flaticon.com/512/2583/2583166.png", // Optional: Icon für den Bot
              embeds: [
                  {
                      title: "📝 Neues Feedback / Bugreport",
                      color: 16753920, // Orange
                      fields: [
                          {
                              name: "👤 User",
                              value: username,
                              inline: true
                          },
                          {
                              name: "💬 Nachricht",
                              value: message
                          }
                      ],
                      footer: {
                          text: `Gesendet am ${new Date().toLocaleString("de-DE")}`
                      }
                  }
              ]
          };

          const discordRes = await fetch(WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(discordPayload)
          });

          if (discordRes.ok) {
              res.json({ success: true });
          } else {
              console.error("Discord Error:", await discordRes.text());
              res.status(500).json({ error: "Fehler beim Senden an Discord" });
          }
      } catch (e) {
          console.error("Feedback Fetch Error:", e);
          res.status(500).json({ error: "Interner Serverfehler" });
      }
  });

  return router;
};