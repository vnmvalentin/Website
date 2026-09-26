// Handgebaute Testkarte für Phase 1: jede Fähigkeit hat einen eigenen Abschnitt, damit sich das
// Movement einzeln beurteilen lässt. Sie wird per Code aus Rechtecken zusammengesetzt statt von
// Hand getippt — so haben alle Zeilen garantiert dieselbe Länge und Maße lassen sich ändern,
// ohne ein Raster neu zu zeichnen. Heraus kommt dasselbe ASCII-Format wie bei den späteren Chunks.
//
// Maße stammen aus Messungen der Sim mit den Standardwerten (Tiles à 16 px):
//   voller Sprung 4,2 hoch · Sprungweite ~7 · mit Doppelsprung ~9,5 · mit spätem Dash ~11
//   Dash-Jump ~11,5 · mit allem ~13 · Grapple-Reichweite 9,4
// Ein Dash mitten im Aufstieg friert die Höhe ein und kostet Weite; er bringt am meisten,
// wenn er erst im Fallen kommt. Die Lücken sind Übungsgelände, keine Beweise: Ein einfacher Sprung
// reicht bei 10 und 12 nicht, mit PERFEKTEM Timing kommt man aber auch mit Doppelsprung allein
// noch hinüber (gemessen 12,3 Tiles, siehe sim/reach.js). Der Generator legt seine Lücken deshalb
// nur bis zu einem Bruchteil der gemessenen Reichweite an.
// Wer knapper testen will, verstellt lieber die Werte im Dev-Panel als die Karte.
//
// Abschnitte (Warp-Taste = Ziffer):
//   1  Laufen und Stufen
//   2  Lücken 3 / 4 / 5 / 6 Tiles
//   3  10 Tiles breite Lücke (Sprung + Doppelsprung + Dash) und eine 5 Tiles hohe Kante
//   4  Wandschacht, 24 Tiles hoch
//   5  12 Tiles breite Lücke (Dash-Jump, dazu Doppelsprung)
//   6  Grapple über einen 36 Tiles breiten Abgrund

import { parseMap } from './tilemap.js';

const W = 224;
const H = 38; // 4 Zeilen Untergrund unter der Grundlinie: mehr Himmel im Bild, kurzer Fall in die Abgründe
const GROUND = 34; // erste feste Zeile der Grundlinie

function build() {
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (x, y, ch) => { grid[y][x] = ch; };
  const rect = (x, y, w, h, ch = '#') => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, ch);
  };
  // Boden von x0 bis x1 (exklusiv) bis zum Kartenrand
  const ground = (x0, x1) => rect(x0, GROUND, x1 - x0, H - GROUND);
  const stand = GROUND - 1; // Zeile, in der der Spieler auf dem Boden steht

  // ── 1: Laufen und Stufen ────────────────────────────────────────────────
  ground(0, 30);
  put(1, stand, '1');
  put(3, stand, 'S');
  rect(12, GROUND - 1, 3, 1);   // 1 Tile hoch
  rect(18, GROUND - 2, 3, 2);   // 2 Tiles hoch
  rect(24, GROUND - 3, 3, 3);   // 3 Tiles hoch

  // ── 2: Lücken ───────────────────────────────────────────────────────────
  put(28, stand, '2');
  ground(33, 38);               // Lücke 3
  ground(42, 47);               // Lücke 4
  ground(52, 57);               // Lücke 5
  ground(63, 72);               // Lücke 6
  put(35, stand, 'C');
  put(68, stand, 'C');

  // ── 3: Sprung + Dash, hohe Kante ────────────────────────────────────────
  put(70, stand, '3');
  ground(82, 150);              // Lücke 10 (72..82)
  rect(90, GROUND - 5, 6, 1);   // Kante 5 Tiles hoch: Doppelsprung oder Dash nach oben

  // ── 4: Wandschacht ──────────────────────────────────────────────────────
  put(104, stand, '4');
  put(105, stand, 'C');
  rect(110, 8, 2, GROUND - 10); // linke Wand, bis ganz nach oben; unten 2 Zeilen offen als Einstieg
  rect(116, 12, 2, GROUND - 12); // rechte Wand
  rect(116, 12, 20, 3);         // Austritt oben, läuft nach rechts aus
  put(125, 11, 'C');

  // ── 5: Dash-Jump ────────────────────────────────────────────────────────
  put(142, stand, '5');
  put(146, stand, 'C');
  // Lücke 12 (150..162): der Boden aus Abschnitt 3 wird hier wieder ausgeschnitten
  rect(150, GROUND, 12, H - GROUND, '.');
  ground(162, 172);

  // ── 6: Grapple ──────────────────────────────────────────────────────────
  put(164, stand, '6');
  put(170, stand, 'C');
  for (const ax of [176, 185, 194, 203]) put(ax, GROUND - 7, 'G');
  ground(208, 224);
  put(210, stand, 'C');
  for (let x = 218; x < 220; x++) for (let y = stand - 2; y <= stand; y++) put(x, y, 'E');

  return grid.map((row) => row.join(''));
}

export const TEST_MAP_ROWS = build();
export const TEST_MAP_GROUND = GROUND;

export function createTestMap() {
  return parseMap(TEST_MAP_ROWS);
}
