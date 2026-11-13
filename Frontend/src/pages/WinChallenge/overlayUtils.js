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

// ---- Timer: hoch- oder runterzählend ----
// Gespeichert wird die verstrichene Zeit; beim Countdown (mode "down") zeigt das
// Overlay durationMs − verstrichen und bleibt bei 0 stehen. Dieselbe Rechnung im
// Backend: Backend/winchallenge/timerMath.js — Änderungen an beiden Stellen.
export const MAX_TIMER_MS = 999 * 3600 * 1000;
export const DEFAULT_COUNTDOWN_MS = 3600 * 1000;

export const isCountdown = (t) => t?.mode === "down";

export function timerDurationMs(t) {
  const d = Number(t?.durationMs);
  return Number.isFinite(d) && d > 0 ? Math.min(d, MAX_TIMER_MS) : DEFAULT_COUNTDOWN_MS;
}

export function timerElapsedMs(t, now = Date.now()) {
  const raw = t?.running ? now - (Number(t.startedAt) || now) : Number(t?.elapsedMs) || 0;
  return isCountdown(t) ? Math.min(raw, timerDurationMs(t)) : raw;
}

/** Was das Overlay zeigt. */
export function timerDisplayMs(t, now = Date.now()) {
  const e = timerElapsedMs(t, now);
  return Math.max(0, isCountdown(t) ? timerDurationMs(t) - e : e);
}

function timerWithElapsed(t, elapsed, now) {
  const next = { ...t, elapsedMs: elapsed };
  if (next.running) next.startedAt = now - elapsed;
  return next;
}

/** Angezeigte Zeit setzen — beim Countdown also die Restzeit. */
export function timerSetDisplay(t, ms, now = Date.now()) {
  const v = Math.max(0, Math.min(Number(ms) || 0, MAX_TIMER_MS));
  return timerWithElapsed(t, isCountdown(t) ? timerDurationMs(t) - v : v, now);
}

export function timerAdjustDisplay(t, deltaMs, now = Date.now()) {
  return timerSetDisplay(t, timerDisplayMs(t, now) + deltaMs, now);
}

export function timerStart(t, now = Date.now()) {
  if (t.running) return t;
  // Abgelaufener Countdown: Start beginnt wieder von vorn
  const base = isCountdown(t) && timerDisplayMs(t, now) <= 0 ? 0 : timerElapsedMs(t, now);
  return { ...t, running: true, startedAt: now - base, elapsedMs: base };
}

export function timerPause(t, now = Date.now()) {
  if (!t.running) return t;
  return { ...t, running: false, startedAt: 0, elapsedMs: timerElapsedMs(t, now) };
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

/** "HH:MM:SS" oder "MM:SS" → Millisekunden (null bei ungültigem Format) */
export function parseClockInput(str) {
  const m = String(str || "")
    .trim()
    .match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const hasHours = m[3] != null;
  const h = hasHours ? parseInt(m[1], 10) : 0;
  const min = hasHours ? parseInt(m[2], 10) : parseInt(m[1], 10);
  const s = hasHours ? parseInt(m[3], 10) : parseInt(m[2], 10);
  if (hasHours && min > 59) return null;
  if (s > 59) return null;
  return (h * 3600 + min * 60 + s) * 1000;
}

/** Eine Challenge gilt als erledigt: Zähler am Ziel, sonst Haken gesetzt. */
export function isItemDone(it) {
  return it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
}

// ---- Serie (B2B, B3B …) ----
// Eine Serie ist ein Zähler (useWins) mit `streak: true`: gespeichert und gezählt wird
// sie genau wie ein Zähler — Chat-Befehle, Gesamtstand und ältere Fassungen des Overlays
// funktionieren deshalb unverändert. Anders ist nur die Anzeige: statt „2 / 3“ steht
// ein Kästchen je Win, damit die Zuschauer sehen, der wievielte Win gerade läuft.
export const STREAK_MIN = 2;
export const STREAK_MAX = 10;
const STREAK_DEFAULT = 3;

/** Art einer Challenge: "check" (abhaken), "counter" (Zähler) oder "streak" (Serie). */
export function itemMode(it) {
  if (!it?.useWins) return "check";
  return it.streak ? "streak" : "counter";
}

/**
 * Zeichnet das Overlay Kästchen statt einer Zahl? Nur bei einer Serie mit gültiger
 * Länge — sonst (z. B. Ziel von Hand auf 25 gesetzt) bleibt es bei der Zahl.
 */
export function showsStreakPips(it) {
  const target = it?.target || 0;
  return itemMode(it) === "streak" && target >= 1 && target <= STREAK_MAX;
}

/**
 * Felder, die sich beim Wechsel der Art ändern. Zur Serie: die Länge wird auf
 * B2B–B10 begrenzt (aus „Abhaken“ kommend B3B), der Stand passt sich an.
 * @param {object} it    Challenge
 * @param {"check"|"counter"|"streak"} mode
 */
export function itemModePatch(it, mode) {
  if (mode === "check") return { useWins: false, streak: false };
  if (mode === "counter") return { useWins: true, streak: false };
  const wanted = it?.useWins ? parseInt(it.target, 10) || STREAK_DEFAULT : STREAK_DEFAULT;
  const target = Math.min(STREAK_MAX, Math.max(STREAK_MIN, wanted));
  return { useWins: true, streak: true, target, progress: Math.min(it?.progress || 0, target) };
}

/** Länge einer Serie ändern — der Stand bleibt innerhalb der neuen Länge. */
export function streakLengthPatch(it, length) {
  const target = Math.min(STREAK_MAX, Math.max(STREAK_MIN, parseInt(length, 10) || STREAK_DEFAULT));
  return { target, progress: Math.min(it?.progress || 0, target) };
}

/**
 * Klick auf das Kästchen `index` (ab 0): füllt bis dorthin. Ein Klick auf das zuletzt
 * gefüllte nimmt genau diesen Win wieder zurück.
 */
export function streakClickProgress(it, index) {
  const progress = it?.progress || 0;
  return progress === index + 1 ? index : index + 1;
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
