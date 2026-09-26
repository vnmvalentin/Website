// Bewegungsgraph (vereinfacht): Kommt man von hier nach dort — und wie teuer ist es?
//
// Das ist der Kern der Lösbarkeits-Garantie aus dem Plan (gen/PLANUNG_WELTEN.md, E1): Statt zur
// Laufzeit mit der echten Sim einen Weg zu SUCHEN (gemessen: 9 s für ein kurzes, 49 s für ein
// mittleres Level — und ohne Ergebnis), wird hier reine Geometrie geprüft. Das kostet Millisekunden.
//
// Knoten sind STANDFLÄCHEN: eine Luftkachel mit Fels darunter, mit Platz für die Figur darüber.
// Kanten sind die Bewegungen, die die Sim nachweislich schafft — die Zahlen kommen aus sim/reach.js
// (dort GEMESSEN, nicht geschätzt) und werden mit SAFETY gedämpft, weil der Graph das Timing nicht
// kennt: Er sagt "das ist von der Geometrie her drin", nicht "das gelingt jedem im ersten Versuch".
//
// Bewusst NICHT fest verdrahtet: Wandsprung-Ketten, Grapple, Dash-Jump, bewegte Plattformen. Was
// der Graph nicht kennt, darf die Welt nicht voraussetzen — sonst entstünde eine Garantie, die nur
// auf dem Papier gilt. Deshalb baut terrain.js Aufstiege mit Vorsprüngen, die auch ohne Wandsprung
// gehen; der Wandsprung bleibt die schnellere Kür.
//
// Seit dem Umbau auf Welttypen (gen/PLANUNG_WELTTYPEN.md) ist der Graph STECKBAR: `floodReachable`
// nimmt einen optionalen vierten Parameter `zusatz` entgegen —
//   virtualStands  zusätzliche Standflächen, die keine Kachel im Raster brauchen (bewegte
//                  Plattformen: siehe faehigkeiten/mover.js — die Fairness-Regel "man darf immer
//                  warten" macht aus einer zyklischen Bewegung eine gewöhnliche Kante)
//   brueckenVon(x,y) -> [{x,y,cost}]  Kanten, die keine Nachbarschaft im Raster sind (Grapple-
//                  Schwung, Federabschuss: siehe faehigkeiten/)
// Ohne `zusatz` verhält sich die Funktion BYTE-IDENTISCH zum alten Verhalten — das ist geprüft
// (gen/v2/__tests__/world.test.js), weil Höhlen weiterhin genau darauf angewiesen sind.
//
// Und was der Graph NICHT beweist: dass ein Mensch den Weg trifft. Diese Aussage holt nur der echte
// Solver, und der läuft offline (siehe PLANUNG_WELTEN.md, Abschnitt 7).

import { AIR, ROCK } from './terrain.js';

/**
 * Platz über einer Standfläche, damit die Figur (14 px hoch) hineinpasst und springen kann.
 * Exportiert: Der Welttyp „Turm" setzt seine Rastkammern in denselben Spalten wie den Schacht
 * (anders als Höhlen, dessen Ausstieg versetzt liegt) und muss deshalb selbst dafür sorgen, dass
 * der letzte Vorsprung vor einer Kammer diesen Abstand einhält — siehe typen/turm.js.
 */
export const HEAD_ROOM = 3;

/** Anteil der Zonenstrecke, den eine Abkürzung mindestens sparen muss, um eine zu sein */
const MIN_SAVING = 1 / 6;

// Außerhalb der Karte gilt dieselbe Regel wie in der Sim (sim/tilemap.js): Die SEITEN sind massiv
// (unsichtbare Wand), oben und unten ist offen. Würde man unten Fels annehmen, "stünde" die Figur
// auf dem Kartenrand — und der Graph hielte einen Abgrund für begehbaren Boden.
const cell = (rows, x, y) => {
  if (x < 0 || x >= rows[0].length) return ROCK;
  if (y < 0 || y >= rows.length) return AIR;
  return rows[y][x];
};
const solid = (rows, x, y) => cell(rows, x, y) === ROCK;
const free = (rows, x, y) => cell(rows, x, y) !== ROCK;

