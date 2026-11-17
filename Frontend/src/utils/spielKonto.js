// utils/spielKonto.js — gemeinsame Konto-Anbindung der Spiele, die im Browser speichern (Spur D, Anschlüsse konto-spiele
// und bestwerte-spiele). Baut auf der Andockstelle utils/kontoSpeicher.js von Spur A auf und ergänzt, was jedes Spiel
// sonst selbst schreiben müsste:
//   - Spielstand am Konto: Abgleich beim Betreten des Spiels und nach einer Anmeldung, danach gebündelt mitspeichern.
//   - Abzeichen und Bestwerte werden aus dem Stand abgeleitet und gemeldet, sobald jemand angemeldet ist — auch für
//     Fortschritt, der schon vor der ersten Anmeldung im Browser lag.
//
//   // <Spiel>/konto.js
//   export const flickKonto = spielKonto("flick-soccer", { lies, schreib, xp, zusammenfuehren, erfolge, bestwerte });
//   // in der Hülle des Spiels (einmal, solange das Spiel offen ist):
//   flickKonto.useAnbindung((stand) => { /* Stand vom Konto übernommen: Anzeige neu lesen */ });
//   // die Speicher-Module der Spiele rufen nach jedem Speichern meldeAenderung("flick-soccer") (utils/spielstand.js)
//
// erfolge(stand) → [IDs aus Backend/konto/erfolge.js], bestwerte(stand) → { id: zahl } (IDs aus Backend/konto/bestwerte.js,
// Zeiten in Millisekunden). Werte ≤ 0 werden nicht gemeldet.
import { useEffect, useRef } from "react";
import { getKontoZustand, subscribeKonto } from "./konto.js";
import { meldeBestwerte, meldeErfolge, verbindeSpielstand } from "./kontoSpeicher.js";
import { beiAenderung } from "./spielstand.js";

const sicher = (fn, ersatz) => {
  try {
    return fn();
  } catch (e) {
    console.error("[spielKonto]", e);
    return ersatz;
  }
};

/**
 * @param {string} spiel  Spiel-ID aus Backend/analytics/spiele.js
 * @param {{ lies: () => any, schreib: (stand: any) => void, xp: (stand: any) => number,
 *           zusammenfuehren?: (konto: any, browser: any) => any,
 *           erfolge?: (stand: any) => string[], bestwerte?: (stand: any) => Record<string, number> }} opt
 */
export function spielKonto(spiel, { lies, schreib, xp, zusammenfuehren, erfolge, bestwerte }) {
  let speicher = null;
  let nutzer = 0;
  let abmelden = [];
  let timer = null;
  const gemeldet = { erfolge: "", bestwerte: "" };
  const uebernahmeHoerer = new Set();

  /** Abzeichen und Bestwerte des aktuellen Browser-Stands melden (nur angemeldet, nur wenn sich etwas geändert hat) */
  function melde() {
    const konto = getKontoZustand().konto;
    if (!konto) return;
    const stand = sicher(lies, null);
    if (!stand) return;
    const ids = [...new Set(sicher(() => erfolge?.(stand), []) || [])].filter((x) => typeof x === "string" && x).sort();
    const k1 = `${konto.id}|${ids.join(",")}`;
    if (ids.length && k1 !== gemeldet.erfolge) {
      gemeldet.erfolge = k1;
      meldeErfolge(spiel, ids).catch(() => { gemeldet.erfolge = ""; });
    }
    const werte = Object.fromEntries(Object.entries(sicher(() => bestwerte?.(stand), {}) || {})
      .map(([id, w]) => [id, Math.round(Number(w))])
      .filter(([, w]) => Number.isFinite(w) && w > 0));
    const k2 = `${konto.id}|${JSON.stringify(werte)}`;
    if (Object.keys(werte).length && k2 !== gemeldet.bestwerte) {
      gemeldet.bestwerte = k2;
      meldeBestwerte(spiel, werte).catch(() => { gemeldet.bestwerte = ""; });
    }
  }

  /** Nach jedem Speichern im Browser: Stand gebündelt ans Konto, Abzeichen/Bestwerte melden */
  function geaendert() {
    if (speicher) {
      const stand = sicher(lies, null);
      if (stand) speicher.gespeichert(stand);
    }
    melde();
  }

  /** Verbindung aufbauen; mehrfach aufrufbar (zählt mit), die Rückgabe baut sie wieder ab */
  function verbinde() {
    if (nutzer++ === 0) {
      const s = verbindeSpielstand(spiel, {
        lies,
        xp,
        zusammenfuehren,
        schreib: (stand) => {
          schreib(stand);
          for (const fn of uebernahmeHoerer) sicher(() => fn(stand));
        },
      });
      speicher = s;
      s.bereit.then(() => { if (speicher === s) melde(); });
      abmelden = [
        beiAenderung(spiel, geaendert),
        // Spätere Anmeldung: den Abgleich erledigt kontoSpeicher, danach Abzeichen/Bestwerte des (neuen) Stands melden
        subscribeKonto(() => {
          clearTimeout(timer);
          timer = setTimeout(melde, 2500);
        }),
      ];
    }
    let offen = true;
    return () => {
      if (!offen) return;
      offen = false;
      if (--nutzer > 0) return;
      clearTimeout(timer);
      abmelden.forEach((fn) => fn());
      abmelden = [];
      speicher?.trennen();
      speicher = null;
    };
  }

  /** React: Verbindung, solange die Komponente steht. beiUebernahme(stand) läuft, wenn der Konto-Stand übernommen wurde. */
  function useAnbindung(beiUebernahme) {
    const ref = useRef(beiUebernahme);
    ref.current = beiUebernahme;
    useEffect(() => {
      const fn = (stand) => ref.current?.(stand);
      uebernahmeHoerer.add(fn);
      const trennen = verbinde();
      return () => {
        uebernahmeHoerer.delete(fn);
        trennen();
      };
    }, []);
  }

  return { spiel, verbinde, useAnbindung, geaendert, melde, jetztSenden: () => speicher?.jetztSenden() };
}
