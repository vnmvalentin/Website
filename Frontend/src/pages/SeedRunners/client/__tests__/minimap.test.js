// Minimap: Kachel-Kennzahlen und Ausschnitt. Reine Funktionen, kein Canvas nötig.
import test from 'node:test';
import assert from 'node:assert/strict';
import { minimapTiles, minimapAusschnitt, MINIMAP_BOX, UMGEBUNG_KACHELN } from '../minimap.js';
import { emptyDoc, validateDoc } from '../../level/index.js';
import { createLevelWorld } from '../../sim/levelWorld.js';
import { TILE } from '../../sim/config.js';

function mapOf(doc) {
  const res = validateDoc(doc, { smoke: false });
  assert.ok(res.ok, res.errors?.join(' | '));
  return createLevelWorld(res.level).map;
}

test('minimapTiles: eine Kennzahl je Kachel — fest, Luft, Checkpoint (als Säule), Ziel', () => {
  const map = mapOf(emptyDoc({ width: 30, height: 10 }));
  const t = minimapTiles(map);
  assert.equal(t.codes.length, 30 * 10);
  const at = (tx, ty) => t.codes[ty * 30 + tx];
  const boden = map.start.ty + 1;
  assert.equal(at(0, boden), 4, 'oberste Bodenreihe ist Oberfläche (dort läuft man)');
  if (boden + 1 < 10) assert.equal(at(0, boden + 1), 1, 'darunter ist Fels');
  assert.equal(at(5, 2), 0, 'oben ist Luft');
  const f = map.finish[0];
  assert.equal(at(f.tx, f.ty), 3, 'Ziel');
  for (const cp of map.checkpoints) assert.equal(at(cp.tx, cp.ty), 2, 'Checkpoint');
});

test('Ausschnitt „ganz“: das ganze Level, passt in die Box, Seitenverhältnis bleibt', () => {
  const box = MINIMAP_BOX.mittel;
  const a = minimapAusschnitt(1000, 50, 'ganz', box, 0, 0);
  assert.deepEqual([a.sx, a.sy, a.sw, a.sh], [0, 0, 1000, 50]);
  assert.ok(a.dw <= box.w && a.dh <= box.h);
  assert.ok(Math.abs(a.dw / a.dh - 20) < 1.5, `${a.dw}×${a.dh}`);
});

test('Ausschnitt „umgebung“: fester Ausschnitt um die Figur, am Rand geklemmt, füllt die Box aus', () => {
  const box = MINIMAP_BOX.gross;
  const mitte = minimapAusschnitt(1000, 60, 'umgebung', box, 500 * TILE, 30 * TILE);
  assert.equal(mitte.sw, UMGEBUNG_KACHELN);
  assert.ok(mitte.sx < 500 && mitte.sx + mitte.sw > 500, 'die Figur ist im Ausschnitt');
  assert.ok(500 - mitte.sx < mitte.sw / 2, 'nach vorn sieht man mehr');
  assert.ok(mitte.dw >= box.w - 1, 'nutzt die ganze Breite — viel größer als das ganze Level in derselben Box');
  const anfang = minimapAusschnitt(1000, 60, 'umgebung', box, 0, 0);
  assert.deepEqual([anfang.sx, anfang.sy], [0, 0]);
  const ende = minimapAusschnitt(1000, 60, 'umgebung', box, 999 * TILE, 59 * TILE);
  assert.equal(ende.sx + ende.sw, 1000);
  assert.equal(ende.sy + ende.sh, 60);
});

test('Ausschnitt „umgebung“ bei einem kleinen Level: nie größer als das Level selbst', () => {
  const a = minimapAusschnitt(40, 12, 'umgebung', MINIMAP_BOX.klein, 20 * TILE, 6 * TILE);
  assert.deepEqual([a.sx, a.sy, a.sw, a.sh], [0, 0, 40, 12]);
  assert.ok(a.dw <= MINIMAP_BOX.klein.w && a.dh <= MINIMAP_BOX.klein.h);
});
