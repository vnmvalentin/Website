// engine/physics.js — Simulation eines Zugs: eine Scheibe bekommt einen Stoß, dann rollt alles aus.
//
// Kreise gegen Kreise (Impuls mit Massen und Stoßzahl), Kreise gegen Strecken (Banden, Torkästen) und Kreise gegen
// feste Hindernisse. Die Pfosten sind die Enden der Strecken — ein Kreis, der auf ein Streckenende trifft, prallt wie
// an einem runden Pfosten ab. Das Feld kommt aus dem Zustand (state.field → fields.js).
// Deterministisch: gleicher Startzustand + gleicher Stoß (+ gleiches Power-up) ⇒ bitgleiches Ergebnis im Browser und
// auf dem Server. Deshalb nur Grundrechenarten und Math.sqrt.

import { PIECE, BALL, PHYS, GOAL_RULE } from './constants.js';
import { getField } from './fields.js';
import { POWERUP_FX } from './powerups.js';

/**
 * Neue Simulation aus einem Ruhezustand.
 * state: { field?, pieces: [{ x, y, team }], ball: { x, y } }
 * shot:  { piece, sx, sy } mit |(sx, sy)| ≤ 1 (Richtung × Kraft) oder null (nur ausrollen lassen)
 * mods:  { power, team } — Power-up des Chaos-Modus für diesen Zug (powerups.js) oder null
 */
export function createSim(state, shot, mods = null) {
  const field = getField(state.field);
  const bodies = state.pieces.map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0, r: PIECE.R, m: PIECE.M, ball: false, frozen: false }));
  bodies.push({ x: state.ball.x, y: state.ball.y, vx: 0, vy: 0, r: BALL.R, m: BALL.M, ball: true, frozen: false });
  const power = mods?.power || null;
  let speed = PHYS.MAX_SHOT;
  if (power === 'turbo') speed *= POWERUP_FX.TURBO_SPEED;
  if (power === 'eis') {
    // Gegner eingefroren: unverrückbar wie eine Bande
    state.pieces.forEach((p, i) => {
      if (p.team !== mods.team) bodies[i].frozen = true;
    });
  }
  if (shot) {
    const b = bodies[shot.piece];
    b.vx = shot.sx * speed;
    b.vy = shot.sy * speed;
    if (power === 'schwer') b.m *= POWERUP_FX.SCHWER_MASS;
    if (power === 'riese') b.r *= POWERUP_FX.RIESE_RADIUS;
  }
  return {
    field,
    bodies,
    teams: state.pieces.map((p) => p.team),
    power,
    wallE: power === 'gummi' ? 1 : 0, // 0 = normale Stoßzahlen
    steps: 0,
    goal: null,
    done: false,
    events: [],
  };
}

function applyFriction(b) {
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (speed === 0) return;
  const decel = b.ball ? PHYS.BALL_DECEL + PHYS.BALL_DAMP * speed : PHYS.PIECE_DECEL + PHYS.PIECE_DAMP * speed;
  let next = speed - decel * PHYS.DT;
  if (next > PHYS.MAX_SPEED) next = PHYS.MAX_SPEED;
  if (next <= PHYS.STOP_SPEED) {
    b.vx = 0;
    b.vy = 0;
    return;
  }
  const k = next / speed;
  b.vx *= k;
  b.vy *= k;
}

