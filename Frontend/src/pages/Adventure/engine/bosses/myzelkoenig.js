// Myzelkönig (Pilzwald, ab Zyklus 2): ein schwerer Pilz, der langsam auf dich zukommt. Sporenregen (angekündigte
// Einschläge, die Sporenwolken hinterlassen), Pilzsprossen (Reihen aus aufbrechenden Pilzen, die auf dich zulaufen),
// Brut (ein Ring Sporlinge, dazu Bovisten). In Phase 2 der Sprung: er landet auf deiner Stelle und hüllt sie in Sporen.

import { chooseAttack, moveToward, idleTime } from "./common.js";
import { addHazard } from "../combat.js";
import { spawnEnemy, findSpawnPoint } from "../enemies.js";
import { sporeCloud, SPORE_COLOR } from "../worldMechanics.js";
import { burst, shake } from "../fx.js";
import { dist, clamp } from "../util.js";

const CAP = "#d9473a";
const ATTACKS = [["regen", 3], ["sprossen", 3], ["brut", 2], ["sprung", 3, { phase2Only: true }]];

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle":
      e.pose = "run";
      if (d > 200) moveToward(e, p.x, p.y, e.speed, dt);
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.5)) chooseAttack(g, e, ATTACKS);
      break;

    // Sporenregen: drei (Phase 2: fünf) Einschläge, einer genau auf dir; jeder hinterlässt eine Sporenwolke
    case "regen": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const n = e.phase2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const r = i === 0 ? 0 : g.rng.range(150, 330);
          const a = g.rng.range(0, Math.PI * 2);
          const x = clamp(p.x + Math.cos(a) * r, 60, g.world.w - 60);
          const y = clamp(p.y + Math.sin(a) * r, 60, g.world.h - 60);
          addHazard(g, { shape: "circle", x, y, r: 110, delay: 1.0 + i * 0.15, dmg: e.dmg * 0.7, effect: "slow", color: SPORE_COLOR, lob: { x: e.x, y: e.y - 60 },
            onResolve: (gg, h) => sporeCloud(gg, h.x, h.y, 110, 4) });
        }
      }
      if (e.t > 2.0) { e.state = "idle"; e.t = 0; }
      break;
    }

    // Pilzsprossen: drei (Phase 2: fünf) Reihen brechen nacheinander aus dem Boden, die mittlere zielt auf dich
    case "sprossen": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const a0 = Math.atan2(p.y - e.y, p.x - e.x);
        const rows = e.phase2 ? 5 : 3;
        for (let k = 0; k < rows; k++) {
          const a = a0 + (k - (rows - 1) / 2) * 0.42;
          for (let i = 1; i <= 7; i++) {
            const x = e.x + Math.cos(a) * (e.r + i * 85), y = e.y + Math.sin(a) * (e.r + i * 85);
            if (x < 30 || y < 30 || x > g.world.w - 30 || y > g.world.h - 30) break;
            addHazard(g, { shape: "circle", x, y, r: 56, delay: 0.65 + i * 0.11, dmg: e.dmg * 1.0, color: CAP, shake: i === 1 ? 3 : 0 });
          }
        }
      }
      if (e.t > 1.8) { e.state = "idle"; e.t = 0; }
      break;
    }

    // Brut: ein Ring Sporlinge um ihn herum, dazu zwei (Phase 2: drei) Bovisten bei dir
    case "brut":
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const n = e.phase2 ? 9 : 6;
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n;
          spawnEnemy(g, "sporling", e.x + Math.cos(a) * (e.r + 40), e.y + Math.sin(a) * (e.r + 40), { minion: true });
        }
        for (let i = 0; i < (e.phase2 ? 3 : 2); i++) {
          const q = findSpawnPoint(g, p.x, p.y, 260, 360, 20);
          if (q) spawnEnemy(g, "bovist", q.x, q.y, { minion: true });
        }
        burst(g, e.x, e.y, SPORE_COLOR, 24, 280);
      }
      if (e.t > 1.2) { e.state = "idle"; e.t = 0; }
      break;

    // Sprung (nur Phase 2): die Landestelle ist 1,1 s zu sehen, dort landet er mit Wucht und einer großen Sporenwolke
    case "sprung": {
      const T = 1.1;
      if (e.step === 0) {
        e.step = 1;
        e.pose = "attack";
        e.sx = e.x; e.sy = e.y;
        e.tx = clamp(p.x, e.r, g.world.w - e.r); e.ty = clamp(p.y, e.r, g.world.h - e.r);
        addHazard(g, { shape: "circle", x: e.tx, y: e.ty, r: 190, delay: T, dmg: e.dmg * 1.4, color: CAP, shake: 9 });
      }
      if (e.step === 1) {
        const k = Math.min(1, e.t / T);
        e.x = e.sx + (e.tx - e.sx) * k;
        e.y = e.sy + (e.ty - e.sy) * k;
        e.jumpH = Math.sin(k * Math.PI) * 260;
        e.airborne = k < 0.9;
        if (k >= 1) {
          e.step = 2; e.jumpH = 0; e.airborne = false;
          sporeCloud(g, e.x, e.y, 190, 3);
          burst(g, e.x, e.y, CAP, 22, 320);
          shake(g, 6);
        }
      }
      if (e.step === 2) e.pose = "idle";
      if (e.t > T + 0.8) { e.state = "idle"; e.t = 0; }
      break;
    }

    default:
      e.state = "idle"; e.t = 0;
  }
}
