// Level-Generator: aus (Seed, Länge, Tempo-Klasse, Biom) wird ein Level — bei allen Spielern
// bitgleich, weil nur der seeded PRNG (sim/rng.js) Entscheidungen trifft.
//
// Ablauf
//   1. Biom und Chunk-Anzahl festlegen
//   2. Chunk für Chunk aus den Templates würfeln: nach Schwierigkeitskurve (Einführung →
//      Steigerung → Kombinationen → Finale), gefiltert auf das, was zur Tempo-Klasse passt
//   3. Jeden Chunk ausformen: Lücken nach der gemessenen Reichweite dehnen, Zufallswerte der
//      Elemente auswürfeln, ggf. spiegeln, ggf. vereisen
//   4. Alle Chunks zu EINEM Raster zusammensetzen (Ein-/Ausgangshöhen aneinander ausgerichtet)
//
// Jeder Chunk bekommt einen eigenen Zufallsstrom (createRng(seed, "chunk:7")): Ändert sich später,
// wie viele Zufallszahlen ein Chunk verbraucht, verschiebt das nicht alle folgenden.
//
// Lösbarkeit: Die Übergänge sind ebener Boden auf definierter Höhe, Chunks sind einzeln geprüft
// (Reichweiten-Validator hier, Suchlauf in gen/solver.js), also hängt jeder Chunk nur von sich ab.

import { createRng, hashText } from '../sim/rng.js';
import { SPEED_CLASSES, isSpeedClass } from '../sim/classes.js';
import { reachForClass } from '../sim/reach.js';
import { BIOMES, BIOME_IDS, isBiome } from './biomes.js';
import { CHUNKS, SPECIAL_CHUNKS } from './chunks/index.js';

export const LENGTHS = Object.freeze({ short: 10, medium: 30, long: 55 });
// Nach so vielen Chunks kommt ein Checkpoint
export const CHECKPOINT_EVERY = Object.freeze({ short: 4, medium: 5, long: 6 });

// Wie viel der GEMESSENEN Reichweite ein Chunk der jeweiligen Schwierigkeit ausnutzen darf.
// Die Reichweite ist das, was ein guter Spieler mit perfektem Timing schafft; 0,55 heißt "auch
// mit ordentlich Spielraum", 0,86 heißt "nur mit sauberem Timing".
export const SAFETY = Object.freeze({ 1: 0.55, 2: 0.62, 3: 0.7, 4: 0.78, 5: 0.86 });

// Mechaniken, die vor ihrem ersten "ernsten" Auftritt einmal sicher eingeführt werden sollen
const MECHANIC_TAGS = new Set([
  'spikes', 'double', 'wall', 'sticky', 'grapple', 'dash', 'crystal', 'ring', 'wind', 'portal',
  'switch', 'key', 'mover', 'gravity', 'ice', 'crumble', 'conveyor', 'spring', 'oneway', 'laser',
  'saw', 'falling',
]);

// Höhenlage: Der Boden am Chunk-Übergang bleibt in diesem Band um die Grundlinie
export const BASE_ROW = 80;
const MAX_DRIFT = 14;

export const LEVEL_VERSION = 1;

// Bröckelblöcke werden im Verlauf des Levels schneller: Verzögerung bis zum Einsturz in Sekunden,
// am Anfang gemütlich, am Ende knapp. Der Solver prüft mit dem Ende (Fortschritt 1), dem Schwersten.
export const crumbleDelay = (progress) => Math.round((0.28 - 0.1 * progress) * 1000) / 1000;

// ── Parameter ───────────────────────────────────────────────────────────────

/**
 * Phase D (27.09.2026): Live-Runden und Tagesrennen bauen mit dem Generator „Pfad“ (gen/world), gekennzeichnet durch
 * `gen: 'pfad'` in den Parametern — immer lang und „super“. Ohne das Feld bleibt alles beim Chunk-Generator v1: Alte
 * Runden, Tagesrennen und Bestzeiten bleiben so nachprüfbar.
 */
export const GEN_PFAD = 'pfad';
/**
 * Generator-Version der Pfad-Level (Parameter `gv`). Ein Zufallslevel ist „Seed + Biom + gv“: Ändert sich der Generator, bekommt
 * er eine neue Nummer, und die alte bleibt eingefroren für ihre Seeds zuständig (archiv/pfad-vN, gen/tools/einfrieren.mjs) —
 * so bleiben Favoriten, vergangene Tagesrennen und geteilte Seeds genau dasselbe Level. Muss zu Backend/seedRunners/genVersion.js
 * passen. Parameter ohne `gv` stammen aus der Zeit vor der Versionierung: Version 1.
 */
