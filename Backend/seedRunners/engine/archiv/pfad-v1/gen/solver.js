// Solver: spielt ein Level mit der ECHTEN Sim durch und sucht dabei einen Weg vom Start ins Ziel.
//
// Das ist das Werkzeug, das "garantierte Lösbarkeit" belastbar macht. Der Validator (validator.js)
// kennt nur Lückenbreiten; ob ein Chunk mit Sägen, Lasern, Plattformen und Wandsprüngen im Inneren
// schaffbar ist, zeigt nur ein Durchspielen. Weil die Sim deterministisch ist, ist ein gefundener
// Weg ein Beweis: Er lässt sich abspielen und endet im Ziel.
//
// Verfahren: Beam-Search. Ein Zustand ist eine kopierte Welt; jeder Schritt probiert eine kleine
// Menge Tasteneingaben ("Makroaktionen", je 6 Ticks lang = 50 ms) aus, wirft alle weg, in denen
// man stirbt, und behält die aussichtsreichsten (nach Abstand zum Ziel). Ähnliche Zustände
// werden zusammengeworfen, damit die Auswahl nicht mit lauter Kopien desselben Wegs verstopft.
//
// Grenzen: Findet der Solver nichts, heißt das nicht "unmöglich" — nur "nicht gefunden". Ein
// Fehlschlag ist ein Anlass, den Chunk anzusehen. Ein Erfolg dagegen ist gesichert.
import { INPUT } from '../sim/inputBits.js';
import { createWorld, stepWorld } from '../sim/world.js';
import { parseMap } from '../sim/tilemap.js';
import { classTuning } from '../sim/classes.js';
import { TILE } from '../sim/config.js';

const { LEFT, RIGHT, UP, DOWN, JUMP, DASH, GRAPPLE } = INPUT;

/** Ticks pro Makroaktion */
export const STEP_TICKS = 6;

export const ACTIONS = [
  RIGHT, RIGHT | JUMP, 0, JUMP, LEFT, LEFT | JUMP,
  RIGHT | DASH, RIGHT | UP | DASH, RIGHT | DOWN | DASH, UP | DASH, RIGHT | JUMP | DASH,
  RIGHT | UP | GRAPPLE, UP | GRAPPLE, RIGHT | GRAPPLE, LEFT | UP | GRAPPLE,
  RIGHT | UP, UP, LEFT | UP, DOWN | JUMP, RIGHT | DOWN,
];

const NOOP = () => {};

/** Kopie einer Welt für die Suche. Karte, Konfiguration und Modul-Tabelle bleiben geteilt (unveränderlich). */
export function cloneWorld(w) {
  const p = w.player;
  return {
    ...w,
    player: { ...p, grapple: p.grapple ? { ...p.grapple } : null },
    elements: w.elements.map((e) => ({ ...e })),
    solids: [],
    flags: { ...w.flags },
    emit: NOOP,
  };
}

// Grobe Ortsbestimmung des Ziels: Mitte der Zielkacheln
function goalOf(world) {
  const f = world.map.finish;
  const tx = f.reduce((a, t) => a + t.tx, 0) / f.length;
  const ty = f.reduce((a, t) => a + t.ty, 0) / f.length;
  return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
}

