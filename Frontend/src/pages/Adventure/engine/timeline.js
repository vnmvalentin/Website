// engine/timeline.js — Verlauf eines Laufs für die Auswertung (screens/EndScreen.jsx): wie viele Kills in welchem
// Zeitabschnitt fielen und wann welche Welt begann. Liegt in g.stats und geht damit in den Spielstand — ein
// fortgesetzter Lauf zeigt am Ende die ganze Kurve, nicht nur das letzte Stück.

export const CURVE_STEP = 15; // Sekunden pro Abschnitt
// 480 Abschnitte = 2 Stunden. Was danach fällt, zählt in den letzten Abschnitt — der Spielstand bleibt klein
// (Obergrenze im Backend: MAX_SNAPSHOT_BYTES).
const CURVE_MAX = 480;
const MARKS_MAX = 40;

export function noteKill(g) {
  const curve = g.stats.curve || (g.stats.curve = []);
  const i = Math.min(CURVE_MAX - 1, Math.floor(g.time / CURVE_STEP));
  while (curve.length <= i) curve.push(0);
  curve[i]++;
}

// Beim Laden einer Welt: [Sekunde, Welt-Index, Zyklus, Kills bis dahin]. Wird ein Lauf fortgesetzt, lädt dieselbe Welt
// noch einmal — dann steht die Marke schon da.
export function noteStage(g) {
  const marks = g.stats.marks || (g.stats.marks = []);
  const last = marks[marks.length - 1];
  if (last && last[1] === g.stageIndex && last[2] === g.loop) return;
  if (marks.length < MARKS_MAX) marks.push([Math.round(g.time), g.stageIndex, g.loop, g.stats.kills]);
}

// Für die Auswertung aufbereitet: Punkte der Kurve (Kills pro Minute je Abschnitt), die Welten mit Dauer und Kills und
// der stärkste Abschnitt. null, wenn der Lauf zu kurz war oder die Aufzeichnung nicht bei 0 beginnt (Lauf aus einem
// Spielstand von vor der Aufzeichnung fortgesetzt) — dann zeigt die Auswertung lieber keine Kurve als eine falsche.
export function summarizeTimeline(stats, endTime) {
  const curve = stats?.curve || [];
  const marks = stats?.marks || [];
  const end = Math.min(endTime || 0, CURVE_MAX * CURVE_STEP);
  if (!marks.length || marks[0][0] > 1 || end < CURVE_STEP * 2) return null;
  const points = [];
  for (let i = 0; i * CURVE_STEP < end; i++) {
    const from = i * CURVE_STEP;
    const to = Math.min(end, from + CURVE_STEP);
    if (to - from < 5) break; // ein angebrochener Rest von wenigen Sekunden verzerrt den Wert pro Minute
    const kills = curve[i] || 0;
    points.push({ from, to, t: (from + to) / 2, kills, perMin: Math.round((kills / (to - from)) * 60) });
  }
  const worlds = marks.map((m, i) => {
    const next = marks[i + 1];
    const from = m[0];
    const to = Math.max(from, next ? next[0] : endTime);
    const kills = Math.max(0, (next ? next[3] : stats.kills) - m[3]);
    return { from, to, index: m[1], loop: m[2], kills, perMin: to - from >= 5 ? Math.round((kills / (to - from)) * 60) : 0 };
  });
  const peak = points.reduce((best, p) => (p.perMin > best.perMin ? p : best), points[0]);
  return { points, worlds, peak, end };
}
