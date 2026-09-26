// overlayUtils.js — Konstanten und Hilfsfunktionen, die das OBS-Overlay, die
// Editor-Vorschau und die Bausteine in overlayParts.jsx gemeinsam nutzen.

export const OVERLAY_FONT = "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif";
export const OVERLAY_TEXT_SHADOW = "0 2px 6px rgba(0,0,0,.65)";

// Erlaubte Werte der Darstellungs-Optionen. Editor und Backend prüfen dagegen.
export const OVERLAY_LAYOUTS = ["list", "cards", "compact"];
// Zähler bei den Zeilen: reine Zahl oder Zahl in einer Box. Im Header zusätzlich „Aus“.
// (Frühere Werte wie „line“ gelten nicht mehr und fallen auf den Standard zurück.)
export const COUNTER_STYLES = ["plain", "box"];
export const HEADER_PROGRESS_MODES = ["off", "count", "box"];

// Abstände je Layout. „cards“ trennt Header, Zeilen und Footer durch Lücken,
// „compact“ ist dieselbe Liste mit engeren Abständen.
const LAYOUT_METRICS = {
  list: { headPad: "10px 14px", rowPad: "9px 14px", footPad: "8px 14px", gap: 0 },
  compact: { headPad: "5px 12px", rowPad: "5px 12px", footPad: "5px 12px", gap: 0 },
  cards: { headPad: "10px 14px", rowPad: "9px 14px", footPad: "8px 14px", gap: 6 },
};

