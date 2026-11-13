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
import TimerPanel from "./ui/TimerPanel";
import StreakBoxes from "./ui/StreakBoxes";
import { SettingRow, Switch, RangeSlider, Segmented } from "./ui/editorKit";
import { panelTone, GOLD, LABEL, INPUT, BTN_PRIMARY, BTN_QUIET } from "./ui/editorStyles";
import { useMediaQuery } from "./ui/useMediaQuery";
import { ToolHeader } from "../../components/toolShell/ToolParts";
import {
  COUNTER_STYLES,
  HEADER_PROGRESS_MODES,
  BAR_MAX_WIDTH,
  BAR_TICKER_MIN_WIDTH,
  resolveBarWidth,
  MIN_BOX_WIDTH,
  OVERLAY_LAYOUTS,
  overallProgress,
  isItemDone,
  itemMode,
  itemModePatch,
  showsStreakPips,
  streakClickProgress,
  streakLengthPatch,
  STREAK_MIN,
  STREAK_MAX,
  DEFAULT_COUNTDOWN_MS,
  timerDurationMs,
  timerDisplayMs,
  timerElapsedMs,
  timerSetDisplay,
  timerAdjustDisplay,
  timerStart,
  timerPause,
} from "./overlayUtils";
import {
  Palette,
  Settings,
  Pin,
  RotateCcw,
  Plus,
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
  Flame,
} from "lucide-react";

// --- HELPER FUNCTIONS ---

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
// mode "up" = Stoppuhr, "down" = Countdown ab durationMs (Rechnung in overlayUtils.js)
const DEFAULT_TIMER = { running: false, startedAt: 0, elapsedMs: 0, visible: true, mode: "up", durationMs: DEFAULT_COUNTDOWN_MS };
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
  // Wer außer dem Streamer Befehle nutzen darf; Bestandsdaten: siehe normalizeChatCommands
  allowedRoles: { mod: true, vip: false, sub: false, everyone: false },
  replyInChat: true,
};
const MAX_CHAT_CHANNELS = 10;
// Reihenfolge der Rollen-Schalter im Reiter Twitch-Chat
const CHAT_ROLES = ["mod", "vip", "sub", "everyone"];

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
  // Ohne Rollen (Bestandsdaten): alter Schalter "Nur Mods und Streamer" bestimmt sie
  const roles = cc?.allowedRoles;
  merged.allowedRoles = roles && typeof roles === "object"
    ? { mod: roles.mod !== false, vip: roles.vip === true, sub: roles.sub === true, everyone: roles.everyone === true }
    : { mod: true, vip: false, sub: false, everyone: cc?.requireModOrBroadcaster === false };
  merged.requireModOrBroadcaster = !merged.allowedRoles.everyone;
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
// Trennlinien. Seitenleiste (Bereiche + Timer), Bearbeitungsfläche und Bühne sind je eine
// Fläche mit Lücke dazwischen; innerhalb einer Fläche trennt nur Abstand. Die gemeinsamen
// Klassen stehen in ui/editorStyles.js, Schalter/Regler/Umschalter in ui/editorKit.jsx.

// Ab dieser Breite hat die Seitenleiste mit dem großen Timer Platz; darunter rücken
// Bereiche und Timer in eine schmale Leiste über die Bearbeitungsfläche.
const WIDE_QUERY = "(min-width: 1280px)";

// Hintergründe der Bühne. „Kariert“ ist das Zeichen für durchsichtig, wie in jedem
// Bildprogramm: das Overlay liegt später über dem Spielbild, nicht auf einer Farbe.
const STAGE_BACKGROUNDS = {
  checker: { background: "repeating-conic-gradient(#17171f 0% 25%, #101016 0% 50%) 50% / 24px 24px" },
  dark: { background: "#09090b" },
  light: { background: "#e5e7eb" },
};

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

// Aktionen einer Challenge-Karte (Anpinnen, Löschen, „Auf 0“): immer sichtbar, aber gedämpft.
// Eingeschaltetes (angepinnt) trägt die Akzentfarbe.
const ROW_ACTION = "h-8 px-2 flex items-center gap-1.5 rounded-sm text-xs font-bold transition-colors";
const ROW_ACTION_OFF = "text-white/45 hover:text-white hover:bg-white/[0.08]";
const ROW_ACTION_ON = "text-violet-300 bg-violet-500/15 hover:bg-violet-500/25";

