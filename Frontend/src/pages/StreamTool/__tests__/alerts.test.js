// Overlay-Modul „Alerts“: Logik am Server (alertsCore.js, ohne Datenbank), Texte und Konfiguration im Frontend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  MODULE_DEFAULTS, DEFAULT_TEXTS, ALERT_KINDS, ALERT_TEXT_FIELD, THEMED_IDS,
  defaultConfig, mergeConfig, withLanguage, alertTemplate, alertTextParts, demoAlert,
} from '../streamToolConfig.js';
import { OVERLAY_TEXTS, overlayFormat } from '../overlayI18n.js';
import { EDITOR_TEXTS } from '../editorI18n.js';

const require = createRequire(import.meta.url);
// alertsCore.js hat keine Abhängigkeiten (keine Datenbank, kein Twitch)
const core = require('../../../../../Backend/streamTool/lib/alertsCore.js');
const backend = (rel) => fs.readFileSync(new URL(`../../../../../Backend/${rel}`, import.meta.url), 'utf8');

const mod = (patch = {}) => ({ ...MODULE_DEFAULTS.alerts, enabled: true, ...patch });

test('Alerts: Arten sind in Frontend und Server dieselben', () => {
  assert.deepEqual(ALERT_KINDS, core.KINDS);
  for (const k of ALERT_KINDS) assert.ok(ALERT_TEXT_FIELD[k], `Textfeld für ${k}`);
  assert.ok(THEMED_IDS.includes('alerts'), 'Alerts folgen dem gemeinsamen Design');
});

test('allowed: Modul aus, Art aus, Schwellen', () => {
  const ev = (kind, amount = 0) => core.makeEvent(kind, { name: 'A', amount });
  assert.equal(core.allowed(mod({ enabled: false }), ev('follow')), false);
  assert.equal(core.allowed(mod(), ev('follow')), true);
  assert.equal(core.allowed(mod({ kinds: { ...MODULE_DEFAULTS.alerts.kinds, follow: false } }), ev('follow')), false);
  assert.equal(core.allowed(mod({ minBits: 100 }), ev('bits', 99)), false);
  assert.equal(core.allowed(mod({ minBits: 100 }), ev('bits', 100)), true);
  assert.equal(core.allowed(mod({ minRaidViewers: 10 }), ev('raid', 9)), false);
  assert.equal(core.allowed(mod({ minRaidViewers: 0 }), ev('raid', 0)), true);
  assert.equal(core.allowed(mod(), { kind: 'quatsch' }), false);
});

test('pushEvent: höchstens MAX_EVENTS, alte fallen nach KEEP_MS heraus', () => {
  let list = [];
  const t0 = 1_000_000;
  for (let i = 0; i < core.MAX_EVENTS + 5; i++) list = core.pushEvent(list, core.makeEvent('follow', { name: `n${i}` }, t0), t0);
  assert.equal(list.length, core.MAX_EVENTS);
  assert.equal(list[list.length - 1].name, `n${core.MAX_EVENTS + 4}`);
  const later = t0 + core.KEEP_MS + 1;
  list = core.pushEvent(list, core.makeEvent('sub', { name: 'neu' }, later), later);
  assert.deepEqual(list.map((e) => e.name), ['neu']);
  assert.equal(new Set(list.map((e) => e.id)).size, list.length, 'IDs eindeutig');
});

test('Geschenkpaket: ein Alert für das Paket, die Einzelgeschenke werden geschluckt', () => {
  const b = new core.GiftBundles();
  const t0 = 5_000;
  b.note('kanal', 'Gönner', 3, t0);
  assert.equal(b.absorb('kanal', 'gönner', t0 + 10), true);
  assert.equal(b.absorb('kanal', 'Gönner', t0 + 20), true);
  assert.equal(b.absorb('kanal', 'Gönner', t0 + 30), true);
  assert.equal(b.absorb('kanal', 'Gönner', t0 + 40), false, 'viertes Geschenk gehört nicht mehr dazu');
  assert.equal(b.absorb('anderer', 'Gönner', t0), false, 'anderer Kanal');
  b.note('kanal', '', 1, t0);
  assert.equal(b.absorb('kanal', '', t0 + core.BUNDLE_MS + 1), false, 'abgelaufen');
});

test('diffFollows: erster Abruf ohne Alerts, danach nur neue, erneutes Folgen ohne zweiten Alert', () => {
  const f = (id, name, at) => ({ user_id: id, user_name: name, followed_at: new Date(at).toISOString() });
  const first = core.diffFollows(null, [f('1', 'Alt', 1000), f('2', 'Älter', 500)]);
  assert.deepEqual(first.fresh, []);
  assert.equal(first.state.lastAt, 1000);

  const second = core.diffFollows(first.state, [f('4', 'Neu2', 3000), f('3', 'Neu1', 2000), f('1', 'Alt', 1000)]);
  assert.deepEqual(second.fresh.map((x) => x.name), ['Neu1', 'Neu2'], 'älteste zuerst');

  // Neu1 entfolgt und folgt erneut (neuer Zeitstempel) — kein zweiter Alert
  const third = core.diffFollows(second.state, [f('3', 'Neu1', 5000), f('4', 'Neu2', 3000)]);
  assert.deepEqual(third.fresh, []);
  assert.equal(core.diffFollows(third.state, []).fresh.length, 0, 'leere Liste stört nicht');
});

