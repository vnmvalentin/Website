// npm test -- sicherung — alles in Temp-Ordnern, nie gegen Backend/data.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { EventEmitter } = require("node:events");
const Database = require("better-sqlite3");

const {
  erstelleSicherung,
  pruefeSicherung,
  entpacke,
  waehleZumLoeschen,
  wochenSchluessel,
  sammleDateien,
} = require("../sicherung");
const { createSicherungsPlan } = require("../plan");
const { datumVon } = require("../gemeinsam");

const tmp = (vorsilbe = "sicherung-test-") => fs.mkdtempSync(path.join(os.tmpdir(), vorsilbe));
const leise = { log() {}, warn() {}, error() {} };
const aufraeumen = (...ordner) => {
  for (const o of ordner) {
    try {
      fs.rmSync(o, { recursive: true, force: true });
    } catch {
      // Windows hält Dateien manchmal kurz fest — Temp-Reste sind harmlos
    }
  }
};

/** Datenordner wie auf dem Server, inkl. Resten, die nicht mitgesichert werden dürfen */
function legeDatenAn() {
  const daten = tmp();
  // WAL-Datenbank mit offener Verbindung: die Zeilen stecken noch im -wal und nicht in der .db-Datei
  const db = new Database(path.join(daten, "spiel.db"));
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
  const einfuegen = db.prepare("INSERT INTO t (name) VALUES (?)");
  for (let i = 0; i < 50; i++) einfuegen.run(`zeile ${i}`);
  fs.writeFileSync(path.join(daten, "polls.json"), JSON.stringify({ a: 1 }));
  fs.writeFileSync(path.join(daten, "leer.json"), "");
  fs.writeFileSync(path.join(daten, "stream_tool.key"), "geheim");
  fs.mkdirSync(path.join(daten, "uploads", "bilder"), { recursive: true });
  fs.writeFileSync(path.join(daten, "uploads", "bilder", "a.png"), Buffer.from([1, 2, 3]));
  fs.writeFileSync(path.join(daten, "alt.db.alt-2026-11-13T20-09-46-521Z"), "x");
  fs.writeFileSync(path.join(daten, "polls.json.tmp"), "{");
  fs.writeFileSync(path.join(daten, "giveaways.json.corrupt-123"), "{");
  fs.mkdirSync(path.join(daten, "backups"));
  fs.writeFileSync(path.join(daten, "backups", "x.db"), "x");
  return { daten, db };
}

const MORGEN = new Date(2026, 10, 15, 3, 30);

test("sammelt Datenbanken, JSON, Schlüssel und Unterordner — Reste und alte Sicherungsordner bleiben draußen", () => {
  const { daten, db } = legeDatenAn();
  try {
    const liste = sammleDateien(daten).map((r) => r.split(path.sep).join("/"));
    assert.deepEqual(liste, ["leer.json", "polls.json", "spiel.db", "stream_tool.key", "uploads/bilder/a.png"]);
  } finally {
    db.close();
    aufraeumen(daten);
  }
});

test("Sicherung enthält den WAL-Inhalt, besteht die Prüfung und lässt sich auspacken", async () => {
  const { daten, db } = legeDatenAn();
  const ziel = tmp("sicherung-ziel-");
  try {
    const r = await erstelleSicherung({ datenOrdner: daten, jetzt: MORGEN, log: leise });
    assert.equal(r.ok, true);
    assert.equal(r.ordner, "2026-11-15");
    assert.equal(r.dateien, 5);

    const ordner = path.join(daten, "sicherungen", "2026-11-15");
    const pruefung = await pruefeSicherung(ordner);
    assert.deepEqual(pruefung, { ok: true, vollstaendig: true, dateien: 5, fehler: [] });

    assert.equal(await entpacke(ordner, ziel), 5);
    const kopie = new Database(path.join(ziel, "spiel.db"), { readonly: true });
    try {
      assert.equal(kopie.prepare("SELECT COUNT(*) AS n FROM t").get().n, 50);
      assert.equal(kopie.pragma("journal_mode", { simple: true }), "delete");
    } finally {
      kopie.close();
    }
    assert.equal(fs.readFileSync(path.join(ziel, "stream_tool.key"), "utf8"), "geheim");
    assert.deepEqual([...fs.readFileSync(path.join(ziel, "uploads", "bilder", "a.png"))], [1, 2, 3]);

    const stand = JSON.parse(fs.readFileSync(path.join(daten, "sicherungen", "stand.json"), "utf8"));
    assert.equal(stand.letzteErfolgreiche.ordner, "2026-11-15");
    assert.equal(stand.letzterVersuch.ok, true);
    // Keine Arbeitsreste, keine Sperre
    assert.deepEqual(fs.readdirSync(path.join(daten, "sicherungen")).sort(), ["2026-11-15", "stand.json"]);
    // Die Quelle bleibt unangetastet und benutzbar
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM t").get().n, 50);
  } finally {
    db.close();
    aufraeumen(daten, ziel);
  }
});

