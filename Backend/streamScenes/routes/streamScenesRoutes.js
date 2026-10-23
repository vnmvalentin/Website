// streamScenesRoutes.js — /api/stream-scenes
//
// Steuerpult (nur der Kanalbetreiber, STREAMER_TWITCH_ID — die 3D-Szenen sind kein öffentliches Tool):
//   GET  /control            Einstellungen + OBS-Key
//   PUT  /control            Einstellungen speichern ({ settings })
//   POST /control/command    einmaliger Befehl ({ type: 'drop' | 'fire' | 'clearFloor' })
//   POST /control/rotate-key neuer OBS-Link (alter Link hört auf zu wirken)
// OBS-Quelle (ohne Login):
//   GET  /live               Einstellungen + letzter Befehl des Kanalbetreibers, wird alle ~1,5 s abgefragt
//   GET  /live/:key          dasselbe über einen alten Link mit Key (bleibt gültig)
// Figurbaukasten (Login als Zuschauer):
//   GET/PUT/DELETE /look     eigene Figur
// Szenen (ohne Login):
//   GET  /looks?ids=1,2&logins=a,b   Figuren mehrerer Zuschauer (je max. 100)
const express = require('express');
const store = require('../lib/sceneStore');

const MAX_IDS = 100;

module.exports = function createStreamScenesRouter({ requireAuth, STREAMER_TWITCH_ID }) {
  const router = express.Router();
  const streamerOnly = (req, res, next) => {
    if (!STREAMER_TWITCH_ID || String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
      return res.status(403).json({ error: 'Nur für den Kanalbetreiber' });
    }
    next();
  };

  // ── Steuerpult ──
  router.get('/control', requireAuth, streamerOnly, (req, res) => {
    res.json(store.getControl(req.twitchId, req.twitchLogin));
  });

  router.put('/control', requireAuth, streamerOnly, (req, res) => {
    if (!req.body || typeof req.body.settings !== 'object') return res.status(400).json({ error: 'settings fehlt' });
    res.json(store.saveSettings(req.twitchId, req.twitchLogin, req.body.settings));
  });

  router.post('/control/command', requireAuth, streamerOnly, (req, res) => {
    const out = store.sendCommand(req.twitchId, req.twitchLogin, req.body?.type);
    if (!out) return res.status(400).json({ error: 'Unbekannter Befehl' });
    res.json(out);
  });

  router.post('/control/rotate-key', requireAuth, streamerOnly, (req, res) => {
    res.json(store.rotateKey(req.twitchId, req.twitchLogin));
  });

  router.get('/live', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { overlayKey, ...rest } = store.getLiveForUser(STREAMER_TWITCH_ID);
    res.json(rest);
  });

  router.get('/live/:key', (req, res) => {
    const live = store.getLiveByKey(req.params.key);
    if (!live) return res.status(404).json({ error: 'Unbekannter Link' });
    res.set('Cache-Control', 'no-store');
    const { overlayKey, ...rest } = live;      // der Key steht schon in der URL
    res.json(rest);
  });

  // ── Figurbaukasten ──
  router.get('/look', requireAuth, (req, res) => {
    res.json({ twitchId: req.twitchId, ...(store.getLook(req.twitchId) || { look: null }) });
  });

  router.put('/look', requireAuth, (req, res) => {
    const saved = store.saveLook(req.twitchId, req.twitchLogin, req.body?.look);
    if (!saved) return res.status(400).json({ error: 'Ungültige Figur' });
    res.json({ twitchId: req.twitchId, ...saved });
  });

  router.delete('/look', requireAuth, (req, res) => {
    store.deleteLook(req.twitchId);
    res.json({ twitchId: req.twitchId, look: null });
  });

  router.get('/looks', (req, res) => {
    const ids = [...new Set(String(req.query.ids || '').split(',').filter((x) => /^\d{1,20}$/.test(x)))].slice(0, MAX_IDS);
    // Kurz zwischenspeichern: wer seine Figur ändert, sieht sie nach spätestens einer Minute im Stream
    res.set('Cache-Control', 'public, max-age=60');
    const logins = [...new Set(String(req.query.logins || '').toLowerCase().split(',').filter((x) => /^[a-z0-9_]{2,25}$/.test(x)))].slice(0, MAX_IDS);
    res.json({ looks: store.getLooks(ids), logins: store.getLooksByLogins(logins) });
  });

  return router;
};
