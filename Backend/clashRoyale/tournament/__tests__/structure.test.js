const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../structure');

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const winnerId = (m) => (m.winner === 'a' ? m.a : m.b);
const loserId = (m) => (m.winner === 'a' ? m.b : m.a);

/** Spielt alle spielbaren Matches durch, Sieger per Zufall; prüft dabei Grund-Invarianten. */
function playOut(matches, rng, pick) {
  let list = matches;
  for (let guard = 0; guard < 1000; guard++) {
    const playable = list.filter(S.isPlayable);
    if (!playable.length) break;
    // Im Bracket steht niemand gleichzeitig in zwei spielbaren Matches (in Gruppen schon — dort
    // sind alle Begegnungen von Anfang an offen); niemand spielt gegen sich selbst
    const seen = new Set();
    for (const m of playable) {
      assert.notEqual(m.a, m.b, `${m.id}: Spieler gegen sich selbst`);
      if (m.stage === 'group') continue;
      for (const p of [m.a, m.b]) { assert.ok(!seen.has(p), `${p} doppelt spielbar`); seen.add(p); }
    }
    const m = playable[Math.floor(rng() * playable.length)];
    const winner = pick ? pick(m) : (rng() < 0.5 ? 'a' : 'b');
    const need = Math.ceil(m.bestOf / 2);
    const lose = Math.floor(rng() * need);
    list = S.applyResult(list, m.id, { winner, scoreA: winner === 'a' ? need : lose, scoreB: winner === 'b' ? need : lose, crownsA: 1, crownsB: 0 });
  }
  return list;
}

test('Setzpositionen: 1 gegen 8, 4 gegen 5 …', () => {
  assert.deepEqual(S.seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(S.seedPositions(2), [1, 2]);
});

test('Jeder gegen jeden: jede Paarung genau einmal, auch bei ungerader Zahl', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const rounds = S.roundRobin(ids(n));
    const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join('-'));
    assert.equal(pairs.length, (n * (n - 1)) / 2);
    assert.equal(new Set(pairs).size, pairs.length);
    for (const r of rounds) { const p = r.flat(); assert.equal(new Set(p).size, p.length, 'niemand zweimal pro Runde'); }
  }
});

test('Single Elimination: für 2–33 Spieler genau n−1 Spiele, jeder außer dem Sieger verliert einmal', () => {
  for (let n = 2; n <= 33; n++) {
    const rng = S.makeRng(n);
    const end = playOut(S.buildBracket(ids(n), { bestOfNormal: 1, bestOfFinals: 3 }), rng);
    assert.ok(S.allDone(end), `n=${n} nicht fertig`);
    const done = end.filter(m => m.status === 'done');
    assert.equal(done.length, n - 1, `n=${n}`);
    const champ = S.championOf(end);
    assert.ok(champ);
    const losses = new Map();
    for (const m of done) losses.set(loserId(m), (losses.get(loserId(m)) || 0) + 1);
    assert.equal(losses.size, n - 1);
    assert.ok(!losses.has(champ));
    assert.equal(done.find(m => m.round === Math.max(...end.map(x => x.round))).bestOf, 3, 'Finale ist Best of 3');
  }
});

test('Freilose treffen die Bestgesetzten', () => {
  const br = S.buildBracket(ids(5));
  const r1 = br.filter(m => m.round === 1);
  const byes = r1.filter(m => m.status === 'bye').map(winnerId).sort();
  assert.deepEqual(byes, ['p1', 'p2', 'p3']);
});

test('Double Elimination: für 2–33 Spieler, jeder scheidet nach zwei Niederlagen aus, Reset nur wenn nötig', () => {
  for (let n = 2; n <= 33; n++) {
    for (const seed of [1, 2, 3]) {
      const rng = S.makeRng(n * 100 + seed);
      const end = playOut(S.buildBracket(ids(n), { double: true, bestOfNormal: 1, bestOfFinals: 3 }), rng);
      assert.ok(S.allDone(end), `n=${n} nicht fertig`);
      const done = end.filter(m => m.status === 'done');
      const champ = S.championOf(end);
      const losses = new Map(ids(n).map(p => [p, 0]));
      for (const m of done) losses.set(loserId(m), losses.get(loserId(m)) + 1);
      for (const [p, l] of losses) {
        if (p === champ) assert.ok(l <= 1, `Sieger n=${n} hat ${l} Niederlagen`);
        else assert.equal(l, 2, `n=${n}: ${p} hat ${l} Niederlagen`);
      }
      const gf1 = end.find(m => m.id === 'gf1'), gf2 = end.find(m => m.id === 'gf2');
      assert.equal(gf2.status === 'done', gf1.winner === 'b', `n=${n}: Reset genau dann, wenn der Lower-Sieger GF1 gewinnt`);
      assert.equal(done.length, 2 * n - 2 + (gf2.status === 'done' ? 1 : 0));
    }
  }
});

