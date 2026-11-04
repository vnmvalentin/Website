// Zuchtbuch: eine gelungene Kreuzung trägt sich in state.zuchtbuch ein (core/economy.js
// harvestCell). Ausführen: npm run test:garden
const test = require("node:test");
const assert = require("node:assert/strict");
const { harvestCell } = require("./economy");

function farm() {
    const lange = 1e12 - 30 * 864e5;
    return {
        gold: 0, goldGesamt: 0, inventory: [], harvestedItems: [], inventoryMaxSlots: 200,
        plotPlants: {
            // Kartoffel (Einmalernte, reif) neben Tomate → Rezept Tomoffel (core/kreuzung.js)
            "0_0": { instanceId: "k1", seedId: "kartoffel", singleUse: true, plantedAt: lange, growthMs: 1000, norm: 0.5, stage: "growing" },
            "1_0": { instanceId: "t1", seedId: "tomate", singleUse: false, plantedAt: lange, stage: "fruiting", fruitSlots: [] },
        },
    };
}

test("gelungene Kreuzung trägt sich ins Zuchtbuch ein — einmal, mit dem ersten Zeitpunkt", () => {
    const original = Math.random;
    Math.random = () => 0; // jede Chance gelingt
    try {
        const st = farm();
        const r = harvestCell(st, "0_0", 1e12);
        assert.equal(r.ok, true);
        assert.equal(r.kreuzung?.seedId, "tomoffel");
        assert.equal(st.zuchtbuch?.tomoffel, 1e12);
        // zweite Kreuzung derselben Sorte überschreibt den Zeitpunkt nicht
        const st2 = farm();
        st2.zuchtbuch = { tomoffel: 5 };
        harvestCell(st2, "0_0", 1e12);
        assert.equal(st2.zuchtbuch.tomoffel, 5);
    } finally {
        Math.random = original;
    }
});

test("ohne Kreuzung kein Eintrag", () => {
    const original = Math.random;
    Math.random = () => 0.99; // keine Chance gelingt
    try {
        const st = farm();
        const r = harvestCell(st, "0_0", 1e12);
        assert.equal(r.ok, true);
        assert.equal(r.kreuzung, null);
        assert.equal(st.zuchtbuch, undefined);
    } finally {
        Math.random = original;
    }
});
