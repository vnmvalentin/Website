// Rauchtest: baut die Welt eines Levels und lässt sie eine Weile mit einer festen Eingabefolge laufen.
// Er beweist nicht, dass das Level schaffbar ist (das tut allein der Verifizierungslauf des Erstellers),
// sondern dass die Engine damit nicht abstürzt und keine NaN-Werte entstehen — bevor der Server dafür
// Rechenzeit in einem Worker hergibt.

import { createLevelWorld } from '../sim/levelWorld.js';
import { stepWorld } from '../sim/world.js';
import { INPUT } from '../sim/inputBits.js';

// Eine feste Folge, die alle Bewegungsarten berührt: laufen, springen, dashen, zurück, fallen lassen
const SEQUENCE = [
  [INPUT.RIGHT, 90],
  [INPUT.RIGHT | INPUT.JUMP, 30],
  [INPUT.RIGHT | INPUT.DASH, 20],
  [INPUT.LEFT | INPUT.JUMP, 40],
  [INPUT.LEFT, 60],
  [INPUT.UP | INPUT.GRAPPLE, 30],
  [0, 40],
  [INPUT.DOWN | INPUT.RIGHT, 40],
];
const CYCLE = SEQUENCE.reduce((sum, [, n]) => sum + n, 0);

function inputAt(tick) {
  let t = tick % CYCLE;
  for (const [mask, n] of SEQUENCE) {
    if (t < n) return mask;
    t -= n;
  }
  return 0;
}

/**
 * @param {object} level  Engine-Level (docToLevel)
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function smokeTest(level, { ticks = 1000 } = {}) {
  let world;
  try {
    world = createLevelWorld(level);
  } catch (e) {
    return { ok: false, error: `Das Level lässt sich nicht aufbauen: ${e.message}` };
  }
  try {
    for (let t = 0; t < ticks; t++) {
      stepWorld(world, inputAt(t));
      const p = world.player;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) {
        return { ok: false, error: `Die Figur hat einen ungültigen Zustand (Tick ${t}).` };
      }
    }
  } catch (e) {
    return { ok: false, error: `Die Simulation ist im Rauchtest abgebrochen: ${e.message}` };
  }
  return { ok: true };
}
