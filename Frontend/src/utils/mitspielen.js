// utils/mitspielen.js — Stand von „Jetzt mitspielen“ (GET /api/mitspielen, Backend/mitspielen/) für Startseite,
// Seite /mitspielen und alle anderen Stellen: ein gemeinsamer Stand, alle 45 s bei sichtbarem Tab aufgefrischt,
// solange ihn eine Seite braucht, und gleich nach jeder Anmeldung (dann kommt „ich“ dazu).
import { useEffect, useSyncExternalStore } from "react";
import { subscribeKonto, getKontoZustand } from "./konto.js";

const TAKT_MS = 45 * 1000;
let stand = { geladen: false, aktiv: false };
const hoerer = new Set();
const melde = () => hoerer.forEach((fn) => fn());
let timer = null;
let laeuft = null;
let kontoId;

export function ladeMitspielen() {
  if (laeuft) return laeuft;
  laeuft = fetch("/api/mitspielen", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d) { stand = { geladen: true, ...d }; melde(); } })
    .catch(() => { /* beim nächsten Takt */ })
    .finally(() => { laeuft = null; });
  return laeuft;
}

function abonniere(fn) {
  hoerer.add(fn);
  if (hoerer.size === 1) {
    ladeMitspielen();
    timer = setInterval(() => { if (document.visibilityState === "visible") ladeMitspielen(); }, TAKT_MS);
  }
  return () => {
    hoerer.delete(fn);
    if (!hoerer.size) { clearInterval(timer); timer = null; }
  };
}

// Nach einer Anmeldung oder Abmeldung neu laden (Platz in der Warteschlange gehört zum Konto)
if (typeof window !== "undefined") {
  subscribeKonto(() => {
    const id = getKontoZustand().konto?.id || null;
    if (id !== kontoId) {
      kontoId = id;
      if (hoerer.size) ladeMitspielen();
    }
  });
}

/** { geladen, aktiv, spiel, spielName, notiz, modus, url, seit, live, schlange, ich } */
export function useMitspielen() {
  const s = useSyncExternalStore(abonniere, () => stand, () => stand);
  useEffect(() => {
    const zurueck = () => { if (document.visibilityState === "visible") ladeMitspielen(); };
    document.addEventListener("visibilitychange", zurueck);
    return () => document.removeEventListener("visibilitychange", zurueck);
  }, []);
  return s;
}

async function post(pfad) {
  const r = await fetch(`/api/mitspielen/${pfad}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  await ladeMitspielen();
}
export const stelleAn = () => post("anstellen");
export const verlasse = () => post("verlassen");
