// ui/battle/table3d/tableStage.js — welche Ansicht gerade auf dem 3D-Tisch liegt.
//
// Jeder Spielbildschirm meldet per useTableStage, was er zeigt (Draft, Totem, Karte, Kampf, Rast …).
// Der Tisch (Table3DLayer, einmal in der Hülle) hört zu, fährt die Kamera dorthin und richtet Kerzen
// und Karte am DOM aus. Kein Bildschirm muss wissen, ob der Tisch überhaupt in 3D läuft.
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

/** @typedef {"draft" | "totem" | "battle" | "map" | "scene" | "rest"} TableStageName */
/**
 * @typedef {{ id: number, stage: TableStageName, zirkel: string, anchor: { current: HTMLElement | null } | null,
 *   turn: number, mapKey: string, scale: number, totems: Array<{ kind: string, label: string } | null> | null }} TableStage
 */

/** @type {TableStage | null} */
let current = null;
let seq = 0;
const subs = new Set();

export function getTableStage() {
  return current;
}

/** @param {(s: TableStage | null) => void} fn */
export function subscribeTableStage(fn) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

function publish(next) {
  current = next;
  subs.forEach((fn) => fn(next));
}

/**
 * Meldet die eigene Ansicht, solange die Komponente steht (useLayoutEffect: vor dem ersten Bild,
 * damit der Tisch das Spielfeld zum Einstieg noch ausblenden kann).
 * @param {TableStageName} stage
 * @param {{ zirkel?: string, anchor?: { current: HTMLElement | null } | null, turn?: number, mapKey?: string }} [opts]
 *   anchor: Element, neben das die Kerzen gestellt werden (Kampf: die Kampf-Wurzel, Karte: der Kartenbereich)
 *   scale/totems: Kampf — Waagenstand und beide Totems (eigenes zuerst; totems bitte per useMemo stabil halten)
 */
export function useTableStage(stage, { zirkel = "moor", anchor = null, turn = 0, mapKey = "", scale = 0, totems = null } = {}) {
  const id = useRef(0);
  if (!id.current) id.current = ++seq;
  useLayoutEffect(() => {
    publish({ id: id.current, stage, zirkel, anchor, turn, mapKey, scale, totems });
  }, [stage, zirkel, anchor, turn, mapKey, scale, totems]);
  useLayoutEffect(() => () => {
    if (current?.id === id.current) publish(null);
  }, []);
}

/**
 * Dasselbe als Komponente — für Bildschirme, die keinen eigenen Haken brauchen (Draft, Totem, Rast …):
 * <TableStage stage="rest" zirkel={…} anchor={wrapperRef} />
 * @param {{ stage: TableStageName, zirkel?: string, anchor?: { current: HTMLElement | null } | null }} props
 */
export function TableStage({ stage, zirkel, anchor }) {
  useTableStage(stage, { zirkel, anchor });
  return null;
}

// ── Laufende 3D-Szene (für Bildschirme, die direkt mit dem Tisch sprechen, z. B. die 3D-Pfadkarte) ──
let activeScene = null;
const sceneSubs = new Set();

/** Nur Table3DLayer: Szene steht bereit (bzw. ist weg). */
export function setActiveTableScene(s) {
  activeScene = s;
  sceneSubs.forEach((fn) => fn());
}

const subscribeScene = (fn) => { sceneSubs.add(fn); return () => { sceneSubs.delete(fn); }; };

/** Die laufende Tisch-Szene oder null (3D aus, kein WebGL, noch nicht geladen). */
export function useActiveTableScene() {
  return useSyncExternalStore(subscribeScene, () => activeScene, () => null);
}
