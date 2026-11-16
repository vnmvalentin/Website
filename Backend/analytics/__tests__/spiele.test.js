// npm test -- analytics — Admin-Reiter „Spiele“: Zuordnung Seite → Spiel, Besucher je Spiel, Trichter Startseite →
// Spiel (nur innerhalb eines Tages), Partien und Live-Zahlen. Die Statistik läuft gegen eine Temp-Datei.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// analyticsStore öffnet seine Datei beim Laden — der Pfad muss vorher umgebogen sein
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-test-"));
process.env.ANALYTICS_DB = path.join(ordner, "analytics.db");

const analytics = require("../analyticsStore");
const { normalizePath } = require("../normalize");
const { SPIELE, spielVonPfad } = require("../spiele");
const statistik = require("../../lib/spielStatistik");

const TAG = 24 * 60 * 60 * 1000;
const HEUTE = Date.UTC(2026, 10, 16, 11, 0, 0); // 12:00 in Berlin
const MORGEN = HEUTE + TAG;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const besuch = (ip, pfad, now = HEUTE) => analytics.recordView({ ip, userAgent: UA, path: normalizePath(pfad), now });
const nachId = (r) => Object.fromEntries(r.spiele.map((s) => [s.id, s]));

test("Spielseiten gehören zu ihrem Spiel, Turniere, Stats und Startseite nicht", () => {
  const fall = (pfad) => spielVonPfad(normalizePath(pfad));
  assert.equal(fall("/garden"), "garden");
  assert.equal(fall("/garden/irgendwas"), "garden");
  assert.equal(fall("/seed-runners/raum/XY12"), "seed-runners");
  assert.equal(fall("/clash-royale"), "cr-minigames");
  assert.equal(fall("/clash-royale/turnier/abc"), null);
  assert.equal(fall("/clash-royale/win-tracker"), null);
  assert.equal(fall("/clash/wer-bin-ich/ABCDE"), "cr-wer-bin-ich");
  assert.equal(fall("/clash/wordle"), "cr-ratespiele");
  assert.equal(fall("/clash/spieler/2PP"), null);
  assert.equal(fall("/"), null);
  assert.equal(spielVonPfad("/connect4-nachbau"), null, "Präfix gilt nur für ganze Abschnitte");
  assert.equal(new Set(SPIELE.map((s) => s.id)).size, SPIELE.length, "jede Spiel-ID nur einmal");
});

test("Clash-Unterseiten und Flick-Turniere behalten ihren Namen, Codes bleiben verborgen", () => {
  assert.equal(normalizePath("/clash/wer-bin-ich/ABCDE"), "/clash/wer-bin-ich/*");
  assert.equal(normalizePath("/clash/spieler/2PPGQ"), "/clash/spieler/*");
  assert.equal(normalizePath("/clash/baukasten"), "/clash/baukasten");
  assert.equal(normalizePath("/flick-soccer/turnier/k9x2"), "/flick-soccer/turnier/*");
  assert.equal(normalizePath("/clash-royale/win-tracker/rueckblick"), "/clash-royale/win-tracker/rueckblick");
});

test("Trichter: Startseite und Spiel am selben Tag zählen, egal in welcher Reihenfolge", () => {
  besuch("10.0.0.1", "/");
  besuch("10.0.0.1", "/garden");
  besuch("10.0.0.1", "/garden/raum"); // dasselbe Spiel nochmal → kein zweiter Besucher
  besuch("10.0.0.2", "/seed-runners"); // nur Spiel
  besuch("10.0.0.3", "/");
  besuch("10.0.0.3", "/clash/spieler/abc"); // Startseite, aber kein Spiel
  besuch("10.0.0.4", "/worldflip"); // erst Spiel …
  besuch("10.0.0.4", "/"); // … dann Startseite
  besuch("10.0.0.4", "/garden"); // zweites Spiel desselben Besuchers

  const r = analytics.getReport(7, HEUTE);
  assert.deepEqual(r.trichter, { seit: "2026-11-16", visitors: 4, start: 3, game: 3, startToGame: 2 });
  assert.equal(r.spieleSeit, "2026-11-16");
  const s = nachId(r);
  assert.equal(s.garden.visitors, 2);
  assert.equal(s.garden.views, 3);
  assert.equal(s["seed-runners"].visitors, 1);
  assert.equal(s.worldflip.visitors, 1);
  assert.equal(s.adventures.visitors, 0);
  assert.equal(s.garden.series.length, 7);
  assert.equal(s.garden.series.at(-1).visitors, 2);
  assert.equal(r.spiele[0].id, "garden", "sortiert nach Besuchern");
});

