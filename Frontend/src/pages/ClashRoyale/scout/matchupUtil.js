// matchupUtil.js — Hilfen des Matchup-Ratgebers ohne Komponenten (die Bausteine stehen in matchupParts.jsx).
import { fmtDate, fmtNum, useScoutText } from './scoutI18n';
import { localCard } from './scoutUtil';

export const GOOD = '#7ee79a';
export const BAD = '#ff8f91';

/**
 * Farbe einer Bilanz im direkten Vergleich: grün bzw. rot nur, wenn der Abstand zu p (Standard 50 %) kaum Zufall ist
 * (Normalnäherung, |z| ≥ 1,96) — sonst bleibt die Zahl weiß, auch wenn sie bei 47 % steht.
 */
export function clearColor(n, wins, p = 0.5) {
  if (!n) return undefined;
  const sd = Math.sqrt(n * p * (1 - p));
  const z = sd > 0 ? (wins - n * p) / sd : 0;
  return z >= 1.96 ? GOOD : z <= -1.96 ? BAD : undefined;
}

/** Karte zu einem Deck-Typ (Karten-ID der Win-Condition). */
export const typeCard = (type) => localCard(type) || { id: null, name: type };

/** „12.345 Kämpfe seit 16.11.2026“ — der Verlauf beginnt erst mit dem Sammler, deshalb das echte Startdatum. */
export function useMuSource() {
  const { t, lang } = useScoutText();
  return (m, n = m?.n) => t.muSource(fmtNum(n, lang), fmtDate(m?.from || m?.updatedAt, lang));
}
