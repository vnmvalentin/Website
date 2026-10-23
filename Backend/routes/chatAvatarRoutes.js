// chatAvatarRoutes.js — Profilbilder von Chattern für die 3D-Stream-Szenen (Murmelkopf der Tänzer
// bzw. des Kinopublikums). Öffentlich, ohne Login: GET /api/chat-avatars?ids=1,2&logins=a,b
// → { ids: { "1": url|null }, logins: { "a": url|null } }. Abfrage per App-Token (wie /api/used-by),
// Ergebnis 12 h im Speicher; Twitch wird höchstens 60-mal pro Minute gefragt.
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
const { getAppToken, resetAppToken } = require("./usedByRoutes");

const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_CACHE = 5000;
const MAX_PER_REQUEST = 100;
const HELIX_PER_MIN = 60;

const cache = new Map();     // "id:123" | "login:name" → { url, ts }
let helixCalls = [];

function remember(key, url) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { url, ts: Date.now() });
}

/** Ein Helix-Aufruf für bis zu 100 IDs oder Logins; trägt Treffer und Fehlanzeigen in den Speicher ein. */
async function lookup(kind, values) {
  if (!values.length || !process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return;
  const now = Date.now();
  helixCalls = helixCalls.filter((t) => now - t < 60_000);
  if (helixCalls.length >= HELIX_PER_MIN) return;
  helixCalls.push(now);
  const token = await getAppToken();
  const qs = values.map((v) => `${kind}=${encodeURIComponent(v)}`).join("&");
  const res = await fetch(`https://api.twitch.tv/helix/users?${qs}`, {
    headers: { "Client-Id": process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) { resetAppToken(); return; }
  if (!res.ok) return;
  const data = await res.json();
  const found = new Map((data.data || []).map((u) => [kind === "id" ? String(u.id) : String(u.login).toLowerCase(), String(u.profile_image_url || "").replace("300x300", "150x150") || null]));
  for (const v of values) remember(`${kind}:${v}`, found.get(v) || null);
}

function createChatAvatarRouter() {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const ids = [...new Set(String(req.query.ids || "").split(",").filter((x) => /^\d{1,20}$/.test(x)))].slice(0, MAX_PER_REQUEST);
    const logins = [...new Set(String(req.query.logins || "").toLowerCase().split(",").filter((x) => /^[a-z0-9_]{2,25}$/.test(x)))].slice(0, MAX_PER_REQUEST);
    const fresh = (key) => { const e = cache.get(key); return e && Date.now() - e.ts < TTL_MS; };
    try {
      await Promise.all([
        lookup("id", ids.filter((v) => !fresh(`id:${v}`))),
        lookup("login", logins.filter((v) => !fresh(`login:${v}`))),
      ]);
    } catch (e) {
      console.error("[ChatAvatars] Twitch-Abfrage fehlgeschlagen:", e.message);
    }
    const pick = (kind, list) => Object.fromEntries(list.map((v) => [v, cache.get(`${kind}:${v}`)?.url ?? null]));
    res.set("Cache-Control", "public, max-age=600");
    res.json({ ids: pick("id", ids), logins: pick("login", logins) });
  });

  return router;
}

module.exports = { createChatAvatarRouter };
