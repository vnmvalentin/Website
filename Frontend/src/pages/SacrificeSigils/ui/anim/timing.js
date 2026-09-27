// ui/anim/timing.js — Dauer und Reihenfolge je Ereignis. Jedes Ereignis hat genau eine Animation.
//   pre   Animation läuft VOR dem Anwenden (Karte zerreißt, danach verschwindet sie)
//   post  Ereignis wird angewandt, dann läuft die Animation auf dem neuen Zustand (Karte landet)
//   sound Sound-Key (audio/sound.js), optional mit Menge

/** @type {Record<string, { ms: number, when?: "pre"|"post", sound?: string }>} */
export const EVENT_TIMING = {
  battleStart: { ms: 500, sound: "turn" },
  turnStart: { ms: 420, sound: "turn" },
  candleWarning: { ms: 250 },
  wax: { ms: 140 },
  bones: { ms: 260, sound: "bones" },
  spend: { ms: 120 },
  draw: { ms: 340, sound: "draw" },
  handAdd: { ms: 300, sound: "draw" },
  burn: { ms: 350, sound: "fire" },
  discard: { ms: 300, sound: "draw" },
  mustDiscard: { ms: 0 },
  play: { ms: 520, sound: "place" },
  spawn: { ms: 380, sound: "place" },
  revive: { ms: 600, sound: "transform" },
  sacrifice: { ms: 620, when: "pre", sound: "sacrifice" },
  undying: { ms: 300 },
  attackPhase: { ms: 150 },
  firstTurnNoAttack: { ms: 900 },
  attack: { ms: 430, sound: "attack" },
  lured: { ms: 200 },
  damage: { ms: 330, sound: "hit" },
  overflow: { ms: 620, sound: "hit" },
  deathtouch: { ms: 250 },
  shield: { ms: 320, sound: "creak" },
  death: { ms: 520, when: "pre", sound: "death" },
  shed: { ms: 450, when: "pre", sound: "death" },
  move: { ms: 320 },
  turnAround: { ms: 80 },
  submerge: { ms: 420, sound: "splash" },
  surface: { ms: 330, sound: "splash" },
  buff: { ms: 300 },
  debuff: { ms: 300 },
  heal: { ms: 260 },
  transform: { ms: 760, when: "pre", sound: "transform" },
  devour: { ms: 480, sound: "hit" },
  scale: { ms: 480, sound: "scale" },
  wick: { ms: 160 },
  stunned: { ms: 260 },
  hammer: { ms: 380, sound: "hit" },
  item: { ms: 480, sound: "seal" },
  decay: { ms: 450, sound: "death" },
  deckEmpty: { ms: 200 },
  candle: { ms: 520, sound: "fire" },
  seer: { ms: 200 },
  seerDone: { ms: 0 },
  playFizzle: { ms: 200 },
  timeout: { ms: 300 },
  chainLimit: { ms: 0 },
  turnEnd: { ms: 120 },
  battleEnd: { ms: 1500 },
  battleResult: { ms: 200, sound: "coins" },
  phase: { ms: 0 },
};

/** @param {string} type @param {number} speed @param {boolean} reduced */
export function durationFor(type, speed, reduced) {
  const t = EVENT_TIMING[type];
  if (!t) return 0;
  const base = t.ms / (speed || 1);
  return reduced ? Math.min(base, 120) * 0.6 : base;
}
