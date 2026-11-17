// Texte der Clan-Zentrale: Englisch vollständig, jeder Grund und jede Fehlermeldung des Servers hat einen Text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { missingKeys } from '../../../../i18n/core.js';
import { CENTRAL_TEXTS } from '../clanCentralTexts.js';

// Gründe aus Backend/clashRoyale/scout/clanCentral.js (reasons + hint.why) und Fehler aus scoutRoutes (Erinnerungen)
const REASONS = ['offline', 'warLow', 'warNone', 'new', 'warFull', 'donor', 'tenure'];
const ERRORS = ['webhookInvalid', 'webhookMissing', 'discordDown', 'limitKonto', 'limitTotal', 'loginRequired', 'rateLimited'];

test('Englisch vollständig', () => {
  assert.deepEqual(missingKeys(CENTRAL_TEXTS.dict('de'), CENTRAL_TEXTS.dict('en')), []);
});

test('Jeder Grund und jeder Fehler hat einen Text; Einzahl und Mehrzahl stimmen', () => {
  for (const lang of ['de', 'en']) {
    const t = CENTRAL_TEXTS.dict(lang);
    for (const k of REASONS) assert.equal(typeof t.reasons[k], 'function', `${lang}: ${k}`);
    for (const k of ERRORS) assert.equal(typeof t.errors[k], 'string', `${lang}: ${k}`);
  }
  const de = CENTRAL_TEXTS.dict('de');
  assert.equal(de.reasons.offline({ days: 1 }), 'seit 1 Tag offline');
  assert.equal(de.reasons.offline({ days: 12 }), 'seit 12 Tagen offline');
  assert.equal(de.openSummary(1, 4), '1 Mitglied mit 4 offenen Decks');
  assert.equal(de.sinceDays(20), 'über 2 Wochen');
  assert.equal(de.sinceDays(1), 'über 1 Tag');
  assert.equal(CENTRAL_TEXTS.dict('en').openSummary(3, 1), '3 members with 1 deck left');
});
