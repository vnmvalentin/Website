import React, {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { nanoid } from "nanoid";
import SEO from "../../components/SEO";
import { chatCommandDocs } from "./chatCommands";
import WinChallengeSeoContent from "./seoContent";
import { wcSeo } from "./seoData";
import { useWcShell } from "./ui/shellContext";
import { buildWinChallengeJsonLd } from "./jsonLd";
import OverlayView from "./OverlayView";
import { STYLE_PRESETS } from "./stylePresets";
import GameCoverPicker from "./ui/GameCoverPicker";
import {
  COUNTER_STYLES,
  HEADER_PROGRESS_MODES,
  BAR_MAX_WIDTH,
  BAR_TICKER_MIN_WIDTH,
  resolveBarWidth,
  MIN_BOX_WIDTH,
  OVERLAY_LAYOUTS,
  msToClock,
  overallProgress,
} from "./overlayUtils";
import {
  Palette,
  Settings,
  Play,
  Pause,
  Pin,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  GripVertical,
  Check,
  Copy,
  Monitor,
  ShieldAlert,
  MessageSquare,
  RefreshCw,
  Eye,
  EyeOff,
  ListChecks,
  Clock,
  Pencil,
  X,
  Hash,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// --- HELPER FUNCTIONS ---

/** "HH:MM:SS" oder "MM:SS" → Millisekunden (null bei ungültigem Format) */
function parseClockInput(str) {
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

function hex3to6(hex) {
  if (!hex || typeof hex !== "string") return "#ffffff";
  let c = hex.trim();
  if (!c.startsWith("#")) c = "#" + c;
  if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  if (!/^#([0-9a-fA-F]{6})$/.test(c)) return "#ffffff";
  return c.toLowerCase();
}

function normalizeChannelName(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9_]/g, "");
}

// --- DEFAULTS & NORMALIZERS ---
const DEFAULT_STYLE = {
  boxBg: "#0B0F1A", textColor: "#ffffff", accent: "#9146FF", opacity: 0.6,
  borderRadius: 0, scale: 1.0, boxWidth: 320, titleAlign: "left",
  titleColor: "#ffffff", headerBg: "#0B0F1A", headerOpacity: 0.9,
  titleFontSize: 18, itemFontSize: 16, itemBg: "#151b2c",
  // Eigene Deckkraft je Fläche. boxBg/opacity gelten nur noch für den Footer
  // bzw. als Rückfallwert. itemOpacity und timerOpacity fehlen hier absichtlich:
  // ihr Rückfallwert ist die Box-Deckkraft des Dokuments, ein fester Wert würde
  // Bestandsdaten überschreiben.
  counterOpacity: 0.06,
  // Darstellung: Layout, Zähler als Linie oder Box, Gesamtfortschritt im Header
  // ("off" | "count" | "line") und ob erledigte Challenges ans Ende sortiert werden
  layout: "list", counterStyle: "plain", headerProgress: "off", doneToBottom: false,
  // Nur für den Stil „Leiste“: Titel ausblendbar, Timer fest links oder rechts
  barTitle: true, barTimerSide: "right",
};
const DEFAULT_TIMER = { running: false, startedAt: 0, elapsedMs: 0, visible: true };
const DEFAULT_PAGER = { enabled: false, pageSize: 5, intervalSec: 20 };
const DEFAULT_ANIMATION = {
  enabled: false, mode: "paging",
  paging: { pageSize: 5, intervalSec: 20 },
  scrolling: { speedPxPerSec: 30, visibleRows: 2, pauseSec: 2 },
};
const DEFAULT_PERMISSIONS = { allowModsTimer: true, allowModsTitle: false, allowModsChallenges: false };
const DEFAULT_CHAT_COMMANDS = {
  enabled: false,
  channel: "",
  channels: [],
  requireModOrBroadcaster: true,
  replyInChat: true,
};
const MAX_CHAT_CHANNELS = 10;

const makeItem = () => ({
  id: nanoid(8), name: "", useWins: false, target: 1, progress: 0, done: false, pinned: false,
});

function normalizeChatCommands(cc) {
  const merged = { ...DEFAULT_CHAT_COMMANDS, ...(cc || {}) };
  const set = new Set();
  const push = (v) => {
    const c = normalizeChannelName(v);
    if (c) set.add(c);
  };
  if (Array.isArray(merged.channels)) merged.channels.forEach(push);
  push(merged.channel);
  merged.channels = [...set].slice(0, MAX_CHAT_CHANNELS);
  merged.channel = merged.channels[0] || "";
  return merged;
}

function normalizeAnimation(animation, pagerLike) {
  const hasAnim = animation && typeof animation === "object";
  const a = hasAnim ? animation : {};
  const out = {
    ...DEFAULT_ANIMATION, ...a,
    paging: { ...DEFAULT_ANIMATION.paging, ...(a.paging || {}) },
    scrolling: { ...DEFAULT_ANIMATION.scrolling, ...(a.scrolling || {}) },
  };
  if (!hasAnim && pagerLike) {
    if (pagerLike.enabled) out.enabled = true;
    out.mode = "paging";
    out.paging.pageSize = pagerLike.pageSize;
    out.paging.intervalSec = pagerLike.intervalSec;
  }
  out.enabled = !!out.enabled;
  out.mode = out.mode === "scrolling" ? "scrolling" : "paging";
  return out;
}

function normalizeStyle(style) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  s.boxBg = hex3to6(s.boxBg); s.textColor = hex3to6(s.textColor); s.accent = hex3to6(s.accent);
  s.headerBg = hex3to6(s.headerBg); s.titleColor = hex3to6(s.titleColor); s.itemBg = hex3to6(s.itemBg);
  const clampAlpha = (v, fallback) => Math.min(1, Math.max(0, Number(v ?? fallback)));
  s.opacity = clampAlpha(s.opacity, 0.6);
  s.headerOpacity = clampAlpha(s.headerOpacity, s.opacity);
  // Bestandsdaten kennen itemOpacity nicht — dort galt die Box-Deckkraft auch
  // für die Zeilen. Geprüft wird der Rohwert, nicht der mit DEFAULT_STYLE
  // zusammengeführte, sonst ginge der dokumenteigene Rückfallwert verloren.
  s.itemOpacity = clampAlpha(style?.itemOpacity, s.opacity);
  s.timerOpacity = clampAlpha(style?.timerOpacity, s.opacity);
  s.counterOpacity = clampAlpha(s.counterOpacity, 0.06);
  s.borderRadius = Math.max(0, parseInt(s.borderRadius ?? 0, 10));
  s.scale = Number(s.scale ?? 1);
  s.boxWidth = Math.min(1920, Math.max(MIN_BOX_WIDTH, parseInt(s.boxWidth ?? 320, 10)));
  // Eigene Breite des Laufbands. Fehlt sie (Bestandsdaten), bleibt das Feld leer —
  // resolveBarWidth leitet sie dann beim Zeichnen ab.
  if (style?.barWidth != null) s.barWidth = resolveBarWidth(s);
  s.titleFontSize = Math.max(10, Math.min(48, parseInt(s.titleFontSize ?? 20, 10)));
  s.itemFontSize = Math.max(8, Math.min(36, parseInt(s.itemFontSize ?? 16, 10)));
  s.layout = OVERLAY_LAYOUTS.includes(s.layout) ? s.layout : "list";
  s.counterStyle = COUNTER_STYLES.includes(s.counterStyle) ? s.counterStyle : "plain";
  // Eigene Timer-Größe. Bestandsdaten kennen sie nicht — dort galt die Challenge-
  // Größe. Geprüft wird der Rohwert (nicht der mit DEFAULT_STYLE zusammengeführte),
  // und beim ersten Speichern wird der Wert festgeschrieben: danach zieht der
  // Challenge-Größen-Regler den Timer nicht mehr mit.
  s.timerFontSize = Math.max(8, Math.min(48, parseInt(style?.timerFontSize ?? s.itemFontSize, 10)));
  s.headerProgress = HEADER_PROGRESS_MODES.includes(s.headerProgress) ? s.headerProgress : "off";
  s.doneToBottom = s.doneToBottom === true;
  s.barTitle = s.barTitle !== false;
  s.barTimerSide = s.barTimerSide === "left" ? "left" : "right";
  return s;
}

// --- STILWECHSEL: jeder Stil behält seine eigenen Einstellungen ---
//
// Die Felder in doc.style sind immer die des GERADE gewählten Stils — das Overlay
// zeichnet nur sie. Beim Wechsel wandert der Stand des alten Stils nach
// style.layoutMemory[alterStil], und der neue Stil bekommt seinen gemerkten Stand
// zurück. Vorher teilten sich alle Stile dieselben Felder: wer in der Sendegrafik
// die Gesamtanzeige einschaltete oder für die Leiste etwas umstellte, fand das
// danach auch in „Klassisch“ wieder (oder es wurde beim Wechsel überschrieben).
//
// Gemerkt wird Form und Anzeige. Farben und Deckkraft sind bewusst NICHT dabei:
// das ist das Farbschema des Streamers und gilt für alle Stile.
// Muss zur Liste in Backend/winchallenge/winchallengeRoutes.js passen.
const LAYOUT_OWN_KEYS = [
  "boxWidth", "scale", "titleFontSize", "itemFontSize", "timerFontSize", "borderRadius",
  "titleAlign", "headerProgress", "counterStyle", "doneToBottom",
];
// Die Leiste hat ihre eigene Breite (barWidth) und nutzt boxWidth nicht — sie soll
// die Spaltenbreite der anderen Stile weder merken noch zurückschreiben.
const ownKeysOf = (layout) =>
  layout === "bar" ? LAYOUT_OWN_KEYS.filter((k) => k !== "boxWidth") : LAYOUT_OWN_KEYS;

/** Stand eines Stils zum Merken: seine eigenen Felder plus das Durchwechseln. */
function layoutSnapshot(layout, style, animation) {
  const snap = { animEnabled: !!animation?.enabled, animMode: animation?.mode === "scrolling" ? "scrolling" : "paging" };
  for (const k of ownKeysOf(layout)) if (style?.[k] !== undefined) snap[k] = style[k];
  return snap;
}

/**
 * Wechselt den Stil des Overlays.
 * @param {object} doc   aktuelles Dokument
 * @param {string} next  Zielstil (einer aus OVERLAY_LAYOUTS)
 * @returns {object} neues Dokument — Stil, gemerkte Stände und Durchwechseln angepasst
 */
function switchLayout(doc, next) {
  const style = doc.style || {};
  const cur = OVERLAY_LAYOUTS.includes(style.layout) ? style.layout : "list";
  if (next === cur) return doc;

  const layoutMemory = { ...(style.layoutMemory || {}), [cur]: layoutSnapshot(cur, style, doc.animation) };
  const saved = layoutMemory[next];
  const patch = {};
  let animation = doc.animation;

  // Bestandsdaten: früher lag die Laufband-Breite mit in boxWidth. Beim ersten
  // Verlassen der Leiste zieht sie nach barWidth um, die Spalte wird wieder 320.
  if (cur === "bar" && style.barWidth == null) {
    patch.barWidth = resolveBarWidth(style);
    patch.boxWidth = 320;
  } else if ((style.boxWidth ?? 320) > 1000) {
    // Mehr als 1000 kann nur vom alten Laufband stammen
    patch.boxWidth = 320;
  }

  if (saved) {
    // Schon einmal benutzt: genau so wiederherstellen, wie er verlassen wurde
    for (const k of ownKeysOf(next)) if (saved[k] !== undefined) patch[k] = saved[k];
    animation = { ...doc.animation, enabled: !!saved.animEnabled, mode: saved.animMode === "scrolling" ? "scrolling" : "paging" };
  } else if (next === "bar") {
    // Erster Besuch: die Leiste startet als Nachrichten-Laufband ohne Titel.
    // Den Titel blendet nur sie aus (barTitle gilt in keinem anderen Stil).
    patch.barTitle = false;
    patch.barWidth = patch.barWidth ?? resolveBarWidth({ ...style, layout: cur });
    animation = { ...doc.animation, enabled: true, mode: "scrolling" };
  } else {
    // Erster Besuch: jeder Stil bringt seine Anzeige mit — die Sendegrafik lebt vom
    // Stand-Block und den Zähler-Boxen, Klassisch startet schlicht.
    Object.assign(patch, next === "broadcast"
      ? { headerProgress: "count", counterStyle: "box" }
      : { headerProgress: "off", counterStyle: "plain" });
    // Das Laufband der Leiste wäre hier eine senkrechte Laufschrift, die niemand bestellt hat
    if (cur === "bar" && doc.animation?.enabled && doc.animation?.mode === "scrolling") {
      animation = { ...doc.animation, enabled: false };
    }
  }

  return {
    ...doc,
    style: normalizeStyle({ ...style, ...patch, layout: next, layoutMemory }),
    animation,
  };
}

function ensureDocShape(input = {}) {
  const raw = { ...input };
  if (!raw.overlayKey) raw.overlayKey = nanoid(12);
  if (!raw.controlKey) raw.controlKey = nanoid(12);
  const timer = { ...DEFAULT_TIMER, ...(raw.timer || {}) };
  const style = normalizeStyle(raw.style);
  const pagerRaw = { ...DEFAULT_PAGER, ...(raw.pager || {}) };
  const animation = normalizeAnimation(raw.animation, pagerRaw);
  return {
    title: "WinChallenge", items: [], updatedAt: Date.now(),
    ...raw,
    // Sprache des Editors und der Chat-Antworten des Bots (siehe Sprach-Abgleich weiter unten)
    language: raw.language === "en" ? "en" : "de",
    overlayKey: raw.overlayKey, controlKey: raw.controlKey,
    controlPermissions: { ...DEFAULT_PERMISSIONS, ...(raw.controlPermissions || {}) },
    chatCommands: normalizeChatCommands(raw.chatCommands),
    timer, style, animation,
  };
}

// --- UI COMPONENTS ---

// Aussehen des Editors: getrennte Tonflächen auf dunklem Grund statt einer Fläche mit
// Trennlinien. Leiste, Bearbeitungsfläche und Bühne sind je eine Fläche mit Lücke
// dazwischen; innerhalb einer Fläche trennt nur Abstand. Eingaben sind gefüllt statt
// umrandet, Schalter und Regler sind eigene Elemente statt der Browser-Standardformen.
const PANEL = "bg-[#13131b] rounded-md ring-1 ring-white/[0.07]";
// Gold steht für alles, was mit Gewinnen zu tun hat (Marke, aktiver Reiter, Fortschritt) —
// derselbe Wert wie --wc-gold in ui/wcTheme.css. Violett bleibt die Farbe der Aktionen.
const GOLD = "#f5c542";
const LABEL = "text-[11px] font-semibold text-white/45 uppercase tracking-wider";
const INPUT =
  "w-full bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.09] rounded-sm px-3 py-2 text-sm text-white placeholder-white/25 outline-none ring-1 ring-transparent focus:ring-violet-500 transition-colors";
const BTN_PRIMARY = "bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-sm transition-colors";
const BTN_QUIET = "bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white rounded-sm transition-colors";

// Hintergründe der Bühne. „Kariert“ ist das Zeichen für durchsichtig, wie in jedem
// Bildprogramm: das Overlay liegt später über dem Spielbild, nicht auf einer Farbe.
const STAGE_BACKGROUNDS = {
  checker: { background: "repeating-conic-gradient(#17171f 0% 25%, #101016 0% 50%) 50% / 24px 24px" },
  dark: { background: "#09090b" },
  light: { background: "#e5e7eb" },
};

/** Eine Einstellung: Name links, Bedienelement rechts. */
const SettingRow = ({ label, children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 py-2">
    <span className="text-sm text-white/70">{label}</span>
    {children}
  </div>
);

/** Ein/Aus-Schalter mit Beschriftung. Eckig wie die übrigen Elemente, keine Pille. */
const Switch = ({ label, hint, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 py-2 cursor-pointer select-none">
    <span className="min-w-0">
      <span className="block text-sm text-white/80">{label}</span>
      {hint && <span className="block text-xs text-white/40 mt-0.5">{hint}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 shrink-0 rounded-sm transition-colors ${checked ? "bg-violet-600" : "bg-white/15"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-[2px] bg-white transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  </label>
);

// Der Griff des Reglers muss je Browser-Engine einzeln gestaltet werden
const RANGE_THUMB =
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-[3px] [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-[3px] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white";

/** Regler mit gefüllter Spur bis zum Griff und dem Wert dahinter. */
const RangeSlider = ({ label, value, min, max, step, onChange, unit = "" }) => {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <SettingRow label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={label}
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          // Harte Kante statt Verlauf: links vom Griff Akzent, rechts die leere Spur
          style={{ background: `linear-gradient(to right, #8b5cf6 ${pct}%, rgba(255,255,255,0.12) ${pct}%)` }}
          className={`flex-1 min-w-0 h-1 rounded-sm appearance-none cursor-pointer ${RANGE_THUMB}`}
        />
        <span className="w-14 text-right text-sm text-white tabular-nums">{value}{unit}</span>
      </div>
    </SettingRow>
  );
};

/** Auswahl aus wenigen festen Werten (Unterreiter, Zähler-Anzeige, Ausrichtung, …). */
const Segmented = ({ label, options, value, onChange }) => (
  <div className="flex bg-white/[0.06] rounded-sm p-0.5" role="group" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        aria-pressed={value === o.value}
        className={`flex-1 px-2 py-1.5 rounded-[3px] text-xs font-bold whitespace-nowrap transition-colors ${value === o.value ? "bg-white/15 text-white" : "text-white/45 hover:text-white"}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** Farbfeld mit Namen darunter — sechs davon passen in eine Reihe. */
const ColorPicker = ({ label, value, onChange }) => (
  <label className="flex flex-col items-center gap-1.5 cursor-pointer">
    <span className="relative w-full h-8 rounded-sm overflow-hidden ring-1 ring-white/15">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute -top-4 -left-4 w-[200%] h-20 cursor-pointer p-0 border-0"
      />
    </span>
    <span className="text-[11px] text-white/55">{label}</span>
  </label>
);

// Farbvorlagen: stylePresets.js (auch von der Overlay-Galerie auf /tools genutzt)

/**
 * Eine Farbvorlage als winziges Overlay: Kopf mit Akzentblock, zwei Zeilen. Klein
 * genug, dass alle sechs in eine Reihe passen.
 */
const PresetSwatch = ({ style }) => (
  <div className="h-9 rounded-[3px] overflow-hidden flex flex-col ring-1 ring-black/40">
    <div className="flex-1 flex" style={{ background: style.headerBg }}>
      <span className="w-2.5" style={{ background: style.accent }} />
      <span className="self-center ml-1.5 h-[3px] w-5 rounded-[1px]" style={{ background: style.titleColor }} />
    </div>
    <div className="flex-[1.6] flex flex-col justify-center gap-[3px] pl-1.5" style={{ background: style.itemBg }}>
      <span className="h-[2px] w-7 rounded-[1px]" style={{ background: style.textColor, opacity: 0.75 }} />
      <span className="h-[2px] w-5 rounded-[1px]" style={{ background: style.textColor, opacity: 0.75 }} />
    </div>
  </div>
);

/** Schematische Zeichnung eines Overlay-Stils (siehe OVERLAY_LAYOUTS). */
const StyleSketch = ({ kind }) => {
  if (kind === "broadcast") {
    return (
      <div className="w-full flex flex-col gap-1">
        <div className="flex items-stretch gap-1 h-3">
          <span className="w-4 bg-violet-500 rounded-[1px]" />
          <span className="flex-1 bg-white/45 rounded-[1px]" />
        </div>
        <div className="h-5 bg-white/15 rounded-[1px]" />
      </div>
    );
  }
  if (kind === "bar") {
    return (
      <div className="w-full flex items-stretch gap-px h-3">
        <span className="w-3 bg-violet-500 rounded-l-[1px]" />
        <span className="w-5 bg-white/45" />
        <span className="flex-1 bg-white/15" />
        <span className="flex-1 bg-white/15" />
        <span className="w-4 bg-white/30 rounded-r-[1px]" />
      </div>
    );
  }
  return (
    <div className="w-full flex flex-col gap-px">
      <span className="h-2.5 bg-white/45 rounded-t-[1px]" />
      <span className="h-2 bg-white/15" />
      <span className="h-2 bg-white/15" />
      <span className="h-2 bg-white/30 rounded-b-[1px]" />
    </div>
  );
};

/** Geheimer Link (OBS-Quelle, Moderator-Link) mit Anzeigen, Kopieren und Neu-Erzeugen. */
const SecretLink = ({ value, shown, onToggleShown, copied, onCopy, onRegenerate, t }) => (
  <div>
    <div className="flex gap-2">
      <input readOnly type={shown ? "text" : "password"} className={`${INPUT} flex-1 min-w-0 text-white/70`} value={value} />
      <button onClick={onToggleShown} className={`${BTN_QUIET} px-3`}>{shown ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      <button onClick={onCopy} className={`${BTN_PRIMARY} px-4 text-sm flex items-center gap-2`}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? t.copied : t.copy}
      </button>
    </div>
    <button onClick={onRegenerate} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-2.5">
      <RefreshCw size={12} /> {t.regenerate}
    </button>
  </div>
);

// Aktionen in der zweiten Zeile einer Challenge-Karte: immer sichtbar, aber gedämpft.
// Eingeschaltetes (Zähler an, angepinnt) trägt die Akzentfarbe.
const ROW_ACTION = "h-7 px-1.5 flex items-center gap-1 rounded-sm text-xs font-bold transition-colors";
const ROW_ACTION_OFF = "text-white/45 hover:text-white hover:bg-white/[0.08]";
const ROW_ACTION_ON = "text-violet-300 bg-violet-500/15 hover:bg-violet-500/25";

// Schrittweiten für „Zeit anpassen“ im Timer. Ein einziger Schalter plus ± ersetzt
// die frühere Reihe aus sechs einzelnen Knöpfen.
const TIMER_STEPS = [
  { label: "1 Min", ms: 60000 },
  { label: "10 Min", ms: 600000 },
  { label: "1 Std", ms: 3600000 },
];

// Sprachfassungen der Seite für die hreflang-Verweise (siehe components/SEO.jsx)
const WC_PATH = "/WinChallenge-Overlay";
const WC_ALTERNATES = [
  { hrefLang: "de", path: WC_PATH },
  { hrefLang: "en", path: WC_PATH, search: "?lang=en" },
  { hrefLang: "x-default", path: WC_PATH },
];

// --- MAIN COMPONENT ---

export default function WinChallenge() {
  const { user, login } = useContext(TwitchAuthContext);
  const { lang, t, changeLang, langExplicit } = useWcShell();
  const seo = wcSeo(lang);
  const langSearch = lang === "en" ? "?lang=en" : "";
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const dragIdRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const saveSeqRef = useRef(0);
  const pendingSaveRef = useRef(false);
  const timeSelectPendingRef = useRef(false);

  const [activeTab, setActiveTab] = useState("challenges");
  // Frisch angelegte Challenge, deren Namensfeld nach dem Zeichnen den Fokus bekommt
  const [focusItemId, setFocusItemId] = useState(null);
  useEffect(() => {
    if (!focusItemId) return;
    document.getElementById(`wc-item-${focusItemId}`)?.focus();
    setFocusItemId(null);
  }, [focusItemId]);
  // Unter 768px passt nur eine Spalte: entweder der Editor oder die Vorschau
  const [mobileView, setMobileView] = useState("edit");
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { id, before }
  // Design-Tab: welcher Unterreiter offen ist (Look, Größe, Anzeige, …)
  const [designPane, setDesignPane] = useState("look");
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [controlCopied, setControlCopied] = useState(false);

  const [showOverlayUrl, setShowOverlayUrl] = useState(false);
  const [showControlUrl, setShowControlUrl] = useState(false);

  const [localNow, setLocalNow] = useState(Date.now());
  // Hintergrund der Bühne, siehe STAGE_BACKGROUNDS
  const [previewBg, setPreviewBg] = useState("checker");

  const [newChannel, setNewChannel] = useState("");
  // Zeit direkt in der Anzeige bearbeiten (Klick auf die Uhrzeit)
  const [editingTime, setEditingTime] = useState(false);
  const [manualTime, setManualTime] = useState("");
  const [manualTimeError, setManualTimeError] = useState(false);
  const [timerStep, setTimerStep] = useState(TIMER_STEPS[0].ms);

  // Vorschau: Breite des Containers messen, damit das Overlay passend skaliert wird
  const [previewEl, setPreviewEl] = useState(null);
  const [previewW, setPreviewW] = useState(0);

  const overlayUrl = useMemo(() => doc?.overlayKey ? `${window.location.origin}/WinChallengeOverlay/${doc.overlayKey}` : "", [doc?.overlayKey]);
  const controlUrl = useMemo(() => doc?.controlKey ? `${window.location.origin}/WinChallengeControl/${doc.controlKey}` : "", [doc?.controlKey]);

  useEffect(() => {
    if (!previewEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setPreviewW(e.contentRect.width);
    });
    ro.observe(previewEl);
    return () => ro.disconnect();
  }, [previewEl]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/winchallenge/${user.id}`, { credentials: "include" });
        const data = await res.json();
        const shaped = ensureDocShape(data);
        // Leere Liste: direkt eine Editor-Zeile anzeigen (wird erst beim ersten Edit gespeichert)
        if (!Array.isArray(shaped.items) || shaped.items.length === 0) {
          shaped.items = [makeItem()];
        }
        setDoc(shaped);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, [user]);

  /** Sync externe Änderungen (Chat-Befehle, Control-Link) ohne Reload */
  useEffect(() => {
    if (!user?.id) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/winchallenge/${user.id}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        setDoc((prev) => {
          if (!prev) return ensureDocShape(data);
          const su = Number(data.updatedAt) || 0;
          const pu = Number(prev.updatedAt) || 0;
          if (su <= pu) return prev;
          // Lokale Änderung noch nicht gespeichert → nur Timer übernehmen,
          // sonst würden z. B. Slider-Werte zurückspringen
          if (pendingSaveRef.current) {
            return ensureDocShape({
              ...prev,
              timer: { ...DEFAULT_TIMER, ...(data.timer || {}) },
              updatedAt: su,
              refreshNonce:
                data.refreshNonce != null ? data.refreshNonce : prev.refreshNonce,
            });
          }
          // Kein lokaler Edit ausstehend → kompletten Server-Stand übernehmen
          // (z. B. wenn Mods per !pin / Control-Link Challenges geändert haben)
          const shaped = ensureDocShape(data);
          if (!Array.isArray(shaped.items) || shaped.items.length === 0) {
            shaped.items = [makeItem()];
          }
          return shaped;
        });
        setLocalNow(Date.now());
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(t);
  }, [user?.id]);

  useEffect(() => () => saveTimeoutRef.current && clearTimeout(saveTimeoutRef.current), []);

  const saveToServer = async (payload, seq) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/winchallenge/${user.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const j = await res.json();
        // Keine neueren lokalen Änderungen mehr → Editor gilt wieder als "synchron"
        if (seq != null && saveSeqRef.current === seq) {
          pendingSaveRef.current = false;
        }
        setDoc((prev) => {
          if (!prev) return ensureDocShape(j);
          // Gab es inzwischen neuere lokale Änderungen (z. B. Slider wird noch gezogen),
          // darf die Server-Antwort den lokalen Stand NICHT überschreiben — sonst springt der Regler zurück.
          if (seq != null && saveSeqRef.current !== seq) {
            return {
              ...prev,
              overlayKey: j.overlayKey ?? prev.overlayKey,
              controlKey: j.controlKey ?? prev.controlKey,
              updatedAt: j.updatedAt ?? prev.updatedAt,
              refreshNonce: j.refreshNonce ?? prev.refreshNonce,
            };
          }
          return ensureDocShape(j);
        });
        setLocalNow(Date.now());
      }
    } catch { /* ignore */ }
  };

  const save = (nextRaw, opts = {}) => {
    const next = ensureDocShape(nextRaw);
    setDoc(next);
    pendingSaveRef.current = true;
    saveSeqRef.current += 1;
    const seq = saveSeqRef.current;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (opts.flush) {
      saveToServer(next, seq);
      return;
    }
    saveTimeoutRef.current = setTimeout(() => saveToServer(next, seq), 350);
  };

  // Aus der Overlay-Galerie (/tools): ?vorlage=<id> nach dem ersten Laden einmal übernehmen, speichern und aus der
  // Adresse nehmen — andere Parameter (?lang=) bleiben stehen
  const vorlageDoneRef = useRef(false);
  useEffect(() => {
    if (!doc || vorlageDoneRef.current) return;
    vorlageDoneRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const preset = STYLE_PRESETS.find((p) => p.id === params.get("vorlage"));
    if (!preset) return;
    save({ ...doc, style: normalizeStyle({ ...doc.style, ...preset.style }) }, { flush: true });
    params.delete("vorlage");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps

  const doFullReset = async () => {
    if (!user || !window.confirm(t.resetConfirm)) return;
    try {
      const res = await fetch(`/api/winchallenge/${user.id}?reset=1`, { method: "PUT", credentials: "include" });
      const fresh = await res.json();
      const shaped = ensureDocShape(fresh);
      if (!Array.isArray(shaped.items) || shaped.items.length === 0) {
        shaped.items = [makeItem()];
      }
      setDoc(shaped);
      setActiveTab("challenges");
    } catch { /* ignore */ }
  };

  const regenerateOverlayKey = () => save({ ...doc, overlayKey: nanoid(12) }, { flush: true });
  const regenerateControlKey = () => save({ ...doc, controlKey: nanoid(12) }, { flush: true });

  // Logic Wrapper
  const updateItem = (id, patch) => save({ ...doc, items: (doc?.items || []).map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const removeItem = (id) => {
    const rest = (doc?.items || []).filter((i) => i.id !== id);
    // Nie ganz leer: es bleibt immer mindestens eine Editor-Zeile stehen
    save({ ...doc, items: rest.length ? rest : [makeItem()] });
  };
  /** Neue Challenge hinter `afterId` (ohne Angabe: ans Ende) — der Cursor springt hinein. */
  const addItemAfter = (afterId) => {
    const fresh = makeItem();
    const list = [...(doc?.items || [])];
    const idx = list.findIndex((x) => x.id === afterId);
    list.splice(idx < 0 ? list.length : idx + 1, 0, fresh);
    save({ ...doc, items: list });
    setFocusItemId(fresh.id);
  };
  const addItem = () => addItemAfter(null);

  // DnD — draggingId/dropTarget steuern nur die Optik, verschoben wird in onDrop.
  const onDragStart = (id) => (e) => {
    dragIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    // Firefox startet ohne gesetzte Daten gar keinen Drag
    try { e.dataTransfer.setData("text/plain", id); } catch { /* egal */ }
  };

  const onDragOver = (id) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragIdRef.current || dragIdRef.current === id) return;
    // Obere oder untere Hälfte der Zeile entscheidet, wo die Linie erscheint
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDropTarget((prev) =>
      prev && prev.id === id && prev.before === before ? prev : { id, before }
    );
  };

  const endDrag = () => {
    dragIdRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  };

  const onDrop = (id) => (e) => {
    e.preventDefault();
    const from = dragIdRef.current;
    const before = dropTarget?.id === id ? dropTarget.before : false;
    if (!from || !id || from === id) { endDrag(); return; }

    const list = [...(doc?.items || [])];
    const fromIdx = list.findIndex((x) => x.id === from);
    const toIdx = list.findIndex((x) => x.id === id);
    if (fromIdx < 0 || toIdx < 0) { endDrag(); return; }

    const [moved] = list.splice(fromIdx, 1);
    // Nach dem Herausnehmen verschiebt sich alles hinter fromIdx um eins nach vorn
    let insertAt = list.findIndex((x) => x.id === id);
    if (insertAt < 0) insertAt = list.length;
    list.splice(before ? insertAt : insertAt + 1, 0, moved);

    save({ ...doc, items: list });
    endDrag();
  };

  /** Reihenfolge per Tastatur ändern — Drag&Drop ist nicht für jeden bedienbar. */
  const moveItem = (id, delta) => {
    const list = [...(doc?.items || [])];
    const idx = list.findIndex((x) => x.id === id);
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= list.length) return;
    [list[idx], list[next]] = [list[next], list[idx]];
    save({ ...doc, items: list });
  };

  // Timer — Aktionen werden sofort gespeichert (flush), damit Overlay/Mods nicht hinterherhängen
  const startTimer = () => { const base = doc?.timer?.elapsedMs || 0; save({ ...doc, timer: { ...(doc?.timer || {}), running: true, startedAt: Date.now() - base, elapsedMs: base } }, { flush: true }); };
  const pauseTimer = () => { if (!doc?.timer?.running) return; const elapsed = Date.now() - (doc?.timer?.startedAt || 0); save({ ...doc, timer: { ...(doc?.timer || {}), running: false, startedAt: 0, elapsedMs: elapsed } }, { flush: true }); };
  const resetTimer = () => save({ ...doc, timer: { ...DEFAULT_TIMER, visible: doc?.timer?.visible ?? true } }, { flush: true });
  const adjustTimer = (deltaMs) => {
    if (!doc?.timer) return;
    const t = doc.timer;
    const currentElapsed = t.running ? Date.now() - (t.startedAt || 0) : t.elapsedMs || 0;
    let nextElapsed = Math.max(0, currentElapsed + deltaMs);
    const updatedTimer = { ...t, elapsedMs: nextElapsed };
    if (t.running) updatedTimer.startedAt = Date.now() - nextElapsed;
    save({ ...doc, timer: updatedTimer }, { flush: true });
  };
  const toggleTimerVisible = () => {
    const visible = doc?.timer?.visible !== false;
    save({ ...doc, timer: { ...(doc?.timer || {}), visible: !visible } }, { flush: true });
  };
  /** Übernimmt die eingetippte Zeit. true = übernommen, false = ungültiges Format. */
  const applyManualTime = () => {
    const ms = parseClockInput(manualTime);
    if (ms == null) { setManualTimeError(true); return false; }
    setManualTimeError(false);
    const t = doc?.timer || {};
    const next = { ...t, elapsedMs: ms };
    if (t.running) next.startedAt = Date.now() - ms;
    save({ ...doc, timer: next }, { flush: true });
    setManualTime("");
    return true;
  };

  useEffect(() => { if (!doc?.timer?.running) return; const iv = setInterval(() => setLocalNow(Date.now()), 500); return () => clearInterval(iv); }, [doc?.timer?.running]);
  const running = !!doc?.timer?.running;
  const runningElapsed = running ? localNow - (doc?.timer?.startedAt || 0) : (doc?.timer?.elapsedMs || 0);
  const timerVisible = doc?.timer?.visible !== false;

  // Aufklappfeld der Timer-Leiste (Zeit anpassen, Sichtbarkeit): schließt bei
  // einem Klick daneben und mit Esc.
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const timerMenuRef = useRef(null);
  useEffect(() => {
    if (!timerMenuOpen) return;
    const onDown = (e) => { if (!timerMenuRef.current?.contains(e.target)) setTimerMenuOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setTimerMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [timerMenuOpen]);

  const handleCopy = (text, which) => {
    if (!text) return; navigator.clipboard.writeText(text).catch(() => {});
    if (which === "overlay") { setOverlayCopied(true); setTimeout(() => setOverlayCopied(false), 1200); }
    else if (which === "control") { setControlCopied(true); setTimeout(() => setControlCopied(false), 1200); }
  };

  // Chat-Kanäle
  const chatChannels = useMemo(() => {
    const cc = doc?.chatCommands;
    if (!cc) return [];
    if (Array.isArray(cc.channels) && cc.channels.length) return cc.channels;
    return cc.channel ? [cc.channel] : [];
  }, [doc?.chatCommands]);

  const commitChannels = (arr) => {
    save({
      ...doc,
      chatCommands: {
        ...DEFAULT_CHAT_COMMANDS,
        ...doc.chatCommands,
        channels: arr,
        channel: arr[0] || "",
      },
    });
  };

  const addChannel = () => {
    const c = normalizeChannelName(newChannel);
    if (!c || chatChannels.includes(c) || chatChannels.length >= MAX_CHAT_CHANNELS) return;
    commitChannels([...chatChannels, c]);
    setNewChannel("");
  };

  const removeChannel = (c) => commitChannels(chatChannels.filter((x) => x !== c));

  // Sprache: Die Wahl oben rechts gilt auch für die Chat-Antworten des Bots und wird deshalb im
  // Overlay gespeichert. Beim Öffnen gewinnt eine ausdrückliche Wahl (URL, Browser-Speicher),
  // sonst die gespeicherte. Ändert sie sich später an anderer Stelle (zweites Gerät), zieht
  // dieser Editor nach — zurückgeschrieben wird nur, wenn HIER umgeschaltet wurde, sonst
  // würden zwei offene Editoren die Sprache endlos hin- und herschalten.
  const prevLangRef = useRef(lang);
  const langSyncedRef = useRef(false);
  const docLanguage = doc?.language;
  useEffect(() => {
    if (!docLanguage) return;
    const langChanged = prevLangRef.current !== lang;
    prevLangRef.current = lang;
    const firstSync = !langSyncedRef.current;
    langSyncedRef.current = true;
    if (docLanguage === lang) return;
    if (langChanged || (firstSync && langExplicit)) save({ ...doc, language: lang }, { flush: true });
    else changeLang(docLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, docLanguage]);

  // Vorschau: dieselbe Komponente wie das OBS-Overlay (OverlayView), nur passend in die
  // Spalte verkleinert. Verkleinert wird per transform — die gemessene Größe bleibt davon
  // unberührt, und die Laufschrift rechnet darin genauso wie im echten Overlay.
  const [frameEl, setFrameEl] = useState(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!frameEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setFrameSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(frameEl);
    return () => ro.disconnect();
  }, [frameEl]);

  const previewScale = doc?.style?.scale || 1;
  const previewIsBar = doc?.style?.layout === "bar";
  // Bis zur ersten Messung gilt die eingestellte Breite (die Leiste hat keine)
  const previewNaturalW = frameSize.w || (previewIsBar ? 600 : doc?.style?.boxWidth || 320);
  const previewAvail = Math.max(0, previewW - 32);
  // Die Leiste ist meist viel breiter als die Spalte. Ganz eingepasst wäre sie unlesbar
  // klein — sie wird deshalb höchstens auf 60 % verkleinert und lässt sich seitlich scrollen.
  const previewFit = Math.max(
    previewIsBar ? 0.6 : 0,
    previewAvail > 0 ? Math.min(1, previewAvail / (previewNaturalW * previewScale)) : 1
  );
  const previewFitPercent = doc && previewW ? Math.round(previewFit * 100) : null;

  const renderPreview = () => {
    if (!doc) return null;
    const namedItems = (doc.items || []).filter((i) => (i.name || "").trim());
    // Ohne eigene Challenges zeigt die Vorschau zwei Beispiele statt eines leeren Rahmens
    const previewDoc = namedItems.length > 0
      ? doc
      : { ...doc, items: [{ id: "p1", name: t.sampleA, pinned: true }, { id: "p2", name: t.sampleB, useWins: true, target: 3, progress: 1 }] };
    const zoom = previewScale * previewFit;

    return (
      // margin:auto statt justify/items-center: zentriert, solange Platz ist, und
      // beginnt sonst oben — die Vorschau scrollt, statt an beiden Enden abgeschnitten
      // zu werden.
      <div ref={setPreviewEl} className="flex-1 min-h-0 flex p-4 overflow-auto custom-scrollbar" style={STAGE_BACKGROUNDS[previewBg]}>
        {/* Der äußere Kasten hält den Platz der verkleinerten Fassung frei */}
        <div style={{ position: "relative", width: frameSize.w * zoom, height: frameSize.h * zoom, margin: "auto", flexShrink: 0 }}>
          <div ref={setFrameEl} style={{ position: "absolute", top: 0, left: 0, width: "max-content", transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <OverlayView doc={previewDoc} timerMs={runningElapsed} />
          </div>
        </div>
      </div>
    );
  };

  /** Welche Vorlage entspricht den aktuellen Farben? (null = eigene Mischung) */
  const activePresetId = useMemo(() => {
    if (!doc?.style) return null;
    const match = STYLE_PRESETS.find((p) =>
      Object.entries(p.style).every(
        ([k, v]) => hex3to6(doc.style[k])?.toLowerCase() === v.toLowerCase()
      )
    );
    return match?.id || null;
  }, [doc?.style]);

  // Ohne Login gibt es nichts zu bearbeiten — dann zeigt die Seite, was das Overlay
  // überhaupt kann. Das ist zugleich die einzige Fassung, die Suchmaschinen je zu
  // sehen bekommen (der Crawler ist nie angemeldet), deshalb hängen die
  // strukturierten Daten zu Fragen und Einrichtung genau hier dran: FAQPage und HowTo
  // dürfen nur ausgezeichnet werden, wenn derselbe Text sichtbar auf der Seite steht.
  if (!user) {
    return (
      <div className="h-full overflow-y-auto custom-scrollbar text-white">
        <SEO
          title={seo.title}
          description={seo.description}
          path={WC_PATH} search={langSearch} lang={lang} alternates={WC_ALTERNATES}
          keywords={seo.keywords}
          jsonLd={buildWinChallengeJsonLd(lang)} />

        <WinChallengeSeoContent lang={lang}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button onClick={() => login()} className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-6 py-3.5 rounded-sm transition-colors">
              {t.loginCta}
            </button>
            <p className="text-white/40 text-sm">{t.loginHint}</p>
          </div>
        </WinChallengeSeoContent>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-white">
      <SEO
        title={seo.title}
        description={seo.description}
        path={WC_PATH} search={langSearch} lang={lang} alternates={WC_ALTERNATES}
        keywords={seo.keywords} />

      {loading || !doc ? (
        <div className="h-full flex items-center justify-center text-white/30">{t.loading}</div>
      ) : (
        // Drei Tonflächen auf dem dunklen Grund der Hülle (ui/WcShell.jsx): die Leiste mit
        // Tabs und Timer, links die Bearbeitungsfläche, rechts die Bühne mit der Vorschau.
        // In der Breite gedeckelt und zentriert — auf breiten Monitoren lägen Name und
        // Aktionen einer Zeile sonst einen halben Meter auseinander.
        <div className="flex-1 min-h-0 w-full max-w-[1400px] mx-auto flex flex-col gap-2 lg:gap-3 p-2 lg:p-4 xl:py-6">

          {/* LEISTE: Tabs, daneben der Timer und der OBS-Link — beides immer griffbereit.
              Auf dem Handy rutschen Timer und Link in eine eigene Zeile darunter. */}
          <div className={`${PANEL} flex flex-col md:flex-row md:items-stretch shrink-0`}>
            <div className="flex md:flex-1 min-w-0 overflow-x-auto px-1">
              {[
                { id: "challenges", label: t.tabChallenges, icon: ListChecks },
                { id: "custom", label: t.tabDesign, icon: Palette },
                { id: "chat", label: t.tabChat, icon: MessageSquare },
                { id: "setup", label: t.tabSetup, icon: Settings },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMobileView("edit"); }}
                  className={`relative flex items-center gap-2 px-4 py-3.5 text-sm font-bold whitespace-nowrap transition-colors ${
                    activeTab === tab.id ? "text-white" : "text-white/40 hover:text-white"
                  }`}
                >
                  <tab.icon size={16} className={activeTab === tab.id ? "" : "opacity-50"} style={activeTab === tab.id ? { color: GOLD } : undefined} />
                  {tab.label}
                  {activeTab === tab.id && <span className="absolute bottom-0 left-3 right-3 h-0.5" style={{ background: GOLD }} />}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 px-2 pb-2 md:py-2 shrink-0">

              {/* TIMER — Start/Pause, Zeit, Reset als eine Einheit. Alles Seltenere steckt im Aufklappfeld. */}
              <div ref={timerMenuRef} className="relative flex items-center gap-0.5 flex-1 md:flex-none bg-black/30 rounded-sm p-0.5">
                {!running ? (
                  <button onClick={startTimer} title={t.start} aria-label={t.start} className="w-8 h-8 shrink-0 flex items-center justify-center bg-green-600 hover:bg-green-500 text-white rounded-[3px] transition-colors">
                    <Play size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button onClick={pauseTimer} title={t.pause} aria-label={t.pause} className="w-8 h-8 shrink-0 flex items-center justify-center bg-amber-500 hover:bg-amber-400 text-black rounded-[3px] transition-colors">
                    <Pause size={14} fill="currentColor" />
                  </button>
                )}

                {/* Uhrzeit — anklicken zum direkten Bearbeiten (Enter übernimmt, Esc bricht ab) */}
                <input
                  type="text"
                  aria-label={t.timeAria}
                  title={t.timeTitle}
                  value={editingTime ? manualTime : msToClock(runningElapsed)}
                  onFocus={(e) => {
                    setManualTime(msToClock(runningElapsed));
                    setManualTimeError(false);
                    setEditingTime(true);
                    e.target.select();
                    // Der Mausklick würde die Markierung beim Loslassen sofort wieder aufheben
                    timeSelectPendingRef.current = true;
                  }}
                  onMouseUp={(e) => {
                    if (timeSelectPendingRef.current) {
                      e.preventDefault();
                      timeSelectPendingRef.current = false;
                    }
                  }}
                  onChange={(e) => { setManualTime(e.target.value); setManualTimeError(false); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (applyManualTime()) e.target.blur();
                    } else if (e.key === "Escape") {
                      e.target.blur();
                    }
                  }}
                  onBlur={() => {
                    timeSelectPendingRef.current = false;
                    setEditingTime(false);
                    setManualTimeError(false);
                  }}
                  className={`w-[6.5rem] h-8 mx-0.5 bg-transparent text-center text-lg font-semibold tabular-nums rounded-[3px] outline-none ring-1 transition-colors ${
                    manualTimeError
                      ? "text-red-400 ring-red-500/60"
                      : editingTime
                        ? "text-white ring-violet-500 bg-white/[0.06]"
                        : "text-white ring-transparent hover:bg-white/[0.06]"
                  }`}
                />
                {manualTimeError && (
                  <p className="absolute left-0 top-full mt-1.5 z-20 px-2 py-1 bg-[#1c1c27] ring-1 ring-red-500/40 rounded-sm text-[11px] text-red-400 whitespace-nowrap">{t.timeFormat}</p>
                )}

                <button onClick={resetTimer} title={t.reset} aria-label={t.reset} className="w-8 h-8 shrink-0 flex items-center justify-center rounded-[3px] text-white/45 hover:text-white hover:bg-white/10 transition-colors">
                  <RotateCcw size={15} />
                </button>
                <button
                  onClick={() => setTimerMenuOpen((o) => !o)}
                  aria-expanded={timerMenuOpen}
                  title={t.timerMore}
                  aria-label={t.timerMore}
                  className={`h-8 px-1.5 shrink-0 flex items-center gap-1 rounded-[3px] transition-colors ${timerMenuOpen ? "bg-white/15 text-white" : "text-white/45 hover:text-white hover:bg-white/10"}`}
                >
                  {/* Ausgeblendet ist der Zustand, den man sonst übersieht — deshalb steht er in der Leiste */}
                  {!timerVisible && <EyeOff size={14} className="text-amber-300" />}
                  <ChevronDown size={15} />
                </button>

                {timerMenuOpen && (
                  <div className="absolute left-0 md:left-auto md:right-0 top-full mt-1.5 z-20 w-72 px-3 py-2 bg-[#1c1c27] rounded-md shadow-xl shadow-black/50">
                    {/* Zeit anpassen — Schrittweite wählen, dann ± */}
                    <div className="grid grid-cols-[auto_1fr_auto] gap-1.5 py-1">
                      <button onClick={() => adjustTimer(-timerStep)} title={t.subtractTime} aria-label={t.subtractTime} className={`${BTN_QUIET} px-3 flex items-center`}>
                        <Minus size={16} />
                      </button>
                      <Segmented
                        label={t.stepAria}
                        value={timerStep}
                        onChange={setTimerStep}
                        options={TIMER_STEPS.map((s, i) => ({ value: s.ms, label: t.steps[i] || s.label }))}
                      />
                      <button onClick={() => adjustTimer(timerStep)} title={t.addTime} aria-label={t.addTime} className={`${BTN_QUIET} px-3 flex items-center`}>
                        <Plus size={16} />
                      </button>
                    </div>
                    <Switch label={t.timerVisible} checked={timerVisible} onChange={toggleTimerVisible} />
                  </div>
                )}
              </div>

              {/* Ohne Platz nur das Symbol, damit Tabs und Timer nicht gequetscht werden */}
              <button
                onClick={() => handleCopy(overlayUrl, "overlay")}
                aria-label={t.copySource}
                title={t.copySource}
                className={`${BTN_PRIMARY} h-9 xl:w-52 px-3 xl:px-0 flex items-center justify-center gap-2 text-sm`}
              >
                {overlayCopied ? <Check size={16} /> : <Copy size={16} />}
                <span className="hidden xl:inline">{overlayCopied ? t.copied : t.copySource}</span>
              </button>
            </div>
          </div>

          {/* KÖRPER */}
          <div className="flex-1 flex gap-2 lg:gap-3 min-h-0">

            {/* LINKS: Bearbeitungsfläche. Kopfbereiche stehen fest, nur der Inhalt darunter scrollt. */}
            <div className={`${PANEL} flex-[1.4] min-w-0 md:max-w-[640px] flex-col min-h-0 ${mobileView === "live" ? "hidden md:flex" : "flex"}`}>

              {/* 1. CHALLENGES — oben der Titel wie eine Überschrift, darunter die Liste */}
              {activeTab === "challenges" && (() => {
                const progress = overallProgress((doc.items || []).filter((i) => (i.name || "").trim()));
                return (
                  <>
                    <div className="px-5 pt-4 pb-3 shrink-0">
                      {/* Der Titel ist ein sichtbares Eingabefeld mit Beschriftung und Stift —
                          als bloße Überschrift hat man ihm nicht angesehen, dass er sich ändern lässt. */}
                      <label htmlFor="wc-title" className={`${LABEL} block mb-1.5`}>{t.titleLabel}</label>
                      <div className="relative">
                        <input
                          id="wc-title"
                          className="w-full pl-3 pr-10 py-2 bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.09] rounded-sm text-xl font-bold tracking-tight text-white placeholder-white/25 outline-none ring-1 ring-transparent focus:ring-violet-500 transition-colors"
                          value={doc.title || ""}
                          onChange={(e) => save({ ...doc, title: e.target.value })}
                          placeholder="WinChallenge"
                        />
                        <Pencil size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
                      </div>
                      <div className="flex items-center justify-between gap-3 mt-3">
                        <span className="text-sm text-white/45 tabular-nums">{t.progressLine(progress.done, progress.total)}</span>
                        {/* Die häufigste Aktion: gefüllt und immer sichtbar, auch bei langer Liste */}
                        <button onClick={addItem} className={`${BTN_PRIMARY} px-3.5 py-2 text-sm flex items-center gap-2`}>
                          <Plus size={16} /> {t.addShort}
                        </button>
                      </div>
                      {/* Ein Segment je Challenge, erledigte in Gold — der Stand auf einen Blick */}
                      {progress.total > 0 && (
                        <div className="flex gap-1 mt-3" aria-hidden="true">
                          {Array.from({ length: progress.total }).map((_, i) => (
                            <span key={i} className="h-1.5 flex-1 rounded-[1px] transition-colors" style={{ background: i < progress.done ? GOLD : "rgba(255,255,255,0.1)" }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Eine Karte je Challenge, mit Lücke dazwischen. Alles, was sich an einer
                        Challenge einstellen lässt, steht dauerhaft da — als die Aktionen erst beim
                        Überfahren erschienen, hat man sie (und das Cover) nicht gefunden. Damit es
                        trotzdem ruhig bleibt: eine Tonfläche je Karte, keine Kästen in der Karte,
                        die Aktionen gedämpft in einer eigenen zweiten Zeile. Der Streifen links
                        zeigt den Zustand: grün erledigt, violett angepinnt. */}
                    <div
                      className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-1.5"
                      onDragEnd={endDrag}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
                    >
                      {(doc.items || []).map((it, idx) => {
                        const done = it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
                        const isDragging = draggingId === it.id;
                        const dropBefore = dropTarget?.id === it.id && dropTarget.before;
                        const dropAfter = dropTarget?.id === it.id && !dropTarget.before;
                        const isLast = idx === (doc.items || []).length - 1;
                        let tone = "border-white/10 bg-white/[0.04] hover:bg-white/[0.06] focus-within:bg-white/[0.06]";
                        if (isDragging) tone = "border-violet-500 bg-violet-500/10 opacity-40";
                        else if (done) tone = "border-green-500/70 bg-green-500/[0.06] hover:bg-green-500/[0.09] focus-within:bg-green-500/[0.09]";
                        else if (it.pinned) tone = "border-violet-500/80 bg-white/[0.04] hover:bg-white/[0.06] focus-within:bg-white/[0.06]";
                        return (
                          <div key={it.id} onDragOver={onDragOver(it.id)} onDrop={onDrop(it.id)} className="relative">
                            {/* Einfügemarke: zeigt vor dem Loslassen, wo die Challenge landet */}
                            <div className={`absolute -top-1 left-0 right-0 h-0.5 z-10 transition-opacity ${dropBefore ? "bg-violet-500 opacity-100" : "opacity-0"}`} />
                            <div className={`absolute -bottom-1 left-0 right-0 h-0.5 z-10 transition-opacity ${dropAfter ? "bg-violet-500 opacity-100" : "opacity-0"}`} />

                            <div className={`flex items-stretch gap-2.5 rounded-sm border-l-2 pl-1 pr-2.5 py-2 transition-colors ${tone}`}>
                              <div
                                draggable
                                onDragStart={onDragStart(it.id)}
                                onDragEnd={endDrag}
                                title={t.dragToSort}
                                className={`shrink-0 self-center p-1 rounded-sm transition-colors ${isDragging ? "cursor-grabbing text-violet-400" : "cursor-grab text-white/25 hover:text-white/70 hover:bg-white/5"}`}
                              >
                                <GripVertical size={18} />
                              </div>

                              {/* Spielcover: steht im Overlay klein vor dem Namen */}
                              <GameCoverPicker
                                icon={it.icon}
                                onChange={(icon) => updateItem(it.id, { icon })}
                                t={t}
                                size="lg"
                              />

                              <div className="flex-1 min-w-0 flex flex-col justify-between gap-1">
                                {/* Zeile 1: Name und Stand */}
                                <div className="flex items-center gap-2">
                                  <input
                                    id={`wc-item-${it.id}`}
                                    className={`flex-1 min-w-0 bg-transparent text-base font-semibold placeholder-white/25 focus:outline-none truncate transition-colors ${done ? "text-white/55 focus:text-white" : "text-white"}`}
                                    placeholder={t.namePlaceholder}
                                    value={it.name}
                                    onChange={(e) => updateItem(it.id, { name: e.target.value })}
                                    // Enter legt direkt darunter die nächste Challenge an — eine Liste
                                    // lässt sich so eintippen, ohne zur Maus zu greifen
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItemAfter(it.id); } }}
                                  />

                                  {/* Bei Zählern steht das Ziel direkt hinter dem Schrägstrich und
                                      lässt sich dort ändern. */}
                                  {it.useWins ? (
                                    <div className="shrink-0 flex items-center bg-black/30 rounded-sm overflow-hidden">
                                      <button onClick={() => updateItem(it.id, { progress: Math.max(0, (it.progress || 0) - 1) })} className="px-2.5 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors">−</button>
                                      <span className={`min-w-6 text-right font-bold text-sm tabular-nums ${done ? "text-green-400" : "text-white"}`}>{it.progress || 0}</span>
                                      <span className="px-1 text-sm text-white/30">/</span>
                                      <input
                                        type="number"
                                        min={1}
                                        aria-label={t.target}
                                        title={t.target}
                                        className="w-7 bg-transparent text-sm tabular-nums text-white/60 focus:text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                        value={it.target || 1}
                                        onChange={(e) => updateItem(it.id, { target: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                                      />
                                      <button onClick={() => updateItem(it.id, { progress: (it.progress || 0) + 1 })} className="px-2.5 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors">+</button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => updateItem(it.id, { done: !it.done })}
                                      aria-pressed={!!it.done}
                                      className={`shrink-0 h-7 px-2.5 flex items-center gap-1.5 rounded-sm text-xs font-bold transition-colors ${it.done ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-black/30 text-white/50 hover:text-white hover:bg-white/10"}`}
                                    >
                                      <Check size={14} strokeWidth={3} className={it.done ? "" : "opacity-40"} />
                                      {it.done ? t.done : t.open}
                                    </button>
                                  )}
                                </div>

                                {/* Zeile 2: Einstellungen links, Reihenfolge und Löschen rechts */}
                                <div className="flex items-center gap-0.5 -ml-1.5">
                                  <button
                                    onClick={() => updateItem(it.id, { useWins: !it.useWins })}
                                    aria-pressed={!!it.useWins}
                                    className={`${ROW_ACTION} ${it.useWins ? ROW_ACTION_ON : ROW_ACTION_OFF}`}
                                  >
                                    <Hash size={13} /> {t.counter}
                                  </button>
                                  <button
                                    onClick={() => updateItem(it.id, { pinned: !it.pinned })}
                                    aria-pressed={!!it.pinned}
                                    className={`${ROW_ACTION} ${it.pinned ? ROW_ACTION_ON : ROW_ACTION_OFF}`}
                                  >
                                    <Pin size={13} /> {it.pinned ? t.pinned : t.pin}
                                  </button>

                                  {/* Tastatur-Alternative zum Ziehen */}
                                  <button onClick={() => moveItem(it.id, -1)} disabled={idx === 0} title={t.moveUp} aria-label={t.moveUp} className={`${ROW_ACTION} ${ROW_ACTION_OFF} ml-auto disabled:opacity-25 disabled:pointer-events-none`}><ChevronUp size={15} /></button>
                                  <button onClick={() => moveItem(it.id, 1)} disabled={isLast} title={t.moveDown} aria-label={t.moveDown} className={`${ROW_ACTION} ${ROW_ACTION_OFF} disabled:opacity-25 disabled:pointer-events-none`}><ChevronDown size={15} /></button>
                                  <button
                                    onClick={() => removeItem(it.id)}
                                    title={t.remove}
                                    aria-label={t.remove}
                                    className={`${ROW_ACTION} text-white/45 hover:text-red-400 hover:bg-red-500/10`}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              {/* 2. DESIGN — Unterreiter statt Aufklapper: es ist immer genau eine Gruppe zu
                  sehen, und keine davon ist länger als die Fläche. Welche Regler es gibt, hängt
                  am Stil: was ein Stil nicht zeigt, wird gar nicht erst angeboten. */}
              {activeTab === "custom" && (() => {
                const layout = doc.style?.layout ?? "list";
                const setStyle = (patch) => save({ ...doc, style: normalizeStyle({ ...doc.style, ...patch }) });
                const setAnimation = (patch) => save({ ...doc, animation: { ...doc.animation, ...patch } });
                const isBar = layout === "bar";
                const animOn = !!doc.animation?.enabled;
                const scrolling = doc.animation?.mode === "scrolling";
                // Laufband: nur die Leiste, und nur dann hat sie eine eingestellte Breite
                const ticker = isBar && animOn && scrolling;
                const panes = [
                  { value: "look", label: t.paneLook },
                  { value: "size", label: t.secSize },
                  { value: "display", label: t.secDisplay },
                  { value: "opacity", label: t.secOpacity },
                  { value: "animation", label: t.secAnimation },
                ];
                const pane = panes.some((p) => p.value === designPane) ? designPane : "look";
                return (
                  <>
                    <div className="px-4 pt-4 shrink-0 overflow-x-auto">
                      <Segmented label={t.tabDesign} value={pane} onChange={setDesignPane} options={panes} />
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4">

                      {/* Look: Stil und Farben */}
                      {pane === "look" && (
                        <div className="space-y-5">
                          <div>
                            <h4 className={`${LABEL} mb-2.5`}>{t.lookStyle}</h4>
                            <div className="grid grid-cols-3 gap-2">
                              {OVERLAY_LAYOUTS.map((id) => {
                                const active = layout === id;
                                return (
                                  <button
                                    key={id}
                                    onClick={() => save(switchLayout(doc, id))}
                                    aria-pressed={active}
                                    className={`rounded-sm p-2.5 text-left ring-1 transition-colors ${active ? "ring-violet-500 bg-violet-500/10" : "ring-transparent bg-white/[0.04] hover:bg-white/[0.08]"}`}
                                  >
                                    <div className="h-10 flex items-center mb-2"><StyleSketch kind={id} /></div>
                                    <span className={`text-xs font-bold ${active ? "text-white" : "text-white/60"}`}>{t.styles[id]}</span>
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-xs text-white/40 mt-2">{t.styleHints[layout]}</p>
                          </div>

                          {/* Erst eine Vorlage, dann bei Bedarf einzeln — beides je eine Reihe */}
                          <div>
                            <h4 className={`${LABEL} mb-2.5`}>{t.secPresets}</h4>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              {STYLE_PRESETS.map((p) => {
                                const active = activePresetId === p.id;
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => setStyle(p.style)}
                                    aria-pressed={active}
                                    className={`rounded-sm p-1.5 text-left ring-1 transition-colors ${active ? "ring-violet-500 bg-violet-500/10" : "ring-transparent hover:bg-white/[0.08]"}`}
                                  >
                                    <PresetSwatch style={p.style} />
                                    <span className={`block mt-1.5 text-[11px] font-semibold truncate ${active ? "text-white" : "text-white/55"}`}>{t.presets[p.id] || p.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <h4 className={`${LABEL} mb-2.5`}>{t.secColors}</h4>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-1.5">
                              <ColorPicker label={t.colHeader} value={hex3to6(doc.style?.headerBg)} onChange={(v) => setStyle({ headerBg: v })} />
                              <ColorPicker label={t.colRows} value={hex3to6(doc.style?.itemBg)} onChange={(v) => setStyle({ itemBg: v })} />
                              <ColorPicker label={t.colFooter} value={hex3to6(doc.style?.boxBg)} onChange={(v) => setStyle({ boxBg: v })} />
                              <ColorPicker label={t.colTitle} value={hex3to6(doc.style?.titleColor)} onChange={(v) => setStyle({ titleColor: v })} />
                              <ColorPicker label={t.colText} value={hex3to6(doc.style?.textColor)} onChange={(v) => setStyle({ textColor: v })} />
                              <ColorPicker label={t.colAccent} value={hex3to6(doc.style?.accent)} onChange={(v) => setStyle({ accent: v })} />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Größe */}
                      {pane === "size" && (
                        <div>
                          {/* Ohne Laufband ist die Leiste so breit wie ihr Inhalt */}
                          {isBar ? (
                            ticker && <RangeSlider label={t.barWidth} value={resolveBarWidth(doc.style)} min={BAR_TICKER_MIN_WIDTH} max={BAR_MAX_WIDTH} step={20} unit="px" onChange={(v) => setStyle({ barWidth: v })} />
                          ) : (
                            <RangeSlider label={t.width} value={Math.min(1000, doc.style?.boxWidth ?? 320)} min={MIN_BOX_WIDTH} max={1000} step={10} unit="px" onChange={(v) => setStyle({ boxWidth: v })} />
                          )}
                          <RangeSlider label={t.scale} value={doc.style?.scale ?? 1} min={0.5} max={2} step={0.05} unit="x" onChange={(v) => setStyle({ scale: v })} />
                          <RangeSlider label={t.titleSize} value={doc.style?.titleFontSize ?? 20} min={12} max={48} step={1} unit="px" onChange={(v) => setStyle({ titleFontSize: v })} />
                          <RangeSlider label={t.itemSize} value={doc.style?.itemFontSize ?? 16} min={10} max={32} step={1} unit="px" onChange={(v) => setStyle({ itemFontSize: v })} />
                          <RangeSlider label={t.timerSize} value={doc.style?.timerFontSize ?? doc.style?.itemFontSize ?? 16} min={10} max={48} step={1} unit="px" onChange={(v) => setStyle({ timerFontSize: v })} />
                          <RangeSlider label={t.radius} value={doc.style?.borderRadius ?? 0} min={0} max={32} step={1} unit="px" onChange={(v) => setStyle({ borderRadius: v })} />
                        </div>
                      )}

                      {/* Anzeige */}
                      {pane === "display" && (
                        <div>
                          {layout === "list" && (
                            <SettingRow label={t.align}>
                              <Segmented
                                label={t.align}
                                value={doc.style?.titleAlign ?? "left"}
                                onChange={(v) => setStyle({ titleAlign: v })}
                                options={[{ value: "left", label: t.alignLeft }, { value: "center", label: t.alignCenter }]}
                              />
                            </SettingRow>
                          )}
                          <SettingRow label={t.headerProgress}>
                            {layout === "list" ? (
                              <Segmented
                                label={t.headerProgress}
                                value={doc.style?.headerProgress ?? "off"}
                                onChange={(v) => setStyle({ headerProgress: v })}
                                options={[{ value: "off", label: t.off }, { value: "count", label: t.number }, { value: "box", label: t.box }]}
                              />
                            ) : (
                              // Die neuen Stile kennen nur eine Form des Gesamtstands
                              <Segmented
                                label={t.headerProgress}
                                value={(doc.style?.headerProgress ?? "off") === "off" ? "off" : "count"}
                                onChange={(v) => setStyle({ headerProgress: v })}
                                options={[{ value: "off", label: t.off }, { value: "count", label: t.on }]}
                              />
                            )}
                          </SettingRow>
                          <SettingRow label={t.counterDisplay}>
                            <Segmented
                              label={t.counterDisplay}
                              value={doc.style?.counterStyle ?? "plain"}
                              onChange={(v) => setStyle({ counterStyle: v })}
                              options={[{ value: "plain", label: t.number }, { value: "box", label: t.box }]}
                            />
                          </SettingRow>
                          {isBar && (
                            <SettingRow label={t.barTimerSide}>
                              <Segmented
                                label={t.barTimerSide}
                                value={doc.style?.barTimerSide === "left" ? "left" : "right"}
                                onChange={(v) => setStyle({ barTimerSide: v })}
                                options={[{ value: "left", label: t.alignLeft }, { value: "right", label: t.alignRight }]}
                              />
                            </SettingRow>
                          )}
                          {isBar && (
                            <Switch label={t.barTitle} checked={doc.style?.barTitle !== false} onChange={(v) => setStyle({ barTitle: v })} />
                          )}
                          <Switch label={t.doneToBottom} checked={!!doc.style?.doneToBottom} onChange={(v) => setStyle({ doneToBottom: v })} />
                        </div>
                      )}

                      {/* Deckkraft — jede Fläche einzeln */}
                      {pane === "opacity" && (
                        <div>
                          <p className="text-xs text-white/40 mb-2">{t.opacityHint}</p>
                          <RangeSlider label={t.colHeader} value={doc.style?.headerOpacity ?? 0.9} min={0} max={1} step={0.05} onChange={(v) => setStyle({ headerOpacity: v })} />
                          <RangeSlider label={t.opRows} value={doc.style?.itemOpacity ?? doc.style?.opacity ?? 0.6} min={0} max={1} step={0.05} onChange={(v) => setStyle({ itemOpacity: v })} />
                          {/* Nur die Box hat eine Füllung — eine reine Zahl hat nichts zum Durchscheinen */}
                          {(doc.style?.counterStyle === "box" || (layout === "list" && doc.style?.headerProgress === "box")) && (
                            <RangeSlider label={t.opCounterBox} value={doc.style?.counterOpacity ?? 0.06} min={0} max={1} step={0.01} onChange={(v) => setStyle({ counterOpacity: v })} />
                          )}
                          {/* Die Sendegrafik hat kein Fußband: der Timer steht im Kopf */}
                          {layout !== "broadcast" && (
                            <RangeSlider label={t.colFooter} value={doc.style?.timerOpacity ?? doc.style?.opacity ?? 0.6} min={0} max={1} step={0.05} onChange={(v) => setStyle({ timerOpacity: v })} />
                          )}
                        </div>
                      )}

                      {/* Durchwechseln */}
                      {pane === "animation" && (
                        <div>
                          <Switch label={t.animEnable} hint={t.animationHint} checked={animOn} onChange={(v) => setAnimation({ enabled: v })} />
                          {animOn && (
                            <>
                              <SettingRow label={t.animKind}>
                                <Segmented
                                  label={t.animKindAria}
                                  value={scrolling ? "scrolling" : "paging"}
                                  onChange={(v) => setAnimation({ mode: v })}
                                  // Bei der Leiste läuft die Laufschrift waagerecht durch — ein Laufband
                                  options={[{ value: "paging", label: t.animPaging }, { value: "scrolling", label: isBar ? t.animTicker : t.animScrolling }]}
                                />
                              </SettingRow>
                              {scrolling ? (
                                <>
                                  <RangeSlider label={t.animSpeed} value={doc.animation?.scrolling?.speedPxPerSec ?? 30} min={5} max={200} step={5} unit="px/s" onChange={(v) => setAnimation({ scrolling: { ...doc.animation?.scrolling, speedPxPerSec: v } })} />
                                  {isBar ? (
                                    <RangeSlider label={t.barWidth} value={resolveBarWidth(doc.style)} min={BAR_TICKER_MIN_WIDTH} max={BAR_MAX_WIDTH} step={20} unit="px" onChange={(v) => setStyle({ barWidth: v })} />
                                  ) : (
                                    <>
                                      <RangeSlider label={t.animRows} value={doc.animation?.scrolling?.visibleRows ?? 2} min={1} max={10} step={1} onChange={(v) => setAnimation({ scrolling: { ...doc.animation?.scrolling, visibleRows: v } })} />
                                      <RangeSlider label={t.animPause} value={doc.animation?.scrolling?.pauseSec ?? 2} min={0} max={10} step={0.5} unit="s" onChange={(v) => setAnimation({ scrolling: { ...doc.animation?.scrolling, pauseSec: v } })} />
                                    </>
                                  )}
                                </>
                              ) : (
                                <>
                                  <RangeSlider label={t.animPageSize} value={doc.animation?.paging?.pageSize ?? 5} min={1} max={10} step={1} onChange={(v) => setAnimation({ paging: { ...doc.animation?.paging, pageSize: v } })} />
                                  <RangeSlider label={t.animInterval} value={doc.animation?.paging?.intervalSec ?? 20} min={2} max={60} step={1} unit="s" onChange={(v) => setAnimation({ paging: { ...doc.animation?.paging, intervalSec: v } })} />
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* 3. TWITCH-CHAT */}
              {activeTab === "chat" && (() => {
                const setChat = (patch) => save({ ...doc, chatCommands: { ...DEFAULT_CHAT_COMMANDS, ...doc.chatCommands, ...patch } });
                return (
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4 space-y-6">
                    <div>
                      <Switch label={t.chatEnable} checked={!!doc.chatCommands?.enabled} onChange={(v) => setChat({ enabled: v })} />
                      <Switch label={t.chatModsOnly} checked={doc.chatCommands?.requireModOrBroadcaster !== false} onChange={(v) => setChat({ requireModOrBroadcaster: v })} />
                      <Switch label={t.chatReplies} hint={t.chatReplyLang} checked={doc.chatCommands?.replyInChat !== false} onChange={(v) => setChat({ replyInChat: v })} />
                    </div>

                    {/* Kanäle */}
                    <div>
                      <h4 className={`${LABEL} mb-1.5`}>{t.chatChannels} ({chatChannels.length}/{MAX_CHAT_CHANNELS})</h4>
                      <p className="text-xs text-white/40 mb-3">{t.chatChannelsHint}</p>
                      <div className="space-y-1.5">
                        {chatChannels.map((c) => (
                          <div key={c} className="flex items-center gap-2 bg-white/[0.06] rounded-sm pl-3 pr-1.5 py-1.5">
                            <Hash size={14} className="text-white/30 shrink-0" />
                            <span className="flex-1 text-sm text-white/80">{c}</span>
                            <button
                              onClick={() => removeChannel(c)}
                              className="p-1 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
                              title={t.chatRemoveChannel}
                              aria-label={t.chatRemoveChannel}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {chatChannels.length < MAX_CHAT_CHANNELS && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder={t.chatChannelPlaceholder}
                              value={newChannel}
                              onChange={(e) => setNewChannel(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChannel(); } }}
                              className={`${INPUT} flex-1 min-w-0`}
                            />
                            <button
                              onClick={addChannel}
                              disabled={!normalizeChannelName(newChannel)}
                              className={`${BTN_PRIMARY} px-3.5 text-sm flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              <Plus size={16} /> {t.add}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Befehls-Referenz */}
                    <div>
                      <h4 className={`${LABEL} mb-2`}>{t.commands}</h4>
                      <div>
                        {chatCommandDocs(lang).map((c) => (
                          <div key={c.cmd} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 py-1.5">
                            <span className="text-xs font-semibold text-violet-300 sm:w-52 shrink-0">{c.cmd}</span>
                            <span className="text-xs text-white/60">{c.desc}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-white/40 mt-3">{t.chatFuzzy}</p>
                      <p className="text-xs text-white/40 mt-2">{t.chatPermsNote}</p>
                    </div>
                  </div>
                );
              })()}

              {/* 4. EINRICHTUNG — alles, was man einmal einstellt: OBS-Link, Mod-Link und
                  Rechte. Die Gefahrenzone steht ganz unten. */}
              {activeTab === "setup" && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4 space-y-6">
                  <div>
                    <h4 className={`${LABEL} mb-2.5 flex items-center gap-2`}><Monitor size={14} /> {t.obsSource}</h4>
                    <SecretLink
                      t={t}
                      value={overlayUrl}
                      shown={showOverlayUrl}
                      onToggleShown={() => setShowOverlayUrl(!showOverlayUrl)}
                      copied={overlayCopied}
                      onCopy={() => handleCopy(overlayUrl, "overlay")}
                      onRegenerate={regenerateOverlayKey}
                    />
                  </div>

                  <div>
                    <h4 className={`${LABEL} mb-1.5 flex items-center gap-2`}><ShieldAlert size={14} /> {t.modLink}</h4>
                    <p className="text-xs text-white/40 mb-3">{t.modLinkHint}</p>
                    <SecretLink
                      t={t}
                      value={controlUrl}
                      shown={showControlUrl}
                      onToggleShown={() => setShowControlUrl(!showControlUrl)}
                      copied={controlCopied}
                      onCopy={() => handleCopy(controlUrl, "control")}
                      onRegenerate={regenerateControlKey}
                    />
                  </div>

                  <div>
                    <h4 className={`${LABEL} mb-1`}>{t.permsHeading}</h4>
                    {[
                      { key: "allowModsTimer", label: t.permTimer },
                      { key: "allowModsTitle", label: t.permTitle },
                      { key: "allowModsChallenges", label: t.permChallenges },
                    ].map((perm) => (
                      <Switch
                        key={perm.key}
                        label={perm.label}
                        checked={!!doc.controlPermissions?.[perm.key]}
                        onChange={(v) => save({ ...doc, controlPermissions: { ...doc.controlPermissions, [perm.key]: v } })}
                      />
                    ))}
                  </div>

                  {/* 14-day inactivity notice */}
                  <div className="flex items-start gap-3 bg-amber-500/10 rounded-sm px-3.5 py-3">
                    <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200/80">
                      {t.inactivityBefore}<strong className="text-amber-200">{t.inactivityBold}</strong>{t.inactivityAfter}
                    </p>
                  </div>

                  {/* Reset Zone (GANZ UNTEN) */}
                  <div className="flex justify-between items-center gap-4 bg-red-500/[0.07] rounded-sm px-3.5 py-3">
                    <div>
                      <h4 className="text-sm font-bold text-red-200">{t.dangerZone}</h4>
                      <p className="text-xs text-red-300/70 mt-1">{t.dangerHint}</p>
                    </div>
                    <button onClick={doFullReset} className="px-3.5 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-300 rounded-sm text-sm transition-colors font-bold flex items-center gap-2 shrink-0">
                      <Trash2 size={16} /> {t.resetAll}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* RECHTS: Bühne — die Vorschau füllt die ganze Fläche und scrollt nie mit */}
            <div className={`${PANEL} flex-1 min-w-0 flex-col min-h-0 overflow-hidden ${mobileView === "live" ? "flex" : "hidden md:flex"}`}>
              <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
                <div className="flex items-baseline gap-2">
                  <h3 className={LABEL}>{t.preview}</h3>
                  <span className="text-[11px] text-white/30 tabular-nums">
                    {Math.round(previewNaturalW)}px{previewFitPercent != null && previewFitPercent < 100 ? ` · ${previewFitPercent}%` : ""}
                  </span>
                </div>
                {/* Hintergrund der Bühne: kariert (durchsichtig), dunkel, hell */}
                <div className="flex items-center gap-1.5" role="group" aria-label={t.background}>
                  {Object.keys(STAGE_BACKGROUNDS).map((bg) => (
                    <button
                      key={bg}
                      onClick={() => setPreviewBg(bg)}
                      aria-pressed={previewBg === bg}
                      title={`${t.background}: ${t.stageBg[bg]}`}
                      aria-label={`${t.background}: ${t.stageBg[bg]}`}
                      className={`w-5 h-5 rounded-[3px] ring-1 transition-colors ${previewBg === bg ? "ring-violet-500" : "ring-white/20 hover:ring-white/50"}`}
                      style={bg === "checker" ? { background: "repeating-conic-gradient(#3a3a46 0% 25%, #17171f 0% 50%) 50% / 10px 10px" } : STAGE_BACKGROUNDS[bg]}
                    />
                  ))}
                </div>
              </div>
              {renderPreview()}
            </div>
          </div>

          {/* Umschalter nur auf schmalen Bildschirmen: dort passt neben der
              Bearbeitungsfläche keine zweite Spalte mehr */}
          <div className={`${PANEL} md:hidden grid grid-cols-2 shrink-0`}>
            {[
              { id: "edit", label: t.mobileEdit, icon: Pencil },
              { id: "live", label: t.mobileLive, icon: Monitor },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setMobileView(v.id)}
                aria-pressed={mobileView === v.id}
                className={`relative flex items-center justify-center gap-2 py-3 text-sm font-bold transition-colors ${mobileView === v.id ? "text-white" : "text-white/40 hover:text-white"}`}
              >
                <v.icon size={16} className={mobileView === v.id ? "text-violet-400" : "opacity-50"} />
                {v.label}
                {mobileView === v.id && <span className="absolute top-0 left-3 right-3 h-0.5 bg-violet-500" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
