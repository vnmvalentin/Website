const test = require("node:test");
const assert = require("node:assert/strict");
const { runZaunfeldMigration, MARKE, PREIS } = require("./zaunfeld");

test("entfernt Zaunfelder aus Rucksack und Grundstück und erstattet den Preis", () => {
    const farms = new Map([["1", {
        gold: 100, stateVersion: 5,
        decoInventory: [{ instanceId: "a", id: "zaun_klein" }, { instanceId: "b", id: "steine" }],
        decoPlacements: [{ id: "p1", decoId: "zaun_klein", x: 1, y: 2 }, { id: "p2", image: "/garden-assets/deco/objects/fence_1x1.png" }, { id: "p3", decoId: "pilze" }],
    }]]);
    let gespeichert = 0;
    const r = runZaunfeldMigration(farms, { scheduleFarmsSave: () => { gespeichert++; } });
    const s = farms.get("1");
    assert.deepEqual(r, { staende: 1, stuecke: 3, erstattet: 3 * PREIS });
    assert.equal(s.gold, 100 + 3 * PREIS);
    assert.deepEqual(s.decoInventory.map((d) => d.id), ["steine"]);
    assert.deepEqual(s.decoPlacements.map((d) => d.id), ["p3"]);
    assert.equal(s.stateVersion, 6);
    assert.equal(s.serverAenderungAb, 6);
    assert.equal(s[MARKE], true);
    assert.equal(gespeichert, 1);
});

test("läuft je Spielstand nur einmal und lässt Stände ohne Zaunfeld unverändert", () => {
    const farms = new Map([["1", { gold: 7, stateVersion: 2, decoInventory: [{ id: "zaun_klein" }] }], ["2", { gold: 9, stateVersion: 3, decoInventory: [] }]]);
    runZaunfeldMigration(farms);
    farms.get("1").decoInventory.push({ id: "zaun_klein" }); // tauchte später wieder auf: Marke verhindert zweite Erstattung
    const r = runZaunfeldMigration(farms);
    assert.equal(r.staende, 0);
    assert.equal(farms.get("1").gold, 7 + PREIS);
    assert.equal(farms.get("2").gold, 9);
    assert.equal(farms.get("2").stateVersion, 3);
    assert.equal(farms.get("2")[MARKE], true);
});
