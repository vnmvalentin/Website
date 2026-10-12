// engine/combat.js — Schaden in beide Richtungen, Gegnertod mit Beute, Telegraphen (hazards) und Flächen (zones).
//
// Telegraphen sind das Herz der Bosskämpfe: jede gefährliche Fläche wird erst sichtbar angekündigt (delay) und richtet
// dann einmalig Schaden an. So ist jeder Treffer ausweichbar. Zonen (Säure, Feuer, Giftwolke) bleiben liegen und
// ticken. friendly = trifft Gegner statt Spieler.

import { dist, dist2, distToSegment, clamp } from "./util.js";
import { floatText, burst, ring, shake } from "./fx.js";
import { onHitProcs, onKillProcs, onPlayerHurtProcs } from "./procs.js";
import { grantXp, dropGold } from "./loot.js";
import { onBossKilled } from "./stage.js";
import { spawnEnemy, hasAffix } from "./enemies.js";
import { spawnItem, rollItem } from "./loot.js";
import { ENEMIES, ELITE_AFFIXES } from "../data/enemies.js";

// Wer hat getroffen? Für "Getötet von …" auf dem Endbildschirm
export function describeAttacker(e) {
  if (!e) return null;
  return {
    name: e.isBoss ? e.name : ENEMIES[e.type]?.name ?? e.name,
    affixes: (e.affixes || []).map((a) => ELITE_AFFIXES[a]?.name).filter(Boolean),
    boss: !!e.isBoss, champion: !!e.champion,
  };
}

const ARMOR_K = 100;

// ── Spieler → Gegner ────────────────────────────────────────────────────────
export function damageEnemy(g, e, amount, opts = {}) {
  if (!e || e.dead || e.invuln || amount <= 0) return 0;
  const p = g.player;
  const proc = opts.proc ?? 1;
  let dmg = amount;
  let crit = false;
  if (opts.canCrit !== false && g.rng.chance(p.stats.critChance)) {
    crit = true;
    dmg *= p.stats.critMult;
  }
  if (e.isBoss || e.elite) dmg *= p.stats.bossDamage;
  // Glückspilz: Krits werfen Gold ab
  if (crit && p.items.glueckspilz && proc > 0 && g.rng.chance(0.3 * proc)) { p.gold += Math.max(1, Math.round(p.items.glueckspilz * g.coeff)); g.stats.goldCollected += 1; }
  if (e.damageTakenMult) dmg *= e.damageTakenMult;

  e.hp -= dmg;
  e.flash = 0.08;
  e.aggro = true;
  g.stats.damageDealt += dmg;

  if (!opts.silent) {
    const color = opts.color || (crit ? "#ffd84a" : "#ffffff");
    floatText(g, e.x, e.y - e.r - 6, Math.round(dmg), color, { size: crit ? 19 : opts.small ? 12 : 15, dmg: true });
    if (proc > 0) g.fx.sfx[crit ? "crit" : "hit"]++;
  }
  if (opts.knockback && !e.isBoss && e.ai !== "turret") {
    const a = Math.atan2(e.y - (opts.fromY ?? p.y), e.x - (opts.fromX ?? p.x));
    e.kbx += Math.cos(a) * opts.knockback;
    e.kby += Math.sin(a) * opts.knockback;
  }

  if (proc > 0) {
    if (p.stats.lifeOnHit > 0) healPlayer(g, p.stats.lifeOnHit * proc, true);
    if (crit && p.items.blutpakt) healPlayer(g, p.stats.maxHp * 0.02 * p.items.blutpakt * proc, true);
    onHitProcs(g, e, proc, opts);
  }
  if (e.hp <= 0) killEnemy(g, e);
  return dmg;
}

