// colorScoring.js — exaktes Duplikat von Backend/dle/core/colorScoring.js, für sofortiges
// Feedback direkt nach dem Raten (siehe scoring.js-Kommentarkopf für die Begründung dieses
// Musters). Der Server rechnet beim Einreichen unabhängig selbst nach.
const COLOR_TOLERANCE = 110;

function redmeanDistance(a, b) {
  const rmean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

export function scoreColor(guess, actual) {
  const dist = redmeanDistance(guess, actual);
  const score = Math.round(100 * Math.exp(-dist / COLOR_TOLERANCE));
  return Math.max(0, Math.min(100, score));
}

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
