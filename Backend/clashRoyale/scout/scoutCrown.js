// scoutCrown.js — Crown Series: die besten Duell-Decks (Sets aus bis zu vier Decks, keine Karte doppelt).
//
// In der Crown Series wird im Duell gespielt: Best of 3, jede Runde mit einem anderen Deck aus dem eigenen Set von
// bis zu vier Decks, und keine Karte darf in zwei Decks stehen. Die API zeigt je Kampf die Runden-Decks beider
// Seiten (scoutShape.shapeSide → `decks`), also zwei bis drei der vier Decks.
//
// Daraus entstehen drei Listen (gesammelt vom Meta-Sammler in scoutMeta.js, Speicher-Schlüssel "crown"):
//   decks  — einzelne Duell-Decks mit Rundensiegquote (jede gespielte Runde zählt)
//   sets   — Sets der Bestplatzierten: alle Decks, die ein Spieler zuletzt in der Crown Series gezeigt hat, ohne
//            Karten-Überschneidung zusammengelegt (das neueste zuerst — ältere Decks, die mit einem neueren eine Karte
//            teilen, hat er offenbar ersetzt)
//   built  — zusammengestellte Sets: die stärksten Duell-Decks, so kombiniert, dass keine Karte doppelt vorkommt.
//            Die Decks bleiben, wie sie gespielt werden — nichts wird getauscht oder erfunden.
//
// Reine Funktionen ohne Netz und Speicher, eigene Tests in __tests__/scout.test.js.

const HOUR = 60 * 60 * 1000;
const MAX_BATTLE_AGE_MS = 5 * 24 * HOUR;
const SET_SIZE = 4;
const TOP_DECKS = 80;
const MIN_DECK_ROUNDS = 3;
const TOP_SETS = 24;
const BUILT_SETS = 8;
const BUILD_POOL = 40;

const cardKey = (c) => c.id || `n:${c.name}`;
const deckKey = (cards) => cards.map(cardKey).sort().join(',');
const slim = (c) => ({ id: c.id, name: c.name, icon: c.icon || undefined, variant: c.variant || undefined, elixir: c.elixir });
const rate = (wins, n) => (n ? Math.round((wins / n) * 1000) / 1000 : 0);

/** Teilt das Deck eine Karte mit einem der Decks im Set? */
const overlaps = (cards, set) => {
  const used = new Set(set.flatMap((d) => d.cards.map(cardKey)));
  return cards.some((c) => used.has(cardKey(c)));
};

/**
 * Bewertung eines Decks für das Zusammenstellen: Siegquote, zur Mitte gezogen, solange es wenige Runden gibt,
 * dazu ein kleiner Bonus für Verbreitung (ein Deck, das viele spielen, ist erprobt).
 */
const deckScore = (d) => ((d.wins + 3) / (d.uses + 6)) * (1 + Math.log10(d.uses));

