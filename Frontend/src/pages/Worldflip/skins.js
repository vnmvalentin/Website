import { TEAMS } from './engine/index.js';

// skins.js — das Aussehen der Blobs: Farbe, Hut, Gesicht. Der eigene Blob wird im Menü gestaltet (prefs.skin),
// online sehen ihn die anderen am Tisch; Bots bekommen ein zufälliges Aussehen.
//
// Ein Skin ist { c, h, f } — drei Zahlen (Index in die Listen hier). Der Server reicht sie nur durch; welche Zahl was
// bedeutet, steht allein hier (und gebaut wird die Figur in scene/avatars.js).

export const SKIN_COLORS = [
  { name: 'Gelb', hex: '#ffd23f' },
  { name: 'Pink', hex: '#ff5d8f' },
  { name: 'Türkis', hex: '#3ddbd9' },
  { name: 'Weiß', hex: '#f1ede4' },
  { name: 'Orange', hex: '#ff8a3d' },
  { name: 'Lila', hex: '#a77bff' },
  { name: 'Grün', hex: '#6bd968' },
  { name: 'Blau', hex: '#4d9dff' },
  { name: 'Rot', hex: '#ef4b4b' },
  { name: 'Grau', hex: '#8d93a6' },
];
export const SKIN_HATS = ['Ohne', 'Spitzhut', 'Zylinder', 'Antenne', 'Hörner', 'Kappe', 'Propeller', 'Blume', 'Heiligenschein', 'Pilz'];
export const SKIN_FACES = ['Normal', 'Brille', 'Schläfrig', 'Grimmig', 'Einauge', 'Schnurrbart'];

const idx = (v, n, fallback) => (Number.isInteger(v) && v >= 0 && v < n ? v : fallback);

/** Skin prüfen; fehlt etwas, kommt das Aussehen des Platzes (seat) zum Zug. */
export function normalizeSkin(raw, seat = 0) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    c: idx(r.c, SKIN_COLORS.length, seat % 4),
    h: idx(r.h, SKIN_HATS.length, 1 + (seat % 4)),
    f: idx(r.f, SKIN_FACES.length, 0),
  };
}

/** Zufälliges Aussehen (Bots). avoid: Farben, die schon am Tisch sitzen. */
export function randomSkin(avoid = [], random = Math.random) {
  const free = SKIN_COLORS.map((_, i) => i).filter((i) => !avoid.includes(i));
  const pool = free.length ? free : SKIN_COLORS.map((_, i) => i);
  return {
    c: pool[Math.floor(random() * pool.length)],
    h: Math.floor(random() * SKIN_HATS.length),
    f: Math.floor(random() * SKIN_FACES.length),
  };
}

export const skinColor = (skin) => SKIN_COLORS[skin?.c]?.hex || SKIN_COLORS[0].hex;
/** Farbe eines Platzes in den Anzeigen: im 2 gegen 2 die Teamfarbe, sonst die Farbe des Blobs. */
export const playerColor = (players, teams, seat) => (teams ? TEAMS[teams[seat]].color : skinColor(normalizeSkin(players[seat]?.skin, seat)));
