// Bausteine: die handgebauten, vom Solver geprüften Chunks (gen/chunks/, 68 Stück, in allen drei
// Tempo-Klassen 396/396 gelöst) als Legosteine für Welttypen.
//
// Warum das die Antwort auf „sieht immer gleich aus" ist: Bisher variierten die Welttypen nur, WELCHE
// Gefahr auf ebenem Boden steht. Ein Chunk bringt dagegen eigenes Gelände mit — Gruben, Schächte,
// Treppen, Plattformen, Decken — und eine erprobte Kombination vorhandener Elemente (Sägen über Eis,
// Ringe mit Lasern, Bröckelbrücken …). Das ist die Super-Mario-Art von Vielfalt: bekannte Bausteine,
// immer wieder anders zusammengesetzt, jeder mit einer eigenen Idee.
//
// Die Lösbarkeits-Garantie kommt vom Chunk selbst: Er wird 1:1 eingesetzt (dieselben Zeilen, dieselben
// Elemente, offener Himmel darüber wie im Mini-Level des Solvers). Der Bewegungsgraph kennt sein
// Inneres nicht — dafür gibt es die Fähigkeit „baustein" (faehigkeiten/baustein.js), die Ein- und
// Ausgang wie eine Brücke behandelt.
//
// Auswahl und Schwierigkeitskurve stammen unverändert aus dem v1-Generator (pickChunk): erst sichere
// Erstbegegnung mit einer Mechanik, dann Steigerung, Kombinationen erst im hinteren Teil.

import { createRng } from '../../../sim/rng.js';
import { SPEED_CLASSES } from '../../../sim/classes.js';
import { reachForClass } from '../../../sim/reach.js';
import { BIOMES } from '../../biomes.js';
import { CHUNKS } from '../../chunks/index.js';
import { instantiate, pickChunk, BASE_ROW } from '../../generator.js';

/** Zeilen Fels unter der Unterkante eines Chunks, wenn dessen unterste Zeile fest ist (wie im v1-Raster: +6) */
export const UNTERKANTE = 6;
/** Höchste Eingangszeile aller Chunks = so viel Platz braucht ein Chunk über seinem Boden */
export const PLATZ_OBEN = Math.max(...CHUNKS.map((c) => c.entry));
/** Größter Abstand Boden → Chunk-Unterkante (Zeilen unterhalb der Eingangs-Bodenzeile) */
export const PLATZ_UNTEN = Math.max(...CHUNKS.map((c) => c.h - c.entry));
/** So weit darf der Boden vom Grundlinienband abweichen (v1: MAX_DRIFT 14; gelockert bis 40, siehe pickChunk) */
export const MAX_ABWEICHUNG = 14;

/**
 * Ein Durchlauf durch die Baustein-Auswahl eines Levels: merkt sich, was schon kam (keine Wiederholung
 * dicht hintereinander, schrittweise Einführung) und wo der Boden gerade liegt.
 *
 * @param {object} params    normalisierte Level-Parameter (seed, speedClass, …)
 * @param {string} biomeId
 * @param {{basisZeile: number, rasterHoehe: number}} raum  Grundlinie im Raster und Rasterhöhe — ein Chunk, der nicht hineinpasst, wird verworfen statt abgeschnitten
 */
export function neuerBausteinLauf(params, biomeId, raum) {
  const cls = SPEED_CLASSES[params.speedClass];
  return {
    params,
    ctx: { params, biome: BIOMES[biomeId], reach: reachForClass(params.speedClass), lengthFactor: cls.lengthFactor },
    // v1 rechnet mit BASE_ROW als Grundlinie; hier wird auf die Grundlinie des Welttyps umgerechnet.
    state: { cur: BASE_ROW, recent: [], lastTags: [], seen: new Set() },
    rng: createRng(params.seed, 'welttyp:bausteine'),
    basisZeile: raum.basisZeile,
    rasterHoehe: raum.rasterHoehe,
    index: 0,
  };
}

/** Zeile der Boden-OBERKANTE (Fels), auf der der nächste Baustein beginnen würde */
export const bodenZeile = (lauf) => lauf.basisZeile + (lauf.state.cur - BASE_ROW);

/**
 * Nächsten Baustein wählen und ausformen. `null`, wenn keiner passt (z. B. weil eine Kernidee zu viel
 * ausschließt) — der Welttyp füllt die Stelle dann anders.
 *
 * @param {number} fortschritt  0..1 durchs Level
 * @param {(tpl: object) => boolean} [filter]  Ausschlüsse, z. B. durch eine Kernidee
 * @param {number} [bodenRow]  Boden-Oberkante, auf der der Baustein beginnen soll. Ohne Angabe gilt die Grundlinie
 *   des Laufs (Parcours: ein durchgehender Boden, den der Lauf selbst mitführt). MIT Angabe entscheidet der
 *   Aufrufer über die Höhe (Himmelsreich-Inseln, Höhlen-Zonen): Der v1-Drift-Filter wird dann neutral und
 *   die Platzprüfung rechnet mit dieser Zeile — sonst würde ein hoher Chunk auf einer hohen Insel oben
 *   stillschweigend abgeschnitten.
 * @returns {object|null} ausgeformte Instanz (rows, entities, w, h, entry, exit, tpl) — noch nicht eingesetzt
 */
