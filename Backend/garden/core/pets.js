// garden/core/pets.js
// Serverseitige Tier-Zahlen.
//
// ACHTUNG: Diese Tabellen spiegeln
//   Frontend/src/pages/GardenGame/engine/PetSystem.js
// Wer dort etwas am Balancing ändert, muss es HIER ebenfalls ändern — sonst zahlt
// der Server etwas anderes aus, als die Oberfläche ankündigt. (Gleiches Muster wie
// bei core/catalogue.js.)

const PET_SELL_PRICES = {
    COMMON: 50000,
    UNCOMMON: 500000,
    RARE: 5000000,
    EPIC: 50000000,
    LEGENDARY: 500000000,
    MYTHIC: 2000000000,
};

const TICK_MS_BY_LEVEL = { 1: 60000, 2: 50000, 3: 40000, 4: 30000, 5: 20000 };

/**
 * Wie viele Zellen ein Erntehelfer je Auslösung abräumt.
 *
 * BALANCING: L5 lag bei 8 Zellen. Bei 18 Auslösungen pro Stunde sind das 144
 * Ernten — auf einem Feld, das 2.250 Früchte je Stunde ansetzt, gerade 6 %.
 * Das Tier hat also nie Klicks ersetzt, sondern nur dekoriert. Der echte Deckel
 * bleibt, was auf dem Acker reif ist; mehr Kapazität hilft deshalb genau dort,
 * wo die Produktion die Abnahme übersteigt, und nicht im Lategame.
 */
const HARVESTER_YIELD = { 1: 2, 2: 4, 3: 8, 4: 16, 5: 32 };

/**
 * BALANCING: L5 zahlte im Mittel 6.000.500 je Fund, also rund 108 Mio Gold pro
 * Stunde — mehr als ein komplettes 225-Zellen-Feld der passenden Stufe einbringt.
 * Ein einzelnes Tier hat damit das Farmen selbst überflüssig gemacht. Die neuen
 * Werte lassen den Goldfinder der flache Früh-Motor bleiben (er hängt an keinem
 * Acker und wirkt sofort), ohne die eigentliche Farm zu überholen.
 */
const GOLDFINDER_RANGES = {
    1: [1000, 50000],        //  0,15 Mio/h
    2: [51000, 200000],      //  0,90 Mio/h
    3: [201000, 600000],     //  3,60 Mio/h
    4: [400000, 1200000],    //  9,60 Mio/h  (war 15,6)
    5: [1200000, 4000000],   // 46,80 Mio/h  (war 108)
};

/**
 * Der Gärtner — früher „Samenfinder".
 *
 * WARUM UMGEBAUT: Der Samenfinder legte pro Auslösung einen zufälligen Shop-Samen
 * in den Rucksack. Der ist kein Engpass, sondern eine Last: 18 Samen je Stunde
 * füllen einen 50-Plätze-Rucksack in unter drei Stunden, und danach scheitert
 * JEDE Ernte an „Rucksack voll". Dazu kam, dass die Fähigkeit offline gar nicht
 * zahlte (siehe core/offline.js) und für einen eingerichteten Acker 21 von 23
 * möglichen Funden eine Verschlechterung waren.
 *
 * Der Gärtner wirkt stattdessen auf das, was schon auf dem Acker steht:
 *   Nachwuchs   Chance, dass eine geerntete EINMALERNTE kostenlos nachwächst.
 *               Genau das ist der einzige Nachteil der Einmalernte gegenüber dem
 *               Dauerträger — Samen und Pflanzklick nach jedem Zyklus.
 *   Wurzelwerk  Alles auf dem Grundstück wächst schneller.
 *
 * Beides sitzt serverseitig in harvestCell bzw. im Wachstum, wirkt deshalb online
 * wie offline und kann keinen Rucksack verstopfen.
 */
const GAERTNER_NACHWUCHS = 0.12;   // je Stufe → L5 = 60 % kostenloser Nachwuchs
const GAERTNER_WURZELWERK = 0.06;  // je Stufe → L5 = 30 % schnelleres Wachstum

function clampLevel(level) {
    const n = Math.floor(Number(level) || 1);
    return Math.max(1, Math.min(5, n));
}

function getPetSellPrice(rarity) {
    return PET_SELL_PRICES[String(rarity || "").toUpperCase()] ?? PET_SELL_PRICES.COMMON;
}

function getGoldfinderRange(level) {
    return GOLDFINDER_RANGES[clampLevel(level)] || GOLDFINDER_RANGES[1];
}

function getPetTickMs(level) {
    return TICK_MS_BY_LEVEL[clampLevel(level)] || TICK_MS_BY_LEVEL[1];
}

function getHarvesterYield(level) {
    return HARVESTER_YIELD[clampLevel(level)] || 1;
}

/** Fallback-Gold, wenn der Shop gerade keinen Samen der Ziel-Seltenheit führt. */
function getSeedfinderFallbackGold(level) {
    return clampLevel(level) * 100000;
}

/**
 * Höchste Gärtner-Stufe unter den PLATZIERTEN Tieren. Wie bei allen anderen
 * Fähigkeiten zählt nur, was auf dem Grundstück steht — im Rucksack arbeitet
 * kein Tier.
 */
function getGaertnerStufe(state) {
    let beste = 0;
    for (const p of Array.isArray(state?.petPlacements) ? state.petPlacements : []) {
        if (p?.ability?.type === "seedfinder") beste = Math.max(beste, clampLevel(p.ability.level));
    }
    return beste;
}

const petId = (p) => String(p?.id || p?.instanceId || "");

/** Sucht ein Tier in beiden Listen des Spielstands. */
function findePet(state, id) {
    const gesucht = String(id || "");
    if (!gesucht) return null;
    for (const feld of ["petPlacements", "petInventory"]) {
        const liste = Array.isArray(state?.[feld]) ? state[feld] : [];
        const idx = liste.findIndex((p) => petId(p) === gesucht);
        if (idx !== -1) return { feld, idx, pet: liste[idx] };
    }
    return null;
}

module.exports = {
    PET_SELL_PRICES, getPetSellPrice, getGoldfinderRange, getPetTickMs,
    getHarvesterYield, getSeedfinderFallbackGold, clampLevel, findePet, petId,
    GAERTNER_NACHWUCHS, GAERTNER_WURZELWERK, getGaertnerStufe,
};
