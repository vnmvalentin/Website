// Kanone (elements/cannon.js): Kugeln im Takt, geradeaus bis zum ersten Block, Lage rein aus der Tick-Zahl.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepWorld } from '../world.js';
import { parseMap } from '../tilemap.js';
import { classTuning } from '../classes.js';
import { hashWorld } from '../hash.js';
import { INPUT } from '../inputBits.js';
import { normalizeParams } from '../elements/schema.js';

/** Gang mit Boden; Block links bei x=1 fängt, Kanone rechts schießt nach links in Kopfhöhe */
function welt(spielerX, extra = {}) {
  const rows = [];
  for (let y = 0; y < 8; y++) rows.push('.'.repeat(30));
  rows[6] = '#'.repeat(30);
  rows[5] = '.#' + '.'.repeat(28);
  rows[5] = rows[5].slice(0, spielerX) + 'S' + rows[5].slice(spielerX + 1);
  return createWorld(parseMap(rows, { entities: [{ type: 'cannon', tx: 26, ty: 5, dir: 'left', period: 1, speed: 120, ...extra }] }), { tuning: classTuning('normal') });
}

test('Kanone: die Bahn endet am ersten Block, Kugeln verschwinden dort', () => {
  const w = welt(4);
  const k = w.elements.find((e) => e.type === 'cannon');
  assert.equal(k.lane, 24);                                   // x=25 … x=2 frei, x=1 Block
  for (let t = 0; t < 400; t++) {
    stepWorld(w, 0);
    for (const b of k.bodies) if (b.on) assert.ok(b.x - k.r >= 2 * 16 - 0.001, `Kugel bei ${b.x} hinter dem Block`);
    if (w.deaths) break;
  }
});

test('Kanone: Wer in der Bahn steht, wird getroffen', () => {
  const w = welt(10);
  let tot = false;
  for (let t = 0; t < 300 && !tot; t++) { stepWorld(w, 0); tot = w.deaths > 0; }
  assert.ok(tot, 'Stehen in der Bahn überlebt');
  assert.equal(w.deathReason, 'cannon');
});

test('Kanone: Takt und Lage hängen nur an der Zeit — gleiche Welten, gleicher Hash; shotAge springt im Takt auf 0', () => {
  const a = welt(4, { phase: 0.3 });
  const b = welt(4, { phase: 0.3 });
  const alter = [];
  for (let t = 0; t < 250; t++) {
    stepWorld(a, INPUT.RIGHT);
    stepWorld(b, INPUT.RIGHT);
    alter.push(a.elements.find((e) => e.type === 'cannon').shotAge);
  }
  assert.equal(hashWorld(a), hashWorld(b));
  const schuesse = alter.map((v, i) => (i > 0 && v < alter[i - 1] ? i : -1)).filter((i) => i >= 0);
  assert.ok(schuesse.length >= 2);
  assert.equal(schuesse[1] - schuesse[0], 120);              // 1 s Takt
});

test('Kanone: Schema füllt Standardwerte aus, Unsinn wird abgelehnt', () => {
  const ok = normalizeParams('cannon', { type: 'cannon', tx: 1, ty: 1, dir: 'up' });
  assert.ok(ok.ok);
  assert.deepEqual(Object.keys(ok.clean).sort(), ['dir', 'period', 'phase', 'radius', 'speed']);
  assert.equal(normalizeParams('cannon', { type: 'cannon', tx: 1, ty: 1, period: 0 }).ok, false);
  assert.equal(normalizeParams('cannon', { type: 'cannon', tx: 1, ty: 1, dir: 'upLeft' }).ok, false);
});
