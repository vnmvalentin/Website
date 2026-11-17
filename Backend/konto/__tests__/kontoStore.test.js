// npm test -- konto — Konten-Speicher: Anmeldewege, Gast-Code, Verknüpfen und Zusammenführen, Spielstände mit
// Versionen, Abzeichen, aktive Tage und Wiederkehr, Website-Stufe. Nur Temp-Ordner.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createKontoStore, normalisiereCode, tagVon } = require("../kontoStore");
const { stufeAusXp } = require("../stufe");

const TAG = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 16, 11, 0, 0); // 16.11.2026, 12:00 in Berlin
const ERLAUBT = new Set(["flick-soccer:erstes-tor", "flick-soccer:hattrick", "worldflip:sieg"]);

function neuerStore(uhr = { t: START }) {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "konto-test-"));
  const store = createKontoStore({
    datei: path.join(ordner, "konten.db"),
    now: () => uhr.t,
    erfolgErlaubt: (spiel, id) => ERLAUBT.has(`${spiel}:${id}`),
  });
  return { store, uhr };
}

test("Website-Stufe: 100 XP mehr je Stufe", () => {
  assert.deepEqual(stufeAusXp(0), { stufe: 1, xp: 0, ab: 0, naechste: 100 });
  assert.equal(stufeAusXp(99).stufe, 1);
  assert.equal(stufeAusXp(100).stufe, 2);
  assert.equal(stufeAusXp(299).stufe, 2);
  assert.equal(stufeAusXp(300).stufe, 3);
  assert.equal(stufeAusXp(4500).stufe, 10);
  assert.equal(stufeAusXp(-5).stufe, 1);
  assert.equal(stufeAusXp("kaputt").stufe, 1);
});

test("Anmelden: gleiches Konto beim zweiten Mal, Bilder nur von Twitch und Discord, Twitch-Name hat Vorrang", () => {
  const { store } = neuerStore();
  try {
    const a = store.anmelden("twitch", "123", { name: "Valentin", avatar: "https://static-cdn.jtvnw.net/x.png" });
    assert.equal(a.neu, true);
    assert.match(a.kontoId, /^k[A-Za-z0-9_-]{16}$/);
    assert.deepEqual(store.anmelden("twitch", "123", { name: "Valentin2" }), { kontoId: a.kontoId, neu: false });
    assert.equal(store.ansicht(a.kontoId).name, "Valentin2");
    assert.equal(store.ansicht(a.kontoId).avatar, "https://static-cdn.jtvnw.net/x.png", "ohne neues Bild bleibt das alte");

    const fremd = store.anmelden("discord", "999", { name: "\u0000Böse‮", avatar: "https://evil.example/x.png" });
    assert.equal(store.ansicht(fremd.kontoId).name, "Böse");
    assert.equal(store.ansicht(fremd.kontoId).avatar, null);

    // Discord an das Twitch-Konto hängen: der Name bleibt der von Twitch
    assert.equal(store.verknuepfe(a.kontoId, "discord", "555", { name: "DiscordName" }).ok, true);
    store.anmelden("discord", "555", { name: "AndererDiscordName" });
    assert.equal(store.ansicht(a.kontoId).name, "Valentin2");
    assert.equal(store.ansicht(a.kontoId).discord.name, "AndererDiscordName");

    assert.throws(() => store.anmelden("google", "1"), /Anmeldeweg/);
    assert.throws(() => store.anmelden("twitch", "../x"), /ID/);
  } finally {
    store.close();
  }
});

