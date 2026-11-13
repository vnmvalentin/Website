// engine/bot.js — Computergegner. Sieht nur, was ein Mensch am Platz auch sähe: die eigene Hand, die Kartenzahl der
// anderen, Welt, Ladungen, die angekündigten Ereignisse und die Richtung. Läuft im Browser (Spiel gegen Bots) und auf
// dem Server (aufgefüllte Plätze, abgelaufene Zugzeit).
import { RULES, KINDS } from './constants.js';
import { autoChoice, foesOf, isBlind, isFoe, isLegal, nextSeat } from './game.js';

function withChoice(s, seat, card, world, target) {
  const auto = autoChoice(s, seat, card);
  const a = { t: 'play', id: card.id };
  if (card.w < 0) a.world = world ?? auto.world;
  if (KINDS[card.k].target) a.target = target ?? auto.target;
  return a;
}

// Was bringt mir das nächste Ereignis der Welt w, wenn ICH es auslöse? (positiv = gut für mich)
function eventValue(s, seat, w, mine) {
  const counts = s.hands.map((h) => h.length);
  counts[seat] = mine;
  const foes = foesOf(s, seat);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const foeMin = Math.min(...foes.map((p) => counts[p]));
  switch (s.next[w]) {
    case 'ausbruch': return 9;
    case 'lavabombe': return 7;
    case 'glutwind': return mine > 1 ? 11 : 0;
    case 'flut': return counts[(seat - s.dir + s.n) % s.n] < mine ? 9 : -10;
    case 'strudel': return mine > (counts.reduce((a, b) => a + b, 0) / s.n) ? 9 : -9;
    case 'ebbe': return mine > 1 ? 3 : -3;
    case 'wuchern': return mine <= min ? -14 : foeMin === min ? 8 : -2;
    case 'fesseln': return mine <= min ? -9 : foeMin === min ? 7 : -2;
    case 'fruchtregen': return mine >= max ? 12 : -5;
    case 'loch': return 2;
    default: return 0;
  }
}

/**
 * @param {object} s      Spielzustand
 * @param {number} seat   Platz des Bots (muss am Zug sein)
 * @param {() => number} [random]
 * @returns {{t: string, id?: number, world?: number, target?: number}}
 */
export function botAction(s, seat, random = Math.random) {
  const hand = s.hands[seat];

  // Blind: raten. Nach dem Ziehen mal eine gezogene Karte versuchen, mal weitergeben.
  if (isBlind(s, seat)) {
    if (s.drawn.length) {
      const c = hand.find((x) => x.id === s.drawn[0]);
      return c && random() < 0.5 ? withChoice(s, seat, c) : { t: 'pass' };
    }
    if (random() < 0.3) return { t: 'draw' };
    return withChoice(s, seat, hand[Math.floor(random() * hand.length)]);
  }

  const legal = hand.filter((c) => isLegal(s, c));
  const idle = s.drawn.length || s.combo !== null ? { t: 'pass' } : { t: 'draw' };
  if (!legal.length) return idle;

  const mine = hand.length;
  const next = nextSeat(s, seat);
  const nextFoe = isFoe(s, seat, next);
  const nextCount = s.hands[next].length;
  const foes = foesOf(s, seat);
  const foeMin = Math.min(...foes.map((p) => s.hands[p].length));
  const weakest = foes.find((p) => s.hands[p].length === foeMin);
  const perWorld = [0, 0, 0, 0];
  for (const c of hand) if (c.w >= 0) perWorld[c.w] += 1;
  const danger = foeMin <= 2;

  let best = null;
  let bestScore = -Infinity;
  for (const c of legal) {
    let score = random() * 0.6;
    let world = c.w;
    let target = weakest;
    if (c.w < 0) {
      // die Welt wählen, von der ich am meisten halte — beim Zünder die mit dem besten Ereignis
      world = autoChoice(s, seat, c).world;
      if (c.k === 'zuender') {
        let bestW = world;
        let bestV = -Infinity;
        for (let w = 0; w < 4; w += 1) {
          const v = eventValue(s, seat, w, mine - 1) + perWorld[w] * 0.5;
          if (v > bestV) {
            bestV = v;
            bestW = w;
          }
        }
        world = bestW;
      }
    }
    const k = c.k;
    if (k === 'n') score += 10;
    else if (k === 'sturm') score += nextFoe ? (nextCount <= 2 ? 26 : 12) : 2;
    else if (k === 'meteor') score += nextFoe ? (nextCount <= 2 ? 28 : 13) : -8;
    else if (k === 'kipp') score += nextFoe && nextCount <= 2 && s.n > 2 ? 20 : 10;
    else if (k === 'walze') score += danger ? 24 : 13;
    else if (k === 'frost') score += danger ? 25 : 11;
    else if (k === 'welle') score += 15;
    else if (k === 'schild') score += s.shield[seat] ? 4 : mine <= 3 ? 16 : 9;
    else if (k === 'saat') score += 17;
    else if (k === 'strahl') score += danger ? 27 : 12;
    else if (k === 'tausch') {
      // mit dem tauschen, der am wenigsten hat — aber nur, wenn es sich lohnt
      const all = s.hands.map((_, p) => p).filter((p) => p !== seat);
      target = all.reduce((a, p) => (s.hands[p].length < s.hands[a].length ? p : a), all[0]);
      const gain = mine - 1 - s.hands[target].length;
      score += gain >= 2 ? 22 + gain : -25;
    } else if (k === 'portal') score += mine <= 2 ? 22 : 3;
    else if (k === 'finsternis') score += danger ? 18 : 5;
    else if (k === 'zuender') score += 6 + eventValue(s, seat, world, mine - 1);

    // in der Welt bleiben, von der man viele Karten hält
    score += (perWorld[world] - (c.w === world ? 1 : 0)) * 0.9;
    // Strömung: gleiche Zahl auf der Hand = Kette
    if (k === 'n' && world === 1 && hand.some((x) => x !== c && x.k === 'n' && x.n === c.n)) score += 6;

    // löst die Karte ein Weltereignis aus?
    const charge = s.charges[world] + (world === 2 ? 2 : 1);
    if (k !== 'zuender' && charge >= RULES.CHARGE_MAX && mine > 1) score += eventValue(s, seat, world, mine - 1);

    if (score > bestScore) {
      bestScore = score;
      best = { card: c, world, target };
    }
  }

  // Nur schlechte Züge: lieber ziehen bzw. weitergeben
  if (bestScore < 0) return idle;
  return withChoice(s, seat, best.card, best.world, best.target);
}
