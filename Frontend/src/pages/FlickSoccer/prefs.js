// prefs.js — gemerkte Einstellungen (nur dieser Browser): Name, Aufstellungen, Designs, Regeln, KI-Stufe, Online-Token.
import { RULES, DEFAULT_FORMATION, DEFAULT_SKIN, DEFAULT_FIELD, isFormation, isField, isUnlocked } from './engine/index.js';
import { AI_LEVELS } from './ai.js';
import { loadStats } from './stats.js';
import { BALLS, TURFS, CELEBRATIONS, DEFAULT_LOOK, itemUnlocked } from './progress.js';

const KEY = 'flickSoccer.prefs';
const TOKEN_KEY = 'flickSoccer.token';

export const DEFAULT_PREFS = Object.freeze({
  mode: 'ai',
  name: '',
  formation: DEFAULT_FORMATION,
  formation2: DEFAULT_FORMATION,
  goalsToWin: RULES.DEFAULT_GOALS,
  turnSeconds: RULES.DEFAULT_TURN_SECONDS,
  level: 'medium',
  replay: false,
  field: DEFAULT_FIELD,
  chaos: false,
  skin: DEFAULT_SKIN,
  skin2: DEFAULT_SKIN,
  ball: DEFAULT_LOOK.ball,
  turf: DEFAULT_LOOK.turf,
  celebration: DEFAULT_LOOK.celebration,
});

export function loadPrefs() {
  let raw = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    raw = {};
  }
  const stats = loadStats();
  // nur Freigeschaltetes (jemand könnte den Speicher von Hand ändern — dann eben der Standard)
  const pick = (catalog, id, fallback) => (itemUnlocked(catalog, id, stats) ? id : fallback);
  return {
    mode: ['ai', 'hotseat', 'online'].includes(raw.mode) ? raw.mode : DEFAULT_PREFS.mode,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 20) : '',
    formation: isFormation(raw.formation) ? raw.formation : DEFAULT_PREFS.formation,
    formation2: isFormation(raw.formation2) ? raw.formation2 : DEFAULT_PREFS.formation2,
    goalsToWin: RULES.GOALS_TO_WIN.includes(raw.goalsToWin) ? raw.goalsToWin : DEFAULT_PREFS.goalsToWin,
    turnSeconds: RULES.TURN_SECONDS.includes(raw.turnSeconds) ? raw.turnSeconds : DEFAULT_PREFS.turnSeconds,
    level: AI_LEVELS[raw.level] ? raw.level : DEFAULT_PREFS.level,
    replay: raw.replay === true,
    field: isField(raw.field) ? raw.field : DEFAULT_PREFS.field,
    chaos: raw.chaos === true,
    skin: isUnlocked(raw.skin, stats) ? raw.skin : DEFAULT_SKIN,
    skin2: isUnlocked(raw.skin2, stats) ? raw.skin2 : DEFAULT_SKIN,
    ball: pick(BALLS, raw.ball, DEFAULT_LOOK.ball),
    turf: pick(TURFS, raw.turf, DEFAULT_LOOK.turf),
    celebration: pick(CELEBRATIONS, raw.celebration, DEFAULT_LOOK.celebration),
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
