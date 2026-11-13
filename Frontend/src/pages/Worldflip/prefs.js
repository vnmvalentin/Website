// prefs.js — gemerkte Einstellungen von Worldflip (nur dieser Browser): Name, eigener Blob, Tischgröße, 2 gegen 2, Handkarten, Online-Token.
import { RULES } from './engine/index.js';
import { normalizeSkin } from './skins.js';

const KEY = 'worldflip.prefs';
const TOKEN_KEY = 'worldflip.token';

export const DEFAULT_PREFS = Object.freeze({ name: '', players: 4, teams: false, handSize: RULES.DEFAULT_HAND, skin: normalizeSkin(null, 0) });

export function loadPrefs() {
  let raw = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    raw = {};
  }
  return {
    name: typeof raw.name === 'string' ? raw.name.slice(0, 20) : '',
    players: raw.players >= RULES.MIN_PLAYERS && raw.players <= RULES.MAX_PLAYERS ? raw.players : DEFAULT_PREFS.players,
    teams: raw.teams === true,
    skin: normalizeSkin(raw.skin, 0),
    handSize: RULES.HAND_SIZES.includes(raw.handSize) ? raw.handSize : DEFAULT_PREFS.handSize,
  };
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ohne Speicher eben nicht gemerkt */
  }
}

/** Zufälliger Schlüssel, der in Online-Räumen den eigenen Platz wiedererkennt (Neuladen, Verbindungsabbruch). */
export function getToken() {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t || !/^[A-Za-z0-9_-]{8,64}$/.test(t)) {
      t = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'[b % 64]).join('');
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    return `t${Math.random().toString(36).slice(2, 14)}${Date.now().toString(36)}`;
  }
}
