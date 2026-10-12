// engine/powerups.js — Power-ups des Chaos-Modus. Jeder Zug bringt dem Team am Zug automatisch eines; es wirkt auf
// genau diesen Schuss (keine Extra-Eingabe).
//
// FAIR: Jedes Team zieht aus einem eigenen gemischten Beutel — je sechs Züge bekommt es jedes Power-up genau einmal,
// nur die Reihenfolge ist zufällig (aus dem Seed des Spiels). Die beiden Beutel sind so gemischt, dass im normalen
// Wechsel Rot–Blau–Rot nie zweimal hintereinander dasselbe Power-up kommt (auch nicht über die Beutelgrenze).
// Nur Ganzzahl-Arithmetik → auf jeder Maschine dieselbe Folge.
//
// Die Schlüssel sind IDs im Online-Protokoll: nie umbenennen.

export const POWERUPS = Object.freeze({
  schwer: { name: 'Schwergewicht', hint: 'Deine geschossene Scheibe ist diesen Zug dreimal so schwer' },
  turbo: { name: 'Turbo', hint: 'Dein Schuss ist bis zu 35 % schneller' },
  riese: { name: 'Riese', hint: 'Deine geschossene Scheibe ist diesen Zug deutlich größer' },
  gummi: { name: 'Gummibande', hint: 'Die Banden federn diesen Zug ohne Verlust' },
  eis: { name: 'Eiszeit', hint: 'Die Scheiben des Gegners sind diesen Zug festgefroren' },
  doppel: { name: 'Doppelschuss', hint: 'Du darfst danach gleich noch einmal schießen (ohne Power-up)' },
});

export const POWERUP_IDS = Object.freeze(Object.keys(POWERUPS));

// Wirkung in der Physik (createSim)
export const POWERUP_FX = Object.freeze({ SCHWER_MASS: 3, TURBO_SPEED: 1.35, RIESE_RADIUS: 1.4 });

// mulberry32: kleiner Ganzzahl-Zufall, bitgleich auf jeder Maschine
function rng(seed) {
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

// Passt `order` hinter die vorigen Beutel (erstes Power-up nicht in `avoidFirst`) und — für Team 1 — neben die Folge
// `other` von Team 0? Team 1 schießt im i-ten Zug zwischen dem i-ten und (i+1)-ten Zug von Team 0; der Zug davor
// zählt mit, falls ein Eigentor die Züge um eins verschoben hat.
function fits(order, avoidFirst, other) {
  if (avoidFirst.includes(order[0])) return false;
  if (!other) return true;
  for (let i = 0; i < order.length; i++) {
    if (order[i] === other[i] || order[i] === other[i + 1] || order[i] === other[i - 1]) return false;
  }
  return true;
}

const MAX_TRIES = 400;

// Die beiden Folgen [Team 0, Team 1] eines Beutels. `prev` = die Folgen des Beutels davor (oder null).
function bagOrders(seed, bag, prev) {
  const n = POWERUP_IDS.length;
  const avoidFirst = prev ? [prev[0][n - 1], prev[1][n - 1]] : [];
  const orders = [];
  for (let team = 0; team < 2; team++) {
    const next = rng((seed >>> 0) + Math.imul(bag * 2 + team + 1, 0x9e3779b1));
    const other = team === 1 ? orders[0] : null;
    let order = shuffled(next);
    for (let tries = 1; tries < MAX_TRIES && !fits(order, avoidFirst, other); tries++) order = shuffled(next);
    if (!fits(order, avoidFirst, other)) {
      // Kein Treffer (praktisch nie): eine Drehung der Folge von Team 0 um 2…n−2 erfüllt die Nachbar-Regeln immer,
      // und unter drei Drehungen ist mindestens eine, deren Anfang nicht gesperrt ist.
      const base = other || order;
      for (let s = 2; s <= n - 2; s++) {
        order = base.map((_, i) => base[(i + s) % n]);
        if (!avoidFirst.includes(order[0])) break;
      }
    }
    orders.push(order);
  }
  return orders;
}

// Beutel des zuletzt gefragten Seeds — powerupAt läuft bei jedem Neuzeichnen
let cache = { seed: -1, bags: [] };

/** Power-up für den `index`-ten Zug (0, 1, 2 …) von `team` im Spiel mit `seed`. */
export function powerupAt(seed, index, team = 0) {
  const n = POWERUP_IDS.length;
  const s = seed >>> 0;
  if (cache.seed !== s) cache = { seed: s, bags: [] };
  const bag = Math.floor(index / n);
  while (cache.bags.length <= bag) {
    const k = cache.bags.length;
    cache.bags.push(bagOrders(s, k, k > 0 ? cache.bags[k - 1] : null));
  }
  return cache.bags[bag][team === 1 ? 1 : 0][index % n];
}
