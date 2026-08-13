// garden/migrations/index.js
// Alle Umstellungen alter Spielstände, in der Reihenfolge, in der sie laufen müssen.
//
// WARUM DIE REIHENFOLGE FESTSTEHT
//   1. plants  legt fehlende Felder an Pflanzen an (Grundlage für alles Weitere)
//   2. plot    verschiebt Steinreihen und räumt Wegkacheln — braucht die Pflanzen
//   3. xp      zahlt Erfahrung aus dem Logbuch nach; hängt an keinem der beiden,
//              steht aber ans Ende, damit ein Abbruch davor nichts halb Gezahltes
//              hinterlässt
//
// Jede Umstellung trägt ihre eigene Marke im Spielstand und läuft genau einmal.
// Sie sind bewusst NICHT zu einer einzigen Marke zusammengefasst: neue Umstellungen
// kommen dazu, nachdem die alten längst ausgerollt sind — an einer gemeinsamen Marke
// liefe die neue dann nie bei denen, die sie brauchen.

const { runPlantMigration } = require("./plants");
const { runPlotMigration } = require("./plot");
const { runXpMigration, runXpKurveMigration } = require("./xp");

/**
 * Fährt alle Umstellungen. Gibt je Schritt eine Zeile für das Startprotokoll zurück,
 * damit index.js nicht jede einzelne kennen muss.
 *
 * @returns {{name: string, text: string}[]}
 */
function runGardenMigrations(farmStates, { scheduleFarmsSave } = {}) {
    const zeilen = [];

    const pflanzen = runPlantMigration(farmStates);
    zeilen.push({
        name: "Pflanzenmigration",
        text: pflanzen.migratedUsers > 0
            ? `${pflanzen.migratedPlants} Pflanzen / ${pflanzen.migratedUsers} Spieler`
            : "keine Änderungen",
    });

    const plot = runPlotMigration(farmStates, { scheduleFarmsSave });
    zeilen.push({
        name: "Steinfeld-Umstellung",
        text: (plot.staende > 0 || plot.geraeumt > 0)
            ? `${plot.felder} Felder / ${plot.pflanzen} Pflanzen / ${plot.wegeGeraeumt} Wegkacheln / ${plot.umgezogen} umgezogen`
            : "keine Änderungen",
    });

    const xp = runXpMigration(farmStates, { scheduleFarmsSave });
    zeilen.push({
        name: "XP-Nachzahlung",
        text: xp.staende > 0
            ? `${xp.vergeben.toLocaleString("de-DE")} XP / ${xp.staende} Spieler / bis Level ${xp.hoechstes}`
            : "keine Änderungen",
    });

    // MUSS nach runXpMigration laufen: die Nachzahlung rechnet in der ALTEN
    // Skala (Logbuch × XP je Seltenheit), die Streckung zieht danach alles
    // gemeinsam auf die neue Kurve. Andersherum bekäme die Nachzahlung den
    // Faktor nicht ab und würde Level kosten.
    const xpKurve = runXpKurveMigration(farmStates, { scheduleFarmsSave });
    zeilen.push({
        name: "XP-Kurve",
        text: xpKurve.staende > 0
            ? `${xpKurve.staende} Spieler × Faktor ${xpKurve.faktor.toFixed(2)}`
            : "keine Änderungen",
    });

    return zeilen;
}

module.exports = {
    runGardenMigrations, runPlantMigration, runPlotMigration, runXpMigration, runXpKurveMigration,
};
