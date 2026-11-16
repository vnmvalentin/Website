// Die englischen Texte der Win Challenge sind vollständig (gleiche Schlüssel, gleiche Art wie Deutsch).
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { WC_I18N, WC_LANGS, dictForWc } from "../wcI18n.js";

test("Win Challenge: Englisch hat jeden deutschen Schlüssel", () => {
  assert.deepEqual(missingKeys(WC_I18N.de, WC_I18N.en), []);
});

test("Win Challenge: Englisch hat keine Schlüssel, die es auf Deutsch nicht gibt", () => {
  assert.deepEqual(missingKeys(WC_I18N.en, WC_I18N.de), []);
});

test("Win Challenge: Sprachen und Rückfall", () => {
  assert.deepEqual(WC_LANGS, ["de", "en"]);
  assert.equal(dictForWc("en").language, "Language");
  assert.equal(dictForWc("es").language, "Sprache", "unbekannte Sprache → Deutsch");
});
