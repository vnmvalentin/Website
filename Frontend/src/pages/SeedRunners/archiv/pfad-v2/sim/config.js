// Alle Tuning-Werte von Seed Runners an EINER Stelle.
//
// Diese Datei gehört zur Sim und muss deshalb überall laufen, wo die Sim läuft: im Browser
// (Vite) genauso wie später headless in Node (Anti-Cheat-Replay, Tests). Deshalb reines ESM
// ohne DOM-Zugriff, und alle Importe innerhalb von sim/ tragen die Endung `.js` — Node löst
// Importe ohne Endung nicht auf, Vite schon.
//
// Einheiten: Pixel (Weltkoordinaten, y zeigt nach unten), Sekunden. Umgerechnet wird beim
// Gebrauch in Ticks (siehe `ticks()` in player.js). So bleiben die Werte lesbar, und jeder
// Wert lässt sich im Dev-Panel live verstellen.
//
// Was sich hier NICHT ändern lässt, ohne Läufe unvergleichbar zu machen, steht oben als
// Konstante (Tickrate, Tilegröße, Hitbox). Alles in TUNING_SPEC darf man frei nachjustieren —
// ändert man es allerdings nach dem Start von Rennen, sehen alle Spieler derselben Runde
// nur dann dasselbe, wenn alle dieselbe Version dieser Datei laufen haben.

export const TICK_HZ = 120;
export const TICK_DT = 1 / TICK_HZ;

export const TILE = 16;
export const PLAYER_W = 10;
export const PLAYER_H = 14;

// 1/√2 als Literal statt Math.sqrt(0.5): kein Rundungsspielraum, überall dasselbe Bitmuster.
export const DIAG = 0.7071067811865476;

