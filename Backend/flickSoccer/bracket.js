// flickSoccer/bracket.js — K.-o.-Baum eines Turniers (reine Funktionen, ohne Zeit und ohne Netz).
//
// Der Baum hat immer eine Zweierpotenz an Plätzen; fehlende Spieler werden zu Freilosen in Runde 1. Weil die Größe die
// kleinste Zweierpotenz ≥ Spielerzahl ist, steht in jeder Paarung der ersten Runde mindestens ein Spieler.
//
// Paarung: { id, round, index, a, b, status, winner, score, how, room, deadline }
//   a/b     Spieler-ID oder null (noch offen bzw. Freilos)
//   status  'pending' (wartet auf Spieler) | 'ready' (Raum offen) | 'live' | 'done'
//   how     'played' | 'forfeit' (aufgegeben) | 'walkover' (nicht erschienen) | 'bye' (Freilos) | 'admin'

const MIN_PLAYERS = 2;

function bracketSize(n) {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

function roundCount(size) {
  let r = 0;
  for (let s = size; s > 1; s /= 2) r += 1;
  return r;
}

// Reihenfolge, in der Paarungen ihren zweiten Spieler bekommen: Bit-Umkehr verteilt die Freilose über den Baum,
// statt sie alle in eine Hälfte zu legen.
function spreadOrder(count) {
  const bits = Math.round(Math.log2(count));
  const order = [];
  for (let i = 0; i < count; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    order.push(r);
  }
  return order;
}

function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Baut alle Runden; playerIds in Setzreihenfolge (vorher mischen). Freilose sind sofort entschieden und rücken vor. */
function buildBracket(playerIds) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS) throw new Error('Zu wenige Spieler.');
  const size = bracketSize(n);
  const first = size / 2;
  const rounds = [];
  for (let r = 0, count = first; count >= 1; r++, count /= 2) {
    rounds.push(
      Array.from({ length: count }, (_, index) => ({
        id: `r${r}m${index}`, round: r, index, a: null, b: null, status: 'pending', winner: null, score: null, how: null,
        room: null, deadline: null,
      })),
    );
  }
  for (let i = 0; i < first; i++) rounds[0][i].a = playerIds[i];
  const order = spreadOrder(first);
  for (let k = 0; k < n - first; k++) rounds[0][order[k]].b = playerIds[first + k];
  for (const m of rounds[0]) {
    if (m.b === null) setResult(rounds, m, m.a, { how: 'bye' });
  }
  return rounds;
}

function findMatch(rounds, id) {
  for (const round of rounds) for (const m of round) if (m.id === id) return m;
  return null;
}

/** Trägt den Sieger ein und setzt ihn in die nächste Runde. Liefert die Folgepaarung (oder null im Finale). */
function setResult(rounds, match, winnerId, { score = null, how = 'played' } = {}) {
  if (winnerId !== match.a && winnerId !== match.b) throw new Error('Sieger gehört nicht zur Paarung.');
  match.status = 'done';
  match.winner = winnerId;
  match.score = score;
  match.how = how;
  match.room = null;
  match.deadline = null;
  const next = rounds[match.round + 1]?.[match.index >> 1];
  if (!next) return null;
  if (match.index % 2 === 0) next.a = winnerId;
  else next.b = winnerId;
  return next;
}

/** Paarungen, in denen beide Spieler feststehen, aber noch kein Raum offen ist. */
function playableMatches(rounds) {
  const out = [];
  for (const round of rounds) for (const m of round) if (m.status === 'pending' && m.a !== null && m.b !== null) out.push(m);
  return out;
}

function champion(rounds) {
  const final = rounds[rounds.length - 1]?.[0];
  return final && final.status === 'done' ? final.winner : null;
}

module.exports = { MIN_PLAYERS, bracketSize, roundCount, shuffle, buildBracket, findMatch, setResult, playableMatches, champion };
