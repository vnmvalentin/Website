// Alle Turnier-Abfragen an die CR-API laufen über denselben Schlüssel (tournament/crToken.js):
// eigener Turnier-Schlüssel vor WinTracker-Schlüssel — auch die Kürzel-Prüfung bei der Anmeldung.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CLASH_ROYALE_API_TOKEN_TOURNAMENT = 'turnier-schluessel';
process.env.CLASH_ROYALE_API_TOKEN_WINTRACKER = 'wintracker-schluessel';
const { setup, apiCalls } = require('./_harness');
const { crToken } = require('../crToken');

const call = setup(test);

test('Anmeldung prüft das Kürzel mit dem Turnier-Schlüssel', async () => {
  const { data } = await call('POST', '/', { user: '100:veranstalter', body: { settings: { name: 'Schlüssel', modeSelection: 'random' } } });
  await call('POST', `/${data.id}/join`, { user: '1:anna', body: { crTag: '#2PPQ0' } });
  assert.deepEqual(apiCalls.at(-1), { tag: '2PPQ0', token: 'turnier-schluessel' });
});

test('Ohne Turnier-Schlüssel: WinTracker-Schlüssel, ohne beide: Standard-Schlüssel der crApi', () => {
  assert.equal(crToken(), 'turnier-schluessel');
  delete process.env.CLASH_ROYALE_API_TOKEN_TOURNAMENT;
  assert.equal(crToken(), 'wintracker-schluessel');
  delete process.env.CLASH_ROYALE_API_TOKEN_WINTRACKER;
  assert.equal(crToken(), undefined);
});
