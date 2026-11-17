// Uhrwerkkoloss (Uhrwerkturm, ab Zyklus 2): ein riesiger aufgezogener Automat, der dir nachsetzt. Hieb (Fächer aus drei
// Linien vor ihm, in Phase 2 ein zweiter versetzt), Zahnradwurf (Fächer aus großen Zahnrädern), Aufziehen (die Bahn
// ist zu sehen, dann rauscht er hindurch — in Phase 2 zweimal). In Phase 2 die Uhrzeiger: zwei Zeiger aus Linien
// streichen gegenläufig über den Platz um ihn.

import { chooseAttack, moveToward, idleTime } from "./common.js";
import { addHazard, hurtPlayer } from "../combat.js";
import { spawnEnemyBullet } from "../projectiles.js";
import { burst, shake } from "../fx.js";
import { dist, clamp, distToSegment } from "../util.js";

const BRASS = "#d8b060";
const STEEL = "#c9d2dc";
const ATTACKS = [["hieb", 3], ["wurf", 3], ["aufziehen", 2], ["zeiger", 3, { phase2Only: true }]];

function slash(g, e, a0, delay) {
  for (const da of [-0.38, 0, 0.38]) {
    const a = a0 + da;
    addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(a) * 330, y2: e.y + Math.sin(a) * 330, w: 64, delay, dmg: e.dmg * 1.15, color: STEEL });
  }
}

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle":
      e.pose = "run";
      if (d > 150) moveToward(e, p.x, p.y, e.speed, dt);
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.2)) chooseAttack(g, e, ATTACKS);
      break;

    // Hieb: drei Linien im Fächer auf dich; in Phase 2 folgt ein zweiter Hieb in die Lücken
    case "hieb": {
      e.pose = "attack";
      if (e.step === 0) { e.step = 1; e.aimA = Math.atan2(p.y - e.y, p.x - e.x); slash(g, e, e.aimA, 0.7); }
      if (e.phase2 && e.step === 1 && e.t > 0.55) { e.step = 2; slash(g, e, e.aimA + 0.19, 0.6); }
      if (e.t > (e.phase2 ? 1.6 : 1.2)) { e.state = "idle"; e.t = 0; }
      break;
    }

    // Zahnradwurf: fünf (Phase 2: sieben) große Zahnräder im Fächer
    case "wurf":
      e.pose = "attack";
      if (e.step === 0 && e.t > 0.35) {
        e.step = 1;
        const a0 = Math.atan2(p.y - e.y, p.x - e.x);
        const n = e.phase2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i - (n - 1) / 2) * 0.24;
          spawnEnemyBullet(g, { x: e.x, y: e.y, angle: a, speed: 300, dmg: e.dmg * 0.8, sprite: "proj_shuriken", life: 3.2, r: 15, scale: 1.8 });
        }
      }
      if (e.t > 1.1) { e.state = "idle"; e.t = 0; }
      break;

    // Aufziehen: Bahn 0,85 s sichtbar, dann in 0,4 s hindurch; in Phase 2 ein zweiter Anlauf
    case "aufziehen": {
      if (e.step === 0 || e.step === 3) {
        e.step = e.step === 0 ? 1 : 4;
        e.pose = "attack";
        e.t = 0;
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        e.sx = e.x; e.sy = e.y;
        e.tx = clamp(e.x + Math.cos(a) * 700, e.r, g.world.w - e.r);
        e.ty = clamp(e.y + Math.sin(a) * 700, e.r, g.world.h - e.r);
        addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.tx, y2: e.ty, w: e.r * 1.6, delay: 0.85, dmg: 0, color: BRASS });
      }
      if ((e.step === 1 || e.step === 4) && e.t > 0.85) {
        const k = Math.min(1, (e.t - 0.85) / 0.4);
        e.x = e.sx + (e.tx - e.sx) * k;
        e.y = e.sy + (e.ty - e.sy) * k;
        e.facing = e.tx < e.sx ? -1 : 1;
        if (!e.hitThisRun && distToSegment(p.x, p.y, e.sx, e.sy, e.x, e.y) < e.r * 0.8 + p.r) { e.hitThisRun = true; hurtPlayer(g, e.dmg * 1.4, { effect: "stun" }); }
        if (k >= 1) {
          e.hitThisRun = false;
          burst(g, e.x, e.y, BRASS, 18, 260); shake(g, 5);
          e.step = e.step === 1 && e.phase2 ? 3 : 5;
          e.t = 0;
        }
      }
      if (e.step === 5) { e.pose = "idle"; if (e.t > 0.7) { e.state = "idle"; e.t = 0; } }
      break;
    }

    // Uhrzeiger (nur Phase 2): zwei Zeiger aus je zwölf Linien, gegenläufig, nacheinander aufleuchtend
    case "zeiger":
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const a0 = Math.atan2(p.y - e.y, p.x - e.x) - 0.9;
        for (let i = 0; i < 12; i++) {
          for (const [base, dir] of [[a0, 1], [a0 + Math.PI, -1]]) {
            const a = base + dir * i * 0.26;
            addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(a) * 520, y2: e.y + Math.sin(a) * 520, w: 46, delay: 0.75 + i * 0.09, dmg: e.dmg * 0.8, color: BRASS });
          }
        }
      }
      if (e.t > 2.1) { e.state = "idle"; e.t = 0; }
      break;

    default:
      e.state = "idle"; e.t = 0;
  }
}
