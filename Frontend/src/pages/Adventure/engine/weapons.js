// engine/weapons.js — die automatischen Waffen aus dem Stufenaufstieg. Jede Waffe hat einen eigenen Zähler in
// p.weaponState[id]; ist er abgelaufen und ein Ziel in Reichweite, löst sie aus. Ohne Ziel wartet sie (der Zähler bleibt
// bei 0), damit die erste Salve sofort kommt, wenn ein Gegner auftaucht. Werte pro Stufe stehen in data/weapons.js.
//
// proc ist bewusst klein (0,2–0,35): Waffen sollen Item-Effekte auslösen können, aber nicht jeden Treffer verdoppeln.

import { WEAPONS } from "../data/weapons.js";
import { spawnPlayerBullet } from "./projectiles.js";
import { damageEnemy, enemiesNear, addHazard, healPlayer } from "./combat.js";
import { lightning, ring, slash, burst } from "./fx.js";
import { dist2, clamp } from "./util.js";

export const weaponLevel = (p, id) => WEAPONS[id]?.levels[(p.weapons[id] || 1) - 1];

// Gegner im Umkreis, nächste zuerst (nur kämpfende — Lager-Gegner werden nicht von selbst angegriffen)
function targetsNear(g, x, y, range) {
  const out = [];
  for (const e of g.enemies) {
    if (e.dead || e.invuln || !e.aggro) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < range * range) out.push({ e, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.map((o) => o.e);
}

function randomTargets(g, x, y, range, n) {
  const list = targetsNear(g, x, y, range);
  const picked = [];
  while (picked.length < n && list.length) picked.push(list.splice(Math.floor(g.rng.next() * list.length), 1)[0]);
  return picked;
}

const FIRE = {
  dolche(g, l, count) {
    const p = g.player;
    const targets = targetsNear(g, p.x, p.y, 640);
    if (!targets.length) return false;
    for (let i = 0; i < count; i++) {
      const t = targets[i % targets.length];
      const spread = i >= targets.length ? (i - targets.length + 1) * 0.16 * (i % 2 ? 1 : -1) : 0;
      const a = Math.atan2(t.y - p.y, t.x - p.x) + spread;
      spawnPlayerBullet(g, { x: p.x, y: p.y - 6, angle: a, speed: 900, range: 700, dmg: p.stats.damage * l.mult, look: "dagger", r: 7, pierce: l.pierce, proc: 0.35 });
    }
    return true;
  },

  donnerkeil(g, l, count) {
    const p = g.player;
    const hits = randomTargets(g, p.x, p.y, 560, count);
    if (!hits.length) return false;
    const r = l.r * p.stats.area;
    for (const e of hits) {
      lightning(g, [{ x: e.x + 10, y: e.y - 460 }, { x: e.x - 16, y: e.y - 300 }, { x: e.x + 12, y: e.y - 140 }, { x: e.x, y: e.y }], "#fff3a0", 0.22);
      for (const o of enemiesNear(g, e.x, e.y, r)) {
        damageEnemy(g, o, p.stats.damage * l.mult, { proc: 0.3 });
        if (l.stun && !o.isBoss && !o.dead) o.freezeT = Math.max(o.freezeT, 0.35);
      }
      ring(g, e.x, e.y, r, "#ffe14d", 0.25);
    }
    return true;
  },

  bumerang(g, l, count) {
    const p = g.player;
    const t = targetsNear(g, p.x, p.y, l.r * 1.3)[0];
    if (!t) return false;
    const base = Math.atan2(t.y - p.y, t.x - p.x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.42;
      spawnPlayerBullet(g, { x: p.x, y: p.y - 6, angle: a, speed: 640, range: 99999, dmg: p.stats.damage * l.mult, kind: "boomerang", look: "boomerang", r: 13 * Math.sqrt(p.stats.area), pierce: 999, proc: 0.3, maxDist: l.r });
    }
    return true;
  },

  saeure(g, l, count) {
    const p = g.player;
    const hits = randomTargets(g, p.x, p.y, 600, count);
    if (!hits.length) return false;
    for (const e of hits) {
      const tx = clamp(e.x, 30, g.world.w - 30), ty = clamp(e.y, 30, g.world.h - 30);
      spawnPlayerBullet(g, { x: p.x, y: p.y - 6, angle: Math.atan2(ty - p.y, tx - p.x), speed: 560, range: 1400, dmg: p.stats.damage * l.mult, kind: "flask", sprite: "proj_poisonball", tx, ty, r: 8, spin: 10, proc: 0,
        zone: { r: l.r * p.stats.area, t: l.dur, seek: l.seek || 0 } });
    }
    return true;
  },

  peitsche(g, l) {
    const p = g.player;
    const len = l.len * p.stats.area;
    const half = 34 * Math.sqrt(p.stats.area);
    const front = p.facing > 0 ? 0 : Math.PI;
    const angles = l.four ? [0, Math.PI, Math.PI / 2, -Math.PI / 2] : l.both ? [front, front + Math.PI] : [front];
    if (!targetsNear(g, p.x, p.y, len + 40).length) return false;
    const oy = p.y - 8;
    for (const a of angles) {
      slash(g, p.x, oy, a, len, half);
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const e of g.enemies) {
        if (e.dead || e.invuln) continue;
        // in das Koordinatensystem des Hiebs drehen: along = entlang, across = quer dazu
        const along = (e.x - p.x) * ca + (e.y - oy) * sa;
        const across = -(e.x - p.x) * sa + (e.y - oy) * ca;
        if (along < -e.r || along > len + e.r || Math.abs(across) > half + e.r) continue;
        damageEnemy(g, e, p.stats.damage * l.mult, { proc: 0.35, knockback: 140 });
      }
    }
    return true;
  },

  schockwelle(g, l) {
    const p = g.player;
    const r = l.r * p.stats.area;
    if (!targetsNear(g, p.x, p.y, r + 30).length) return false;
    pulse(g, l, r);
    if (l.twice) p.weaponState.schockwelle.echo = 0.35;
    // Erdbeben: betäubt und lässt Felsen auf zufällige Gegner fallen
    if (l.stun) for (const e of enemiesNear(g, p.x, p.y, r)) if (!e.isBoss && !e.dead) e.freezeT = Math.max(e.freezeT, l.stun);
    if (l.rocks) {
      for (const e of randomTargets(g, p.x, p.y, 650, l.rocks)) {
        addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 85 * Math.sqrt(p.stats.area), delay: 0.6, dmg: p.stats.damage * l.mult * 1.2, friendly: true, proc: 0, boulder: true, color: "#d8a050", shake: 3 });
      }
    }
    return true;
  },
};
// Evolutionen, die das Verhalten ihrer Grundwaffe mit stärkeren Werten nutzen
FIRE.tausendklingen = FIRE.dolche;
FIRE.gewittersturm = FIRE.donnerkeil;
FIRE.seuchenkessel = FIRE.saeure;
FIRE.drachenschweif = FIRE.peitsche;
FIRE.erdbeben = FIRE.schockwelle;
const ORBITS = { feuerkugeln: true, sonnenkranz: true, kriegsrad: true };
const AURAS = { glutaura: true, hoellenherz: true };

