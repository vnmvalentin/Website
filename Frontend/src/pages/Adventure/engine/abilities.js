// engine/abilities.js — die vier Fähigkeiten jedes Kits und die Ausrüstung. Werte (Schadensfaktor, Radius, Abklingzeit)
// kommen aus data/kits.js bzw. data/equipment.js, hier steht nur, was passiert.

import { spawnPlayerBullet } from "./projectiles.js";
import { addHazard, addZone, damageEnemy, enemiesNear, healPlayer } from "./combat.js";
import { spawnAlly } from "./allies.js";
import { burst, ring, lightning, floatText, shake } from "./fx.js";
import { dist, dist2, clamp } from "./util.js";

// Punkt in Zielrichtung, höchstens maxD entfernt, innerhalb der Welt
function aimPoint(g, maxD) {
  const p = g.player;
  const d = Math.min(maxD, dist(p.x, p.y, p.aimX, p.aimY));
  return {
    x: clamp(p.x + Math.cos(p.aim) * d, 30, g.world.w - 30),
    y: clamp(p.y + Math.sin(p.aim) * d, 30, g.world.h - 30),
  };
}

// Freien Landepunkt suchen: von weit nach nah, bis kein Hindernis im Weg steht
function freeLanding(g, maxD) {
  const p = g.player;
  for (let f = 1; f >= 0.1; f -= 0.1) {
    const q = aimPoint(g, maxD * f);
    if (!g.obstacles.some((o) => dist2(q.x, q.y, o.x, o.y) < (o.r + p.r) * (o.r + p.r))) return q;
  }
  return { x: p.x, y: p.y };
}

function startDash(g, angle, distance, duration, extra = {}) {
  const p = g.player;
  const speed = distance / duration;
  p.dash = { t: 0, dur: duration, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, invuln: true, hit: new Set(), ...extra };
  // Hornbrecher: jede Bewegungsfähigkeit trifft Gegner auf dem Weg
  if (p.items.hornbrecher) {
    p.dash.dmg = (p.dash.dmg || 0) + p.stats.damage * 4 * p.items.hornbrecher;
    p.dash.knockback = Math.max(p.dash.knockback || 0, 420);
  }
}

// ── Hauptangriff ────────────────────────────────────────────────────────────
export function firePrimary(g) {
  const p = g.player;
  const kit = g.kit;
  const ab = kit.abilities.primary;
  const s = p.stats;
  const n = 1 + s.projectiles;
  const spread = ab.id === "arrow" ? 0.08 : 0.13;
  const base = {
    speed: ab.speed * s.range, range: ab.range * s.range, dmg: s.damage * ab.mult, sprite: kit.projectile, primary: true,
    pierce: (ab.pierce || 0) + s.pierce, r: 7,
  };
  if (ab.id === "fireball") Object.assign(base, { kind: "fireball", explodeR: ab.radius, r: 10 });
  if (ab.id === "toxin") Object.assign(base, { kind: "toxin", r: 9 });
  if (ab.id === "block") Object.assign(base, { kind: "block", bounces: 1, r: 9 });
  if (ab.id === "shuriken") base.spin = 18;
  const sx = p.x + Math.cos(p.aim) * 16;
  const sy = p.y + Math.sin(p.aim) * 16 - 6;
  for (let i = 0; i < n; i++) {
    const a = p.aim + (i - (n - 1) / 2) * spread;
    spawnPlayerBullet(g, { ...base, x: sx, y: sy, angle: a });
  }
  p.attackAnimT = 0;

  // Sternenkanone: jeder 6. Schuss eine Nova
  if (p.items.sternenkanone) {
    p.starCount = (p.starCount || 0) + 1;
    if (p.starCount >= 6) {
      p.starCount = 0;
      const k = 8 * p.items.sternenkanone;
      for (let i = 0; i < k; i++) {
        spawnPlayerBullet(g, { ...base, x: p.x, y: p.y, angle: (Math.PI * 2 * i) / k, dmg: s.damage, primary: false, proc: 0.5, kind: "normal", sprite: "proj_laser" });
      }
    }
  }
}

