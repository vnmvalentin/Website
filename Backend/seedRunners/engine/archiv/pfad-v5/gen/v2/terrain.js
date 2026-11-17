// Weltengenerierung v2, Stufe 2: TERRAIN.
//
// Grundsatz: Das Level wird nicht aus Plattformen zusammengestellt, sondern AUSGEGRABEN. Die Fläche
// ist zunächst Fels; der Weg wird herausgeschnitten. Dadurch entstehen von selbst die Dinge, die ein
// Platformer braucht und die schwebende Plättchen nie liefern: Wände zum Wandspringen, Decken zum
// Kopfstoßen, Überhänge, Nischen.
//
// Oberirdische Zonen bekommen zusätzlich Himmel: Alles oberhalb der Oberflächenlinie wird geräumt.
// Unterirdische Zonen (Tunnel, Kammer) behalten ihre Decke — dort läuft man wirklich im Berg.
//
// Kein Rauschen aus einer Bibliothek: Die Wellen kommen aus der Sinus-Tabelle der Sim (trig.js) und
// aus dem seeded PRNG, damit die Welt auf jedem Gerät bitgleich entsteht.

import { createRng } from '../../sim/rng.js';
import { sinTurns } from '../../sim/trig.js';
import { ROUTE_TOP, WORLD_H } from './layout.js';

export const ROCK = '#';
export const AIR = '.';

/**
 * Lichte Höhe des Hauptwegs in Zeilen: Ein Doppelsprung steigt 7,5 Kacheln, das muss hineinpassen.
 * Exportiert, weil `buildLedges()` (siehe unten) auch von anderen Welttypen benutzt wird — der
 * Turm braucht dieselbe Kopffreiheit wie ein Höhlen-Schacht, keine eigene Zahl.
 */
export const CORRIDOR_H = 11;
/** Wie weit die Decke eines Tunnels über dem Boden schwankt */
const CEIL_WOBBLE = 3;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Raster aus Fels, in das gegraben wird. */
export function createGrid(width, height) {
  return Array.from({ length: height }, () => new Array(width).fill(ROCK));
}

export const at = (grid, x, y) => (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length ? grid[y][x] : ROCK);
export const set = (grid, x, y, ch) => { if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) grid[y][x] = ch; };

/** Senkrechten Streifen räumen (von `y0` bis `y1`, beide inklusive) */
export function carveColumn(grid, x, y0, y1) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) set(grid, x, y, AIR);
}

/**
 * Eine weiche Zufallswelle über `width` Spalten: Summe zweier Sinus mit zufälliger Phase und Länge.
 * Ergebnis liegt etwa in [-amp, amp] und ist stetig — daraus werden Böden und Decken, die nicht wie
 * mit dem Lineal gezogen aussehen.
 */
export function wave(rng, width, amp) {
  const p1 = rng.next();
  const p2 = rng.next();
  const l1 = rng.range(0.7, 1.8);
  const l2 = rng.range(2.2, 4.5);
  const out = new Array(width);
  for (let i = 0; i < width; i++) {
    const t = width <= 1 ? 0 : i / (width - 1);
    out[i] = amp * (0.65 * sinTurns(t * l1 + p1) + 0.35 * sinTurns(t * l2 + p2));
  }
  return out;
}

/**
 * Bodenlinie einer Zone: folgt dem Höhenprofil, bekommt aber eine eigene Welle, damit der Boden
 * nicht schnurgerade vom Eingang zum Ausgang zieht. An den beiden Randspalten bleibt sie exakt auf
 * der Profilhöhe — dort stoßen die Zonen aneinander, und die Naht darf keine Stufe sein.
 */
export function floorLine(zone, profile, rng) {
  const amp = zone.climb ? 0.6 : 2.2;
  const w = wave(rng, zone.w, amp);
  const line = new Array(zone.w);
  for (let i = 0; i < zone.w; i++) {
    const base = profile[zone.x0 + i];
    const edge = Math.min(i, zone.w - 1 - i);
    const fade = clamp(edge / 3, 0, 1);      // an den Nähten die Welle ausblenden
    line[i] = Math.round(base + w[i] * fade);
  }
  return line;
}

/** Korridor über einer fertigen Bodenlinie freiräumen und den Boden setzen. */
function carveOverFloor(grid, zone, floor, rng) {
  const ceilWave = wave(rng.fork('ceil'), zone.w, CEIL_WOBBLE);
  for (let i = 0; i < zone.w; i++) {
    const x = zone.x0 + i;
    const fy = floor[i];
    const head = CORRIDOR_H + (zone.underground ? Math.round(ceilWave[i]) : 6);
    const top = zone.underground ? Math.max(ROUTE_TOP, fy - head) : 0;
    carveColumn(grid, x, top, fy - 1);
    set(grid, x, fy, ROCK);
  }
}

