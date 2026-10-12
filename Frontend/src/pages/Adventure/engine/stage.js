// engine/stage.js — Ablauf einer Welt: laden, Teleporter finden und aktivieren, Boss besiegen + aufladen, weiterreisen.
// Im Finale (Gewitterhort) erscheint Thunderwing sofort; wer ihn besiegt, gewinnt den Lauf und darf in Zyklus 2 weiter.

import { BIOMES } from "../data/biomes.js";
import { BOSSES } from "../data/bosses.js";
import { generateWorld } from "./worldgen.js";
import { spawnEnemy, findSpawnPoint, pickElite } from "./enemies.js";
import { spawnBoss } from "./bosses/index.js";
import { spawnItem, rollItem, giveItem } from "./loot.js";
import { floatText, ring, shake, burst } from "./fx.js";
import { enemyPoolFor } from "../data/biomes.js";
import { coefficient } from "./difficulty.js";
import { ascEliteChance } from "./ascension.js";
import { hashSeed, makeRng, dist2 } from "./util.js";

export const TELEPORTER_RADIUS = 600;
export const CHARGE_TIME = 75;

export function loadStage(g) {
  const biome = BIOMES[g.stageIndex];
  g.biome = biome;
  const w = generateWorld(g.seed, g.stageIndex, g.loop, biome);
  g.world = { w: w.w, h: w.h };
  g.obstacles = w.obstacles;
  g.interactables = w.interactables;
  g.enemies = []; g.pBullets = []; g.eBullets = []; g.hazards = []; g.zones = [];
  g.pickups = []; g.allies = []; g.walls = []; g.shrineGroups = [];
  g.boss = null;
  g.curse = false;
  g.stageTime = 0;
  g.prompt = null;
  g.coeff = coefficient(g.time, g.stagesCleared, g.difficulty);
  g.director = { credits: 20 * g.coeff, t: 4 };

  const p = g.player;
  p.x = w.spawn.x; p.y = w.spawn.y;
  p.dash = null; p.spin = null; p.barrage = null;

  g.teleporter = { x: w.teleporter.x, y: w.teleporter.y, state: biome.final ? "locked" : "idle", charge: 0, discovered: !!biome.final || !!g.player.items.kompass };
  g.bossSpot = w.bossSpot;
  g.finalIntroT = biome.final ? 2.5 : 0;

  // Gegnerlager (stehen herum, bis man ihnen zu nahe kommt)
  const pool = enemyPoolFor(biome, g.loop).filter(([id]) => id !== "nekromant" || g.stagesCleared > 0);
  const campRng = makeRng(hashSeed(g.seed, "lager", g.stageIndex, g.loop));
  w.camps.forEach((c, ci) => {
    const id = campRng.weighted(pool);
    const elite = g.coeff > 1.6 && campRng.chance(0.15 * ascEliteChance(g)) ? pickElite(g) : null;
    for (let i = 0; i < (elite ? 1 : c.size); i++) {
      const q = findSpawnPoint(g, c.x, c.y, 0, 110, 30) || c;
      spawnEnemy(g, id, q.x, q.y, { aggro: false, campId: ci, elite });
    }
  });

  g.events.push({ type: "stageStart", name: biome.name, index: g.stageIndex, loop: g.loop, final: !!biome.final });
}

function pickBossId(g) {
  const list = g.biome.bosses;
  const rng = makeRng(hashSeed(g.seed, "boss", g.stageIndex, g.loop));
  return rng.pick(list);
}

export function activateTeleporter(g) {
  const t = g.teleporter;
  if (t.state !== "idle") return;
  t.state = "charging";
  t.charge = 0;
  const id = pickBossId(g);
  const q = findSpawnPoint(g, t.x, t.y, 300, 420, BOSSES[id].r) || { x: t.x, y: t.y - 350 };
  spawnBoss(g, id, q.x, q.y);
  ring(g, t.x, t.y, TELEPORTER_RADIUS, "#d9473a", 0.8);
  shake(g, 8);
  g.events.push({ type: "bossStart", name: BOSSES[id].name, title: BOSSES[id].title });
}

export function updateStage(g, dt) {
  const t = g.teleporter;
  const p = g.player;

  if (g.finalIntroT > 0) {
    g.finalIntroT -= dt;
    if (g.finalIntroT <= 0) {
      const id = pickBossId(g);
      spawnBoss(g, id, g.bossSpot.x, g.bossSpot.y);
      g.events.push({ type: "bossStart", name: BOSSES[id].name, title: BOSSES[id].title });
    }
  }

  if (!t.discovered && (dist2(p.x, p.y, t.x, t.y) < 900 * 900 || g.stageTime > 150)) {
    t.discovered = true;
    g.events.push({ type: "message", text: g.stageTime > 150 ? "Der Teleporter pulsiert — er ist jetzt auf der Karte" : "Teleporter gefunden" });
  }

  if (t.state === "charging") {
    if (dist2(p.x, p.y, t.x, t.y) < TELEPORTER_RADIUS * TELEPORTER_RADIUS) t.charge = Math.min(1, t.charge + dt / CHARGE_TIME);
    if (t.charge >= 1 && !g.boss) teleporterReady(g);
  }

  // Liegengebliebene Felsbrocken des Sandkolosses verschwinden wieder
  if (g.obstacles.some((o) => o.temp)) {
    for (const o of g.obstacles) if (o.temp) o.temp -= dt;
    g.obstacles = g.obstacles.filter((o) => !o.temp || o.temp > 0);
  }
}

function teleporterReady(g) {
  const t = g.teleporter;
  t.state = "ready";
  // Alle restlichen Gegner zerfallen (ohne Beute und ohne Kill-Effekte)
  for (const e of g.enemies) if (!e.dead) { e.dead = true; burst(g, e.x, e.y, "#b8b0a0", 8, 150); }
  g.enemies = [];
  g.eBullets = [];
  g.hazards = g.hazards.filter((h) => h.friendly);
  ring(g, t.x, t.y, 260, "#86d05f", 0.8);
  g.events.push({ type: "teleReady", final: !!g.biome.final });
}

export function onBossKilled(g, e) {
  g.stats.bossesKilled++;
  g.boss = null;
  shake(g, 14);
  burst(g, e.x, e.y, "#f5cf4a", 40, 380, 0.8, 6);
  floatText(g, e.x, e.y - e.r - 20, "Besiegt!", "#f5cf4a", { size: 26, life: 1.8, jitter: false });
  const def = BOSSES[e.bossId];
  spawnItem(g, e.x, e.y, def.item);
  for (let i = 0; i < 1 + g.loop; i++) spawnItem(g, e.x, e.y, rollItem(g, { uncommon: 80, legendary: 20 }));
  g.events.push({ type: "bossDead", name: def.name });

  if (g.biome.final) {
    g.won = true;
    teleporterReady(g);
    g.events.push({ type: "victory" });
    return;
  }
  if (g.teleporter.charge >= 1) teleporterReady(g);
}

export function leaveStage(g) {
  if (g.teleporter.state !== "ready") return;
  g.stats.stagesCleared++;
  g.stagesCleared++;
  if (g.biome.final) { g.loop++; g.stageIndex = 0; } else g.stageIndex++;
  // Items, die noch am Boden liegen, kommen mit
  const carried = g.pickups.filter((k) => k.type === "item").map((k) => k.id);
  loadStage(g);
  for (const id of carried) giveItem(g, id);
  g.events.push({ type: "stageChanged" });
}
