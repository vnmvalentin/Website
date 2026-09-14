// colorScoring.js — Punkteformel für Farb-Ratespiele (aktuell nur CR Color Match). Getrennt
// von core/scoring.js, weil dort mit einer einzelnen Zahl auf einer Skala gerechnet wird
// (Differenz + spannenbasierte Toleranz) — eine Farbe ist dagegen ein 3-dimensionaler Wert
// (R, G, B), für den ein simpler Zahlen-Diff keinen Sinn ergibt.
//
// "redmean" statt schlichter euklidischer RGB-Distanz: eine verbreitete, einfache Näherung
// dafür, wie Menschen Farbunterschiede tatsächlich WAHRNEHMEN (das menschliche Auge ist z.B.
// deutlich empfindlicher für Grün- als für Blau-Unterschiede) — ohne den vollen Aufwand einer
// Umrechnung in den CIE-LAB-Farbraum. Referenz: https://www.compuphase.com/cmetric.htm
//
// COLOR_TOLERANCE ist ein erster Schätzwert (noch nicht am echten Spielverhalten
// gegengetestet) — sollte sich nach echtem Spielen als zu streng oder zu großzügig
// herausstellen, hier anpassen (siehe core/scoring.js für die Historie, wie genau dort
// iterativ nachjustiert wurde).
const COLOR_TOLERANCE = 110;

function redmeanDistance(a, b) {
  const rmean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

// Exponentieller Abfall, exakt dieselbe Form wie core/scoring.js's scoreGuess — bei einem
// Abstand exakt auf der Toleranz gibt's noch ~37 Punkte, weiter weg wird's schnell, aber
// sanft, weniger.
function scoreColor(guess, actual) {
  const dist = redmeanDistance(guess, actual);
  const score = Math.round(100 * Math.exp(-dist / COLOR_TOLERANCE));
  return Math.max(0, Math.min(100, score));
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function isValidColor(c) {
  return (
    c && typeof c === 'object' &&
    Number.isFinite(c.r) && c.r >= 0 && c.r <= 255 &&
    Number.isFinite(c.g) && c.g >= 0 && c.g <= 255 &&
    Number.isFinite(c.b) && c.b >= 0 && c.b <= 255
  );
}

module.exports = { redmeanDistance, scoreColor, isValidColor, hexToRgb, rgbToHex, COLOR_TOLERANCE };
