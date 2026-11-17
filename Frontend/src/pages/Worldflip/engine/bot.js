// engine/bot.js — Computergegner. Sieht nur, was ein Mensch am Platz auch sähe: die eigene Hand, die Kartenzahl der
// anderen, Welt, Ladungen, die angekündigten Ereignisse und die Richtung. Läuft im Browser (Spiel gegen Bots) und auf
// dem Server (aufgefüllte Plätze, abgelaufene Zugzeit).
import { RULES } from './constants.js';
import { autoChoice, chargeOf, effectOf, foesOf, isBlind, isCosmic, isFoe, isLegal, needsTarget, nextSeat, worldAfter } from './game.js';

function withChoice(s, seat, card, world, target) {
  const auto = autoChoice(s, seat, card);
  const a = { t: 'play', id: card.id };
  if (card.w < 0) a.world = world ?? auto.world;
  if (needsTarget(s, card)) a.target = target ?? auto.target;
  return a;
}

// Was bringt mir das nächste Ereignis der Welt w, wenn ICH es auslöse? (positiv = gut für mich)
function eventValue(s, seat, w, mine, count) {
  const counts = s.hands.map((_, p) => count(p));
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
    case 'zeitschleife': return 10;
    case 'konjunktion': return 3;
    default: return 0;
  }
}

// Antwort auf einen Angriff: Was vom Gegner kommt, wird zurückgeworfen; ein Hagel lieber weitergereicht als gezogen.
function botAnswer(s, seat) {
  const q = s.react;
  const hand = s.hands[seat];
  const mirror = hand.find((c) => c.k === 'spiegel');
  if (mirror && isFoe(s, seat, q.by)) return { t: 'react', id: mirror.id };
  const hagel = q.k === 'hagel' ? hand.find((c) => c.k === 'hagel') : null;
  if (hagel && isFoe(s, seat, nextSeat(s, seat))) return { t: 'react', id: hagel.id };
  return { t: 'take' };
}

/**
 * @param {object} s      Spielzustand
 * @param {number} seat   Platz des Bots (muss handeln dürfen: am Zug oder Ziel eines offenen Angriffs)
 * @param {() => number} [random]
 * @returns {{t: string, id?: number, world?: number, target?: number}}
 */
