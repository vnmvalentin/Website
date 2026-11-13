// Weltkarte „Dorfplatz am Teich“: Deko und Tiere ziehen mit ihrem Grundstück um.
const test = require("node:test");
const assert = require("node:assert/strict");
const { runWeltkarteMigration, MARKE, versatz } = require("./weltkarte");

test("Deko und Tiere werden um den Versatz ihres Grundstücks verschoben", () => {
    const stand = {
        // Ankerkachel (0,3) auf altem Grundstück 0 (links oben bei Kachel 8/8)
        decoPlacements: [{ id: "a", slotIndex: 0, x: 544, y: 736 }, { id: "b", slotIndex: 4, x: 3000, y: 3000 }],
        petPlacements: [{ id: "t", slotIndex: 5, x: 5000, y: 3200 }],
        stateVersion: 7,
    };
    const farms = new Map([["1", stand]]);
    const r = runWeltkarteMigration(farms);
    assert.equal(r.staende, 1);
    assert.equal(r.deko, 2);
    assert.equal(r.tiere, 1);
    // Grundstück 0: alt 8/8, neu 12/22 → +4 / +14 Kacheln
    assert.deepEqual([stand.decoPlacements[0].x, stand.decoPlacements[0].y], [544 + 4 * 64, 736 + 14 * 64]);
    assert.deepEqual(versatz(4), { dx: 16 * 64, dy: 25 * 64 });
    assert.equal(stand.petPlacements[0].x, 5000 + 28 * 64);
    assert.equal(stand[MARKE], true);
    assert.equal(stand.stateVersion, 8);
    assert.equal(stand.serverAenderungAb, 8);
});

test("läuft je Spielstand nur einmal", () => {
    const stand = { decoPlacements: [{ slotIndex: 1, x: 100, y: 100 }] };
    const farms = new Map([["1", stand]]);
    runWeltkarteMigration(farms);
    runWeltkarteMigration(farms);
    assert.equal(stand.decoPlacements[0].x, 100 + 16 * 64);
    assert.equal(stand.decoPlacements[0].y, 100 + 1 * 64);
});

test("unbekannte Grundstücke und kaputte Einträge bleiben unangetastet", () => {
    const stand = { decoPlacements: [{ slotIndex: 9, x: 1, y: 2 }, { slotIndex: 0, x: "?", y: 2 }, null] };
    runWeltkarteMigration(new Map([["1", stand]]));
    assert.deepEqual(stand.decoPlacements[0], { slotIndex: 9, x: 1, y: 2 });
    assert.equal(stand.decoPlacements[1].x, "?");
});
