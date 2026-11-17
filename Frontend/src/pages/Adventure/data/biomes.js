// data/biomes.js — die Welten eines Laufs in fester Reihenfolge. Jede Welt ist eine große Karte mit Kisten, Schreinen
// und einem Teleporter; wer ihn aktiviert, ruft den Boss der Welt. Nach der Lava kommt das Finale (Gewitterhort), danach
// kann man in Zyklus 2 weiterspielen — dann mischen sich die Gegner aller Welten.
//
// enemies: [id, Gewicht] — gewichtet wird innerhalb einer Stufe (Futter, Kämpfer …, siehe engine/director.js). obstacles: Form-Schlüssel mit Radiusbereich (gezeichnet in render/flat/world.js, dort auch der Boden).

export const BIOMES = [
  {
    id: "dungeon", name: "Verlies",
    enemies: [["goblin", 10], ["zombie", 6], ["skeletonwarrior", 5], ["gruftwolf", 2.5], ["skeleton", 6], ["shieldbearer", 2.5], ["orc", 3], ["nekromant", 1.2]],
    obstacles: [["pillar", 26, 40], ["tree", 30, 46], ["rock", 26, 42]],
    bosses: ["necromancer", "fallenKnight"],
  },
  {
    id: "cave", name: "Kristallhöhle",
    enemies: [["slime", 10], ["bat", 5], ["krabbler", 8], ["skeletonwarrior", 4], ["spider", 7], ["troll", 3]],
    obstacles: [["stone1", 28, 46], ["stone2", 26, 42], ["rock", 26, 40]],
    bosses: ["slimeKing", "spiderQueen"],
  },
  {
    id: "desert", name: "Glutwüste",
    enemies: [["mummy", 10], ["sandkrabbler", 7], ["wuestenfuchs", 4], ["scorpion", 7], ["sandworm", 2.5], ["golem", 3], ["shaman", 1.5]],
    obstacles: [["cactus", 22, 28], ["cactus2", 18, 24], ["cactus3", 18, 24], ["rock", 26, 40]],
    bosses: ["sandColossus", "pharaoh"],
  },
  {
    id: "ice", name: "Frostgipfel",
    enemies: [["snowman", 10], ["frostschleim", 8], ["schneewolf", 3], ["penguin", 6], ["bear", 2.5], ["yeti", 3], ["icespirit", 2.5]],
    obstacles: [["icespikes", 28, 44], ["icebarrel", 18, 24], ["rock", 26, 40]],
    bosses: ["yetiAncient"],
  },
  {
    id: "lava", name: "Schlackefeld",
    enemies: [["glutschleim", 10], ["aschenskelett", 8], ["firespirit", 6], ["glutwolf", 3], ["firewizard", 7], ["kobold", 3], ["minotaur", 3], ["firespewer", 2]],
    obstacles: [["vulkan", 30, 46], ["vulkan2", 26, 42]],
    bosses: ["minotaurLord", "lavaWurm"],
  },
  {
    id: "storm", name: "Gewitterhort", final: true,
    enemies: [],
    // Keine Horde, nur kleine Wellen, solange Thunderwing lebt (engine/director.js, updateFinalWaves)
    waves: [["bat", 1], ["firespirit", 1]],
    obstacles: [],
    bosses: ["thunderwing"],
  },
];

// Seit November 2026 kleiner (vorher 4400): gleich viele Kisten und Schreine auf weniger Fläche, kürzere Wege —
// man steht öfter in der Horde und läuft seltener durch leere Gänge
export const NORMAL_WORLD_SIZE = 3400;
export const FINAL_WORLD_SIZE = 1500;

// Zyklus 2+: jede Welt mischt zusätzlich Gegner aus allen anderen Welten
export function enemyPoolFor(biome, loop) {
  // Neue Welten (ab Zyklus 2) behalten ihren Charakter: keine Beimischung — Gegner kommen in Paketen, schon ein kleiner
  // Anteil brachte ganze Schneemann-Trupps auf den Friedhof
  if (loop <= 0 || biome.final || !BIOMES.includes(biome)) return biome.enemies;
  const extra = [];
  for (const b of BIOMES) {
    if (b === biome || b.final) continue;
    for (const [id, w] of b.enemies) extra.push([id, w * 0.25]);
  }
  return [...biome.enemies, ...extra];
}

