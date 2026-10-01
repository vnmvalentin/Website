// Turnier-Struktur: Auslosung, Gruppen (jeder gegen jeden), Tabellen, Bracket (Single/Double
// Elimination mit Freilosen und Bracket-Reset) und das Fortschreiben von Ergebnissen.
// Reine Logik ohne I/O — getestet in __tests__/structure.test.js. Plan: ../PLANUNG_TURNIER.md.
//
// Ein Match ist ein flaches Objekt:
//   { id, stage: 'group'|'upper'|'lower'|'grand', group, round, slot,
//     a, b,                      Teilnehmer-ID, null (steht noch nicht fest) oder BYE (Freilos)
//     bestOf, scoreA, scoreB, crownsA, crownsB,
//     winner: 'a'|'b'|null, status: 'pending'|'done'|'bye'|'skipped',
//     winTo, winSide, loseTo, loseSide,   wohin Sieger/Verlierer weiterrücken (Match-ID + 'a'|'b')
//     finishedAt }
// IDs sind je Turnier eindeutig und lesbar: g<gruppe>-<runde>-<nr>, u<runde>-<nr>, l<runde>-<nr>, gf1, gf2.

const BYE = '__bye__';

/** Deterministischer Zufall für Tests (mulberry32); ohne Seed Math.random. */
function makeRng(seed) {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const newMatch = (fields) => ({
  group: null, a: null, b: null, scoreA: 0, scoreB: 0, crownsA: 0, crownsB: 0,
  winner: null, status: 'pending', winTo: null, winSide: null, loseTo: null, loseSide: null, finishedAt: null,
  ...fields,
});

// ── Gruppen ──────────────────────────────────────────────────────────────

/**
 * Wie viele Gruppen bei n Anmeldungen? Höchstens so viele wie eingestellt (maxPlayers/groupSize);
 * bei weniger Anmeldungen entsprechend weniger, damit keine Gruppe zu klein wird.
 */
function groupCountFor(n, { maxPlayers, groupStage }) {
  const configured = Math.max(1, Math.floor(maxPlayers / groupStage.groupSize));
  return Math.max(1, Math.min(configured, Math.ceil(n / groupStage.groupSize), Math.floor(n / 2)));
}

/** Verteilt bereits gemischte IDs reihum auf die Gruppen (Größen unterscheiden sich höchstens um 1). */
function splitIntoGroups(ids, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  ids.forEach((id, i) => groups[i % groupCount].push(id));
  return groups;
}

/** Weiterkommende einer Gruppe: eingestellt, aber nie die ganze Gruppe. */
const advancersFor = (groupSize, advancePerGroup) => Math.max(0, Math.min(advancePerGroup, groupSize - 1));

/** Jeder gegen jeden (Kreis-Verfahren) — liefert Runden mit Paarungen, Freilos bei ungerader Zahl. */
function roundRobin(ids) {
  const list = ids.length % 2 ? [...ids, null] : [...ids];
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (a !== null && b !== null) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()); // ersten festhalten, Rest rotieren
  }
  return rounds;
}

function buildGroupMatches(groups, bestOf) {
  const out = [];
  groups.forEach((ids, g) => {
    roundRobin(ids).forEach((pairs, r) => {
      pairs.forEach(([a, b], i) => {
        out.push(newMatch({ id: `g${g}-${r + 1}-${i + 1}`, stage: 'group', group: g, round: r + 1, slot: i + 1, a, b, bestOf }));
      });
    });
  });
  return out;
}

/**
 * Tabelle einer Gruppe. Reihenfolge: Siege → Spiel-Differenz → Kronen-Differenz → direkter
 * Vergleich (nur bei genau zwei Gleichstehenden) → Los (Reihenfolge der Auslosung, drawOrder).
 */
