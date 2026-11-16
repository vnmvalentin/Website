// data/weapons.js — Waffen und Talente, die man beim Stufenaufstieg im Lauf wählt (wie bei Megabonk/Vampire Survivors).
// Waffen feuern von selbst, unabhängig vom Zielen; Talente sind dauerhafte Werteboni. Beides hat Stufen 1–5, jede
// Stufe steht als eigene Zeile in `levels` (keine Formel), damit man jede Stufe einzeln abstimmen kann.
// Stufen 6–8 (seit November 2026) sind für die Horde gemacht: mehr Geschosse, mehr Durchschlag, mehr Fläche.
//
// Waffen: mult = Schadensfaktor auf den Basisschaden des Spielers (Items und Talente wirken also mit), cd = Sekunden
// zwischen zwei Auslösungen (Stoppuhr/Zeitkristall und das Talent "Hast" verkürzen sie), count = Anzahl Geschosse/Ziele
// (das Talent "Vielfalt" gibt +1), r = Radius bzw. Reichweite in px (das Talent "Weite" vergrößert ihn).
// Wie eine Waffe sich verhält, steht in engine/weapons.js.

export const MAX_WEAPONS = 6;
// Ab dieser Stufe kann eine Waffe (mit passendem Talent) zur Evolution werden. Wer das Talent nicht hat, baut die
// Grundwaffe einfach weiter aus — bis Stufe 8.
export const EVOLVE_AT = 5;
export const MAX_TALENTS = 4;

