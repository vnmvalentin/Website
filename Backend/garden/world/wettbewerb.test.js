// Tests für den Wochenwettbewerb (world/wettbewerb.js). Ausführen: npm run test:garden
const test = require("node:test");
const assert = require("node:assert/strict");
const wb = require("./wettbewerb");

const T = Date.UTC(2026, 10, 4, 12); // Mittwoch der Woche ab 2.11.2026
const W = wb.wocheVon(T).index;
const SORTE = wb.sorteVon(W);
const ANDERE = wb.KANDIDATEN.find((s) => s !== SORTE);
const spieler = (login, xp = 0) => ({ twitchLogin: login, xp, gold: 0, goldGesamt: 0 });
const stueck = (seedId, groesse) => ({ seedId, groesse });

test("Woche läuft Montag bis Montag, jede Woche eine andere Sorte", () => {
    const w = wb.wocheVon(T);
    assert.equal(new Date(w.beginn).getUTCDay(), 1);
    assert.equal(w.ende - w.beginn, wb.WOCHE_MS);
    const folge = Array.from({ length: wb.KANDIDATEN.length }, (_, i) => wb.sorteVon(W + i));
    assert.equal(new Set(folge).size, wb.KANDIDATEN.length, "keine Wiederholung innerhalb eines Durchlaufs");
});

test("nur die Sorte der Woche zählt, nur größere Stücke ersetzen den Rekord", () => {
    const st = spieler("a");
    assert.equal(wb.melde(st, [stueck(ANDERE, 50)], T), null);
    assert.deepEqual(wb.melde(st, [stueck(SORTE, 20)], T), { groesse: 20, sorte: SORTE });
    assert.equal(wb.melde(st, [stueck(SORTE, 15)], T + 1), null);
    assert.equal(wb.melde(st, [stueck(SORTE, 20)], T + 2), null, "gleich groß ist kein neuer Rekord");
    assert.equal(wb.melde(st, [stueck(SORTE, 33)], T + 3).groesse, 33);
    assert.equal(st.wettbewerb[W].groesse, 33);
});

test("Rangliste: größer zuerst, bei Gleichstand wer früher geerntet hat", () => {
    const states = new Map([["1", spieler("eins")], ["2", spieler("zwei")], ["3", spieler("drei")]]);
    wb.melde(states.get("2"), [stueck(SORTE, 40)], T + 10);
    wb.melde(states.get("1"), [stueck(SORTE, 40)], T + 5);
    wb.melde(states.get("3"), [stueck(SORTE, 41)], T + 20);
    assert.deepEqual(wb.rangliste(states, W).map((e) => e.name), ["drei", "eins", "zwei"]);
});

test("Abrechnung nach Wochenende: Platz 1–3 bekommen Gold, genau einmal; Platz 4 nichts", () => {
    const states = new Map(["a", "b", "c", "d"].map((n) => [n, spieler(n)]));
    ["a", "b", "c", "d"].forEach((n, i) => wb.melde(states.get(n), [stueck(SORTE, 40 - i)], T + i));
    const naechsteWoche = T + wb.WOCHE_MS;
    const a = wb.abrechnen(states, states.get("a"), "a", naechsteWoche);
    assert.equal(a.length, 1);
    assert.equal(a[0].platz, 1);
    assert.equal(states.get("a").gold, wb.preisFuer(states.get("a"), 1));
    assert.equal(states.get("a").wettbewerbSiege.length, 1);
    assert.equal(wb.abrechnen(states, states.get("a"), "a", naechsteWoche + 1000).length, 0, "nicht doppelt");
    assert.equal(wb.abrechnen(states, states.get("c"), "c", naechsteWoche)[0].platz, 3);
    assert.equal(wb.abrechnen(states, states.get("d"), "d", naechsteWoche).length, 0);
    assert.equal(states.get("d").gold, 0);
});

test("wer erst Wochen später zurückkommt, wird trotzdem abgerechnet", () => {
    const states = new Map([["a", spieler("a")]]);
    wb.melde(states.get("a"), [stueck(SORTE, 12)], T);
    const r = wb.abrechnen(states, states.get("a"), "a", T + 3 * wb.WOCHE_MS);
    assert.equal(r.length, 1);
    assert.equal(r[0].woche, W);
});

test("laufende Woche wird nicht vorzeitig abgerechnet", () => {
    const states = new Map([["a", spieler("a")]]);
    wb.melde(states.get("a"), [stueck(SORTE, 12)], T);
    assert.equal(wb.abrechnen(states, states.get("a"), "a", T + 1000).length, 0);
    assert.equal(states.get("a").gold, 0);
});
