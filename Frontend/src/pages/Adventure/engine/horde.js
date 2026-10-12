// engine/horde.js — Horde-Momente, die den Lauf unterbrechen: Blutmond (30 s dreifacher Nachschub, danach ein Item),
// Einkreisung (ein Ring aus Gegnern schließt sich um dich) und Champions (großer Elite mit zwei Eigenschaften, lässt ein
// seltenes Item fallen). Zeitgeber laufen nur in normalen Welten und nicht, solange der Teleporter fertig ist.
// Treffen zwei Ereignisse zusammen, wird das spätere um 20 s verschoben — nie zwei auf einmal.

import { ENEMIES } from "../data/enemies.js";
import { enemyPoolFor } from "../data/biomes.js";
import { spawnEnemy, findSpawnPoint, pickElite } from "./enemies.js";
import { spawnItem, rollItem } from "./loot.js";
import { ring, shake } from "./fx.js";
import { ascChampionEvery } from "./ascension.js";

export const BLOOD_MOON_LEN = 30;
const EVERY = { blood: 200, ring: 230, champ: 250 };

export function initHorde() {
  return { blood: 0, next: { blood: 200, ring: 140, champ: 260 } };
}

export function updateHorde(g, dt) {
  const h = g.horde;
  if (g.biome.final || g.over) return;
  if (h.blood > 0) {
    h.blood -= dt;
    if (h.blood <= 0) endBloodMoon(g);
  }
  const t = g.teleporter;
  if (t.state === "ready") return;
  for (const k of Object.keys(h.next)) h.next[k] -= dt;

  if (h.next.blood <= 0) {
    if (h.blood > 0 || t.state === "charging" || g.boss) h.next.blood = 20;
    else { h.next.blood = EVERY.blood; startBloodMoon(g); }
  }
  if (h.next.ring <= 0) {
    if (h.blood > 0 || g.boss) h.next.ring = 20;
    else { h.next.ring = EVERY.ring; encircle(g); }
  }
  if (h.next.champ <= 0) {
    if (g.boss || g.enemies.some((e) => e.champion && !e.dead)) h.next.champ = 25;
    else { h.next.champ = EVERY.champ * ascChampionEvery(g); spawnChampion(g); }
  }
}

function startBloodMoon(g) {
  g.horde.blood = BLOOD_MOON_LEN;
  shake(g, 6);
  g.events.push({ type: "hordeEvent", kind: "blood" });
}

function endBloodMoon(g) {
  const p = g.player;
  if (!p.alive) return;
  spawnItem(g, p.x, p.y - 40, rollItem(g, { common: 80, uncommon: 20 }));
  g.events.push({ type: "message", text: "Der Blutmond weicht — eine Belohnung liegt bereit" });
}

// Nahkämpfer der Welt (die laufen von selbst nach innen); ohne passende Art der häufigste Gegner
function meleePool(g) {
  const pool = enemyPoolFor(g.biome, g.loop);
  const melee = pool.filter(([id]) => ["chase", "exploder"].includes(ENEMIES[id].ai));
  return melee.length ? melee : pool;
}

function encircle(g) {
  const p = g.player;
  const n = Math.min(34, 18 + 2 * g.stagesCleared + 4 * g.loop);
  const id = g.rng.weighted(meleePool(g));
  const R = 640;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const q = findSpawnPoint(g, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 0, 40, ENEMIES[id].r);
    if (q) spawnEnemy(g, id, q.x, q.y, {});
  }
  ring(g, p.x, p.y, R, "#d9473a", 0.8);
  g.events.push({ type: "hordeEvent", kind: "ring" });
}

function spawnChampion(g) {
  const p = g.player;
  const pool = enemyPoolFor(g.biome, g.loop).filter(([id]) => ENEMIES[id].ai !== "turret");
  const id = g.rng.weighted(pool);
  const q = findSpawnPoint(g, p.x, p.y, 620, 820, ENEMIES[id].r * 1.6);
  if (!q) { g.horde.next.champ = 10; return; }
  const elite = pickElite(g);
  const e = spawnEnemy(g, id, q.x, q.y, { elite, elite2: pickElite(g, elite), champion: true });
  if (!e) return;
  ring(g, q.x, q.y, 160, "#f5cf4a", 0.6);
  g.events.push({ type: "hordeEvent", kind: "champion", name: e.name });
}
