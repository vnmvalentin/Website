// data/biomes.js — die Welten eines Laufs in fester Reihenfolge. Jede Welt ist eine große Karte mit Kisten, Schreinen
// und einem Teleporter; wer ihn aktiviert, ruft den Boss der Welt. Nach der Lava kommt das Finale (Gewitterhort), danach
// kann man in Zyklus 2 weiterspielen — dann mischen sich die Gegner aller Welten.
//
// enemies: [id, Gewicht]. obstacles: Form-Schlüssel mit Radiusbereich (gezeichnet in render/flat/world.js, dort auch der Boden).

export const BIOMES = [
  {
    id: "dungeon", name: "Verlies",
    enemies: [["goblin", 8], ["zombie", 7], ["skeleton", 6], ["shieldbearer", 2.5], ["orc", 3], ["nekromant", 1.2]],
    obstacles: [["pillar", 26, 40], ["tree", 30, 46], ["rock", 26, 42]],
    bosses: ["necromancer", "fallenKnight"],
  },
  {
    id: "cave", name: "Kristallhöhle",
    enemies: [["skeletonwarrior", 10], ["spider", 7], ["bat", 4], ["troll", 3]],
    obstacles: [["stone1", 28, 46], ["stone2", 26, 42], ["rock", 26, 40]],
    bosses: ["slimeKing", "spiderQueen"],
  },
  {
    id: "desert", name: "Glutwüste",
    enemies: [["mummy", 10], ["scorpion", 7], ["sandworm", 2.5], ["golem", 3], ["shaman", 1.5]],
    obstacles: [["cactus", 22, 28], ["cactus2", 18, 24], ["cactus3", 18, 24], ["rock", 26, 40]],
    bosses: ["sandColossus", "pharaoh"],
  },
  {
    id: "ice", name: "Frostgipfel",
    enemies: [["snowman", 10], ["penguin", 6], ["bear", 2.5], ["yeti", 3], ["icespirit", 2.5]],
    obstacles: [["icespikes", 28, 44], ["icebarrel", 18, 24], ["rock", 26, 40]],
    bosses: ["yetiAncient"],
  },
  {
    id: "lava", name: "Schlackefeld",
    enemies: [["firespirit", 9], ["firewizard", 7], ["kobold", 3], ["minotaur", 3], ["firespewer", 2]],
    obstacles: [["vulkan", 30, 46], ["vulkan2", 26, 42]],
    bosses: ["minotaurLord", "lavaWurm"],
  },
  {
    id: "storm", name: "Gewitterhort", final: true,
    enemies: [],
    obstacles: [],
    bosses: ["thunderwing"],
  },
];

export const NORMAL_WORLD_SIZE = 4400;
export const FINAL_WORLD_SIZE = 1500;

// Zyklus 2+: jede Welt mischt zusätzlich Gegner aus allen anderen Welten
export function enemyPoolFor(biome, loop) {
  if (loop <= 0 || biome.final) return biome.enemies;
  const extra = [];
  for (const b of BIOMES) {
    if (b === biome || b.final) continue;
    for (const [id, w] of b.enemies) extra.push([id, w * 0.25]);
  }
  return [...biome.enemies, ...extra];
}