export function killEnemy(g, e) {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  g.fx.sfx.kill++;
  burst(g, e.x, e.y, e.elite ? "#ffd84a" : "#b8b0a0", e.isBoss ? 40 : 10, e.isBoss ? 320 : 170);
  if (e.isBoss) {
    onBossKilled(g, e);
    return;
  }
  if (!e.isMinion) g.stats.kills++;
  if (e.isEgg) return;
  // Fluch: +50 % Beute; Blutmond: viele Gegner, dafür nur 60 % Gold/Erfahrung pro Kill
  const reward = (e.reward ?? 0) * (g.curse ? 1.5 : 1) * (g.horde?.blood > 0 ? 0.6 : 1);
  if (reward > 0) {
    grantXp(g, reward * 0.35 * g.coeff);
    dropGold(g, e.x, e.y, reward * 0.18 * g.coeff);
  }
  if (hasAffix(e, "eis")) {
    addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 130, delay: 0.9, dmg: e.dmg * 1.2, effect: "freeze", color: "#7fd6ff", src: e });
  }
  if (hasAffix(e, "teilend")) {
    for (const s of [-1, 1]) {
      const c = spawnEnemy(g, e.type, e.x + s * e.r, e.y, { split: true });
      if (c) { c.kbx = s * 300; c.spawnT = 0.25; }
    }
  }
  if (e.champion) {
    g.stats.champions = (g.stats.champions || 0) + 1;
    spawnItem(g, e.x, e.y, rollItem(g, { uncommon: 88, legendary: 12 }));
    ring(g, e.x, e.y, 200, "#f5cf4a", 0.6);
    shake(g, 10);
    g.events.push({ type: "championDead", name: e.name });
  }
  onKillProcs(g, e);
}

// ── Gegner → Spieler ────────────────────────────────────────────────────────
export function hurtPlayer(g, amount, opts = {}) {
  const p = g.player;
  if (!p.alive || g.over) return false;
  if (p.buffs.invuln > 0 || p.dash?.invuln) return false;
  if (!opts.unavoidable && p.stats.dodge > 0 && g.rng.chance(p.stats.dodge)) {
    floatText(g, p.x, p.y - 34, "Ausgewichen", "#9ad1ff", { size: 13 });
    return false;
  }
  // Schwarzer Schild: alle 8/n Sekunden einen Treffer komplett abfangen
  if (p.items.schwarzschild && g.time >= (p.blockReadyT ?? 0)) {
    p.blockReadyT = g.time + 8 / p.items.schwarzschild;
    floatText(g, p.x, p.y - 34, "Geblockt", "#c9c3d1", { size: 14 });
    ring(g, p.x, p.y, 44, "#c9c3d1", 0.3);
    return false;
  }
  let dmg = amount;
  if (p.buffs.guard > 0) dmg *= 0.5;
  const armor = p.stats.armor;
  dmg *= armor >= 0 ? ARMOR_K / (ARMOR_K + armor) : 2 - ARMOR_K / (ARMOR_K - armor);

  // Kettenhemd: fester Abzug pro Treffer (ein Treffer macht immer mindestens 1)
  if (p.items.kettenhemd) dmg = Math.max(Math.min(dmg, 1), dmg - 3 * p.items.kettenhemd);

  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, dmg);
    p.shield -= absorbed;
    dmg -= absorbed;
  }
  p.hp -= dmg;
  p.lastHurt = g.time;
  p.hurtFlash = 0.15;
  g.stats.damageTaken += dmg;
  g.fx.sfx.hurt++;
  if (dmg >= 1) floatText(g, p.x, p.y - 34, Math.round(dmg), "#ff5a4a", { size: 16 });
  const src = opts.source ?? g.curAttacker;
  if (src) g.lastHit = describeAttacker(src);
  // Erste Hilfe: unter 25 % einmal kräftig heilen, dann Abklingzeit
  if (p.items.erstehilfe && p.hp > 0 && p.hp < p.stats.maxHp * 0.25 && g.time >= (p.firstAidT ?? -1)) {
    p.firstAidT = g.time + 60 / (1 + 0.5 * (p.items.erstehilfe - 1));
    healPlayer(g, p.stats.maxHp * 0.3);
    ring(g, p.x, p.y, 90, "#7be06b", 0.5);
  }
  shake(g, Math.min(10, 3 + (dmg / p.stats.maxHp) * 30));

  applyStatus(g, opts.effect);
  onPlayerHurtProcs(g);

  if (p.hp <= 0) {
    if (p.items.phoenixfeder > 0) {
      p.items.phoenixfeder--;
      if (p.items.phoenixfeder <= 0) delete p.items.phoenixfeder;
      p.hp = p.stats.maxHp;
      p.buffs.invuln = 2.5;
      floatText(g, p.x, p.y - 50, "Wiedergeboren!", "#ff9a3c", { size: 22, life: 1.6 });
      ring(g, p.x, p.y, 260, "#ff9a3c", 0.6);
      g.events.push({ type: "itemsChanged" });
      return true;
    }
    p.hp = 0;
    p.alive = false;
    g.over = true;
    g.deathCause = g.lastHit || null;
    g.events.push({ type: "gameOver" });
  }
  return true;
}

