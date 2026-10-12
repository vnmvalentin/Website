// Fähigkeit „feder": Federn (spring) und Ringe (ring) als Startpunkt eines ballistischen Flugs.
//
// Anders als beim Grapple (Abschnitt grapple.js) lässt sich der Landepunkt hier direkt ausrechnen:
// Abstoßgeschwindigkeit ist fest (TUNING.springSpeed / ringSpeed), Schwerkraft ist fest
// (TUNING.gravity), der Rest ist eine Wurfparabel. Kein Warten nötig — Federn und Ringe sind nicht
// zyklisch, sie lösen bei Berührung aus. Genau deshalb ist diese Fähigkeit kein Sonderfall der
// Fairness-Regel wie mover/grapple, sondern reine Geometrie.
//
// Die Landung wird als VIRTUELLE STANDFLÄCHE eingetragen (nicht als Brücke): Man kann von einer
// Feder aus auch springen statt nur zu fliegen, und die Landestelle selbst ist danach ein
// gewöhnlicher Knoten — beides bildet sich am einfachsten ab, indem der Zielpunkt wie jede andere
// Standfläche behandelt wird, nicht als exklusive Kante von einem Ort zum anderen.

import { TILE, TICK_DT, TUNING, DIAG } from '../../../sim/config.js';

const RICHTUNG = {
  up: [0, -1], upLeft: [-DIAG, -DIAG], upRight: [DIAG, -DIAG], left: [-1, 0], right: [1, 0],
  down: [0, 1], downLeft: [-DIAG, DIAG], downRight: [DIAG, DIAG],
};

/**
 * Wurfparabel simulieren, bis wieder eine feste Kachel unter dem Punkt liegt — dieselbe
 * Grundgleichung wie die Sim (Schwerkraft, feste Zeitschritte), aber ohne Kollisions- und
 * Eingabe-Logik: Es geht nur um den LANDEPUNKT, nicht um den Weg dorthin.
 *
 * @param {number} x0, y0  Start in Pixeln
 * @param {number} vx0, vy0  Anfangsgeschwindigkeit in px/s
 * @param {(x:number,y:number)=>boolean} istFrei  true = Luft (Sim-Raster-Test)
 * @returns {{x:number, y:number}|null} Landepunkt in Pixeln, oder null (fliegt ins Leere / Wand)
 */
function wurf(x0, y0, vx0, vy0, istFrei, maxSchritte = 400) {
  let x = x0;
  let y = y0;
  let vx = vx0;
  let vy = vy0;
  const g = TUNING.gravity;
  for (let i = 0; i < maxSchritte; i++) {
    vy += g * TICK_DT;
    const nx = x + vx * TICK_DT;
    const ny = y + vy * TICK_DT;
    if (!istFrei(nx, ny)) {
      // Eine Kachel vor dem Hindernis stehen bleiben — die Sim würde hier kollidieren
      return istFrei(x, ny) ? { x, y: ny } : { x, y };
    }
    x = nx;
    y = ny;
    if (y > (istFrei.hoehe || 100000)) return null;   // ins Leere gefallen
  }
  return { x, y };
}

/**
 * Landepunkte aller Federn und Ringe eines Levels — als virtuelle Standflächen (Tile-Koordinaten).
 *
 * @param {object[]} entities  level.entities
 * @param {string[]} rows
 * @returns {Set<string>}
 */
export function virtuelleFederStaende(entities, rows) {
  const width = rows[0].length;
  const height = rows.length;
  const solide = (x, y) => {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return false;
    return rows[ty][tx] === '#';
  };
  const frei = (x, y) => !solide(x, y);
  frei.hoehe = height * TILE + TILE * 20;   // ein gutes Stück unter der Karte: eindeutig "verfehlt"

  const out = new Set();
  for (const spec of entities) {
    if (spec.type !== 'spring' && spec.type !== 'ring') continue;
    const dir = RICHTUNG[spec.dir] || RICHTUNG.up;
    const speed = spec.type === 'ring' ? TUNING.ringSpeed : TUNING.springSpeed;
    // Wandpads (links/rechts) schießen seitlich mit nur halbem Auftrieb — genau wie
    // sim/elements/spring.js (SIDE_LIFT = 0.5). Alle anderen Richtungen stecken den Auftrieb
    // schon im Einheitsvektor (up/upLeft/upRight/ring-Richtungen), deshalb reicht dort dir*speed.
    const seitlich = spec.type === 'spring' && (spec.dir === 'left' || spec.dir === 'right');
    const x0 = (spec.tx + 0.5) * TILE;
    const y0 = (spec.ty + 0.5) * TILE;
    const vx = dir[0] * speed;
    const vy = seitlich ? -speed * 0.5 : dir[1] * speed;

    const landung = wurf(x0, y0, vx, vy, frei);
    if (!landung) continue;
    const tx = Math.round(landung.x / TILE);
    const ty = Math.round(landung.y / TILE) - 1;   // knapp über dem Aufschlag, nicht IM Boden
    out.add(`${tx},${ty}`);
  }
  return out;
}
