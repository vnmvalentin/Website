// Texte der Twitch-Overlays im Stream: Englisch vollständig, Zahlenformat je Sprache, Sprache in der Konfiguration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingKeys } from '../../../i18n/core.js';
import { OVERLAY_TEXTS, overlayFormat } from '../overlayI18n.js';
import { EDITOR_TEXTS } from '../editorI18n.js';
import { ST_SEO_TEXTS, stSeo } from '../seoData.js';
import { buildStreamToolJsonLd } from '../jsonLd.js';
import {
  defaultConfig, mergeConfig, withLanguage, DEFAULT_TEXTS, MODULE_DEFAULTS, OVERLAY_LANGS, demoHype, demoMarbles,
  TWITCH_GOAL_TYPES, STAT_METRICS,
} from '../streamToolConfig.js';

test('Overlay: Englisch hat jeden deutschen Schlüssel', () => {
  assert.deepEqual(OVERLAY_TEXTS.langs, ['de', 'en']);
  assert.deepEqual(missingKeys(OVERLAY_TEXTS.dict('de'), OVERLAY_TEXTS.dict('en')), []);
  assert.deepEqual(missingKeys(OVERLAY_TEXTS.dict('en'), OVERLAY_TEXTS.dict('de')), []);
});

test('Editor: Englisch und Deutsch haben dieselben Schlüssel', () => {
  assert.deepEqual(EDITOR_TEXTS.langs, ['de', 'en']);
  assert.deepEqual(missingKeys(EDITOR_TEXTS.dict('de'), EDITOR_TEXTS.dict('en')), []);
  assert.deepEqual(missingKeys(EDITOR_TEXTS.dict('en'), EDITOR_TEXTS.dict('de')), []);
});

test('Editor: jedes Modul und jeder Twitch-Zieltyp hat einen Namen', () => {
  for (const lang of ['de', 'en']) {
    const t = EDITOR_TEXTS.dict(lang);
    for (const id of Object.keys(MODULE_DEFAULTS)) assert.ok(t.modules[id]?.label, `${lang}: modules.${id}`);
    for (const types of Object.values(TWITCH_GOAL_TYPES)) {
      for (const { value } of types) assert.ok(t.goalTypes[value], `${lang}: goalTypes.${value}`);
    }
    for (const { key } of STAT_METRICS) assert.ok(t.metricLabels[key], `${lang}: metricLabels.${key}`);
  }
});

test('Öffentliche Seite: Englisch vollständig, gleich viele Module, Schritte und Fragen', () => {
  assert.deepEqual(missingKeys(ST_SEO_TEXTS.de, ST_SEO_TEXTS.en), []);
  assert.deepEqual(missingKeys(ST_SEO_TEXTS.en, ST_SEO_TEXTS.de), []);
  for (const lang of ['de', 'en']) {
    const seo = stSeo(lang);
    assert.ok(seo.title.length <= 46, `${lang}: Titel zu lang für die Suchergebnisse (${seo.title.length})`);
    assert.ok(seo.modules.every((m) => typeof m.icon === 'object' || typeof m.icon === 'function'), `${lang}: Symbole`);
  }
});

test('Strukturierte Daten folgen der Sprache und dem sichtbaren Text', () => {
  const en = buildStreamToolJsonLd('en');
  assert.equal(en[0].inLanguage, 'en');
  assert.equal(en[0].url, 'https://vnmvalentin.de/twitch-tools?lang=en');
  assert.equal(en[3].mainEntity[0].name, stSeo('en').faq[0].q);
  const de = buildStreamToolJsonLd('de');
  assert.equal(de[0].inLanguage, 'de');
  assert.equal(de[0].url, 'https://vnmvalentin.de/twitch-tools');
  assert.equal(de[2].step[0].url, 'https://vnmvalentin.de/twitch-tools#schritt-1', 'deutsche Anker unverändert');
  assert.equal(buildStreamToolJsonLd()[0].inLanguage, 'de');
});