export const WEAPONS = {
  dolche: {
    name: "Wurfdolche", color: "#d8d0bc",
    blurb: "Wirft Dolche auf die nächsten Gegner.",
    levels: [
      { cd: 1.1, count: 1, mult: 0.9, pierce: 0 },
      { cd: 1.1, count: 2, mult: 0.9, pierce: 0 },
      { cd: 1.0, count: 2, mult: 1.15, pierce: 1 },
      { cd: 0.9, count: 3, mult: 1.15, pierce: 1 },
      { cd: 0.8, count: 4, mult: 1.4, pierce: 2 },
      { cd: 0.75, count: 5, mult: 1.4, pierce: 3 },
      { cd: 0.7, count: 6, mult: 1.6, pierce: 3 },
      { cd: 0.6, count: 7, mult: 1.8, pierce: 4 },
    ],
    desc: (l) => `${l.count} Dolch${l.count > 1 ? "e" : ""} alle ${l.cd} s, je ${pct(l.mult)}${l.pierce ? `, durchschlägt ${l.pierce}` : ""}`,
  },
  feuerkugeln: {
    name: "Feuerkugeln", color: "#ff9a3c",
    blurb: "Kugeln kreisen um dich und setzen Gegner in Brand.",
    levels: [
      { count: 2, mult: 0.8, r: 105, burn: 0.2 },
      { count: 3, mult: 0.8, r: 105, burn: 0.2 },
      { count: 3, mult: 1.05, r: 120, burn: 0.3 },
      { count: 4, mult: 1.05, r: 120, burn: 0.3 },
      { count: 5, mult: 1.35, r: 135, burn: 0.45 },
      { count: 6, mult: 1.35, r: 150, burn: 0.45 },
      { count: 6, mult: 1.6, r: 165, burn: 0.55 },
      { count: 8, mult: 1.8, r: 180, burn: 0.65 },
    ],
    desc: (l) => `${l.count} Kugeln, je ${pct(l.mult)} pro Treffer, Brand ${pct(l.burn)} pro s`,
  },
  donnerkeil: {
    name: "Donnerkeil", color: "#ffe14d",
    blurb: "Blitze schlagen in zufällige Gegner in deiner Nähe ein.",
    levels: [
      { cd: 2.0, count: 1, mult: 2.0, r: 70 },
      { cd: 2.0, count: 2, mult: 2.0, r: 70 },
      { cd: 1.8, count: 2, mult: 2.6, r: 80 },
      { cd: 1.6, count: 3, mult: 2.6, r: 80 },
      { cd: 1.4, count: 4, mult: 3.2, r: 95, stun: true },
      { cd: 1.3, count: 5, mult: 3.2, r: 105, stun: true },
      { cd: 1.15, count: 6, mult: 3.6, r: 115, stun: true },
      { cd: 1.0, count: 8, mult: 4.0, r: 130, stun: true },
    ],
    desc: (l) => `${l.count} Blitz${l.count > 1 ? "e" : ""} alle ${l.cd} s, je ${pct(l.mult)} im Umkreis${l.stun ? ", betäubt kurz" : ""}`,
  },
  glutaura: {
    name: "Glutaura", color: "#ff6a3a",
    blurb: "Eine heiße Aura versengt alles, was dir zu nahe kommt.",
    levels: [
      { r: 105, mult: 0.3 },
      { r: 125, mult: 0.3 },
      { r: 125, mult: 0.42 },
      { r: 150, mult: 0.42 },
      { r: 170, mult: 0.58, slow: 0.25 },
      { r: 190, mult: 0.66, slow: 0.25 },
      { r: 210, mult: 0.76, slow: 0.3 },
      { r: 240, mult: 0.9, slow: 0.35 },
    ],
    desc: (l) => `${pct(l.mult)} alle 0,5 s im Radius ${l.r}${l.slow ? `, verlangsamt um ${pct(l.slow)}` : ""}`,
  },
  bumerang: {
    name: "Bumerang", color: "#c9a06b",
    blurb: "Fliegt zum Gegner und kommt zurück — trifft auf beiden Wegen alles.",
    levels: [
      { cd: 1.9, count: 1, mult: 1.2, r: 380 },
      { cd: 1.9, count: 1, mult: 1.5, r: 420 },
      { cd: 1.7, count: 2, mult: 1.5, r: 420 },
      { cd: 1.5, count: 2, mult: 1.8, r: 460 },
      { cd: 1.3, count: 3, mult: 2.1, r: 500 },
      { cd: 1.2, count: 4, mult: 2.1, r: 520 },
      { cd: 1.1, count: 4, mult: 2.5, r: 540 },
      { cd: 1.0, count: 6, mult: 2.8, r: 560 },
    ],
    desc: (l) => `${l.count} Bumerang${l.count > 1 ? "s" : ""} alle ${l.cd} s, je ${pct(l.mult)} hin und zurück`,
  },
  saeure: {
    name: "Säureflasche", color: "#9be05a",
    blurb: "Wirft Flaschen auf Gegner — die Pfütze ätzt eine Weile weiter.",
    levels: [
      { cd: 3.0, count: 1, mult: 0.45, r: 75, dur: 3 },
      { cd: 3.0, count: 2, mult: 0.45, r: 75, dur: 3 },
      { cd: 2.8, count: 2, mult: 0.6, r: 90, dur: 3.5 },
      { cd: 2.5, count: 3, mult: 0.6, r: 90, dur: 4 },
      { cd: 2.2, count: 3, mult: 0.8, r: 105, dur: 4.5 },
      { cd: 2.0, count: 4, mult: 0.8, r: 115, dur: 4.5 },
      { cd: 1.8, count: 4, mult: 0.95, r: 125, dur: 5 },
      { cd: 1.6, count: 5, mult: 1.1, r: 140, dur: 5 },
    ],
    desc: (l) => `${l.count} Pfütze${l.count > 1 ? "n" : ""} alle ${l.cd} s, ${pct(l.mult)} alle 0,5 s für ${l.dur} s`,
  },
  peitsche: {
    name: "Kettenpeitsche", color: "#e8e2d4",
    blurb: "Schlägt waagrecht vor dir — ab Stufe 3 auch hinter dir.",
    levels: [
      { cd: 1.35, mult: 1.5, len: 210, both: false },
      { cd: 1.35, mult: 1.9, len: 220, both: false },
      { cd: 1.25, mult: 1.9, len: 230, both: true },
      { cd: 1.1, mult: 2.3, len: 250, both: true },
      { cd: 0.95, mult: 2.8, len: 280, both: true },
      { cd: 0.9, mult: 3.0, len: 310, both: true },
      { cd: 0.8, mult: 3.3, len: 340, both: true },
      { cd: 0.7, mult: 3.8, len: 400, both: true },
    ],
    desc: (l) => `Hieb alle ${l.cd} s, ${pct(l.mult)}, Länge ${l.len}${l.both ? ", beide Seiten" : ""}`,
  },
  schockwelle: {
    name: "Schockwelle", color: "#9ad1ff",
    blurb: "Ein Ring aus Druck schleudert Gegner von dir weg.",
    levels: [
      { cd: 3.6, mult: 1.3, r: 170 },
      { cd: 3.6, mult: 1.3, r: 205 },
      { cd: 3.1, mult: 1.7, r: 205 },
      { cd: 3.1, mult: 1.7, r: 240 },
      { cd: 2.6, mult: 2.2, r: 260, twice: true },
      { cd: 2.4, mult: 2.4, r: 290, twice: true },
      { cd: 2.2, mult: 2.7, r: 320, twice: true },
      { cd: 2.0, mult: 3.0, r: 360, twice: true },
    ],
    desc: (l) => `Ring alle ${l.cd} s, ${pct(l.mult)} im Radius ${l.r}${l.twice ? ", zweimal hintereinander" : ""}`,
  },
};

