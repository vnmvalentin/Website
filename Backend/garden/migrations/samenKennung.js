// garden/migrations/samenKennung.js
// Jeder Samen im Rucksack bekommt eine eindeutige Kennung (instanceId).
//
// WARUM
// Seit November 2026 darf der Browser beim Speichern keine Samen mehr HINZUFÜGEN,
// nur noch welche entfernen (pflanzen, wegwerfen). Erkannt wird ein Samen dabei an
// seiner Kennung: was der Server nicht kennt, fliegt raus (siehe
// gleicheSamenAb in routes/gardenGameRoutes.js). Ein Samen ohne Kennung — oder
// zwei mit derselben — wäre damit beim nächsten Speichern verloren.
//
// Der Browser erfährt von den neuen Kennungen über `serverAenderungAb`: sein
// nächster Speicherversuch läuft in den 409 und lädt nach, statt die alten,
// kennungslosen Samen zurückzuschreiben.

const { randomUUID } = require("crypto");

const MARKE = "samenKennungV1";

function runSamenKennungMigration(farmStates, { scheduleFarmsSave } = {}) {
    const werte = typeof farmStates.values === "function"
        ? Array.from(farmStates.values())
        : Object.values(farmStates);

    let staende = 0;
    let vergeben = 0;

    for (const state of werte) {
        if (!state || typeof state !== "object" || state[MARKE]) continue;
        const inventar = Array.isArray(state.inventory) ? state.inventory : [];
        const gesehen = new Set();
        let veraendert = false;
        state.inventory = inventar.map((samen) => {
            if (!samen || typeof samen !== "object") return samen;
            const id = typeof samen.instanceId === "string" ? samen.instanceId : "";
            if (id && !gesehen.has(id)) {
                gesehen.add(id);
                return samen;
            }
            const neu = randomUUID();
            gesehen.add(neu);
            veraendert = true;
            vergeben++;
            return { ...samen, instanceId: neu };
        });
        state[MARKE] = true;
        staende++;
        if (!veraendert) continue;
        state.stateVersion = (Number(state.stateVersion) || 0) + 1;
        state.serverAenderungAb = state.stateVersion;
    }

    if (vergeben > 0) {
        console.log(`[Garden] Samen-Kennungen: ${vergeben} vergeben.`);
    }
    if (staende > 0) scheduleFarmsSave?.(farmStates);
    return { staende, vergeben };
}

module.exports = { runSamenKennungMigration, MARKE };