/**
 * Eine gewöhnliche (oberirdische oder unterirdische) Zone ausgraben:
 * Korridor über der Bodenlinie freiräumen, oberirdisch zusätzlich den Himmel darüber.
 */
function carveWalk(grid, zone, profile, rng) {
  const floor = floorLine(zone, profile, rng);
  carveOverFloor(grid, zone, floor, rng);
  return floor;
}

/**
 * VERZWEIGUNG: Der Hauptweg macht eine Senke, die Abkürzung führt oben geradeaus darüber.
 *
 * Warum überhaupt eine Senke? Eine Abkürzung, die dieselbe Strecke auf derselben Höhe läuft, spart
 * nichts — sie wäre nur ein zweiter Gang. Erst der Umweg nach unten macht den oberen Weg wertvoll:
 * Der Hauptweg kostet Abstieg UND Wiederaufstieg, die Abkürzung kostet ein paar weite Sprünge.
 *
 * Wichtig für das Spielgefühl: Wer die Abkürzung verfehlt, FÄLLT AUF DEN HAUPTWEG und verliert nur
 * Zeit. Ein optionales Risiko darf Zeit kosten, aber nicht den Lauf beenden — sonst nimmt es niemand.
 *
 * Zurück kommt `null`, wenn die Zone zu schmal ist. Dann wird sie eine gewöhnliche Laufzone, und der
 * Aufrufer darf KEINE Abkürzung melden — eine gezählte, aber nicht gebaute Abkürzung wäre gelogen.
 */
function carveBranch(grid, zone, profile, rng, limits) {
  const stepH = Math.max(3, Math.min(4, limits.maxUp - 1));
  const steps = rng.intRange(3, 4);
  const depth = steps * stepH;
  const stepW = 3;
  const rampW = steps * stepW;
  const pad = 5;                 // ebener Anlauf an beiden Zonenrändern
  const flatW = 7;               // Sohle der Senke
  if (zone.w < pad * 2 + flatW + rampW + 2) return null;

  // Bodenlinie von Hand statt aus floorLine(): Die Senke muss exakt sitzen, eine Welle darüber
  // würde die Stufenhöhen verfälschen — und eine Stufe zu hoch heißt, man kommt nicht mehr heraus.
  const floor = new Array(zone.w);
  const dipX0 = pad;
  const rampStart = dipX0 + flatW;
  const rampEnd = rampStart + rampW;
  for (let i = 0; i < zone.w; i++) {
    const base = profile[zone.x0 + i];
    if (i < dipX0) floor[i] = base;
    else if (i < rampStart) floor[i] = base + depth;
    else if (i < rampEnd) floor[i] = base + depth - Math.floor((i - rampStart) / stepW + 1) * stepH;
    else floor[i] = base;
  }
  carveOverFloor(grid, zone, floor, rng);

  // Die Abkürzung: Trittsteine auf der Höhe des umgebenden Bodens, quer über die Senke.
  // Die Lücken werden GLEICHMÄSSIG verteilt statt mit festem Schritt von links gesetzt — sonst
  // bleibt rechts ein Rest, der entweder zu weit oder lächerlich kurz ist (dieselbe Lehre wie bei
  // den Schacht-Vorsprüngen).
  const sy = profile[zone.x0 + dipX0];
  const span = rampEnd - dipX0 + 1;
  const plat = 3;
  const gapWanted = clamp(limits.maxGap - 1, 3, 6);
  let n = Math.max(1, Math.round((span - gapWanted) / (plat + gapWanted)));
  let gap = Math.round((span - n * plat) / (n + 1));
  // Passt die Rechnung nicht in die erlaubte Sprungweite, lieber eine Plattform mehr als ein Sprung,
  // den der Bewegungsgraph nicht deckt.
  while (gap > limits.maxGap - 1 && n < 8) {
    n += 1;
    gap = Math.round((span - n * plat) / (n + 1));
  }
  if (!(gap >= 2) || !(n >= 1)) return null;      // auch NaN fängt diese Form ab

  const tiles = [];
  const platforms = [];
  for (let k = 0; k < n; k++) {
    const px = zone.x0 + dipX0 - 1 + (k + 1) * gap + k * plat;
    for (let i = 0; i < plat; i++) {
      for (let d = 0; d < 2; d++) { set(grid, px + i, sy + d, ROCK); tiles.push([px + i, sy + d]); }
      carveColumn(grid, px + i, Math.max(0, sy - CORRIDOR_H), sy - 1);
    }
    platforms.push({ x: px, y: sy, w: plat });
  }

  if (!platforms.length) return null;
  return {
    floor,
    branch: {
      zone: zone.id,
      x0: zone.x0,
      w: zone.w,
      exitX: zone.x0 + zone.w - 1,
      probe: { x: platforms[Math.floor(n / 2)].x, y: sy - 1 },
      platforms,
      tiles,
      depth,
    },
  };
}

