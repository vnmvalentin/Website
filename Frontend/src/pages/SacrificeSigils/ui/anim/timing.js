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
  salt: { ms: 260 },
  // Gezeiten-Zirkel: Wasserstand wechselt (Brandung), Schlick, Tintenwolke, Heimkehr vorgemerkt
  tide: { ms: 1100, sound: "splash" },
  glued: { ms: 380 },
  inked: { ms: 420, sound: "splash" },
  returnQueued: { ms: 300 },
  // Moorwanderung: Boss wechselt die Phase, Hausregel greift
  bossPhase: { ms: 1600, sound: "transform" },
  ruleFired: { ms: 520, sound: "creak" },
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

/**
 * Takt am neuen Tisch (ui/table, Rebuild Phase 2). Dort laufen die Gesten in der 3D-Szene von selbst weiter; die Zahl
 * hier ist deshalb nicht die Länge der Geste, sondern der Abstand bis zum NÄCHSTEN Ereignis. So überlappen sich die
 * Abläufe: der Treffer fällt mit dem Ende des Stoßes zusammen, der Rückweg läuft schon unter dem nächsten Angriff.
 * Ziel (Plan): ein Angreifer ≤ 0,5 s bis zum Treffer, vier Angreifer ≤ 2,5 s.
 * Gleiche Schlüssel wie EVENT_TIMING; was hier nicht steht, übernimmt den alten Wert.
 * @type {Record<string, { ms: number, when?: "pre"|"post", sound?: string }>}
 */
export const TABLE_TIMING = {
  ...EVENT_TIMING,
  battleStart: { ms: 500, sound: "turn" },
  turnStart: { ms: 380, sound: "turn" },
  tide: { ms: 700, sound: "splash" },
  bones: { ms: 60, sound: "bones" },
  spend: { ms: 60 },
  draw: { ms: 260, sound: "draw" },
  handAdd: { ms: 240, sound: "draw" },
  burn: { ms: 300, sound: "fire" },
  discard: { ms: 240, sound: "draw" },
  play: { ms: 380, sound: "place" },
  spawn: { ms: 280, sound: "place" },
  revive: { ms: 480, sound: "transform" },
  // „pre“: die Geste beginnt, nach ms verschwindet die Karte aus dem Stand — die Szene spielt das Vergehen zu Ende
  sacrifice: { ms: 260, when: "pre", sound: "sacrifice" },
  undying: { ms: 240 },
  attackPhase: { ms: 120 },
  firstTurnNoAttack: { ms: 500 },
  // Stoß: Ausholen + Vorschnellen dauern 200 ms, dann folgt sofort der Treffer; der Rückweg läuft von selbst
  attack: { ms: 200, sound: "attack" },
  lured: { ms: 160 },
  damage: { ms: 170, sound: "hit" },
  overflow: { ms: 120, sound: "hit" },
  deathtouch: { ms: 180 },
  shield: { ms: 220, sound: "creak" },
  // Tod: das Zerreißen dauert in der Szene 0,6 s, das Spiel geht schon nach 0,14 s weiter
  death: { ms: 140, when: "pre", sound: "death" },
  shed: { ms: 140, when: "pre", sound: "death" },
  wanderStart: { ms: 120 },
  moveBlocked: { ms: 220, sound: "creak" },
  move: { ms: 240 },
  turnAround: { ms: 60 },
  submerge: { ms: 260, sound: "splash" },
  surface: { ms: 240, sound: "splash" },
  buff: { ms: 180 },
  debuff: { ms: 180 },
  heal: { ms: 180 },
  transform: { ms: 420, when: "pre", sound: "transform" },
  devour: { ms: 300, sound: "hit" },
  // Gewicht fliegt in die Schale: die Waage ist der Moment, auf den man schaut — etwas mehr Luft
  scale: { ms: 240, sound: "scale" },
  wick: { ms: 200 },
  stunned: { ms: 180 },
  hammer: { ms: 360, sound: "hammer" },
  item: { ms: 380, sound: "seal" },
  decay: { ms: 260, sound: "death" },
  deckEmpty: { ms: 200 },
  candle: { ms: 500, sound: "fire" },
  timeout: { ms: 300 },
  turnEnd: { ms: 120 },
  battleEnd: { ms: 2400 },
};

/**
 * Zuschlag am neuen Tisch für Ereignisse des Gegenübers (ms bei Tempo 1×): seine Hände führen sie aus und brauchen
 * dafür einen Moment — Karte greifen und legen, vom Stapel nehmen, den Stempel drücken, bevor der Angriff beginnt.
 * @type {Record<string, number>}
 */
export const TABLE_OPP_EXTRA = { play: 180, draw: 100, attackPhase: 280, sacrifice: 80 };

export const SPEEDS = [1, 1.5, 2];

/**
 * @param {string} type @param {number} speed @param {boolean} reduced
 * @param {Record<string, { ms: number }>} [table] Takt-Tabelle (Standard: EVENT_TIMING)
 */
export function durationFor(type, speed, reduced, table = EVENT_TIMING) {
  const t = table[type];
  if (!t) return 0;
  const base = t.ms / (speed || 1);
  return reduced ? Math.min(base, 120) * 0.6 : base;
}
