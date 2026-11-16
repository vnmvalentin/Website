// Level aus dem Vorrat des Servers (client/generateWorldAsync.js): Nur ein Dokument, das zu den Runden-Parametern passt
// und dessen Prüfsumme stimmt, wird gespielt — alles andere baut der Browser selbst.
import test from 'node:test';
import assert from 'node:assert/strict';
import { vorratPasst, pfadLevel } from '../generateWorldAsync.js';
import { weltParams } from '../../gen/index.js';
import { hashText } from '../../sim/rng.js';

const PARAMS = { seed: 'vorrat-test', biome: 'random', gen: 'pfad', gv: 4 };

function dokument(aend = {}) {
  const rows = ['.....', 'S...E', '#####'];
  const level = {
    version: 3,
    params: { seed: 'vorrat-test', length: 'long', speedClass: 'super', biome: 'random', difficulty: 3, worldType: 'pfad' },
    rows,
    entities: [],
    meta: { worldType: 'pfad', start: { x: 0, y: 1 }, finish: [{ x: 4, y: 1 }] },
  };
  level.hash = hashText(`${level.version}|pfad|${rows.join('\n')}`);
  return { ...level, ...aend };
}

test('Ein Dokument mit passenden Parametern und stimmender Prüfsumme wird angenommen', () => {
  assert.equal(vorratPasst(dokument(), weltParams(PARAMS)), true);
});

test('Abgelehnt: anderer Seed, verändertes Raster, fehlende Teile, kein Dokument', () => {
  const w = weltParams(PARAMS);
  assert.equal(vorratPasst(dokument(), weltParams({ ...PARAMS, seed: 'anderer' })), false);
  assert.equal(vorratPasst(dokument({ rows: ['.....', 'S..#E', '#####'] }), w), false, 'Raster passt nicht zur Prüfsumme');
  assert.equal(vorratPasst(dokument({ hash: '00000000' }), w), false);
  assert.equal(vorratPasst(dokument({ entities: undefined }), w), false);
  assert.equal(vorratPasst(dokument({ meta: { worldType: 'pfad' } }), w), false);
  assert.equal(vorratPasst(dokument({ rows: [] }), w), false);
  assert.equal(vorratPasst(null, w), false);
  assert.equal(vorratPasst({ error: 'Nicht im Vorrat.' }, w), false);
});

test('Ohne Pfad-Parameter gibt es kein Pfad-Level (und keine Anfrage)', () => {
  assert.equal(pfadLevel({ seed: 'x', length: 'short', speedClass: 'normal', biome: 'meadow' }), null);
});
