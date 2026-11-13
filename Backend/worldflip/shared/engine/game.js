// engine/game.js — Regeln von Worldflip als reine Funktionen (kein DOM, kein Zufall außerhalb des Zustands).
//
// Zustand
//   n, hands[n][], deck[], pile[] (oberste Karte = letzte), turn, dir (1 | -1), world (0–3),
//   charges[4] (Ladung je Welt, bleibt beim Weltwechsel erhalten), next[4] (nächstes Ereignis je Welt),
//   shield[n], frozen[n] (Zustände der Spieler), teams (null | Team je Platz), dark (Züge, die noch blind gespielt
//   werden), darkBy, drawn[] (IDs der in diesem Zug gezogenen Karten), combo (Zahl, die per Strömung nachgelegt
//   werden darf, sonst null), winner, winTeam, turnNo, rng
//
// Karte   { id, w: 0–3 | -1 (passt immer), k: Kartenart (constants.KINDS), n: Zahl bei k === 'n' }
//
// Züge    { t: 'play', id, world?, target? }   world bei Karten, die immer passen; target bei Karten mit Ziel
//         { t: 'draw' }                        ziehen (im Vulkan 2); passt etwas davon, darf man es noch legen
//         { t: 'pass' }                        nach dem Ziehen oder in einer Strömungs-Kette weitergeben
//
// apply() liefert den neuen Zustand und die Ereignisse in der Reihenfolge, in der sie abgespielt werden.
import { RULES, ANIM, KINDS, EVENTS_BY_WORLD } from './constants.js';

// ── Zufall (mulberry32, Zustand liegt im Spielzustand: gleicher Seed ⇒ gleiche Partie) ───────────────────────
function rand(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];

function shuffle(s, arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Alle 93 Karten: je Welt 14 Zahlen, 2 Kipp, 1 Sturm und 2×2 eigene Karten; dazu 9 Karten, die immer passen. */
export function buildDeck() {
  const cards = [];
  const add = (w, k, n = 0) => cards.push({ id: cards.length, w, k, n });
  for (let w = 0; w < 4; w += 1) {
    for (let n = 1; n <= RULES.NUMBERS; n += 1) {
      add(w, 'n', n);
      add(w, 'n', n);
    }
    add(w, 'kipp');
    add(w, 'kipp');
    add(w, 'sturm');
    for (const k of Object.keys(KINDS)) {
      if (KINDS[k].world !== w) continue;
      add(w, k);
      add(w, k);
    }
  }
  for (let i = 0; i < 4; i += 1) add(-1, 'portal');
  for (let i = 0; i < 2; i += 1) add(-1, 'finsternis');
  for (let i = 0; i < 3; i += 1) add(-1, 'zuender');
  return cards;
}

export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const players = Math.round(Number(r.players));
  const teams = r.teams === true;
  return {
    players: teams ? 4 : players >= RULES.MIN_PLAYERS && players <= RULES.MAX_PLAYERS ? players : RULES.MAX_PLAYERS,
    teams,
    handSize: RULES.HAND_SIZES.includes(r.handSize) ? r.handSize : RULES.DEFAULT_HAND,
    turnSeconds: RULES.TURN_SECONDS.includes(r.turnSeconds) ? r.turnSeconds : RULES.DEFAULT_TURN_SECONDS,
    bots: r.bots !== false,
  };
}

function rollEvent(s, w, avoid) {
  const pool = EVENTS_BY_WORLD[w].filter((id) => id !== avoid);
  return pick(s, pool);
}

export function createGame({ players, handSize = RULES.DEFAULT_HAND, seed = 1, teams = false }) {
  const n = teams ? 4 : Math.max(RULES.MIN_PLAYERS, Math.min(RULES.MAX_PLAYERS, players | 0));
  const s = {
    n, hands: [], deck: [], pile: [], turn: 0, dir: 1, world: 0,
    charges: [0, 0, 0, 0], next: [],
    shield: new Array(n).fill(false), frozen: new Array(n).fill(false),
    teams: teams ? [0, 1, 0, 1] : null,
    dark: 0, darkBy: null, drawn: [], combo: null, winner: null, winTeam: null, turnNo: 0, rng: seed | 0,
  };
  s.deck = shuffle(s, buildDeck());
  for (let p = 0; p < n; p += 1) s.hands.push(s.deck.splice(0, handSize));
  // Startkarte: die erste Zahl im Stapel (keine Sonderkarte als Auftakt)
  const first = s.deck.findIndex((c) => c.k === 'n');
  s.pile.push(s.deck.splice(first, 1)[0]);
  s.world = s.pile[0].w;
  for (let w = 0; w < 4; w += 1) s.next.push(rollEvent(s, w, null));
  s.turn = Math.floor(rand(s) * n);
  return s;
}

