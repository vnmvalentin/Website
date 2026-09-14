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
/**
 * Marken der (fehlerhaften) Streckungen samt dem Faktor, mit dem sie gerechnet
 * haben. Es gab ZWEI Fassungen — erst XP_FAKTOR 250, dann 400 — und beide haben
 * ihre eigene Marke gesetzt. Wer beide Stände nacheinander bekommen hat, wurde
 * damit ZWEIMAL gestreckt (8,33 × 13,33 = 111-fach). Die Korrektur unten rechnet
 * jede gesetzte Marke einzeln heraus, egal in welcher Reihenfolge sie kamen.
 */
const STRECKUNGEN = [
    { marke: "xpKurve250", faktor: 250 / 30 },
    { marke: "xpKurve400", faktor: 400 / 30 },
];
/** Rückwärtskompatibel: einzelne Marke, die ältere Aufrufer noch importieren. */
const MARKE_KURVE = "xpKurve400";
const MARKE_KORREKTUR = "xpKurveKorrektur";
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
 * Korrektur der XP-Kurven-Umstellung.
 *
 * WAS SCHIEFGING: Als XP_FAKTOR von 30 auf 400 stieg, hat eine frühere Fassung
 * dieser Datei die vorhandene Erfahrung mit demselben Faktor HOCHGERECHNET, damit
 * niemand ein Level verliert. Das war der Denkfehler — das alte Level war ja
 * gerade das Problem: unter Faktor 30 reichten 73.500 XP für Level 50, und die
 * XP-Nachzahlung aus dem Logbuch (oben) hat diese Summe bei jedem länger
 * spielenden Konto sofort übersprungen. Praktisch waren alle sofort Höchstlevel
 * und hatten den kompletten Fähigkeitsbaum offen.
 *
 * Die Streckung hat diesen Zustand also sauber konserviert statt ihn zu beheben.
 *
 * DIESE MIGRATION nimmt die Streckung wieder zurück. Die XP-EINHEIT hat sich nie
 * geändert (eine gewöhnliche Ernte gibt weiterhin 1 XP) — nur die Kurve ist
 * steiler. Derselbe XP-Stand ergibt damit ein deutlich niedrigeres, ehrlicheres
 * Level: aus 73.500 XP wird Level 14 statt 50.
 *
 * Die Fähigkeitspunkte werden dabei zurückgegeben, wenn mehr vergeben sind, als
 * das neue Level hergibt. Ohne das behielte man dauerhaft Stufen, die man sich
 * nie verdient hat, und bekäme bis auf Weiteres keinen einzigen Punkt mehr.
 */
function runXpKurveKorrektur(farmStates, { scheduleFarmsSave } = {}) {
    const entries = typeof farmStates.entries === "function"
        ? Array.from(farmStates.entries())
        : Object.entries(farmStates);

    let gestreckt = 0;
    let zurueckgesetzt = 0;

    for (const [userId, state] of entries) {
        if (!state || typeof state !== "object") continue;
        if (state[MARKE_KORREKTUR]) continue;

        // Jede gelaufene Streckung einzeln herausrechnen. Wer beide Fassungen
        // bekommen hat, wurde zweimal gestreckt — dann greifen auch beide Teiler.
        const gelaufen = STRECKUNGEN.filter((s) => state[s.marke]);
        if (gelaufen.length > 0) {
            const vorher = Math.max(0, Number(state.xp) || 0);
            if (vorher > 0) {
                const teiler = gelaufen.reduce((f, s) => f * s.faktor, 1);
                state.xp = Math.round(vorher / teiler);
                gestreckt++;
                console.log(`[Garden] XP-Korrektur ${userId}: `
                    + `${vorher.toLocaleString("de-DE")} → ${state.xp.toLocaleString("de-DE")} XP `
                    + `(Level ${levelZuXp(vorher)} → ${levelZuXp(state.xp)}) — `
                    + `zurückgerechnet über ${gelaufen.map((s) => s.marke).join(" + ")}`);
            }
        }

        // Punkte neu verteilen lassen, falls das Level nicht mehr dazu passt.
        const level = levelZuXp(Math.max(0, Number(state.xp) || 0));
        const verfuegbar = Math.max(0, level - 1);
        const vergeben = Object.values(state.skills || {})
            .reduce((n, v) => n + Math.max(0, Math.floor(Number(v) || 0)), 0);
        if (vergeben > verfuegbar) {
            state.skills = {};
            zurueckgesetzt++;
        }

        state[MARKE_KORREKTUR] = true;
    }

    if (gestreckt > 0 || zurueckgesetzt > 0) {
        console.log(`[Garden] XP-Kurve korrigiert: ${gestreckt} Spielstände zurückgerechnet, `
            + `bei ${zurueckgesetzt} die Fähigkeitspunkte zur Neuverteilung freigegeben.`);
    }
    scheduleFarmsSave?.(farmStates);
    return { gestreckt, zurueckgesetzt };
}

module.exports = {
    runXpMigration, runXpKurveKorrektur, xpAusLogbuch,
    MARKE, MARKE_KURVE, MARKE_KORREKTUR, STRECKUNGEN,
};
