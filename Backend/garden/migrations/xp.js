// garden/migrations/xp.js
// Erfahrung für alles nachzahlen, was vor der Einführung des Baums geerntet wurde.
//
// WOHER DIE ZAHL KOMMT
// Das Logbuch führt je Samenart, wie oft man sie geerntet hat (`anzahl`). Multipliziert
// mit der XP-Tabelle nach Seltenheit ergibt das genau die Summe, die derselbe Spieler
// bekommen hätte, wenn es den Baum von Anfang an gegeben hätte.
//
// WAS DAMIT NICHT ERFASST IST
// Das Logbuch wird beim EINLAGERN gefüllt. Was ein Erntehelfer-Tier direkt verkauft
// hat, ist nie durch den Rucksack gegangen und taucht dort nicht auf. Die Nachzahlung
// fällt für Spieler mit Harvester also zu niedrig aus. Das ist bewusst die falsche
// Richtung: zu wenig lässt sich später nachtragen, zu viel nicht mehr einsammeln.
//
// GESETZT WIRD DAS MAXIMUM, nicht die Summe. Wer seit dem Ausrollen schon geerntet
// hat, führt einen Teil dieser Ernten bereits in `xp`; addieren würde sie doppelt
// zählen. Die Logbuch-Zahl ist der Stand „alles, was je geerntet wurde" — und damit
// die richtige Untergrenze.

const { SEED_CATALOGUE } = require("../core/catalogue");
const { XP_JE_SELTENHEIT, levelZuXp, XP_FAKTOR, XP_FAKTOR_ALT } = require("../core/skills");

const MARKE = "xpAusLogbuch";
const MARKE_KURVE = "xpKurve250";
const SELTENHEIT_JE_SAMEN = new Map(SEED_CATALOGUE.map((s) => [s.id, s.rarity]));

/** XP-Summe aus einem Logbuch. Unbekannte Arten zählen als COMMON. */
function xpAusLogbuch(logbuch) {
    if (!logbuch || typeof logbuch !== "object") return 0;
    let summe = 0;
    for (const [seedId, eintrag] of Object.entries(logbuch)) {
        const anzahl = Math.max(0, Math.floor(Number(eintrag?.anzahl) || 0));
        if (anzahl === 0) continue;
        const seltenheit = SELTENHEIT_JE_SAMEN.get(seedId) || "COMMON";
        summe += anzahl * (XP_JE_SELTENHEIT[seltenheit] || 1);
    }
    return summe;
}

/**
 * Zahlt allen Spielständen ihre Erfahrung nach. Idempotent über die Marke.
 *
 * Die Marke wird auch dann gesetzt, wenn nichts nachzuzahlen war — sonst liefe die
 * Rechnung bei jedem Serverstart erneut über alle Stände.
 */
function runXpMigration(farmStates, { scheduleFarmsSave } = {}) {
    const entries = typeof farmStates.entries === "function"
        ? Array.from(farmStates.entries())
        : Object.entries(farmStates);

    let staende = 0;
    let vergeben = 0;
    let hoechstes = 0;

    for (const [userId, state] of entries) {
        if (!state || typeof state !== "object") continue;
        if (state[MARKE]) continue;

        const nachzahlung = xpAusLogbuch(state.logbuch);
        const vorher = Math.max(0, Number(state.xp) || 0);
        if (nachzahlung > vorher) {
            state.xp = nachzahlung;
            vergeben += nachzahlung - vorher;
            staende++;
            const level = levelZuXp(nachzahlung);
            if (level > hoechstes) hoechstes = level;
            console.log(`[Garden] XP nachgezahlt für ${userId}: `
                + `${nachzahlung.toLocaleString("de-DE")} XP (Level ${level})`);
        }
        // Erfahrung gehört dem Server und steht nicht im PUT des Browsers — ein
        // verspäteter Speicherstand kann sie also nicht überschreiben. Der Zähler
        // muss deshalb NICHT hochgesetzt werden, und kein offener Tab wird
        // unnötig zum Neuladen gezwungen.
        state[MARKE] = true;
    }

    if (staende > 0) {
        console.log(`[Garden] XP-Nachzahlung: ${staende} Spielstände, `
            + `${vergeben.toLocaleString("de-DE")} XP insgesamt, höchstes Level ${hoechstes}.`);
    }
    scheduleFarmsSave?.(farmStates);
    return { staende, vergeben, hoechstes };
}

/**
 * Umstellung der XP-Kurve (XP_FAKTOR 30 → 250).
 *
 * Die Kurve wurde gestreckt, weil der Fähigkeitsbaum vorher nach wenigen Minuten
 * komplett ausgebaut war. Ohne diese Umrechnung würde jeder bestehende Spielstand
 * dabei Level verlieren: bei gleichem XP-Stand ist das Level um den Faktor
 * sqrt(250/30) ≈ 2,9 niedriger. Deshalb wird die vorhandene Erfahrung mit
 * demselben Faktor hochgerechnet — das Level bleibt exakt erhalten, die
 * NÄCHSTEN Level dauern ab jetzt länger.
 *
 * Gerechnet wird über die Levelgrenze, nicht über die rohe XP-Zahl: so bleibt
 * auch der Fortschritt innerhalb des aktuellen Levels anteilig gleich.
 */
function runXpKurveMigration(farmStates, { scheduleFarmsSave } = {}) {
    const entries = typeof farmStates.entries === "function"
        ? Array.from(farmStates.entries())
        : Object.entries(farmStates);

    let staende = 0;
    const faktor = XP_FAKTOR / XP_FAKTOR_ALT;

    for (const [, state] of entries) {
        if (!state || typeof state !== "object") continue;
        if (state[MARKE_KURVE]) continue;
        const vorher = Math.max(0, Number(state.xp) || 0);
        if (vorher > 0) {
            state.xp = Math.round(vorher * faktor);
            staende++;
        }
        state[MARKE_KURVE] = true;
    }

    if (staende > 0) {
        console.log(`[Garden] XP-Kurve umgestellt: ${staende} Spielstände `
            + `mit Faktor ${faktor.toFixed(2)} hochgerechnet — kein Level geht verloren.`);
    }
    scheduleFarmsSave?.(farmStates);
    return { staende, faktor };
}

module.exports = { runXpMigration, runXpKurveMigration, xpAusLogbuch, MARKE, MARKE_KURVE };