test('Hilfen: Cheermotes, Abo-Stufe, Test-Alert in Overlay-Sprache', () => {
  assert.equal(core.stripCheermotes('Cheer100 Hallo Kappa50 du'), 'Hallo du');
  assert.equal(core.tierOf({ plan: '2000' }), '2');
  assert.equal(core.tierOf({ plan: '3000' }), '3');
  assert.equal(core.tierOf({ prime: true, plan: 'Prime' }), 'prime');
  assert.equal(core.tierOf(null), '1');
  assert.equal(core.testEvent('resub', 1, 'en').message, 'Over a year already!');
  assert.equal(core.testEvent('resub', 1, 'de').message, 'Schon über ein Jahr dabei!');
  assert.equal(core.testEvent('quatsch'), null);
  assert.equal(core.testEvent('bits').test, true);
  assert.equal(core.makeEvent('follow', { name: 'a\u0000b\nc' }).name, 'a b c', 'Steuerzeichen raus');
});

test('Texte: Platzhalter, Mehrzahl, Name hervorgehoben, anonym', () => {
  for (const lang of ['de', 'en']) {
    const t = OVERLAY_TEXTS.dict(lang);
    const { num } = overlayFormat(lang);
    const ev = { kind: 'gift', name: '', amount: 5, months: 0 };
    const parts = alertTextParts(alertTemplate(mod(), 'gift', lang), ev, t, num);
    assert.ok(parts.some((p) => p.isName && p.text === t.anonymous), `${lang}: anonym als Name`);
    const text = parts.map((p) => p.text).join('');
    assert.ok(text.includes(t.subsWord(5, '5')), `${lang}: ${text}`);
    const one = alertTextParts('{subs} {bits} {viewers}', { kind: 'gift', amount: 1 }, t, num).map((p) => p.text).join('');
    assert.equal(one, `${t.subsWord(1, '1')} ${t.bitsWord(1, '1')} ${t.viewersWord(1, '1')}`);
  }
  const de = OVERLAY_TEXTS.dict('de');
  const { num } = overlayFormat('de');
  assert.equal(alertTextParts('{name} {unbekannt}', { name: 'Mika' }, de, num).map((p) => p.text).join(''), 'Mika {unbekannt}', 'Unbekanntes bleibt stehen');
  assert.equal(alertTextParts('{bits}', { amount: 12400 }, de, num)[0].text, '12.400 Bits');
  assert.equal(alertTextParts('{bits}', { amount: 12400 }, OVERLAY_TEXTS.dict('en'), overlayFormat('en').num)[0].text, '12,400 bits');
});

test('Texte: leer = Standard der Sprache, Standard wandert beim Sprachwechsel mit, eigener bleibt', () => {
  assert.equal(alertTemplate(mod({ textFollow: '' }), 'follow', 'en'), DEFAULT_TEXTS.en.alerts.textFollow);
  assert.equal(alertTemplate(mod({ textFollow: '  ' }), 'follow', 'de'), DEFAULT_TEXTS.de.alerts.textFollow);
  for (const [field, text] of Object.entries(DEFAULT_TEXTS.de.alerts)) assert.equal(MODULE_DEFAULTS.alerts[field], text, field);

  const cfg = defaultConfig();
  cfg.modules.alerts = { ...cfg.modules.alerts, textSub: 'Mein eigener Text {name}' };
  const en = withLanguage(cfg, 'en');
  assert.equal(en.modules.alerts.textFollow, DEFAULT_TEXTS.en.alerts.textFollow);
  assert.equal(en.modules.alerts.textSub, 'Mein eigener Text {name}');
  assert.deepEqual(Object.keys(DEFAULT_TEXTS.en.alerts).sort(), Object.keys(DEFAULT_TEXTS.de.alerts).sort());
});

test('mergeConfig: gespeicherte Arten werden ergänzt, nicht ersetzt; alte Stände bekommen das Modul aus', () => {
  const merged = mergeConfig({ v: 2, modules: { alerts: { enabled: true, kinds: { follow: false } } } });
  assert.equal(merged.modules.alerts.kinds.follow, false);
  assert.equal(merged.modules.alerts.kinds.raid, true);
  const old = mergeConfig({ v: 2, modules: {} });
  assert.equal(old.modules.alerts.enabled, false);
  const enOld = mergeConfig({ v: 2, language: 'en', modules: {} });
  assert.equal(enOld.modules.alerts.textRaid, DEFAULT_TEXTS.en.alerts.textRaid, 'englische Konfiguration bekommt englische Standardtexte');
});

test('Editor und Overlay kennen jede Art', () => {
  for (const lang of ['de', 'en']) {
    const ed = EDITOR_TEXTS.dict(lang);
    const ov = OVERLAY_TEXTS.dict(lang);
    for (const k of ALERT_KINDS) {
      assert.ok(ed.alertKindLabels[k], `${lang}: Editor ${k}`);
      assert.ok(ov.alertKinds[k], `${lang}: Overlay ${k}`);
    }
    assert.ok(ed.modules.alerts.label && ed.modules.alerts.hint);
    assert.ok(demoAlert('bits', ov).message, `${lang}: Beispiel mit Nachricht`);
  }
});

test('Server: Chat-Bot reicht alle Ereignisse an die Alerts weiter, Route und Kanäle sind angebunden', () => {
  const irc = backend('lib/winchallengeIrc.js');
  for (const ev of ['subscription', 'resub', 'subgift', 'anonsubgift', 'submysterygift', 'anonsubmysterygift', 'cheer', 'raided']) {
    assert.match(irc, new RegExp(`client\\.on\\("${ev}", alertSafe\\(`), ev);
  }
  assert.match(irc, /streamToolAlerts\.getAlertChannels\(\)/);
  const routes = backend('streamTool/routes/streamToolRoutes.js');
  assert.match(routes, /router\.post\("\/alerts\/test"/);
  assert.match(routes, /alerts: await collectAlerts\(row\)/);
});