function computeStandings(ids, matches, drawOrder = ids) {
  const rows = new Map(ids.map(id => [id, { id, played: 0, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, crownsWon: 0, crownsLost: 0 }]));
  for (const m of matches) {
    if (m.status !== 'done' || !rows.has(m.a) || !rows.has(m.b)) continue;
    const A = rows.get(m.a), B = rows.get(m.b);
    A.played++; B.played++;
    A.gamesWon += m.scoreA; A.gamesLost += m.scoreB; B.gamesWon += m.scoreB; B.gamesLost += m.scoreA;
    A.crownsWon += m.crownsA; A.crownsLost += m.crownsB; B.crownsWon += m.crownsB; B.crownsLost += m.crownsA;
    if (m.winner === 'a') { A.wins++; B.losses++; } else if (m.winner === 'b') { B.wins++; A.losses++; }
  }
  const lot = (id) => { const i = drawOrder.indexOf(id); return i < 0 ? Infinity : i; };
  const key = (r) => [r.wins, r.gamesWon - r.gamesLost, r.crownsWon - r.crownsLost];
  const sameKey = (x, y) => key(x).every((v, i) => v === key(y)[i]);
  const list = [...rows.values()].map(r => ({ ...r, gameDiff: r.gamesWon - r.gamesLost, crownDiff: r.crownsWon - r.crownsLost }));
  list.sort((x, y) => {
    const kx = key(x), ky = key(y);
    for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return ky[i] - kx[i];
    return lot(x.id) - lot(y.id);
  });
  // Direkter Vergleich für Zweier-Gleichstände (bei drei und mehr ist er nicht eindeutig → Los)
  for (let i = 0; i < list.length - 1; i++) {
    const x = list[i], y = list[i + 1];
    if (!sameKey(x, y)) continue;
    if ((i > 0 && sameKey(list[i - 1], x)) || (i + 2 < list.length && sameKey(list[i + 2], y))) continue;
    const h2h = matches.find(m => m.status === 'done' && ((m.a === x.id && m.b === y.id) || (m.a === y.id && m.b === x.id)));
    if (!h2h) continue;
    const winnerId = h2h.winner === 'a' ? h2h.a : h2h.b;
    if (winnerId === y.id) { list[i] = y; list[i + 1] = x; }
  }
  return list.map((r, i) => ({ ...r, place: i + 1 }));
}

/**
 * Setzliste fürs Bracket aus den Gruppen: erst alle Gruppensieger, dann alle Zweiten usw.
 * Danach werden Erstrunden-Duelle zwischen Gruppenkameraden aufgelöst (avoidGroupClashes).
 */
function seedsFromGroups(groups, matches, advancePerGroup, drawOrder) {
  const tables = groups.map((ids, g) => computeStandings(ids, matches.filter(m => m.stage === 'group' && m.group === g), drawOrder));
  const maxAdv = Math.max(0, ...groups.map(ids => advancersFor(ids.length, advancePerGroup)));
  const seeds = [];
  const groupOf = new Map(), placeOf = new Map();
  for (let p = 0; p < maxAdv; p++) {
    tables.forEach((table, g) => {
      if (p >= advancersFor(groups[g].length, advancePerGroup)) return;
      const id = table[p].id;
      seeds.push(id); groupOf.set(id, g); placeOf.set(id, p);
    });
  }
  return avoidGroupClashes(seeds, groupOf, placeOf);
}

/**
 * Sorgt dafür, dass sich in Runde 1 möglichst keine Spieler derselben Gruppe treffen: bei einem
 * Konflikt wird der schlechter Gesetzte mit einem Spieler GLEICHER Platzierung aus einem anderen
 * Match getauscht, wenn danach beide Matches konfliktfrei sind. Gruppensieger bleiben gesetzt.
 */
function avoidGroupClashes(seeds, groupOf, placeOf) {
  const s = [...seeds];
  const pos = seedPositions(nextPow2(s.length));
  const pairs = [];
  for (let i = 0; i < pos.length; i += 2) pairs.push([pos[i] - 1, pos[i + 1] - 1]);
  const clash = ([x, y]) => s[x] !== undefined && s[y] !== undefined && groupOf.get(s[x]) === groupOf.get(s[y]);
  const swap = (x, y) => { [s[x], s[y]] = [s[y], s[x]]; };
  for (const pair of pairs) {
    if (!clash(pair)) continue;
    const lo = Math.max(...pair);
    let fixed = false;
    for (const other of pairs) {
      if (other === pair || fixed) continue;
      for (const z of other) {
        if (s[z] === undefined || placeOf.get(s[z]) !== placeOf.get(s[lo])) continue;
        swap(lo, z);
        if (!clash(pair) && !clash(other)) { fixed = true; break; }
        swap(lo, z);
      }
    }
  }
  return s;
}

// ── Bracket ─────────────────────────────────────────────────────────────

const nextPow2 = (n) => { let s = 2; while (s < n) s *= 2; return s; };

