// twitch.js — Anbindung an Twitchs Erweiterungs-Helfer (window.Twitch.ext, geladen per <script> in panel.html und
// config.html). Token, Farbschema und Sichtbarkeit kommen von dort; die Sprache des Zuschauers hängt Twitch als
// ?language=… an die Adresse der Erweiterung.

const ext = () => (typeof window !== "undefined" ? window.Twitch?.ext : undefined);

let auth = null;
const authWaiters = [];
let context = { theme: "dark" };
const contextListeners = new Set();
let visible = true;

/** Einmal beim Start: meldet sich bei Twitch an. false, wenn der Helfer fehlt (Seite außerhalb von Twitch geöffnet). */
export function initTwitch() {
  const e = ext();
  if (!e) return false;
  e.onAuthorized((a) => {
    auth = a;
    authWaiters.splice(0).forEach((resolve) => resolve(a));
  });
  e.onContext?.((ctx) => {
    context = { ...context, ...ctx };
    contextListeners.forEach((fn) => fn(context));
  });
  e.onVisibilityChanged?.((isVisible) => { visible = !!isVisible; });
  return true;
}

/** Das Token von Twitch — wartet, bis onAuthorized es geliefert hat (Twitch erneuert es von selbst). */
export const waitForAuth = () => (auth ? Promise.resolve(auth) : new Promise((resolve) => authWaiters.push(resolve)));
export const currentAuth = () => auth;
export const isVisible = () => visible;

export function onContext(fn) {
  contextListeners.add(fn);
  fn(context);
  return () => contextListeners.delete(fn);
}

/** Sprache des Zuschauers: Deutsch für deutsche Twitch-Oberfläche, sonst Englisch. */
export function viewerLang() {
  let q = "";
  try { q = new URLSearchParams(window.location.search).get("language") || ""; } catch { /* keine Adresse */ }
  return /^de/i.test(q || (typeof navigator !== "undefined" ? navigator.language : "")) ? "de" : "en";
}
