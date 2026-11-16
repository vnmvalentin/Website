// scoutMatchups.js — Matchup-Ratgeber (Ausbauplan „matchups"): Siegquoten Deck gegen Deck-Typ und Karte gegen Karte
// aus den Matchup-Zeilen der letzten 45 Tage (scoutStore: mu_battles, gesammelt vom Meta-Sammler, scoutHistory.js).
//
// Deck-Typ = die Haupt-Siegbedingung eines Decks: die teuerste Karte mit der Rolle „Siegbedingung" aus dem
// Deck-Baukasten (gespiegelt in core/cardFacts.json, `npm run spiegel -- clash`), bei gleichem Preis die zuerst
// genannte. Ohne Siegbedingung der teuerste Panzer, sonst die teuerste Truppe bzw. das teuerste Gebäude. Exakte Decks
// treffen zu selten aufeinander, um Deck gegen Deck zu zählen — Typen fassen Hog 2.6, Hog EQ usw. zusammen, so wie man
// im Spiel darüber redet („gegen Golem tu ich mich schwer").
//
// Genutzt von scoutRoutes.js: Deck-Seite (/deck → matchups), Karten-Seite (/matchups/card/:id) und Reiter „Form" im
// Profil (/player/:tag/form → types: die eigene Bilanz gegen Deck-Typen neben der Quote bei den Besten).
//
//   createMatchupAccumulator  reine Zählung über Matchup-Zeilen ({ a: {cards}, b: {cards}, res }) — eigene Tests
//   createMatchupWorker       liest seitenweise aus dem Speicher, legt das Ergebnis als „matchups" ab und rechnet nach
//                             jeder Meta-Sammlung neu (alle 6 h)

const FACTS = require('../core/cardFacts.json').karten;

const DAY = 24 * 60 * 60 * 1000;
const DAYS = 45;
// Ab so vielen Kämpfen zählt ein Wert (Werte für die echte Datenmenge: ≈ 10 000 Kämpfe am Tag)
const DEFAULTS = {
  minDeck: 60, // Kämpfe eines exakten Decks, ab denen es eigene Zahlen bekommt (sonst die seines Typs)
  minDeckCell: 10, // Deck gegen einen Typ
  minTypeCell: 20, // Typ gegen Typ
  minCardPair: 150, // Karte gegen Karte
  minDeckCard: 30, // Deck gegen eine Karte der Gegenseite
  listCards: 6, // so viele schwere bzw. leichte Gegner-Karten je Karte/Deck (eine Reihe auf der Seite)
};
// Deutlich und kaum Zufall: Abstand zur eigenen Gesamtquote UND z-Wert (Normalnäherung der Binomialverteilung). Bei
// Karten werden je Karte über hundert Gegner verglichen, deshalb die strenge Schwelle (wie lib/formPatterns.js).
const MIN_GAP = 0.03;
const Z_CARD = 2.33;

const baseId = (token) => {
  const s = String(token || '');
  const i = s.indexOf('~');
  return i < 0 ? s : s.slice(0, i);
};
const idOf = (c) => (typeof c === 'string' ? baseId(c) : c?.id || (c?.name ? `n:${c.name}` : ''));
const known = (id) => !!id && !id.startsWith('n:');

/** z-Wert eines Ergebnisses gegenüber der Erwartung p (positiv = besser als erwartet). */
function zScore(n, wins, p) {
  const sd = Math.sqrt(n * p * (1 - p));
  return sd > 0 ? (wins - n * p) / sd : 0;
}

/**
 * Deck-Typ einer Kartenliste (Karten als Objekte {id} oder Zeichen wie „hog-rider~ev1") oder null.
 * @param {Array} cards
 */
function deckType(cards, facts = FACTS) {
  let best = null;
  let bestScore = -Infinity;
  for (const c of Array.isArray(cards) ? cards : []) {
    const id = idOf(c);
    const f = facts[id];
    if (!f) continue;
    const elixir = Number.isFinite(f.elixir) ? f.elixir : 0;
    // Siegbedingung vor Panzer vor Truppe/Gebäude vor Zauber; darin teurer zuerst, bei Siegbedingungen dann der Listenplatz
    const tier = f.win ? 3 : f.tank ? 2 : f.type === 'spell' ? 0 : 1;
    const score = tier * 1e6 + elixir * 1e3 - (f.win || 0);
    if (score > bestScore || (score === bestScore && id < best)) { best = id; bestScore = score; }
  }
  return best;
}

