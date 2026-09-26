// Eingabe im Browser: Tastatur (über den Latch), Gamepad, Umbelegung.
//
// Die Sim bekommt pro Tick eine Bitmaske (sim/inputBits.js). Was hier passiert, ist nur das
// Einsammeln: Tastatur-Events laufen in den Latch (client/inputLatch.js), das Gamepad wird
// einmal pro Bild gelesen, und sampleTick() faltet beides zu einer Maske.

import { INPUT } from '../sim/inputBits.js';
import { ACTIONS, DEFAULT_BINDINGS, createInputLatch } from './inputLatch.js';

const STORAGE_KEY = 'seedrunners_bindings';
const STICK_DEADZONE = 0.4;

function loadBindings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_BINDINGS);
    // Nur bekannte Aktionen mit Text-Listen übernehmen; fehlende Aktionen bekommen den Standard.
    const out = {};
    for (const action of ACTIONS) {
      const list = raw[action.id];
      out[action.id] = Array.isArray(list) && list.length && list.every((c) => typeof c === 'string')
        ? list
        : DEFAULT_BINDINGS[action.id];
    }
    return out;
  } catch {
    return structuredClone(DEFAULT_BINDINGS);
  }
}

function saveBindings(bindings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch { /* Speicher gesperrt (privates Fenster): Belegung gilt dann nur bis zum Neuladen */ }
}

// Standard-Belegung ("standard"-Mapping der Gamepad API): A springen, X/B Dash,
// Y/Schultertasten Grapple, Back/Select zurück zum Checkpoint. Stick oder Steuerkreuz bewegen.
function readGamepad() {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return 0;
  const pad = Array.from(navigator.getGamepads() || []).find((p) => p && p.connected);
  if (!pad) return 0;
  const btn = (i) => !!pad.buttons[i]?.pressed;
  const ax = pad.axes[0] || 0;
  const ay = pad.axes[1] || 0;
  let mask = 0;
  if (ax < -STICK_DEADZONE || btn(14)) mask |= INPUT.LEFT;
  if (ax > STICK_DEADZONE || btn(15)) mask |= INPUT.RIGHT;
  if (ay < -STICK_DEADZONE || btn(12)) mask |= INPUT.UP;
  if (ay > STICK_DEADZONE || btn(13)) mask |= INPUT.DOWN;
  if (btn(0)) mask |= INPUT.JUMP;
  if (btn(2) || btn(1)) mask |= INPUT.DASH;
  if (btn(3) || btn(5) || btn(7)) mask |= INPUT.GRAPPLE;
  if (btn(8)) mask |= INPUT.RESTART;
  return mask;
}

const isTyping = (el) => !!el && (
  el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
);

export function createInput() {
  let bindings = loadBindings();
  const latch = createInputLatch(bindings);
  let padMask = 0;
  // Wartet auf die nächste Taste, um sie einer Aktion zuzuweisen (siehe rebind())
  let capture = null;
  // Taste, deren keyup noch verschluckt werden muss (siehe onKeyDown): Wird die Leertaste
  // zugewiesen, während der "Ändern"-Button fokussiert ist, würde ihr Loslassen den Button
  // ein zweites Mal "anklicken" und den Umbelege-Modus sofort wieder starten.
  let swallowUp = null;
  let attached = false;

  const onKeyDown = (e) => {
    if (capture) {
      e.preventDefault();
      e.stopPropagation();
      const { actionId, done } = capture;
      capture = null;
      swallowUp = e.code;
      if (e.code !== 'Escape') {
        // Die Taste gehört danach nur noch dieser Aktion — sonst liefe z.B. Space plötzlich
        // gleichzeitig als Sprung und als Dash. Verliert dabei eine andere Aktion ihre EINZIGE
        // Taste, bekommt sie die bisherige der umbelegten Aktion (Tausch): Eine Aktion ohne
        // Taste würde das Spiel unbedienbar machen.
        const freed = bindings[actionId][0];
        const next = {};
        for (const a of ACTIONS) {
          const kept = bindings[a.id].filter((c) => c !== e.code);
          next[a.id] = kept.length === 0 && freed ? [freed] : kept;
        }
        next[actionId] = [e.code];
        bindings = next;
        latch.setBindings(bindings);
        saveBindings(bindings);
      }
      done?.(bindings);
      return;
    }
    if (e.repeat || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    // Nur belegte Tasten abfangen: Space/Pfeile würden sonst die Seite scrollen
    if (latch.keyDown(e.code)) e.preventDefault();
  };

  const onKeyUp = (e) => {
    if (swallowUp === e.code) {
      swallowUp = null;
      e.preventDefault();
      return;
    }
    if (latch.keyUp(e.code) && !isTyping(e.target)) e.preventDefault();
  };

  const releaseAll = () => latch.releaseAll();

  return {
    attach() {
      if (attached) return;
      attached = true;
      // Capture-Phase, damit die Umbelegung die Taste vor anderen Handlern bekommt
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp, true);
      window.addEventListener('blur', releaseAll);
      document.addEventListener('visibilitychange', releaseAll);
    },
    detach() {
      if (!attached) return;
      attached = false;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', releaseAll);
      latch.releaseAll();
    },
    /** Einmal pro Bild: das Gamepad wird nur pro Bild aktualisiert, nicht pro Tick. */
    beginFrame() {
      padMask = readGamepad();
    },
    /** Einmal pro Sim-Tick. */
    sampleTick() {
      return latch.sample(padMask);
    },
    getBindings() {
      return bindings;
    },
    /** Nächste gedrückte Taste wird `actionId` zugewiesen; Escape bricht ab. */
    rebind(actionId, done) {
      capture = { actionId, done };
    },
    cancelRebind() {
      capture = null;
    },
    resetBindings() {
      bindings = structuredClone(DEFAULT_BINDINGS);
      latch.setBindings(bindings);
      saveBindings(bindings);
      return bindings;
    },
  };
}

/** "KeyA" → "A", "ArrowLeft" → "←" — für die Steuerungsanzeige. */
export function keyLabel(code) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const named = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Space: 'Leertaste', ShiftLeft: 'Shift', ShiftRight: 'Shift (rechts)',
    ControlLeft: 'Strg', ControlRight: 'Strg (rechts)', Enter: 'Enter', Tab: 'Tab',
  };
  return named[code] || code;
}
