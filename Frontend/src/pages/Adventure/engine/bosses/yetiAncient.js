// Yeti-Urahn (Frostgipfel): Eisstachel-Fächer, Ansturm (in Phase 2 dreimal hintereinander), Frostnova, aus der man
// heraus muss, und Schneeballsalven.

import { chooseAttack, moveToward, idleTime } from "./common.js";
import { spawnEnemyBullet } from "../projectiles.js";
import { addHazard, hurtPlayer } from "../combat.js";
import { burst, shake } from "../fx.js";
import { dist, dist2, clamp } from "../util.js";

const ATTACKS = [["spikes", 3], ["charge", 3], ["nova", 2], ["snowballs", 2]];

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle":
      e.pose = "run";
      if (d > 240) moveToward(e, p.x, p.y, e.speed, dt);
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.4)) chooseAttack(g, e, ATTACKS);
      break;

    case "spikes": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const base = Math.atan2(p.y - e.y, p.x - e.x);
        const n = e.phase2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.32;
          addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(a) * 820, y2: e.y + Math.sin(a) * 820, w: 64, delay: 0.85 + i * 0.08, dmg: e.dmg * 1.1, effect: "slow", color: "#8fd8ff", impactColor: "#d8f2ff" });
        }
      }
      if (e.t > 1.5) { e.state = "idle"; e.t = 0; }
      break;
    }

    case "charge": {
      const total = e.phase2 ? 3 : 1;
      e.chargeNo = e.chargeNo ?? 0;
      if (e.step === 0) {
        e.step = 1; e.t = 0;
        e.pose = "attack";
        e.aimA = Math.atan2(p.y - e.y, p.x - e.x);
        addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(e.aimA) * 700, y2: e.y + Math.sin(e.aimA) * 700, w: e.r * 1.6, delay: 0.75, dmg: 0, color: "#8fd8ff" });
        e.hitThisCharge = false;
      } else if (e.step === 1 && e.t > 0.75) {
        e.step = 2; e.t = 0;
      } else if (e.step === 2) {
        e.pose = "run";
        e.x = clamp(e.x + Math.cos(e.aimA) * 820 * dt, e.r, g.world.w - e.r);
        e.y = clamp(e.y + Math.sin(e.aimA) * 820 * dt, e.r, g.world.h - e.r);
        if (g.rng.chance(dt * 20)) burst(g, e.x, e.y + e.r * 0.6, "#e8f6ff", 2, 80);
        if (!e.hitThisCharge && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) { e.hitThisCharge = true; hurtPlayer(g, e.dmg * 1.6, { effect: "slow" }); }
        if (e.t > 0.85) {
          shake(g, 5);
          e.chargeNo++;
          if (e.chargeNo < total) { e.step = 0; e.t = 0; }
          else { e.chargeNo = 0; e.state = "idle"; e.t = 0; }
        }
      }
      break;
    }

    case "nova":
      e.pose = "attack";
      if (e.step === 0) { e.step = 1; addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 340, delay: 1.5, dmg: e.dmg * 1.4, effect: "freeze", color: "#8fd8ff", shake: 8 }); }
      if (e.t > 2) { e.state = "idle"; e.t = 0; }
      break;

    case "snowballs": {
      e.pose = "attack";
      const shots = e.phase2 ? 10 : 6;
      e.fireT = (e.fireT ?? 0) - dt;
      if (e.step < shots && e.fireT <= 0 && e.t > 0.3) {
        e.fireT = 0.16;
        e.step++;
        const a = Math.atan2(p.y - e.y, p.x - e.x) + g.rng.range(-0.25, 0.25);
        spawnEnemyBullet(g, { x: e.x, y: e.y, angle: a, speed: 360, dmg: e.dmg * 0.55, sprite: "proj_iceball", effect: "slow", life: 3, r: 11 });
      }
      if (e.t > 0.4 + shots * 0.16) { e.state = "idle"; e.t = 0; }
      break;
    }

    default:
      e.state = "idle"; e.t = 0;
  }
}
