// engine/game.js — Regeln von Worldflip als reine Funktionen (kein DOM, kein Zufall außerhalb des Zustands).
//
// Zustand
//   n, hands[n][], deck[], pile[] (oberste Karte = letzte), turn, dir (1 | -1), world (0–3),
//   charges[4] (Ladung je Welt, bleibt beim Weltwechsel erhalten), next[4] (nächstes Ereignis je Welt),
//   shield[n], frozen[n], out[n] (Zustände der Spieler; out = setzt den nächsten Zug aus), fog[n] (Nebel: so viele eigene
//   Züge bleibt die Kartenzahl noch verborgen), teams (null | Team je Platz),
//   dark (Züge, die noch blind gespielt werden), darkBy, drawn[] (IDs der in diesem Zug gezogenen Karten),
//   combo (Zahl, die per Strömung nachgelegt werden darf, sonst null),
//   lastFx (Art der zuletzt gelegten Effektkarte — das, was ein Echo wiederholt),
//   react (null | offener Angriff, auf den das Ziel antworten darf: { by, seat, k, plus, again }),
//   winner, winTeam, turnNo, rng
//
// Karte   { id, w: 0–3 | -1 (passt immer), k: Kartenart (constants.KINDS), n: Zahl bei k === 'n' }
//
// Züge    { t: 'play', id, world?, target? }   world bei Karten, die immer passen; target bei Karten mit Ziel
//         { t: 'draw' }                        ziehen (im Vulkan 2); passt etwas davon, darf man es noch legen
//         { t: 'pass' }                        nach dem Ziehen oder in einer Strömungs-Kette weitergeben
//   Antworten auf einen Angriff (nur react.seat, solange react gesetzt ist):
//         { t: 'react', id }                   Spiegel legen (wirft zurück) oder — gegen Hagel — selbst einen Hagel drauflegen
//         { t: 'take' }                        hinnehmen
//
// Wer gerade handeln darf, sagt actorOf(): das Ziel eines offenen Angriffs, sonst wer am Zug ist.
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

/**
 * Alle 117 Karten: je Welt 15 Zahlen (eine 0, 1–7 doppelt), 2 Wirbel, 2 Hagel, 1 Sturm und ihre drei eigenen Karten
 * (je 2, Supernova 3); dazu 12 Karten, die immer passen (4 Portal, 2 Finsternis, 3 Zünder, 3 Spiegel).
 */
export function buildDeck() {
  const cards = [];
  const add = (w, k, n = 0) => cards.push({ id: cards.length, w, k, n });
  for (let w = 0; w < 4; w += 1) {
    add(w, 'n', 0);
    for (let n = 1; n <= RULES.NUMBERS; n += 1) {
      add(w, 'n', n);
      add(w, 'n', n);
    }
    add(w, 'kipp');
    add(w, 'kipp');
    for (let i = 0; i < RULES.HAGEL_PER_WORLD; i += 1) add(w, 'hagel');
    add(w, 'sturm');
    for (const k of Object.keys(KINDS)) {
      if (KINDS[k].world !== w) continue;
      for (let i = 0; i < (KINDS[k].copies || 2); i += 1) add(w, k);
    }
  }
  for (let i = 0; i < 4; i += 1) add(-1, 'portal');
  for (let i = 0; i < 2; i += 1) add(-1, 'finsternis');
  for (let i = 0; i < 3; i += 1) add(-1, 'zuender');
  for (let i = 0; i < 3; i += 1) add(-1, 'spiegel');
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
    shield: new Array(n).fill(false), frozen: new Array(n).fill(false), out: new Array(n).fill(false), fog: new Array(n).fill(0),
    teams: teams ? [0, 1, 0, 1] : null,
    dark: 0, darkBy: null, drawn: [], combo: null, lastFx: null, react: null,
    winner: null, winTeam: null, turnNo: 0, rng: seed | 0,
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
/** Wer gerade handeln darf: das Ziel eines offenen Angriffs, sonst wer am Zug ist. */
export const actorOf = (s) => (s.react ? s.react.seat : s.turn);
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
  const top = topCard(s);
  if (top.w < 0) return false;
  if (card.k === 'n') return top.k === 'n' && top.n === card.n;
  return top.k === card.k;
}

export const legalCards = (s, seat) => s.hands[seat].filter((c) => isLegal(s, c));

