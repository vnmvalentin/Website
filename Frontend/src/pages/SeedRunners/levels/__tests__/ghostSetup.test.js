// Auswahl und Laden der Geister: höchstens drei, feste Farbe für den Ersteller, und nur Logs aus derselben Physik laufen mit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleGhost, ghostColors, loadGhosts, MAX_GHOSTS } from '../ghostSetup.js';

test('toggleGhost: dazu, weg, und höchstens MAX_GHOSTS', () => {
  let sel = [];
  sel = toggleGhost(sel, 'creator');
  sel = toggleGhost(sel, 11);
  sel = toggleGhost(sel, 12);
  assert.deepEqual(sel, ['creator', 11, 12]);
  assert.equal(sel.length, MAX_GHOSTS);
  assert.deepEqual(toggleGhost(sel, 13), sel, 'ein vierter kommt nicht dazu');
  assert.deepEqual(toggleGhost(sel, 11), ['creator', 12], 'ein gewählter fällt heraus, die Reihenfolge bleibt');
  assert.deepEqual(toggleGhost(toggleGhost(sel, 11), 13), ['creator', 12, 13], 'danach ist wieder Platz');
});

test('toggleGhost: verändert die Eingabe nicht', () => {
  const sel = Object.freeze(['creator']);
  assert.deepEqual(toggleGhost(sel, 5), ['creator', 5]);
  assert.deepEqual(toggleGhost(sel, 'creator'), []);
});

test('ghostColors: der Ersteller hat immer dieselbe Farbe, die anderen bekommen verschiedene', () => {
  const a = ghostColors(['creator', 4, 9]);
  const b = ghostColors([4, 'creator', 9]);
  assert.equal(a.creator, b.creator);
  assert.notEqual(a[4], a[9]);
  assert.notEqual(a[4], a.creator);
  assert.notEqual(a[9], a.creator);
  assert.deepEqual(ghostColors([]), { creator: a.creator });
});

test('loadGhosts: nur Läufe aus derselben Physik, Fehler und fehlende Geister werden übersprungen und gezählt', async () => {
  const runs = {
    creator: { name: 'Ersteller', ticks: 900, deaths: 0, simFp: 'AAA', log: [0, 2] },
    5: { name: 'Bob', ticks: 1000, deaths: 1, simFp: 'AAA', log: [0, 2, 40, 18] },
    6: { name: 'Alt', ticks: 1100, deaths: 2, simFp: 'ZZZ', log: [0, 2] },
    8: { name: 'Kaputt', ticks: 1200, deaths: 0, simFp: 'AAA', log: 'kein Log' },
  };
  const asked = [];
  const fetchGhost = async (code, id) => {
    asked.push([code, id]);
    if (id === 7) throw new Error('offline');
    return runs[id] || null;
  };
  const { ghosts, skipped } = await loadGhosts('SR-AAA-BBB', ['creator', 5, 6, 7, 8, 9], { fetchGhost, simFp: 'AAA' });
  assert.deepEqual(asked.map((a) => a[0]), Array(6).fill('SR-AAA-BBB'));
  assert.deepEqual(ghosts.map((g) => g.name), ['Ersteller', 'Bob']);
  assert.equal(skipped, 4, 'älterer Stand, offline, kaputtes Log, unbekannt');
  assert.deepEqual(ghosts[1].log, [0, 2, 40, 18]);
  assert.equal(ghosts[0].ticks, 900);
  assert.ok(ghosts.every((g) => typeof g.color === 'string' && g.color.startsWith('#')));
  assert.equal(ghosts[0].color, ghostColors(['creator']).creator);
});

test('loadGhosts: ohne Auswahl nichts zu laden', async () => {
  const res = await loadGhosts('SR-AAA-BBB', [], { fetchGhost: async () => { throw new Error('nicht aufrufen'); }, simFp: 'AAA' });
  assert.deepEqual(res, { ghosts: [], skipped: 0 });
});
