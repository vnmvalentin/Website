// engine/twists.js — das Spiel nach dem Sieg (Ausbauplan „av-meta“, November 2026): Wendungen und Zyklus-Druck.
//
// Wer Thunderwing besiegt, darf in den nächsten Zyklus weiter — und jede Welt danach zählt als „Tiefe“ (Bestenliste
// „Am weitesten gekommen“). Gemessen am Test-Bot wuchs die Stärke des Spielers dort aber mit: Erfahrung und Gold steigen
// mit der Gefahrenstufe, Gift und Brand ebenso, Ausweichen stapelt sich bis über 60 %. Ein Bot, der Thunderwing schlug,
// lebte nach 90 Minuten in Zyklus 4 noch und nahm in vielen Welten gar keinen Schaden. Zwei Dinge ändern das, beide erst
// ab Zyklus 2 (Zyklus 1 bleibt, wie er abgenommen wurde):
//
//   Wendung      Jeder Zyklus ab dem zweiten bringt eine Wendung, die das Spiel spürbar anders macht (TWISTS) — aus dem
//                Seed bestimmt (im Tageslauf also für alle dieselbe), nie zweimal hintereinander dieselbe.
//   Zyklus-Druck Mit jeder Welt jenseits des ersten Zyklus werden Gegner schneller und zahlreicher, Ausweichen wirkt
//                schwächer, und jeder Treffer kostet mindestens einen wachsenden Anteil des Lebens — Rüstung und Leben
//                allein tragen dann nicht mehr beliebig weit.
//
// Die Simulation fragt nur die Faktoren unten ab (tw…/loop…); welche Wendung gilt, rechnet sie aus Seed und Zyklus nach
// (auch nach dem Laden eines Spielstands, ohne gespeichertes Feld).
import { hashSeed, makeRng } from "./util.js";

/**
 * Die Wendungen. `mods` sind Faktoren (1 = unverändert); was fehlt, bleibt unverändert.
 *   enemySpeed enemyHp bossHp bossRage(Schwelle der Raserei als Anteil des Lebens) dealt taken heal gold xp
 *   horde(Zielmenge und Nachschub) giantEvery eliteChance championEvery price dodge
 */
export const TWISTS = Object.freeze({
  hast: { name: "Hast", desc: "Gegner bewegen sich 30 % schneller.", mods: { enemySpeed: 1.3 } },
  glaskanone: { name: "Glaskanone", desc: "Du machst 50 % mehr Schaden, nimmst aber auch 50 % mehr.", mods: { dealt: 1.5, taken: 1.5 } },
  flut: { name: "Menschenflut", desc: "Die Horde ist anderthalbmal so groß, jeder Kristall gibt 30 % mehr Erfahrung.", mods: { horde: 1.5, xp: 1.3 } },
  duerre: { name: "Dürre", desc: "Heilung wirkt nur halb, dafür fällt doppelt so viel Gold.", mods: { heal: 0.5, gold: 2 } },
  riesen: { name: "Zeit der Riesen", desc: "Kolosse kommen doppelt so oft.", mods: { giantEvery: 0.5 } },
  elite: { name: "Elitenzug", desc: "Elite dreimal so häufig, Champions doppelt so oft.", mods: { eliteChance: 3, championEvery: 0.5 } },
  zaeh: { name: "Zähe Brut", desc: "Gegner haben 40 % mehr Leben, Kisten und Schreine kosten die Hälfte.", mods: { enemyHp: 1.4, price: 0.5 } },
  tyrannen: { name: "Tyrannen", desc: "Bosse haben 60 % mehr Leben und toben vom ersten Treffer an.", mods: { bossHp: 1.6, bossRage: 1 } },
  nebel: { name: "Nebel", desc: "Ausweichen wirkt nicht, dafür heilt jede Heilung um 30 % mehr.", mods: { dodge: 0, heal: 1.3 } },
});
export const TWIST_IDS = Object.freeze(Object.keys(TWISTS));

/** Die Wendung eines Zyklus (loop 0 = erster Zyklus: keine). Rein aus Seed und Zyklus, nie zweimal hintereinander gleich. */
export function twistForLoop(seed, loop) {
  if (!loop || loop < 1) return null;
  let id = null;
  for (let l = 1; l <= loop; l++) {
    const prev = id;
    const pool = TWIST_IDS.filter((x) => x !== prev);
    id = makeRng(hashSeed(seed, "wendung", l)).pick(pool);
  }
  return id;
}

/** Die Wendung, die gerade gilt (zwischengespeichert je Zyklus) */
export function activeTwist(g) {
  if (g.twistLoop !== g.loop) {
    g.twistLoop = g.loop;
    g.twistId = twistForLoop(g.seed, g.loop);
  }
  return g.twistId;
}

