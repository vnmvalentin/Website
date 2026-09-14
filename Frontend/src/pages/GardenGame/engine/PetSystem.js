// engine/PetSystem.js
// Tier-Fähigkeiten an EINER Stelle. Spiegel von Backend/garden/core/pets.js —
// gerechnet wird dort, hier steht nur, was die Oberfläche anzeigt.
//
// ── Was Tiere seit August 2026 sind ─────────────────────────────────────────
// Boni auf das, was der Spieler selbst tut — keine zweite Farm, die nebenher läuft.
// Es gibt kein Offline-Farmen mehr (Backend/garden/core/offline.js ist gestrichen),
// und der Erntehelfer erntet nicht mehr selbst, sondern legt bei JEDER eigenen Ernte
// ein zweites Stück obendrauf. Vorher belohnte das System das Wegbleiben: ein
// Stufe-5-Helfer räumte über Nacht das Feld ab und verkaufte es, und wer morgens
// einloggte, hatte nichts mehr zu tun.
//
// Gleiche Fähigkeiten STAPELN NICHT — es zählt jeweils die höchste Stufe unter den
// platzierten Tieren. Deshalb lohnen sich drei VERSCHIEDENE Tiere und nicht drei
// gleiche.

export const PET_SELL_PRICES = {
    COMMON: 50000,
    UNCOMMON: 500000,
    RARE: 5000000,
    EPIC: 50000000,
    LEGENDARY: 500000000,
    MYTHIC: 2000000000,
};

/** Wahrscheinlichkeit, dass ein Tier pro Intervall etwas findet. */
export const PET_PROC_CHANCE = 0.10;

export const PET_ABILITY_LABELS = {
    goldfinder: "Goldfinder",
    // Die Kennung bleibt "seedfinder", damit bestehende Tiere in gespeicherten
    // Spielständen weiter funktionieren — nur Name und Wirkung sind neu.
    seedfinder: "Gärtner",
    harvester: "Erntehelfer",
    // v2, Punkt 9: zwei neue Fähigkeiten, siehe Begründung bei PET_ABILITY_TYPES.
    // "Kaufmann" statt "Händler": der Skill „Händler" im Fähigkeitsbaum (skills.js)
    // gibt es schon und macht Ähnliches — zwei Systeme mit demselben Namen hätten
    // wie ein Anzeigefehler ausgesehen. Beide dürfen sich stapeln, wie Erntehelfer
    // und der Skill „Reiche Ernte" es auch schon tun.
    forscher: "Forscher",
    kaufmann: "Kaufmann",
};

export const PET_ABILITY_DESCRIPTIONS = {
    goldfinder: "Durchsucht das Grundstück, solange du im Spiel bist, und findet in unregelmäßigen Abständen Gold. Läuft von allein — du musst nichts dafür tun.",
    seedfinder: "Kümmert sich um deinen Acker: Einmalernten wachsen mit etwas Glück kostenlos nach, und alles auf dem Grundstück wächst schneller.",
    harvester: "Hilft beim Ernten: jede Pflanze, die DU abpflückst, hat eine Chance auf ein zweites Stück derselben Frucht. Zählt zusätzlich zur Fähigkeit „Reiche Ernte“.",
    forscher: "Jede Ernte bringt mehr Erfahrung — wirkt auf jede einzelne Pflanze, egal welche Seltenheit.",
    kaufmann: "Erhöht den Preis, den du beim Verkaufen deines Ernte-Lagers bekommst. Zählt zusätzlich zum Skill „Händler“.",
};

/** Ein Satz je Fähigkeit für die Übersicht — kürzer als die Beschreibung oben. */
export const PET_ABILITY_KURZ = {
    goldfinder: "Gold im Hintergrund, solange du da bist",
    seedfinder: "Nachwuchs ohne Samen + schnelleres Wachstum",
    harvester: "Chance auf ein zweites Stück bei jeder eigenen Ernte",
    forscher: "Mehr XP bei jeder Ernte",
    kaufmann: "Höherer Verkaufspreis beim Alles-Verkaufen",
};

