// API-Client der veröffentlichten Level: richtige Adressen, Methoden und Nutzlasten; Statuscodes ≠ 200 behalten ihren Grund; nichts wirft.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listLevels, getLevel, getLevelDoc, getGhost, getCreator, beginAttempt, submitRun, reverifyOwnLevel, publishLevel,
  rateLevel, lookupRatings, setFavorite, getFavorites, getTopRandom, reportLevel, updateLevel, deleteLevel,
} from '../levelsApi.js';

const realFetch = globalThis.fetch;
const calls = [];
const reply = (code, body) => async (url, opts = {}) => {
  calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : undefined });
  return { ok: code >= 200 && code < 300, status: code, json: async () => body };
};
const withFetch = async (impl, fn) => {
  calls.length = 0;
  globalThis.fetch = impl;
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
};
const KEY = /^[a-f0-9]{64}$/;

test('listLevels: Parameter landen in der Adresse, leere und falsche fallen weg', async () => {
  await withFetch(reply(200, { items: [], total: 0, page: 1, pages: 1 }), async () => {
    await listLevels({ sort: 'popular', q: 'eis berg', tag: '', difficulty: 3, speed: undefined, page: 2, mine: true, limit: null, unused: false });
  });
  const url = new URL(calls[0].url, 'http://x');
  assert.equal(url.pathname, '/api/seed-runners/levels');
  assert.equal(url.searchParams.get('sort'), 'popular');
  assert.equal(url.searchParams.get('q'), 'eis berg');
  assert.equal(url.searchParams.get('difficulty'), '3');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('mine'), '1');
  for (const k of ['tag', 'speed', 'limit', 'unused']) assert.equal(url.searchParams.has(k), false, k);
  assert.equal(calls[0].opts.credentials, 'include');
});

test('listLevels: ein Serverfehler wirft mit lesbarem Grund', async () => {
  await withFetch(reply(429, { status: 'zu-viele', reason: 'Zu viele Anfragen. Warte kurz.' }), async () => {
    await assert.rejects(() => listLevels({}), /Zu viele Anfragen/);
  });
});

test('getLevel: schickt den Spielerschlüssel mit; 404 ist null, andere Fehler werfen', async () => {
  await withFetch(reply(200, { code: 'SR-AAA-BBB' }), async () => {
    assert.equal((await getLevel('SR-AAA-BBB')).code, 'SR-AAA-BBB');
  });
  assert.equal(calls[0].url, '/api/seed-runners/levels/SR-AAA-BBB');
  // Ohne crypto.subtle (unsichere Verbindung) gäbe es keinen Schlüssel; in Node ist er da
  assert.match(calls[0].opts.headers['X-Player-Key'], KEY);
  await withFetch(reply(404, { status: 'nicht-gefunden' }), async () => assert.equal(await getLevel('SR-AAA-BBB'), null));
  await withFetch(reply(503, { status: 'fehler', reason: 'kaputt' }), async () => assert.rejects(() => getLevel('SR-AAA-BBB'), /kaputt/));
});

test('getLevelDoc, getGhost, getCreator: Adresse, 404 → null', async () => {
  await withFetch(reply(200, { hash: 'h', doc: {} }), async () => assert.equal((await getLevelDoc('SR-AAA-BBB')).hash, 'h'));
  assert.equal(calls[0].url, '/api/seed-runners/levels/SR-AAA-BBB/doc');
  await withFetch(reply(404, {}), async () => assert.equal(await getLevelDoc('SR-AAA-BBB'), null));

  await withFetch(reply(200, { name: 'A', log: [] }), async () => assert.equal((await getGhost('SR-AAA-BBB', 'creator')).name, 'A'));
  assert.equal(calls[0].url, '/api/seed-runners/levels/SR-AAA-BBB/ghost/creator');
  await withFetch(reply(200, { name: 'A', log: [] }), async () => { await getGhost('SR-AAA-BBB', 42); });
  assert.equal(calls[0].url, '/api/seed-runners/levels/SR-AAA-BBB/ghost/42');
  await withFetch(reply(404, {}), async () => assert.equal(await getGhost('SR-AAA-BBB', 42), null));

  await withFetch(reply(200, { id: 'a b', levels: [] }), async () => { await getCreator('a b'); });
  assert.equal(calls[0].url, '/api/seed-runners/creators/a%20b');
  await withFetch(reply(404, {}), async () => assert.equal(await getCreator('x'), null));
});

