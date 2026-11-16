// npm test -- leistung — Leistungsmessung: Tagessummen, p75, Spiele, Geräteklassen, HTTP-Wege. Nur Temp-Ordner.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

const { createLeistungStore, p75, FAECHER } = require("../leistungStore");
const { createLeistungsMessung, geraeteklasse, gueltigerAbschnitt } = require("../index");

const neuerStore = (opt = {}) => createLeistungStore({ datei: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "leistung-test-")), "leistung.db"), ...opt });
const leise = { log() {}, warn() {}, error() {} };

const HANDY = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

test("p75 aus den Fächern: Obergrenze des Fachs mit dem 75-%-Punkt", () => {
  // Fächer LCP: ≤1000, ≤1500, ≤2000, ≤2500, … — vier Werte: 900, 1400, 2200, 5200
  const f = new Array(FAECHER.lcp.length + 1).fill(0);
  f[0] = 1; f[1] = 1; f[3] = 1; f[7] = 1;
  assert.deepEqual(p75(FAECHER.lcp, f), { wert: 2500, offen: false });
  const offen = new Array(FAECHER.lcp.length + 1).fill(0);
  offen[FAECHER.lcp.length] = 3;
  assert.deepEqual(p75(FAECHER.lcp, offen), { wert: 10000, offen: true });
  assert.equal(p75(FAECHER.lcp, new Array(FAECHER.lcp.length + 1).fill(0)), null);
});

test("Seiten: Bewertung nach Googles Schwellen, unplausible Werte fallen heraus, Filter nach Gerät", () => {
  const store = neuerStore();
  try {
    for (const lcp of [900, 1400, 2200, 5200]) store.erfasseSeite({ seite: "/fun", geraet: "PC", werte: { lcp, cls: 0.02 } });
    store.erfasseSeite({ seite: "/fun", geraet: "Handy", werte: { lcp: 6000, inp: 650 } });
    assert.equal(store.erfasseSeite({ seite: "/fun", geraet: "PC", werte: { lcp: 99999, inp: -1, cls: "viel", fremd: 3 } }), 0);

    const pc = store.auswertung({ geraet: "PC" }).seiten[0];
    assert.equal(pc.seite, "/fun");
    assert.equal(pc.metriken.lcp.n, 4);
    assert.equal(pc.metriken.lcp.p75, 2500);
    assert.equal(pc.metriken.lcp.bewertung, "gut");
    assert.deepEqual(pc.metriken.lcp.anteile, { gut: 0.75, mittel: 0, schlecht: 0.25 });
    assert.equal(pc.metriken.cls.p75, 0.05);
    assert.equal(pc.metriken.inp, undefined);

    const alle = store.auswertung({ geraet: "alle" }).seiten[0];
    assert.equal(alle.metriken.lcp.n, 5);
    assert.equal(alle.metriken.inp.bewertung, "schlecht");
    assert.equal(store.auswertung({ geraet: "PC schwach" }).seiten.length, 0);
  } finally {
    store.close();
  }
});

test("Spiele: Bildrate, lange Bilder und Sparmodus-Anteil über alle Abschnitte", () => {
  const store = neuerStore();
  try {
    store.erfasseSpiel({ seite: "/adventures", geraet: "Handy", sparmodus: false, ms: 60000, bilder: 3600, ueber33: 120, ueber50: 30 });
    store.erfasseSpiel({ seite: "/adventures", geraet: "Handy", sparmodus: true, ms: 30000, bilder: 600, ueber33: 300, ueber50: 90 });
    const s = store.auswertung().spiele[0];
    assert.equal(s.seite, "/adventures");
    assert.equal(s.abschnitte, 2);
    assert.equal(s.minuten, 1.5);
    assert.equal(Math.round(s.fps * 10) / 10, 46.7);
    assert.equal(s.anteil33, 420 / 4200);
    assert.equal(s.anteil50, 120 / 4200);
    assert.equal(Math.round(s.sparmodus * 1000) / 1000, 0.333);
    // 60 fps → Fach „≥ 58“, 20 fps → Fach „15–25“
    assert.deepEqual(s.fpsFaecher, [0, 1, 0, 0, 0, 1]);
  } finally {
    store.close();
  }
});