/**
 * v2-Balancing (Punkt 9): "nur 3 Slots, Eier verlieren Sinn bei Max-Level". Die
 * Tierplätze sind gerade erst bewusst auf drei fixiert worden (siehe
 * Backend/garden/migrations/tierplaetze.js), aber bei nur drei Fähigkeiten für
 * drei Plätze gab es gar keine Wahl mehr — jeder Slot war zwangsläufig belegt,
 * und jedes weitere Ei (auch ein 1-%-Götterwesen) war für den Platz wertlos.
 * Forscher/Kaufmann machen "welche 3 von 5" zu einer echten Entscheidung. Die
 * Hatch-Auswürfelung in GameContainer.jsx greift direkt auf dieses Array zu
 * (PET_ABILITY_TYPES.length) — hier ergänzen reicht, dort ist nichts zu ändern.
 */
export const PET_ABILITY_TYPES = ["goldfinder", "seedfinder", "harvester", "forscher", "kaufmann"];

/**
 * Erntehelfer: Chance auf ein zweites Stück je eigener Ernte.
 * Spiegel von ERNTEHELFER_EXTRA in Backend/garden/core/pets.js — gerechnet wird
 * dort, in harvestCell.
 */
export const ERNTEHELFER_EXTRA = 0.05;   // je Stufe → L5 = 25 %

/**
 * Der Gärtner (Kennung "seedfinder").
 * Spiegel von GAERTNER_* in Backend/garden/core/pets.js — gerechnet wird dort.
 */
export const GAERTNER_NACHWUCHS = 0.12;   // je Stufe → L5 = 60 %
export const GAERTNER_WURZELWERK = 0.06;  // je Stufe → L5 = 30 %

/**
 * Forscher/Kaufmann (v2, Punkt 9). Spiegel von FORSCHER_XP_PRO_STUFE /
 * KAUFMANN_VERKAUF_PRO_STUFE in Backend/garden/core/pets.js — gerechnet wird
 * dort (forscherBoost/kaufmannBoost in economy.js), hier nur für die Anzeige.
 */
export const FORSCHER_XP_PRO_STUFE = 0.08;      // je Stufe → L5 = +40 % XP
export const KAUFMANN_VERKAUF_PRO_STUFE = 0.03; // je Stufe → L5 = +15 % Verkaufspreis

/** Höchste Stufe einer Fähigkeit unter den platzierten Tieren eines Grundstücks. */
export function besteStufe(petPlacements, typ, slotIndex = null) {
    let beste = 0;
    for (const p of Array.isArray(petPlacements) ? petPlacements : []) {
        if (p?.ability?.type !== typ) continue;
        if (slotIndex !== null && p.slotIndex !== slotIndex) continue;
        beste = Math.max(beste, clampLevel(p.ability.level));
    }
    return beste;
}

export function getGaertnerStufe(petPlacements, slotIndex = null) {
    return besteStufe(petPlacements, "seedfinder", slotIndex);
}

export function getErntehelferStufe(petPlacements, slotIndex = null) {
    return besteStufe(petPlacements, "harvester", slotIndex);
}

export function getForscherStufe(petPlacements, slotIndex = null) {
    return besteStufe(petPlacements, "forscher", slotIndex);
}

export function getKaufmannStufe(petPlacements, slotIndex = null) {
    return besteStufe(petPlacements, "kaufmann", slotIndex);
}

/** Extraernte-Chance des Erntehelfers — nur für die Anzeige. */
export function getErntehelferExtra(stufe, zuechterWirkung = 0) {
    return Math.max(0, Math.min(5, Math.floor(Number(stufe) || 0)))
        * ERNTEHELFER_EXTRA * tierVerstaerkung(zuechterWirkung);
}

/** Takt des Goldfinders in ms, abhängig vom höchsten Level unter den platzierten Tieren. */
const TICK_MS_BY_LEVEL = { 1: 60000, 2: 50000, 3: 40000, 4: 30000, 5: 20000 };

/** Spiegel von GOLDFINDER_RANGES in Backend/garden/core/pets.js. */
const GOLDFINDER_RANGES = {
    1: [1000, 50000],        //  0,15 Mio/h
    2: [51000, 200000],      //  0,90 Mio/h
    3: [201000, 600000],     //  3,60 Mio/h
    4: [400000, 1200000],    //  9,60 Mio/h
    5: [1200000, 4000000],   // 46,80 Mio/h
};

