// Tempo-Klassen: "Normal", "Schnell", "Super schnell".
//
// Eine Klasse ist ein Parameter des LEVELS, nicht des Spielers: Alle Spieler einer Runde spielen
// dieselbe Klasse (der Host wählt sie in der Lobby, der Server verteilt sie mit dem Seed). Nur so
// sind Zeiten vergleichbar und das Level für alle gleich schaffbar.
//
// Was eine Klasse ändert: das HORIZONTALE Tempo — Laufen, Beschleunigung, Dash, Dash-Jump,
// Wandsprung-Abstoß, Grapple-Schwung. Was sie NICHT ändert: Sprunghöhe, Schwerkraft und alle
// Zeitfenster (Coyote, Buffer, Dash-Dauer). So bleibt jede senkrechte Aufgabe (Kanten, Schächte)
// in jeder Klasse gleich hoch, und nur die Lücken werden breiter — genau das, was der Generator
// über die gemessene Reichweite (reach.js) anpasst.
//
// Die Multiplikatoren wirken auf die Standardwerte aus config.js. Feintuning einzelner Werte
// bleibt im Dev-Panel möglich; eine Klasse ist nur der Ausgangspunkt.

import { TUNING } from './config.js';

// Nur diese Werte skalieren; der Rest bleibt wie im Standard.
const HORIZONTAL_KEYS = [
  'runMaxSpeed', 'groundAccel', 'groundDecel', 'airAccel', 'airDecel', 'overSpeedDrag',
  'dashSpeed', 'dashEndSpeed', 'dashJumpSpeedX', 'wallJumpSpeedX', 'wallJumpDashSpeedX',
  'grappleSwingAccel', 'grappleMaxSpeed',
];

// Beschleunigungen wachsen mit dem Tempo, damit die Zeit bis zum Höchsttempo gleich bleibt —
// sonst fühlt sich "Schnell" nach trägem Anlauf an. Dash und Wandsprung wachsen weniger stark,
// weil sie sonst über jede Wand und jede Kante hinausschießen.
const CLASS_MULTIPLIERS = {
  normal: {},
  fast: {
    runMaxSpeed: 1.3, groundAccel: 1.3, groundDecel: 1.3, airAccel: 1.3, airDecel: 1.3, overSpeedDrag: 1.3,
    dashSpeed: 1.2, dashEndSpeed: 1.2, dashJumpSpeedX: 1.25, wallJumpSpeedX: 1.15, wallJumpDashSpeedX: 1.2,
    grappleSwingAccel: 1.15, grappleMaxSpeed: 1.15,
  },
  super: {
    runMaxSpeed: 1.65, groundAccel: 1.65, groundDecel: 1.65, airAccel: 1.65, airDecel: 1.65, overSpeedDrag: 1.65,
    dashSpeed: 1.4, dashEndSpeed: 1.4, dashJumpSpeedX: 1.5, wallJumpSpeedX: 1.3, wallJumpDashSpeedX: 1.4,
    grappleSwingAccel: 1.3, grappleMaxSpeed: 1.3,
  },
};

export const SPEED_CLASSES = Object.freeze({
  normal: { id: 'normal', label: 'Normal', description: 'Das Standardtempo.',
    // Wie viel länger das Level für dieselbe Spielzeit sein muss (schneller = mehr Strecke)
    lengthFactor: 1 },
  fast: { id: 'fast', label: 'Schnell', description: 'Etwas mehr Tempo, breitere Lücken.', lengthFactor: 1.25 },
  super: { id: 'super', label: 'Super schnell', description: 'Sehr schnell, sehr weite Sprünge.', lengthFactor: 1.5 },
});

export const SPEED_CLASS_IDS = Object.keys(SPEED_CLASSES);

/** Werte, die eine Klasse gegenüber dem Standard ändert: { runMaxSpeed: 182, … } (leer für "normal"). */
export function classTuning(classId) {
  const mult = CLASS_MULTIPLIERS[classId];
  if (!mult) throw new Error(`Unbekannte Tempo-Klasse "${classId}"`);
  const out = {};
  for (const key of HORIZONTAL_KEYS) {
    if (mult[key]) out[key] = Math.round(TUNING[key] * mult[key]);
  }
  return out;
}

/**
 * Wie classTuning, aber für JEDEN Wert, den irgendeine Klasse ändert — auch für "normal" (dort die
 * Standardwerte). Damit lässt sich beim Klassenwechsel im Dev-Panel alles sauber zurücksetzen.
 */
export function classValues(classId) {
  const changed = classTuning(classId);
  const out = {};
  for (const key of HORIZONTAL_KEYS) out[key] = changed[key] !== undefined ? changed[key] : TUNING[key];
  return out;
}

export const isSpeedClass = (id) => Object.prototype.hasOwnProperty.call(SPEED_CLASSES, id);
