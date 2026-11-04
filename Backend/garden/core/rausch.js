// garden/core/rausch.js
// Ernte-Rausch (Fahrplan Phase 5 „Erntekette", Nutzerentscheidung 04.11.2026): wer
// dranbleibt und regelmäßig erntet, bekommt einen wachsenden Aufschlag auf den Erlös.
// Spiegel im Browser: Frontend ui/rausch.js (nur Anzeige).
//
// WARUM über Minuten statt „schnell hintereinander"
// Eine Kette aus Ernten kurz hintereinander wäre beim Shift-Ziehen über ein volles
// Feld sofort voll — ein fester Bonus für jeden, der so erntet, kein Lohn für aktives
// Spielen. Gezählt wird deshalb die AKTIVE ZEIT:
//
//   Liegen zwischen zwei Ernten höchstens SCHONZEIT_MS, wächst der Rausch um genau
//   diese Lücke. Nach VOLL_MS (10 Minuten) aktiver Zeit ist er voll: +15 %.
//   Ist die Lücke länger, sinkt er um die Zeit, die über die Schonzeit hinausging —
//   eine Minute Pause kostet eine Minute Rausch. Abwesenheit wird so nicht bestraft
//   (der Bonus ist nur obendrauf), aber auch nicht dauerhaft belohnt.
//
// Gewertet wird beim ERNTEN, das Stück trägt den Faktor dauerhaft (Feld `rausch`),
// genau wie Saison- und Vielfalt-Aufschlag — der Rucksack zeigt also schon beim
// Ernten den Wert, den die Kasse später zahlt.
//
// Der Stand liegt in state.ernteRausch und gehört allein dem Server: compactFarmState
// kennt das Feld nicht, der Speicher-PUT übernimmt es aus dem alten Stand.

const SCHONZEIT_MS = 60 * 1000;
const VOLL_MS = 10 * 60 * 1000;
const MAX_BONUS = 0.15;

function zahl(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/** Aktive Zeit, wie sie zum Zeitpunkt `now` stünde (ohne den Stand zu ändern). */
function aktivBis(roh, now) {
    const aktiv = Math.max(0, Math.min(VOLL_MS, zahl(roh?.aktivMs)));
    const zuletzt = zahl(roh?.zuletzt);
    if (!zuletzt) return 0;
    const luecke = Math.max(0, now - zuletzt);
    if (luecke <= SCHONZEIT_MS) return Math.min(VOLL_MS, aktiv + luecke);
    return Math.max(0, aktiv - (luecke - SCHONZEIT_MS));
}

/** Faktor auf den Erlös zu einer aktiven Zeit. */
function faktorAus(aktivMs) {
    const f = 1 + MAX_BONUS * Math.min(1, Math.max(0, aktivMs) / VOLL_MS);
    return Math.round(f * 1000) / 1000;
}

/**
 * Bei einer Ernte aufrufen: schreibt den Stand fort und gibt den Faktor zurück.
 * Mehrfach mit demselben `now` aufgerufen (mehrere Zellen eines Zugs) ändert nichts.
 */
function ernten(state, now = Date.now()) {
    const aktivMs = aktivBis(state.ernteRausch, now);
    state.ernteRausch = { aktivMs, zuletzt: now };
    return faktorAus(aktivMs);
}

/** Für die Anzeige: Füllstand 0..1, Bonus in Prozent und wie lange er noch hält. */
function anzeige(state, now = Date.now()) {
    const roh = state?.ernteRausch;
    const aktivMs = aktivBis(roh, now);
    const zuletzt = zahl(roh?.zuletzt);
    return {
        fuellung: Math.round((aktivMs / VOLL_MS) * 1000) / 1000,
        prozent: Math.round((faktorAus(aktivMs) - 1) * 100),
        // Bis wann die nächste Ernte kommen muss, damit nichts verloren geht.
        haeltBis: zuletzt ? zuletzt + SCHONZEIT_MS : 0,
        aktivMs,
    };
}

/** Gespeicherten Faktor eines Erntestücks lesen — gedeckelt, fehlt er: 1. */
function vonStueck(item) {
    const f = Number(item?.rausch);
    return Number.isFinite(f) && f > 0 ? Math.max(1, Math.min(1 + MAX_BONUS, f)) : 1;
}

module.exports = { ernten, anzeige, vonStueck, faktorAus, SCHONZEIT_MS, VOLL_MS, MAX_BONUS };
