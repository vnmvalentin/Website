// Nekromantenfürst (Verlies): Knochenspiralen, Beschwörung, Teleport mit Nova; in Phase 2 ein rotierendes Todeskreuz.

import { chooseAttack, bulletRing, moveToward, idleTime } from "./common.js";
import { spawnEnemyBullet } from "../projectiles.js";
import { addHazard } from "../combat.js";
import { spawnEnemy, findSpawnPoint } from "../enemies.js";
import { burst } from "../fx.js";
import { dist, clamp } from "../util.js";

const ATTACKS = [["spiral", 3], ["summon", 2], ["teleport", 2], ["cross", 3, { phase2Only: true }]];

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle":
      e.pose = "run";
      if (d > 320) moveToward(e, p.x, p.y, e.speed, dt);
      else if (d < 220) moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, e.speed * 0.7, dt);
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.5)) chooseAttack(g, e, ATTACKS);
      break;

    case "spiral": {
      e.pose = "attack";
      const arms = e.phase2 ? 4 : 2;
      e.spinA = (e.spinA ?? 0) + dt * 2.6;
      e.fireT = (e.fireT ?? 0) - dt;
      if (e.fireT <= 0) {
        e.fireT = 0.13;
        for (let i = 0; i < arms; i++) {
          spawnEnemyBullet(g, { x: e.x, y: e.y, angle: e.spinA + (Math.PI * 2 * i) / arms, speed: 230, dmg: e.dmg * 0.6, sprite: "proj_spike", life: 4, r: 9 });
        }
      }
      if (e.t > 2.6) { e.state = "idle"; e.t = 0; }
      break;
    }

    case "summon":
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 150, delay: 0.8, dmg: 0, color: "#8a4dff" });
      }
      if (e.step === 1 && e.t > 0.8) {
        e.step = 2;
        const n = e.phase2 ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n;
          spawnEnemy(g, "skeletonwarrior", e.x + Math.cos(a) * 130, e.y + Math.sin(a) * 130, { minion: true });
        }
        burst(g, e.x, e.y, "#8a4dff", 24, 300);
      }
      if (e.t > 1.4) { e.state = "idle"; e.t = 0; }
      break;

    case "teleport":
      if (e.step === 0) {
        e.step = 1;
        e.pose = "attack";
        const q = findSpawnPoint(g, p.x, p.y, 180, 280, e.r) || { x: p.x + 200, y: p.y };
        e.tx = clamp(q.x, e.r, g.world.w - e.r); e.ty = clamp(q.y, e.r, g.world.h - e.r);
        addHazard(g, { shape: "circle", x: e.tx, y: e.ty, r: 140, delay: 0.9, dmg: e.dmg * 1.2, color: "#8a4dff" });
        burst(g, e.x, e.y, "#8a4dff", 20, 260);
        e.invuln = true; e.fade = true;
      }
      if (e.step === 1 && e.t > 0.9) {
        e.step = 2;
        e.x = e.tx; e.y = e.ty;
        e.invuln = false; e.fade = false;
        burst(g, e.x, e.y, "#8a4dff", 20, 260);
        bulletRing(g, e, e.phase2 ? 20 : 14, 210, 0.6, "proj_laser", g.rng.next());
      }
      if (e.t > 1.5) { e.state = "idle"; e.t = 0; }
      break;

    case "cross": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const a0 = g.rng.range(0, Math.PI);
        const dir = g.rng.chance(0.5) ? 1 : -1;
        for (let k = 0; k < 6; k++) {
          for (let arm = 0; arm < 4; arm++) {
            const a = a0 + dir * k * 0.22 + (Math.PI / 2) * arm;
            addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(a) * 950, y2: e.y + Math.sin(a) * 950, w: 46, delay: 0.9 + k * 0.38, dmg: e.dmg * 0.9, color: "#b07bff" });
          }
        }
      }
      if (e.t > 3.4) { e.state = "idle"; e.t = 0; }
      break;
    }

    default:
      e.state = "idle"; e.t = 0;
  }
}
