// data/enemies.js — Gegnertypen. Werte gelten für Schwierigkeit 1; engine/difficulty.js skaliert Leben und Schaden mit
// der Zeit. cost = was der Spawn-Director für einen dieser Gegner ausgibt (auch Grundlage für Gold und XP).
//
// ai:
//   chase    läuft direkt auf dich zu, Kontaktschaden
//   brute    läuft, bleibt in Reichweite stehen, holt sichtbar aus (windup) und schlägt in einem Kreis vor sich
//   ranged   hält Abstand und schießt (proj = Sprite-Schlüssel, effect = Zustand beim Treffer)
//   charger  zielt (Linie sichtbar), rennt dann geradeaus
//   exploder läuft heran, zündet bei Nähe eine sichtbare Explosion
//   healer   bleibt hinten und heilt verletzte Verbündete
//   summoner beschwört Skelettkrieger und schießt langsam
//   turret   steht still und feuert Dreierfächer
//   shield   läuft auf dich zu und blockt Geschosse von vorn (Flanke oder Flächenschaden nötig)
//   swarm    schnell und schwach, fliegt in Wellenlinien und kommt in Gruppen (group)
//   burrow   unter der Erde (unverwundbar, nur ein Erdhügel), bricht unter dir hervor, ist dann kurz angreifbar
//   roller   zielt, rollt als Kugel los, prallt an Hindernissen ab, ist danach benommen
//   mortar   hält großen Abstand und schießt im Bogen — der Einschlag ist vorher als Kreis zu sehen
// group = so viele kommen mindestens auf einmal · flying = fliegt über Hindernisse · effect = Zustand bei Treffern
//
// Aussehen: render/flat/creatures.js — dort gibt es zu jeder id hier eine gleichnamige Figur.

export const ENEMIES = {
  zombie: { name: "Zombie",
    hp: 62, dmg: 9, speed: 72, r: 21, cost: 7, ai: "chase", effect: "slow", group: 3 },
  shieldbearer: { name: "Schildträger",
    hp: 110, dmg: 12, speed: 82, r: 26, cost: 22, ai: "shield" },
  goblin: { name: "Goblin",
    hp: 38, dmg: 7, speed: 150, r: 20, cost: 8, ai: "chase" },
  skeleton: { name: "Skelettschütze",
    hp: 30, dmg: 7, speed: 110, r: 21, cost: 11, ai: "ranged", proj: "proj_arrow", projSpeed: 380, fireEvery: 2.2, keep: 380 },
  orc: { name: "Ork",
    hp: 140, dmg: 15, speed: 95, r: 32, cost: 28, ai: "brute", reach: 80 },
  nekromant: { name: "Nekromant",
    hp: 90, dmg: 8, speed: 90, r: 26, cost: 40, ai: "summoner", proj: "proj_laser", projSpeed: 300 },

  skeletonwarrior: { name: "Skelettkrieger",
    hp: 50, dmg: 8, speed: 140, r: 21, cost: 10, ai: "chase" },
  spider: { name: "Höhlenspinne",
    hp: 34, dmg: 6, speed: 130, r: 22, cost: 12, ai: "ranged", proj: "proj_web", projSpeed: 330, fireEvery: 2.4, keep: 340, effect: "web" },
  bat: { name: "Fledermaus",
    hp: 13, dmg: 5, speed: 235, r: 13, cost: 3, ai: "swarm", group: 6, flying: true },
  troll: { name: "Troll",
    hp: 180, dmg: 17, speed: 90, r: 36, cost: 32, ai: "brute", reach: 90 },

  mummy: { name: "Mumie",
    hp: 50, dmg: 8, speed: 120, r: 21, cost: 9, ai: "chase" },
  scorpion: { name: "Skorpion",
    hp: 36, dmg: 6, speed: 125, r: 22, cost: 12, ai: "ranged", proj: "proj_sand", projSpeed: 360, fireEvery: 2.1, keep: 360, effect: "poison" },
  golem: { name: "Sandgolem",
    hp: 190, dmg: 17, speed: 85, r: 36, cost: 32, ai: "brute", reach: 90 },
  sandworm: { name: "Sandwurm",
    hp: 120, dmg: 16, speed: 170, r: 28, cost: 26, ai: "burrow", proj: "proj_sand", projSpeed: 340 },
  shaman: { name: "Schamane",
    hp: 60, dmg: 6, speed: 110, r: 23, cost: 30, ai: "healer" },

  snowman: { name: "Schneemann",
    hp: 52, dmg: 8, speed: 115, r: 22, cost: 9, ai: "chase" },
  penguin: { name: "Kampfpinguin",
    hp: 40, dmg: 9, speed: 120, r: 20, cost: 12, ai: "charger", chargeSpeed: 520, chargeDist: 420 },
  yeti: { name: "Yeti",
    hp: 170, dmg: 16, speed: 95, r: 36, cost: 30, ai: "brute", reach: 90 },
  bear: { name: "Lawinenbär",
    hp: 150, dmg: 15, speed: 88, r: 30, cost: 26, ai: "roller", rollSpeed: 560 },
  icespirit: { name: "Eisgeist",
    hp: 34, dmg: 8, speed: 110, r: 21, cost: 16, ai: "ranged", proj: "proj_iceball", projSpeed: 520, fireEvery: 2.8, keep: 520, effect: "freeze" },

  firespirit: { name: "Flammengeist",
    hp: 30, dmg: 14, speed: 175, r: 19, cost: 9, ai: "exploder" },
  firewizard: { name: "Feuermagier",
    hp: 40, dmg: 9, speed: 105, r: 22, cost: 13, ai: "ranged", proj: "proj_fireball", projSpeed: 340, fireEvery: 2.3, keep: 400, effect: "burn" },
  minotaur: { name: "Minotaurus",
    hp: 170, dmg: 18, speed: 100, r: 36, cost: 32, ai: "charger", chargeSpeed: 640, chargeDist: 520 },
  kobold: { name: "Mörserkobold",
    hp: 45, dmg: 12, speed: 95, r: 20, cost: 18, ai: "mortar", keep: 520, fireEvery: 3.2, effect: "burn" },
  firespewer: { name: "Feuerspeier",
    hp: 85, dmg: 9, speed: 0, r: 28, cost: 18, ai: "turret", proj: "proj_fireball", projSpeed: 320, fireEvery: 2.0, effect: "burn" },

  slime: { name: "Schleim",
    hp: 26, dmg: 6, speed: 130, r: 18, cost: 6, ai: "chase" },
};

// Elite-Eigenschaften: ein Elite hat ×4 Leben, ×2 Schaden und eine dieser Eigenschaften
export const ELITE_AFFIXES = {
  feuer: { name: "Feurig", color: "#ff7a2e" },
  eis: { name: "Eisig", color: "#7fd6ff" },
  blitz: { name: "Geladen", color: "#ffe14d" },
  gift: { name: "Giftig", color: "#8be04e" },
  spiegelnd: { name: "Spiegelnd", color: "#cfe8ff", desc: "wirft jedes 5. Geschoss zurück" },
  vampir: { name: "Vampirisch", color: "#b0263a", desc: "heilt sich ständig und bei Treffern" },
  teilend: { name: "Teilend", color: "#ff9ad5", desc: "zerfällt beim Tod in zwei Kopien" },
  hastig: { name: "Hastig", color: "#ffffff", desc: "fast doppelt so schnell, halbes Leben" },
  beschwoerend: { name: "Beschwörend", color: "#a07bff", desc: "ruft Skelette herbei" },
};
export const ELITE_AFFIX_IDS = Object.keys(ELITE_AFFIXES);