/**
 * Aufstieg/Abstieg: ein senkrechter Schacht mit VERSETZTEN VORSPRÜNGEN.
 *
 * Die Vorsprünge sind kein Schmuck, sondern die Bedingung dafür, dass der Aufstieg überhaupt
 * garantiert werden kann: Der Bewegungsgraph (reachability.js) kennt bewusst keine Wandsprung-Ketten
 * — was er nicht kennt, darf die Welt nicht voraussetzen. Mit Vorsprüngen im Abstand `step` kommt
 * jeder hoch; wer den Wandsprung beherrscht, nimmt die Wände und ist schneller. Genau so soll sich
 * Können auszahlen, ohne dass es Pflicht wird.
 *
 * Der Schacht sitzt an der Eingangsseite, damit man aus der Nachbarzone direkt hineinläuft; oben
 * (bzw. unten) führt ein Korridor auf der Ausgangshöhe zur anderen Seite.
 */
function carveShaft(grid, zone, profile, rng, maxUp) {
  const bottom = Math.max(zone.entryRow, zone.exitRow);
  const top = Math.min(zone.entryRow, zone.exitRow);
  const goingUp = zone.exitRow < zone.entryRow;
  const shaftW = rng.intRange(5, 7);
  // Der Schacht sitzt DIREKT an der Zonenkante. Bleibt auch nur eine Felsspalte davor stehen, ist
  // der Eingang zu und der ganze Rest der Welt hängt ab — genau daran ist die erste Fassung gescheitert.
  const left = zone.x0;
  const right = left + shaftW;

  // 1. Der Schacht: von oben (mit Kopffreiheit) bis knapp über den Fuß
  for (let x = left; x < right; x++) carveColumn(grid, x, top - CORRIDOR_H, bottom - 1);
  // 2. Der Fuß ist Boden — dort landet man beim Abstieg, dort startet man beim Aufstieg
  for (let x = left; x < right; x++) set(grid, x, bottom, ROCK);
  // 3. Korridor auf Ausgangshöhe, vom Schacht bis zum Zonenende
  const exitRow = goingUp ? top : bottom;
  for (let x = right; x < zone.x0 + zone.w; x++) {
    carveColumn(grid, x, exitRow - CORRIDOR_H, exitRow - 1);
    set(grid, x, exitRow, ROCK);
  }

  // 4. Vorsprünge — siehe buildLedges() unten für die Begründung (dieselbe Funktion trägt jetzt
  //    auch den Turm: eine Kletterschaft-Prüfung mit dem echten Solver soll für beide gelten,
  //    nicht für eine Kopie, die unbemerkt auseinanderläuft).
  const ledges = buildLedges(grid, { left, right, top, bottom, maxUp });

  return { shaftLeft: left, shaftW, top, bottom, ledges };
}

