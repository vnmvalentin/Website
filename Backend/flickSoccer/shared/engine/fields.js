// engine/fields.js — Spielfelder. Jedes Feld ist eine Geometrie (Maße, Tor, Banden als Strecken, feste Hindernisse);
// die Physik, die Aufstellungen und die Zeichnung lesen alles von hier. Der Ruhezustand eines Spiels trägt die Feld-ID
// (state.field), damit Browser, Server und KI ohne Zusatzparameter dasselbe Feld benutzen.
//
// Die Schlüssel sind gespeicherte IDs (Einstellungen, Online-Räume, Statistik): nie umbenennen, nur neue hinzufügen.
// Neue Felder müssen den Test „jede Aufstellung auf jedem Feld" bestehen (engine.test.js).

import { FIELD } from './constants.js';

const DEFS = {
  standard: { name: 'Stadion', hint: 'Das normale Feld' },
  halle: { name: 'Halle', hint: 'Kleines Feld — alles ist nah, jeder Schuss gefährlich', W: 820, H: 530, GOAL_W: 180, CENTER_R: 68 },
  pfosten: {
    name: 'Pfosten',
    hint: 'Zwei feste Pfosten an der Mittellinie — Abpraller einplanen',
    bumpers: [{ x: 500, y: 150, r: 24 }, { x: 500, y: 490, r: 24 }],
  },
  kaefig: { name: 'Käfig', hint: 'Schräge Ecken: kein Ball bleibt in der Ecke liegen', cut: 110 },
  scheune: { name: 'Scheunentor', hint: 'Riesige Tore — Abwehr wird zur Kunst', GOAL_W: 320 },
};

function build(id, def) {
  const W = def.W || FIELD.W;
  const H = def.H || FIELD.H;
  const GOAL_W = def.GOAL_W || FIELD.GOAL_W;
  const GOAL_D = FIELD.GOAL_D;
  const G0 = (H - GOAL_W) / 2;
  const G1 = (H + GOAL_W) / 2;
  const cut = def.cut || 0;
  // Banden als Strecken [x1, y1, x2, y2]. Links und rechts mit Lücke für den Torkasten.
  const walls = [
    [0, 0, W, 0],
    [0, H, W, H],
    [0, 0, 0, G0],
    [0, G1, 0, H],
    [0, G0, -GOAL_D, G0],
    [-GOAL_D, G0, -GOAL_D, G1],
    [-GOAL_D, G1, 0, G1],
    [W, 0, W, G0],
    [W, G1, W, H],
    [W, G0, W + GOAL_D, G0],
    [W + GOAL_D, G0, W + GOAL_D, G1],
    [W + GOAL_D, G1, W, G1],
  ];
  if (cut > 0) {
    walls.push([0, cut, cut, 0], [W - cut, 0, W, cut], [0, H - cut, cut, H], [W - cut, H, W, H - cut]);
  }
  return Object.freeze({
    id,
    name: def.name,
    hint: def.hint,
    W,
    H,
    GOAL_W,
    GOAL_D,
    CENTER_R: def.CENTER_R || FIELD.CENTER_R,
    G0,
    G1,
    cut,
    walls: Object.freeze(walls.map((w) => Object.freeze(w))),
    bumpers: Object.freeze((def.bumpers || []).map((b) => Object.freeze({ ...b }))),
  });
}

export const FIELDS = Object.freeze(Object.fromEntries(Object.entries(DEFS).map(([id, def]) => [id, build(id, def)])));
export const FIELD_IDS = Object.freeze(Object.keys(FIELDS));
export const DEFAULT_FIELD = 'standard';

export function isField(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(FIELDS, id);
}

/** Feld zu einer ID; unbekannt oder leer → Stadion. */
export function getField(id) {
  return isField(id) ? FIELDS[id] : FIELDS[DEFAULT_FIELD];
}