// value  Standardwert
// min/max/step  Bereich des Sliders im Dev-Panel
// unit   nur Anzeige
// Reihenfolge der Gruppen = Reihenfolge im Panel.
export const TUNING_SPEC = {
  // ── Laufen ────────────────────────────────────────────────────────────────
  runMaxSpeed:     { value: 140,  min: 60,  max: 320,  step: 1,    unit: 'px/s',  group: 'Laufen', label: 'Lauftempo' },
  groundAccel:     { value: 1500, min: 200, max: 4000, step: 10,   unit: 'px/s²', group: 'Laufen', label: 'Beschleunigung am Boden' },
  groundDecel:     { value: 1900, min: 200, max: 4000, step: 10,   unit: 'px/s²', group: 'Laufen', label: 'Abbremsen am Boden' },
  turnAccelMult:   { value: 1.5,  min: 1,   max: 3,    step: 0.05, unit: '×',     group: 'Laufen', label: 'Umkehr-Faktor (Richtungswechsel)' },
  airAccel:        { value: 950,  min: 100, max: 3000, step: 10,   unit: 'px/s²', group: 'Laufen', label: 'Beschleunigung in der Luft' },
  airDecel:        { value: 380,  min: 0,   max: 3000, step: 10,   unit: 'px/s²', group: 'Laufen', label: 'Abbremsen in der Luft' },
  overSpeedDrag:   { value: 260,  min: 0,   max: 2000, step: 10,   unit: 'px/s²', group: 'Laufen', label: 'Abbau von Überschuss-Tempo' },

  // ── Sprung ────────────────────────────────────────────────────────────────
  jumpSpeed:        { value: 350, min: 150, max: 600,  step: 1,    unit: 'px/s',  group: 'Sprung', label: 'Absprunggeschwindigkeit' },
  gravity:          { value: 900, min: 200, max: 2500, step: 10,   unit: 'px/s²', group: 'Sprung', label: 'Schwerkraft' },
  fallGravityMult:  { value: 1.45, min: 1,  max: 3,    step: 0.05, unit: '×',     group: 'Sprung', label: 'Schwerkraft beim Fallen' },
  terminalSpeed:    { value: 380, min: 150, max: 800,  step: 5,    unit: 'px/s',  group: 'Sprung', label: 'Maximale Fallgeschwindigkeit' },
  apexThreshold:    { value: 55,  min: 0,   max: 200,  step: 1,    unit: 'px/s',  group: 'Sprung', label: 'Scheitelbereich (Tempo)' },
  apexGravityMult:  { value: 0.55, min: 0.1, max: 1,   step: 0.05, unit: '×',     group: 'Sprung', label: 'Schwerkraft im Scheitel' },
  jumpCutFactor:    { value: 0.45, min: 0,  max: 1,    step: 0.05, unit: '×',     group: 'Sprung', label: 'Tempo nach Loslassen' },
  jumpMinHoldTime:  { value: 0.06, min: 0,  max: 0.3,  step: 0.01, unit: 's',     group: 'Sprung', label: 'Mindest-Haltezeit' },
  coyoteTime:       { value: 0.1,  min: 0,  max: 0.3,  step: 0.01, unit: 's',     group: 'Sprung', label: 'Coyote Time' },
  jumpBufferTime:   { value: 0.1,  min: 0,  max: 0.3,  step: 0.01, unit: 's',     group: 'Sprung', label: 'Jump Buffer' },
  cornerCorrection: { value: 4,    min: 0,  max: 8,    step: 1,    unit: 'px',    group: 'Sprung', label: 'Ecken-Korrektur am Kopf' },
  airJumps:         { value: 1,    min: 0,  max: 3,    step: 1,    unit: '',      group: 'Sprung', label: 'Luftsprünge' },
  doubleJumpSpeed:  { value: 310,  min: 150, max: 600, step: 1,    unit: 'px/s',  group: 'Sprung', label: 'Luftsprung-Geschwindigkeit' },

  // ── Wand ──────────────────────────────────────────────────────────────────
  wallSlideSpeed:    { value: 55,   min: 10, max: 300, step: 1,    unit: 'px/s', group: 'Wand', label: 'Rutschtempo an der Wand' },
  wallJumpSpeedX:    { value: 165,  min: 50, max: 400, step: 1,    unit: 'px/s', group: 'Wand', label: 'Wandsprung horizontal' },
  wallJumpSpeedY:    { value: 335,  min: 150, max: 600, step: 1,   unit: 'px/s', group: 'Wand', label: 'Wandsprung vertikal' },
  wallJumpLockTime:  { value: 0.16, min: 0,  max: 0.5, step: 0.01, unit: 's',    group: 'Wand', label: 'Eingabesperre zur Wand hin' },
  wallCoyoteTime:    { value: 0.07, min: 0,  max: 0.3, step: 0.01, unit: 's',    group: 'Wand', label: 'Wand-Coyote-Time' },

  // ── Dash ──────────────────────────────────────────────────────────────────
  dashSpeed:         { value: 330,  min: 150, max: 700, step: 5,   unit: 'px/s', group: 'Dash', label: 'Dash-Tempo' },
  dashDuration:      { value: 0.14, min: 0.05, max: 0.4, step: 0.01, unit: 's',  group: 'Dash', label: 'Dash-Dauer' },
  dashEndSpeed:      { value: 170,  min: 0,  max: 400, step: 5,    unit: 'px/s', group: 'Dash', label: 'Tempo nach dem Dash' },
  dashCooldownTime:  { value: 0.25, min: 0,  max: 1,   step: 0.01, unit: 's',    group: 'Dash', label: 'Dash-Cooldown' },
  dashBufferTime:    { value: 0.1,  min: 0,  max: 0.3, step: 0.01, unit: 's',    group: 'Dash', label: 'Dash-Buffer (zu früh gedrückt)' },
  dashCharges:       { value: 1,    min: 1,  max: 3,   step: 1,    unit: '',     group: 'Dash', label: 'Dash-Ladungen' },
  dashTechWindow:    { value: 0.07, min: 0,  max: 0.3, step: 0.01, unit: 's',    group: 'Dash', label: 'Tech-Fenster nach dem Dash' },
  dashJumpSpeedX:    { value: 330,  min: 100, max: 600, step: 5,   unit: 'px/s', group: 'Dash', label: 'Dash-Jump: Tempo' },
  dashJumpHeightMult: { value: 0.9, min: 0.5, max: 1.2, step: 0.05, unit: '×',    group: 'Dash', label: 'Dash-Jump: Sprunghöhe' },
  wallJumpDashSpeedX: { value: 230, min: 100, max: 600, step: 5,  unit: 'px/s', group: 'Dash', label: 'Wandsprung nach Dash: Tempo' },

  // ── Grapple ───────────────────────────────────────────────────────────────
  grappleRange:        { value: 150, min: 60, max: 400, step: 5,   unit: 'px',   group: 'Grapple', label: 'Reichweite' },
  grappleMinLength:    { value: 24,  min: 8,  max: 100, step: 1,   unit: 'px',   group: 'Grapple', label: 'Kürzeste Seillänge' },
  grappleSwingAccel:   { value: 520, min: 0,  max: 1500, step: 10, unit: 'px/s²', group: 'Grapple', label: 'Schwung-Steuerung' },
  grappleReelSpeed:    { value: 90,  min: 0,  max: 300, step: 5,   unit: 'px/s', group: 'Grapple', label: 'Seil ein-/ausholen' },
  grappleGravityMult:  { value: 0.9, min: 0.2, max: 2,  step: 0.05, unit: '×',    group: 'Grapple', label: 'Schwerkraft am Seil' },
  grappleReleaseBoost: { value: 1.12, min: 1, max: 1.6, step: 0.01, unit: '×',    group: 'Grapple', label: 'Loslass-Boost' },
  grappleBoostMinHold: { value: 0.2, min: 0,  max: 1,   step: 0.01, unit: 's',    group: 'Grapple', label: 'Mindest-Schwingzeit für Boost' },
  grappleMaxSpeed:     { value: 460, min: 200, max: 900, step: 5,  unit: 'px/s', group: 'Grapple', label: 'Höchsttempo beim Loslassen' },
  grappleCooldown:     { value: 0.12, min: 0, max: 1,   step: 0.01, unit: 's',    group: 'Grapple', label: 'Cooldown' },
  grappleRefundsAirJump: { value: 1, min: 0,  max: 1,   step: 1,   unit: '',     group: 'Grapple', label: 'Loslassen füllt Luftsprünge (0/1)' },

  // ── Elemente (was sie mit der Bewegung des Spielers machen) ───────────────
  iceAccelMult:      { value: 0.2,  min: 0.02, max: 1,  step: 0.01, unit: '×',    group: 'Elemente', label: 'Eis: Beschleunigung' },
  iceDecelMult:      { value: 0.07, min: 0.01, max: 1,  step: 0.01, unit: '×',    group: 'Elemente', label: 'Eis: Abbremsen' },
  conveyorSpeed:     { value: 70,   min: 10, max: 200, step: 5,     unit: 'px/s', group: 'Elemente', label: 'Förderband-Tempo' },
  stickyClimbSpeed:  { value: 50,   min: 0,  max: 150, step: 5,     unit: 'px/s', group: 'Elemente', label: 'Klebrige Wand: Klettertempo' },
  springSpeed:       { value: 480,  min: 200, max: 800, step: 5,    unit: 'px/s', group: 'Elemente', label: 'Sprungpad: Abstoß' },
  ringSpeed:         { value: 380,  min: 150, max: 700, step: 5,    unit: 'px/s', group: 'Elemente', label: 'Boost-Ring: Tempo' },
};