/**
 * Vorsprünge in einem bereits ausgegrabenen Senkrechtschacht setzen — abwechselnd links und
 * rechts, im Abstand von höchstens `maxUp` (bzw. 3 Zeilen, je nachdem, was enger ist).
 *
 * Eigenständig exportiert, weil sie zweimal gebraucht wird: hier für Höhlen-Schächte (eine
 * Kletterzone zwischen zwei waagerechten Abschnitten) und im Welttyp „Turm" für die ganze Route.
 * Beide Anwendungen teilen sich denselben Solver-Beweis (`v2Shaft.mjs`: 5/5 gelöst) — eine zweite,
 * unabhängig geschriebene Fassung hätte diesen Beweis nicht.
 *
 * Die Abstände werden GLEICHMÄSSIG über die Schachthöhe verteilt (nicht mit festem Schritt von
 * einem Ende aus): Sonst bleibt am anderen Ende ein Rest — mal zu weit zum Ausgang, mal zu weit
 * vom Boden weg, und beides reißt die Route ab.
 *
 * Der Abstand bleibt bei höchstens 3 Zeilen, und die Vorsprünge sind so breit, dass sie sich
 * gerade NICHT überlappen. Beides gehört zusammen:
 *   · Überlappen zwei Vorsprünge in einer Spalte, nimmt der obere dem unteren die Kopffreiheit
 *     (HEAD_ROOM = 3) — dort kann man dann nicht mehr stehen, und der Aufstieg reißt ab. Genau
 *     das ist bei Schwierigkeit 1–2 in 78 von 270 Welten passiert, unbemerkt, weil Phase 1 nur
 *     Stufe 3 geprüft hatte (dort ergab die Rechnung zufällig einen Abstand von 4).
 *   · Versetzte Vorsprünge heißen aber auch einen seitlichen Sprung. Dessen Weite (2 Kacheln)
 *     muss ins Budget passen, das der Graph bei 3 Zeilen Höhengewinn noch zulässt — deshalb
 *     nicht mehr als 3 Zeilen Abstand, und deshalb `lw` so groß wie möglich.
 * Breiter ist NICHT besser: Mit 6–8 Kacheln Schacht (statt 5–7) schaffte der echte Solver keinen
 * einzigen Aufstieg mehr — der Zickzack zwischen den Seiten wird dann zu weit. Gemessen, nicht geraten.
 *
 * `edgeGap` ist der Sonderfall, den der Turm braucht (siehe typen/turm.js): Normalerweise (edgeGap
 * 0/weggelassen) endet die Leiter planmäßig nur `dy` (≤ 3 Zeilen) vor `top` bzw. `bottom` — bei
 * Höhlen unschädlich, weil der Ausstieg dort in einer VERSETZTEN Spalte liegt. Grenzt aber eine
 * ebene Fläche in DENSELBEN Spalten an ein Schachtende (Turms Rastkammern), braucht der letzte
 * Schritt HEAD_ROOM + 1 Zeilen statt `dy`, sonst nimmt die Fläche dem äußersten Vorsprung die
 * Kopffreiheit. `edgeGap` erzwingt genau das, indem die Vorsprünge über einen um `edgeGap` VERKÜRZTEN
 * Bereich verteilt werden UND — anders als sonst — auch an dessen beiden Enden gesetzt werden (nicht
 * übersprungen): Der äußerste Vorsprung landet dann exakt `edgeGap` vor der echten Grenze, mit allen
 * Zwischenschritten weiterhin ≤ `maxUp`. (Ein nachträgliches "zu nahe Vorsprünge entfernen und einen
 * neuen daneben setzen" war hier erst im Einsatz — jede Fensterbreite dafür traf irgendwann zufällig
 * eine bestehende Sprosse auf derselben Spalte und löschte sie wieder. Von vornherein richtig bauen
 * vermeidet diese Kollision strukturell, statt sie einzeln wegzuflicken.)
 *
 * @param {string[][]} grid
 * @param {{left, right, top, bottom, maxUp, edgeGap?}} schacht  top < bottom (Zeilen), left < right (Spalten)
 * @returns {{x, y, w}[]} die gesetzten Vorsprünge, oben nach unten NICHT garantiert sortiert
 */
export function buildLedges(grid, { left, right, top, bottom, maxUp, edgeGap = 0 }) {
  const shaftW = right - left;
  const LEDGE_DY = 3;
  const step = Math.min(LEDGE_DY, maxUp);
  // Niemals mehr als maxUp reservieren — sonst wäre der Sprung zur echten Grenze selbst zu weit.
  const edge = Math.max(0, Math.min(edgeGap, maxUp));
  const innerTop = top + edge;
  const innerBottom = bottom - edge;
  const span = Math.max(0, innerBottom - innerTop);
  const steps = Math.max(1, Math.ceil(span / step));
  const dy = span / steps;
  // `lw` so wählen, dass zwischen linkem und rechtem Vorsprung höchstens 2 Kacheln Luft liegen.
  const lw = Math.max(2, Math.ceil((shaftW - 1) / 2));
  const ledges = [];
  // Ohne edge: wie bisher nur die INNEREN Sprossen (i=1..steps-1) — die Enden bleiben `dy` vor der
  // Grenze frei. Mit edge: auch i=0 und i=steps setzen — das sind dann die beiden Sprossen, die
  // genau `edge` vor `bottom` bzw. `top` liegen, der ganze Grund für diesen Parameter.
  const von = edge > 0 ? 0 : 1;
  const bis = edge > 0 ? steps : steps - 1;
  for (let i = von; i <= bis; i++) {
    const y = Math.round(innerBottom - i * dy);
    // Der oberste liegt an der Korridorseite: Der letzte Schritt aus dem Schacht ist dann kurz.
    const onExitSide = (steps - i) % 2 === 1;
    const lx = onExitSide ? right - lw : left;
    for (let k = 0; k < lw; k++) {
      carveColumn(grid, lx + k, y - CORRIDOR_H, y - 1);   // erst Luft darüber …
      set(grid, lx + k, y, ROCK);                          // … dann der Vorsprung selbst
    }
    ledges.push({ x: lx, y, w: lw });
  }
  return ledges;
}