export const topCard = (s) => s.pile[s.pile.length - 1];
export const nextSeat = (s, seat) => (seat + s.dir + s.n) % s.n;
/** Sind die zwei Plätze Gegner? (ohne Teams: jeder gegen jeden) */
export const isFoe = (s, a, b) => a !== b && (!s.teams || s.teams[a] !== s.teams[b]);
export const foesOf = (s, seat) => s.hands.map((_, p) => p).filter((p) => isFoe(s, seat, p));
/** Spielt dieser Platz gerade blind? (Finsternis trifft nur die Gegner dessen, der sie gelegt hat) */
export const isBlind = (s, seat) => s.dark > 0 && s.darkBy !== null && isFoe(s, s.darkBy, seat);

/** Passt die Karte? Nach dem Ziehen nur die gezogenen Karten, in einer Strömungs-Kette nur dieselbe Zahl. */
export function isLegal(s, card) {
  if (s.combo !== null) return card.k === 'n' && card.n === s.combo;
  if (s.drawn.length && !s.drawn.includes(card.id)) return false;
  if (card.w < 0) return true;
  if (card.w === s.world) return true;
  if (card.k === 'n' && s.world === 3) return true; // Kosmos: schwerelos
  const top = topCard(s);
  if (top.w < 0) return false;
  if (card.k === 'n') return top.k === 'n' && top.n === card.n;
  return top.k === card.k;
}

export const legalCards = (s, seat) => s.hands[seat].filter((c) => isLegal(s, c));

/** Welt und Ziel, wenn der Spieler nichts gewählt hat (blind gespielt, Zugzeit abgelaufen, Bot). */
export function autoChoice(s, seat, card) {
  const count = [0, 0, 0, 0];
  for (const c of s.hands[seat]) if (c.w >= 0 && c.id !== card.id) count[c.w] += 1;
  let world = s.world;
  let best = 0;
  for (let w = 0; w < 4; w += 1) {
    if (count[w] > best) {
      best = count[w];
      world = w;
    }
  }
  // Ziel: der Gegner mit den wenigsten Karten (er ist am gefährlichsten)
  const foes = foesOf(s, seat);
  let target = foes[0];
  for (const p of foes) if (s.hands[p].length < s.hands[target].length) target = p;
  return { world, target };
}

const clone = (s) => ({
  ...s,
  hands: s.hands.map((h) => h.slice()),
  deck: s.deck.slice(),
  pile: s.pile.slice(),
  charges: s.charges.slice(),
  next: s.next.slice(),
  shield: s.shield.slice(),
  frozen: s.frozen.slice(),
  drawn: s.drawn.slice(),
});

// Zieht bis zu `count` Karten; ist der Stapel leer, wird die Ablage (ohne oberste Karte) neu gemischt.
function drawCards(s, seat, count, events) {
  const got = [];
  for (let i = 0; i < count; i += 1) {
    if (!s.deck.length) {
      if (s.pile.length <= 1) break;
      s.deck = shuffle(s, s.pile.splice(0, s.pile.length - 1));
      events.push({ t: 'reshuffle' });
    }
    const c = s.deck.pop();
    s.hands[seat].push(c);
    got.push(c);
  }
  return got;
}

// Zufällige Karten aus einer Hand unter die Ablage
function discardRandom(s, seat, count, losses) {
  for (let i = 0; i < count && s.hands[seat].length > 1; i += 1) {
    const [card] = s.hands[seat].splice(Math.floor(rand(s) * s.hands[seat].length), 1);
    s.pile.unshift(card);
    losses.push({ seat, card });
  }
}

