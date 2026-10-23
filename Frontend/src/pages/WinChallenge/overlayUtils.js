// overlayUtils.js — Konstanten und Hilfsfunktionen, die das OBS-Overlay, die
// Editor-Vorschau und die Bausteine in overlayParts.jsx gemeinsam nutzen.

export const OVERLAY_FONT = "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif";
export const OVERLAY_TEXT_SHADOW = "0 2px 6px rgba(0,0,0,.65)";

// Kleinste einstellbare Breite. Viele Streamer wollen das Overlay schmal am Rand statt als
// breiten Block im Bild; bei 200px passen der Standardtitel und der Timer noch in eine Zeile.
// Muss zur Untergrenze in Backend/winchallenge/winchallengeRoutes.js passen, sonst springt
// der Regler nach dem Speichern zurück.
export const MIN_BOX_WIDTH = 200;
// Die Leiste als Laufband: darunter bleibt neben Stand und Timer kein Platz für die Challenges.
export const BAR_TICKER_MIN_WIDTH = 400;

// Erlaubte Werte der Darstellungs-Optionen. Editor und Backend prüfen dagegen.
// Stile des Overlays. Anders als die früheren „Karten“/„Kompakt“ (dieselbe Liste mit
// anderen Abständen) sind das wirklich unterschiedliche Formen. Gespeicherte Werte,
// die es nicht mehr gibt („cards“, „compact“, „quest“), fallen auf „list“ zurück.
//   list      — Klassisch: Kopfband, Zeilen mit Trennlinie, Fußband mit Timer
//   broadcast — Sendegrafik: Stand als Akzentblock, Timer im Kopf, Zeilen ohne Linien
//   bar       — Leiste: ein waagerechter Streifen für den Bildrand
// Muss zur Liste in Backend/winchallenge/winchallengeRoutes.js passen.
export const OVERLAY_LAYOUTS = ["list", "broadcast", "bar"];
// Zähler bei den Zeilen: reine Zahl oder Zahl in einer Box. Im Header zusätzlich „Aus“.
// (Frühere Werte wie „line“ gelten nicht mehr und fallen auf den Standard zurück.)
export const COUNTER_STYLES = ["plain", "box"];
export const HEADER_PROGRESS_MODES = ["off", "count", "box"];

// Abstände je Stil. `gap` ist der Abstand zwischen zwei Zeilen (überall 0 — die
// Laufschrift im Overlay rechnet damit).
const LAYOUT_METRICS = {
  list: { headPad: "10px 14px", rowPad: "9px 14px", footPad: "8px 14px", gap: 0 },
  broadcast: { headPad: "9px 14px", rowPad: "7px 14px", footPad: "7px 14px", gap: 0 },
  bar: { headPad: "8px 14px", rowPad: "8px 14px", footPad: "8px 14px", gap: 0 },
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

/** Schwarz oder Weiß — je nachdem, was auf der Farbe besser lesbar ist (Akzentblock). */
export function readableOn(color) {
  const rgb = parseHex(color);
  if (!rgb) return "#ffffff";
  const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return brightness > 150 ? "#0b0b10" : "#ffffff";
}

/** Eine Challenge gilt als erledigt: Zähler am Ziel, sonst Haken gesetzt. */
export function isItemDone(it) {
  return it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
}

// Spielcover einer Challenge kommen ausschließlich aus der Twitch-Kategoriesuche.
// Das Backend prüft die Adresse streng (winchallenge/winchallengeGames.js); hier
// noch einmal grob, weil die Editor-Vorschau ungespeicherte Daten zeichnet.
const ICON_URL_PREFIX = "https://static-cdn.jtvnw.net/ttv-boxart/";

/** Adresse des Spielcovers einer Challenge — "" wenn sie keins hat. */
export function itemIconUrl(it) {
  const url = it?.icon?.url;
  return typeof url === "string" && url.startsWith(ICON_URL_PREFIX) ? url : "";
}

// Größte Breite des Laufbands (volle 1080p-Breite). Gegenstück im Backend: normalizeStyle.
export const BAR_MAX_WIDTH = 1920;
const BAR_DEFAULT_WIDTH = 800;

/**
 * Breite des Laufbands der Leiste. Eigener Wert (`barWidth`), getrennt von der
 * Spaltenbreite `boxWidth` der anderen Stile: früher teilten sich beide ein Feld,
 * und wer von der Leiste zurück zu „Klassisch“ wechselte, hatte dort plötzlich
 * 800px. Bestandsdaten ohne `barWidth`: stand die Leiste schon mit Laufband-Breite
 * in `boxWidth`, gilt die weiter, sonst die Vorgabe.
 */
export function resolveBarWidth(style) {
  const s = style || {};
  const own = Number(s.barWidth);
  const legacy = s.layout === "bar" && Number(s.boxWidth) >= BAR_TICKER_MIN_WIDTH ? Number(s.boxWidth) : BAR_DEFAULT_WIDTH;
  const w = Number.isFinite(own) && own > 0 ? own : legacy;
  return Math.min(BAR_MAX_WIDTH, Math.max(BAR_TICKER_MIN_WIDTH, w));
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
    // Nur die Außenecken folgen dem Radius-Regler in voller Höhe. Die Zähler-Marke
    // bleibt höchstens leicht gerundet — nicht alles soll eine Pille sein.
    badgeRadius: Math.min(4, radius),
    divider: overlayDivider(textColor),
    textShadow: overlayTextShadow(textColor),
    counterStyle: COUNTER_STYLES.includes(s.counterStyle) ? s.counterStyle : "plain",
    headerProgress: HEADER_PROGRESS_MODES.includes(s.headerProgress) ? s.headerProgress : "off",
    doneToBottom: !!s.doneToBottom,
    // Nur für den Stil „Leiste“
    barWidth: resolveBarWidth(s),
    barTitle: s.barTitle !== false,
    barTimerSide: s.barTimerSide === "left" ? "left" : "right",
  };
}