// ── Neue Welten (Ausbauplan „av-welten“, November 2026) ───────────────────────────────────────────────────────────
// Zyklus 1 bleibt die klassische Folge oben (abgenommen). Ab Zyklus 2 wechseln sich zwei Sätze ab: in den geraden
// Zyklen (2, 4, …) die neuen Welten, in den ungeraden wieder die klassischen. Jede neue Welt ersetzt die Welt auf
// demselben Platz — ein Zyklus hat weiter sechs Welten (Tiefe, Schwierigkeits-Tabelle und Erfolge zählen damit).
// mechanic: eine Besonderheit der Welt (engine/worldMechanics.js).

// Friedhof (statt Verlies): Gräber wecken Tote, wenn man an ihnen vorbeiläuft
export const FRIEDHOF = {
  id: "friedhof", name: "Friedhof", mechanic: "graeber",
  enemies: [["goblin", 8], ["ghul", 9], ["zombie", 4], ["gruftwolf", 3], ["skeleton", 4], ["irrlicht", 3], ["grabwaechter", 2.5], ["nekromant", 1]],
  obstacles: [["grave", 18, 24], ["grave", 18, 24], ["crypt", 32, 44], ["deadtree", 24, 34]],
  bosses: ["witwe"],
};

// Pilzwald (statt Kristallhöhle): Sporenpilze (Hindernis „sporeshroom“) stoßen eine Sporenwolke aus, wenn man ihnen
// nahe kommt — wer darin steht, wird langsamer. Bovisten (Gegner) platzen ebenfalls zu einer kleinen Wolke. Die Gegner-Figuren sind vorerst umgefärbte aus dem Bestand (render3d/cast.js).
export const PILZWALD = {
  id: "pilzwald", name: "Pilzwald", mechanic: "sporen",
  enemies: [["sporling", 10], ["sporenmotte", 5], ["stachelpilz", 6], ["waldwolf", 4], ["bovist", 4], ["moosaffe", 6], ["waldschrat", 3]],
  obstacles: [["bigshroom", 30, 44], ["sporeshroom", 20, 26], ["sporeshroom", 20, 26], ["stump", 22, 32]],
  bosses: ["myzelkoenig"],
};

// Sumpf (statt Glutwüste): Giftpfützen liegen am Boden (engine/worldgen.js) — darin vergiftet und verlangsamt; über
// allem liegt Nebel (nur 3D: die Sicht endet früher)
export const SUMPF = {
  id: "sumpf", name: "Sumpf", mechanic: "pfuetzen", pools: true, fog: true,
  enemies: [["giftkroete", 10], ["moorglub", 7], ["sumpfwicht", 5], ["tintenkrake", 4], ["riesenfrosch", 3], ["glubaeltester", 1.5]],
  obstacles: [["reeds", 18, 26], ["willow", 28, 40], ["rock", 24, 36]],
  bosses: ["moorhexe"],
};

// Uhrwerkturm (statt Schlackefeld): Zahnradfallen drehen eine Klinge im Kreis — sie trifft dich, mahlt aber auch die
// Horde klein, die dir hinterherläuft
export const UHRWERK = {
  id: "uhrwerk", name: "Uhrwerkturm", mechanic: "zahnraeder",
  enemies: [["blechknecht", 10], ["oelschleim", 8], ["surrdrohne", 6], ["bolzenwerfer", 7], ["schildwerk", 2.5], ["geschuetzwerk", 2], ["dampfmech", 3], ["messingmech", 2.5]],
  obstacles: [["gear", 24, 30], ["boiler", 28, 40], ["pipes", 22, 32], ["boiler", 28, 40]],
  bosses: ["uhrwerkkoloss"],
};

// Frostgipfel mit dem zweiten Boss der Eiswelt: nur in den neuen Zyklen — im ersten Zyklus würde ein zweiter Boss die
// Boss-Wahl je Seed verschieben (Tageslauf, abgenommene Läufe)
export const FROSTGIPFEL_NEU = { ...BIOMES[3], bosses: ["frostwyrm"] };

/** Neue Welten je Platz; was (noch) fehlt, bleibt die klassische Welt dieses Platzes */
export const BIOMES_NEU = [FRIEDHOF, PILZWALD, SUMPF, FROSTGIPFEL_NEU, UHRWERK, BIOMES[5]];
export const ALL_BIOMES = [...BIOMES, ...BIOMES_NEU.filter((b) => !BIOMES.includes(b))];
/** Welten mit eigenen Gegnern ab Zyklus 2 (für den Kodex; der Frostgipfel hat dort nur einen anderen Boss) */
export const NEUE_WELTEN = [FRIEDHOF, PILZWALD, SUMPF, UHRWERK];

/** Die Welt auf Platz stageIndex im Zyklus loop (0 = erster Zyklus) */
export function biomeFor(stageIndex, loop = 0) {
  return (loop % 2 === 1 ? BIOMES_NEU : BIOMES)[stageIndex];
}
