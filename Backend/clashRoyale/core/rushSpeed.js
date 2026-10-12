// Aufladetempo des Elixiers in Elixir Rush (Solo) und Elixir Rush 2v2 — eine Host-Einstellung
// in beiden Modi, deshalb die Stufen an einer Stelle. Wert = Millisekunden pro Elixier.
// "normal" entspricht dem bisherigen festen Solo-Tempo (1,75 s), 2v2 startet eine Stufe
// schneller, weil sich dort zwei Spieler einen Balken teilen.

const RUSH_SPEED_MS = {
  slow: 2200,
  normal: 1750,
  fast: 1450,
  veryfast: 1150,
};
const RUSH_SPEED_IDS = Object.keys(RUSH_SPEED_MS);

/** Ms pro Elixier für eine Stufe; unbekannte Werte fallen auf `fallback` zurück. */
function rushRegenMs(speedId, fallback = 'normal') {
  return RUSH_SPEED_MS[speedId] ?? RUSH_SPEED_MS[fallback];
}

const sanitizeRushSpeed = (v) => (RUSH_SPEED_IDS.includes(v) ? v : undefined);

module.exports = { RUSH_SPEED_MS, RUSH_SPEED_IDS, rushRegenMs, sanitizeRushSpeed };