// Wohin zielt die Suche gerade? Ist eine Tür zu und ein Schlüssel noch nicht genommen (und keiner
// in der Tasche), ist der nächste Schlüssel das Teilziel — der Weg dorthin führt vom Ziel weg und
// würde sonst von der Auswahl abgeschnitten. Danach zählt wieder das Ziel.
function targetOf(w, goal) {
  if (w.flags.keys === 0 && w.elements.some((e) => e.type === 'door' && !e.open)) {
    const p = w.player;
    let best = null;
    let bestD = Infinity;
    for (const e of w.elements) {
      if (e.type !== 'key' || e.taken) continue;
      const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return goal;
}

// Umweg-Abstand: Wie viele Kacheln sind es vom Ziel aus DURCH LUFT bis zu jeder Kachel? Die Luftlinie
// führt den Solver in Sackgassen, sobald der Weg erst vom Ziel wegführt (ein Schacht abwärts, ein Turm
// mit Kammern): Er bleibt an der Wand mit dem kleinsten Luftlinien-Abstand hängen. Nur mit `opts.geo`
// — die 396/396-Beweise der Chunks wurden mit der Luftlinie geführt und bleiben damit unverändert.
function geoField(map, finish) {
  const d = new Int32Array(map.w * map.h).fill(-1);
  const q = [];
  for (const f of finish) {
    const i = f.ty * map.w + f.tx;
    if (i >= 0 && i < d.length) { d[i] = 0; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % map.w;
    const y = (i - x) / map.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const j = ny * map.w + nx;
      if (d[j] >= 0 || map.solid[j]) continue;
      d[j] = d[i] + 1;
      q.push(j);
    }
  }
  return { d, w: map.w, h: map.h };
}

function score(w, goal, geo) {
  const p = w.player;
  const doors = w.elements.reduce((n, e) => n + (e.type === 'door' && e.open ? 1 : 0), 0);
  const t = targetOf(w, goal);
  if (geo && t === goal) {
    const tx = Math.min(geo.w - 1, Math.max(0, Math.floor(p.x / TILE)));
    const ty = Math.min(geo.h - 1, Math.max(0, Math.floor(p.y / TILE)));
    const umweg = geo.d[ty * geo.w + tx];
    if (umweg >= 0) return -(umweg * TILE) + geo.bonus * (w.flags.keys + doors);
  }
  // Schlüssel und geöffnete Türen zählen als Fortschritt, damit der Wechsel des Teilziels nicht bestraft wird
  return -(Math.abs(p.x - t.x) + 0.7 * Math.abs(p.y - t.y)) + 2000 * (w.flags.keys + doors);
}

function keyOf(w) {
  const p = w.player;
  const dyn = w.elements.reduce((h, e) => h + (e.st || 0) * 7 + (e.taken ? 3 : 0) + (e.open ? 5 : 0) + (e.on ? 1 : 0), 0);
  return [
    Math.round(p.x / 6), Math.round(p.y / 6), Math.round(p.vx / 45), Math.round(p.vy / 45),
    p.dashCharges, p.airJumps, p.onGround ? 1 : 0, p.grapple ? 1 : 0, p.gd, w.flags.sw, w.flags.keys,
    // Zeit-Phase: Ampeln, Sägen und Plattformen laufen nach der Tick-Zahl, ein Zustand ist also nur
    // mit gleicher Phase wirklich "derselbe"
    Math.floor(w.tick / STEP_TICKS) % 24, dyn,
  ].join('|');
}

// Auswahl der besten Zustände MIT Streuung: höchstens `PER_CELL` je Ortszelle (3×3 Tiles), erst danach
// wird mit den übrigen aufgefüllt. Reine Punktzahl-Auswahl bleibt in lokalen Minima hängen — z.B.
// direkt unter einer Plattform, auf die man nur von der Seite kommt.
const CELL = 3 * TILE;
const PER_CELL = 5;
function selectDiverse(nodes, beam) {
  nodes.sort((a, b) => b.sc - a.sc);
  const taken = [];
  const rest = [];
  const perCell = new Map();
  for (const n of nodes) {
    const p = n.w.player;
    const cell = `${Math.floor(p.x / CELL)}|${Math.floor(p.y / CELL)}`;
    const count = perCell.get(cell) || 0;
    if (count < PER_CELL && taken.length < beam) {
      perCell.set(cell, count + 1);
      taken.push(n);
    } else {
      rest.push(n);
    }
  }
  for (const n of rest) {
    if (taken.length >= beam) break;
    taken.push(n);
  }
  return taken.sort((a, b) => b.sc - a.sc);
}

/**
 * @param {object} level  Level (siehe gen/generator.js)
 * @param {{ beam?: number, maxSteps?: number, tuning?: object, geo?: boolean, startDash?: number, startWelt?: object }} [opts]  beam: feste Breite; ohne Angabe 150 → 400 → 900.
 *   geo: Umweg-Abstand durch Luft statt Luftlinie (für Welten mit Schächten/Türmen). startDash: Dash-Ladungen am Start
 *   (0 = "der Dash ist schon verbraucht"; Kristalle füllen weiter bis `cfg.dashCharges` auf — deshalb NICHT über `tuning`).
 * @returns {{ solved: boolean, ticks?: number, inputs?: number[], steps: number, expanded: number, best: number }}
 */
export function solveLevel(level, opts = {}) {
  // Ohne feste Breite stufenweise breiter suchen: Die meisten Chunks fallen bei 150 sofort, einzelne
  // brauchen mehr Streuung. So bleibt der Normalfall schnell und der Fehlschlag aussagekräftig.
  const widths = opts.beam ? [opts.beam] : [150, 400, 900];
  let result = null;
  for (const beam of widths) {
    result = solveWithBeam(level, { ...opts, beam });
    if (result.solved) return { ...result, beam };
  }
  return { ...result, beam: widths[widths.length - 1] };
}

function solveWithBeam(level, opts) {
  const beam = opts.beam;
  const maxSteps = opts.maxSteps ?? 260;
  const tuning = { ...classTuning(level.params.speedClass), ...(opts.tuning || {}) };
  // `startWelt`: von einem beliebigen Zustand aus weitersuchen (Menschen-Prüfung, gen/tools/menschen/verzeihlich.mjs).
  // Ohne die Option unverändert.
  const start = opts.startWelt ? cloneWorld(opts.startWelt) : createWorld(parseMap(level.rows, { entities: level.entities, checkpointOrder: level.checkpointOrder }), { tuning });
  if (opts.startDash !== undefined && !opts.startWelt) start.player.dashCharges = opts.startDash;
  const goal = goalOf(start);
  const geo = opts.geo ? geoField(start.map, start.map.finish) : null;
  if (geo) {
    // Wer den Schlüssel nimmt, wechselt das Teilziel vom nahen Schlüssel zum fernen Ziel: Die Punktzahl fällt
    // um fast die ganze Restdistanz. Ein fester Bonus von 2000 reichte nur, solange das Ziel nah war (Chunks,
    // Fenster); in einem ganzen Level bestrafte die Suche das Schlüsselnehmen und blieb am Schlüssel stehen.
    const d0 = geo.d[Math.floor(start.player.y / TILE) * geo.w + Math.floor(start.player.x / TILE)];
    geo.bonus = 2000 + (d0 >= 0 ? d0 * TILE : 0);
  }

  let frontier = [{ w: start, parent: null, action: 0, sc: score(start, goal, geo) }];
  let expanded = 0;
  let bestScore = frontier[0].sc;
  let bestNode = frontier[0];

  for (let step = 0; step < maxSteps; step++) {
    const next = new Map();
    for (const node of frontier) {
      for (const action of ACTIONS) {
        const w = cloneWorld(node.w);
        let dead = false;
        for (let t = 0; t < STEP_TICKS; t++) {
          stepWorld(w, action);
          if (w.deaths > 0) { dead = true; break; }
          if (w.finished) break;
        }
        expanded++;
        if (dead) continue;
        const child = { w, parent: node, action, sc: score(w, goal, geo) };
        if (w.finished) return opts.startWelt ? { solved: true, ticks: w.tick, steps: step + 1, expanded } : finish(child, level, opts, tuning, step + 1, expanded);
        const key = keyOf(w);
        const known = next.get(key);
        if (!known || known.sc < child.sc) next.set(key, child);
      }
    }
    frontier = selectDiverse([...next.values()], beam);
    if (frontier.length === 0) break;
    if (frontier[0].sc > bestScore) {
      bestScore = frontier[0].sc;
      bestNode = frontier[0];
    }
  }
  const bp = bestNode.w.player;
  // Wo kam die Suche am weitesten? (Kachel-Koordinaten, für die Fehlersuche)
  return {
    solved: false, steps: maxSteps, expanded, best: bestScore,
    reached: { tx: Math.round(bp.x / TILE), ty: Math.round(bp.y / TILE), keys: bestNode.w.flags.keys },
  };
}

// Weg zurückverfolgen und in einer FRISCHEN Welt nachspielen: nur ein nachgespielter Weg zählt.
function finish(node, level, opts, tuning, steps, expanded) {
  const actions = [];
  for (let n = node; n.parent; n = n.parent) actions.push(n.action);
  actions.reverse();
  const inputs = actions.flatMap((a) => Array(STEP_TICKS).fill(a));

  const w = createWorld(parseMap(level.rows, { entities: level.entities, checkpointOrder: level.checkpointOrder }), { tuning });
  if (opts.startDash !== undefined) w.player.dashCharges = opts.startDash;
  for (const mask of inputs) {
    stepWorld(w, mask);
    if (w.finished || w.deaths > 0) break;
  }
  if (!w.finished || w.deaths > 0) {
    return { solved: false, steps, expanded, best: node.sc, error: 'Nachspielen des gefundenen Wegs scheiterte' };
  }
  return { solved: true, ticks: w.finishTick, inputs, steps, expanded, best: node.sc };
}
