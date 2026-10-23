// twitchHelix.js — schlanker Helix-Client für die Stream-Tools.
//
// Eigene Datei, weil inzwischen mehrere Stellen lesend auf Twitch zugreifen
// (Overlay-Route für Abstimmungen/Ziele, Raid-Erkennung für die Clips). Vorher
// lag der Aufruf in streamToolRoutes.js und wäre bei jedem weiteren Nutzer
// kopiert worden.
const CLIENT_ID = () => process.env.TWITCH_CLIENT_ID || "";
const TIMEOUT_MS = 8000;

class TwitchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Lesender Helix-Aufruf. Geschrieben wird nichts — das passiert in Twitch selbst. */
async function helix(pathAndQuery, token) {
  const clientId = CLIENT_ID();
  if (!clientId) throw new TwitchError("TWITCH_CLIENT_ID ist im Backend nicht gesetzt.", 500);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.twitch.tv/helix/${pathAndQuery}`, {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${token}`,
      },
      signal: ctrl.signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new TwitchError(data.message || `Twitch-Fehler ${res.status}`, res.status);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/** @returns {Promise<object|null>} Token-Info (user_id, login, scopes) oder null */
async function validateToken(token) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${token}` },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Schreibender Helix-Aufruf. Bisher las das Stream-Tool nur; die einzige
 * Ausnahme sind Kanalpunkte-Belohnungen, die die Seite selbst anlegt und deren
 * Einlösungen sie abschließt oder erstattet.
 * @returns {Promise<object>} Antwort (leer bei 204)
 */
async function helixWrite(method, pathAndQuery, token, body) {
  const clientId = CLIENT_ID();
  if (!clientId) throw new TwitchError("TWITCH_CLIENT_ID ist im Backend nicht gesetzt.", 500);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.twitch.tv/helix/${pathAndQuery}`, {
      method,
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new TwitchError(data.message || `Twitch-Fehler ${res.status}`, res.status);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { helix, helixWrite, validateToken, TwitchError };
