// npm test -- Website — persönliche Startseite: Tagesaufgaben (CR-Tagesrunde, Seed-Runners-Tagesrennen), „Neu seit
// deinem letzten Besuch“, Texte vollständig auf Englisch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { STARTSEITE_TEXTE } from "../startseiteTexte.js";
import { AUFGABEN_TEXTE, ladeCrTagesrunde, ladeSrTagesrennen, ladeTagesaufgaben } from "../../../utils/tagesaufgaben.js";
import { neueUpdates, merkeGesehen, liesGesehen, teileVersion } from "../../../utils/updatesGesehen.js";
import { todayBerlin, prevDay } from "../../ClashRoyale/clash/dailyRound.js";

function speicher(start = {}) {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

test("Englisch ist vollständig (Startseite und Tagesaufgaben)", () => {
  assert.deepEqual(missingKeys(STARTSEITE_TEXTE.dict("de"), STARTSEITE_TEXTE.dict("en")), []);
  assert.deepEqual(missingKeys(AUFGABEN_TEXTE.dict("de"), AUFGABEN_TEXTE.dict("en")), []);
});

test("CR-Tagesrunde: neu, angefangen mit Serie, fertig", async () => {
  const heute = todayBerlin();
  const gestern = prevDay(heute);
  const voll = { wordle: 90, kartenraten: 50, zoom: 40, pixel: 30, farbe: 70 };

  let r = await ladeCrTagesrunde({ storage: speicher() });
  assert.deepEqual(r, { titel: "CR-Tagesrunde", zeile: "5 Ratespiele, bis zu 500 Punkte", fortschritt: { wert: 0, max: 5 }, fertig: false });

  // Gestern komplett, heute ein Wordle im dritten Versuch (80 Punkte)
  const s = speicher({
    crq_daily_v1: JSON.stringify({ v: 1, days: { [gestern]: voll } }),
    crq_wordle_v1: JSON.stringify({ daily: { day: heute, won: true, guesses: ["a", "b", "c"] } }),
  });
  r = await ladeCrTagesrunde({ storage: s });
  assert.equal(r.zeile, "1/5 gespielt · 80 Punkte · Serie 1");
  assert.deepEqual(r.fortschritt, { wert: 1, max: 5 });

  const fertig = speicher({ crq_daily_v1: JSON.stringify({ v: 1, days: { [gestern]: voll, [heute]: voll } }) });
  r = await ladeCrTagesrunde({ storage: fertig, lang: "en" });
  assert.equal(r.zeile, "Done · 280 of 500 points · 2-day streak");
  assert.equal(r.fertig, true);

  // Heute noch nichts, aber eine laufende Serie
  r = await ladeCrTagesrunde({ storage: speicher({ crq_daily_v1: JSON.stringify({ v: 1, days: { [gestern]: voll } }) }) });
  assert.equal(r.zeile, "Heute noch offen · Serie 1 halten");
});

test("Seed Runners: ohne Spielerkennung keine Abfrage; sonst eigener Platz oder offen", async () => {
  const nieAbfragen = () => { throw new Error("darf nicht abfragen"); };
  let r = await ladeSrTagesrennen({ storage: speicher(), fetchImpl: nieAbfragen });
  assert.equal(r.zeile, "Jeden Tag eine neue Strecke für alle");

  const mitSpieler = speicher({ seedrunners_player: JSON.stringify({ token: "abcdefghijkl", name: "Max" }) });
  const gesendet = [];
  const antwort = (body) => async (url, opt) => { gesendet.push([url, opt]); return { ok: true, json: async () => body }; };
  r = await ladeSrTagesrennen({ storage: mitSpieler, fetchImpl: antwort({ today: [{}, {}, {}], me: { rank: 2 } }) });
  assert.deepEqual([r.zeile, r.fertig], ["Heute auf Platz 2", true]);
  assert.match(gesendet[0][1].headers["X-Player-Key"], /^[0-9a-f]{64}$/, "Schlüssel statt Token");

  r = await ladeSrTagesrennen({ storage: mitSpieler, fetchImpl: antwort({ today: new Array(50).fill({}), me: null }) });
  assert.equal(r.zeile, "Heute noch nicht gelaufen · 50+ im Ziel");
  r = await ladeSrTagesrennen({ storage: mitSpieler, fetchImpl: async () => ({ ok: false }) });
  assert.equal(r, null);
});

test("Tagesaufgaben: kaputte Kachel fällt weg, Reihenfolge bleibt", async () => {
  const liste = [
    { id: "a", pfad: "/a", laden: async () => ({ titel: "A", zeile: "x", fortschritt: null, fertig: false }) },
    { id: "b", pfad: "/b", laden: async () => { throw new Error("kaputt"); } },
    { id: "c", pfad: "/c", laden: async () => null },
    { id: "d", pfad: "/d", laden: async () => ({ titel: "D", zeile: "y", fortschritt: null, fertig: true }) },
  ];
  assert.deepEqual((await ladeTagesaufgaben({}, liste)).map((x) => x.id), ["a", "d"]);
});

test("Neu seit dem letzten Besuch: erster Besuch zeigt nichts, danach nur Neueres", () => {
  const s = speicher();
  const v = (n) => ({ version: `v6.${n}: Titel ${n}`, date: `${n}.11.2026`, sections: [] });
  assert.deepEqual(neueUpdates([v(25), v(24)], s), []);
  assert.equal(liesGesehen(s), "v6.25: Titel 25");
  assert.deepEqual(neueUpdates([v(27), v(26), v(25), v(24)], s).map((u) => u.version), ["v6.27: Titel 27", "v6.26: Titel 26"]);
  merkeGesehen("v6.27: Titel 27", s);
  assert.deepEqual(neueUpdates([v(27), v(26)], s), []);
  // Unbekannter Merker (Liste umgebaut): nichts zeigen, auf die neueste setzen
  merkeGesehen("v1.0: gibt es nicht", s);
  assert.deepEqual(neueUpdates([v(28)], s), []);
  assert.equal(liesGesehen(s), "v6.28: Titel 28");
  assert.deepEqual(teileVersion("v6.25: Clash Royale Stats, Win Tracker"), { nummer: "v6.25", titel: "Clash Royale Stats, Win Tracker" });
  assert.deepEqual(teileVersion("v7"), { nummer: "v7", titel: "v7" });
});
