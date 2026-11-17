// Abo-Extras der Twitch-Overlays im Frontend (Ausbauplan „premium-wert“): Schriften, eigene Töne/Bilder der Alerts,
// Happy Hour im Subathon. Die Server-Seite prüft Backend/streamTool/__tests__/premium.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_DEFAULTS, OVERLAY_FONTS, ALL_FONTS_HREF, fontFamilyOf, fontHref, withoutPremium, alertMediaOf, mediaUrl,
  mergeConfig, defaultConfig, effectiveModules, toSubathonView, subathonHappyLeft, MODULE_DEFAULTS, THEMED_IDS,
} from '../streamToolConfig.js';
import { OVERLAY_TEXTS } from '../overlayI18n.js';
import { EDITOR_TEXTS } from '../editorI18n.js';
import { PREMIUM_INCLUDES } from '../../../utils/billingApi.js';

const ID = 'AbCdEfGhIjKl_-12';

test('Schriften: zehn, Inter ist Standard, jede ID passt in eine Community-Vorlage', () => {
  assert.equal(THEME_DEFAULTS.font, 'inter');
  assert.equal(OVERLAY_FONTS.length, 10);
  const ids = OVERLAY_FONTS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  // WORD_RE in Backend/overlayVorlagen/core.js — sonst ginge die Schrift beim Teilen verloren
  for (const id of ids) assert.match(id, /^[a-z0-9-]{1,20}$/);
  assert.equal(fontFamilyOf('inter'), null, 'Inter steht schon im Stylesheet');
  assert.equal(fontHref('inter'), null);
  assert.match(fontFamilyOf('oswald'), /^"Oswald", Inter/);
  assert.equal(fontHref('lilita'), 'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap');
  assert.equal(fontFamilyOf('comic-sans'), null);
  for (const f of OVERLAY_FONTS.filter((x) => x.query)) assert.ok(ALL_FONTS_HREF.includes(`family=${f.family.replace(/ /g, '+')}`), f.id);
});

test('Schriften: gespeicherte Wahl wird geprüft und an jede Karte weitergereicht', () => {
  assert.equal(mergeConfig({ theme: { font: 'oswald' } }).theme.font, 'oswald');
  assert.equal(mergeConfig({ theme: { font: 'comic-sans' } }).theme.font, 'inter');
  assert.equal(mergeConfig({ theme: {} }).theme.font, 'inter');
  const m = effectiveModules(mergeConfig({ theme: { font: 'rubik' } }));
  for (const id of THEMED_IDS) assert.equal(m[id].font, 'rubik', id);
});

test('Eigene Töne und Bilder: nur gültige IDs werden zu Adressen, die Zuordnung übersteht das Laden', () => {
  assert.equal(mediaUrl(ID), `/api/stream-tool/media/file/${ID}`);
  assert.equal(mediaUrl('../../etc/passwd'), null);
  assert.equal(mediaUrl(42), null);
  assert.deepEqual(MODULE_DEFAULTS.alerts.media, {});
  const config = mergeConfig({ modules: { alerts: { media: { sub: { sound: ID, image: 'kaputt' } } } } });
  assert.deepEqual(alertMediaOf(config.modules.alerts, 'sub'), { sound: `/api/stream-tool/media/file/${ID}`, image: null });
  assert.deepEqual(alertMediaOf(config.modules.alerts, 'raid'), { sound: null, image: null });
  assert.deepEqual(alertMediaOf(undefined, 'sub'), { sound: null, image: null });
});

test('Ohne Abo zeigt die Vorschau, was die OBS-Quelle zeigt — gespeichert bleibt alles', () => {
  const config = mergeConfig({ theme: { font: 'oswald' }, modules: { alerts: { media: { sub: { sound: ID } } } } });
  const shown = withoutPremium(config);
  assert.equal(shown.theme.font, 'inter');
  assert.deepEqual(shown.modules.alerts.media, {});
  assert.equal(config.theme.font, 'oswald');
  assert.equal(config.modules.alerts.media.sub.sound, ID);
  // Ohne Medien bleibt das Modul-Objekt dasselbe
  const plain = defaultConfig();
  assert.equal(withoutPremium(plain).modules, plain.modules);
});

test('Happy Hour: Ansicht und Restzeit', () => {
  const mod = { ...MODULE_DEFAULTS.subathon, enabled: true };
  const base = { status: 'running', endsAt: 5000, remainingMs: 0, recent: [] };
  assert.deepEqual(toSubathonView({ ...base, happy: { factor: 3, until: 2000 } }, mod).happy, { factor: 3, until: 2000 });
  assert.equal(toSubathonView({ ...base, happy: { factor: 7, until: 2000 } }, mod).happy, null);
  assert.equal(toSubathonView(base, mod).happy, null);
  const view = toSubathonView({ ...base, happy: { factor: 2, until: 2000 } }, mod);
  assert.equal(subathonHappyLeft(view, 1500), 500);
  assert.equal(subathonHappyLeft(view, 2500), 0);
});

test('Texte: Abo-Extras in beiden Sprachen, Abo-Liste nennt sie', () => {
  for (const lang of ['de', 'en']) {
    const t = EDITOR_TEXTS.dict(lang);
    for (const k of ['font', 'premiumExtraNote', 'premiumMore', 'alertMediaSection', 'alertMediaNote', 'subHappySection', 'subHappyNote']) {
      assert.ok(t[k], `${lang}.${k}`);
    }
    for (const c of ['premium_needed', 'media_type', 'media_too_big', 'media_quota', 'not_found']) assert.ok(t.apiErrors[c], `${lang}.apiErrors.${c}`);
    assert.equal(typeof t.alertMediaUsage(1, 30, '0,5', '30'), 'string');
    const o = OVERLAY_TEXTS.dict(lang);
    assert.match(o.subHappy(2), /×2/);
    assert.match(o.subHappyLeft('12:00'), /12:00/);
  }
  const all = PREMIUM_INCLUDES.join(' ');
  for (const word of ['Hype Train', 'Alert', 'Schrift', 'Happy Hour']) assert.ok(all.includes(word), word);
});