export function botAction(s, seat, random = Math.random) {
  if (s.react) return botAnswer(s, seat);
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
  // Nebel: Wie viele Karten ein Gegner im Nebel hält, weiß der Bot nicht — er rechnet mit einer mittleren Hand
  const count = (p) => (s.fog[p] > 0 && isFoe(s, seat, p) ? 5 : s.hands[p].length);
  const next = nextSeat(s, seat);
  const nextFoe = isFoe(s, seat, next);
  const nextCount = count(next);
  const foes = foesOf(s, seat);
  const foeMin = Math.min(...foes.map(count));
  const weakest = foes.find((p) => count(p) === foeMin);
  const others = s.hands.map((_, p) => p).filter((p) => p !== seat);
  const perWorld = [0, 0, 0, 0];
  for (const c of hand) if (c.w >= 0) perWorld[c.w] += 1;
  const danger = foeMin <= 2;
  // Tausch: lohnt sich nur, wenn die neue Hand deutlich kleiner ist als meine nach dem Legen
  const swapValue = (theirs) => {
    const gain = mine - 1 - theirs;
    return gain >= 2 ? 12 + gain : gain >= 0 ? -6 : -30;
  };

  // Wert einer Kartenart (auch für das Echo, das die letzte Effektkarte wiederholt)
  const kindValue = (k, world) => {
    switch (k) {
      case 'sturm': return nextFoe ? (nextCount <= 2 ? 26 : 12) : 2;
      case 'hagel': return nextFoe ? (nextCount <= 2 ? 23 : 11.5) : -8; // nur ziehen, kein Aussetzen
      case 'meteor': return nextFoe ? (nextCount <= 2 ? 25 : 12.5) : -8; // 3 ziehen, kein Aussetzen
      case 'kipp': return nextFoe && nextCount <= 2 && s.n > 2 ? 20 : 10;
      case 'walze': return danger ? 24 : 13;
      case 'brandopfer': return mine > 2 ? 18 : 6;
      case 'frost': return danger ? 25 : 11;
      case 'welle': return 15;
      case 'flaschenpost': return 8; // dem Bot nützt der Blick nichts — die Karte ist für ihn nur ein Abwurf
      case 'schild': return s.shield[seat] ? 4 : mine <= 3 ? 16 : 9;
      case 'saat': return 17;
      case 'strahl': return danger ? 27 : 12;
      case 'supernova': {
        // jede Welt, die dadurch voll wird, bricht für mich aus
        let v = 8;
        for (let w = 0; w < 4; w += 1) if (w !== world && s.charges[w] + 1 >= RULES.CHARGE_MAX) v += eventValue(s, seat, w, mine - 1, count);
        return v;
      }
      case 'portal': return mine <= 2 ? 22 : 3;
      case 'finsternis': return danger ? 18 : 5;
      case 'nebel': return s.fog[seat] > 1 ? 3 : mine <= 4 ? 14 : 8; // verbergen lohnt sich, wenn man dem Sieg nahe ist
      case 'zuender': return 6 + eventValue(s, seat, world, mine - 1, count);
      default: return 4;
    }
  };

  let best = null;
  let bestScore = -Infinity;
  for (const c of legal) {
    let score = random() * 0.6;
    let world = worldAfter(s, c);
    let target = weakest;
    if (c.w < 0 && c.k !== 'spiegel') {
      // die Welt wählen, von der ich am meisten halte — beim Zünder die mit dem besten Ereignis
      world = autoChoice(s, seat, c).world;
      if (c.k === 'zuender') {
        let bestW = world;
        let bestV = -Infinity;
        for (let w = 0; w < 4; w += 1) {
          const v = eventValue(s, seat, w, mine - 1, count) + perWorld[w] * 0.5;
          if (v > bestV) {
            bestV = v;
            bestW = w;
          }
        }
        world = bestW;
      }
    }
    const k = c.k;
    if (k === 'n') {
      score += 10;
      if (isCosmic(s, c) && c.n === 7) {
        // Kosmos: Hand tauschen — mit dem, der am wenigsten hat
        target = others.reduce((a, p) => (count(p) < count(a) ? p : a), others[0]);
        score += swapValue(count(target));
      } else if (isCosmic(s, c)) {
        // … oder alle Hände wandern weiter: Ich bekomme die Hand meines Vorgängers
        score += swapValue(count((seat - s.dir + s.n) % s.n));
      }
    } else if (k === 'spiegel') {
      // der Spiegel wirkt nur als Antwort: behalten, solange er nicht die letzte Rettung ist
      score += mine <= 2 ? 20 : 0.5;
    } else if (k === 'echo') {
      const fx = effectOf(s, c);
      score += fx ? kindValue(fx, world) - 1 : 5;
    } else {
      score += kindValue(k, world);
    }

    // in der Welt bleiben, von der man viele Karten hält
    score += (perWorld[world] - (c.w === world ? 1 : 0)) * 0.9;
    // Strömung: gleiche Zahl auf der Hand = Kette
    if (k === 'n' && world === 1 && hand.some((x) => x !== c && x.k === 'n' && x.n === c.n)) score += 6;

    // löst die Karte ein Weltereignis aus? (Karten, die immer passen, laden nicht — den Zünder bewertet kindValue)
    if (c.w >= 0 && s.charges[c.w] + chargeOf(c) >= RULES.CHARGE_MAX && mine > 1) score += eventValue(s, seat, c.w, mine - 1, count);

    if (score > bestScore) {
      bestScore = score;
      best = { card: c, world, target };
    }
  }

  // Nur schlechte Züge: lieber ziehen bzw. weitergeben
  if (bestScore < 0) return idle;
  return withChoice(s, seat, best.card, best.world, best.target);
}
