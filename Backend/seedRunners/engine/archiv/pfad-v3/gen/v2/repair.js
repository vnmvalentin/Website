// Weltengenerierung v2, Stufe 5b: LOKALE REPARATUR.
//
// Der Plan (PLANUNG_WELTEN.md, S5) verlangt "lokale Reparatur statt Neuwurf": Reißt die Route, wird
// nicht die ganze Zone weggeworfen, sondern genau die Stelle geflickt, an der es hakt. Das ist nicht
// nur schneller — es erhält auch die Form, die Stufe 1 und 2 vorher gewollt haben.
//
// Heute greift dieses Netz fast nie: Die Welt wird so gebaut, dass sie von vornherein zusammenhängt
// (Garantie durch Konstruktion). Es steht hier für die Phasen, in denen Elemente, Rhythmus und
// Set-Pieces das Gelände wieder anfassen — und für den Fall, dass eine Kombination doch einmal
// etwas zumauert. Genau deshalb wird es gegen ABSICHTLICH beschädigte Welten getestet: Ein
// Sicherheitsnetz, das nie ausgelöst hat, ist kein geprüftes Sicherheitsnetz.
//
// Alles hier ist rein geometrisch und damit deterministisch — kein Zufall, kein Seed.
//
// Seit dem Welttyp-Umbau (gen/PLANUNG_WELTTYPEN.md) kennt die Reparatur zwei Zusätze:
//   achse   'x' (Standard, Höhlen/Himmelsreich/Parcours) oder 'y' (Turm: Fortschritt heißt
//           KLEINERES y, nicht größeres x) — bestimmt, in welche Richtung geflickt wird.
//   zusatz  dieselben virtuellen Standflächen/Brücken wie beim Bewegungsgraph (reachability.js);
//           ohne sie hielte die Reparatur eine Mover- oder Grapple-Route für kaputt, nur weil sie
//           keine Felskante ist.

import { ROCK, AIR, set } from './terrain.js';
import { floodReachable, isStanding, columnStands } from './reachability.js';

// Mehr Runden als das hier braucht keine Reparatur — dann ist die Zone wirklich hinüber. War lange
// 10; beim Turm (mehrere gestapelte Schächte, y-Achse) reichte das nicht: Jede Runde schließt per
// "Lücke halbiert" ungefähr die HÄLFTE der verbleibenden Distanz — bei einer größeren Lücke (mehrere
// fehlende Vorsprünge in Folge) braucht das mehr Halbierungen, um nah genug ans Ziel zu kommen.
// Gemessen: 7 von 10 Runden reichten nicht, 30 genügten. Jede Runde flutet die Welt neu (Millisekunden
// bei diesen Levelgrößen) — die Mehrkosten sind vernachlässigbar gegen die Sicherheit, die es bringt.
const MAX_ROUNDS = 30;
/** Breite/Höhe eines eingesetzten Vorsprungs */
const LEDGE_W = 3;
/** Lichte Höhe, die über einem eingesetzten Vorsprung frei geräumt wird */
const CLEAR_H = 10;

/**
 * Einen Vorsprung einsetzen: Fels unter der Standfläche, Luft darüber. Achsenunabhängig — eine
 * Standfläche ist eine Standfläche, ob die Route dorthin nun waagerecht oder senkrecht fortschreitet.
 * @returns {{x, y, w}} was gesetzt wurde
 */
function placeLedge(grid, x, ySurface, w = LEDGE_W) {
  const width = grid[0].length;
  const x0 = Math.max(0, Math.min(width - w, x));
  const y = Math.max(2, Math.min(grid.length - 3, ySurface));
  for (let i = 0; i < w; i++) {
    for (let d = 1; d <= 2; d++) set(grid, x0 + i, y + d, ROCK);
    for (let h = 0; h <= CLEAR_H; h++) set(grid, x0 + i, y - h, AIR);
  }
  return { x: x0, y, w };
}

