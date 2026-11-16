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
// tier = Stufe in der Horde (engine/director.js): "futter" ist die Masse und fällt mit einem Treffer, "kaempfer"
// (Standard, wenn nichts dasteht) halten etwas aus, "brocken" sind große Einzelne, "spezial" ist streng begrenzt.
// Futter-Leben wächst flacher mit der Schwierigkeit (engine/difficulty.js, fodderHpMult).
//
// Namen: seit November 2026 heißen die Gegner so, wie sie in der 3D-Ansicht aussehen (render3d/cast.js) — die ids
// stammen noch aus der 2D-Zeit (goblin ist der Skelett-Knecht, mummy der Kaktusling …). Die 2D-Ansicht zeichnet
// weiter die alten Figuren.
//
// Aussehen in 2D: render/flat/creatures.js — dort gibt es zu jeder id hier eine gleichnamige Figur. Ausnahme: fig + pal
// zeichnen eine vorhandene Figur in anderen Farben (render/flat/figures.js).

export const ENEMIES = {
  zombie: { name: "Schleicher",
    hp: 40, dmg: 8, speed: 72, r: 21, cost: 5, ai: "chase", effect: "slow", group: 3 },
  shieldbearer: { name: "Schildträger",
    hp: 110, dmg: 12, speed: 82, r: 26, cost: 22, ai: "shield", tier: "spezial" },
  goblin: { name: "Skelett-Knecht",
    hp: 11, dmg: 6, speed: 138, r: 17, cost: 0.75, ai: "chase", tier: "futter" },
  skeleton: { name: "Skelettschütze",
    hp: 30, dmg: 7, speed: 110, r: 21, cost: 11, ai: "ranged", proj: "proj_arrow", projSpeed: 380, fireEvery: 2.2, keep: 380, tier: "spezial" },
  orc: { name: "Barbar",
    hp: 140, dmg: 15, speed: 95, r: 32, cost: 28, ai: "brute", reach: 80, tier: "brocken" },
  nekromant: { name: "Nekromant",
    hp: 90, dmg: 8, speed: 90, r: 26, cost: 40, ai: "summoner", proj: "proj_laser", projSpeed: 300, tier: "spezial" },

  skeletonwarrior: { name: "Skelettkrieger",
    hp: 36, dmg: 8, speed: 140, r: 21, cost: 5, ai: "chase" },
  spider: { name: "Tentakler",
    hp: 34, dmg: 6, speed: 130, r: 22, cost: 12, ai: "ranged", proj: "proj_web", projSpeed: 330, fireEvery: 2.4, keep: 340, effect: "web", tier: "spezial" },
  krabbler: { name: "Pilzling", fig: "spider", pal: { body: "#6b4a3a", dark: "#4a3226", mark: "#e0b04a", eye: "#ffe14d" },
    hp: 30, dmg: 7, speed: 152, r: 17, cost: 4, ai: "chase" },
  bat: { name: "Flatterer",
    hp: 7, dmg: 5, speed: 190, r: 13, cost: 0.55, ai: "swarm", group: 6, flying: true, tier: "futter" },
  troll: { name: "Pilzhüne",
    hp: 180, dmg: 17, speed: 90, r: 36, cost: 32, ai: "brute", reach: 90, tier: "brocken" },

  mummy: { name: "Kaktusling",
    hp: 12, dmg: 7, speed: 118, r: 19, cost: 0.85, ai: "chase", tier: "futter" },
  sandkrabbler: { name: "Wüstenbiene", fig: "scorpion", pal: { body: "#3a4a6b", dark: "#283552" },
    hp: 9, dmg: 6, speed: 160, r: 14, cost: 0.65, ai: "chase", tier: "futter" },
  scorpion: { name: "Stachelkaktus",
    hp: 36, dmg: 6, speed: 125, r: 22, cost: 12, ai: "ranged", proj: "proj_sand", projSpeed: 360, fireEvery: 2.1, keep: 360, effect: "poison", tier: "spezial" },
  golem: { name: "Sanddino",
    hp: 190, dmg: 17, speed: 85, r: 36, cost: 32, ai: "brute", reach: 90, tier: "brocken" },
  sandworm: { name: "Wühldino",
    hp: 120, dmg: 16, speed: 170, r: 28, cost: 26, ai: "burrow", proj: "proj_sand", projSpeed: 340, tier: "brocken" },
  shaman: { name: "Maskenschamane",
    hp: 60, dmg: 6, speed: 110, r: 23, cost: 30, ai: "healer", tier: "spezial" },

  snowman: { name: "Yeti-Junges",
    hp: 12, dmg: 7, speed: 114, r: 19, cost: 0.85, ai: "chase", tier: "futter" },
  frostschleim: { name: "Frostschleim", fig: "slime", pal: { body: "#a8e4ff", dark: "#6fb6dc" },
    hp: 11, dmg: 6, speed: 132, r: 16, cost: 0.75, ai: "chase", tier: "futter" },
  penguin: { name: "Frostvogel",
    hp: 40, dmg: 9, speed: 120, r: 20, cost: 12, ai: "charger", chargeSpeed: 520, chargeDist: 420, tier: "spezial" },
  yeti: { name: "Yeti",
    hp: 170, dmg: 16, speed: 95, r: 36, cost: 30, ai: "brute", reach: 90, tier: "brocken" },
  bear: { name: "Lawinen-Yeti",
    hp: 150, dmg: 15, speed: 88, r: 30, cost: 26, ai: "roller", rollSpeed: 560, tier: "brocken" },
  icespirit: { name: "Eisgeist",
    hp: 34, dmg: 8, speed: 110, r: 21, cost: 16, ai: "ranged", proj: "proj_iceball", projSpeed: 520, fireEvery: 2.8, keep: 520, effect: "freeze", tier: "spezial" },

  glutschleim: { name: "Glutschleim", fig: "slime", pal: { body: "#ff8a3a", dark: "#c9521f" },
    hp: 12, dmg: 7, speed: 130, r: 16, cost: 0.85, ai: "chase", tier: "futter" },
  aschenskelett: { name: "Aschenskelett", fig: "skeletonwarrior", pal: { bone: "#6b6470", dark: "#463f4c", eye: "#ff9a3c", shield: "#3a2a2a" },
    hp: 12, dmg: 7, speed: 124, r: 18, cost: 0.9, ai: "chase", tier: "futter" },
  firespirit: { name: "Funkendrache",
    hp: 30, dmg: 14, speed: 175, r: 19, cost: 6, ai: "exploder" },
  firewizard: { name: "Feuerhexer",
    hp: 40, dmg: 9, speed: 105, r: 22, cost: 13, ai: "ranged", proj: "proj_fireball", projSpeed: 340, fireEvery: 2.3, keep: 400, effect: "burn", tier: "spezial" },
  minotaur: { name: "Hörnerdämon",
    hp: 170, dmg: 18, speed: 100, r: 36, cost: 32, ai: "charger", chargeSpeed: 640, chargeDist: 520, tier: "brocken" },
  kobold: { name: "Mörserkobold",
    hp: 45, dmg: 12, speed: 95, r: 20, cost: 18, ai: "mortar", keep: 520, fireEvery: 3.2, effect: "burn", tier: "spezial" },
  firespewer: { name: "Feuerdrache",
    hp: 85, dmg: 9, speed: 0, r: 28, cost: 18, ai: "turret", proj: "proj_fireball", projSpeed: 320, fireEvery: 2.0, effect: "burn", tier: "spezial" },

  slime: { name: "Schleim",
    hp: 12, dmg: 6, speed: 128, r: 16, cost: 0.75, ai: "chase", tier: "futter" },
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
