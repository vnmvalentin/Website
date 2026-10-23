// profile/profileRoutes.js — öffentliches Profil (/u/<login>): Erfolge aus allen Bereichen der Seite auf einer teilbaren
// Seite. Nur wer es unter /profile einschaltet, bekommt eine (opt-in, profileStore.js).
//
//   GET  /api/public-profile/me          eigene Einstellung { enabled, login }
//   PUT  /api/public-profile/me          { enabled } — ein-/ausschalten
//   GET  /api/public-profile/u/:login    das Profil (404, wenn es nicht eingeschaltet ist)
//
// Jeder Abschnitt kommt aus einer eigenen Quelle (index.js reicht sie herein); fehlt eine oder wirft sie, fehlt nur
// dieser Abschnitt. Abschnitte ohne Inhalt (nie gespielt) werden weggelassen.
'use strict';

const express = require('express');

const LOGIN_RE = /^[a-z0-9_]{2,25}$/;
const CACHE_MS = 60 * 1000;
// Profilbilder nur vom Twitch-CDN — sonst könnte man über das Profil beliebige Adressen ausliefern lassen
const AVATAR_RE = /^https:\/\/static-cdn\.jtvnw\.net\/[A-Za-z0-9._\-/]+$/;

const SECTIONS = ['winTracker', 'tournaments', 'seedRunners', 'adventure', 'garden'];

/**
 * @param twitchId
 * @param sources  { winTracker(id), tournaments(id), seedRunners(id), adventure(id), garden(id) } → Daten oder null
 */
function buildProfile(twitchId, sources = {}) {
  const out = {};
  for (const key of SECTIONS) {
    try {
      const v = typeof sources[key] === 'function' ? sources[key](twitchId) : null;
      if (v && !(Array.isArray(v) && v.length === 0)) out[key] = v;
    } catch (e) {
      console.error(`[profile] ${key}:`, e.message);
    }
  }
  return out;
}

function createProfileRouter({ requireAuth, store, getSources }) {
  const router = express.Router();
  const cache = new Map(); // login → { at, body }

  router.get('/me', requireAuth, (req, res) => {
    const e = store.get(req.twitchId);
    res.json({ enabled: !!e?.enabled, login: String(req.twitchLogin || '').toLowerCase() });
  });

  router.put('/me', requireAuth, (req, res) => {
    const login = String(req.twitchLogin || '').toLowerCase();
    if (!LOGIN_RE.test(login)) return res.status(400).json({ error: 'Kein gültiger Twitch-Name in der Sitzung.' });
    const displayName = String(req.body?.displayName || '').replace(/[\u0000-\u001f<>]/g, '').trim();
    // Der Anzeigename ist bei Twitch der Login in anderer Schreibweise (oder ein lokalisierter Name) — sonst den Login
    const name = displayName && displayName.length <= 25 ? displayName : login;
    const avatar = AVATAR_RE.test(String(req.body?.avatar || '')) ? String(req.body.avatar) : '';
    const e = store.set(req.twitchId, login, !!req.body?.enabled, { displayName: name, avatar });
    cache.delete(login);
    res.json({ enabled: e.enabled, login: e.login });
  });

  router.get('/u/:login', (req, res) => {
    const login = String(req.params.login || '').toLowerCase();
    if (!LOGIN_RE.test(login)) return res.status(404).json({ error: 'Dieses Profil gibt es nicht.' });
    const hit = cache.get(login);
    if (hit && Date.now() - hit.at < CACHE_MS) return res.json(hit.body);
    const entry = store.byLogin(login);
    if (!entry) return res.status(404).json({ error: 'Dieses Profil gibt es nicht oder es ist nicht öffentlich.' });
    let sources = {};
    try { sources = getSources?.() || {}; } catch { sources = {}; }
    const body = { login: entry.login, displayName: entry.displayName, avatar: entry.avatar, sections: buildProfile(entry.twitchId, sources) };
    cache.set(login, { at: Date.now(), body });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(body);
  });

  return router;
}

module.exports = { createProfileRouter, buildProfile, LOGIN_RE };
