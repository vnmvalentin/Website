// twitchExtension/routes.js — Server der Twitch-Erweiterung „Win Tracker“ (Ausbauplan „twitch-erweiterung“).
//
//   GET /api/twitch-ext/panel   Panel unter dem Stream: Win-Tracker-Zahlen des Kanals (jede Rolle)
//   GET /api/twitch-ext/status  Einstellungsseite des Streamers: ist ein Win Tracker da, mit welchem Account?
//
// Anmeldung: Twitchs Token der Erweiterung im Kopf „Authorization: Bearer …“ (jwt.js). Die Erweiterung läuft auf
// https://<client-id>.ext-twitch.tv — nur diese Herkunft bekommt CORS-Kopfzeilen. In index.js VOR dem globalen
// cors() eingehängt: der beantwortet Vorab-Anfragen (OPTIONS) sonst selbst, ohne diese Herkunft.
//
// Last: Jeder Zuschauer fragt selbst (alle 30 s, Panel: frontend). Je Kanal gilt ein Zwischenspeicher von 15 s —
// tausend Zuschauer kosten so höchstens vier Abfragen der Win-Tracker-Datenbank pro Minute.
// Gespeichert wird nichts über Zuschauer: das Token wird nur geprüft.
'use strict';

const express = require('express');
const { verifyExtensionJwt } = require('./jwt');
const { loadFromWinTracker } = require('./panelData');

const CACHE_MS = 15 * 1000;
const CACHE_MAX = 5000;

const siteUrl = () => (process.env.FRONTEND_URL || 'https://vnmvalentin.de').replace(/\/+$/, '');

/**
 * @param {object} opts
 * @param {string} [opts.secret]    Geheimnis der Erweiterung (Base64, TWITCH_EXT_SECRET)
 * @param {string} [opts.clientId]  Client-ID der Erweiterung (TWITCH_EXT_CLIENT_ID) — bestimmt die erlaubte Herkunft
 * @param {Function} [opts.load]    (channelId) → { tracker, state }; Standard: Win-Tracker-Datenbank (nur lesen)
 * @param {string[]} [opts.extraOrigins] zusätzliche Herkünfte (nur Prüfstand)
 */
function createTwitchExtRouter({ secret, clientId, load = loadFromWinTracker, now = () => Date.now(), extraOrigins = [] } = {}) {
  const router = express.Router();
  const origins = new Set([...(clientId ? [`https://${clientId}.ext-twitch.tv`] : []), ...extraOrigins]);

  router.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && origins.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Headers', 'Authorization');
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Max-Age', '600');
    }
    res.vary('Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  router.use((req, res, next) => {
    if (!secret) return res.status(503).json({ error: 'Twitch-Erweiterung nicht eingerichtet', code: 'not_configured' });
    const m = /^Bearer\s+(\S+)$/.exec(req.get('authorization') || '');
    const payload = m ? verifyExtensionJwt(m[1], secret, now()) : null;
    if (!payload) return res.status(401).json({ error: 'Token ungültig', code: 'bad_token' });
    req.ext = payload;
    res.set('Cache-Control', 'no-store');
    next();
  });

  const cache = new Map(); // channelId → { at, value }
  function cached(channelId) {
    const t = now();
    const hit = cache.get(channelId);
    if (hit && t - hit.at < CACHE_MS) return hit.value;
    const value = load(channelId);
    cache.set(channelId, { at: t, value });
    if (cache.size > CACHE_MAX) for (const [k, v] of cache) if (t - v.at >= CACHE_MS) cache.delete(k);
    return value;
  }

  router.get('/panel', (req, res) => {
    try {
      const { tracker, state } = cached(String(req.ext.channel_id));
      res.json({ ok: true, tracker, state, at: now() });
    } catch (e) {
      console.error('[twitch-ext] Panel:', e.message);
      res.status(500).json({ error: 'Etwas ist schiefgelaufen.', code: 'generic' });
    }
  });

  // Nur der Streamer (und seine Mods) sehen die Einstellungsseite — ein Zuschauer-Token reicht hier nicht
  router.get('/status', (req, res) => {
    if (!['broadcaster', 'moderator'].includes(req.ext.role)) return res.status(403).json({ error: 'Nur für den Kanal', code: 'not_broadcaster' });
    try {
      const { tracker, state } = cached(String(req.ext.channel_id));
      res.json({
        ok: true,
        tracker,
        hasAccount: !!state?.hasAccount,
        playerName: state?.playerName || null,
        playerTag: state?.playerTag || null,
        trackMode: state?.settings?.trackMode || null,
        setupUrl: `${siteUrl()}/clash-royale/win-tracker`,
        infoUrl: `${siteUrl()}/tools/win-tracker`,
      });
    } catch (e) {
      console.error('[twitch-ext] Status:', e.message);
      res.status(500).json({ error: 'Etwas ist schiefgelaufen.', code: 'generic' });
    }
  });

  return router;
}

module.exports = { createTwitchExtRouter, CACHE_MS };
