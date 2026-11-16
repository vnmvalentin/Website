// engine/director.js — der Nachschub. Seit November 2026 als Horde gedacht: der Director hält eine Zielmenge an
// Gegnern rund um den Spieler und füllt sie mit einer festen Rate pro Sekunde auf. Beides wächst mit der Zeit in der
// Welt, mit jeder geschafften Welt und mit jedem Zyklus (vorher: Punkte sammeln, Gruppen kaufen, höchstens 70 Gegner).
//
// Gegner kommen in Gruppen einer Art und gehören zu einer Stufe (data/enemies.js, tier):
//   futter    die Masse — fällt mit einem Treffer, kommt zu Dutzenden
//   kaempfer  halten etwas aus, kleine Gruppen
//   brocken   große Einzelne mit angekündigten Angriffen
//   spezial   Fernkämpfer, Heiler, Beschwörer … — streng begrenzt, damit die Ansagen lesbar bleiben
// Dazu alle GIANT_EVERY Sekunden ein Koloss (ein Brocken in Übergröße).

import { ENEMIES } from "../data/enemies.js";
import { enemyPoolFor } from "../data/biomes.js";
import { spawnEnemy, pickElite } from "./enemies.js";
import { ascEliteChance } from "./ascension.js";
import { collectObstacles } from "./grid.js";

const PACK = { futter: [7, 13], kaempfer: [2, 4], brocken: [1, 1], spezial: [1, 2] };
const WEIGHT = { futter: 62, kaempfer: 16, brocken: 6, spezial: 12 };
const GIANT_FIRST = 90;
const GIANT_EVERY = 75;
const GIANT_AI = ["brute", "charger"]; // nur wer sichtbar ausholt oder zielt — ein Koloss unter der Erde wäre unfair

export function initDirector() {
  return { t: 1.5, budget: 10, giantT: GIANT_FIRST };
}

// So viele Gegner sollen gleichzeitig hinter dem Spieler her sein
export function hordeTarget(g) {
  return Math.min(700, 40 + 36 * (g.stageTime / 60) + 74 * g.stagesCleared + 80 * g.loop);
}

// So viele kommen pro Sekunde nach — das ist im Gleichgewicht auch die Kill-Rate, die der Spieler schaffen muss.
// Die Beute hängt an dieser Rate, nicht an der Stärke des Spielers: wer alles sofort wegräumt, bekommt nicht mehr.
export function spawnRate(g) {
  return Math.min(50, 2.7 + 1.3 * (g.stageTime / 60) + 4.5 * g.stagesCleared + 6 * g.loop) * (0.7 + 0.3 * g.difficulty.rate);
}

const blockers = [];

// Freier Platz knapp außerhalb des Bildes. Läuft der Spieler, kommt die Hälfte der Gruppen von vorn — sonst hängt
// die Horde nur als Schleppe hinter ihm.
function spawnAnchor(g) {
  const p = g.player;
  for (let i = 0; i < 16; i++) {
    const ahead = p.moving && i < 8 && g.rng.chance(0.5);
    const a = ahead ? p.moveAngle + g.rng.range(-1, 1) : g.rng.range(0, Math.PI * 2);
    const d = g.rng.range(720, 980);
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    if (x < 60 || y < 60 || x > g.world.w - 60 || y > g.world.h - 60) continue;
    if (collectObstacles(g, x, y, 50, blockers).length) continue;
    return { x, y };
  }
  return null;
}

function freeSpotNear(g, anchor, spread, r) {
  for (let i = 0; i < 6; i++) {
    const a = g.rng.range(0, Math.PI * 2), d = g.rng.range(0, spread);
    const x = anchor.x + Math.cos(a) * d, y = anchor.y + Math.sin(a) * d;
    if (x < 40 || y < 40 || x > g.world.w - 40 || y > g.world.h - 40) continue;
    if (collectObstacles(g, x, y, r + 8, blockers).length) continue;
    return { x, y };
  }
  return anchor;
}

