// npm test -- Website — Schnellsuche: Normalisieren, Bewerten (Titel vor Stichwort vor Beschreibung), Seitenliste
// samt Extras ohne Doppelte, Karten, Spieler-Tags, „Zuletzt gewählt“, Texte vollständig auf Englisch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { SCHNELLSUCHE_TEXTE } from "../../../components/schnellsucheTexte.js";
import { normalisiere, bewerte, suche, seitenIndex, kartenIndex, alsTag, merkeZiel, zuletztGewaehlt } from "../../../utils/schnellsuche.js";

const KATEGORIEN = [
  { key: "fun", label: "Fun", to: "/fun", tagline: "Spiele & Zeitvertreib", description: "Browser-Games", links: [
    { id: "connect4", label: "Connect 4", to: "/connect4", description: "Vier Gewinnt gegen einen Freund" },
    { id: "garden", label: "Virtual Farm", to: "/garden", description: "Deine eigene Farm" },
    { id: "geheim", label: "Bald", to: "/bald", soon: true },
  ] },
  { key: "contact", label: "Contact", to: "/contact", links: [
    { label: "Discord", href: "https://discord.gg/x", description: "Community-Server" },
    { label: "Feedback", action: "feedback", description: "Ideen und Bug-Reports" },
  ] },
  { key: "tools", label: "Streamer-Tools", to: "/tools", links: [] },
];

function speicher() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test("Englisch ist vollständig (Schnellsuche)", () => {
  assert.deepEqual(missingKeys(SCHNELLSUCHE_TEXTE.dict("de"), SCHNELLSUCHE_TEXTE.dict("en")), []);
});

test("Normalisieren: klein, ohne Akzente, ß → ss", () => {
  assert.equal(normalisiere("  Größe   Über-Spiel! "), "grosse uber spiel");
  assert.equal(normalisiere("#2PP"), "#2pp");
});

test("Bewerten: genauer Titel > Titelanfang > Wortanfang > Stichwort > Beschreibung; jedes Wort muss passen", () => {
  const e = { titel: "Virtual Farm", text: "Deine eigene Farm", stichwoerter: "garten" };
  assert.equal(bewerte(e, "virtual farm"), 100);
  assert.equal(bewerte(e, "virt"), 80);
  assert.equal(bewerte(e, "farm"), 60);
  assert.equal(bewerte(e, "garten"), 30);
  assert.equal(bewerte(e, "eigene"), 10);
  assert.equal(bewerte(e, "farm schach"), 0);
  assert.equal(bewerte(e, ""), 0);
});

test("Seitenliste: Bereiche, Unterseiten, Extras, ohne „bald“ und ohne doppelte Ziele", () => {
  const idx = seitenIndex(KATEGORIEN, "de");
  const ziele = idx.map((e) => e.ziel || e.aktion);
  assert.ok(ziele.includes("/connect4"));
  assert.ok(ziele.includes("/profile"), "Extra-Seite");
  assert.ok(!ziele.includes("/bald"));
  assert.equal(ziele.filter((z) => z === "/tools").length, 1, "/tools steht in der Liste und als Extra");
  assert.deepEqual(suche(idx, "vier gewinnt").map((e) => e.ziel), ["/connect4"]);
  assert.equal(suche(idx, "garten")[0].ziel, "/garden");
  const fb = suche(idx, "feedback")[0];
  assert.deepEqual([fb.aktion, fb.ziel], ["feedback", null]);
  assert.equal(suche(idx, "discord")[0].extern, true);
  assert.equal(seitenIndex(KATEGORIEN, "en").find((e) => e.ziel === "/profile").titel, "Profile");
});

test("Karten und Spieler-Tags", () => {
  const karten = kartenIndex([{ id: "hog-rider", name: "Hog Rider", rarity: "Rare" }, { id: "giant", name: "Giant", rarity: "Rare" }, { id: "royal-giant", name: "Royal Giant", rarity: "Common" }]);
  assert.deepEqual(suche(karten, "giant").map((k) => k.titel), ["Giant", "Royal Giant"]);
  assert.equal(suche(karten, "hog")[0].ziel, "/clash/karten/hog-rider");
  assert.equal(alsTag("#2ppo"), "2PP0");
  assert.equal(alsTag("2PPLV"), "2PPLV");
  assert.equal(alsTag("pyl"), null, "Wort ohne # und ohne Ziffer ist kein Tag");
  assert.equal(alsTag("#ABC"), null);
});

test("Zuletzt gewählt: vorn einreihen, keine Doppelten, keine Aktionen oder externen Links, höchstens 6", () => {
  const s = speicher();
  merkeZiel({ art: "seite", titel: "Connect 4", ziel: "/connect4" }, s);
  merkeZiel({ art: "karte", titel: "Hog Rider", ziel: "/clash/karten/hog-rider", kartenId: "hog-rider" }, s);
  merkeZiel({ art: "seite", titel: "Connect 4", ziel: "/connect4" }, s);
  merkeZiel({ art: "seite", titel: "Discord", ziel: "https://discord.gg/x", extern: true }, s);
  merkeZiel({ art: "seite", titel: "Feedback", ziel: null, aktion: "feedback" }, s);
  assert.deepEqual(zuletztGewaehlt(s).map((e) => e.ziel), ["/connect4", "/clash/karten/hog-rider"]);
  for (let i = 0; i < 10; i++) merkeZiel({ art: "spieler", titel: `S${i}`, ziel: `/clash/spieler/${i}` }, s);
  assert.equal(zuletztGewaehlt(s).length, 6);
});
