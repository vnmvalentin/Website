// scoutMeta.js — „Was spielen die Besten gerade?": Kartennutzung, Siegquoten und häufigste Decks aus den
// Ranked-Kämpfen der bestplatzierten Spieler (globale Path-of-Legend-Rangliste), dazu je Deck die Bilanz gegen die
// Decks und Karten, auf die es am häufigsten trifft.
//
// Ablauf: alle paar Stunden die Rangliste holen, von den ersten N Spielern das Battlelog lesen (gedrosselt, ein
// Abruf nach dem anderen), jeden Ranked-Kampf genau einmal zählen (beide Seiten kennen denselben Kampf) und beide
// Decks auswerten. Das Ergebnis liegt im Speicher (scoutStore) und überlebt Neustarts — nach einem Neustart wird
// erst wieder gesammelt, wenn der Stand älter als das Intervall ist. Zwei Einträge:
//   "meta"        Karten und die häufigsten Decks — geht an jede Decks-/Karten-Seite, bleibt deshalb schlank
//   "metaDetails" je Deck: Gegner-Decks, Gegner-Karten, Spieler — nur die Deck-Seite fragt danach
//   "metaTiers"   dieselbe Auswertung wie "meta", nur aus den Kämpfen der Top 100 / 250 / 500 ({ 100: …, 250: … })
//                 — gleiche Abrufe, nur zusätzlich getrennt gezählt (Filter auf der Meta-Decks-Seite)
//
// Die Zählung (createAccumulator) ist eine reine Funktion über aufbereitete Kämpfe (scoutShape.shapeBattles) und
// hat eigene Tests; der Sammler bekommt Abruf und Speicher hereingereicht.

const HOUR = 60 * 60 * 1000;
const MAX_BATTLE_AGE_MS = 3 * 24 * HOUR;
const TOP_DECKS = 200;
const MIN_BATTLES_FOR_SNAPSHOT = 50;
// Deck-Seite: so viele Gegner-Decks/-Karten/Spieler je Deck, und ab so vielen Begegnungen zählt ein Gegner
const VS_DECKS = 12;
const VS_DECK_MIN = 2;
const VS_CARDS = 8;
const VS_CARD_MIN = 6;
const DECK_PLAYERS = 12;
const MIN_CROWN_BATTLES = 20;
// Teil-Auswertungen nach Platz der Spieler, deren Kämpfe gezählt werden (die ganze Liste ist die Hauptauswertung)
const TIERS = [100, 250, 500];

const { createCrownAccumulator } = require('./scoutCrown');

const cardKey = (c) => c.id || `n:${c.name}`;
/** Schlüssel eines Decks: die Karten sortiert — unabhängig von Reihenfolge und Form (Evolution/Held). */
const deckKey = (cards) => cards.map(cardKey).sort().join(',');
const rate = (wins, uses) => (uses ? Math.round((wins / uses) * 1000) / 1000 : 0);
const slim = (c) => ({ id: c.id, name: c.name, icon: c.icon || undefined, variant: c.variant || undefined, elixir: c.elixir });
// Turmtruppe gehört nicht zum Deck-Schlüssel (dasselbe Deck läuft mit verschiedenen) — je Deck zählen, die häufigste zeigen
const topTower = (d) => {
  let best = null;
  for (const t of d?.towers?.values() || []) if (!best || t.n > best.n) best = t;
  return best ? best.card : undefined;
};