test("Gastkonto: Code einmal im Klartext, tolerant beim Eintippen, neuer Code macht den alten ungültig", () => {
  const { store } = neuerStore();
  try {
    const { kontoId, code } = store.erstelleGast();
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    const ansicht = store.ansicht(kontoId);
    assert.equal(ansicht.gast, true);
    assert.equal(ansicht.hatCode, true);
    assert.match(ansicht.name, /^Gast \d{4}$/);

    assert.equal(store.kontoVonCode(code), kontoId);
    assert.equal(store.kontoVonCode(code.toLowerCase().replace(/-/g, " ")), kontoId);
    assert.equal(store.kontoVonCode(code.replace(/0/g, "O")), kontoId);
    assert.equal(store.kontoVonCode("AAAA-AAAA-AAAA-AAAA"), null);
    assert.equal(normalisiereCode("zu-kurz"), null);
    assert.equal(normalisiereCode("UUUU-UUUU-UUUU-UUUU"), null, "U gibt es im Alphabet nicht");

    const neu = store.erneuereCode(kontoId);
    assert.notEqual(neu, code);
    assert.equal(store.kontoVonCode(code), null);
    assert.equal(store.kontoVonCode(neu), kontoId);
  } finally {
    store.close();
  }
});

test("Spielstände: Versionen schützen vor Überschreiben, Grenzen für Größe, XP und Spiel", () => {
  const { store, uhr } = neuerStore();
  try {
    const { kontoId } = store.erstelleGast();
    assert.equal(store.stand(kontoId, "flick-soccer"), null);
    assert.deepEqual(store.speichereStand(kontoId, "flick-soccer", { tore: 3 }, { xp: 30, version: 0 }), { ok: true, version: 1, geaendert: uhr.t });
    // Zweites Gerät mit veraltetem Stand (Version 0) → Konflikt samt aktuellem Stand
    const konflikt = store.speichereStand(kontoId, "flick-soccer", { tore: 1 }, { xp: 10, version: 0 });
    assert.equal(konflikt.konflikt, true);
    assert.deepEqual(konflikt.stand.daten, { tore: 3 });
    assert.equal(store.speichereStand(kontoId, "flick-soccer", { tore: 4 }, { xp: 40.7, version: 1 }).version, 2);
    assert.deepEqual(store.stand(kontoId, "flick-soccer"), { daten: { tore: 4 }, xp: 40, version: 2, geaendert: uhr.t });

    assert.equal(store.speichereStand(kontoId, "gibt-es-nicht", {}, {}).fehler, "spiel");
    assert.equal(store.speichereStand(kontoId, "worldflip", "x".repeat(70 * 1024), {}).fehler, "zu-gross");
    assert.equal(store.speichereStand(kontoId, "worldflip", {}, { xp: -1 }).fehler, "xp");
    assert.equal(store.speichereStand(kontoId, "worldflip", {}, { xp: Infinity }).fehler, "xp");
    assert.equal(store.speichereStand(kontoId, "worldflip", undefined, {}).fehler, "daten");
    assert.equal(store.speichereStand("kGIBTESNICHTxxxxx", "worldflip", {}, {}).fehler, "konto-fehlt");

    store.speichereStand(kontoId, "worldflip", { siege: 2 }, { xp: 70 });
    const a = store.ansicht(kontoId);
    assert.equal(a.stufe.xp, 110);
    assert.equal(a.stufe.stufe, 2);
    assert.deepEqual(a.spiele.map((s) => s.spiel).sort(), ["flick-soccer", "worldflip"]);
  } finally {
    store.close();
  }
});