export function applyStatus(g, effect) {
  const st = g.player.status;
  switch (effect) {
    case "poison": st.poisonT = 4; st.poisonDps = Math.max(st.poisonDps, 2 + g.coeff * 1.5); break;
    case "burn": st.burnT = 3; st.burnDps = Math.max(st.burnDps, 3 + g.coeff * 2); break;
    case "freeze": st.freezeT = Math.max(st.freezeT, 0.6); break;
    case "web": st.slowT = Math.max(st.slowT, 1.5); st.slowPct = Math.max(st.slowPct, 0.5); break;
    case "slow": st.slowT = Math.max(st.slowT, 1.5); st.slowPct = Math.max(st.slowPct, 0.35); break;
    case "stun": st.stunT = Math.max(st.stunT, 0.5); break;
    default: break;
  }
}

export function healPlayer(g, amount, silent = false) {
  const p = g.player;
  if (!p.alive || amount <= 0) return;
  const before = p.hp;
  p.hp = Math.min(p.stats.maxHp, p.hp + amount);
  const healed = p.hp - before;
  if (!silent && healed >= 1) floatText(g, p.x, p.y - 40, `+${Math.round(healed)}`, "#7be06b");
}

// ── Telegraphen ─────────────────────────────────────────────────────────────
// shape circle {x,y,r} · line {x,y,x2,y2,w} · ring {x,y,r,rIn}
export function addHazard(g, h) {
  g.hazards.push({ t: 0, maxDelay: h.delay, color: "#ff4a3a", src: h.friendly ? null : g.curAttacker, ...h });
}

function insideHazard(h, x, y, r) {
  if (h.shape === "circle") return dist2(x, y, h.x, h.y) < (h.r + r) * (h.r + r);
  if (h.shape === "line") return distToSegment(x, y, h.x, h.y, h.x2, h.y2) < h.w / 2 + r;
  if (h.shape === "ring") { const d = dist(x, y, h.x, h.y); return d < h.r + r && d > h.rIn - r; }
  return false;
}

export function updateHazards(g, dt) {
  const p = g.player;
  const keep = [];
  for (const h of g.hazards) {
    // Angriffe normaler Gegner verfallen, wenn der Angreifer vorher stirbt; Explodierer tragen ihren Kreis mit sich
    const ref = h.follow ?? h.owner;
    if (ref !== undefined) {
      const o = g.enemies.find((e) => e.uid === ref);
      if (!o || o.dead) continue;
      if (h.follow !== undefined) { h.x = o.x; h.y = o.y; }
    }
    h.delay -= dt;
    h.t += dt;
    if (h.delay > 0) { keep.push(h); continue; }
    // auslösen
    if (h.friendly) {
      for (const e of g.enemies) {
        if (!e.dead && insideHazard(h, e.x, e.y, e.r)) {
          damageEnemy(g, e, h.dmg, { proc: h.proc ?? 0.5, knockback: h.knockback, fromX: h.x, fromY: h.y });
          if (h.effect === "freeze" && !e.isBoss) e.freezeT = Math.max(e.freezeT, 1.5);
          if (h.effect === "burn") { e.burnT = 3; e.burnDps = Math.max(e.burnDps, h.dmg * 0.15); }
        }
      }
    } else if (h.dmg > 0 && p.alive && insideHazard(h, p.x, p.y, p.r * 0.8)) {
      hurtPlayer(g, h.dmg, { effect: h.effect, source: h.src });
    }
    if (h.onResolve) h.onResolve(g, h);
    if (h.shape === "circle") ring(g, h.x, h.y, h.r, h.impactColor || h.color, 0.3);
    if (h.shake) shake(g, h.shake);
  }
  g.hazards = keep;
}