export function clampLevel(level) {
    const n = Math.floor(Number(level) || 1);
    return Math.max(1, Math.min(5, n));
}

/** Das schnellste Tier bestimmt den Takt für alle — so war es schon immer implementiert. */
export function getPetTickMs(maxLevel) {
    return TICK_MS_BY_LEVEL[clampLevel(maxLevel)] || TICK_MS_BY_LEVEL[1];
}

export function getGoldfinderRange(level) {
    return GOLDFINDER_RANGES[clampLevel(level)] || GOLDFINDER_RANGES[1];
}

/**
 * Aufschlag des Skills „Züchter" auf ALLE Tierfähigkeiten — 1 = ungelernt.
 * Spiegel von tierVerstaerkung() in Backend/garden/core/economy.js.
 *
 * Steht als Parameter in jeder Anzeigefunktion unten, damit keine Karte den Wert
 * OHNE Skill zeigt, während die Kasse mit ihm rechnet.
 */
export function tierVerstaerkung(zuechterWirkung = 0) {
    return 1 + Math.max(0, Number(zuechterWirkung) || 0);
}

/**
 * Chance auf kostenlosen Nachwuchs einer Einmalernte — nur für die Anzeige.
 * Der Deckel bei 80 % steht auch im Backend: bei 100 % wäre die Einmalernte
 * dasselbe wie ein Dauerträger.
 */
export function getGaertnerNachwuchs(level, zuechterWirkung = 0) {
    return Math.min(0.8, clampLevel(level) * GAERTNER_NACHWUCHS * tierVerstaerkung(zuechterWirkung));
}

/** Wachstumsbeschleunigung des Gärtners — nur für die Anzeige. */
export function getGaertnerWurzelwerk(level, zuechterWirkung = 0) {
    return clampLevel(level) * GAERTNER_WURZELWERK * tierVerstaerkung(zuechterWirkung);
}

/** XP-Aufschlag des Forschers — nur für die Anzeige. */
export function getForscherBoost(level, zuechterWirkung = 0) {
    return clampLevel(level) * FORSCHER_XP_PRO_STUFE * tierVerstaerkung(zuechterWirkung);
}

/** Verkaufspreis-Aufschlag des Kaufmann-Tiers — nur für die Anzeige. */
export function getKaufmannBoost(level, zuechterWirkung = 0) {
    return clampLevel(level) * KAUFMANN_VERKAUF_PRO_STUFE * tierVerstaerkung(zuechterWirkung);
}

export function getPetSellPrice(rarity) {
    return PET_SELL_PRICES[rarity] ?? PET_SELL_PRICES.COMMON;
}

/**
 * Wie groß ein Tier auf dem Grundstück gezeichnet wird — Faktor auf PET_BASIS_GROESSE
 * im Renderer.
 *
 * Maßstab ist die Spielfigur: die wird mit 80 px gezeichnet. Ein Esel steht bei 1,28,
 * also rund 90 px, und ist damit sichtbar größer als der Spieler; Huhn und Ente liegen
 * bei knapp 40 px. Die Werte folgen grob der echten Schulterhöhe, aber gestaucht — bei
 * naturgetreuem Verhältnis wäre ein Huhn neben einem Drachen nur noch ein Fleck.
 */
const PET_SIZE_BY_TYPE = {
    // Federvieh — deutlich kleiner als der Spieler
    Huhn: 0.52,
    Ente: 0.56,
    // Kleintiere — etwa halbe bis dreiviertel Spielerhöhe
    Katze: 0.70,
    "Waschbär": 0.74,
    Hund: 0.85,
    // Weidevieh — auf Augenhöhe
    Schaf: 0.95,
    Ziege: 0.95,
    Schwein: 1.02,
    // Ab hier größer als der Spieler
    Esel: 1.28,
    Tiger: 1.35,
    "Phönix": 1.42,
    Kuh: 1.50,
    Pferd: 1.57,
    Einhorn: 1.57,
    // Fabelwesen — dürfen sich deutlich abheben
    "Götterwesen": 1.70,
    Drache: 1.92,
};

/** Unbekannte Arten bleiben auf der bisherigen Größe. */
export function getPetSize(type) {
    return PET_SIZE_BY_TYPE[type] ?? 1;
}
