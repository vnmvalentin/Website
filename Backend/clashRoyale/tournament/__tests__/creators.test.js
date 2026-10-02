// Turniere erstellen nur für den Admin und freigegebene Content Creator; Freigaben verwaltet der Admin.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, store } = require('./_harness');

const call = setup(test);
const ADMIN = '100:veranstalter';
const CREATOR = '7:streamerin';
const STRANGER = '8:irgendwer';
const settings = { name: 'Freigabe', modeSelection: 'random' };

test('Ohne Freigabe kein Turnier, Meta zeigt das an', async () => {
  assert.equal((await call('POST', '/', { user: STRANGER, body: { settings } })).data.error, 'tournamentCreateNotAllowed');
  assert.equal((await call('GET', '/meta', { user: STRANGER })).data.canCreate, false);
  assert.equal((await call('GET', '/meta')).data.canCreate, false, 'ohne Login');
  assert.equal((await call('GET', '/meta', { user: ADMIN })).data.canCreate, true, 'Admin darf immer');
});

test('Nur der Admin verwaltet Freigaben; freigegebene Accounts dürfen erstellen, nach dem Entfernen nicht mehr', async () => {
  assert.equal((await call('POST', '/creators', { user: STRANGER, body: { login: 'streamerin' } })).status, 403);
  assert.equal((await call('GET', '/creators', { user: STRANGER })).status, 403);
  assert.equal((await call('POST', '/creators', { user: ADMIN, body: { login: 'kein login!' } })).data.error, 'tournamentCreatorInvalid');

  const added = await call('POST', '/creators', { user: ADMIN, body: { login: '@StreamerIn' } });
  assert.deepEqual(added.data.creators.map(c => c.login), ['streamerin'], 'Login normalisiert (ohne @, klein)');
  assert.equal((await call('GET', '/meta', { user: CREATOR })).data.canCreate, true);
  assert.equal((await call('POST', '/', { user: CREATOR, body: { settings } })).status, 200);
  assert.equal(store.listCreators()[0].twitchId, '7', 'Twitch-ID beim ersten Login nachgetragen');

  // Später umbenannt: die Freigabe hängt jetzt an der ID
  assert.equal((await call('GET', '/meta', { user: '7:neuername' })).data.canCreate, true);
  // Jemand anderes übernimmt den alten Namen → keine Freigabe
  assert.equal((await call('GET', '/meta', { user: '9:streamerin' })).data.canCreate, false);

  await call('DELETE', '/creators/streamerin', { user: ADMIN });
  assert.equal((await call('POST', '/', { user: CREATOR, body: { settings } })).data.error, 'tournamentCreateNotAllowed');
});
