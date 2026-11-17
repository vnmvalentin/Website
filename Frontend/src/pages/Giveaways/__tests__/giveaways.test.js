// Giveaways (Ausbauplan „giveaways“): Texte der Seite und des Overlays passen zu den Codes des Servers
// (Backend/giveaways), beide Sprachen vollständig. Die Abläufe prüft Backend/giveaways/__tests__/giveaways.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { missingKeys } from '../../../i18n/core.js';
import { GIVEAWAY_TEXTS, errorText, grundText } from '../giveawayTexts.js';

const require = createRequire(import.meta.url);
// core.js und texte.js haben keine Abhängigkeiten (keine Datenbank, kein Discord)
const core = require('../../../../../Backend/giveaways/core.js');
const { TEXTE } = require('../../../../../Backend/giveaways/texte.js');
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

const de = GIVEAWAY_TEXTS.dict('de');
const en = GIVEAWAY_TEXTS.dict('en');
const GRUENDE = ['not_following', 'no_discord_link', 'not_in_discord', 'streams_short', 'check_unavailable', 'need_twitch'];

test('Seite und Overlay: Deutsch und Englisch haben dieselben Texte', () => {
  assert.deepEqual(missingKeys(de, en), []);
  assert.deepEqual(missingKeys(en, de), []);
});

test('Server-Texte (Chat, Discord, Mitteilung): beide Sprachen vollständig', () => {
  assert.deepEqual(missingKeys(TEXTE.de, TEXTE.en), []);
  assert.deepEqual(missingKeys(TEXTE.en, TEXTE.de), []);
});

test('Jeder Fehler-Code der Routen hat einen Text in beiden Sprachen', () => {
  const routes = read('../../../../../Backend/giveaways/routes.js');
  const block = routes.slice(routes.indexOf('const MESSAGES = {'), routes.indexOf('};', routes.indexOf('const MESSAGES = {')));
  const codes = [...block.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(codes.length >= 10, `zu wenige Codes: ${codes}`);
  for (const c of codes) {
    assert.ok(de.errors[c], `de.errors.${c}`);
    assert.ok(en.errors[c], `en.errors.${c}`);
  }
  assert.equal(errorText(de, { code: 'closed' }), de.errors.closed);
  assert.equal(errorText(en, new TypeError('fetch')), en.errors.network);
  assert.equal(errorText(de, { code: 'gibt_es_nicht' }), de.errors.generic);
});

test('Jeder Grund aus der Prüfung hat einen Text — auf der Seite, im Chat und am Discord-Knopf', () => {
  // Alle Gründe, die bewerte() liefern kann, einmal erzeugen
  const g = core.normalize({ bedingungen: { follow: true, discord: true, streams: 3 } });
  const erzeugt = new Set();
  for (const f of [
    { twitchId: '1', discordId: null, follow: false, streams: 0 },
    { twitchId: '1', discordId: 'd', follow: null, discordMember: false, streams: 1 },
    { discordId: 'd', discordMember: null },
  ]) for (const e of core.bewerte(g, f).ergebnisse) if (e.grund) erzeugt.add(e.grund);
  assert.deepEqual([...erzeugt].sort(), [...GRUENDE].sort());
  for (const grund of GRUENDE) {
    for (const t of [de, en]) assert.ok(grundText(t, { grund, wert: 1, noetig: 3 }), `Seite ${grund}`);
    for (const lang of ['de', 'en']) {
      assert.ok(TEXTE[lang].chatGrund[grund], `Chat ${lang}.${grund}`);
      assert.ok(TEXTE[lang].knopfGrund[grund], `Knopf ${lang}.${grund}`);
    }
  }
  assert.equal(grundText(de, { grund: 'streams_short', wert: 1, noetig: 3 }), 'Bisher 1 von 3 Streams.');
});

test('Overlay: Dauer des Moments wie am Server, Stichwort wie dort', () => {
  const overlay = read('../GiveawayOverlay.jsx');
  assert.match(overlay, new RegExp(`const SHOW_MS = ${core.SHOW_MS / 1000} \\* 1000;`));
  const page = read('../GiveawaysPage.jsx');
  assert.ok(page.includes(`stichwort: "${core.DEFAULT_STICHWORT}"`), 'Vorgabe im Anlege-Dialog = Standard am Server');
});

test('Seite und Overlay sind eingehängt', () => {
  const app = read('../../../App.jsx');
  assert.ok(app.includes('path="/overlay/giveaway"'));
  assert.ok(app.includes('path="Giveaways"'));
});
