// Turnier-Ablauf mit Speicher: Start (Auslosung), Ergebnis eintragen (inkl. Übergang Gruppen →
// Bracket und Turnierende) und die öffentliche Sicht auf Gruppen/Bracket. Die eigentliche Logik
// steckt in structure.js; hier wird nur geladen, verbunden und in Transaktionen gespeichert.
const store = require('./store');
const S = require('./structure');
const SR = require('./series');

/** Gruppen und Losreihenfolge aus den gespeicherten Teilnehmern zurückgewinnen. */
function drawFromParticipants(participants) {
  const drawn = participants.filter(p => p.drawIndex !== null && p.drawIndex !== undefined)
    .sort((x, y) => x.drawIndex - y.drawIndex);
  const drawOrder = drawn.map(p => p.id);
  const groups = [];
  for (const p of drawn) {
    if (p.group === null || p.group === undefined) continue;
    (groups[p.group] ||= []).push(p.id);
  }
  return { drawOrder, groups: groups.filter(Boolean) };
}

function freshDraw(t, rng) {
  const participants = store.listParticipants(t.id);
  const plan = S.planStart(participants.length, t.settings);
  if (plan.error) throw new Error(plan.error);
  return S.drawTournament(participants.map(p => p.id), t.settings, rng);
}

/**
 * Nur auslosen ('registration' → 'drawn', aus 'drawn' heraus = neu auslosen): Gruppen und Bracket stehen
 * fest und sind sichtbar, gespielt wird aber erst nach startTournament — Zeit für Clans, Absprachen usw.
 */
function drawTournament(t, rng = Math.random) {
  if (t.status !== 'registration' && t.status !== 'drawn') throw new Error('tournamentAlreadyStarted');
  store.saveDraw(t.id, freshDraw(t, rng));
}

/** Auslosung zurücknehmen ('drawn' → 'registration'), z.B. um Teilnehmer oder Einstellungen zu ändern. */
function undoDraw(t) {
  if (t.status !== 'drawn') throw new Error('tournamentNotDrawn');
  store.clearDraw(t.id);
  // Termin schon vorbei: der Autostart würde sofort wieder auslosen und starten
  if (t.settings.autoStart && t.settings.startsAt && t.settings.startsAt <= Date.now()) {
    store.updateSettings(t.id, { ...t.settings, autoStart: false });
  }
}

/**
 * Startet ein Turnier ('drawn' → 'running'; aus der Anmeldung heraus wird in einem Schritt ausgelost
 * und gestartet). Wirft einen Fehlerschlüssel.
 */
function startTournament(t, rng = Math.random) {
  if (t.status === 'drawn') return store.goLive(t.id);
  if (t.status !== 'registration') throw new Error('tournamentAlreadyStarted');
  store.saveDraw(t.id, freshDraw(t, rng), { live: true });
}

/**
 * Zieht nach jeder Änderung alles Automatische nach: nach dem letzten Gruppenspiel das Bracket bauen,
 * offene Matches von Disqualifizierten kampflos an den Gegner geben (sind beide raus, gewinnt A).
 * Wiederholt, bis sich nichts mehr ändert — ein kampfloser Sieg kann das nächste Match freigeben.
 */
function settle(t, list, participants) {
  const dropped = new Set(participants.filter(p => p.droppedAt).map(p => p.id));
  for (let guard = 0; guard < 1000; guard++) {
    if (t.settings.groupStage?.enabled && list.length && S.groupStageDone(list) && !list.some(m => m.stage !== 'group')) {
      const { drawOrder, groups } = drawFromParticipants(participants);
      list = [...list, ...S.bracketAfterGroups(groups, list, t.settings, drawOrder)];
      continue;
    }
    const m = list.find(x => S.isPlayable(x) && (dropped.has(x.a) || dropped.has(x.b)));
    if (!m) break;
    const winner = dropped.has(m.a) ? 'b' : 'a';
    const need = Math.ceil(m.bestOf / 2);
    list = S.applyResult(list, m.id, { winner, scoreA: winner === 'a' ? need : 0, scoreB: winner === 'b' ? need : 0 });
  }
  return list;
}

/** Trägt ein Match-Ergebnis ein und schreibt Gruppen/Bracket fort. Wirft einen Fehlerschlüssel. */
function reportResult(t, matchId, result) {
  if (t.status !== 'running') throw new Error('tournamentNotRunning');
  const next = settle(t, S.applyResult(store.listMatches(t.id), matchId, result), store.listParticipants(t.id));
  store.commitMatches(t.id, next, { finished: !!S.championOf(next) });
}

// ── Phase 5: Werkzeuge des Veranstalters ──────────────────────────────────

/**
 * Match für Korrektur/Neuspielen öffnen. Ein Gruppenspiel lässt sich auch noch ändern, wenn das Bracket
 * schon steht — solange darin nichts gespielt wurde; das Bracket wird dann verworfen und neu gebaut.
 */
function prepareReset(t, matchId) {
  if (t.status !== 'running' && t.status !== 'finished') throw new Error('tournamentNotRunning');
  let list = store.listMatches(t.id);
  const m = list.find(x => x.id === matchId);
  if (!m) throw new Error('tournamentMatchNotFound');
  let removeIds = [];
  if (m.stage === 'group' && list.some(x => x.stage !== 'group')) {
    const bracket = list.filter(x => x.stage !== 'group');
    const touched = bracket.some(x => x.status === 'done'
      || store.listGames(t.id, x.id).some(g => g.status !== 'void'));
    if (touched) throw new Error('tournamentResetBlocked');
    removeIds = bracket.map(x => x.id);
    list = list.filter(x => x.stage === 'group');
  }
  return { list: S.resetMatch(list, matchId), removeIds };
}