test("kaputtes JSON: Rest wird gesichert, der Lauf gilt als unvollständig und verdrängt keine gute Sicherung desselben Tages", async () => {
  const { daten, db } = legeDatenAn();
  try {
    assert.equal((await erstelleSicherung({ datenOrdner: daten, jetzt: MORGEN, log: leise })).ok, true);
    fs.writeFileSync(path.join(daten, "polls.json"), "{kaputt");

    const r = await erstelleSicherung({ datenOrdner: daten, jetzt: new Date(2026, 10, 15, 9, 0), log: leise });
    assert.equal(r.ok, false);
    assert.equal(r.ordner, "2026-11-15-fehler");
    assert.deepEqual(r.fehler.map((f) => f.datei), ["polls.json"]);
    assert.equal(r.dateien, 4);

    const stand = JSON.parse(fs.readFileSync(path.join(daten, "sicherungen", "stand.json"), "utf8"));
    assert.equal(stand.letzterVersuch.ok, false);
    assert.equal(stand.letzteErfolgreiche.ordner, "2026-11-15");
    const gute = await pruefeSicherung(path.join(daten, "sicherungen", "2026-11-15"));
    assert.equal(gute.vollstaendig, true);
    assert.equal(gute.ok, true);
  } finally {
    db.close();
    aufraeumen(daten);
  }
});

test("Prüfen erkennt eine veränderte Datei, Entpacken verweigert einen vollen Zielordner", async () => {
  const { daten, db } = legeDatenAn();
  const voll = tmp("sicherung-voll-");
  try {
    await erstelleSicherung({ datenOrdner: daten, jetzt: MORGEN, log: leise });
    const ordner = path.join(daten, "sicherungen", "2026-11-15");
    fs.writeFileSync(path.join(ordner, "polls.json.gz"), zlib.gzipSync(JSON.stringify({ a: 2 })));
    const pruefung = await pruefeSicherung(ordner);
    assert.equal(pruefung.ok, false);
    assert.deepEqual(pruefung.fehler.map((f) => f.datei), ["polls.json"]);

    fs.writeFileSync(path.join(voll, "da.txt"), "schon da");
    await assert.rejects(entpacke(ordner, voll), /nicht leer/);
    assert.equal(fs.readFileSync(path.join(voll, "da.txt"), "utf8"), "schon da");
  } finally {
    db.close();
    aufraeumen(daten, voll);
  }
});

test("ein zweiter gleichzeitiger Lauf wird abgewiesen", async () => {
  const { daten, db } = legeDatenAn();
  try {
    const erster = erstelleSicherung({ datenOrdner: daten, jetzt: MORGEN, log: leise });
    await assert.rejects(erstelleSicherung({ datenOrdner: daten, jetzt: MORGEN, log: leise }), /läuft schon/);
    assert.equal((await erster).ok, true);
  } finally {
    db.close();
    aufraeumen(daten);
  }
});

test("Aufbewahrung: 7 neueste, dann je Kalenderwoche eine für 4 Wochen, Fehlschläge 7 Tage", () => {
  const jetzt = new Date(2026, 10, 30, 4, 0);
  const eintraege = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(2026, 10, 30 - i);
    eintraege.push({ name: datumVon(d), datum: d, ok: true });
  }
  eintraege.push({ name: "2026-11-29-fehler", datum: new Date(2026, 10, 29), ok: false });
  eintraege.push({ name: "2026-11-01-fehler", datum: new Date(2026, 10, 1), ok: false });

  const weg = new Set(waehleZumLoeschen(eintraege, jetzt));
  const gute = eintraege.filter((e) => e.ok && !weg.has(e.name)).sort((a, b) => b.datum - a.datum);
  assert.deepEqual(gute.slice(0, 7).map((e) => e.name), [30, 29, 28, 27, 26, 25, 24].map((t) => datumVon(new Date(2026, 10, t))));
  const woechentlich = gute.slice(7);
  assert.equal(woechentlich.length, 4);
  assert.equal(new Set(woechentlich.map((e) => wochenSchluessel(e.datum))).size, 4);
  // Je Woche die neueste: der Tag danach gehört schon zu einer anderen Woche oder zu den täglichen
  for (const e of woechentlich) {
    const naechster = new Date(e.datum.getFullYear(), e.datum.getMonth(), e.datum.getDate() + 1);
    assert.ok(wochenSchluessel(naechster) !== wochenSchluessel(e.datum) || gute.slice(0, 7).some((g) => g.name === datumVon(naechster)));
  }
  assert.ok(!weg.has("2026-11-29-fehler"));
  assert.ok(weg.has("2026-11-01-fehler"));
  assert.equal(eintraege.length - weg.size, 7 + 4 + 1);
});

