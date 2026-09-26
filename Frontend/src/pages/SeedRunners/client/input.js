// Eingabe im Browser: Tastatur und Maus (über den Latch), Gamepad, Umbelegung.
//
// Maustasten (26.09.2026) sind für den Latch einfach weitere "Tasten": Mouse0 links, Mouse1 Mitte, Mouse2 rechts, Mouse3/Mouse4
// die Seitentasten (MouseEvent.button). Klicks auf Bedienelemente (Knöpfe, Felder, Links) zählen nie als Spieleingabe. Ist eine
// Maustaste belegt, unterdrückt die Eingabe, was der Browser sonst damit täte: Kontextmenü (rechts), Auto-Scroll (Mitte),
// Zurück/Vor (Seitentasten) — solange das Rennen läuft (attach) und nur für belegte Tasten.
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

// Eine Belegung gilt SOFORT überall: Jede angeschlossene Eingabe (laufendes Rennen, Übungsbereich, Fenster „Steuerung“) lädt
// sie neu, sobald sie irgendwo geändert wird — auch in einem anderen Tab (storage-Ereignis). Vorher las ein Rennen die
// Belegung nur beim Anlegen: Im Tagesrennen (die Rennansicht bleibt zwischen den Versuchen stehen) galt eine Umbelegung erst
// nach dem Neuladen der Seite, in einer Lobby erst ab der nächsten Runde (Rückmeldung 26.09.2026).
const GEAENDERT = 'seedrunners:bindings';

function saveBindings(bindings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch { /* Speicher gesperrt (privates Fenster): Belegung gilt dann nur bis zum Neuladen */ }
  try {
    window.dispatchEvent(new CustomEvent(GEAENDERT, { detail: bindings }));
  } catch { /* kein window (Tests ohne DOM) */ }
}

// Wartet gerade eine Eingabe auf die neue Taste, ignorieren alle ANDEREN Eingaben die Tasten und Klicks: Sonst sprang die
// Figur im laufenden Rennen, während man im Fenster „Steuerung“ die neue Sprungtaste drückte.
let umbelegendeEingabe = null;

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

/** "Mouse0" … "Mouse4" zu MouseEvent.button */
export const mouseCode = (button) => `Mouse${button}`;
export const isMouseCode = (code) => /^Mouse[0-4]$/.test(code);
// Ein Klick auf ein Bedienelement ist Bedienung, keine Spieleingabe (und wird beim Umbelegen nicht als Taste genommen)
const BEDIENELEMENT = 'button, a, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="radio"], [contenteditable="true"]';
const isControl = (el) => !!(el && el.closest && el.closest(BEDIENELEMENT));

