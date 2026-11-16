// Was der Discord-Bot selbst schreibt (Backend/discord/bot/botTexts.js): Englisch vollständig, Vorschau im Dashboard
// passt zum Bot, und die umgestellten Bot-Dateien enthalten keine festen deutschen Sätze mehr.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { missingKeys } from "../../../i18n/core.js";
import { BOT_PREVIEW } from "../discordI18n.js";

const require = createRequire(import.meta.url);
// botTexts.js ist reine Daten ohne Abhängigkeiten (öffnet keine Datenbank)
const { BOT_TEXTS, botTextFor } = require("../../../../../Backend/discord/bot/botTexts.js");
const backend = (rel) => fs.readFileSync(new URL(`../../../../../Backend/discord/${rel}`, import.meta.url), "utf8");

test("Bot: Englisch und Deutsch haben dieselben Schlüssel", () => {
  assert.deepEqual(Object.keys(BOT_TEXTS).sort(), ["de", "en"]);
  assert.deepEqual(missingKeys(BOT_TEXTS.de, BOT_TEXTS.en), []);
  assert.deepEqual(missingKeys(BOT_TEXTS.en, BOT_TEXTS.de), []);
});

test("Bot: unbekannte Sprache fällt auf Deutsch zurück", () => {
  assert.equal(botTextFor("fr"), BOT_TEXTS.de);
  assert.equal(botTextFor(undefined), BOT_TEXTS.de);
  assert.equal(botTextFor("en"), BOT_TEXTS.en);
});

test("Bot: Vorschau im Dashboard zeigt dieselbe Fußzeile wie der Bot", () => {
  for (const lang of ["de", "en"]) {
    assert.equal(BOT_PREVIEW[lang].welcomeFooter(128), BOT_TEXTS[lang].card.welcomeFooter(128), `${lang} Eintritt`);
    assert.equal(BOT_PREVIEW[lang].leaveFooter(128), BOT_TEXTS[lang].card.leaveFooter(128), `${lang} Austritt`);
  }
});

test("Bot: Twitch-Vorlage behält ihre Platzhalter", () => {
  for (const lang of ["de", "en"]) {
    assert.ok(BOT_TEXTS[lang].twitch.defaultMessage.includes("{streamer}"));
    assert.ok(BOT_TEXTS[lang].twitch.defaultMessage.includes("{url}"));
  }
});

test("Bot: Voice-Übersicht nennt jeden Befehl in beiden Sprachen", () => {
  const cmds = ["/voicelimit", "/voicelock", "/voice_rename", "/voice_hide", "/voice_unhide", "/voice_kick", "/voice_ban", "/voice_unban", "/voice_transfer"];
  for (const lang of ["de", "en"]) {
    const all = BOT_TEXTS[lang].voice.pinCommands.join("\n");
    for (const c of cmds) assert.ok(all.includes(`\`${c}`), `${lang}: ${c}`);
  }
});

test("Bot: die umgestellten Dateien enthalten keine festen deutschen Sätze mehr", () => {
  const files = [
    "bot/memberCard.js", "bot/memberImage.js", "bot/commands/approval.js", "bot/commands/tickets.js",
    "bot/commands/voice.js", "bot/commands/serverstats.js", "bot/events/voiceStateUpdate.js", "bot/events/interactionCreate.js",
    "bot/twitchPoller.js", "loyalty/games.js", "api/approval.js", "api/tickets.js",
  ];
  // Typische Wörter aus Nachrichten an Nutzer; Kommentare und Log-Zeilen zählen nicht
  const GERMAN = /(['"`])[^'"`]*\b(Fehler beim|existiert nicht|Du hast|Du bist|Dir wurde|Ticket erstellen|schließen|Genehmigen|Ablehnen|Anfrage|Mitglied|Kanal|Rolle|Nutzer|Einsatz|Kontostand|Rangliste|Duell|Rakete|Aussteigen|Spiele|Tage|Unbekannt|WILLKOMMEN|TSCHÜSS)\b/;
  const offenders = [];
  for (const file of files) {
    const lines = backend(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/(^|[^:'"`])\/\/.*$/, "$1");
      // Log-Zeilen und Fehlerantworten fürs Dashboard (tragen einen Code, das Dashboard übersetzt sie) zählen nicht
      if (/console\.(log|warn|error)|withRetry\(|step\(|code: "/.test(code)) return;
      if (GERMAN.test(code)) offenders.push(`${file}:${i + 1}: ${code.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});
