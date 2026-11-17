// npm test -- Admin — reine Regeln von utils/leistungMessung.js. Liegt hier, weil die Frontend-Tests nur unter src/pages
// gesucht werden.
import test from "node:test";
import assert from "node:assert/strict";
import { istSpielseite, wirdGemessen, clsAus, inpAus, neuerAbschnitt, zaehleBild } from "../../../utils/leistungMessung.js";

test("Spielseiten: Spiele ja, Clash Royale nur der Minigame-Hub", () => {
  for (const p of ["/adventures", "/garden", "/seed-runners/raum/ABC", "/worldflip/spiel", "/clash-royale", "/lights-out", "/spieleabend/XYZ"]) {
    assert.equal(istSpielseite(p), true, p);
  }
  for (const p of ["/", "/fun", "/clash", "/clash-royale/win-tracker", "/clash-royale/turnier/5", "/gardening", "/profile"]) {
    assert.equal(istSpielseite(p), false, p);
  }
});

test("Nicht gemessen: Overlays, Steuer-Links, Admin, Login-Rücksprung", () => {
  for (const p of ["/WinChallengeOverlay/abc", "/twitch-tools/overlay/k", "/WinChallengeControl/k", "/admin", "/auth/twitch"]) {
    assert.equal(wirdGemessen(p), false, p);
  }
  assert.equal(wirdGemessen("/fun"), true);
  assert.equal(wirdGemessen("/adventures"), true);
});

test("CLS: größtes Sitzungsfenster, Sprünge nach Eingaben zählen nicht", () => {
  const e = (value, startTime, hadRecentInput = false) => ({ value, startTime, hadRecentInput });
  assert.equal(clsAus([]), 0);
  // Fenster 1: 0,1 + 0,05 (500 ms auseinander) — Fenster 2 nach 2 s Pause: 0,02
  assert.equal(Math.round(clsAus([e(0.1, 0), e(0.05, 500), e(0.02, 2500)]) * 1000) / 1000, 0.15);
  // Fenster endet spätestens nach 5 s, auch wenn die Sprünge dicht folgen
  const dicht = Array.from({ length: 12 }, (_, i) => e(0.01, i * 600));
  assert.ok(clsAus(dicht) < 0.12);
  assert.equal(clsAus([e(0.5, 0, true), e(0.03, 100)]), 0.03);
});

test("INP: längste Interaktion, ab 50 Interaktionen je 50 eine Ausreißerin weniger", () => {
  assert.equal(inpAus([]), 0);
  assert.equal(inpAus([40, 120, 80]), 120);
  const viele = Array.from({ length: 60 }, (_, i) => i + 1); // 1 … 60
  assert.equal(inpAus(viele), 59);
});

test("Bilder zählen: lange Bilder getrennt, Lücken ab 1 s sind keine Bilder", () => {
  const a = neuerAbschnitt();
  for (const d of [16.7, 16.7, 40, 60, 1200, -1]) zaehleBild(a, d);
  assert.equal(a.bilder, 4);
  assert.equal(a.ueber33, 2);
  assert.equal(a.ueber50, 1);
  assert.equal(Math.round(a.ms * 10) / 10, 133.4);
});
