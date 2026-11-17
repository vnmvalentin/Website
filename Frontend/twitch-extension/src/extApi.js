// extApi.js — Datenquelle der Win-Tracker-Karte in der Twitch-Erweiterung. Ersetzt beim Bauen das Modul
// src/pages/ClashRoyale/WinTracker/winTrackerApi.js (vite.config.js): Die Karte ruft wie im OBS getOverlayData() auf,
// bekommt die Zahlen aber vom Server der Erweiterung (Backend/twitchExtension, Anmeldung per Twitch-Token) statt über
// den geheimen Overlay-Schlüssel des Streamers.
//
// Die Karte fragt alle 8 s (für OBS gedacht). Unter dem Stream reicht alle 30 s: Zwischen zwei echten Abrufen bekommt
// sie dieselbe Antwort, solange das Panel nicht sichtbar ist gar keine neue. Der Server hält je Kanal 15 s vor.
import { waitForAuth, isVisible, viewerLang } from "./twitch.js";

/** Adresse des Servers: im Paket für Twitch die Website, im Prüfstand leer (gleiche Herkunft über den Vite-Proxy). */
// import.meta.env?.: Tests laden die Datei ohne Vite
export const API_BASE = String(import.meta.env?.VITE_TWITCH_EXT_API ?? "https://vnmvalentin.de").replace(/\/+$/, "");
const MIN_INTERVAL_MS = 30 * 1000;

// Zustand fürs Panel drumherum: lädt | ok | kein Win Tracker | kein Account | Störung
let status = { phase: "loading" };
const listeners = new Set();
function setStatus(next) {
  if (next.phase === status.phase) return;
  status = next;
  listeners.forEach((fn) => fn(status));
}
export const getStatus = () => status;
export function subscribeStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function call(pathname) {
  const auth = await waitForAuth();
  const res = await fetch(`${API_BASE}/api/twitch-ext${pathname}`, { headers: { Authorization: `Bearer ${auth.token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, code: data.code });
  return data;
}

let last = null; // { at, promise }

/**
 * Für die Karte (Signatur wie winTrackerApi.getOverlayData). Der Schlüssel spielt keine Rolle: der Kanal steht im Token.
 * Sprache der Karte = Sprache des Zuschauers (nicht die des OBS-Overlays).
 */
export function getOverlayData() {
  const now = Date.now();
  if (last && (now - last.at < MIN_INTERVAL_MS || !isVisible())) return last.promise;
  const promise = call("/panel").then((data) => {
    const state = data.state || { hasAccount: false };
    setStatus({ phase: !data.tracker ? "no_tracker" : state.hasAccount ? "ok" : "no_account" });
    if (state.hasAccount) state.settings = { ...state.settings, language: viewerLang() };
    return state;
  });
  last = { at: now, promise };
  promise.catch(() => {
    // Beim nächsten Takt neu versuchen, die letzte gute Karte bleibt stehen
    if (last && last.promise === promise) last = null;
    if (status.phase === "loading") setStatus({ phase: "error" });
  });
  return promise;
}

/** Einstellungsseite: ist für diesen Kanal ein Win Tracker eingerichtet? */
export const getChannelStatus = () => call("/status");
