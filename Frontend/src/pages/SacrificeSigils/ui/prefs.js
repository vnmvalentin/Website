// ui/prefs.js — Anzeige-Einstellungen (Animationen reduzieren, Tempo, gesehene Tipps), per Betrachter in localStorage.
import { useSyncExternalStore } from "react";

const KEY = "ss_prefs_v1";
/** Version der gespeicherten Einstellungen. 2 = Runde 2: „Animationen reduzieren“ standardmäßig aus, Tempo 1/1,5/2. */
const SETTINGS_VERSION = 2;
export const SPEED_OPTIONS = [1, 1.5, 2];
/** Wünscht das Betriebssystem weniger Bewegung? Dann einmalig ein Hinweis – die Animationen bleiben aber an. */
export const systemPrefersReducedMotion = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const DEFAULTS = { v: SETTINGS_VERSION, reduceMotion: false, motionHintSeen: false, speed: 1, tipsOff: false, seenTips: /** @type {string[]} */ ([]), name: "" };

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const stored = JSON.parse(raw);
    const next = { ...DEFAULTS, ...stored };
    if ((stored.v || 1) < SETTINGS_VERSION) {
      // Migration: ein früher (oft automatisch vom System übernommenes) „an“ wird einmalig zurückgesetzt
      next.reduceMotion = false;
      next.v = SETTINGS_VERSION;
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignorieren */ }
    }
    if (!SPEED_OPTIONS.includes(next.speed)) next.speed = 1;
    return next;
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {Partial<typeof DEFAULTS>} patch */
export function setPrefs(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignorieren */ }
  listeners.forEach((fn) => fn());
}

export function getPrefs() {
  return state;
}

/** @returns {typeof DEFAULTS} */
export function usePrefs() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => state,
    () => state,
  );
}

/** Stabiler Token für Reconnect (pro Browser). */
export function playerToken() {
  try {
    let t = localStorage.getItem("ss_token");
    if (!t) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      t = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("ss_token", t);
    }
    return t;
  } catch {
    return `anon${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}