test("Abzeichen: nur aus dem Katalog, jedes nur einmal", () => {
  const { store } = neuerStore();
  try {
    const { kontoId } = store.erstelleGast();
    assert.deepEqual(store.meldeErfolge(kontoId, "flick-soccer", ["erstes-tor", "erfunden", "erstes-tor"]), { ok: true, neu: ["erstes-tor"], abgelehnt: ["erfunden"] });
    assert.deepEqual(store.meldeErfolge(kontoId, "flick-soccer", ["erstes-tor", "hattrick"]).neu, ["hattrick"]);
    assert.equal(store.meldeErfolge(kontoId, "gibt-es-nicht", ["x"]).fehler, "spiel");
    assert.equal(store.meldeErfolge(kontoId, "flick-soccer", "kein-array").fehler, "liste");
    assert.equal(store.ansicht(kontoId).erfolge.length, 2);
    // Entziehen (z. B. erstatteter Kauf): nur genau dieses Abzeichen, danach darf es wieder vergeben werden
    assert.equal(store.entziehErfolg(kontoId, "flick-soccer", "hattrick"), true);
    assert.equal(store.entziehErfolg(kontoId, "flick-soccer", "hattrick"), false);
    assert.deepEqual(store.ansicht(kontoId).erfolge.map((e) => e.erfolg), ["erstes-tor"]);
    assert.deepEqual(store.meldeErfolge(kontoId, "flick-soccer", ["hattrick"]).neu, ["hattrick"]);
  } finally {
    store.close();
  }
});

test("Gast meldet sich später mit Twitch an: Konten werden zusammengeführt, das Twitch-Konto bleibt", () => {
  const { store, uhr } = neuerStore();
  try {
    const twitch = store.anmelden("twitch", "123", { name: "Valentin" }).kontoId;
    store.speichereStand(twitch, "flick-soccer", { stand: "twitch" }, { xp: 50 });
    store.speichereStand(twitch, "worldflip", { stand: "twitch" }, { xp: 80 });
    store.meldeErfolge(twitch, "flick-soccer", ["erstes-tor"]);
    store.merkeAktiv(twitch);

    uhr.t += TAG;
    const { kontoId: gast, code } = store.erstelleGast();
    store.speichereStand(gast, "flick-soccer", { stand: "gast" }, { xp: 90 }); // mehr XP → gewinnt
    store.speichereStand(gast, "worldflip", { stand: "gast" }, { xp: 20 }); // weniger → verliert
    store.speichereStand(gast, "lights-out", { stand: "gast" }, { xp: 5 }); // nur beim Gast
    store.meldeErfolge(gast, "flick-soccer", ["erstes-tor", "hattrick"]);
    store.merkeAktiv(gast);

    const r = store.verknuepfe(gast, "twitch", "123", { name: "Valentin" });
    assert.deepEqual(r, { ok: true, kontoId: twitch, entfernt: gast });
    assert.equal(store.ansicht(gast), null, "das Gastkonto ist aufgelöst");
    assert.deepEqual(store.stand(twitch, "flick-soccer").daten, { stand: "gast" });
    assert.equal(store.stand(twitch, "flick-soccer").version, 2, "Version weitergezählt");
    assert.deepEqual(store.stand(twitch, "worldflip").daten, { stand: "twitch" });
    assert.deepEqual(store.stand(twitch, "lights-out").daten, { stand: "gast" });
    const a = store.ansicht(twitch);
    assert.deepEqual(a.erfolge.map((e) => e.erfolg).sort(), ["erstes-tor", "hattrick"]);
    assert.equal(a.erfolge.find((e) => e.erfolg === "erstes-tor").erreicht, START, "früheste Freischaltung bleibt");
    assert.equal(a.hatCode, true, "der Code des Gasts gilt jetzt fürs gemeinsame Konto");
    assert.equal(store.kontoVonCode(code), twitch);
    assert.equal(a.erstellt, START);
  } finally {
    store.close();
  }
});

test("Discord an ein Gastkonto: kein Zusammenführen, der Gast heißt danach wie bei Discord", () => {
  const { store } = neuerStore();
  try {
    const { kontoId } = store.erstelleGast();
    assert.deepEqual(store.verknuepfe(kontoId, "discord", "777", { name: "Mia", avatar: "https://cdn.discordapp.com/avatars/777/a.png" }), { ok: true, kontoId, entfernt: null });
    const a = store.ansicht(kontoId);
    assert.equal(a.name, "Mia");
    assert.equal(a.gast, false);
    assert.equal(store.kontoVonLink("discord", "777"), kontoId);
    // Eigener Name bleibt auch bei späteren Anmeldungen
    assert.deepEqual(store.setzeName(kontoId, "  Mia die Große "), { ok: true, name: "Mia die Große" });
    store.anmelden("discord", "777", { name: "Mia" });
    assert.equal(store.ansicht(kontoId).name, "Mia die Große");
    assert.equal(store.setzeName(kontoId, "x").fehler, "laenge");
    assert.equal(store.setzeName(kontoId, "www.spam.de").fehler, "adresse");
  } finally {
    store.close();
  }
});

