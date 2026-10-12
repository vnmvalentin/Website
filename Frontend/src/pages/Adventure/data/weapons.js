// data/weapons.js — Waffen und Talente, die man beim Stufenaufstieg im Lauf wählt (wie bei Megabonk/Vampire Survivors).
// Waffen feuern von selbst, unabhängig vom Zielen; Talente sind dauerhafte Werteboni. Beides hat Stufen 1–5, jede
// Stufe steht als eigene Zeile in `levels` (keine Formel), damit man jede Stufe einzeln abstimmen kann.
//
// Waffen: mult = Schadensfaktor auf den Basisschaden des Spielers (Items und Talente wirken also mit), cd = Sekunden
// zwischen zwei Auslösungen (Stoppuhr/Zeitkristall und das Talent "Hast" verkürzen sie), count = Anzahl Geschosse/Ziele
// (das Talent "Vielfalt" gibt +1), r = Radius bzw. Reichweite in px (das Talent "Weite" vergrößert ihn).
// Wie eine Waffe sich verhält, steht in engine/weapons.js.

export const MAX_WEAPONS = 4;
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
    ],
    desc: (l) => `Ring alle ${l.cd} s, ${pct(l.mult)} im Radius ${l.r}${l.twice ? ", zweimal hintereinander" : ""}`,
  },
};

// Evolutionen: Waffe auf Höchststufe + passendes Talent (beliebige Stufe) → beim nächsten Stufenaufstieg wird die
// Evolution angeboten und ersetzt die Waffe am selben Platz. Eine Stufe, kein weiterer Ausbau.
const EVOLVED = {
  tausendklingen: {
    name: "Tausend Klingen", color: "#f5cf4a", evolvedFrom: "dolche", talent: "praezision",
    blurb: "Ein Fächer aus Dolchen, der durch ganze Reihen schneidet.",
    levels: [{ cd: 0.55, count: 6, mult: 1.6, pierce: 3 }],
    desc: (l) => `${l.count} Dolche alle ${l.cd} s, je ${pct(l.mult)}, durchschlägt ${l.pierce}`,
  },
  sonnenkranz: {
    name: "Sonnenkranz", color: "#ffd84a", evolvedFrom: "feuerkugeln", talent: "weite",
    blurb: "Sechs Sonnen umkreisen dich und explodieren bei jedem Treffer.",
    levels: [{ count: 6, mult: 1.5, r: 150, burn: 0.6, blast: 0.9 }],
    desc: (l) => `${l.count} Kugeln, je ${pct(l.mult)} und eine Explosion mit ${pct(l.blast)}`,
  },
  gewittersturm: {
    name: "Gewittersturm", color: "#fff3a0", evolvedFrom: "donnerkeil", talent: "hast",
    blurb: "Ein Dauerregen aus Blitzen um dich herum.",
    levels: [{ cd: 0.6, count: 3, mult: 3.0, r: 100, stun: true }],
    desc: (l) => `${l.count} Blitze alle ${l.cd} s, je ${pct(l.mult)}, betäubt`,
  },
  hoellenherz: {
    name: "Höllenherz", color: "#ff3a2a", evolvedFrom: "glutaura", talent: "vitalitaet",
    blurb: "Die Aura verbrennt alles — und jeder Treffer heilt dich.",
    levels: [{ r: 195, mult: 0.75, slow: 0.3, leech: 0.004 }],
    desc: (l) => `${pct(l.mult)} alle 0,5 s im Radius ${l.r}, jeder Treffer heilt ${(l.leech * 100).toFixed(1)} % Leben`,
  },
  kriegsrad: {
    name: "Kriegsrad", color: "#e0b070", evolvedFrom: "bumerang", talent: "vielfalt",
    blurb: "Bumerangs kreisen dauerhaft um dich und schleudern Gegner weg.",
    levels: [{ count: 3, mult: 1.9, r: 170 }],
    desc: (l) => `${l.count} kreisende Bumerangs, je ${pct(l.mult)} mit Rückstoß`,
  },
  seuchenkessel: {
    name: "Seuchenkessel", color: "#5fd03a", evolvedFrom: "saeure", talent: "wissen",
    blurb: "Die Pfützen kriechen dem nächsten Gegner hinterher.",
    levels: [{ cd: 2.0, count: 4, mult: 0.95, r: 110, dur: 5, seek: 130 }],
    desc: (l) => `${l.count} wandernde Pfützen alle ${l.cd} s, ${pct(l.mult)} alle 0,5 s`,
  },
  drachenschweif: {
    name: "Drachenschweif", color: "#ff8a3a", evolvedFrom: "peitsche", talent: "macht",
    blurb: "Hiebe in alle vier Richtungen.",
    levels: [{ cd: 0.8, mult: 3.2, len: 320, four: true }],
    desc: (l) => `Hiebe in 4 Richtungen alle ${l.cd} s, je ${pct(l.mult)}`,
  },
  erdbeben: {
    name: "Erdbeben", color: "#d8a050", evolvedFrom: "schockwelle", talent: "bollwerk",
    blurb: "Der Boden bebt, Gegner taumeln, Felsen fallen vom Himmel.",
    levels: [{ cd: 2.2, mult: 2.4, r: 300, stun: 0.6, rocks: 4 }],
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

function pct(x) {
  return `${Math.round(x * 100)} %`;
}
