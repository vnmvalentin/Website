// Spinnenkönigin (Kristallhöhle, alternativ zu König Schleim): umkreist dich, Netzfächer, Eiersäcke, Sprung; in Phase 2
// ein Netzkäfig, der sich um dich zusammenzieht — die Lücke ist der Ausweg.

import { chooseAttack, moveToward, idleTime } from "./common.js";
import { spawnEnemyBullet } from "../projectiles.js";
import { addHazard } from "../combat.js";
import { spawnEnemy } from "../enemies.js";
import { burst } from "../fx.js";
import { dist, clamp } from "../util.js";

const ATTACKS = [["webFan", 3], ["eggs", 2], ["leap", 2], ["cage", 3, { phase2Only: true }]];

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle": {
      e.pose = "run";
      // seitlich kreisen, Abstand ~380 halten
      const a = Math.atan2(e.y - p.y, e.x - p.x) + (e.orbitDir ?? 1) * 0.9 * dt;
      const want = 380;
      const tx = p.x + Math.cos(a) * want, ty = p.y + Math.sin(a) * want;
      moveToward(e, tx, ty, e.speed, dt);
      if (g.rng.chance(dt * 0.25)) e.orbitDir = -(e.orbitDir ?? 1);
      e.facing = p.x < e.x ? -1 : 1;
      if (e.t > idleTime(e, 1.5)) chooseAttack(g, e, ATTACKS);
      break;
    }

    case "webFan": {
      e.pose = "attack";
      const bursts = e.phase2 ? 3 : 2;
      if (e.step < bursts && e.t > 0.35 + e.step * 0.45) {
        e.step++;
        const base = Math.atan2(p.y - e.y, p.x - e.x);
        const n = e.phase2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          spawnEnemyBullet(g, { x: e.x, y: e.y, angle: base + (i - (n - 1) / 2) * 0.2, speed: 300, dmg: e.dmg * 0.5, sprite: "proj_web", effect: "web", life: 3.5, r: 11 });
        }
      }
      if (e.t > 0.4 + bursts * 0.45) { e.state = "idle"; e.t = 0; }
      break;
    }

    case "eggs":
      e.pose = "attack";
      if (e.step === 0 && e.t > 0.5) {
        e.step = 1;
        for (let i = 0; i < 3; i++) {
          const a = g.rng.range(0, Math.PI * 2);
          const egg = spawnEnemy(g, "slime", clamp(e.x + Math.cos(a) * 150, 40, g.world.w - 40), clamp(e.y + Math.sin(a) * 150, 40, g.world.h - 40), { minion: true });
          if (egg) {
            Object.assign(egg, { name: "Eiersack", isEgg: true, ai: "egg", speed: 0, r: 26, hp: e.maxHp * 0.04, maxHp: e.maxHp * 0.04, hatchT: 5, dmg: 0 });
          }
        }
      }
      if (e.t > 1) { e.state = "idle"; e.t = 0; }
      break;

    case "leap":
      if (e.step === 0) {
        e.step = 1;
        e.pose = "attack";
        e.tx = clamp(p.x, e.r, g.world.w - e.r); e.ty = clamp(p.y, e.r, g.world.h - e.r);
        e.fromX = e.x; e.fromY = e.y;
        addHazard(g, { shape: "circle", x: e.tx, y: e.ty, r: 150, delay: 1.0, dmg: e.dmg * 1.4, color: "#c2304a", shake: 7 });
      }
      if (e.step === 1 && e.t > 0.25) { e.step = 2; e.airborne = true; e.invuln = true; }
      if (e.step === 2) {
        const k = clamp((e.t - 0.25) / 0.75, 0, 1);
        e.x = e.fromX + (e.tx - e.fromX) * k;
        e.y = e.fromY + (e.ty - e.fromY) * k;
        e.jumpH = Math.sin(k * Math.PI) * 200;
        if (k >= 1) { e.step = 3; e.airborne = false; e.invuln = false; e.jumpH = 0; burst(g, e.x, e.y, "#c2304a", 20, 260); }
      }
      if (e.t > 1.5) { e.state = "idle"; e.t = 0; }
      break;

    case "cage":
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const n = 30;
        const gapAt = g.rng.int(0, n - 1);
        for (let i = 0; i < n; i++) {
          if (((i - gapAt + n) % n) < 5) continue;
          const a = (Math.PI * 2 * i) / n;
          const sx = p.x + Math.cos(a) * 560, sy = p.y + Math.sin(a) * 560;
          spawnEnemyBullet(g, { x: sx, y: sy, angle: a + Math.PI, speed: 150, dmg: e.dmg * 0.6, sprite: "proj_web", effect: "web", life: 5, r: 12, passThrough: true });
        }
      }
      if (e.t > 2.2) { e.state = "idle"; e.t = 0; }
      break;

    default:
      e.state = "idle"; e.t = 0;
  }
  void d;
}

// Eiersäcke schlüpfen, wenn man sie nicht rechtzeitig zerstört (läuft für jedes Ei aus enemies.js heraus)
export function updateEgg(g, egg, dt) {
  egg.hatchT -= dt;
  if (egg.hatchT > 0) return;
  egg.dead = true;
  burst(g, egg.x, egg.y, "#d8cfb8", 14, 200);
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI * 2 * i) / 3;
    spawnEnemy(g, "spider", egg.x + Math.cos(a) * 30, egg.y + Math.sin(a) * 30, { minion: true });
  }
}
