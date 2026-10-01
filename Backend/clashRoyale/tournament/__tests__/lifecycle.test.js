// HTTP-Test Phase 2: Start (von Hand + automatisch), Gruppen, Bracket, Ergebnisse bis zum Sieger.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, store, createTournamentRouter, TAGS } = require('./_harness');

const call = setup(test);
const OWNER = '100:veranstalter';

async function createWith(settings, players) {
  const { data } = await call('POST', '/', { user: OWNER, body: { settings: { modeSelection: 'random', ...settings } } });
  for (let i = 0; i < players; i++) {
    const r = await call('POST', `/${data.id}/join`, { user: `${i + 1}:spieler${i + 1}`, body: { crTag: '#' + TAGS[i] } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  return data.id;
}

/** Trägt so lange Ergebnisse ein (immer gewinnt Seite a, glatt), bis nichts mehr spielbar ist. */
async function playAll(id) {
  for (let guard = 0; guard < 200; guard++) {
    const { data } = await call('GET', `/${id}`);
    const m = data.structure.matches.find(x => x.playable);
    if (!m) return data;
    const need = Math.ceil(m.bestOf / 2);
    const r = await call('POST', `/${id}/matches/${m.id}/result`, { user: OWNER, body: { winner: 'a', scoreA: need, scoreB: 0 } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  throw new Error('kein Ende');
}

test('Start nur durch den Veranstalter und mit genug Spielern', async () => {
  const id = await createWith({ name: 'Klein' }, 1);
  assert.equal((await call('POST', `/${id}/start`, { user: '1:spieler1' })).status, 403);
  assert.equal((await call('POST', `/${id}/start`, { user: OWNER })).data.error, 'tournamentTooFewPlayers');
  assert.equal((await call('GET', `/${id}`)).data.structure, null);
});

test('Single Elimination mit Freilosen läuft bis zum Sieger', async () => {
  const id = await createWith({ name: 'KO', maxPlayers: 8 }, 5);
  assert.equal((await call('POST', `/${id}/start`, { user: OWNER })).status, 200);
  assert.equal((await call('POST', `/${id}/start`, { user: OWNER })).data.error, 'tournamentAlreadyStarted');
  let { data } = await call('GET', `/${id}`);
  assert.equal(data.tournament.status, 'running');
  assert.equal(data.structure.phase, 'bracket');
  assert.equal(data.structure.matches.filter(m => m.status === 'bye').length, 3);
  // Nach dem Start: keine An-/Abmeldung, keine Einstellungen
  assert.equal((await call('POST', `/${id}/join`, { user: '50:spaet', body: { crTag: '#PG9PG' } })).data.error, 'tournamentAlreadyStarted');
  assert.equal((await call('POST', `/${id}/leave`, { user: '1:spieler1' })).data.error, 'tournamentAlreadyStarted');
  // Ungültige Ergebnisse
  const m = data.structure.matches.find(x => x.playable);
  assert.equal((await call('POST', `/${id}/matches/${m.id}/result`, { user: '1:spieler1', body: { winner: 'a', scoreA: 1, scoreB: 0 } })).status, 403);
  assert.equal((await call('POST', `/${id}/matches/${m.id}/result`, { user: OWNER, body: { winner: 'a', scoreA: 2, scoreB: 0 } })).data.error, 'tournamentInvalidResult');
  assert.equal((await call('POST', `/${id}/matches/u3-1/result`, { user: OWNER, body: { winner: 'a', scoreA: 2, scoreB: 0 } })).data.error, 'tournamentMatchNotPlayable');
  assert.equal((await call('POST', `/${id}/matches/gibtsnicht/result`, { user: OWNER, body: { winner: 'a', scoreA: 1, scoreB: 0 } })).data.error, 'tournamentMatchNotFound');

  data = await playAll(id);
  assert.equal(data.tournament.status, 'finished');
  assert.equal(data.structure.phase, 'finished');
  assert.ok(data.participants.some(p => p.id === data.structure.champion));
  assert.equal((await call('POST', `/${id}/matches/u1-1/result`, { user: OWNER, body: { winner: 'a', scoreA: 1, scoreB: 0 } })).data.error, 'tournamentNotRunning');
  // Beendete Turniere stehen nicht mehr in der offenen Liste
  assert.ok(!(await call('GET', '/')).data.tournaments.some(t => t.id === id));
});

test('Gruppenphase → Bracket entsteht nach dem letzten Gruppenspiel, Double Elimination bis zum Ende', async () => {
  const id = await createWith({
    name: 'Gruppen', maxPlayers: 8, doubleElimination: true,
    groupStage: { enabled: true, groupSize: 4, advancePerGroup: 2 }, bestOf: { normal: 3, finals: 5 },
  }, 8);
  await call('POST', `/${id}/start`, { user: OWNER });
  let { data } = await call('GET', `/${id}`);
  assert.equal(data.structure.phase, 'groups');
  assert.equal(data.structure.groups.length, 2);
  assert.equal(data.structure.matches.length, 12); // 2 Gruppen × 6 Begegnungen
  assert.ok(data.structure.matches.every(m => m.bestOf === 3));
  for (const g of data.structure.groups) assert.equal(g.standings.filter(r => r.advancing).length, 2);

  // Alle Gruppenspiele bis auf eins → noch kein Bracket
  const group = data.structure.matches;
  for (const m of group.slice(0, -1)) {
    await call('POST', `/${id}/matches/${m.id}/result`, { user: OWNER, body: { winner: 'b', scoreA: 1, scoreB: 2, crownsA: 2, crownsB: 5 } });
  }
  data = (await call('GET', `/${id}`)).data;
  assert.equal(data.structure.phase, 'groups');
  const last = group[group.length - 1];
  await call('POST', `/${id}/matches/${last.id}/result`, { user: OWNER, body: { winner: 'a', scoreA: 2, scoreB: 0 } });
  data = (await call('GET', `/${id}`)).data;
  assert.equal(data.structure.phase, 'bracket');
  const upper = data.structure.matches.filter(m => m.stage === 'upper');
  assert.equal(upper.length, 3); // 4 Weiterkommende
  // Erste Runde: je ein Gruppensieger gegen einen Zweiten der anderen Gruppe
  const winners = new Set(data.structure.groups.map(g => g.standings[0].id));
  for (const m of upper.filter(x => x.round === 1)) assert.equal(winners.has(m.a) + winners.has(m.b), 1);
  const st = data.structure.groups[0].standings[0];
  assert.ok(st.played === 3 && st.crownsWon >= 0);

  data = await playAll(id);
  assert.equal(data.tournament.status, 'finished');
  assert.ok(data.structure.matches.find(m => m.id === 'gf1').bestOf === 5);
});

test('Autostart zum Zeitpunkt; mit zu wenigen Spielern wird er abgeschaltet', async () => {
  const past = Date.now() - 60000;
  const ok = await createWith({ name: 'Auto', startsAt: past, autoStart: true }, 3);
  const few = await createWith({ name: 'Zu wenig', startsAt: past, autoStart: true }, 1);
  const future = await createWith({ name: 'Später', startsAt: Date.now() + 3600000, autoStart: true }, 3);
  const warn = console.warn; console.warn = () => {};
  try { createTournamentRouter.runAutoStart(); } finally { console.warn = warn; }
  assert.equal(store.getTournament(ok).status, 'running');
  assert.equal(store.getTournament(few).status, 'registration');
  assert.equal(store.getTournament(few).settings.autoStart, false);
  assert.equal(store.getTournament(future).status, 'registration');
});
