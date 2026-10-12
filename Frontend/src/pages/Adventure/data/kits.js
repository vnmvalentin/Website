// data/kits.js — die spielbaren Kits (Klassen). Die ids sind absichtlich die alten Skin-ids: wer früher einen Skin
// gekauft hat (oder per Promo-Code bekommen hat), hat damit das passende Kit sofort frei. Ab welcher Account-Stufe ein
// Kit frei wird, steht NICHT hier, sondern im Backend (Backend/adventure/progression.js) — eine Quelle für Server und UI.
//
// Werte: hp = Basis-Lebenspunkte (Stufe 1), damage = Basisschaden pro 100 %, speed = Lauftempo in px/s.
// Aussehen: render/flat/heroes.js (gleiche id); projectile = Form des Hauptangriffs (render/flat/world.js).
// Jede Fähigkeit: mult = Schadensfaktor (1 = 100 % Basisschaden), cd = Abklingzeit in Sekunden.

export const KITS = {
  default: {
    id: "default",
    name: "Abenteurer",
    role: "Allrounder",
    projectile: "proj_basic",
    hp: 110, damage: 12, speed: 230, armor: 0, crit: 0.01,
    blurb: "Solide in allem. Schießt schnell, wirft Granaten und rollt sich aus der Gefahr.",
    abilities: {
      primary: { id: "shot", name: "Schuss", mult: 1.0, rate: 3.6, speed: 760, range: 650, desc: "Schneller Schuss, 100 % Schaden." },
      secondary: { id: "grenade", name: "Granate", mult: 2.4, cd: 7, radius: 105, desc: "Wirft eine Granate zum Zeiger: 240 % Flächenschaden." },
      utility: { id: "roll", name: "Hechtrolle", cd: 4, dist: 230, desc: "Rollt in Laufrichtung, kurz unverwundbar." },
      special: { id: "barrage", name: "Kugelhagel", mult: 0.9, cd: 15, shots: 10, desc: "Feuert 10 Schüsse im Fächer, je 90 %. Du läufst dabei langsamer." },
    },
  },
  knight: {
    id: "knight",
    name: "Ritter",
    role: "Bogenschütze in Rüstung",
    projectile: "proj_arrow",
    hp: 145, damage: 12, speed: 215, armor: 12, crit: 0.01,
    blurb: "Hält viel aus. Pfeile durchschlagen Gegner, der Schildstoß schafft Platz.",
    abilities: {
      primary: { id: "arrow", name: "Pfeil", mult: 1.5, rate: 2.2, speed: 940, range: 760, pierce: 1, desc: "Pfeil mit 150 %, durchschlägt einen Gegner." },
      secondary: { id: "shieldBash", name: "Schildstoß", mult: 3.0, cd: 6, radius: 140, desc: "Stößt Gegner vor dir zurück (300 %), 2 s halber Schaden." },
      utility: { id: "charge", name: "Sturmangriff", mult: 2.0, cd: 6, dist: 320, desc: "Prescht zum Zeiger und rammt Gegner (200 %)." },
      special: { id: "arrowRain", name: "Pfeilregen", mult: 0.9, cd: 14, radius: 190, desc: "Lässt am Zeiger 2,5 s lang Pfeile regnen (10 × 90 %)." },
    },
  },
  ninja: {
    id: "ninja",
    name: "Ninja",
    role: "Schnell und tödlich",
    projectile: "proj_shuriken",
    hp: 95, damage: 12, speed: 260, armor: 0, crit: 0.1,
    blurb: "Wenig Leben, viel Tempo. Hinterlässt beim Schattenschritt einen Köder.",
    abilities: {
      primary: { id: "shuriken", name: "Shuriken", mult: 0.8, rate: 5.2, speed: 820, range: 560, desc: "Sehr schnelle Wurfsterne, je 80 %. +10 % Krit." },
      secondary: { id: "fan", name: "Fächerwurf", mult: 1.3, cd: 4, shots: 7, desc: "7 Shuriken im Fächer, je 130 %." },
      utility: { id: "shadowStep", name: "Schattenschritt", cd: 3.5, charges: 2, dist: 270, desc: "Teleport Richtung Zeiger, lässt einen Köder zurück. 2 Ladungen." },
      special: { id: "bladeSpin", name: "Klingenwirbel", mult: 1.4, cd: 12, radius: 160, desc: "2,5 s Wirbel um dich herum (10 × 140 %), schneller laufen." },
    },
  },
  wizard: {
    id: "wizard",
    name: "Magier",
    role: "Flächenschaden",
    projectile: "proj_fireball",
    hp: 90, damage: 12, speed: 225, armor: 0, crit: 0.01,
    blurb: "Feuerbälle explodieren, die Frostnova friert alles um dich ein.",
    abilities: {
      primary: { id: "fireball", name: "Feuerball", mult: 1.7, rate: 1.9, speed: 560, range: 640, radius: 60, desc: "Explodierender Feuerball, 170 %." },
      secondary: { id: "frostNova", name: "Frostnova", mult: 2.0, cd: 7, radius: 210, desc: "200 % um dich herum, friert Gegner 1,5 s ein." },
      utility: { id: "blink", name: "Blinzeln", cd: 5, dist: 360, desc: "Teleportiert dich zum Zeiger." },
      special: { id: "meteor", name: "Meteor", mult: 12, cd: 15, radius: 200, desc: "Nach 1 s schlägt am Zeiger ein Meteor ein: 1200 % und Brand." },
    },
  },
  bestmod: {
    id: "bestmod",
    name: "Giftmischer",
    role: "Schaden über Zeit",
    projectile: "proj_poisonball",
    hp: 105, damage: 12, speed: 230, armor: 0, crit: 0.01,
    blurb: "Jeder Treffer vergiftet. Die Seuche lässt Gift auf einmal hochgehen.",
    abilities: {
      primary: { id: "toxin", name: "Giftkugel", mult: 0.7, rate: 3.0, speed: 640, range: 600, desc: "70 % und Gift (2 s, stapelbar)." },
      secondary: { id: "toxicCloud", name: "Giftwolke", mult: 0.6, cd: 6, radius: 150, desc: "Giftwolke am Zeiger, 5 s lang 60 % alle 0,5 s." },
      utility: { id: "acidSprint", name: "Säuresprint", mult: 0.8, cd: 6, desc: "2,5 s +60 % Tempo, hinterlässt eine Säurespur." },
      special: { id: "plague", name: "Seuche", mult: 2.0, cd: 16, desc: "Alle vergifteten Gegner in Sicht: 200 % pro Giftstapel." },
    },
  },
  cyber: {
    id: "cyber",
    name: "Cyber-Söldner",
    role: "Dauerfeuer und Technik",
    projectile: "proj_laser",
    hp: 100, damage: 12, speed: 235, armor: 5, crit: 0.01,
    blurb: "Stellt Geschütztürme auf und ruft Orbitalschläge.",
    abilities: {
      primary: { id: "laser", name: "Laser", mult: 0.55, rate: 8, speed: 1050, range: 620, desc: "Laserfeuer, je 55 %." },
      secondary: { id: "turret", name: "Geschützturm", mult: 0.45, cd: 12, charges: 2, desc: "Turm für 12 s, feuert 6 × pro Sekunde (45 %). 2 Ladungen." },
      utility: { id: "overdrive", name: "Overdrive", cd: 8, desc: "3 s +80 % Tempo und +50 % Angriffstempo." },
      special: { id: "orbital", name: "Orbitalschlag", mult: 5, cd: 18, desc: "5 Blitzeinschläge in Reihe zum Zeiger, je 500 %." },
    },
  },
  gh0stqq: {
    id: "gh0stqq",
    name: "Baumeister",
    role: "Mauern und Kontrolle",
    projectile: "proj_block",
    hp: 130, damage: 12, speed: 220, armor: 5, crit: 0.01,
    blurb: "Baut Mauern, an denen Gegner und Geschosse hängen bleiben.",
    abilities: {
      primary: { id: "block", name: "Blockwurf", mult: 1.2, rate: 2.6, speed: 720, range: 620, desc: "120 %, prallt auf einen weiteren Gegner ab." },
      secondary: { id: "wall", name: "Mauer", cd: 8, desc: "Mauer am Zeiger für 6 s. Hält Gegner und Geschosse auf." },
      utility: { id: "leap", name: "Sprungpolster", mult: 1.5, cd: 5, dist: 340, radius: 140, desc: "Springt zum Zeiger, Landung macht 150 %." },
      special: { id: "fortress", name: "Festung", cd: 20, desc: "Mauerring um dich für 5 s, darin +50 % Angriffstempo." },
    },
  },
};


export const KIT_ORDER = ["default", "knight", "ninja", "wizard", "bestmod", "cyber", "gh0stqq"];

// Tasten für die Fähigkeitsleiste (Anzeige im HUD und im Kit-Menü)
export const SLOT_KEYS = { primary: "LMB", secondary: "RMB", utility: "Leer", special: "R", equipment: "Q" };
