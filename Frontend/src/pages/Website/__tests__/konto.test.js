// Konto im Browser: Abgleich Browser-Stand ↔ Konto-Stand (utils/kontoAbgleich.js), Texte von Profil und Anmeldung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingKeys } from "../../../i18n/core.js";
import { entscheideAbgleich, mehrXpGewinnt, sichereXp } from "../../../utils/kontoAbgleich.js";
import { PROFIL_TEXTE } from "../profilTexte.js";
import { ANMELDUNG_TEXTE, hinweisText } from "../../../components/anmeldungTexte.js";

const xp = (s) => s?.xp ?? 0;
const server = (daten, version = 3) => ({ daten, xp: xp(daten), version });

test("erster Login: Browser-Stand geht ans Konto, ohne beides passiert nichts", () => {
  assert.deepEqual(entscheideAbgleich({ server: null, lokal: { xp: 5 }, xp }), { aktion: "hochladen", stand: { xp: 5 } });
  assert.deepEqual(entscheideAbgleich({ server: null, lokal: null, xp }), { aktion: "nichts" });
});

test("neues Gerät ohne Browser-Stand bekommt den Konto-Stand", () => {
  assert.deepEqual(entscheideAbgleich({ server: server({ xp: 40 }), lokal: undefined, xp }), { aktion: "uebernehmen", stand: { xp: 40 } });
});

test("verschiedene Stände: Standard ist mehr XP gewinnt, gleiche Stände tun nichts", () => {
  assert.deepEqual(entscheideAbgleich({ server: server({ xp: 40 }), lokal: { xp: 40 }, xp }), { aktion: "nichts" });
  assert.deepEqual(entscheideAbgleich({ server: server({ xp: 40 }), lokal: { xp: 10 }, xp }), { aktion: "uebernehmen", stand: { xp: 40 } });
  assert.deepEqual(entscheideAbgleich({ server: server({ xp: 40 }), lokal: { xp: 90 }, xp }), { aktion: "hochladen", stand: { xp: 90 } });
  assert.equal(mehrXpGewinnt({ xp: 1 }, { xp: 1 }, xp).xp, 1, "Gleichstand: Konto");
});

test("eigenes Zusammenführen eines Spiels: Ergebnis geht in beide Richtungen", () => {
  const vereinen = (k, b) => ({ xp: k.xp + b.xp, pokale: [...new Set([...k.pokale, ...b.pokale])].sort() });
  const e = entscheideAbgleich({ server: server({ xp: 10, pokale: ["a"] }), lokal: { xp: 5, pokale: ["b"] }, xp, zusammenfuehren: vereinen });
  assert.deepEqual(e, { aktion: "beides", stand: { xp: 15, pokale: ["a", "b"] } });
});

test("XP: kaputte Werte werden 0", () => {
  assert.equal(sichereXp(xp, { xp: 12.9 }), 12);
  assert.equal(sichereXp(xp, { xp: -4 }), 0);
  assert.equal(sichereXp(() => { throw new Error("x"); }, {}), 0);
  assert.equal(sichereXp(xp, { xp: "viel" }), 0);
});

test("Texte: Englisch vollständig für Profil und Anmeldung, jeder Fehlergrund des Servers hat einen Text", () => {
  assert.deepEqual(missingKeys(PROFIL_TEXTE.dict("de"), PROFIL_TEXTE.dict("en")), []);
  assert.deepEqual(missingKeys(ANMELDUNG_TEXTE.dict("de"), ANMELDUNG_TEXTE.dict("en")), []);
  const t = ANMELDUNG_TEXTE.dict("de");
  for (const grund of ["doppelt", "schon-verknuepft", "abgebrochen", "abgelaufen", "discord", "discord-aus", "server"]) {
    assert.notEqual(hinweisText(t, { status: "fehler", grund }), t.hinweise.fehler.sonst, grund);
  }
  assert.equal(hinweisText(t, { status: "angemeldet", name: "Mia" }), "Angemeldet als Mia.");
  assert.equal(hinweisText(t, { status: "fehler", grund: "unbekannt" }), t.hinweise.fehler.sonst);
});
