// engine/cards.js — Kartenregister, Auflösung von Modifikatoren, Balancing-Formel.

import { ALL_CARDS } from "../data/cards/index.js";
import { mergeSigils, parseSigil, sigilPower } from "./sigils/index.js";

/** @typedef {import("./types.js").CardDef} CardDef */
/** @typedef {import("./types.js").Card} Card */
/** @typedef {import("./types.js").DeckCard} DeckCard */
/** @typedef {import("./types.js").Mod} Mod */

/** @type {Record<string, CardDef>} */
export const CARDS = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));

/** Karten, die im Draft/auf dem Pfad angeboten werden dürfen. */
export const COLLECTIBLE = ALL_CARDS.filter((c) => !c.token && !c.cursed);
export const CURSED = ALL_CARDS.filter((c) => c.cursed);
export const RARITIES = /** @type {const} */ (["common", "uncommon", "rare", "legendary"]);

/** @param {string} id */
export function getCardDef(id) {
  const def = CARDS[id];
  if (!def) throw new Error(`Unbekannte Karte: ${id}`);
  return def;
}

/**
 * Basis + Modifikatoren → effektive Karte.
 * @param {string} baseId
 * @param {Mod[]} [mods]
 * @param {string} [uid]
 * @returns {Card}
 */
export function resolveCard(baseId, mods = [], uid = "") {
  const def = getCardDef(baseId);
  const special = typeof def.attack === "object" ? def.attack.special : null;
  let attack = typeof def.attack === "number" ? def.attack : 0;
  let health = def.health;
  let sigils = [...def.sigils];
  let costAmount = def.cost.amount;
  let cursed = !!def.cursed;
  let dread = 0;
  for (const m of mods) {
    switch (m.kind) {
      case "campfire":
      case "stat":
        attack += m.attack || 0;
        health += m.health || 0;
        break;
      case "fuse":
        attack += m.attack;
        health += m.health;
        sigils = mergeSigils(sigils, m.sigils);
        break;
      case "sigilAdd":
        sigils = mergeSigils(sigils, [m.sigil]);
        break;
      case "sigilRemove": {
        const id = parseSigil(m.sigil).id;
        sigils = sigils.filter((s) => parseSigil(s).id !== id);
        break;
      }
      case "cost":
        costAmount += m.delta;
        break;
      case "dread":
        dread += 1;
        cursed = true;
        break;
      case "mark":
        if (m.mark === "cursed") cursed = true;
        break;
      default:
        break;
    }
  }
  const minCost = def.cost.type === "blood" ? 0 : 1;
  return {
    uid,
    baseId,
    name: def.name,
    tribe: def.tribe,
    cost: { type: def.cost.type, amount: Math.max(minCost, costAmount) },
    attack: Math.max(0, attack),
    special,
    health: Math.max(1, health),
    sigils,
    rarity: def.rarity,
    evolvesTo: def.evolvesTo || null,
    cursed,
    token: !!def.token,
    dread,
    mods: mods.map((m) => ({ ...m })),
  };
}

/** @param {DeckCard} dc */
export function resolveDeckCard(dc) {
  return resolveCard(dc.baseId, dc.mods, dc.uid);
}

// ───────────────────────── Balancing-Formel (Auftrag 8.3) ─────────────────────────

const BLOOD_BUDGET = [2, 4, 7, 10, 13];
const SPECIAL_VALUE = { schwarmzahl: 3, knochenlast: 3, flammenmass: 3, handschwere: 3.5 };

/** @param {{ type: string, amount: number }} cost */
export function costBudget(cost) {
  if (cost.type === "blood") return BLOOD_BUDGET[Math.min(4, cost.amount)] ?? 13;
  if (cost.type === "bones") return 1 + 0.9 * cost.amount;
  return 1.4 * cost.amount;
}

/** @param {CardDef} def */
export function cardValue(def) {
  const atkValue = typeof def.attack === "number" ? 1.5 * def.attack : SPECIAL_VALUE[def.attack.special] ?? 3;
  return atkValue + def.health + def.sigils.reduce((s, ref) => s + sigilPower(ref), 0);
}

/** Budget inklusive Seltenheitsbonus (rare +1, legendary +2). @param {CardDef} def */
export function cardBudget(def) {
  const bonus = def.rarity === "rare" ? 1 : def.rarity === "legendary" ? 2 : 0;
  return costBudget(def.cost) + bonus;
}

/** Abweichung Wert − Budget. @param {CardDef} def */
export function budgetDelta(def) {
  return cardValue(def) - cardBudget(def);
}
