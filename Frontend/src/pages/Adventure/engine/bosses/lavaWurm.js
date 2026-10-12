// Lavawurm (Schlackefeld, alternativ zum Minotaurenfürsten): ein Kopf, dem ein Körper aus Segmenten folgt (e.trail,
// nur Optik). Abtauchen und unter dir ausbrechen (Kreis vorher sichtbar, hinterlässt Lava), Feuerspucken, und ein
// Feuerring, den er um dich zieht. Phase 2: taucht zweimal hintereinander auf, spuckt dichter.
//
// Während er abgetaucht ist: unverwundbar (invuln), kein Kontaktschaden (airborne), gezeichnet als Erdhügel (hidden).

import { chooseAttack, moveToward, idleTime } from "./common.js";
import { spawnEnemyBullet } from "../projectiles.js";
import { addHazard, addZone } from "../combat.js";
import { burst, shake } from "../fx.js";
import { dist, clamp } from "../util.js";

const ATTACKS = [["dive", 3], ["spit", 3], ["coil", 2]];
const SEG_GAP = 26;
const SEGMENTS = 9;

// Körper folgt dem Kopf: Punkte im festen Abstand mitschreiben
function updateTrail(e) {
  e.trail = e.trail || [];
  const last = e.trail[0];
  if (!last || Math.hypot(e.x - last.x, e.y - last.y) >= SEG_GAP) {
    e.trail.unshift({ x: e.x, y: e.y });
    if (e.trail.length > SEGMENTS) e.trail.length = SEGMENTS;
  }
}

function surface(g, e) {
  e.hidden = false; e.invuln = false; e.airborne = false;
  e.trail = [];
  shake(g, 8);
  burst(g, e.x, e.y, "#ff7a2e", 24, 320);
  addZone(g, { x: e.x, y: e.y, r: 110, t: 4, tick: 0.5, dmg: e.dmg * 0.25, effect: "burn", kind: "fire" });
}

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  e.facing = p.x < e.x ? -1 : 1;
  if (!e.hidden) updateTrail(e);
  switch (e.state) {
    case "idle": {
      e.pose = "run";
      // Schlängeln: Ziel seitlich versetzt
      const a = Math.atan2(p.y - e.y, p.x - e.x) + Math.sin(e.t * 3) * 0.7;
      if (d > 200) moveToward(e, e.x + Math.cos(a) * 100, e.y + Math.sin(a) * 100, e.speed, dt);
      if (e.t > idleTime(e, 1.3)) chooseAttack(g, e, ATTACKS);
      break;
    }

    case "dive": {
      const total = e.phase2 ? 2 : 1;
      e.diveNo = e.diveNo ?? 0;
      if (e.step === 0) {
        e.step = 1; e.t = 0;
        e.hidden = true; e.invuln = true; e.airborne = true;
        burst(g, e.x, e.y, "#8a4a2a", 16, 220);
      } else if (e.step === 1) {
        moveToward(e, p.x, p.y, e.speed * 2.2, dt);
        if (e.t > 1.1 || d < 40) {
          e.step = 2; e.t = 0;
          e.tx = clamp(p.x, e.r, g.world.w - e.r); e.ty = clamp(p.y, e.r, g.world.h - e.r);
          addHazard(g, { shape: "circle", x: e.tx, y: e.ty, r: 150, delay: 0.85, dmg: e.dmg * 1.6, effect: "burn", color: "#ff5a2e", shake: 9 });
        }
      } else if (e.step === 2) {
        e.x += (e.tx - e.x) * Math.min(1, dt * 6); e.y += (e.ty - e.y) * Math.min(1, dt * 6);
        if (e.t > 0.85) { surface(g, e); e.step = 3; e.t = 0; e.pose = "attack"; }
      } else if (e.step === 3 && e.t > 0.8) {
        e.diveNo++;
        if (e.diveNo < total) { e.step = 0; e.t = 0; } else { e.diveNo = 0; e.state = "idle"; e.t = 0; }
      }
      break;
    }

    case "spit": {
      e.pose = "attack";
      const volleys = e.phase2 ? 4 : 3;
      if (e.step < volleys && e.t > 0.3 + e.step * 0.42) {
        e.step++;
        const base = Math.atan2(p.y - e.y, p.x - e.x);
        const n = e.phase2 ? 7 : 5;
        for (let i = 0; i < n; i++) {
          spawnEnemyBullet(g, { x: e.x, y: e.y - 30, angle: base + (i - (n - 1) / 2) * 0.17, speed: 340, dmg: e.dmg * 0.5, sprite: "proj_fireball", effect: "burn", life: 3, r: 11 });
        }
      }
      if (e.t > 0.4 + volleys * 0.42) { e.state = "idle"; e.t = 0; }
      break;
    }

    // Kreist um dich und lässt einen Feuerring liegen — mit einer Lücke dort, wo er angefangen hat
    case "coil": {
      e.pose = "run";
      if (e.step === 0) { e.step = 1; e.coilA = Math.atan2(e.y - p.y, e.x - p.x); e.coilC = { x: p.x, y: p.y }; e.coilStart = e.coilA; }
      e.coilA += dt * 2.4;
      const R = 270;
      e.x = clamp(e.coilC.x + Math.cos(e.coilA) * R, e.r, g.world.w - e.r);
      e.y = clamp(e.coilC.y + Math.sin(e.coilA) * R, e.r, g.world.h - e.r);
      e.fireT = (e.fireT ?? 0) - dt;
      if (e.fireT <= 0 && e.coilA - e.coilStart < Math.PI * 1.7) {
        e.fireT = 0.07;
        addZone(g, { x: e.x, y: e.y, r: 42, t: 3.2, tick: 0.5, dmg: e.dmg * 0.3, effect: "burn", kind: "fire" });
      }
      if (e.coilA - e.coilStart > Math.PI * 2) { e.state = "idle"; e.t = 0; }
      break;
    }

    default:
      e.state = "idle"; e.t = 0;
  }
}
