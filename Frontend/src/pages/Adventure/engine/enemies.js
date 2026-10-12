// engine/enemies.js — Gegner erzeugen und steuern. Jede gefährliche Aktion ist vorher erkennbar: Brutalos holen sichtbar
// aus (Kreis am Boden), Stürmer zeigen ihre Bahn, Explodierer leuchten vor der Detonation.

import { ENEMIES, ELITE_AFFIX_IDS, ELITE_AFFIXES } from "../data/enemies.js";
import { enemyHpMult, enemyDmgMult } from "./difficulty.js";
import { hurtPlayer, addHazard, addZone, killEnemy, tickEnemyStatus } from "./combat.js";
import { spawnEnemyBullet } from "./projectiles.js";
import { lightning, floatText, burst } from "./fx.js";
import { updateBoss, spiderQueen } from "./bosses/index.js";
import { dist, dist2, distToSegment, clamp } from "./util.js";
import { ascEnemyHp } from "./ascension.js";

export function spawnEnemy(g, id, x, y, opts = {}) {
  const def = ENEMIES[id];
  if (!def) return null;
  const hpMult = enemyHpMult(g.coeff);
  const dmgMult = enemyDmgMult(g.coeff, g.difficulty);
  const elite = opts.elite || null;
  // Eigenschaften als Liste: Elite haben eine, Champions zwei (elite = die erste, bestimmt die Farbe)
  const affixes = elite ? [elite, ...(opts.elite2 && opts.elite2 !== elite ? [opts.elite2] : [])] : [];
  let hp = def.hp * hpMult;
  let dmg = def.dmg * dmgMult;
  let r = def.r;
  let reward = def.cost;
  let speed = def.speed * (elite ? 1.08 : 1);
  if (elite) { hp *= 4; dmg *= 2; r *= 1.2; reward *= 4; }
  if (affixes.includes("hastig")) { hp *= 0.5; speed *= 1.7; }
  if (opts.champion) { hp *= 3; dmg *= 1.2; r *= 1.35; reward *= 3; }
  if (opts.minion) { hp *= 0.6; reward *= 0.3; }
  if (opts.split) { hp *= 0.35; r *= 0.75; reward *= 0.25; }
  if (g.curse) { hp *= 1.3; dmg *= 1.2; } // Fluchschrein aktiv
  hp *= ascEnemyHp(g);
  const e = {
    uid: g.nextUid++, type: id, name: opts.champion ? `Champion: ${def.name}` : def.name, ai: def.ai,
    x, y, r, hp, maxHp: hp, dmg, speed,
    elite, affixes, champion: !!opts.champion, isMinion: !!opts.minion || !!opts.split, aggro: opts.aggro ?? true, home: { x, y }, campId: opts.campId ?? null, groupId: opts.groupId ?? null,
    state: "move", t: 0, atkCd: g.rng.range(0.4, def.fireEvery || 1.5), contactCd: 0, affixT: {},
    kbx: 0, kby: 0, slowT: 0, slowPct: 0, freezeT: 0, burnT: 0, burnDps: 0, poison: [], flash: 0,
    reward, facing: 1, moving: false, attackAnimT: 9, spawnT: 0, flying: !!def.flying, hidden: false,
  };
  g.enemies.push(e);
  return e;
}

export function pickElite(g, not = null) {
  return g.rng.pick(ELITE_AFFIX_IDS.filter((a) => a !== not));
}

export const hasAffix = (e, id) => !!e.affixes?.includes(id);

// Freier Platz in einem Ring um (cx, cy), innerhalb der Welt, nicht in einem Hindernis
export function findSpawnPoint(g, cx, cy, minR, maxR, r = 24) {
  for (let i = 0; i < 24; i++) {
    const a = g.rng.range(0, Math.PI * 2);
    const d = g.rng.range(minR, maxR);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    if (x < 60 || y < 60 || x > g.world.w - 60 || y > g.world.h - 60) continue;
    if (g.obstacles.some((o) => dist2(x, y, o.x, o.y) < (o.r + r + 10) * (o.r + r + 10))) continue;
    return { x, y };
  }
  return null;
}

function targetOf(g) {
  const decoy = g.allies.find((a) => a.kind === "decoy" && a.hp > 0);
  return decoy || g.player;
}

