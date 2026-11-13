// engine/events.js — Ereignisse des Chaos-Modus: Regeln, die für kurze Zeit das GANZE Feld treffen (beide Teams).
// Ablauf in Zügen: zwei ruhige Züge, dann zwei Züge mit einem Ereignis (jedes Team bekommt es einmal ab), dann wieder
// Ruhe — immer so weiter. Welches Ereignis kommt, steht mit dem Seed des Spiels fest; jedes kommt einmal, bevor sich
// eines wiederholt. Mit `always` (Sonderregel eines Tour-Gegners) gibt es keine ruhigen Züge.
//
// Die Schlüssel sind IDs im Online-Protokoll: nie umbenennen.

import { seededRng } from './powerups.js';

export const CHAOS_EVENTS = Object.freeze({
  blitzeis: { name: 'Blitzeis', hint: 'Das Feld ist spiegelglatt — alles rutscht doppelt so weit' },
  bleikugel: { name: 'Bleikugel', hint: 'Der Ball ist bleischwer und kaum von der Stelle zu bekommen' },
  flummi: { name: 'Flummi', hint: 'Der Ball springt von allem ab, ohne Tempo zu verlieren' },
  vollgas: { name: 'Vollgas', hint: 'Jeder Schuss ist deutlich schneller' },
  winzlinge: { name: 'Winzlinge', hint: 'Alle Scheiben sind geschrumpft — viel Platz, wenig Deckung' },
  murmel: { name: 'Murmel', hint: 'Der Ball ist winzig' },
  erdbeben: { name: 'Erdbeben', hint: 'Beim Schuss wackelt das Feld: Alles bekommt einen Stoß in irgendeine Richtung' },
  stromausfall: { name: 'Stromausfall', hint: 'Das Flutlicht ist aus — man sieht nur, was direkt um Scheiben und Ball liegt' },
});

export const EVENT_IDS = Object.freeze(Object.keys(CHAOS_EVENTS));

export function isChaosEvent(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CHAOS_EVENTS, id);
}

// Wirkung in der Physik (createSim)
export const EVENT_FX = Object.freeze({
  BLITZEIS: 0.45, // Faktor auf die Bremsung
  BLEI_MASS: 3.5, // Faktor auf die Ballmasse
  FLUMMI_E: 0.98, // Stoßzahl Ball ↔ Scheibe (an der Bande 1)
  VOLLGAS: 1.3,
  WINZLING_RADIUS: 0.6,
  MURMEL_RADIUS: 0.6,
  BEBEN_SPEED: 320, // größter Stoß je Achse
});

// Züge ohne und mit Ereignis je Runde
export const EVENT_CALM = 2;
export const EVENT_ACTIVE = 2;

let cache = { seed: -1, bags: [] };

/** Das `block`-te Ereignis (0, 1, 2 …) des Spiels mit `seed`. */
export function eventAt(seed, block) {
  const n = EVENT_IDS.length;
  const s = seed >>> 0;
  if (cache.seed !== s) cache = { seed: s, bags: [] };
  const bag = Math.floor(block / n);
  while (cache.bags.length <= bag) {
    const k = cache.bags.length;
    const next = seededRng(s + Math.imul(k + 1, 0x85ebca6b));
    const order = EVENT_IDS.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = next() % (i + 1);
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    // nicht dasselbe Ereignis zweimal hintereinander über die Beutelgrenze
    if (k > 0 && order[0] === cache.bags[k - 1][n - 1]) {
      order[0] = order[1];
      order[1] = cache.bags[k - 1][n - 1];
    }
    cache.bags.push(order);
  }
  return cache.bags[bag][block % n];
}

/** Ereignis im `turn`-ten Zug (0, 1, 2 …) oder null, wenn der Zug ruhig ist. */
export function eventForTurn(seed, turn, always = false) {
  if (always) return eventAt(seed, Math.floor(turn / EVENT_ACTIVE));
  const cycle = EVENT_CALM + EVENT_ACTIVE;
  if (turn % cycle < EVENT_CALM) return null;
  return eventAt(seed, Math.floor(turn / cycle));
}

/** Das nächste Ereignis, das noch nicht läuft: { id, inTurns } (inTurns ≥ 1). */
export function upcomingEvent(seed, turn, always = false) {
  const now = eventForTurn(seed, turn, always);
  for (let k = 1; k <= EVENT_CALM + EVENT_ACTIVE + 1; k++) {
    const id = eventForTurn(seed, turn + k, always);
    if (id && (id !== now || eventForTurn(seed, turn + k - 1, always) !== id)) return { id, inTurns: k };
  }
  return null;
}