const mod = (g, key) => {
  const id = activeTwist(g);
  const v = id ? TWISTS[id].mods[key] : undefined;
  return v === undefined ? 1 : v;
};
export const twEnemySpeed = (g) => mod(g, "enemySpeed");
export const twEnemyHp = (g) => mod(g, "enemyHp");
export const twBossHp = (g) => mod(g, "bossHp");
/** Schwelle der Boss-Raserei: null = wie sonst */
export const twBossRage = (g) => { const id = activeTwist(g); return id && TWISTS[id].mods.bossRage !== undefined ? TWISTS[id].mods.bossRage : null; };
export const twDealt = (g) => mod(g, "dealt");
export const twTaken = (g) => mod(g, "taken");
export const twHeal = (g) => mod(g, "heal");
export const twGold = (g) => mod(g, "gold");
export const twXp = (g) => mod(g, "xp");
export const twHorde = (g) => mod(g, "horde");
export const twGiantEvery = (g) => mod(g, "giantEvery");
export const twEliteChance = (g) => mod(g, "eliteChance");
export const twChampionEvery = (g) => mod(g, "championEvery");
export const twPrice = (g) => mod(g, "price");
export const twDodge = (g) => mod(g, "dodge");

// ── Zyklus-Druck ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Welten pro Zyklus (BIOMES in data/biomes.js); der Druck beginnt mit der ersten Welt des zweiten Zyklus */
export const WORLDS_PER_LOOP = 6;

/** Welten jenseits des ersten Zyklus: 0 im ersten Zyklus, 1 in der ersten Welt von Zyklus 2 … */
export const beyond = (g) => Math.max(0, g.stagesCleared - (WORLDS_PER_LOOP - 1));

/** Tiefe = die Welt, in der man gerade ist, über alle Zyklen gezählt (1 … 6 im ersten Zyklus, 7 = Zyklus 2, Welt 1) */
export const depthOf = (g) => g.stagesCleared + 1;

// Werte abgestimmt am Test-Bot (engine/__tests__/balance.mjs, Zyklen weitergespielt): siehe Kopf dieser Datei und
// docs/adventures/PLANUNG_CONTENT.md
export const LOOP = Object.freeze({
  speedPerWorld: 0.08, speedMax: 1.8,
  hordeCapPerWorld: 60, hordeCapMax: 1100,
  rateCapPerWorld: 4, rateCapMax: 80,
  dodgePerWorld: 0.1, dodgeMin: 0.2,
  floorPerWorld: 0.025, floorMax: 0.3,
});
export const loopEnemySpeed = (g) => Math.min(LOOP.speedMax, 1 + LOOP.speedPerWorld * beyond(g));
export const loopHordeCap = (g) => Math.min(LOOP.hordeCapMax, 700 + LOOP.hordeCapPerWorld * beyond(g));
export const loopRateCap = (g) => Math.min(LOOP.rateCapMax, 50 + LOOP.rateCapPerWorld * beyond(g));
export const loopDodge = (g) => Math.max(LOOP.dodgeMin, 1 - LOOP.dodgePerWorld * beyond(g));
/** Mindestschaden eines Treffers als Anteil des maximalen Lebens (nach Rüstung, vor Schild) */
export const loopHitFloor = (g) => Math.min(LOOP.floorMax, LOOP.floorPerWorld * beyond(g));

/**
 * Beute-Koeffizient: Erfahrung und Gold je Kill wachsen mit der Gefahrenstufe (combat.js killEnemy). Im ersten Zyklus
 * bleibt das so. Danach wächst die Gefahr exponentiell (×1,33 je Welt) — und mit ihr die Erfahrung, also die Stufe
 * (gemessen: Stufe 243 in Tiefe 19), die Segen der Kraft und die Feuerrate: der Schaden des Spielers lief exakt im
 * Takt mit dem Gegnerleben mit, und kein Gegnerwert konnte einen Lauf beenden. Ab Zyklus 2 wächst die Beute deshalb
 * oberhalb von LOOP_REWARD_FROM nur noch mit der Wurzel der Gefahr — die Horde zieht irgendwann davon.
 */
export const LOOP_REWARD_FROM = 20;
export const LOOP_REWARD_EXP = 0.5;
export function rewardCoeff(g) {
  if (beyond(g) <= 0 || g.coeff <= LOOP_REWARD_FROM) return g.coeff;
  return LOOP_REWARD_FROM * Math.pow(g.coeff / LOOP_REWARD_FROM, LOOP_REWARD_EXP);
}
