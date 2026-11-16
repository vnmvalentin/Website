// npm test -- lib — Sitzungs-Speicher (lib/sessionStore.js) und Cookie-Lesen (lib/cookies.js). Nur Temp-Ordner.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createSessionStore } = require("../sessionStore");
const { parseCookieHeader } = require("../cookies");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sitzungen-test-"));
const TAG = 24 * 60 * 60 * 1000;

function neuerStore(ordner, uhr) {
  return createSessionStore({ datei: path.join(ordner, "sessions.db"), now: () => uhr.t });
}

// --- Cookies -------------------------------------------------------------------------------------------------------

test("kaputte Prozentzeichen werfen nicht mehr (früher Absturz des ganzen Backends)", () => {
  assert.doesNotThrow(() => parseCookieHeader("session=%E0%A4%A; x=%"));
  const c = parseCookieHeader("session=%E0%A4%A; x=%");
  assert.equal(c.session, "%E0%A4%A");
  assert.equal(c.x, "%");
});

test("Cookies: normale Werte, Anführungszeichen, erster gewinnt, kein Prototyp", () => {
  const c = parseCookieHeader('a=1; session=ab%20c; b="zitiert"; session=zweiter; __proto__=x; leer=');
  assert.equal(c.a, "1");
  assert.equal(c.session, "ab c");
  assert.equal(c.b, "zitiert");
  assert.equal(c.leer, "");
  assert.equal(Object.getPrototypeOf(c), null);
  assert.equal(c.__proto__, "x");
  assert.deepEqual(parseCookieHeader(undefined), Object.create(null));
  assert.deepEqual(parseCookieHeader(""), Object.create(null));
});

// --- Sitzungen -----------------------------------------------------------------------------------------------------

test("Sitzung anlegen, lesen, abmelden", () => {
  const ordner = tmp();
  const uhr = { t: 1_000_000 };
  const store = neuerStore(ordner, uhr);
  try {
    const id = store.create("123", "valentin");
    assert.match(id, /^[A-Za-z0-9_-]{24}$/);
    assert.deepEqual(store.get(id), { twitchId: "123", twitchLogin: "valentin", kontoId: null, expiresAt: 1_000_000 + 30 * TAG });
    store.remove(id);
    assert.equal(store.get(id), null);
  } finally {
    store.close();
  }
});

test("Prototyp-Namen, falsche Form und fremde IDs gelten nie als angemeldet", () => {
  const ordner = tmp();
  const store = neuerStore(ordner, { t: 1_000_000 });
  try {
    store.create("123", "valentin");
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty", "", undefined, null, 42, {}, "a".repeat(65), "nicht da aber lang genug", "gibtesnichtgibtesnicht"]) {
      assert.equal(store.get(id), null, `als angemeldet gewertet: ${String(id)}`);
    }
  } finally {
    store.close();
  }
});

test("abgelaufene Sitzungen zählen nicht und werden aufgeräumt", () => {
  const ordner = tmp();
  const uhr = { t: 1_000_000 };
  const store = neuerStore(ordner, uhr);
  try {
    const alt = store.create("1", "eins");
    uhr.t += 31 * TAG;
    const neu = store.create("2", "zwei"); // räumt beim Anlegen auf
    assert.equal(store.get(alt), null);
    assert.equal(store.get(neu).twitchId, "2");
    uhr.t += 31 * TAG;
    assert.equal(store.purge(), 1);
  } finally {
    store.close();
  }
});

test("alte sessions.json wird einmal übernommen — nur gültige, nicht abgelaufene Einträge; Discord-Altdaten gehen an den Rückruf", () => {
  const ordner = tmp();
  const uhr = { t: 1_000_000 };
  const json = path.join(ordner, "sessions.json");
  fs.writeFileSync(json, JSON.stringify({
    abcdefghijklmnopqrstuvwx: { twitchId: "123", twitchLogin: "valentin", expiresAt: uhr.t + TAG, discord: { userId: "d1", accessToken: "t" } },
    ABCDEFGHIJKLMNOPQRSTUVWX: { twitchId: "456", twitchLogin: "abgelaufen", expiresAt: uhr.t - 1 },
    constructor: { twitchId: "789", twitchLogin: "boese", expiresAt: uhr.t + TAG },
    kurz: { twitchId: "1", twitchLogin: "x", expiresAt: uhr.t + TAG },
    "ohne-login-aber-lang-genug": { twitchId: "2", expiresAt: uhr.t + TAG },
  }));
  const store = neuerStore(ordner, uhr);
  try {
    let altdaten = null;
    const r = store.importiereJson(json, { beiAltdaten: (alt) => { altdaten = alt; } });
    assert.equal(r.importiert, 1);
    assert.deepEqual(store.get("abcdefghijklmnopqrstuvwx"), { twitchId: "123", twitchLogin: "valentin", kontoId: null, expiresAt: uhr.t + TAG });
    assert.equal(store.get("ABCDEFGHIJKLMNOPQRSTUVWX"), null);
    assert.equal(altdaten.abcdefghijklmnopqrstuvwx.discord.userId, "d1");
    // Zweiter Start: nichts doppelt, die Datei bleibt liegen
    assert.deepEqual(store.importiereJson(json), { importiert: 0, schonErledigt: true });
    assert.ok(fs.existsSync(json));
  } finally {
    store.close();
  }
});