/** Welt, die nach dieser Karte gilt (chosen: gewählte Welt bei Karten, die immer passen). Der Spiegel lässt die Welt, wie sie ist. */
export function worldAfter(s, card, chosen = null) {
  if (card.k === 'spiegel') return s.world;
  if (card.w < 0) return chosen === null ? s.world : chosen;
  return card.w;
}

/** Was eine Karte gerade auslöst: ihre eigene Art, beim Echo die zuletzt gelegte Effektkarte, sonst null. */
export function effectOf(s, card) {
  if (card.k === 'n' || card.k === 'spiegel') return null; // der Spiegel wirkt nur als Antwort
  return card.k === 'echo' ? s.lastFx : card.k;
}

/** Kosmos — Wurmlöcher: Gilt das Gesetz für diese Zahl? (im Kosmos gelegt oder sie führt in den Kosmos) */
export const isCosmic = (s, card) => card.k === 'n' && (card.n === 0 || card.n === 7) && (s.world === 3 || card.w === 3);

/** Muss zu dieser Karte ein Mitspieler gewählt werden? (Zielkarten, Echo einer Zielkarte, die 7 im Kosmos) */
export function needsTarget(s, card) {
  if (card.k === 'n') return card.n === 7 && isCosmic(s, card);
  const k = effectOf(s, card);
  return !!(k && KINDS[k].target);
}

/** Karten, mit denen `seat` auf den offenen Angriff antworten darf: Spiegel, gegen Hagel auch ein eigener Hagel. */
export function answersOf(s, seat) {
  const q = s.react;
  if (!q || q.seat !== seat) return [];
  return s.hands[seat].filter((c) => c.k === 'spiegel' || (c.k === 'hagel' && q.k === 'hagel'));
}

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
  // Ziel: der Gegner mit den wenigsten Karten (er ist am gefährlichsten) — beim Tausch (7 im Kosmos) irgendwer
  // mit den wenigsten Karten
  const pool = card.k === 'n' ? s.hands.map((_, p) => p).filter((p) => p !== seat) : foesOf(s, seat);
  let target = pool[0];
  for (const p of pool) if (s.hands[p].length < s.hands[target].length) target = p;
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
  out: s.out.slice(),
  fog: s.fog.slice(),
  drawn: s.drawn.slice(),
  react: s.react ? { ...s.react } : null,
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

// Alle Hände wandern einen Platz in Spielrichtung weiter (Flut, 0 im Kosmos)
function rotateHands(s) {
  const hands = s.hands;
  s.hands = hands.map((_, p) => hands[(p - s.dir + s.n) % s.n]);
}

// Zug abschließen: gezogene Karten und Kette vergessen, Finsternis und der eigene Nebel laufen einen Zug weiter
function closeTurn(s, events) {
  s.drawn = [];
  s.combo = null;
  if (s.fog[s.turn] > 0) {
    s.fog[s.turn] -= 1;
    if (s.fog[s.turn] === 0) events.push({ t: 'unfog', seat: s.turn });
  }
  if (s.dark > 0) {
    s.dark -= 1;
    if (s.dark === 0) {
      s.darkBy = null;
      events.push({ t: 'light' });
    }
  }
}

function endTurn(s, events, { skip = false, again = false } = {}) {
  closeTurn(s, events);
  let nx = s.turn;
  if (!again) {
    nx = nextSeat(s, s.turn);
    if (skip) nx = nextSeat(s, nx);
  }
  // Wer aussetzen muss, wird übersprungen: Eingefrorene tauen dabei auf
  for (let i = 0; i < s.n && (s.frozen[nx] || s.out[nx]); i += 1) {
    if (s.frozen[nx]) {
      s.frozen[nx] = false;
      events.push({ t: 'thaw', seat: nx });
    } else {
      s.out[nx] = false;
      events.push({ t: 'sitout', seat: nx });
    }
    nx = nextSeat(s, nx);
  }
  s.turn = nx;
  s.turnNo += 1;
  events.push({ t: 'turn', seat: nx });
}

// Weltereignis der Welt w auslösen (by = wer die Ladung voll gemacht hat). Liefert das Ereignis (e.again: by ist
// gleich noch einmal dran).
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
    rotateHands(s);
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
  } else if (ev === 'zeitschleife') {
    e.again = true;
  } else if (ev === 'konjunktion') {
    for (let o = 0; o < 4; o += 1) if (o !== w) s.charges[o] = Math.min(RULES.CHARGE_MAX, s.charges[o] + 2);
  }
  e.charges = s.charges.slice();
  events.push(...pre, e);
  return e;
}

