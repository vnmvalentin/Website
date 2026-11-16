// konto/stufe.js — Website-Stufe aus der Summe der Erfahrungspunkte aller Spiele eines Kontos.
//
// Stufe L beginnt bei 50·L·(L−1) XP: 1 → 0, 2 → 100, 3 → 300, 4 → 600, 5 → 1.000, 10 → 4.500, 20 → 19.000.
// Jede Stufe braucht also 100 XP mehr als die vorige. Richtwert für die Spiele (Anschluss konto-spiele): etwa 10 XP
// für eine normale Partie oder einen Lauf, damit die Stufen zwischen den Spielen vergleichbar bleiben.

const xpFuerStufe = (l) => 50 * l * (l - 1);

/** @returns {{ stufe: number, xp: number, ab: number, naechste: number }} */
function stufeAusXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let l = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * x) / 50)) / 2));
  // Rundungsfehler der Wurzel ausgleichen
  while (xpFuerStufe(l + 1) <= x) l++;
  while (l > 1 && xpFuerStufe(l) > x) l--;
  return { stufe: l, xp: x, ab: xpFuerStufe(l), naechste: xpFuerStufe(l + 1) };
}

module.exports = { stufeAusXp, xpFuerStufe };
