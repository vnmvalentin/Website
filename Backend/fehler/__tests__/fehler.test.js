// npm test -- fehler — Fehlerprotokoll: Signatur, Schwärzen, Speicher, Benachrichtigung, HTTP-Wege. Nur Temp-Ordner.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

const { schwaerze, ersterRahmen, signaturVon, seiteVon, istBot, browserVon, geraetVon } = require("../signatur");
const { createFehlerStore } = require("../fehlerStore");
const { createFehlerProtokoll, createBenachrichtiger } = require("../index");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fehler-test-"));
const leise = { log() {}, warn() {}, error() {} };
const neuerStore = (opt = {}) => createFehlerStore({ datei: path.join(tmp(), "fehler.db"), ...opt });

const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const CHROME_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// --- Signatur und Schwärzen ----------------------------------------------------------------------------------------

test("dasselbe Fehlerbild über zwei Deploys: anderer Chunk-Hash, andere Zeilen und Zahlen ergeben dieselbe Signatur", () => {
  const a = { quelle: "browser", art: "error", nachricht: "Cannot read properties of undefined (reading 'x') in Runde 1234", stapel: "TypeError: x\n    at Ce (https://vnmvalentin.de/assets/GameContainer-a1B2c3D4.js:1:2345)" };
  const b = { quelle: "browser", art: "error", nachricht: "Cannot read properties of undefined (reading 'x') in Runde 5678", stapel: "TypeError: x\n    at xe (https://vnmvalentin.de/assets/GameContainer-Zz9Yy8Xx.js:3:999)" };
  assert.equal(signaturVon(a), signaturVon(b));
  assert.notEqual(signaturVon(a), signaturVon({ ...a, nachricht: "ganz anderer Fehler" }));
  assert.notEqual(signaturVon(a), signaturVon({ ...a, stapel: "at f (https://vnmvalentin.de/assets/Worldflip-a1B2c3D4.js:1:2)" }));
});

test("erster Stack-Rahmen in Chrome-, Firefox- und Node-Form", () => {
  assert.equal(ersterRahmen("Error: x\n    at Ce (https://vnmvalentin.de/assets/GameContainer-a1B2c3D4.js:1:2345)"), "GameContainer.js");
  assert.equal(ersterRahmen("fn@https://vnmvalentin.de/assets/LightsOut-Qw3rTy12.js:1:20\n"), "LightsOut.js");
  assert.equal(ersterRahmen("Error: x\n    at Object.<anonymous> (C:\\Projekt\\Backend\\fehler\\index.js:10:5)"), "index.js");
  assert.equal(ersterRahmen("Error: x\n    at /srv/admin-api/lib/bremse.js:22:9"), "bremse.js");
  assert.equal(ersterRahmen(""), "");
});

test("Schwärzen: zufällige Schlüssel und Query-Teile verschwinden, normale Bezeichner bleiben", () => {
  const roh = "Fetch /api/winchallenge/control/aB3dE5fG7hJ9kL2mN4 fehlgeschlagen (https://x.de/p?token=geheim123) in renderWithHooksAgain";
  const s = schwaerze(roh, 500);
  assert.ok(!s.includes("aB3dE5fG7hJ9kL2mN4"));
  assert.ok(!s.includes("geheim123"));
  assert.ok(s.includes("renderWithHooksAgain"));
  assert.ok(s.includes("https://x.de/p"));
});

test("Seiten ohne Schlüssel — Overlays und Steuer-Links bleiben erkennbar", () => {
  assert.equal(seiteVon("/WinChallengeOverlay/aB3dE5fG7hJ9kL2mN4"), "/WinChallengeOverlay/*");
  assert.equal(seiteVon("/clash-royale/win-tracker/overlay/aB3dE5fG7hJ9kL2mN4?x=1"), "/clash-royale/win-tracker/overlay/*");
  assert.equal(seiteVon("/WinChallengeControl/aB3dE5fG7hJ9kL2mN4"), "/WinChallengeControl/*");
  assert.equal(seiteVon("/admin"), "/admin");
  assert.equal(seiteVon("/"), "/");
  for (const s of [seiteVon("/connect4/ABCDE"), seiteVon("/seed-runners/levels/SR-ABC-DEF")]) {
    assert.ok(!/ABCDE|SR-ABC-DEF/.test(s), `Code steht noch drin: ${s}`);
  }
});

