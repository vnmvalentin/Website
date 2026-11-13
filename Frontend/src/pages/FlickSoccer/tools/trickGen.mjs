#!/usr/bin/env node
// tools/trickGen.mjs — erzeugt die Trickschuss-Aufgaben (trickData.js).
//
// Eine Aufgabe ist eine feste Stellung: ein Schuss, der Ball muss ins rechte Tor. Das Skript würfelt Stellungen
// (fester Zufall je Aufgabe), rechnet mit der echten Engine alle Schüsse im Raster durch und behält nur Stellungen,
//   · die lösbar sind und deren Lösung so breit ist, wie die Stufe es verlangt (Fenster in Grad — das ist die
//     Genauigkeit, die ein Mensch beim Zielen treffen muss),
//   · deren Lösung auch mit etwas mehr oder weniger Kraft klappt,
//   · ab Stufe 2: bei denen der Ball nicht einfach geradeaus ins Tor rollt (Bande, Bumper, Portal oder Karte).
// Zu jeder Aufgabe wird eine Lösung gespeichert (für den Test und für „Lösung zeigen").
//
//   npm run flick:tricks        (im Ordner Frontend) schreibt src/pages/FlickSoccer/trickData.js

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIECE, BALL, FIELDS, createSim, stepSim } from '../engine/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'trickData.js');
// Zwischenstand: Der Suchlauf dauert einige Minuten — bricht er ab, macht der nächste Aufruf dort weiter.
// --neu verwirft den Zwischenstand.
const CACHE = path.join(os.tmpdir(), 'flick-trickgen-cache.json');
let cache = {};
if (!process.argv.includes('--neu')) {
  try {
    cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch {
    cache = {};
  }
}

// Stufe → erlaubte Fensterbreite der Lösung in Grad und höchster Anteil aller Schüsse, die treffen dürfen
const TIERS = {
  1: { min: 7, max: 40, cap: 0.07 },
  2: { min: 4, max: 7.5, cap: 0.04 },
  3: { min: 2.2, max: 4.2, cap: 0.025 },
  4: { min: 1.3, max: 2.4, cap: 0.015 },
};

// Die Aufgaben in Reihenfolge: Feld, Stufe, eigene Scheiben, gegnerische Scheiben, feste Karte
const PLAN = [
  ['standard', 1, 1, 2], ['halle', 1, 1, 2], ['strand', 1, 2, 2], ['pfosten', 1, 1, 3], ['scheune', 1, 2, 3], ['arena', 1, 1, 3],
  ['kaefig', 2, 1, 3], ['eisbahn', 2, 1, 3], ['burghof', 2, 1, 3], ['flipper', 2, 2, 3], ['wurmloch', 2, 1, 3], ['standard', 2, 1, 4, 'geist'],
  ['arena', 3, 2, 3], ['flipper', 3, 1, 4], ['wurmloch', 3, 2, 4], ['scheune', 3, 1, 4], ['halle', 3, 2, 4], ['burghof', 3, 1, 4, 'gummi'],
  ['standard', 4, 1, 4], ['kaefig', 4, 2, 4], ['flipper', 4, 2, 4, 'turbo'], ['wurmloch', 4, 1, 4], ['strand', 4, 2, 4], ['arena', 4, 2, 5],
];

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const POWERS = [0.4, 0.55, 0.7, 0.85, 1];
const STEP = 1.5; // Grad im groben Raster

function segDist(px, py, w) {
  const ex = w[2] - w[0];
  const ey = w[3] - w[1];
  let t = ((px - w[0]) * ex + (py - w[1]) * ey) / (ex * ex + ey * ey);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (w[0] + ex * t), py - (w[1] + ey * t));
}