test("Verknüpfen abgelehnt: anderer Weg derselben Art schon da, oder beide Konten hätten Twitch", () => {
  const { store } = neuerStore();
  try {
    const eins = store.anmelden("twitch", "1", { name: "Eins" }).kontoId;
    store.verknuepfe(eins, "discord", "d1", {});
    assert.deepEqual(store.verknuepfe(eins, "discord", "d2", {}), { ok: false, fehler: "schon-verknuepft", art: "discord" });

    // nur Twitch (zwei) will Discord d3, das an einem Konto mit eigenem Twitch hängt → zwei Twitch-Wege an einem Konto
    const zwei = store.anmelden("twitch", "2", { name: "Zwei" }).kontoId;
    const vier = store.anmelden("twitch", "4", { name: "Vier" }).kontoId;
    store.verknuepfe(vier, "discord", "d3", {});
    assert.deepEqual(store.verknuepfe(zwei, "discord", "d3", {}), { ok: false, fehler: "doppelt", art: "twitch" });
    assert.equal(store.kontoVonLink("discord", "d3"), vier, "nichts verändert");

    // Ein leerer Gast darf dagegen in ein Konto mit Twitch und Discord aufgehen
    const gast = store.erstelleGast().kontoId;
    assert.deepEqual(store.verknuepfe(gast, "twitch", "1", {}), { ok: true, kontoId: eins, entfernt: gast });
  } finally {
    store.close();
  }
});

test("Anmeldeweg lösen nur, wenn ein anderer bleibt; Löschen entfernt alles", () => {
  const { store } = neuerStore();
  try {
    const k = store.anmelden("discord", "d1", { name: "Nur Discord" }).kontoId;
    assert.deepEqual(store.trenne(k, "discord"), { ok: false, fehler: "letzter-weg" });
    store.erneuereCode(k);
    assert.deepEqual(store.trenne(k, "discord"), { ok: true });
    assert.equal(store.kontoVonLink("discord", "d1"), null);
    assert.equal(store.ansicht(k).gast, true);

    store.speichereStand(k, "worldflip", { a: 1 }, { xp: 1 });
    store.merkeAktiv(k);
    assert.equal(store.loesche(k), true);
    assert.equal(store.ansicht(k), null);
    assert.deepEqual(store.staende(k), []);
    assert.equal(store.zahlen().konten, 0);
  } finally {
    store.close();
  }
});

test("Wiederkehr: Folgetag, 7 und 30 Tage — nur neue Konten, nur abgelaufene Zeitfenster", () => {
  const { store, uhr } = neuerStore();
  try {
    const tag = (n) => START + n * TAG;
    // drei neue Konten am 16.11.
    const a = store.erstelleGast().kontoId; // kommt am Folgetag wieder
    const b = store.erstelleGast().kontoId; // kommt am 5. Tag wieder
    const c = store.erstelleGast().kontoId; // kommt nie wieder
    for (const k of [a, b, c]) store.merkeAktiv(k, tag(0));
    assert.equal(store.merkeAktiv(a, tag(0)), false, "zweimal am selben Tag zählt einmal");
    // Bestandskonto (Sitzung von vor dem Update) zählt nicht
    const alt = store.anmelden("twitch", "9", { name: "Alt" }, { bestand: true }).kontoId;
    store.merkeAktiv(alt, tag(0));

    store.merkeAktiv(a, tag(1));
    store.merkeAktiv(b, tag(5));

    uhr.t = tag(3);
    let w = store.wiederkehr({ von: "2026-11-16", bis: "2026-11-16", heute: tagVon(uhr.t) });
    assert.equal(w.neu, 3);
    assert.deepEqual(w.tag1, { basis: 3, zurueck: 1 });
    assert.deepEqual(w.tage7, { basis: 0, zurueck: 0 }, "7-Tage-Fenster läuft noch");

    uhr.t = tag(8);
    w = store.wiederkehr({ von: "2026-11-16", bis: "2026-11-16", heute: tagVon(uhr.t), ohne: [c] });
    assert.equal(w.neu, 2);
    assert.deepEqual(w.tage7, { basis: 2, zurueck: 2 });
    assert.deepEqual(w.tage30, { basis: 0, zurueck: 0 });

    // Aufräumen nach 120 Tagen
    uhr.t = tag(200);
    assert.ok(store.raeumeAuf() >= 6);
  } finally {
    store.close();
  }
});

