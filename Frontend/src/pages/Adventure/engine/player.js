// engine/player.js — Spieler anlegen und pro Tick bewegen: Laufen, Ausweichbewegungen, Zielen, Abklingzeiten mit
// Ladungen, Regeneration und Zustände (Gift/Brand töten nie — sie lassen dich mit 1 Leben stehen).

import { recalcStats, attackSpeedNow, moveSpeedNow } from "./stats.js";
import { firePrimary, castAbility, activateEquipment, updateAbilityEffects } from "./abilities.js";
import { addHazard, addZone } from "./combat.js";
import { EQUIPMENT } from "../data/equipment.js";
import { ascRegen } from "./ascension.js";
import { burst } from "./fx.js";
import { clamp, distToSegment } from "./util.js";

const SLOTS = ["secondary", "utility", "special"];

export function createPlayer(kit, snap) {
  const p = {
    x: 0, y: 0, r: 20,
    aim: 0, aimX: 0, aimY: 0, moveAngle: 0, moving: false, facing: 1,
    hp: 1, shield: 0, lastHurt: -99, hurtFlash: 0, alive: true,
    level: snap?.level ?? 1, xp: snap?.xp ?? 0, gold: snap?.gold ?? 0,
    items: { ...(snap?.items || {}) }, itemOrder: [...(snap?.itemOrder || Object.keys(snap?.items || {}))],
    equipment: snap?.equipment ?? null, equipCd: 0,
    // Waffen und Talente aus dem Stufenaufstieg: id → Stufe (1–5), Reihenfolge = Reihenfolge der Wahl
    weapons: { ...(snap?.weapons || {}) }, weaponOrder: [...(snap?.weaponOrder || Object.keys(snap?.weapons || {}))], weaponState: {},
    talents: { ...(snap?.talents || {}) }, talentOrder: [...(snap?.talentOrder || Object.keys(snap?.talents || {}))],
    pendingLevels: snap?.pendingLevels ?? 0,
    soulStacks: snap?.soulStacks ?? 0,
    primaryT: 0, attackAnimT: 9,
    cds: {},
    buffs: { invuln: 0, guard: 0, overdrive: 0, hyper: 0, boots: 0, harpoon: 0, acidSprint: 0, spin: 0, fortress: 0, bubble: 0 },
    status: { slowT: 0, slowPct: 0, freezeT: 0, stunT: 0, burnT: 0, burnDps: 0, poisonT: 0, poisonDps: 0 },
    bloodStacks: [],
    dash: null, spin: null, barrage: null,
  };
  recalcStats(p, kit);
  p.hp = snap?.hpFrac ? Math.max(1, p.stats.maxHp * snap.hpFrac) : p.stats.maxHp;
  p.shield = p.stats.shieldMax;
  for (const slot of SLOTS) {
    const max = maxCharges(p, kit, slot);
    p.cds[slot] = { charges: max, t: 0 };
  }
  return p;
}

function dropLava(g, p) {
  addZone(g, { x: p.x, y: p.y, r: 60, t: 3, tick: 0.5, dmg: p.stats.damage * 1.2 * p.items.magmaherz, friendly: true, kind: "fire", effect: "burn", textColor: "#ff9a5a" });
}

export function maxCharges(p, kit, slot) {
  const base = kit.abilities[slot].charges || 1;
  if (slot === "utility") return base + p.stats.utilityCharges;
  if (slot === "secondary") return base + p.stats.secondaryCharges;
  return base;
}

export const cooldownOf = (p, kit, slot) => kit.abilities[slot].cd * p.stats.cdMult;

