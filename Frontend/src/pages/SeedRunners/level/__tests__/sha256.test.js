// SHA-256: bitgleich mit node:crypto, auch an den Polsterungs-Grenzen (55/56/63/64/65 Byte) und mit Unicode.
// Der Hash eines Levels wird im Browser UND im Server berechnet — beide müssen dasselbe ergeben.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Hex } from '../sha256.js';

const reference = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

test('sha256 stimmt mit node:crypto überein (Grenzlängen, Unicode, lange Eingaben)', () => {
  const cases = ['', 'abc', 'Grüße ✓ 🎮 日本語', '{"a":1}', 'x'.repeat(100_000)];
  for (const n of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129]) cases.push('a'.repeat(n));
  for (const text of cases) assert.equal(sha256Hex(text), reference(text), `Länge ${text.length}`);
});

test('sha256: Ausgabe hat 64 Hexzeichen und bekannte Werte stimmen', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.match(sha256Hex('irgendwas'), /^[0-9a-f]{64}$/);
});
