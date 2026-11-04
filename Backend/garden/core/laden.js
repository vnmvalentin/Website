// garden/core/laden.js
// Welche Sorten eine Rotation des Samenladens zeigt — ohne HTTP, ohne Bestände.
//
// WARUM EIGENE DATEI: Die Auswahl war ein Teil von gardenGameRoutes.js und liess
// sich dort nur über einen laufenden Server prüfen. Hier ist sie eine Funktion mit
// Zustand von aussen und austauschbarem Zufall — und damit nachrechenbar.
//
// BALANCING 02.11. (Feedback "der Shop bringt nur Müll"). Gemessen am Katalog
// standen je Rotation im Schnitt 6,9 Common- und 4,6 Uncommon-Sorten im Laden,
// aber nur 1,3 Epic und 0,2 Legendary. Ab dem ersten Spieltag sind elf von rund
// fünfzehn Zeilen Samen, deren Gewinn ein paar hundert Gold beträgt. Drei Regeln
// verschieben das, ohne die Chancen einzelner Sorten anzufassen:
//
//   COMMON_MAX          höchstens vier Commons gleichzeitig — genug für den Start
//   MINDESTENS          jede Rotation mindestens 2 Rare und 1 Epic
//   LEGENDARY_SPAETESTENS  spätestens jede dritte Rotation eine Legendary
//
// Nachgezogen wird immer GEWICHTET nach shopChance: die Garantie holt also meist
// Banane oder Acai, selten Kokosnuss — das Verhältnis innerhalb einer Stufe bleibt.
//
// Der Nachziehzähler je Sorte (pityGrenze) bleibt unverändert; er sorgt weiter
// dafür, dass keine einzelne Sorte länger als das Doppelte ihrer erwarteten
// Wartezeit ausbleibt.

const { istSaisonSorte, SAISON_LADEN, SAISON_LADEN_MAX } = require("./tageszeit");

const PITY_FAKTOR = 2;
const PITY_MAX_ROTATIONEN = 576;   // 48 h bei fünf Minuten je Rotation

const COMMON_MAX = 4;
const MINDESTENS = { RARE: 2, EPIC: 1 };
const LEGENDARY_SPAETESTENS = 3;   // Rotationen

/** Nach wie vielen erfolglosen Rotationen eine Sorte erzwungen wird. */
function pityGrenze(seed) {
    const chance = Math.max(0.0001, Number(seed.shopChance) || 0);
    return Math.min(PITY_MAX_ROTATIONEN, Math.ceil(PITY_FAKTOR / chance));
}

/** Eine Sorte aus `kandidaten`, gewichtet nach shopChance. */
function gewichtetZiehen(kandidaten, rng) {
    const summe = kandidaten.reduce((s, k) => s + Math.max(0.0001, Number(k.shopChance) || 0), 0);
    let r = rng() * summe;
    for (const k of kandidaten) {
        r -= Math.max(0.0001, Number(k.shopChance) || 0);
        if (r <= 0) return k;
    }
    return kandidaten[kandidaten.length - 1];
}

function frischerZustand() {
    return { pity: new Map(), ohneLegendary: 0 };
}

/**
 * Die aktiven Sorten einer Rotation.
 *
 * @param {Array<{seedId, rarity, shopChance}>} pool  das ganze Sortiment
 * @param {{pity: Map, ohneLegendary: number}} zustand  wird fortgeschrieben
 * @param {() => number} rng  Zufall 0..1 (Math.random im Betrieb)
 * @returns {Set<string>} seedIds
 */
function waehleSortiment(pool, zustand, rng = Math.random, now = Date.now()) {
    const aktiv = new Set();
    const erzwungen = new Set();

    // 1. Jede Sorte würfelt für sich; wer zu lange fehlte, kommt per Nachzug.
    //    Saisonsorten (core/tageszeit.js) würfeln mit doppelter Chance. Der
    //    Nachziehzähler bleibt an der Grundchance — er ist die Untergrenze.
    for (const seed of pool) {
        const chance = istSaisonSorte(seed.seedId, now)
            ? Math.min(SAISON_LADEN_MAX, seed.shopChance * SAISON_LADEN)
            : seed.shopChance;
        if (rng() < chance) { aktiv.add(seed.seedId); continue; }
        const n = (zustand.pity.get(seed.seedId) || 0) + 1;
        if (n >= pityGrenze(seed)) { aktiv.add(seed.seedId); erzwungen.add(seed.seedId); }
    }

    // 2. Commons deckeln. Erzwungene bleiben bevorzugt drin, der Rest per Zufall.
    const commons = pool.filter((s) => s.rarity === "COMMON" && aktiv.has(s.seedId));
    if (commons.length > COMMON_MAX) {
        const reihenfolge = commons
            .map((s) => ({ s, r: (erzwungen.has(s.seedId) ? -1 : 0) + rng() }))
            .sort((a, b) => a.r - b.r);
        for (const { s } of reihenfolge.slice(COMMON_MAX)) aktiv.delete(s.seedId);
    }

    // 3. Mindestplätze je Stufe auffüllen.
    const fuelleAuf = (stufe, ziel) => {
        let da = pool.filter((s) => s.rarity === stufe && aktiv.has(s.seedId)).length;
        while (da < ziel) {
            const frei = pool.filter((s) => s.rarity === stufe && !aktiv.has(s.seedId));
            if (frei.length === 0) break;
            aktiv.add(gewichtetZiehen(frei, rng).seedId);
            da++;
        }
    };
    for (const [stufe, ziel] of Object.entries(MINDESTENS)) fuelleAuf(stufe, ziel);

    const hatLegendary = () => pool.some((s) => s.rarity === "LEGENDARY" && aktiv.has(s.seedId));
    if (!hatLegendary() && zustand.ohneLegendary + 1 >= LEGENDARY_SPAETESTENS) fuelleAuf("LEGENDARY", 1);
    zustand.ohneLegendary = hatLegendary() ? 0 : zustand.ohneLegendary + 1;

    if (aktiv.size === 0 && pool.length > 0) aktiv.add(pool[0].seedId);

    // 4. Zähler fortschreiben: wer da ist, fängt neu an; wer per Deckel wieder
    //    herausfiel, behält seinen Stand und ist nächstes Mal bevorzugt dran.
    for (const seed of pool) {
        zustand.pity.set(seed.seedId, aktiv.has(seed.seedId) ? 0 : (zustand.pity.get(seed.seedId) || 0) + 1);
    }
    return aktiv;
}

module.exports = {
    waehleSortiment, frischerZustand, pityGrenze,
    COMMON_MAX, MINDESTENS, LEGENDARY_SPAETESTENS, PITY_FAKTOR, PITY_MAX_ROTATIONEN,
};
