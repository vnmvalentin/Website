// engine/procs.js — was Items über reine Werte hinaus tun: Effekte bei Treffer, bei Kill, wenn du getroffen wirst, und
// dauerhafte Effekte pro Tick (Klingen, Auren, Blitze). proc = Auslöse-Koeffizient der Quelle (1 = Hauptangriff,
// kleiner bei Flächen/Gift, 0 = löst nichts aus — so können sich Effekte nicht endlos gegenseitig auslösen).

import { damageEnemy, addHazard, addZone, addPoison, nearestEnemy, enemiesNear } from "./combat.js";
import { lightning, ring, burst } from "./fx.js";
import { recalcStats } from "./stats.js";
import { spawnAlly } from "./allies.js";
import { spawnPlayerBullet } from "./projectiles.js";

export function chainLightning(g, from, hops, dmg, range = 260, color = "#cfe8ff") {
  const hit = new Set([from]);
  const points = [{ x: from.x, y: from.y }];
  let cur = from;
  for (let i = 0; i < hops; i++) {
    const next = nearestEnemy(g, cur.x, cur.y, range, hit);
    if (!next) break;
    hit.add(next);
    points.push({ x: next.x, y: next.y });
    damageEnemy(g, next, dmg, { proc: 0, color: "#bfe3ff" });
    cur = next;
  }
  if (points.length > 1) lightning(g, points, color);
}

export function onHitProcs(g, e, proc, opts) {
  const p = g.player;
  const it = p.items;
  const dmg = p.stats.damage;
  if (e.dead && !opts.primary) return;

  if (it.glimmspan && g.rng.chance(Math.min(1, 0.1 * it.glimmspan) * proc)) {
    e.burnT = 3; e.burnDps = Math.max(e.burnDps || 0, dmg * 0.5);
  }
  if (it.giftphiole) addPoison(e, dmg * 0.3 * it.giftphiole * proc, 3);
  if (it.spinnendruese && !e.dead) { e.slowT = 2; e.slowPct = Math.max(e.slowPct || 0, Math.min(0.6, 0.3 * it.spinnendruese)); }
  if (it.frostring && g.rng.chance(Math.min(0.6, 0.08 * it.frostring) * proc)) {
    if (e.isBoss) { e.slowT = 1; e.slowPct = Math.max(e.slowPct || 0, 0.3); } else e.freezeT = Math.max(e.freezeT || 0, 1);
  }
  if (it.kettenblitz && g.rng.chance(0.2 * proc)) chainLightning(g, e, 2 + it.kettenblitz, dmg * 0.6);
  if (it.raketenwerfer && g.rng.chance(Math.min(1, 0.1 * it.raketenwerfer) * proc)) {
    spawnPlayerBullet(g, { x: p.x, y: p.y, angle: -Math.PI / 2 + g.rng.range(-0.8, 0.8), speed: 520, dmg: dmg * 3, kind: "rocket",
      sprite: "proj_grenade", r: 8, range: 1600, proc: 0, target: e });
  }
  if (it.meteorsplitter && g.rng.chance(Math.min(0.5, 0.05 * it.meteorsplitter) * proc)) {
    addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 140, delay: 0.6, dmg: dmg * 5, friendly: true, proc: 0, effect: "burn", color: "#ff9a3c", shake: 4 });
  }
  if (opts.primary && it.sturmschwinge) chainLightning(g, e, it.sturmschwinge + 1, dmg * 0.35, 240, "#fff3a0");
}

export function onKillProcs(g, e) {
  const p = g.player;
  const it = p.items;
  const dmg = p.stats.damage;
  if (it.brandsatz) {
    const n = it.brandsatz;
    addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 90 + 20 * (n - 1), delay: 0, dmg: dmg * (1.5 + 0.75 * (n - 1)), friendly: true, proc: 0, effect: "burn", color: "#ff7a2e" });
    burst(g, e.x, e.y, "#ff7a2e", 14, 260);
  }
  if (it.monsterzahn && g.rng.chance(0.5)) g.pickups.push({ type: "heal", x: e.x, y: e.y, value: 8 * it.monsterzahn, t: 0, vx: 0, vy: 0 });
  if (it.harpune) p.buffs.harpoon = 1.5;
  if (it.blutrausch) {
    p.bloodStacks.push(g.time + 3);
    const cap = 5 * it.blutrausch + 5;
    while (p.bloodStacks.length > cap) p.bloodStacks.shift();
  }
  if (it.seelenernte && p.soulStacks < 40 * it.seelenernte) {
    p.soulStacks++;
    recalcStats(p, g.kit);
  }
  if (it.knochenkrone && g.rng.chance(0.15)) {
    const count = g.allies.filter((a) => a.kind === "skeleton").length;
    if (count < 1 + it.knochenkrone) spawnAlly(g, "skeleton", e.x, e.y);
  }
}

