// Zwischenzeiten vergleichen (Tagesrennen)
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointSpalten, besteJeCheckpoint, splitVergleich } from '../splits.js';
import { formatDelta } from '../format.js';

const entries = [
  { name: 'Anna', splits: [[1, 600], [2, 1300], [3, 2000]] },
  { name: 'Bob', splits: [[1, 580], [2, 1350]] },
  { name: 'Cleo', splits: [] },
];

test('Spalten: alle vorkommenden Checkpoints, sortiert', () => {
  assert.deepEqual(checkpointSpalten([[3, 1], [1, 1]], [[2, 1]], undefined), [1, 2, 3]);
});

test('Beste Zwischenzeit je Checkpoint mit Namen — auch von jemandem, der insgesamt langsamer war', () => {
  const b = besteJeCheckpoint(entries);
  assert.deepEqual(b.get(1), { tick: 580, name: 'Bob' });
  assert.deepEqual(b.get(2), { tick: 1300, name: 'Anna' });
  assert.deepEqual(b.get(3), { tick: 2000, name: 'Anna' });
});

test('Vergleich: eigener Lauf gegen eigene Bestzeit und gegen die Tagesbesten; Checkpoints, die niemand sonst hat', () => {
  const zeilen = splitVergleich([[1, 570], [2, 1400], [3, 2100], [4, 2600]], [[1, 590], [2, 1380]], entries);
  assert.deepEqual(zeilen.map((z) => z.cp), [1, 2, 3, 4]);
  assert.deepEqual([zeilen[0].zuTagesBest, zeilen[0].zuBestDu, zeilen[0].tagesBest.name], [-10, -20, 'Bob'], 'schneller als alle am CP 1');
  assert.deepEqual([zeilen[1].zuTagesBest, zeilen[1].zuBestDu], [100, 20]);
  assert.equal(zeilen[2].zuBestDu, null, 'CP 3 fehlt in der eigenen Bestzeit');
  assert.equal(zeilen[3].tagesBest, null, 'CP 4 hat noch niemand in der Rangliste');
});

test('formatDelta: Vorzeichen, Hundertstel, ab einer Minute m:ss.hh', () => {
  assert.equal(formatDelta(0), '±0.00');
  assert.equal(formatDelta(150), '+1.25');
  assert.equal(formatDelta(-48), '−0.40');
  assert.equal(formatDelta(120 * 62), '+1:02.00');
  assert.equal(formatDelta(null), '–');
});