const rate = (wins, n) => (n ? Math.round((wins / n) * 1000) / 1000 : null);

/**
 * Gegner-Karten, gegen die es deutlich schlechter bzw. besser läuft als im eigenen Schnitt.
 * @param {Iterable<[string, {n:number, wins:number}]>} entries  Gegner-Karte → Bilanz
 */
function hardEasy(entries, total, minN, limit) {
  const p = total.n ? total.wins / total.n : 0.5;
  const list = [];
  for (const [id, e] of entries) {
    if (!known(id) || e.n < minN) continue;
    const r = e.wins / e.n;
    const z = zScore(e.n, e.wins, p);
    if (Math.abs(r - p) >= MIN_GAP && Math.abs(z) >= Z_CARD) list.push({ id, n: e.n, wins: e.wins, r });
  }
  const out = (arr) => arr.slice(0, limit).map(({ id, n, wins }) => [id, n, wins]);
  return {
    hard: out(list.filter((e) => e.r < p).sort((a, b) => a.r - b.r || b.n - a.n)),
    easy: out(list.filter((e) => e.r > p).sort((a, b) => b.r - a.r || b.n - a.n)),
  };
}

/**
 * @param {object} [opts]
 * @param {Iterable<string>} [opts.deckKeys]  exakte Decks (Schlüssel wie scoutMeta.deckKey), die eigene Zahlen bekommen
 *   sollen — die Decks der aktuellen Meta-Auswertung; alle anderen laufen nur über ihren Typ
 */
function createMatchupAccumulator({ facts = FACTS, deckKeys = [], ...limits } = {}) {
  const o = { ...DEFAULTS, ...limits };
  const wanted = new Set(deckKeys);
  const types = new Map(); // Typ → { n, wins, vs: Map(Typ → {n, wins}) }
  const decks = new Map(); // Deck-Schlüssel → { n, wins, type, vs: Map, cards: Map(Gegner-Karte → {n, wins}) }
  // Karte gegen Karte als flache Zahlenfelder (8 × 8 Paare je Seite und Kampf — Maps wären hier zu langsam)
  const MAX_CARDS = 512;
  const cardIndex = new Map();
  const cardIds = [];
  const cardN = new Uint32Array(MAX_CARDS);
  const cardW = new Uint32Array(MAX_CARDS);
  const pairN = new Uint32Array(MAX_CARDS * MAX_CARDS);
  const pairW = new Uint32Array(MAX_CARDS * MAX_CARDS);
  let battles = 0;
  let from = null; // ältester gezählter Kampf — der Verlauf beginnt erst mit dem Sammler, „seit …" auf den Seiten

  const indexOf = (id) => {
    let i = cardIndex.get(id);
    if (i === undefined) {
      if (cardIds.length >= MAX_CARDS) return -1;
      i = cardIds.length;
      cardIds.push(id);
      cardIndex.set(id, i);
    }
    return i;
  };
  const bump = (map, key, won) => {
    let e = map.get(key);
    if (!e) { e = { n: 0, wins: 0 }; map.set(key, e); }
    e.n += 1;
    if (won) e.wins += 1;
    return e;
  };

  function side(cards) {
    const ids = cards.map(idOf);
    return { ids, idx: ids.map(indexOf), key: [...ids].sort().join(','), type: deckType(ids, facts) };
  }

  function count(me, opp, won) {
    if (me.type) {
      let t = types.get(me.type);
      if (!t) { t = { n: 0, wins: 0, vs: new Map() }; types.set(me.type, t); }
      t.n += 1;
      if (won) t.wins += 1;
      if (opp.type) bump(t.vs, opp.type, won);
    }
    for (const x of me.idx) {
      if (x < 0) continue;
      cardN[x] += 1;
      if (won) cardW[x] += 1;
      const row = x * MAX_CARDS;
      for (const y of opp.idx) {
        if (y < 0) continue;
        pairN[row + y] += 1;
        if (won) pairW[row + y] += 1;
      }
    }
    if (wanted.has(me.key)) {
      let d = decks.get(me.key);
      if (!d) { d = { n: 0, wins: 0, type: me.type, vs: new Map(), cards: new Map() }; decks.set(me.key, d); }
      d.n += 1;
      if (won) d.wins += 1;
      if (opp.type) bump(d.vs, opp.type, won);
      for (const id of opp.ids) bump(d.cards, id, won);
    }
  }

  /** Eine Matchup-Zeile: { a: {cards}, b: {cards}, res } mit res 1 = a gewann, 2 = b, 0 = unentschieden. */
  function add(row) {
    const a = row?.a?.cards;
    const b = row?.b?.cards;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 8 || b.length !== 8) return;
    battles += 1;
    if (Number.isFinite(row.t) && (from === null || row.t < from)) from = row.t;
    const A = side(a);
    const B = side(b);
    count(A, B, row.res === 1);
    count(B, A, row.res === 2);
  }

  const cells = (map, min) => Object.fromEntries([...map].filter(([, v]) => v.n >= min).map(([k, v]) => [k, [v.n, v.wins]]));

  /**
   * @returns {{ updatedAt, since, days, from, battles, types, decks, cards }}  from = ältester Kampf (oder null)
   *   types: { [Typ]: { n, wins, vs: { [Typ]: [n, wins] } } }
   *   decks: { [Deck]: { n, wins, type, vs, hard: [[Karte, n, wins]], easy } } — nur Decks ab minDeck Kämpfen
   *   cards: { [Karte]: { n, wins, hard, easy } } — Karte gegen Karte, nur deutliche Unterschiede
   */
  function result({ now = Date.now(), since = now - DAYS * DAY, days = DAYS } = {}) {
    const outTypes = {};
    for (const [k, t] of types) outTypes[k] = { n: t.n, wins: t.wins, vs: cells(t.vs, o.minTypeCell) };
    const outDecks = {};
    for (const [k, d] of decks) {
      if (d.n < o.minDeck) continue;
      outDecks[k] = { n: d.n, wins: d.wins, type: d.type, vs: cells(d.vs, o.minDeckCell), ...hardEasy(d.cards, d, o.minDeckCard, o.listCards) };
    }
    const outCards = {};
    for (const [x, id] of cardIds.entries()) {
      if (!known(id) || !cardN[x]) continue;
      const row = x * MAX_CARDS;
      // dieselbe Karte auf beiden Seiten liegt immer bei etwa 50 % — kein Gegner, den man nennen sollte
      const pairs = cardIds.map((oid, y) => [oid, { n: pairN[row + y], wins: pairW[row + y] }]).filter(([oid]) => oid !== id);
      outCards[id] = { n: cardN[x], wins: cardW[x], ...hardEasy(pairs, { n: cardN[x], wins: cardW[x] }, o.minCardPair, o.listCards) };
    }
    return { updatedAt: now, since, days, from, battles, types: outTypes, decks: outDecks, cards: outCards };
  }

  return { add, result, get battles() { return battles; } };
}

