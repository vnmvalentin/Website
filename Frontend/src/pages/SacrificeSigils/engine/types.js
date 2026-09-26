// engine/types.js — JSDoc-Typen der Engine (nur Dokumentation, kein Laufzeitcode).
// Das Projekt ist reines JavaScript; diese Typen sind die verbindliche Beschreibung der Datenstrukturen.

/**
 * @typedef {"blood"|"bones"|"wax"} CostType
 * @typedef {"common"|"uncommon"|"rare"|"legendary"} Rarity
 * @typedef {"schwarmzahl"|"knochenlast"|"flammenmass"|"handschwere"} SpecialStat
 * @typedef {"bestien"|"nachtvoegel"|"aasfresser"|"schwaerme"|"tiefe"|"kriecher"|"nager"|"myzel"|"wurzelvolk"|"gebeine"|"kerzenwesen"|"gehoernte"|"flatterer"|"stammlose"} Tribe
 * @typedef {"quadruped"|"bird"|"fish"|"insect"|"serpent"|"rodent"|"fungus"|"root"|"skeleton"|"candle"|"horned"|"moth"|"construct"} Silhouette
 */

/**
 * Kartendefinition, wie sie in data/cards/*.js steht.
 * @typedef {Object} CardDef
 * @property {string} id
 * @property {string} name
 * @property {Tribe} tribe
 * @property {{ type: CostType, amount: number }} cost
 * @property {number | { special: SpecialStat }} attack
 * @property {number} health
 * @property {string[]} sigils          Sigil-Referenzen, "id" oder "id:n" (Stufe/Parameter)
 * @property {Rarity} rarity
 * @property {boolean} [unique]
 * @property {string} [evolvesTo]
 * @property {boolean} [cursed]
 * @property {boolean} [token]          nie im Draft/Pfad-Angebot (Brutlinge, Hüllen, Folgeformen, Nebendeck)
 * @property {string} flavor
 * @property {{ silhouette: Silhouette, seed: number, palette: string }} art
 */

/**
 * Modifikator auf einer Deckkarte.
 * @typedef {{ kind: "campfire", attack?: number, health?: number }
 *   | { kind: "fuse", attack: number, health: number, sigils: string[] }
 *   | { kind: "sigilAdd", sigil: string }
 *   | { kind: "sigilRemove", sigil: string }
 *   | { kind: "stat", attack?: number, health?: number, source?: string }
 *   | { kind: "cost", delta: number }
 *   | { kind: "dread" }
 *   | { kind: "mark", mark: "copied" | "mirrored" | "cursed" }} Mod
 */

/**
 * Karte im Deck eines Spielers (Match-Ebene).
 * @typedef {{ uid: string, baseId: string, mods: Mod[] }} DeckCard
 */

/**
 * Effektive Karte (Basis + Modifikatoren aufgelöst). In Hand, Deck und als `card` einer Einheit.
 * @typedef {Object} Card
 * @property {string} uid
 * @property {string} baseId
 * @property {string} name
 * @property {Tribe} tribe
 * @property {{ type: CostType, amount: number }} cost
 * @property {number} attack          bei Spezialwerten: Bonus auf den Spezialwert
 * @property {SpecialStat|null} special
 * @property {number} health
 * @property {string[]} sigils
 * @property {Rarity} rarity
 * @property {string|null} evolvesTo
 * @property {boolean} cursed
 * @property {boolean} token
 * @property {number} dread           Gewichte gegen den Besitzer zu Kampfbeginn
 * @property {Mod[]} mods
 */

/**
 * Einheit auf dem Spielfeld.
 * @typedef {Object} Unit
 * @property {string} uid
 * @property {Card} card
 * @property {0|1} owner
 * @property {"front"|"back"} zone
 * @property {number} lane
 * @property {number} attack
 * @property {SpecialStat|null} special
 * @property {number} health
 * @property {number} maxHealth
 * @property {string[]} sigils
 * @property {number} turns            eigene Zugenden auf dem Feld
 * @property {number|null} wick        verbleibende Zugenden (Kerzendocht)
 * @property {boolean} submerged
 * @property {1|-1} dir                Richtung für Wanderer/Rammbock
 * @property {boolean} shieldUsed
 * @property {number} glued
 * @property {boolean} stunned
 * @property {boolean} rushed          Vorpreschen in diesem Zug benutzt
 */

/**
 * Engine-Ereignis (für die Animations-Queue). `private` = nur dieser Spieler sieht `card`/`cards`.
 * @typedef {{ type: string, private?: 0|1, [key: string]: unknown }} GameEvent
 */

/**
 * Ergebnis von applyAction.
 * @typedef {{ state: object, events: GameEvent[], error?: string }} ActionResult
 */

export {};
