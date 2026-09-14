// garden/migrations/index.js
// Alle Umstellungen alter Spielstände, in der Reihenfolge, in der sie laufen müssen.
//
// ── WAS HIER NICHT MEHR STEHT ────────────────────────────────────────────────
// Die „Pflanzenmigration" (migrations/plants.js) ist ersatzlos gestrichen. Sie hat
// als EINZIGE ohne Marke gearbeitet und deshalb bei JEDEM Serverstart über JEDE
// Pflanze geschrieben — sie war keine Umstellung, sondern ein Dauerzustand. Drei
// Schäden gingen davon aus:
//
//   * Sie rechnete `growthMs` aus `norm` und dem Katalog neu. Jedes Gießen war
//     damit beim nächsten Neustart wieder weg.
//   * Sie setzte `structureReadyAt = plantedAt + structureGrowthMs` — dasselbe für
//     Dauerträger.
//   * Und dadurch wurden reife Pflanzen wieder unreif, während ihre Wetter-Uhr
//     (`statusEffectUntil`) weiterlief. Vier Minuten später waren Nass, Gefroren,
//     Geladen und Mondlicht gelöscht; Golden und Rainbow blieben stehen, weil die
//     keine Uhr haben. Genau das Bild „nach der Migration nur noch Gold und Rainbow".
//     Die zweite Hälfte dieser Ursache ist in engine/PlantSystem.js abgestellt: die
//     Uhr ruht jetzt, solange die Frucht nicht reif ist.
//
// Ihre eigentliche Aufgabe braucht es nicht mehr. Verkaufswerte kommen zur Laufzeit
// aus core/catalogue.js, und die Zeiten einer bestehenden Pflanze gehören seit
// `verplausibilisierePflanzen` (routes/gardenGameRoutes.js) dem Server. Ein Katalog-
// Balancing wirkt damit auf alles, was neu gesetzt wird — und lässt in Ruhe, was
// schon wächst.
//
// ── WARUM DIE REIHENFOLGE FESTSTEHT ──────────────────────────────────────────
//   1. plot    verschiebt Steinreihen und räumt Wegkacheln
//   2. deko    schreibt Bildpfade auf die neue Ordnerstruktur um; hängt an nichts,
//              steht aber vor den XP-Schritten, weil ein Abbruch danach sonst
//              unsichtbare Gärten hinterliesse
//   3. tierplaetze  gibt Gold und überzählige Tiere zurück; hängt an nichts
//   4. xp      zahlt Erfahrung aus dem Logbuch nach; hängt an keinem der anderen,
//              steht aber ans Ende, damit ein Abbruch davor nichts halb Gezahltes
//              hinterlässt
//
// Jede Umstellung trägt ihre eigene Marke im Spielstand und läuft genau einmal.
// Sie sind bewusst NICHT zu einer einzigen Marke zusammengefasst: neue Umstellungen
// kommen dazu, nachdem die alten längst ausgerollt sind — an einer gemeinsamen Marke
// liefe die neue dann nie bei denen, die sie brauchen.

const { runPlotMigration, MARKE: PLOT_MARKE, MARKE_WEGE: PLOT_MARKE_WEGE } = require("./plot");
const { runXpMigration, runXpKurveKorrektur, MARKE: XP_MARKE, MARKE_KURVE, MARKE_KORREKTUR } = require("./xp");
const { runSkillStaffelMigration, MARKE: SKILL_MARKE } = require("./skills");
const { runDekoPfadMigration, MARKE: DEKO_MARKE } = require("./deko");
const { runTierplatzMigration, MARKE: TIERPLATZ_MARKE } = require("./tierplaetze");

/**
 * Alle Marken, die ein durchmigrierter Spielstand trägt.
 *
 * WOFÜR: Sind sie überall gesetzt, hat keine der Umstellungen mehr etwas zu tun —
 * dann wird der ganze Durchgang übersprungen, statt bei jedem Serverstart über
 * sämtliche Spielstände zu laufen. Genau das ist mit „stillgelegte Migration"
 * gemeint: der Code bleibt für Spielstände aus einem alten Backup erhalten, kostet
 * im Regelfall aber keinen Handschlag mehr.
 */
const ALLE_MARKEN = [
    PLOT_MARKE, PLOT_MARKE_WEGE, DEKO_MARKE, XP_MARKE, MARKE_KURVE, MARKE_KORREKTUR, SKILL_MARKE,
    TIERPLATZ_MARKE,
];

