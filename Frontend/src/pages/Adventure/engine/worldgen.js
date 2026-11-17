// engine/worldgen.js — baut eine Welt aus Seed + Weltnummer: Hindernisse in Gruppen (damit Gassen und freie Plätze
// entstehen statt gleichmäßigem Rauschen), Kisten und Schreine verstreut, der Teleporter weit weg vom Start, dazu
// Gegnerlager, die erst angreifen, wenn man ihnen nahe kommt.

import { makeRng, hashSeed, dist } from "./util.js";
import { NORMAL_WORLD_SIZE, FINAL_WORLD_SIZE } from "../data/biomes.js";

const CAMP_COUNT = 0;
export const INTERACTABLE_COUNTS = { chest: 18, bigChest: 4, equipChest: 3, luckShrine: 2, combatShrine: 1, healShrine: 1, fateShrine: 1, sacrificeAltar: 1, curseShrine: 1, diceShrine: 1 };

export function generateWorld(seed, stageIndex, loop, biome) {
  const rng = makeRng(hashSeed(seed, "welt", stageIndex, loop));

  if (biome.final) {
    const size = FINAL_WORLD_SIZE;
    return {
      w: size, h: size,
      spawn: { x: size * 0.5, y: size - 220 },
      teleporter: { x: size * 0.5, y: 260 },
      bossSpot: { x: size * 0.5, y: size * 0.45 },
      obstacles: [],
      interactables: [],
      camps: [],
    };
  }

  const size = NORMAL_WORLD_SIZE;
  const margin = 260;
  const spawn = { x: rng.range(size * 0.3, size * 0.7), y: rng.range(size * 0.3, size * 0.7) };

  // Teleporter: weit weg vom Start, aber nicht direkt am Rand
  let teleporter = null;
  for (let i = 0; i < 200 && !teleporter; i++) {
    const p = { x: rng.range(margin + 200, size - margin - 200), y: rng.range(margin + 200, size - margin - 200) };
    if (dist(p.x, p.y, spawn.x, spawn.y) > 1300) teleporter = p;
  }
  if (!teleporter) teleporter = { x: spawn.x > size / 2 ? margin + 300 : size - margin - 300, y: size / 2 };

  const keepClear = [
    { x: spawn.x, y: spawn.y, r: 320 },
    { x: teleporter.x, y: teleporter.y, r: 380 },
  ];

  // Hindernisse in Gruppen
  const obstacles = [];
  const fits = (x, y, r, pad) => {
    if (x < margin || y < margin || x > size - margin || y > size - margin) return false;
    for (const k of keepClear) if (dist(x, y, k.x, k.y) < k.r + r) return false;
    for (const o of obstacles) if (dist(x, y, o.x, o.y) < o.r + r + pad) return false;
    return true;
  };
  const clusterCount = 22;
  for (let c = 0; c < clusterCount; c++) {
    const cx = rng.range(margin, size - margin);
    const cy = rng.range(margin, size - margin);
    const n = rng.int(2, 6);
    for (let i = 0; i < n; i++) {
      const [sprite, rMin, rMax] = rng.pick(biome.obstacles);
      const r = rng.range(rMin, rMax);
      const a = rng.range(0, Math.PI * 2);
      const d = i === 0 ? 0 : rng.range(70, 190);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      if (fits(x, y, r, 12)) obstacles.push({ x, y, r, sprite });
    }
  }
  // Ein paar Einzelstücke für Abwechslung auf freien Flächen
  for (let i = 0; i < 26; i++) {
    const [sprite, rMin, rMax] = rng.pick(biome.obstacles);
    const r = rng.range(rMin, rMax);
    const x = rng.range(margin, size - margin);
    const y = rng.range(margin, size - margin);
    if (fits(x, y, r, 140)) obstacles.push({ x, y, r, sprite });
  }

  // Interaktive Objekte
  const interactables = [];
  const placeFree = (minFromSpawn, pad = 90) => {
    for (let i = 0; i < 300; i++) {
      const x = rng.range(margin, size - margin);
      const y = rng.range(margin, size - margin);
      if (dist(x, y, spawn.x, spawn.y) < minFromSpawn) continue;
      if (dist(x, y, teleporter.x, teleporter.y) < 260) continue;
      if (!fits(x, y, 30, 40)) continue;
      if (interactables.some((o) => dist(x, y, o.x, o.y) < 220 + pad)) continue;
      return { x, y };
    }
    return null;
  };
  const add = (type, count, minFromSpawn) => {
    for (let i = 0; i < count; i++) {
      const p = placeFree(minFromSpawn);
      if (p) interactables.push({ id: `${type}-${i}`, type, x: p.x, y: p.y, used: false, uses: 0 });
    }
  };
  // Zwei Kisten gleich in Startnähe, damit der erste Kauf nicht ewig dauert
  for (let i = 0; i < 2; i++) {
    const a = rng.range(0, Math.PI * 2);
    const x = spawn.x + Math.cos(a) * rng.range(330, 520);
    const y = spawn.y + Math.sin(a) * rng.range(330, 520);
    if (fits(x, y, 30, 40)) interactables.push({ id: `chest-near-${i}`, type: "chest", x, y, used: false, uses: 0 });
  }
  add("chest", INTERACTABLE_COUNTS.chest, 500);
  add("bigChest", INTERACTABLE_COUNTS.bigChest, 900);
  add("equipChest", INTERACTABLE_COUNTS.equipChest, 600);
  add("luckShrine", INTERACTABLE_COUNTS.luckShrine, 700);
  add("combatShrine", INTERACTABLE_COUNTS.combatShrine, 900);
  add("healShrine", INTERACTABLE_COUNTS.healShrine, 1200);
  add("fateShrine", INTERACTABLE_COUNTS.fateShrine, 1000);
  add("sacrificeAltar", INTERACTABLE_COUNTS.sacrificeAltar, 800);
  add("curseShrine", INTERACTABLE_COUNTS.curseShrine, 700);
  add("diceShrine", INTERACTABLE_COUNTS.diceShrine, 800);

  // Gegnerlager
  const camps = [];
  // Lager gibt es seit November 2026 nicht mehr (CAMP_COUNT 0): die Horde kommt von selbst, herumstehende Grüppchen
  // waren nur noch Laufweg. Der Code bleibt, falls eine Welt wieder welche bekommen soll.
  for (let i = 0; i < 300 && camps.length < CAMP_COUNT; i++) {
    const x = rng.range(margin, size - margin);
    const y = rng.range(margin, size - margin);
    if (dist(x, y, spawn.x, spawn.y) < 1000) continue;
    if (!fits(x, y, 60, 30)) continue;
    if (camps.some((c) => dist(x, y, c.x, c.y) < 500)) continue;
    camps.push({ x, y, size: rng.int(2, 4) });
  }

  // Giftpfützen (Sumpf, biome.pools): eigener Zufall, damit die übrigen Welten Stein für Stein gleich bleiben. Sie
  // halten Abstand zu Start, Teleporter, Kisten und Schreinen; durch Hindernisse dürfen sie teils hindurch.
  const pools = [];
  if (biome.pools) {
    const pr = makeRng(hashSeed(seed, "pfuetzen", stageIndex, loop));
    for (let i = 0; i < 400 && pools.length < POOL_COUNT; i++) {
      const r = pr.range(80, 150);
      const x = pr.range(margin, size - margin), y = pr.range(margin, size - margin);
      if (keepClear.some((k) => dist(x, y, k.x, k.y) < k.r + r)) continue;
      if (interactables.some((o) => dist(x, y, o.x, o.y) < r + 70)) continue;
      if (pools.some((o) => dist(x, y, o.x, o.y) < o.r + r + 120)) continue;
      pools.push({ x, y, r });
    }
  }

  return { w: size, h: size, spawn, teleporter, bossSpot: null, obstacles, interactables, camps, pools };
}

/** So viele Giftpfützen hat ein Sumpf (wenn genug Platz ist) */
export const POOL_COUNT = 26;
