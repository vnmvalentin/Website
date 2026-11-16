// ui/settings.js — persönliche Einstellungen von adVentures (nur in diesem Browser, localStorage). Renderer, Runner und
// Sound lesen sie bei jedem Bild/Klang neu — eine Änderung im Pausenmenü wirkt also sofort, ohne Neustart.

import { isLowGfx } from "../../../utils/lowGfx";
import { isTouchDevice } from "./touchDevice.js";

const KEY = "av-settings";

// view: "3d" (render3d/, der Standard seit November 2026) oder "2d" (der alte Zeichner). Wer nichts gewählt hat, bekommt
// 3D — außer die Grafik läuft auf dem Gerät nur per Software (Sparmodus), dann 2D. Geht 3D gar nicht, fällt der Runner
// von selbst auf 2D zurück.
// volume 0.35 statt 0.5 seit 16.11.2026 (Rückmeldung: „bisschen laut“); volumeBefore merkt sich den Wert vor „Ton aus“.
// gfx: Bildqualität der 3D-Ansicht — "auto" (siehe quality3d), "hoch" (schön) oder "fluessig" (Handy-Stufe).
const DEFAULTS = { volume: 0.35, volumeBefore: 0, damageNumbers: true, shake: true, hitstop: true, gfx: "auto" };

let current = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = { ...DEFAULTS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
    if (merged.view !== "3d" && merged.view !== "2d") merged.view = defaultView();
    return merged;
  } catch {
    return { ...DEFAULTS, view: defaultView() };
  }
}

function defaultView() {
  try { return isLowGfx() ? "2d" : "3d"; } catch { return "2d"; }
}

export function getSettings() {
  return current;
}

export function updateSettings(patch) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* privates Fenster o. Ä. — gilt dann nur bis zum Neuladen */ }
  for (const fn of listeners) fn(current);
}

export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Stufe für render3d/scene3d.js setQuality: "hoch" (volle Schärfe, Konturen), "handy" (Schärfe begrenzt, ohne Konturen,
 * weniger Splitter — für Handys und Tablets) oder "spar" (Grafik nur per Software: 60 % Auflösung, ohne Licht).
 * Automatisch: Software-Grafik → spar, Touch-Gerät → handy, sonst hoch. Wer selbst wählt, bekommt hoch oder handy.
 */
export function quality3d(settings = current) {
  if (settings.gfx === "hoch") return "hoch";
  if (settings.gfx === "fluessig") return "handy";
  try {
    if (isLowGfx()) return "spar";
    return isTouchDevice() ? "handy" : "hoch";
  } catch {
    return "hoch";
  }
}
