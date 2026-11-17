// utils/mitteilungen.js — Website als App im Browser: Service Worker (public/sw.js), „App installieren“ und
// Mitteilungen (Web-Push) je Gerät. Server: /api/push (Backend/push/). Themen kommen vom Server (push/themen.js).
//
//   starteApp()                       einmal in main.jsx: Service Worker registrieren, Installations-Angebot merken
//   useInstallation()                 { kann, installiert, ios } — kann = der Browser bietet die Installation an
//   installieren()                    zeigt das Installations-Fenster des Browsers
//   useMitteilungen()                 Stand für Schalter: { geladen, unterstuetzt, brauchtApp, erlaubnis, themen,
//                                     verfuegbar, setzeThemen(liste), test() }
//
// Auf dem iPhone/iPad gibt es Mitteilungen nur in der installierten Web-App (ab iOS 16.4) — brauchtApp ist dann true.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getLanguage } from "../i18n/language.js";

const SW_URL = "/sw.js";
// Wie in leistungMessung.js: keine App-Teile in OBS, auf Overlays, Steuer-Links, Admin und dem Login-Rücksprung
const AUSGESCHLOSSEN = /(^\/winchallengeoverlay\/)|(\/overlay\/)|(^\/winchallengecontrol(\/|$))|(^\/admin(\/|$))|(^\/auth(\/|$))/i;

const imBrowser = () => typeof window !== "undefined" && typeof navigator !== "undefined";
export const unterstuetzt = () => imBrowser() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const istIos = () => imBrowser() && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
export const istInstalliert = () => imBrowser() && (window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);

// ── Service Worker ───────────────────────────────────────────────────────────────────────────────────────────────

let registrierung = null;
export function registriereServiceWorker() {
  if (!imBrowser() || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!registrierung) {
    registrierung = navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch((e) => {
      console.warn("[app] Service Worker nicht registriert:", e?.message || e);
      registrierung = null;
      return null;
    });
  }
  return registrierung;
}

// ── Installieren ─────────────────────────────────────────────────────────────────────────────────────────────────

let installAngebot = null;
let installStand = { kann: false, installiert: false, ios: false };
const installHoerer = new Set();
function meldeInstallation() {
  installStand = { kann: Boolean(installAngebot), installiert: istInstalliert(), ios: istIos() };
  installHoerer.forEach((fn) => fn());
}

/** Einmal beim Start (main.jsx). Ohne OBS, Overlays und Admin. */
export function starteApp() {
  if (!imBrowser() || window.obsstudio || AUSGESCHLOSSEN.test(window.location.pathname)) return;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Kein Einblendbalken des Browsers — angeboten wird im Profil und im Handy-Menü
    e.preventDefault();
    installAngebot = e;
    meldeInstallation();
  });
  window.addEventListener("appinstalled", () => {
    installAngebot = null;
    meldeInstallation();
  });
  meldeInstallation();
  const los = () => { registriereServiceWorker(); };
  if (document.readyState === "complete") los();
  else window.addEventListener("load", los, { once: true });
}

export function useInstallation() {
  return useSyncExternalStore(
    (fn) => { installHoerer.add(fn); return () => installHoerer.delete(fn); },
    () => installStand,
    () => installStand,
  );
}

/** @returns {Promise<boolean>} true, wenn installiert wurde */
export async function installieren() {
  const e = installAngebot;
  if (!e) return false;
  e.prompt();
  const { outcome } = await e.userChoice;
  installAngebot = null;
  meldeInstallation();
  return outcome === "accepted";
}

// ── Mitteilungen ─────────────────────────────────────────────────────────────────────────────────────────────────

