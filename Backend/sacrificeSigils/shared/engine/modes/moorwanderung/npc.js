// engine/modes/moorwanderung/npc.js — Decks der Gegner ohne Menschen: NPCs, Elite, Bosse, Spiegelgeist, Moorfürst.
//
// Die Stärke hängt nur von der Stufe (Pfadnummer) ab, nicht vom Spieler: alle bekommen dieselbe Herausforderung.
// Deckbau aus dem Kartenpool des Zirkels: überwiegend Karten der Themen-Stämme, Seltenheit steigt mit der Stufe,
// ab Stufe 2 kommen Lagerfeuer-Verstärkungen dazu. Immer genug billige Karten, damit Blutkarten spielbar sind.

import { CARDS, collectibleOf } from "../../cards.js";
import { pickWeighted, randInt, shuffle } from "../../rng.js";

/** Größtes Deck eines Gegners ohne Menschen (Moorfürst folgt sonst den teils sehr großen Spielerdecks). */
export const MAX_NPC_DECK = 20;

/** Seltenheits-Gewichte je Stufe (0 = erster Pfad). */
function rarityWeights(tier, elite) {
  const t = tier + (elite ? 1.5 : 0);
  return {
    common: Math.max(20, 70 - t * 9),
    uncommon: 22 + t * 4,
    rare: 6 + t * 4,
    legendary: t >= 4 ? 2 + (t - 4) : 0,
  };
}

/** Billig genug, um früh gespielt zu werden (Opferfutter bzw. Startkarten). @param {any} def */
function cheap(def) {
  const { type, amount } = def.cost;
  return (type === "blood" && amount <= 1) || (type === "bones" && amount <= 2) || ((type === "wax" || type === "salt") && amount <= 2);
}

/**
 * Deck für einen Gegner bauen.
 * @param {{ zirkel: string, tribes: string[], size: number, tier: number, stream: { rng: number }, elite?: boolean,
 *   buffs?: number, exclude?: Set<string> }} o  exclude: Karten-IDs, die nicht vorkommen dürfen (vergebene Legendäre)
 * @returns {Array<{ uid: string, baseId: string, mods: any[] }>}
 */
export function buildNpcDeck(o) {
  const s = o.stream;
  const pool = collectibleOf(o.zirkel).filter((c) => !o.exclude?.has(c.id));
  const themed = pool.filter((c) => o.tribes.includes(c.tribe));
  const weights = rarityWeights(o.tier, o.elite);
  /** @type {string[]} */
  const ids = [];
  /** Eine Karte ziehen (höchstens 2 Kopien, Legendäre einmal); false, wenn nichts mehr passt. */
  const pick = (/** @type {any[]} */ from, /** @type {(c: any) => boolean} */ filter = () => true) => {
    const rarity = pickWeighted(s, /** @type {any} */ (Object.entries(weights).filter(([, w]) => w > 0)));
    const free = (/** @type {any} */ c) => filter(c) && ids.filter((x) => x === c.id).length < 2 && !(c.unique && ids.includes(c.id));
    let options = from.filter((c) => c.rarity === rarity && free(c));
    if (!options.length) options = from.filter(free);
    if (!options.length) return false;
    ids.push(options[randInt(s, options.length)].id);
    return true;
  };
  // Mindestens drei billige Karten, damit das Deck anläuft
  for (let i = 0; i < 3; i++) pick(themed.length ? themed : pool, cheap);
  // Zwei von drei Karten aus den Themen-Stämmen; sind die erschöpft, aus dem ganzen Pool
  let guard = 0;
  while (ids.length < o.size && guard++ < o.size * 4) {
    const fromThemed = themed.length && ids.length % 3 !== 2;
    if (!(fromThemed && pick(themed)) && !pick(pool)) break;
  }
  const buffs = o.buffs ?? Math.max(0, Math.floor((o.tier - 1) / 2));
  const deck = shuffle(s, ids).map((baseId, i) => ({ uid: `n${i + 1}`, baseId, mods: /** @type {any[]} */ ([]) }));
  for (let i = 0; i < buffs && deck.length; i++) {
    const dc = deck[randInt(s, deck.length)];
    const def = CARDS[dc.baseId];
    dc.mods.push(typeof def.attack === "number" && def.attack > 0 && randInt(s, 2) === 0
      ? { kind: "campfire", attack: 1 }
      : { kind: "campfire", health: 2 });
  }
  return deck;
}

/**
 * Spiegelgeist: Kopie des aktuellen Decks eines Spielers (inkl. Totems, ohne Items).
 * @param {any} target Run-Spieler
 */
export function mirrorOf(target) {
  return {
    deck: target.deck.map((/** @type {any} */ dc, /** @type {number} */ i) => ({ uid: `g${i + 1}`, baseId: dc.baseId, mods: dc.mods.map((/** @type {any} */ m) => ({ ...m })) })),
    totems: JSON.parse(JSON.stringify(target.totems || {})),
    sideType: target.sideType,
  };
}

/**
 * Moorfürst: starker NPC, dessen Deck sich am Durchschnitt der lebenden Spielerdecks orientiert.
 * @param {any[]} alive lebende Run-Spieler @param {string} zirkel @param {number} tier @param {{ rng: number }} stream
 * @param {Set<string>} [exclude]
 */
export function lordDeck(alive, zirkel, tier, stream, exclude) {
  const avgSize = Math.round(alive.reduce((a, P) => a + P.deck.length, 0) / Math.max(1, alive.length));
  // Themen: die häufigsten Stämme im Feld – der Fürst spielt, was das Moor gerade prägt
  const count = new Map();
  for (const P of alive) for (const dc of P.deck) count.set(CARDS[dc.baseId].tribe, (count.get(CARDS[dc.baseId].tribe) || 0) + 1);
  const tribes = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
  return buildNpcDeck({ zirkel, tribes, size: Math.min(MAX_NPC_DECK, Math.max(10, avgSize)), tier: tier + 1, stream, elite: true, exclude });
}