function contact(g, e, mult = 1) {
  const p = g.player;
  if (e.contactCd > 0 || !p.alive || e.hidden) return;
  const rr = e.r + p.r - 4;
  if (dist2(e.x, e.y, p.x, p.y) > rr * rr) return;
  e.contactCd = 1;
  e.attackAnimT = 0;
  if (hurtPlayer(g, e.dmg * mult, { effect: affixEffect(e), source: e }) && hasAffix(e, "vampir")) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1);
}

function affixEffect(e) {
  if (ENEMIES[e.type]?.effect && e.ai === "chase") return ENEMIES[e.type].effect; // z. B. Zombie: verlangsamt
  if (hasAffix(e, "eis")) return "slow";
  if (hasAffix(e, "gift")) return "poison";
  if (hasAffix(e, "feuer")) return "burn";
  return null;
}

function moveToward(e, tx, ty, speed, dt) {
  const a = Math.atan2(ty - e.y, tx - e.x);
  e.vx += Math.cos(a) * speed;
  e.vy += Math.sin(a) * speed;
  e.facing = tx < e.x ? -1 : 1;
  void dt;
}

function updateAi(g, e, dt) {
  const p = g.player;
  const tgt = targetOf(g);
  const d = dist(e.x, e.y, tgt.x, tgt.y);
  const ang = Math.atan2(tgt.y - e.y, tgt.x - e.x);
  const def = ENEMIES[e.type];
  const sp = e.speed;
  e.atkCd -= dt;
  e.t += dt;

  switch (e.ai) {
    case "chase":
      moveToward(e, tgt.x, tgt.y, sp, dt);
      break;

    case "brute":
      if (e.state === "move") {
        if (d > def.reach + tgt.r * 0.5) moveToward(e, tgt.x, tgt.y, sp, dt);
        else if (e.atkCd <= 0) {
          e.state = "windup"; e.t = 0; e.attackAnimT = 0;
          const hx = e.x + Math.cos(ang) * def.reach * 0.55;
          const hy = e.y + Math.sin(ang) * def.reach * 0.55;
          addHazard(g, { shape: "circle", x: hx, y: hy, r: def.reach * 0.8, delay: 0.7, dmg: e.dmg * 1.4, effect: affixEffect(e), owner: e.uid });
          e.facing = tgt.x < e.x ? -1 : 1;
        }
      } else if (e.state === "windup" && e.t > 0.75) { e.state = "recover"; e.t = 0; }
      else if (e.state === "recover" && e.t > 0.5) { e.state = "move"; e.atkCd = 1.2; }
      break;

    case "ranged": {
      const keep = def.keep;
      if (d > keep + 40) moveToward(e, tgt.x, tgt.y, sp, dt);
      else if (d < keep - 90) moveToward(e, e.x - Math.cos(ang) * 100, e.y - Math.sin(ang) * 100, sp * 0.8, dt);
      e.facing = tgt.x < e.x ? -1 : 1;
      if (e.atkCd <= 0 && d < keep + 260) {
        e.atkCd = def.fireEvery * g.rng.range(0.85, 1.15);
        e.attackAnimT = 0;
        spawnEnemyBullet(g, { x: e.x, y: e.y, angle: ang, speed: def.projSpeed, dmg: e.dmg, sprite: def.proj, effect: def.effect || affixEffect(e), life: (keep + 400) / def.projSpeed, r: 8 });
      }
      break;
    }

    case "charger":
      if (e.state === "move") {
        if (d > def.chargeDist * 0.85) moveToward(e, tgt.x, tgt.y, sp, dt);
        else if (e.atkCd <= 0) { e.state = "aim"; e.t = 0; e.aimAngle = ang; e.facing = tgt.x < e.x ? -1 : 1; }
        else moveToward(e, tgt.x, tgt.y, sp * 0.6, dt);
      } else if (e.state === "aim") {
        if (e.t < 0.45) e.aimAngle = ang; // zielt erst, dann ist die Bahn fest
        if (e.t > 0.85) { e.state = "charge"; e.t = 0; e.hitDuringCharge = false; e.attackAnimT = 0; }
      } else if (e.state === "charge") {
        e.vx += Math.cos(e.aimAngle) * def.chargeSpeed;
        e.vy += Math.sin(e.aimAngle) * def.chargeSpeed;
        if (!e.hitDuringCharge && p.alive && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) {
          e.hitDuringCharge = true;
          hurtPlayer(g, e.dmg * 1.5, { effect: affixEffect(e) });
        }
        if (e.t > def.chargeDist / def.chargeSpeed) { e.state = "rest"; e.t = 0; }
      } else if (e.state === "rest" && e.t > 0.8) { e.state = "move"; e.atkCd = 2; }
      break;

    case "exploder":
      if (e.state === "move") {
        moveToward(e, tgt.x, tgt.y, sp, dt);
        if (d < 80) {
          e.state = "fuse"; e.t = 0;
          addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 100, delay: 0.75, dmg: e.dmg * 1.6, effect: "burn", color: "#ff7a2e", follow: e.uid,
            onResolve: (gg) => { if (!e.dead) killEnemy(gg, e); } });
        }
      } else if (e.state === "fuse") {
        moveToward(e, tgt.x, tgt.y, sp * 0.25, dt);
      }
      break;

    case "healer": {
      if (d > 480) moveToward(e, tgt.x, tgt.y, sp, dt);
      else if (d < 330) moveToward(e, e.x - Math.cos(ang) * 100, e.y - Math.sin(ang) * 100, sp, dt);
      if (e.atkCd <= 0) {
        let best = null; let bestPct = 0.95;
        for (const o of g.enemies) {
          if (o === e || o.dead || o.isBoss) continue;
          if (dist2(o.x, o.y, e.x, e.y) > 460 * 460) continue;
          const pct = o.hp / o.maxHp;
          if (pct < bestPct) { bestPct = pct; best = o; }
        }
        if (best) {
          best.hp = Math.min(best.maxHp, best.hp + best.maxHp * 0.3);
          lightning(g, [{ x: e.x, y: e.y }, { x: best.x, y: best.y }], "#8be04e", 0.35);
          floatText(g, best.x, best.y - best.r - 8, "+", "#8be04e", { size: 20 });
          e.attackAnimT = 0;
          e.atkCd = 3;
        } else e.atkCd = 0.5;
      }
      break;
    }

    case "summoner":
      if (d > 340) moveToward(e, tgt.x, tgt.y, sp * 0.8, dt);
      else if (d < 240) moveToward(e, e.x - Math.cos(ang) * 100, e.y - Math.sin(ang) * 100, sp * 0.6, dt);
      if (e.atkCd <= 0) {
        e.atkCd = 2.6;
        e.attackAnimT = 0;
        spawnEnemyBullet(g, { x: e.x, y: e.y, angle: ang, speed: def.projSpeed, dmg: e.dmg, sprite: def.proj, life: 2.5, r: 9 });
      }
      e.summonT = (e.summonT ?? 3) - dt;
      if (e.summonT <= 0) {
        e.summonT = 9;
        const mine = g.enemies.filter((o) => o.summoner === e.uid && !o.dead).length;
        for (let i = 0; i < Math.min(3, 6 - mine); i++) {
          const a = (Math.PI * 2 * i) / 3;
          const m = spawnEnemy(g, "skeletonwarrior", e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, { minion: true });
          if (m) m.summoner = e.uid;
        }
        e.attackAnimT = 0;
      }
      break;

    case "turret":
      e.facing = tgt.x < e.x ? -1 : 1;
      if (e.atkCd <= 0 && d < 720) {
        e.atkCd = def.fireEvery;
        e.attackAnimT = 0;
        for (let i = -1; i <= 1; i++) {
          spawnEnemyBullet(g, { x: e.x, y: e.y, angle: ang + i * 0.22, speed: def.projSpeed, dmg: e.dmg, sprite: def.proj, effect: def.effect, life: 2.6, r: 9 });
        }
      }
      break;

    // Schildträger: das Blocken selbst steht in projectiles.js (shieldBlocks)
    case "shield":
      moveToward(e, tgt.x, tgt.y, sp, dt);
      e.shieldA = ang;
      break;

    // Fledermaus: Wellenlinie quer zur Flugrichtung
    case "swarm": {
      e.phase = (e.phase ?? g.rng.range(0, 6.3)) + dt * 5;
      const side = Math.sin(e.phase) * 140;
      moveToward(e, tgt.x + Math.cos(ang + Math.PI / 2) * side, tgt.y + Math.sin(ang + Math.PI / 2) * side, sp, dt);
      break;
    }

    // Sandwurm: unter der Erde → Ausbruch (vorher sichtbarer Kreis) → kurz oben und angreifbar → wieder runter
    case "burrow":
      if (e.state === "move") { e.state = "under"; e.t = 0; }
      if (e.state === "under") {
        e.hidden = true; e.invuln = true;
        moveToward(e, tgt.x, tgt.y, sp, dt);
        if (d < 50 || e.t > 3.2) {
          e.state = "rise"; e.t = 0;
          addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 95, delay: 0.7, dmg: e.dmg * 1.5, color: "#d8a050", shake: 4, owner: e.uid });
        }
      } else if (e.state === "rise") {
        if (e.t > 0.7) { e.state = "up"; e.t = 0; e.hidden = false; e.invuln = false; e.attackAnimT = 0; burst(g, e.x, e.y, "#c8a46a", 16, 240); }
      } else if (e.state === "up") {
        e.facing = tgt.x < e.x ? -1 : 1;
        if (e.t > 0.6 && !e.spat) {
          e.spat = true; e.attackAnimT = 0;
          for (let i = -2; i <= 2; i++) spawnEnemyBullet(g, { x: e.x, y: e.y - 20, angle: ang + i * 0.25, speed: def.projSpeed, dmg: e.dmg * 0.6, sprite: def.proj, life: 2.2, r: 8 });
        }
        if (e.t > 1.9) { e.state = "under"; e.t = 0; e.spat = false; burst(g, e.x, e.y, "#c8a46a", 10, 180); }
      }
      break;

    // Lawinenbär: zielen (Bahn sichtbar) → rollen und abprallen → benommen
    case "roller":
      if (e.state === "move") {
        if (d > 520) moveToward(e, tgt.x, tgt.y, sp, dt);
        else if (e.atkCd <= 0) { e.state = "aim"; e.t = 0; e.aimAngle = ang; }
        else moveToward(e, tgt.x, tgt.y, sp * 0.5, dt);
      } else if (e.state === "aim") {
        if (e.t < 0.5) e.aimAngle = ang;
        e.facing = Math.cos(e.aimAngle) < 0 ? -1 : 1;
        if (e.t > 0.9) { e.state = "roll"; e.t = 0; e.bounces = 0; e.hitDuringCharge = false; }
      } else if (e.state === "roll") {
        // Abprallen: am Weltrand spiegeln, an Hindernissen an der Flächennormale reflektieren
        const step = def.rollSpeed * dt;
        let vx = Math.cos(e.aimAngle), vy = Math.sin(e.aimAngle);
        const nx = e.x + vx * step, ny = e.y + vy * step;
        let hit = false;
        if (nx < e.r || nx > g.world.w - e.r) { vx = -vx; hit = true; }
        if (ny < e.r || ny > g.world.h - e.r) { vy = -vy; hit = true; }
        for (const o of g.obstacles) {
          if (dist2(nx, ny, o.x, o.y) >= (o.r + e.r) * (o.r + e.r)) continue;
          const n = Math.atan2(ny - o.y, nx - o.x), cx = Math.cos(n), cy = Math.sin(n);
          const dot = vx * cx + vy * cy;
          if (dot < 0) { vx -= 2 * dot * cx; vy -= 2 * dot * cy; hit = true; }
          break;
        }
        if (hit) { e.aimAngle = Math.atan2(vy, vx); e.bounces++; burst(g, e.x, e.y, "#e6f6ff", 8, 160); }
        e.vx += Math.cos(e.aimAngle) * def.rollSpeed;
        e.vy += Math.sin(e.aimAngle) * def.rollSpeed;
        if (!e.hitDuringCharge && p.alive && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) { e.hitDuringCharge = true; hurtPlayer(g, e.dmg * 1.4, { effect: "slow", source: e }); }
        if (e.bounces >= 3 || e.t > 2.4) { e.state = "dizzy"; e.t = 0; }
      } else if (e.state === "dizzy" && e.t > 1.3) { e.state = "move"; e.atkCd = 1.5; }
      break;

    // Mörserkobold: hält Abstand, schießt im Bogen auf deine Position (Einschlag als Kreis angekündigt)
    case "mortar": {
      const keep = def.keep;
      if (d > keep + 60) moveToward(e, tgt.x, tgt.y, sp, dt);
      else if (d < keep - 120) moveToward(e, e.x - Math.cos(ang) * 100, e.y - Math.sin(ang) * 100, sp, dt);
      e.facing = tgt.x < e.x ? -1 : 1;
      if (e.atkCd <= 0 && d < keep + 300) {
        e.atkCd = def.fireEvery * g.rng.range(0.85, 1.15);
        e.attackAnimT = 0;
        const lead = p.moving ? 70 : 0;
        const tx = clamp(tgt.x + Math.cos(p.moveAngle) * lead, 40, g.world.w - 40), ty = clamp(tgt.y + Math.sin(p.moveAngle) * lead, 40, g.world.h - 40);
        addHazard(g, { shape: "circle", x: tx, y: ty, r: 80, delay: 1.3, dmg: e.dmg * 1.3, effect: def.effect, color: "#ff7a2e", lob: { x: e.x, y: e.y - 30 },
          onResolve: (gg, h) => burst(gg, h.x, h.y, "#ff9a3c", 12, 220) });
      }
      break;
    }

    default:
      moveToward(e, tgt.x, tgt.y, sp, dt);
  }

  if ((e.ai !== "charger" || e.state !== "charge") && e.state !== "roll") contact(g, e, e.ai === "brute" ? 0.5 : 1);

  // Elite-Eigenschaften, jede mit eigenem Zähler (ein Champion kann zwei haben)
  for (const a of e.affixes) {
    const t = (e.affixT[a] = (e.affixT[a] ?? g.rng.range(0.5, 2)) - dt);
    if (t > 0) continue;
    switch (a) {
      case "feuer":
        if (!e.moving) { e.affixT[a] = 0.1; break; }
        e.affixT[a] = 0.55;
        addZone(g, { x: e.x, y: e.y, r: 34, t: 3, tick: 0.5, dmg: e.dmg * 0.2, effect: "burn", kind: "fire" });
        break;
      case "blitz": {
        e.affixT[a] = 3.5;
        e.blitzRot = !e.blitzRot;
        const off = e.blitzRot ? Math.PI / 4 : 0;
        for (let i = 0; i < 4; i++) {
          spawnEnemyBullet(g, { x: e.x, y: e.y, angle: off + (Math.PI / 2) * i, speed: 240, dmg: e.dmg * 0.6, sprite: "electric_ball", effect: "stun", life: 3, r: 10 });
        }
        break;
      }
      case "vampir":
        e.affixT[a] = 0.5;
        if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.015);
        break;
      case "beschwoerend": {
        e.affixT[a] = 6;
        const mine = g.enemies.filter((o) => o.summoner === e.uid && !o.dead).length;
        for (let i = 0; i < Math.min(2, 4 - mine); i++) {
          const m = spawnEnemy(g, "skeletonwarrior", e.x + (i ? 50 : -50), e.y + 20, { minion: true });
          if (m) m.summoner = e.uid;
        }
        lightning(g, [{ x: e.x, y: e.y - e.r }, { x: e.x, y: e.y - e.r - 40 }], "#a07bff", 0.3);
        break;
      }
      default:
        e.affixT[a] = 99;
    }
  }
}