/** Fortschritt einer Standfläche entlang der Route: größer = weiter vorn. */
const fortschritt = (achse, x, y) => (achse === 'y' ? -y : x);

/**
 * Die weiteste Stelle, die der Lauf erreicht — dort, wo die Route abreißt.
 * @returns {{x, y}|null}
 */
function frontier(flood, achse) {
  let best = -Infinity;
  let fx = -1;
  let fy = -1;
  for (const k of flood.seen) {
    const c = k.indexOf(',');
    const x = Number(k.slice(0, c));
    const y = Number(k.slice(c + 1));
    const p = fortschritt(achse, x, y);
    if (p > best) { best = p; fx = x; fy = y; }
  }
  return fx < 0 ? null : { x: fx, y: fy };
}

/**
 * EIN Flicken an der Bruchstelle, in der vom Plan vorgegebenen Reihenfolge:
 *   1. Lücke schmaler  — es gibt weiter vorn eine Standfläche, sie ist nur zu weit weg: Stein dazwischen
 *   2. Boden verlängert — weiter vorn ist gar nichts in Reichweite: den Weg selbst weiterbauen
 * (Der dritte Schritt des Plans, "Element entfernen", kommt mit den Elementen in Phase 4 dazu.)
 */
function patch(grid, rows, f, limits, achse, virtualStands) {
  if (achse === 'y') {
    // Turm: "vorn" heißt oben (kleineres y); die seitliche Reichweite bleibt maxGap, die
    // Reichweite in Fortschrittsrichtung ist die für senkrechte Bewegung — maxUp.
    //
    // Zwei Fallstricke, an denen frühere Fassungen gescheitert sind:
    //   1. "Lücke halbiert" IMMER bevorzugen, wenn irgendeine Standfläche in Reichweite des
    //      Suchradius liegt: Bei einem weit entfernten Ziel (die Rastkammer mehrere Schächte
    //      entfernt) legt das den neuen Vorsprung auf halbem Weg dorthin, OHNE zu prüfen, ob
    //      dieser neue Punkt vom aktuellen Rand aus selbst erreichbar ist. Ist er es nicht,
    //      ändert sich nichts, und derselbe Flicken wird endlos wiederholt (gemessen: 24 gleiche
    //      Flicken in Folge). Deshalb nur GARANTIERT NAHE Ziele (innerhalb von 2×step) halbieren.
    //   2. Als Rückfall IMMER "garantiert erreichbar" (fester Schritt gerade nach oben, dx=0) zu
    //      wählen, klingt sicher — bricht aber die Kopfraum-Regel, sobald die Bruchstelle noch
    //      nahe an Start oder Ziel liegt (der feste Schritt setzt dann einen Fels-Vorsprung
    //      MITTEN in den vorgeschriebenen freien Kopfraum). Deshalb bleibt "Lücke halbiert" die
    //      ERSTE Wahl, und ein erfolgloser Versuch wird übersprungen (nicht sofort aufgegeben).
    const step = Math.max(2, limits.maxUp - 1);
    const spanX = Math.max(2, limits.maxGap * 2);
    for (let dy = 1; dy <= 2 * step && f.y - dy >= 0; dy++) {
      const y = f.y - dy;
      for (let x = Math.max(0, f.x - spanX); x <= Math.min(rows[0].length - 1, f.x + spanX); x++) {
        if (!isStanding(rows, x, y, virtualStands)) continue;
        const my = f.y - Math.max(1, Math.floor(dy / 2));
        if (my <= y) continue;                        // liegen schon nebeneinander — kein Gewinn
        const mx = Math.round(f.x + (x - f.x) / 2);
        return { kind: 'Lücke halbiert', ...placeLedge(grid, mx, my) };
      }
    }
    if (f.y - step < 0) return null;
    return { kind: 'Boden verlängert', ...placeLedge(grid, f.x, f.y - step) };
  }

  const width = rows[0].length;
  for (let dx = 1; dx <= limits.maxGap * 4 && f.x + dx < width; dx++) {
    const x = f.x + dx;
    for (const y of columnStands(rows, x, virtualStands)) {
      const up = f.y - y;
      if (up > limits.maxUp || -up > limits.maxDown) continue;
      // Ein Trittstein auf halbem Weg halbiert sowohl die Weite als auch den Höhenunterschied.
      const mx = f.x + Math.max(1, Math.floor(dx / 2));
      if (mx >= x) return null;                       // die beiden liegen schon nebeneinander
      const my = Math.round(f.y + (y - f.y) / 2);
      return { kind: 'Lücke halbiert', ...placeLedge(grid, mx, my) };
    }
  }

  const step = Math.max(2, limits.maxGap - 1);
  if (f.x + step >= width) return null;
  return { kind: 'Boden verlängert', ...placeLedge(grid, f.x + step, f.y) };
}