// Art einer Challenge: abhaken, Zähler oder Serie (B2B, B3B …) — siehe itemMode in overlayUtils.js
const ITEM_MODES = [
  { mode: "check", Icon: Check, stroke: 3, labelKey: "modeCheck" },
  { mode: "counter", Icon: Hash, stroke: 2.5, labelKey: "modeCounter" },
  { mode: "streak", Icon: Flame, stroke: 2.5, labelKey: "modeStreak", titleKey: "modeStreakHint" },
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
  // Breit genug für die Seitenleiste mit dem großen Timer?
  const wide = useMediaQuery(WIDE_QUERY);

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
  // Fläche, in der zuletzt geklickt oder getippt wurde ("timer" | "edit" | "preview") — sie
  // trägt den kräftigen Rand (panelTone). Die Bereichswahl zählt zur Bearbeitungsfläche:
  // wer einen Bereich wählt, arbeitet danach dort.
  const [activeArea, setActiveArea] = useState("edit");
  const areaProps = (area) => ({
    onPointerDownCapture: () => setActiveArea(area),
    onFocusCapture: () => setActiveArea(area),
  });
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
  // Hoch- und Runterzählen rechnen die Helfer aus overlayUtils.js (gleich wie im Backend)
  const startTimer = () => save({ ...doc, timer: timerStart({ ...DEFAULT_TIMER, ...(doc?.timer || {}) }) }, { flush: true });
  const pauseTimer = () => { if (!doc?.timer?.running) return; save({ ...doc, timer: timerPause(doc.timer) }, { flush: true }); };
  // Richtung und Startzeit bleiben beim Reset erhalten
  const resetTimer = () => save({
    ...doc,
    timer: {
      ...DEFAULT_TIMER,
      visible: doc?.timer?.visible ?? true,
      mode: doc?.timer?.mode === "down" ? "down" : "up",
      durationMs: timerDurationMs(doc?.timer),
    },
  }, { flush: true });
  const adjustTimer = (deltaMs) => {
    if (!doc?.timer) return;
    save({ ...doc, timer: timerAdjustDisplay(doc.timer, deltaMs) }, { flush: true });
  };
  /**
   * Richtung wechseln. Zum Countdown: beginnt bei der Startzeit. Zurück zur
   * Stoppuhr: zeigt die bisher verstrichene Zeit.
   */
  const setTimerMode = (mode) => {
    const t = { ...DEFAULT_TIMER, ...(doc?.timer || {}) };
    if ((t.mode === "down" ? "down" : "up") === mode) return;
    const next = mode === "down"
      ? { ...t, mode, elapsedMs: 0, ...(t.running ? { startedAt: Date.now() } : {}) }
      : timerSetDisplay({ ...t, mode }, timerElapsedMs(t));
    save({ ...doc, timer: next }, { flush: true });
  };
  /** Startzeit des Countdowns setzen. Die Restzeit verschiebt sich um die Änderung. */
  const setTimerDuration = (ms) => {
    const t = { ...DEFAULT_TIMER, ...(doc?.timer || {}) };
    if (ms !== timerDurationMs(t)) save({ ...doc, timer: { ...t, durationMs: ms } }, { flush: true });
  };
  const toggleTimerVisible = () => {
    const visible = doc?.timer?.visible !== false;
    save({ ...doc, timer: { ...(doc?.timer || {}), visible: !visible } }, { flush: true });
  };
  /** Angezeigte Zeit direkt setzen — beim Countdown die Restzeit. */
  const setTimerDisplay = (ms) =>
    save({ ...doc, timer: timerSetDisplay({ ...DEFAULT_TIMER, ...(doc?.timer || {}) }, ms) }, { flush: true });
  // Bedienung des Timers für ui/TimerPanel.jsx
  const timerActions = {
    start: startTimer,
    pause: pauseTimer,
    reset: resetTimer,
    adjust: adjustTimer,
    setDisplay: setTimerDisplay,
    setMode: setTimerMode,
    setDuration: setTimerDuration,
    toggleVisible: toggleTimerVisible,
  };

  useEffect(() => { if (!doc?.timer?.running) return; const iv = setInterval(() => setLocalNow(Date.now()), 500); return () => clearInterval(iv); }, [doc?.timer?.running]);
  // Angezeigte Zeit (beim Countdown die Restzeit) — Name historisch
  const runningElapsed = timerDisplayMs(doc?.timer || {}, localNow);

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
    // Ohne eigene Challenges zeigt die Vorschau Beispiele statt eines leeren Rahmens —
    // je eines pro Art: abhaken, Zähler, Serie
    const previewDoc = namedItems.length > 0
      ? doc
      : {
          ...doc,
          items: [
            { id: "p1", name: t.sampleA, pinned: true },
            { id: "p2", name: t.sampleB, useWins: true, target: 3, progress: 1 },
            { id: "p3", name: t.sampleC, useWins: true, streak: true, target: 3, progress: 2 },
          ],
        };
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
        // Drei Bereiche auf dem dunklen Grund der Tool-Hülle: links die Seitenleiste mit den
        // Bereichen und dem großen Timer, in der Mitte die Bearbeitungsfläche, rechts die Bühne
        // mit der Vorschau. Die Seitenleiste nutzt den Platz, der auf breiten Monitoren sonst
        // leer neben dem Editor lag — der Timer ist das, was man im Stream ständig bedient, und
        // war oben in der Leiste zu klein. Unter 1280px (WIDE_QUERY) rücken Bereiche und Timer
        // als schmale Leiste über die Bearbeitungsfläche (TimerPanel compact).
        <div className="flex-1 min-h-0 w-full max-w-[1760px] mx-auto flex flex-col xl:flex-row gap-2 lg:gap-3 p-2 lg:p-4">

          {/* OBS-Link: in der Kopfleiste der Hülle, von jedem Bereich aus erreichbar */}
          <ToolHeader>
            <button
              type="button"
              onClick={() => handleCopy(overlayUrl, "overlay")}
              aria-label={t.copySource}
              title={t.copySource}
              className="ml-auto h-8 px-2.5 xl:px-3 shrink-0 whitespace-nowrap inline-flex items-center gap-2 rounded-md bg-accent hover:bg-accent-hover text-white text-[12px] font-bold transition-colors"
            >
              {overlayCopied ? <Check size={14} /> : <Copy size={14} />}
              <span className="hidden xl:inline">{overlayCopied ? t.copied : t.copySource}</span>
            </button>
          </ToolHeader>

          {/* SEITENLEISTE: Bereiche und Timer. Breit: eine Spalte links, alles offen sichtbar.
              Schmal: Bereiche als Reiter, daneben (Handy: darunter) der Timer in einer Zeile. */}
          <div className="shrink-0 flex flex-col md:flex-row xl:flex-col gap-2 lg:gap-3 xl:w-72 xl:min-h-0 xl:overflow-y-auto custom-scrollbar">
            <nav
              aria-label={t.navAria}
              className={`${panelTone(false)} flex xl:flex-col md:flex-1 xl:flex-none min-w-0 overflow-x-auto xl:overflow-visible ${wide ? "p-1.5 gap-0.5" : "px-1"}`}
            >
              {[
                { id: "challenges", label: t.tabChallenges, icon: ListChecks },
                { id: "custom", label: t.tabDesign, icon: Palette },
                { id: "chat", label: t.tabChat, icon: MessageSquare },
                { id: "setup", label: t.tabSetup, icon: Settings },
              ].map((tab) => {
                const active = activeTab === tab.id;
                let tone = wide ? "text-white/45 hover:text-white hover:bg-white/[0.04]" : "text-white/40 hover:text-white";
                if (active) tone = wide ? "text-white bg-white/[0.08]" : "text-white";
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setActiveTab(tab.id); setMobileView("edit"); setActiveArea("edit"); }}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center whitespace-nowrap text-sm font-bold transition-colors ${
                      wide ? "gap-2.5 h-10 px-3 rounded-sm" : "gap-2 px-4 py-3.5"
                    } ${tone}`}
                  >
                    <tab.icon size={16} className={active ? "" : "opacity-50"} style={active ? { color: GOLD } : undefined} />
                    {tab.label}
                    {active && (
                      <span
                        className={`absolute ${wide ? "left-0 top-2 bottom-2 w-0.5" : "bottom-0 left-3 right-3 h-0.5"}`}
                        style={{ background: GOLD }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            <div {...areaProps("timer")} className={`${panelTone(activeArea === "timer")} shrink-0 ${wide ? "p-4" : "p-1.5"}`}>
              <TimerPanel timer={doc.timer} now={localNow} t={t} compact={!wide} actions={timerActions} />
            </div>
          </div>

          {/* KÖRPER */}
          <div className="flex-1 flex gap-2 lg:gap-3 min-h-0 min-w-0">

            {/* LINKS: Bearbeitungsfläche. Kopfbereiche stehen fest, nur der Inhalt darunter scrollt. */}
            <div {...areaProps("edit")} className={`${panelTone(activeArea === "edit")} flex-[1.4] min-w-0 md:max-w-[720px] flex-col min-h-0 ${mobileView === "live" ? "hidden md:flex" : "flex"}`}>

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
                        trotzdem übersichtlich bleibt, hat jede Zeile der Karte genau eine Aufgabe:
                        oben der Name (mit Anpinnen und Löschen), darunter Art und Stand, und nur
                        bei einer Serie eine dritte Zeile für die Kästchen. Vorher teilten sich Art,
                        Länge, „Auf 0“, Anpinnen und Löschen eine Zeile. Der Streifen links zeigt den
                        Zustand: grün erledigt, violett angepinnt. */}
                    <div
                      className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-2"
                      onDragEnd={endDrag}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
                    >
                      {(doc.items || []).map((it) => {
                        const done = isItemDone(it);
                        const mode = itemMode(it);
                        // Serie mit gültiger Länge: Kästchen zum Abhaken statt −/+
                        const streakBoxes = showsStreakPips(it);
                        const isDragging = draggingId === it.id;
                        const dropBefore = dropTarget?.id === it.id && dropTarget.before;
                        const dropAfter = dropTarget?.id === it.id && !dropTarget.before;
                        let tone = "border-white/10 bg-white/[0.04] hover:bg-white/[0.06] focus-within:bg-white/[0.06]";
                        if (isDragging) tone = "border-violet-500 bg-violet-500/10 opacity-40";
                        else if (done) tone = "border-green-500/70 bg-green-500/[0.06] hover:bg-green-500/[0.09] focus-within:bg-green-500/[0.09]";
                        else if (it.pinned) tone = "border-violet-500/80 bg-white/[0.04] hover:bg-white/[0.06] focus-within:bg-white/[0.06]";
                        // Zähler mit Ziel hinter dem Schrägstrich. Steht bei „Zähler“ rechts neben der
                        // Art, bei einer Serie mit ungültiger Länge an der Stelle der Kästchen.
                        const counter = (
                          <div className="shrink-0 flex items-center h-8 bg-black/30 rounded-sm overflow-hidden">
                            <button type="button" aria-label="−1" onClick={() => updateItem(it.id, { progress: Math.max(0, (it.progress || 0) - 1) })} className="w-8 h-8 hover:bg-white/10 text-white/50 hover:text-white transition-colors">−</button>
                            <span className={`min-w-7 text-right font-bold text-sm tabular-nums ${done ? "text-green-400" : "text-white"}`}>{it.progress || 0}</span>
                            <span className="px-1 text-sm text-white/30">/</span>
                            <input
                              type="number"
                              min={1}
                              aria-label={t.target}
                              title={t.target}
                              className="w-8 bg-transparent text-sm tabular-nums text-white/60 focus:text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              value={it.target || 1}
                              onChange={(e) => updateItem(it.id, { target: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                            />
                            <button type="button" aria-label="+1" onClick={() => updateItem(it.id, { progress: (it.progress || 0) + 1 })} className="w-8 h-8 hover:bg-white/10 text-white/50 hover:text-white transition-colors">+</button>
                          </div>
                        );
                        return (
                          <div key={it.id} onDragOver={onDragOver(it.id)} onDrop={onDrop(it.id)} className="relative">
                            {/* Einfügemarke: zeigt vor dem Loslassen, wo die Challenge landet */}
                            <div className={`absolute -top-1 left-0 right-0 h-0.5 z-10 transition-opacity ${dropBefore ? "bg-violet-500 opacity-100" : "opacity-0"}`} />
                            <div className={`absolute -bottom-1 left-0 right-0 h-0.5 z-10 transition-opacity ${dropAfter ? "bg-violet-500 opacity-100" : "opacity-0"}`} />

                            <div className={`flex items-start gap-2.5 sm:gap-3 rounded-sm border-l-[3px] pl-1 pr-3 py-3 transition-colors ${tone}`}>
                              <div
                                draggable
                                onDragStart={onDragStart(it.id)}
                                onDragEnd={endDrag}
                                // Tastatur-Alternative zum Ziehen: Griff fokussieren, dann ↑/↓
                                tabIndex={0}
                                role="button"
                                aria-label={`${t.dragToSort} (↑/↓)`}
                                onKeyDown={(e) => {
                                  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                                  e.preventDefault();
                                  const grip = e.currentTarget;
                                  moveItem(it.id, e.key === "ArrowUp" ? -1 : 1);
                                  requestAnimationFrame(() => grip.focus());
                                }}
                                title={t.dragToSort}
                                className={`shrink-0 self-stretch flex items-center p-1 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-violet-500 transition-colors ${isDragging ? "cursor-grabbing text-violet-400" : "cursor-grab text-white/25 hover:text-white/70 hover:bg-white/5"}`}
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

                              <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                                {/* Zeile 1: der Name allein, dahinter Anpinnen und Löschen. Der Stand steht
                                    nicht mehr daneben — eine lange Serie hat den Namen sonst abgeschnitten. */}
                                <div className="flex items-center gap-1">
                                  <input
                                    id={`wc-item-${it.id}`}
                                    className={`flex-1 min-w-0 bg-transparent text-[17px] font-semibold placeholder-white/25 focus:outline-none truncate transition-colors ${done ? "text-white/55 focus:text-white" : "text-white"}`}
                                    placeholder={t.namePlaceholder}
                                    value={it.name}
                                    onChange={(e) => updateItem(it.id, { name: e.target.value })}
                                    // Enter legt direkt darunter die nächste Challenge an — eine Liste
                                    // lässt sich so eintippen, ohne zur Maus zu greifen
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItemAfter(it.id); } }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateItem(it.id, { pinned: !it.pinned })}
                                    aria-pressed={!!it.pinned}
                                    title={it.pinned ? t.unpin : t.pin}
                                    aria-label={it.pinned ? t.unpin : t.pin}
                                    className={`${ROW_ACTION} shrink-0 ${it.pinned ? ROW_ACTION_ON : ROW_ACTION_OFF}`}
                                  >
                                    <Pin size={15} />{it.pinned && <span className="hidden sm:inline">{t.pinned}</span>}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeItem(it.id)}
                                    title={t.remove}
                                    aria-label={t.remove}
                                    className={`${ROW_ACTION} shrink-0 text-white/45 hover:text-red-400 hover:bg-red-500/10`}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>

                                {/* Zeile 2: links die Art der Challenge (Abhaken, Zähler oder Serie), rechts
                                    das, was zu dieser Art gehört — der Haken, der Zähler mit Ziel oder die
                                    Länge der Serie (B2B bis B10). */}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div role="radiogroup" aria-label={t.modeAria} className="flex p-0.5 rounded-sm bg-black/30">
                                    {ITEM_MODES.map((m) => {
                                      const on = mode === m.mode;
                                      return (
                                        <button
                                          key={m.mode}
                                          type="button"
                                          role="radio"
                                          aria-checked={on}
                                          title={m.titleKey ? t[m.titleKey] : t[m.labelKey]}
                                          onClick={() => { if (!on) updateItem(it.id, itemModePatch(it, m.mode)); }}
                                          className={`h-7 px-2 flex items-center gap-1.5 rounded-[2px] text-xs font-bold transition-colors ${on ? "bg-violet-500/30 text-white" : "text-white/45 hover:text-white"}`}
                                        >
                                          {/* Auf dem Handy trägt nur die gewählte Art ihren Namen — sonst
                                              passt der Stand nicht mehr in die Zeile */}
                                          <m.Icon size={13} strokeWidth={m.stroke} />
                                          <span className={on ? "" : "sr-only sm:not-sr-only"}>{t[m.labelKey]}</span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {mode === "streak" && (
                                    <div role="group" aria-label={t.streakLength} title={t.streakLength} className="shrink-0 flex items-center h-8 rounded-sm bg-black/30">
                                      <button
                                        type="button"
                                        onClick={() => updateItem(it.id, streakLengthPatch(it, (it.target || 0) - 1))}
                                        disabled={(it.target || 0) <= STREAK_MIN}
                                        aria-label={t.streakShorter}
                                        className="w-8 h-8 text-white/50 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                      >−</button>
                                      <span className="min-w-[3.25rem] text-center text-xs font-bold text-white/80 tabular-nums whitespace-nowrap">{t.streakWins(it.target || 0)}</span>
                                      <button
                                        type="button"
                                        onClick={() => updateItem(it.id, streakLengthPatch(it, (it.target || 0) + 1))}
                                        disabled={(it.target || 0) >= STREAK_MAX}
                                        aria-label={t.streakLonger}
                                        className="w-8 h-8 text-white/50 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                      >+</button>
                                    </div>
                                  )}
                                  {mode === "counter" && counter}
                                  {mode === "check" && (
                                    <button
                                      type="button"
                                      onClick={() => updateItem(it.id, { done: !it.done })}
                                      aria-pressed={!!it.done}
                                      className={`shrink-0 h-8 px-3 flex items-center gap-1.5 rounded-sm text-xs font-bold transition-colors ${it.done ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-black/30 text-white/50 hover:text-white hover:bg-white/10"}`}
                                    >
                                      <Check size={14} strokeWidth={3} className={it.done ? "" : "opacity-40"} />
                                      {it.done ? t.done : t.open}
                                    </button>
                                  )}
                                </div>

                                {/* Zeile 3, nur bei einer Serie: ein großes Kästchen je Win, einzeln
                                    abhakbar, und „Auf 0“ für die gerissene Serie. Eigene Zeile auf
                                    eigenem Ton, damit zehn Kästchen Platz haben und nichts neben den
                                    Einstellungen der Karte klemmt. */}
                                {mode === "streak" && (
                                  // Kein Umbruch der Zeile selbst: bei wenig Platz brechen die Kästchen in
                                  // sich um, „Auf 0“ bleibt rechts stehen statt allein in eine neue Zeile zu rutschen
                                  <div className="flex items-center justify-between gap-3 rounded-sm bg-black/25 px-2.5 py-2">
                                    {streakBoxes ? (
                                      <StreakBoxes
                                        size="lg"
                                        total={it.target || 0}
                                        filled={Math.min(it.progress || 0, it.target || 0)}
                                        onPick={(i) => updateItem(it.id, { progress: streakClickProgress(it, i) })}
                                        t={t}
                                      />
                                    ) : counter}
                                    <button
                                      type="button"
                                      onClick={() => updateItem(it.id, { progress: 0 })}
                                      disabled={!(it.progress > 0)}
                                      title={t.streakResetTitle}
                                      className={`${ROW_ACTION} shrink-0 ${ROW_ACTION_OFF} disabled:opacity-30 disabled:pointer-events-none`}
                                    >
                                      <RotateCcw size={14} /> {t.streakReset}
                                    </button>
                                  </div>
                                )}
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
                      <Switch label={t.chatReplies} hint={t.chatReplyLang} checked={doc.chatCommands?.replyInChat !== false} onChange={(v) => setChat({ replyInChat: v })} />
                    </div>

                    {/* Wer darf Befehle nutzen — der Streamer immer */}
                    <div>
                      <h4 className={`${LABEL} mb-1.5`}>{t.chatRoles}</h4>
                      <p className="text-xs text-white/40 mb-1">{t.chatRolesHint}</p>
                      {(() => {
                        const roles = normalizeChatCommands(doc.chatCommands).allowedRoles;
                        const setRole = (key, v) => {
                          const next = { ...roles, [key]: v };
                          setChat({ allowedRoles: next, requireModOrBroadcaster: !next.everyone });
                        };
                        return CHAT_ROLES.map((key) => (
                          <div key={key} className={key !== "everyone" && roles.everyone ? "opacity-40" : ""}>
                            <Switch
                              label={t.chatRoleLabels[key]}
                              hint={key === "everyone" ? t.chatRoleEveryoneHint : undefined}
                              checked={roles.everyone || roles[key]}
                              onChange={(v) => { if (key === "everyone" || !roles.everyone) setRole(key, v); }}
                            />
                          </div>
                        ));
                      })()}
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
            <div {...areaProps("preview")} className={`${panelTone(activeArea === "preview")} flex-1 min-w-0 flex-col min-h-0 overflow-hidden ${mobileView === "live" ? "flex" : "hidden md:flex"}`}>
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
          <div className={`${panelTone(false)} md:hidden grid grid-cols-2 shrink-0`}>
            {[
              { id: "edit", label: t.mobileEdit, icon: Pencil },
              { id: "live", label: t.mobileLive, icon: Monitor },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => { setMobileView(v.id); setActiveArea(v.id === "live" ? "preview" : "edit"); }}
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
