// winchallengeGames.js — Spielcover für die Challenges des Win-Challenge-Overlays.
//
// Jede Challenge kann ein Cover tragen ({ id, name, url }), das im Overlay klein vor
// dem Namen steht. Die Bilder kommen aus der Twitch-Kategoriesuche; gespeichert wird
// nur die Adresse, kein Bild.
//
// Die Adresse wird bei JEDEM Schreibweg geprüft (sanitizeItems): Challenges dürfen
// auch Mods über den Control-Link bearbeiten, und das Overlay läuft als Browserquelle
// im OBS des Streamers. Ohne Prüfung ließe sich dort jede beliebige Adresse laden.
const { helix, TwitchError } = require("../streamTool/lib/twitchHelix");
const { getAppToken } = require("../lib/twitchFollowers");

// Nur Twitch-Boxart: ein einzelnes Pfadsegment, Größe am Ende (…/516575-144x192.jpg,
// …/27471_IGDB-144x192.jpg). Gegenstück im Frontend: itemIconUrl in overlayUtils.js.
const ICON_URL_RE =
  /^https:\/\/static-cdn\.jtvnw\.net\/ttv-boxart\/[A-Za-z0-9_%.-]{1,80}-\d{1,4}x\d{1,4}\.(?:jpg|png)$/;

// Die Suche liefert 52x72 — für große Schrift und skalierte Overlays zu grob.
const COVER_SIZE = "144x192";

const MIN_QUERY = 2;
const MAX_QUERY = 50;
const MAX_RESULTS = 8;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 300;

// Suchtext (klein) → { ts, games }
const cache = new Map();

/** @returns {{id: string, name: string, url: string}|null} null = kein gültiges Cover */
function sanitizeItemIcon(icon) {
  if (!icon || typeof icon !== "object") return null;
  const url = typeof icon.url === "string" ? icon.url : "";
  if (!ICON_URL_RE.test(url)) return null;
  return {
    id: String(icon.id ?? "").replace(/\D/g, "").slice(0, 20),
    name: String(icon.name ?? "").slice(0, 100),
    url,
  };
}

/**
 * Prüft das Cover jeder Challenge; alles andere an den Einträgen bleibt unberührt.
 * @param {unknown} items
 * @returns {Array}
 */
function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    if (!it || typeof it !== "object" || it.icon === undefined) return it;
    const { icon: rawIcon, ...rest } = it;
    const icon = sanitizeItemIcon(rawIcon);
    return icon ? { ...rest, icon } : rest;
  });
}

function toCoverUrl(boxArtUrl) {
  return String(boxArtUrl || "").replace(
    /-(?:\d+x\d+|\{width\}x\{height\})(\.\w+)$/,
    `-${COVER_SIZE}$1`
  );
}

/**
 * Sucht Spiele in den Twitch-Kategorien.
 * @param {string} rawQuery
 * @returns {Promise<Array<{id: string, name: string, url: string}>>}
 * @throws {TwitchError} bei fehlenden Zugangsdaten oder Twitch-Fehlern
 */
async function searchGames(rawQuery) {
  const query = String(rawQuery || "").trim().slice(0, MAX_QUERY);
  if (query.length < MIN_QUERY) return [];

  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.games;

  const path = `search/categories?first=${MAX_RESULTS}&query=${encodeURIComponent(query)}`;
  let token = await getAppToken();
  if (!token) throw new TwitchError("Twitch-Zugangsdaten fehlen im Backend.", 503);

  let data;
  try {
    data = await helix(path, token);
  } catch (e) {
    // 401 heißt: App-Token abgelaufen — einmal erneuern und erneut versuchen
    if (e?.status !== 401) throw e;
    token = await getAppToken(true);
    if (!token) throw e;
    data = await helix(path, token);
  }

  const games = (Array.isArray(data?.data) ? data.data : [])
    .map((g) => sanitizeItemIcon({ id: g.id, name: g.name, url: toCoverUrl(g.box_art_url) }))
    .filter(Boolean);

  // Map behält die Einfügereihenfolge: der erste Schlüssel ist der älteste
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { ts: Date.now(), games });
  return games;
}

module.exports = { searchGames, sanitizeItems, sanitizeItemIcon };
