// HTTP-Test der Turnier-Routen (Phase 1) — gegen eine temporäre Datenbank, ohne echte CR-API und
// ohne die echten Datenbanken der übrigen CR-Stores (die werden beim Laden der Modi sonst geöffnet).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./_harness');

const call = setup(test);

const OWNER = '100:veranstalter';
let id;

test('Anlegen braucht Login und einen Namen', async () => {
  assert.equal((await call('POST', '/', { body: { settings: { name: 'X' } } })).status, 401);
  const bad = await call('POST', '/', { user: OWNER, body: { settings: {} } });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error, 'tournamentNameMissing');
  const ok = await call('POST', '/', { user: OWNER, body: { settings: { name: 'Cup', maxPlayers: 3, modeSelection: 'random' } } });
  assert.equal(ok.status, 200);
  id = ok.data.id;
});

test('Meta liefert nur Solo-Modi', async () => {
  const { data } = await call('GET', '/meta');
  assert.ok(data.soloModes.includes('snake'));
  assert.ok(!data.soloModes.includes('elixir-auction-2v2'));
});

test('Anmeldung im Twitch-Modus braucht Login, prüft den Tag und verhindert Doppelungen', async () => {
  assert.equal((await call('POST', `/${id}/join`, { body: { crTag: '#2PPQ0' } })).data.error, 'tournamentLoginRequired');
  assert.equal((await call('POST', `/${id}/join`, { user: '1:alice', body: { crTag: '#Q0Q0Q0' } })).data.error, 'tagNotFound');
  const a = await call('POST', `/${id}/join`, { user: '1:alice', body: { crTag: '#2ppq0' } });
  assert.equal(a.status, 200);
  assert.equal(a.data.participant.crTag, '2PPQ0');
  assert.equal(a.data.participant.crName, 'Spieler 2PPQ0');
  assert.equal(a.data.secret, null);
  assert.equal((await call('POST', `/${id}/join`, { user: '1:alice', body: { crTag: '#8LQGR' } })).data.error, 'tournamentAlreadyJoined');
  assert.equal((await call('POST', `/${id}/join`, { user: '2:bob', body: { crTag: '#2PPQ0' } })).data.error, 'tournamentTagTaken');
});

test('Ungültiger Freundschaftslink wird abgelehnt', async () => {
  const r = await call('POST', `/${id}/join`, { user: '2:bob', body: { crTag: '#8LQGR', friendLink: 'https://evil.example/x' } });
  assert.equal(r.data.error, 'tournamentFriendLinkInvalid');
});

test('Turnier ist bei maxPlayers voll', async () => {
  assert.equal((await call('POST', `/${id}/join`, { user: '2:bob', body: { crTag: '#8LQGR' } })).status, 200);
  assert.equal((await call('POST', `/${id}/join`, { user: OWNER, body: { crTag: '#9YJCU' } })).status, 200); // Veranstalter spielt mit
  assert.equal((await call('POST', `/${id}/join`, { user: '3:carl', body: { crTag: '#2V8Y9' } })).data.error, 'tournamentFull');
});

test('Öffentliche Ansicht verrät keine Twitch-IDs, Geheimnisse oder Freundschaftslinks', async () => {
  const { data } = await call('GET', `/${id}`, { user: '1:alice' });
  assert.equal(data.participants.length, 3);
  for (const p of data.participants) {
    assert.equal(p.twitchId, undefined); assert.equal(p.secret, undefined); assert.equal(p.friendLink, undefined);
  }
  assert.equal(data.me.crTag, '2PPQ0');
  assert.equal(data.isOwner, false);
  assert.ok(data.participants.some(p => p.isOwner));
});

test('Bearbeiten nur durch den Veranstalter und nicht unter die Teilnehmerzahl', async () => {
  assert.equal((await call('PATCH', `/${id}`, { user: '1:alice', body: { settings: { name: 'Gekapert' } } })).status, 403);
  assert.equal((await call('PATCH', `/${id}`, { user: OWNER, body: { settings: { maxPlayers: 2 } } })).data.error, 'tournamentBelowParticipants');
  const ok = await call('PATCH', `/${id}`, { user: OWNER, body: { settings: { maxPlayers: 8, description: 'Hallo' } } });
  assert.equal(ok.data.tournament.settings.maxPlayers, 8);
  assert.equal(ok.data.tournament.settings.name, 'Cup');
});

test('Abmelden und Entfernen durch den Veranstalter', async () => {
  assert.equal((await call('POST', `/${id}/leave`, { user: '1:alice' })).status, 200);
  const view = await call('GET', `/${id}`, { user: OWNER });
  const bob = view.data.participants.find(p => p.crTag === '8LQGR');
  assert.equal((await call('DELETE', `/${id}/participants/${bob.id}`, { user: '1:alice' })).status, 403);
  assert.equal((await call('DELETE', `/${id}/participants/${bob.id}`, { user: OWNER })).status, 200);
  assert.equal((await call('GET', `/${id}`)).data.participants.length, 1);
});

test('Offener Anmeldemodus: Name Pflicht, Geheimnis identifiziert die Anmeldung', async () => {
  const created = await call('POST', '/', { user: OWNER, body: { settings: { name: 'Offen', signupMode: 'open', modeSelection: 'random' } } });
  const oid = created.data.id;
  assert.equal((await call('POST', `/${oid}/join`, { body: { crTag: '#GRJ2P' } })).data.error, 'nameMissing');
  const j = await call('POST', `/${oid}/join`, { body: { crTag: '#GRJ2P', displayName: 'Gast' } });
  assert.equal(j.status, 200);
  assert.ok(j.data.secret && j.data.secret.length > 10);
  assert.equal((await call('GET', `/${oid}`, { secret: j.data.secret })).data.me.displayName, 'Gast');
  assert.equal((await call('GET', `/${oid}`, { secret: 'falsch' })).data.me, null);
  const link = 'https://link.clashroyale.com/invite/friend/de?tag=GRJ2P&token=abc';
  assert.equal((await call('PATCH', `/${oid}/me`, { secret: j.data.secret, body: { friendLink: link } })).data.friendLink, link);
  assert.equal((await call('POST', `/${oid}/leave`, { secret: j.data.secret })).status, 200);
});

test('Absagen nur durch den Veranstalter; abgesagte Turniere sind nicht mehr gelistet', async () => {
  assert.equal((await call('POST', `/${id}/cancel`, { user: '1:alice' })).status, 403);
  assert.equal((await call('POST', `/${id}/cancel`, { user: OWNER })).status, 200);
  const list = await call('GET', '/');
  assert.ok(!list.data.tournaments.some(t => t.id === id));
  assert.equal((await call('POST', `/${id}/join`, { user: '5:eve', body: { crTag: '#UVC0Q' } })).data.error, 'tournamentAlreadyStarted');
});