test('Overlay: Einzahl und Mehrzahl', () => {
  const en = OVERLAY_TEXTS.dict('en');
  assert.equal(en.votes(1, '1'), '1 vote');
  assert.equal(en.votes(12, '12'), '12 votes');
  assert.equal(en.passengers(1), '1 passenger');
  assert.equal(OVERLAY_TEXTS.dict('de').passengers(3), '3 Fahrgäste');
  assert.equal(en.payoutShort(1, '1', '500'), '1 winner · 500 points');
});

test('Overlay: Zahlen im Stream je Sprache', () => {
  assert.equal(overlayFormat('de').num(12400), '12.400');
  assert.equal(overlayFormat('en').num(12400), '12,400');
  assert.equal(overlayFormat('de').decimal(1.53), '1,5');
  assert.equal(overlayFormat('en').decimal(1.53), '1.5');
  assert.equal(overlayFormat('xx').num(1000), '1.000', 'unbekannte Sprache → Deutsch');
  assert.equal(overlayFormat('en'), overlayFormat('en'), 'dasselbe Objekt je Sprache');
});

test('Konfiguration: Sprache wird gespeichert und geprüft', () => {
  assert.equal(defaultConfig().language, 'de');
  assert.equal(mergeConfig({ language: 'en' }).language, 'en');
  assert.equal(mergeConfig({ language: 'fr' }).language, 'de');
  assert.equal(mergeConfig({ modules: {} }).language, 'de', 'alte Stände ohne Sprache → Deutsch');
});

test('Standardtexte: jeder hat beide Sprachen und stimmt mit dem Modul-Standard überein', () => {
  assert.deepEqual(OVERLAY_LANGS, ['de', 'en']);
  for (const [id, fields] of Object.entries(DEFAULT_TEXTS.de)) {
    for (const field of Object.keys(fields)) {
      assert.equal(MODULE_DEFAULTS[id][field], DEFAULT_TEXTS.de[id][field], `${id}.${field}`);
      assert.ok(DEFAULT_TEXTS.en[id]?.[field], `en fehlt: ${id}.${field}`);
    }
  }
});

test('Sprachwechsel: unveränderte Standardtexte wechseln mit, eigene bleiben', () => {
  const cfg = mergeConfig({ modules: { streamStats: { label: 'Mein Stream' } } });
  const en = withLanguage(cfg, 'en');
  assert.equal(en.language, 'en');
  assert.equal(en.modules.followerGoal.label, 'Follower goal');
  assert.equal(en.modules.planeBanner.messages, 'Great to have you here!');
  assert.equal(en.modules.streamStats.label, 'Mein Stream', 'eigener Text bleibt');
  assert.equal(en.modules.marbleRun.joinCommand, '!murmel', 'Chat-Befehl wechselt nie still');
  const back = withLanguage(en, 'de');
  assert.equal(back.modules.followerGoal.label, 'Follower-Ziel');
  assert.equal(cfg.modules.followerGoal.label, 'Follower-Ziel', 'Ausgangsstand unverändert');
  assert.equal(withLanguage(cfg, 'fr'), cfg, 'unbekannte Sprache ändert nichts');
});

test('Englische Konfiguration: fehlende Felder bekommen englische Standardtexte', () => {
  const cfg = mergeConfig({ language: 'en', modules: { streamStats: { label: 'Tonight' } } });
  assert.equal(cfg.modules.followerGoal.label, 'Follower goal');
  assert.equal(cfg.modules.planeBanner.messages, 'Great to have you here!');
  assert.equal(cfg.modules.streamStats.label, 'Tonight');
  assert.equal(mergeConfig({}).modules.followerGoal.label, 'Follower-Ziel');
});

test('Demo-Daten je Sprache', () => {
  assert.notEqual(demoHype('de').people[0].name, demoHype('en').people[0].name);
  assert.equal(demoHype('en'), demoHype('en'), 'Standbild bleibt dasselbe Objekt');
  assert.equal(demoMarbles({ joinCommand: '!murmel' }, 'en').players.length, 9);
});