test('Grand Final: Upper-Sieger gewinnt → kein Reset; Lower-Sieger gewinnt → Reset entscheidet', () => {
  const upperWins = playOut(S.buildBracket(ids(4), { double: true }), S.makeRng(7), (m) => (m.id === 'gf1' ? 'a' : 'a'));
  assert.equal(upperWins.find(m => m.id === 'gf2').status, 'skipped');
  assert.equal(S.championOf(upperWins), upperWins.find(m => m.id === 'gf1').a);
  const lowerWins = playOut(S.buildBracket(ids(4), { double: true }), S.makeRng(7), (m) => (m.id === 'gf1' ? 'b' : 'a'));
  const gf2 = lowerWins.find(m => m.id === 'gf2');
  assert.equal(gf2.status, 'done');
  assert.equal(S.championOf(lowerWins), winnerId(gf2));
});

test('Ergebnis-Prüfung: Serienstand muss zur Best-of-Einstellung passen', () => {
  const br = S.buildBracket(ids(4), { bestOfNormal: 3 });
  const m = br.find(x => S.isPlayable(x));
  assert.throws(() => S.applyResult(br, m.id, { winner: 'a', scoreA: 1, scoreB: 0 }), /tournamentInvalidResult/);
  assert.throws(() => S.applyResult(br, m.id, { winner: 'a', scoreA: 2, scoreB: 2 }), /tournamentInvalidResult/);
  assert.throws(() => S.applyResult(br, 'u2-1', { winner: 'a', scoreA: 2, scoreB: 0 }), /tournamentMatchNotPlayable/);
  const ok = S.applyResult(br, m.id, { winner: 'b', scoreA: 1, scoreB: 2 });
  assert.equal(ok.find(x => x.id === m.id).status, 'done');
  assert.equal(br.find(x => x.id === m.id).status, 'pending', 'Eingabe bleibt unverändert');
  assert.throws(() => S.applyResult(ok, m.id, { winner: 'a', scoreA: 2, scoreB: 0 }), /tournamentMatchNotPlayable/);
});

test('Tabelle: Siege, dann Spiel-Differenz, dann Kronen, dann direkter Vergleich, dann Los', () => {
  const g = ['A', 'B', 'C', 'D'];
  const mk = (a, b, winner, sa, sb, ca = 0, cb = 0) => ({ stage: 'group', group: 0, a, b, winner, scoreA: sa, scoreB: sb, crownsA: ca, crownsB: cb, status: 'done' });
  // A und B je 2 Siege; B hat bessere Spiel-Differenz
  let t = S.computeStandings(g, [mk('A', 'C', 'a', 2, 1), mk('A', 'D', 'a', 2, 1), mk('B', 'C', 'b', 0, 2), mk('B', 'D', 'a', 2, 0), mk('B', 'C', 'a', 2, 0), mk('A', 'B', 'b', 0, 2)]);
  assert.equal(t[0].id, 'B');
  // Exakt gleich bis auf direkten Vergleich: B schlägt A
  t = S.computeStandings(['A', 'B'], [mk('A', 'B', 'b', 0, 1)], ['A', 'B']);
  assert.deepEqual(t.map(r => r.id), ['B', 'A']);
  const h2h = S.computeStandings(['A', 'B', 'C'], [mk('A', 'C', 'a', 1, 0), mk('B', 'C', 'a', 1, 0), mk('B', 'A', 'a', 1, 0)].map((m, i) => (i === 2 ? { ...m, a: 'B', b: 'A' } : m)), ['A', 'B', 'C']);
  assert.deepEqual(h2h.map(r => r.id), ['B', 'A', 'C']);
  // Kronen entscheiden vor dem direkten Vergleich
  t = S.computeStandings(['A', 'B', 'C', 'D'], [mk('A', 'C', 'a', 1, 0, 3, 0), mk('B', 'D', 'a', 1, 0, 1, 0)], ['B', 'A', 'C', 'D']);
  assert.equal(t[0].id, 'A');
  // Gar nichts gespielt → Los (Reihenfolge der Auslosung)
  t = S.computeStandings(g, [], ['C', 'A', 'D', 'B']);
  assert.deepEqual(t.map(r => r.id), ['C', 'A', 'D', 'B']);
});

test('Start-Planung: zu wenige Spieler, Gruppenzahl passt sich an', () => {
  const base = { maxPlayers: 16, groupStage: { enabled: true, groupSize: 4, advancePerGroup: 2 }, bestOf: { normal: 1, finals: 3 } };
  assert.equal(S.planStart(1, base).error, 'tournamentTooFewPlayers');
  assert.deepEqual(S.planStart(16, base).sizes, [4, 4, 4, 4]);
  assert.deepEqual(S.planStart(9, base).sizes, [3, 3, 3]);
  assert.deepEqual(S.planStart(5, base).sizes, [3, 2]);
  assert.equal(S.planStart(5, base).advancing, 3);
  assert.equal(S.planStart(2, base).error, 'tournamentTooFewPlayers'); // 1 Gruppe à 2 → nur 1 kommt weiter
  assert.equal(S.planStart(2, { ...base, groupStage: { ...base.groupStage, enabled: false } }).error, undefined);
});

