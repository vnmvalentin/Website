// Touch-Eingabe (Handy/Tablet): die Knöpfe auf dem Bildschirm (client/TouchControls.jsx) als weitere Quelle der Eingabemaske.
//
// Wie das Gamepad läuft sie an der Tastenbelegung vorbei: Jede Quelle (Steuerkreuz, ein Knopf) meldet die Bits, die sie gerade
// hält; createInput() (client/input.js) mischt sie pro Tick dazu. Ein kurzer Tipp zwischen zwei Sim-Ticks geht nicht verloren —
// neu gedrückte Bits bleiben wie im Tastatur-Latch (client/inputLatch.js) bis zum nächsten Abtasten stehen.
//
// Ohne DOM (deshalb in Node testbar); die Geräte-Erkennung unten fragt window nur ab, wenn es eines gibt.

import { INPUT } from '../sim/inputBits.js';

const quellen = new Map();
let getippt = 0;

/** `quelle` (beliebiger Schlüssel) hält ab jetzt genau die Bits `mask`; 0 lässt los. */
export function setTouch(quelle, mask) {
  const vorher = quellen.get(quelle) || 0;
  getippt |= mask & ~vorher;
  if (mask) quellen.set(quelle, mask);
  else quellen.delete(quelle);
}

/** Alles loslassen (Steuerung verschwindet, Tab gewechselt): sonst liefe die Figur mit "hängendem" Finger weiter. */
export function releaseTouch() {
  quellen.clear();
  getippt = 0;
}

/** Einmal pro Tick: gehaltene Bits und alles, was seit dem letzten Abtasten angetippt wurde. */
export function sampleTouch() {
  let mask = getippt;
  for (const m of quellen.values()) mask |= m;
  getippt = 0;
  return mask;
}

// Steuerkreuz: Winkel des Fingers zur Waagerechten. Bis 32° nur seitwärts, ab 65° nur hoch/runter, dazwischen diagonal —
// seitwärts bekommt bewusst den größten Bereich: Ein beim Laufen verrutschter Daumen soll nicht „Runter“ (schneller fallen) drücken.
const TAN_NUR_SEITWAERTS = 0.625;   // tan 32°
const TAN_NUR_SENKRECHT = 2.145;    // tan 65°

/** Fingerposition relativ zur Mitte des Steuerkreuzes (dx, dy in Pixeln) → Richtungsbits; innerhalb der Totzone nichts. */
export function padRichtung(dx, dy, totzone) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax * ax + ay * ay < totzone * totzone) return 0;
  let mask = 0;
  if (ay < ax * TAN_NUR_SENKRECHT) mask |= dx < 0 ? INPUT.LEFT : INPUT.RIGHT;
  if (ay > ax * TAN_NUR_SEITWAERTS) mask |= dy < 0 ? INPUT.UP : INPUT.DOWN;
  return mask;
}

const TOUCH_GERAET ='(hover: none) and (pointer: coarse)';

/** Wird das Gerät vor allem mit dem Finger bedient? (Ein Laptop mit Touchscreen zählt nicht: Maus/Trackpad ist dort die Hauptsache.) */
export function istTouchGeraet() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.(TOUCH_GERAET).matches;
  } catch {
    return false;
  }
}

/** Meldet Wechsel (Tablet mit an-/abgesteckter Tastatur); gibt die Abmeldung zurück. */
export function onTouchGeraet(handler) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(TOUCH_GERAET);
  const onChange = () => handler(mq.matches);
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}
