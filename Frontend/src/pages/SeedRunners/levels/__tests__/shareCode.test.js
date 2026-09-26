// Share-Codes im Browser: Eingaben großzügig lesen (wie der Server) und Adressen bauen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isCode, normalizeCode, isFullCodeInput, levelPath, creatorPath } from '../shareCode.js';

test('normalizeCode: Klein-/Großschreibung, Leerzeichen, fehlendes "SR-" und fehlende Striche', () => {
  for (const input of ['SR-7K2-QX9', 'sr-7k2-qx9', 'sr 7k2 qx9', '7K2QX9', ' 7k2-qx9 ', 'SR7K2QX9']) {
    assert.equal(normalizeCode(input), 'SR-7K2-QX9', input);
  }
});

test('normalizeCode: alles, was kein Code sein kann, ist null', () => {
  for (const input of ['', 'hallo', 'SR-7K2', '7K2QX', '7K2QX90', 'SR-0O1-ILL', null, undefined, 42, {}]) {
    assert.equal(normalizeCode(input), null, String(input));
  }
});

test('isFullCodeInput: nur ein vollständiger Code mit SR springt; Suchwörter aus erlaubten Buchstaben nicht', () => {
  for (const input of ['SR-7K2-QX9', 'sr-7k2-qx9', 'sr 7k2 qx9', ' SR7K2QX9 ']) assert.equal(isFullCodeInput(input), true, input);
  // "Zunder" und "Dashes" bestehen nur aus erlaubten Buchstaben und wären als bloßer Code gültig — sie sind aber Suchwörter
  for (const input of ['7K2QX9', 'Zunder', 'zzzzzz', 'Dashes', 'srexyz', 'SR-7K2', 'SR-0O1-ILL', 'wiese', '', null, 5]) assert.equal(isFullCodeInput(input), false, String(input));
});

test('isCode: nur die Normalform', () => {
  assert.equal(isCode('SR-7K2-QX9'), true);
  assert.equal(isCode('sr-7k2-qx9'), false);
  assert.equal(isCode('SR-7K2-QX0'), false, 'die 0 gibt es im Alphabet nicht');
  assert.equal(isCode(undefined), false);
});

test('Adressen: Level und Ersteller (Kennung wird kodiert)', () => {
  assert.equal(levelPath('SR-7K2-QX9'), '/seed-runners/levels/SR-7K2-QX9');
  assert.equal(creatorPath('12345'), '/seed-runners/levels/creator/12345');
  assert.equal(creatorPath('a/b c'), '/seed-runners/levels/creator/a%2Fb%20c');
});