test('Gruppenphase → Bracket: Gruppensieger getrennt gesetzt, ganzer Ablauf bis zum Sieger', () => {
  const settings = { maxPlayers: 16, groupStage: { enabled: true, groupSize: 4, advancePerGroup: 2 }, doubleElimination: true, bestOf: { normal: 1, finals: 3 } };
  for (const n of [5, 8, 11, 16]) {
    const rng = S.makeRng(n);
    const { drawOrder, groups, matches } = S.drawTournament(ids(n), settings, rng);
    assert.equal(drawOrder.length, n);
    assert.equal(groups.flat().length, n);
    let list = playOut(matches, rng);
    assert.ok(S.groupStageDone(list));
    const bracket = S.bracketAfterGroups(groups, list, settings, drawOrder);
    const seeds = S.seedsFromGroups(groups, list, 2, drawOrder);
    // Gruppensieger stehen vorne in der Setzliste
    const winners = groups.map((g, i) => S.computeStandings(g, list.filter(m => m.group === i), drawOrder)[0].id);
    assert.deepEqual(new Set(seeds.slice(0, groups.length)), new Set(winners));
    list = playOut([...list, ...bracket], rng);
    assert.ok(S.allDone(list));
    assert.ok(seeds.includes(S.championOf(list)));
  }
});

test('Bracket nach Gruppen: in Runde 1 keine Duelle zwischen Gruppenkameraden', () => {
  const configs = [
    { n: 8, groupSize: 4, adv: 2 }, { n: 16, groupSize: 4, adv: 2 }, { n: 12, groupSize: 4, adv: 2 },
    { n: 12, groupSize: 3, adv: 2 }, { n: 8, groupSize: 4, adv: 3 }, { n: 16, groupSize: 8, adv: 3 },
    { n: 10, groupSize: 5, adv: 2 }, { n: 15, groupSize: 5, adv: 2 }, { n: 24, groupSize: 4, adv: 2 },
  ];
  for (const { n, groupSize, adv } of configs) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const settings = { maxPlayers: n, groupStage: { enabled: true, groupSize, advancePerGroup: adv }, doubleElimination: false, bestOf: { normal: 1, finals: 3 } };
      const rng = S.makeRng(seed * 31 + n);
      const { drawOrder, groups, matches } = S.drawTournament(ids(n), settings, rng);
      const played = playOut(matches, rng);
      const groupOf = new Map(groups.flatMap((g, i) => g.map(id => [id, i])));
      const bracket = S.bracketAfterGroups(groups, played, settings, drawOrder);
      for (const m of bracket.filter(x => x.round === 1 && x.status === 'pending')) {
        assert.notEqual(groupOf.get(m.a), groupOf.get(m.b), `n=${n} g=${groupSize} adv=${adv}: ${m.a} gegen ${m.b} aus derselben Gruppe`);
      }
      // Gruppensieger treffen in Runde 1 nicht aufeinander
      const winners = new Set(groups.map((g, i) => S.computeStandings(g, played.filter(x => x.group === i), drawOrder)[0].id));
      for (const m of bracket.filter(x => x.round === 1)) assert.ok(!(winners.has(m.a) && winners.has(m.b)), `n=${n}: zwei Gruppensieger in Runde 1`);
    }
  }
});

test('Auslosung ohne Gruppen mischt die Spieler', () => {
  const s = { maxPlayers: 8, groupStage: { enabled: false, groupSize: 4, advancePerGroup: 2 }, doubleElimination: false, bestOf: { normal: 1, finals: 3 } };
  const a = S.drawTournament(ids(8), s, S.makeRng(1)).drawOrder.join();
  const b = S.drawTournament(ids(8), s, S.makeRng(2)).drawOrder.join();
  assert.notEqual(a, b);
});