test("Browser, Gerät und Bots aus dem User-Agent", () => {
  assert.equal(browserVon(CHROME_ANDROID), "Chrome 120");
  assert.equal(geraetVon(CHROME_ANDROID), "Handy/Tablet");
  assert.equal(geraetVon(CHROME_DESKTOP), "Desktop");
  assert.equal(browserVon(`${CHROME_ANDROID} musical_ly_33.1.0`), "TikTok-App");
  assert.equal(browserVon(`${CHROME_DESKTOP} OBS/31.0.0`), "OBS 31");
  assert.equal(istBot("Mozilla/5.0 HeadlessChrome/131.0.0.0"), true);
  assert.equal(istBot(`${CHROME_DESKTOP} OBS/31.0.0`), false, "OBS zählt im Fehlerprotokoll mit");
});

// --- Speicher ------------------------------------------------------------------------------------------------------

test("Speicher: neu, wiederholt, Rückfall nach erledigt, stumm zählt still", () => {
  const uhr = { t: Date.UTC(2026, 10, 16, 12) };
  const store = neuerStore({ now: () => uhr.t });
  try {
    const m = { quelle: "browser", art: "error", nachricht: "kaputt", stapel: "", seite: "/fun", browser: "Chrome 131", geraet: "Desktop" };
    const erst = store.melde(m);
    assert.equal(erst.neu, true);
    uhr.t += 1000;
    const zweit = store.melde({ ...m, seite: "/clash" });
    assert.equal(zweit.neu, false);
    assert.equal(zweit.wieder, false);
    const d = store.details(erst.signatur);
    assert.equal(d.anzahl, 2);
    assert.equal(d.seite, "/clash");
    assert.deepEqual(d.beispiele.map((b) => b.seite), ["/clash", "/fun"], "neueste zuerst");

    assert.equal(store.setzeStatus(erst.signatur, "erledigt"), true);
    assert.deepEqual(store.zaehler(), { offen: 0, erledigt: 1, stumm: 0 });
    const rueckfall = store.melde(m);
    assert.equal(rueckfall.wieder, true);
    assert.equal(store.details(erst.signatur).status, "offen");

    store.setzeStatus(erst.signatur, "stumm");
    assert.equal(store.melde(m).stumm, true);
    assert.equal(store.liste({ status: "stumm" })[0].anzahl, 4);
    assert.equal(store.liste({ status: "stumm" })[0].woche, 4);
    assert.equal(store.setzeStatus(erst.signatur, "unsinn"), false);
  } finally {
    store.close();
  }
});

test("Speicher: höchstens zehn Beispiele, Deckel für neue Fehlerbilder", () => {
  const store = neuerStore({ maxBilder: 2 });
  try {
    const m = { quelle: "browser", art: "error", nachricht: "eins", seite: "/" };
    for (let i = 0; i < 15; i++) store.melde(m);
    assert.equal(store.details(store.melde(m).signatur).beispiele.length, 10);
    assert.equal(store.melde({ ...m, nachricht: "zwei" }).neu, true);
    assert.equal(store.melde({ ...m, nachricht: "drei" }).verworfen, true);
    assert.equal(store.liste().length, 2);
  } finally {
    store.close();
  }
});

// --- Benachrichtigung ----------------------------------------------------------------------------------------------

