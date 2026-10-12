// engine/bosses/common.js — Bausteine für alle Bosse: Angriffswahl, Geschossringe, Kontaktschaden, Phase 2.
// Ein Boss ist ein Gegner mit isBoss und einem Zustandsautomaten: "idle" (laufen, kurz warten) → Angriff → "idle".

import { spawnEnemyBullet } from "../projectiles.js";
import { hurtPlayer } from "../combat.js";
import { floatText, ring as fxRing, shake } from "../fx.js";
import { dist2 } from "../util.js";
import { ascBossRage } from "../ascension.js";

export function chooseAttack(g, e, options) {
  // options: [[name, weight, {phase2Only, minGap}]] — nie zweimal dasselbe hintereinander
  const list = options.filter(([name, , o]) => name !== e.lastAttack && (!o?.phase2Only || e.phase2));
  const pick = g.rng.weighted(list.map(([n, w]) => [n, w]));
  e.lastAttack = pick;
  e.state = pick;
  e.t = 0;
  e.step = 0;
  return pick;
}

export function bulletRing(g, e, count, speed, dmgMult, sprite, offset = 0, opts = {}) {
  const gap = opts.gap || null; // { at: Index, size: Anzahl }
  for (let i = 0; i < count; i++) {
    if (gap && ((i - gap.at + count) % count) < gap.size) continue;
    const a = offset + (Math.PI * 2 * i) / count;
    spawnEnemyBullet(g, { x: e.x + Math.cos(a) * (opts.startR || 0), y: e.y + Math.sin(a) * (opts.startR || 0), angle: a, speed, dmg: e.dmg * dmgMult, sprite,
      effect: opts.effect, life: opts.life ?? 4, r: opts.r ?? 10, scale: opts.scale ?? 1 });
  }
}

export function moveToward(e, tx, ty, speed, dt) {
  const a = Math.atan2(ty - e.y, tx - e.x);
  e.x += Math.cos(a) * speed * dt;
  e.y += Math.sin(a) * speed * dt;
  e.facing = tx < e.x ? -1 : 1;
}

export function bossContact(g, e, mult = 0.6) {
  const p = g.player;
  if (e.airborne || !p.alive) return;
  e.contactCd = (e.contactCd ?? 0);
  if (e.contactCd > 0) return;
  const rr = e.r * 0.8 + p.r;
  if (dist2(e.x, e.y, p.x, p.y) > rr * rr) return;
  e.contactCd = 1;
  hurtPlayer(g, e.dmg * mult);
}

// Gemeinsamer Rahmen: Auftritt, Phase 2 bei 50 %, Kontaktschaden. Gibt false zurück, solange der Boss noch nicht kämpft.
export function bossFrame(g, e, dt) {
  e.t += dt;
  if (e.introT > 0) {
    e.introT -= dt;
    e.invuln = true;
    if (!e.airborne) e.pose = "idle";
    if (e.introT <= 0) { e.invuln = false; e.state = "idle"; e.t = 0; }
    return false;
  }
  if (!e.phase2 && e.hp < e.maxHp * ascBossRage(g)) {
    e.phase2 = true;
    floatText(g, e.x, e.y - e.r - 40, "Raserei!", "#ff5a4a", { size: 24, life: 1.6, jitter: false });
    fxRing(g, e.x, e.y, e.r * 2.4, "#ff5a4a", 0.6);
    shake(g, 8);
    g.events.push({ type: "bossPhase" });
    if (e.onPhase2) e.onPhase2(g, e);
  }
  bossContact(g, e);
  return true;
}

export const idleTime = (e, base) => (e.phase2 ? base * 0.65 : base);
