// Sandkoloss (Glutwüste): langsam und schwer. Erdbebenringe mit Lücke, Felsbrocken, die als Deckung liegen bleiben,
// Stampfer um sich herum; in Phase 2 ein Sandsturm aus Spiralen.

import { chooseAttack, bulletRing, moveToward, idleTime } from "./common.js";
import { spawnEnemyBullet } from "../projectiles.js";
import { addHazard } from "../combat.js";
import { shake } from "../fx.js";
import { dist, dist2, clamp } from "../util.js";

const ATTACKS = [["quake", 3], ["boulders", 3], ["stomp", 2], ["sandstorm", 3, { phase2Only: true }]];

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle":
      e.pose = "run";
      if (d > 180) moveToward(e, p.x, p.y, e.speed, dt);
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.6)) chooseAttack(g, e, d < 260 ? [["stomp", 4], ["quake", 1]] : ATTACKS);
      break;

    case "quake": {
      e.pose = "attack";
      const waves = e.phase2 ? 4 : 3;
      if (e.step < waves && e.t > 0.5 + e.step * 0.55) {
        e.step++;
        shake(g, 5);
        bulletRing(g, e, 26, 230, 0.6, "proj_sand", g.rng.next(), { gap: { at: g.rng.int(0, 25), size: 4 }, r: 10, startR: e.r * 0.6 });
      }
      if (e.t > 0.6 + waves * 0.55) { e.state = "idle"; e.t = 0; }
      break;
    }

    case "boulders": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const n = e.phase2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const x = clamp(p.x + (i === 0 ? 0 : g.rng.range(-260, 260)), 80, g.world.w - 80);
          const y = clamp(p.y + (i === 0 ? 0 : g.rng.range(-260, 260)), 80, g.world.h - 80);
          addHazard(g, { shape: "circle", x, y, r: 105, delay: 1.1 + i * 0.12, dmg: e.dmg * 1.3, color: "#e0a64a", shake: 6, boulder: true,
            onResolve: (gg, h) => {
              // Brocken bleiben 10 s als Hindernis liegen — außer der Spieler steht genau dort
              if (dist2(gg.player.x, gg.player.y, h.x, h.y) > 70 * 70) gg.obstacles.push({ x: h.x, y: h.y, r: 46, sprite: "stone1", temp: 10 });
            } });
        }
      }
      if (e.t > 1.7) { e.state = "idle"; e.t = 0; }
      break;
    }

    case "stomp":
      e.pose = "attack";
      if (e.step === 0) { e.step = 1; addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 270, delay: 1.0, dmg: e.dmg * 1.6, color: "#e0a64a", shake: 10 }); }
      if (e.t > 1.6) { e.state = "idle"; e.t = 0; }
      break;

    case "sandstorm":
      e.pose = "attack";
      moveToward(e, p.x, p.y, e.speed * 0.5, dt);
      e.spinA = (e.spinA ?? 0) + dt * 1.9;
      e.fireT = (e.fireT ?? 0) - dt;
      if (e.fireT <= 0) {
        e.fireT = 0.16;
        for (let i = 0; i < 3; i++) {
          spawnEnemyBullet(g, { x: e.x, y: e.y, angle: e.spinA + (Math.PI * 2 * i) / 3, speed: 210, dmg: e.dmg * 0.45, sprite: "proj_sand", life: 4, r: 9 });
        }
      }
      if (e.t > 3.2) { e.state = "idle"; e.t = 0; }
      break;

    default:
      e.state = "idle"; e.t = 0;
  }
}