// Alle Gegner bewegen: Wunschrichtung + Rückstoß, Abstand zueinander, Hindernisse umgehen
export function updateEnemies(g, dt) {
  const p = g.player;
  for (const e of g.enemies) {
    if (e.dead) continue;
    e.spawnT += dt;
    e.attackAnimT += dt;
    e.contactCd -= dt;
    tickEnemyStatus(g, e, dt);
    if (e.dead) continue;
    e.vx = 0; e.vy = 0;
    g.curAttacker = e; // alles, was dieser Gegner jetzt erzeugt (Geschosse, Telegraphen), weiß, von wem es kommt

    if (e.isEgg) {
      spiderQueen.updateEgg(g, e, dt);
    } else if (e.isBoss) {
      updateBoss(g, e, dt);
    } else if (!e.aggro) {
      // Lager: stehen herum, bis man nah kommt oder sie angreift
      if (dist2(e.x, e.y, p.x, p.y) < 620 * 620) {
        e.aggro = true;
        for (const o of g.enemies) if (o.campId === e.campId && o.campId !== null) o.aggro = true;
      } else {
        e.wanderT = (e.wanderT ?? 0) - dt;
        if (e.wanderT <= 0) { e.wanderT = g.rng.range(1.5, 4); e.wanderA = g.rng.range(0, Math.PI * 2); e.wanderOn = g.rng.chance(0.5); }
        if (e.wanderOn && dist2(e.x, e.y, e.home.x, e.home.y) < 160 * 160) { e.vx = Math.cos(e.wanderA) * e.speed * 0.3; e.vy = Math.sin(e.wanderA) * e.speed * 0.3; }
        else if (e.wanderOn) moveToward(e, e.home.x, e.home.y, e.speed * 0.3, dt);
      }
    } else if (e.freezeT <= 0) {
      updateAi(g, e, dt);
    }

    if (e.freezeT > 0 && !e.isBoss) { e.vx = 0; e.vy = 0; }
    const slow = e.slowT > 0 ? 1 - e.slowPct : 1;
    const mx = e.vx * slow * dt + e.kbx * dt;
    const my = e.vy * slow * dt + e.kby * dt;
    e.moving = Math.abs(mx) + Math.abs(my) > 0.05;
    e.x += mx; e.y += my;
    const kbDecay = Math.exp(-9 * dt);
    e.kbx *= kbDecay; e.kby *= kbDecay;
  }

  g.curAttacker = null;

  // Abstand zueinander (Bosse schieben, werden aber nicht geschoben)
  const list = g.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) * 0.5;
      const nx = dx / d, ny = dy / d;
      if (a.isBoss || a.ai === "turret") { b.x += nx * push * 2; b.y += ny * push * 2; }
      else if (b.isBoss || b.ai === "turret") { a.x -= nx * push * 2; a.y -= ny * push * 2; }
      else { a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; }
    }
  }

  // Hindernisse, Mauern, Weltrand
  for (const e of list) {
    if (e.dead) continue;
    if (!e.flying) {
      for (const o of g.obstacles) {
        const rr = o.r + e.r * 0.8;
        const dx = e.x - o.x, dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        e.x = o.x + nx * rr; e.y = o.y + ny * rr;
        // am Hindernis entlang rutschen, in die Richtung, die näher zum Ziel führt
        const toP = Math.atan2(p.y - e.y, p.x - e.x);
        const tx = -ny, ty = nx;
        const side = Math.cos(toP) * tx + Math.sin(toP) * ty >= 0 ? 1 : -1;
        e.x += tx * side * e.speed * 0.9 * dt;
        e.y += ty * side * e.speed * 0.9 * dt;
      }
      for (const w of g.walls) {
        const dd = distToSegment(e.x, e.y, w.x1, w.y1, w.x2, w.y2);
        const lim = w.w / 2 + e.r;
        if (dd >= lim) continue;
        // senkrecht von der Mauer wegschieben
        const vx = w.x2 - w.x1, vy = w.y2 - w.y1;
        const len = Math.hypot(vx, vy) || 1;
        let nx = -vy / len, ny = vx / len;
        if ((e.x - w.x1) * nx + (e.y - w.y1) * ny < 0) { nx = -nx; ny = -ny; }
        e.x += nx * (lim - dd); e.y += ny * (lim - dd);
      }
    }
    e.x = clamp(e.x, e.r, g.world.w - e.r);
    e.y = clamp(e.y, e.r, g.world.h - e.r);
  }

  g.enemies = list.filter((e) => !e.dead);

  // Weit abgehängte Gegner verschwinden (der Director schickt neue)
  if (!g.boss) {
    g.enemies = g.enemies.filter((e) => !e.aggro || e.isBoss || dist2(e.x, e.y, p.x, p.y) < 2300 * 2300);
  }
}

export const eliteColor = (affix) => ELITE_AFFIXES[affix]?.color || "#ffd84a";