// Alles ausbrechen lassen, was voll ist — die aktuelle Welt zuerst. Konjunktion und Supernova können weitere Welten
// füllen: Die brechen gleich hinterher aus (Kettenreaktion). forced: Welt, die der Zünder auf jeden Fall auslöst.
function eruptions(s, by, events, flow, forced = null) {
  const run = (w) => {
    if (erupt(s, w, by, events).again) flow.again = true;
  };
  if (forced !== null) run(forced);
  for (let guard = 0; guard < 8; guard += 1) {
    const w = [0, 1, 2, 3].map((i) => (s.world + i) % 4).find((x) => s.charges[x] >= RULES.CHARGE_MAX);
    if (w === undefined) break;
    run(w);
  }
}

function win(s, seat, events) {
  s.winner = seat;
  s.winTeam = s.teams ? s.teams[seat] : null;
  s.drawn = [];
  s.combo = null;
  s.react = null;
  events.push({ t: 'win', seat, team: s.winTeam });
}

// Darf das Ziel auf diesen Angriff antworten? Nur wer handeln kann (nicht geblendet, eingefroren oder weggeweht) und
// eine Antwort auf der Hand hat: einen Spiegel — oder, gegen Hagel, selbst einen Hagel.
function canAnswer(s, by, victim, k) {
  if (victim === by || isBlind(s, victim) || s.frozen[victim] || s.out[victim]) return false;
  return s.hands[victim].some((c) => c.k === 'spiegel' || (c.k === 'hagel' && k === 'hagel'));
}

/**
 * Ein Angriff der Art k trifft `victim`. mirror: Platz dessen, der ihn mit dem Spiegel zurückgeworfen hat (dann ist
 * victim der Absender selbst und ein Schild hilft ihm nicht; beim Sturm fällt dann sein nächster Zug aus, bei Hagel und
 * Meteor zieht er nur).
 * Liefert true, wenn der Getroffene sofort aussetzt (er ist der Nächste in der Reihe).
 */
function hit(s, by, victim, k, plus, events, mirror) {
  const back = mirror !== null;
  const tag = back ? { mirror } : {};
  if (k === 'sturm') {
    if (back) s.out[victim] = true;
    events.push({ t: 'skip', by, seat: victim, ...tag });
    return !back;
  }
  if (!back && blocked(s, victim, events)) return false;
  if (k === 'hagel' || k === 'meteor') {
    // Hagel lässt nur ziehen; der Meteor lässt zusätzlich aussetzen — zurückgeworfen zieht der Absender aber nur
    const stun = k === 'meteor';
    const pre = [];
    const cards = drawCards(s, victim, plus, pre);
    events.push(...pre, { t: k, by, seat: victim, n: cards.length, plus, cards, ...tag });
    return stun && !back;
  }
  if (k === 'frost') {
    s.frozen[victim] = true;
    events.push({ t: 'frost', by, seat: victim, ...tag });
  } else if (k === 'strahl') {
    const pre = [];
    const cards = drawCards(s, victim, plus, pre);
    events.push(...pre, { t: 'beam', by, seat: victim, n: cards.length, cards, ...tag });
  } else if (k === 'saat') {
    // Zurückgeworfen: Statt eine Karte loszuwerden, bekommt der Absender eine von dem, der gespiegelt hat
    const [from, to] = back ? [mirror, by] : [by, victim];
    if (s.hands[from].length) {
      const [given] = s.hands[from].splice(Math.floor(rand(s) * s.hands[from].length), 1);
      s.hands[to].push(given);
      events.push({ t: 'gift', from, to, card: given, ...tag });
    }
  } else if (k === 'flaschenpost') {
    // Zurückgeworfen: Wer gespiegelt hat, sieht die Karten des Absenders
    const looker = back ? mirror : by;
    events.push({ t: 'peek', by: looker, seat: victim, cards: s.hands[victim].slice(), ...tag });
  }
  return false;
}

/**
 * Wirkung der Kartenart k, gelegt von seat (auch als Echo). Liefert einen offenen Angriff, wenn das Ziel antworten
 * darf — sonst null. flow sammelt, was der Zug am Ende bewirkt: skip, again, forced (Zünder).
 */
