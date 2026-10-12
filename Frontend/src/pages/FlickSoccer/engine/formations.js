// engine/formations.js — Aufstellungen: fünf Scheiben (meist Torwart + vier Feldspieler). Angegeben für das LINKE
// Team als Anteil der Feldlänge (x, 0 = eigene Torlinie, 0,5 = Mittellinie) und Feldbreite (y). Das rechte Team wird
// gespiegelt. Alle Plätze liegen außerhalb des Mittelkreises, damit der Anstoß frei ist (engine.test.js prüft das).
// `code` ist die Kurzform für die Anzeige; die Schlüssel sind gespeicherte IDs (Browser-Einstellungen, Online-Räume) —
// nie umbenennen, nur neue hinzufügen.

import { FIELD } from './constants.js';

export const FORMATIONS = Object.freeze({
  '2-2': {
    name: 'Klassisch',
    code: '2-2',
    hint: 'Ausgewogen: zwei hinten, zwei vorne',
    spots: [[0.06, 0.5], [0.19, 0.3], [0.19, 0.7], [0.36, 0.22], [0.36, 0.78]],
  },
  '1-2-1': {
    name: 'Raute',
    code: '1-2-1',
    hint: 'Eine Spitze, die Mitte dicht',
    spots: [[0.06, 0.5], [0.17, 0.5], [0.28, 0.24], [0.28, 0.76], [0.37, 0.5]],
  },
  V: {
    name: 'Trichter',
    code: 'V',
    hint: 'V-Form: der Torwart ist die Spitze, die Flügel öffnen sich nach vorne',
    spots: [[0.06, 0.5], [0.17, 0.34], [0.17, 0.66], [0.29, 0.17], [0.29, 0.83]],
  },
  'reverse-v': {
    name: 'Umkehr-V',
    code: 'Λ',
    hint: 'Umgekehrtes V ohne Torwart: breit hinten, eine Spitze vorne',
    spots: [[0.15, 0.16], [0.15, 0.84], [0.26, 0.33], [0.26, 0.67], [0.37, 0.5]],
  },
  '3-1': {
    name: 'Bollwerk',
    code: '3-1',
    hint: 'Drei Verteidiger vor dem Tor',
    spots: [[0.06, 0.5], [0.17, 0.24], [0.15, 0.5], [0.17, 0.76], [0.36, 0.5]],
  },
  '1-3': {
    name: 'Sturm',
    code: '1-3',
    hint: 'Drei Angreifer an der Mittellinie',
    spots: [[0.06, 0.5], [0.19, 0.5], [0.36, 0.18], [0.37, 0.5], [0.36, 0.82]],
  },
  '2-1-1': {
    name: 'Pfeil',
    code: '2-1-1',
    hint: 'Gestaffelt durch die Mitte',
    spots: [[0.06, 0.5], [0.16, 0.32], [0.16, 0.68], [0.255, 0.5], [0.37, 0.5]],
  },
  zange: {
    name: 'Zange',
    code: '2+2',
    hint: 'Alles über die Flügel, die Mitte bleibt offen',
    spots: [[0.06, 0.5], [0.17, 0.16], [0.17, 0.84], [0.34, 0.12], [0.34, 0.88]],
  },
  schraege: {
    name: 'Schräge',
    code: '/',
    hint: 'Eine diagonale Kette quer übers Feld',
    spots: [[0.06, 0.5], [0.14, 0.82], [0.21, 0.6], [0.28, 0.38], [0.35, 0.16]],
  },
  '4-0': {
    name: 'Mauer',
    code: '4-0',
    hint: 'Alles vor dem eigenen Tor',
    spots: [[0.05, 0.5], [0.15, 0.17], [0.15, 0.39], [0.15, 0.61], [0.15, 0.83]],
  },
});

export const FORMATION_IDS = Object.freeze(Object.keys(FORMATIONS));
export const DEFAULT_FORMATION = '2-2';

export function isFormation(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(FORMATIONS, id);
}

/** Feld-Koordinaten der fünf Scheiben eines Teams (0 = links, 1 = rechts); field = Geometrie aus fields.js. */
export function formationSpots(id, team, field = FIELD) {
  const f = FORMATIONS[isFormation(id) ? id : DEFAULT_FORMATION];
  return f.spots.map(([fx, fy]) => {
    const x = fx * field.W;
    return { x: team === 0 ? x : field.W - x, y: fy * field.H, team };
  });
}