function collideBodies(sim, a, b) {
  if (a.frozen && b.frozen) return;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const minD = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  let dist = Math.sqrt(d2);
  if (dist === 0) {
    dx = 1;
    dy = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  // Eingefrorene Körper haben „unendliche" Masse: sie weichen nicht und nehmen keinen Impuls auf
  const invA = a.frozen ? 0 : 1 / a.m;
  const invB = b.frozen ? 0 : 1 / b.m;
  const corr = (minD - (d2 === 0 ? 0 : dist)) / (invA + invB);
  a.x -= nx * corr * invA;
  a.y -= ny * corr * invA;
  b.x += nx * corr * invB;
  b.y += ny * corr * invB;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv >= 0) return;
  const e = a.ball || b.ball ? PHYS.E_BALL : PHYS.E_PIECE;
  const j = (-(1 + e) * rv) / (invA + invB);
  a.vx -= j * nx * invA;
  a.vy -= j * ny * invA;
  b.vx += j * nx * invB;
  b.vy += j * ny * invB;
  sim.events.push({ type: a.ball || b.ball ? 'ball' : 'piece', speed: -rv, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
}

/** Abprall an einem festen Punkt (px, py) mit Radius pr (0 = Strecken-Lotpunkt). */
function bounceOff(sim, b, px, py, pr, kind, fallbackNx, fallbackNy) {
  const dx = b.x - px;
  const dy = b.y - py;
  const d2 = dx * dx + dy * dy;
  const minD = b.r + pr;
  if (d2 >= minD * minD) return;
  let nx;
  let ny;
  const d = Math.sqrt(d2);
  if (d > 0) {
    nx = dx / d;
    ny = dy / d;
  } else {
    nx = fallbackNx;
    ny = fallbackNy;
  }
  b.x = px + nx * minD;
  b.y = py + ny * minD;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const e = sim.wallE || (b.ball ? PHYS.E_WALL_BALL : PHYS.E_WALL_PIECE);
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    sim.events.push({ type: kind, speed: -vn, ball: b.ball, x: px + nx * pr, y: py + ny * pr });
  }
}

function collideWalls(sim, b) {
  const { walls, bumpers } = sim.field;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const ex = w[2] - w[0];
    const ey = w[3] - w[1];
    const len2 = ex * ex + ey * ey;
    let t = ((b.x - w[0]) * ex + (b.y - w[1]) * ey) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    // Mittelpunkt genau auf der Strecke: Normale der Strecke (Richtung egal, Banden sind von innen dicht)
    const len = Math.sqrt(len2);
    bounceOff(sim, b, w[0] + ex * t, w[1] + ey * t, 0, t === 0 || t === 1 ? 'post' : 'wall', -ey / len, ex / len);
  }
  for (let i = 0; i < bumpers.length; i++) bounceOff(sim, b, bumpers[i].x, bumpers[i].y, bumpers[i].r, 'post', 1, 0);
}

/** Ein fester Zeitschritt. Gibt sim.done zurück. */
export function stepSim(sim) {
  if (sim.done) return true;
  const { bodies } = sim;
  const n = bodies.length;
  let moving = false;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (b.frozen) continue;
    applyFriction(b);
    if (b.vx !== 0 || b.vy !== 0) {
      moving = true;
      b.x += b.vx * PHYS.DT;
      b.y += b.vy * PHYS.DT;
    }
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) collideBodies(sim, bodies[i], bodies[j]);
  for (let i = 0; i < n; i++) if (!bodies[i].frozen) collideWalls(sim, bodies[i]);
  sim.steps += 1;

  // Tor: Ball komplett hinter der Linie (der Torkasten lässt ihn nur innerhalb des Tormunds dorthin)
  const ball = bodies[n - 1];
  if (ball.x + ball.r < 0) sim.goal = 1; // linkes Tor gehört Team 0 → Treffer für Team 1
  else if (ball.x - ball.r > sim.field.W) sim.goal = 0;

  // Alles steht: Scheiben, die zu mehr als der Hälfte im Tor liegen, werden herausgeschoben (Torblockade-Regel)
  if (!moving && sim.goal === null && sim.steps < PHYS.MAX_STEPS && ejectFromGoals(sim)) moving = true;

  if (sim.goal !== null || !moving || sim.steps >= PHYS.MAX_STEPS) sim.done = true;
  return sim.done;
}

/** Strecke, die eine Scheibe mit Startgeschwindigkeit v bis zum Stillstand rollt — exakt wie stepSim rechnet. */
function pieceStopDistance(v) {
  let s = v;
  let d = 0;
  for (let i = 0; i < PHYS.MAX_STEPS && s > 0; i++) {
    let next = s - (PHYS.PIECE_DECEL + PHYS.PIECE_DAMP * s) * PHYS.DT;
    if (next <= PHYS.STOP_SPEED) next = 0;
    d += next * PHYS.DT;
    s = next;
  }
  return d;
}

