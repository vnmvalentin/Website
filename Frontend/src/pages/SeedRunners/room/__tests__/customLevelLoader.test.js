// Laden eines Custom-Levels für eine Serien-Runde: Cache je Code, eigene Hash-Prüfung, nichts wirft.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomLevelLoader } from '../customLevelLoader.js';

const OK_DOC = { hash: 'aaa', doc: { fake: 1 } };
const LEVEL = { fake: 'level' };

test('load: gültiges Dokument (Hash passt) liefert das validierte Level; das Level entscheidet, ob es passt', async () => {
  const calls = [];
  const loader = createCustomLevelLoader({
    getLevelDoc: async (code) => { calls.push(code); return code === 'SR-AAA-BBB' ? OK_DOC : null; },
    validateDoc: (doc) => (doc === OK_DOC.doc ? { ok: true, hash: 'aaa', level: LEVEL } : { ok: false }),
  });
  assert.equal(await loader.load('SR-AAA-BBB'), LEVEL);
  assert.deepEqual(calls, ['SR-AAA-BBB']);
});

test('load: cacht je Code — ein zweiter Aufruf fragt den Server nicht erneut', async () => {
  let calls = 0;
  const loader = createCustomLevelLoader({
    getLevelDoc: async () => { calls++; return OK_DOC; },
    validateDoc: () => ({ ok: true, hash: 'aaa', level: LEVEL }),
  });
  const [a, b] = await Promise.all([loader.load('SR-AAA-BBB'), loader.load('SR-AAA-BBB')]);
  assert.equal(a, LEVEL);
  assert.equal(b, LEVEL);
  assert.equal(calls, 1, 'nur eine Anfrage, auch bei gleichzeitigen Aufrufen');
  assert.equal(await loader.load('SR-AAA-BBB'), LEVEL);
  assert.equal(calls, 1, 'auch danach kein erneuter Abruf');
});

test('load: unterschiedliche Codes werden unabhängig geladen', async () => {
  const seen = [];
  const loader = createCustomLevelLoader({
    getLevelDoc: async (code) => { seen.push(code); return { hash: code, doc: code }; },
    validateDoc: (doc) => ({ ok: true, hash: doc, level: `level-${doc}` }),
  });
  assert.equal(await loader.load('SR-AAA-BBB'), 'level-SR-AAA-BBB');
  assert.equal(await loader.load('SR-CCC-DDD'), 'level-SR-CCC-DDD');
  assert.deepEqual(seen, ['SR-AAA-BBB', 'SR-CCC-DDD']);
});

test('load: null (Level gibt es nicht), ein Hash-Mismatch, eine ungültige Prüfung und ein Netzfehler ergeben alle null statt zu werfen', async () => {
  const cases = [
    { getLevelDoc: async () => null, validateDoc: () => ({ ok: true, hash: 'aaa', level: LEVEL }) },
    { getLevelDoc: async () => ({ hash: 'aaa', doc: {} }), validateDoc: () => ({ ok: true, hash: 'anders', level: LEVEL }) },
    { getLevelDoc: async () => ({ hash: 'aaa', doc: {} }), validateDoc: () => ({ ok: false, errors: ['x'] }) },
    { getLevelDoc: async () => { throw new Error('offline'); }, validateDoc: () => ({ ok: true, hash: 'aaa', level: LEVEL }) },
  ];
  for (const deps of cases) {
    const loader = createCustomLevelLoader(deps);
    assert.equal(await loader.load('SR-AAA-BBB'), null);
  }
});

test('preload: stößt das Laden nur an (kein Rückgabewert, wirft nicht), ein späteres load() nutzt den bereits laufenden Abruf', async () => {
  let calls = 0;
  const loader = createCustomLevelLoader({
    getLevelDoc: async () => { calls++; return OK_DOC; },
    validateDoc: () => ({ ok: true, hash: 'aaa', level: LEVEL }),
  });
  assert.equal(loader.preload('SR-AAA-BBB'), undefined);
  assert.equal(await loader.load('SR-AAA-BBB'), LEVEL);
  assert.equal(calls, 1);
});
