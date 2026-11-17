// obsSetup.js — was die Zentrale in OBS anlegt und wie sie es aktuell hält (über request() aus obsClient.js).
//
// Jede Quelle hat einen festen Namen („vnmvalentin · …“, unabhängig von der Sprache) — daran findet die Zentrale sie
// beim nächsten Mal wieder. Neu angelegt wird sie in der gewählten Szene mit passender Größe; eine vorhandene bekommt
// nur den aktuellen Link (die Größe, die der Streamer selbst eingestellt hat, bleibt) und wird neu geladen.

export const OBS_SOURCE_NAMES = {
  twitch: "vnmvalentin · Twitch-Overlays",
  winChallenge: "vnmvalentin · Win Challenge",
  winTracker: "vnmvalentin · Win Tracker",
  viewerGames: "vnmvalentin · Viewer Games",
};
export const OBS_TOOLS = Object.keys(OBS_SOURCE_NAMES);
const BROWSER = "browser_source";
const NOT_FOUND = "request_600";

/** Win Tracker ohne feste Größe: Karte 310 px breit, Höhe je nach Inhalt — mit Luft, der Rest ist durchsichtig. */
const WT_AUTO = [360, 640];
/** Feste Größe des Win Trackers: rundum etwa 25 px mehr (wie es der Editor empfiehlt). */
const WT_MARGIN = 50;

/**
 * Größe der Browserquelle.
 * @param {string} tool
 * @param {{ width: number, height: number }|null} canvas  Leinwand aus OBS (GetVideoSettings)
 * @param {object} [wtSettings]  Einstellungen des Win Trackers (overlayWidth/-Height, overlayScale)
 * @returns {[number, number]}
 */
export function sourceSize(tool, canvas, wtSettings) {
  if (tool === "viewerGames") return [400, 820];
  if (tool === "winTracker") {
    const w = Number(wtSettings && wtSettings.overlayWidth) || 0;
    const h = Number(wtSettings && wtSettings.overlayHeight) || 0;
    if (w || h) return [(w || WT_AUTO[0]) + WT_MARGIN, (h || WT_AUTO[1]) + WT_MARGIN];
    const scale = Math.min(3, Math.max(0.5, (Number(wtSettings && wtSettings.overlayScale) || 100) / 100));
    return [Math.round(WT_AUTO[0] * scale), Math.round(WT_AUTO[1] * scale)];
  }
  // Twitch-Overlays und Win Challenge füllen die Leinwand und skalieren sich selbst darauf
  const cw = Math.round(Number(canvas && canvas.width)) || 1920;
  const ch = Math.round(Number(canvas && canvas.height)) || 1080;
  return [cw, ch];
}

/** Version, Szenen, aktuelle Szene und Leinwand. */
export async function obsInfo(request) {
  const [version, scenes, video] = await Promise.all([
    request("GetVersion"),
    request("GetSceneList"),
    request("GetVideoSettings").catch(() => ({})),
  ]);
  const list = Array.isArray(scenes.scenes) ? scenes.scenes : [];
  // OBS liefert die Szenen von unten nach oben (sceneIndex) — für die Auswahl in der Reihenfolge der Szenen-Liste
  const names = [...list].sort((a, b) => (b.sceneIndex || 0) - (a.sceneIndex || 0)).map((s) => s.sceneName);
  return {
    obsVersion: version.obsVersion || "",
    scenes: names,
    currentScene: scenes.currentProgramSceneName || names[0] || "",
    canvas: { width: Number(video.baseWidth) || 1920, height: Number(video.baseHeight) || 1080 },
  };
}

/**
 * Welche unserer Quellen es in OBS schon gibt und ob ihr Link noch stimmt.
 * @param {Record<string, string>} expected  Werkzeug → aktueller Overlay-Link (fehlt = unbekannt)
 * @returns {Promise<Record<string, { exists: boolean, upToDate: boolean|null }>>}
 */
export async function inspectSources(request, expected = {}) {
  const { inputs } = await request("GetInputList", { inputKind: BROWSER });
  const names = new Set((inputs || []).map((i) => i.inputName));
  const out = {};
  for (const tool of OBS_TOOLS) {
    const name = OBS_SOURCE_NAMES[tool];
    if (!names.has(name)) {
      out[tool] = { exists: false, upToDate: null };
      continue;
    }
    let url = "";
    try {
      url = (await request("GetInputSettings", { inputName: name })).inputSettings?.url || "";
    } catch { /* ohne Link: unbekannt */ }
    out[tool] = { exists: true, upToDate: expected[tool] ? url === expected[tool] : null };
  }
  return out;
}

/**
 * Quelle anlegen oder auf den aktuellen Link bringen.
 * @returns {Promise<{ action: "created"|"updated"|"added" }>}  added = gab es, jetzt auch in dieser Szene
 */
export async function ensureSource(request, { tool, url, size, scene }) {
  const name = OBS_SOURCE_NAMES[tool];
  if (!name) throw new Error(`unbekanntes Werkzeug: ${tool}`);
  const { inputs } = await request("GetInputList", { inputKind: BROWSER });
  const exists = (inputs || []).some((i) => i.inputName === name);

  if (!exists) {
    const inputSettings = { url, width: size[0], height: size[1] };
    // Alerts und Subathon machen Töne: über OBS geleitet, lassen sie sich im Audio-Mixer regeln
    if (tool === "twitch") inputSettings.reroute_audio = true;
    await request("CreateInput", { sceneName: scene, inputName: name, inputKind: BROWSER, inputSettings, sceneItemEnabled: true });
    return { action: "created" };
  }

  await request("SetInputSettings", { inputName: name, inputSettings: { url }, overlay: true });
  let action = "updated";
  try {
    await request("GetSceneItemId", { sceneName: scene, sourceName: name });
  } catch (e) {
    if (e.code !== NOT_FOUND) throw e;
    await request("CreateSceneItem", { sceneName: scene, sourceName: name, sceneItemEnabled: true });
    action = "added";
  }
  // Neu laden, damit OBS den neuen Link sofort zeigt (ältere OBS kennen den Knopf evtl. nicht — dann eben beim
  // nächsten Szenenwechsel)
  try {
    await request("PressInputPropertiesButton", { inputName: name, propertyName: "refreshnocache" });
  } catch { /* nicht schlimm */ }
  return { action };
}