export function msToClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function clamp01(v, fallback = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function parseHex(hex) {
  let c = String(hex || "").replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return [r, g, b].some(Number.isNaN) ? null : [r, g, b];
}

export function hexToRgba(hex, alpha = 1) {
  const rgb = parseHex(hex || "#000000");
  // Kein gültiger Hex-Wert (z. B. "red"): neutrales Weiß statt "rgba(NaN, …)",
  // das der Browser stillschweigend verwirft und die Linie unsichtbar macht.
  if (!rgb) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/**
 * Trennlinie zwischen den Bändern. Aus der Textfarbe abgeleitet statt fest weiß:
 * auf den hellen Vorlagen wäre eine weiße Linie unsichtbar. Bewusst kein
 * color-mix() — ältere OBS-Browserquellen kennen es nicht.
 */
export function overlayDivider(textColor) {
  return hexToRgba(textColor || "#ffffff", 0.12);
}

/**
 * Der dunkle Schatten hebt hellen Text von unruhigem Hintergrund ab. Unter
 * dunklem Text (z. B. Vorlage „Hell“) verschmiert er die Schrift nur — dort
 * entfällt er.
 */
export function overlayTextShadow(color) {
  const rgb = parseHex(color);
  if (!rgb) return OVERLAY_TEXT_SHADOW;
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return brightness > 128 ? OVERLAY_TEXT_SHADOW : "none";
}

/** Eine Challenge gilt als erledigt: Zähler am Ziel, sonst Haken gesetzt. */
export function isItemDone(it) {
  return it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
}

/** Offene zuerst, erledigte dahinter — die Reihenfolge innerhalb bleibt erhalten. */
function doneLast(list) {
  return [...list.filter((i) => !isItemDone(i)), ...list.filter(isItemDone)];
}

/**
 * Teilt in angepinnte und übrige Challenges. Sortiert wird nur die Anzeige,
 * gespeichert bleibt die Reihenfolge aus dem Editor. Angepinnte bleiben oben —
 * erledigte rutschen nur innerhalb ihrer Gruppe ans Ende.
 */
export function splitOverlayItems(items, doneToBottom) {
  const pinned = items.filter((i) => !!i.pinned);
  const others = items.filter((i) => !i.pinned);
  return doneToBottom
    ? { pinned: doneLast(pinned), others: doneLast(others) }
    : { pinned, others };
}

/** Gesamtstand für den Header: erledigte von allen angezeigten Challenges. */
export function overallProgress(items) {
  return { done: items.filter(isItemDone).length, total: items.length };
}

/**
 * Löst das gespeicherte Design in alles auf, was Overlay und Vorschau zum
 * Zeichnen brauchen. Beide gehen durch diese eine Funktion, damit sie sich bei
 * Rückfallwerten und Regeln nicht wieder auseinanderentwickeln.
 */
export function resolveOverlayStyle(style) {
  const s = style || {};
  const {
    boxBg = "#0B0F1A",
    headerBg,
    textColor = "#ffffff",
    accent = "#9146FF",
    opacity = 0.6,
    headerOpacity,
    itemOpacity,
    counterOpacity,
    timerOpacity,
    borderRadius = 0,
    scale = 1,
    boxWidth = 320,
    titleAlign = "left",
    titleColor,
    titleFontSize = 20,
    itemFontSize = 16,
    itemBg,
  } = s;
  // Der Timer hat eine eigene Größe. Fehlt sie (Bestandsdaten), gilt wie bisher
  // die Challenge-Größe — dadurch ändert sich für vorhandene Overlays nichts.
  const timerFontSize = Number(s.timerFontSize) > 0 ? Number(s.timerFontSize) : itemFontSize;

  // Deckkraft je Fläche: Header, Zeilen, Zähler und Footer haben je einen
  // eigenen Wert. Es gibt keine Fläche mehr um die Zeilen herum — `opacity` ist
  // nur noch der Rückfallwert für Bestandsdaten ohne eigene Werte.
  const boxAlpha = clamp01(opacity, 0.6);
  const radius = Math.max(0, Number(borderRadius) || 0);
  const layout = OVERLAY_LAYOUTS.includes(s.layout) ? s.layout : "list";

  return {
    boxBg,
    headerBg: headerBg || boxBg,
    textColor,
    accent,
    itemBg,
    scale,
    boxWidth,
    borderRadius: radius,
    titleAlign,
    titleColor: titleColor || textColor,
    titleFontSize,
    itemFontSize,
    timerFontSize,
    headerAlpha: clamp01(headerOpacity ?? opacity, boxAlpha),
    itemAlpha: clamp01(itemOpacity ?? opacity, boxAlpha),
    counterAlpha: clamp01(counterOpacity ?? 0.06, 0.06),
    timerAlpha: clamp01(timerOpacity ?? 0.15, 0.15),
    layout,
    metrics: LAYOUT_METRICS[layout],
    // Nur die Außenecken folgen dem Radius-Regler in voller Höhe. Zähler-Marke
    // und Karten bleiben höchstens leicht gerundet — nicht alles soll eine
    // Pille sein.
    badgeRadius: Math.min(4, radius),
    cardRadius: Math.min(14, radius),
    divider: overlayDivider(textColor),
    textShadow: overlayTextShadow(textColor),
    counterStyle: COUNTER_STYLES.includes(s.counterStyle) ? s.counterStyle : "plain",
    headerProgress: HEADER_PROGRESS_MODES.includes(s.headerProgress) ? s.headerProgress : "off",
    doneToBottom: !!s.doneToBottom,
  };
}

/**
 * Hülle um Header, Zeilen und Footer. Liste und Kompakt sind ein Block mit
 * gemeinsamer Rundung und Schatten. Bei Karten gibt es keine Hülle — der
 * Schatten kommt per drop-shadow auf jede Karte einzeln (ein box-shadow würde
 * nur einen Rahmen um den ganzen Stapel legen).
 */
export function overlayBoxStyle(st) {
  const base = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: st.metrics.gap,
  };
  if (st.layout === "cards") {
    return { ...base, filter: "drop-shadow(0 4px 10px rgba(0,0,0,.35))" };
  }
  return {
    ...base,
    borderRadius: st.borderRadius,
    overflow: "hidden",
    boxShadow: "0 8px 24px rgba(0,0,0,.35)",
  };
}
