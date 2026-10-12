const express = require("express");
const path = require("path");
const { nanoid } = require("nanoid");
const { readJson, writeJsonAtomic } = require("../lib/jsonFile");

const PROMO_PATH = path.join(__dirname, "../data/promo-codes.json");
const ADVENTURE_PATH = path.join(__dirname, "../data/adventures-users.json");

// Über lib/jsonFile.js: atomar, und eine kaputte Datei wird nie mit {} überschrieben
function loadJson(p) { return readJson(p, {}); }
function saveJson(p, d) { writeJsonAtomic(p, d); }

module.exports = function createPromoRouter({ requireAuth, STREAMER_TWITCH_ID }) {
  const router = express.Router();

  // --- ADMIN: Code erstellen ---
  router.post("/create", requireAuth, (req, res) => {
      if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) return res.status(403).json({ error: "Admin only" });
      
      const { code, type, value, maxUses, expiresAt } = req.body;
      // Credits gibt es nicht mehr (Oktober 2026) — ein Code schaltet ein adVentures-Kit frei
      if (type !== "skin" || !String(value || "").trim()) return res.status(400).json({ error: "Nur Skin-Codes mit Skin-ID möglich" });
      
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
  // `code`/`value` sind maschinenlesbare Zusätze zu `error`/`message`, damit das Frontend
  // (Profile.jsx, DE/EN) die Meldung selbst übersetzen kann, ohne den deutschen String zu
  // parsen. `error`/`message` bleiben unverändert als deutscher Fallback.
  router.post("/redeem", requireAuth, (req, res) => {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Kein Code", code: "missing_code" });

      const cleanCode = code.trim().toUpperCase();
      const promoDb = loadJson(PROMO_PATH);
      const promo = promoDb[cleanCode];

      // Validierung
      if (!promo) return res.status(404).json({ error: "Code ungültig", code: "invalid" });
      if (promo.expiresAt && Date.now() > promo.expiresAt) return res.status(400).json({ error: "Code abgelaufen", code: "expired" });
      if (promo.maxUses !== -1 && promo.usedBy.length >= promo.maxUses) {
            return res.status(400).json({ error: "Code aufgebraucht", code: "exhausted" });
        }
      if (promo.usedBy.includes(req.twitchId)) return res.status(400).json({ error: "Du hast diesen Code schon benutzt", code: "already_used" });

      // Belohnung vergeben
      let message = "";
      let resultCode = "";

      // Alte Credit-Codes sind wertlos geworden und zählen als ungültig (werden nicht verbraucht)
      if (promo.type !== "skin") return res.status(404).json({ error: "Code ungültig", code: "invalid" });
      {
          const advDb = loadJson(ADVENTURE_PATH);
          if (!advDb[req.twitchId]) advDb[req.twitchId] = { skins: ["default"], powerups: [] };
          if (!advDb[req.twitchId].skins.includes(promo.value)) {
              advDb[req.twitchId].skins.push(promo.value);
              saveJson(ADVENTURE_PATH, advDb);
              message = `Skin '${promo.value}' freigeschaltet!`;
              resultCode = "skin_unlocked";
          } else {
              message = `Skin '${promo.value}' hattest du schon (Code trotzdem verbraucht).`;
              resultCode = "skin_already_owned";
          }
      }

      // Code als benutzt markieren
      promo.usedBy.push(req.twitchId);
      saveJson(PROMO_PATH, promoDb);

      res.json({ success: true, message, code: resultCode, value: promo.value });
  });

  return router;
};