/** Kleinste Geschwindigkeit, mit der eine Scheibe mindestens `dist` weit rollt (Bisektion, nur Grundrechenarten). */
function speedForDistance(dist) {
  let lo = 0;
  let hi = PHYS.MAX_SHOT;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (pieceStopDistance(mid) < dist) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Abstand von Punkt (px, py) zur Strecke (ax, ay)–(bx, by). */
function segmentDistance(px, py, ax, ay, bx, by) {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = px - (ax + ex * t);
  const dy = py - (ay + ey * t);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Zielpunkt zum Herausschieben der Scheibe b: Kandidaten vor dem Tor (je Abstand aus EJECT_DEPTHS, quer um die eigene
 * Höhe verteilt, gerade zuerst), nur solche, deren Weg sauber durch den Tormund führt. Gewählt wird der Weg mit der
 * meisten Luft zu allen anderen Körpern und Hindernissen; ab FREE_ENOUGH gilt er als frei, dann gewinnt der geradeste
 * (frühere Kandidat).
 */
function ejectTarget(sim, b, side) {
  const { W, H, G0, G1, bumpers } = sim.field;
  const R = PIECE.R;
  let best = null;
  let bestScore = -Infinity;
  for (const depth of GOAL_RULE.EJECT_DEPTHS) {
    const tx = side === 0 ? depth : W - depth;
    for (let k = 0; k <= GOAL_RULE.EJECT_STEPS * 2; k++) {
      // Reihenfolge 0, +1, −1, +2, −2 … → bei Gleichstand gewinnt der geradere Weg
      const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * ((k + 1) >> 1);
      let ty = b.y + off * GOAL_RULE.EJECT_SPREAD;
      if (ty < R + 2) ty = R + 2;
      else if (ty > H - R - 2) ty = H - R - 2;
      // Durch den Tormund? Höhe des Wegs an der Torlinie
      const lineX = side === 0 ? 0 : W;
      const t = (lineX - b.x) / (tx - b.x);
      const yAtLine = b.y + t * (ty - b.y);
      if (yAtLine < G0 + R + 1 || yAtLine > G1 - R - 1) continue;
      let clearance = Infinity;
      for (let j = 0; j < sim.bodies.length; j++) {
        const o = sim.bodies[j];
        if (o === b) continue;
        const c = segmentDistance(o.x, o.y, b.x, b.y, tx, ty) - (o.r + R);
        if (c < clearance) clearance = c;
      }
      for (let j = 0; j < bumpers.length; j++) {
        const c = segmentDistance(bumpers[j].x, bumpers[j].y, b.x, b.y, tx, ty) - (bumpers[j].r + R);
        if (c < clearance) clearance = c;
      }
      const score = clearance > GOAL_RULE.FREE_ENOUGH ? GOAL_RULE.FREE_ENOUGH : clearance;
      if (score > bestScore) {
        bestScore = score;
        best = { x: tx, y: ty };
      }
    }
  }
  return best || { x: side === 0 ? GOAL_RULE.EJECT_DEPTHS[0] : W - GOAL_RULE.EJECT_DEPTHS[0], y: b.y };
}

/**
 * Torblockade-Regel: Jede Scheibe, deren Mitte hinter einer Torlinie liegt, bekommt einen Stoß aus dem Tor heraus — so
 * bemessen, dass sie genau am Zielpunkt (ejectTarget) zum Stehen kommt. Steht trotzdem etwas im Weg, wird es
 * mitgeschoben; reicht ein Anlauf nicht, gibt es bis zu EJECT_ROUNDS weitere. Liefert true, wenn geschoben wurde.
 * Eingefrorene Scheiben (Power-up Eiszeit) bleiben liegen — sie tauen im nächsten Zug auf und werden dann geschoben.
 */
function ejectFromGoals(sim) {
  if ((sim.ejectRounds || 0) >= GOAL_RULE.EJECT_ROUNDS) return false;
  let pushed = false;
  for (let i = 0; i < sim.bodies.length; i++) {
    const b = sim.bodies[i];
    if (b.ball || b.frozen || (b.x >= 0 && b.x <= sim.field.W)) continue;
    const target = ejectTarget(sim, b, b.x < 0 ? 0 : 1);
    const dx = target.x - b.x;
    const dy = target.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = speedForDistance(dist);
    b.vx = (dx / dist) * speed;
    b.vy = (dy / dist) * speed;
    pushed = true;
  }
  if (pushed) {
    sim.ejectRounds = (sim.ejectRounds || 0) + 1;
    sim.events.push({ type: 'eject', speed: 0 });
  }
  return pushed;
}

/** Aktueller Zustand der Simulation als Ruhezustand (Geschwindigkeiten und Power-up-Wirkungen werden verworfen). */
export function simState(sim) {
  const n = sim.bodies.length;
  return {
    field: sim.field.id,
    pieces: sim.teams.map((team, i) => ({ x: sim.bodies[i].x, y: sim.bodies[i].y, team })),
    ball: { x: sim.bodies[n - 1].x, y: sim.bodies[n - 1].y },
  };
}

/** Ganzen Zug auf einmal durchrechnen (Server, KI). */
export function simulateShot(state, shot, mods = null) {
  const sim = createSim(state, shot, mods);
  while (!stepSim(sim)) sim.events.length = 0;
  return { state: simState(sim), goal: sim.goal, steps: sim.steps };
}
