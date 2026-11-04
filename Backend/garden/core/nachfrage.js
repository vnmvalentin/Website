// garden/core/nachfrage.js
// Markt mit wechselnder Nachfrage (Fahrplan Phase 5, Nutzerentscheidung 04.11.2026:
// „gefragte Sorten"): jede volle Stunde sind 3–4 Sorten gefragt und bringen beim
// Verkauf am Markt +20 bis +50 %. Alles andere bleibt beim normalen Preis — es gibt
// nie weniger als bisher. Belohnt Planen, ohne zu bestrafen.
//
// Die Auswahl hängt NUR von der Stunde ab (Zufall mit der Stundennummer als Startwert):
// alle Spieler sehen dieselbe Liste, es gibt nichts zu speichern, und ein Neustart
// des Servers ändert nichts. Ausgenommen sind Mythic-Sorten (die Mondblume verzerrt
// die Wirtschaft laut Simulator ohnehin schon am stärksten).

const { SEED_CATALOGUE } = require("./catalogue");

const STUNDE_MS = 60 * 60 * 1000;
const KANDIDATEN = SEED_CATALOGUE.filter((s) => s.rarity !== "MYTHIC").map((s) => s.id).sort();

/** Kleiner, fester Zufallsgenerator (mulberry32) — gleiche Stunde, gleiche Folge. */
function zufallAus(startwert) {
    let a = startwert >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Gefragte Sorten der laufenden Stunde: { sorten: [{seedId, bonus}], seit, bis }. */
function stand(now = Date.now()) {
    const stunde = Math.floor(now / STUNDE_MS);
    const zufall = zufallAus(stunde * 2654435761);
    const anzahl = 3 + (zufall() < 0.5 ? 1 : 0);
    const pool = KANDIDATEN.slice();
    const sorten = [];
    for (let i = 0; i < anzahl && pool.length; i++) {
        const [seedId] = pool.splice(Math.floor(zufall() * pool.length), 1);
        // +20 bis +50 % in 5er-Schritten
        const bonus = (20 + Math.floor(zufall() * 7) * 5) / 100;
        sorten.push({ seedId, bonus });
    }
    return { sorten, seit: stunde * STUNDE_MS, bis: (stunde + 1) * STUNDE_MS };
}

/** Faktor auf den Verkaufspreis einer Sorte (1 = nicht gefragt). */
function faktor(seedId, now = Date.now()) {
    const treffer = stand(now).sorten.find((s) => s.seedId === seedId);
    return treffer ? 1 + treffer.bonus : 1;
}

module.exports = { stand, faktor, STUNDE_MS };
