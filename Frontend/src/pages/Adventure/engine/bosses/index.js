// engine/bosses/index.js — Bosse erzeugen und ihren Automaten aufrufen.

import { BOSSES } from "../../data/bosses.js";
import { enemyHpMult, enemyDmgMult } from "../difficulty.js";
import { bossFrame } from "./common.js";
import { ascBossHp } from "../ascension.js";
import * as necromancer from "./necromancer.js";
import * as slimeKing from "./slimeKing.js";
import * as spiderQueen from "./spiderQueen.js";
import * as sandColossus from "./sandColossus.js";
import * as yetiAncient from "./yetiAncient.js";
import * as minotaurLord from "./minotaurLord.js";
import * as thunderwing from "./thunderwing.js";
import * as fallenKnight from "./fallenKnight.js";
import * as pharaoh from "./pharaoh.js";
import * as lavaWurm from "./lavaWurm.js";

const BEHAVIOUR = { necromancer, slimeKing, spiderQueen, sandColossus, yetiAncient, minotaurLord, thunderwing, fallenKnight, pharaoh, lavaWurm };

export function spawnBoss(g, id, x, y) {
  const def = BOSSES[id];
  const hp = def.hp * 1.5 * enemyHpMult(g.coeff) * (1 + 0.25 * g.loop) * ascBossHp(g);
  const e = {
    uid: g.nextUid++, type: id, bossId: id, name: def.name, isBoss: true, ai: "boss",
    x, y, r: def.r, hp, maxHp: hp, dmg: def.dmg * enemyDmgMult(g.coeff, g.difficulty), speed: def.speed,
    aggro: true, state: "intro", t: 0, step: 0, introT: 2.2, invuln: true, pose: "idle", facing: 1,
    kbx: 0, kby: 0, slowT: 0, slowPct: 0, freezeT: 0, burnT: 0, burnDps: 0, poison: [], flash: 0, contactCd: 0,
    attackAnimT: 9, spawnT: 0, reward: 0, jumpH: 0,
  };
  const beh = BEHAVIOUR[id];
  if (beh.onPhase2) e.onPhase2 = beh.onPhase2;
  // Thunderwing fliegt von oben ein
  if (id === "thunderwing") { e.jumpH = 700; e.airborne = true; }
  g.enemies.push(e);
  g.boss = e;
  return e;
}

export function updateBoss(g, e, dt) {
  if (e.bossId === "thunderwing" && e.introT > 0) {
    e.jumpH = Math.max(0, e.jumpH - dt * 420);
    e.pose = "fly";
    if (e.jumpH <= 0) e.airborne = false;
  }
  if (!bossFrame(g, e, dt)) return;
  BEHAVIOUR[e.bossId].update(g, e, dt);
}

export { spiderQueen };
