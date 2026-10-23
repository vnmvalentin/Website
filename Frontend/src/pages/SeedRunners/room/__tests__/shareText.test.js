// Teilbares Ergebnis des Tagesrennens
import test from 'node:test';
import assert from 'node:assert/strict';
import { abschnittQuadrate, tagesrennenText } from '../shareText.js';
import { TICK_HZ } from '../../sim/config.js';

const entries = [
  { name: 'Anna', splits: [[1, 1000], [2, 2000], [3, 3000]] },
  { name: 'Bob', splits: [[1, 900], [2, 2100]] },
];

test('Quadrate vergleichen Abschnitte, nicht kumulative Zeiten', () => {
  // Abschnitte: CP1 900 (= Bob), CP2 1000 (Anna 1000), CP3 1200 gegen 1000 (+20 %)
  assert.equal(abschnittQuadrate([[1, 900], [2, 1900], [3, 3100]], entries), '🟩🟩🟥');
  // CP1 950 gegen 900 (+5,6 %) → gelb; CP2 1020 gegen 1000 (+2 %) → grün
  assert.equal(abschnittQuadrate([[2, 1970], [1, 950]], entries), '🟨🟩');
});

test('Checkpoint, den sonst niemand hat, zählt als grün; ohne Zwischenzeiten keine Quadrate', () => {
  assert.equal(abschnittQuadrate([[1, 900], [4, 5000]], entries), '🟩🟩');
  assert.equal(abschnittQuadrate([], entries), '');
});

test('Text mit Platz, ohne Platz im Archiv', () => {
  const lauf = { ticks: 102 * TICK_HZ + 36, deaths: 1, splits: [[1, 900]] };
  const t = tagesrennenText({ dateKey: '2026-10-15', lauf, rank: 12, total: 80, entries, url: 'https://x.de/seed-runners/daily' });
  assert.equal(t, 'Seed Runners · Tagesrennen 15.10.2026\n1:42.30 · Platz 12 von 80 · 1 Tod\n🟩\nhttps://x.de/seed-runners/daily');
  const a = tagesrennenText({ dateKey: '2026-10-01', lauf: { ...lauf, deaths: 3, splits: [] }, rank: 4, total: 9, entries, url: 'u', archiv: true });
  assert.equal(a, 'Seed Runners · Archiv 01.10.2026\n1:42.30 · 3 Tode\nu');
});
