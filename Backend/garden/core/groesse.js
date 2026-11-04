// core/groesse.js — die sichtbare Fruchtgröße 1,0 bis 100,0 (eine Nachkommastelle).
//
// Zwei Felder am Erntestück, bewusst getrennt:
//   size     ganze Zahl 1–50 wie bisher. Daran hängen Verkaufswert (verkaufswert),
//            Logbuch-Ausprägungen, Händler-Aufträge und die Zeichengröße in der Hand.
//            Unverändert, damit keine Balance und kein alter Spielstand kippt.
//   groesse  die angezeigte Größe 1,0–100,0. Fein genug, dass im Wochenwettbewerb
//            praktisch nie zwei Stücke gleich groß sind.
//
// Beide kommen aus demselben `norm`, die Reihenfolge ist also immer gleich: ein
// größeres `groesse` ist nie weniger wert. Eine glatte 100,0 gibt es nur mit
// Extra-Glück (PERFEKT_*), sonst endet die Skala bei 99,9.
// Spiegel im Browser: Frontend/src/pages/GardenGame/ui/groesse.js.

const PERFEKT_AB = 0.999;       // nur die obersten 0,1 % von norm
const PERFEKT_CHANCE = 0.1;     // davon jedes zehnte → insgesamt etwa 1 von 13.500 Ernten
const SKALA_MAX = 99.9;

const runde1 = (x) => Math.round(x * 10) / 10;
const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));

/** Größe 1,0–99,9 aus norm, mit kleiner Extra-Chance auf genau 100,0. */
function wuerfleGroesse(norm, zufall = Math.random) {
    const n = clamp01(norm);
    if (n >= PERFEKT_AB && zufall() < PERFEKT_CHANCE) return 100;
    return Math.min(SKALA_MAX, runde1(1 + (SKALA_MAX - 1) * n));
}

/** Angezeigte Größe eines Stücks; alte Stücke (nur `size` 1–50) werden umgerechnet. */
function groesseVon(item) {
    const g = Number(item?.groesse);
    if (Number.isFinite(g) && g > 0) return Math.min(100, g);
    const s = Math.max(1, Math.min(50, Number(item?.size) || 1));
    return runde1(1 + (SKALA_MAX - 1) * ((s - 1) / 49));
}

module.exports = { wuerfleGroesse, groesseVon, PERFEKT_AB, PERFEKT_CHANCE, SKALA_MAX };
