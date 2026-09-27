// engine/modes/moorwanderung/pairing.js — Duell-Paarungen der Moorwanderung.
//
// Regeln (Aufgabe 6.1):
//   - gepaart werden alle lebenden Spieler
//   - wer zuletzt gegeneinander gespielt hat, trifft nicht direkt wieder aufeinander, solange es eine Alternative gibt
//   - bei ungerader Zahl bekommt einen Gegner ohne Menschen (Spiegelgeist/Moorfürst), wer das bisher am seltensten
//     hatte; Gleichstand entscheidet der Seed
// Bei höchstens 6 Spielern sind alle perfekten Paarungen schnell aufzählbar (6 Spieler: 15), deshalb wird exakt
// optimiert statt gierig: Kosten = 100 × direkte Wiederholungen + bisherige Begegnungen der Paare.

import { shuffle } from "../../rng.js";

/**
 * Alle perfekten Paarungen einer geraden Liste.
 * @param {number[]} list @returns {number[][][]}
 */
function matchings(list) {
  if (list.length === 0) return [[]];
  const [first, ...rest] = list;
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    const partner = rest[i];
    const remaining = rest.filter((_, j) => j !== i);
    for (const m of matchings(remaining)) out.push([[first, partner], ...m]);
  }
  return out;
}

/**
 * Paarungen für die nächste Duellrunde.
 * @param {any[]} players Run-Spieler (alive, lastOpponent, met: Record<index, count>, ghostCount)
 * @param {{ rng: number }} stream Seed-Strom dieser Runde
 * @returns {{ pairs: Array<[number, number]>, ghost: number|null }}
 */
export function makePairs(players, stream) {
  // Feste, aber seed-abhängige Reihenfolge: Gleichstände entscheidet der Seed, nicht der Platz am Tisch
  const alive = shuffle(stream, players.map((P, i) => (P.alive ? i : -1)).filter((i) => i >= 0));
  if (alive.length % 2 === 0) {
    const { pairs } = bestMatching(players, alive);
    return { pairs, ghost: null };
  }
  // Ungerade: Geist-Kandidaten sind alle mit den wenigsten Geist-Duellen (faire Rotation hat Vorrang). Unter ihnen
  // gewinnt, wer die restliche Paarung ohne direkte Wiederholung ermöglicht; Gleichstand entscheidet der Seed.
  const fewest = Math.min(...alive.map((i) => players[i].ghostCount || 0));
  let best = { pairs: /** @type {Array<[number, number]>} */ ([]), cost: Infinity, ghost: /** @type {number|null} */ (null) };
  for (const g of alive.filter((i) => (players[i].ghostCount || 0) === fewest)) {
    const m = bestMatching(players, alive.filter((i) => i !== g));
    if (m.cost < best.cost) best = { ...m, ghost: g };
  }
  return { pairs: best.pairs, ghost: best.ghost };
}

/**
 * Günstigste perfekte Paarung einer geraden Liste.
 * @param {any[]} players @param {number[]} pool @returns {{ pairs: Array<[number, number]>, cost: number }}
 */
function bestMatching(players, pool) {
  let best = null;
  let bestCost = Infinity;
  for (const m of matchings(pool)) {
    let cost = 0;
    for (const [a, b] of m) {
      if (players[a].lastOpponent === b || players[b].lastOpponent === a) cost += 100;
      cost += players[a].met?.[b] || 0;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = m;
    }
  }
  return { pairs: /** @type {Array<[number, number]>} */ (best || []), cost: bestCost === Infinity ? 0 : bestCost };
}
