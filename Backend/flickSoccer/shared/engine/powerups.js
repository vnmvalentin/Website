// engine/powerups.js — Karten des Chaos-Modus. Jedes Team hält drei Karten auf der Hand und darf pro Zug eine davon
// ausspielen (oder keine): Sie wirkt auf genau diesen Schuss. Eine gespielte Karte wird sofort aus dem eigenen Stapel
// ersetzt.
//
// FAIR: Jedes Team zieht aus einem eigenen gemischten Stapel, in dem jede Karte genau einmal steckt — nach zwölf
// gezogenen Karten hat es jede einmal gesehen, nur die Reihenfolge ist zufällig (aus dem Seed des Spiels). Dann wird
// neu gemischt. Nur Ganzzahl-Arithmetik → auf jeder Maschine dieselbe Folge.
//
// Die Schlüssel sind IDs im Online-Protokoll: nie umbenennen.

export const POWERUPS = Object.freeze({
  schwer: { name: 'Schwergewicht', hint: 'Deine geschossene Scheibe ist diesen Zug dreimal so schwer' },
  turbo: { name: 'Turbo', hint: 'Dein Schuss ist bis zu 35 % schneller' },
  riese: { name: 'Riese', hint: 'Deine geschossene Scheibe ist diesen Zug deutlich größer' },
  gummi: { name: 'Gummibande', hint: 'Die Banden federn diesen Zug ohne Verlust' },
  eis: { name: 'Eiszeit', hint: 'Die Scheiben des Gegners sind diesen Zug festgefroren' },
  doppel: { name: 'Doppelschuss', hint: 'Du darfst danach gleich noch einmal schießen (ohne Karte)' },
  geist: { name: 'Geisterscheibe', hint: 'Deine Scheibe gleitet durch alle anderen Scheiben hindurch und trifft nur Ball und Bande' },
  bombe: { name: 'Sprengsatz', hint: 'Beim ersten Treffer knallt es: Alles in der Nähe fliegt weg' },
  zwerge: { name: 'Schrumpfstrahl', hint: 'Die Scheiben des Gegners sind diesen Zug winzig' },
  wasserball: { name: 'Wasserball', hint: 'Der Ball ist diesen Zug riesig und federleicht' },
  glatteis: { name: 'Glatteis', hint: 'Alles rutscht diesen Zug mehr als doppelt so weit' },
  schwarm: { name: 'Alle Mann', hint: 'Alle deine Scheiben schießen gleichzeitig in dieselbe Richtung' },
});

export const POWERUP_IDS = Object.freeze(Object.keys(POWERUPS));
export const HAND_SIZE = 3;

export function isPowerup(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(POWERUPS, id);
}

// Wirkung in der Physik (createSim)
export const POWERUP_FX = Object.freeze({
  SCHWER_MASS: 3,
  TURBO_SPEED: 1.35,
  RIESE_RADIUS: 1.4,
  ZWERG_RADIUS: 0.55,
  BALL_RADIUS: 1.6, // Wasserball
  BALL_MASS: 0.55, // Faktor auf die Ballmasse
  GLATTEIS: 0.42, // Faktor auf die Bremsung
  SCHWARM_SPEED: 0.7, // jede Scheibe bekommt diesen Anteil der Schusskraft
  BOMB_RADIUS: 260,
  BOMB_IMPULSE: 1100, // Stoß im Zentrum, fällt bis zum Rand auf null; geteilt durch die Masse
});

// mulberry32: kleiner Ganzzahl-Zufall, bitgleich auf jeder Maschine
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

function shuffled(next) {
  const order = POWERUP_IDS.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

// Stapel des zuletzt gefragten Seeds — die Hand wird bei jedem Neuzeichnen gelesen
let cache = { seed: -1, decks: [[], []] };

/** Die `index`-te Karte (0, 1, 2 …), die `team` im Spiel mit `seed` zieht. */
export function cardAt(seed, team, index) {
  const n = POWERUP_IDS.length;
  const s = seed >>> 0;
  const t = team === 1 ? 1 : 0;
  if (cache.seed !== s) cache = { seed: s, decks: [[], []] };
  const round = Math.floor(index / n);
  const decks = cache.decks[t];
  while (decks.length <= round) decks.push(shuffled(seededRng(s + Math.imul(decks.length * 2 + t + 1, 0x9e3779b1))));
  return decks[round][index % n];
}

/** Starthand eines Teams: { hand: [3 Karten], drawn: Zahl der bisher gezogenen Karten }. */
export function dealHand(seed, team) {
  const hand = [];
  for (let i = 0; i < HAND_SIZE; i++) hand.push(cardAt(seed, team, i));
  return { hand, drawn: HAND_SIZE };
}

/**
 * Gespielte Karte ersetzen: Die neue Karte kommt auf denselben Platz. Karten, die schon auf der Hand liegen (auch die
 * gerade gespielte), werden übersprungen — so hält man nie zwei gleiche und bekommt nicht sofort dieselbe zurück.
 */
export function replaceCard(seed, team, hand, drawn, used) {
  const slot = hand.indexOf(used);
  if (slot < 0) return { hand, drawn };
  let next = drawn;
  let card = cardAt(seed, team, next++);
  for (let tries = 0; tries < POWERUP_IDS.length && hand.includes(card); tries++) card = cardAt(seed, team, next++);
  const out = hand.slice();
  out[slot] = card;
  return { hand: out, drawn: next };
}