export const GEN_VERSION = 1;
const cleanGv = (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 999 ? Number(v) : 1);

/** Ab diesem Tag ist das Tagesrennen ein Pfad-Level (muss zu Backend/seedRunners/daily.js passen) */
export const PFAD_TAGESRENNEN_AB = '2026-09-26';

export function normalizeParams(raw = {}) {
  if (raw.gen === GEN_PFAD) {
    const biome = raw.biome === 'random' || !isBiome(raw.biome) ? 'random' : raw.biome;
    const seed = raw.seed === undefined || raw.seed === null || raw.seed === '' ? '0' : String(raw.seed).trim();
    return { seed, length: 'long', speedClass: 'super', biome, gen: GEN_PFAD, gv: cleanGv(raw.gv) };
  }
  const length = LENGTHS[raw.length] ? raw.length : 'medium';
  const speedClass = isSpeedClass(raw.speedClass) ? raw.speedClass : 'normal';
  const biome = raw.biome === 'random' || !isBiome(raw.biome) ? 'random' : raw.biome;
  const seed = raw.seed === undefined || raw.seed === null || raw.seed === '' ? '0' : String(raw.seed).trim();
  return { seed, length, speedClass, biome };
}

/** Der Tages-Seed: alle Besucher bekommen am selben Kalendertag dasselbe Level. */
export function dailyParams(dateKey) {
  // (Tagesrennen bauen mit Version 1; bekommt der Generator eine neue Version, kommt hier ein Stichtag dazu — frühere Tage
  // behalten ihre Version, sonst änderte sich rückwirkend das Level vergangener Tage)
  if (dateKey >= PFAD_TAGESRENNEN_AB) return normalizeParams({ seed: `daily-${dateKey}`, biome: 'random', gen: GEN_PFAD, gv: 1 });
  return normalizeParams({ seed: `daily-${dateKey}`, length: 'medium', speedClass: 'normal', biome: 'random' });
}

// ── Kleinigkeiten ───────────────────────────────────────────────────────────

const round3 = (v) => Math.round(v * 1000) / 1000;

function resolveValue(v, rng) {
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.r)) {
    const [a, b] = v.r;
    return v.int ? rng.intRange(a, b) : round3(rng.range(a, b));
  }
  return v;
}

function resolveDef(def, rng) {
  const out = {};
  for (const [k, v] of Object.entries(def)) out[k] = resolveValue(v, rng);
  return out;
}

const SWAP_DIR = {
  left: 'right', right: 'left', upLeft: 'upRight', upRight: 'upLeft', downLeft: 'downRight', downRight: 'downLeft',
};
const SWAP_GLYPH = { '>': '<', '<': '>' };

// Ein Zeitpunkt in der Schwierigkeitskurve (0..1) → Zielschwierigkeit (1..5)
function targetDifficulty(f) {
  if (f < 0.15) return 1 + (f / 0.15) * 0.8;
  if (f < 0.5) return 1.8 + ((f - 0.15) / 0.35) * 1.4;
  if (f < 0.85) return 3.2 + ((f - 0.5) / 0.35) * 1.0;
  return 4.2 + ((f - 0.85) / 0.15) * 0.8;
}

// ── Chunk ausformen ─────────────────────────────────────────────────────────

/** Wie weit darf jede dehnbare Spalte gedehnt werden? null = Chunk passt nicht zur Klasse. */
function stretchBudget(tpl, reach) {
  const safe = SAFETY[tpl.difficulty];
  for (const g of tpl.gaps) {
    if (g.width > safe * reach.gap[g.reach] + 1e-9) return null;
  }
  const limits = [];
  for (const s of tpl.stretch) {
    if (!s.reach) {
      limits.push(s.max);
      continue;
    }
    const room = Math.floor(safe * reach.gap[s.reach] - s.base + 1e-9);
    if (room < 0) return null;
    limits.push(Math.min(s.max, room));
  }
  return limits;
}

/**
 * Formt ein Template zu einer konkreten Instanz aus. Alle Zufallsentscheidungen kommen aus `rng`.
 * Gibt null zurück, wenn der Chunk für diese Tempo-Klasse nicht taugt (Lücke schon im Grundzustand zu breit).
 */