function pulse(g, l, r) {
  const p = g.player;
  ring(g, p.x, p.y, r, "#9ad1ff", 0.4);
  burst(g, p.x, p.y, "#cfe8ff", 14, r * 1.6, 0.3, 3);
  for (const e of enemiesNear(g, p.x, p.y, r)) damageEnemy(g, e, p.stats.damage * l.mult, { proc: 0.3, knockback: 520 });
}

export function updateWeapons(g, dt) {
  const p = g.player;
  if (!p.alive) return;
  for (const id of p.weaponOrder) {
    const lvl = p.weapons[id];
    const def = WEAPONS[id];
    if (!lvl || !def) continue;
    const l = def.levels[lvl - 1];
    const st = p.weaponState[id] || (p.weaponState[id] = { t: 0 });
    const count = (l.count || 1) + p.stats.weaponCount;

    if (ORBITS[id]) { updateOrbs(g, dt, l, count, st, id === "kriegsrad"); continue; }
    if (AURAS[id]) { updateAura(g, dt, l, st); continue; }
    if (st.echo > 0) {
      st.echo -= dt;
      if (st.echo <= 0) pulse(g, l, l.r * p.stats.area * 1.15);
    }

    st.t -= dt;
    if (st.t > 0) continue;
    if (FIRE[id](g, l, count)) {
      st.t = l.cd * p.stats.weaponCd;
      // Zwillingsstein: manchmal gleich noch eine Salve
      if (p.items.zwilling && g.rng.chance(Math.min(0.6, 0.12 * p.items.zwilling))) FIRE[id](g, l, count);
    } else st.t = 0.15; // kein Ziel: gleich wieder nachsehen
  }
}

// Kreisende Waffen (Feuerkugeln, Sonnenkranz, Kriegsrad): jede trifft denselben Gegner höchstens alle 0,5 s
function updateOrbs(g, dt, l, count, st, wheel) {
  const p = g.player;
  st.angle = (st.angle || 0) + dt * (wheel ? 3.4 : 2.7);
  st.hits = st.hits || new Map();
  const R = l.r * p.stats.area;
  const hitR = (wheel ? 26 : 18) * Math.sqrt(p.stats.area);
  st.orbs = [];
  for (let i = 0; i < count; i++) {
    const a = st.angle + (Math.PI * 2 * i) / count;
    const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
    st.orbs.push({ x: ox, y: oy });
    for (const e of enemiesNear(g, ox, oy, hitR)) {
      const key = `${e.uid}:${i}`;
      if ((st.hits.get(key) || 0) > g.time) continue;
      st.hits.set(key, g.time + 0.5);
      damageEnemy(g, e, p.stats.damage * l.mult, { proc: 0.25, knockback: wheel ? 260 : 0, fromX: p.x, fromY: p.y });
      if (l.burn && !e.dead) { e.burnT = Math.max(e.burnT, 2); e.burnDps = Math.max(e.burnDps, p.stats.damage * l.burn); }
      if (l.blast) addHazard(g, { shape: "circle", x: ox, y: oy, r: 70 * Math.sqrt(p.stats.area), delay: 0, dmg: p.stats.damage * l.blast, friendly: true, proc: 0, color: "#ffb04a" });
    }
  }
  if (st.hits.size > 500) st.hits.clear();
}

// Glutaura: tickt alle 0,5 s alles im Radius an (ohne Schadenszahlen — bei vielen Gegnern wäre das nur Rauschen)
function updateAura(g, dt, l, st) {
  const p = g.player;
  st.r = l.r * p.stats.area;
  st.t -= dt;
  if (st.t > 0) return;
  st.t = 0.5 * p.stats.weaponCd;
  let hits = 0;
  for (const e of enemiesNear(g, p.x, p.y, st.r)) {
    damageEnemy(g, e, p.stats.damage * l.mult, { proc: 0.15, color: "#ff9a5a", small: true });
    hits++;
    if (l.slow && !e.isBoss && !e.dead) { e.slowT = Math.max(e.slowT, 0.6); e.slowPct = Math.max(e.slowPct, l.slow); }
  }
  // Höllenherz: heilt pro getroffenem Gegner, höchstens 3 % pro Tick
  if (l.leech && hits) healPlayer(g, p.stats.maxHp * Math.min(0.03, hits * l.leech), true);
}