/**
 * Flickt das Raster so lange, bis das Ende der Route erreichbar ist.
 *
 * @param {string[][]} grid   wird an Ort und Stelle verändert
 * @param {{x, y}} start
 * @param {{maxGap, maxGapUp, maxUp, maxDown}} limits
 * @param {{achse?: 'x'|'y', zusatz?: object, ziel?: {x,y}}} [opts]
 *   ziel  der tatsächliche Zielpunkt. OHNE Angabe wird der GEGENÜBERLIEGENDE RAND des Rasters
 *         angenommen (Höhlens ursprüngliches Verhalten: das Ziel sitzt dort ohnehin nahe dran).
 *         Welttypen mit Nachlauf hinter dem Ziel (Himmelsreich: 16 Spalten Luft für die
 *         Zielplattform) MÜSSEN `ziel` angeben — sonst marschiert die Reparatur sinnlos bis in
 *         die leere Luft weiter, in der Annahme, "das Ende" läge am Kartenrand. Genau das ist der
 *         ersten Fassung passiert: 558 überflüssige Flicken über 270 Welten, obwohl praktisch jede
 *         Welt schon beim ersten Bauen vollständig zusammenhing.
 * @returns {{ repairs: object[], reachedEnd: boolean }}
 */
export function repairWorld(grid, start, limits, opts = {}) {
  const achse = opts.achse === 'y' ? 'y' : 'x';
  const zusatz = opts.zusatz;
  const virtualStands = zusatz?.virtualStands;
  const repairs = [];
  // Ziel-Fortschritt: das ECHTE Ziel, wenn angegeben — sonst nahe am gegenüberliegenden Rand des
  // Rasters, mit demselben Spielraum von 2 Kacheln wie das ursprüngliche Verhalten.
  const zielFortschritt = opts.ziel
    ? fortschritt(achse, opts.ziel.x, opts.ziel.y) - 2
    : achse === 'y' ? fortschritt('y', 0, 2) : grid[0].length - 2;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const rows = grid.map((r) => r.join(''));
    const flood = floodReachable(rows, start, limits, zusatz);
    const f = frontier(flood, achse);
    if (!f) return { repairs, reachedEnd: false };    // nicht einmal der Start steht — nichts zu retten
    if (fortschritt(achse, f.x, f.y) >= zielFortschritt) return { repairs, reachedEnd: true };

    const fix = patch(grid, rows, f, limits, achse, virtualStands);
    // Kein Flicken möglich, oder der letzte hat nichts gebracht: abbrechen statt endlos weiterbauen.
    if (!fix) return { repairs, reachedEnd: false };
    repairs.push({ round, ...fix });
  }

  const rows = grid.map((r) => r.join(''));
  const f = frontier(floodReachable(rows, start, limits, zusatz), achse);
  return { repairs, reachedEnd: !!f && fortschritt(achse, f.x, f.y) >= zielFortschritt };
}
