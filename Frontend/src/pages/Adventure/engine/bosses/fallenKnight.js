// Gefallener Ritter (Verlies, alternativ zum Nekromantenfürsten): Ausfall mit Nachschlag, weiter Schwerthieb vor sich,
// Schildwache (blockt Geschosse von vorn, ruft Skelette, endet mit Druckwelle); in Phase 2 zusätzlich ein Schwertregen
// rund um dich und der Hieb kommt doppelt.

import { chooseAttack, moveToward, idleTime } from "./common.js";
import { addHazard, hurtPlayer } from "../combat.js";
import { spawnEnemy } from "../enemies.js";
import { shake, ring } from "../fx.js";
import { dist, dist2, clamp } from "../util.js";

const ATTACKS = [["lunge", 3], ["sweep", 3], ["guard", 2], ["swordRain", 3, { phase2Only: true }]];

function sweepAt(g, e, aim, delay) {
  for (const off of [-0.65, 0, 0.65]) {
    const a = aim + off;
    addHazard(g, { shape: "circle", x: e.x + Math.cos(a) * 110, y: e.y + Math.sin(a) * 110, r: 82, delay, dmg: e.dmg * 1.2, color: "#b04a5a" });
  }
}

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  e.facing = p.x < e.x ? -1 : 1;
  switch (e.state) {
    case "idle":
      e.pose = "run";
      // weit weg (z. B. nach einem Ausfall): schneller zurück, sonst steht er minutenlang außer Reichweite
      if (d > 150) moveToward(e, p.x, p.y, e.speed * (d > 400 ? 1.8 : 1), dt);
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.5)) chooseAttack(g, e, d < 260 ? [["sweep", 4], ["lunge", 1.5], ["guard", 1], ["swordRain", 2, { phase2Only: true }]] : ATTACKS);
      break;

    case "lunge":
      if (e.step === 0) {
        e.step = 1; e.pose = "attack";
        e.aimA = Math.atan2(p.y - e.y, p.x - e.x);
        // Ausfall endet knapp hinter dir statt quer über die Karte
        e.lungeT = clamp((d + 140) / 900, 0.25, 0.6);
        addHazard(g, { shape: "line", x: e.x, y: e.y, x2: e.x + Math.cos(e.aimA) * 900 * e.lungeT, y2: e.y + Math.sin(e.aimA) * 560, w: e.r * 1.4, delay: 0.8, dmg: 0, color: "#b04a5a" });
        e.hitThisLunge = false;
      } else if (e.step === 1 && e.t > 0.8) {
        e.step = 2; e.t = 0;
      } else if (e.step === 2) {
        e.pose = "run";
        e.x = clamp(e.x + Math.cos(e.aimA) * 900 * dt, e.r, g.world.w - e.r);
        e.y = clamp(e.y + Math.sin(e.aimA) * 900 * dt, e.r, g.world.h - e.r);
        if (!e.hitThisLunge && dist2(e.x, e.y, p.x, p.y) < (e.r + p.r) ** 2) { e.hitThisLunge = true; hurtPlayer(g, e.dmg * 1.3); }
        if (e.t > e.lungeT) {
          e.step = 3; e.t = 0; e.pose = "attack";
          addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 160, delay: 0.35, dmg: e.dmg * 1.2, color: "#b04a5a", shake: 5 });
        }
      } else if (e.step === 3 && e.t > 0.9) { e.state = "idle"; e.t = 0; }
      break;

    case "sweep":
      e.pose = "attack";
      if (e.step === 0) { e.step = 1; e.aimA = Math.atan2(p.y - e.y, p.x - e.x); sweepAt(g, e, e.aimA, 0.95); }
      if (e.phase2 && e.step === 1 && e.t > 0.9) { e.step = 2; sweepAt(g, e, Math.atan2(p.y - e.y, p.x - e.x), 0.7); }
      if (e.t > (e.phase2 ? 1.7 : 1.2)) { e.state = "idle"; e.t = 0; }
      break;

    case "guard":
      e.pose = "guard";
      e.guardUp = true;
      e.guardA = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.step === 0) {
        e.step = 1;
        const mine = g.enemies.filter((o) => o.summoner === e.uid && !o.dead).length;
        for (let i = 0; i < Math.min(2, 5 - mine); i++) {
          const a = e.guardA + Math.PI + (i ? 0.8 : -0.8);
          const m = spawnEnemy(g, "skeletonwarrior", e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90, { minion: true });
          if (m) m.summoner = e.uid;
        }
      }
      if (e.step === 1 && e.t > 1.6) { e.step = 2; addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 260, delay: 0.45, dmg: e.dmg * 1.1, color: "#b04a5a", shake: 7 }); }
      if (e.t > 2.2) { e.guardUp = false; e.state = "idle"; e.t = 0; }
      break;

    case "swordRain":
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        ring(g, p.x, p.y, 300, "#b04a5a", 0.5);
        for (let i = 0; i < 12; i++) {
          const a = (Math.PI * 2 * i) / 12 + g.rng.range(-0.2, 0.2);
          const r = i % 2 ? 150 : 260;
          const x = clamp(p.x + Math.cos(a) * r, 60, g.world.w - 60), y = clamp(p.y + Math.sin(a) * r, 60, g.world.h - 60);
          addHazard(g, { shape: "circle", x, y, r: 62, delay: 0.8 + i * 0.07, dmg: e.dmg * 1.1, color: "#c9c3d1", sword: true });
        }
        addHazard(g, { shape: "circle", x: p.x, y: p.y, r: 70, delay: 1.8, dmg: e.dmg * 1.3, color: "#c9c3d1", sword: true, shake: 4 });
      }
      if (e.t > 2.3) { shake(g, 3); e.state = "idle"; e.t = 0; }
      break;

    default:
      e.state = "idle"; e.t = 0;
  }
}
