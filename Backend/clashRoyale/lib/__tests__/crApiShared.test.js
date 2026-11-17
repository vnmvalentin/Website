// Gemeinsamer Abruf-Speicher der Clash-API (lib/crApi.js): Win-Tracker und Stats teilen sich Antworten.
// Kein Netz: fetch ist eine Attrappe.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CLASH_ROYALE_API_TOKEN = 'test';
process.env.CLASH_ROYALE_API_BASE = 'http://api.invalid/v1';
const crApi = require('../crApi');

function fakeFetch(t, { headers = {}, status = 200, delayMs = 0 } = {}) {
  const calls = [];
  t.mock.method(global, 'fetch', async (url) => {
    calls.push(String(url).replace('http://api.invalid/v1', ''));
    if (delayMs) await new Promise((r) => { setTimeout(r, delayMs); });
    return { status, ok: status >= 200 && status < 300, headers: { get: (h) => headers[h.toLowerCase()] ?? null }, json: async () => ({ n: calls.length }) };
  });
  return calls;
}

test('Ohne maxAgeMs fragt jeder Aufruf neu', async (t) => {
  crApi.clearSharedCache();
  const calls = fakeFetch(t);
  await crApi.crApiGet('/players/%23AAA');
  await crApi.crApiGet('/players/%23AAA');
  assert.equal(calls.length, 2);
  assert.equal(crApi.sharedCacheStats().entries, 0);
});

test('Mit maxAgeMs: frische Antwort wird geteilt, eine ältere neu geholt', async (t) => {
  crApi.clearSharedCache();
  const calls = fakeFetch(t);
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const a = await crApi.crApiGet('/players/%23AAA', { maxAgeMs: 10_000, token: 'tracker' });
  // anderer Schlüssel, dieselbe Adresse: dieselbe Antwort
  const b = await crApi.crApiGet('/players/%23AAA', { maxAgeMs: 30_000, token: 'stats' });
  assert.equal(a, b);
  assert.equal(calls.length, 1);
  t.mock.timers.tick(20_000);
  // wem 30 s reichen, bekommt sie weiter — wer höchstens 10 s alte Daten will, fragt neu
  assert.equal(await crApi.crApiGet('/players/%23AAA', { maxAgeMs: 30_000 }), a);
  const c = await crApi.crApiGet('/players/%23AAA', { maxAgeMs: 10_000 });
  assert.notEqual(c, a);
  assert.equal(calls.length, 2);
  assert.deepEqual(crApi.sharedCacheStats(), { fetched: 2, reused: 2, joined: 0, entries: 1 });
});

test('Gleichzeitige gleiche Abrufe teilen sich einen', async (t) => {
  crApi.clearSharedCache();
  const calls = fakeFetch(t, { delayMs: 20 });
  const [a, b, c] = await Promise.all([
    crApi.crApiGet('/players/%23BBB/battlelog', { maxAgeMs: 10_000 }),
    crApi.crApiGet('/players/%23BBB/battlelog', { maxAgeMs: 10_000 }),
    crApi.crApiGetSafe('/players/%23BBB/battlelog', { maxAgeMs: 10_000 }),
  ]);
  assert.equal(calls.length, 1);
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(crApi.sharedCacheStats().joined, 2);
});

test('Haltbarkeit laut Supercell (max-age, abzüglich Age falls vorhanden) verlängert das Teilen', async (t) => {
  crApi.clearSharedCache();
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  let calls = fakeFetch(t, { headers: { 'cache-control': 'public, max-age=60', age: '20' } });
  await crApi.crApiGet('/players/%23CCC', { maxAgeMs: 5_000 });
  t.mock.timers.tick(30_000); // älter als 5 s, aber laut Supercell noch 10 s dieselbe Antwort
  await crApi.crApiGet('/players/%23CCC', { maxAgeMs: 5_000 });
  assert.equal(calls.length, 1);
  t.mock.timers.tick(15_000);
  await crApi.crApiGet('/players/%23CCC', { maxAgeMs: 5_000 });
  assert.equal(calls.length, 2);

  t.mock.restoreAll();
  // So antwortet Supercell wirklich: kein Age-Kopf, max-age ist schon die Restzeit
  calls = fakeFetch(t, { headers: { 'cache-control': 'max-age=21' } });
  await crApi.crApiGet('/players/%23DDD', { maxAgeMs: 5_000 });
  t.mock.timers.tick(15_000);
  await crApi.crApiGet('/players/%23DDD', { maxAgeMs: 5_000 });
  assert.equal(calls.length, 1);
  t.mock.timers.tick(7_000);
  await crApi.crApiGet('/players/%23DDD', { maxAgeMs: 5_000 });
  assert.equal(calls.length, 2);

  // Ganz ohne Cache-Control zählt nur maxAgeMs
  t.mock.restoreAll();
  calls = fakeFetch(t);
  await crApi.crApiGet('/players/%23GGG', { maxAgeMs: 5_000 });
  t.mock.timers.tick(6_000);
  await crApi.crApiGet('/players/%23GGG', { maxAgeMs: 5_000 });
  assert.equal(calls.length, 2);
});

test('Fehler werden nicht gemerkt, 404 schon', async (t) => {
  crApi.clearSharedCache();
  let calls = fakeFetch(t, { status: 503 });
  await assert.rejects(crApi.crApiGet('/players/%23EEE', { maxAgeMs: 10_000 }), /HTTP 503/);
  await assert.rejects(crApi.crApiGet('/players/%23EEE', { maxAgeMs: 10_000 }), /HTTP 503/);
  assert.equal(calls.length, 2);
  t.mock.restoreAll();
  calls = fakeFetch(t, { status: 404 });
  assert.deepEqual(await crApi.crApiGet('/players/%23FFF', { maxAgeMs: 10_000 }), { notFound: true });
  assert.deepEqual(await crApi.crApiGet('/players/%23FFF', { maxAgeMs: 10_000 }), { notFound: true });
  assert.equal(calls.length, 1);
});

test('Platzierung und Weltrangliste nutzen dieselbe Adresse', async (t) => {
  crApi.clearSharedCache();
  const calls = [];
  t.mock.method(global, 'fetch', async (url) => {
    calls.push(String(url).replace('http://api.invalid/v1', ''));
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ items: [{ tag: '#2PP', rank: 5, eloRating: 2400 }] }) };
  });
  assert.equal(await crApi.resolvePolRank('2PP', { rank: 9, trophies: 2400 }), 5);
  await crApi.crApiGet(crApi.POL_TOP_PATH, { maxAgeMs: 30_000, token: 'stats' });
  assert.deepEqual(calls, [crApi.POL_TOP_PATH]);
});
