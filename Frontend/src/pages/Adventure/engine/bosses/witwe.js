// Klagende Witwe (Friedhof, ab Zyklus 2): ein Geist, der schwebend Abstand hält. Klageschrei als Fächer aus Linien (macht
// langsam), Gräberruf (weckt alle Gräber in der Nähe und ruft Ghule), Schleier (verschwindet, taucht neben dir mit einem
// Ring aus Seelenlichtern auf). In Phase 2 der Totentanz: drei Seelenlichter-Spiralen, dazwischen Ghule.

import { chooseAttack, bulletRing, moveToward, idleTime } from "./common.js";
import { spawnEnemyBullet } from "../projectiles.js";
import { addHazard } from "../combat.js";
import { spawnEnemy, findSpawnPoint } from "../enemies.js";
import { wakeGrave } from "../worldMechanics.js";
import { burst } from "../fx.js";
import { dist, dist2, clamp } from "../util.js";

const VEIL = "#c9b8ff";
const SOUL = "#9fe8c8";
const ATTACKS = [["schrei", 3], ["ruf", 2], ["schleier", 2], ["tanz", 3, { phase2Only: true }]];

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle":
      e.pose = "run";
      if (d > 340) moveToward(e, p.x, p.y, e.speed, dt);
      else if (d < 230) moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, e.speed * 0.75, dt);
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.4)) chooseAttack(g, e, ATTACKS);
      break;

    // Klageschrei: fünf (in Phase 2 sieben) Linien im Fächer auf dich zu, nach der Ankündigung Schaden und Verlangsamung
    case "schrei": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const a0 = Math.atan2(p.y - e.y, p.x - e.x);
        const n = e.phase2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const a = a0 + (i - (n - 1) / 2) * 0.2;
          addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(a) * 820, y2: e.y + Math.sin(a) * 820, w: 40, delay: 0.85, dmg: e.dmg * 0.9, effect: "slow", color: VEIL });
        }
      }
      if (e.t > 1.3) { e.state = "idle"; e.t = 0; }
      break;
    }

    // Gräberruf: alle Gräber im Umkreis erwachen (engine/worldMechanics.js), dazu ein Ring Ghule um sie selbst
    case "ruf":
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 150, delay: 0.8, dmg: 0, color: SOUL });
        for (const o of g.obstacles) {
          if (o.sprite === "grave" && dist2(o.x, o.y, p.x, p.y) < 700 * 700) { o.restUntil = 0; wakeGrave(g, o); }
        }
      }
      if (e.step === 1 && e.t > 0.8) {
        e.step = 2;
        const n = e.phase2 ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n;
          spawnEnemy(g, "ghul", e.x + Math.cos(a) * 120, e.y + Math.sin(a) * 120, { minion: true });
        }
        burst(g, e.x, e.y, SOUL, 24, 300);
      }
      if (e.t > 1.4) { e.state = "idle"; e.t = 0; }
      break;

    // Schleier: verschwindet (unverwundbar), die Stelle neben dir ist vorher zu sehen, dann ein Ring Seelenlichter
    case "schleier":
      if (e.step === 0) {
        e.step = 1;
        e.pose = "attack";
        const q = findSpawnPoint(g, p.x, p.y, 200, 300, e.r) || { x: p.x + 230, y: p.y };
        e.tx = clamp(q.x, e.r, g.world.w - e.r); e.ty = clamp(q.y, e.r, g.world.h - e.r);
        addHazard(g, { shape: "circle", x: e.tx, y: e.ty, r: 130, delay: 1.0, dmg: e.dmg * 1.1, color: VEIL });
        burst(g, e.x, e.y, VEIL, 22, 260);
        e.invuln = true; e.fade = true;
      }
      if (e.step === 1 && e.t > 1.0) {
        e.step = 2;
        e.x = e.tx; e.y = e.ty;
        e.invuln = false; e.fade = false;
        burst(g, e.x, e.y, VEIL, 22, 260);
        bulletRing(g, e, e.phase2 ? 18 : 12, 200, 0.55, "proj_iceball", g.rng.next(), { effect: "slow" });
      }
      if (e.t > 1.6) { e.state = "idle"; e.t = 0; }
      break;

    // Totentanz (nur Phase 2): drei Arme aus Seelenlichtern drehen sich um sie, dazwischen erwachen Ghule
    case "tanz": {
      e.pose = "attack";
      e.spinA = (e.spinA ?? 0) + dt * 2.2;
      e.fireT = (e.fireT ?? 0) - dt;
      if (e.fireT <= 0) {
        e.fireT = 0.16;
        for (let i = 0; i < 3; i++) {
          spawnEnemyBullet(g, { x: e.x, y: e.y, angle: e.spinA + (Math.PI * 2 * i) / 3, speed: 210, dmg: e.dmg * 0.55, sprite: "proj_iceball", life: 4, r: 9 });
        }
      }
      if (e.step === 0 && e.t > 1.2) {
        e.step = 1;
        for (let i = 0; i < 3; i++) {
          const q = findSpawnPoint(g, p.x, p.y, 220, 320, 18);
          if (q) spawnEnemy(g, "ghul", q.x, q.y, { minion: true });
        }
      }
      if (e.t > 3) { e.state = "idle"; e.t = 0; }
      break;
    }

    default:
      e.state = "idle"; e.t = 0;
  }
}
