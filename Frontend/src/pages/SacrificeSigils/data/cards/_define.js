// data/cards/_define.js — kompakte Schreibweise für Kartendateien.
//
//   [key, name, cost, attack, health, sigils, rarity, flavor, extra?]
//   cost:   "b2" = 2 Blut, "k5" = 5 Knochen, "w3" = 3 Wachs
//   attack: Zahl oder "schwarmzahl" | "knochenlast" | "flammenmass" | "handschwere"
//   extra:  { evolvesTo?: key, silhouette?, palette?, token?, cursed?, tribe? }
//
// Die ID wird "<stamm>_<key>", evolvesTo ohne Unterstrich bekommt denselben Präfix. Der Artwork-Seed ist ein Hash der ID,
// damit eine Karte ihr Bild behält, auch wenn sich die Reihenfolge in der Datei ändert.

import { hashParts } from "../../engine/rng.js";
import { TRIBE_BY_ID } from "../tribes.js";

const COST_TYPES = { b: "blood", k: "bones", w: "wax" };
const SPECIALS = new Set(["schwarmzahl", "knochenlast", "flammenmass", "handschwere"]);

/**
 * @param {import("../../engine/types.js").Tribe} tribe
 * @param {Array<any[]>} rows
 * @returns {import("../../engine/types.js").CardDef[]}
 */
export function defineCards(tribe, rows) {
  const defaultSilhouette = TRIBE_BY_ID[tribe].silhouettes[0];
  return rows.map((row) => {
    const [key, name, cost, attack, health, sigils, rarity, flavor, extra = {}] = row;
    const cardTribe = extra.tribe || tribe;
    const id = key.includes("_") ? key : `${cardTribe}_${key}`;
    const type = COST_TYPES[cost[0]];
    const amount = Number(cost.slice(1));
    const evolvesTo = extra.evolvesTo
      ? (extra.evolvesTo.includes("_") ? extra.evolvesTo : `${cardTribe}_${extra.evolvesTo}`)
      : undefined;
    /** @type {import("../../engine/types.js").CardDef} */
    const card = {
      id,
      name,
      tribe: cardTribe,
      cost: { type, amount },
      attack: typeof attack === "string" && SPECIALS.has(attack) ? { special: attack } : attack,
      health,
      sigils,
      rarity,
      unique: rarity === "legendary",
      flavor,
      art: {
        silhouette: extra.silhouette || (extra.tribe ? TRIBE_BY_ID[extra.tribe].silhouettes[0] : defaultSilhouette),
        seed: hashParts("art", id) % 100000,
        palette: extra.palette || cardTribe,
      },
    };
    if (evolvesTo) card.evolvesTo = evolvesTo;
    if (extra.token) card.token = true;
    if (extra.cursed) card.cursed = true;
    return card;
  });
}