/** Klassische Setzpositionen: 1 gegen 16, 8 gegen 9 … — die Besten treffen sich zuletzt. */
function seedPositions(size) {
  let pos = [1, 2];
  while (pos.length < size) {
    const n = pos.length * 2;
    pos = pos.flatMap(s => [s, n + 1 - s]);
  }
  return pos;
}

/**
 * Bracket aus einer Setzliste (beste zuerst). Freilose füllen bis zur nächsten Zweierpotenz und
 * treffen die Bestgesetzten. double = Upper + Lower Bracket + Grand Final mit Reset (gf2).
 */
function buildBracket(seeds, { double = false, bestOfNormal = 1, bestOfFinals = 3 } = {}) {
  const size = nextPow2(seeds.length);
  const R = Math.log2(size);
  const out = [];
  const pos = seedPositions(size);

  // Upper Bracket
  for (let r = 1; r <= R; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      const m = newMatch({ id: `u${r}-${i + 1}`, stage: 'upper', round: r, slot: i + 1, bestOf: r === R ? bestOfFinals : bestOfNormal });
      if (r === 1) {
        m.a = seeds[pos[2 * i] - 1] ?? BYE;
        m.b = seeds[pos[2 * i + 1] - 1] ?? BYE;
      }
      if (r < R) { m.winTo = `u${r + 1}-${Math.floor(i / 2) + 1}`; m.winSide = i % 2 ? 'b' : 'a'; }
      else if (double) { m.winTo = 'gf1'; m.winSide = 'a'; }
      out.push(m);
    }
  }
  if (!double) return resolveByes(out);

  // Lower Bracket: ungerade Runden paaren Lower-Sieger (Runde 1: Verlierer aus Upper 1),
  // gerade Runden lassen die Verlierer der nächsten Upper-Runde einsteigen.
  const L = 2 * (R - 1);
  const lowerCount = (lr) => (lr === 1 ? size / 4 : lr % 2 === 0 ? size / 2 ** (lr / 2 + 1) : size / 2 ** ((lr - 1) / 2 + 2));
  for (let lr = 1; lr <= L; lr++) {
    const count = lowerCount(lr);
    for (let i = 0; i < count; i++) {
      const m = newMatch({ id: `l${lr}-${i + 1}`, stage: 'lower', round: lr, slot: i + 1, bestOf: lr === L ? bestOfFinals : bestOfNormal });
      if (lr === L) { m.winTo = 'gf1'; m.winSide = 'b'; }
      else if (lr % 2 === 1) { m.winTo = `l${lr + 1}-${i + 1}`; m.winSide = 'a'; }               // → Einstiegsrunde, Platz a
      else { m.winTo = `l${lr + 1}-${Math.floor(i / 2) + 1}`; m.winSide = i % 2 ? 'b' : 'a'; } // → Paarungsrunde
      out.push(m);
    }
  }
  // Verlierer aus dem Upper Bracket
  const byId = new Map(out.map(m => [m.id, m]));
  for (let r = 1; r <= R; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      const m = byId.get(`u${r}-${i + 1}`);
      if (L === 0) { m.loseTo = 'gf1'; m.loseSide = 'b'; continue; } // nur 2 Plätze: Verlierer direkt ins Grand Final
      if (r === 1) { m.loseTo = `l1-${Math.floor(i / 2) + 1}`; m.loseSide = i % 2 ? 'b' : 'a'; continue; }
      // Einstieg in Lower-Runde 2(r-1); Reihenfolge jede zweite Runde umgedreht gegen frühe Wiederholungen
      const lr = 2 * (r - 1);
      const target = r % 2 === 0 ? count - 1 - i : i;
      m.loseTo = `l${lr}-${target + 1}`; m.loseSide = 'b';
    }
  }
  out.push(newMatch({ id: 'gf1', stage: 'grand', round: 1, slot: 1, bestOf: bestOfFinals }));
  out.push(newMatch({ id: 'gf2', stage: 'grand', round: 2, slot: 1, bestOf: bestOfFinals }));
  return resolveByes(out);
}

// ── Fortschreiben ────────────────────────────────────────────────────────

const isPlayer = (x) => x !== null && x !== undefined && x !== BYE;
/** Spielbar = beide Plätze mit echten Spielern besetzt und noch nicht entschieden. */
const isPlayable = (m) => m.status === 'pending' && isPlayer(m.a) && isPlayer(m.b);

