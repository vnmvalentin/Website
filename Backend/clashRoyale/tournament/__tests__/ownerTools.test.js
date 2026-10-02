// Phase 5: Werkzeuge des Veranstalters — korrigieren, zurücksetzen, disqualifizieren, pausieren, abbrechen, Übersicht.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, store, TAGS } = require('./_harness');
const room = require('../matchRoom');

const call = setup(test);
const OWNER = '100:veranstalter';
room._setLobbyApi({ create: () => 'L', exists: () => true, remove: () => {} });
room._setBattleApi({ configured: () => false, fetchLog: async () => [] });

async function started(settings, n) {
  const { data } = await call('POST', '/', { user: OWNER, body: { settings: { name: 'Werkzeug', modeSelection: 'random', bestOf: { normal: 1, finals: 3 }, ...settings } } });
  for (let i = 0; i < n; i++) await call('POST', `/${data.id}/join`, { user: `${i + 1}:s${i + 1}`, body: { crTag: '#' + TAGS[i] } });
  await call('POST', `/${data.id}/start`, { user: OWNER });
  return data.id;
}
const get = async (id, user = OWNER) => (await call('GET', `/${id}`, { user })).data;
const match = async (id, mid) => (await get(id)).structure.matches.find(m => m.id === mid);
const result = (id, mid, winner, bo) => {
  const need = Math.ceil(bo / 2);
  return call('POST', `/${id}/matches/${mid}/result`, { user: OWNER, body: { winner, scoreA: winner === 'a' ? need : 0, scoreB: winner === 'b' ? need : 0 } });
};

test('Korrigieren: Sieger tauschen, Folge-Match zieht mit; gesperrt, sobald das Folge-Match entschieden ist', async () => {
  const id = await started({ maxPlayers: 4 }, 4);
  await result(id, 'u1-1', 'a', 1);
  const before = await match(id, 'u1-1');
  assert.equal((await match(id, 'u2-1')).a, before.a);
  assert.equal((await call('POST', `/${id}/matches/u1-1/correct`, { user: '1:s1', body: { winner: 'b', scoreA: 0, scoreB: 1 } })).status, 403);
  assert.equal((await call('POST', `/${id}/matches/u1-1/correct`, { user: OWNER, body: { winner: 'b', scoreA: 0, scoreB: 1 } })).status, 200);
  assert.equal((await match(id, 'u2-1')).a, before.b, 'jetzt steht der andere Spieler im Finale');
  await result(id, 'u1-2', 'a', 1);
  await result(id, 'u2-1', 'a', 3);
  const d = await get(id);
  assert.equal(d.tournament.status, 'finished');
  assert.equal((await call('POST', `/${id}/matches/u1-1/reset`, { user: OWNER })).data.error, 'tournamentResetBlocked');
  // Finale zurücksetzen → Turnier läuft wieder, Finale wieder spielbar
  assert.equal((await call('POST', `/${id}/matches/u2-1/reset`, { user: OWNER })).data.status, 'running');
  assert.equal((await match(id, 'u2-1')).playable, true);
  assert.equal((await get(id)).structure.champion, null);
});

test('Gruppenspiel korrigieren, solange im Bracket nichts gespielt ist (Bracket wird neu gebaut)', async () => {
  const id = await started({ maxPlayers: 4, groupStage: { enabled: true, groupSize: 4, advancePerGroup: 2 } }, 4);
  let d = await get(id);
  for (const m of d.structure.matches) await result(id, m.id, 'a', 1);
  d = await get(id);
  assert.equal(d.structure.phase, 'bracket');
  const g = d.structure.matches.find(m => m.stage === 'group');
  assert.equal((await call('POST', `/${id}/matches/${g.id}/correct`, { user: OWNER, body: { winner: 'b', scoreA: 0, scoreB: 1 } })).status, 200);
  d = await get(id);
  assert.equal(d.structure.matches.find(m => m.id === g.id).winner, 'b');
  assert.equal(d.structure.phase, 'bracket', 'Bracket nach der Korrektur neu gebaut');
  const final = d.structure.matches.find(m => m.stage === 'upper' && m.playable);
  assert.equal((await result(id, final.id, 'a', final.bestOf)).status, 200);
  assert.equal((await call('POST', `/${id}/matches/${g.id}/reset`, { user: OWNER })).data.error, 'tournamentResetBlocked');
});