function effect(s, seat, k, { world, target, debt }, flow, events) {
  const kind = KINDS[k];
  if (kind.attack) {
    const victim = kind.target ? target : nextSeat(s, seat);
    const plus = (kind.plus || 0) + (k === 'hagel' ? debt : 0);
    if (canAnswer(s, seat, victim, k)) return { by: seat, seat: victim, k, plus };
    if (hit(s, seat, victim, k, plus, events, null)) flow.skip = true;
    return null;
  }
  if (k === 'kipp') {
    s.dir = -s.dir;
    events.push({ t: 'flip', dir: s.dir });
    if (s.n === 2) flow.skip = true; // zu zweit: man ist gleich wieder dran
  } else if (k === 'walze') {
    const pre = [];
    const draws = [];
    for (const p of foesOf(s, seat)) {
      if (blocked(s, p, pre)) continue;
      const cards = drawCards(s, p, 1, pre);
      if (cards.length) draws.push({ seat: p, cards });
    }
    events.push(...pre, { t: 'walze', by: seat, draws });
  } else if (k === 'brandopfer') {
    const losses = [];
    discardRandom(s, seat, 1, losses);
    events.push({ t: 'burn', seat, losses });
  } else if (k === 'welle') {
    flow.again = true;
    events.push({ t: 'again', seat });
  } else if (k === 'schild') {
    s.shield[seat] = true;
    events.push({ t: 'shield', seat });
  } else if (k === 'supernova') {
    for (let o = 0; o < 4; o += 1) if (o !== world) s.charges[o] = Math.min(RULES.CHARGE_MAX, s.charges[o] + 1);
    events.push({ t: 'nova', by: seat, charges: s.charges.slice() });
  } else if (k === 'nebel') {
    s.fog[seat] = RULES.FOG_TURNS + 1; // der laufende Zug zählt beim Abschluss schon einen ab
    events.push({ t: 'fog', seat });
  } else if (k === 'finsternis') {
    s.dark = s.n; // der eigene Zugwechsel zählt schon einen ab
    s.darkBy = seat;
    events.push({ t: 'dark', by: seat });
  } else if (k === 'zuender') {
    flow.forced = world;
  }
  return null;
}

/**
 * Eine Karte legen (sie ist schon geprüft). debt: aufgelaufene Karten eines Hagels, auf den dieser Hagel gelegt wird.
 * Endet mit dem Zugwechsel, einem Sieg — oder einem offenen Angriff (s.react), auf den das Ziel erst antworten darf.
 */
function doPlay(s, seat, card, a, events, debt = 0) {
  const auto = autoChoice(s, seat, card);
  const world = worldAfter(s, card, Number.isInteger(a.world) && a.world >= 0 && a.world < 4 ? a.world : auto.world);
  const cosmic = isCosmic(s, card);
  let target = null;
  if (needsTarget(s, card)) target = Number.isInteger(a.target) && a.target >= 0 && a.target < s.n && a.target !== seat ? a.target : auto.target;
  const fx = effectOf(s, card);

  s.hands[seat].splice(s.hands[seat].indexOf(card), 1);
  s.pile.push(card);
  const from = s.world;
  s.world = world;
  s.charges[world] = Math.min(RULES.CHARGE_MAX, s.charges[world] + (world === 2 ? 2 : 1)); // Dschungel: Wildwuchs
  events.push({ t: 'play', seat, card, world, charges: s.charges.slice(), ...(card.k === 'echo' && fx ? { echo: fx } : {}) });
  if (world !== from) events.push({ t: 'world', from, to: world });
  if (!s.hands[seat].length) return win(s, seat, events);
  if (card.k !== 'n' && card.k !== 'echo' && card.k !== 'spiegel') s.lastFx = card.k;

  const flow = { skip: false, again: false, forced: null };
  let ask = null;
  if (cosmic && card.n === 7) {
    // Kosmos — Wurmlöcher: Hand mit einem Spieler tauschen
    [s.hands[seat], s.hands[target]] = [s.hands[target], s.hands[seat]];
    events.push({ t: 'swap', a: seat, b: target });
  } else if (cosmic) {
    // … und die 0 reicht alle Hände in Spielrichtung weiter
    rotateHands(s);
    events.push({ t: 'rotate', dir: s.dir });
  } else if (fx) {
    ask = effect(s, seat, fx, { world, target, debt }, flow, events);
  }
  // Die Saat war die vorletzte Karte: Hand leer
  if (!s.hands[seat].length) return win(s, seat, events);

  if (ask) {
    // Erst bricht aus, was voll ist — dann darf das Ziel antworten. Der Zug endet mit der Antwort.
    eruptions(s, seat, events, flow, flow.forced);
    s.drawn = [];
    s.combo = null;
    s.react = { ...ask, again: flow.again };
    events.push({ t: 'ask', seat: ask.seat, by: ask.by, k: ask.k });
    return null;
  }

  eruptions(s, seat, events, flow, flow.forced);

  // Ozean: Strömung — nach einer Zahl darf dieselbe Zahl nachgelegt werden
  if (card.k === 'n' && world === 1 && !isBlind(s, seat) && s.hands[seat].some((c) => c.k === 'n' && c.n === card.n)) {
    s.drawn = [];
    s.combo = card.n;
    events.push({ t: 'combo', seat, n: card.n });
    return null;
  }
  return endTurn(s, events, flow);
}

