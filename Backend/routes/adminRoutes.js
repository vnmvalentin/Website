const express = require("express");
const fs = require("fs");
const path = require("path");
const createWinchallengeRouter = require("../winchallenge/winchallengeRoutes");
const createGardenRouter = require("../garden/routes/gardenGameRoutes");
const { farmStates, setFarmState, scheduleFarmsSave } = require("../garden/store/farms");
const { getFollowerCounts } = require("../lib/twitchFollowers");
const { wendeAn, baueKatalog } = require("../garden/admin");
const {
    notifyAdminUpdate, notifyPlotChanged, istOnline, weltUebersicht, notifyWelt,
} = require("../garden/world/lobby");
const ereignisse = require("../garden/world/ereignisse");

const ROOT_DIR = process.cwd();

const PATHS = {
  casino: path.join(ROOT_DIR, "data/casinoData.json"),
  adventure: path.join(ROOT_DIR, "data/adventures-users.json"),
  bingo: path.join(ROOT_DIR, "data/bingo-sessions.json"),
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
  // Die Casino-Kennzahlen (Gesamt-Credits, Zahl der Casino-User) stehen hier
  // bewusst nicht mehr: das Dashboard zeigt sie nicht an, und eine Zahl, die
  // niemand liest, muss auch niemand ausrechnen. Die Farm-Zahlen kommen aus dem
  // Arbeitsspeicher, es gibt also keinen Grund, sie separat nachzuladen.
  router.get("/stats", (req, res) => {
      const adventure = loadJson("adventure");
      const bingo = loadJson("bingo");
      const winchallenge = createWinchallengeRouter.loadDb();
      const promo = loadJson("promo");

      const advPlayers = Object.keys(adventure).length;
      const activeBingoSessions = Object.values(bingo).length;
      const activeChallenges = Object.values(winchallenge).length;
      const activeCodes = Object.values(promo).length;
      const welten = weltUebersicht();
      const gardenOnline = welten.reduce((s, w) => s + w.playerCount, 0);

      res.json({
        advPlayers, activeBingoSessions, activeChallenges, activeCodes,
        gardenPlayers: farmStates.size, gardenOnline, gardenWorlds: welten.length,
      });
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
  
  // Aktivitäts-Auswertung: wer ist wie lange inaktiv, wer ist zur Löschung vorgemerkt
  router.get("/winchallenge/activity", (req, res) => {
    res.json(createWinchallengeRouter.getInactivityReport());
  });

  // Follower-Zahlen aller Win-Challenge-Streamer. Bewusst eine eigene Route und
  // nicht Teil von /data/winchallenge: die Liste soll sofort stehen, die Zahlen
  // kommen von Twitch und dürfen nachladen. ?fresh=1 umgeht den Zwischenspeicher.
  router.get("/winchallenge/followers", async (req, res) => {
    const db = createWinchallengeRouter.loadDb();
    const ids = Object.entries(db).map(([id, doc]) => String(doc?.userId || id));
    try {
      const followers = await getFollowerCounts(ids, {
        maxAgeMs: req.query.fresh === "1" ? 0 : undefined,
      });
      res.json({ followers, at: Date.now() });
    } catch (e) {
      console.error("[admin] Follower-Abruf fehlgeschlagen:", e.message);
      res.status(502).json({ error: "Twitch nicht erreichbar" });
    }
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
        // Bei Online-Spielern wirkt ein Eingriff erst nach dem Nachladen, das die
        // Patch-Route anstösst — die Anzeige macht das im Menü sichtbar.
        online: istOnline(userId),
      });
    }
    rows.sort((a, b) => b.gold - a.gold);
    res.json({ users: rows });
  });

  /**
   * GET /api/admin/garden/worlds — wer steht gerade in welcher Welt.
   *
   * Getrennt von /garden/users, weil beide etwas anderes beantworten: dort steht,
   * WER einen Spielstand hat (Datenbank, ändert sich langsam), hier, wer JETZT
   * verbunden ist (Arbeitsspeicher, ändert sich im Sekundentakt).
   */
  router.get("/garden/worlds", (req, res) => {
    const worlds = weltUebersicht();
    res.json({
      worlds,
      online: worlds.reduce((s, w) => s + w.playerCount, 0),
      at: Date.now(),
    });
  });

  // GET /api/admin/garden/catalogue  — Auswahllisten für das Admin-Menü
  router.get("/garden/catalogue", (req, res) => {
    res.json(baueKatalog(createGardenRouter.katalog));
  });

  // ─── Welt: Wetter und Party von Hand ───────────────────────────────────────
  // Beides läuft sonst aus der Uhr bzw. der Ladenrotation und gilt damit bei allen
  // gleich (siehe garden/core/tageszeit.js). Hier liegt die Ausnahme davon; sie
  // steht nur im Arbeitsspeicher und ist nach einem Neustart wieder weg.

  // GET /api/admin/garden/welt — was gerade zusätzlich gilt
  router.get("/garden/welt", (req, res) => {
    res.json({ ...ereignisse.stand(), lagen: ereignisse.WETTERLAGEN, maxMinuten: ereignisse.MAX_MINUTEN });
  });

  // POST /api/admin/garden/welt { op: "wetter"|"party"|"aus", typ?, minuten? }
  router.post("/garden/welt", (req, res) => {
    const op = String(req.body?.op || "");
    let ergebnis;
    if (op === "wetter") ergebnis = ereignisse.setzeWetter(req.body?.typ, req.body?.minuten);
    else if (op === "party") ergebnis = ereignisse.starteParty(req.body?.minuten);
    else if (op === "aus") ergebnis = ereignisse.beendeAlles();
    else return res.status(400).json({ error: "Unbekannte Aktion." });
    if (!ergebnis.ok) return res.status(400).json({ error: ergebnis.error });

    // Sofort an alle. Der Poll auf /global-shop würde es auch mitbringen, aber erst
    // nach bis zu vier Sekunden — bei einem Knopf, der etwas Sichtbares auslöst,
    // ist das der Unterschied zwischen „geht" und „hakt".
    const welt = ereignisse.stand();
    notifyWelt(welt);
    const info = op === "wetter"
      ? `Wetter auf ${req.body?.typ} gesetzt.`
      : op === "party" ? "Party gestartet." : "Wetter und Party wieder aus der Uhr.";
    res.json({ ...welt, info });
  });

  // GET /api/admin/garden/user/:userId  — full state for one player
  router.get("/garden/user/:userId", (req, res) => {
    const uid = String(req.params.userId);
    const state = farmStates.get(uid);
    if (!state) return res.status(404).json({ error: "Nicht gefunden" });
    res.json({ userId: uid, state, online: istOnline(uid) });
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
    updated.stateVersion = (Number(updated.stateVersion) || 0) + 1;
    updated.serverAenderungAb = updated.stateVersion;
    setFarmState(farmStates, uid, updated);
    scheduleFarmsSave(farmStates);
    // Auch der schmale Gold-Weg (Tabellenzeile im Dashboard) muss den Browser des
    // Spielers erreichen, sonst steht dort weiter der alte Betrag.
    notifyAdminUpdate(uid, `Gold: ${updated.gold.toLocaleString("de-DE")}`);
    res.json({ success: true, gold: updated.gold });
  });

  /**
   * POST /api/admin/garden/user/:userId/patch
   * Eine Aktion des Admin-Menüs: Gold, Stücke geben/entfernen, Listen leeren,
   * Werkzeug und Zähler setzen. Was erlaubt ist, steht in garden/admin.js —
   * gebaut werden die Stücke dort, damit der Browser keine Werte diktieren kann.
   */
  router.post("/garden/user/:userId/patch", (req, res) => {
    const uid = String(req.params.userId);
    const existing = farmStates.get(uid);
    if (!existing) return res.status(404).json({ error: "Nicht gefunden" });

    // Auf einer Kopie arbeiten: schlägt eine Aktion mittendrin fehl (z. B. beim
    // dritten von fünf Stücken), bleibt der gespeicherte Stand unberührt.
    const entwurf = { ...existing };
    const ergebnis = wendeAn(entwurf, req.body || {}, createGardenRouter.katalog);
    if (!ergebnis.ok) {
      return res.status(ergebnis.status || 400).json({ error: ergebnis.error });
    }

    entwurf.updatedAt = Date.now();
    // Weiterzählen macht jeden PUT ungültig, der beim Spieler schon unterwegs war —
    // sonst überschriebe genau der den Eingriff (siehe erhoeheVersion in
    // gardenGameRoutes.js). Sein Browser lädt daraufhin ohnehin nach.
    entwurf.stateVersion = (Number(entwurf.stateVersion) || 0) + 1;
    entwurf.serverAenderungAb = entwurf.stateVersion;
    setFarmState(farmStates, uid, entwurf);
    scheduleFarmsSave(farmStates);
    const erreicht = notifyAdminUpdate(uid, ergebnis.info);
    // Mitspieler in derselben Welt sehen Deko und Vitrine des Grundstücks — die
    // Momentaufnahme muss also auch ohne Zutun des Besitzers neu raus.
    notifyPlotChanged(uid);
    console.log(`[Garden-Admin] ${uid}: ${ergebnis.info}`);
    res.json({ success: true, info: ergebnis.info, state: entwurf, online: erreicht });
  });

  return router;
};