// Tastatur → Eingabemaske der Sim, ohne DOM (deshalb in Node testbar).
//
// Das Problem, das hier gelöst wird: Die Sim liest pro TICK, der Browser liefert Tasten-Events
// pro EVENT. Drückt und löst jemand die Sprungtaste zwischen zwei Sim-Ticks (auf 60 Hz liegen
// ~8 ms dazwischen, ein schneller Tipp dauert 30–60 ms, aber Tastaturen prellen und der Tab
// kann kurz hängen), wäre die Taste beim Abtasten schon wieder oben — der Sprung ginge
// verloren. Deshalb merkt sich der Latch jedes Drücken bis zum nächsten sample() und liefert
// es dort mindestens einmal als "gedrückt" aus.

import { INPUT } from '../sim/inputBits.js';

// Reihenfolge = Reihenfolge in der Steuerungsanzeige
export const ACTIONS = [
  { id: 'left', bit: INPUT.LEFT, label: 'Links' },
  { id: 'right', bit: INPUT.RIGHT, label: 'Rechts' },
  { id: 'up', bit: INPUT.UP, label: 'Hoch (zielen)' },
  { id: 'down', bit: INPUT.DOWN, label: 'Runter (zielen)' },
  { id: 'jump', bit: INPUT.JUMP, label: 'Springen' },
  { id: 'dash', bit: INPUT.DASH, label: 'Dash' },
  { id: 'grapple', bit: INPUT.GRAPPLE, label: 'Grapple' },
  { id: 'restart', bit: INPUT.RESTART, label: 'Zum Checkpoint' },
];

// KeyboardEvent.code statt .key: Die Belegung hängt an der Tastenposition, nicht am
// Tastaturlayout — WASD bleibt WASD, auch auf QWERTZ oder AZERTY.
export const DEFAULT_BINDINGS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'KeyK'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyJ'],
  grapple: ['KeyE', 'KeyL'],
  restart: ['KeyR'],
};

function buildCodeMap(bindings) {
  const map = new Map();
  for (const action of ACTIONS) {
    for (const code of bindings[action.id] || []) {
      map.set(code, (map.get(code) || 0) | action.bit);
    }
  }
  return map;
}

export function createInputLatch(bindings = DEFAULT_BINDINGS) {
  let codeMap = buildCodeMap(bindings);
  const down = new Set();
  let tapped = 0;

  return {
    setBindings(next) {
      codeMap = buildCodeMap(next);
    },

    /** true, wenn die Taste belegt ist (der Aufrufer unterdrückt dann das Browser-Standardverhalten) */
    keyDown(code) {
      const bit = codeMap.get(code);
      if (bit === undefined) return false;
      down.add(code);
      tapped |= bit;
      return true;
    },

    keyUp(code) {
      down.delete(code);
      return codeMap.has(code);
    },

    /** Fenster verloren / Tab gewechselt: sonst läuft die Figur mit "hängender" Taste weiter. */
    releaseAll() {
      down.clear();
      tapped = 0;
    },

    /** Einmal pro Tick. `extraMask` sind Eingaben anderer Geräte (Gamepad). */
    sample(extraMask = 0) {
      let held = 0;
      for (const code of down) held |= codeMap.get(code) || 0;
      const mask = held | tapped | extraMask;
      tapped = 0;
      return mask;
    },
  };
}
