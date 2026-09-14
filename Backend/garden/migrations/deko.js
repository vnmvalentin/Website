// garden/migrations/deko.js
// Deko-Bildpfade auf die neue Ordnerstruktur ziehen.
//
// WARUM
// Bis v4.1 lag jede Deko flach unter /garden-assets/deco/. Jetzt sortiert sie sich
// in lighting/, nature/, objects/, social/ und texture/. Die alten Dateien gibt es
// an ihrem alten Ort NICHT mehr — jeder gespeicherte Garten zeigt also auf einen
// 404, und ein 404 heisst im Renderer: unsichtbar. Ohne diese Umstellung stünde
// bei jedem Bestandsspieler ein leeres Grundstück, auf dem die Felder trotzdem
// belegt sind.
//
// Angefasst werden decoPlacements (aufgestellt) und decoInventory (im Rucksack).
// Gerechnet wird nichts, es wird nur ein Pfad umgeschrieben.
//
// Idempotent über die Marke UND über normalisiereDekoPfad selbst: ein Pfad, der
// schon in einem Unterordner steht, kommt unverändert zurück.

const { normalisiereDekoPfad } = require("../core/deko");

const MARKE = "dekoOrdnerUmzug";

/** Schreibt `image` einer Liste um. Gibt zurück, wie viele Stücke sich änderten. */
function zieheListeUm(liste) {
    if (!Array.isArray(liste)) return 0;
    let geaendert = 0;
    for (const stueck of liste) {
        if (!stueck || typeof stueck !== "object") continue;
        const neu = normalisiereDekoPfad(stueck.image);
        if (neu !== stueck.image) {
            stueck.image = neu;
            geaendert++;
        }
        // Alte Ansichten-Varianten (deco/teich_right.png) gibt es in der neuen
        // Struktur nicht mehr. Das Feld bleibt stehen — der Renderer prüft ohnehin,
        // ob es die Variante gibt, und fällt sonst auf das Grundbild zurück.
    }
    return geaendert;
}

function runDekoPfadMigration(farmStates, { scheduleFarmsSave } = {}) {
    const entries = typeof farmStates.entries === "function"
        ? Array.from(farmStates.entries())
        : Object.entries(farmStates);

    let staende = 0;
    let stuecke = 0;

    for (const [, state] of entries) {
        if (!state || typeof state !== "object") continue;
        if (state[MARKE]) continue;
        state[MARKE] = true;

        const umgezogen = zieheListeUm(state.decoPlacements) + zieheListeUm(state.decoInventory);
        if (umgezogen === 0) continue;
        stuecke += umgezogen;
        staende++;

        // MUSS sein, sonst wirkt die Umstellung nur bis zum nächsten Speichern.
        // Deko gehört dem Browser; ein Tab, der den Neustart überlebt hat, schickt
        // sonst seine alten Pfade wieder hoch — und weil die Marke oben schon steht,
        // liefe die Umstellung nie wieder. Mit dem erhöhten Zähler lädt er neu.
        state.stateVersion = (Number(state.stateVersion) || 0) + 1;
        state.serverAenderungAb = state.stateVersion;
    }

    if (staende > 0) {
        console.log(`[Garden] Deko-Ordnerumzug: ${stuecke} Stücke bei ${staende} Spielständen umgeschrieben.`);
    }
    scheduleFarmsSave?.(farmStates);
    return { staende, stuecke };
}

module.exports = { runDekoPfadMigration, MARKE };
