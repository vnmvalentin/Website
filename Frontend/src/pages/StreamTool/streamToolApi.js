// API-Client für das Stream-Tool "Abstimmungen & Vorhersagen" (/api/stream-tool)
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || json?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.missingScopes = json?.missingScopes;
    throw err;
  }
  return json;
}

export const getMe = () => apiFetch("/api/stream-tool/me");

export const saveConfig = (config) =>
  apiFetch("/api/stream-tool/config", { method: "PUT", body: JSON.stringify({ config }) });

export const regenerateOverlayKey = () =>
  apiFetch("/api/stream-tool/overlay/regenerate", { method: "POST" });

/** Reicht den Twitch-Token zur Prüfung ans Backend weiter, das ihn verschlüsselt ablegt. */
export const connectTwitch = (token) =>
  apiFetch("/api/stream-tool/token", { method: "POST", body: JSON.stringify({ token }) });

export const disconnectTwitch = () => apiFetch("/api/stream-tool/token", { method: "DELETE" });

export const getLive = () => apiFetch("/api/stream-tool/live");

/** Holt Follower-/Abo-/Twitch-Ziele sofort neu, statt auf den 30-Sekunden-Takt zu warten. */
export const refreshGoals = () => apiFetch("/api/stream-tool/goals/refresh", { method: "POST" });

/** Probelauf des Raid-Moduls: spielt einen Clip des angegebenen Kanals im Overlay. */
export const testRaid = (login) =>
  apiFetch("/api/stream-tool/raid/test", { method: "POST", body: JSON.stringify({ login }) });

/** Laufenden Raid-Clip sofort beenden. */
export const stopRaid = () => apiFetch("/api/stream-tool/raid", { method: "DELETE" });

/** Zähler der Stream-Statistik auf null — die Sendung läuft weiter. */
export const resetStats = () => apiFetch("/api/stream-tool/stats/reset", { method: "POST" });

export const getOverlayData = (overlayKey) => apiFetch(`/api/stream-tool/overlay/${overlayKey}`);

/**
 * Zusatzrechte fürs Mitlesen. Bewusst NUR Leserechte: gestartet und beendet wird
 * alles direkt in Twitch, also muss niemand uns erlauben, seine Abstimmungen zu
 * verwalten.
 *
 * followers/subscriptions gehören zu den Ziel-Modulen. Fehlen sie, bleiben nur
 * diese beiden Overlays leer — der Rest funktioniert weiter.
 */
export const STREAM_TOOL_SCOPES = [
  "channel:read:polls",
  "channel:read:predictions",
  "moderator:read:followers",
  "channel:read:subscriptions",
  // Für die im Creator-Dashboard gesetzten Ziele
  "channel:read:goals",
];