/**
 * Steht man hier? Luft mit Kopffreiheit, Fels darunter — ODER eine virtuelle Standfläche
 * (`virtualStands`, Menge "x,y"): Die braucht keine Kachel, weil sie von einer Fähigkeit kommt
 * (eine bewegte Plattform steht nicht immer an dieser Stelle, aber man darf auf sie warten).
 */
export function isStanding(rows, x, y, virtualStands) {
  if (virtualStands && virtualStands.has(`${x},${y}`)) return true;
  if (!solid(rows, x, y + 1)) return false;
  for (let i = 0; i < HEAD_ROOM; i++) if (!free(rows, x, y - i)) return false;
  return true;
}

/** Alle Standflächen einer Spalte, echte und virtuelle */
export function columnStands(rows, x, virtualStands) {
  const out = [];
  for (let y = 1; y < rows.length - 1; y++) if (isStanding(rows, x, y, virtualStands)) out.push(y);
  return out;
}

/**
 * Ist der Flug zwischen zwei Standflächen frei? Grobe, aber ehrliche Näherung: Wer springt, geht
 * oben herum — also muss auf Höhe der HÖHEREN der beiden Flächen (und einer Kachel darüber, für den
 * Kopf) durchgehend Luft sein. Das unterschätzt weite Bögen eher, als dass es sie überschätzt; ein
 * zu strenger Graph verwirft eine Welt höchstens zu oft, ein zu lockerer liefert unspielbare.
 *
 * Der Sonderfall dx = 0 (rein senkrechter Sprung) hatte einen eigenen, bisher unbemerkten Fehler:
 * `dir = x1 > x0 ? 1 : -1` wird bei x1 === x0 zu -1 — die Schleife läuft dann von x0-1 aus IMMER
 * WEITER WEG von x1 (das Abbruchziel `x !== x1` liegt ja bereits hinter ihr) und bricht erst ab,
 * wenn sie bei stark negativem x auf den simulierten Kartenrand trifft (`cell()` behandelt x < 0
 * als Fels). Das Ergebnis war IMMER `false` — jeder senkrechte Sprung ohne seitlichen Versatz galt
 * als blockiert, obwohl nichts im Weg war. Bemerkt beim Turm, wo eine volle Kammerbreite als Ziel
 * (jede Spalte gültig) den seitlichen Versatz oft auf genau 0 zusammenschrumpfen lässt; unbemerkt
 * geblieben, weil Höhlens abwechselnde Vorsprünge so gut wie nie exakt übereinanderliegen.
 */
function flightClear(rows, x0, y0, x1, y1) {
  if (x0 === x1) {
    // Kein Bogen, keine Spalte "dazwischen" — hier ist die eigene Spalte der ganze Weg.
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    for (let y = lo; y < hi; y++) if (solid(rows, x0, y)) return false;
    return true;
  }
  const top = Math.min(y0, y1);
  const dir = x1 > x0 ? 1 : -1;
  for (let x = x0 + dir; x !== x1; x += dir) {
    if (solid(rows, x, top) || solid(rows, x, top - 1)) return false;
  }
  // Die Prüfung oben sieht nur die Spalten ZWISCHEN den Flächen. Bei Höhenunterschied kann der Weg aber
  // durch eine dünne Platte führen, die in den Endspalten selbst liegt (dx = 1 hat gar keine Spalte
  // dazwischen): Turm-Kammerböden waren so "überspringbar", jeder Turm galt als erreichbar, keiner war es.
  return y0 === y1 || luftweg(rows, x0, y0, x1, y1);
}

/**
 * Gibt es zwischen zwei Standflächen einen zusammenhängenden Weg durch LUFT? Notwendig für jeden
 * Sprung, egal wie weit der Bogen trägt — Fels lässt sich nicht durchqueren. Gesucht wird im Rechteck
 * zwischen den Flächen, eine Spalte seitlich und zwei Zeilen über der höheren (Kopf, Bogen) mehr.
 */
