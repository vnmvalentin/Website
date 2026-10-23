// Lobby-Turnier (core/lobbyTournament.js): reine Logik am Lobby-Objekt, ohne Server und Datenbank.
const test = require('node:test');
const assert = require('node:assert');
const LT = require('../../core/lobbyTournament');

let deckSeq = 0;
const mkLobby = (n) => ({
  code: 'X', partyMode: 'solo', started: false,
  players: Array.from({ length: n }, (_, i) => ({ id: 's' + i, name: 'P' + i, color: '#fff', isSpectator: false, deck: [] })),
  ltour: LT.freshTour(),
});
const view = (lobby) => LT.publicView(lobby);
const playable = (lobby) => view(lobby).matches.find(m => m.playable);

/** Simuliert einen Runden-Draft: jeder aktive Spieler bekommt ein neues, eindeutiges Deck. */
function runRoundDraft(lobby) {
  assert.strictEqual(LT.prepareRoundDraft(lobby), null);
  lobby.players.forEach(p => { p.deck = p.isSpectator ? [] : [{ id: 'd' + (++deckSeq) }]; });
  LT.onDraftComplete(lobby);
}

/** Startet die nächste Runde (inkl. Runden-Draft, falls nötig). */
function nextRound(lobby) {
  const res = LT.advanceRound(lobby);
  assert.ok(!res.error, res.error);
  if (res.startDraft) runRoundDraft(lobby);
}

/** Spielt Runde für Runde durch; onMatch(m) entscheidet jede spielbare Begegnung. */
function playThrough(lobby, onMatch) {
  let guard = 0;
  while (view(lobby).phase !== 'finished' && guard++ < 200) {
    const m = playable(lobby);
    if (!m) { nextRound(lobby); continue; }
    onMatch(m);
  }
  assert.strictEqual(view(lobby).phase, 'finished');
}

test('Start lost nur aus: Baum sichtbar, nichts spielbar, bis der Host beginnt', () => {
  const lobby = mkLobby(4);
  assert.strictEqual(LT.start(lobby), null);
  let v = view(lobby);
  assert.strictEqual(v.phase, 'drawn');
  assert.strictEqual(v.matches.length, 3);
  assert.ok(v.matches.every(m => !m.playable));
  assert.strictEqual(LT.addGameWin(lobby, v.matches[0].id, 'a'), 'noPermission');
  assert.deepStrictEqual(LT.begin(lobby), { startDraft: false });
  v = view(lobby);
  assert.strictEqual(v.round, 1);
  assert.strictEqual(v.matches.filter(m => m.playable).length, 2, 'nur die beiden Halbfinals');
});

test('Draft pro Runde: jede Runde neue Decks, nur Spieler der Runde draften, Runden-Sperre', () => {
  const lobby = mkLobby(4);
  lobby.ltour.settings = LT.sanitizeSettings({ format: 'single', draft: 'shared', finalsBestOf: 1 });
  LT.start(lobby);
  assert.deepStrictEqual(LT.begin(lobby), { startDraft: true });
  assert.strictEqual(LT.prepareRoundDraft(lobby), null);
  assert.strictEqual(view(lobby).draftingRound, 1);
  assert.ok(lobby.players.every(p => !p.isSpectator), 'im Halbfinale draften alle vier');
  lobby.players.forEach(p => { p.deck = [{ id: 'semi-' + p.id }]; });
  LT.onDraftComplete(lobby);
  assert.strictEqual(view(lobby).draftingRound, null);
  const [sf1, sf2] = view(lobby).matches.filter(m => m.playable);
  assert.ok(sf1.decks && sf2.decks, 'Halbfinals haben Decks');
  LT.addGameWin(lobby, sf1.id, 'a');
  assert.deepStrictEqual(LT.advanceRound(lobby), { error: 'ltourRoundOpen' });
  LT.addGameWin(lobby, sf2.id, 'b');
  assert.deepStrictEqual(LT.advanceRound(lobby), { startDraft: true });
  const final = view(lobby).matches.find(m => m.stage === 'upper' && m.round === 2);
  assert.strictEqual(final.decks, null, 'Finale noch ohne Deck — neuer Draft nötig');
  // Finale: nur die beiden Finalisten draften, die Verlierer schauen zu
  assert.strictEqual(LT.prepareRoundDraft(lobby), null);
  const drafting = lobby.players.filter(p => !p.isSpectator).map(p => p.ltId).sort();
  assert.deepStrictEqual(drafting, [final.a, final.b].sort());
  lobby.players.forEach(p => { p.deck = p.isSpectator ? [] : [{ id: 'final-' + p.id }]; });
  LT.onDraftComplete(lobby);
  const fv = view(lobby).matches.find(m => m.id === final.id);
  assert.ok(fv.decks.a[0].id.startsWith('final-') && fv.decks.b[0].id.startsWith('final-'));
  assert.ok(view(lobby).matches.find(m => m.id === sf1.id).decks.a[0].id.startsWith('semi-'), 'Halbfinal-Decks bleiben');
  assert.ok(lobby.players.every(p => !p.isSpectator), 'Zuschauer zurückgesetzt');
  assert.strictEqual(LT.undo(lobby, sf1.id), 'ltourMatchNotPlayable', 'frühere Runde nicht mehr zurücknehmbar');
});