test("Geräteklassen und Prüfung der Spiel-Abschnitte", () => {
  assert.equal(geraeteklasse(HANDY, 8), "Handy");
  assert.equal(geraeteklasse(PC, 4), "PC schwach");
  assert.equal(geraeteklasse(PC, 8), "PC");
  assert.equal(geraeteklasse(PC, undefined), "PC");
  assert.deepEqual(gueltigerAbschnitt({ ms: 10000, bilder: 600, ueber33: 10, ueber50: 2 }), { ms: 10000, bilder: 600, ueber33: 10, ueber50: 2 });
  assert.equal(gueltigerAbschnitt({ ms: 1000, bilder: 60, ueber33: 0, ueber50: 0 }), null, "zu kurz");
  assert.equal(gueltigerAbschnitt({ ms: 10000, bilder: 6000, ueber33: 0, ueber50: 0 }), null, "600 fps");
  assert.equal(gueltigerAbschnitt({ ms: 10000, bilder: 600, ueber33: 5, ueber50: 9 }), null, "mehr Ruckler als lange Bilder");
  assert.equal(gueltigerAbschnitt({ ms: "x", bilder: 600, ueber33: 0, ueber50: 0 }), null);
});

async function mitServer(fn) {
  const store = neuerStore();
  const messung = createLeistungsMessung({ store, log: leise });
  const app = express();
  app.use(express.json());
  const nutzer = (req) => req.headers["x-test-nutzer"];
  const optionalAuth = (req, res, next) => { req.twitchId = nutzer(req); next(); };
  const requireAuth = (req, res, next) => ((req.twitchId = nutzer(req)) ? next() : res.status(401).json({ error: "Nicht eingeloggt" }));
  app.use("/api/leistung", messung.router({ optionalAuth, requireAuth, istBetreiber: (req) => req.twitchId === "betreiber" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const basis = `http://127.0.0.1:${server.address().port}/api/leistung`;
  try {
    await fn({ basis, store });
  } finally {
    server.close();
    store.close();
  }
}

const posten = (url, body, kopf = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": PC, ...kopf }, body: JSON.stringify(body) });

test("HTTP: echte Besuche zählen; Bots, Betreiber, Overlays und Unsinn nicht; Auswertung nur für den Betreiber", async () => {
  await mitServer(async ({ basis, store }) => {
    assert.equal((await posten(basis, { art: "seite", seite: "/fun", werte: { lcp: 1200 }, kerne: 8 })).status, 204);
    await posten(basis, { art: "seite", seite: "/fun", werte: { lcp: 1200 } }, { "User-Agent": HANDY });
    await posten(basis, { art: "seite", seite: "/fun", werte: { lcp: 1200 } }, { "User-Agent": "Mozilla/5.0 HeadlessChrome/131" });
    await posten(basis, { art: "seite", seite: "/fun", werte: { lcp: 1200 } }, { "x-test-nutzer": "betreiber" });
    await posten(basis, { art: "seite", seite: "/twitch-tools/overlay/geheim", werte: { lcp: 1200 } });
    await posten(basis, { art: "spiel", seite: "/adventures", ms: 20000, bilder: 1200, ueber33: 12, ueber50: 3, sparmodus: true, kerne: 4 });
    await posten(basis, { art: "spiel", seite: "/adventures", ms: 1000, bilder: 60, ueber33: 0, ueber50: 0 });
    await posten(basis, { art: "unsinn", seite: "/fun" });
    await posten(basis, ["liste"]);

    const a = store.auswertung();
    assert.equal(a.seiten.length, 1);
    assert.equal(a.seiten[0].metriken.lcp.n, 2, "PC + Handy; Bot, Betreiber und Overlay nicht");
    assert.equal(a.spiele.length, 1);
    assert.equal(a.spiele[0].abschnitte, 1);
    assert.equal(a.spiele[0].sparmodus, 1);
    assert.equal(store.auswertung({ geraet: "PC schwach" }).spiele.length, 1);

    assert.equal((await fetch(`${basis}/auswertung`)).status, 401);
    assert.equal((await fetch(`${basis}/auswertung`, { headers: { "x-test-nutzer": "jemand" } })).status, 403);
    const antwort = await (await fetch(`${basis}/auswertung?tage=7&geraet=Handy`, { headers: { "x-test-nutzer": "betreiber" } })).json();
    assert.equal(antwort.tage, 7);
    assert.equal(antwort.geraet, "Handy");
    assert.equal(antwort.seiten[0].metriken.lcp.n, 1);
  });
});
