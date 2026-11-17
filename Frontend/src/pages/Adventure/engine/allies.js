// engine/allies.js — Helfer des Spielers: Geschütztürme (Tüftler), Köder (Ninja, Ausrüstung), erweckte Skelette
// (Knochenkrone, Nekromantin), Fangeisen und Wölfe (Jägerin). Köder ziehen alle Gegner an, solange sie stehen.

import { damageEnemy, nearestEnemy, addHazard } from "./combat.js";
import { collectEnemies } from "./grid.js";
import { spawnPlayerBullet } from "./projectiles.js";
import { burst } from "./fx.js";
import { dist2 } from "./util.js";

export function spawnAlly(g, kind, x, y, opts = {}) {
  const p = g.player;
  const base = { uid: g.nextUid++, kind, x, y, t: 0, atkCd: 0, r: 20 };
  if (kind === "turret") Object.assign(base, { life: 12, hp: Infinity, dmg: p.stats.damage * (opts.mult ?? 0.45) });
  if (kind === "decoy") Object.assign(base, { life: opts.life ?? 6, hp: p.stats.maxHp * 0.8, maxHp: p.stats.maxHp * 0.8, r: 22 });
  if (kind === "skeleton") Object.assign(base, { life: opts.life ?? 20, hp: Infinity, dmg: p.stats.damage * (opts.mult ?? 1.5), speed: 240, facing: 1 });
  // Fangeisen: liegt still, bis ein Gegner hineintritt (dmg/trapR vom Kit)
  if (kind === "trap") Object.assign(base, { life: 25, hp: Infinity, dmg: opts.dmg, trapR: opts.r ?? 120, r: 16 });
  // Wolf: wie ein Skelett, aber schneller und mit kräftigerem Biss
  if (kind === "wolf") Object.assign(base, { life: opts.life ?? 15, hp: Infinity, dmg: p.stats.damage * (opts.mult ?? 2), speed: 330, facing: 1, r: 22 });
  // Obergrenzen: das älteste fällt weg, damit Fallen und Skelette nicht ins Unendliche wachsen
  const cap = ALLY_CAP[kind];
  if (cap) {
    const same = g.allies.filter((a) => a.kind === kind);
    if (same.length >= cap) same[0].hp = 0;
  }
  g.allies.push(base);
  burst(g, x, y, "#d8cfb8", 10, 160);
  return base;
}

const ALLY_CAP = { trap: 8, skeleton: 16, wolf: 4 };
/** Höchstens so viele Skelette stehen über den Seelenblitz auf */
export const RAISE_CAP = 8;

/** Nekromantin: ein Getöteter steht als Skelett auf (solange weniger als RAISE_CAP da sind) */
export function raiseSkeleton(g, x, y) {
  let n = 0;
  for (const a of g.allies) if (a.kind === "skeleton" && a.hp > 0) n++;
  if (n >= RAISE_CAP) return null;
  return spawnAlly(g, "skeleton", x, y, { life: 10, mult: 0.9 });
}

// Nahkampf-Begleiter (Skelett, Wolf): zu einem Gegner, zuschlagen, sonst dem Spieler folgen. Jeder behält sein Ziel,
// solange es lebt, und sucht sich sonst eines, das noch kein anderer Helfer jagt — vorher stürzten sich alle auf
// denselben nächsten Gegner (zwei Wölfe, ein Opfer).
const claimed = new Set();
function pickTarget(g, a) {
  const t = a.target;
  if (t && !t.dead && !t.invuln && dist2(t.x, t.y, a.x, a.y) < 700 * 700) return t;
  claimed.clear();
  for (const o of g.allies) if (o !== a && o.target && !o.target.dead) claimed.add(o.target);
  a.target = nearestEnemy(g, a.x, a.y, 700, claimed) || nearestEnemy(g, a.x, a.y, 700);
  return a.target;
}

function melee(g, a, dt, every) {
  const p = g.player;
  const e = pickTarget(g, a);
  if (e) {
    const ang = Math.atan2(e.y - a.y, e.x - a.x);
    const d2 = dist2(a.x, a.y, e.x, e.y);
    a.facing = e.x < a.x ? -1 : 1;
    a.aim = ang;
    a.moving = d2 > (e.r + a.r) * (e.r + a.r);
    if (a.moving) { a.x += Math.cos(ang) * a.speed * dt; a.y += Math.sin(ang) * a.speed * dt; }
    else if (a.atkCd <= 0) {
      a.atkCd = every; a.attackT = 0;
      damageEnemy(g, e, a.dmg * (p.buffs.necroRage > 0 && a.kind === "skeleton" ? 2 : 1), { proc: 0.3 });
    }
  } else {
    a.moving = dist2(a.x, a.y, p.x, p.y) > 110 * 110;
    if (a.moving) { const ang = Math.atan2(p.y - a.y, p.x - a.x); a.x += Math.cos(ang) * a.speed * dt; a.y += Math.sin(ang) * a.speed * dt; a.facing = p.x < a.x ? -1 : 1; a.aim = ang; }
  }
  a.attackT = (a.attackT ?? 9) + dt;
}

const trapHits = [];

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
      melee(g, a, dt, 0.8);
    } else if (a.kind === "wolf") {
      melee(g, a, dt, 0.6);
    } else if (a.kind === "trap") {
      // Ausgelöst, sobald ein Gegner am Boden darauf tritt (Flieger und Eingegrabene nicht)
      for (const e of collectEnemies(g, a.x, a.y, a.r + 40, trapHits)) {
        if (e.dead || e.flying || e.hidden || dist2(e.x, e.y, a.x, a.y) > (a.r + e.r) * (a.r + e.r)) continue;
        addHazard(g, { shape: "circle", x: a.x, y: a.y, r: a.trapR, delay: 0, dmg: a.dmg, friendly: true, proc: 1, effect: "freeze", color: "#c9a06b", shake: 3 });
        burst(g, a.x, a.y, "#c9a06b", 14, 240);
        a.hp = 0;
        break;
      }
    }
  }
  g.allies = g.allies.filter((a) => a.t < a.life && a.hp > 0);
}
