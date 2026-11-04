// Persönliche Einstellungen der Clash-Royale-Minigames: Hintergrund und Lautstärke.
//
// Gilt nur für den eigenen Browser (localStorage) — das ist reine Geschmackssache, die
// Mitspieler nichts angeht und kein Konto braucht. Jeder Zugriff steckt in try/catch: im
// privaten Modus oder bei gesperrtem Speicher gelten einfach die Standardwerte.
//
// Bewusst eine .js-Datei ohne Komponenten (Fast Refresh, siehe components/avatars.js);
// der Provider sitzt in CrShell.jsx, das Fenster in CrSettingsModal.jsx.

import { createContext, useContext } from 'react';
import { isLowGfx } from '../../../utils/lowGfx';

// Hintergründe: aus src/assets/clashRoyale/backgrounds/ (4K-Originale) auf 1920×1080 zugeschnitten,
// leicht weichgezeichnet und als WebP nach bg/ gelegt, dazu 320×180-Vorschaubilder in bg/thumbs/.
// eager + ?url liefert nur die URL-Zeichenketten — geladen wird ein Bild erst, wenn es gewählt ist.
const FULL = import.meta.glob('/src/assets/clashRoyale/bg/*.webp', { eager: true, query: '?url', import: 'default' });
const THUMBS = import.meta.glob('/src/assets/clashRoyale/bg/thumbs/*.webp', { eager: true, query: '?url', import: 'default' });

const idOf = (path) => path.split('/').pop().replace(/\.webp$/, '');

/** Anzeigenamen der Hintergründe (Dateiname → Name); unbekannte Dateien bekommen den Dateinamen. */
const BG_NAMES = {
  evergreen: 'Clash Royale', battle_healer: 'Battle Healer', card_evolution: 'Card Evolution',
  ice_wizard: 'Ice Wizard', dagger_duchess: 'Dagger Duchess', goblin_queen: 'Goblin Queen',
  goblinstein: 'Goblinstein', lava_hound: 'Lava Hound', prince_victory: 'Prince',
  skeleton_king: 'Skeleton King', the_heist: 'The Heist',
};

export const BACKGROUNDS = Object.entries(FULL)
  .map(([path, url]) => {
    const id = idOf(path);
    const thumb = Object.entries(THUMBS).find(([p]) => idOf(p) === id)?.[1] || url;
    return { id, url, thumb, name: BG_NAMES[id] || id.replace(/_/g, ' ') };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** 'default' = das blaue Karo */
export const DEFAULT_BACKGROUND = 'default';

export const backgroundUrl = (id) => BACKGROUNDS.find(b => b.id === id)?.url || null;

const STORAGE_KEY = 'crMinigamesPrefs';
// animations: eigene Einstellung (Standard an) — bewusst NICHT an die System-Einstellung
// "Bewegung reduzieren" gekoppelt, siehe index.css (html[data-cr-anim="off"]).
// scene3d: 3D-Ansicht in Elixir Auction, Pyramidendraft, Angel Royale und Blindes Karussell (aus = alte 2D-Darstellung).
//
// Ohne Hardwarebeschleunigung (utils/lowGfx.js) starten animations und scene3d aus (autoLowGfx: true).
// Diese erzwungenen Werte werden NICHT gespeichert — sonst blieben sie aus, wenn die Beschleunigung wieder an
// ist. Schaltet man einen der beiden Schalter selbst um, gilt ab dann die eigene Wahl (gfxChoice: true).
export const DEFAULT_PREFS = { background: DEFAULT_BACKGROUND, volume: 0.5, animations: true, scene3d: true, autoLowGfx: false };

/** Schlüssel, deren eigenes Umschalten die automatische Grafik-Sparwahl beendet. */
export const GFX_PREF_KEYS = ['animations', 'scene3d'];

function readRaw() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function loadPrefs() {
  const lowGfx = isLowGfx();
  try {
    const raw = readRaw();
    const background = raw.background === DEFAULT_BACKGROUND || backgroundUrl(raw.background)
      ? raw.background : DEFAULT_BACKGROUND;
    const volume = typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1
      ? raw.volume : DEFAULT_PREFS.volume;
    const gfxChoice = raw.gfxChoice === true;
    const autoLowGfx = lowGfx && !gfxChoice;
    const animations = autoLowGfx ? false
      : typeof raw.animations === 'boolean' ? raw.animations : DEFAULT_PREFS.animations;
    const scene3d = autoLowGfx ? false
      : typeof raw.scene3d === 'boolean' ? raw.scene3d : DEFAULT_PREFS.scene3d;
    return { background, volume, animations, scene3d, autoLowGfx, ...(gfxChoice ? { gfxChoice } : {}) };
  } catch {
    return lowGfx ? { ...DEFAULT_PREFS, animations: false, scene3d: false, autoLowGfx: true } : { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try {
    const { autoLowGfx, ...toStore } = prefs;
    if (autoLowGfx) {
      // Erzwungene Aus-Werte nicht speichern — die zuvor gespeicherte Wahl bleibt stehen
      const raw = readRaw();
      for (const key of GFX_PREF_KEYS) toStore[key] = raw[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch { /* Komfort, kein Muss */ }
}

/** { prefs, setPref(key, value), openSettings() } — bereitgestellt von CrShell. */
export const CrPrefsContext = createContext({
  prefs: DEFAULT_PREFS,
  setPref: () => {},
  openSettings: () => {},
});

export const useCrPrefs = () => useContext(CrPrefsContext);
