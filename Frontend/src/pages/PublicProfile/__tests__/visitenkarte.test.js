// npm test -- PublicProfile — Visitenkarte: Texte vollständig auf Englisch, Bestwerte formatieren, Reihenfolge und Vitrine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { VISITENKARTE_TEXTE } from "../visitenkarteTexte.js";
import { formatiereBestwert, verschiebe, schalteVitrine, nameIn, zahl } from "../visitenkarte.js";

test("Englisch ist vollständig", () => {
  assert.deepEqual(missingKeys(VISITENKARTE_TEXTE.dict("de"), VISITENKARTE_TEXTE.dict("en")), []);
});

test("Bestwerte: Zeiten mit Hundertsteln, ab einer Stunde mit Stunden; Zahlen mit Trennung", () => {
  assert.equal(formatiereBestwert("zeit", 83_456), "1:23,45");
  assert.equal(formatiereBestwert("zeit", 83_456, "en"), "1:23.45");
  assert.equal(formatiereBestwert("zeit", 5_000), "0:05,00");
  assert.equal(formatiereBestwert("zeit", 3_723_000), "1:02:03");
  assert.equal(formatiereBestwert("zahl", 12345), "12.345");
  assert.equal(formatiereBestwert("zahl", 12345, "en"), "12,345");
  assert.equal(formatiereBestwert("zeit", "kaputt"), "0:00,00");
  assert.equal(zahl(-0), "0");
});

test("Reihenfolge: verschieben in den Grenzen", () => {
  assert.deepEqual(verschiebe(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(verschiebe(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
  const l = ["a", "b"];
  assert.equal(verschiebe(l, 0, -1), l);
  assert.equal(verschiebe(l, 1, 1), l);
});

test("Vitrine: an, aus, höchstens sechs", () => {
  assert.deepEqual(schalteVitrine([], "x:a"), { vitrine: ["x:a"], voll: false });
  assert.deepEqual(schalteVitrine(["x:a", "x:b"], "x:a"), { vitrine: ["x:b"], voll: false });
  const sechs = ["1", "2", "3", "4", "5", "6"];
  assert.deepEqual(schalteVitrine(sechs, "7"), { vitrine: sechs, voll: true });
});

test("Namen in der Sprache der Seite, sonst Deutsch, sonst Ersatz", () => {
  assert.equal(nameIn({ de: "Sieg", en: "Win" }, "en"), "Win");
  assert.equal(nameIn({ de: "Sieg" }, "en"), "Sieg");
  assert.equal(nameIn(null, "en", "sieg"), "sieg");
});
