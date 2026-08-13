// engine/PetSystem.js
// Tier-Fähigkeiten an EINER Stelle.
//
// Die Zahlen standen vorher nur inline im Pet-Tick von GameContainer — der Spieler konnte
// nirgends sehen, was ein Tier eigentlich leistet, und jede Anzeige hätte sie doppelt
// gepflegt. Tick-Logik und Tier-Modal lesen jetzt beide von hier.

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
};

export const PET_ABILITY_DESCRIPTIONS = {
    goldfinder: "Durchsucht das Grundstück und findet in unregelmäßigen Abständen Gold.",
    seedfinder: "Kümmert sich um deinen Acker: Einmalernten wachsen mit etwas Glück kostenlos nach, und alles auf dem Grundstück wächst schneller. Wirkt auch, während du weg bist.",
    harvester: "Erntet reife Pflanzen selbstständig ab und verkauft sie sofort — Sub-Bonus eingeschlossen. Der Rucksack bleibt frei.",
};

export const PET_ABILITY_TYPES = ["goldfinder", "seedfinder", "harvester"];

/**
 * Wie viele reife Früchte ein Erntehelfer pro Auslösung abnimmt.
 * Spiegel von HARVESTER_YIELD in Backend/garden/core/pets.js.
 */
const HARVESTER_YIELD = { 1: 2, 2: 4, 3: 8, 4: 16, 5: 32 };

/**
 * Der Gärtner (Kennung "seedfinder").
 * Spiegel von GAERTNER_* in Backend/garden/core/pets.js — gerechnet wird dort.
 */
export const GAERTNER_NACHWUCHS = 0.12;   // je Stufe → L5 = 60 %
export const GAERTNER_WURZELWERK = 0.06;  // je Stufe → L5 = 30 %

/** Höchste Gärtner-Stufe unter den platzierten Tieren eines Grundstücks. */
export function getGaertnerStufe(petPlacements, slotIndex = null) {
    let beste = 0;
    for (const p of Array.isArray(petPlacements) ? petPlacements : []) {
        if (p?.ability?.type !== "seedfinder") continue;
        if (slotIndex !== null && p.slotIndex !== slotIndex) continue;
        beste = Math.max(beste, clampLevel(p.ability.level));
    }
    return beste;
}

export function getHarvesterYield(level) {
    return HARVESTER_YIELD[clampLevel(level)] || 1;
}

/** Intervall in ms, abhängig vom höchsten Fähigkeits-Level unter den platzierten Tieren. */
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

/** Chance auf kostenlosen Nachwuchs einer Einmalernte — nur für die Anzeige. */
export function getGaertnerNachwuchs(level) {
    return clampLevel(level) * GAERTNER_NACHWUCHS;
}

/** Wachstumsbeschleunigung des Gärtners — nur für die Anzeige. */
export function getGaertnerWurzelwerk(level) {
    return clampLevel(level) * GAERTNER_WURZELWERK;
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