// ── Flächen ─────────────────────────────────────────────────────────────────
export function addZone(g, z) {
  g.zones.push({ tickT: 0, tick: 0.5, src: z.friendly ? null : g.curAttacker, ...z });
}

export function updateZones(g, dt) {
  const p = g.player;
  for (const z of g.zones) {
    z.t -= dt;
    z.tickT -= dt;
    // Seuchenkessel: Pfütze kriecht zum nächsten Gegner
    if (z.seek) {
      const e = nearestEnemy(g, z.x, z.y, 500);
      if (e) { const a = Math.atan2(e.y - z.y, e.x - z.x); z.x += Math.cos(a) * z.seek * dt; z.y += Math.sin(a) * z.seek * dt; }
    }
    if (z.tickT > 0) continue;
    z.tickT = z.tick;
    if (z.friendly) {
      for (const e of g.enemies) {
        if (e.dead || dist2(e.x, e.y, z.x, z.y) > (z.r + e.r) * (z.r + e.r)) continue;
        damageEnemy(g, e, z.dmg, { proc: 0.2, canCrit: false, color: z.textColor || "#b7f06b" });
        if (z.effect === "poison") addPoison(e, z.dmg * 0.5, 2);
        if (z.effect === "slow" && !e.isBoss) { e.slowT = Math.max(e.slowT, 0.6); e.slowPct = Math.max(e.slowPct, 0.4); }
      }
    } else if (p.alive && dist2(p.x, p.y, z.x, z.y) < z.r * z.r) {
      hurtPlayer(g, z.dmg, { effect: z.effect, unavoidable: true, source: z.src });
    }
  }
  g.zones = g.zones.filter((z) => z.t > 0);
}

export function addPoison(e, dps, dur) {
  if (!e.poison) e.poison = [];
  if (e.poison.length >= 12) e.poison.shift();
  e.poison.push({ dps, t: dur });
}

// Zustände der Gegner ticken (Brand, Gift, Frost) — läuft einmal pro Gegner und Tick
export function tickEnemyStatus(g, e, dt) {
  e.flash = Math.max(0, e.flash - dt);
  if (e.freezeT > 0) e.freezeT -= dt;
  if (e.slowT > 0) e.slowT -= dt; else e.slowPct = 0;
  e.dotT = (e.dotT || 0) - dt;
  if (e.dotT > 0) return;
  e.dotT = 0.5;
  let dot = 0;
  if (e.burnT > 0) { e.burnT -= 0.5; dot += e.burnDps * 0.5; }
  if (e.poison?.length) {
    for (const s of e.poison) { s.t -= 0.5; dot += s.dps * 0.5; }
    e.poison = e.poison.filter((s) => s.t > 0);
  }
  if (dot > 0) damageEnemy(g, e, dot, { proc: 0, canCrit: false, color: e.burnT > 0 ? "#ff9a3c" : "#9be05a" });
}

export function enemiesNear(g, x, y, r) {
  const out = [];
  for (const e of g.enemies) {
    if (!e.dead && dist2(x, y, e.x, e.y) < (r + e.r) * (r + e.r)) out.push(e);
  }
  return out;
}

export function nearestEnemy(g, x, y, maxR = Infinity, exclude = null) {
  let best = null;
  let bd = maxR * maxR;
  for (const e of g.enemies) {
    if (e.dead || e.invuln || e === exclude || (exclude instanceof Set && exclude.has(e))) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export const armorReduction = (armor) => clamp(armor / (ARMOR_K + Math.max(0, armor)), 0, 0.95);
