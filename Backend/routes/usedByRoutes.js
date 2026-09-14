// usedByRoutes.js — öffentliche Liste der Streamer, die die Seite/Tools nutzen,
// inkl. Profilbild + Live-Status (client_credentials App-Token, kurz gecached).
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const USED_BY_STREAMERS = [
  { name: "BigSpinCR", login: "bigspincr" },
  { name: "xopxsam", login: "xopxsam" },
  { name: "DOoOMcr", login: "dooomcr" },
  { name: "Vinc", login: "vinc" },
  { name: "Tryaz", login: "tryaz" },
  { name: "mortenroyale", login: "mortenroyale" },
];

let appToken = null;
let tokenExpiresAt = 0;

async function getAppToken() {
  if (appToken && Date.now() < tokenExpiresAt) return appToken;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Twitch-Token-Fehler: ${res.status}`);
  const data = await res.json();
  appToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(0, (data.expires_in || 0) - 300) * 1000;
  return appToken;
}

let cache = { data: null, ts: 0 };
const CACHE_TTL_MS = 60 * 1000;

async function getUsedByWithLiveStatus() {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;

  let liveLogins = new Set();
  let avatarByLogin = new Map();
  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
    try {
      const token = await getAppToken();
      const streamParams = USED_BY_STREAMERS.map((s) => `user_login=${encodeURIComponent(s.login)}`).join("&");
      const userParams = USED_BY_STREAMERS.map((s) => `login=${encodeURIComponent(s.login)}`).join("&");
      const [streamsRes, usersRes] = await Promise.all([
        fetch(`https://api.twitch.tv/helix/streams?${streamParams}`, {
          headers: { "Client-Id": process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
        }),
        fetch(`https://api.twitch.tv/helix/users?${userParams}`, {
          headers: { "Client-Id": process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
        }),
      ]);

      if (streamsRes.status === 401 || usersRes.status === 401) {
        appToken = null;
      } else {
        if (streamsRes.ok) {
          const data = await streamsRes.json();
          liveLogins = new Set((data.data || []).map((s) => s.user_login.toLowerCase()));
        }
        if (usersRes.ok) {
          const data = await usersRes.json();
          avatarByLogin = new Map((data.data || []).map((u) => [u.login.toLowerCase(), u.profile_image_url]));
        }
      }
    } catch (e) {
      console.error("[UsedBy] Twitch-Check fehlgeschlagen:", e.message);
    }
  }

  const result = USED_BY_STREAMERS.map((s) => ({
    name: s.name,
    login: s.login,
    avatar: avatarByLogin.get(s.login.toLowerCase()) || null,
    live: liveLogins.has(s.login.toLowerCase()),
  }));
  cache = { data: result, ts: Date.now() };
  return result;
}

function createUsedByRouter() {
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      res.json(await getUsedByWithLiveStatus());
    } catch (e) {
      res.json(USED_BY_STREAMERS.map((s) => ({ name: s.name, login: s.login, avatar: null, live: false })));
    }
  });

  return router;
}

module.exports = { createUsedByRouter };