/**
 * Inselzone: Der Boden fällt weg, dafür schweben Plateaus auf der Profilhöhe. Sie sind so gesetzt,
 * dass die Lücken innerhalb der gemessenen Sprungweite bleiben (`maxGap`, kommt aus reach × SAFETY).
 */
function carveIslands(grid, zone, profile, rng, maxGap) {
  // Die ganze Zone bis zum Kartenrand räumen: Unter den Inseln ist ABGRUND, kein Boden. Bliebe dort
  // Fels, landete man nach einem Fehlsprung auf einer Ebene, von der man nicht mehr hochkommt — eine
  // Sackgasse, in der man ewig weiterläuft, statt am Checkpoint neu anzusetzen.
  for (let i = 0; i < zone.w; i++) carveColumn(grid, zone.x0 + i, 0, WORLD_H - 1);

  // `maxGap` ist die Sprungweite in Kacheln — die Zahl LEERER Spalten dazwischen ist eine weniger.
  const emptyMax = Math.max(1, Math.min(maxGap - 1, 5));
  let x = zone.x0;
  const islands = [];
  while (x < zone.x0 + zone.w) {
    const rest = zone.x0 + zone.w - x;
    const w = Math.min(rest, rng.intRange(4, 8));
    const y = profile[Math.min(profile.length - 1, x)];
    for (let i = 0; i < w; i++) for (let d = 0; d < 3; d++) set(grid, x + i, y + d, ROCK);
    islands.push({ x, w, y });
    // Nur eine Lücke lassen, wenn danach noch eine ganze Insel Platz hat — sonst endet die Zone
    // mit einem Loch genau an der Naht zur nächsten.
    x += w + (rest > w + emptyMax + 5 ? rng.intRange(1, emptyMax) : 0);
  }
  return islands;
}

/**
 * Stufe 2 insgesamt: aus Zonen wird ein Kachelraster.
 *
 * @param {object} layout  Ergebnis von buildLayout()
 * @param {{seed: string|number}} params
 * @param {{maxGap, maxGapUp, maxUp, maxDown}} limits  aus reach × SAFETY
 * @returns {{ grid: string[][], shapes: object[], shortcuts: object[] }}
 *   shortcuts = die TATSÄCHLICH gebauten Verzweigungen (nicht die im Layout gewünschten)
 */
export function buildTerrain(layout, params, limits, vorhandenesRaster) {
  // Das Raster darf von außen kommen: Seit dem Umbau auf Welttypen entscheidet der Welttyp über den
  // Grundstoff (Fels oder Luft), nicht mehr diese Datei. Ohne Angabe bleibt es beim alten Verhalten.
  const grid = vorhandenesRaster || createGrid(layout.width, layout.height);
  const shapes = [];
  const shortcuts = [];

  for (const zone of layout.zones) {
    const rng = createRng(params.seed, `v2:terrain:${zone.id}`);
    if (zone.climb) {
      shapes.push({ zone: zone.id, kind: zone.kind, ...carveShaft(grid, zone, layout.profile, rng, limits.maxUp) });
    } else if (zone.kind === 'inseln') {
      shapes.push({ zone: zone.id, kind: zone.kind, islands: carveIslands(grid, zone, layout.profile, rng, limits.maxGap) });
    } else if (zone.shortcut) {
      const built = carveBranch(grid, zone, layout.profile, rng, limits);
      if (built) {
        shapes.push({ zone: zone.id, kind: zone.kind, floor: built.floor, branch: built.branch });
        shortcuts.push(built.branch);
      } else {
        // Zu schmal für eine Senke: gewöhnliche Laufzone, und die Abkürzung wird NICHT gemeldet.
        shapes.push({ zone: zone.id, kind: zone.kind, floor: carveWalk(grid, zone, layout.profile, rng) });
      }
    } else {
      shapes.push({ zone: zone.id, kind: zone.kind, floor: carveWalk(grid, zone, layout.profile, rng) });
    }
  }

  return { grid, shapes, shortcuts };
}