test('submitRun: Lauf, Name und Spielerschlüssel gehen an den Server; Ablehnungen behalten ihren Grund', async () => {
  await withFetch(reply(200, { status: 'ok', ticks: 700, rank: 2 }), async () => {
    const res = await submitRun('SR-AAA-BBB', { ticks: 700, log: [0, 2], fp: 'abc', name: 'Gast', ausserdem: 'wird nicht mitgeschickt' });
    assert.equal(res.rank, 2);
  });
  assert.equal(calls[0].url, '/api/seed-runners/levels/SR-AAA-BBB/submit');
  assert.equal(calls[0].opts.method, 'POST');
  const { playerKey, ...rest } = calls[0].body;
  assert.match(playerKey, KEY);
  assert.deepEqual(rest, { name: 'Gast', ticks: 700, log: [0, 2], fp: 'abc' }, 'nur die bekannten Felder gehen raus');

  for (const [code, body] of [[422, { status: 'abgelehnt', reason: 'Zeit weicht ab.' }], [409, { status: 'ungeprueft', reason: 'Neu laden.' }], [503, { status: 'busy', reason: 'Voll.' }]]) {
    await withFetch(reply(code, body), async () => {
      const res = await submitRun('SR-AAA-BBB', { ticks: 700, log: [], fp: 'x', name: '' });
      assert.equal(res.status, body.status);
      assert.equal(res.reason, body.reason);
    });
  }
});

test('Aktionen: 401 wird zur Anmelde-Meldung, kein Netz und kaputte Antworten werfen nicht', async () => {
  const actions = [
    () => submitRun('SR-AAA-BBB', { ticks: 1, log: [], fp: '', name: '' }),
    () => reverifyOwnLevel('SR-AAA-BBB', { ticks: 1, log: [], fp: '' }),
    () => publishLevel({ doc: {}, hash: 'h' }),
    () => rateLevel({ kind: 'custom', code: 'SR-AAA-BBB' }, 4),
    () => setFavorite({ kind: 'pfad', seed: 'x', biome: 'ice' }, true),
    () => reportLevel('SR-AAA-BBB', { reason: 'kopie', note: '' }),
    () => updateLevel('SR-AAA-BBB', { name: 'x' }),
    () => deleteLevel('SR-AAA-BBB'),
  ];
  for (const act of actions) {
    await withFetch(reply(401, { error: 'Nicht eingeloggt' }), async () => assert.equal((await act()).status, 'anmeldung'));
    await withFetch(async () => { throw new Error('offline'); }, async () => {
      const res = await act();
      assert.equal(res.status, 'fehler');
      assert.match(res.reason, /Verbindung/);
    });
    await withFetch(async () => ({ ok: false, status: 502, json: async () => { throw new Error('kein JSON'); } }), async () => {
      const res = await act();
      assert.equal(res.status, 'fehler');
      assert.match(res.reason, /502/);
    });
  }
});

test('publishLevel: sendet Dokument und Hash; "doppelt" liefert den vorhandenen Code', async () => {
  await withFetch(reply(200, { status: 'ok', code: 'SR-AAA-BBB' }), async () => {
    assert.equal((await publishLevel({ doc: { a: 1 }, hash: 'h', extra: 1 })).code, 'SR-AAA-BBB');
  });
  assert.equal(calls[0].url, '/api/seed-runners/levels/publish');
  assert.deepEqual(calls[0].body, { doc: { a: 1 }, hash: 'h' });
  await withFetch(reply(409, { status: 'doppelt', reason: 'Du hast dieses Level schon veröffentlicht.', existing: 'SR-CCC-DDD' }), async () => {
    const res = await publishLevel({ doc: {}, hash: 'h' });
    assert.equal(res.status, 'doppelt');
    assert.equal(res.existing, 'SR-CCC-DDD');
  });
  await withFetch(reply(409, { status: 'nicht-verifiziert', reason: 'Erst verifizieren.' }), async () => assert.equal((await publishLevel({ doc: {}, hash: 'h' })).status, 'nicht-verifiziert'));
});