/**
 * Chunks, die in den Welttypen nicht mehr gewählt werden (Rückmeldung 25.09.2026): Man läuft über den Schalter, die Wand
 * vor einem klappt um — keine Aufgabe, nur eine Taste. Im v1-Generator (Tagesrennen) bleiben sie vorerst.
 */
const AUSGESCHLOSSEN = new Set(['switch-gate', 'switch-air']);

export function naechsterBaustein(lauf, fortschritt, filterEingabe, bodenRow) {
  const filter = (tpl) => !AUSGESCHLOSSEN.has(tpl.id) && (!filterEingabe || filterEingabe(tpl));
  const frei = bodenRow !== undefined;
  if (frei) lauf.state.cur = BASE_ROW;
  let tpl;
  try {
    tpl = pickChunk(lauf.ctx, lauf.state, fortschritt, lauf.rng, filter);
  } catch {
    return null;                      // "Kein passender Chunk": kein Fehler, nur eine Lücke im Angebot
  }
  const inst = instantiate(tpl, { ...lauf.ctx, progress: fortschritt }, createRng(lauf.params.seed, `baustein:${lauf.index++}`));
  if (!inst) return null;

  // Passt er ins Raster? (pickChunk lockert die Abweichung im Notfall bis 40 Zeilen)
  const dy = (frei ? bodenRow : bodenZeile(lauf)) - inst.entry;
  if (dy < 0 || dy + inst.h + UNTERKANTE > lauf.rasterHoehe) return null;

  if (!frei) lauf.state.cur += inst.exit - inst.entry;
  lauf.state.recent.push(tpl.id);
  if (lauf.state.recent.length > 4) lauf.state.recent.shift();
  lauf.state.lastTags.push(tpl.tags[0] || '');
  if (lauf.state.lastTags.length > 2) lauf.state.lastTags.shift();
  for (const t of tpl.tags) lauf.state.seen.add(t);
  return inst;
}

/**
 * Setzt einen ausgeformten Baustein ins Raster — 1:1 wie `assemble()` im v1-Generator, damit die
 * Lösbarkeits-Beweise des Solvers weiter gelten: Rechteck des Chunks überschreiben, DARÜBER offener
 * Himmel, darunter (bei festem Boden am Chunk-Rand) `UNTERKANTE` Zeilen Fels, danach Luft.
 *
 * @param {string[][]} grid
 * @param {object} inst        von naechsterBaustein()
 * @param {number} x0          erste Spalte im Raster
 * @param {number} bodenRow    Zeile der Boden-Oberkante am Eingang (dort steht `inst.entry` des Chunks)
 * @param {number} nr          laufende Nummer (macht Portal-Kennungen je Baustein eindeutig)
 * @param {object[]} entities  wird ergänzt
 * @param {{fels?: boolean}} [opt]  fels: Die Welt ist unten massiv (Höhlen) — dann läuft der Fels unter einem festen
 *   Chunk-Rand bis zum Rasterrand durch, statt nach UNTERKANTE Zeilen in einen Hohlraum überzugehen.
 * @returns {{x0, w, entryRow, exitRow, id, tags, difficulty}}  Zeilen sind Boden-Oberkanten (Fels)
 */
export function stempeln(grid, inst, x0, bodenRow, nr, entities, opt = {}) {
  const dy = bodenRow - inst.entry;
  const gh = grid.length;
  for (let cx = 0; cx < inst.w; cx++) {
    const unten = inst.rows[inst.h - 1][cx];
    for (let gy = 0; gy < gh; gy++) {
      const ly = gy - dy;
      let ch;
      if (ly < 0) ch = '.';
      else if (ly < inst.h) ch = inst.rows[ly][cx];
      else ch = unten === '#' && (opt.fels || ly < inst.h + UNTERKANTE) ? '#' : '.';
      grid[gy][x0 + cx] = ch;
    }
  }
  for (const e of inst.entities) {
    const { lx, ly, ...spec } = e;
    if (spec.id) spec.id = `b${nr}:${spec.id}`;
    if (spec.pair) spec.pair = `b${nr}:${spec.pair}`;
    entities.push({ ...spec, tx: x0 + lx, ty: dy + ly });
  }
  return {
    x0, w: inst.w, entryRow: bodenRow, exitRow: bodenRow + (inst.exit - inst.entry),
    id: inst.tpl.id, tags: inst.tpl.tags, difficulty: inst.tpl.difficulty,
  };
}