test("Am nächsten Tag zählt derselbe Besucher neu — über Tage erkennt die Statistik niemanden wieder", () => {
  besuch("10.0.0.1", "/garden", MORGEN);
  const r = analytics.getReport(7, MORGEN);
  const garden = nachId(r).garden;
  assert.equal(garden.visitors, 3);
  assert.deepEqual(garden.series.slice(-2).map((d) => d.visitors), [2, 1]);
  assert.equal(r.trichter.game, 4);
  assert.equal(r.trichter.startToGame, 2, "die Startseite von gestern zählt heute nicht mit");
});

test("Partien: nur bekannte Spiele, und eine Zahl erst ab der ersten Meldung (sonst null = „–“)", () => {
  assert.equal(analytics.recordMatch("worldflip", MORGEN), true);
  assert.equal(analytics.recordMatch("worldflip", MORGEN), true);
  assert.equal(analytics.recordMatch("gibt-es-nicht", MORGEN), false);
  const s = nachId(analytics.getReport(7, MORGEN));
  assert.equal(s.worldflip.matches, 2);
  assert.equal(s.worldflip.matchesSince, "2026-11-17");
  assert.deepEqual(s.worldflip.series.slice(-2).map((d) => d.matches), [0, 2]);
  assert.equal(s.garden.matches, null);
  assert.equal(s.garden.series.at(-1).matches, null);
});

test("spielStatistik: Live-Zahlen einzeln abgesichert, Partien nur mit verbundenem Speicher", () => {
  statistik.meldeSpielAn("test-a", () => ({ rooms: 3, players: 7.4 }));
  statistik.meldeSpielAn("test-b", () => { throw new Error("kaputt"); });
  statistik.meldeSpielAn("test-c", () => ({ raeume: -2, spieler: "x" }));
  const live = statistik.liveZahlen();
  assert.deepEqual(live["test-a"], { raeume: 3, spieler: 7 });
  assert.equal(live["test-b"], null);
  assert.deepEqual(live["test-c"], { raeume: 0, spieler: 0 });
  assert.throws(() => statistik.meldeSpielAn("test-d", 5));

  assert.equal(statistik.zaehlePartie("worldflip"), false, "ohne Speicher wird nichts gezählt");
  const gezaehlt = [];
  statistik.verbindePartienSpeicher((id) => { gezaehlt.push(id); return true; });
  assert.equal(statistik.zaehlePartie("worldflip"), true);
  statistik.verbindePartienSpeicher(() => { throw new Error("klemmt"); });
  const orig = console.error;
  console.error = () => {};
  try {
    assert.equal(statistik.zaehlePartie("worldflip"), false, "ein klemmender Speicher wirft nicht ins Spiel");
  } finally {
    console.error = orig;
  }
  statistik.verbindePartienSpeicher(null);
  assert.deepEqual(gezaehlt, ["worldflip"]);
});

test("Discord-Übersicht: Summen, Neuzugänge, Ping erst nach dem ersten Herzschlag", () => {
  const { discordUebersicht } = require("../../admin/discordUebersicht");
  assert.deepEqual(discordUebersicht(null, 5), { bereit: false, at: 5 });
  assert.deepEqual(discordUebersicht({ isReady: () => false }, 5), { bereit: false, at: 5 });

  const jetzt = HEUTE;
  const gilde = (id, name, mitglieder, tageHer) => [id, { id, name, memberCount: mitglieder, joinedTimestamp: jetzt - tageHer * TAG }];
  const client = {
    isReady: () => true,
    user: { username: "Bot" },
    ws: { ping: -1 },
    readyTimestamp: jetzt - 1000,
    guilds: { cache: new Map([gilde("1", "Klein", 12, 3), gilde("2", "Groß", 900, 40), gilde("3", "Mittel", 80, 20)]) },
  };
  const u = discordUebersicht(client, jetzt);
  assert.equal(u.bereit, true);
  assert.equal(u.server, 3);
  assert.equal(u.mitglieder, 992);
  assert.equal(u.neu7, 1);
  assert.equal(u.neu30, 2);
  assert.equal(u.ping, null);
  assert.deepEqual(u.liste.map((g) => g.name), ["Groß", "Mittel", "Klein"]);
  client.ws.ping = 41.6;
  assert.equal(discordUebersicht(client, jetzt).ping, 42);
});

test.after(() => {
  // Unter Windows hält die offene Datenbank die Datei fest — dann bleibt der Temp-Ordner eben liegen
  try { fs.rmSync(ordner, { recursive: true, force: true }); } catch { /* egal */ }
});
