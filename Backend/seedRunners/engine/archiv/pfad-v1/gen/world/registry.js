// Die Registry: alle Welttypen an einer Stelle, Auswahl per Seed.
//
// Ein neuer Welttyp ist EINE Datei unter typen/ plus eine Zeile hier. Mehr soll es nicht sein —
// das war die Bedingung des Umbaus.

import { forderVertrag } from './vertrag.js';
import { createRng } from '../../sim/rng.js';
import hoehlen from './typen/hoehlen.js';
import himmelsreich from './typen/himmelsreich.js';
import parcours from './typen/parcours.js';
import turm from './typen/turm.js';
import pfad from './typen/pfad.js';

// Reihenfolge ist bedeutungslos, aber stabil halten: Die Auswahl würfelt über die Liste, und eine
// Umsortierung würde alle Seeds verschieben.
const MODULE = [hoehlen, himmelsreich, parcours, turm, pfad];

/** id → Welttyp, geprüft. Ein Vertragsbruch fällt hier auf, nicht erst in einer Lobby. */
export const WELTTYPEN = Object.freeze(Object.fromEntries(
  MODULE.map((m) => [forderVertrag(m).id, m]),
));

export const WELTTYP_IDS = Object.freeze(Object.keys(WELTTYPEN));

export const istWelttyp = (id) => Object.prototype.hasOwnProperty.call(WELTTYPEN, id);

/**
 * Welttypen, die ein Seed OHNE Wunsch bekommen kann. Seit 26.09.2026 nur noch Pfad — die alten Typen sind stillgelegt,
 * nicht gelöscht: per ausdrücklichem Wunsch (Tests) bleiben sie baubar.
 */
export const ZUFALLS_TYPEN = Object.freeze(['pfad']);

/**
 * Welchen Welttyp bekommt dieser Seed?
 *
 * Eigener Teilstrom ('v2:welttyp'), damit spätere Änderungen an Layout, Terrain oder Elementen die
 * Typ-Wahl nicht verschieben — sonst wäre jeder Seed nach jeder Änderung eine andere Welt.
 *
 * @param {string|number} seed
 * @param {string} [wunsch]  fester Welttyp (Werkbank, Tests); unbekannte Namen werden ignoriert
 */
export function waehleWelttyp(seed, wunsch) {
  if (wunsch && istWelttyp(wunsch)) return WELTTYPEN[wunsch];
  const rng = createRng(seed, 'v2:welttyp');
  const ids = ZUFALLS_TYPEN;
  return WELTTYPEN[rng.weighted(ids, ids.map((id) => WELTTYPEN[id].gewicht ?? 1))];
}
