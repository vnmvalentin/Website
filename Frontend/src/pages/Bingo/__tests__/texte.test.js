// Bingo-Texte: Englisch vollständig, Server-Fehler werden übersetzt.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { missingKeys } from "../../../i18n/core.js";
import { BINGO_TEXTS, bingoErrorText } from "../bingoI18n.js";

test("Bingo: Englisch und Deutsch haben dieselben Schlüssel", () => {
  const de = BINGO_TEXTS.dict("de");
  const en = BINGO_TEXTS.dict("en");
  assert.deepEqual(BINGO_TEXTS.langs, ["de", "en"]);
  assert.deepEqual(missingKeys(de, en), []);
});

test("Bingo: jeder Fehler-Code des Servers hat einen Text", () => {
  const routes = fs.readFileSync(new URL("../../../../../Backend/bingo/routes.js", import.meta.url), "utf8");
  const codes = [...new Set([...routes.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]))];
  assert.ok(codes.length >= 15, `zu wenige Codes gefunden (${codes.length})`);
  const missing = codes.filter((c) => !BINGO_TEXTS.dict("en").errors[c] || !BINGO_TEXTS.dict("de").errors[c]);
  assert.deepEqual(missing, []);
  // jede Fehlerantwort trägt einen Code
  assert.equal(/json\(\{ error: "[^"]*" \}\)/.test(routes), false, "Fehlerantwort ohne Code");
});

test("bingoErrorText: Code, Anmeldung, Server, Rückfall", () => {
  const err = (status, code, message = "Nur Host") => Object.assign(new Error(message), { status, code });
  assert.equal(bingoErrorText(err(403, "host_only"), "en"), "Only the host can do that.");
  assert.equal(bingoErrorText(err(403, "host_only"), "de"), "Das darf nur der Host.");
  assert.equal(bingoErrorText(err(401, ""), "en"), "Please log in first.");
  assert.equal(bingoErrorText(err(502, ""), "en"), BINGO_TEXTS.dict("en").errors.server);
  assert.equal(bingoErrorText(new TypeError("Failed to fetch"), "de"), BINGO_TEXTS.dict("de").errors.server, "ohne Antwort: nicht erreichbar");
  assert.equal(bingoErrorText(err(400, "", "Unbekannt vom Server"), "de"), "Unbekannt vom Server", "Deutsch zeigt Servertext");
  assert.equal(bingoErrorText(err(400, "", "Unbekannt vom Server"), "en"), "That didn't work.", "Englisch nie deutscher Servertext");
});