async function api(pfad, { method = "GET", body } = {}) {
  const r = await fetch(`/api/push${pfad}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `HTTP ${r.status}`), { code: d.fehler || "server" });
  return d;
}

let schluessel = null;
const holeSchluessel = () => {
  if (!schluessel) schluessel = api("/schluessel").catch((e) => { schluessel = null; throw e; });
  return schluessel;
};

/** „BEl62…“ (base64url) → Bytes für pushManager.subscribe */
export function base64UrlZuBytes(text) {
  const b64 = (text + "=".repeat((4 - (text.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const roh = atob(b64);
  return Uint8Array.from(roh, (c) => c.charCodeAt(0));
}

const gleicheBytes = (a, b) => {
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
};

async function aktuellesAbo() {
  if (!unterstuetzt()) return null;
  const reg = (await navigator.serviceWorker.getRegistration("/")) || (await registriereServiceWorker());
  return reg ? reg.pushManager.getSubscription() : null;
}

const spracheJetzt = () => (getLanguage() === "en" ? "en" : "de");

/**
 * Themen dieses Geräts setzen. Leere Liste = abbestellen. Fragt beim ersten Mal nach der Erlaubnis.
 * @returns {Promise<string[]>} die gespeicherten Themen
 * @throws Error mit code "gesperrt" (im Browser blockiert), "abgelehnt" (Frage weggeklickt) oder "server"
 */
export async function setzeThemen(themen) {
  if (!themen.length) {
    const sub = await aktuellesAbo();
    if (sub) {
      await api("/abo/abbestellen", { method: "POST", body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return [];
  }
  const erlaubnis = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (erlaubnis !== "granted") throw Object.assign(new Error("keine Erlaubnis"), { code: erlaubnis === "denied" ? "gesperrt" : "abgelehnt" });
  const reg = await registriereServiceWorker();
  if (!reg) throw Object.assign(new Error("kein Service Worker"), { code: "server" });
  await navigator.serviceWorker.ready;
  const { publicKey } = await holeSchluessel();
  const key = base64UrlZuBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Neue Schlüssel am Server (sollte nie passieren): altes Abo gilt nicht mehr
  if (sub?.options?.applicationServerKey && !gleicheBytes(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const d = await api("/abo", { method: "PUT", body: { abo: sub.toJSON(), themen, sprache: spracheJetzt() } });
  return d.themen || [];
}

async function ladeStand() {
  if (!unterstuetzt()) return { themen: [], verfuegbar: [] };
  const [{ themen: verfuegbar }, sub] = await Promise.all([holeSchluessel(), aktuellesAbo()]);
  if (!sub) return { themen: [], verfuegbar };
  const d = await api("/abo/stand", { method: "POST", body: { endpoint: sub.endpoint } });
  return { themen: d.themen || [], verfuegbar, sprache: d.sprache };
}

/** Probe-Mitteilung an dieses Gerät */
export async function sendeTest() {
  const sub = await aktuellesAbo();
  if (!sub) throw Object.assign(new Error("kein Abo"), { code: "kein-abo" });
  return api("/test", { method: "POST", body: { endpoint: sub.endpoint } });
}

// Alle Schalter auf der Seite (Profil, Glocke am Stream) teilen denselben Stand
let stand = { geladen: false, themen: [], verfuegbar: [], erlaubnis: "default" };
const standHoerer = new Set();
function setzeStand(teil) {
  stand = { ...stand, ...teil };
  standHoerer.forEach((fn) => fn());
}
let laden = null;
function ladeEinmal() {
  if (!laden) {
    laden = ladeStand()
      .then((s) => setzeStand({ geladen: true, themen: s.themen, verfuegbar: s.verfuegbar, erlaubnis: Notification.permission }))
      .catch(() => setzeStand({ geladen: true, erlaubnis: unterstuetzt() ? Notification.permission : "default" }));
  }
  return laden;
}

// Einmal je Seitenaufruf (Profil): das vorhandene Abo neu anmelden — hängt so nach einer Anmeldung das Konto und die
// aktuelle Sprache an, und erneuert die Schlüssel, falls der Browser sie gewechselt hat
let aufgefrischt = false;
async function frischeAuf() {
  if (aufgefrischt) return;
  aufgefrischt = true;
  await ladeEinmal();
  if (!stand.themen.length || Notification.permission !== "granted") return;
  try {
    setzeStand({ themen: await setzeThemen(stand.themen) });
  } catch { /* bleibt beim bisherigen Stand */ }
}

/** @param {{ auffrischen?: boolean }} [opt]  auffrischen: das vorhandene Abo einmal neu anmelden (siehe frischeAuf) */
export function useMitteilungen({ auffrischen = false } = {}) {
  const s = useSyncExternalStore(
    (fn) => { standHoerer.add(fn); return () => standHoerer.delete(fn); },
    () => stand,
    () => stand,
  );
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");
  useEffect(() => {
    if (!unterstuetzt()) return;
    if (auffrischen) frischeAuf();
    else ladeEinmal();
  }, [auffrischen]);

  const setze = useCallback(async (themen) => {
    setBusy(true);
    setFehler("");
    try {
      const neu = await setzeThemen(themen);
      setzeStand({ themen: neu, erlaubnis: Notification.permission });
      return true;
    } catch (e) {
      setzeStand({ erlaubnis: unterstuetzt() ? Notification.permission : "default" });
      setFehler(e?.code || "server");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setFehler("");
    try {
      await sendeTest();
      return true;
    } catch (e) {
      setFehler(e?.code || "server");
      return false;
    }
  }, []);

  return {
    ...s,
    geladen: s.geladen || !unterstuetzt(),
    unterstuetzt: unterstuetzt(),
    brauchtApp: istIos() && !istInstalliert(),
    busy,
    fehler,
    setzeThemen: setze,
    test,
  };
}
