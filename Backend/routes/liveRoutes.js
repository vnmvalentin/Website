// liveRoutes.js — ist der eigene Kanal gerade live? Für den „Live"-Hinweis der Website und den Player der
// Startseite, der nur dann von selbst startet.
//
//   GET /api/live  → { live: boolean, title, game, viewers, startedAt }   (eine Minute zwischengespeichert)
//
// Fragt Twitch mit dem App-Token (routes/usedByRoutes.js). Ohne Zugangsdaten oder bei einem Fehler lautet die
// Antwort { live: false } — die Website zeigt dann einfach keinen Hinweis, statt etwas Falsches zu behaupten.
'use strict';

const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const { getAppToken, resetAppToken } = require('./usedByRoutes');

const CACHE_MS = 60 * 1000;
const OFFLINE = Object.freeze({ live: false, title: null, game: null, viewers: null, startedAt: null });

/** Antwort von helix/streams → das, was der Browser braucht. Leere Liste heißt offline. */
function toLiveState(body) {
  const s = Array.isArray(body?.data) ? body.data[0] : null;
  if (!s || s.type !== 'live') return OFFLINE;
  return {
    live: true,
    title: String(s.title || '').slice(0, 140) || null,
    game: String(s.game_name || '').slice(0, 80) || null,
    viewers: Number.isFinite(s.viewer_count) ? s.viewer_count : null,
    startedAt: s.started_at || null,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.userId            Twitch-ID des Kanals (STREAMER_TWITCH_ID)
 * @param {Function} [opts.fetchStreams]  nur für Tests: liefert die Antwort von helix/streams
 */
function createLiveRouter({ userId, fetchStreams } = {}) {
  const router = express.Router();
  let cache = { data: OFFLINE, ts: 0 };
  let pending = null;

  async function queryTwitch() {
    if (fetchStreams) return fetchStreams(userId);
    if (!userId || !process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return null;
    const token = await getAppToken();
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(userId)}`, {
      headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      resetAppToken();
      throw new Error('Twitch-Token abgelaufen');
    }
    if (!res.ok) throw new Error(`Twitch antwortet ${res.status}`);
    return res.json();
  }

  async function getState() {
    if (Date.now() - cache.ts < CACHE_MS) return cache.data;
    // Mehrere Aufrufe gleichzeitig teilen sich eine Anfrage an Twitch
    if (!pending) {
      pending = queryTwitch()
        .then((body) => { cache = { data: toLiveState(body), ts: Date.now() }; })
        .catch((e) => {
          console.error('[live] Twitch-Abfrage fehlgeschlagen:', e.message);
          // Bei einem Fehler den letzten Stand behalten, aber nach einer Minute erneut fragen
          cache = { data: cache.data, ts: Date.now() };
        })
        .finally(() => { pending = null; });
    }
    await pending;
    return cache.data;
  }

  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    res.json(await getState());
  });

  return router;
}

module.exports = { createLiveRouter, toLiveState };