test("ISO-Kalenderwoche", () => {
  assert.equal(wochenSchluessel(new Date(2026, 10, 15)), "2026-W46");
  assert.equal(wochenSchluessel(new Date(2026, 10, 16)), "2026-W47");
  assert.equal(wochenSchluessel(new Date(2027, 0, 1)), "2026-W53");
});

// --- Zeitplan ------------------------------------------------------------------------------------------------------

function falscherFork(zielBasis, { exitCode, uhr }) {
  const starts = [];
  const fork = () => {
    starts.push(uhr());
    const kind = new EventEmitter();
    setImmediate(() => {
      const jetzt = uhr();
      const versuch = { zeit: jetzt.toISOString(), ok: exitCode() === 0, ordner: datumVon(jetzt), fehler: exitCode() === 0 ? [] : [{ datei: "x.db", fehler: "kaputt" }] };
      const alt = (() => {
        try {
          return JSON.parse(fs.readFileSync(path.join(zielBasis, "stand.json"), "utf8"));
        } catch {
          return {};
        }
      })();
      fs.writeFileSync(path.join(zielBasis, "stand.json"), JSON.stringify({ letzterVersuch: versuch, letzteErfolgreiche: versuch.ok ? versuch : alt.letzteErfolgreiche || null }));
      kind.emit("exit", exitCode(), null);
    });
    return kind;
  };
  return { fork, starts };
}

test("Zeitplan: ab 03:30 einmal am Tag, nach Fehlschlag Meldung und eine Stunde Pause", async () => {
  const ziel = tmp("sicherung-plan-");
  let uhr = new Date(2026, 10, 15, 3, 0);
  let code = 1;
  const gemeldet = [];
  const { fork, starts } = falscherFork(ziel, { exitCode: () => code, uhr: () => uhr });
  const plan = createSicherungsPlan({ zielBasis: ziel, skript: "egal.js", now: () => uhr, fork, melde: async (t) => gemeldet.push(t), log: leise, gestartet: uhr.getTime() });
  try {
    assert.equal(await plan.tick(), null, "vor 03:30 passiert nichts");
    uhr = new Date(2026, 10, 15, 3, 30);
    assert.equal(await plan.tick(), false);
    assert.equal(gemeldet.length, 1);
    assert.match(gemeldet[0], /fehlgeschlagen \(Versuch 1 von 3\)/);
    assert.match(gemeldet[0], /x\.db: kaputt/);
    uhr = new Date(2026, 10, 15, 4, 0);
    assert.equal(await plan.tick(), null, "Pause nach dem Fehlschlag");
    uhr = new Date(2026, 10, 15, 4, 31);
    code = 0;
    assert.equal(await plan.tick(), true);
    uhr = new Date(2026, 10, 15, 18, 0);
    assert.equal(await plan.tick(), null, "heute schon gesichert");
    uhr = new Date(2026, 10, 16, 3, 31);
    assert.equal(await plan.tick(), true, "nächster Tag");
    assert.equal(starts.length, 3);
    assert.equal(gemeldet.length, 1);
  } finally {
    aufraeumen(ziel);
  }
});

test("Zeitplan: höchstens drei Versuche am Tag", async () => {
  const ziel = tmp("sicherung-plan-");
  let uhr = new Date(2026, 10, 15, 3, 30);
  const { fork, starts } = falscherFork(ziel, { exitCode: () => 1, uhr: () => uhr });
  const plan = createSicherungsPlan({ zielBasis: ziel, skript: "egal.js", now: () => uhr, fork, log: leise, gestartet: uhr.getTime() });
  try {
    for (let i = 0; i < 6; i++) {
      await plan.tick();
      uhr = new Date(uhr.getTime() + 61 * 60 * 1000);
    }
    assert.equal(starts.length, 3);
  } finally {
    aufraeumen(ziel);
  }
});

test("Zeitplan meldet höchstens einmal am Tag, wenn die letzte erfolgreiche Sicherung über 30 Stunden her ist", async () => {
  const ziel = tmp("sicherung-plan-");
  fs.writeFileSync(path.join(ziel, "stand.json"), JSON.stringify({ letzteErfolgreiche: { ordner: "2026-11-13", zeit: new Date(2026, 10, 13, 3, 31).toISOString() } }));
  let uhr = new Date(2026, 10, 15, 2, 0); // vor 03:30: keine Sicherung, aber das Alter wird geprüft
  const gemeldet = [];
  const plan = createSicherungsPlan({
    zielBasis: ziel,
    skript: "egal.js",
    now: () => uhr,
    fork: () => {
      throw new Error("darf vor 03:30 nicht starten");
    },
    melde: async (t) => gemeldet.push(t),
    log: leise,
  });
  try {
    await plan.tick();
    assert.equal(gemeldet.length, 1);
    assert.match(gemeldet[0], /seit über 30 Stunden/);
    uhr = new Date(2026, 10, 15, 2, 5);
    await plan.tick();
    assert.equal(gemeldet.length, 1);
  } finally {
    aufraeumen(ziel);
  }
});
