// garden/core/pets.js
// Serverseitige Tier-Zahlen.
//
// ── UMBAU AUGUST 2026: Tiere sind BONI, keine zweite Farm ────────────────────
// Vorher liefen zwei Fähigkeiten als eigenständige Produktion — der Erntehelfer
// erntete und verkaufte selbstständig, und beide zahlten über core/offline.js auch
// dann, wenn niemand zusah. Das hatte zwei Folgen, die beide gegen das Spiel
// arbeiteten:
//
//   * Belohnt wurde Abwesenheit. Ein Stufe-5-Erntehelfer räumte über Nacht das
//     ganze Feld ab und verkaufte es; wer morgens einloggte, fand einen leeren
//     Acker und einen Goldstand vor, an dem er selbst nichts getan hatte.
//   * Der eigene Klick wurde entwertet. Alles, was das Tier tat, hätte der Spieler
//     auch selbst tun können — nur schlechter.
//
// Jetzt gilt: der Goldfinder bleibt der passive Nebenverdienst, solange man DA ist,
// und die anderen beiden verstärken das, was der Spieler selbst tut. Offline
// passiert nichts mehr (core/offline.js ist ersatzlos gestrichen).
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

// Nur noch der Goldfinder tickt. Gärtner und Erntehelfer wirken dauerhaft bzw. beim
// Ernten und brauchen keinen Takt mehr.
const TICK_MS_BY_LEVEL = { 1: 60000, 2: 50000, 3: 40000, 4: 30000, 5: 20000 };

/**
 * Der Erntehelfer — Extraernte auf DEINEN Klick.
 *
 * WARUM UMGEBAUT: Er hat vorher selbst geerntet und sofort verkauft, online wie
 * offline. Damit war er keine Verstärkung des Spielers, sondern sein Ersatz: ein
 * Stufe-5-Helfer nahm 32 Zellen alle 20 Sekunden ab, und wer währenddessen selbst
 * über den Acker zog, fand nur noch abgeräumte Felder.
 *
 * Jetzt wirkt er dort, wo der Spieler ohnehin klickt: jede eigene Ernte hat die
 * Chance auf ein zweites Stück derselben Frucht. Gerechnet wird das in
 * core/economy.js → harvestCell, neben der Fähigkeit „Reiche Ernte" (die bei
 * 15 % endet — der Helfer liegt bewusst darüber, weil ein Tier teurer ist als
 * ein Skillpunkt).
 */
const ERNTEHELFER_EXTRA = 0.05;   // je Stufe → L5 = 25 % Chance auf ein zweites Stück

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
 * JEDE Ernte an „Rucksack voll". Für einen eingerichteten Acker waren 21 von 23
 * möglichen Funden ohnehin eine Verschlechterung.
 *
 * Der Gärtner wirkt stattdessen auf das, was schon auf dem Acker steht:
 *   Nachwuchs   Chance, dass eine geerntete EINMALERNTE kostenlos nachwächst.
 *               Genau das ist der einzige Nachteil der Einmalernte gegenüber dem
 *               Dauerträger — Samen und Pflanzklick nach jedem Zyklus.
 *   Wurzelwerk  Alles auf dem Grundstück wächst schneller.
 *
 * Beides sitzt serverseitig in harvestCell bzw. im Wachstum: es wirkt damit auch
 * beim Erntehelfer mit und kann keinen Rucksack verstopfen.
 */
const GAERTNER_NACHWUCHS = 0.12;   // je Stufe → L5 = 60 % kostenloser Nachwuchs
const GAERTNER_WURZELWERK = 0.06;  // je Stufe → L5 = 30 % schnelleres Wachstum

/**
 * v2-Balancing (Punkt 9): "nur 3 Slots, Eier verlieren Sinn bei Max-Level". Die
 * Tierplätze wurden gerade erst bewusst auf drei fixiert (siehe
 * migrations/tierplaetze.js — "Drei Fähigkeiten, drei Plätze"), aber DAMIT war
 * jeder Slot automatisch belegt: sobald man von jeder der drei Fähigkeiten eine
 * Stufe 5 hatte, war jedes weitere Ei — auch ein 1-%-Götterwesen — für den Platz
 * wertlos. Die Wahl "welche 3 von wie vielen" gab es gar nicht, weil es nur drei
 * Fähigkeiten gab.
 *
 * Zwei neue Fähigkeiten lösen genau das: 3 Plätze bei 5 Fähigkeiten sind endlich
 * eine echte Entscheidung, und die Eier-Gacha bleibt relevant, auch wenn man
 * längst alle Sorten gesehen hat. Beide hängen an genau EINER Stelle in
 * economy.js (gibXp bzw. sellAll) und ziehen tierVerstaerkung() genauso mit wie
 * die drei bestehenden — Züchter wertet dadurch automatisch auf, ohne dass der
 * Skill selbst angefasst werden musste.
 *
 * NAMENSWAHL "Kaufmann" statt "Händler": im Fähigkeitsbaum gibt es bereits einen
 * Skill namens "Händler" (ebenfalls Verkaufserlös, siehe skills.js). Beide dürfen
 * sich stapeln — dasselbe Muster wie Erntehelfer-Tier + „Reiche Ernte"-Skill —,
 * aber zwei verschiedene Systeme mit demselben Namen hätte am Spielstand wie ein
 * Anzeigefehler ausgesehen.
 */
const FORSCHER_XP_PRO_STUFE = 0.08;    // je Stufe → L5 = +40 % XP je Ernte
const KAUFMANN_VERKAUF_PRO_STUFE = 0.03; // je Stufe → L5 = +15 % Verkaufspreis (SUB_BONUS bleibt mit +50% klar davor)

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

/** Chance auf ein zweites Erntestück, nach Erntehelfer-Stufe (0 = kein Helfer). */
function getErntehelferExtra(stufe) {
    const n = Math.max(0, Math.min(5, Math.floor(Number(stufe) || 0)));
    return n * ERNTEHELFER_EXTRA;
}

/**
 * Höchste Stufe einer Fähigkeit unter den PLATZIERTEN Tieren.
 *
 * Nur was auf dem Grundstück steht, zählt — im Rucksack arbeitet kein Tier. Und
 * gleiche Fähigkeiten STAPELN NICHT: drei Gärtner sind so gut wie einer. Das ist
 * Absicht und der Grund, warum die drei Tierplätze überhaupt eine Entscheidung
 * sind — wer alle drei Fähigkeiten will, braucht drei verschiedene Tiere.
 */
function besteStufe(state, typ) {
    let beste = 0;
    for (const p of Array.isArray(state?.petPlacements) ? state.petPlacements : []) {
        if (p?.ability?.type === typ) beste = Math.max(beste, clampLevel(p.ability.level));
    }
    return beste;
}

function getGaertnerStufe(state) {
    return besteStufe(state, "seedfinder");
}

function getErntehelferStufe(state) {
    return besteStufe(state, "harvester");
}

function getForscherStufe(state) {
    return besteStufe(state, "forscher");
}

function getKaufmannStufe(state) {
    return besteStufe(state, "kaufmann");
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
    clampLevel, findePet, petId,
    GAERTNER_NACHWUCHS, GAERTNER_WURZELWERK, getGaertnerStufe,
    ERNTEHELFER_EXTRA, getErntehelferStufe, getErntehelferExtra, besteStufe,
    FORSCHER_XP_PRO_STUFE, KAUFMANN_VERKAUF_PRO_STUFE, getForscherStufe, getKaufmannStufe,
};
