// Auswertung eines Turnier-Spiels über die CR-API (Phase 4): passenden Freundschaftskampf in der
// Kampfliste finden, Sieger bestimmen, gedraftetes Deck prüfen. Reine Logik ohne I/O — getestet in
// __tests__/battleMatch.test.js. Plan: ../PLANUNG_TURNIER.md.
//
// Empirisch geprüft (01.10.2026, echte Battlelogs):
//   • Freundschaftskämpfe: type "friendly"; Kämpfe unter Clan-Mitgliedern: type "clanMate" — beide zählen.
//   • gameMode kann "Friendly" sein, aber auch z.B. "DraftMode" (CR-eigener Draft im Freundschaftskampf) —
//     zählt als Kampf, fällt dann aber in der Deck-Prüfung durch.
//   • Evos/Helden behalten ihren Kartennamen, nur evolutionLevel ändert sich (Knight mit evolutionLevel 2).
//     Die Reihenfolge der Karten folgt den Slots, die man für Evos/Helden umsortiert → Deck-Vergleich als
//     MENGE der Karten, Reihenfolge und Evo-/Heldenstufe egal. Turmtruppe (supportCards) bleibt außen vor.
//   • Ohne Trophäen entscheidet bei Freundschaftskämpfen allein die Kronenzahl.

const FRIENDLY_TYPES = new Set(['friendly', 'clanmate']);

/** Zählt der Kampf als Freundschaftskampf (inkl. Clan-intern), 1 gegen 1? */
const isFriendly1v1 = (b) => FRIENDLY_TYPES.has(String(b.type || '').toLowerCase()) && (b.teamSize || 1) === 1;

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Vergleicht gedraftetes Deck (lokale Karten { id, name }) mit den Karten aus dem Kampf (API-Namen).
 * resolveId: API-Name → lokale Karten-ID (core/cards.js cardIdByOfficialName); unbekannte Namen
 * werden über den normalisierten Namen verglichen.
 * @returns {{ ok: boolean, missing: string[], extra: string[] }}  missing = gedraftet, aber nicht gespielt
 */
function deckDiff(drafted, battleCards, resolveId = () => null) {
  const keyOfDrafted = (c) => c.id || normName(c.name);
  const keyOfBattle = (c) => resolveId(c.name) || normName(c.name);
  const want = new Map((drafted || []).map(c => [keyOfDrafted(c), c.name]));
  const have = new Map((battleCards || []).map(c => [keyOfBattle(c), c.name]));
  // Rückfall für Karten, deren ID nicht auflösbar war: Vergleich über den Namen
  const wantNames = new Set((drafted || []).map(c => normName(c.name)));
  const missing = [...want].filter(([k, name]) => !have.has(k) && ![...have.values()].some(n => normName(n) === normName(name))).map(([, n]) => n);
  const extra = [...have].filter(([k, name]) => !want.has(k) && !wantNames.has(normName(name))).map(([, n]) => n);
  return { ok: missing.length === 0 && extra.length === 0 && (drafted || []).length > 0, missing, extra };
}

/**
 * Sucht den Kampf zu einem Spiel: Freundschafts-/Clankampf zwischen GENAU diesen beiden Tags, nach dem
 * Draft-Ende, noch keinem anderen Spiel zugeordnet. Durchsucht die Kampflisten beider Spieler (die API
 * aktualisiert sie nicht gleichzeitig) und liefert den frühesten Treffer aus Sicht von Spieler A.
 *
 * @param {object} p
 * @param {object[]} p.logA    Battlelog von A (crApi.fetchBattlelog-Format)
 * @param {object[]} p.logB    Battlelog von B
 * @param {string}   p.tagA, p.tagB  normalisierte Tags (ohne #)
 * @param {number}   p.after   Unix-ms — nur Kämpfe danach (Draft-Ende)
 * @param {Set<string>} [p.usedTimes]  battleTime-Werte, die schon einem früheren Spiel gehören
 * @returns {null | { battleTime, battleTimeMs, crownsA, crownsB, cardsA, cardsB, gameMode, type }}
 */
function findSeriesBattle({ logA = [], logB = [], tagA, tagB, after, usedTimes = new Set() }) {
  const hits = [];
  for (const b of logA) {
    if (!isFriendly1v1(b) || b.opponentTag !== tagB || b.battleTimeMs <= after || usedTimes.has(b.battleTime)) continue;
    hits.push({ battleTime: b.battleTime, battleTimeMs: b.battleTimeMs, crownsA: b.crownsFor, crownsB: b.crownsAgainst,
      cardsA: b.cards, cardsB: b.opponentCards, gameMode: b.gameMode, type: b.type });
  }
  for (const b of logB) {
    if (!isFriendly1v1(b) || b.opponentTag !== tagA || b.battleTimeMs <= after || usedTimes.has(b.battleTime)) continue;
    if (hits.some(h => h.battleTime === b.battleTime)) continue; // derselbe Kampf aus Bs Sicht
    hits.push({ battleTime: b.battleTime, battleTimeMs: b.battleTimeMs, crownsA: b.crownsAgainst, crownsB: b.crownsFor,
      cardsA: b.opponentCards, cardsB: b.cards, gameMode: b.gameMode, type: b.type });
  }
  hits.sort((x, y) => x.battleTimeMs - y.battleTimeMs);
  return hits[0] || null;
}

/**
 * Bewertet einen gefundenen Kampf. → { decided: true, winner, crownsA, crownsB, deck }
 * oder { decided: false, reason: 'draw' | 'deckMismatch', … } (dann entscheidet der Veranstalter).
 */
function evaluateBattle(battle, decks, { deckCheck = true, resolveId } = {}) {
  const deck = {
    a: deckDiff(decks?.a, battle.cardsA, resolveId),
    b: deckDiff(decks?.b, battle.cardsB, resolveId),
  };
  const base = { battleTime: battle.battleTime, crownsA: battle.crownsA, crownsB: battle.crownsB, gameMode: battle.gameMode, type: battle.type, deck };
  if (deckCheck && (!deck.a.ok || !deck.b.ok)) return { decided: false, reason: 'deckMismatch', ...base };
  if (battle.crownsA === battle.crownsB) return { decided: false, reason: 'draw', ...base };
  return { decided: true, winner: battle.crownsA > battle.crownsB ? 'a' : 'b', ...base };
}

/**
 * Erscheinen-Frist eines Matches. Die Uhr läuft, sobald EIN Spieler im Raum war und der andere noch
 * nie; sie steht still, solange der Abwesende gerade ein anderes Spiel spielt (Gruppenphase: mehrere
 * Matches gleichzeitig offen). → 'a' | 'b' (Sieger durch Nichterscheinen des anderen) | null
 */
function showUpForfeit({ presentA, presentB, waitStart, now, showUpMs }) {
  if (waitStart == null || (presentA && presentB) || (!presentA && !presentB)) return null;
  if (now - waitStart < showUpMs) return null;
  return presentA ? 'a' : 'b';
}

module.exports = { FRIENDLY_TYPES, isFriendly1v1, deckDiff, findSeriesBattle, evaluateBattle, showUpForfeit };
