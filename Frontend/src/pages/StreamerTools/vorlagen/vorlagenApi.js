// vorlagenApi.js — Community-Vorlagen der Overlay-Galerie (Backend/overlayVorlagen).
//
// Teilen liest den aktuellen Look über die Schnittstellen der Werkzeuge selbst. Übernehmen:
//  - Win Challenge und Twitch-Overlays: der Editor öffnet mit ?vorlage=u:<id>, holt die Vorlage und speichert sie
//    (wie die fertigen Looks) — dafür ist vorlageLink() da.
//  - Win Tracker (Revier Spur B, dort wird nichts umgebaut): direkt hier über seine vorhandene Einstellungs-
//    Schnittstelle (GET /me → Look-Felder ersetzen → PUT /settings), danach geht es in den Editor.
import { THEME_DEFAULTS } from "../../StreamTool/streamToolConfig.js";

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json?.code || (res.status === 401 ? "login" : "failed");
    throw err;
  }
  return json;
}

/** Felder des Looks je Overlay — dieselben wie STYLE_KEYS in Backend/overlayVorlagen/core.js. */
export const LOOK_KEYS = {
  winChallenge: [
    "boxBg", "headerBg", "itemBg", "textColor", "titleColor", "accent", "opacity", "headerOpacity", "itemOpacity",
    "timerOpacity", "counterOpacity", "borderRadius", "boxWidth", "titleAlign", "titleFontSize", "itemFontSize",
    "timerFontSize", "layout", "counterStyle", "headerProgress",
  ],
  twitch: ["style", "accent", "opacity", "glass", "radius", "font"],
  winTracker: [
    "overlayTheme", "royalePanel", "royalePattern", "squareCorners", "bgColor", "bgOpacity", "bgGradient", "bgColor2",
    "borderColor", "last5Style",
  ],
};

/** Nur die Look-Felder (undefined fällt weg). */
export function pickLook(tool, source) {
  const out = {};
  for (const k of LOOK_KEYS[tool] || []) if (source && source[k] !== undefined && source[k] !== null) out[k] = source[k];
  return out;
}

export const listVorlagen = (tool, sort = "beliebt") => call(`/api/vorlagen?tool=${encodeURIComponent(tool)}&sort=${sort}`).then((d) => d.vorlagen || []);
export const getVorlage = (id) => call(`/api/vorlagen/${encodeURIComponent(id)}`).then((d) => d.vorlage);
export const publishVorlage = (tool, title, style) => call("/api/vorlagen", { method: "POST", body: { tool, title, style } }).then((d) => d.vorlage);
export const markVorlageUsed = (id) => call(`/api/vorlagen/${encodeURIComponent(id)}/use`, { method: "POST" });
export const reportVorlage = (id) => call(`/api/vorlagen/${encodeURIComponent(id)}/report`, { method: "POST" });
export const removeVorlage = (id) => call(`/api/vorlagen/${encodeURIComponent(id)}`, { method: "DELETE" });
export const moderateVorlage = (id, action) => call(`/api/vorlagen/${encodeURIComponent(id)}/moderate`, { method: "POST", body: { action } });
export const reportedVorlagen = () => call("/api/vorlagen/gemeldet").then((d) => d.vorlagen || []);

/** Ob ein Werkzeug schon eingerichtet ist (Streamer-Zentrale, nur lesen) — sonst gibt es keinen eigenen Look. */
export async function toolInUse(tool) {
  const s = await call("/api/streamer-zentrale");
  return !!s?.tools?.[tool]?.used;
}

/** Der aktuelle Look des angemeldeten Nutzers in einem Overlay. */
export async function currentLook(tool, userId) {
  if (tool === "winChallenge") return pickLook(tool, (await call(`/api/winchallenge/${encodeURIComponent(userId)}`)).style);
  // Nie im Design-Menü gespeichert → es gilt der Standard-Look, und den sieht man ja auch
  if (tool === "twitch") return pickLook(tool, { ...THEME_DEFAULTS, ...((await call("/api/stream-tool/me")).config?.theme || {}) });
  if (tool === "winTracker") return pickLook(tool, (await call("/api/cr-wintracker/me")).settings || {});
  throw new Error("unbekanntes Overlay");
}

/** Adresse, unter der der Editor die Vorlage übernimmt (Win Challenge, Twitch-Overlays). */
export function vorlageLink(tool, id) {
  if (tool === "winChallenge") return `/WinChallenge-Overlay?vorlage=u:${id}`;
  if (tool === "twitch") return `/twitch-tools?vorlage=u:${id}`;
  return "/clash-royale/win-tracker";
}

/**
 * Win Tracker: Look übernehmen über PUT /api/cr-wintracker/settings. Die Route erwartet alle Einstellungen — deshalb
 * die aktuellen holen und nur die Look-Felder ersetzen.
 */
export async function applyWinTrackerLook(style) {
  const me = await call("/api/cr-wintracker/me");
  const settings = { ...(me.settings || {}), ...pickLook("winTracker", style) };
  await call("/api/cr-wintracker/settings", { method: "PUT", body: settings });
}

/** ?vorlage=u:<id> → id, sonst null. */
export function userVorlageId(param) {
  const m = /^u:([A-Za-z0-9_-]{4,20})$/.exec(String(param || ""));
  return m ? m[1] : null;
}
