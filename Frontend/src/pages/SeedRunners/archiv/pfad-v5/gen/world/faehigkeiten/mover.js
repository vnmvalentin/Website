// Fähigkeit „mover": bewegte Plattformen als Standflächen für den Bewegungsgraph.
//
// Eine Plattform steht nicht immer an derselben Stelle — aber genau darauf beruht ihre Erlaubnis:
// die Regel aus PLANUNG_WELTTYPEN.md, dass nie eine Stelle nur mit einem bestimmten Startzeitpunkt
// lösbar sein darf ("Warten muss möglich sein"). Wer warten darf, für den ist eine zyklisch
// wiederkehrende Position ununterscheidbar von einer festen. Der Graph darf sie also wie eine
// gewöhnliche Standfläche behandeln — er muss nur wissen, WELCHE Kacheln das sind.
//
// Reine Geometrie: dieselben Bahn-Funktionen wie die Sim (sim/elements/util.js), aber ohne Bezug
// zu einer laufenden Welt. Import ist sicher, weil buildPath/pathAt nur +, −, ×, ÷, % und sqrt
// benutzen — dieselbe Determinismus-Regel wie überall in sim/ und gen/.

import { TILE, TICK_HZ } from '../../../sim/config.js';
import { buildPath, pathAt } from '../../../sim/elements/util.js';

/** Wie viele Stichproben je vollem Umlauf — grob genug für Millisekunden, fein genug für 1 Kachel Auflösung */
const SAMPLES_PER_PERIOD = 48;

/**
 * Eine Bahn (in Tile-Koordinaten des `path`-Felds) über einen vollen Zyklus abtasten.
 * @param {{tx, ty, path?, speed, phase, mode}} spec  wie sim/elements/mover.js `create()` es liest
 * @returns {{x: number, y: number}[]} Mittelpunkte in Tile-Koordinaten, ein Umlauf
 */
export function tastePfad(spec) {
  const pts = (spec.path || [[0, 0], [6, 0]]).map(([dx, dy]) => [(spec.tx + dx) * TILE, (spec.ty + dy) * TILE]);
  const pfad = buildPath(pts);
  const modus = spec.mode === 'loop' ? 'loop' : 'pingpong';
  const periodeTicks = modus === 'loop'
    ? (pfad.total / Math.max(1, spec.speed)) * TICK_HZ
    : (pfad.total * 2 / Math.max(1, spec.speed)) * TICK_HZ;
  const out = [];
  for (let i = 0; i < SAMPLES_PER_PERIOD; i++) {
    const t = (i / SAMPLES_PER_PERIOD) * periodeTicks;
    const p = pathAt(pfad, spec.speed, spec.phase || 0, t, modus);
    out.push({ x: p.x / TILE, y: p.y / TILE });
  }
  return out;
}

/**
 * Virtuelle Standflächen für alle Mover-Elemente eines Levels.
 *
 * Die Standfläche ist die Kachelreihe UNMITTELBAR ÜBER der Plattform (dort steht man), über die
 * volle abgetastete Breite — nicht nur der Mittelpunkt, sonst würde der Graph die Plattform enger
 * behandeln, als sie im Spiel ist.
 *
 * @param {object[]} entities  level.entities, gefiltert auf type === 'mover'
 * @returns {Set<string>} "x,y" in Tile-Koordinaten
 */
export function virtuelleMoverStaende(entities) {
  const staende = new Set();
  for (const spec of entities) {
    if (spec.type !== 'mover') continue;
    const breite = Math.max(1, Math.round(spec.width || 3));
    for (const p of tastePfad(spec)) {
      const y = Math.round(p.y);
      const x0 = Math.round(p.x);                 // Pfadpunkt = linke Kante der Plattform (sim/elements/mover.js)
      for (let i = 0; i < breite; i++) staende.add(`${x0 + i},${y - 1}`);
    }
  }
  return staende;
}