test('Disqualifizieren: offenes Match sofort verloren, künftige Matches ebenfalls; in der Gruppe alle Restspiele', async () => {
  const id = await started({ maxPlayers: 4 }, 4);
  let d = await get(id);
  const u11 = d.structure.matches.find(m => m.id === 'u1-1');
  const u12 = d.structure.matches.find(m => m.id === 'u1-2');
  assert.equal((await call('POST', `/${id}/participants/${u11.a}/disqualify`, { user: '2:s2' })).status, 403);
  assert.equal((await call('POST', `/${id}/participants/${u11.a}/disqualify`, { user: OWNER })).status, 200);
  d = await get(id);
  const m1 = d.structure.matches.find(m => m.id === 'u1-1');
  assert.deepEqual([m1.status, m1.winner], ['done', 'b']);
  assert.ok(d.participants.find(p => p.id === u11.a).dropped);
  // u1-2 normal gespielt; danach wird dessen Sieger disqualifiziert → kampfloser Finalsieg für den anderen
  await result(id, 'u1-2', 'a', 1);
  await call('POST', `/${id}/participants/${u12.a}/disqualify`, { user: OWNER });
  d = await get(id);
  assert.equal(d.tournament.status, 'finished');
  assert.equal(d.structure.champion, u11.b);

  const gid = await started({ maxPlayers: 4, groupStage: { enabled: true, groupSize: 4, advancePerGroup: 2 } }, 4);
  d = await get(gid);
  const victim = d.participants[0].id;
  await call('POST', `/${gid}/participants/${victim}/disqualify`, { user: OWNER });
  d = await get(gid);
  const theirs = d.structure.matches.filter(m => m.stage === 'group' && (m.a === victim || m.b === victim));
  assert.ok(theirs.every(m => m.status === 'done' && (m.a === victim ? m.winner === 'b' : m.winner === 'a')));
});

test('Pause: kein Spielstart, Bereit-Frist steht still; Übersicht nur für den Veranstalter; Abbrechen nach dem Start', async () => {
  const id = await started({ maxPlayers: 2, showUpMinutes: 5 }, 2);
  const m = (await get(id)).structure.matches[0];
  assert.equal((await call('POST', `/${id}/pause`, { user: OWNER, body: { paused: true } })).status, 200);
  const parts = store.listParticipants(id);
  const ctx = (pid) => room._loadContext(id, m.id, { twitchId: parts.find(p => p.id === pid).twitchId });
  // Bereit-Frist: B wartet allein, aber pausiert → kein kampfloser Sieg
  room._actions.ready(ctx(m.b), { ready: true });
  await room.runChecks(Date.now() + 60 * 60000);
  assert.equal((await get(id)).structure.matches[0].status, 'pending');
  // Beide bereit, aber pausiert → kein Countdown, kein Start
  assert.equal(room._actions.ready(ctx(m.a), { ready: true }).autoStartAt, null);
  await room.runChecks();
  assert.equal(store.listGames(id, m.id).length, 0);
  // Fortsetzen → die Prüfschleife setzt den Countdown, danach startet das Spiel
  await call('POST', `/${id}/pause`, { user: OWNER, body: { paused: false } });
  await room.runChecks();
  const startAt = store.getMatchMeta(id, m.id).startAt;
  assert.ok(startAt);
  await room.runChecks(startAt + 10);
  // Übersicht: Veranstalter sieht das laufende Spiel, Spieler bekommen keine
  const own = await get(id);
  assert.equal(own.ownerOverview.length, 1);
  assert.equal(own.ownerOverview[0].phase, 'drafting');
  assert.equal((await get(id, '1:s1')).ownerOverview, null);
  // Abbrechen nach dem Start
  assert.equal((await call('POST', `/${id}/cancel`, { user: OWNER })).status, 200);
  assert.equal((await get(id)).tournament.status, 'cancelled');
  assert.throws(() => room._loadContext(id, m.id, {}), /tournamentNotRunning/);
});