export function instantiate(tpl, ctx, rng) {
  if (tpl.classes && !tpl.classes.includes(ctx.params.speedClass)) return null;
  const limits = stretchBudget(tpl, ctx.reach);
  if (!limits) return null;

  // 1. Dehnung: je Eintrag k zusätzliche Kopien der Spalte
  const ks = tpl.stretch.map((s, i) => {
    const max = limits[i];
    if (max <= 0) return 0;
    if (s.reach) return rng.intRange(Math.max(0, max - 2), max);
    return Math.min(max, Math.round(rng.range(0, max + 1) * ctx.lengthFactor - 0.5));
  });

  const extraAt = new Map(tpl.stretch.map((s, i) => [s.col, ks[i]]));
  const colMap = [];        // Ausgabespalte → Quellspalte
  const outCol = [];        // Quellspalte → erste Ausgabespalte
  for (let x = 0; x < tpl.w; x++) {
    outCol[x] = colMap.length;
    colMap.push(x);
    for (let n = 0; n < (extraAt.get(x) || 0); n++) colMap.push(x);
  }
  const w = colMap.length;

  // 2. Elemente aus den Markern (Quellkoordinaten → Ausgabekoordinaten), Zufallswerte auflösen
  const entities = [];
  const stripped = tpl.rows.map((row, y) => {
    let out = '';
    for (let x = 0; x < tpl.w; x++) {
      const ch = row[x];
      if (ch >= 'a' && ch <= 'z') {
        const def = resolveDef(tpl.markers[ch], rng);
        const chance = def.chance;
        delete def.chance;
        if (chance === undefined || rng.chance(chance)) entities.push({ ...def, lx: outCol[x], ly: y });
        out += '.';
      } else {
        out += ch;
      }
    }
    return out;
  });
  const stretched = stripped.map((row) => colMap.map((c) => row[c]).join(''));

  // 3. Spiegeln
  const mirrored = tpl.mirror && rng.chance(0.5);
  let rows = stretched;
  if (mirrored) {
    rows = rows.map((r) => [...r].reverse().map((c) => SWAP_GLYPH[c] || c).join(''));
    for (const e of entities) {
      // Zonen und Plattformen haben eine Breite: gespiegelt wird ihre LINKE Kante
      const width = e.type === 'mover' ? (e.width || 3)
        : e.type === 'wind' ? (e.w || 3)
          : e.type === 'gravityZone' ? (e.w || 4)
            : e.type === 'fallingBlock' ? (e.width || 1) : 1;
      e.lx = w - e.lx - width;
      if (e.dir && SWAP_DIR[e.dir]) e.dir = SWAP_DIR[e.dir];
      if (e.path) e.path = e.path.map(([dx, dy]) => [-dx, dy]);
      if (typeof e.ax === 'number') e.ax = -e.ax;
    }
  }

  // 4. Vereisen (Eis-Biom): nur die Oberfläche, nicht die Übergänge
  if (ctx.biome.iceFloors && tpl.iceable) {
    rows = rows.map((row, y) => [...row].map((c, x) => {
      if (c !== '#' || x < 2 || x >= w - 2) return c;
      return rows[y - 1] && rows[y - 1][x] === '.' ? 'I' : c;
    }).join(''));
  }

  // Bröckelblöcke: das Zeichen wird zum Element mit Verzögerung nach Level-Fortschritt
  // (nach dem Spiegeln, die Koordinaten sind also schon die endgültigen)
  const delay = crumbleDelay(ctx.progress || 0);
  rows = rows.map((row, y) => [...row].map((c, x) => {
    if (c !== '~') return c;
    entities.push({ type: 'crumble', delay, lx: x, ly: y });
    return '.';
  }).join(''));

  // Alle Lücken der Instanz mit ihrer tatsächlichen Breite (für den Validator)
  const gaps = [
    ...tpl.gaps.map((g) => ({ reach: g.reach, width: g.width })),
    ...tpl.stretch.map((s, i) => (s.reach ? { reach: s.reach, width: s.base + ks[i] } : null)).filter(Boolean),
  ];

  return {
    tpl, w, h: tpl.h, entry: tpl.entry, exit: tpl.exit, rows, entities, mirrored, stretch: ks, gaps,
  };
}

// ── Auswahl ─────────────────────────────────────────────────────────────────

