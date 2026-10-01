// Turnier-Ablauf mit Speicher: Start (Auslosung), Ergebnis eintragen (inkl. Übergang Gruppen →
// Bracket und Turnierende) und die öffentliche Sicht auf Gruppen/Bracket. Die eigentliche Logik
// steckt in structure.js; hier wird nur geladen, verbunden und in Transaktionen gespeichert.
const store = require('./store');
const S = require('./structure');

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

/** Startet ein Turnier (Status 'registration' → 'running'). Wirft einen Fehlerschlüssel. */
function startTournament(t, rng = Math.random) {
  if (t.status !== 'registration') throw new Error('tournamentAlreadyStarted');
  const participants = store.listParticipants(t.id);
  const plan = S.planStart(participants.length, t.settings);
  if (plan.error) throw new Error(plan.error);
  const draw = S.drawTournament(participants.map(p => p.id), t.settings, rng);
  store.startTournament(t.id, draw);
}

/** Trägt ein Match-Ergebnis ein und schreibt Gruppen/Bracket fort. Wirft einen Fehlerschlüssel. */
function reportResult(t, matchId, result) {
  if (t.status !== 'running') throw new Error('tournamentNotRunning');
  let next = S.applyResult(store.listMatches(t.id), matchId, result);
  // Letztes Gruppenspiel entschieden → Bracket aus den Tabellen bauen
  if (t.settings.groupStage?.enabled && S.groupStageDone(next) && !next.some(m => m.stage !== 'group')) {
    const { drawOrder, groups } = drawFromParticipants(store.listParticipants(t.id));
    next = [...next, ...S.bracketAfterGroups(groups, next, t.settings, drawOrder)];
  }
  store.commitMatches(t.id, next, { finished: !!S.championOf(next) });
}

// Öffentliche Match-Felder: Freilos als eigenes Flag statt des internen Platzhalters
const publicMatch = (m) => ({
  id: m.id, stage: m.stage, group: m.group, round: m.round, slot: m.slot,
  a: S.isPlayer(m.a) ? m.a : null, b: S.isPlayer(m.b) ? m.b : null,
  aBye: m.a === S.BYE, bBye: m.b === S.BYE,
  bestOf: m.bestOf, scoreA: m.scoreA, scoreB: m.scoreB, crownsA: m.crownsA, crownsB: m.crownsB,
  winner: m.winner, status: m.status, playable: S.isPlayable(m), finishedAt: m.finishedAt,
});

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
  return {
    phase: champion ? 'finished' : hasBracket ? 'bracket' : 'groups',
    groups: groupViews,
    matches: matches.map(publicMatch),
    champion,
  };
}

module.exports = { startTournament, reportResult, structureView, drawFromParticipants };
