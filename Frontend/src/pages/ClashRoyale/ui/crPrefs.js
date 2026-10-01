// Persönliche Einstellungen der Clash-Royale-Minigames: Hintergrund und Lautstärke.
//
// Gilt nur für den eigenen Browser (localStorage) — das ist reine Geschmackssache, die
// Mitspieler nichts angeht und kein Konto braucht. Jeder Zugriff steckt in try/catch: im
// privaten Modus oder bei gesperrtem Speicher gelten einfach die Standardwerte.
//
// Bewusst eine .js-Datei ohne Komponenten (Fast Refresh, siehe components/avatars.js);
// der Provider sitzt in CrShell.jsx, das Fenster in CrSettingsModal.jsx.

import { createContext, useContext } from 'react';

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
export const DEFAULT_PREFS = { background: DEFAULT_BACKGROUND, volume: 0.5, animations: true };

export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const background = raw.background === DEFAULT_BACKGROUND || backgroundUrl(raw.background)
      ? raw.background : DEFAULT_BACKGROUND;
    const volume = typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 1
      ? raw.volume : DEFAULT_PREFS.volume;
    const animations = typeof raw.animations === 'boolean' ? raw.animations : DEFAULT_PREFS.animations;
    return { background, volume, animations };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* Komfort, kein Muss */ }
}

/** { prefs, setPref(key, value), openSettings() } — bereitgestellt von CrShell. */
export const CrPrefsContext = createContext({
  prefs: DEFAULT_PREFS,
  setPref: () => {},
  openSettings: () => {},
});

export const useCrPrefs = () => useContext(CrPrefsContext);
