// npm test -- Website — Laden: Texte vollständig auf Englisch, Preise lesbar, die Schnellsuche zeigt /laden nur, wenn
// verkauft werden darf.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { LADEN_TEXTE } from "../ladenTexte.js";
import { euro, nachSpiel } from "../../../utils/laden.js";
import { seitenIndex, suche } from "../../../utils/schnellsuche.js";

test("Englisch ist vollständig (Laden)", () => {
  assert.deepEqual(missingKeys(LADEN_TEXTE.dict("de"), LADEN_TEXTE.dict("en")), []);
});

test("Preise: ganze Euro ohne Nachkommastellen, sonst mit zwei", () => {
  assert.equal(euro(500).replace(/\s/g, " "), "5 €");
  assert.equal(euro(199).replace(/\s/g, " "), "1,99 €");
  assert.equal(euro(2500, "en"), "€25");
});

test("Schnellsuche: /laden nur mit freigegebenem Verkauf", () => {
  assert.ok(!seitenIndex([], "de").some((e) => e.ziel === "/laden"));
  assert.equal(suche(seitenIndex([], "de", { verkauf: true }), "unterstützen")[0].ziel, "/laden");
  assert.equal(suche(seitenIndex([], "en", { verkauf: true }), "support")[0].ziel, "/laden");
});

test("Designs nach Spiel: Reihenfolge des Katalogs, Infos vom Server, ohne Info trotzdem eine Gruppe", () => {
  const artikel = [
    { id: "fs-a", spiel: "flick-soccer" }, { id: "wf-a", spiel: "worldflip" }, { id: "fs-b", spiel: "flick-soccer" }, { id: "x-a", spiel: "neu" },
  ];
  const spiele = { "flick-soccer": { name: { de: "Flick Soccer", en: "Flick Soccer" }, pfad: "/flick-soccer", wo: { de: "Profil", en: "Profile" } } };
  const g = nachSpiel(artikel, spiele);
  assert.deepEqual(g.map((x) => x.spiel), ["flick-soccer", "worldflip", "neu"]);
  assert.deepEqual(g[0].artikel.map((a) => a.id), ["fs-a", "fs-b"]);
  assert.equal(g[0].info.pfad, "/flick-soccer");
  assert.equal(g[1].info.pfad, "/");
  assert.equal(g[1].info.wo, null);
  assert.deepEqual(nachSpiel(), []);
});