// Evolutionen: Waffe ab Stufe EVOLVE_AT + passendes Talent (beliebige Stufe) → beim nächsten Stufenaufstieg wird die
// Evolution angeboten und ersetzt die Waffe am selben Platz. Stufen darüber gehen nicht verloren (Stufe 7 → Evolution
// Stufe 3). Evolutionen lassen sich bis Stufe 4 ausbauen und räumen dann den Bildschirm.
const EVOLVED = {
  tausendklingen: {
    name: "Tausend Klingen", color: "#f5cf4a", evolvedFrom: "dolche", talent: "praezision",
    blurb: "Ein Fächer aus Dolchen, der durch ganze Reihen schneidet.",
    levels: [{ cd: 0.55, count: 6, mult: 1.6, pierce: 3 }, { cd: 0.5, count: 8, mult: 1.7, pierce: 4 }, { cd: 0.45, count: 10, mult: 1.9, pierce: 5 }, { cd: 0.4, count: 12, mult: 2.1, pierce: 6 }],
    desc: (l) => `${l.count} Dolche alle ${l.cd} s, je ${pct(l.mult)}, durchschlägt ${l.pierce}`,
  },
  sonnenkranz: {
    name: "Sonnenkranz", color: "#ffd84a", evolvedFrom: "feuerkugeln", talent: "weite",
    blurb: "Sechs Sonnen umkreisen dich und explodieren bei jedem Treffer.",
    levels: [{ count: 6, mult: 1.5, r: 150, burn: 0.6, blast: 0.9 }, { count: 7, mult: 1.7, r: 170, burn: 0.7, blast: 1.0 }, { count: 8, mult: 1.9, r: 190, burn: 0.8, blast: 1.15 }, { count: 10, mult: 2.1, r: 215, burn: 0.9, blast: 1.3 }],
    desc: (l) => `${l.count} Kugeln, je ${pct(l.mult)} und eine Explosion mit ${pct(l.blast)}`,
  },
  gewittersturm: {
    name: "Gewittersturm", color: "#fff3a0", evolvedFrom: "donnerkeil", talent: "hast",
    blurb: "Ein Dauerregen aus Blitzen um dich herum.",
    levels: [{ cd: 0.6, count: 3, mult: 3.0, r: 100, stun: true }, { cd: 0.55, count: 4, mult: 3.2, r: 110, stun: true }, { cd: 0.5, count: 5, mult: 3.5, r: 125, stun: true }, { cd: 0.42, count: 7, mult: 3.8, r: 140, stun: true }],
    desc: (l) => `${l.count} Blitze alle ${l.cd} s, je ${pct(l.mult)}, betäubt`,
  },
  hoellenherz: {
    name: "Höllenherz", color: "#ff3a2a", evolvedFrom: "glutaura", talent: "vitalitaet",
    blurb: "Die Aura verbrennt alles — und jeder Treffer heilt dich.",
    levels: [{ r: 195, mult: 0.75, slow: 0.3, leech: 0.004 }, { r: 220, mult: 0.9, slow: 0.3, leech: 0.004 }, { r: 250, mult: 1.05, slow: 0.35, leech: 0.004 }, { r: 290, mult: 1.25, slow: 0.4, leech: 0.004 }],
    desc: (l) => `${pct(l.mult)} alle 0,5 s im Radius ${l.r}, jeder Treffer heilt ${(l.leech * 100).toFixed(1)} % Leben`,
  },
  kriegsrad: {
    name: "Kriegsrad", color: "#e0b070", evolvedFrom: "bumerang", talent: "vielfalt",
    blurb: "Bumerangs kreisen dauerhaft um dich und schleudern Gegner weg.",
    levels: [{ count: 3, mult: 1.9, r: 170 }, { count: 4, mult: 2.1, r: 185 }, { count: 5, mult: 2.4, r: 200 }, { count: 6, mult: 2.7, r: 220 }],
    desc: (l) => `${l.count} kreisende Bumerangs, je ${pct(l.mult)} mit Rückstoß`,
  },
  seuchenkessel: {
    name: "Seuchenkessel", color: "#5fd03a", evolvedFrom: "saeure", talent: "wissen",
    blurb: "Die Pfützen kriechen dem nächsten Gegner hinterher.",
    levels: [{ cd: 2.0, count: 4, mult: 0.95, r: 110, dur: 5, seek: 130 }, { cd: 1.8, count: 5, mult: 1.05, r: 120, dur: 5, seek: 140 }, { cd: 1.6, count: 6, mult: 1.2, r: 130, dur: 5.5, seek: 150 }, { cd: 1.4, count: 7, mult: 1.35, r: 145, dur: 6, seek: 160 }],
    desc: (l) => `${l.count} wandernde Pfützen alle ${l.cd} s, ${pct(l.mult)} alle 0,5 s`,
  },
  drachenschweif: {
    name: "Drachenschweif", color: "#ff8a3a", evolvedFrom: "peitsche", talent: "macht",
    blurb: "Hiebe in alle vier Richtungen.",
    levels: [{ cd: 0.8, mult: 3.2, len: 320, four: true }, { cd: 0.72, mult: 3.5, len: 350, four: true }, { cd: 0.64, mult: 3.9, len: 390, four: true }, { cd: 0.55, mult: 4.3, len: 440, four: true }],
    desc: (l) => `Hiebe in 4 Richtungen alle ${l.cd} s, je ${pct(l.mult)}`,
  },
  erdbeben: {
    name: "Erdbeben", color: "#d8a050", evolvedFrom: "schockwelle", talent: "bollwerk",
    blurb: "Der Boden bebt, Gegner taumeln, Felsen fallen vom Himmel.",
    levels: [{ cd: 2.2, mult: 2.4, r: 300, stun: 0.6, rocks: 4 }, { cd: 2.0, mult: 2.7, r: 330, stun: 0.6, rocks: 5 }, { cd: 1.8, mult: 3.0, r: 360, stun: 0.7, rocks: 6 }, { cd: 1.6, mult: 3.4, r: 400, stun: 0.8, rocks: 8 }],
    desc: (l) => `Beben alle ${l.cd} s, ${pct(l.mult)}, betäubt, ${l.rocks} Felsen`,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS); // nur Grundwaffen (für "neue Waffe"-Angebote)
Object.assign(WEAPONS, EVOLVED);
export const EVOLUTION_IDS = Object.keys(EVOLVED);
export const EVOLUTION_OF = Object.fromEntries(EVOLUTION_IDS.map((id) => [EVOLVED[id].evolvedFrom, id]));

// Talente: stats(level) liefert Werte im selben Format wie Items (siehe engine/stats.js — "…Mult" wird multipliziert)
export const TALENTS = {
  macht: { name: "Macht", color: "#d9473a", max: 5,
    stats: (n) => ({ damagePct: 0.08 * n }), desc: (n) => `+${pct(0.08 * n)} Schaden` },
  hast: { name: "Hast", color: "#f0a33c", max: 5,
    stats: (n) => ({ weaponCdMult: Math.pow(0.92, n) }), desc: (n) => `Waffen feuern ${pct(1 - Math.pow(0.92, n))} schneller` },
  weite: { name: "Weite", color: "#c49aff", max: 5,
    stats: (n) => ({ areaPct: 0.12 * n }), desc: (n) => `+${pct(0.12 * n)} Fläche und Radius der Waffen` },
  vitalitaet: { name: "Vitalität", color: "#e5534b", max: 5,
    stats: (n) => ({ maxHpPct: 0.1 * n, regen: 0.4 * n }), desc: (n) => `+${pct(0.1 * n)} max. Leben, +${(0.4 * n).toFixed(1)} Leben pro s` },
  flinkheit: { name: "Flinkheit", color: "#86d05f", max: 5,
    stats: (n) => ({ moveSpeedPct: 0.06 * n }), desc: (n) => `+${pct(0.06 * n)} Lauftempo` },
  wissen: { name: "Wissen", color: "#5ec8ff", max: 5,
    stats: (n) => ({ xpPct: 0.12 * n, pickupPct: 0.2 * n }), desc: (n) => `+${pct(0.12 * n)} Erfahrung, +${pct(0.2 * n)} Sammelradius` },
  praezision: { name: "Präzision", color: "#f5cf4a", max: 5,
    stats: (n) => ({ critChance: 0.05 * n }), desc: (n) => `+${pct(0.05 * n)} Krit-Chance` },
  bollwerk: { name: "Bollwerk", color: "#a8a0b4", max: 5,
    stats: (n) => ({ armor: 6 * n }), desc: (n) => `+${6 * n} Rüstung` },
  vielfalt: { name: "Vielfalt", color: "#ffd84a", max: 2,
    stats: (n) => ({ weaponCount: n }), desc: (n) => `Waffen werfen/treffen ${n} ${n > 1 ? "Ziele" : "Ziel"} mehr` },
};

export const TALENT_IDS = Object.keys(TALENTS);

// Segen: Ist alles ausgebaut, gibt es bei jedem Aufstieg weiter etwas zu wählen — kleine Boni ohne Obergrenze
// (vorher Gold oder Heilung als Trostpreis). stats(n) wie bei Talenten.
export const BOONS = {
  kraft: { name: "Segen der Kraft", color: "#d9473a", stats: (n) => ({ damagePct: 0.04 * n }), desc: "+4 % Schaden" },
  zaehigkeit: { name: "Segen der Zähigkeit", color: "#e5534b", stats: (n) => ({ maxHpPct: 0.05 * n }), desc: "+5 % max. Leben" },
  eile: { name: "Segen der Eile", color: "#f0a33c", stats: (n) => ({ weaponCdMult: Math.pow(0.97, n) }), desc: "Waffen feuern 3 % schneller" },
};
export const BOON_IDS = Object.keys(BOONS);

function pct(x) {
  return `${Math.round(x * 100)} %`;
}