// ── Abfragen über ein Ergebnis ─────────────────────────────────────────────

const vsList = (vs, limit = 16) => Object.entries(vs || {})
  .map(([type, [n, wins]]) => ({ type, n, wins }))
  .sort((a, b) => b.n - a.n || b.wins - a.wins)
  .slice(0, limit);
const cardList = (list) => (list || []).map(([id, n, wins]) => ({ card: { id }, n, wins, winRate: rate(wins, n) }));

/**
 * Matchups eines Decks: eigene Zahlen, wenn das Deck genug Kämpfe hat, sonst die seines Typs.
 * @returns {null | { scope: 'deck'|'type', type, n, wins, vs: Array<{type,n,wins}>, cards?: {hard, easy}, updatedAt, days, battles }}
 */
function forDeck(res, key, cards) {
  if (!res) return null;
  const head = { updatedAt: res.updatedAt, days: res.days, from: res.from ?? null, battles: res.battles };
  const d = res.decks?.[key];
  if (d) return { ...head, scope: 'deck', type: d.type, n: d.n, wins: d.wins, vs: vsList(d.vs), cards: { hard: cardList(d.hard), easy: cardList(d.easy) } };
  const type = deckType(cards);
  const t = type ? res.types?.[type] : null;
  return t ? { ...head, scope: 'type', type, n: t.n, wins: t.wins, vs: vsList(t.vs) } : null;
}

/**
 * Karte gegen Karte, und — ist die Karte selbst ein Deck-Typ (Siegbedingung) — dessen Bilanz gegen die anderen Typen.
 * @returns {null | { n, wins, hard, easy, type: null | { n, wins, vs }, updatedAt, days, battles }}
 */