export function createInput() {
  const self = {};
  const fremdeUmbelegung = () => umbelegendeEingabe !== null && umbelegendeEingabe !== self;
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
    if (fremdeUmbelegung()) return;
    if (capture) {
      e.preventDefault();
      e.stopPropagation();
      const { actionId, done } = capture;
      capture = null;
      if (umbelegendeEingabe === self) umbelegendeEingabe = null;
      swallowUp = e.code;
      if (e.code !== 'Escape') {
        // Die Taste gehört danach nur noch dieser Aktion — sonst liefe z.B. Space plötzlich
        // gleichzeitig als Sprung und als Dash. Ersetzt werden nur die Tasten DESSELBEN Geräts:
        // Eine Maustaste kommt zu den Tastaturtasten dazu (Springen = Leertaste UND Maus links),
        // eine Taste ersetzt die Tastaturtasten, lässt aber die Maustaste stehen.
        // Verliert dabei eine andere Aktion ihre EINZIGE Taste, bekommt sie die ersetzte der
        // umbelegten Aktion (Tausch) oder, wenn nichts ersetzt wurde, ihre Standardbelegung:
        // Eine Aktion ohne Taste würde das Spiel unbedienbar machen.
        const maus = isMouseCode(e.code);
        const eigene = [...bindings[actionId].filter((c) => c !== e.code && isMouseCode(c) !== maus), e.code];
        const freed = bindings[actionId].find((c) => !eigene.includes(c));
        const next = {};
        for (const a of ACTIONS) {
          const kept = bindings[a.id].filter((c) => c !== e.code);
          next[a.id] = kept.length ? kept : freed ? [freed] : DEFAULT_BINDINGS[a.id].filter((c) => c !== e.code);
        }
        next[actionId] = eigene;
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

  // Maus: dieselben Wege wie die Tastatur, mit dem Code "Mouse<n>"
  const onMouseDown = (e) => {
    if (fremdeUmbelegung() || e.button < 0 || e.button > 4 || isControl(e.target)) return;
    const code = mouseCode(e.button);
    if (capture) {
      e.preventDefault();
      e.stopPropagation();
      onKeyDown({ code, preventDefault() {}, stopPropagation() {}, repeat: false, target: e.target });
      return;
    }
    if (latch.keyDown(code)) e.preventDefault();          // z. B. Auto-Scroll der mittleren Taste
  };

  const onMouseUp = (e) => {
    if (e.button < 0 || e.button > 4) return;
    const code = mouseCode(e.button);
    if (swallowUp === code) {
      swallowUp = null;
      e.preventDefault();
      return;
    }
    // (auch über einem Bedienelement loslassen: sonst hinge die Taste)
    if (latch.keyUp(code)) e.preventDefault();             // Seitentasten: kein Zurück/Vor im Browser
  };

  const isBound = (code) => Object.values(bindings).some((list) => list.includes(code));
  const onContextMenu = (e) => { if (!isControl(e.target) && (capture || isBound('Mouse2'))) e.preventDefault(); };
  const onAuxClick = (e) => { if ((e.button === 3 || e.button === 4) && (capture || isBound(mouseCode(e.button)))) e.preventDefault(); };

  // Irgendwo wurde umbelegt (hier, in einer anderen Eingabe oder in einem anderen Tab): neu laden. Gehaltene Tasten
  // loslassen — eine Taste, die eben ihre Aktion gewechselt hat, darf nicht mit der alten weiterlaufen.
  const onGeaendert = () => {
    bindings = loadBindings();
    latch.setBindings(bindings);
    latch.releaseAll();
  };
  const onStorage = (e) => { if (e.key === STORAGE_KEY) onGeaendert(); };

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
      window.addEventListener('mousedown', onMouseDown, true);
      window.addEventListener('mouseup', onMouseUp, true);
      window.addEventListener('contextmenu', onContextMenu, true);
      window.addEventListener('auxclick', onAuxClick, true);
      window.addEventListener(GEAENDERT, onGeaendert);
      window.addEventListener('storage', onStorage);
      // (seit dem Anlegen kann sich die Belegung geändert haben)
      onGeaendert();
      window.addEventListener('blur', releaseAll);
      document.addEventListener('visibilitychange', releaseAll);
    },
    detach() {
      if (!attached) return;
      attached = false;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('auxclick', onAuxClick, true);
      window.removeEventListener(GEAENDERT, onGeaendert);
      window.removeEventListener('storage', onStorage);
      if (umbelegendeEingabe === self) umbelegendeEingabe = null;
      capture = null;
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
    /** Nächste gedrückte Taste oder Maustaste (nicht auf einem Bedienelement) wird `actionId` zugewiesen; Escape bricht ab. */
    rebind(actionId, done) {
      capture = { actionId, done };
      umbelegendeEingabe = self;
    },
    cancelRebind() {
      capture = null;
      if (umbelegendeEingabe === self) umbelegendeEingabe = null;
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
    Mouse0: 'Maus links', Mouse1: 'Maus Mitte', Mouse2: 'Maus rechts', Mouse3: 'Maus 4', Mouse4: 'Maus 5',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Space: 'Leertaste', ShiftLeft: 'Shift', ShiftRight: 'Shift (rechts)',
    ControlLeft: 'Strg', ControlRight: 'Strg (rechts)', Enter: 'Enter', Tab: 'Tab',
  };
  return named[code] || code;
}