function poolByTier(g) {
  const out = { futter: [], kaempfer: [], brocken: [], spezial: [] };
  for (const pair of enemyPoolFor(g.biome, g.loop)) out[ENEMIES[pair[0]].tier || "kaempfer"].push(pair);
  return out;
}

// Eine Gruppe einer Art; gibt zurück, wie viele gekommen sind
function spawnPack(g, room, counts, target, pool) {
  const s = g.stagesCleared, L = g.loop;
  // Nur die Masse: in den ersten Sekunden eines Laufs, und solange ein Boss lebt — der Boss ist dann das Besondere,
  // die Horde drumherum soll man mähen können, statt in zwei Kämpfen gleichzeitig zu stehen
  const calm = !!g.boss || (s === 0 && L === 0 && g.stageTime < 30);
  const open = [];
  if (pool.futter.length) open.push(["futter", WEIGHT.futter]);
  if (!calm && pool.kaempfer.length && counts.kaempfer < target * 0.14) open.push(["kaempfer", WEIGHT.kaempfer]);
  if (!calm && pool.brocken.length && counts.brocken < Math.min(10, 2 + s + L)) open.push(["brocken", WEIGHT.brocken]);
  if (!calm && pool.spezial.length && counts.spezial < Math.min(16, 4 + 2 * s + 2 * L)) open.push(["spezial", WEIGHT.spezial]);
  if (!open.length) return 0;
  const tier = g.rng.weighted(open);
  const id = g.rng.weighted(pool[tier]);
  const def = ENEMIES[id];

  const eliteChance = Math.min(0.5, (0.1 + 0.04 * s + 0.1 * L) * ascEliteChance(g));
  const elite = tier !== "futter" && g.coeff >= 1.5 && counts.elite < 2 + s + L && g.rng.chance(eliteChance) ? pickElite(g) : null;

  let n = g.rng.int(PACK[tier][0], PACK[tier][1]);
  if (tier === "futter") n += Math.min(8, Math.floor(g.coeff * 1.5));
  n = elite ? 1 : Math.max(1, Math.min(Math.max(def.group || 0, n), room + (def.group ? 2 : 0)));

  const anchor = spawnAnchor(g);
  if (!anchor) return 0;
  for (let i = 0; i < n; i++) {
    const q = freeSpotNear(g, anchor, tier === "futter" ? 150 : 90, def.r);
    spawnEnemy(g, id, q.x, q.y, { elite });
  }
  counts[tier] += n;
  if (elite) counts.elite++;
  return n;
}

function spawnGiant(g, pool) {
  const choices = pool.brocken.filter(([id]) => GIANT_AI.includes(ENEMIES[id].ai));
  if (!choices.length) return false;
  const id = g.rng.weighted(choices);
  const anchor = spawnAnchor(g);
  if (!anchor) return false;
  const e = spawnEnemy(g, id, anchor.x, anchor.y, { giant: true });
  g.events.push({ type: "hordeEvent", kind: "giant", name: e.name });
  return true;
}

// ── Finale: kleine Wellen ───────────────────────────────────────────────────
// Im Gewitterhort gibt es keine Horde, nur Thunderwing. Seit 16.11.2026 (Rückmeldung: „dem Boss noch kleine Mini-Waves
// geben“) kommt alle paar Sekunden eine kleine Welle vom Arenarand, solange er lebt: Futter aus biome.waves, in seiner
// zweiten Phase dichter und mit ein paar Funkendrachen. Der Boss bleibt die Aufgabe — deshalb klein und gedeckelt.
const WAVE_FIRST = 6;
const WAVE_EVERY = [11, 8]; // Sekunden zwischen den Wellen: Phase 1, Phase 2
const WAVE_CAP = 45; // mehr Wellen-Gegner gleichzeitig nicht

