// Tests für die feine Fruchtgröße (core/groesse.js). Ausführen: npm run test:garden
const test = require("node:test");
const assert = require("node:assert/strict");
const { wuerfleGroesse, groesseVon } = require("./groesse");

const nie = () => 1;    // Extra-Glück schlägt nie an
const immer = () => 0;  // Extra-Glück schlägt immer an

test("Skala 1,0 bis 99,9 mit einer Nachkommastelle, monoton in norm", () => {
    assert.equal(wuerfleGroesse(0, nie), 1);
    assert.equal(wuerfleGroesse(1, nie), 99.9);
    let vorher = 0;
    for (let n = 0; n <= 1; n += 0.001) {
        const g = wuerfleGroesse(n, nie);
        assert.ok(g >= vorher, `fällt bei norm ${n}`);
        assert.equal(Math.round(g * 10) / 10, g);
        vorher = g;
    }
});

test("glatte 100 nur ganz oben und nur mit Extra-Glück", () => {
    assert.equal(wuerfleGroesse(0.9995, immer), 100);
    assert.equal(wuerfleGroesse(0.9995, nie), 99.9);
    assert.notEqual(wuerfleGroesse(0.99, immer), 100);
});

test("Häufigkeit: 100 etwa 1 von 13.500, ab 99 etwa 1 von 100 (norm = U^1,35 wie beim Ernten)", () => {
    let hundert = 0; let ab99 = 0; const N = 2_000_000;
    for (let i = 0; i < N; i++) {
        const g = wuerfleGroesse(Math.pow(Math.random(), 1.35));
        if (g === 100) hundert++;
        if (g >= 99) ab99++;
    }
    assert.ok(hundert / N < 1 / 8000 && hundert / N > 1 / 25000, `100er-Quote ${N / hundert}`);
    assert.ok(ab99 / N < 1 / 70 && ab99 / N > 1 / 200, `ab-99-Quote ${N / ab99}`);
});

test("alte Stücke ohne feine Größe werden umgerechnet", () => {
    assert.equal(groesseVon({ size: 1 }), 1);
    assert.equal(groesseVon({ size: 50 }), 99.9);
    assert.equal(groesseVon({ size: 50, groesse: 85.8 }), 85.8);
    assert.equal(groesseVon({}), 1);
});
