// Texte der Form-Auswertung: Englisch vollständig, jeder Tipp des Servers hat einen Text in beiden Sprachen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { missingKeys } from '../../../../i18n/core.js';
import { FORM_TEXTS } from '../formTexts.js';

// Die Tipp-Schlüssel aus Backend/clashRoyale/lib/formPatterns.js
const TIP_KEYS = ['lossStreakNow', 'tilt', 'resilient', 'fatigue', 'bestTime', 'underLevel', 'hardCards', 'weakCards'];

test('Englisch vollständig', () => {
  assert.deepEqual(missingKeys(FORM_TEXTS.dict('de'), FORM_TEXTS.dict('en')), []);
});

test('Jeder Tipp hat einen Text, Zahlen als Prozent, Kartenlisten mit „und“', () => {
  for (const lang of ['de', 'en']) {
    const t = FORM_TEXTS.dict(lang);
    for (const k of TIP_KEYS) assert.equal(typeof t.tips[k], 'function', `${lang}: ${k}`);
  }
  const de = FORM_TEXTS.dict('de');
  assert.equal(de.tips.tilt({ winRate: 0.375, overall: 0.52 }),
    'Nach zwei oder mehr Niederlagen in Folge gewinnst du nur 38 % (sonst 52 %). Nach der zweiten Niederlage lieber kurz aufhören.');
  const cards = ['Mega Knight', 'Miner', 'Bats'].map((name) => ({ card: { name } }));
  assert.equal(de.tips.hardCards({ cards }), 'Am schwersten tust du dich gegen Mega Knight, Miner und Bats.');
  assert.equal(FORM_TEXTS.dict('en').tips.bestTime({ best: 'evening', bestRate: 0.6, worst: 'night', worstRate: 0.4 }),
    'You play best in the evening (60%) and worst at night (40%).');
});