test('Abgebrochener Runden-Draft: Runde bleibt, Draft lässt sich neu starten', () => {
  const lobby = mkLobby(4);
  lobby.ltour.settings = LT.sanitizeSettings({ format: 'single', draft: 'shared' });
  LT.start(lobby);
  LT.begin(lobby);
  LT.prepareRoundDraft(lobby);
  assert.ok(lobby.players.some(p => p.ltId) && view(lobby).draftingRound === 1);
  LT.onGameCancelled(lobby);
  assert.strictEqual(view(lobby).phase, 'running');
  assert.strictEqual(view(lobby).draftingRound, null);
  runRoundDraft(lobby);
  assert.ok(view(lobby).matches.filter(m => m.playable).every(m => m.decks));
  assert.strictEqual(LT.prepareRoundDraft(lobby), 'ltourMatchNotPlayable', 'Runde hat schon Decks');
});

test('K.-o. mit Freilosen: Begegnungs-Draft macht alle anderen zu Zuschauern, Finale Bo3, Rücknahme öffnet es wieder', () => {
  const lobby = mkLobby(5);
  lobby.ltour.settings = LT.sanitizeSettings({ format: 'single', bestOf: 1, finalsBestOf: 3, draft: 'perMatch' });
  LT.start(lobby);
  LT.begin(lobby);
  playThrough(lobby, (m) => {
    assert.strictEqual(LT.prepareMatchDraft(lobby, m.id), null);
    const active = lobby.players.filter(p => !p.isSpectator).map(p => p.ltId).sort();
    assert.deepStrictEqual(active, [m.a, m.b].sort());
    LT.onDraftComplete(lobby);
    assert.ok(lobby.players.every(p => !p.isSpectator), 'Zuschauer zurückgesetzt');
    assert.ok(view(lobby).matches.find(x => x.id === m.id).decks, 'Decks gespeichert');
    for (let i = 0; i < Math.ceil(m.bestOf / 2); i++) assert.strictEqual(LT.addGameWin(lobby, m.id, 'a'), null);
  });
  const v = view(lobby);
  assert.ok(v.podium.first && v.podium.second);
  const final = v.matches.filter(m => m.stage === 'upper').sort((a, b) => b.round - a.round)[0];
  assert.strictEqual(final.bestOf, 3);
  assert.strictEqual(final.scoreA, 2);
  assert.strictEqual(LT.undo(lobby, final.id), null);
  const after = view(lobby);
  assert.strictEqual(after.phase, 'running');
  assert.strictEqual(after.matches.find(m => m.id === final.id).live.scoreA, 1);
});

test('Jeder gegen jeden mit Rückrunde und Draft pro Runde: 6 Spieltage, 6 Drafts', () => {
  const lobby = mkLobby(4);
  lobby.ltour.settings = LT.sanitizeSettings({ format: 'roundrobin', rounds: 2, bestOf: 3, draft: 'shared' });
  LT.start(lobby);
  LT.begin(lobby);
  runRoundDraft(lobby);
  let v = view(lobby);
  assert.strictEqual(v.matches.length, 12);
  assert.strictEqual(new Set(v.matches.map(m => m.id)).size, 12);
  assert.strictEqual(new Set(v.matches.map(m => m.wave)).size, 6, '6 Spieltage');
  assert.strictEqual(v.matches.filter(m => m.playable).length, 2, 'pro Spieltag zwei Spiele');
  const pairs = {};
  v.matches.forEach(m => { const k = [m.a, m.b].sort().join('-'); pairs[k] = (pairs[k] || 0) + 1; });
  assert.ok(Object.values(pairs).every(c => c === 2));
  playThrough(lobby, (m) => ['b', 'a', 'a'].forEach(side => LT.addGameWin(lobby, m.id, side)));
  v = view(lobby);
  assert.ok(v.matches.every(m => m.decks), 'jede Begegnung hat Decks aus ihrem Runden-Draft');
  assert.strictEqual(new Set(v.matches.map(m => m.decks.a[0].id)).size, 12, 'jede Runde neue Decks');
  assert.strictEqual(v.standings.length, 4);
  assert.ok(v.podium.first);
});

test('Double Elimination: Runden nach Abhängigkeit, komplett durchspielbar mit Draft pro Runde', () => {
  const lobby = mkLobby(4);
  lobby.ltour.settings = LT.sanitizeSettings({ format: 'double', draft: 'shared' });
  LT.start(lobby);
  const waves = Object.fromEntries(view(lobby).matches.map(m => [m.id, m.wave]));
  assert.ok(waves['l1-1'] > waves['u1-1'] && waves['gf1'] > waves['l2-1'] && waves['gf2'] > waves['gf1']);
  LT.begin(lobby);
  runRoundDraft(lobby);
  let n = 0;
  playThrough(lobby, (m) => { for (let i = 0; i < Math.ceil(m.bestOf / 2); i++) LT.addGameWin(lobby, m.id, n++ % 2 ? 'b' : 'a'); });
});

test('Fehlende Spieler und Duo-Lobbys', () => {
  const l2 = mkLobby(2); LT.start(l2); LT.begin(l2);
  l2.players[1].left = true;
  assert.strictEqual(LT.prepareMatchDraft(l2, playable(l2).id), 'ltourPlayerMissing');
  const l4 = mkLobby(2);
  l4.ltour.settings = LT.sanitizeSettings({ draft: 'shared' });
  LT.start(l4); LT.begin(l4);
  l4.players[0].disconnected = true;
  assert.strictEqual(LT.prepareRoundDraft(l4), 'ltourPlayerMissing');
  const l3 = mkLobby(4); l3.partyMode = 'duo';
  assert.strictEqual(LT.start(l3), 'ltourSoloOnly');
});