function forCard(res, id) {
  const c = res?.cards?.[id];
  if (!c) return null;
  const t = res.types?.[id];
  return {
    updatedAt: res.updatedAt, days: res.days, from: res.from ?? null, battles: res.battles,
    n: c.n, wins: c.wins, hard: cardList(c.hard), easy: cardList(c.easy),
    type: t ? { n: t.n, wins: t.wins, vs: vsList(t.vs) } : null,
  };
}

/**
 * Eigene Bilanz gegen Deck-Typen (Reiter „Form") und daneben, wie Decks desselben Typs wie das aktuelle bei den Besten
 * gegen diese Typen abschneiden. Bewusst der Typ, nicht das exakte Deck: dessen einzelne Zellen sind zu dünn (gesehen
 * Nov. 2026: 0 % und 100 % aus wenigen Dutzend Kämpfen), der Typ hat Tausende.
 * @param {Array<{ t, result, myCards?, oppCards? }>} list  neutrale Kampfliste (formPatterns.fromScoutBattle)
 */
function ownTypes(list, res) {
  const by = new Map();
  let latest = null;
  for (const b of Array.isArray(list) ? list : []) {
    if (!b || (b.result !== 'win' && b.result !== 'loss')) continue;
    if (Array.isArray(b.myCards) && b.myCards.length === 8 && (!latest || b.t > latest.t)) latest = b;
    const type = Array.isArray(b.oppCards) && b.oppCards.length === 8 ? deckType(b.oppCards) : null;
    if (!type) continue;
    const e = by.get(type) || { type, n: 0, wins: 0 };
    e.n += 1;
    if (b.result === 'win') e.wins += 1;
    by.set(type, e);
  }
  const myType = latest ? deckType(latest.myCards) : null;
  const vs = (myType && res?.types?.[myType]?.vs) || {};
  return {
    deckType: myType,
    list: [...by.values()].sort((a, b) => b.n - a.n).map((e) => {
      const g = vs[e.type];
      return { ...e, global: g ? { n: g[0], wins: g[1] } : null };
    }),
  };
}

// ── Hintergrund ─────────────────────────────────────────────────────────────

/**
 * @param {object} deps
 * @param {{ getValue, setValue, forEachMatchupPage }} deps.store
 * @param {() => string[]} [deps.deckKeys]       Decks der aktuellen Meta-Auswertung
 * @param {() => number} [deps.metaUpdatedAt]   Stand der Meta-Auswertung — ist er neuer, wird neu gerechnet
 */
function createMatchupWorker({ store, deckKeys = () => [], metaUpdatedAt = () => 0, days = DAYS, intervalMs = 6 * 60 * 60 * 1000, log = console, limits = {} }) {
  let cached;
  let running = false;
  let timer = null;

  function current() {
    if (cached === undefined) cached = store.getValue('matchups')?.value || null;
    return cached;
  }

  async function run() {
    if (running) return null;
    running = true;
    try {
      const now = Date.now();
      const since = now - days * DAY;
      const acc = createMatchupAccumulator({ deckKeys: deckKeys(), ...limits });
      const rows = await store.forEachMatchupPage(since, (page) => { for (const r of page) acc.add(r); });
      if (!rows) return null;
      const res = acc.result({ now, since, days });
      store.setValue('matchups', res);
      cached = res;
      return res;
    } catch (err) {
      log.warn?.('[scout] Matchup-Auswertung fehlgeschlagen:', err?.message || err);
      return null;
    } finally {
      running = false;
    }
  }

  /** Prüft regelmäßig, ob neu gerechnet werden muss (zu alt oder eine neuere Meta-Sammlung liegt vor). */
  function start({ firstDelayMs = 5 * 60 * 1000, checkEveryMs = 20 * 60 * 1000 } = {}) {
    if (timer) return;
    const check = () => {
      const cur = current();
      if (!cur || Date.now() - cur.updatedAt >= intervalMs || metaUpdatedAt() > cur.updatedAt) run();
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

  return {
    run, start, stop, current,
    deck: (key, cards) => forDeck(current(), key, cards),
    card: (id) => forCard(current(), id),
    own: (list) => ownTypes(list, current()),
  };
}

module.exports = { deckType, createMatchupAccumulator, createMatchupWorker, forDeck, forCard, ownTypes, zScore, DEFAULTS, DAYS };
