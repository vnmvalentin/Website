// utils/ladenBesitz.js — welche Laden-Designs (Backend/laden/katalog.js) das angemeldete Konto in einem Spiel besitzt
// (Spur D, Anschluss kosmetik-artikel). Baut auf GET /api/laden/besitz/:spiel auf (Andockstelle utils/laden.js).
//
// Der Besitz wird im Browser zwischengespeichert, damit Spiele beim Start ihre gespeicherten Einstellungen sofort
// prüfen können (z. B. „ist die Pizza-Scheibe noch erlaubt?“), ohne auf das Netz zu warten. Aufgefrischt wird beim
// Öffnen des Spiels, nach jeder An- oder Abmeldung und wenn der Tab wieder in den Vordergrund kommt (nach einem Kauf).
// Nur Aussehen: Wer den Zwischenspeicher fälscht, sieht ein Design, das er nicht gekauft hat — mehr nicht.
//
//   const besitz = useLadenBesitz("flick-soccer");   // Set der Artikel-IDs, z. B. "fs-scheibe-pizza"
//   besitzSofort("flick-soccer").has("fs-scheibe-pizza")   // synchron, aus dem Zwischenspeicher
import { useEffect, useState } from "react";
import { getKontoZustand, subscribeKonto } from "./konto.js";
import { salesVisible } from "../config/legal.js";
import { ladenBesitzSofort } from "./spielstand.js";

const SCHLUESSEL = (spiel) => `laden.besitz.${spiel}`;
const hoerer = new Set();

/** Der Laden ist für Besucher sichtbar (Betreiber-Angaben vollständig) — sonst zeigen Spiele keine Hinweise darauf */
export const ladenSichtbar = () => {
  try {
    return salesVisible();
  } catch {
    return false;
  }
};

/** Besitz aus dem Zwischenspeicher (synchron); leer, wenn nichts bekannt ist */
export const besitzSofort = (spiel) => ladenBesitzSofort(spiel);

function merke(spiel, ids) {
  try {
    if (ids.length) localStorage.setItem(SCHLUESSEL(spiel), JSON.stringify(ids));
    else localStorage.removeItem(SCHLUESSEL(spiel));
  } catch { /* privates Fenster: gilt nur für diese Sitzung */ }
  for (const fn of hoerer) fn(spiel);
}

/**
 * Besitz vom Server holen und merken. Ohne Anmeldung: leer. Bei einem Netz- oder Serverfehler bleibt der
 * gemerkte Stand stehen (ein kurzer Ausfall soll keine gekauften Designs zurücksetzen).
 * @returns {Promise<Set<string>>}
 */
export async function aktualisiereBesitz(spiel) {
  const { geladen, konto } = getKontoZustand();
  if (!geladen) return besitzSofort(spiel);
  if (!konto) {
    merke(spiel, []);
    return new Set();
  }
  try {
    const r = await fetch(`/api/laden/besitz/${encodeURIComponent(spiel)}`, { credentials: "include" });
    if (!r.ok) return besitzSofort(spiel);
    const d = await r.json();
    const ids = Array.isArray(d?.artikel) ? d.artikel.filter((x) => typeof x === "string") : [];
    merke(spiel, ids);
    return new Set(ids);
  } catch {
    return besitzSofort(spiel);
  }
}

/** React: Besitz in einem Spiel, frisch gehalten (Konto-Wechsel, Rückkehr in den Tab). */
export function useLadenBesitz(spiel) {
  const [besitz, setBesitz] = useState(() => besitzSofort(spiel));
  useEffect(() => {
    let aktiv = true;
    const lade = () => { aktualisiereBesitz(spiel).then((s) => { if (aktiv) setBesitz(s); }); };
    const geaendert = (s) => { if (s === spiel && aktiv) setBesitz(besitzSofort(spiel)); };
    const sichtbar = () => { if (document.visibilityState === "visible") lade(); };
    hoerer.add(geaendert);
    let kontoVorher = getKontoZustand().konto?.id ?? null;
    let geladenVorher = getKontoZustand().geladen;
    const abmelden = subscribeKonto(() => {
      const { konto, geladen } = getKontoZustand();
      const id = konto?.id ?? null;
      if (id !== kontoVorher || geladen !== geladenVorher) {
        kontoVorher = id;
        geladenVorher = geladen;
        lade();
      }
    });
    document.addEventListener("visibilitychange", sichtbar);
    lade();
    return () => {
      aktiv = false;
      hoerer.delete(geaendert);
      abmelden();
      document.removeEventListener("visibilitychange", sichtbar);
    };
  }, [spiel]);
  return besitz;
}