function place(byId, targetId, side, value) {
  if (!targetId) return;
  const t = byId.get(targetId);
  if (!t) return;
  if (side === 'a') t.a = value; else t.b = value;
}

/** Sieger/Verlierer eines entschiedenen Matches weiterreichen (inkl. Sonderfall Grand Final). */
function propagate(byId, m) {
  const winnerId = m.winner === 'a' ? m.a : m.winner === 'b' ? m.b : BYE;
  const loserId = m.winner === 'a' ? m.b : m.winner === 'b' ? m.a : BYE;
  if (m.id === 'gf1') {
    const reset = byId.get('gf2');
    if (!reset) return;
    if (m.winner === 'b' && isPlayer(m.a) && isPlayer(m.b)) { reset.a = m.a; reset.b = m.b; } // Lower-Sieger gewinnt → Reset
    else { reset.status = 'skipped'; reset.a = reset.a ?? BYE; reset.b = reset.b ?? BYE; }
    return;
  }
  place(byId, m.winTo, m.winSide, winnerId);
  place(byId, m.loseTo, m.loseSide, loserId);
}

/**
 * Löst Freilose auf, bis sich nichts mehr ändert: steht auf einer Seite fest ein Freilos, kommt
 * die andere Seite kampflos weiter; zwei Freilose geben ein Freilos weiter.
 */
function resolveByes(matches) {
  const byId = new Map(matches.map(m => [m.id, m]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of matches) {
      if (m.status !== 'pending' || m.a === null || m.b === null) continue;
      if (m.a !== BYE && m.b !== BYE) continue;
      m.status = 'bye';
      m.winner = m.a !== BYE ? 'a' : m.b !== BYE ? 'b' : null;
      propagate(byId, m);
      changed = true;
    }
  }
  return matches;
}

/** Gültiger Serienstand: Sieger hat genau die nötigen Spiele, Verlierer weniger. */
function validSeriesScore(bestOf, winner, scoreA, scoreB) {
  const need = Math.ceil(bestOf / 2);
  const [w, l] = winner === 'a' ? [scoreA, scoreB] : [scoreB, scoreA];
  return Number.isInteger(w) && Number.isInteger(l) && w === need && l >= 0 && l < need;
}

/**
 * Trägt ein Match-Ergebnis ein und schreibt das Bracket fort. Arbeitet auf Kopien und gibt die
 * neue, vollständige Match-Liste zurück; wirft bei ungültigen Eingaben einen Fehlerschlüssel.
 */
function applyResult(matches, matchId, { winner, scoreA, scoreB, crownsA = 0, crownsB = 0 }, now = Date.now()) {
  const list = matches.map(m => ({ ...m }));
  const byId = new Map(list.map(m => [m.id, m]));
  const m = byId.get(matchId);
  if (!m) throw new Error('tournamentMatchNotFound');
  if (!isPlayable(m)) throw new Error('tournamentMatchNotPlayable');
  if (winner !== 'a' && winner !== 'b') throw new Error('tournamentInvalidResult');
  if (!validSeriesScore(m.bestOf, winner, scoreA, scoreB)) throw new Error('tournamentInvalidResult');
  Object.assign(m, {
    winner, scoreA, scoreB, status: 'done', finishedAt: now,
    crownsA: Math.max(0, Math.round(Number(crownsA) || 0)), crownsB: Math.max(0, Math.round(Number(crownsB) || 0)),
  });
  propagate(byId, m);
  return resolveByes(list);
}

/**
 * Setzt ein entschiedenes Match zurück (Phase 5: Veranstalter korrigiert/lässt neu spielen). Nur möglich,
 * solange die Folge-Matches noch nicht entschieden sind — sonst widerspräche sich das Bracket. Beim Grand
 * Final wird ein schon angesetzter oder übersprungener Bracket-Reset wieder geöffnet.
 * Gibt die neue Match-Liste zurück; wirft einen Fehlerschlüssel.
 */