// `filter` (optional): Welttypen mit eigenen Regeln (gen/world/) dürfen Chunks ausschließen, ohne die
// Kurve, die Einführungsreihenfolge und die Biom-Vorlieben zu kopieren. Ohne Filter bleibt alles wie bisher.
export function pickChunk(ctx, state, f, rng, filter) {
  const target = targetDifficulty(f);
  const cands = [];
  const weights = [];

  const consider = (tpl, relax) => {
    if (tpl.classes && !tpl.classes.includes(ctx.params.speedClass)) return;
    if (filter && !filter(tpl)) return;
    if (tpl.combo && f < 0.45) return;
    if (Math.abs(tpl.difficulty - target) > (relax >= 2 ? 3 : 1.25)) return;
    const next = state.cur + (tpl.exit - tpl.entry);
    if (Math.abs(next - BASE_ROW) > (relax >= 3 ? 40 : MAX_DRIFT)) return;
    if (relax < 1 && state.recent.includes(tpl.id)) return;
    if (!stretchBudget(tpl, ctx.reach)) return;

    let w = tpl.weight;
    // Biom-Vorlieben
    for (const tag of tpl.tags) w *= ctx.biome.prefer[tag] ?? 1;
    // Nähe zur Zielschwierigkeit
    w /= 1 + (tpl.difficulty - target) * (tpl.difficulty - target);
    // Schrittweise Einführung: neue Mechaniken zuerst in einer sicheren Erstbegegnung
    const fresh = tpl.tags.filter((t) => MECHANIC_TAGS.has(t) && !state.seen.has(t));
    if (fresh.length) {
      if (tpl.combo) w *= 0.05;
      else if (tpl.intro && fresh.includes(tpl.intro)) w *= f < 0.6 ? 4 : 1.5;
      else if (tpl.difficulty > 2) w *= f < 0.5 ? 0.12 : 0.5;
    }
    if (tpl.combo && tpl.tags.every((t) => !MECHANIC_TAGS.has(t) || state.seen.has(t))) w *= 2.5;
    // Zurück zur Grundlinie steuern: Chunks, die der Drift entgegenwirken, bevorzugen
    if (Math.abs(next - BASE_ROW) < Math.abs(state.cur - BASE_ROW)) w *= 1.6;
    // Nicht dieselbe Hauptmechanik dreimal hintereinander
    if (state.lastTags.length >= 2 && tpl.tags[0] && state.lastTags.every((t) => t === tpl.tags[0])) w *= 0.15;
    if (w > 0) {
      cands.push(tpl);
      weights.push(w);
    }
  };

  for (let relax = 0; relax <= 3 && cands.length === 0; relax++) {
    for (const tpl of CHUNKS) consider(tpl, relax);
  }
  if (cands.length === 0) throw new Error(`Kein passender Chunk (Seed ${ctx.params.seed}, Position ${f})`);
  return rng.weighted(cands, weights);
}

// ── Zusammensetzen ──────────────────────────────────────────────────────────

/** Stabile Textform für den Level-Hash: Schlüssel sortiert, sonst nichts Zufälliges. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${k}:${stable(value[k])}`).join(',')}}`;
  }
  return String(value);
}

export function hashLevel(level) {
  return hashText(`${level.rows.join('\n')}|${stable(level.entities)}`);
}

export function generateLevel(rawParams) {
  const params = normalizeParams(rawParams);
  const cls = SPEED_CLASSES[params.speedClass];
  const reach = reachForClass(params.speedClass);

  // Biom: "random" wird aus dem Seed ausgewürfelt (eigener Strom, damit spätere Änderungen an der
  // Chunk-Wahl das Biom nicht verschieben)
  const biomeId = params.biome === 'random' ? createRng(params.seed, 'biome').pick(BIOME_IDS) : params.biome;
  const biome = BIOMES[biomeId];
  const ctx = { params, biome, reach, lengthFactor: cls.lengthFactor };

  const layout = createRng(params.seed, 'layout');
  const count = Math.max(3, Math.round(LENGTHS[params.length] * cls.lengthFactor));
  const cpEvery = CHECKPOINT_EVERY[params.length];

  const state = { cur: BASE_ROW, recent: [], lastTags: [], seen: new Set() };
  const placements = [];
  let x0 = 0;

  const place = (tpl, index, kind, progress = 0) => {
    const inst = instantiate(tpl, { ...ctx, progress }, createRng(params.seed, `chunk:${index}`));
    if (!inst) throw new Error(`Chunk ${tpl.id} passt nicht zur Klasse ${params.speedClass}`);
    const dy = state.cur - inst.entry;
    placements.push({ ...inst, index, kind, x0, dy });
    x0 += inst.w;
    state.cur += inst.exit - inst.entry;
    return inst;
  };

  let index = 0;
  place(SPECIAL_CHUNKS.start, index++, 'start');
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0 : i / (count - 1);
    const tpl = pickChunk(ctx, state, f, layout);
    place(tpl, index++, 'chunk', f);
    state.recent.push(tpl.id);
    if (state.recent.length > 4) state.recent.shift();
    state.lastTags.push(tpl.tags[0] || '');
    if (state.lastTags.length > 2) state.lastTags.shift();
    for (const t of tpl.tags) if (MECHANIC_TAGS.has(t)) state.seen.add(t);
    // Checkpoint nach jedem `cpEvery`-ten Chunk, aber nicht direkt vor dem Ziel
    if ((i + 1) % cpEvery === 0 && i < count - 1) place(SPECIAL_CHUNKS.checkpoint, index++, 'checkpoint');
  }
  place(SPECIAL_CHUNKS.finish, index++, 'finish');

  const level = assemble(placements, x0, params, biomeId);
  return level;
}

/**
 * Ein einzelnes Template als Mini-Level (Start · Chunk · Ziel) — für den Solver und Vorschauen.
 * Gibt null zurück, wenn der Chunk für die Tempo-Klasse nicht taugt.
 */