function luftweg(rows, x0, y0, x1, y1) {
  const xa = Math.min(x0, x1) - 1;
  const ya = Math.min(y0, y1) - 2;
  const w = Math.abs(x1 - x0) + 3;
  const h = Math.abs(y1 - y0) + 3;
  const seen = new Uint8Array(w * h);
  const ziel = (y1 - ya) * w + (x1 - xa);
  const stapel = [(y0 - ya) * w + (x0 - xa)];
  seen[stapel[0]] = 1;
  while (stapel.length) {
    const i = stapel.pop();
    if (i === ziel) return true;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) versuche(i - 1);
    if (x < w - 1) versuche(i + 1);
    if (y > 0) versuche(i - w);
    if (y < h - 1) versuche(i + w);
  }
  return false;

  function versuche(j) {
    if (seen[j]) return;
    seen[j] = 1;
    const x = j % w;
    if (!solid(rows, xa + x, ya + (j - x) / w)) stapel.push(j);
  }
}

/**
 * KOSTEN einer Bewegung, grob in "Kachelzeiten": waagerecht zählt die Strecke, hinauf zählt doppelt
 * (steigen dauert länger als laufen). Das ist keine Sekundenangabe — es ist ein Vergleichsmaß, mit
 * dem sich zwei Wege durch dieselbe Zone gegeneinander halten lassen ("ist die Abkürzung kürzer?").
 * Für eine echte Zeitaussage bräuchte man die Sim; die läuft offline im Solver.
 */
function moveCost(dx, up) {
  return Math.max(1, Math.abs(dx) + 2 * Math.max(0, up));
}

/**
 * Von welchen Standflächen aus ist der Start erreichbar — und zu welchen Kosten?
 *
 * Dial-Algorithmus (Dijkstra mit Eimern): Die Kantenkosten sind kleine ganze Zahlen, deshalb genügt
 * ein Feld von Eimern statt einer Prioritätswarteschlange.
 *
 * @param {string[]} rows
 * @param {{x: number, y: number}} start
 * @param {{maxGap: number, maxGapUp: number, maxUp: number, maxDown: number}} limits  in Kacheln
 * @returns {{ seen: Set<string>, cost: Map<string, number>, count: number,
 *             reached: (x:number,y:number)=>boolean, costAt: (x:number,y:number)=>number }}
 */
