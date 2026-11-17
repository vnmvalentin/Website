// Moorhexe (Sumpf, ab Zyklus 2): hält Abstand und wirft. Giftkessel (Flaschen im Bogen, jede hinterlässt eine
// Giftlache), Fluch (Ring aus Giftkugeln, in Phase 2 ein zweiter versetzt), Ruf (Giftkröten im Ring um dich, Moorglubs bei ihr).
// In Phase 2 die Sumpfwelle: drei Ringe laufen nacheinander von ihr weg — man steht im Ring oder springt hindurch.

import { chooseAttack, bulletRing, moveToward, idleTime } from "./common.js";
import { addHazard, addZone } from "../combat.js";
import { spawnEnemy, findSpawnPoint } from "../enemies.js";
import { burst } from "../fx.js";
import { dist, clamp } from "../util.js";

const POISON = "#8be04e";
const MUD = "#7a8a3a";
const ATTACKS = [["kessel", 3], ["fluch", 3], ["ruf", 2], ["welle", 3, { phase2Only: true }]];

export function update(g, e, dt) {
  const p = g.player;
  const d = dist(e.x, e.y, p.x, p.y);
  switch (e.state) {
    case "idle":
      e.pose = "run";
      if (d > 420) moveToward(e, p.x, p.y, e.speed, dt);
      else if (d < 260) moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, e.speed * 0.8, dt);
      else e.pose = "idle";
      if (e.t > idleTime(e, 1.4)) chooseAttack(g, e, ATTACKS);
      break;

    // Giftkessel: drei (Phase 2: fünf) Flaschen im Bogen, eine auf dich, eine dorthin, wo du hinläufst
    case "kessel": {
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        const n = e.phase2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          let x = p.x, y = p.y;
          if (i === 1 && p.moving) { x += Math.cos(p.moveAngle) * 180; y += Math.sin(p.moveAngle) * 180; }
          else if (i > 1) { const a = g.rng.range(0, Math.PI * 2), r = g.rng.range(120, 300); x += Math.cos(a) * r; y += Math.sin(a) * r; }
          x = clamp(x, 60, g.world.w - 60); y = clamp(y, 60, g.world.h - 60);
          addHazard(g, { shape: "circle", x, y, r: 90, delay: 1.1 + i * 0.12, dmg: e.dmg * 0.9, effect: "poison", color: POISON, lob: { x: e.x, y: e.y - 50 },
            onResolve: (gg, h) => { addZone(gg, { x: h.x, y: h.y, r: 80, t: 4.5, tick: 0.5, dmg: e.dmg * 0.18, effect: "poison", kind: "poison" }); burst(gg, h.x, h.y, POISON, 12, 200); } });
        }
      }
      if (e.t > 1.9) { e.state = "idle"; e.t = 0; }
      break;
    }

    // Fluch: ein Ring Giftkugeln, in Phase 2 kurz danach ein zweiter in die Lücken
    case "fluch":
      e.pose = "attack";
      if (e.step === 0) { e.step = 1; bulletRing(g, e, e.phase2 ? 18 : 14, 190, 0.55, "proj_poisonball", g.rng.next(), { effect: "poison" }); }
      if (e.phase2 && e.step === 1 && e.t > 0.5) { e.step = 2; bulletRing(g, e, 18, 190, 0.55, "proj_poisonball", Math.PI / 18 + g.rng.next() * 0.1, { effect: "poison" }); }
      if (e.t > 1.3) { e.state = "idle"; e.t = 0; }
      break;

    // Ruf: Giftkröten im Ring um dich (mit Abstand), dazu ein paar Moorglubs
    case "ruf":
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        addHazard(g, { shape: "circle", x: e.x, y: e.y, r: 140, delay: 0.7, dmg: 0, color: MUD });
      }
      if (e.step === 1 && e.t > 0.7) {
        e.step = 2;
        const n = e.phase2 ? 10 : 7;
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n;
          const x = clamp(p.x + Math.cos(a) * 280, 40, g.world.w - 40), y = clamp(p.y + Math.sin(a) * 280, 40, g.world.h - 40);
          spawnEnemy(g, "giftkroete", x, y, { minion: true });
        }
        for (let i = 0; i < 3; i++) {
          const q = findSpawnPoint(g, e.x, e.y, 60, 160, 16);
          if (q) spawnEnemy(g, "moorglub", q.x, q.y, { minion: true });
        }
        burst(g, e.x, e.y, MUD, 20, 260);
      }
      if (e.t > 1.4) { e.state = "idle"; e.t = 0; }
      break;

    // Sumpfwelle (nur Phase 2): drei Ringe nacheinander, jeder weiter draußen
    case "welle":
      e.pose = "attack";
      if (e.step === 0) {
        e.step = 1;
        for (let i = 0; i < 3; i++) {
          addHazard(g, { shape: "ring", x: e.x, y: e.y, rIn: 40 + i * 170, r: 170 + i * 170, delay: 0.9 + i * 0.45, dmg: e.dmg * 0.9, effect: "slow", color: MUD, shake: 3 });
        }
      }
      if (e.t > 2.4) { e.state = "idle"; e.t = 0; }
      break;

    default:
      e.state = "idle"; e.t = 0;
  }
}