// Antwort auf einen offenen Angriff: hinnehmen, mit dem Spiegel zurückwerfen oder (Hagel) einen Hagel drauflegen
function answer(s, seat, a, events) {
  const q = s.react;
  if (a.t === 'take') {
    s.react = null;
    const skip = hit(s, q.by, seat, q.k, q.plus, events, null);
    if (!s.hands[q.by].length) return win(s, q.by, events); // die Saat war die vorletzte Karte
    return endTurn(s, events, { skip, again: q.again });
  }
  if (a.t !== 'react') return 'Antworte erst auf den Angriff.';
  const card = s.hands[seat].find((c) => c.id === a.id);
  if (!card || !(card.k === 'spiegel' || (card.k === 'hagel' && q.k === 'hagel'))) return 'Damit kannst du nicht antworten.';
  s.react = null;

  if (card.k === 'spiegel') {
    // Der Spiegel verschwindet unter der Ablage — oben bleibt die Karte, die er zurückwirft
    s.hands[seat].splice(s.hands[seat].indexOf(card), 1);
    s.pile.unshift(card);
    events.push({ t: 'reflect', seat, to: q.by, card });
    if (!s.hands[seat].length) return win(s, seat, events);
    hit(s, q.by, q.by, q.k, q.plus, events, seat);
    if (!s.hands[seat].length) return win(s, seat, events); // die zurückgeworfene Saat nahm die letzte Karte mit
    return endTurn(s, events, { again: q.again });
  }

  // Hagel auf Hagel: Damit ist der eigene Zug gespielt, die Karten wandern zum Nächsten weiter
  closeTurn(s, events);
  s.turn = seat;
  s.turnNo += 1;
  events.push({ t: 'turn', seat });
  return doPlay(s, seat, card, {}, events, q.plus);
}

// Der Nebel lichtet sich, sobald jemand nur noch eine Karte hält (die letzte Karte soll jeder sehen)
function liftFog(s, events) {
  if (s.winner !== null) return;
  for (let p = 0; p < s.n; p += 1) {
    if (s.fog[p] > 0 && s.hands[p].length <= 1) {
      s.fog[p] = 0;
      events.push({ t: 'unfog', seat: p });
    }
  }
}

/**
 * Führt einen Zug aus. Liefert { ok: false, error } oder { ok: true, state, events }.
 * Der übergebene Zustand bleibt unverändert.
 */
