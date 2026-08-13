// twitchFollowers.js — Follower-Gesamtzahlen für beliebige Kanäle.
//
// helix/channels/followers gibt die Einzel-Follower nur dem Kanal selbst bzw.
// seinen Moderatoren heraus. Das Feld "total" liefert Twitch dagegen jedem —
// auch einem App-Token aus client_credentials. Genau das braucht das
// Admin-Dashboard: es kennt die Streamer nur über ihre Twitch-ID und hat
// keinen ihrer Tokens.
//
// Batching gibt es bei diesem Endpunkt nicht — eine Anfrage pro Kanal. Deshalb
// zwei Bremsen: ein Zwischenspeicher pro Kanal und eine begrenzte Zahl
// gleichzeitiger Anfragen. Bei 150 Einträgen sind das 150 Punkte des
// Helix-Limits (800/Minute, gilt pro Client-ID über alle Streamer zusammen),
// also nur alle 15 Minuten statt bei jedem Öffnen des Dashboards.
const CACHE_TTL_MS = 15 * 60 * 1000;
const CONCURRENCY = 6;
const TIMEOUT_MS = 8000;

let appToken = null;
let appTokenExpiresAt = 0;

// twitchId → { count: number|null, ts: number }
const cache = new Map();

async function getAppToken(force = false) {
  if (!force && appToken && Date.now() < appTokenExpiresAt) return appToken;
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Twitch-Token-Fehler: ${res.status}`);
  const data = await res.json();
  appToken = data.access_token || null;
  appTokenExpiresAt = Date.now() + Math.max(0, (data.expires_in || 0) - 300) * 1000;
  return appToken;
}

/** Eine Kanal-Abfrage. @returns {Promise<number|null>} null bei Fehler */
async function fetchOne(twitchId, token) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(twitchId)}&first=1`,
      {
        headers: {
          "Client-Id": process.env.TWITCH_CLIENT_ID || "",
          Authorization: `Bearer ${token}`,
        },
        signal: ctrl.signal,
      }
    );
    // 401 heißt: App-Token abgelaufen. Einmal erneuern und erneut versuchen —
    // sonst käme für alle Kanäle des Durchlaufs "unbekannt" zurück.
    if (res.status === 401) {
      const fresh = await getAppToken(true);
      if (!fresh || fresh === token) return null;
      return fetchOne(twitchId, fresh);
    }
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.total === "number" ? data.total : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Follower-Zahlen für mehrere Kanäle.
 *
 * @param {string[]} twitchIds
 * @param {{ maxAgeMs?: number }} [opts] maxAgeMs 0 erzwingt frische Zahlen
 * @returns {Promise<Record<string, number|null>>} null = unbekannt (Fehler,
 *   gelöschter Kanal oder fehlende Zugangsdaten)
 */
async function getFollowerCounts(twitchIds, opts = {}) {
  const maxAge = typeof opts.maxAgeMs === "number" ? opts.maxAgeMs : CACHE_TTL_MS;
  const ids = [...new Set((twitchIds || []).map(String).filter((id) => /^\d+$/.test(id)))];
  const out = {};
  const now = Date.now();

  const stale = [];
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && now - hit.ts < maxAge) out[id] = hit.count;
    else stale.push(id);
  }
  if (stale.length === 0) return out;

  let token = null;
  try {
    token = await getAppToken();
  } catch (e) {
    console.error("[twitchFollowers] App-Token fehlgeschlagen:", e.message);
  }
  if (!token) {
    // Ohne Token bleibt der letzte bekannte Stand besser als gar nichts.
    for (const id of stale) out[id] = cache.get(id)?.count ?? null;
    return out;
  }

  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, stale.length) }, async () => {
      while (cursor < stale.length) {
        const id = stale[cursor++];
        const count = await fetchOne(id, token);
        // Fehlschläge nicht als Ergebnis merken: sonst stünde 15 Minuten lang
        // "unbekannt" da, obwohl der nächste Versuch längst klappen würde.
        if (count !== null) cache.set(id, { count, ts: Date.now() });
        out[id] = count !== null ? count : (cache.get(id)?.count ?? null);
      }
    })
  );

  return out;
}

module.exports = { getFollowerCounts };
