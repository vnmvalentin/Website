// data/modes/moorwanderung/starterDecks.js — die festen Startdecks der Moorwanderung (je Zirkel drei).
//
// 8 Karten, kein Stamm- oder Lanen-Totem. Statt eines eigenen Nebendeck-Typs (gibt es seit Runde 3 nicht mehr: das
// Nebendeck ist fest) bringt jedes Startdeck einen Nebendeck-Totem mit. Die Decks sind bewusst schwächer als ein
// Draft-Deck aus dem Duellmodus – die Stärke entsteht auf dem Pfad.
// Balancing (npm run balance:run, je 1000 Runs mit 2 Spielern): Doppelblut machte die Blut-Decks zu stark (65–68 %
// Run-Siege im 1-gegen-1), Leichtes Mark die Knochen-Decks zu schwach (34 %) → Schildrinde bzw. Knochenmark.
// Perle statt Salzgabe machte Salzwacht noch stärker (64 %); dort wurde stattdessen ein Salzhüter zu Treibholz.

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
    idea: "Blut und Tempo: billige Nager als Opfer, ein Wolf, Keiler und ein Flieger.",
    cards: ["nager_wuehlmaus", "nager_siebenschlaefer", "nager_aschmaus", "bestien_hetzwolf", "bestien_moorkeiler",
      "bestien_moorkeiler", "nager_aschmaus", "nachtvoegel_ziegenmelker"],
    sideSigil: "schildrinde",
    tribes: ["bestien", "nachtvoegel"],
  },
  {
    id: "knochenmarsch",
    zirkel: "moor",
    name: "Knochenmarsch",
    idea: "Knochen und Zermürbung: sterben lassen, Knochen sammeln, mit Hyänen nachsetzen.",
    cards: ["gebeine_knochenhaufen", "aasfresser_aaskraehe", "gebeine_grabhund", "gebeine_knochensammler",
      "gebeine_knochenhaufen", "aasfresser_lachhyaene", "gebeine_grabhund", "aasfresser_lachhyaene"],
    sideSigil: "knochenmark",
    tribes: ["gebeine", "aasfresser"],
  },
  {
    id: "kerzenlicht",
    zirkel: "moor",
    name: "Kerzenlicht",
    idea: "Wachs und Beständigkeit: Blocker mit Dornen und Hochwuchs, vergängliche Kerzen.",
    cards: ["kerzenwesen_wachsling", "kerzenwesen_flackerwicht", "wurzelvolk_dornspross", "wurzelvolk_dornbusch",
      "kerzenwesen_talgschemen", "kerzenwesen_flackerwicht", "wurzelvolk_wurzelwacht", "wurzelvolk_dornspross"],
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
      "raubfische_hornhecht", "moewen_lachmoewe", "scherenvolk_taschenkrebs"],
    sideSigil: "schildrinde",
    tribes: ["robben", "raubfische"],
  },
  {
    id: "mannschaft",
    zirkel: "gezeiten",
    name: "Ertrunkene Mannschaft",
    idea: "Knochen und Wiederkehr: wer fällt, kommt mit der Flut zurück.",
    cards: ["ertrunkene_lotsengeist", "ertrunkene_ertrunkenerfischer", "wracks_planke", "ertrunkene_tangleiche",
      "ertrunkene_lotsengeist", "ertrunkene_ertrunkenerfischer", "ertrunkene_schiffsjunge", "ertrunkene_tangleiche"],
    sideSigil: "knochenmark",
    tribes: ["ertrunkene", "wracks"],
  },
  {
    id: "salzwacht",
    zirkel: "gezeiten",
    name: "Salzwacht",
    idea: "Salz und Geduld: die Uferreihe füllen, Schalen und Korallen halten die Front.",
    cards: ["treibgut_treibholz", "muschelvolk_seepocke", "muschelvolk_herzmuschel", "korallen_steinkoralle",
      "korallen_orgelkoralle", "treibgut_treibholz", "muschelvolk_auster", "muschelvolk_seepocke"],
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