// Schild: fängt einen Angriff ab und ist dann verbraucht
function blocked(s, seat, events) {
  if (!s.shield[seat]) return false;
  s.shield[seat] = false;
  events.push({ t: 'block', seat });
  return true;
}

function endTurn(s, events, { skip = false, again = false } = {}) {
  s.drawn = [];
  s.combo = null;
  if (s.dark > 0) {
    s.dark -= 1;
    if (s.dark === 0) {
      s.darkBy = null;
      events.push({ t: 'light' });
    }
  }
  let nx = s.turn;
  if (!again) {
    nx = nextSeat(s, s.turn);
    if (skip) nx = nextSeat(s, nx);
    // Eingefrorene tauen auf und setzen dafür aus
    for (let i = 0; i < s.n && s.frozen[nx]; i += 1) {
      s.frozen[nx] = false;
      events.push({ t: 'thaw', seat: nx });
      nx = nextSeat(s, nx);
    }
  }
  s.turn = nx;
  s.turnNo += 1;
  events.push({ t: 'turn', seat: nx });
}

// Weltereignis der Welt w auslösen (by = wer die Ladung voll gemacht hat)
function erupt(s, w, by, events) {
  const ev = s.next[w];
  const e = { t: 'erupt', world: w, ev, by };
  const pre = []; // Schilde, Neumischen — werden vor dem Ereignis abgespielt
  s.charges[w] = 0;
  s.next[w] = rollEvent(s, w, ev);
  const counts = s.hands.map((h) => h.length);
  const all = s.hands.map((_, p) => p);
  const drawFor = (seats, count) => {
    e.draws = [];
    for (const p of seats) {
      if (blocked(s, p, pre)) continue;
      const cards = drawCards(s, p, count, pre);
      if (cards.length) e.draws.push({ seat: p, cards });
    }
  };

  if (ev === 'ausbruch') drawFor(foesOf(s, by), 1);
  else if (ev === 'lavabombe') drawFor([pick(s, foesOf(s, by))], 3);
  else if (ev === 'glutwind') {
    e.losses = [];
    discardRandom(s, by, 1, e.losses);
  } else if (ev === 'flut') {
    const hands = s.hands;
    s.hands = hands.map((_, p) => hands[(p - s.dir + s.n) % s.n]);
    e.rotate = s.dir;
  } else if (ev === 'strudel') {
    const pool = shuffle(s, s.hands.flat());
    s.hands = s.hands.map(() => []);
    let p = nextSeat(s, by);
    for (const c of pool) {
      s.hands[p].push(c);
      p = nextSeat(s, p);
    }
    e.mix = true;
  } else if (ev === 'ebbe') {
    e.losses = [];
    for (const p of all) discardRandom(s, p, 1, e.losses);
  } else if (ev === 'wuchern') {
    const min = Math.min(...counts);
    drawFor(all.filter((p) => counts[p] === min), 2);
  } else if (ev === 'fesseln') {
    const min = Math.min(...counts);
    e.freeze = [];
    for (const p of all) {
      if (counts[p] !== min || blocked(s, p, pre)) continue;
      s.frozen[p] = true;
      e.freeze.push(p);
    }
  } else if (ev === 'fruchtregen') {
    const max = Math.max(...counts);
    e.losses = [];
    for (const p of all) if (counts[p] === max) discardRandom(s, p, 2, e.losses);
  } else if (ev === 'loch') {
    e.losses = [];
    for (const p of all) if (counts[p] >= 3) discardRandom(s, p, 1, e.losses);
  } else if (ev === 'polsprung') {
    s.dir = -s.dir;
    e.flip = s.dir;
  } else if (ev === 'zwilling') {
    const a = pick(s, all);
    const b = pick(s, all.filter((p) => p !== a));
    [s.hands[a], s.hands[b]] = [s.hands[b], s.hands[a]];
    e.swap = [a, b];
  }
  events.push(...pre, e);
}

function win(s, seat, events) {
  s.winner = seat;
  s.winTeam = s.teams ? s.teams[seat] : null;
  s.drawn = [];
  s.combo = null;
  events.push({ t: 'win', seat, team: s.winTeam });
}

/**
 * Führt einen Zug aus. Liefert { ok: false, error } oder { ok: true, state, events }.
 * Der übergebene Zustand bleibt unverändert.
 */
