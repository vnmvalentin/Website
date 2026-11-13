// garden/world/zweitkonto.test.js
// Anschluss-Regel der Post: echte gemeinsame Adresse sperrt, die Adresse des Servers nie.
const test = require("node:test");
const assert = require("node:assert");
const zweitkonto = require("./zweitkonto");

function anfrage({ weiter, remote = "127.0.0.1", geraet } = {}) {
    const headers = {};
    if (weiter) headers["x-forwarded-for"] = weiter;
    if (geraet) headers["x-vf-geraet"] = geraet;
    return { headers, socket: { remoteAddress: remote } };
}

test("ohne durchgereichte Adresse (nur 127.0.0.1) gilt niemand als gleicher Anschluss", () => {
    const a = {};
    const b = {};
    const farmen = new Map([["1", a], ["2", b]]);
    zweitkonto.pruefeUndMerke(farmen, "1", a, anfrage({ geraet: "geraet-aaaaaaaaaaaaaaaa" }));
    zweitkonto.pruefeUndMerke(farmen, "2", b, anfrage({ geraet: "geraet-bbbbbbbbbbbbbbbb", remote: "::ffff:127.0.0.1" }));
    assert.strictEqual(zweitkonto.verknuepft(a, b), false);
    assert.deepStrictEqual(Object.keys(a.kennzeichen?.ips || {}), []);
});

test("schon gespeicherte Server-Adresse verknüpft nicht und wird entfernt", () => {
    const jetzt = Date.now();
    const lokal = zweitkonto._pruefsumme("ip", "127.0.0.1");
    const a = { kennzeichen: { geraete: {}, ips: { [lokal]: jetzt } } };
    const b = { kennzeichen: { geraete: {}, ips: { [lokal]: jetzt } } };
    assert.strictEqual(zweitkonto.verknuepft(a, b), false);
    zweitkonto.pruefeUndMerke(new Map([["1", a]]), "1", a, anfrage({ weiter: "203.0.113.7" }));
    assert.strictEqual(lokal in a.kennzeichen.ips, false);
    assert.strictEqual(Object.keys(a.kennzeichen.ips).length, 1);
});

test("dieselbe echte Adresse verknüpft, verschiedene nicht", () => {
    const a = {};
    const b = {};
    const c = {};
    const farmen = new Map([["1", a], ["2", b], ["3", c]]);
    // nginx hängt die echte Adresse hinten an — ein vom Browser mitgeschickter Wert davor zählt nicht
    zweitkonto.pruefeUndMerke(farmen, "1", a, anfrage({ weiter: "203.0.113.7" }));
    zweitkonto.pruefeUndMerke(farmen, "2", b, anfrage({ weiter: "198.51.100.1, 203.0.113.7" }));
    zweitkonto.pruefeUndMerke(farmen, "3", c, anfrage({ weiter: "203.0.113.7, 198.51.100.9" }));
    assert.strictEqual(zweitkonto.verknuepft(a, b), true);
    assert.strictEqual(zweitkonto.verknuepft(a, c), false);
});

test("private Netze zählen nicht als Anschluss", () => {
    for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "10.0.0.5", "192.168.1.20", "172.16.4.1", "fd00::1"]) {
        assert.strictEqual(zweitkonto._istLokal(ip), true, ip);
    }
    for (const ip of ["203.0.113.7", "172.32.0.1", "2a02:8108::1"]) assert.strictEqual(zweitkonto._istLokal(ip), false, ip);
});