test("Bestwerte: nur aus dem Katalog, je Wert nur Verbesserungen; Zusammenführen behält den besseren", () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "konto-test-"));
  const uhr = { t: START };
  const store = createKontoStore({
    datei: path.join(ordner, "konten.db"),
    now: () => uhr.t,
    bestwertKatalog: {
      "lights-out": [
        { id: "flucht", name: { de: "Flucht", en: "Escape" }, art: "zeit", besser: "kleiner" },
        { id: "ebenen", name: { de: "Ebenen", en: "Floors" }, art: "zahl", besser: "groesser" },
      ],
    },
  });
  try {
    const a = store.erstelleGast().kontoId;
    let r = store.meldeBestwerte(a, "lights-out", { flucht: 90_500.4, ebenen: 3, quatsch: 1 });
    assert.deepEqual(r, { ok: true, neu: ["flucht", "ebenen"], abgelehnt: ["quatsch"] });
    r = store.meldeBestwerte(a, "lights-out", { flucht: 95_000, ebenen: 5 });
    assert.deepEqual(r.neu, ["ebenen"], "langsamere Zeit zählt nicht, mehr Ebenen schon");
    assert.deepEqual(store.meldeBestwerte(a, "lights-out", { flucht: -1 }).abgelehnt, ["flucht"]);
    assert.equal(store.meldeBestwerte(a, "gibts-nicht", { flucht: 1 }).fehler, "spiel");
    assert.equal(store.meldeBestwerte(a, "lights-out", [1, 2]).fehler, "liste");
    assert.deepEqual(store.ansicht(a).bestwerte.map((b) => [b.wert, b.zahl]), [["ebenen", 5], ["flucht", 90_500]]);

    // Zusammenführen: Twitch-Konto bleibt, je Wert gewinnt der bessere; Beobachter erfährt es
    const gemeldet = [];
    const aus = store.beobachte({
      zusammengefuehrt: (ziel, quelle) => gemeldet.push(["zusammen", ziel, quelle]),
      geloescht: (k) => gemeldet.push(["weg", k]),
    });
    const t = store.anmelden("twitch", "77", { name: "Tw" }).kontoId;
    store.meldeBestwerte(t, "lights-out", { flucht: 80_000, ebenen: 2 });
    const v = store.verknuepfe(a, "twitch", "77", { name: "Tw" });
    assert.equal(v.kontoId, t);
    assert.deepEqual(store.ansicht(t).bestwerte.map((b) => [b.wert, b.zahl]), [["ebenen", 5], ["flucht", 80_000]]);
    assert.deepEqual(gemeldet, [["zusammen", t, a]]);

    store.loesche(t);
    assert.deepEqual(gemeldet.at(-1), ["weg", t]);
    aus();
    store.loesche(store.erstelleGast().kontoId);
    assert.equal(gemeldet.length, 2, "abgemeldeter Beobachter hört nichts mehr");
  } finally {
    store.close();
  }
});