export function apply(state, seat, action) {
  if (state.winner !== null) return { ok: false, error: 'Die Runde ist vorbei.' };
  if (seat !== state.turn) return { ok: false, error: 'Du bist nicht dran.' };
  const a = action && typeof action === 'object' ? action : {};
  const s = clone(state);
  const events = [];
  const blind = isBlind(s, seat);

  if (a.t === 'draw') {
    if (s.drawn.length || s.combo !== null) return { ok: false, error: 'Jetzt kannst du nicht ziehen.' };
    const cards = drawCards(s, seat, s.world === 0 ? 2 : 1, events); // Vulkan: Hitze
    events.push({ t: 'draw', seat, n: cards.length, cards });
    s.drawn = cards.map((c) => c.id);
    // Sehend und nichts davon passt: Zug ist vorbei. Blind weiß man es nicht — dann entscheidet der Spieler.
    if (!cards.length || (!blind && !cards.some((c) => isLegal(s, c)))) endTurn(s, events);
    return { ok: true, state: s, events };
  }

  if (a.t === 'pass') {
    if (!s.drawn.length && s.combo === null) return { ok: false, error: 'Erst ziehen oder legen.' };
    endTurn(s, events);
    return { ok: true, state: s, events };
  }

  if (a.t !== 'play') return { ok: false, error: 'Unbekannter Zug.' };
  const idx = s.hands[seat].findIndex((c) => c.id === a.id);
  if (idx < 0) return { ok: false, error: 'Diese Karte hast du nicht.' };
  const card = s.hands[seat][idx];

  if (!isLegal(s, card)) {
    if (!blind || s.combo !== null) return { ok: false, error: 'Die Karte passt nicht.' };
    if (s.drawn.length && !s.drawn.includes(card.id)) return { ok: false, error: 'Nur eine gezogene Karte.' };
    // Blind danebengegriffen: Karte zurück, eine Strafkarte, Zug vorbei
    events.push({ t: 'misplay', seat, card });
    const cards = drawCards(s, seat, 1, events);
    events.push({ t: 'draw', seat, n: cards.length, cards });
    endTurn(s, events);
    return { ok: true, state: s, events };
  }

  // Welt und Ziel
  const kind = KINDS[card.k];
  const auto = autoChoice(s, seat, card);
  let world = card.w;
  if (card.w < 0) world = Number.isInteger(a.world) && a.world >= 0 && a.world < 4 ? a.world : auto.world;
  let target = null;
  if (kind.target) target = Number.isInteger(a.target) && a.target >= 0 && a.target < s.n && a.target !== seat ? a.target : auto.target;

  s.hands[seat].splice(idx, 1);
  s.pile.push(card);
  const from = s.world;
  s.world = world;
  s.charges[world] = Math.min(RULES.CHARGE_MAX, s.charges[world] + (world === 2 ? 2 : 1)); // Dschungel: Wildwuchs
  events.push({ t: 'play', seat, card, world, charges: s.charges.slice() });
  if (world !== from) events.push({ t: 'world', from, to: world });

  if (!s.hands[seat].length) {
    win(s, seat, events);
    return { ok: true, state: s, events };
  }

  let skip = false;
  let again = false;
  const k = card.k;
  if (k === 'sturm') {
    skip = true;
    events.push({ t: 'skip', by: seat, seat: nextSeat(s, seat) });
  } else if (k === 'kipp') {
    s.dir = -s.dir;
    events.push({ t: 'flip', dir: s.dir });
    if (s.n === 2) skip = true; // zu zweit: man ist gleich wieder dran
  } else if (k === 'meteor') {
    const victim = nextSeat(s, seat);
    if (!blocked(s, victim, events)) {
      const pre = [];
      const cards = drawCards(s, victim, 2, pre);
      events.push(...pre, { t: 'meteor', by: seat, seat: victim, n: cards.length, cards });
      skip = true;
    }
  } else if (k === 'walze') {
    const pre = [];
    const draws = [];
    for (const p of foesOf(s, seat)) {
      if (blocked(s, p, pre)) continue;
      const cards = drawCards(s, p, 1, pre);
      if (cards.length) draws.push({ seat: p, cards });
    }
    events.push(...pre, { t: 'walze', by: seat, draws });
  } else if (k === 'frost') {
    if (!blocked(s, target, events)) {
      s.frozen[target] = true;
      events.push({ t: 'frost', by: seat, seat: target });
    }
  } else if (k === 'welle') {
    again = true;
    events.push({ t: 'again', seat });
  } else if (k === 'schild') {
    s.shield[seat] = true;
    events.push({ t: 'shield', seat });
  } else if (k === 'saat') {
    if (!blocked(s, target, events)) {
      const [given] = s.hands[seat].splice(Math.floor(rand(s) * s.hands[seat].length), 1);
      s.hands[target].push(given);
      events.push({ t: 'gift', from: seat, to: target, card: given });
    }
  } else if (k === 'tausch') {
    if (!blocked(s, target, events)) {
      [s.hands[seat], s.hands[target]] = [s.hands[target], s.hands[seat]];
      events.push({ t: 'swap', a: seat, b: target });
    }
  } else if (k === 'strahl') {
    if (!blocked(s, target, events)) {
      const pre = [];
      const cards = drawCards(s, target, 2, pre);
      events.push(...pre, { t: 'beam', by: seat, seat: target, n: cards.length, cards });
    }
  } else if (k === 'finsternis') {
    s.dark = s.n; // der eigene Zugwechsel zählt schon einen ab
    s.darkBy = seat;
    events.push({ t: 'dark', by: seat });
  }

  // Die Saat war die vorletzte Karte: Hand leer
  if (!s.hands[seat].length) {
    win(s, seat, events);
    return { ok: true, state: s, events };
  }

  // Weltereignis: volle Ladung oder Zünder
  if (k === 'zuender' || s.charges[world] >= RULES.CHARGE_MAX) erupt(s, world, seat, events);

  // Ozean: Strömung — nach einer Zahl darf dieselbe Zahl nachgelegt werden
  if (k === 'n' && world === 1 && !blind && s.hands[seat].some((c) => c.k === 'n' && c.n === card.n)) {
    s.drawn = [];
    s.combo = card.n;
    events.push({ t: 'combo', seat, n: card.n });
    return { ok: true, state: s, events };
  }

  endTurn(s, events, { skip, again });
  return { ok: true, state: s, events };
}