export function onPlayerHurtProcs(g) {
  const p = g.player;
  const it = p.items;
  if (it.dornenhemd && g.time - (p.thornT || -9) > 0.3) {
    p.thornT = g.time;
    for (const e of enemiesNear(g, p.x, p.y, 150)) damageEnemy(g, e, p.stats.damage * it.dornenhemd, { proc: 0, color: "#d0c090" });
  }
  if (it.kolossherz && g.time - (p.colossusT || -9) > 2) {
    p.colossusT = g.time;
    ring(g, p.x, p.y, 170, "#e0a64a", 0.4);
    for (const e of enemiesNear(g, p.x, p.y, 170)) damageEnemy(g, e, p.stats.damage * 2 * it.kolossherz, { proc: 0, knockback: 380 });
  }
}

// Dauerhafte Item-Effekte, einmal pro Tick
export function updateItemEffects(g, dt) {
  const p = g.player;
  const it = p.items;
  const dmg = p.stats.damage;
  if (!p.alive) return;

  // Gewitterkrone
  if (it.gewitterkrone) {
    p.crownT = (p.crownT ?? 0) - dt;
    if (p.crownT <= 0) {
      p.crownT = 1.5 / it.gewitterkrone;
      const e = nearestEnemy(g, p.x, p.y, 650);
      if (e) {
        lightning(g, [{ x: e.x, y: e.y - 500 }, { x: e.x + 12, y: e.y - 250 }, { x: e.x, y: e.y }], "#fff3a0", 0.22);
        damageEnemy(g, e, dmg * 4, { proc: 0.5 });
      }
    }
  }

  // Orbitalklingen
  if (it.orbitalklinge) {
    p.orbitAngle = (p.orbitAngle || 0) + dt * 3.2;
    const n = it.orbitalklinge;
    p.orbitHits = p.orbitHits || new Map();
    for (let i = 0; i < n; i++) {
      const a = p.orbitAngle + (Math.PI * 2 * i) / n;
      const bx = p.x + Math.cos(a) * 95;
      const by = p.y + Math.sin(a) * 95;
      for (const e of enemiesNear(g, bx, by, 16)) {
        const key = `${e.uid}:${i}`;
        if ((p.orbitHits.get(key) || 0) > g.time) continue;
        p.orbitHits.set(key, g.time + 0.5);
        damageEnemy(g, e, dmg * 2, { proc: 0.4 });
      }
    }
    if (p.orbitHits.size > 400) p.orbitHits.clear();
  }

  // Frostfell-Aura
  if (it.frostfell) {
    p.frostT = (p.frostT ?? 0) - dt;
    if (p.frostT <= 0) {
      p.frostT = 0.5;
      for (const e of enemiesNear(g, p.x, p.y, 220)) {
        e.slowT = Math.max(e.slowT || 0, 0.6); e.slowPct = Math.max(e.slowPct || 0, 0.3);
        damageEnemy(g, e, dmg * 0.3 * it.frostfell, { proc: 0, canCrit: false, color: "#a8e4ff", silent: true });
      }
    }
  }

  // Schleimkern: Säurespur beim Laufen
  if (it.schleimkern && p.moving) {
    p.slimeT = (p.slimeT ?? 0) - dt;
    if (p.slimeT <= 0) {
      p.slimeT = 0.3;
      addZone(g, { x: p.x, y: p.y, r: 46, t: 2.5, tick: 0.5, dmg: dmg * 0.8 * it.schleimkern, friendly: true, kind: "acid" });
    }
  }

  // Schutzrune: Schild lädt nach 4 s ohne Treffer
  if (p.stats.shieldMax > 0 && g.time - p.lastHurt > 4 && p.shield < p.stats.shieldMax) {
    p.shield = Math.min(p.stats.shieldMax, p.shield + p.stats.shieldMax * 0.5 * dt);
  }

  // Blutrausch-Stapel laufen ab
  if (p.bloodStacks.length && p.bloodStacks[0] < g.time) p.bloodStacks = p.bloodStacks.filter((t) => t >= g.time);
}
