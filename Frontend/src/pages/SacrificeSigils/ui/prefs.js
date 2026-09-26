// ui/prefs.js — Anzeige-Einstellungen (Animationen reduzieren, Tempo, gesehene Tipps), per Betrachter in localStorage.
import { useSyncExternalStore } from "react";

const KEY = "ss_prefs_v1";
const systemReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const DEFAULTS = { reduceMotion: !!systemReduced, speed: 1, tipsOff: false, seenTips: /** @type {string[]} */ ([]), name: "" };

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
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
