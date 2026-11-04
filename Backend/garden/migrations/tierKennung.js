// garden/migrations/tierKennung.js
// Jedes Tier bekommt eine feste, eindeutige `id`, jedes Ei eine `instanceId`.
//
// WARUM
// Seit November 2026 erkennt der Server Tiere beim Speichern an ihrer Kennung
// (siehe gleicheTiereAb in core/brutkasten.js): nur was er kennt, darf auf dem
// Grundstück stehen. Bis dahin vergab der Browser beim Aufstellen und Einpacken
// jedes Mal eine NEUE Kennung — und manche Tiere hatten nur eine `instanceId`.
// Ohne feste `id` fände der Server ein frisch aufgestelltes Tier nicht wieder.
//
// Eier brauchen die `instanceId`, weil der Brutkasten sie jetzt auf dem Server
// aus dem Rucksack nimmt.

const { randomUUID } = require("crypto");

const MARKE = "tierKennungV1";

function runTierKennungMigration(farmStates, { scheduleFarmsSave } = {}) {
    const werte = typeof farmStates.values === "function"
        ? Array.from(farmStates.values())
        : Object.values(farmStates);

    let staende = 0;
    let tiere = 0;
    let eier = 0;

    for (const state of werte) {
        if (!state || typeof state !== "object" || state[MARKE]) continue;
        let veraendert = false;

        const gesehen = new Set();
        const fest = (tier) => {
            if (!tier || typeof tier !== "object") return tier;
            const id = String(tier.id || tier.instanceId || "");
            if (id && !gesehen.has(id)) {
                gesehen.add(id);
                if (tier.id === id) return tier;
                veraendert = true;
                tiere++;
                return { ...tier, id };
            }
            const neu = `pet_${randomUUID()}`;
            gesehen.add(neu);
            veraendert = true;
            tiere++;
            return { ...tier, id: neu };
        };
        // Platzierte zuerst: deren Kennung kennt der Browser gerade auf dem Grundstück.
        if (Array.isArray(state.petPlacements)) state.petPlacements = state.petPlacements.map(fest);
        if (Array.isArray(state.petInventory)) state.petInventory = state.petInventory.map(fest);

        const eierGesehen = new Set();
        if (Array.isArray(state.eggInventory)) {
            state.eggInventory = state.eggInventory.map((ei) => {
                if (!ei || typeof ei !== "object") return ei;
                const id = typeof ei.instanceId === "string" ? ei.instanceId : "";
                if (id && !eierGesehen.has(id)) { eierGesehen.add(id); return ei; }
                const neu = randomUUID();
                eierGesehen.add(neu);
                veraendert = true;
                eier++;
                return { ...ei, instanceId: neu };
            });
        }

        state[MARKE] = true;
        staende++;
        if (!veraendert) continue;
        state.stateVersion = (Number(state.stateVersion) || 0) + 1;
        state.serverAenderungAb = state.stateVersion;
    }

    if (tiere > 0 || eier > 0) console.log(`[Garden] Tier-Kennungen: ${tiere} Tiere, ${eier} Eier.`);
    if (staende > 0) scheduleFarmsSave?.(farmStates);
    return { staende, tiere, eier };
}

module.exports = { runTierKennungMigration, MARKE };
