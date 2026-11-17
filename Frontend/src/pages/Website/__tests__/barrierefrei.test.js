// npm test -- Website — Barrierefreiheit (utils/barrierefrei.js): Einstellungen je Gerät, Attribute auf <html> für
// index.css, Systemeinstellungen, Untertitel für Spiele und die Texte der Seite /barrierefreiheit auf Englisch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { BARRIEREFREI_TEXTE } from "../../../components/barrierefreiTexte.js";
import {
  BARRIEREFREI_STANDARD, FARBHILFE_FARBEN, FARBHILFE_ZEICHEN, SPIELE_MIT, bereinige, createBarrierefrei,
  abonniereGeraeusche, meldeGeraeusch, setzeBarrierefrei, untertitelAn,
} from "../../../utils/barrierefrei.js";
import { EXTRA_SEITEN } from "../../../utils/schnellsuche.js";

function speicher(start = {}) {
  const daten = { ...start };
  return {
    daten,
    getItem: (k) => (k in daten ? daten[k] : null),
    setItem: (k, v) => { daten[k] = String(v); },
    removeItem: (k) => { delete daten[k]; },
  };
}

function medien(an = {}) {
  const hoerer = {};
  const fn = (q) => ({ matches: Boolean(an[q]), addEventListener: (_art, h) => { (hoerer[q] ||= []).push(h); } });
  fn.aendere = (q, wert) => { an[q] = wert; (hoerer[q] || []).forEach((h) => h()); };
  return fn;
}

test("Unbekannte Felder und Werte fallen auf den Standard zurück", () => {
  assert.deepEqual(bereinige(null), BARRIEREFREI_STANDARD);
  assert.deepEqual(bereinige({ bewegung: "aus", kontrast: "hoch", farbhilfe: "ja", untertitel: true, fremd: 1 }),
    { bewegung: "system", kontrast: "hoch", farbhilfe: false, untertitel: true });
});

test("Setzen: merkt nur Abweichungen, setzt Attribute auf <html> und meldet Hörern", () => {
  const sp = speicher();
  const wurzel = { dataset: {} };
  const b = createBarrierefrei({ speicher: sp, medien: medien(), wurzel });
  const gemeldet = [];
  b.abonniere((s) => gemeldet.push(s));
  b.setze({ bewegung: "reduziert", farbhilfe: true });
  assert.deepEqual(JSON.parse(sp.daten.barrierefrei), { bewegung: "reduziert", farbhilfe: true });
  assert.equal(wurzel.dataset.bewegung, "reduziert");
  assert.equal(wurzel.dataset.farbhilfe, "");
  assert.equal(wurzel.dataset.kontrast, undefined);
  assert.equal(gemeldet.length, 1);
  b.setze({ farbhilfe: true }); // unverändert: keine Meldung
  assert.equal(gemeldet.length, 1);
  b.setze({ bewegung: "system", farbhilfe: false });
  assert.equal(sp.daten.barrierefrei, undefined, "zurück auf Standard: Speicher leer");
  assert.equal(wurzel.dataset.bewegung, undefined);
  assert.equal(wurzel.dataset.farbhilfe, undefined);
});

test("Gespeicherte Wahl gilt beim Start; kaputter Speicher schadet nicht", () => {
  const b = createBarrierefrei({ speicher: speicher({ barrierefrei: '{"kontrast":"hoch","untertitel":true}' }) });
  assert.equal(b.lies().kontrast, "hoch");
  assert.equal(b.untertitelAn(), true);
  const kaputt = createBarrierefrei({ speicher: speicher({ barrierefrei: "{nicht json" }) });
  assert.deepEqual(kaputt.lies(), BARRIEREFREI_STANDARD);
});

test("System: reduzierte Bewegung zählt für Spiele, mehr Kontrast setzt das Attribut — auch bei späterer Änderung", () => {
  const m = medien({ "(prefers-reduced-motion: reduce)": true });
  const wurzel = { dataset: {} };
  const b = createBarrierefrei({ speicher: speicher(), medien: m, wurzel });
  b.setzeAttribute();
  b.beobachteSystem();
  assert.equal(b.bewegungReduziert(), true);
  assert.equal(wurzel.dataset.bewegung, undefined, "„Wie im System“ setzt die harte Regel nicht");
  assert.equal(wurzel.dataset.kontrast, undefined);
  let meldungen = 0;
  b.abonniere(() => { meldungen += 1; });
  m.aendere("(prefers-contrast: more)", true);
  assert.equal(wurzel.dataset.kontrast, "hoch");
  assert.equal(b.mehrKontrast(), true);
  assert.equal(meldungen, 1);
});

test("OBS und Overlays bekommen keine Attribute", () => {
  const wurzel = { dataset: {} };
  const b = createBarrierefrei({ speicher: speicher(), wurzel, overlay: true });
  b.setze({ bewegung: "reduziert", kontrast: "hoch", farbhilfe: true });
  assert.deepEqual(wurzel.dataset, {});
});

test("Anderer Tab hat umgestellt: neu lesen übernimmt es", () => {
  const sp = speicher();
  const wurzel = { dataset: {} };
  const b = createBarrierefrei({ speicher: sp, wurzel });
  sp.setItem("barrierefrei", '{"farbhilfe":true}');
  b.neuLesen();
  assert.equal(b.farbhilfeAn(), true);
  assert.equal(wurzel.dataset.farbhilfe, "");
});

test("Untertitel: nichts, solange aus; danach an die Anzeige, mit Grenzen für die Dauer", () => {
  const empfangen = [];
  const ab = abonniereGeraeusche((e) => empfangen.push(e));
  try {
    assert.equal(untertitelAn(), false);
    assert.equal(meldeGeraeusch("Tür knarrt"), null);
    setzeBarrierefrei({ untertitel: true });
    const id = meldeGeraeusch({ de: "Schritte", en: "Footsteps" }, { richtung: "links", dauerMs: 60000, schluessel: "schritte" });
    assert.equal(typeof id, "number");
    assert.equal(empfangen.length, 1);
    assert.equal(empfangen[0].richtung, "links");
    assert.equal(empfangen[0].dauerMs, 15000);
    assert.equal(empfangen[0].schluessel, "schritte");
  } finally {
    setzeBarrierefrei({ untertitel: false });
    ab();
  }
});

test("Farbhilfe: genug Farben und Zeichen für bis zu sieben Spieler, Spiele-Liste wohlgeformt", () => {
  assert.equal(FARBHILFE_FARBEN.length, 7);
  assert.equal(FARBHILFE_ZEICHEN.length, FARBHILFE_FARBEN.length);
  assert.equal(new Set(FARBHILFE_FARBEN.map((f) => f.hex)).size, 7);
  for (const art of ["farbhilfe", "untertitel"]) {
    for (const s of SPIELE_MIT[art]) assert.ok(s.id && s.name, `${art}: Eintrag braucht id und name`);
  }
});

test("Englisch ist vollständig (Barrierefreiheit) und die Seite steht in der Schnellsuche", () => {
  assert.deepEqual(missingKeys(BARRIEREFREI_TEXTE.dict("de"), BARRIEREFREI_TEXTE.dict("en")), []);
  assert.ok(EXTRA_SEITEN.some((s) => s.ziel === "/barrierefreiheit"));
});
