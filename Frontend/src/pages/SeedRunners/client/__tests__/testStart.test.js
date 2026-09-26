// Testspiel ab beliebiger Stelle und die gemeinsam genutzten Zeichenfunktionen des Editors.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevelWorld } from '../../sim/levelWorld.js';
import { stepWorld } from '../../sim/world.js';
import { TILE, PLAYER_W, PLAYER_H } from '../../sim/config.js';
import { emptyDoc, docToLevel } from '../../level/index.js';
import { validateDoc } from '../../level/validate.js';
import { moveStartTo } from '../testStart.js';
import { drawTiles, drawCheckpointFlag, drawFinishTile, drawAnchorDot } from '../render.js';

const stubContext = () => new Proxy({}, { get: (_, key) => (key === 'canvas' ? {} : () => {}), set: () => true });

function testWorld() {
  const doc = emptyDoc({ width: 80, height: 30 });
  doc.elements.push({ type: 'spike', tx: 40, ty: 25 });
  const res = validateDoc(doc);
  assert.ok(res.ok, res.errors?.join(' | '));
  return createLevelWorld(res.level);
}

test('moveStartTo: Figur steht mittig auf der Kachel, Füße auf der Unterkante', () => {
  const w = testWorld();
  moveStartTo(w, 20, 25);
  assert.equal(w.player.x, 20 * TILE + (TILE - PLAYER_W) / 2);
  assert.equal(w.player.y, 26 * TILE - PLAYER_H);
});

test('moveStartTo: nach einem Tod geht es an der Teststelle weiter, nicht am Levelstart', () => {
  const w = testWorld();
  moveStartTo(w, 38, 25);
  const x0 = w.player.x;
  // Nach rechts in die Spikes laufen
  for (let t = 0; t < 400 && w.deaths === 0; t++) stepWorld(w, 2);
  assert.equal(w.deaths, 1, 'in die Spikes gelaufen');
  assert.equal(w.player.x, x0, 'zurück an der Teststelle');
  assert.equal(w.player.y, 26 * TILE - PLAYER_H);
});

test('moveStartTo ändert den Checkpoint-Stand nicht und wirkt nur auf diese Welt', () => {
  const a = testWorld();
  const b = testWorld();
  moveStartTo(a, 30, 25);
  assert.equal(a.checkpointIndex, 0);
  assert.notEqual(b.spawns[0].tx, 30, 'die andere Welt behält ihren Start');
  assert.equal(docToLevel(emptyDoc()).rows.length, 30);
});

test('drawTiles liefert den sichtbaren Kachelbereich und begrenzt ihn auf die Karte', () => {
  const w = testWorld();
  const ctx = stubContext();
  const palette = { bg: '#000', tile: '#111', tileTop: '#222', accent: '#333', far: '#444' };
  const inner = drawTiles(ctx, 2, w.map, 10 * TILE, 5 * TILE, 200, 100, palette, 0);
  assert.equal(inner.tx0, 10);
  assert.equal(inner.tx1, Math.ceil((10 * TILE + 200) / TILE));
  assert.equal(inner.ty0, 5);
  const outer = drawTiles(ctx, 2, w.map, -500, -500, 100000, 100000, palette, 0);
  assert.deepEqual([outer.tx0, outer.ty0, outer.tx1, outer.ty1], [0, 0, w.map.w - 1, w.map.h - 1]);
});

test('Marker-Zeichenfunktionen laufen mit jeder Eingabe durch', () => {
  const ctx = stubContext();
  drawCheckpointFlag(ctx, { tx: 3, ty: 4 }, true, 0.5);
  drawCheckpointFlag(ctx, { tx: 3, ty: 4 }, false);
  drawFinishTile(ctx, { tx: 5, ty: 5 }, 100);
  drawAnchorDot(ctx, { x: 10, y: 10 }, true);
  drawAnchorDot(ctx, { x: 10, y: 10 }, false);
});
