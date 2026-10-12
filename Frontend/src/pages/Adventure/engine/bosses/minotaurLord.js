// Minotaurenfürst (Schlackefeld): Ansturm mit Feuerspur, Axtwirbel, Feuerregen und Stampfer; in Phase 2 drei
// Anstürme in Folge.

import { chooseAttack, moveToward, idleTime } from "./common.js";
import { addHazard, addZone, hurtPlayer } from "../combat.js";
import { burst, shake } from "../fx.js";
import { dist, dist2, clamp } from "../util.js";

const ATTACKS = [["charge", 3], ["axeSpin", 2], ["fireRain", 3], ["stomp", 2]];

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle":
      e.pose = "run";
      if (d > 220) moveToward(e, p.x, p.y, e.speed, dt);
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.3)) chooseAttack(g, e, d < 240 ? [["stomp", 3], ["axeSpin", 2]] : ATTACKS);
      break;

    case "charge": {
      const total = e.phase2 ? 3 : 1;
      e.chargeNo = e.chargeNo ?? 0;
      if (e.step === 0) {
        e.step = 1; e.t = 0;
        e.pose = "attack";
        e.aimA = Math.atan2(p.y - e.y, p.x - e.x);
        addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(e.aimA) * 760, y2: e.y + Math.sin(e.aimA) * 760, w: e.r * 1.6, delay: 0.7, dmg: 0, color: "#ff5a2e" });
        e.hitThisCharge = false;
      } else if (e.step === 1 && e.t > 0.7) {
        e.step = 2; e.t = 0;
      } else if (e.step === 2) {
        e.pose = "run";
        e.x = clamp(e.x + Math.cos(e.aimA) * 880 * dt, e.r, g.world.w - e.r);
        e.y = clamp(e.y + Math.sin(e.aimA) * 880 * dt, e.r, g.world.h - e.r);
        e.trailT = (e.trailT ?? 0) - dt;
        if (e.trailT <= 0) { e.trailT = 0.06; addZone(g, { x: e.x, y: e.y, r: 40, t: 3.5, tick: 0.5, dmg: e.dmg * 0.25, effect: "burn", kind: "fire" }); }
        if (!e.hitThisCharge && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) * (e.r + p.r)) { e.hitThisCharge = true; hurtPlayer(g, e.dmg * 1.6, { effect: "burn" }); }
        if (e.t > 0.86) {
          shake(g, 6);
          e.chargeNo++;
          if (e.chargeNo < total) { e.step = 0; e.t = 0; }
          else { e.chargeNo = 0; e.state = "idle"; e.t = 0; }
        }
      }
      break;
    }

    case "axeSpin":
      e.pose = "attack";
      e.spinning = e.t > 0.5;
      if (e.spinning) {
        moveToward(e, p.x, p.y, e.speed * 1.25, dt);
        e.spinTickT = (e.spinTickT ?? 0) - dt;
        if (e.spinTickT <= 0 && dist2(e.x, e.y, p.x, p.y) < (e.r * 1.35 + p.r) ** 2) { e.spinTickT = 0.5; hurtPlayer(g, e.dmg * 0.8); }
      }
      if (e.t > 3) { e.spinning = false; e.state = "idle"; e.t = 0; }
      break;

    case "fireRain": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const n = e.phase2 ? 12 : 8;
        for (let i = 0; i < n; i++) {
          const x = clamp(p.x + (i === 0 ? 0 : g.rng.range(-360, 360)), 60, g.world.w - 60);
          const y = clamp(p.y + (i === 0 ? 0 : g.rng.range(-360, 360)), 60, g.world.h - 60);
          addHazard(g, { shape: "circle", x, y, r: 88, delay: 0.9 + i * 0.1, dmg: e.dmg * 1.1, effect: "burn", color: "#ff7a2e", meteor: true,
            onResolve: (gg, h) => { addZone(gg, { x: h.x, y: h.y, r: 60, t: 3, tick: 0.5, dmg: e.dmg * 0.2, effect: "burn", kind: "fire" }); burst(gg, h.x, h.y, "#ff7a2e", 10, 200); } });
        }
      }
      if (e.t > 2.2) { e.state = "idle"; e.t = 0; }
      break;
    }

    case "stomp":
      e.pose = "attack";
      if (e.step === 0) { e.step = 1; addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 240, delay: 0.85, dmg: e.dmg * 1.5, effect: "burn", color: "#ff5a2e", shake: 9 }); }
      if (e.t > 1.4) { e.state = "idle"; e.t = 0; }
      break;

    default:
      e.state = "idle"; e.t = 0;
  }
}
