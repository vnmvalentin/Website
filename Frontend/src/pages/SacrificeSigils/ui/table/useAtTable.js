// ui/table/useAtTable.js — Läuft diese Seite am Tisch im Kerzenlicht oder auf dem bisherigen, flachen Weg?
// Gleiche Regel für Hauptmenü, Lobby und Buch: Standard ist der Tisch, außer der bisherige ist gewählt („Bisheriger
// Tisch“), der Browser rendert ohne Grafikkarte (Sparmodus), das Fenster steht hochkant oder der Tisch ließ sich nicht
// darstellen (kein WebGL — dann ruft TableHost onFallback).
//
// Hochkant bleibt bewusst der flache Tisch (Entscheidung 16.11.2026, Phase 7): der Tisch ist für die Querlage gebaut.
// Dreht man das Gerät, wechselt die Ansicht sofort — auch mitten in einer Partie.
import { useState, useSyncExternalStore } from "react";
import { useNewTable } from "../prefs.js";

/** Ab diesem Seitenverhältnis (Breite : Höhe) steht der Tisch. */
const WIDE = 1.2;
const measure = () => typeof window === "undefined" || window.innerWidth >= window.innerHeight * WIDE;
let wide = measure();
const listeners = new Set();

/** Tippt jemand gerade? Dann nicht umschalten: eine Bildschirmtastatur kann das Fenster kurz flach machen. */
const typing = () => {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

function onResize() {
  if (typing()) return;
  const next = measure();
  if (next === wide) return;
  wide = next;
  listeners.forEach((fn) => fn());
}

const onFocusOut = () => setTimeout(onResize, 0);

function subscribe(fn) {
  if (listeners.size === 0) {
    // Ohne Zuhörer wurde nicht gemessen: frisch messen (React vergleicht den Stand nach dem Anmelden noch einmal)
    if (!typing()) wide = measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    // Nach dem Tippen nachholen, was während der Eingabe liegen blieb
    window.addEventListener("focusout", onFocusOut);
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("focusout", onFocusOut);
    }
  };
}

/** Ist das Fenster breit genug für den Tisch (quer)? Folgt dem Drehen des Geräts. */
export function useWideEnough() {
  return useSyncExternalStore(subscribe, () => wide, () => true);
}

/** @returns {[boolean, () => void]} [am Tisch?, Ausweichen (für onFallback)] */
export function useAtTable() {
  const newTable = useNewTable();
  const [failed, setFailed] = useState(false);
  const wideEnough = useWideEnough();
  return [newTable && wideEnough && !failed, () => setFailed(true)];
}
