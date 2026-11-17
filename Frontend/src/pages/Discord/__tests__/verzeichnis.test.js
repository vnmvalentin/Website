// Discord-Bot fürs Verzeichnis (Ausbauplan „discord-verzeichnis“): Einstiegsseite /tools/discord-bot vollständig in
// beiden Sprachen, auffindbar (Route, Vorrendern, Sitemap, Schnellsuche), Einrichtungs-Check mit einem Namen für jedes
// Recht, das der Bot anfragt, und Dashboard-Anmeldung ohne Twitch.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { missingKeys } from "../../../i18n/core.js";
import { LANDING_TEXTS, LANDING_PATH, LANDING_IMAGE, buildLandingJsonLd } from "../landingTexts.js";
import { DISCORD_TEXTS } from "../discordI18n.js";

const require = createRequire(import.meta.url);
const { PERMISSION_NAMES } = require("../../../../../Backend/discord/bot/permissions.js");
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const de = LANDING_TEXTS.dict("de");
const en = LANDING_TEXTS.dict("en");

test("Einstiegsseite: Deutsch und Englisch vollständig, Aufbau wie versprochen", () => {
  assert.deepEqual(LANDING_TEXTS.langs, ["de", "en"]);
  assert.deepEqual(missingKeys(de, en), []);
  assert.deepEqual(missingKeys(en, de), []);
  for (const t of [de, en]) {
    assert.equal(t.features.length, 9);
    assert.equal(t.steps.length, 3);
    assert.equal(t.also.length, en.also.length);
    assert.ok(t.faq.length >= 5);
    for (const f of t.faq) assert.ok(f.q.endsWith("?") && f.a.length > 40, f.q);
    assert.ok(t.chat.welcome.includes("{user}"), "Platz für die Erwähnung");
    assert.equal(t.chat.roles.length, 3);
  }
});

test("Einstiegsseite: Titel und Beschreibung passen in die Suchergebnisse", () => {
  for (const t of [de, en]) {
    assert.ok(t.seoTitle.length <= 46, `Titel ${t.seoTitle.length}`);
    assert.ok(t.description.length >= 100 && t.description.length <= 160, `Beschreibung ${t.description.length}`);
  }
  assert.notEqual(de.seoTitle, en.seoTitle);
});

test("Einstiegsseite: verspricht keine Live-Rolle (braucht Discords Presence-Recht, das der Bot nicht hat)", () => {
  const all = JSON.stringify([de, en]).toLowerCase();
  for (const word of ["live-rolle", "live rolle", "live role"]) assert.equal(all.includes(word), false, word);
  // und kein Administrator-Recht
  assert.ok(de.faq.some((f) => f.a.includes("Administrator verlangt er nicht")));
});

test("Einstiegsseite: strukturierte Daten folgen Sprache und sichtbarem Text", () => {
  const ld = buildLandingJsonLd("en");
  assert.equal(ld[0].url, "https://vnmvalentin.de/tools/discord-bot?lang=en");
  assert.deepEqual(ld[0].featureList, en.features.map((f) => f.title));
  assert.equal(ld[2].mainEntity.length, en.faq.length);
  assert.equal(buildLandingJsonLd("de")[1].itemListElement[2].item, "https://vnmvalentin.de/tools/discord-bot");
});

test("Einstiegsseite: Route, Vorrendern, Sitemap, Schnellsuche, Bild und Rechtstexte", () => {
  const app = read("../../../App.jsx");
  assert.ok(app.includes('path="tools/discord-bot" element={<DiscordBotLandingPage />}'));
  assert.ok(app.includes('path="/discord-bot/privacy"') && app.includes('path="/discord-bot/terms"'));
  const pre = read("../../../../prerender.js");
  assert.ok(pre.includes(`'${LANDING_PATH}'`), "vorrendern");
  const rule = pre.match(/\{ re: (\/\^\\\/tools.*?\/), priority/);
  // eslint-disable-next-line no-eval
  assert.ok(eval(rule[1]).test(LANDING_PATH), "Sitemap");
  assert.ok(read("../../../utils/schnellsuche.js").includes(`ziel: "${LANDING_PATH}"`), "Schnellsuche");
  assert.ok(fs.existsSync(new URL(`../../../../public${LANDING_IMAGE}`, import.meta.url)), "Vorschaubild");
  // Begrüßung des Bots verlinkt hierher, das Dashboard für Nicht-Angemeldete auch
  assert.ok(read("../../../../../Backend/discord/bot/onboarding.js").includes("/tools/discord-bot"));
  assert.ok(read("../DiscordBotDashboard.jsx").includes("withLang('/tools/discord-bot'"));
});

test("Einrichtungs-Check: jedes Recht der Einladung hat einen Namen in beiden Sprachen", () => {
  for (const lang of ["de", "en"]) {
    const t = DISCORD_TEXTS.dict(lang);
    assert.deepEqual(PERMISSION_NAMES.filter((n) => !t.setup.perms[n]), [], lang);
    assert.deepEqual(Object.keys(t.setup.steps).sort(), ["loyalty", "reactionroles", "tickets", "twitchnotif", "voice", "welcome"]);
    // Jeder Schritt öffnet einen Bereich, den es gibt
    for (const id of Object.keys(t.setup.steps)) assert.ok(t.shell.tabs[id], `${lang}: Bereich ${id}`);
    assert.equal(t.setup.problemsTitle(1) !== t.setup.problemsTitle(2), true);
  }
  // Die Spaß-Befehle sind nicht mehr „vorerst Deutsch“
  assert.equal(DISCORD_TEXTS.dict("en").general.botLanguageHint.includes("German for now"), false);
});

test("Dashboard: Anmeldung ohne Twitch, Rücksprung behält ?server=", () => {
  const src = read("../DiscordBotDashboard.jsx");
  assert.ok(src.includes("useKonto()"), "Konto statt nur Twitch");
  assert.ok(src.includes("mitDiscordAnmelden()") && src.includes("oeffneAnmeldung"));
  assert.ok(src.includes("/api/discord/login-url?returnTo="));
  assert.equal(src.includes("TwitchLoginButton"), false);
});