/** Was ein Platz sehen darf (seat === null: Zuschauer). Fremde Hände nur als Anzahl. */
export function viewFor(s, seat) {
  const mine = seat !== null && seat >= 0 && seat < s.n;
  return {
    n: s.n,
    turn: s.turn,
    dir: s.dir,
    world: s.world,
    charges: s.charges,
    next: s.next,
    shield: s.shield,
    frozen: s.frozen,
    teams: s.teams,
    dark: s.dark,
    darkBy: s.darkBy,
    drawn: mine && seat === s.turn ? s.drawn : [],
    combo: s.combo,
    top: topCard(s),
    pileCount: s.pile.length,
    deckCount: s.deck.length,
    counts: s.hands.map((h) => h.length),
    hand: mine ? s.hands[seat] : null,
    winner: s.winner,
    winTeam: s.winTeam,
    turnNo: s.turnNo,
  };
}

const hideDraws = (draws, seat) => draws.map((d) => (d.seat === seat ? d : { seat: d.seat, n: d.cards.length }));

/** Ereignisse für einen Platz: gezogene und verschenkte Karten anderer Spieler bleiben verdeckt. */
export function eventsFor(events, seat) {
  return events.map((e) => {
    if ((e.t === 'draw' || e.t === 'meteor' || e.t === 'beam') && e.seat !== seat) {
      const { cards: _cards, ...rest } = e;
      return rest;
    }
    if (e.t === 'gift' && e.from !== seat && e.to !== seat) return { t: 'gift', from: e.from, to: e.to };
    if ((e.t === 'erupt' || e.t === 'walze') && e.draws) return { ...e, draws: hideDraws(e.draws, seat) };
    return e;
  });
}

/** So lange braucht der Browser, um die Ereignisse abzuspielen (Millisekunden). */
export function durationOf(events) {
  let ms = 0;
  for (const e of events) ms += e.t === 'play' && e.card.k !== 'n' ? ANIM.playFx : ANIM[e.t] || 0;
  return ms;
}