function free(f, x, y, r, others) {
  if (x < r + 6 || x > f.W - r - 6 || y < r + 6 || y > f.H - r - 6) return false;
  for (const w of f.walls) if (segDist(x, y, w) < r + 5) return false;
  for (const b of f.bumpers) if (Math.hypot(x - b.x, y - b.y) < b.r + r + 8) return false;
  for (const p of f.portals) if (Math.hypot(x - p.x, y - p.y) < p.r + r + 10) return false;
  for (const o of others) if (Math.hypot(x - o.x, y - o.y) < o.r + r + 8) return false;
  return true;
}

function randomSetup(f, rnd, nOwn, nOpp) {
  const placed = [];
  const put = (x0, x1, y0, y1, r) => {
    for (let k = 0; k < 60; k++) {
      const x = x0 + rnd() * (x1 - x0);
      const y = y0 + rnd() * (y1 - y0);
      if (free(f, x, y, r, placed)) {
        placed.push({ x, y, r });
        return { x: Math.round(x), y: Math.round(y) };
      }
    }
    return null;
  };
  const ball = put(f.W * 0.38, f.W * 0.86, 40, f.H - 40, BALL.R);
  if (!ball) return null;
  const pieces = [];
  for (let i = 0; i < nOwn; i++) {
    const p = put(f.W * 0.08, f.W * 0.78, 45, f.H - 45, PIECE.R);
    if (!p) return null;
    pieces.push({ ...p, team: 0 });
  }
  // ein Torwart vor dem Tor, der Rest irgendwo in der rechten Hälfte
  const keeper = put(f.W - 150, f.W - 50, f.H / 2 - f.GOAL_W * 0.45, f.H / 2 + f.GOAL_W * 0.45, PIECE.R);
  if (!keeper) return null;
  pieces.push({ ...keeper, team: 1 });
  for (let i = 1; i < nOpp; i++) {
    const p = put(f.W * 0.4, f.W - 60, 45, f.H - 45, PIECE.R);
    if (!p) return null;
    pieces.push({ ...p, team: 1 });
  }
  return { pieces, ball };
}

/** Schuss durchrechnen: { goal, trick } — trick: der Ball hat Bande, Bumper oder Portal benutzt. */
function run(state, shot, mods) {
  const sim = createSim(state, shot, mods);
  let trick = false;
  while (!stepSim(sim)) {
    for (const e of sim.events) if (e.ball && (e.type === 'wall' || e.type === 'post' || e.type === 'bumper' || e.type === 'portal')) trick = true;
    sim.events.length = 0;
  }
  return { goal: sim.goal, trick };
}

const shotAt = (piece, deg, power) => {
  const a = (deg * Math.PI) / 180;
  return { piece, sx: Math.cos(a) * power, sy: Math.sin(a) * power };
};

function analyse(state, nOwn, mods, cap) {
  // Grober Vorlauf (ein Fünftel der Rechnung): gar kein Treffer oder viel zu viele → Stellung verwerfen
  let rough = 0;
  let roughTotal = 0;
  for (let piece = 0; piece < nOwn; piece++) {
    for (const power of [0.55, 0.85]) {
      for (let deg = 0; deg < 360; deg += STEP * 2) {
        roughTotal++;
        if (run(state, shotAt(piece, deg, power), mods).goal === 0) rough++;
      }
    }
  }
  if (rough === 0 || rough / roughTotal > cap * 2.5) return null;
  let hits = 0;
  let total = 0;
  let best = null;
  for (let piece = 0; piece < nOwn; piece++) {
    for (const power of POWERS) {
      let runStart = null;
      const close = (endDeg) => {
        if (runStart === null) return;
        const width = endDeg - runStart;
        if (!best || width > best.width) best = { piece, power, from: runStart, to: endDeg, width };
        runStart = null;
      };
      for (let deg = 0; deg < 360; deg += STEP) {
        total++;
        if (run(state, shotAt(piece, deg, power), mods).goal === 0) {
          hits++;
          if (runStart === null) runStart = deg;
        } else close(deg);
      }
      close(360);
    }
  }
  if (!best) return null;
  // Fenster fein ausmessen (0,25°) um die grobe Mitte
  const mid = (best.from + best.to) / 2;
  const ok = (deg) => run(state, shotAt(best.piece, deg, best.power), mods).goal === 0;
  if (!ok(mid)) return null;
  let lo = mid;
  let hi = mid;
  while (mid - lo < 45 && ok(lo - 0.25)) lo -= 0.25;
  while (hi - mid < 45 && ok(hi + 0.25)) hi += 0.25;
  const center = (lo + hi) / 2;
  return { piece: best.piece, power: best.power, width: hi - lo + 0.25, center, rate: hits / total };
}

