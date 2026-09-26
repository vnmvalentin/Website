// Tests der Tages-Bausteine im Browser: Der Schlüssel für die Rangliste muss mit der Ableitung des Servers
// übereinstimmen (Backend seedRunners/daily.js: sha256("sr-daily:" + Token)), sonst würde derselbe Mensch
// über Solo-Seite und Räume hinweg zweimal in der Liste stehen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Minimaler Browser-Speicher für identity.js
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};

const { getIdentity, getDailyKey } = await import('../identity.js');
const { submitDailyRun } = await import('../dailyApi.js');

test('getDailyKey: sha256("sr-daily:" + Token) als Hex, wie der Server es ableitet', async () => {
  const { token } = getIdentity();
  const expected = createHash('sha256').update(`sr-daily:${token}`).digest('hex');
  assert.equal(await getDailyKey(), expected);
  assert.match(expected, /^[0-9a-f]{64}$/);
  assert.equal(await getDailyKey(), expected, 'stabil für dasselbe Token');
});

test('submitDailyRun: übersetzt Netzfehler und unbekannte Antworten in einen Status statt zu werfen', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual(await submitDailyRun({}), { status: 'fehler', reason: 'Keine Verbindung zum Server.' });

    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: 'Zu viele' }) });
    assert.equal((await submitDailyRun({})).status, 'zu-viele');

    globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ status: 'abgelehnt', reason: 'x' }) });
    assert.deepEqual(await submitDailyRun({}), { status: 'abgelehnt', reason: 'x' });

    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', rank: 3 }) });
    assert.equal((await submitDailyRun({})).rank, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});
