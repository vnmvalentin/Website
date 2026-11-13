// garden/migrations/zaunfeld.js
// Deko „Zaunfeld“ (zaun_klein) ist seit 07.11.2026 aus dem Laden genommen: jedes
// Grundstück hat einen eigenen Zaun am Rand, das Zaunfeld war doppelt. Gekaufte
// Stücke — im Rucksack und aufgestellt — verschwinden, der Kaufpreis kommt als Gold
// zurück. Ohne diese Umstellung zeigten aufgestellte Zaunfelder auf ein gelöschtes Bild.
//
// Die Deko-Listen gehören dem Browser. Er erfährt davon über `serverAenderungAb`:
// sein nächster Speicherversuch läuft in den 409 und lädt nach, statt die Stücke
// wieder hinzuschreiben.

const MARKE = "zaunfeldEntfernt";
/** Ladenpreis des Zaunfelds bis 07.11.2026 (core/deko.js). */
const PREIS = 4000;
const GOLD_MAX = 9_999_999_999_999;

function istZaunfeld(stueck) {
    if (!stueck || typeof stueck !== "object") return false;
    return stueck.decoId === "zaun_klein" || stueck.id === "zaun_klein"
        || String(stueck.image || "").endsWith("/fence_1x1.png");
}

/** Entfernt Zaunfelder aus einer Liste; gibt die neue Liste und die Stückzahl zurück. */
function ohneZaunfeld(liste) {
    if (!Array.isArray(liste)) return { liste, stueck: 0 };
    let stueck = 0;
    const rest = liste.filter((d) => {
        if (!istZaunfeld(d)) return true;
        stueck += Math.max(1, Math.floor(Number(d.amount) || 1));
        return false;
    });
    return { liste: rest, stueck };
}

function runZaunfeldMigration(farmStates, { scheduleFarmsSave } = {}) {
    const entries = typeof farmStates.entries === "function"
        ? Array.from(farmStates.entries())
        : Object.entries(farmStates);

    let staende = 0;
    let stuecke = 0;
    let erstattet = 0;
    let markiert = 0;

    for (const [, state] of entries) {
        if (!state || typeof state !== "object" || state[MARKE]) continue;
        const vorrat = ohneZaunfeld(state.decoInventory);
        const aufgestellt = ohneZaunfeld(state.decoPlacements);
        const anzahl = vorrat.stueck + aufgestellt.stueck;
        if (anzahl > 0) {
            state.decoInventory = vorrat.liste;
            state.decoPlacements = aufgestellt.liste;
            const gold = anzahl * PREIS;
            state.gold = Math.min(GOLD_MAX, (Number(state.gold) || 0) + gold);
            state.stateVersion = (Number(state.stateVersion) || 0) + 1;
            state.serverAenderungAb = state.stateVersion;
            staende++;
            stuecke += anzahl;
            erstattet += gold;
        }
        state[MARKE] = true;
        markiert++;
    }

    if (staende > 0) {
        console.log(`[Garden] Zaunfeld entfernt: ${stuecke} Stücke bei ${staende} Spielern, ${erstattet.toLocaleString("de-DE")} Gold erstattet.`);
    }
    if (markiert > 0) scheduleFarmsSave?.(farmStates);
    return { staende, stuecke, erstattet };
}

module.exports = { runZaunfeldMigration, MARKE, PREIS, istZaunfeld };
