// Tests für die Saisonziele (core/saisonziele.js). Ausführen: npm run test:garden
const test = require("node:test");
const assert = require("node:assert/strict");
const sz = require("./saisonziele");
const { saisonStand } = require("./tageszeit");
const { reskinKaufen } = require("./reskins");

// Eine Zeit in jeder Saison finden (Saisons wechseln wöchentlich).
const WOCHE = 7 * 24 * 60 * 60 * 1000;
const zeitFuer = (id) => {
    for (let t = Date.UTC(2026, 10, 2, 12); ; t += WOCHE) if (saisonStand(t).id === id) return t;
};

function schaffeAlles(state, saison, now) {
    let ergebnis = null;
    for (const z of sz.ZIELE[saison]) ergebnis = sz.melde(state, z.typ, z.ziel, now) || ergebnis;
    return ergebnis;
}

test("alle vier Ziele → Namensschild der Saison, genau einmal", () => {
    const st = { gold: 0 };
    const t = zeitFuer("herbst");
    const r = schaffeAlles(st, "herbst", t);
    assert.equal(r.belohnung, "laubgold");
    assert.equal(r.neu, true);
    assert.ok(st.reskins.gekauft.nameplate.includes("laubgold"));
    assert.equal(sz.melde(st, sz.TYP.STOERER, 5, t + 1000), null, "fertig zählt nicht nochmal");
    assert.equal(sz.uebersicht(st, t).fertig, true);
});

test("neue Saisonwoche beginnt bei null, Belohnung bleibt", () => {
    const st = { gold: 0 };
    const t = zeitFuer("herbst");
    schaffeAlles(st, "herbst", t);
    const naechste = t + WOCHE;
    const u = sz.uebersicht(st, naechste);
    assert.equal(u.fertig, false);
    assert.ok(u.ziele.every((z) => z.stand === 0));
    assert.equal(u.sammlung.find((s) => s.id === "laubgold").frei, true);
    // Ein Jahr später: wieder geschafft, aber nicht doppelt freigeschaltet.
    const r = schaffeAlles(st, "herbst", t + 4 * WOCHE);
    assert.equal(r.neu, false);
    assert.equal(st.saisonziele.abgeschlossen.length, 2);
});

test("Ernte zählt Saisonsorten, Riesen, Sonderformen und Rausch", () => {
    const st = {};
    const t = zeitFuer("sommer");
    sz.meldeErnte(st, [
        { seedId: "tomate", groesse: 96.2, rausch: 1.15 },
        { seedId: "karotte", groesse: 40, specialData: { name: "Golden" } },
    ], t);
    const f = st.saisonziele.fortschritt;
    assert.equal(f.saisonErnte, 1);
    assert.equal(f.riese, 1);
    assert.equal(f.rausch, 1);
    assert.equal(f.sonderform, undefined, "Sonderform ist kein Sommerziel");
});

test("Saison-Namensschilder sind nicht käuflich", () => {
    const st = { gold: 1e15 };
    assert.equal(reskinKaufen(st, "nameplate", "raureif").ok, false);
    assert.equal(st.gold, 1e15);
});

test("alle vier Jahreszeiten-Schilder → Jahreskreis", () => {
    const st = {};
    let letztes = null;
    for (const s of ["fruehling", "sommer", "herbst", "winter"]) letztes = schaffeAlles(st, s, zeitFuer(s));
    assert.equal(letztes.jahreskreis, true);
    assert.ok(st.reskins.gekauft.nameplate.includes("jahreskreis"));
});