test("Konten: Sitzung ohne Twitch, Konto nachtragen, zusammenführen, Twitch lösen, Konto löschen", () => {
  const ordner = tmp();
  const store = neuerStore(ordner, { t: 1_000_000 });
  try {
    const gast = store.create({ kontoId: "kGAST" });
    assert.deepEqual(store.get(gast), { twitchId: null, twitchLogin: null, kontoId: "kGAST", expiresAt: 1_000_000 + 30 * TAG });
    assert.throws(() => store.create({}), /Konto oder Twitch/);
    assert.throws(() => store.create({ twitchId: "1", kontoId: "k" }), /gehören zusammen/);

    const alt = store.create("123", "valentin"); // Sitzung von vor den Konten
    store.setzeKonto(alt, "kTWITCH");
    assert.equal(store.get(alt).kontoId, "kTWITCH");

    assert.equal(store.ersetzeKonto("kGAST", "kTWITCH"), 1);
    assert.equal(store.get(gast).kontoId, "kTWITCH");
    assert.equal(store.ohneTwitch("kTWITCH"), 2);
    assert.deepEqual([store.get(alt).twitchId, store.get(alt).twitchLogin], [null, null]);
    assert.equal(store.entferneKonto("kTWITCH"), 2);
    assert.equal(store.get(alt), null);
    assert.equal(store.get(gast), null);
  } finally {
    store.close();
  }
});

test("gleitender Ablauf: erst ab der halben Lebensdauer wieder volle 30 Tage", () => {
  const ordner = tmp();
  const uhr = { t: 1_000_000 };
  const store = neuerStore(ordner, uhr);
  try {
    const id = store.create({ kontoId: "kA" });
    uhr.t += 10 * TAG;
    assert.equal(store.verlaengere(id), null, "noch 20 Tage übrig — nichts tun");
    uhr.t += 10 * TAG;
    assert.equal(store.verlaengere(id), uhr.t + 30 * TAG);
    assert.equal(store.get(id).expiresAt, uhr.t + 30 * TAG);
    assert.equal(store.verlaengere("gibtesnichtgibtesnicht"), null);
  } finally {
    store.close();
  }
});

test("Tabelle von vor den Konten (Twitch NOT NULL, ohne konto_id) wird beim Start umgebaut, Sitzungen bleiben", () => {
  const Database = require("better-sqlite3");
  const ordner = tmp();
  const datei = path.join(ordner, "sessions.db");
  const alt = new Database(datei);
  alt.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, twitch_id TEXT NOT NULL, twitch_login TEXT NOT NULL,
    erstellt INTEGER NOT NULL, laeuft_ab INTEGER NOT NULL);
    CREATE INDEX sessions_laeuft_ab ON sessions (laeuft_ab);`);
  alt.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?)").run("abcdefghijklmnopqrstuvwx", "123", "valentin", 1, 1_000_000 + TAG);
  alt.close();

  const store = createSessionStore({ datei, now: () => 1_000_000 });
  try {
    assert.deepEqual(store.get("abcdefghijklmnopqrstuvwx"), { twitchId: "123", twitchLogin: "valentin", kontoId: null, expiresAt: 1_000_000 + TAG });
    const gast = store.create({ kontoId: "kNEU" }); // ging vorher wegen NOT NULL nicht
    assert.equal(store.get(gast).kontoId, "kNEU");
  } finally {
    store.close();
  }
  // Zweiter Start: nichts mehr umzubauen
  const nochmal = new Database(datei);
  try {
    const { migriere } = require("../sessionStore");
    assert.equal(migriere(nochmal), false);
  } finally {
    nochmal.close();
  }
});

test("kaputte sessions.json: keine Übernahme, beim nächsten Start neuer Versuch", () => {
  const ordner = tmp();
  const json = path.join(ordner, "sessions.json");
  fs.writeFileSync(json, "{kaputt");
  const store = neuerStore(ordner, { t: 1_000_000 });
  try {
    const r = store.importiereJson(json);
    assert.equal(r.importiert, 0);
    assert.ok(r.fehler);
    fs.writeFileSync(json, "{}");
    assert.deepEqual(store.importiereJson(json), { importiert: 0 });
  } finally {
    store.close();
  }
});
