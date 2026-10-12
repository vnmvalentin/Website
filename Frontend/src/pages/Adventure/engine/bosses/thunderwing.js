// Thunderwing (Gewitterhort, Finale): Biss, Dreifachstrahl, zielsuchende Kugeln, Blitzwand mit Lücke und der Flug,
// bei dem Blitze auf dich regnen. Übernommen aus dem alten Spiel, jetzt mit Telegraphen statt Dauerstrahlen.

import { chooseAttack, moveToward, idleTime } from "./common.js";
import { spawnEnemyBullet } from "../projectiles.js";
import { addHazard } from "../combat.js";
import { lightning, shake, burst } from "../fx.js";
import { dist, clamp } from "../util.js";

const ATTACKS = [["tripleBeam", 3], ["orbs", 3], ["wallSweep", 2], ["flyRain", 2]];

function boltFx(g, h) {
  lightning(g, [{ x: h.x, y: h.y - 560 }, { x: h.x + 16, y: h.y - 300 }, { x: h.x - 10, y: h.y - 130 }, { x: h.x, y: h.y }], "#fff3a0", 0.22);
}

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle":
      if (d > 170) { e.pose = "walk"; moveToward(e, p.x, p.y, e.speed * 0.8, dt); }
      else if (e.t > 0.4) { e.state = "bite"; e.t = 0; e.step = 0; break; }
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.5)) chooseAttack(g, e, ATTACKS);
      break;

    case "bite":
      e.pose = e.t < 0.45 ? "charge" : "attack";
      if (e.step === 0) {
        e.step = 1;
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        addHazard(g, { shape: "circle", x: e.x + Math.cos(a) * 90, y: e.y + Math.sin(a) * 90, r: 120, delay: 0.5, dmg: e.dmg * 1.2, color: "#ffe14d" });
      }
      if (e.t > 0.9) { e.state = "idle"; e.t = 0.6; }
      break;

    case "tripleBeam": {
      const volleys = e.phase2 ? 2 : 1;
      e.pose = e.t < 0.6 ? "charge" : "attack";
      if (e.step < volleys && e.t > 0.5 + e.step * 0.8) {
        e.step++;
        const a = Math.atan2(p.y - e.y, p.x - e.x) + (e.step === 2 ? 0.17 : 0);
        for (const off of [-0.35, 0, 0.35]) {
          addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(a + off) * 1400, y2: e.y + Math.sin(a + off) * 1400, w: 58, delay: 0.85, dmg: e.dmg * 0.9, effect: "stun", color: "#5ee0ff", impactColor: "#e6fbff" });
        }
      }
      if (e.t > 0.5 + volleys * 0.8 + 0.5) { e.state = "idle"; e.t = 0; }
      break;
    }

    case "orbs":
      e.pose = "attack";
      if (e.step === 0 && e.t > 0.4) {
        e.step = 1;
        const n = e.phase2 ? 8 : 5;
        for (let i = 0; i < n; i++) {
          spawnEnemyBullet(g, { x: e.x, y: e.y, angle: (Math.PI * 2 * i) / n, speed: 175, homing: 150, dmg: e.dmg * 0.7, sprite: "electric_ball", effect: "stun", life: 6, r: 14, scale: 1.2 });
        }
      }
      if (e.t > 1) { e.state = "idle"; e.t = 0; }
      break;

    case "wallSweep":
      e.pose = "attack";
      if (e.step === 0 && e.t > 0.6) {
        e.step = 1;
        const horizontal = g.rng.chance(0.5);
        const gap = 260;
        const W = g.world.w, H = g.world.h;
        if (horizontal) {
          const fromLeft = p.x > W / 2;
          const gapY = g.rng.range(120, H - 120 - gap);
          for (let y = 0; y < H; y += 32) {
            if (y > gapY && y < gapY + gap) continue;
            spawnEnemyBullet(g, { x: fromLeft ? -40 : W + 40, y, angle: fromLeft ? 0 : Math.PI, speed: 240, dmg: e.dmg * 0.9, sprite: "electric_ball", effect: "stun", life: (W + 120) / 240, r: 13, passThrough: true });
          }
        } else {
          const fromTop = p.y > H / 2;
          const gapX = g.rng.range(120, W - 120 - gap);
          for (let x = 0; x < W; x += 32) {
            if (x > gapX && x < gapX + gap) continue;
            spawnEnemyBullet(g, { x, y: fromTop ? -40 : H + 40, angle: fromTop ? Math.PI / 2 : -Math.PI / 2, speed: 240, dmg: e.dmg * 0.9, sprite: "electric_ball", effect: "stun", life: (H + 120) / 240, r: 13, passThrough: true });
          }
        }
      }
      if (e.t > 1.4) { e.state = "idle"; e.t = 0; }
      break;

    case "flyRain": {
      const waves = e.phase2 ? 8 : 5;
      e.pose = "fly";
      if (e.step === 0) { e.step = 1; e.airborne = true; e.invuln = true; e.fromY = e.y; }
      e.jumpH = Math.min(420, e.t * 700);
      if (e.step >= 1 && e.step <= waves && e.t > 0.6 + (e.step - 1) * 0.6) {
        e.step++;
        addHazard(g, { shape: "circle", x: p.x, y: p.y, r: 75, delay: 0.85, dmg: e.dmg * 0.9, effect: "stun", color: "#ffe14d", onResolve: boltFx });
        const extra = e.phase2 ? 5 : 3;
        for (let i = 0; i < extra; i++) {
          const a = g.rng.range(0, Math.PI * 2), r = g.rng.range(120, 460);
          addHazard(g, { shape: "circle", x: clamp(p.x + Math.cos(a) * r, 40, g.world.w - 40), y: clamp(p.y + Math.sin(a) * r, 40, g.world.h - 40), r: 75, delay: 0.85, dmg: e.dmg * 0.9, effect: "stun", color: "#ffe14d", onResolve: boltFx });
        }
      }
      if (e.step > waves && e.t > 0.6 + waves * 0.6 + 0.8) {
        e.airborne = false; e.invuln = false; e.jumpH = 0;
        burst(g, e.x, e.y, "#ffe14d", 24, 300);
        shake(g, 8);
        e.state = "idle"; e.t = 0;
      }
      break;
    }

    default:
      e.state = "idle"; e.t = 0;
  }
}