export function apply(state, seat, action) {
  if (state.winner !== null) return { ok: false, error: 'Die Runde ist vorbei.' };
  if (seat !== actorOf(state)) return { ok: false, error: 'Du bist nicht dran.' };
  const a = action && typeof action === 'object' ? action : {};
  const s = clone(state);
  const events = [];

  if (s.react) {
    const error = answer(s, seat, a, events);
    if (typeof error === 'string') return { ok: false, error };
    liftFog(s, events);
    return { ok: true, state: s, events };
  }
  const blind = isBlind(s, seat);

  if (a.t === 'draw') {
    if (s.drawn.length || s.combo !== null) return { ok: false, error: 'Jetzt kannst du nicht ziehen.' };
    const cards = drawCards(s, seat, s.world === 0 ? 2 : 1, events); // Vulkan: Hitze
    events.push({ t: 'draw', seat, n: cards.length, cards });
    s.drawn = cards.map((c) => c.id);
    // Sehend und nichts davon passt: Zug ist vorbei. Blind weiß man es nicht — dann entscheidet der Spieler.
    if (!cards.length || (!blind && !cards.some((c) => isLegal(s, c)))) endTurn(s, events);
    liftFog(s, events);
    return { ok: true, state: s, events };
  }

  if (a.t === 'pass') {
    if (!s.drawn.length && s.combo === null) return { ok: false, error: 'Erst ziehen oder legen.' };
    endTurn(s, events);
    return { ok: true, state: s, events };
  }

  if (a.t !== 'play') return { ok: false, error: 'Unbekannter Zug.' };
  const card = s.hands[seat].find((c) => c.id === a.id);
  if (!card) return { ok: false, error: 'Diese Karte hast du nicht.' };

  if (!isLegal(s, card)) {
    if (!blind || s.combo !== null) return { ok: false, error: 'Die Karte passt nicht.' };
    if (s.drawn.length && !s.drawn.includes(card.id)) return { ok: false, error: 'Nur eine gezogene Karte.' };
    // Blind danebengegriffen: Karte zurück, eine Strafkarte, Zug vorbei
    events.push({ t: 'misplay', seat, card });
    const cards = drawCards(s, seat, 1, events);
    events.push({ t: 'draw', seat, n: cards.length, cards });
    endTurn(s, events);
    liftFog(s, events);
    return { ok: true, state: s, events };
  }

  doPlay(s, seat, card, a, events);
  liftFog(s, events);
  return { ok: true, state: s, events };
}

/**
 * Was ein Platz sehen darf (seat === null: Zuschauer). Fremde Hände nur als Anzahl — und im Nebel nicht einmal die
 * (counts[p] === null), außer für den Spieler selbst und seinen Partner. Nach dem Ende liegt alles offen.
 */
export function viewFor(s, seat) {
  const mine = seat !== null && seat >= 0 && seat < s.n;
  const hidden = (p) => s.winner === null && s.fog[p] > 0 && (!mine || isFoe(s, seat, p));
  // 2 gegen 2: Partner sehen die Karten des anderen — außer man ist selbst geblendet (Finsternis)
  let mate = null;
  if (mine && s.teams) {
    const p = s.teams.findIndex((t, i) => i !== seat && t === s.teams[seat]);
    if (p >= 0) mate = { seat: p, hand: isBlind(s, seat) ? null : s.hands[p] };
  }
  return {
    n: s.n,
    turn: s.turn,
    dir: s.dir,
    world: s.world,
    charges: s.charges,
    next: s.next,
    shield: s.shield,
    frozen: s.frozen,
    out: s.out,
    fog: s.fog.map((v) => v > 0),
    fogLeft: mine ? s.fog[seat] : 0,
    teams: s.teams,
    mate,
    dark: s.dark,
    darkBy: s.darkBy,
    drawn: mine && seat === s.turn ? s.drawn : [],
    combo: s.combo,
    lastFx: s.lastFx,
    react: s.react ? { by: s.react.by, seat: s.react.seat, k: s.react.k, plus: s.react.plus } : null,
    top: topCard(s),
    pileCount: s.pile.length,
    deckCount: s.deck.length,
    counts: s.hands.map((h, p) => (hidden(p) ? null : h.length)),
    hand: mine ? s.hands[seat] : null,
    winner: s.winner,
    winTeam: s.winTeam,
    turnNo: s.turnNo,
  };
}

const hideDraws = (draws, seat) => draws.map((d) => (d.seat === seat ? d : { seat: d.seat, n: d.cards.length }));

/** Ereignisse für einen Platz: gezogene, verschenkte und per Flaschenpost gezeigte Karten bleiben für andere verdeckt. */
export function eventsFor(events, seat) {
  return events.map((e) => {
    if ((e.t === 'draw' || e.t === 'hagel' || e.t === 'meteor' || e.t === 'beam') && e.seat !== seat) {
      const { cards: _cards, ...rest } = e;
      return rest;
    }
    if (e.t === 'peek' && e.by !== seat) {
      const { cards: _cards, ...rest } = e;
      return rest;
    }
    if (e.t === 'gift' && e.from !== seat && e.to !== seat) {
      const { card: _card, ...rest } = e;
      return rest;
    }
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
