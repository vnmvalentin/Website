// npm test -- Website — „Jetzt mitspielen“: Texte vollständig auf Englisch, die Seite ist über die Schnellsuche
// auffindbar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { MITSPIELEN_TEXTE } from "../../../components/mitspielenTexte.js";
import { EXTRA_SEITEN, seitenIndex, suche } from "../../../utils/schnellsuche.js";

test("Englisch ist vollständig (Mitspielen)", () => {
  assert.deepEqual(missingKeys(MITSPIELEN_TEXTE.dict("de"), MITSPIELEN_TEXTE.dict("en")), []);
});

test("Schnellsuche findet /mitspielen", () => {
  assert.ok(EXTRA_SEITEN.some((e) => e.ziel === "/mitspielen"));
  assert.equal(suche(seitenIndex([], "de"), "mitspielen")[0].ziel, "/mitspielen");
  assert.equal(suche(seitenIndex([], "en"), "play along")[0].ziel, "/mitspielen");
});
