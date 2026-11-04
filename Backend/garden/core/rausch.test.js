// Tests für den Ernte-Rausch (core/rausch.js). Ausführen: npm run test:garden
const test = require("node:test");
const assert = require("node:assert/strict");
const rausch = require("./rausch");

const MIN = 60 * 1000;

test("erste Ernte startet ohne Bonus", () => {
    const st = {};
    assert.equal(rausch.ernten(st, 1e12), 1);
    assert.equal(rausch.anzeige(st, 1e12).prozent, 0);
});

test("zehn Minuten regelmäßig ernten ergibt +15 %, mehr nicht", () => {
    const st = {};
    let t = 1e12;
    rausch.ernten(st, t);
    for (let i = 0; i < 20; i++) { t += 30 * 1000; rausch.ernten(st, t); }
    assert.equal(rausch.ernten(st, t), 1.15);
    for (let i = 0; i < 20; i++) { t += 30 * 1000; rausch.ernten(st, t); }
    assert.equal(rausch.ernten(st, t), 1.15, "Deckel bei +15 %");
});

test("Lücke über der Schonzeit baut ab, Lücke darunter nicht", () => {
    const st = {};
    let t = 1e12;
    rausch.ernten(st, t);
    for (let i = 0; i < 20; i++) { t += 30 * 1000; rausch.ernten(st, t); }
    // 59 s Pause: zählt noch als aktiv
    assert.equal(rausch.anzeige(st, t + 59 * 1000).prozent, 15);
    // 6 Minuten Pause: 5 Minuten über der Schonzeit → halber Rausch
    assert.equal(rausch.faktorAus(rausch.anzeige(st, t + 6 * MIN).aktivMs), 1.075);
    // lange weg: zurück auf null, nie darunter
    assert.equal(rausch.anzeige(st, t + 60 * MIN).prozent, 0);
});

test("mehrere Zellen im selben Moment verlängern nichts", () => {
    const st = {};
    rausch.ernten(st, 1e12);
    rausch.ernten(st, 1e12 + 30 * 1000);
    const vorher = st.ernteRausch.aktivMs;
    for (let i = 0; i < 50; i++) rausch.ernten(st, 1e12 + 30 * 1000);
    assert.equal(st.ernteRausch.aktivMs, vorher);
});

test("gespeicherter Faktor eines Stücks ist gedeckelt", () => {
    assert.equal(rausch.vonStueck({ rausch: 9 }), 1.15);
    assert.equal(rausch.vonStueck({ rausch: 0.2 }), 1);
    assert.equal(rausch.vonStueck({}), 1);
    assert.equal(rausch.vonStueck({ rausch: "x" }), 1);
});
