// API-Client der Level-Verifizierung: Statuscodes werden zu Meldungen, nichts wirft.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLevel, getVerification } from '../levelApi.js';

const realFetch = globalThis.fetch;
const reply = (code, body) => async () => ({ ok: code >= 200 && code < 300, status: code, json: async () => body });
const withFetch = async (impl, fn) => {
  globalThis.fetch = impl;
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
};

test('verifyLevel: sendet Dokument, Log, Zeit und Fingerprint mit Cookie an den Server', async () => {
  let seen;
  await withFetch(async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => ({ status: 'ok', ticks: 700 }) }; }, async () => {
    const res = await verifyLevel({ doc: { a: 1 }, log: [0, 2], ticks: 700, fp: 'abc', hash: 'h' });
    assert.equal(res.status, 'ok');
  });
  assert.equal(seen.url, '/api/seed-runners/levels/verify');
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.credentials, 'include');
  assert.deepEqual(JSON.parse(seen.opts.body), { doc: { a: 1 }, log: [0, 2], ticks: 700, fp: 'abc', hash: 'h' });
});

test('verifyLevel: Statuscodes ≠ 200 behalten ihren Grund; 401 wird zur Anmelde-Meldung', async () => {
  for (const [code, body, status] of [
    [422, { status: 'abgelehnt', reason: 'Zeit weicht ab.' }, 'abgelehnt'],
    [409, { status: 'ungeprueft', reason: 'Neu laden.' }, 'ungeprueft'],
    [400, { status: 'ungueltig', reason: 'Das Level ist ungültig.', errors: ['x'] }, 'ungueltig'],
    [503, { status: 'busy', reason: 'Zu voll.' }, 'busy'],
    [429, { status: 'zu-viele', reason: 'Warte.' }, 'zu-viele'],
  ]) {
    await withFetch(reply(code, body), async () => {
      const res = await verifyLevel({});
      assert.equal(res.status, status);
      assert.equal(res.reason, body.reason);
    });
  }
  await withFetch(reply(401, { error: 'Nicht eingeloggt' }), async () => assert.equal((await verifyLevel({})).status, 'anmeldung'));
  await withFetch(reply(500, {}), async () => {
    const res = await verifyLevel({});
    assert.equal(res.status, 'fehler');
    assert.match(res.reason, /500/);
  });
});

test('verifyLevel: kein Netz und kaputte Antwort werfen nicht', async () => {
  await withFetch(async () => { throw new Error('offline'); }, async () => {
    const res = await verifyLevel({});
    assert.equal(res.status, 'fehler');
    assert.match(res.reason, /Verbindung/);
  });
  await withFetch(async () => ({ ok: false, status: 502, json: async () => { throw new Error('kein JSON'); } }), async () => {
    assert.equal((await verifyLevel({})).status, 'fehler');
  });
});

test('getVerification: liefert den Stand oder null, wenn er nicht abrufbar ist', async () => {
  let url;
  await withFetch(async (u) => { url = u; return { ok: true, status: 200, json: async () => ({ verified: true, current: true, ticks: 900 }) }; }, async () => {
    assert.deepEqual(await getVerification('a'.repeat(64)), { verified: true, current: true, ticks: 900 });
  });
  assert.equal(url, `/api/seed-runners/levels/verification/${'a'.repeat(64)}`);
  await withFetch(reply(200, { verified: false }), async () => assert.deepEqual(await getVerification('h'), { verified: false }));
  await withFetch(reply(401, { error: 'x' }), async () => assert.equal(await getVerification('h'), null));
  await withFetch(reply(200, { unsinn: 1 }), async () => assert.equal(await getVerification('h'), null));
  await withFetch(async () => { throw new Error('offline'); }, async () => assert.equal(await getVerification('h'), null));
});