test("Benachrichtigung nur bei neu oder Rückfall, nie bei stumm, höchstens N je Stunde", async () => {
  const gesendet = [];
  const uhr = { t: 0 };
  const melde = createBenachrichtiger({ sende: async (t) => gesendet.push(t), log: leise, now: () => uhr.t, maxJeStunde: 2 });
  const bild = { quelle: "browser", art: "error", nachricht: "kaputt", seite: "/fun", browser: "Chrome 131", geraet: "Desktop" };
  melde({ ...bild, neu: true });
  melde({ ...bild, neu: false, wieder: false });
  melde({ ...bild, neu: true, stumm: true });
  melde({ ...bild, wieder: true });
  melde({ ...bild, neu: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(gesendet.length, 2);
  assert.match(gesendet[0], /^Neues Fehlerbild \(Browser, error\): kaputt\nSeite: \/fun · Chrome 131 · Desktop$/);
  assert.match(gesendet[1], /^Fehlerbild wieder aufgetreten/);
  uhr.t += 61 * 60 * 1000;
  melde({ ...bild, neu: true });
  await new Promise((r) => setImmediate(r));
  assert.equal(gesendet.length, 3, "nach einer Stunde wieder frei");
});

// --- HTTP-Wege -----------------------------------------------------------------------------------------------------

async function mitServer(fn) {
  const store = neuerStore();
  const gemeldet = [];
  const protokoll = createFehlerProtokoll({ store, log: leise, benachrichtige: (b) => gemeldet.push(b) });
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    req.twitchId = req.headers["x-test-nutzer"];
    return req.twitchId ? next() : res.status(401).json({ error: "Nicht eingeloggt" });
  };
  app.use("/api/fehler", protokoll.router({ requireAuth, istBetreiber: (req) => req.twitchId === "betreiber" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const basis = `http://127.0.0.1:${server.address().port}/api/fehler`;
  try {
    await fn({ basis, store, protokoll, gemeldet });
  } finally {
    server.close();
    store.close();
  }
}

const posten = (url, body, kopf = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": CHROME_DESKTOP, ...kopf }, body: JSON.stringify(body) });

test("HTTP: Browser-Meldung wird gespeichert, Bots nicht, Unsinn abgewiesen; Liste nur für den Betreiber", async () => {
  await mitServer(async ({ basis, store, gemeldet }) => {
    assert.equal((await posten(basis, { art: "error", nachricht: "Probe", stapel: "", seite: "/WinChallengeOverlay/aB3dE5fG7hJ9kL2mN4", obs: true })).status, 204);
    assert.equal((await posten(basis, { nachricht: "vom Bot" }, { "User-Agent": "HeadlessChrome/131" })).status, 204);
    assert.equal((await posten(basis, { nachricht: "" })).status, 400);
    assert.equal((await posten(basis, ["liste"])).status, 400);

    const bilder = store.liste();
    assert.equal(bilder.length, 1);
    assert.equal(bilder[0].seite, "/WinChallengeOverlay/*");
    assert.equal(gemeldet.length, 1);
    assert.equal(gemeldet[0].browser, "OBS · Chrome 131");

    assert.equal((await fetch(`${basis}/liste`)).status, 401);
    assert.equal((await fetch(`${basis}/liste`, { headers: { "x-test-nutzer": "jemand" } })).status, 403);
    const liste = await (await fetch(`${basis}/liste`, { headers: { "x-test-nutzer": "betreiber" } })).json();
    assert.equal(liste.bilder.length, 1);
    const sig = liste.bilder[0].signatur;
    const details = await (await fetch(`${basis}/bild/${sig}`, { headers: { "x-test-nutzer": "betreiber" } })).json();
    assert.equal(details.beispiele[0].browser, "OBS · Chrome 131");
    assert.equal((await posten(`${basis}/bild/${sig}/status`, { status: "unsinn" }, { "x-test-nutzer": "betreiber" })).status, 400);
    assert.equal((await posten(`${basis}/bild/${sig}/status`, { status: "erledigt" }, { "x-test-nutzer": "betreiber" })).status, 200);
    assert.equal((await posten(`${basis}/bild/${sig}/status`, { status: "erledigt" }, { "x-test-nutzer": "jemand" })).status, 403);
    assert.equal(store.zaehler().erledigt, 1);
  });
});

test("meldeServer wirft nie und speichert Server-Fehler", async () => {
  await mitServer(async ({ protokoll, store }) => {
    assert.doesNotThrow(() => protokoll.meldeServer("socket", new Error("im Handler"), "gw:join"));
    assert.doesNotThrow(() => protokoll.meldeServer("unhandledRejection", undefined));
    assert.doesNotThrow(() => protokoll.meldeServer("unhandledRejection", { code: 42 }));
    const bilder = store.liste();
    assert.equal(bilder.length, 3);
    assert.ok(bilder.every((b) => b.quelle === "server"));
  });
});