export function updatePlayer(g, dt, input) {
  const p = g.player;
  if (!p.alive) return;
  const kit = g.kit;

  // Timer
  for (const k of Object.keys(p.buffs)) if (p.buffs[k] > 0) p.buffs[k] -= dt;
  const st = p.status;
  if (st.slowT > 0) st.slowT -= dt; else st.slowPct = 0;
  if (st.freezeT > 0) st.freezeT -= dt;
  if (st.stunT > 0) st.stunT -= dt;
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.attackAnimT += dt;
  p.dotT = (p.dotT ?? 0) - dt;
  if (p.dotT <= 0) {
    p.dotT = 0.5;
    let dot = 0;
    if (st.poisonT > 0) { st.poisonT -= 0.5; dot += st.poisonDps * 0.5; } else st.poisonDps = 0;
    if (st.burnT > 0) { st.burnT -= 0.5; dot += st.burnDps * 0.5; } else st.burnDps = 0;
    if (dot > 0 && p.buffs.invuln <= 0) { p.hp = Math.max(1, p.hp - dot); p.lastHurt = g.time; }
  }
  p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.regen * ascRegen(g) * dt);

  // Zielen
  p.aimX = input.aimX; p.aimY = input.aimY;
  p.aim = Math.atan2(p.aimY - p.y, p.aimX - p.x);
  p.facing = Math.cos(p.aim) < 0 ? -1 : 1;

  // Bewegung
  const h = input.held;
  let mx = (h.right ? 1 : 0) - (h.left ? 1 : 0);
  let my = (h.down ? 1 : 0) - (h.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) { mx /= len; my /= len; p.moveAngle = Math.atan2(my, mx); }
  const locked = st.freezeT > 0 || st.stunT > 0;

  if (p.dash) {
    p.dash.t += dt;
    p.x += p.dash.vx * dt;
    p.y += p.dash.vy * dt;
    p.moving = true;
    if (p.dash.t >= p.dash.dur) {
      if (p.dash.leap) {
        addHazard(g, { shape: "circle", x: p.x, y: p.y, r: p.dash.landR, delay: 0, dmg: p.dash.landDmg, friendly: true, proc: 1, knockback: 380, color: "#d8cfb8", shake: 5 });
        burst(g, p.x, p.y, "#d8cfb8", 16, 260);
      }
      p.dash = null;
    }
  } else if (!locked && len > 0) {
    const sp = moveSpeedNow(p);
    p.x += mx * sp * dt;
    p.y += my * sp * dt;
    p.moving = true;
  } else {
    p.moving = false;
  }

  // Kollision (beim Sprung in der Luft nicht)
  if (!p.dash?.leap) {
    for (const o of g.obstacles) {
      const rr = o.r + p.r * 0.8;
      const dx = p.x - o.x, dy = p.y - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      p.x = o.x + (dx / d) * rr; p.y = o.y + (dy / d) * rr;
    }
    for (const w of g.walls) {
      const dd = distToSegment(p.x, p.y, w.x1, w.y1, w.x2, w.y2);
      const lim = w.w / 2 + p.r * 0.8;
      if (dd >= lim) continue;
      const vx = w.x2 - w.x1, vy = w.y2 - w.y1;
      const l = Math.hypot(vx, vy) || 1;
      let nx = -vy / l, ny = vx / l;
      if ((p.x - w.x1) * nx + (p.y - w.y1) * ny < 0) { nx = -nx; ny = -ny; }
      p.x += nx * (lim - dd); p.y += ny * (lim - dd);
    }
  }
  p.x = clamp(p.x, p.r, g.world.w - p.r);
  p.y = clamp(p.y, p.r, g.world.h - p.r);

  // Abklingzeiten (eine Ladung nach der anderen)
  for (const slot of SLOTS) {
    const cd = p.cds[slot];
    const max = maxCharges(p, kit, slot);
    if (cd.charges > max) cd.charges = max;
    if (cd.charges < max) {
      cd.t += dt;
      const need = cooldownOf(p, kit, slot);
      if (cd.t >= need) { cd.t -= need; cd.charges++; }
    } else cd.t = 0;
  }
  if (p.equipCd > 0) p.equipCd -= dt;

  // Fähigkeiten
  const canAct = !locked && g.inputEnabled;
  p.primaryT -= dt;
  if (canAct && h.primary && p.primaryT <= 0 && !p.barrage) {
    firePrimary(g);
    p.primaryT = 1 / (kit.abilities.primary.rate * attackSpeedNow(p));
  }
  for (const slot of SLOTS) {
    if (!canAct || !h[slot]) continue;
    const cd = p.cds[slot];
    if (cd.charges <= 0) continue;
    if (slot === "utility" && p.dash) continue;
    cd.charges--;
    castAbility(g, slot);
    // Magmaherz: Bewegungsfähigkeit lässt Lava am Startpunkt (Sprints/Sprünge ziehen zusätzlich eine Spur, abilities.js)
    if (slot === "utility" && p.items.magmaherz) dropLava(g, p);
  }
  if (canAct && input.pressed.equipment && p.equipment && p.equipCd <= 0) {
    if (activateEquipment(g)) p.equipCd = EQUIPMENT[p.equipment].cd * p.stats.cdMult;
  }

  updateAbilityEffects(g, dt);
}
