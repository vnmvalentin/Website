// ui/settings.js — persönliche Einstellungen von adVentures (nur in diesem Browser, localStorage). Renderer, Runner und
// Sound lesen sie bei jedem Bild/Klang neu — eine Änderung im Pausenmenü wirkt also sofort, ohne Neustart.

const KEY = "av-settings";
const DEFAULTS = { volume: 0.5, damageNumbers: true, shake: true, hitstop: true };

let current = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULTS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return { ...DEFAULTS };
  }
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
