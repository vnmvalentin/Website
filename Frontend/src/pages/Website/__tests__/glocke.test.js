// npm test -- Website — Glocke: Zähler, Stream je startedAt nur einmal neu, Zeitangaben, Ziele von Einträgen,
// Texte vollständig auf Englisch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { GLOCKE_TEXTE } from "../../../components/glockeTexte.js";
import { HUELLE_TEXTE } from "../../../components/huelleTexte.js";
import { liveGesehen, merkeLive, zaehleNeues, vorZeit, eintragZiel } from "../../../utils/glocke.js";

function speicher() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test("Englisch ist vollständig (Glocke, Hülle)", () => {
  assert.deepEqual(missingKeys(GLOCKE_TEXTE.dict("de"), GLOCKE_TEXTE.dict("en")), []);
  assert.deepEqual(missingKeys(HUELLE_TEXTE.dict("de"), HUELLE_TEXTE.dict("en")), []);
});

test("Zähler: Nachrichten + neue Updates + ungesehener Stream", () => {
  assert.equal(zaehleNeues({ ungelesen: 2, neueUpdates: 1, liveNeu: true }), 4);
  assert.equal(zaehleNeues({}), 0);
  assert.equal(zaehleNeues({ ungelesen: -3, neueUpdates: "x" }), 0);
});

test("Stream: jeder Start einmal neu", () => {
  const s = speicher();
  const start = "2026-11-17T18:00:00Z";
  assert.equal(liveGesehen(start, s), false);
  merkeLive(start, s);
  assert.equal(liveGesehen(start, s), true);
  assert.equal(liveGesehen("2026-11-18T18:00:00Z", s), false, "nächster Stream ist wieder neu");
  assert.equal(liveGesehen(null, s), true, "ohne Startzeit nichts zählen");
});

test("Zeitangaben und Ziele", () => {
  const jetzt = Date.UTC(2026, 10, 17, 12, 0, 0);
  assert.equal(vorZeit(jetzt - 20_000, { jetzt }), "gerade eben");
  assert.match(vorZeit(jetzt - 5 * 60_000, { jetzt }), /5 Min/);
  assert.match(vorZeit(jetzt - 3 * 3600_000, { jetzt, lang: "en" }), /3 hr/);
  assert.match(vorZeit(jetzt - 10 * 86400_000, { jetzt }), /7\. Nov/);
  assert.equal(eintragZiel("/?glocke=1"), null, "öffnet nur die Glocke");
  assert.equal(eintragZiel("/clash-royale/turnier/abc"), "/clash-royale/turnier/abc");
  assert.equal(eintragZiel("https://twitch.tv/vnmvalentin"), "https://twitch.tv/vnmvalentin");
  assert.equal(eintragZiel("//evil.example"), null);
  assert.equal(eintragZiel("javascript:alert(1)"), null);
});
