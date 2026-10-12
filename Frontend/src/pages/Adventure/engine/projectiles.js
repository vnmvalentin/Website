// engine/projectiles.js — Geschosse von Spieler/Verbündeten und Gegnern. Gegnergeschosse bleiben an Hindernissen und
// Baumeister-Mauern hängen (Deckung lohnt sich), Spielergeschosse fliegen durch, damit man nicht an Steinen hängt.

import { damageEnemy, addHazard, addZone, hurtPlayer, nearestEnemy } from "./combat.js";
import { burst, floatText } from "./fx.js";
import { hasAffix } from "./enemies.js";
import { dist2, distToSegment } from "./util.js";

// Kommt das Geschoss von vorn (±60°) auf einen Schild zu?
function shieldBlocks(e, b) {
  if (e.freezeT > 0) return false;
  const front = e.ai === "shield" ? e.shieldA : e.guardUp ? e.guardA : null;
  if (front === null || front === undefined) return false;
  let d = Math.atan2(-b.vy, -b.vx) - front;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < 1.05;
}

export function spawnPlayerBullet(g, o) {
  const speed = o.speed;
  g.pBullets.push({
    x: o.x, y: o.y,
    vx: Math.cos(o.angle) * speed, vy: Math.sin(o.angle) * speed,
    speed,
    r: o.r ?? 7,
    dmg: o.dmg,
    life: (o.range ?? 650) / speed,
    pierce: o.pierce ?? 0,
    kind: o.kind || "normal",
    sprite: o.sprite || "proj_basic",
    proc: o.proc ?? 1,
    primary: !!o.primary,
    explodeR: o.explodeR || 0,
    bounces: o.bounces || 0,
    target: o.target || null,
    tx: o.tx, ty: o.ty,
    hit: new Set(),
    spin: o.spin || 0,
    look: o.look || null,
    maxDist: o.maxDist || 0,
    traveled: 0,
    returning: false,
    zone: o.zone || null,
  });
}

export function spawnEnemyBullet(g, o) {
  g.eBullets.push({
    x: o.x, y: o.y,
    vx: Math.cos(o.angle) * o.speed, vy: Math.sin(o.angle) * o.speed,
    r: o.r ?? 8,
    dmg: o.dmg,
    life: o.life ?? 3,
    sprite: o.sprite || "proj_basic",
    effect: o.effect || null,
    homing: o.homing || 0,
    maxSpeed: o.speed,
    passThrough: !!o.passThrough,
    scale: o.scale || 1,
    src: o.src ?? g.curAttacker ?? null,
  });
}

function explode(g, b) {
  addHazard(g, { shape: "circle", x: b.x, y: b.y, r: b.explodeR, delay: 0, dmg: b.dmg * (b.kind === "fireball" ? 0.6 : 1), friendly: true,
    proc: b.kind === "rocket" ? 0 : 0.5, color: "#ff9a3c" });
  burst(g, b.x, b.y, "#ff9a3c", 10, 220);
}