const tricks = [];
PLAN.forEach(([field, tier, nOwn, nOpp, power = null], index) => {
  const f = FIELDS[field];
  const t = TIERS[tier];
  const rnd = lcg(1000 + index * 7919);
  const started = Date.now();
  const planKey = JSON.stringify([field, tier, nOwn, nOpp, power, t]);
  if (cache[index]?.planKey === planKey) {
    tricks.push(cache[index].trick);
    console.log(`${cache[index].trick.id} aus dem Zwischenstand`);
    return;
  }
  for (let attempt = 0; attempt < 4000; attempt++) {
    const setup = randomSetup(f, rnd, nOwn, nOpp);
    if (!setup) continue;
    const state = { field, pieces: setup.pieces, ball: setup.ball };
    const mods = power ? { power, team: 0 } : null;
    const a = analyse(state, nOwn, mods, t.cap);
    if (!a || a.width < t.min || a.width > t.max || a.rate > t.cap) continue;
    const sol = shotAt(a.piece, a.center, a.power);
    const res = run(state, sol, mods);
    if (res.goal !== 0) continue;
    // auch mit etwas anderer Kraft
    if (run(state, shotAt(a.piece, a.center, Math.min(1, a.power + 0.05)), mods).goal !== 0) continue;
    if (run(state, shotAt(a.piece, a.center, a.power - 0.05), mods).goal !== 0) continue;
    if (tier >= 2 && !res.trick && !power) continue;
    // mit Karte: ohne die Karte darf dieselbe Lösung nicht klappen (sonst wäre sie Deko)
    if (power && run(state, sol, null).goal === 0) continue;
    const id = `k${String(index + 1).padStart(2, '0')}`;
    tricks.push({
      id, tier, field, power, pieces: setup.pieces, ball: setup.ball,
      solution: { piece: sol.piece, sx: Number(sol.sx.toFixed(4)), sy: Number(sol.sy.toFixed(4)) },
      width: Number(a.width.toFixed(2)),
    });
    cache[index] = { planKey, trick: tricks[tricks.length - 1] };
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log(`${id} ${field} Stufe ${tier}${power ? ` (${power})` : ''}: Fenster ${a.width.toFixed(2)}°, Trefferanteil ${(a.rate * 100).toFixed(2)} %, ${attempt + 1} Versuche, ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return;
  }
  throw new Error(`Keine Stellung gefunden für Aufgabe ${index + 1} (${field}, Stufe ${tier})`);
});

const body = tricks
  .map((t) => `  ${JSON.stringify(t)},`)
  .join('\n');
fs.writeFileSync(OUT, `// trickData.js — die Trickschuss-Aufgaben. ERZEUGT von tools/trickGen.mjs (npm run flick:tricks) — nicht von Hand ändern.
// Je Aufgabe: Feld, Stellung (eigene Scheiben = Team 0 zuerst), Ball, feste Karte (oder null), eine geprüfte Lösung und
// die Breite des Lösungsfensters in Grad (kleiner = schwerer). Die IDs sind gespeichert (Statistik): nie umbenennen.

export const TRICKS = Object.freeze([
${body}
]);

export const TRICK_COUNT = TRICKS.length;
`);
console.log(`${tricks.length} Aufgaben geschrieben nach ${path.relative(process.cwd(), OUT)}`);