export function generateSingle(tpl, rawParams) {
  const params = normalizeParams(rawParams);
  const cls = SPEED_CLASSES[params.speedClass];
  const biomeId = params.biome === 'random' ? 'meadow' : params.biome;
  const ctx = { params, biome: BIOMES[biomeId], reach: reachForClass(params.speedClass), lengthFactor: cls.lengthFactor, progress: 1 };
  const inst = instantiate(tpl, ctx, createRng(params.seed, 'chunk:1'));
  if (!inst) return null;

  const placements = [];
  let cur = BASE_ROW;
  let x0 = 0;
  [[SPECIAL_CHUNKS.start, null, 'start'], [tpl, inst, 'chunk'], [SPECIAL_CHUNKS.finish, null, 'finish']].forEach(([t, made, kind], index) => {
    const item = made || instantiate(t, ctx, createRng(params.seed, `chunk:${index}`));
    placements.push({ ...item, index, kind, x0, dy: cur - item.entry });
    x0 += item.w;
    cur += item.exit - item.entry;
  });
  return assemble(placements, x0, params, biomeId);
}

/**
 * Setzt ausgeformte Chunks (siehe instantiate) zu einem Level zusammen. Getrennt von
 * generateLevel, damit der Solver einzelne Chunks in einem Mini-Level (Start · Chunk · Ziel)
 * prüfen kann.
 */
export function assemble(placements, totalWidth, params, biomeId) {
  // Raster: Zeilenbereich bestimmen (jeder Chunk hat seinen eigenen Höhenversatz)
  const top = Math.min(...placements.map((p) => p.dy)) - 3;
  const bottom = Math.max(...placements.map((p) => p.dy + p.h)) + 6;
  const height = bottom - top;
  const width = totalWidth;

  const grid = Array.from({ length: height }, () => Array(width).fill('.'));
  for (const p of placements) {
    for (let cx = 0; cx < p.w; cx++) {
      const bottomCell = p.rows[p.h - 1][cx];
      for (let gy = 0; gy < height; gy++) {
        const ly = gy + top - p.dy;
        let ch;
        if (ly < 0) ch = '.';
        else if (ly < p.h) ch = p.rows[ly][cx];
        else ch = bottomCell === '#' ? '#' : '.';
        grid[gy][p.x0 + cx] = ch;
      }
    }
  }

  // Elemente: Chunk-Koordinaten → Level-Koordinaten, Portal-Kennungen je Chunk eindeutig machen
  const entities = [];
  for (const p of placements) {
    for (const e of p.entities) {
      const { lx, ly, ...spec } = e;
      if (spec.id) spec.id = `c${p.index}:${spec.id}`;
      if (spec.pair) spec.pair = `c${p.index}:${spec.pair}`;
      entities.push({ ...spec, tx: p.x0 + lx, ty: p.dy + ly - top });
    }
  }

  const level = {
    version: LEVEL_VERSION,
    params,
    biome: biomeId,
    width,
    height,
    rows: grid.map((r) => r.join('')),
    entities,
    placements: placements.map((p) => ({
      id: p.tpl.id, kind: p.kind, index: p.index, x0: p.x0, w: p.w, dy: p.dy - top,
      entry: p.entry, exit: p.exit, difficulty: p.tpl.difficulty, needs: p.tpl.needs, tags: p.tpl.tags,
      mirrored: p.mirrored, stretch: p.stretch, gaps: p.gaps,
    })),
  };
  level.hash = hashLevel(level);
  return level;
}
