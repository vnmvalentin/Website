// engine/allies.js — Helfer des Spielers: Geschütztürme (Cyber-Söldner), Köder (Ninja, Ausrüstung) und erweckte Skelette
// (Knochenkrone). Köder ziehen alle Gegner an, solange sie stehen.

import { damageEnemy, nearestEnemy } from "./combat.js";
import { spawnPlayerBullet } from "./projectiles.js";
import { burst } from "./fx.js";
import { dist2 } from "./util.js";

export function spawnAlly(g, kind, x, y, opts = {}) {
  const p = g.player;
  const base = { uid: g.nextUid++, kind, x, y, t: 0, atkCd: 0, r: 20 };
  if (kind === "turret") Object.assign(base, { life: 12, hp: Infinity, dmg: p.stats.damage * (opts.mult ?? 0.45) });
  if (kind === "decoy") Object.assign(base, { life: opts.life ?? 6, hp: p.stats.maxHp * 0.8, maxHp: p.stats.maxHp * 0.8, r: 22 });
  if (kind === "skeleton") Object.assign(base, { life: 20, hp: Infinity, dmg: p.stats.damage * 1.5, speed: 240, facing: 1 });
  g.allies.push(base);
  burst(g, x, y, "#d8cfb8", 10, 160);
  return base;
}

export function updateAllies(g, dt) {
  for (const a of g.allies) {
    a.t += dt;
    a.atkCd -= dt;
    if (a.kind === "turret") {
      if (a.atkCd <= 0) {
        const e = nearestEnemy(g, a.x, a.y, 580);
        if (e) {
          a.atkCd = 1 / 6;
          a.aim = Math.atan2(e.y - a.y, e.x - a.x);
          spawnPlayerBullet(g, { x: a.x, y: a.y - 10, angle: a.aim, speed: 950, dmg: a.dmg, sprite: "proj_laser", r: 6, range: 620, proc: 0.3 });
        }
      }
    } else if (a.kind === "decoy") {
      for (const e of g.enemies) {
        if (e.dead || e.isBoss) continue;
        const rr = e.r + a.r + 4;
        if (dist2(e.x, e.y, a.x, a.y) < rr * rr) a.hp -= e.dmg * dt;
      }
    } else if (a.kind === "skeleton") {
      const e = nearestEnemy(g, a.x, a.y, 700);
      if (e) {
        const ang = Math.atan2(e.y - a.y, e.x - a.x);
        const d2 = dist2(a.x, a.y, e.x, e.y);
        a.facing = e.x < a.x ? -1 : 1;
        a.moving = d2 > (e.r + a.r) * (e.r + a.r);
        if (a.moving) { a.x += Math.cos(ang) * a.speed * dt; a.y += Math.sin(ang) * a.speed * dt; }
        else if (a.atkCd <= 0) { a.atkCd = 0.8; a.attackT = 0; damageEnemy(g, e, a.dmg, { proc: 0.3 }); }
      } else {
        // dem Spieler folgen
        const p = g.player;
        a.moving = dist2(a.x, a.y, p.x, p.y) > 110 * 110;
        if (a.moving) { const ang = Math.atan2(p.y - a.y, p.x - a.x); a.x += Math.cos(ang) * a.speed * dt; a.y += Math.sin(ang) * a.speed * dt; a.facing = p.x < a.x ? -1 : 1; }
      }
      a.attackT = (a.attackT ?? 9) + dt;
    }
  }
  g.allies = g.allies.filter((a) => a.t < a.life && a.hp > 0);
}
