// Hüte aus dem Laden der Website (core/reskins.js: Einträge mit `laden`, Spur D 18.11.2026): frei mit dem Kauf im Laden,
// weg nach einer Erstattung, nie für Gold. Ausführen: npm test -- garden
const test = require("node:test");
const assert = require("node:assert/strict");
const { RESKIN_KATALOG, gleicheLadenAb, reskinKaufen, reskinAusruesten, reskinUebersicht } = require("./reskins");
const { ARTIKEL } = require("../../laden/katalog");

const LADEN_HUETE = RESKIN_KATALOG.hut.filter((e) => e.laden);

test("Jeder Laden-Hut ist ein Artikel der Farm im Laden-Katalog, ohne Goldpreis", () => {
    assert.ok(LADEN_HUETE.length >= 2);
    for (const e of LADEN_HUETE) {
        const a = ARTIKEL.find((x) => x.id === e.laden);
        assert.ok(a, `${e.laden} fehlt im Laden`);
        assert.equal(a.spiel, "garden");
        assert.equal(e.price, null);
    }
});

test("Für Gold nicht zu haben; frei nach dem Kauf im Laden, dann anlegbar", () => {
    const state = { gold: 1e12 };
    const hut = LADEN_HUETE[0];
    assert.equal(reskinKaufen(state, "hut", hut.id).ok, false);
    assert.equal(state.gold, 1e12, "kein Gold abgebucht");
    assert.equal(reskinAusruesten(state, "hut", hut.id).ok, false, "vor dem Kauf nicht anlegbar");

    assert.equal(gleicheLadenAb(state, (id) => id === hut.laden), true);
    assert.equal(gleicheLadenAb(state, (id) => id === hut.laden), false, "zweimal: nichts Neues");
    assert.equal(reskinAusruesten(state, "hut", hut.id).ok, true);
    const ansicht = reskinUebersicht(state);
    assert.equal(ansicht.katalog.hut.find((e) => e.id === hut.id).gekauft, true);
    assert.equal(ansicht.ausgeruestet.hut, hut.id);
});

test("Erstattet: Hut weg und abgelegt; Laden nicht erreichbar: nichts ändert sich", () => {
    const state = {};
    const hut = LADEN_HUETE[1];
    gleicheLadenAb(state, () => true);
    reskinAusruesten(state, "hut", hut.id);
    assert.equal(gleicheLadenAb(state, () => null), false, "unbekannt: bleibt");
    assert.equal(state.reskins.ausgeruestet.hut, hut.id);
    assert.equal(gleicheLadenAb(state, () => false), true);
    assert.equal(state.reskins.gekauft.hut.includes(hut.id), false);
    assert.equal(state.reskins.ausgeruestet.hut, null);
    // Gold-Hüte bleiben vom Abgleich unberührt
    state.reskins.gekauft.hut.push("muetze");
    gleicheLadenAb(state, () => false);
    assert.ok(state.reskins.gekauft.hut.includes("muetze"));
});
