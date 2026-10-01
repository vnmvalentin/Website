// Stabiler Uhrenabgleich Client ↔ Server für Modi, die etwas aus der Server-Zeit hochrechnen
// (Angel Royale: Kartenpositionen; Elixir Rush: Elixier, Ablaufbalken, Countdown).
//
// WARUM: Vorher wurde der Versatz bei JEDER Nachricht neu gesetzt — offset = Empfangszeit −
// serverNow. Darin steckt jedes Mal die gerade aktuelle Netzwerk-Laufzeit, und die schwankt
// (z.B. 30–120 ms). Bei jeder Nachricht sprang dadurch alles, was aus der Server-Zeit
// berechnet wird, um diese Schwankung vor oder zurück — in Angel Royale als ruckelnde Karten
// sichtbar (simuliert: 58 Sprünge in 20 s → 0).
//
// JETZT:
//   • Zielwert = kleinster beobachteter Versatz: die Nachricht mit der geringsten Laufzeit
//     liegt der echten Uhrendifferenz am nächsten. Mit leichtem Aufwärts-Nachgeben je
//     Nachricht, damit eine Uhrkorrektur des Rechners sich nicht für immer festsetzt.
//   • Der benutzte Versatz wandert nur zeitbasiert sanft zum Zielwert (max. SLEW_PER_MS).
//   • Takt aus performance.now() — monoton, springt nicht bei Systemzeit-Korrekturen.
import { useEffect, useRef } from 'react';

const CREEP_MS = 2;        // pro Nachricht darf der Zielwert so weit steigen
const SLEW_PER_MS = 0.09;  // so schnell wandert der benutzte Versatz (≈ 90 ms pro Sekunde)

/** Monotone Wanduhr in Epoch-Millisekunden (vergleichbar mit Date.now()). */
export const clockNow = () => performance.timeOrigin + performance.now();

/**
 * @param {object|null} state  Modus-Zustand mit `serverNow` und `clientReceivedAt`
 *                             (beides setzt useClashSocket bei jeder Nachricht)
 * @returns {{ offset: () => number, serverTime: () => number }}
 *          offset(): geglätteter Versatz (Client − Server) in ms, bei jedem Aufruf nachgeführt
 *          serverTime(): aktuelle Server-Zeit nach diesem Versatz
 */
export function useServerClock(state) {
  const ref = useRef({ target: null, offset: null, lastTick: 0, latest: null });
  ref.current.latest = state;

  useEffect(() => {
    if (!state || typeof state.serverNow !== 'number' || typeof state.clientReceivedAt !== 'number') return;
    const sample = state.clientReceivedAt - state.serverNow;
    const c = ref.current;
    if (c.target === null) { c.target = sample; c.offset = sample; c.lastTick = clockNow(); return; }
    c.target = Math.min(sample, c.target + CREEP_MS);
  }, [state]); // neuer Zustand = neue Server-Nachricht = neue Stichprobe

  // Stabile Funktionen über ein Ref, damit sie in rAF-Schleifen/Callbacks ohne Neuanlage leben
  const api = useRef(null);
  if (!api.current) {
    const offset = () => {
      const c = ref.current;
      if (c.offset === null) {
        // Noch keine Stichprobe verarbeitet (erster Render): direkt aus dem Zustand ableiten
        const s = c.latest;
        return s && typeof s.serverNow === 'number' ? s.clientReceivedAt - s.serverNow : 0;
      }
      const t = clockNow();
      const step = Math.max(0, t - c.lastTick) * SLEW_PER_MS;
      c.lastTick = t;
      const diff = c.target - c.offset;
      if (diff !== 0) c.offset += Math.max(-step, Math.min(step, diff));
      return c.offset;
    };
    api.current = { offset, serverTime: () => clockNow() - offset() };
  }
  return api.current;
}
