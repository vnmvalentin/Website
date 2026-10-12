// engine/constants.js — Maße und Physik-Werte von Flick Soccer (Scheiben-Fußball nach dem Vorbild „Soccer Stars").
//
// Einheiten: Spielfeld-Einheiten (1 Einheit ≈ 1 Pixel bei 1000 px Feldbreite) und Sekunden. Das Feld liegt quer:
// x = 0 … W von Tor zu Tor, y = 0 … H von Bande zu Bande. Die Tore sind Kästen HINTER der Torlinie (x < 0 bzw. x > W),
// in die Scheiben und Ball hineinrollen können — wie im Original.
//
// Verhältnisse (aus dem Original nachgemessen, gerundet):
//   Feld            Länge : Breite ≈ 1,56 : 1
//   Spielerscheibe  Durchmesser ≈ 1/14,7 der Feldlänge (knapp 1/9,4 der Feldbreite)
//   Ball            Durchmesser ≈ 0,56 × Scheibe
//   Tormund         ≈ 31 % der Feldbreite, also gut drei Scheiben breit
//
// Diese Datei wird mit dem Rest von engine/ ins Backend gespiegelt (Backend/flickSoccer/tools/spiegel.js) — der Server
// rechnet jeden Schuss mit genau demselben Code nach. Nur Grundrechenarten und Math.sqrt verwenden (IEEE-genau, auf jeder
// Maschine bitgleich); kein Math.sin/cos/exp in der Simulation.

export const FIELD = Object.freeze({
  W: 1000,
  H: 640,
  GOAL_W: 200, // lichte Weite des Tors (y-Richtung)
  GOAL_D: 58, // Tiefe des Torkastens hinter der Linie
  CENTER_R: 92, // Mittelkreis (nur Zeichnung + Anstoß-Aufstellung)
});

export const PIECE = Object.freeze({ R: 34, M: 1 });
export const BALL = Object.freeze({ R: 19, M: 0.55 });

export const TEAM_SIZE = 5;

export const PHYS = Object.freeze({
  DT: 1 / 240, // fester Zeitschritt; bei Höchsttempo wandert der Ball ~10 Einheiten pro Schritt (< Radius → kein Durchtunneln)
  MAX_SHOT: 2000, // Startgeschwindigkeit einer Scheibe bei voller Kraft
  MAX_SPEED: 3200, // Sicherheitsdeckel nach Stößen
  // Reibung = konstante Bremsung (Gleitreibung) + geschwindigkeitsabhängiger Anteil (Luft/Filz). Der konstante Teil sorgt
  // dafür, dass Scheiben sichtbar „ausrollen" und dann stehen, statt ewig nachzukriechen.
  PIECE_DECEL: 380,
  PIECE_DAMP: 0.9,
  BALL_DECEL: 250,
  BALL_DAMP: 0.65,
  // Stoßzahlen (1 = verlustfrei)
  E_PIECE: 0.8, // Scheibe ↔ Scheibe
  E_BALL: 0.86, // Scheibe ↔ Ball
  E_WALL_PIECE: 0.7,
  E_WALL_BALL: 0.8,
  STOP_SPEED: 6, // darunter steht ein Körper
  MAX_STEPS: 240 * 14, // spätestens nach 14 s ist ein Zug vorbei
});

// Ziehen mit der Maus/dem Finger (Feld-Einheiten): Innerhalb von DEAD_ZONE um die Scheibe ist nichts gezielt —
// zurück auf die Scheibe ziehen und loslassen bricht ab. Volle Kraft bei DEAD_ZONE + MAX_DRAG.
export const AIM = Object.freeze({ DEAD_ZONE: 30, MAX_DRAG: 170, MIN_POWER: 0.04 });

// Torblockade verhindern (wie im Original): Liegt eine Scheibe nach einem Zug mit ihrer Mitte hinter der Torlinie, wird
// sie wieder herausgeschoben — deutlich vor das Tor (EJECT_DEPTHS: Abstand des Zielpunkts zur Torlinie) und dorthin, wo
// der Weg am freiesten ist (Zielpunkte im Abstand EJECT_SPREAD quer verteilt, bis EJECT_STEPS je Seite). Ab FREE_ENOUGH
// Einheiten Luft zu allem anderen gilt ein Weg als frei; dann zählt nur noch, wie gerade er ist. Höchstens EJECT_ROUNDS Anläufe.
export const GOAL_RULE = Object.freeze({ EJECT_DEPTHS: [100, 145], EJECT_SPREAD: 30, EJECT_STEPS: 6, FREE_ENOUGH: 20, EJECT_ROUNDS: 3 });

// Emotes im Online-Spiel: feste Reaktionen statt freiem Text (IDs im Protokoll — nie umbenennen)
export const EMOTES = Object.freeze({
  schoen: 'Schön!',
  glueck: 'Glück gehabt',
  ups: 'Ups',
  gg: 'Gutes Spiel',
});
export const EMOTE_IDS = Object.freeze(Object.keys(EMOTES));
export const EMOTE_COOLDOWN_MS = 2500;

export const RULES = Object.freeze({
  GOALS_TO_WIN: [1, 2, 3, 5],
  DEFAULT_GOALS: 2,
  TURN_SECONDS: [0, 10, 15, 20], // 0 = ohne Zugzeit
  DEFAULT_TURN_SECONDS: 15,
});

// Torwiederholung (optional, Einstellung „replay"): die letzten TAIL_STEPS Simulationsschritte des Torschusses in
// SPEED-facher Geschwindigkeit. Steht hier, weil der Server daraus die Wartezeit bis zum nächsten Zug berechnet.
export const REPLAY = Object.freeze({ TAIL_STEPS: 240 * 3, SPEED: 0.5, PAD_MS: 400 });

/** Dauer einer Torwiederholung in ms für einen Schuss mit `steps` Simulationsschritten. */
export function replayMs(steps) {
  const n = Math.min(steps, REPLAY.TAIL_STEPS);
  return Math.ceil(((n * PHYS.DT) / REPLAY.SPEED) * 1000) + REPLAY.PAD_MS;
}