test('Sterne und Favoriten: Adressen, Nutzlast mit Spielerschlüssel, Listen per Kopfzeile, Fehler werden leer', async () => {
  const ref = { kind: 'pfad', seed: 'abc', biome: 'ice' };
  await withFetch(reply(200, { status: 'ok', mine: 4, rating: { avg: 4, count: 1 }, items: [{ key: 'p:abc|ice' }] }), async () => {
    assert.equal((await rateLevel(ref, 4)).mine, 4);
    assert.deepEqual(await lookupRatings([ref]), [{ key: 'p:abc|ice' }]);
    await setFavorite(ref, true, { leitidee: 'seilakt' });
    assert.deepEqual(await getFavorites(), [{ key: 'p:abc|ice' }]);
    await getTopRandom(5);
  });
  assert.deepEqual(calls.map((c) => `${c.opts.method || 'GET'} ${c.url}`), [
    'POST /api/seed-runners/ratings', 'POST /api/seed-runners/ratings/lookup', 'POST /api/seed-runners/favorites',
    'GET /api/seed-runners/favorites', 'GET /api/seed-runners/ratings/top?limit=5',
  ]);
  assert.deepEqual({ ...calls[0].body, playerKey: 'k' }, { ref, stars: 4, playerKey: 'k' });
  assert.match(calls[0].body.playerKey, KEY);
  assert.deepEqual(calls[2].body.info, { leitidee: 'seilakt' });
  assert.match(calls[3].opts.headers['X-Player-Key'], KEY);
  await withFetch(async () => { throw new Error('offline'); }, async () => assert.deepEqual(await lookupRatings([ref]), []));
  await withFetch(reply(500, {}), async () => assert.rejects(getFavorites()));
});

test('Melden, Ändern, Löschen, Neu-Verifizieren: Methode und Adresse', async () => {
  await withFetch(reply(200, { status: 'ok' }), async () => {
    await reportLevel('SR-AAA-BBB', { reason: 'unspielbar', note: 'geht nicht', ignoriert: 1 });
    await updateLevel('SR-AAA-BBB', { name: 'Neu', tags: ['a'] });
    await deleteLevel('SR-AAA-BBB');
    await reverifyOwnLevel('SR-AAA-BBB', { ticks: 700, log: [0, 2], fp: 'abc', extra: 1 });
  });
  const seen = calls.map((c) => `${c.opts.method} ${c.url.replace('/api/seed-runners/levels/SR-AAA-BBB', '')}`);
  assert.deepEqual(seen, ['POST /report', 'PATCH ', 'DELETE ', 'POST /reverify']);
  assert.deepEqual(calls[0].body, { reason: 'unspielbar', note: 'geht nicht' });
  assert.deepEqual(calls[1].body, { name: 'Neu', tags: ['a'] });
  assert.deepEqual(calls[3].body, { ticks: 700, log: [0, 2], fp: 'abc' });
});

test('beginAttempt: schickt den Schlüssel; Fehler bleiben still (nur Statistik)', async () => {
  await withFetch(reply(200, { counted: true }), async () => { await beginAttempt('SR-AAA-BBB'); });
  assert.equal(calls[0].url, '/api/seed-runners/levels/SR-AAA-BBB/play');
  assert.match(calls[0].body.playerKey, KEY);
  await withFetch(async () => { throw new Error('offline'); }, async () => { await beginAttempt('SR-AAA-BBB'); });
});
