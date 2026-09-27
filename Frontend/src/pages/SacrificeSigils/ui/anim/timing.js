// ui/anim/timing.js — Dauer und Reihenfolge je Ereignis. Jedes Ereignis hat genau eine Animation.
// Grundtempo (1×) ist seit Runde 2 rund 1,6× langsamer als vorher; Tempo-Stufen: 1×, 1,5×, 2×.
//   pre   Animation läuft VOR dem Anwenden (Karte zerreißt, danach verschwindet sie)
//   post  Ereignis wird angewandt, dann läuft die Animation auf dem neuen Zustand (Karte landet)
//   sound Sound-Key (audio/sound.js), optional mit Menge

/** @type {Record<string, { ms: number, when?: "pre"|"post", sound?: string }>} */
export const EVENT_TIMING = {
  battleStart: { ms: 800, sound: "turn" },
  turnStart: { ms: 670, sound: "turn" },
  candleWarning: { ms: 400 },
  wax: { ms: 220 },
  bones: { ms: 420, sound: "bones" },
  spend: { ms: 190 },
  draw: { ms: 540, sound: "draw" },
  handAdd: { ms: 480, sound: "draw" },
  burn: { ms: 560, sound: "fire" },
  discard: { ms: 480, sound: "draw" },
  mustDiscard: { ms: 0 },
  play: { ms: 830, sound: "place" },
  spawn: { ms: 610, sound: "place" },
  revive: { ms: 960, sound: "transform" },
  sacrifice: { ms: 990, when: "pre", sound: "sacrifice" },
  undying: { ms: 480 },
  attackPhase: { ms: 240 },
  firstTurnNoAttack: { ms: 1100 },
  // Angriff (Runde 2, C2): Anheben ~250 ms → Ausholen ~150 ms → Stoß ~200 ms; die Karte bleibt vorgestoßen, bis
  // attackReturn (Rückweg ~300 ms mit Landung + ~150 ms Pause) sie zurückholt. Einschlag = damage/shield/overflow.
  attack: { ms: 600, sound: "attack" },
  attackReturn: { ms: 450 },
  lured: { ms: 320 },
  damage: { ms: 530, sound: "hit" },
  overflow: { ms: 990, sound: "hit" },
  deathtouch: { ms: 400 },
  shield: { ms: 510, sound: "creak" },
  death: { ms: 830, when: "pre", sound: "death" },
  shed: { ms: 720, when: "pre", sound: "death" },
  wanderStart: { ms: 350 },
  moveBlocked: { ms: 420, sound: "creak" },
  move: { ms: 420 },
  turnAround: { ms: 130 },
  submerge: { ms: 670, sound: "splash" },
  surface: { ms: 530, sound: "splash" },
  buff: { ms: 480 },
  debuff: { ms: 480 },
  heal: { ms: 420 },
  transform: { ms: 1220, when: "pre", sound: "transform" },
  devour: { ms: 770, sound: "hit" },
  scale: { ms: 770, sound: "scale" },
  wick: { ms: 480 },
  stunned: { ms: 420 },
  hammer: { ms: 610, sound: "hit" },
  item: { ms: 770, sound: "seal" },
  decay: { ms: 720, sound: "death" },
  deckEmpty: { ms: 320 },
  candle: { ms: 830, sound: "fire" },
  seer: { ms: 320 },
  seerDone: { ms: 0 },
  playFizzle: { ms: 320 },
  timeout: { ms: 480 },
  chainLimit: { ms: 0 },
  turnEnd: { ms: 190 },
  battleEnd: { ms: 2400 },
  battleResult: { ms: 320, sound: "coins" },
  phase: { ms: 0 },
};

export const SPEEDS = [1, 1.5, 2];

/** @param {string} type @param {number} speed @param {boolean} reduced */
export function durationFor(type, speed, reduced) {
  const t = EVENT_TIMING[type];
  if (!t) return 0;
  const base = t.ms / (speed || 1);
  return reduced ? Math.min(base, 120) * 0.6 : base;
}
