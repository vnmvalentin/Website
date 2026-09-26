// Einstellungen für Ton und Effekte — nur Darstellung, die Sim weiß nichts davon.
//
// Ein kleiner Speicher außerhalb von React, damit Rennen, Übungsbereich und die Einstellungsleiste
// denselben Stand sehen (useSyncExternalStore in FxPanel.jsx). Gespeichert wird im Browser; ist der
// Speicher gesperrt (privates Fenster), gelten die Werte bis zum Neuladen.
//
// "Bildschütteln" ist standardmäßig aus, wenn das System "Bewegung reduzieren" meldet.
//
// Dazu die Anzeige (26.09.2026): Minimap (Größe, Ecke, Ausschnitt) und die eigene Figurenfarbe. In einem Raum bekommt man die
// Wunschfarbe, wenn sie dort frei ist (Backend/seedRunners/roomManager.js) — die Figur trägt dann die Farbe des Raums.

/** Farben zur Auswahl — dieselben wie die Spielerfarben der Räume (Backend PLAYER_COLORS), damit Wunsch und Raum passen */
export const FIGUR_FARBEN = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6', '#a855f7', '#ec4899'];
export const MINIMAP_GROESSEN = ['aus', 'klein', 'mittel', 'gross'];
export const MINIMAP_ECKEN = ['or', 'ol', 'ur', 'ul'];
export const MINIMAP_ANSICHTEN = ['umgebung', 'ganz'];
const aus = (liste, wert, standard) => (liste.includes(wert) ? wert : standard);

const KEY = 'seedrunners_fx';

const reducedMotion = () => {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const defaults = () => ({
  sound: true, volume: 0.6, shake: !reducedMotion(), particles: true,
  minimap: 'mittel', minimapEcke: 'or', minimapAnsicht: 'umgebung', farbe: null,
});

function load() {
  const base = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return base;
    return {
      sound: typeof raw.sound === 'boolean' ? raw.sound : base.sound,
      volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : base.volume,
      shake: typeof raw.shake === 'boolean' ? raw.shake : base.shake,
      particles: typeof raw.particles === 'boolean' ? raw.particles : base.particles,
      minimap: aus(MINIMAP_GROESSEN, raw.minimap, base.minimap),
      minimapEcke: aus(MINIMAP_ECKEN, raw.minimapEcke, base.minimapEcke),
      minimapAnsicht: aus(MINIMAP_ANSICHTEN, raw.minimapAnsicht, base.minimapAnsicht),
      farbe: FIGUR_FARBEN.includes(raw.farbe) ? raw.farbe : null,
    };
  } catch {
    return base;
  }
}

let state = load();
const listeners = new Set();

export const getFx = () => state;

export function setFx(patch) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* Speicher gesperrt: gilt nur für diese Sitzung */ }
  listeners.forEach((fn) => fn());
}

export function subscribeFx(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
