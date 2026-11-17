// npm test -- Website — Spiele am Konto (Spur D, Anschlüsse konto-spiele + bestwerte-spiele): Zähler-Statistik,
// Zusammenführen ohne Verlust, und dass jedes Spiel nur Abzeichen und Bestwerte meldet, die im Katalog des Servers
// stehen (Backend/konto/erfolge.js, bestwerte.js — beide ohne Abhängigkeiten, gefahrlos per require lesbar).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { entscheideAbgleich } from "../../../utils/kontoAbgleich.js";
import { beiAenderung, kleinsterPositiver, maxJeSchluessel, maxZaehler, vereinige, zaehlerStatistik } from "../../../utils/spielstand.js";
import { FLICK_KONTO, KONTO_ABZEICHEN } from "../../FlickSoccer/kontoStand.js";
import { ACHIEVEMENTS } from "../../FlickSoccer/progress.js";
import { TOUR_STAGES } from "../../FlickSoccer/tour.js";
import { TRICKS } from "../../FlickSoccer/trickData.js";
import { LIGHTS_OUT_KONTO, liesStand, schreibStand, zaehleFlucht } from "../../LightsOut/kontoStand.js";
import { ALL_NOTES } from "../../LightsOut/lore.js";
import { BLOBBY_KONTO, zaehleBlobbyPartie, BLOBBY_STATISTIK } from "../../Blobby/kontoStand.js";
import { WORLDFLIP_KONTO, zaehleWorldflipRunde, WF_STATISTIK } from "../../Worldflip/kontoStand.js";
import { SS_KONTO, zaehleDuell, zaehleMoorwanderung, SS_STATISTIK } from "../../SacrificeSigils/kontoStand.js";
import { SPIELEABEND_KONTO, zaehleSpieleabendPartie, SA_STATISTIK } from "../../Spieleabend/kontoStand.js";
import { SEED_RUNNERS_KONTO, zaehleRennen, zaehleTagesrennen, SR_STATISTIK } from "../../SeedRunners/kontoStand.js";
import { ADVENTURE_KONTO, ABZEICHEN as AV_ABZEICHEN, aktualisiereSpiegel, SPIEGEL_SCHLUESSEL } from "../../Adventure/kontoStand.js";

const require = createRequire(import.meta.url);
const { KATALOG: ERFOLGE, ID_FORM } = require("../../../../../Backend/konto/erfolge.js");
const { KATALOG: BESTWERTE } = require("../../../../../Backend/konto/bestwerte.js");
const { SPIELE } = require("../../../../../Backend/analytics/spiele.js");

