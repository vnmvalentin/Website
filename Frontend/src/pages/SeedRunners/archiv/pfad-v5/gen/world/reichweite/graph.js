// Zusammensetzung des Bewegungsgraphs aus den FÄHIGKEITEN eines Welttyps.
//
// Ein Welttyp meldet im Vertrag, welche Fähigkeiten seine Route benutzen darf (`faehigkeiten`).
// Diese Datei liest genau die an — nicht mehr, nicht weniger: Ein Himmelsreich mit `['boden',
// 'mover', 'grapple']` bekommt Grapple-Brücken, ein Hindernis-Parcours mit nur `['boden']` nicht.
// Das ist die Umsetzung der Vertragsregel "was angemeldet ist, MUSS der Graph auch können; was
// nicht angemeldet ist, darf die Welt nicht voraussetzen".

import { floodReachable, checkLevel as checkLevelKern } from '../../v2/reachability.js';
import { virtuelleMoverStaende } from '../faehigkeiten/mover.js';
import { virtuelleFederStaende } from '../faehigkeiten/feder.js';
import { baueGrappleBruecken } from '../faehigkeiten/grapple.js';
import { baueBausteinBruecken } from '../faehigkeiten/baustein.js';
import { baueStockwerkBruecken } from '../faehigkeiten/stockwerk.js';

/**
 * Baut den `zusatz`-Kontext für floodReachable()/checkLevel() aus einem fertigen Level.
 *
 * @param {object} level    mit level.meta.faehigkeiten, level.entities, level.rows, level.meta.anchors
 * @returns {{virtualStands: Set<string>, brueckenVon: Function}|undefined}
 *   undefined, wenn der Welttyp nur 'boden' kennt — dann bleibt das Verhalten exakt das alte.
 */
export function baueZusatz(level) {
  const faehigkeiten = new Set(level.meta?.faehigkeiten || ['boden']);
  if (faehigkeiten.size === 1 && faehigkeiten.has('boden')) return undefined;

  const virtualStands = new Set();
  if (faehigkeiten.has('mover')) for (const k of virtuelleMoverStaende(level.entities || [])) virtualStands.add(k);
  if (faehigkeiten.has('feder')) for (const k of virtuelleFederStaende(level.entities || [], level.rows)) virtualStands.add(k);
  // Pfad: Bröckel- und Farbblöcke sind Elemente, keine Kacheln — man steht auf ihnen; die Sim hat jeden Zug davon geprüft
  if (faehigkeiten.has('pfad')) for (const e of level.entities || []) if (e.type === 'crumble' || e.type === 'colorBlock') virtualStands.add(`${e.tx},${e.ty - 1}`);

  const bruecken = [];
  if (faehigkeiten.has('grapple')) {
    const anker = level.meta?.anchors || [];
    bruecken.push(baueGrappleBruecken(anker, level.rows, virtualStands));
  }
  if (faehigkeiten.has('baustein')) bruecken.push(baueBausteinBruecken(level.meta?.bausteine));
  if (faehigkeiten.has('stockwerk')) bruecken.push(baueStockwerkBruecken(level.meta?.stockwerke));
  // „pfad“: jeder Zug des Pfad-Generators ist eine Brücke von seiner Absprung- zu seiner Landeplattform — belegt durch die
  // Sim selbst (gen/world/pfad/planer.js spielt jeden Zug mit allen Varianten). Dieselbe Brückenform wie beim Turm.
  if (faehigkeiten.has('pfad')) bruecken.push(baueStockwerkBruecken(level.meta?.abschnitte));
  const brueckenVon = bruecken.length === 0 ? undefined
    : bruecken.length === 1 ? bruecken[0]
      : (x, y) => bruecken.flatMap((b) => b(x, y));

  return { virtualStands: virtualStands.size ? virtualStands : undefined, brueckenVon };
}

/** floodReachable() mit den Fähigkeiten DES LEVELS — dünner Wrapper, spart das Zusammensetzen an jeder Aufrufstelle. */
export function floodLevel(level, limits) {
  return floodReachable(level.rows, level.meta.start, limits, baueZusatz(level));
}

/** checkLevel() mit den Fähigkeiten DES LEVELS. */
export function checkLevel(level, limits) {
  return checkLevelKern(level, limits, baueZusatz(level));
}
