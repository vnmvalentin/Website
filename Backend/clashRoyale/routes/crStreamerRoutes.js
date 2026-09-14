// crStreamerRoutes.js — API für die Clash Royale Streamer-Konfiguration
// GET/PUT der Config (per Twitch-Session) + öffentlicher Endpoint fürs Deck-Overlay.
const express = require("express");
const store = require("../lib/crStreamerStore");

function createCrStreamerRouter({ requireAuth } = {}) {
  const router = express.Router();

  const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

  // Eigene Konfiguration laden (legt bei Bedarf einen Default an)
  router.get(
    "/config",
    requireAuth,
    asyncHandler(async (req, res) => {
      const cfg = store.getOrCreateConfig(req.twitchId, req.twitchLogin || "");
      res.json(cfg);
    })
  );

  // Konfiguration speichern (obs + actions; lastDecks/overlayKey bleiben serverseitig)
  router.put(
    "/config",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const cfg = store.saveConfig(req.twitchId, {
        twitchLogin: req.twitchLogin || "",
        obs: body.obs,
        actions: body.actions,
      });
      res.json(cfg);
    })
  );

  // Overlay-Link neu generieren (alter Link wird ungültig)
  router.post(
    "/config/regenerate-overlay",
    requireAuth,
    asyncHandler(async (req, res) => {
      const cfg = store.regenerateOverlayKey(req.twitchId);
      res.json(cfg);
    })
  );

  // Öffentlich: Daten fürs Deck-Overlay (der Key ist das Geheimnis).
  // Enthält bewusst auch die OBS-Zugangsdaten: die Browserquelle im OBS des
  // Streamers ist die lokale Brücke, die Szenen-/Quellen-Aktionen ausführt.
  router.get("/overlay/:overlayKey", (req, res) => {
    const cfg = store.findByOverlayKey(req.params.overlayKey);
    if (!cfg) return res.status(404).json({ error: "Overlay nicht gefunden" });
    res.json({
      overlayKey: cfg.overlayKey,
      obs: cfg.obs,
      actions: cfg.actions,
      lastDecks: cfg.lastDecks,
      updatedAt: cfg.updatedAt,
    });
  });

  return router;
}

module.exports = createCrStreamerRouter;
