// Frostwyrm (Frostgipfel, ab Zyklus 2 — der zweite Boss der Eiswelt): kreist in mittlerem Abstand. Eisatem als
// schwenkender Strahl aus Linien (friert ein), Eiszapfenregen (angekündigte Einschläge rund um dich), Sturzflug (die
// Bahn ist vorher zu sehen, dann stößt er hindurch). In Phase 2 der Blizzard: zwei versetzte Ringe aus Eis.

import { chooseAttack, bulletRing, moveToward, idleTime } from "./common.js";
import { addHazard, hurtPlayer } from "../combat.js";
import { burst, shake } from "../fx.js";
import { dist, clamp, distToSegment } from "../util.js";

const ICE = "#8fd8ff";
const ICE_HIT = "#e6f8ff";
const ATTACKS = [["atem", 3], ["zapfen", 3], ["sturz", 2], ["blizzard", 2, { phase2Only: true }]];

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle": {
      // Kreist um dich: Abstand halten, seitlich ziehen
      e.pose = "fly";
      const a = Math.atan2(e.y - p.y, e.x - p.x) + dt * 0.6;
      const want = 300;
      const tx = p.x + Math.cos(a) * want;
      const ty = p.y + Math.sin(a) * want;
      moveToward(e, tx, ty, e.speed * (d > 460 ? 1.3 : 0.8), dt);
      if (e.t > idleTime(e, 1.3)) chooseAttack(g, e, ATTACKS);
      break;
    }

    // Eisatem: neun Linien, die nacheinander von links nach rechts über dich schwenken
    case "atem": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const base = Math.atan2(p.y - e.y, p.x - e.x);
        const dir = g.rng.chance(0.5) ? 1 : -1;
        const n = e.phase2 ? 11 : 9;
        for (let i = 0; i < n; i++) {
          const a = base + dir * (i - (n - 1) / 2) * 0.13;
          addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(a) * 760, y2: e.y + Math.sin(a) * 760, w: 52, delay: 0.7 + i * 0.09, dmg: e.dmg * 0.8, effect: "freeze", color: ICE, impactColor: ICE_HIT });
        }
      }
      if (e.t > 2.0) { e.state = "idle"; e.t = 0; }
      break;
    }

    // Eiszapfenregen: Einschläge rund um dich, je einer genau auf dir, der Rest verstreut und gestaffelt
    case "zapfen": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const n = e.phase2 ? 14 : 9;
        for (let i = 0; i < n; i++) {
          const r = i === 0 ? 0 : g.rng.range(80, 360);
          const a = g.rng.range(0, Math.PI * 2);
          const x = clamp(p.x + Math.cos(a) * r, 40, g.world.w - 40);
          const y = clamp(p.y + Math.sin(a) * r, 40, g.world.h - 40);
          addHazard(g, { shape: "circle", x, y, r: 72, delay: 0.9 + (i % 4) * 0.25, dmg: e.dmg * 1.0, effect: "slow", color: ICE, impactColor: ICE_HIT });
        }
      }
      if (e.t > 2.1) { e.state = "idle"; e.t = 0; }
      break;
    }

    // Sturzflug: die Bahn ist 0,9 s zu sehen, dann stößt er in 0,35 s hindurch und bleibt am Ende kurz benommen
    case "sturz": {
      if (e.step === 0) {
        e.step = 1;
        e.pose = "attack";
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        e.sx = e.x; e.sy = e.y;
        e.tx = clamp(e.x + Math.cos(a) * 760, e.r, g.world.w - e.r);
        e.ty = clamp(e.y + Math.sin(a) * 760, e.r, g.world.h - e.r);
        addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.tx, y2: e.ty, w: e.r * 1.6, delay: 0.9, dmg: 0, color: ICE });
      }
      if (e.step === 1 && e.t > 0.9) {
        const k = Math.min(1, (e.t - 0.9) / 0.35);
        e.x = e.sx + (e.tx - e.sx) * k;
        e.y = e.sy + (e.ty - e.sy) * k;
        e.facing = e.tx < e.sx ? -1 : 1;
        if (!e.hitThisDive && distToSegment(p.x, p.y, e.sx, e.sy, e.x, e.y) < e.r * 0.8 + p.r) { e.hitThisDive = true; hurtPlayer(g, e.dmg * 1.4, { effect: "freeze" }); }
        if (k >= 1) { e.step = 2; e.hitThisDive = false; burst(g, e.x, e.y, ICE, 20, 280); shake(g, 6); }
      }
      if (e.step === 2) e.pose = "idle";
      if (e.t > 1.9) { e.state = "idle"; e.t = 0; }
      break;
    }

    // Blizzard (nur Phase 2): zwei Ringe aus Eis, der zweite versetzt — durch die Lücke des ersten
    case "blizzard":
      e.pose = "attack";
      if (e.step === 0) { e.step = 1; bulletRing(g, e, 20, 220, 0.6, "proj_iceball", g.rng.next(), { effect: "slow" }); }
      if (e.step === 1 && e.t > 0.55) { e.step = 2; bulletRing(g, e, 20, 220, 0.6, "proj_iceball", Math.PI / 20 + g.rng.next() * 0.1, { effect: "slow" }); }
      if (e.t > 1.4) { e.state = "idle"; e.t = 0; }
      break;

    default:
      e.state = "idle"; e.t = 0;
  }
}