function arenaAnchor(g) {
  const p = g.player;
  for (let i = 0; i < 16; i++) {
    const x = g.rng.range(70, g.world.w - 70), y = g.rng.range(70, g.world.h - 70);
    if ((x - p.x) ** 2 + (y - p.y) ** 2 < 520 * 520) continue;
    if (collectObstacles(g, x, y, 50, blockers).length) continue;
    return { x, y };
  }
  return null;
}

function updateFinalWaves(g, dt) {
  const boss = g.boss;
  const pool = g.biome.waves;
  if (!boss || boss.dead || !pool?.length) return;
  const dir = g.director;
  if (dir.waveT == null) dir.waveT = WAVE_FIRST;
  dir.waveT -= dt;
  if (dir.waveT > 0) return;
  const p2 = !!boss.phase2;
  dir.waveT = WAVE_EVERY[p2 ? 1 : 0];

  let alive = 0;
  for (const e of g.enemies) if (!e.dead && e.wave) alive++;
  let room = WAVE_CAP - alive;
  if (room <= 0) return;
  const anchor = arenaAnchor(g);
  if (!anchor) return;
  const fodder = pool.filter(([id]) => ENEMIES[id].tier === "futter");
  const others = pool.filter(([id]) => ENEMIES[id].tier !== "futter");
  const spawnAt = (id, n, spread) => {
    for (let i = 0; i < n && room > 0; i++, room--) {
      const q = freeSpotNear(g, anchor, spread, ENEMIES[id].r);
      const e = spawnEnemy(g, id, q.x, q.y, {});
      if (e) e.wave = true;
    }
  };
  if (fodder.length) spawnAt(g.rng.weighted(fodder), 8 + 2 * g.loop + (p2 ? 4 : 0), 140);
  if (p2 && others.length) spawnAt(g.rng.weighted(others), 2 + g.loop, 90);
}

export function updateDirector(g, dt) {
  const tele = g.teleporter;
  if (g.biome.final && !g.over) { updateFinalWaves(g, dt); return; }
  if (g.biome.final || g.over || tele.state === "ready") return;
  const dir = g.director;
  const charging = tele.state === "charging";
  const blood = g.horde?.blood > 0;

  // Solange der Boss lebt, etwas weniger Nachschub (er ist die Aufgabe); ist er tot und der Teleporter lädt noch,
  // kommt der Ansturm
  const push = g.boss ? 0.8 : charging ? 2 : 1; // Ansturm: doppelte Horde, bis der Teleporter geladen ist
  const rate = spawnRate(g) * push * (blood ? 3 : 1) * (g.curse ? 1.25 : 1);
  dir.budget = Math.min(dir.budget + rate * dt, rate * 5);
  dir.giantT -= dt;
  dir.t -= dt;
  if (dir.t > 0) return;
  dir.t = g.rng.range(0.7, 1.3);

  const counts = { futter: 0, kaempfer: 0, brocken: 0, spezial: 0, elite: 0, giant: 0 };
  let alive = 0;
  for (const e of g.enemies) {
    if (e.dead || !e.aggro || e.isBoss) continue;
    alive++;
    counts[e.tier]++;
    if (e.elite) counts.elite++;
    if (e.giant) counts.giant++;
  }
  const pool = poolByTier(g);

  if (dir.giantT <= 0) {
    const cap = 1 + g.loop + (g.stagesCleared >= 3 ? 1 : 0);
    dir.giantT = g.boss || counts.giant >= cap || !spawnGiant(g, pool) ? 15 : GIANT_EVERY;
  }

  const target = Math.min(900, hordeTarget(g) * push * (blood ? 2.5 : 1) * (g.curse ? 1.2 : 1));
  let room = Math.min(Math.floor(dir.budget), Math.floor(target) - alive);
  for (let packs = 0; room > 0 && packs < 5; packs++) {
    const n = spawnPack(g, room, counts, target, pool);
    if (!n) break;
    room -= n;
    dir.budget -= n;
  }
}
