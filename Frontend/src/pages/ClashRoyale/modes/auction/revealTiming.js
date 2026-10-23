// Zeitplan der Auktions-Auflösung ("Auktionshammer") — geteilt von AuctionRevealCard.jsx
// (Animationen) und ElixirAuction.jsx (Töne im selben Moment).
//
// Ablauf: Alle Karten drehen sich kurz nacheinander auf. Danach wird Karte für Karte
// aufgelöst — die aktive Karte hebt sich, die übrigen warten abgedunkelt; ihre Gebote steigen
// langsam vom niedrigsten (unten) zum höchsten (oben) auf, dann knallt der Stempel, dann ist
// die nächste Karte dran. So sieht man, wer worauf geboten und wer was bekommen hat.
// Karten OHNE Gebot werden dabei übersprungen und erst im Finale gestempelt, wenn alle Karten
// noch einmal zusammen zu sehen sind (empty: true, focus = Beginn des Finales).
//
// ACHTUNG: Der Server rechnet die Gesamtdauer mit denselben Zahlen nach (revealDurationMs in
// Backend/clashRoyale/modes/elixirAuction.js) — Änderungen hier dort mitziehen.

const FLIP_STEP = 0.12;   // Abstand beim Aufdrehen der Karten
const FLIP_TAIL = 0.45;   // bis die letzte Karte ganz aufgedreht ist
const FOCUS_LEAD = 0.8;   // Karte fliegt nach vorne, bevor das erste Gebot aufsteigt
const CHIP_IN = 0.45;     // Dauer, bis ein Gebot ganz aufgestiegen ist
const SLAM_GAP = 0.3;     // Pause nach dem höchsten Gebot bis zum Hammerschlag
const AFTER_SLAM = 1.3;   // Stempel wirken lassen, Karte fliegt zurück, dann die nächste
const FINALE = 2.4;       // am Ende: alle Karten noch einmal zusammen, Karten ohne Gebot bekommen ihren Stempel
const EMPTY_STEP = 0.18;  // Abstand der Stempel auf Karten ohne Gebot im Finale

/**
 * Abstand zwischen zwei aufsteigenden Geboten einer Karte. Alle Gebote einer Karte verteilen
 * sich auf höchstens 1,4 s — Karten mit vielen Geboten zogen sich vorher deutlich länger als
 * Karten mit einem (ungleichmäßiges Tempo).
 */
export const chipStep = (bidCount) => (bidCount > 1 ? Math.min(0.5, 1.4 / (bidCount - 1)) : 0);

/**
 * Zeitplan aller Karten in Sekunden ab Beginn der Auflösung.
 * @param {number[]} bidCounts  Anzahl Gebote je Karte (in Kartenreihenfolge)
 * @param {number}   base       Vorlauf (länger nach einer Mutterhexen-Enttarnung)
 * @returns {{ cards: Array<{flip:number, focus:number, slam:number, end:number, empty:boolean, chipAt:(rank:number)=>number}>, finale:number, total:number }}
 *          chipAt(rank): wann das Gebot mit Rang `rank` (0 = niedrigstes) erscheint
 */
export function revealSchedule(bidCounts, base = 0.25) {
  let t = base + bidCounts.length * FLIP_STEP + FLIP_TAIL;
  const cards = bidCounts.map((n, idx) => {
    if (n === 0) return null; // Karten ohne Gebot: siehe unten (Finale)
    const focus = t;
    const step = chipStep(n);
    const slam = focus + FOCUS_LEAD + (n - 1) * step + CHIP_IN + SLAM_GAP;
    const end = slam + AFTER_SLAM;
    t = end;
    return { flip: base + idx * FLIP_STEP, focus, slam, end, empty: false, chipAt: (rank) => focus + FOCUS_LEAD + rank * step };
  });
  const finale = t;
  let k = 0;
  bidCounts.forEach((n, idx) => {
    if (n !== 0) return;
    const slam = finale + 0.35 + k++ * EMPTY_STEP;
    cards[idx] = { flip: base + idx * FLIP_STEP, focus: finale, slam, end: finale + FINALE, empty: true, chipAt: () => slam };
  });
  return { cards, finale, total: finale + FINALE };
}
