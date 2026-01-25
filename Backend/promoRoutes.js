const express = require("express");
const fs = require("fs");
const path = require("path");
const { nanoid } = require("nanoid");

const PROMO_PATH = path.join(__dirname, "promo-codes.json");
const CASINO_PATH = path.join(__dirname, "casinoData.json");
const ADVENTURE_PATH = path.join(__dirname, "adventures-users.json");

function loadJson(p) { try { if (!fs.existsSync(p)) return {}; return JSON.parse(fs.readFileSync(p, "utf8")); } catch(e) { return {}; } }
function saveJson(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }

module.exports = function createPromoRouter({ requireAuth, STREAMER_TWITCH_ID }) {
  const router = express.Router();

  // --- ADMIN: Code erstellen ---
  router.post("/create", requireAuth, (req, res) => {
      if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) return res.status(403).json({ error: "Admin only" });
      
      const { code, type, value, maxUses, expiresAt } = req.body;
      // type: 'credits', 'skin', 'item'
      
      const db = loadJson(PROMO_PATH);
      const finalCode = (code || nanoid(8)).toUpperCase();
      
      db[finalCode] = {
          type,
          value,
          maxUses: parseInt(maxUses) || 1,
          usedBy: [],
          expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
          createdAt: Date.now()
      };
      
      saveJson(PROMO_PATH, db);
      res.json({ success: true, code: finalCode, data: db[finalCode] });
  });

  // --- ADMIN: Codes listen ---
  router.get("/list", requireAuth, (req, res) => {
      if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) return res.status(403).json({ error: "Admin only" });
      const db = loadJson(PROMO_PATH);
      res.json(db);
  });
  
  // --- ADMIN: Code löschen ---
  router.delete("/:code", requireAuth, (req, res) => {
      if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) return res.status(403).json({ error: "Admin only" });
      const db = loadJson(PROMO_PATH);
      delete db[req.params.code];
      saveJson(PROMO_PATH, db);
      res.json({ success: true });
  });

  // --- USER: Code einlösen ---
  router.post("/redeem", requireAuth, (req, res) => {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Kein Code" });
      
      const cleanCode = code.trim().toUpperCase();
      const promoDb = loadJson(PROMO_PATH);
      const promo = promoDb[cleanCode];

      // Validierung
      if (!promo) return res.status(404).json({ error: "Code ungültig" });
      if (promo.expiresAt && Date.now() > promo.expiresAt) return res.status(400).json({ error: "Code abgelaufen" });
      if (promo.maxUses !== -1 && promo.usedBy.length >= promo.maxUses) {
            return res.status(400).json({ error: "Code aufgebraucht" });
        }
      if (promo.usedBy.includes(req.twitchId)) return res.status(400).json({ error: "Du hast diesen Code schon benutzt" });

      // Belohnung vergeben
      let message = "";
      
      if (promo.type === "credits") {
          const casinoDb = loadJson(CASINO_PATH);
          if (!casinoDb[req.twitchId]) casinoDb[req.twitchId] = { credits: 0 };
          casinoDb[req.twitchId].credits += parseInt(promo.value);
          saveJson(CASINO_PATH, casinoDb);
          message = `${promo.value} Credits erhalten!`;
      } 
      else if (promo.type === "skin") {
          const advDb = loadJson(ADVENTURE_PATH);
          if (!advDb[req.twitchId]) advDb[req.twitchId] = { skins: ["default"], powerups: [] };
          if (!advDb[req.twitchId].skins.includes(promo.value)) {
              advDb[req.twitchId].skins.push(promo.value);
              saveJson(ADVENTURE_PATH, advDb);
              message = `Skin '${promo.value}' freigeschaltet!`;
          } else {
              message = `Skin '${promo.value}' hattest du schon (Code trotzdem verbraucht).`;
          }
      }

      // Code als benutzt markieren
      promo.usedBy.push(req.twitchId);
      saveJson(PROMO_PATH, promoDb);

      res.json({ success: true, message });
  });

  return router;
};