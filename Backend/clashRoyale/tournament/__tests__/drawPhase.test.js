// Phase "ausgelost": erst auslosen (Gruppen/Bracket sichtbar, nichts spielbar), später starten.
// Dazu Löschen eigener Turniere und das automatische Aufräumen alter Turniere.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, store, createTournamentRouter, TAGS } = require('./_harness');

const call = setup(test);
const ADMIN = '100:veranstalter';
const CREATOR = '7:streamerin';
const CREATOR2 = '9:zweite';
const DAY = 24 * 60 * 60 * 1000;

test.before(() => { store.addCreator('streamerin', 'test'); store.addCreator('zweite', 'test'); });

async function createWith(owner, settings, players) {
  const r = await call('POST', '/', { user: owner, body: { settings: { modeSelection: 'random', ...settings } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  for (let i = 0; i < players; i++) {
    const j = await call('POST', `/${r.data.id}/join`, { user: `${i + 1}:spieler${i + 1}`, body: { crTag: '#' + TAGS[i] } });
    assert.equal(j.status, 200, JSON.stringify(j.data));
  }
  return r.data.id;
}

test('Auslosen ohne Start: alles sichtbar, nichts spielbar; neu auslosen, zurücknehmen, dann starten', async () => {
  const id = await createWith(ADMIN, { name: 'Clan-Cup', maxPlayers: 8, groupStage: { enabled: true, groupSize: 4, advancePerGroup: 2 } }, 8);
  assert.equal((await call('POST', `/${id}/draw`, { user: '1:spieler1' })).status, 403);
  assert.equal((await call('POST', `/${id}/draw`, { user: ADMIN })).status, 200);

  let data = (await call('GET', `/${id}`, { user: ADMIN })).data;
  assert.equal(data.tournament.status, 'drawn');
  assert.equal(data.structure.drawnOnly, true);
  assert.equal(data.structure.groups.length, 2);
  assert.ok(data.structure.matches.length > 0);
  assert.ok(data.structure.matches.every(m => !m.playable), 'vor dem Start ist nichts spielbar');
  assert.deepEqual(data.ownerOverview, []);
  // Anmeldung ist zu, Teilnehmer bleiben fest
  assert.equal((await call('POST', `/${id}/join`, { user: '20:spaet', body: { crTag: '#' + TAGS[10] } })).data.error, 'tournamentAlreadyStarted');
  assert.equal((await call('POST', `/${id}/leave`, { user: '1:spieler1' })).data.error, 'tournamentAlreadyStarted');
  // Ergebnis eintragen geht erst nach dem Start
  const m0 = data.structure.matches[0];
  assert.equal((await call('POST', `/${id}/matches/${m0.id}/result`, { user: ADMIN, body: { winner: 'a', scoreA: 1, scoreB: 0 } })).data.error, 'tournamentNotRunning');

  // Neu auslosen: bleibt ausgelost, Matches werden ersetzt (keine Altlasten)
  assert.equal((await call('POST', `/${id}/draw`, { user: ADMIN })).status, 200);
  assert.equal(store.getTournament(id).status, 'drawn');
  assert.equal(store.listMatches(id).length, data.structure.matches.length);

  // Zurücknehmen: zurück in die Anmeldung, Auslosung weg
  assert.equal((await call('POST', `/${id}/undraw`, { user: ADMIN })).status, 200);
  data = (await call('GET', `/${id}`)).data;
  assert.equal(data.tournament.status, 'registration');
  assert.equal(data.structure, null);
  assert.equal(store.listMatches(id).length, 0);
  assert.ok(store.listParticipants(id).every(p => p.drawIndex === null && p.group === null));
  assert.equal((await call('POST', `/${id}/undraw`, { user: ADMIN })).data.error, 'tournamentNotDrawn');

  // Wieder auslosen und starten: jetzt spielbar
  await call('POST', `/${id}/draw`, { user: ADMIN });
  const drawnMatches = store.listMatches(id).map(m => `${m.id}:${m.a}:${m.b}`).sort();
  assert.equal((await call('POST', `/${id}/start`, { user: ADMIN })).status, 200);
  data = (await call('GET', `/${id}`)).data;
  assert.equal(data.tournament.status, 'running');
  assert.ok(data.tournament.startedAt);
  assert.equal(data.structure.drawnOnly, false);
  assert.ok(data.structure.matches.some(m => m.playable));
  assert.deepEqual(store.listMatches(id).map(m => `${m.id}:${m.a}:${m.b}`).sort(), drawnMatches, 'Start übernimmt die Auslosung');
  assert.equal((await call('POST', `/${id}/draw`, { user: ADMIN })).data.error, 'tournamentAlreadyStarted');
});

test('Autostart gibt ein ausgelostes Turnier frei; Zurücknehmen nach dem Termin schaltet Autostart ab', async () => {
  const id = await createWith(CREATOR, { name: 'Termin', startsAt: Date.now() + 3600000, autoStart: true }, 3);
  await call('POST', `/${id}/draw`, { user: CREATOR });
  createTournamentRouter.runAutoStart(Date.now());
  assert.equal(store.getTournament(id).status, 'drawn', 'vor dem Termin bleibt es ausgelost');
  const draw = store.listMatches(id).map(m => `${m.a}:${m.b}`).sort();
  createTournamentRouter.runAutoStart(Date.now() + 2 * 3600000);
  assert.equal(store.getTournament(id).status, 'running');
  assert.deepEqual(store.listMatches(id).map(m => `${m.a}:${m.b}`).sort(), draw, 'Autostart lost nicht neu aus');

  // Termin vorbei, ausgelost, Veranstalter nimmt zurück → würde sonst sofort wieder automatisch starten
  const late = await createWith(CREATOR, { name: 'Zu spät', startsAt: Date.now() + 3600000, autoStart: false }, 3);
  store.updateSettings(late, { ...store.getTournament(late).settings, startsAt: Date.now() - 60000, autoStart: true });
  store.saveDraw(late, { drawOrder: [], groups: [], matches: [] });
  await call('POST', `/${late}/undraw`, { user: CREATOR });
  assert.equal(store.getTournament(late).settings.autoStart, false);
  createTournamentRouter.runAutoStart(Date.now());
  assert.equal(store.getTournament(late).status, 'registration');
});

test('Löschen: nur Veranstalter oder Admin, laufende erst absagen, alles hängt mit dran', async () => {
  const id = await createWith(CREATOR2, { name: 'Weg damit' }, 2);
  assert.equal((await call('DELETE', `/${id}`, { user: '1:spieler1' })).status, 403);
  await call('POST', `/${id}/draw`, { user: CREATOR2 });
  assert.equal((await call('DELETE', `/${id}`, { user: CREATOR2 })).data.error, 'tournamentDeleteActive');
  await call('POST', `/${id}/start`, { user: CREATOR2 });
  assert.equal((await call('DELETE', `/${id}`, { user: CREATOR2 })).data.error, 'tournamentDeleteActive');
  assert.equal((await call('POST', `/${id}/cancel`, { user: CREATOR2 })).status, 200);
  assert.equal((await call('DELETE', `/${id}`, { user: CREATOR2 })).status, 200);
  assert.equal((await call('GET', `/${id}`)).status, 404);
  assert.equal(store.listParticipants(id).length, 0);
  assert.equal(store.listMatches(id).length, 0);
  assert.ok(!(await call('GET', '/mine', { user: CREATOR2 })).data.tournaments.some(x => x.id === id));

  // Admin darf fremde (nicht laufende) Turniere löschen
  const other = await createWith(CREATOR2, { name: 'Fremd' }, 0);
  assert.equal((await call('DELETE', `/${other}`, { user: ADMIN })).status, 200);
  assert.ok(!store.getTournament(other));
});

test('Aufräumen: Beendete nach 90 Tagen, nie gestartete nach 60 Tagen ohne Änderung, Laufende nie', async () => {
  const now = Date.now();
  const cancelled = await createWith(ADMIN, { name: 'Abgesagt' }, 0);
  await call('POST', `/${cancelled}/cancel`, { user: ADMIN });
  const idle = await createWith(ADMIN, { name: 'Vergessen' }, 0);
  const planned = await createWith(ADMIN, { name: 'Weit voraus', startsAt: now + 200 * DAY }, 0);
  const running = await createWith(ADMIN, { name: 'Läuft' }, 2);
  await call('POST', `/${running}/start`, { user: ADMIN });

  const keep = [cancelled, idle, planned, running];
  assert.equal(createTournamentRouter.runCleanup(now + 59 * DAY) >= 0, true);
  for (const id of keep) assert.ok(store.getTournament(id), `${id} nach 59 Tagen noch da`);

  createTournamentRouter.runCleanup(now + 61 * DAY);
  assert.ok(!store.getTournament(idle), 'nie gestartet, 60 Tage unberührt');
  assert.ok(store.getTournament(cancelled), 'abgesagt: erst nach 90 Tagen');
  assert.ok(store.getTournament(planned), 'Termin liegt noch in der Zukunft');

  createTournamentRouter.runCleanup(now + 91 * DAY);
  assert.ok(!store.getTournament(cancelled));
  assert.ok(store.getTournament(planned));
  assert.ok(store.getTournament(running), 'laufende Turniere werden nie aufgeräumt');
});