// Parameter der Element-Module (Zeiten in Sekunden, Längen in Pixeln, sofern nicht anders
// angegeben). Sie beschreiben, wie sich ein Element VERHÄLT — nicht, was es mit dem Spieler
// macht (das steht oben in TUNING_SPEC). Chunk-Templates dürfen jeden Wert pro Element
// überschreiben; hier stehen nur die Standardwerte.
export const ELEMENT_PARAMS = {
  spike: { thickness: 7, warn: 0.5 },                                       // warn nur für ein-/ausfahrende Spikes
  saw: { radius: 7, speed: 70, orbitRadius: 3, turnsPerSecond: 0.3, count: 1 },  // orbitRadius in Tiles, count = Sägen auf derselben Bahn
  laser: { period: 2.4, on: 0.8, warn: 0.4, offset: 0, thickness: 4, spin: 0, reach: 10 },  // spin in U/s, reach in Tiles (nur drehend)
  fallingBlock: { range: 9, shake: 0.32, gravity: 1500, maxSpeed: 430, reset: 2.0, width: 1, height: 1, margin: 6 },   // range, Größe in Tiles, margin in px
  mover: { width: 3, speed: 45, thickness: 8, phase: 0 },                   // width in Tiles
  crumble: { delay: 0.28, respawn: 1.9 },
  spring: { cooldown: 0.15 },
  wind: { warn: 0.3 },                                                      // nur für Böen (period)
  ring: { radius: 9, cooldown: 1.2 },
  crystal: { radius: 7, respawn: 2.0 },
  portal: { radius: 8, cooldown: 0.45 },
  switch: { cooldown: 0.4 },
};

/** Standardwerte als flaches Objekt: { runMaxSpeed: 140, … } */
export const TUNING = Object.freeze(
  Object.fromEntries(Object.entries(TUNING_SPEC).map(([key, spec]) => [key, spec.value])),
);

/** Frische, veränderbare Kopie — die Welt hält ihre eigene, damit das Dev-Panel sie live ändern kann. */
export function createTuning(overrides) {
  return { ...TUNING, ...(overrides || {}) };
}