export function updateProjectiles(g, dt) {
  const p = g.player;

  // ── Spieler ──
  const keep = [];
  for (const b of g.pBullets) {
    b.life -= dt;
    if (b.kind === "rocket") {
      if (!b.target || b.target.dead) b.target = nearestEnemy(g, b.x, b.y, 900);
      if (b.target) {
        const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const na = cur + Math.max(-6 * dt, Math.min(6 * dt, d));
        b.vx = Math.cos(na) * b.speed; b.vy = Math.sin(na) * b.speed;
      }
    }
    // Bumerang: fliegt bis maxDist hinaus, dann zurück zum Spieler; auf jedem Weg trifft er jeden Gegner einmal
    if (b.kind === "boomerang") {
      b.traveled += Math.hypot(b.vx, b.vy) * dt;
      if (!b.returning && b.traveled >= b.maxDist) { b.returning = true; b.hit.clear(); }
      if (b.returning) {
        const a = Math.atan2(p.y - b.y, p.x - b.x);
        const sp = Math.min(950, b.speed * 1.15);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        if (dist2(b.x, b.y, p.x, p.y) < 30 * 30 || b.traveled > b.maxDist * 4) continue;
      }
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.kind === "grenade" || b.kind === "flask") {
      if (dist2(b.x, b.y, b.tx, b.ty) < 20 * 20 || b.life <= 0) {
        if (b.kind === "grenade") explode(g, b);
        else {
          addZone(g, { x: b.x, y: b.y, r: b.zone.r, t: b.zone.t, tick: 0.5, dmg: b.dmg, friendly: true, effect: "poison", kind: "acid", seek: b.zone.seek });
          burst(g, b.x, b.y, "#9be05a", 10, 180);
        }
        continue;
      }
      keep.push(b);
      continue;
    }

    let dead = b.life <= 0;
    if (!dead) {
      for (const e of g.enemies) {
        if (e.dead || e.invuln || b.hit.has(e)) continue;
        const rr = e.r + b.r;
        if (dist2(b.x, b.y, e.x, e.y) > rr * rr) continue;
        b.hit.add(e);
        if (shieldBlocks(e, b)) {
          burst(g, b.x, b.y, "#e8e2d4", 6, 160, 0.25, 3);
          if (g.time - (e.blockTextT || -9) > 0.6) { e.blockTextT = g.time; floatText(g, e.x, e.y - e.r - 10, "Geblockt", "#c9c3d1", { size: 12 }); }
          dead = true;
          break;
        }
        const kb = (b.kind === "block" ? 60 : 0) + (b.primary && p.items.rueckstoss ? 90 * p.items.rueckstoss : 0);
        damageEnemy(g, e, b.dmg, { proc: b.proc, primary: b.primary, knockback: kb, fromX: b.x - b.vx * 0.05, fromY: b.y - b.vy * 0.05 });
        // Spiegelnd: jedes ~5. Geschoss fliegt zurück
        if (!e.dead && hasAffix(e, "spiegelnd") && g.rng.chance(0.2)) {
          spawnEnemyBullet(g, { x: e.x, y: e.y, angle: Math.atan2(p.y - e.y, p.x - e.x), speed: 420, dmg: e.dmg * 0.7, sprite: b.sprite || "proj_basic", life: 2.5, r: 8, src: e });
        }
        if (b.kind === "toxin") {
          if (!e.poison) e.poison = [];
          if (e.poison.length < 12) e.poison.push({ dps: p.stats.damage * 0.4, t: 2 });
        }
        if (b.kind === "fireball" || b.kind === "rocket") { explode(g, b); dead = true; break; }
        if (b.kind === "block" && b.bounces > 0) {
          const next = nearestEnemy(g, b.x, b.y, 320, b.hit);
          if (next) {
            b.bounces--;
            const a = Math.atan2(next.y - b.y, next.x - b.x);
            b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed;
            b.life = Math.max(b.life, 0.6);
            continue;
          }
        }
        if (b.pierce > 0) { b.pierce--; continue; }
        dead = true;
        break;
      }
    }
    if (dead) {
      if (b.kind === "fireball" && b.life <= 0) explode(g, b);
      continue;
    }
    if (b.x < -50 || b.y < -50 || b.x > g.world.w + 50 || b.y > g.world.h + 50) continue;
    keep.push(b);
  }
  g.pBullets = keep;

  // ── Gegner ──
  const ekeep = [];
  for (const b of g.eBullets) {
    b.life -= dt;
    if (b.life <= 0) continue;
    if (b.homing && p.alive) {
      const a = Math.atan2(p.y - b.y, p.x - b.x);
      b.vx += Math.cos(a) * b.homing * dt;
      b.vy += Math.sin(a) * b.homing * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > b.maxSpeed) { b.vx *= b.maxSpeed / sp; b.vy *= b.maxSpeed / sp; }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (!b.passThrough) {
      let blocked = false;
      for (const o of g.obstacles) {
        if (dist2(b.x, b.y, o.x, o.y) < o.r * o.r) { blocked = true; break; }
      }
      if (!blocked) {
        for (const w of g.walls) {
          if (distToSegment(b.x, b.y, w.x1, w.y1, w.x2, w.y2) < w.w / 2 + b.r) { blocked = true; break; }
        }
      }
      if (blocked) { burst(g, b.x, b.y, "#8a8070", 4, 90, 0.25, 3); continue; }
    }
    if (p.alive && dist2(b.x, b.y, p.x, p.y) < (p.r * 0.75 + b.r) * (p.r * 0.75 + b.r)) {
      hurtPlayer(g, b.dmg, { effect: b.effect, source: b.src });
      if (!b.passThrough) continue;
      b.passThrough = false; // Wandteile treffen nur einmal
      b.life = Math.min(b.life, 0.05);
    }
    ekeep.push(b);
  }
  g.eBullets = ekeep;
}
