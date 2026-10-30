// crViewerGamesRoutes.js — API der Viewer Games (Chat-Quiz-Overlay, Logik: viewerGames/viewerGames.js).
//   GET  /me              Einstellungen + Overlay-Key (legt beim ersten Aufruf an)
//   PUT  /settings        Einstellungen speichern
//   POST /next            sofort eine neue Runde
//   POST /reset-scores    Bestenliste leeren
//   POST /new-key         neuen Overlay-Link erzeugen (alter funktioniert danach nicht mehr)
//   GET  /overlay/:key    öffentlich: Zustand fürs Overlay (rückt die Runde vor, hält den Chat-Bot im Kanal)
const express = require("express");
const store = require("../viewerGames/viewerGamesStore");
const vg = require("../viewerGames/viewerGames");

module.exports = function createCrViewerGamesRouter({ requireAuth, ircStatus }) {
  const router = express.Router();

  const me = (req) => {
    const row = store.ensure(req.twitchId, req.twitchLogin);
    return { overlayKey: row.overlay_key, login: row.twitch_login, settings: vg.normalizeSettings(row.settings) };
  };

  router.get("/me", requireAuth, (req, res) => {
    let chat = null;
    try { chat = ircStatus ? ircStatus() : null; } catch { chat = null; }
    res.json({ ...me(req), chat: chat ? { configured: !!chat.configured, connected: !!chat.connected } : null });
  });

  router.put("/settings", requireAuth, express.json(), (req, res) => {
    const row = store.ensure(req.twitchId, req.twitchLogin);
    const settings = vg.normalizeSettings(req.body || {});
    store.saveSettings(req.twitchId, req.twitchLogin || row.twitch_login, settings);
    vg.applySettings(row.user_id, { ...row, settings });
    res.json({ ok: true, settings });
  });

  router.post("/next", requireAuth, (req, res) => {
    const row = store.ensure(req.twitchId, req.twitchLogin);
    vg.skipRound(row.user_id, row);
    res.json({ ok: true });
  });

  router.post("/reset-scores", requireAuth, (req, res) => {
    store.resetScores(req.twitchId);
    res.json({ ok: true });
  });

  router.post("/new-key", requireAuth, (req, res) => {
    store.ensure(req.twitchId, req.twitchLogin);
    res.json({ ok: true, overlayKey: store.regenerateKey(req.twitchId) });
  });

  router.get("/overlay/:key", (req, res) => {
    const row = store.byKey(req.params.key);
    if (!row) return res.status(404).json({ error: "not_found" });
    res.set("Cache-Control", "no-store");
    res.json(vg.poll(row));
  });

  return router;
};
