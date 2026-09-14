#!/usr/bin/env node
// garden/tools/katalogSpiegel.js
// Schreibt die Frontend-Spiegel der Spieldaten neu. Zwei Stück:
//
//   Samenkatalog   garden/core/catalogue.js  →  engine/PlantSystem.js
//   Tageszeit      garden/core/tageszeit.js  →  engine/Tageszeit.js
//
// WARUM ES DAS GIBT
// Diese Daten stehen zwangsläufig zweimal da: der Server rechnet damit, der Browser
// zeigt dieselben Zahlen an bzw. zeichnet danach. Solange beide Seiten von Hand
// gepflegt wurden, sind sie regelmäßig auseinandergelaufen — der Laden versprach
// dann etwas anderes, als die Kasse zahlte. Zuletzt betraf das die Ladenbestände:
// der Browser führte für neun Sorten größere Vorräte als der Server.
//
// Ab jetzt sind die Backend-Dateien die einzige Quelle und die Spiegel werden
// erzeugt. Übernommen wird der Quelltext WÖRTLICH — damit kann sich nicht einmal
// ein Rundungsfehler einschleichen.
//
//   node garden/tools/katalogSpiegel.js            schreibt die Spiegel
//   node garden/tools/katalogSpiegel.js --pruefen  meldet nur, Rückgabewert 1 bei Abweichung

const fs = require("fs");
const path = require("path");

const WURZEL = path.resolve(__dirname, "..", "..", "..");
const FE_ENGINE = path.join(WURZEL, "Frontend", "src", "pages", "GardenGame", "engine");
const KATALOG_QUELLE = path.join(WURZEL, "Backend", "garden", "core", "catalogue.js");
const KATALOG_SPIEGEL = path.join(FE_ENGINE, "PlantSystem.js");
const ZEIT_QUELLE = path.join(WURZEL, "Backend", "garden", "core", "tageszeit.js");
const ZEIT_SPIEGEL = path.join(FE_ENGINE, "Tageszeit.js");

const MARKE_ANFANG = "// ─── SPIEGEL-ANFANG";
const MARKE_ENDE = "// ─── SPIEGEL-ENDE";
const ZEILENENDE = String.fromCharCode(10);

/** Text eines Array-Literals inklusive der eckigen Klammern. */
function arrayText(quelltext, kopf) {
    const start = quelltext.indexOf(kopf);
    if (start === -1) throw new Error(`"${kopf}" nicht gefunden`);
    const von = quelltext.indexOf("[", start);
    const bis = quelltext.indexOf(ZEILENENDE + "];", von);
    if (von === -1 || bis === -1) throw new Error(`Array hinter "${kopf}" nicht abgeschlossen`);
    return { von, bis: bis + 3, text: quelltext.slice(von, bis + 3) };
}

/**
 * Abschnitt zwischen den SPIEGEL-Marken, samt beider Marken. Für Module, bei denen
 * nicht eine Liste, sondern ein ganzer Block gespiegelt wird — alles dazwischen muss
 * deshalb in CommonJS UND als ES-Modul gültig sein (kein require, kein export).
 */
function markenText(quelltext, datei) {
    const von = quelltext.indexOf(MARKE_ANFANG);
    const roh = quelltext.indexOf(MARKE_ENDE);
    if (von === -1 || roh === -1) throw new Error(`${datei}: SPIEGEL-Marken fehlen`);
    const zeilenEnde = quelltext.indexOf(ZEILENENDE, roh);
    const bis = zeilenEnde === -1 ? quelltext.length : zeilenEnde;
    return { von, bis, text: quelltext.slice(von, bis) };
}

const AUFTRAEGE = [
    {
        name: "Samenkatalog",
        quelle: KATALOG_QUELLE,
        spiegel: KATALOG_SPIEGEL,
        ausschnitt: (text, datei, istQuelle) =>
            arrayText(text, istQuelle ? "const SEED_CATALOGUE = [" : "export const SEED_CATALOGUE = ["),
    },
    {
        name: "Tageszeit",
        quelle: ZEIT_QUELLE,
        spiegel: ZEIT_SPIEGEL,
        ausschnitt: (text, datei) => markenText(text, datei),
    },
];

/** @returns {boolean} true = in Ordnung (oder neu geschrieben) */
function spiegle(auftrag, nurPruefen) {
    const quelle = fs.readFileSync(auftrag.quelle, "utf8");
    const ziel = fs.readFileSync(auftrag.spiegel, "utf8");
    const q = auftrag.ausschnitt(quelle, auftrag.quelle, true);
    const z = auftrag.ausschnitt(ziel, auftrag.spiegel, false);

    if (q.text === z.text) {
        console.log(`${auftrag.name}: Spiegel stimmt überein.`);
        return true;
    }
    if (nurPruefen) {
        console.error(`${auftrag.name}: Spiegel weicht ab — "npm run garden:spiegel" schreibt ihn neu.`);
        return false;
    }
    fs.writeFileSync(auftrag.spiegel, ziel.slice(0, z.von) + q.text + ziel.slice(z.bis));
    console.log(`${auftrag.name}: Spiegel neu geschrieben (${path.relative(WURZEL, auftrag.spiegel)}).`);
    return true;
}

function main() {
    const nurPruefen = process.argv.includes("--pruefen");
    let ok = true;
    for (const auftrag of AUFTRAEGE) {
        if (!spiegle(auftrag, nurPruefen)) ok = false;
    }
    return ok ? 0 : 1;
}

process.exit(main());
