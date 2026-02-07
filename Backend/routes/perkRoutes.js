const express = require("express");
const fs = require("fs");
const path = require("path");

const CASINO_PATH = path.join(__dirname, "../data/casinoData.json");
const PERK_INVENTORY_PATH = path.join(__dirname, "../data/perkInventory.json");
const SHOP_STATE_PATH = path.join(__dirname, "../data/shopState.json");

function loadJson(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) { return {}; }
}
function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) {}
}

const SHOP_ITEMS = [
    { id: "sr_token", name: "Song Request", desc: "Requeste einen Song", price: 1000, icon: "🎵", color: "text-pink-400" },
    { id: "timeout_hammer", name: "Timeout Hammer", desc: "Timeoute einen Nutzer für 3min", price: 5000, icon: "🔨", color: "text-red-400" },
    { id: "vip_token", name: "Hot Potato VIP", desc: "Claime den VIP Status, andere können ihn klauen", price: 5000, icon: "💎", color: "text-yellow-400" },
    { id: "skip_token", name: "Skip Song", desc: "Skip den Song", price: 5000, icon: "⏭️", color: "text-cyan-400" },
    { id: "discount_sr", name: "50% SR Sale", desc: "Song Requests kosten 24h nur die Hälfte (für alle!)", price: 5000, icon: "🏷️", color: "text-green-400" }
];

// WICHTIG: io hier empfangen
module.exports = function ({ requireAuth, io }) {
  const router = express.Router();

  router.get("/items", (req, res) => res.json(SHOP_ITEMS));

  router.get("/inventory", requireAuth, (req, res) => {
      const inventory = loadJson(PERK_INVENTORY_PATH);
      res.json(inventory[req.twitchId] || {});
  });

  router.post("/buy", requireAuth, (req, res) => {
      const { itemId } = req.body;
      const item = SHOP_ITEMS.find(i => i.id === itemId);
      if (!item) return res.status(400).json({ error: "Item existiert nicht" });

      const casinoDb = loadJson(CASINO_PATH);
      const userCredits = casinoDb[req.twitchId]?.credits || 0;

      if (userCredits < item.price) return res.status(400).json({ error: "Zu wenig Credits!" });

      // Bezahlen
      casinoDb[req.twitchId].credits -= item.price;
      saveJson(CASINO_PATH, casinoDb);

      // Item hinzufügen
      const inventory = loadJson(PERK_INVENTORY_PATH);
      if (!inventory[req.twitchId]) inventory[req.twitchId] = {};
      inventory[req.twitchId][itemId] = (inventory[req.twitchId][itemId] || 0) + 1;
      saveJson(PERK_INVENTORY_PATH, inventory);

      // --- SOCKET UPDATE SENDEN ---
      // Wir senden an den Raum des Users (falls er eingeloggt ist)
      // Das erfordert, dass das Frontend dem Raum beitritt, oder wir senden global (einfacher für jetzt)
      io.emit("perk_inventory_update", { userId: req.twitchId });

      res.json({ 
          success: true, 
          message: `${item.name} gekauft!`,
          newCredits: casinoDb[req.twitchId].credits,
          newInventory: inventory[req.twitchId]
      });
  });

  // --- BOT CONSUME ---
  router.post("/bot/consume", (req, res) => {
      const { twitchId, itemId } = req.body;
      const inventory = loadJson(PERK_INVENTORY_PATH);
      const userInv = inventory[twitchId] || {};

      if (userInv[itemId] && userInv[itemId] > 0) {
          userInv[itemId]--;
          if (userInv[itemId] <= 0) delete userInv[itemId];
          
          inventory[twitchId] = userInv;
          saveJson(PERK_INVENTORY_PATH, inventory);

          // --- SOCKET UPDATE SENDEN ---
          // Damit die Website sich aktualisiert, wenn der Bot etwas verbraucht
          io.emit("perk_inventory_update", { userId: twitchId });

          return res.json({ allowed: true, remaining: userInv[itemId] || 0 });
      }

      return res.json({ allowed: false });
  });

  // 2. Inventar für !perkinventory Command
  router.get("/bot/inventory/:twitchId", (req, res) => {
      const { twitchId } = req.params;
      const inventory = loadJson(PERK_INVENTORY_PATH);
      const userInv = inventory[twitchId] || {};
      
      // Mappen auf lesbare Namen
      const readableInv = Object.entries(userInv).map(([id, count]) => {
          const item = SHOP_ITEMS.find(i => i.id === id);
          return item ? `${count}x ${item.name}` : `${count}x ${id}`;
      });

      res.json({ 
          text: readableInv.length > 0 ? readableInv.join(", ") : "Leer",
          raw: userInv 
      });
  });

  // 3. Shop Liste für !perklist
  router.get("/bot/list", (req, res) => {
      const list = SHOP_ITEMS.map(i => `${i.name}: ${i.price} Coins`).join(" | ");
      res.json({ text: list });
  });

  router.post("/bot/refund", (req, res) => {
      const { twitchId, itemId } = req.body;
      const inventory = loadJson(PERK_INVENTORY_PATH);
      
      if (!inventory[twitchId]) inventory[twitchId] = {};
      
      // Item +1
      inventory[twitchId][itemId] = (inventory[twitchId][itemId] || 0) + 1;
      saveJson(PERK_INVENTORY_PATH, inventory);

      // Socket Update senden
      io.emit("perk_inventory_update", { userId: twitchId });

      // Neue Anzahl zurückgeben
      return res.json({ success: true, newAmount: inventory[twitchId][itemId] });
  });

  // --- GLOBAL BUFFS (RABATT) ---

  // 1. Rabatt aktivieren
  router.post("/bot/discount/activate", (req, res) => {
      const { type, durationHours = 24 } = req.body; // type = 'sr_cost'
      const state = loadJson(SHOP_STATE_PATH);
      
      const now = Date.now();
      
      // Check: Ist es schon aktiv?
      if (state[type] && state[type].expiresAt > now) {
          return res.json({ success: false, msg: "Bereits aktiv", expiresAt: state[type].expiresAt });
      }

      // Neu setzen
      state[type] = {
          active: true,
          expiresAt: now + (durationHours * 60 * 60 * 1000),
          startedBy: req.body.username || "Unknown"
      };
      
      saveJson(SHOP_STATE_PATH, state);
      res.json({ success: true, expiresAt: state[type].expiresAt });
  });

  // 2. Check & Reset (Wird vom Timer aufgerufen)
  router.post("/bot/discount/check", (req, res) => {
      const { type } = req.body;
      const state = loadJson(SHOP_STATE_PATH);
      const now = Date.now();

      if (!state[type] || !state[type].active) {
          return res.json({ active: false, shouldRevert: false });
      }

      // Ist die Zeit abgelaufen?
      if (now > state[type].expiresAt) {
          // Deaktivieren
          state[type].active = false;
          saveJson(SHOP_STATE_PATH, state);
          return res.json({ active: false, shouldRevert: true }); // Signal an Bot: Preis zurücksetzen!
      }

      return res.json({ active: true, expiresAt: state[type].expiresAt });
  });


  return router;
};