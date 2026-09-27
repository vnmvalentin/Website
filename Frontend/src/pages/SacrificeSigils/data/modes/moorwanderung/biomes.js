// data/modes/moorwanderung/biomes.js — die Biome der Moorwanderung, je Zirkel sechs in fester Reihenfolge.
//
// Stufe (tier) = Pfadnummer − 1; Biom = Stufe mod 6. Nach dem letzten Biom beginnt die Reihe mit Stufe +1 von vorn.
//   palette   Farben der Pfadkarte (Aquarellflecken, Tusche, Akzent) – das Pfad-Redesign liest sie
//   weather   Wetterpartikel der Karte (nebel, asche, sporen, regen, gischt, salz)
//   decor     gezeichnete Landschaftselemente am Kartenrand
//   weights   Faktoren der Knoten-Gewichte (z. B. mehr Verschmelzungen in den Myzelhöhlen)
//   ambient   Stimmung des synthetisierten Ambient-Klangs (audio/sound.js)

/** @type {Array<{ id: string, zirkel: string, name: string, flavor: string, palette: { wash: string, ink: string, accent: string },
 *   weather: string, decor: string[], weights: Record<string, number>, ambient: string }>} */
export const BIOMES = [
  // ───────── Moor ─────────
  { id: "aschemoor", zirkel: "moor", name: "Aschemoor", flavor: "Nebel, Schilf und Irrlichter über schwarzem Wasser.",
    palette: { wash: "#6f7a5a", ink: "#1a1612", accent: "#c9d18a" }, weather: "nebel", decor: ["schilf", "irrlicht", "tuempel"], weights: {}, ambient: "wind" },
  { id: "birkengrab", zirkel: "moor", name: "Birkengrab", flavor: "Bleiche Stämme, Krähen und Grabhügel.",
    palette: { wash: "#9a9486", ink: "#1a1612", accent: "#e8e2d0" }, weather: "blaetter", decor: ["birke", "kraehe", "grab"], weights: { shrine: 1.4 }, ambient: "kraehen" },
  { id: "kapelle", zirkel: "moor", name: "Die ersoffene Kapelle", flavor: "Wasser bis zu den Knien, Glocken und Kerzenreste.",
    palette: { wash: "#4f6a73", ink: "#141a1c", accent: "#f2b54a" }, weather: "regen", decor: ["ruine", "kerze", "glocke"], weights: { campfire: 1.4, merchant: 1.2 }, ambient: "glocken" },
  { id: "myzelhoehlen", zirkel: "moor", name: "Myzelhöhlen", flavor: "Leuchtende Pilze und ein Regen aus Sporen.",
    palette: { wash: "#6a4d6e", ink: "#18121a", accent: "#b46aa8" }, weather: "sporen", decor: ["pilz", "tropfstein", "sporen"], weights: { fuse: 1.8 }, ambient: "hoehle" },
  { id: "knochenfelder", zirkel: "moor", name: "Knochenfelder", flavor: "Wind, Gebeine und Asche bis zum Horizont.",
    palette: { wash: "#a39a82", ink: "#1a1612", accent: "#d8d2bd" }, weather: "asche", decor: ["knochen", "schaedel", "pfahl"], weights: { remove: 1.5, copyist: 1.3 }, ambient: "sturm" },
  { id: "schwarzesufer", zirkel: "moor", name: "Das Schwarze Ufer", flavor: "Dunkles Wasser, rotes Licht. Hier endet das Moor.",
    palette: { wash: "#3a2626", ink: "#0e0808", accent: "#b3302a" }, weather: "asche", decor: ["pfahl", "boot", "irrlicht"], weights: { event: 1.6, cardChoice: 0.8 }, ambient: "tief" },
  // ───────── Gezeiten ─────────
  { id: "watt", zirkel: "gezeiten", name: "Das Watt", flavor: "Priele, Schlick und Muscheln, so weit man sieht.",
    palette: { wash: "#8a8a6a", ink: "#1b2329", accent: "#d8c9a5" }, weather: "nebel", decor: ["priel", "muschel", "pfahl"], weights: {}, ambient: "wind" },
  { id: "salzwiesen", zirkel: "gezeiten", name: "Die Salzwiesen", flavor: "Queller, Möwen und Nebel über dem Deich.",
    palette: { wash: "#7d8a5e", ink: "#1b2329", accent: "#e8e2d0" }, weather: "salz", decor: ["gras", "moewe", "deich"], weights: { shrine: 1.4 }, ambient: "moewen" },
  { id: "kirchturm", zirkel: "gezeiten", name: "Der versunkene Kirchturm", flavor: "Glocken, die unter Wasser läuten.",
    palette: { wash: "#3e5563", ink: "#10171b", accent: "#e0a84a" }, weather: "regen", decor: ["turm", "glocke", "welle"], weights: { campfire: 1.4, merchant: 1.2 }, ambient: "glocken" },
  { id: "riff", zirkel: "gezeiten", name: "Das Korallenriff", flavor: "Bunte Tiefe, in der alles wächst.",
    palette: { wash: "#8a5a5a", ink: "#1a1216", accent: "#d06a6a" }, weather: "gischt", decor: ["koralle", "fisch", "anemone"], weights: { fuse: 1.8 }, ambient: "hoehle" },
  { id: "schiffsfriedhof", zirkel: "gezeiten", name: "Der Schiffsfriedhof", flavor: "Wracks, Anker und das Knarren alter Planken.",
    palette: { wash: "#6a5a48", ink: "#14100c", accent: "#b08d57" }, weather: "gischt", decor: ["wrack", "anker", "mast"], weights: { remove: 1.5, copyist: 1.3 }, ambient: "sturm" },
  { id: "schwarzesee", zirkel: "gezeiten", name: "Die Schwarze See", flavor: "Sturm, Dunkelheit und ein einzelnes Leuchtfeuer.",
    palette: { wash: "#1f2a33", ink: "#07090b", accent: "#3fa39a" }, weather: "regen", decor: ["leuchtturm", "welle", "fels"], weights: { event: 1.6, cardChoice: 0.8 }, ambient: "tief" },
];

/** Biome eines Zirkels in Reihenfolge. @param {string} zirkel */
export function biomesOf(zirkel) {
  return BIOMES.filter((b) => b.zirkel === zirkel);
}

/** Biom und Wiederholung („Stufe +1“) für eine Stufe. @param {string} zirkel @param {number} tier */
export function biomeFor(zirkel, tier) {
  const list = biomesOf(zirkel);
  return { biome: list[tier % list.length], cycle: Math.floor(tier / list.length) };
}
