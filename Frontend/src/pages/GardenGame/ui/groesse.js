// ui/groesse.js — angezeigte Fruchtgröße 1,0–100,0. Gewürfelt wird nur auf dem
// Server (Backend/garden/core/groesse.js); hier steht nur das Lesen und Formatieren.
// Alte Stücke tragen nur `size` 1–50 und werden genauso umgerechnet wie dort.

const SKALA_MAX = 99.9;

export function groesseVon(item) {
    const g = Number(item?.groesse);
    if (Number.isFinite(g) && g > 0) return Math.min(100, g);
    const s = Math.max(1, Math.min(50, Number(item?.size) || 1));
    return Math.round((1 + (SKALA_MAX - 1) * ((s - 1) / 49)) * 10) / 10;
}

/** Vorschau für eine wachsende Pflanze (die glatte 100 entscheidet erst die Ernte). */
export function groesseAusNorm(norm) {
    const n = Math.max(0, Math.min(1, Number(norm) || 0));
    return Math.min(SKALA_MAX, Math.round((1 + (SKALA_MAX - 1) * n) * 10) / 10);
}

/** „85,8" — immer mit einer Nachkommastelle, damit 100,0 als Höchstwert erkennbar ist. */
export function formatGroesse(g) {
    return Number(g || 0).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Kurzform für Stücke: „Größe 85,8". */
export function groesseText(item) {
    return `Größe ${formatGroesse(groesseVon(item))}`;
}