export function floodReachable(rows, start, limits, zusatz) {
  const { maxGap, maxGapUp = maxGap, maxUp, maxDown } = limits;
  const { virtualStands, brueckenVon } = zusatz || {};
  const key = (x, y) => `${x},${y}`;
  const cost = new Map();
  const buckets = [];

  const push = (x, y, c) => {
    if (!isStanding(rows, x, y, virtualStands)) return;
    const k = key(x, y);
    const old = cost.get(k);
    if (old !== undefined && old <= c) return;
    cost.set(k, c);
    (buckets[c] || (buckets[c] = [])).push([x, y]);
  };

  // Der Startpunkt liegt evtl. eine Kachel über dem Boden: nach unten suchen
  let sy = start.y;
  while (sy < rows.length - 2 && !isStanding(rows, start.x, sy, virtualStands)) sy++;
  push(start.x, sy, 0);

  for (let c = 0; c < buckets.length; c++) {
    const bucket = buckets[c];
    if (!bucket) continue;
    while (bucket.length) {
      const [x, y] = bucket.pop();
      // Veralteter Eintrag: Der Knoten wurde inzwischen billiger gefunden
      if (cost.get(key(x, y)) !== c) continue;

      // Gehen und kleine Stufen
      for (const dx of [-1, 1]) {
        for (const dy of [-1, 0, 1]) push(x + dx, y + dy, c + moveCost(dx, -dy));
      }
      // Springen und fallen: alle Standflächen in Reichweite, wenn die Luft dazwischen frei ist.
      // dx = 0 gehört dazu — ein Absatz direkt über einem ist mit einem senkrechten Sprung erreichbar,
      // und genau daran hängen die Ausstiege aus Schächten.
      const span = Math.max(maxGap, maxGapUp);
      for (let dx = -span; dx <= span; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= rows[0].length) continue;
        for (const ny of columnStands(rows, nx, virtualStands)) {
          const up = y - ny;                       // positiv = hinauf
          if (up === 0 && dx === 0) continue;
          if (up > maxUp || -up > maxDown) continue;
          // Weite und Höhe teilen sich dasselbe Budget: Wer hoch will, kommt nicht mehr weit.
          // Flach zählt die gemessene EINFACHE Sprungweite (maxGap), mit Höhengewinn die des
          // Doppelsprungs (maxGapUp) — den hat man im Spiel immer, und genau ihn braucht man dafür.
          const budget = up > 0
            ? Math.max(1, Math.round(maxGapUp * (1 - up / (maxUp + 1))))
            : maxGap;
          if (Math.abs(dx) > budget) continue;
          if (!flightClear(rows, x, y, nx, ny)) continue;
          push(nx, ny, c + moveCost(dx, up));
        }
      }

      // Zusätzliche Kanten einer Fähigkeit (Grapple-Schwung, Federabschuss, …) — keine
      // Nachbarschaft im Raster, deshalb nicht über die obige Sprung-/Fallschleife zu finden.
      if (brueckenVon) {
        for (const b of brueckenVon(x, y)) push(b.x, b.y, c + (b.cost ?? 1));
      }
    }
  }

  // Eine Marke (Start, Checkpoint, Ziel) sitzt nicht immer exakt auf der Standfläche, die der Graph
  // kennt — ein paar Zeilen Spiel nach oben und unten sind deshalb erlaubt.
  const nearest = (x, y) => {
    for (let d = 0; d <= 2; d++) {
      let best;
      for (const yy of d === 0 ? [y] : [y + d, y - d]) {
        const c = cost.get(key(x, yy));
        if (c !== undefined && (best === undefined || c < best)) best = c;
      }
      if (best !== undefined) return best;
    }
    return undefined;
  };

  return {
    seen: new Set(cost.keys()),
    cost,
    count: cost.size,
    reached: (x, y) => nearest(x, y) !== undefined,
    costAt: (x, y) => { const c = nearest(x, y); return c === undefined ? Infinity : c; },
  };
}

/** Billigster erreichbarer Standplatz in einer Spalte (Infinity, wenn die Spalte abhängt) */
export function columnCost(flood, rows, x, virtualStands) {
  let best = Infinity;
  for (const y of columnStands(rows, x, virtualStands)) {
    const c = flood.costAt(x, y);
    if (c < best) best = c;
  }
  return best;
}

/**
 * Billigster erreichbarer Standplatz in einer ZEILE, über einen Spaltenbereich [x0, x0+w).
 *
 * Das Gegenstück zu `columnCost` für Welttypen, deren Fortschrittsachse `y` statt `x` ist (Turm,
 * Abgrund-Sturz): Dort ist nicht "welche Höhe ist in dieser Spalte erreichbar" die Frage, sondern
 * "ist an dieser NAHT (einer festen Zeile) irgendwo im Kammer-Grundriss ein Fuß hinzusetzen".
 */
export function rowCost(flood, rows, y, x0, w, virtualStands) {
  let best = Infinity;
  for (let x = x0; x < x0 + w; x++) {
    if (!isStanding(rows, x, y, virtualStands)) continue;
    const c = flood.costAt(x, y);
    if (c < best) best = c;
  }
  return best;
}

/**
 * Prüft ein fertiges v2-Level auf das, was Stufe 5 (S5) verlangt.
 *
 * @returns {{ ok, reachedFinish, deadZones, brokenZones, badShortcuts, nodes }}
 *   deadZones     Zone hat keine einzige erreichbare Standfläche
 *   brokenZones   Zone wird zwar betreten, aber ihr Ausgang hängt ab — dort reißt die Route
 *   badShortcuts  als Abkürzung gebaut, aber nicht erreichbar oder nicht wirklich kürzer
 */