/** Match zurücksetzen: Ergebnis weg, Spiele annulliert — es wird neu gespielt. */
function resetMatch(t, matchId) {
  const prep = prepareReset(t, matchId);
  const list = settle(t, prep.list, store.listParticipants(t.id));
  store.rewriteMatches(t.id, list, { removeIds: prep.removeIds, resetIds: [matchId], finished: !!S.championOf(list) });
}

/** Ergebnis korrigieren: zurücksetzen und sofort das neue Ergebnis eintragen (eine Transaktion). */
function correctMatch(t, matchId, result) {
  const prep = prepareReset(t, matchId);
  const participants = store.listParticipants(t.id);
  const list = settle(t, S.applyResult(prep.list, matchId, result), participants);
  store.rewriteMatches(t.id, list, { removeIds: prep.removeIds, resetIds: [matchId], finished: !!S.championOf(list) });
}

/** Spieler disqualifizieren: offene und künftige Matches gehen kampflos an den Gegner. */
function disqualify(t, participantId) {
  if (t.status !== 'running') throw new Error('tournamentNotRunning');
  const p = store.getParticipant(t.id, participantId);
  if (!p) throw new Error('tournamentNotJoined');
  if (!p.droppedAt) store.setDropped(t.id, participantId, Date.now());
  const list = settle(t, store.listMatches(t.id), store.listParticipants(t.id));
  // Laufende Spiele der betroffenen (jetzt entschiedenen) Matches annullieren
  const decided = list.filter(m => m.status !== 'pending' && (m.a === participantId || m.b === participantId)).map(m => m.id);
  store.rewriteMatches(t.id, list, { resetIds: [], finished: !!S.championOf(list) });
  for (const mid of decided) {
    for (const g of store.listGames(t.id, mid)) {
      if (!['done', 'void'].includes(g.status)) store.saveGame(t.id, { ...g, status: 'void', finishedAt: Date.now() });
    }
  }
}

/** Turnier pausieren/fortsetzen: keine neuen Spiele, Erscheinen-Fristen stehen still. */
function setPaused(t, paused) {
  if (t.status !== 'running') throw new Error('tournamentNotRunning');
  store.updateSettings(t.id, { ...t.settings, paused: !!paused });
}

// Öffentliche Match-Felder: Freilos als eigenes Flag statt des internen Platzhalters.
// live = Turnier läuft; ausgelost, aber noch nicht gestartet ist nichts spielbar.
const publicMatch = (m, live = true) => ({
  id: m.id, stage: m.stage, group: m.group, round: m.round, slot: m.slot,
  a: S.isPlayer(m.a) ? m.a : null, b: S.isPlayer(m.b) ? m.b : null,
  aBye: m.a === S.BYE, bBye: m.b === S.BYE,
  bestOf: m.bestOf, scoreA: m.scoreA, scoreB: m.scoreB, crownsA: m.crownsA, crownsB: m.crownsB,
  winner: m.winner, status: m.status, playable: live && S.isPlayable(m), finishedAt: m.finishedAt,
});

/**
 * Live-Stand eines laufenden Matches für Bracket und Gruppen-Spielplan (für alle sichtbar):
 * Serienstand und Phase — 'ready' (mind. einer bereit), 'banning', 'drafting', 'battle', 'review'.
 * null, wenn das Match nicht läuft oder sich noch nichts getan hat.
 */
function liveOf(t, m) {
  if (!S.isPlayable(m)) return null;
  const games = store.listGames(t.id, m.id);
  const active = SR.activeGame(games);
  const meta = store.getMatchMeta(t.id, m.id);
  const score = SR.seriesScore(games);
  const phase = active ? active.status : (meta.readyAAt || meta.readyBAt) ? 'ready' : null;
  if (!phase && !score.a && !score.b) return null;
  return { scoreA: score.a, scoreB: score.b, phase, gameNo: active?.gameNo || null };
}

/** Gruppen-Tabellen, Matches, Phase und Sieger für die Turnierseite. */
function structureView(t, participants) {
  if (t.status === 'registration' || t.status === 'cancelled') return null;
  const matches = store.listMatches(t.id);
  const { drawOrder, groups } = drawFromParticipants(participants);
  const adv = t.settings.groupStage?.advancePerGroup || 0;
  const groupViews = groups.map((ids, g) => {
    const advancing = S.advancersFor(ids.length, adv);
    return {
      index: g,
      standings: S.computeStandings(ids, matches.filter(m => m.stage === 'group' && m.group === g), drawOrder)
        .map(r => ({ ...r, advancing: r.place <= advancing })),
    };
  });
  const hasBracket = matches.some(m => m.stage !== 'group');
  const champion = S.championOf(matches);
  const drawnOnly = t.status === 'drawn';
  return {
    phase: champion ? 'finished' : hasBracket ? 'bracket' : 'groups',
    // Ausgelost, aber noch nicht gestartet: alles sichtbar, nichts spielbar
    drawnOnly,
    groups: groupViews,
    matches: matches.map(m => ({ ...publicMatch(m, !drawnOnly), live: drawnOnly ? null : liveOf(t, m) })),
    champion,
    // Siegerehrung (Phase 6): 1., 2. und 3. Platz(e), sobald das Turnier entschieden ist
    podium: S.podiumOf(matches),
  };
}

module.exports = {
  startTournament, drawTournament, undoDraw, reportResult, structureView, drawFromParticipants, settle,
  resetMatch, correctMatch, disqualify, setPaused,
};
