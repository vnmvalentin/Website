// render3d/cast.js — die Besetzung der 3D-Ansicht: welche Figur welchen Gegner, Boss und Helden darstellt.
// Reine Daten (kein three.js), damit auch der Kodex und das Bilder-Werkzeug sie lesen können.
// Figuren-Dateien: public/media/av3d (Herkunft dort im README), erzeugt von tools/bakeFigures.mjs.

// Welche Figur einen Gegner darstellt (Dateien in public/media/av3d, erzeugt von tools/bakeFigures.mjs).
// F(Datei, k, Splitterfarbe, cap, Extras): k = Größe relativ zur Kollisionsgröße, cap = wie viele gleichzeitig je
// Animationsbild, tint = Farbfaktor, lift = schwebt (Höhe über dem Boden als Anteil der Figurhöhe).
// Verlies: Skelette (KayKit). Übrige Welten: Monster (Quaternius) — Schleime und Pilze in der Höhle, Kakteen und
// Bienen in der Wüste, Yetis und Geister im Eis, Dämonen und Drachen in der Lava.
const F = (fig, k, chunk, cap, extra = {}) => ({ fig, k, chunk, cap, ...extra });
const BONE = "#e6dfc8";
export const KNECHT = F("skelett_knecht", 1.25, BONE, 400);
const KRIEGER = F("skelett_krieger", 1.2, BONE, 160);
const MAGIER = F("skelett_magier", 1.2, "#b08ae0", 30, { tint: [1.05, 0.85, 1.3] });
const BROCKEN = F("barbar_wild", 1.05, "#6fae4a", 30, { tint: [0.7, 1.15, 0.65] });
export const CAST = {
  // Verlies
  goblin: KNECHT,
  zombie: F("skelett_schleicher", 1.2, "#8fb58a", 160, { tint: [0.7, 1.15, 0.7] }),
  skeletonwarrior: KRIEGER,
  skeleton: F("skelett_schuetze", 1.2, BONE, 40),
  shieldbearer: F("skelett_schild", 1.2, "#aab4c8", 30, { tint: [0.8, 0.85, 1.05] }),
  orc: BROCKEN,
  nekromant: MAGIER,
  // Kristallhöhle
  slime: F("schleim", 0.95, "#7fd35c", 400, { tint: [1.3, 1.9, 1.2] }),
  bat: F("fledermaus", 0.9, "#9ad05a", 300, { lift: 0.9 }),
  krabbler: F("pilzling", 1.0, "#6fc3e0", 200),
  spider: F("tentakel", 1.1, "#8a5ad0", 40),
  troll: F("pilzkoenig", 1.0, "#6fc3e0", 30),
  // Glutwüste
  mummy: F("kaktus", 1.0, "#6fae4a", 400),
  sandkrabbler: F("biene", 0.9, "#f5cf4a", 300, { lift: 0.8 }),
  scorpion: F("kaktusriese", 1.1, "#6fae4a", 40),
  golem: F("dino", 1.0, "#c04a5a", 30),
  sandworm: F("dino", 1.0, "#d8a050", 30, { tint: [1.2, 1.0, 0.6] }),
  shaman: F("maske", 1.0, "#3fae6a", 20, { lift: 0.5 }),
  // Frostgipfel
  snowman: F("yeti_klein", 1.0, "#cfe8f4", 400),
  frostschleim: F("schleim_rosa", 0.95, "#a8e4ff", 400, { tint: [0.3, 2.2, 2.2] }),
  penguin: F("vogel", 1.0, "#8a6ad0", 60),
  yeti: F("yeti", 1.0, "#cfe8f4", 30),
  bear: F("yeti", 1.0, "#b0a090", 30, { tint: [0.85, 0.75, 0.65] }),
  icespirit: F("geist", 1.0, "#a8e4ff", 40, { tint: [1.6, 2.4, 3.2], lift: 0.5 }),
  // Schlackefeld
  glutschleim: F("schleim_rosa", 0.95, "#ff8a3a", 400, { tint: [1.5, 0.8, 0.35] }),
  aschenskelett: F("skelett_knecht", 1.25, "#6b6470", 400, { tint: [0.45, 0.42, 0.48] }),
  firespirit: F("drache_klein", 0.9, "#ff8a3a", 200, { lift: 0.7 }),
  firewizard: F("hexer", 1.05, "#d9473a", 40, { tint: [2.2, 0.7, 0.5] }),
  kobold: F("kobold", 1.0, "#6fae4a", 40),
  minotaur: F("daemon", 1.0, "#d9473a", 30),
  firespewer: F("drache", 0.9, "#ff8a3a", 20, { lift: 0.15 }),
  // Rudel (alle Zyklen): Wolf entfärbt und getönt, Husky, Fuchs (Quaternius-Tiere, CC0)
  gruftwolf: F("wolf~grau", 0.78, "#5a5468", 160, { tint: [0.55, 0.5, 0.62] }),
  schneewolf: F("husky", 0.78, "#dfe8ef", 160),
  wuestenfuchs: F("fuchs", 0.85, "#e0883a", 200),
  glutwolf: F("wolf~grau", 0.78, "#c4502f", 160, { tint: [1.6, 0.6, 0.3] }),
  waldwolf: F("wolf", 0.78, "#8a8396", 160),
  geschuetzwerk: F("robo_geschuetz", 1.0, "#c9c3d1", 30),
  // Friedhof (ab Zyklus 2): bleiche Skelette, ein Grabwächter aus Stein, Irrlichter
  ghul: F("skelett_schleicher", 1.2, "#a8a3b8", 300, { tint: [0.7, 0.68, 0.85] }),
  irrlicht: F("geist", 0.85, "#4fd6a8", 60, { tint: [0.9, 2.6, 1.8], lift: 0.7 }),
  grabwaechter: F("skelett_krieger", 1.45, "#8a8d99", 30, { tint: [0.55, 0.58, 0.66] }),
  // Pilzwald, Sumpf, Uhrwerkturm (ab Zyklus 2). Eigene Figuren seit 17.11.2026 (Quaternius, poly.pizza, CC0 — Liste in
  // public/media/av3d/README.md); Sporling, Sporenmotte, Bovist und Waldschrat sind weiter umgefärbte aus dem Bestand.
  // Pilzwald: rote Pilze, violette Sporenwesen, Stachelpilze, Moosaffen, ein grüner Waldschrat
  sporling: F("pilzling~grau", 0.95, "#d9473a", 400, { tint: [1.7, 0.6, 0.5] }),
  sporenmotte: F("fledermaus~grau", 0.9, "#c49aff", 300, { tint: [1.4, 0.95, 1.8], lift: 0.9 }),
  bovist: F("schleim~grau", 1.0, "#d8cce8", 200, { tint: [1.6, 1.45, 1.9] }),
  stachelpilz: F("stachelpilz", 1.05, "#2f7fa0", 200),
  moosaffe: F("affenwicht", 1.05, "#6fa84a", 40),
  waldschrat: F("barbar_wild", 1.05, "#6f8a4a", 30, { tint: [0.8, 1.0, 0.55] }),
  // Sumpf: Giftkröten, Glubs, Sumpfwichte, Kraken und ein Riesenfrosch (flach — daher klein im Verhältnis)
  giftkroete: F("kroete", 1.0, "#d8a830", 400),
  moorglub: F("glub", 1.0, "#4a3a7e", 300, { lift: 0.5 }),
  sumpfwicht: F("sumpfwicht", 1.1, "#3f5a2a", 160),
  tintenkrake: F("krake", 1.05, "#c84a7a", 40, { lift: 0.4 }),
  riesenfrosch: F("riesenfrosch", 0.5, "#8fd86a", 30),
  glubaeltester: F("glub_gross", 1.1, "#4a3a7e", 20, { lift: 0.35 }),
  // Uhrwerkturm: Roboter-Drohnen, Mechs, Öl
  blechknecht: F("robo_laeufer", 1.0, "#e8d070", 400),
  oelschleim: F("hornschleim~grau", 0.95, "#3a3640", 400, { tint: [0.32, 0.3, 0.3] }),
  surrdrohne: F("robo_drohne", 1.0, "#e8d070", 200, { lift: 0.6 }),
  bolzenwerfer: F("robo_kanone", 1.1, "#e8d070", 40),
  schildwerk: F("robo_kugel", 1.05, "#c9c3d1", 30),
  dampfmech: F("mech_orange", 0.95, "#c4602f", 30),
  messingmech: F("mech_gelb", 0.95, "#c99a30", 30),
};
export const BOSS_CAST = {
  necromancer: { ...MAGIER, tint: [1.0, 0.6, 1.6], k: 1.05, cap: 4 },
  fallenKnight: F("ritter_dunkel", 1.05, "#6a6a9a", 4, { tint: [0.55, 0.5, 0.8] }),
  slimeKing: F("schleim", 0.6, "#4fc7a6", 4, { tint: [0.8, 2.0, 2.0] }),
  spiderQueen: F("tentakel", 0.8, "#c04a8a", 4, { tint: [1.4, 0.6, 0.9] }),
  sandColossus: F("dino", 0.8, "#d8a050", 4, { tint: [1.2, 0.95, 0.6] }),
  pharaoh: F("koenig", 0.7, "#f5cf4a", 4, { lift: 0.2 }),
  yetiAncient: F("yeti", 0.8, "#7fb2d6", 4, { tint: [0.7, 0.95, 1.4] }),
  minotaurLord: F("daemon", 0.8, "#a03a3a", 4, { tint: [0.85, 0.55, 0.55] }),
  lavaWurm: F("drache", 0.7, "#ff8a3a", 4, { tint: [1.3, 0.7, 0.4], lift: 0.1 }),
  thunderwing: F("drache", 0.75, "#5a9ad6", 4, { tint: [0.3, 0.85, 3.6], lift: 0.35 }),
  // (der Drache entfärbt und eisig getönt, kleiner als Thunderwing; figures3d.js „~grau“)
  frostwyrm: F("drache~grau", 0.62, "#8fd8ff", 4, { tint: [1.7, 2.3, 3.1], lift: 0.25 }),
  witwe: F("geist", 0.75, "#c9b8ff", 4, { tint: [1.5, 1.35, 2.3], lift: 0.35 }),
  myzelkoenig: F("pilzkoenig", 0.75, "#d9473a", 4, { tint: [1.3, 0.85, 1.25] }),
  moorhexe: F("hexer~grau", 0.85, "#8be04e", 4, { tint: [0.85, 1.3, 0.75] }),
  uhrwerkkoloss: F("automat", 1.05, "#e8d070", 4),
};
export const DEFAULT_BOSS = { ...BROCKEN, tint: [1.25, 0.55, 0.5], k: 1.0, chunk: "#a04a3a", cap: 4 };
// Gegner, die nicht im Vorrat einer Welt stehen, aber dort auftauchen können (beschworen, geschlüpft)
export const EXTRAS = ["skeletonwarrior", "slime", "spider"];
export const HEROES = {
  default: { fig: "held_schurke" }, knight: { fig: "held_ritter" }, ninja: { fig: "held_kapuze" }, wizard: { fig: "held_magier" },
  bestmod: { fig: "held_magier", tint: [0.7, 1.2, 0.7] }, cyber: { fig: "held_kapuze", tint: [0.45, 0.9, 2.3] }, gh0stqq: { fig: "held_barbar" },
  // Kits seit November 2026: Quaternius „RPG Characters“ (Mönch, Waldläuferin, Klerikerin lila getönt, Gelehrter)
  moench: { fig: "held_moench" }, jaegerin: { fig: "held_jaegerin" }, nekromantin: { fig: "held_klerikerin", tint: [0.6, 0.45, 0.9] },
  alchemist: { fig: "held_gelehrter" },
};
// Requisiten: starre Figuren (CC0, public/media/av3d/README.md). h = Höhe in Metern (die Figuren sind auf Höhe 1 genormt)
export const PROPS = {
  chest: { fig: "kiste", h: 0.62 }, bigChest: { fig: "kiste_gross", h: 0.85 }, equipChest: { fig: "kiste_rot", h: 0.62 },
  opened: { fig: "kiste_offen", h: 0.62 }, shrine: { fig: "schrein", h: 1.75 }, altar: { fig: "altar", h: 1.2 },
  trap: { fig: "fangeisen", h: 0.16 }, crystal: { fig: "kristall", h: 1 }, crystal2: { fig: "kristall2", h: 1 },
};

// Begleiter mit eigener Figur (engine/allies.js), geladen nur für das Kit, das sie ruft
export const PET_FIG = { wolf: "wolf" };
export const KIT_PETS = { jaegerin: ["wolf"] };
export const castOf = (e) => (e.isBoss ? BOSS_CAST[e.bossId] || DEFAULT_BOSS : CAST[e.type] || KNECHT);

// Farbvarianten der Helden (data/skins.js): in 3D ein Farbfaktor über die ganze Figur
export const HERO_SKINS = { schatten: [0.5, 0.45, 0.62], frost: [0.7, 1.0, 1.45], gold: [1.5, 1.25, 0.55] };