function createAccumulator({ now = Date.now(), maxAgeMs = MAX_BATTLE_AGE_MS } = {}) {
  const seen = new Set();
  const cards = new Map();
  const decks = new Map();
  let battles = 0;

  function addDeck(side, won, other) {
    const deck = side.cards;
    const key = deckKey(deck);
    let d = decks.get(key);
    if (!d) {
      d = { key, cards: deck.map(slim), uses: 0, wins: 0, players: new Set(), vsDecks: new Map(), vsCards: new Map(), towers: new Map() };
      decks.set(key, d);
    }
    d.uses += 1;
    if (won) d.wins += 1;
    if (side.tag) d.players.add(side.tag);
    if (side.tower?.name) {
      const tk = side.tower.id || side.tower.name;
      const tw = d.towers.get(tk) || { card: { id: side.tower.id || undefined, name: side.tower.name, icon: side.tower.icon || undefined }, n: 0 };
      tw.n += 1;
      d.towers.set(tk, tw);
    }
    for (const c of deck) {
      const k = cardKey(c);
      let entry = cards.get(k);
      if (!entry) {
        entry = { id: c.id, name: c.name, icon: c.icon || undefined, uses: 0, wins: 0, special: 0 };
        cards.set(k, entry);
      }
      entry.uses += 1;
      if (won) entry.wins += 1;
      if (c.variant) entry.special += 1;
    }
    // Bilanz gegen das Deck und die Karten der Gegenseite
    const otherKey = deckKey(other.cards);
    const vd = d.vsDecks.get(otherKey) || { n: 0, wins: 0 };
    vd.n += 1;
    if (won) vd.wins += 1;
    d.vsDecks.set(otherKey, vd);
    for (const c of other.cards) {
      const k = cardKey(c);
      const vc = d.vsCards.get(k) || { card: { id: c.id, name: c.name, icon: c.icon || undefined }, n: 0, wins: 0 };
      vc.n += 1;
      if (won) vc.wins += 1;
      d.vsCards.set(k, vc);
    }
  }

  /** Kämpfe eines Spielers dazunehmen (Ausgabe von shapeBattles). */
  function add(list) {
    for (const b of Array.isArray(list) ? list : []) {
      if (b.group !== 'ranked' || b.team.length !== 1 || b.opponent.length !== 1) continue;
      if (now - b.t > maxAgeMs) continue;
      const me = b.team[0];
      const opp = b.opponent[0];
      if (me.cards.length !== 8 || opp.cards.length !== 8) continue;
      const key = `${b.t}|${[me.tag, opp.tag].sort().join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      battles += 1;
      addDeck(me, b.result === 'win', opp);
      addDeck(opp, b.result === 'loss', me);
    }
  }

  const topDecks = () => [...decks.values()]
    .filter((d) => d.uses >= 2)
    .sort((a, b) => b.uses - a.uses || b.wins - a.wins)
    .slice(0, TOP_DECKS);

  function result({ players = 0 } = {}) {
    const totalDecks = battles * 2;
    return {
      updatedAt: now,
      players,
      battles,
      cards: [...cards.values()]
        .map((c) => ({ id: c.id, name: c.name, icon: c.icon, uses: c.uses, usage: totalDecks ? Math.round((c.uses / totalDecks) * 1000) / 1000 : 0, winRate: rate(c.wins, c.uses), special: rate(c.special, c.uses) }))
        .sort((a, b) => b.uses - a.uses),
      decks: topDecks().map((d) => ({ key: d.key, cards: d.cards, tower: topTower(d), uses: d.uses, winRate: rate(d.wins, d.uses), players: d.players.size })),
    };
  }

  /**
   * Je Deck der Liste: gegen welche Decks und Karten es wie oft gespielt und gewonnen hat, und wer es spielt.
   * @param {(tag: string) => number|undefined} [rankOf]  Platz in der Rangliste — die Bestplatzierten zuerst
   * @returns {{ [deckKey: string]: { vsDecks: Array, hard: Array, easy: Array, players: string[], ranks: { [tag: string]: number } } }}
   *   ranks: Platz beim Sammeln (nur Spieler aus der Rangliste) — „Gespielt von“ auf der Deck-Seite zeigt ihn an
   */
  function details({ rankOf = () => undefined } = {}) {
    const out = {};
    for (const d of topDecks()) {
      const vsDecks = [...d.vsDecks.entries()]
        .filter(([, v]) => v.n >= VS_DECK_MIN)
        .sort((a, b) => b[1].n - a[1].n || b[1].wins - a[1].wins)
        .slice(0, VS_DECKS)
        .map(([key, v]) => ({ key, cards: decks.get(key).cards, tower: topTower(decks.get(key)), n: v.n, wins: v.wins }));
      const vsCards = [...d.vsCards.values()].filter((v) => v.n >= VS_CARD_MIN).map((v) => ({ card: v.card, n: v.n, wins: v.wins, winRate: rate(v.wins, v.n) }));
      const overall = rate(d.wins, d.uses);
      out[d.key] = {
        vsDecks,
        // Karten, gegen die es deutlich schlechter bzw. besser läuft als im Schnitt des Decks
        hard: vsCards.filter((v) => v.winRate < overall).sort((a, b) => a.winRate - b.winRate || b.n - a.n).slice(0, VS_CARDS),
        easy: vsCards.filter((v) => v.winRate > overall).sort((a, b) => b.winRate - a.winRate || b.n - a.n).slice(0, VS_CARDS),
        players: [...d.players].sort((a, b) => (rankOf(a) ?? 1e9) - (rankOf(b) ?? 1e9)).slice(0, DECK_PLAYERS),
      };
      out[d.key].ranks = Object.fromEntries(out[d.key].players.map((tag) => [tag, rankOf(tag)]).filter(([, r]) => typeof r === 'number'));
    }
    return out;
  }

  return { add, result, details, get battles() { return battles; } };
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * @param {object} deps
 * @param {() => Promise<Array<{tag: string, rank?: number}>>} deps.fetchTopPlayers  Rangliste, beste zuerst; [] wenn nicht abrufbar
 * @param {(tag: string) => Promise<Array|null>} deps.fetchBattles    aufbereitetes Battlelog oder null bei Fehler
 * @param {{getValue: Function, setValue: Function}} deps.store
 * @param {(battles: Array, place: number) => void} [deps.onBattles]  bekommt jedes Battlelog mit dem Platz des Spielers
 *   (Matchup-Verlauf, scoutStore.rememberMatchups); ein Fehler darin hält den Lauf nicht auf
 */
function createMetaCrawler({ fetchTopPlayers, fetchBattles, store, players = 300, intervalMs = 6 * HOUR, spacingMs = 350, log = console, onBattles = null }) {
  let running = false;
  let cached = null;
  let cachedDetails = null;
  let cachedCrown = null;
  let cachedTiers = null;
  let timer = null;

  function current() {
    if (!cached) cached = store.getValue('meta')?.value || null;
    return cached;
  }

  /** Auswertung nur aus den Kämpfen der Top n (n aus TIERS) oder null, solange es keine gibt. */
  function currentTier(n) {
    if (!cachedTiers) cachedTiers = store.getValue('metaTiers')?.value || null;
    return cachedTiers?.[n] || null;
  }

  /** Crown-Series-Auswertung (scoutCrown.js) oder null. */
  function crownSnapshot() {
    if (!cachedCrown) cachedCrown = store.getValue('crown')?.value || null;
    return cachedCrown;
  }

  /** Einzelheiten zu einem Deck der aktuellen Liste oder null. */
  function deckDetails(key) {
    if (!cachedDetails) cachedDetails = store.getValue('metaDetails')?.value || {};
    return cachedDetails[key] || null;
  }

  async function run() {
    if (running) return null;
    running = true;
    try {
      const top = (await fetchTopPlayers()).slice(0, players);
      if (!top.length) return null;
      const acc = createAccumulator();
      const crown = createCrownAccumulator();
      const tiers = TIERS.filter((n) => n < top.length).map((n) => ({ n, acc: createAccumulator(), sampled: 0 }));
      let sampled = 0;
      let failures = 0;
      for (const [i, p] of top.entries()) {
        const battles = await fetchBattles(p.tag, p);
        if (battles) {
          acc.add(battles);
          crown.add(battles);
          sampled += 1;
          const place = p.rank ?? i + 1;
          for (const tier of tiers) if (place <= tier.n) { tier.acc.add(battles); tier.sampled += 1; }
          if (onBattles) {
            try { onBattles(battles, place); } catch (err) { log.warn?.('[scout] Matchup-Verlauf:', err?.message || err); }
          }
          failures = 0;
        } else if (++failures >= 15) {
          break; // API offenbar nicht erreichbar — den alten Stand behalten
        }
        if (spacingMs > 0) await sleep(spacingMs); // 0 = ohne Pause (Tests)
      }
      if (acc.battles < MIN_BATTLES_FOR_SNAPSHOT) return null;
      const snapshot = acc.result({ players: sampled });
      const rank = new Map(top.map((p, i) => [p.tag, p.rank ?? i + 1]));
      const details = acc.details({ rankOf: (tag) => rank.get(tag) });
      store.setValue('meta', snapshot);
      store.setValue('metaDetails', details);
      cached = snapshot;
      cachedDetails = details;
      const tierSnaps = Object.fromEntries(tiers.filter((t) => t.acc.battles >= MIN_BATTLES_FOR_SNAPSHOT)
        .map((t) => [t.n, t.acc.result({ players: t.sampled })]));
      store.setValue('metaTiers', tierSnaps);
      cachedTiers = tierSnaps;
      // Crown Series nur ersetzen, wenn genug Duelle dabei waren — außerhalb der Saison bleibt der letzte Stand
      if (crown.battles >= MIN_CROWN_BATTLES) {
        cachedCrown = crown.result({ rankOf: (tag) => rank.get(tag) });
        store.setValue('crown', cachedCrown);
      }
      return snapshot;
    } catch (err) {
      log.warn?.('[scout] Meta-Sammlung fehlgeschlagen:', err?.message || err);
      return null;
    } finally {
      running = false;
    }
  }

  /** Regelmäßig prüfen, ob der Stand zu alt ist. Der erste Lauf wartet kurz, damit der Serverstart nicht stockt. */
  function start({ firstDelayMs = 2 * 60 * 1000, checkEveryMs = 20 * 60 * 1000 } = {}) {
    if (timer) return;
    const check = () => {
      const snap = current();
      // Ein Stand aus der Zeit vor den Deck-Schlüsseln bzw. vor den Top-Filtern (beides Nov. 2026) wird sofort ersetzt
      const noTiers = !store.getValue('metaTiers');
      if (!snap || Date.now() - snap.updatedAt >= intervalMs || (snap.decks?.length && !snap.decks[0].key) || noTiers) run();
    };
    const first = setTimeout(check, firstDelayMs);
    first.unref?.();
    timer = setInterval(check, checkEveryMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, run, current, currentTier, deckDetails, crown: crownSnapshot, TIERS };
}

module.exports = { createAccumulator, createMetaCrawler, deckKey };