test('Zurücksetzen: nur solange das Folge-Match offen ist; danach wieder normal spielbar', () => {
  let br = S.buildBracket(ids(4), { bestOfNormal: 1, bestOfFinals: 1 });
  br = S.applyResult(br, 'u1-1', { winner: 'a', scoreA: 1, scoreB: 0 });
  assert.equal(br.find(m => m.id === 'u2-1').a, 'p1');
  let r = S.resetMatch(br, 'u1-1');
  assert.equal(r.find(m => m.id === 'u1-1').status, 'pending');
  assert.equal(r.find(m => m.id === 'u2-1').a, null, 'Platz im Folge-Match wieder frei');
  r = S.applyResult(r, 'u1-1', { winner: 'b', scoreA: 0, scoreB: 1 });
  assert.equal(r.find(m => m.id === 'u2-1').a, 'p4');
  // Folge-Match schon entschieden → gesperrt
  r = S.applyResult(r, 'u1-2', { winner: 'a', scoreA: 1, scoreB: 0 });
  r = S.applyResult(r, 'u2-1', { winner: 'a', scoreA: 1, scoreB: 0 });
  assert.throws(() => S.resetMatch(r, 'u1-1'), /tournamentResetBlocked/);
  assert.equal(S.resetMatch(r, 'u2-1').find(m => m.id === 'u2-1').status, 'pending', 'Finale ohne Folge-Match geht');
  assert.throws(() => S.resetMatch(r, 'u1-1x'), /tournamentMatchNotFound/);
});

test('Zurücksetzen im Double Elimination: Verlierer verschwindet auch aus dem Lower Bracket; Grand Final öffnet den Reset wieder', () => {
  let br = S.buildBracket(ids(4), { double: true, bestOfNormal: 1, bestOfFinals: 1 });
  br = S.applyResult(br, 'u1-1', { winner: 'a', scoreA: 1, scoreB: 0 });
  assert.ok(br.find(m => m.id === 'l1-1').a);
  const r = S.resetMatch(br, 'u1-1');
  assert.equal(r.find(m => m.id === 'l1-1').a, null);
  // Bis zum Grand Final spielen, Upper-Sieger gewinnt GF1 → Reset übersprungen; Zurücksetzen öffnet gf2 wieder
  const play = (list, pick) => {
    for (let i = 0; i < 50; i++) {
      const m = list.find(S.isPlayable);
      if (!m) return list;
      list = S.applyResult(list, m.id, { winner: pick(m), scoreA: pick(m) === 'a' ? 1 : 0, scoreB: pick(m) === 'b' ? 1 : 0 });
    }
    return list;
  };
  let end = play(br, () => 'a');
  assert.equal(end.find(m => m.id === 'gf2').status, 'skipped');
  end = S.resetMatch(end, 'gf1');
  assert.equal(end.find(m => m.id === 'gf2').status, 'pending');
  assert.equal(end.find(m => m.id === 'gf1').status, 'pending');
  assert.ok(S.isPlayable(end.find(m => m.id === 'gf1')));
  assert.equal(S.championOf(end), null);
  end = S.applyResult(end, 'gf1', { winner: 'b', scoreA: 0, scoreB: 1 });
  assert.ok(S.isPlayable(end.find(m => m.id === 'gf2')), 'jetzt mit Bracket-Reset');
});

test('Siegerpodest: Single (geteilter 3. Platz) und Double Elimination (Lower-Finale), mit und ohne Reset', () => {
  const playAll = (list, winnerFor) => {
    for (let i = 0; i < 200; i++) {
      const m = list.find(S.isPlayable);
      if (!m) return list;
      const w = winnerFor(m);
      const need = Math.ceil(m.bestOf / 2);
      list = S.applyResult(list, m.id, { winner: w, scoreA: w === 'a' ? need : 0, scoreB: w === 'b' ? need : 0 });
    }
    return list;
  };
  // Single: bessere Setzung gewinnt immer → p1 vor p2, p3+p4 Dritte
  let end = playAll(S.buildBracket(ids(8)), () => 'a');
  assert.equal(S.podiumOf(S.buildBracket(ids(8))), null);
  let pod = S.podiumOf(end);
  assert.equal(pod.first, 'p1');
  assert.equal(pod.second, 'p2');
  assert.deepEqual(pod.third.sort(), ['p3', 'p4']);
  // Freilose zählen nicht als Platzierte
  pod = S.podiumOf(playAll(S.buildBracket(ids(3)), () => 'a'));
  assert.ok(pod.third.every(x => x.startsWith('p')));
  // Double ohne Reset: Upper-Sieger gewinnt GF1
  end = playAll(S.buildBracket(ids(4), { double: true }), () => 'a');
  pod = S.podiumOf(end);
  const gf1 = end.find(m => m.id === 'gf1');
  assert.equal(pod.first, gf1.a);
  assert.equal(pod.second, gf1.b);
  assert.equal(pod.third.length, 1);
  assert.ok(![pod.first, pod.second].includes(pod.third[0]));
  // Double mit Reset: Lower-Sieger gewinnt beide Grand Finals
  end = playAll(S.buildBracket(ids(4), { double: true }), (m) => (m.stage === 'grand' ? 'b' : 'a'));
  pod = S.podiumOf(end);
  assert.equal(pod.first, end.find(m => m.id === 'gf2').b);
  assert.equal(pod.second, end.find(m => m.id === 'gf2').a);
});