export function checkLevel(level, limits, zusatz) {
  const rows = level.rows;
  const virtualStands = zusatz?.virtualStands;
  const flood = floodReachable(rows, level.meta.start, limits, zusatz);
  const reachedFinish = level.meta.finish.some((f) => flood.reached(f.x, f.y));

  // Fortschrittsachse: 'x' (die meisten Welttypen) prüft je Zone die linke gegen die rechte Spalte;
  // 'y' (Turm, Abgrund-Sturz) prüft die untere gegen die obere Zeile über den Kammer-Grundriss.
  const achseY = level.meta?.achse === 'y';
  const deadZones = [];
  const brokenZones = [];
  for (const z of level.layout.zones) {
    const entry = achseY
      ? rowCost(flood, rows, Math.max(z.entryRow, z.exitRow), z.x0, z.w, virtualStands)
      : columnCost(flood, rows, z.x0, virtualStands);
    const exit = achseY
      ? rowCost(flood, rows, Math.min(z.entryRow, z.exitRow), z.x0, z.w, virtualStands)
      : columnCost(flood, rows, Math.min(rows[0].length - 1, z.x0 + z.w - 1), virtualStands);
    if (!Number.isFinite(entry) && !Number.isFinite(exit)) deadZones.push(z.id);
    else if (!Number.isFinite(exit)) brokenZones.push(z.id);
  }

  // Abkürzungen: Die Behauptung "das ist eine Abkürzung" lässt sich nur im Vergleich prüfen, also
  // wird die Welt ein zweites Mal geflutet — mit WEGGENOMMENEN Trittsteinen. (Weggenommen heißt
  // LUFT: Die Steine sind Fels, man steht ja darauf. Sie "zuzumauern" ändert erwartungsgemäß gar
  // nichts — genau daran ist die erste Fassung dieser Prüfung gescheitert.) Dann gilt:
  //   · ohne die Abkürzung muss der Ausgang trotzdem erreichbar sein  (kein Pflicht-Trick)
  //   · mit ihr muss er BILLIGER sein                                 (sonst ist es keine Abkürzung)
  //   · die Trittsteine selbst müssen erreichbar sein                 (sonst ist sie nur Deko)
  const badShortcuts = [];
  const shortcuts = level.layout.shortcuts || [];
  if (shortcuts.length) {
    const stripped = rows.map((r) => r.split(''));
    for (const s of shortcuts) for (const [tx, ty] of s.tiles) stripped[ty][tx] = AIR;
    const plainRows = stripped.map((r) => r.join(''));
    const plain = floodReachable(plainRows, level.meta.start, limits, zusatz);
    for (const s of shortcuts) {
      const withIt = columnCost(flood, rows, s.exitX, virtualStands);
      const without = columnCost(plain, plainRows, s.exitX, virtualStands);
      const mainCost = without - columnCost(plain, plainRows, s.x0, virtualStands);
      if (!Number.isFinite(without)) badShortcuts.push(`${s.zone}:Hauptweg hängt an der Abkürzung`);
      else if (!flood.reached(s.probe.x, s.probe.y)) badShortcuts.push(`${s.zone}:unerreichbar`);
      // Ein Vorteil von ein paar Kachelzeiten ist kein Grund, ein Risiko einzugehen — dann nimmt
      // die Abkürzung niemand, und sie kostet nur Platz. Mindestens ein Sechstel muss es sein.
      else if (without - withIt < Math.max(6, mainCost * MIN_SAVING)) badShortcuts.push(`${s.zone}:kaum schneller`);
    }
  }

  return {
    ok: reachedFinish && deadZones.length === 0 && brokenZones.length === 0,
    reachedFinish, deadZones, brokenZones, badShortcuts, nodes: flood.count,
    // Die erreichbaren Standflächen wurden ohnehin berechnet — die Debug-Ansicht zeichnet sie,
    // und so muss sie die Welt nicht ein zweites Mal fluten (auch über den Worker hinweg: eine
    // Menge übersteht das Strukturierte Klonen).
    reachable: flood.seen,
  };
}
