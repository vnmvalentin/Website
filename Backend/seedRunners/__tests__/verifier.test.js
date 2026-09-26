// Tests des Prüfers (verifier.js): echter Worker-Thread mit der echten Sim, dazu ein Test-Worker, der
// hängt oder abstürzt, um Zeitüberschreitung, Neustart, Warteschlange und Beenden zu prüfen.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createVerifier } = require('../verifier');
const { loadEngine } = require('../replay');

const TEST_WORKER = path.join(__dirname, 'hangWorker.js');
const PARAMS = { seed: 'verifier', length: 'short', speedClass: 'normal', biome: 'meadow' };

test('Echter Worker: lädt die Sim, erzeugt das Level und meldet ein leeres Log als ungültig', async () => {
  const engine = await loadEngine();
  const verifier = createVerifier();
  try {
    const bad = await verifier.verify({ params: PARAMS, log: [], ticks: 4000, fp: engine.ENGINE_FINGERPRINT });
    assert.equal(bad.status, 'invalid');
    assert.match(bad.reason, /Ziel/);
    const other = await verifier.verify({ params: PARAMS, log: [], ticks: 4000, fp: 'anderer-stand' });
    assert.equal(other.status, 'skipped');
    const s = verifier.stats();
    assert.equal(s.done, 2);
    assert.equal(s.invalid, 1);
    assert.equal(s.skipped, 1);
    assert.equal(s.waiting, 0);
  } finally {
    await verifier.close();
  }
});

test('Aufträge laufen nacheinander in der Reihenfolge des Eingangs', async () => {
  const verifier = createVerifier({ workerFile: TEST_WORKER });
  try {
    const results = await Promise.all([1, 2, 3, 4].map((n) => verifier.verify({ mode: 'echo', ticks: n })));
    assert.deepEqual(results.map((r) => r.ticks), [1, 2, 3, 4]);
  } finally {
    await verifier.close();
  }
});

test('Zu viele wartende Aufträge werden abgewiesen (busy), die laufenden gehen durch', async () => {
  const verifier = createVerifier({ workerFile: TEST_WORKER, maxQueue: 1, timeoutMs: 300 });
  try {
    const first = verifier.verify({ mode: 'hang' });          // läuft (und hängt)
    const second = verifier.verify({ mode: 'echo', ticks: 2 });  // wartet
    const third = await verifier.verify({ mode: 'echo', ticks: 3 });
    assert.equal(third.status, 'busy');
    assert.equal((await first).status, 'error');              // Zeitüberschreitung
    assert.equal((await second).status, 'ok', 'der Wartende kommt nach dem Neustart dran');
  } finally {
    await verifier.close();
  }
});

test('Ein hängender Worker wird nach der Frist beendet; der nächste Auftrag bekommt einen frischen', async () => {
  const verifier = createVerifier({ workerFile: TEST_WORKER, timeoutMs: 150 });
  try {
    const hung = await verifier.verify({ mode: 'hang' });
    assert.equal(hung.status, 'error');
    assert.match(hung.reason, /Zeitüberschreitung/);
    assert.equal(verifier.stats().timeouts, 1);
    const fine = await verifier.verify({ mode: 'echo', ticks: 7 });
    assert.equal(fine.status, 'ok');
    assert.equal(fine.ticks, 7);
  } finally {
    await verifier.close();
  }
});

test('Ein abgestürzter Worker beendet nur seinen Auftrag; danach läuft alles weiter', async () => {
  const verifier = createVerifier({ workerFile: TEST_WORKER, timeoutMs: 2000 });
  try {
    const crashed = await verifier.verify({ mode: 'crash' });
    assert.equal(crashed.status, 'error');
    const fine = await verifier.verify({ mode: 'echo', ticks: 9 });
    assert.equal(fine.status, 'ok');
  } finally {
    await verifier.close();
  }
});

test('Beenden: Wartende und Laufende bekommen "error", danach lehnt der Prüfer alles ab', async () => {
  const verifier = createVerifier({ workerFile: TEST_WORKER, timeoutMs: 5000 });
  const running = verifier.verify({ mode: 'hang' });
  const waiting = verifier.verify({ mode: 'echo', ticks: 1 });
  await verifier.close();
  assert.equal((await running).status, 'error');
  assert.equal((await waiting).status, 'error');
  assert.equal((await verifier.verify({ mode: 'echo', ticks: 1 })).status, 'error');
});
