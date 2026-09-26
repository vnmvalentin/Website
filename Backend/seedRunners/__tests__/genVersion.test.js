// Generator-Versionen auf dem Server: dieselbe Version wie im Browser, ältere Versionen aus dem Archiv, alte Bewertungs-Schlüssel
// werden umgeschrieben. Die Datenbank liegt in einem Wegwerf-Ordner.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { PFAD_GEN_VERSION, cleanGv } = require('../genVersion');
const { loadEngine, levelFor } = require('../replay');
const { createStore } = require('../store');

test('PFAD_GEN_VERSION passt zur GEN_VERSION des gespiegelten Generators', async () => {
  const engine = await loadEngine();
  assert.equal(PFAD_GEN_VERSION, engine.GEN_VERSION);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'engine', 'archiv', `pfad-v${PFAD_GEN_VERSION}`, 'gen', 'world', 'generate.js')),
    'die laufende Version liegt eingefroren im Archiv (Frontend gen/tools/einfrieren.mjs, dann npm run seedrunners:spiegel)');
});

test('cleanGv: fehlt = 1, nur bekannte Versionen', () => {
  assert.equal(cleanGv(undefined), 1);
  assert.equal(cleanGv(1), 1);
  assert.equal(cleanGv('1'), 1);
  assert.equal(cleanGv(PFAD_GEN_VERSION + 1), null, 'eine Version aus der Zukunft gibt es nicht');
  assert.equal(cleanGv(0), null);
  assert.equal(cleanGv('x'), null);
});

test('Replay: ein Level einer älteren Version kommt aus dem Archiv — dasselbe Level wie damals', async () => {
  const engine = await loadEngine();
  const params = engine.normalizeParams({ seed: 'archiv-probe', biome: 'random', gen: 'pfad', gv: 1 });
  const live = await levelFor(engine, params);
  // So sähe der Server aus, wenn der Generator inzwischen Version 2 wäre: Version 1 muss aus dem Archiv kommen
  let liveGerufen = false;
  const spaeter = { ...engine, GEN_VERSION: 2, levelFuerParams: () => { liveGerufen = true; throw new Error('nicht live bauen'); } };
  const ausArchiv = await levelFor(spaeter, { ...params, _cache: 'neu' });   // (eigener Cache-Schlüssel: wirklich neu bauen)
  assert.equal(liveGerufen, false);
  assert.equal(ausArchiv.hash, live.hash);
});

test('Umstieg: Bewertungen und Favoriten mit altem Schlüssel (p:<Seed>|<Biom>) werden zu p1:<Biom>:<Seed>', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-gv-'));
  const file = path.join(dir, 'alt.db');
  try {
    createStore(file).close();
    const raw = new Database(file);
    raw.prepare('INSERT INTO sr_ratings (level_key, voter, stars, updated_at) VALUES (?, ?, ?, ?)').run('p:abc|ice', 'k:1', 4, 1);
    raw.prepare('INSERT INTO sr_ratings (level_key, voter, stars, updated_at) VALUES (?, ?, ?, ?)').run('p:x|y|random', 'k:2', 2, 1);
    raw.prepare('INSERT INTO sr_rating_stats (level_key, count, sum, updated_at) VALUES (?, ?, ?, ?)').run('p:abc|ice', 1, 4, 1);
    raw.prepare('INSERT INTO sr_favorites (voter, level_key, info_json, created_at) VALUES (?, ?, ?, ?)').run('k:1', 'p:abc|ice', '{}', 1);
    raw.close();

    const store = createStore(file);
    const L = store.levels;
    assert.deepEqual(L.ratingOf('p1:ice:abc'), { count: 1, avg: 4 });
    assert.equal(L.myRating('p1:random:x|y', 'k:2'), 2, 'ein | im Seed bleibt im Seed');
    assert.deepEqual(L.ratingOf('p:abc|ice'), { count: 0, avg: null }, 'der alte Schlüssel ist weg');
    assert.deepEqual(L.favorites('k:1').map((f) => f.key), ['p1:ice:abc']);
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