function resetMatch(matches, matchId) {
  const list = matches.map(m => ({ ...m }));
  const byId = new Map(list.map(m => [m.id, m]));
  const m = byId.get(matchId);
  if (!m) throw new Error('tournamentMatchNotFound');
  if (m.status !== 'done') throw new Error('tournamentResetBlocked');
  if (m.id === 'gf1') {
    const reset = byId.get('gf2');
    if (reset && reset.status === 'done') throw new Error('tournamentResetBlocked');
    if (reset) Object.assign(reset, { a: null, b: null, status: 'pending', winner: null, scoreA: 0, scoreB: 0, crownsA: 0, crownsB: 0, finishedAt: null });
  } else {
    for (const [to, side] of [[m.winTo, m.winSide], [m.loseTo, m.loseSide]]) {
      if (!to) continue;
      const target = byId.get(to);
      if (!target) continue;
      if (target.status !== 'pending') throw new Error('tournamentResetBlocked');
      if (side === 'a') target.a = null; else target.b = null;
    }
  }
  Object.assign(m, { status: 'pending', winner: null, scoreA: 0, scoreB: 0, crownsA: 0, crownsB: 0, finishedAt: null });
  return list;
}

const groupStageDone = (matches) => matches.filter(m => m.stage === 'group').every(m => m.status !== 'pending');
const bracketMatches = (matches) => matches.filter(m => m.stage !== 'group');
const allDone = (matches) => matches.length > 0 && matches.every(m => m.status !== 'pending');

/** Turniersieger (Teilnehmer-ID) oder null, solange das Finale offen ist. */
function championOf(matches) {
  const br = bracketMatches(matches);
  if (!br.length || !allDone(br)) return null;
  const winnerOf = (m) => (m && m.winner ? (m.winner === 'a' ? m.a : m.b) : null);
  const gf2 = br.find(m => m.id === 'gf2');
  if (gf2) return gf2.status === 'done' ? winnerOf(gf2) : winnerOf(br.find(m => m.id === 'gf1'));
  const ups = br.filter(m => m.stage === 'upper');
  const lastRound = Math.max(...ups.map(m => m.round));
  return winnerOf(ups.find(m => m.round === lastRound));
}

/**
 * Prüft vor dem Start, ob mit n Anmeldungen ein Turnier möglich ist, und liefert den Plan.
 * Fehlerschlüssel: tournamentTooFewPlayers.
 */
function planStart(n, settings) {
  if (n < 2) return { error: 'tournamentTooFewPlayers' };
  if (!settings.groupStage?.enabled) return { groupCount: 0 };
  const groupCount = groupCountFor(n, settings);
  const sizes = Array.from({ length: groupCount }, (_, g) => Math.floor(n / groupCount) + (g < n % groupCount ? 1 : 0));
  const advancing = sizes.reduce((s, size) => s + advancersFor(size, settings.groupStage.advancePerGroup), 0);
  if (sizes.some(s => s < 2) || advancing < 2) return { error: 'tournamentTooFewPlayers' };
  return { groupCount, sizes, advancing };
}

/**
 * Auslosung zum Start. Liefert { drawOrder, groups, matches }:
 *   ohne Gruppen → Bracket sofort, Setzliste = Auslosung
 *   mit Gruppen  → nur Gruppenspiele; das Bracket entsteht mit bracketAfterGroups()
 */
function drawTournament(participantIds, settings, rng = Math.random) {
  const plan = planStart(participantIds.length, settings);
  if (plan.error) throw new Error(plan.error);
  const drawOrder = shuffle(participantIds, rng);
  const bracketOpts = { double: !!settings.doubleElimination, bestOfNormal: settings.bestOf.normal, bestOfFinals: settings.bestOf.finals };
  if (!plan.groupCount) return { drawOrder, groups: [], matches: buildBracket(drawOrder, bracketOpts) };
  const groups = splitIntoGroups(drawOrder, plan.groupCount);
  return { drawOrder, groups, matches: buildGroupMatches(groups, settings.bestOf.normal) };
}

/** Nach der Gruppenphase: Bracket aus den Tabellen bauen (zusätzliche Matches). */
function bracketAfterGroups(groups, matches, settings, drawOrder) {
  const seeds = seedsFromGroups(groups, matches, settings.groupStage.advancePerGroup, drawOrder);
  return buildBracket(seeds, { double: !!settings.doubleElimination, bestOfNormal: settings.bestOf.normal, bestOfFinals: settings.bestOf.finals });
}

module.exports = {
  BYE, makeRng, shuffle, groupCountFor, splitIntoGroups, advancersFor, roundRobin, buildGroupMatches,
  computeStandings, seedsFromGroups, seedPositions, nextPow2, buildBracket, resolveByes, applyResult,
  validSeriesScore, isPlayable, isPlayer, groupStageDone, allDone, championOf, planStart, drawTournament, resetMatch,
  bracketAfterGroups,
};