// ── Zweitangriff / Bewegung / Spezial ───────────────────────────────────────
export function castAbility(g, slot) {
  const p = g.player;
  const ab = g.kit.abilities[slot];
  const dmg = p.stats.damage;

  switch (ab.id) {
    // Abenteurer
    case "grenade": {
      const q = aimPoint(g, 460);
      spawnPlayerBullet(g, { x: p.x, y: p.y, angle: p.aim, speed: 640, dmg: dmg * ab.mult, kind: "grenade", sprite: "proj_grenade", explodeR: ab.radius, tx: q.x, ty: q.y, range: 900, r: 8, spin: 14, proc: 1 });
      break;
    }
    case "roll": {
      const a = p.moving ? p.moveAngle : p.aim;
      startDash(g, a, ab.dist, 0.24);
      break;
    }
    case "barrage":
      p.barrage = { left: ab.shots, t: 0, mult: ab.mult };
      break;

    // Ritter
    case "shieldBash": {
      p.buffs.guard = 2;
      ring(g, p.x + Math.cos(p.aim) * 60, p.y + Math.sin(p.aim) * 60, ab.radius * 0.8, "#d8d0bc", 0.25);
      for (const e of enemiesNear(g, p.x, p.y, ab.radius)) {
        let d = Math.atan2(e.y - p.y, e.x - p.x) - p.aim;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < 1.1) damageEnemy(g, e, dmg * ab.mult, { knockback: 560 });
      }
      // Geschosse vor dem Schild zerbrechen
      g.eBullets = g.eBullets.filter((b) => {
        if (dist2(b.x, b.y, p.x, p.y) > ab.radius * ab.radius) return true;
        let d = Math.atan2(b.y - p.y, b.x - p.x) - p.aim;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return Math.abs(d) >= 1.1;
      });
      break;
    }
    case "charge":
      startDash(g, p.aim, ab.dist, 0.26, { dmg: dmg * ab.mult, knockback: 480 });
      break;
    case "arrowRain": {
      const q = aimPoint(g, 650);
      addZone(g, { x: q.x, y: q.y, r: ab.radius, t: 2.5, tick: 0.25, dmg: dmg * ab.mult, friendly: true, kind: "arrows", textColor: "#ffffff" });
      break;
    }

    // Ninja
    case "fan":
      for (let i = 0; i < ab.shots; i++) {
        const a = p.aim + (i - (ab.shots - 1) / 2) * 0.2;
        spawnPlayerBullet(g, { x: p.x, y: p.y, angle: a, speed: 820 * p.stats.range, range: 600 * p.stats.range, dmg: dmg * ab.mult, sprite: "proj_shuriken", spin: 18, pierce: p.stats.pierce, proc: 0.8 });
      }
      break;
    case "shadowStep": {
      spawnAlly(g, "decoy", p.x, p.y, { life: 2.5 });
      const q = freeLanding(g, ab.dist);
      burst(g, p.x, p.y, "#6b5f8a", 12, 200);
      p.x = q.x; p.y = q.y;
      p.buffs.invuln = Math.max(p.buffs.invuln, 0.25);
      burst(g, p.x, p.y, "#6b5f8a", 12, 200);
      if (p.items.hornbrecher) for (const e of enemiesNear(g, p.x, p.y, 90)) damageEnemy(g, e, dmg * 4 * p.items.hornbrecher, { knockback: 420 });
      break;
    }
    case "bladeSpin":
      p.spin = { t: 2.5, tickT: 0, tick: 0.25, dmg: dmg * ab.mult, r: ab.radius };
      p.buffs.spin = 2.5;
      break;

    // Magier
    case "frostNova":
      addHazard(g, { shape: "circle", x: p.x, y: p.y, r: ab.radius, delay: 0, dmg: dmg * ab.mult, friendly: true, proc: 1, effect: "freeze", color: "#9ad9ff" });
      burst(g, p.x, p.y, "#bfe9ff", 26, 380);
      break;
    case "blink": {
      const q = freeLanding(g, ab.dist);
      burst(g, p.x, p.y, "#c49aff", 12, 200);
      p.x = q.x; p.y = q.y;
      p.buffs.invuln = Math.max(p.buffs.invuln, 0.2);
      burst(g, p.x, p.y, "#c49aff", 12, 200);
      if (p.items.hornbrecher) for (const e of enemiesNear(g, p.x, p.y, 90)) damageEnemy(g, e, dmg * 4 * p.items.hornbrecher, { knockback: 420 });
      break;
    }
    case "meteor": {
      const q = aimPoint(g, 700);
      addHazard(g, { shape: "circle", x: q.x, y: q.y, r: ab.radius, delay: 1, dmg: dmg * ab.mult, friendly: true, proc: 1, effect: "burn", color: "#ff7a2e", shake: 9, meteor: true });
      break;
    }

    // Giftmischer
    case "toxicCloud": {
      const q = aimPoint(g, 560);
      addZone(g, { x: q.x, y: q.y, r: ab.radius, t: 5, tick: 0.5, dmg: dmg * ab.mult, friendly: true, effect: "poison", kind: "poison" });
      break;
    }
    case "acidSprint":
      p.buffs.acidSprint = 2.5;
      break;
    case "plague": {
      let any = false;
      for (const e of enemiesNear(g, p.x, p.y, 950)) {
        const stacks = e.poison?.length || 0;
        if (!stacks) continue;
        any = true;
        e.poison = [];
        burst(g, e.x, e.y, "#9be05a", 12, 220);
        damageEnemy(g, e, dmg * ab.mult * stacks, { proc: 0.5, color: "#9be05a" });
        for (const o of enemiesNear(g, e.x, e.y, 200)) {
          if (o === e || o.dead) continue;
          if (!o.poison) o.poison = [];
          o.poison.push({ dps: dmg * 0.4, t: 3 }, { dps: dmg * 0.4, t: 3 });
        }
      }
      if (!any) floatText(g, p.x, p.y - 50, "Kein Gift im Umkreis", "#9be05a", { size: 13, jitter: false });
      break;
    }

    // Cyber-Söldner
    case "turret":
      spawnAlly(g, "turret", p.x, p.y, { mult: ab.mult });
      break;
    case "overdrive":
      p.buffs.overdrive = 3;
      ring(g, p.x, p.y, 70, "#5ee0ff", 0.3);
      break;
    case "orbital":
      for (let i = 0; i < 5; i++) {
        const d = 120 + i * 115;
        const x = p.x + Math.cos(p.aim) * d;
        const y = p.y + Math.sin(p.aim) * d;
        addHazard(g, { shape: "circle", x, y, r: 95, delay: 0.5 + i * 0.12, dmg: dmg * ab.mult, friendly: true, proc: 1, color: "#ffe14d", shake: 4,
          onResolve: (gg, h) => lightning(gg, [{ x: h.x, y: h.y - 520 }, { x: h.x - 14, y: h.y - 260 }, { x: h.x + 8, y: h.y - 120 }, { x: h.x, y: h.y }], "#fff3a0", 0.25) });
      }
      break;

    // Baumeister
    case "wall": {
      const q = aimPoint(g, 420);
      const perp = p.aim + Math.PI / 2;
      const half = 140;
      g.walls.push({ x1: q.x - Math.cos(perp) * half, y1: q.y - Math.sin(perp) * half, x2: q.x + Math.cos(perp) * half, y2: q.y + Math.sin(perp) * half, w: 28, t: 6 });
      break;
    }
    case "leap": {
      const q = freeLanding(g, ab.dist);
      const d = dist(p.x, p.y, q.x, q.y);
      startDash(g, Math.atan2(q.y - p.y, q.x - p.x), Math.max(1, d), 0.42, { leap: true, landDmg: dmg * ab.mult, landR: ab.radius });
      break;
    }
    case "fortress": {
      const n = 8;
      const R = 200;
      for (let i = 0; i < n; i++) {
        const a1 = (Math.PI * 2 * i) / n;
        const a2 = (Math.PI * 2 * (i + 1)) / n;
        g.walls.push({ x1: p.x + Math.cos(a1) * R, y1: p.y + Math.sin(a1) * R, x2: p.x + Math.cos(a2) * R, y2: p.y + Math.sin(a2) * R, w: 26, t: 5 });
      }
      p.buffs.fortress = 5;
      break;
    }
    default:
      break;
  }
}

