// npm test -- lib — Anfragen-Bremse (lib/bremse.js) und Besucher-Adresse (lib/clientIp.js)
const test = require("node:test");
const assert = require("node:assert/strict");

const { createBremse, bremseMiddleware } = require("../bremse");
const { clientIp, istLokal } = require("../clientIp");

const anfrage = (xff, remote = "127.0.0.1") => ({ headers: xff ? { "x-forwarded-for": xff } : {}, socket: { remoteAddress: remote } });

function antwort() {
  const res = { status: 200, kopf: {}, body: null };
  res.set = (k, v) => { res.kopf[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test("Besucher-Adresse: der letzte X-Forwarded-For-Eintrag (von nginx) zählt, vorgeschobene davor nicht", () => {
  assert.equal(clientIp(anfrage("6.6.6.6, 1.2.3.4")), "1.2.3.4");
  assert.equal(clientIp(anfrage("1.2.3.4")), "1.2.3.4");
  assert.equal(clientIp(anfrage(null, "9.9.9.9")), "9.9.9.9");
  assert.equal(istLokal(anfrage(null, "127.0.0.1")), true);
  assert.equal(istLokal(anfrage(null, "::ffff:127.0.0.1")), true);
  assert.equal(istLokal(anfrage("1.2.3.4", "127.0.0.1")), false, "über nginx ist nie lokal");
  assert.equal(istLokal(anfrage(null, "9.9.9.9")), false);
});

test("Bremse: max Anfragen je Fenster, danach Wartezeit, im neuen Fenster wieder frei", () => {
  const uhr = { t: 0 };
  const b = createBremse({ fensterMs: 1000, max: 3, now: () => uhr.t });
  try {
    assert.deepEqual([b.treffer("a"), b.treffer("a"), b.treffer("a")], [0, 0, 0]);
    uhr.t = 400;
    assert.equal(b.treffer("a"), 600);
    assert.equal(b.treffer("b"), 0, "andere Adresse hat ihr eigenes Kontingent");
    uhr.t = 1000;
    assert.equal(b.treffer("a"), 0);
  } finally {
    b.stopp();
  }
});

test("Middleware: 429 mit Retry-After und Text; lokale Dienste und vorgeschobene Adressen umgehen nichts", () => {
  const uhr = { t: 0 };
  const mw = bremseMiddleware({ fensterMs: 60_000, max: 2, meldung: "Langsam.", now: () => uhr.t });
  try {
    let weiter = 0;
    const next = () => { weiter += 1; };
    mw(anfrage("1.1.1.1, 5.5.5.5"), antwort(), next);
    mw(anfrage("2.2.2.2, 5.5.5.5"), antwort(), next);
    const res = antwort();
    mw(anfrage("3.3.3.3, 5.5.5.5"), res, next);
    assert.equal(weiter, 2);
    assert.equal(res.statusCode, 429);
    assert.equal(res.kopf["Retry-After"], "60");
    assert.deepEqual(res.body, { error: "Langsam." });
    for (let i = 0; i < 10; i++) mw(anfrage(null, "127.0.0.1"), antwort(), next);
    assert.equal(weiter, 12, "Statuswächter & Co. auf demselben Rechner werden nie gebremst");
  } finally {
    mw.bremse.stopp();
  }
});
