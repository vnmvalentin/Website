// König Schleim (Kristallhöhle): Säureringe, Säurelinie, Sprung auf deine Position; in Phase 2 spaltet er zwei
// Schleimprinzen ab.

import { chooseAttack, bulletRing, moveToward, idleTime } from "./common.js";
import { addHazard, addZone } from "../combat.js";
import { spawnEnemy } from "../enemies.js";
import { burst, shake } from "../fx.js";
import { dist, clamp } from "../util.js";

const ATTACKS = [["rings", 3], ["acidLine", 2], ["jump", 2]];

export function onPhase2(g, e) {
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI + g.rng.range(-0.5, 0.5);
    const s = spawnEnemy(g, "slime", e.x + Math.cos(a) * e.r * 1.3, e.y + Math.sin(a) * e.r * 1.3, { minion: true });
    if (s) {
      s.name = "Schleimprinz";
      s.r = 36; s.hp = e.maxHp * 0.08; s.maxHp = s.hp; s.dmg = e.dmg * 0.8; s.speed = 120; s.reward = 20;
    }
  }
}

export function update(g, e, dt) {
  const p = g.player;
  switch (e.state) {
    case "idle":
      e.pose = "idle";
      if (dist(e.x, e.y, p.x, p.y) > 200) moveToward(e, p.x, p.y, e.speed, dt);
      if (e.t > idleTime(e, 1.4)) chooseAttack(g, e, ATTACKS);
      break;

    case "rings":
      e.pose = e.t < 0.4 ? "charge1" : "slam";
      if (e.step === 0 && e.t > 0.4) { e.step = 1; bulletRing(g, e, 14, 240, 0.55, "proj_poisonball", g.rng.next(), { effect: "poison", r: 11 }); }
      if (e.step === 1 && e.t > 0.9) { e.step = 2; bulletRing(g, e, 14, 240, 0.55, "proj_poisonball", g.rng.next(), { effect: "poison", r: 11 }); }
      if (e.phase2 && e.step === 2 && e.t > 1.4) { e.step = 3; bulletRing(g, e, 18, 280, 0.55, "proj_poisonball", g.rng.next(), { effect: "poison", r: 11 }); }
      if (e.t > (e.phase2 ? 1.9 : 1.4)) { e.state = "idle"; e.t = 0; }
      break;

    case "acidLine":
      if (e.step === 0) {
        e.step = 1;
        e.lineA = Math.atan2(p.y - e.y, p.x - e.x);
        addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(e.lineA) * 1200, y2: e.y + Math.sin(e.lineA) * 1200, w: 80, delay: 0.8, dmg: e.dmg, effect: "poison", color: "#8be04e" });
      }
      e.pose = e.t < 0.4 ? "charge1" : e.t < 0.8 ? "charge2" : "slam";
      if (e.step === 1 && e.t > 0.8) {
        e.step = 2;
        for (let s = 0; s <= 1200; s += 60) {
          const x = e.x + Math.cos(e.lineA) * s, y = e.y + Math.sin(e.lineA) * s;
          if (x < 0 || y < 0 || x > g.world.w || y > g.world.h) break;
          addZone(g, { x, y, r: 38, t: 5, tick: 0.5, dmg: e.dmg * 0.25, effect: "poison", kind: "acid" });
        }
        shake(g, 6);
      }
      if (e.t > 1.4) { e.state = "idle"; e.t = 0; }
      break;

    case "jump":
      if (e.step === 0) {
        e.step = 1;
        e.pose = "charge2";
        e.tx = clamp(p.x, e.r, g.world.w - e.r); e.ty = clamp(p.y, e.r, g.world.h - e.r);
        e.fromX = e.x; e.fromY = e.y;
        addHazard(g, { shape: "circle", x: e.tx, y: e.ty, r: 170, delay: 1.2, dmg: e.dmg * 1.5, color: "#8be04e", shake: 10 });
      }
      if (e.step === 1 && e.t > 0.3) { e.step = 2; e.airborne = true; e.invuln = true; }
      if (e.step === 2) {
        const k = clamp((e.t - 0.3) / 0.9, 0, 1);
        e.x = e.fromX + (e.tx - e.fromX) * k;
        e.y = e.fromY + (e.ty - e.fromY) * k;
        e.jumpH = Math.sin(k * Math.PI) * 260;
        if (k >= 1) {
          e.step = 3; e.airborne = false; e.invuln = false; e.jumpH = 0; e.pose = "slam";
          burst(g, e.x, e.y, "#8be04e", 26, 320);
          for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3;
            spawnEnemy(g, "slime", e.x + Math.cos(a) * (e.r + 30), e.y + Math.sin(a) * (e.r + 30), { minion: true });
          }
        }
      }
      if (e.t > 1.9) { e.state = "idle"; e.t = 0; }
      break;

    default:
      e.state = "idle"; e.t = 0;
  }
}