function createCrownAccumulator({ now = Date.now(), maxAgeMs = MAX_BATTLE_AGE_MS } = {}) {
  const seen = new Set();
  const decks = new Map();
  const players = new Map(); // tag → { name, battles: [{ t, decks: [cards…] }], wins, n }
  let battles = 0;

  function addSide(side, roundWins, duelWon, t) {
    const list = Array.isArray(side.decks) ? side.decks.filter((d) => d.length === 8) : [];
    list.forEach((cards, i) => {
      const key = deckKey(cards);
      const d = decks.get(key) || { key, cards: cards.map(slim), uses: 0, wins: 0, players: new Set() };
      d.uses += 1;
      if (roundWins[i]) d.wins += 1;
      if (side.tag) d.players.add(side.tag);
      decks.set(key, d);
    });
    if (!side.tag || !list.length) return;
    const p = players.get(side.tag) || { name: side.name, battles: [], wins: 0, n: 0 };
    p.battles.push({ t, decks: list });
    p.n += 1;
    if (duelWon) p.wins += 1;
    players.set(side.tag, p);
  }

  /** Kämpfe eines Spielers dazunehmen (Ausgabe von shapeBattles); nur Crown-Series-Duelle zählen. */
  function add(list) {
    for (const b of Array.isArray(list) ? list : []) {
      if (b.group !== 'crown' || b.team.length !== 1 || b.opponent.length !== 1 || !Array.isArray(b.rounds)) continue;
      if (now - b.t > maxAgeMs) continue;
      const me = b.team[0];
      const opp = b.opponent[0];
      const key = `${b.t}|${[me.tag, opp.tag].sort().join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      battles += 1;
      addSide(me, b.rounds.map((r) => r.f > r.a), b.result === 'win', b.t);
      addSide(opp, b.rounds.map((r) => r.a > r.f), b.result === 'loss', b.t);
    }
  }

  const deckList = () => [...decks.values()].filter((d) => d.uses >= MIN_DECK_ROUNDS);

  /** Set eines Spielers: neueste Decks zuerst, ohne Überschneidung, höchstens vier. */
  function playerSet(p) {
    const set = [];
    for (const battle of [...p.battles].sort((a, b) => b.t - a.t)) {
      for (const cards of battle.decks) {
        if (set.length >= SET_SIZE) break;
        if (set.some((d) => d.key === deckKey(cards)) || overlaps(cards, set)) continue;
        set.push({ key: deckKey(cards), cards });
      }
    }
    return set;
  }

  /** Aus den Duell-Decks Sets ohne doppelte Karte bauen: je Startdeck gierig die besten passenden dazunehmen. */
  function buildSets() {
    const pool = deckList().sort((a, b) => deckScore(b) - deckScore(a)).slice(0, BUILD_POOL);
    const found = new Map();
    for (const start of pool) {
      const set = [start];
      for (const d of pool) {
        if (set.length >= SET_SIZE) break;
        if (set.includes(d) || overlaps(d.cards, set)) continue;
        set.push(d);
      }
      if (set.length < SET_SIZE) continue;
      const id = set.map((d) => d.key).sort().join('|');
      if (!found.has(id)) found.set(id, { set, score: set.reduce((s, d) => s + deckScore(d), 0) });
    }
    return [...found.values()].sort((a, b) => b.score - a.score).slice(0, BUILT_SETS).map(({ set }) => ({ decks: set.map((d) => d.key) }));
  }

  /**
   * @param {(tag: string) => number|undefined} [rankOf]  Platz in der Ranked-Rangliste — Sets der Bestplatzierten zuerst
   */
  function result({ rankOf = () => undefined } = {}) {
    const sets = [...players.entries()]
      .map(([tag, p]) => ({ tag, p, rank: rankOf(tag), set: playerSet(p) }))
      .filter((x) => x.set.length >= 3 && x.rank !== undefined)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, TOP_SETS)
      .map(({ tag, p, rank, set }) => ({
        player: { tag, name: p.name, rank },
        record: { wins: p.wins, n: p.n },
        t: Math.max(...p.battles.map((x) => x.t)),
        decks: set.map((d) => d.key),
      }));
    const built = buildSets();
    // Jedes Deck, auf das ein Set verweist, steht in der Deckliste — auch wenn es selbst selten ist
    const wanted = new Set([...sets.flatMap((s) => s.decks), ...built.flatMap((s) => s.decks)]);
    const top = deckList().sort((a, b) => b.uses - a.uses || b.wins - a.wins).slice(0, TOP_DECKS);
    for (const d of top) wanted.delete(d.key);
    const extra = [...wanted].map((k) => decks.get(k) || playerDeck(k)).filter(Boolean);
    return {
      updatedAt: now,
      battles,
      decks: [...top, ...extra].map((d) => ({ key: d.key, cards: d.cards, uses: d.uses, winRate: rate(d.wins, d.uses), players: d.players.size })),
      sets,
      built,
    };
  }

  /** Deck aus einem Spieler-Set, das selbst zu selten für die Deckliste ist. */
  function playerDeck(key) {
    for (const p of players.values()) {
      for (const b of p.battles) {
        const cards = b.decks.find((c) => deckKey(c) === key);
        if (cards) return { key, cards: cards.map(slim), uses: 0, wins: 0, players: new Set() };
      }
    }
    return null;
  }

  return { add, result, get battles() { return battles; } };
}

module.exports = { createCrownAccumulator, overlaps };
