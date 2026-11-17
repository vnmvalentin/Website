// zentraleApi.js — Abrufe der Streamer-Zentrale.
//
// getStatus() liest nur (Backend/streamerZentrale). Die Overlay-Links holt der Assistent dagegen über die „me“-Abrufe
// der Werkzeuge selbst — die legen beim ersten Mal den Eintrag samt Link an. Das passiert erst, wenn jemand im
// Assistenten ein Werkzeug ausdrücklich wählt.

async function getJson(path) {
  const res = await fetch(path, { credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json?.code;
    throw err;
  }
  return json;
}

/** Stand aller Werkzeuge (nur lesen). */
export const getStatus = () => getJson("/api/streamer-zentrale");

/**
 * Discord-Server, auf denen man Admin ist, samt botPresent.
 * @returns {Promise<{ linked: boolean, guilds: object[], down?: boolean }>}
 */
export async function getDiscord() {
  try {
    const d = await getJson("/api/discord/guilds");
    return { linked: true, guilds: Array.isArray(d.guilds) ? d.guilds : [] };
  } catch (e) {
    if (e.status === 401) return { linked: false, guilds: [] };
    return { linked: true, guilds: [], down: true };
  }
}

/**
 * Overlay-Adresse (Pfad) eines Werkzeugs — legt den Eintrag beim ersten Mal an. Beim Win Tracker kommen seine
 * Einstellungen mit (feste Breite/Höhe, Größe), daraus rechnet der OBS-Knopf die Größe der Browserquelle.
 * @param {"twitch"|"winChallenge"|"winTracker"|"viewerGames"} tool
 * @param {string} userId  Twitch-ID (die Win Challenge fragt nach ihr)
 * @returns {Promise<{ path: string, settings?: object }>}
 */
export async function fetchOverlayInfo(tool, userId) {
  if (tool === "twitch") {
    const d = await getJson("/api/stream-tool/me");
    return { path: `/twitch-tools/overlay/${d.overlayKey}` };
  }
  if (tool === "winChallenge") {
    const d = await getJson(`/api/winchallenge/${encodeURIComponent(userId)}`);
    return { path: `/WinChallengeOverlay/${d.overlayKey}` };
  }
  if (tool === "winTracker") {
    const d = await getJson("/api/cr-wintracker/me");
    return { path: `/clash-royale/win-tracker/overlay/${d.overlayKey}`, settings: d.settings || {} };
  }
  if (tool === "viewerGames") {
    const d = await getJson("/api/cr-viewer-games/me");
    return { path: `/clash/viewer-games/overlay/${d.overlayKey}` };
  }
  throw new Error("unbekanntes Werkzeug");
}

/** Text in die Zwischenablage — mit Rückfall für Browser ohne Clipboard-API. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
