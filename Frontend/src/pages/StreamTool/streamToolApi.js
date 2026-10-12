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

/* ── Szenen: Probeläufe und Murmelbahn ────────────────────────────────────── */

const scenePost = (path, body) =>
  apiFetch(`/api/stream-tool/scenes/${path}`, { method: "POST", body: JSON.stringify(body || {}) });

/** Probezug: fährt ein, steigt alle zehn Sekunden ein Level auf (bis Level 4) und fährt ab. */
export const testHypeTrain = () => scenePost("hype/test");
/** Probe-Ansturm mit der angegebenen Zuschauerzahl. */
export const testRaidStorm = (viewers) => scenePost("storm/test", { viewers });
/** Flugzeug sofort losschicken. */
export const testPlane = () => scenePost("plane/test");

export const openMarbles = () => scenePost("marbles/open");
export const startMarbles = () => scenePost("marbles/start");
export const addMarbleBots = (count) => scenePost("marbles/bots", { count });

/** Laufende Szene beenden: 'hype' | 'storm' | 'plane' | 'marbles'. */
export const stopScene = (key) => apiFetch(`/api/stream-tool/scenes/${key}`, { method: "DELETE" });

/** Sieger der Murmelbahn melden — die erste Meldung zählt. */
export const reportMarbleWinner = (overlayKey, raceId, winnerId) =>
  apiFetch(`/api/stream-tool/overlay/${overlayKey}/marbles/result`, {
    method: "POST",
    body: JSON.stringify({ raceId, winnerId }),
  });

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
  // Hype Train: Level, Fortschritt und die Spitzen-Beitragenden
  "channel:read:hype_train",
  // Raid-Ansturm: Zuschauerliste, aus der die Namen der Raider geschätzt werden
  "moderator:read:chatters",
];