// ── Ausrüstung ──────────────────────────────────────────────────────────────
export function activateEquipment(g) {
  const p = g.player;
  const dmg = p.stats.damage;
  switch (p.equipment) {
    case "heiltrank": healPlayer(g, p.stats.maxHp * 0.5); break;
    case "schutzschild": p.buffs.invuln = Math.max(p.buffs.invuln, 3); p.buffs.bubble = 3; break;
    case "wirbelwind": p.spin = { t: 3, tickT: 0, tick: 0.25, dmg: dmg * 2, r: 150 }; p.buffs.spin = 3; break;
    case "koeder": spawnAlly(g, "decoy", p.x, p.y, { life: 6 }); break;
    case "granatgurt": {
      const c = aimPoint(g, 520);
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5;
        const tx = clamp(c.x + Math.cos(a) * 90, 30, g.world.w - 30);
        const ty = clamp(c.y + Math.sin(a) * 90, 30, g.world.h - 30);
        spawnPlayerBullet(g, { x: p.x, y: p.y, angle: Math.atan2(ty - p.y, tx - p.x), speed: 620, dmg: dmg * 4, kind: "grenade", sprite: "proj_grenade", explodeR: 110, tx, ty, range: 1200, spin: 14, proc: 0.5 });
      }
      break;
    }
    case "hyperfeuer": p.buffs.hyper = 6; break;
    case "speedboots": p.buffs.boots = 6; break;
    case "blitzschlag": {
      const q = aimPoint(g, 800);
      addHazard(g, { shape: "circle", x: q.x, y: q.y, r: 150, delay: 0.35, dmg: dmg * 10, friendly: true, proc: 1, color: "#ffe14d", shake: 7,
        onResolve: (gg, h) => lightning(gg, [{ x: h.x, y: h.y - 600 }, { x: h.x + 20, y: h.y - 300 }, { x: h.x - 10, y: h.y - 140 }, { x: h.x, y: h.y }], "#fff3a0", 0.3) });
      break;
    }
    default: return false;
  }
  return true;
}