function speicher(start = {}) {
  const m = new Map(Object.entries(start).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

// Ein üppiger Stand je Spiel, bei dem möglichst alle Abzeichen und Bestwerte fallen
const VOLL = {
  "flick-soccer": [FLICK_KONTO, { played: 60, wins: 40, goals: 150, maxGoals: 4, cleanSheets: 2, winsProfi: 1, onlineWins: 1, tour: Object.fromEntries(TOUR_STAGES.map((t) => [t.id, 2])), trick: Object.fromEntries(TRICKS.map((t) => [t.id, 1])) }],
  "lights-out": [LIGHTS_OUT_KONTO, { level: 3, notes: ALL_NOTES.map((n) => n.id), best: 1122, fluchten: 2, koop: true }],
  blobby: [BLOBBY_KONTO, { partien: 60, siege: 30, zuNull: 1, koenigSerie: 4 }],
  worldflip: [WORLDFLIP_KONTO, { runden: 20, siege: 12, teamSiege: 1, menschenSiege: 2 }],
  "sacrifice-and-sigils": [SS_KONTO, { duelle: 20, duellSiege: 11, moorwanderungen: 3, moorSiege: 1, moorPodest: 2 }],
  spieleabend: [SPIELEABEND_KONTO, { partien: 9, siege: 5, vierGewinnt: 1, maedn: 1, hochstapler: 1, entlarvt: 1 }],
  "seed-runners": [SEED_RUNNERS_KONTO, { rennen: 30, siege: 12, tagesrennen: 8 }],
  adventures: [ADVENTURE_KONTO, { laeufe: 40, siege: 6, punkte: 123456, tiefe: 21, erfolge: Object.values(AV_ABZEICHEN) }],
};

test("Jedes angebundene Spiel ist ein Spiel der Statistik und meldet nur Abzeichen/Bestwerte aus dem Katalog", () => {
  const ids = new Set(SPIELE.map((s) => s.id));
  for (const [spiel, [k, stand]] of Object.entries(VOLL)) {
    assert.ok(ids.has(spiel), spiel);
    const erfolge = k.erfolge(stand);
    const katalog = (ERFOLGE[spiel] || []).map((e) => e.id);
    assert.deepEqual([...erfolge].sort(), [...katalog].sort(), `${spiel}: der volle Stand schaltet genau den Katalog frei`);
    const werte = k.bestwerte(stand);
    assert.deepEqual(Object.keys(werte).sort(), (BESTWERTE[spiel] || []).map((b) => b.id).sort(), `${spiel}: Bestwerte`);
    for (const w of Object.values(werte)) assert.ok(Number.isFinite(w) && w > 0, `${spiel}: ${w}`);
    assert.ok(Number.isInteger(k.xp(stand)) && k.xp(stand) > 0, `${spiel}: xp`);
    // Leerer Stand: nichts frei, keine XP, nichts geht kaputt
    assert.deepEqual(k.erfolge({}), [], `${spiel}: leer`);
    assert.equal(k.xp({}), 0, `${spiel}: leer xp`);
  }
});

test("Katalog: Flick-Soccer-Abzeichen sind echte Erfolge im Spiel, alle IDs gültig, Texte zweisprachig", () => {
  const imSpiel = new Set(ACHIEVEMENTS.map((a) => a.id));
  for (const id of KONTO_ABZEICHEN) assert.ok(imSpiel.has(id), id);
  for (const [spiel, liste] of Object.entries(ERFOLGE)) {
    assert.equal(new Set(liste.map((e) => e.id)).size, liste.length, `${spiel}: doppelte ID`);
    for (const e of liste) {
      assert.match(e.id, ID_FORM, `${spiel}:${e.id}`);
      assert.ok(e.name?.de && e.name?.en && e.text?.de && e.text?.en, `${spiel}:${e.id} DE/EN`);
    }
  }
  for (const [spiel, liste] of Object.entries(BESTWERTE)) {
    for (const b of liste) {
      assert.ok(["zeit", "zahl"].includes(b.art) && ["kleiner", "groesser"].includes(b.besser), `${spiel}:${b.id}`);
      assert.ok(b.name?.de && b.name?.en, `${spiel}:${b.id} DE/EN`);
    }
  }
});

test("Helfer: Zusammenführen nimmt je Wert das Größere, vereinigt Listen, Bestzeit = kleinste", () => {
  assert.deepEqual(maxZaehler({ a: 3, b: 1 }, { a: 2, b: 5, c: 9 }, ["a", "b"]), { a: 3, b: 5 });
  assert.deepEqual(maxJeSchluessel({ x: 1, y: 3 }, { y: 2, z: 1 }), { x: 1, y: 3, z: 1 });
  assert.deepEqual(vereinige(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
  assert.equal(kleinsterPositiver(0, 90, 70), 70);
  assert.equal(kleinsterPositiver(0, null), 0);
});

test("Zähler-Statistik: zählt je Partie einmal, meldet die Änderung, übernimmt beim Zusammenführen den Browser-Merker", () => {
  const s = speicher();
  const stat = zaehlerStatistik({ spiel: "test-spiel", schluessel: "k", felder: ["partien", "siege"], maxFelder: ["serie"] });
  let gemeldet = 0;
  const ab = beiAenderung("test-spiel", () => { gemeldet += 1; });
  assert.equal(stat.zaehle("p1", { partien: 1, siege: 1 }, { serie: 2 }, s), true);
  assert.equal(stat.zaehle("p1", { partien: 1 }, {}, s), false, "dieselbe Partie zählt nicht doppelt");
  assert.equal(stat.zaehle("p2", { partien: 1, fremd: 5 }, { serie: 1 }, s), true);
  ab();
  assert.deepEqual(stat.lies(s), { partien: 2, siege: 1, serie: 2, zuletzt: "p2" });
  assert.equal(gemeldet, 2);
  assert.deepEqual(stat.zusammenfuehren({ partien: 9, siege: 0, serie: 1, zuletzt: "x" }, { partien: 2, siege: 1, serie: 2, zuletzt: "p2" }),
    { partien: 9, siege: 1, serie: 2, zuletzt: "p2" });
});

test("Abgleich mit dem Konto: zwei Geräte führen zusammen statt zu überschreiben", () => {
  const [t1, t2] = TOUR_STAGES.map((t) => t.id);
  const a = TRICKS[0].id;
  const konto = { played: 10, wins: 2, tour: { [t1]: 1 }, trick: {} };
  const browser = { played: 3, wins: 3, tour: { [t1]: 3, [t2]: 1 }, trick: { [a]: 2 } };
  const e = entscheideAbgleich({ server: { daten: konto, xp: 100, version: 4 }, lokal: browser, xp: FLICK_KONTO.xp, zusammenfuehren: FLICK_KONTO.zusammenfuehren });
  assert.equal(e.aktion, "beides");
  assert.equal(e.stand.played, 10);
  assert.equal(e.stand.wins, 3);
  assert.deepEqual(e.stand.tour, { [t1]: 3, [t2]: 1 });
  assert.deepEqual(e.stand.trick, { [a]: 2 });
  // Erster Login mit Browser-Stand: hochladen; neues Gerät ohne Stand: übernehmen
  assert.equal(entscheideAbgleich({ server: null, lokal: browser, xp: FLICK_KONTO.xp }).aktion, "hochladen");
  assert.equal(entscheideAbgleich({ server: { daten: konto, xp: 100, version: 1 }, lokal: null, xp: FLICK_KONTO.xp }).aktion, "uebernehmen");
});

test("Lights Out: vier Browser-Schlüssel ↔ ein Stand am Konto; Flucht und Koop werden gezählt", () => {
  const s = speicher({ "lo:progress": { level: 2 }, "lo:notes": { ids: ["g3", "gibts-nicht"] }, "lo:best-run": { time: 1200 } });
  zaehleFlucht({}, s);
  zaehleFlucht({ koop: true }, s);
  const stand = liesStand(s);
  assert.deepEqual(stand, { level: 2, notes: ["g3"], best: 1200, fluchten: 2, koop: true });
  assert.equal(liesStand(speicher()), null, "nie gespielt: kein Stand");
  const neu = speicher();
  schreibStand(LIGHTS_OUT_KONTO.zusammenfuehren(stand, { level: 3, notes: ["w1"], best: 1000, fluchten: 1 }), neu);
  assert.deepEqual(liesStand(neu), { level: 3, notes: ["g3", "w1"].filter((id) => ALL_NOTES.some((n) => n.id === id)), best: 1000, fluchten: 2, koop: true });
  assert.deepEqual(LIGHTS_OUT_KONTO.bestwerte(stand), { "schnellste-flucht": 1200000 });
  assert.deepEqual(LIGHTS_OUT_KONTO.erfolge({ best: 900 }), ["erste-ebene", "entkommen"], "alte Bestzeit zählt als Flucht");
});

test("Blobby, Worldflip, S&S, Spieleabend, Seed Runners zählen ihre Partien", () => {
  const s = speicher();
  zaehleBlobbyPartie({ code: "ABC", matchId: 1, gewonnen: true, gegenpunkte: 0, koenigSerie: 3 }, s);
  zaehleBlobbyPartie({ code: "ABC", matchId: 1, gewonnen: true, gegenpunkte: 0, koenigSerie: 3 }, s);
  zaehleBlobbyPartie({ code: "ABC", matchId: 2, gewonnen: false, gegenpunkte: 7, koenigSerie: 9 }, s);
  assert.deepEqual(BLOBBY_STATISTIK.lies(s), { partien: 2, siege: 1, zuNull: 1, koenigSerie: 3, zuletzt: "ABC:2" });
  assert.deepEqual(BLOBBY_KONTO.erfolge(BLOBBY_STATISTIK.lies(s)), ["erster-sieg", "zu-null", "koenig"]);

  zaehleWorldflipRunde({ partie: "R:1", gewonnen: true, team: true, menschen: true }, s);
  zaehleWorldflipRunde({ partie: "R:2", gewonnen: false }, s);
  assert.deepEqual(WF_STATISTIK.lies(s), { runden: 2, siege: 1, teamSiege: 1, menschenSiege: 1, zuletzt: "R:2" });

  assert.equal(zaehleDuell({ seed: "TUTORIAL3", modus: "local", gewonnen: true }, s), false, "Tutorial zählt nicht");
  assert.equal(zaehleDuell({ seed: "ABCD", modus: "hotseat", gewonnen: true }, s), false, "Hotseat zählt nicht");
  zaehleDuell({ seed: "ABCD", modus: "online", gewonnen: true }, s);
  zaehleMoorwanderung({ seed: "MOOR1", platz: 2 }, s);
  assert.deepEqual(SS_STATISTIK.lies(s), { duelle: 1, duellSiege: 1, moorwanderungen: 1, moorSiege: 0, moorPodest: 1, zuletzt: "moor:MOOR1" });

  zaehleSpieleabendPartie({ partie: "Z:1", spiel: "zeichnen", gewonnen: true, warHochstapler: true }, s);
  zaehleSpieleabendPartie({ partie: "Z:2", spiel: "vierGewinnt", gewonnen: true }, s);
  assert.deepEqual(SPIELEABEND_KONTO.erfolge(SA_STATISTIK.lies(s)), ["vier-in-reihe", "hochstapler"]);

  zaehleRennen({ id: "r1", platz: 1, teilnehmer: 1 }, s); // allein im Raum: kein Sieg
  zaehleRennen({ id: "r2", platz: 1, teilnehmer: 3 }, s);
  zaehleTagesrennen("2026-11-17", s);
  zaehleTagesrennen("2026-11-17", s);
  assert.deepEqual(SR_STATISTIK.lies(s), { rennen: 2, siege: 1, tagesrennen: 1, zuletzt: "tag:2026-11-17" });
});

test("adVentures: der Spiegel des Server-Profils wächst nur, ein kleineres Profil verkleinert ihn nicht", () => {
  const s = speicher();
  aktualisiereSpiegel({ runs: 0, achievements: [] }, s);
  assert.equal(s.getItem(SPIEGEL_SCHLUESSEL), null, "nie gespielt: kein Spiegel");
  aktualisiereSpiegel({ runs: 30, wins: 2, best: { score: 5000 }, depthBest: 9, achievements: ["sieg", "ersterBoss", "kills1000"] }, s);
  aktualisiereSpiegel({ runs: 3, wins: 0, best: null, depthBest: 0, achievements: ["tiefe20"] }, s);
  const stand = JSON.parse(s.getItem(SPIEGEL_SCHLUESSEL));
  assert.deepEqual(stand, { laeufe: 30, siege: 2, punkte: 5000, tiefe: 9, erfolge: ["drachentoeter", "erster-boss", "bodenlos"] });
  assert.equal(ADVENTURE_KONTO.xp(stand), 300);
});
