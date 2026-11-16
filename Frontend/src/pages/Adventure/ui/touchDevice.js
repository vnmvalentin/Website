// ui/touchDevice.js — Wird adVentures mit dem Finger gespielt? Dann zeigt RunScreen die Touch-Steuerung
// (hud/TouchControls.jsx). Gleiche Erkennung wie bei Seed Runners (client/touchInput.js): ein Gerät ohne Hover mit
// grobem Zeiger — ein Laptop mit Touchscreen zählt nicht, dort ist die Maus die Hauptsache. Wer dort trotzdem auf
// den Bildschirm tippt, bekommt die Steuerung ab der ersten Berührung (useTouchDevice).
import { useEffect, useState } from "react";

const TOUCH_GERAET = "(hover: none) and (pointer: coarse)";

export function isTouchDevice() {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.(TOUCH_GERAET).matches;
  } catch {
    return false;
  }
}

/** true auf Touch-Geräten und ab der ersten Berührung des Bildschirms; zurück auf false, sobald die Maus wieder benutzt wird */
export function useTouchDevice() {
  const [touch, setTouch] = useState(isTouchDevice);
  useEffect(() => {
    const onPointer = (e) => {
      if (e.pointerType === "touch") setTouch(true);
      else if (e.pointerType === "mouse" && !isTouchDevice()) setTouch(false);
    };
    window.addEventListener("pointerdown", onPointer, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointer);
  }, []);
  return touch;
}
