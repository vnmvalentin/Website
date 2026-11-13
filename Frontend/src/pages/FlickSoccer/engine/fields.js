// engine/fields.js — Spielfelder. Jedes Feld ist eine Geometrie (Maße, Tor, Banden als Strecken, feste Hindernisse)
// plus Eigenheiten: Reibung (Eis, Sand), Bumper mit Rückstoß, Portale, Mauern im Feld. Die Physik, die Aufstellungen
// und die Zeichnung lesen alles von hier. Der Ruhezustand eines Spiels trägt die Feld-ID (state.field), damit Browser,
// Server und KI ohne Zusatzparameter dasselbe Feld benutzen.
//
// Die Schlüssel sind gespeicherte IDs (Einstellungen, Online-Räume, Statistik): nie umbenennen, nur neue hinzufügen.
// Neue Felder müssen den Test „jede Aufstellung auf jedem Feld" bestehen (fields-chaos.test.js) und links/rechts
// spiegelgleich sein (eigene Aufstellungen werden nur für das linke Team geprüft).
//
// `theme` ist das Aussehen (fieldArt.js) — die Engine selbst benutzt es nicht.

import { FIELD } from './constants.js';

const DEFS = {
  standard: { name: 'Stadion', hint: 'Das normale Feld', theme: 'rasen' },
  halle: {
    name: 'Halle', hint: 'Kleines Feld — alles ist nah, jeder Schuss gefährlich', theme: 'parkett',
    W: 820, H: 530, GOAL_W: 180, CENTER_R: 68,
  },
  pfosten: {
    name: 'Trainingsplatz',
    hint: 'Zwei feste Pfosten an der Mittellinie — Abpraller einplanen',
    theme: 'rasen',
    bumpers: [{ x: 500, y: 150, r: 24 }, { x: 500, y: 490, r: 24 }],
  },
  kaefig: { name: 'Käfig', hint: 'Schräge Ecken: kein Ball bleibt in der Ecke liegen', theme: 'asphalt', cut: 110 },
  scheune: { name: 'Scheunentor', hint: 'Riesige Tore — Abwehr wird zur Kunst', theme: 'stroh', GOAL_W: 320 },
  eisbahn: {
    name: 'Eisbahn', hint: 'Blankes Eis: alles rutscht fast doppelt so weit', theme: 'eis',
    friction: 0.5, round: 110,
  },
  flipper: {
    name: 'Flipper', hint: 'Vier Bumper schießen alles zurück, was sie berührt', theme: 'flipper',
    bumpers: [
      { x: 445, y: 150, r: 26, kick: 420 }, { x: 555, y: 150, r: 26, kick: 420 },
      { x: 445, y: 490, r: 26, kick: 420 }, { x: 555, y: 490, r: 26, kick: 420 },
    ],
  },
  wurmloch: {
    name: 'Wurmloch', hint: 'Zwei Portale: oben hinein, unten wieder heraus', theme: 'weltraum',
    portals: [{ x: 500, y: 95, r: 32 }, { x: 500, y: 545, r: 32 }],
  },
  strand: { name: 'Strand', hint: 'Tiefer Sand bremst — kurze, genaue Schüsse zählen', theme: 'sand', friction: 1.6 },
  burghof: {
    name: 'Burghof', hint: 'Zwei Mauern an der Mittellinie lassen nur eine Lücke', theme: 'stein',
    inner: [[500, 0, 500, 150], [500, 490, 500, 640]],
  },
  arena: { name: 'Rundbahn', hint: 'Runde Ecken: Bandenschüsse laufen im Bogen', theme: 'tartan', round: 190 },
};

// Viertelkreis als Streckenzug. Die Punkte kommen aus der rationalen Kreisformel (nur Grundrechenarten), damit die
// Banden auf jeder Maschine bitgleich sind — Math.sin/cos dürfen je nach Browser im letzten Bit abweichen.
const ARC_SEGMENTS = 6;
function quarterCircle() {
  const pts = [];
  for (let k = 0; k <= ARC_SEGMENTS; k++) {
    const t = k / ARC_SEGMENTS;
    const d = 1 + t * t;
    pts.push([(1 - t * t) / d, (2 * t) / d]);
  }
  return pts;
}

/** Punkte der linken oberen Ecke von (0, y) nach (x, 0) — schräg (cut), rund (round) oder null für eine rechte Ecke. */
function cornerPoints(cut, round) {
  if (round > 0) return quarterCircle().map(([c, s]) => [round - round * c, round - round * s]);
  if (cut > 0) return [[0, cut], [cut, 0]];
  return null;
}

function build(id, def) {
  const W = def.W || FIELD.W;
  const H = def.H || FIELD.H;
  const GOAL_W = def.GOAL_W || FIELD.GOAL_W;
  const GOAL_D = FIELD.GOAL_D;
  const G0 = (H - GOAL_W) / 2;
  const G1 = (H + GOAL_W) / 2;
  const cut = def.cut || 0;
  const round = def.round || 0;
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
  const corner = cornerPoints(cut, round);
  if (corner) {
    for (let k = 0; k + 1 < corner.length; k++) {
      const [ax, ay] = corner[k];
      const [bx, by] = corner[k + 1];
      walls.push([ax, ay, bx, by], [W - ax, ay, W - bx, by], [ax, H - ay, bx, H - by], [W - ax, H - ay, W - bx, H - by]);
    }
  }
  for (const w of def.inner || []) walls.push([...w]);
  // Je Bande ein Rahmen [minX, maxX, minY, maxY]: die Physik überspringt Banden, die ein Körper gar nicht erreichen kann
  const wallBox = walls.map((w) => [Math.min(w[0], w[2]), Math.max(w[0], w[2]), Math.min(w[1], w[3]), Math.max(w[1], w[3])]);
  return Object.freeze({
    id,
    name: def.name,
    hint: def.hint,
    theme: def.theme || 'rasen',
    W,
    H,
    GOAL_W,
    GOAL_D,
    CENTER_R: def.CENTER_R || FIELD.CENTER_R,
    G0,
    G1,
    cut,
    round,
    friction: def.friction || 1, // Faktor auf die Bremsung: < 1 rutschig, > 1 zäh
    walls: Object.freeze(walls.map((w) => Object.freeze(w))),
    wallBox: Object.freeze(wallBox.map((b) => Object.freeze(b))),
    inner: Object.freeze((def.inner || []).map((w) => Object.freeze([...w]))),
    bumpers: Object.freeze((def.bumpers || []).map((b) => Object.freeze({ kick: 0, ...b }))),
    portals: Object.freeze((def.portals || []).map((p) => Object.freeze({ ...p }))),
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
