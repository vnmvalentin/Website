// npm test -- Website — Website-Hülle zweisprachig (Anschluss sprache-huelle): Texte von Kopf, Menü, Verzeichnis,
// Übersichtsseiten und 404 vollständig auf Englisch, und jeder Eintrag der Seitenliste (config/navigation.js) hat
// englischen Namen und Text in config/navigationEnTexte.js.
//
// navigation.js importiert Bilder und lässt sich deshalb in Node nicht laden — die Kennungen kommen aus dem Quelltext.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { missingKeys } from "../../../i18n/core.js";
import { HUELLE_TEXTE } from "../../../components/huelleTexte.js";
import { NAV_EN } from "../../../config/navigationEnTexte.js";

const quelle = fs.readFileSync(fileURLToPath(new URL("../../../config/navigation.js", import.meta.url)), "utf8");
const alle = (feld) => [...quelle.matchAll(new RegExp(`^\\s*${feld}:\\s*"([^"]+)"`, "gm"))].map((m) => m[1]);

test("Englisch ist vollständig (Hülle)", () => {
  assert.deepEqual(missingKeys(HUELLE_TEXTE.dict("de"), HUELLE_TEXTE.dict("en")), []);
});

test("Jeder Bereich der Seitenliste hat englischen Namen, Zeile und Beschreibung", () => {
  const bereiche = alle("key");
  assert.ok(bereiche.length >= 5, `nur ${bereiche.length} Bereiche gefunden`);
  const fehlt = bereiche.filter((k) => !(NAV_EN.kategorien[k]?.label && NAV_EN.kategorien[k]?.tagline && NAV_EN.kategorien[k]?.description));
  assert.deepEqual(fehlt, [], "in config/navigationEnTexte.js unter kategorien ergänzen");
});

test("Jede Unterseite der Seitenliste hat englischen Namen und Text (id, sonst href bzw. action)", () => {
  const kennungen = [...alle("id"), ...alle("href"), ...alle("action")];
  assert.ok(kennungen.length >= 30, `nur ${kennungen.length} Einträge gefunden`);
  const fehlt = kennungen.filter((k) => !(NAV_EN.links[k]?.label && NAV_EN.links[k]?.description));
  assert.deepEqual(fehlt, [], "in config/navigationEnTexte.js unter links ergänzen");
  const unbenutzt = Object.keys(NAV_EN.links).filter((k) => !kennungen.includes(k));
  assert.deepEqual(unbenutzt, [], "Einträge ohne Gegenstück in navigation.js (umbenannt oder entfernt?)");
});
