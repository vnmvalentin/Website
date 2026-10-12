// data/bosses.js — Stammdaten der Bosse (Name, Werte, Beute). Das Verhalten steht je Boss in engine/bosses/<id>.js.
// Aussehen: render/flat/creatures.js BOSS_LOOK (welche Figur, welche Farben).

export const BOSSES = {
  necromancer: { name: "Nekromantenfürst", title: "Herr der Knochen",
    hp: 1900, dmg: 14, speed: 85, r: 70, item: "knochenkrone" },
  fallenKnight: { name: "Gefallener Ritter", title: "Eidbrecher",
    hp: 1700, dmg: 13, speed: 110, r: 66, item: "schwarzschild" },
  slimeKing: { name: "König Schleim", title: "Der Unverdauliche",
    hp: 2700, dmg: 15, speed: 110, r: 95, item: "schleimkern" },
  spiderQueen: { name: "Spinnenkönigin", title: "Mutter der Brut",
    hp: 2300, dmg: 15, speed: 150, r: 78, item: "spinnendruese" },
  sandColossus: { name: "Sandkoloss", title: "Wächter der Dünen",
    hp: 3600, dmg: 20, speed: 70, r: 100, item: "kolossherz" },
  pharaoh: { name: "Pharao Ankhamun", title: "Der niemals schläft",
    hp: 3300, dmg: 19, speed: 80, r: 70, item: "skarabaeus" },
  yetiAncient: { name: "Yeti-Urahn", title: "Der ewige Frost",
    hp: 3200, dmg: 19, speed: 105, r: 95, item: "frostfell" },
  minotaurLord: { name: "Minotaurenfürst", title: "Hüter der Schlacke",
    hp: 3400, dmg: 21, speed: 115, r: 95, item: "hornbrecher" },
  lavaWurm: { name: "Lavawurm", title: "Das Feuer unter dem Fels",
    hp: 3300, dmg: 21, speed: 150, r: 64, item: "magmaherz" },
  thunderwing: { name: "Thunderwing", title: "Herr des Gewitters",
    hp: 5200, dmg: 22, speed: 200, r: 100, item: "sturmschwinge", final: true },
};
