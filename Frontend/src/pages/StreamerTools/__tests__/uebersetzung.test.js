// Gemeinsamer Übersetzungs-Kern (src/i18n/core.js) und die Texte der Tool-Hülle.
// Der Kern liegt außerhalb von src/pages und wird deshalb hier mitgeprüft (npm test -- StreamerTools).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_LANG, defineMessages, fmt, missingKeys, normalizeLang, pickLang } from "../../../i18n/core.js";
import { SHELL_TEXT } from "../../../components/toolShell/toolShellText.js";

test("normalizeLang nimmt nur bekannte Sprachen an", () => {
  assert.equal(normalizeLang("en"), "en");
  assert.equal(normalizeLang(" EN "), "en");
  assert.equal(normalizeLang("fr"), null);
  assert.equal(normalizeLang(""), null);
  assert.equal(normalizeLang(null), null);
  assert.equal(normalizeLang({ toString: () => "en" }), null);
});

test("pickLang: gewählte Sprache, sonst Englisch für Nicht-Deutsche, sonst Deutsch", () => {
  assert.equal(pickLang("en", ["de", "en"]), "en");
  assert.equal(pickLang("de", ["de", "en"]), "de");
  assert.equal(pickLang("es", ["de", "en"]), "en");
  assert.equal(pickLang("es", ["de"]), "de");
  assert.equal(pickLang("en", ["de"]), "de");
  assert.equal(pickLang("de", ["en"]), "en");
  assert.equal(pickLang("en", undefined), BASE_LANG);
  assert.equal(pickLang(undefined, ["de", "en"]), "de");
});

test("defineMessages füllt Lücken mit Deutsch und lässt Vorhandenes stehen", () => {
  const texts = defineMessages({
    de: { a: "A", nested: { x: "X", y: "Y" }, list: ["1", "2"], count: (n) => `${n} Stück` },
    en: { a: "A-en", nested: { x: "X-en" }, list: ["one"] },
  });
  assert.deepEqual(texts.langs, ["de", "en"]);
  const en = texts.dict("en");
  assert.equal(en.a, "A-en");
  assert.equal(en.nested.x, "X-en");
  assert.equal(en.nested.y, "Y", "fehlender verschachtelter Schlüssel kommt aus Deutsch");
  assert.deepEqual(en.list, ["one"], "Listen werden ersetzt, nicht gemischt");
  assert.equal(en.count(3), "3 Stück", "fehlende Funktion kommt aus Deutsch");
  assert.equal(texts.dict("fr"), texts.dict("de"), "unbekannte Sprache → Deutsch");
  assert.equal(texts.dict("en"), texts.dict("en"), "immer dasselbe Objekt je Sprache");
});

test("defineMessages verlangt Deutsch und kennt nur bekannte Sprachen", () => {
  assert.throws(() => defineMessages({ en: { a: "A" } }), /de/);
  assert.throws(() => defineMessages({ de: { a: "A" }, fr: { a: "A" } }), /fr/);
});

test("langs folgen der festen Reihenfolge, nicht der Schreibweise", () => {
  assert.deepEqual(defineMessages({ en: {}, es: {}, de: {} }).langs, ["de", "en", "es"]);
});

test("missingKeys findet fehlende Schlüssel, falsche Arten und abweichende Listenlängen", () => {
  const de = { a: "A", b: { c: "C", d: "D" }, f: (n) => `${n}`, l: ["x", "y"], o: { p: "P" } };
  const en = { a: "A", b: { c: "C" }, f: "kein Aufruf", l: ["x"], o: "Text statt Objekt" };
  assert.deepEqual(missingKeys(de, en), [
    "b.d",
    "f (function erwartet, string gefunden)",
    "l (Länge 1 statt 2)",
    "o (Objekt erwartet)",
  ]);
  assert.deepEqual(missingKeys(de, de), []);
});

test("fmt setzt Werte ein und lässt Unbekanntes sichtbar stehen", () => {
  assert.equal(fmt("{n} Siege in {mode}", { n: 3, mode: "Ranked" }), "3 Siege in Ranked");
  assert.equal(fmt("{n} von {total}", { n: 0 }), "0 von {total}");
  assert.equal(fmt("ohne Platzhalter"), "ohne Platzhalter");
});

test("Tool-Hülle: Englisch vollständig", () => {
  assert.deepEqual(SHELL_TEXT.langs, ["de", "en"]);
  assert.deepEqual(missingKeys(SHELL_TEXT.dict("de"), SHELL_TEXT.dict("en")), []);
  assert.equal(SHELL_TEXT.dict(undefined).back, "Zu den Streamer-Tools", "ohne Sprache Deutsch");
});
