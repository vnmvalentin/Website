// Discord-Dashboard: Englisch vollständig, Server-Fehler werden übersetzt, keine deutschen Reste in den Bauteilen.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { missingKeys } from "../../../i18n/core.js";
import { DISCORD_TEXTS, isErrorStatus, serverErrorText } from "../discordI18n.js";

const de = DISCORD_TEXTS.dict("de");
const en = DISCORD_TEXTS.dict("en");

test("Discord: Englisch und Deutsch haben dieselben Schlüssel", () => {
  assert.deepEqual(DISCORD_TEXTS.langs, ["de", "en"]);
  assert.deepEqual(missingKeys(de, en), []);
});

test("Discord: jeder Fehler-Code des Servers hat einen Text, jede Fehlerantwort einen Code", () => {
  const dir = new URL("../../../../../Backend/discord/api/", import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  const codes = new Set();
  for (const file of files) {
    const src = fs.readFileSync(new URL(file, dir), "utf8");
    for (const m of src.matchAll(/code: "([a-z_]+)"/g)) codes.add(m[1]);
    // jede JSON-Fehlerantwort trägt einen Code (sonst sähe die englische Fassung nur „Something went wrong“)
    const withoutCode = [...src.matchAll(/json\(\{ error: [^}]*\}\)/g)].map((m) => m[0]).filter((s) => !s.includes("code:"));
    assert.deepEqual(withoutCode, [], `${file}: Fehlerantwort ohne Code`);
  }
  assert.ok(codes.size >= 20, `zu wenige Codes gefunden (${codes.size})`);
  const missing = [...codes].filter((c) => !de.errors[c] || !en.errors[c]);
  assert.deepEqual(missing, []);
});

test("serverErrorText: Deutsch zeigt den Servertext, Englisch den Text zum Code, nie Deutsch", () => {
  const data = { error: "Kanal nicht gefunden.", code: "channel_not_found" };
  assert.equal(serverErrorText(de, data), "Kanal nicht gefunden.");
  assert.equal(serverErrorText(en, data), "Channel not found.");
  assert.equal(serverErrorText(en, { error: "Unbekannt vom Server" }), en.errors.generic);
  assert.equal(serverErrorText(en, { error: "Unbekannt" }, "Fallback"), "Fallback");
  assert.equal(serverErrorText(de, {}, "Rückfall"), "Rückfall");
  assert.equal(serverErrorText(en, null), en.errors.generic);
});

test("isErrorStatus erkennt Fehlerzeilen beider Sprachen", () => {
  for (const lang of [de, en]) {
    assert.equal(isErrorStatus(lang.common.networkError), true);
    assert.equal(isErrorStatus(lang.common.error), true);
    assert.equal(isErrorStatus(lang.common.errorWith("x")), true);
    assert.equal(isErrorStatus(lang.loyalty.loadFailed), true);
    assert.equal(isErrorStatus(lang.common.saved), false);
  }
});

test("Discord: Vorlagen behalten ihre Platzhalter in beiden Sprachen", () => {
  for (const key of ["[USER]", "[SERVER]", "[MEMBER]"]) {
    assert.ok(en.welcome.defaultMessage.includes(key), `welcome ohne ${key}`);
    assert.ok(en.leave.defaultMessage.includes(key), `leave ohne ${key}`);
  }
  for (const key of ["{streamer}", "{game}", "{url}"]) assert.ok(en.twitch.defaultMessage.includes(key), `twitch ohne ${key}`);
  assert.equal(en.tickets.defaultFields.length, de.tickets.defaultFields.length);
});

test("Discord: die Bauteile enthalten keine festen deutschen Texte mehr", () => {
  const root = new URL("../", import.meta.url);
  const files = ["DiscordBotDashboard.jsx", "ui.jsx", "EmojiTextField.jsx", ...fs.readdirSync(new URL("tabs/", root)).map((f) => `tabs/${f}`)];
  // Typische deutsche Wörter in Text-Knoten oder Attributen; Kommentare werden vorher entfernt.
  const GERMAN = /(["'>`])[^"'<>`{}]*\b(Speicher\w*|Kanal|Rolle|Mitglied\w*|Fehler|Lade|wählen|auswählen|Einstellungen|Hinweis|Abbrechen|Löschen|Bearbeiten)\b/;
  const ALLOWED = [];
  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(new URL(file, root), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    src.split("\n").forEach((line, i) => {
      if (GERMAN.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders.filter((o) => !ALLOWED.some((re) => re.test(o))), []);
});
