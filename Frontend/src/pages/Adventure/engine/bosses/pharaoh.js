// Pharao Ankhamun (Glutwüste, alternativ zum Sandkoloss): schwebt auf Abstand. Lichtstrahlen in Kreuzform (Phase 2: sechs
// und ein zweiter, gedrehter Durchgang), Sandspirale, Mumien aus dem Sand, zielsuchende Fluchkugeln (verlangsamen).

import { chooseAttack, moveToward, idleTime } from "./common.js";
import { spawnEnemyBullet } from "../projectiles.js";
import { addHazard } from "../combat.js";
import { spawnEnemy } from "../enemies.js";
import { burst } from "../fx.js";
import { clamp } from "../util.js";

const ATTACKS = [["beams", 3], ["sandSpiral", 3], ["summon", 2], ["curse", 2]];

function beams(g, e, n, offset, delay) {
  for (let i = 0; i < n; i++) {
    const a = offset + (Math.PI * 2 * i) / n;
    addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(a) * 760, y2: e.y + Math.sin(a) * 760, w: 56, delay, dmg: e.dmg * 1.3, color: "#f5cf4a" });
  }
}

export function update(g, e, dt) {
  const p = g.player;
  e.facing = p.x < e.x ? -1 : 1;
  switch (e.state) {
    case "idle": {
      e.pose = "idle";
      // Abstand ~380 halten, langsam seitwärts gleiten
      const a = Math.atan2(e.y - p.y, e.x - p.x) + 0.35 * dt;
      moveToward(e, p.x + Math.cos(a) * 380, p.y + Math.sin(a) * 380, e.speed, dt);
      if (e.t > idleTime(e, 1.4)) chooseAttack(g, e, ATTACKS);
      break;
    }

    case "beams":
      e.pose = "attack";
      if (e.step === 0) { e.step = 1; e.beamA = Math.atan2(p.y - e.y, p.x - e.x); beams(g, e, e.phase2 ? 6 : 4, e.beamA, 1.0); }
      if (e.phase2 && e.step === 1 && e.t > 1.1) { e.step = 2; beams(g, e, 6, e.beamA + Math.PI / 6, 0.8); }
      if (e.t > (e.phase2 ? 2.2 : 1.5)) { e.state = "idle"; e.t = 0; }
      break;

    case "sandSpiral": {
      e.pose = "attack";
      const arms = e.phase2 ? 3 : 2;
      e.spiralT = (e.spiralT ?? 0) - dt;
      if (e.spiralT <= 0 && e.t < 2.4) {
        e.spiralT = 0.11;
        e.spiralA = (e.spiralA ?? 0) + 0.32;
        for (let i = 0; i < arms; i++) {
          spawnEnemyBullet(g, { x: e.x, y: e.y - 20, angle: e.spiralA + (Math.PI * 2 * i) / arms, speed: 250, dmg: e.dmg * 0.45, sprite: "proj_sand", life: 3.4, r: 9 });
        }
      }
      if (e.t > 2.7) { e.state = "idle"; e.t = 0; }
      break;
    }

    case "summon":
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const mine = g.enemies.filter((o) => o.summoner === e.uid && !o.dead).length;
        for (let i = 0; i < Math.min(e.phase2 ? 4 : 3, 7 - mine); i++) {
          const a = (Math.PI * 2 * i) / 4 + 0.4;
          const x = clamp(p.x + Math.cos(a) * 220, 60, g.world.w - 60), y = clamp(p.y + Math.sin(a) * 220, 60, g.world.h - 60);
          const m = spawnEnemy(g, "mummy", x, y, { minion: true });
          if (m) { m.summoner = e.uid; burst(g, x, y, "#d8b070", 14, 200); }
        }
      }
      if (e.t > 1) { e.state = "idle"; e.t = 0; }
      break;

    case "curse":
      e.pose = "attack";
      if (e.step < 3 && e.t > 0.25 + e.step * 0.35) {
        e.step++;
        const a = Math.atan2(p.y - e.y, p.x - e.x) + (e.step - 2) * 0.6;
        spawnEnemyBullet(g, { x: e.x, y: e.y - 30, angle: a, speed: 230, dmg: e.dmg * 0.8, sprite: "proj_curse", effect: "slow", life: 5, r: 12, homing: 240 });
      }
      if (e.t > 1.6) { e.state = "idle"; e.t = 0; }
      break;

    default:
      e.state = "idle"; e.t = 0;
  }
}
