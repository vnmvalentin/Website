// Die Registry der Kernideen: alle an einer Stelle, Auswahl per Seed — spiegelt world/registry.js.
//
// Eine neue Kernidee ist EINE Datei unter ideen/ plus eine Zeile hier.

import { createRng } from '../../../sim/rng.js';
import { forderIdee, passtZuWelttyp } from './vertrag.js';
import saegenTakt from './saegenTakt.js';
import laserAmpeln from './laserAmpeln.js';
import einElement from './einElement.js';
import schluesselkette from './schluesselkette.js';
import zweiWege from './zweiWege.js';
import broeckelkette from './broeckelkette.js';
import sprungpadKetten from './sprungpadKetten.js';
import deckeLebt from './deckeLebt.js';
import wandsprungSchluchten from './wandsprungSchluchten.js';

// Reihenfolge bedeutungslos, aber stabil halten (siehe world/registry.js — dieselbe Begründung).
const MODULE = [saegenTakt, laserAmpeln, einElement, schluesselkette, zweiWege, broeckelkette, sprungpadKetten, deckeLebt, wandsprungSchluchten];

export const IDEEN = Object.freeze(Object.fromEntries(MODULE.map((m) => [forderIdee(m).id, m])));
export const IDEEN_IDS = Object.freeze(Object.keys(IDEEN));

export const istIdee = (id) => Object.prototype.hasOwnProperty.call(IDEEN, id);

/**
 * Kernidee UND Intensität für dieses Level — oder keine, wenn kein passende Idee existiert (bei nur
 * 3 Ideen für inzwischen 4 Welttypen ist "keine" ein ehrliches Ergebnis, keine Notlösung).
 *
 * Verteilung (PLANUNG_WELTTYPEN.md §4): ~65 % normal, ~25 % stark, ~10 % Extrem. Der Extrem-Katalog
 * (§3 dort) ist noch nicht gebaut — bis dahin fällt eine gewürfelte "extrem"-Stufe auf "stark"
 * zurück. Das ist EINE Wurf-Entscheidung mit einem Nachbearbeitungsschritt, kein zweiter Wurf: Ein
 * zweiter `rng`-Aufruf für denselben Entscheid würde den Verbrauch des Stroms verschieben, sobald
 * die Extrem-Varianten dazukommen — dann ändert sich für jeden bestehenden Seed die Kernidee.
 *
 * Eigener Teilstrom ('v2:kernidee'), unabhängig von der Welttyp-Wahl ('v2:welttyp') — eine spätere
 * Kernidee darf dazukommen, ohne dass sich verschiebt, WELCHEN Welttyp ein Seed bekommt.
 *
 * @param {string|number} seed
 * @param {string} welttypId
 * @param {string|null} [wunsch]  fester Idee-id (Werkbank, Tests); `null` erzwingt "keine"; unbekannte/unpassende Namen fallen auf die normale Wahl zurück
 */
export function waehleIdee(seed, welttypId, wunsch) {
  const passende = IDEEN_IDS.filter((id) => passtZuWelttyp(IDEEN[id], welttypId));
  if (wunsch === null) return { idee: null, tier: 'keine' };
  if (wunsch && istIdee(wunsch) && passende.includes(wunsch)) return { idee: IDEEN[wunsch], tier: 'stark' };
  if (!passende.length) return { idee: null, tier: 'keine' };

  const rng = createRng(seed, 'v2:kernidee');
  let tier = rng.weighted(['normal', 'stark', 'extrem'], [65, 25, 10]);
  if (tier === 'extrem') tier = 'stark';
  const id = rng.pick(passende);
  return { idee: IDEEN[id], tier };
}
