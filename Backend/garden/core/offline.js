// garden/core/offline.js
// Tier-Effekte für die Zeit, in der niemand zugesehen hat.
//
// WARUM ES DAS BRAUCHT
// Der Tick der Tiere lief ausschliesslich im Browser (setTimeout-Kette im
// GameContainer). Tab zu hiess: kein Gold, keine Ernte. Das belohnte nicht das
// Spielen, sondern das Offenlassen eines Tabs — und ein Erntehelfer, der über
// Nacht nichts tut, ist kein Grund, ihn zu kaufen.
//
// GERECHNET WIRD BEIM BETRETEN
// `GET /farm-state` ruft `verrechneOffline` genau einmal auf. Die Abrechnung merkt
// sich ihren eigenen Zeitpunkt in `petsAbgerechnetBis` — nicht `updatedAt`, denn
// das ändert sich bei jedem Speichern des Browsers. Ohne eigenes Feld zahlte ein
// zweiter Tab dieselbe Zeit ein zweites Mal aus.
//
// WAS ES NICHT TUT
// Samenfinder bleiben online-only: welcher Samen gefunden wird, hängt an der
// Ladenrotation, und die wechselt alle fünf Minuten — rückwirkend liesse sich das
// nur raten. Der Ausweichfall (Gold statt Samen) wird ebenfalls nicht gezahlt,
// sonst wäre Offline besser als Online.
const {
    getGoldfinderRange, getPetTickMs, clampLevel, getHarvesterYield,
} = require("./pets");
const { petErnteVerkauf, GOLD_MAX } = require("./economy");
const { wirkung } = require("./skills");

// ─── Stellschrauben ──────────────────────────────────────────────────────────
// HIER wird das Balancing der Offline-Zeit eingestellt, nirgends sonst.
//
//   OFFLINE_MAX_MS  Wie viel Abwesenheit höchstens angerechnet wird. Wer drei Tage
//                   wegbleibt, bekommt so viel wie nach acht Stunden. Ohne Deckel
//                   wäre ein einziges Stufe-5-Tier über einen Urlaub mehr wert als
//                   alles, was man durch Spielen erreichen kann.
//   OFFLINE_SATZ    Anteil des Online-Ertrags. 1 = gleich viel wie beim Zusehen.
//   OFFLINE_MIN_MS  Darunter wird gar nicht gerechnet (Neuladen, zweiter Tab).
const OFFLINE_MAX_MS = 8 * 60 * 60 * 1000;
const OFFLINE_SATZ = 1;
const OFFLINE_MIN_MS = 60 * 1000;

// Muss zu PET_PROC_CHANCE in Frontend/src/pages/GardenGame/engine/PetSystem.js
// passen — sonst zahlt Offline anders aus als Online.
const PROC_CHANCE = 0.10;

/** Grundchance plus „Züchter" aus dem Fähigkeitsbaum, gedeckelt bei 50 %. */
function procChance(state) {
    return Math.min(0.5, PROC_CHANCE * (1 + wirkung(state, "zuechter")));
}

// Obergrenze für die Schleife. 8 h bei 20-s-Takt sind 1440 Ticks je Tier; die
// Grenze fängt nur kaputte Zeitstempel ab (Systemuhr in der Zukunft o. ä.).
const MAX_TICKS = 5000;

function zufallZwischen(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Erntereife Zellen, älteste zuerst — dieselbe Reihenfolge wie im Browser. */
function reifeZellen(state, anzahl, istReif, now) {
    const plants = state.plotPlants || {};
    const keys = [];
    for (const [key, plant] of Object.entries(plants)) {
        if (keys.length >= anzahl) break;
        if (plant && istReif(plant, now)) keys.push(key);
    }
    return keys;
}

/**
 * Rechnet die Abwesenheit ab. Mutiert `state`.
 *
 * Gibt `null` zurück, wenn nichts zu rechnen war, sonst eine Zusammenfassung für
 * die Meldung im Spiel.
 */
function verrechneOffline(state, { isSubscriber = false, istReif, now = Date.now() } = {}) {
    const basis = Number(state.petsAbgerechnetBis) || Number(state.updatedAt) || 0;
    // Erstkontakt (Feld fehlt UND kein updatedAt): nur den Zeitpunkt setzen. Sonst
    // bekäme eine frische Farm die volle Deckelzeit geschenkt.
    if (!basis) {
        state.petsAbgerechnetBis = now;
        return null;
    }

    const roh = now - basis;
    state.petsAbgerechnetBis = now;
    if (roh < OFFLINE_MIN_MS) return null;
    const spanne = Math.min(roh, OFFLINE_MAX_MS);

    const tiere = (Array.isArray(state.petPlacements) ? state.petPlacements : [])
        .filter((p) => p?.ability?.type === "goldfinder" || p?.ability?.type === "harvester");
    if (tiere.length === 0) return null;

    let gold = 0;
    let geerntet = 0;
    let goldAusErnte = 0;
    const chance = procChance(state);

    for (const pet of tiere) {
        const level = clampLevel(pet.ability.level);
        const ticks = Math.min(MAX_TICKS, Math.floor(spanne / getPetTickMs(level)));
        if (ticks <= 0) continue;

        if (pet.ability.type === "goldfinder") {
            const [min, max] = getGoldfinderRange(level);
            for (let i = 0; i < ticks; i++) {
                if (Math.random() >= chance) continue;
                gold += zufallZwischen(min, max);
            }
            continue;
        }

        // Erntehelfer: pflücken und verkaufen, genau wie online (petErnteVerkauf).
        // Der Acker ist endlich — sind alle Felder abgeerntet, laufen die restlichen
        // Ticks ins Leere, und das ist richtig so: nachwachsen kann nur, was Zeit
        // hatte, und die ist mit `spanne` bereits verbraucht.
        const budget = getHarvesterYield(level);
        for (let i = 0; i < ticks; i++) {
            if (Math.random() >= chance) continue;
            const keys = reifeZellen(state, budget, istReif, now);
            if (keys.length === 0) break;
            const ergebnis = petErnteVerkauf(state, keys, isSubscriber, now);
            if (!ergebnis.ok) break;
            geerntet += ergebnis.anzahl;
            goldAusErnte += ergebnis.verdient;
        }
    }

    // petErnteVerkauf hat sein Gold schon gutgeschrieben; nur der Goldfinder-Anteil
    // kommt hier dazu. Der Satz wirkt auf beides.
    const goldfinderAnteil = Math.floor(gold * OFFLINE_SATZ);
    if (OFFLINE_SATZ !== 1 && goldAusErnte > 0) {
        const abzug = goldAusErnte - Math.floor(goldAusErnte * OFFLINE_SATZ);
        state.gold = Math.max(0, (Number(state.gold) || 0) - abzug);
        goldAusErnte -= abzug;
    }
    if (goldfinderAnteil > 0) {
        state.gold = Math.min(GOLD_MAX, Math.max(0, Number(state.gold) || 0) + goldfinderAnteil);
    }

    const gesamt = goldfinderAnteil + goldAusErnte;
    if (gesamt === 0 && geerntet === 0) return null;

    return {
        minuten: Math.round(spanne / 60000),
        gedeckelt: roh > OFFLINE_MAX_MS,
        gold: gesamt,
        geerntet,
        tiere: tiere.length,
    };
}

module.exports = { verrechneOffline, OFFLINE_MAX_MS, OFFLINE_SATZ };
