// Tests für die Bestenlisten (world/ranglisten.js). Ausführen: npm run test:garden
const test = require("node:test");
const assert = require("node:assert/strict");
const { ranglisten } = require("./ranglisten");

test("vier Listen, richtig sortiert, ohne leere Einträge", () => {
    const m = new Map([
        ["1", { twitchLogin: "a", gold: 100, logbuch: { x: {}, y: {} }, logbuchBelohnungen: { x: true }, wettbewerbSiege: [{ platz: 2 }], saisonziele: { abgeschlossen: [1, 2] } }],
        ["2", { twitchLogin: "b", gold: 5, prestige: { sterne: 1 }, logbuch: { x: {} }, wettbewerbSiege: [{ platz: 1 }], saisonziele: { abgeschlossen: [1] } }],
        ["3", { twitchLogin: "c", gold: 0 }],
    ]);
    const r = ranglisten(m);
    assert.deepEqual(r.gold.map((e) => e.name), ["b", "a"], "Sterne vor Gold");
    assert.deepEqual(r.logbuch.map((e) => e.name), ["a", "b"]);
    assert.deepEqual(r.wettbewerb.map((e) => [e.name, e.punkte]), [["b", 3], ["a", 2]]);
    assert.deepEqual(r.saison.map((e) => [e.name, e.anzahl]), [["a", 2], ["b", 1]]);
});