// Laufende Effekte von Fähigkeiten (Salven, Wirbel, Säurespur, Ansturm-Treffer)
export function updateAbilityEffects(g, dt) {
  const p = g.player;
  if (p.barrage) {
    p.barrage.t -= dt;
    while (p.barrage && p.barrage.t <= 0) {
      p.barrage.t += 0.045;
      const a = p.aim + (g.rng.next() - 0.5) * 0.5;
      spawnPlayerBullet(g, { x: p.x, y: p.y, angle: a, speed: 820 * p.stats.range, range: 680 * p.stats.range, dmg: p.stats.damage * p.barrage.mult, sprite: g.kit.projectile, pierce: p.stats.pierce, proc: 0.7 });
      p.attackAnimT = 0;
      if (--p.barrage.left <= 0) p.barrage = null;
    }
  }
  if (p.spin) {
    p.spin.t -= dt;
    p.spin.tickT -= dt;
    p.spinAngle = (p.spinAngle || 0) + dt * 18;
    if (p.spin.tickT <= 0) {
      p.spin.tickT = p.spin.tick;
      for (const e of enemiesNear(g, p.x, p.y, p.spin.r)) damageEnemy(g, e, p.spin.dmg, { proc: 0.5 });
    }
    if (p.spin.t <= 0) p.spin = null;
  }
  if (p.buffs.acidSprint > 0) {
    p.acidT = (p.acidT ?? 0) - dt;
    if (p.acidT <= 0) {
      p.acidT = 0.12;
      addZone(g, { x: p.x, y: p.y, r: 42, t: 3, tick: 0.5, dmg: p.stats.damage * 0.8, friendly: true, effect: "poison", kind: "acid" });
    }
  }
  if (p.dash && p.items.magmaherz) {
    p.lavaT = (p.lavaT ?? 0) - dt;
    if (p.lavaT <= 0) {
      p.lavaT = 0.05;
      addZone(g, { x: p.x, y: p.y, r: 46, t: 3, tick: 0.5, dmg: p.stats.damage * 1.2 * p.items.magmaherz, friendly: true, kind: "fire", effect: "burn", textColor: "#ff9a5a" });
    }
  }
  if (p.dash && p.dash.dmg) {
    for (const e of enemiesNear(g, p.x, p.y, p.r + 10)) {
      if (p.dash.hit.has(e)) continue;
      p.dash.hit.add(e);
      damageEnemy(g, e, p.dash.dmg, { proc: 1, knockback: p.dash.knockback || 0 });
      shake(g, 3);
    }
  }
}
