// Antworten des Servers der Twitch-Overlays: Murmelbahn-Ansagen im Chat und Fehlermeldungen im Editor, beide Sprachen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { missingKeys } from '../../../i18n/core.js';
import { EDITOR_TEXTS, apiErrorText, clipWarningText } from '../editorI18n.js';

const require = createRequire(import.meta.url);
// chatText.js hat keine Abhängigkeiten (keine Datenbank) — darf hier geladen werden
const { chatText, chatLang, CHAT_TEXTS } = require('../../../../../Backend/streamTool/lib/chatText.js');
const read = (rel) => fs.readFileSync(new URL(`../../../../../Backend/streamTool/${rel}`, import.meta.url), 'utf8');

const de = EDITOR_TEXTS.dict('de');
const en = EDITOR_TEXTS.dict('en');

test('Chat: Murmelbahn-Ansagen haben in beiden Sprachen dieselben Texte', () => {
  assert.deepEqual(missingKeys(CHAT_TEXTS.de, CHAT_TEXTS.en), []);
  assert.deepEqual(missingKeys(CHAT_TEXTS.en, CHAT_TEXTS.de), []);
});

test('Chat: Sprache kommt aus der Overlay-Konfiguration, alles andere ist Deutsch', () => {
  assert.equal(chatLang({ config: JSON.stringify({ language: 'en' }) }), 'en');
  assert.equal(chatLang({ config: JSON.stringify({ language: 'de' }) }), 'de');
  assert.equal(chatLang({ config: JSON.stringify({ language: 'fr' }) }), 'de');
  assert.equal(chatLang({ config: '{kaputt' }), 'de');
  assert.equal(chatLang(null), 'de');
  const en = chatText({ config: JSON.stringify({ language: 'en' }) });
  assert.equal(en.open('!murmel'), 'The marble run is open — type !murmel to join.');
  assert.equal(en.winner('Anna', 1), 'Anna wins the marble race!');
  assert.equal(en.winner('Anna', 3), "Anna wins the marble race! That's win #3.");
  assert.equal(chatText(null).winner('Anna', 2), 'Anna gewinnt das Murmelrennen! Das ist Sieg Nr. 2.');
});

test('Chat: Vorgabe für die Belohnung passt zum Editor', () => {
  assert.equal(CHAT_TEXTS.de.rewardTitle, de.rewardDefaultTitle);
  assert.equal(CHAT_TEXTS.en.rewardTitle, en.rewardDefaultTitle);
});

test('Chat: keine festen Chat-Sätze mehr in der Szenen-Datei', () => {
  const src = read('lib/streamToolScenes.js');
  const says = [...src.matchAll(/say\([^,]+,\s*([^)]*)\)/g)].map((m) => m[1].trim());
  const literal = says.filter((arg) => /^["'`]/.test(arg));
  assert.deepEqual(literal, []);
});

test('Schnittstelle: jede Fehlerantwort hat einen Code, jeder Code einen Text in beiden Sprachen', () => {
  const routes = read('routes/streamToolRoutes.js');
  const scenes = read('lib/streamToolScenes.js');
  const withoutCode = [...routes.matchAll(/json\(\{ error: [^}]*\}\)/g)].map((m) => m[0]).filter((s) => !s.includes('code'));
  assert.deepEqual(withoutCode, [], 'Fehlerantwort ohne Code');
  const literal = [...`${routes}\n${scenes}`.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]);
  // Codes, die aus Schlüsseln oder Bedingungen entstehen (MESSAGES / SCENE_MESSAGES in den Routen)
  const derived = ['no_login', 'unknown_channel', 'no_settings', 'not_connected', 'module_off', 'not_open', 'too_few',
    'raid_module_off', 'raid_test_failed', 'failed', 'alerts_module_off', 'bad_kind'];
  for (const c of ['raid_module_off', 'raid_test_failed', 'failed', 'alerts_module_off']) assert.ok(routes.includes(`"${c}"`), `${c} steht nicht mehr in den Routen`);
  const codes = [...new Set([...literal, ...derived])];
  assert.ok(codes.length >= 25, `zu wenige Codes (${codes.length})`);
  const missing = codes.filter((c) => !de.apiErrors[c] || !en.apiErrors[c]);
  assert.deepEqual(missing, []);
  for (const key of ['no_clips', 'auth', 'error', 'missing']) {
    assert.ok(de.clipWarnings[`clip_${key}`] && en.clipWarnings[`clip_${key}`], `clip_${key}`);
  }
});

test('apiErrorText: Deutsch Servertext, Englisch Text zum Code, ohne Verbindung klarer Hinweis', () => {
  const err = (status, code, message, detail) => Object.assign(new Error(message), { status, code, detail });
  assert.equal(apiErrorText(de, err(400, 'too_few', 'Für ein Rennen braucht es mindestens zwei Murmeln.')), 'Für ein Rennen braucht es mindestens zwei Murmeln.');
  assert.equal(apiErrorText(en, err(400, 'too_few', 'Für ein Rennen …')), 'A race needs at least two marbles.');
  assert.equal(apiErrorText(en, err(400, 'reward_duplicate', 'Eine Belohnung …', 'Race')), 'A reward called "Race" already exists — choose a different name.');
  assert.equal(apiErrorText(en, err(400, '', 'Irgendwas auf Deutsch')), en.apiErrors.generic, 'nie deutscher Servertext auf Englisch');
  assert.equal(apiErrorText(en, err(502, '', 'Bad Gateway')), en.apiErrors.server);
  assert.equal(apiErrorText(de, new TypeError('Failed to fetch')), de.apiErrors.network);
  assert.equal(apiErrorText(en, new TypeError('Failed to fetch')), en.apiErrors.network);
});

test('clipWarningText: Deutsch Servertext, Englisch nach Code', () => {
  const d = { warning: 'Dieser Kanal hat …', warningCode: 'clip_no_clips' };
  assert.equal(clipWarningText(de, d), 'Dieser Kanal hat …');
  assert.equal(clipWarningText(en, d), en.clipWarnings.clip_no_clips);
  assert.equal(clipWarningText(en, { warning: 'x' }), en.clipWarnings.clip_missing);
});
