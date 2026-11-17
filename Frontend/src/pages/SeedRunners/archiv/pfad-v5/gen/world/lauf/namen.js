// lauf/namen.js — Namen der Lauflinie für Titel und Anzeige (ohne Importe: auch die Oberfläche liest sie, ui/levelRef.js,
// ohne den Generator mitzuladen).
//
// Ein Lauf-Level trägt in seinen Angaben (meta) die Großform als „Leitidee“ und „lauflinie“ als „Autor“ — so zeigen
// Ergebnis, Verlauf und Favoriten „Aufstieg · Lauflinie“ wie bei Pfad-Leveln „Seilakt · Akrobat“.

/** Autor-Kennung aller Lauf-Level */
export const LAUF_AUTOR = 'lauflinie';

/** Großformen (typen/lauf.js FORMEN): Leitidee-Kennung lauf-<form> → Name */
export const LAUF_FORMEN = Object.freeze({
  strom: 'Strom',
  hoch: 'Aufstieg',
  runter: 'Abstieg',
});

/** Leitidee-Kennung einer Großform */
export const laufIdee = (form) => `lauf-${form}`;

/** Name zu einer Leitidee-Kennung lauf-<form>, sonst null */
export function laufIdeeName(id) {
  if (typeof id !== 'string' || !id.startsWith('lauf-')) return null;
  return LAUF_FORMEN[id.slice(5)] || null;
}
