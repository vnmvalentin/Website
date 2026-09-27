// data/modes/moorwanderung/starterDecks.js — die festen Startdecks der Moorwanderung (je Zirkel drei).
//
// 8 Karten, kein Stamm- oder Lanen-Totem. Statt eines eigenen Nebendeck-Typs (gibt es seit Runde 3 nicht mehr: das
// Nebendeck ist fest) bringt jedes Startdeck einen Nebendeck-Totem mit. Die Decks sind bewusst schwächer als ein
// Draft-Deck aus dem Duellmodus – die Stärke entsteht auf dem Pfad.

/**
 * @typedef {{ id: string, zirkel: string, name: string, idea: string, cards: string[], sideSigil: string, tribes: string[] }} StarterDeck
 */

/** @type {StarterDeck[]} */
export const STARTER_DECKS = [
  // ───────── Moor-Zirkel ─────────
  {
    id: "rudel",
    zirkel: "moor",
    name: "Rudel des Aschwolfs",
    idea: "Blut und Tempo: billige Nager als Opfer, Wölfe und ein Flieger.",
    cards: ["nager_wuehlmaus", "nager_siebenschlaefer", "nager_aschmaus", "bestien_hetzwolf", "bestien_moorkeiler",
      "bestien_aschwolf", "bestien_borstenkeiler", "nachtvoegel_ziegenmelker"],
    sideSigil: "doppelblut",
    tribes: ["bestien", "nachtvoegel"],
  },
  {
    id: "knochenmarsch",
    zirkel: "moor",
    name: "Knochenmarsch",
    idea: "Knochen und Zermürbung: sterben lassen, Knochen sammeln, ein Wiedergänger.",
    cards: ["schwaerme_knochenkaefer", "aasfresser_aaskraehe", "gebeine_knochenknecht", "gebeine_knochensammler",
      "gebeine_knochenhaufen", "aasfresser_lachhyaene", "gebeine_grabhund", "gebeine_gerippe"],
    sideSigil: "markleicht",
    tribes: ["gebeine", "aasfresser"],
  },
  {
    id: "kerzenlicht",
    zirkel: "moor",
    name: "Kerzenlicht",
    idea: "Wachs und Beständigkeit: Blocker mit Dornen und Hochwuchs, Heilung, vergängliche Kerzen.",
    cards: ["kerzenwesen_wachsling", "kerzenwesen_flackerwicht", "wurzelvolk_dornspross", "wurzelvolk_dornbusch",
      "kerzenwesen_talgschemen", "kerzenwesen_wachsklotz", "wurzelvolk_wurzelwacht", "wurzelvolk_moosschrat"],
    sideSigil: "wachsgabe",
    tribes: ["kerzenwesen", "wurzelvolk"],
  },
  // ───────── Gezeiten-Zirkel ─────────
  {
    id: "brandungsrudel",
    zirkel: "gezeiten",
    name: "Brandungsrudel",
    idea: "Blut und Tempo: Robben halten, Raubfische beißen, eine Möwe fliegt.",
    cards: ["robben_heuler", "robben_ringelrobbe", "raubfische_hornhecht", "raubfische_katzenhai", "robben_kegelrobbe",
      "raubfische_blauhai", "moewen_lachmoewe", "scherenvolk_taschenkrebs"],
    sideSigil: "doppelblut",
    tribes: ["robben", "raubfische"],
  },
  {
    id: "mannschaft",
    zirkel: "gezeiten",
    name: "Ertrunkene Mannschaft",
    idea: "Knochen und Wiederkehr: wer fällt, kommt mit der Flut zurück.",
    cards: ["ertrunkene_wasserleiche", "ertrunkene_ertrunkenerfischer", "wracks_planke", "schnecken_napfschnecke",
      "ertrunkene_lotsengeist", "wracks_schiffsglocke", "ertrunkene_schiffsjunge", "ertrunkene_tangleiche"],
    sideSigil: "markleicht",
    tribes: ["ertrunkene", "wracks"],
  },
  {
    id: "salzwacht",
    zirkel: "gezeiten",
    name: "Salzwacht",
    idea: "Salz und Geduld: die Uferreihe füllen, Schalen und Korallen halten die Front.",
    cards: ["treibgut_treibholz", "muschelvolk_seepocke", "muschelvolk_herzmuschel", "korallen_steinkoralle",
      "korallen_orgelkoralle", "muschelvolk_salzhueter", "muschelvolk_auster", "tangwesen_kelpwaechter"],
    sideSigil: "salzgabe",
    tribes: ["muschelvolk", "korallen"],
  },
];

/** Startdecks eines Zirkels (immer drei). @param {string} zirkel */
export function startersOf(zirkel) {
  return STARTER_DECKS.filter((d) => d.zirkel === zirkel);
}

/** @param {string} id */
export function starterById(id) {
  return STARTER_DECKS.find((d) => d.id === id) || null;
}
