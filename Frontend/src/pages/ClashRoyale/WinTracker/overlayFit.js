// overlayFit.js — Overlay-Format (Breite/Höhe) für das echte OBS-Overlay und die Editor-Vorschau.
//
// Die Karte hat eine natürliche Größe (feste Kartenbreite, Höhe je nach sichtbaren Teilen). Legt der
// Streamer eine eigene Breite und/oder Höhe fest, wird diese natürliche Größe an einer unsichtbaren
// Messkopie gemessen und daraus ein CSS-zoom berechnet — die Schrift wird in Zielgröße gezeichnet,
// bleibt also scharf (anders als Hochziehen in OBS).
//   nur Breite / nur Höhe   gleichmäßig skalieren, die andere Seite folgt dem Seitenverhältnis
//   Breite UND Höhe          so groß wie möglich skalieren; der übrige Platz wird auf die Teile
//                            verteilt (breiter = Raster wachsen mit, höher = Teile rücken auseinander)
//   beides automatisch       bisherige "Größe in Prozent" (overlayScale, 100–200 %)
import { useLayoutEffect, useState } from "react";

export const OVERLAY_DIM_LIMITS = { width: [200, 1200], height: [100, 1200] };

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Misst Breite/Höhe eines Elements (offsetWidth/-Height, ohne transform/zoom des Elements selbst).
 * Callback-Ref statt useRef: die Messkopie kann ein anderes Element werden (z.B. Deck seitlich ↔
 * im Stapel), der Beobachter muss dann neu angehängt werden.
 */
export function useMeasuredSize() {
  const [el, setEl] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!el) return undefined;
    const measure = () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

/** Ob das Overlay ein eigenes Format hat (dann braucht es die Messkopie). */
export const hasCustomFormat = (settings) => !!(Number(settings?.overlayWidth) || Number(settings?.overlayHeight));

/**
 * @param settings  overlayWidth/overlayHeight (px, 0 = automatisch), overlayScale (%)
 * @param natural   gemessene natürliche Kartengröße { w, h } (ungezoomt)
 * @returns { mode, zoom, boxW?, boxH? }
 *   mode "scale"   beides automatisch, zoom aus overlayScale
 *   mode "pending" noch nicht gemessen — Karte kurz unsichtbar lassen
 *   mode "box"     Karte bekommt boxW × boxH (vor zoom) und verteilt den Platz. Ist nur eine Seite
 *                  fest, folgt die andere dem Seitenverhältnis — trotzdem als feste Box, damit
 *                  Rundungen der Schrift unter zoom die Quelle nicht um 1–2 px verschieben.
 */
export function computeFit(settings, natural) {
  const W = Number(settings?.overlayWidth) || 0;
  const H = Number(settings?.overlayHeight) || 0;
  if (!W && !H) {
    return { mode: "scale", zoom: clamp((Number(settings?.overlayScale) || 100) / 100, 1, 2) };
  }
  if (!natural?.w || !natural?.h) return { mode: "pending", zoom: 1 };
  const raw = W && H ? Math.min(W / natural.w, H / natural.h) : W ? W / natural.w : H / natural.h;
  const zoom = clamp(raw, 0.25, 6);
  const outW = W || natural.w * zoom;
  const outH = H || natural.h * zoom;
  return { mode: "box", zoom, boxW: outW / zoom, boxH: outH / zoom };
}

/** Beide Seiten fest? Nur dann lohnt es, die Teile nebeneinander statt untereinander zu legen. */
export const hasFixedBox = (settings) => !!(Number(settings?.overlayWidth) && Number(settings?.overlayHeight));

/**
 * Untereinander (column) oder nebeneinander (row)? Nimmt die Anordnung, in der der Inhalt größer
 * gezeichnet werden kann — nebeneinander nur mit klarem Vorteil (15 %), sonst bleibt der gewohnte
 * Stapel. Ein flaches, breites Format (z.B. 900×200) wird so zur Leiste statt zur Miniatur.
 */
export function pickLayout(settings, columnSize, rowSize) {
  const column = computeFit(settings, columnSize);
  if (!hasFixedBox(settings) || !rowSize?.w || column.mode !== "box") return { layout: "column", fit: column };
  const row = computeFit(settings, rowSize);
  return row.mode === "box" && row.zoom > column.zoom * 1.15 ? { layout: "row", fit: row } : { layout: "column", fit: column };
}

/**
 * Reihenfolge der letzten 5 ohne eigene Textzeile (die frühere NEWEST-Zeile machte die Karte höher):
 * das neueste Spiel bekommt einen Rahmen, ältere werden Schritt für Schritt blasser.
 * @returns null (aus / kein Spiel) oder { newest: boolean, opacity: number }
 */
export function last5Emphasis(i, count, direction, on) {
  if (!on || i >= count) return null;
  const age = direction === "newestRight" ? count - 1 - i : i;
  return { newest: age === 0, opacity: age === 0 ? 1 : Math.max(0.5, 1 - age * 0.13) };
}