function alleErledigt(farmStates) {
    const werte = typeof farmStates.values === "function"
        ? Array.from(farmStates.values())
        : Object.values(farmStates);
    for (const state of werte) {
        if (!state || typeof state !== "object") continue;
        for (const marke of ALLE_MARKEN) if (!state[marke]) return false;
    }
    return true;
}

/**
 * Fährt alle Umstellungen. Gibt je Schritt eine Zeile für das Startprotokoll zurück,
 * damit index.js nicht jede einzelne kennen muss.
 *
 * @returns {{name: string, text: string}[]}
 */
function runGardenMigrations(farmStates, { scheduleFarmsSave } = {}) {
    if (alleErledigt(farmStates)) {
        return [{ name: "Altlasten", text: "stillgelegt — alle Spielstände tragen ihre Marken" }];
    }

    const zeilen = [];

    const plot = runPlotMigration(farmStates, { scheduleFarmsSave });
    zeilen.push({
        name: "Steinfeld-Umstellung",
        text: (plot.staende > 0 || plot.geraeumt > 0)
            ? `${plot.felder} Felder / ${plot.pflanzen} Pflanzen / ${plot.wegeGeraeumt} Wegkacheln / ${plot.umgezogen} umgezogen`
            : "keine Änderungen",
    });

    // Hängt an keiner der anderen: schreibt nur Bildpfade um. Steht trotzdem vor
    // den XP-Schritten, damit ein Abbruch weiter unten die Gärten nicht unsichtbar
    // zurücklässt — das fällt sofort auf, eine fehlende XP-Nachzahlung nicht.
    const deko = runDekoPfadMigration(farmStates, { scheduleFarmsSave });
    zeilen.push({
        name: "Deko-Ordnerumzug",
        text: deko.staende > 0
            ? `${deko.stuecke} Stücke / ${deko.staende} Spieler`
            : "keine Änderungen",
    });

    // Muss VOR den XP-Schritten laufen, aus demselben Grund wie der Deko-Umzug:
    // ein Abbruch danach darf keine unerreichbaren Tiere und kein fehlendes Gold
    // hinterlassen. Hängt sonst an keiner anderen Umstellung.
    const tierplaetze = runTierplatzMigration(farmStates, { scheduleFarmsSave });
    zeilen.push({
        name: "Tierplätze auf 3",
        text: (tierplaetze.erstattet > 0 || tierplaetze.eingepackt > 0)
            ? `${tierplaetze.erstattet.toLocaleString("de-DE")} Gold erstattet / ${tierplaetze.eingepackt} Tiere eingepackt / ${tierplaetze.zurueckgegeben} Leihgaben zurück`
            : "keine Änderungen",
    });

    const xp = runXpMigration(farmStates, { scheduleFarmsSave });
    zeilen.push({
        name: "XP-Nachzahlung",
        text: xp.staende > 0
            ? `${xp.vergeben.toLocaleString("de-DE")} XP / ${xp.staende} Spieler / bis Level ${xp.hoechstes}`
            : "keine Änderungen",
    });

    // MUSS nach runXpMigration laufen: die Nachzahlung schreibt XP in derselben
    // Einheit (Logbuch × XP je Seltenheit), und erst danach steht fest, welches
    // Level daraus auf der neuen Kurve wird.
    const xpKurve = runXpKurveKorrektur(farmStates, { scheduleFarmsSave });
    zeilen.push({
        name: "XP-Kurve",
        text: (xpKurve.gestreckt > 0 || xpKurve.zurueckgesetzt > 0)
            ? `${xpKurve.gestreckt} zurückgerechnet / ${xpKurve.zurueckgesetzt} Punkte freigegeben`
            : "keine Änderungen",
    });

    // MUSS als LETZTES laufen: kürzt Fähigkeitsstufen auf die neue Levelstaffel und
    // braucht dafür das endgültige Level — also erst, wenn Nachzahlung UND Korrektur
    // die XP festgeschrieben haben.
    const staffel = runSkillStaffelMigration(farmStates, { scheduleFarmsSave });
    zeilen.push({
        name: "Skillstaffel",
        text: staffel.staende > 0
            ? `${staffel.gekuerzteStufen} Stufen / ${staffel.staende} Spieler freigegeben`
            : "keine Änderungen",
    });

    return zeilen;
}

module.exports = {
    runGardenMigrations, runPlotMigration, runXpMigration, runXpKurveKorrektur,
    runSkillStaffelMigration, runDekoPfadMigration, runTierplatzMigration, ALLE_MARKEN,
};
