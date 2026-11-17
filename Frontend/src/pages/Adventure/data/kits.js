// data/kits.js — die spielbaren Kits (Klassen). Die ids sind absichtlich die alten Skin-ids: wer früher einen Skin
// gekauft hat, hat damit das passende Kit sofort frei. Ab welcher Account-Stufe ein
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
    name: "Tüftler",
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
    name: "Steinbrecher",
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

  // ── Kits seit November 2026 (Ausbauplan „av-welten“) — Figuren: Quaternius „RPG Characters“ (render3d/cast.js) ──
  moench: {
    id: "moench",
    name: "Mönch",
    role: "Nahkampf und Kombos",
    projectile: "proj_chi",
    hp: 140, damage: 12, speed: 240, armor: 8, crit: 0.05,
    blurb: "Kämpft mit bloßen Händen. Jeder dritte Schlag wird zur Druckwelle, der Windschritt trifft alles auf dem Weg.",
    abilities: {
      // melee: kein Geschoss, sondern ein Schlag im Bogen vor dir (range = Reichweite, arc = halber Öffnungswinkel)
      primary: { id: "palm", name: "Handflächenschlag", melee: true, mult: 1.7, rate: 3.0, range: 150, arc: 1.0, comboMult: 2.5,
        desc: "Schlag vor dir (170 %), stößt zurück. Jeder 3. Schlag ist eine Druckwelle rundum (250 %)." },
      secondary: { id: "chiWave", name: "Chi-Welle", mult: 2.4, cd: 5, desc: "Eine Welle aus Chi rast geradeaus durch alle Gegner (240 %)." },
      utility: { id: "windStep", name: "Windschritt", mult: 1.5, cd: 4, dist: 280, desc: "Prescht in Laufrichtung und trifft alles auf dem Weg (150 %)." },
      special: { id: "hundredFists", name: "Hundert Fäuste", mult: 0.75, cd: 14, radius: 160, desc: "2 s lang ein Hagel aus Schlägen um dich (20 × 75 %)." },
    },
  },
  jaegerin: {
    id: "jaegerin",
    name: "Jägerin",
    role: "Fallen und Wolfsrudel",
    projectile: "proj_arrow",
    hp: 110, damage: 12, speed: 245, armor: 2, crit: 0.06,
    blurb: "Legt Fangeisen und jagt mit ihren Wölfen. Der Salto bringt sie aus jeder Umklammerung.",
    abilities: {
      primary: { id: "huntArrow", name: "Jagdpfeil", mult: 1.15, rate: 3.2, speed: 1000, range: 740, desc: "Schnelle Pfeile, je 115 %. +6 % Krit." },
      secondary: { id: "bearTrap", name: "Fangeisen", mult: 3.0, cd: 4.5, charges: 3, radius: 105,
        desc: "Legt ein Fangeisen zum Zeiger. Wer hineintritt, löst es aus: 300 % rundum, 1,5 s festgefroren. 3 Ladungen." },
      utility: { id: "backflip", name: "Rückwärtssalto", cd: 4, dist: 260, desc: "Springt vom Zeiger weg und lässt ein Fangeisen zurück." },
      special: { id: "wolfPack", name: "Wolfsrudel", mult: 1.5, cd: 18, desc: "Zwei Wölfe jagen 15 s lang mit dir, jeder Biss 150 %." },
    },
  },
  nekromantin: {
    id: "nekromantin",
    name: "Nekromantin",
    role: "Heer der Toten",
    projectile: "proj_soul",
    hp: 100, damage: 12, speed: 225, armor: 0, crit: 0.02,
    blurb: "Wer durch ihren Seelenblitz fällt, steht als Skelett für sie wieder auf. Das Heer der Toten überrennt alles.",
    abilities: {
      primary: { id: "soulBolt", name: "Seelenblitz", mult: 1.25, rate: 2.6, speed: 680, range: 640, raise: 0.08,
        desc: "Seelenblitz, 125 %. Wer daran stirbt, steht zu 8 % als Skelett für dich auf (höchstens 8)." },
      secondary: { id: "boneSpikes", name: "Knochendornen", mult: 2.2, cd: 5, radius: 130, desc: "Knochen brechen am Zeiger aus dem Boden: 220 %, verlangsamt." },
      utility: { id: "soulSwap", name: "Seelentausch", cd: 6, dist: 340, desc: "Teleportiert zum Zeiger, an der alten Stelle steht ein Skelett auf." },
      special: { id: "deadArmy", name: "Heer der Toten", cd: 20, shots: 6, desc: "Ruft 6 Skelette um dich. Alle Skelette schlagen 6 s lang doppelt so hart." },
    },
  },
  alchemist: {
    id: "alchemist",
    name: "Alchemist",
    role: "Tränke und Reaktionen",
    projectile: "proj_flask",
    hp: 120, damage: 12, speed: 230, armor: 5, crit: 0.02,
    blurb: "Wirft Flaschen, die abwechselnd brennen, bremsen und vergiften. Die Kettenreaktion bringt alles auf einmal.",
    abilities: {
      // lob: fliegt zum Zeiger und platzt dort (radius); die Elemente wechseln reihum (engine/abilities.js ELEMENTS)
      primary: { id: "flask", name: "Wurfflasche", lob: true, mult: 1.6, rate: 2.4, speed: 620, range: 560, radius: 80,
        desc: "Flasche zum Zeiger, platzt rundum (160 %): im Wechsel Feuer, Frost und Säure." },
      secondary: { id: "elixir", name: "Elixier", cd: 10, desc: "Trinkt ein Elixier: heilt 15 % und gibt 5 s +60 % Angriffstempo." },
      utility: { id: "smokeBomb", name: "Rauchbombe", cd: 5, dist: 240, radius: 150, desc: "Springt in Laufrichtung, am Absprung bleibt Rauch, der Gegner bremst." },
      special: { id: "chainReaction", name: "Kettenreaktion", mult: 3.0, cd: 15, desc: "Großer Kolben zum Zeiger, platzt in eine Kette aus Explosionen aller Elemente (je 300 %)." },
    },
  },
};


export const KIT_ORDER = ["default", "knight", "ninja", "wizard", "bestmod", "cyber", "gh0stqq", "moench", "jaegerin", "nekromantin", "alchemist"];

// Tasten für die Fähigkeitsleiste (Anzeige im HUD und im Kit-Menü)
export const SLOT_KEYS = { primary: "LMB", secondary: "RMB", utility: "Leer", special: "R", equipment: "Q" };
