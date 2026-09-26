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
import { CHAT_COMMAND_DOCS } from "./chatCommands";
import WinChallengeSeoContent from "./seoContent";
import { WC_TITLE, WC_DESCRIPTION, WC_KEYWORDS } from "./seoData";
import { buildWinChallengeJsonLd } from "./jsonLd";
import {
  OverlayFooter,
  OverlayHeader,
  OverlayRow,
  OverlayTimer,
} from "./overlayParts";
import {
  COUNTER_STYLES,
  HEADER_PROGRESS_MODES,
  OVERLAY_FONT,
  OVERLAY_LAYOUTS,
  msToClock,
  overallProgress,
  overlayBoxStyle,
  resolveOverlayStyle,
  splitOverlayItems,
} from "./overlayUtils";
import {
  Trophy,
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
  Layout,
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
  s.boxWidth = Math.min(1600, Math.max(280, parseInt(s.boxWidth ?? 320, 10)));
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
  return s;
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
    overlayKey: raw.overlayKey, controlKey: raw.controlKey,
    controlPermissions: { ...DEFAULT_PERMISSIONS, ...(raw.controlPermissions || {}) },
    chatCommands: normalizeChatCommands(raw.chatCommands),
    timer, style, animation,
  };
}

// --- UI COMPONENTS ---

// Jede Einstellung im Design-Tab sitzt in einem eigenen Rahmen. Ohne den liefen
// Regler, Farben und Schalter optisch ineinander, und man sah nicht, wo eine
// Einstellung endet und die nächste beginnt.
const FIELD_BOX = "border border-white/10 bg-white/[0.03] rounded-sm p-3.5";
const FIELD_LABEL = "text-xs font-bold text-white/60 uppercase tracking-wide";

/** Eingerahmte Einstellung mit Beschriftung. */
const Field = ({ label, children, className = "" }) => (
  <div className={`${FIELD_BOX} ${className}`}>
    {label && <span className={`${FIELD_LABEL} block mb-3`}>{label}</span>}
    {children}
  </div>
);

const ColorPicker = ({ label, value, onChange }) => (
  <div className={`${FIELD_BOX} flex items-center gap-3.5`}>
    <div className="relative w-10 h-10 rounded-sm overflow-hidden ring-1 ring-white/15 shrink-0">
      <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -top-4 -left-4 w-16 h-16 cursor-pointer p-0 border-0"
      />
    </div>
    <div className="min-w-0">
      <span className={`${FIELD_LABEL} block`}>{label}</span>
      <span className="text-xs font-mono text-white/50 uppercase">{value}</span>
    </div>
  </div>
);

/**
 * Fertige Farbkombinationen. Der Design-Tab überfordert vor allem deshalb, weil
 * man sechs Farben einzeln treffen muss, bevor irgendetwas gut aussieht — mit
 * einem Klick ist man dagegen sofort an einem brauchbaren Ausgangspunkt.
 */
const STYLE_PRESETS = [
  {
    id: "twitch",
    label: "Twitch",
    style: { boxBg: "#0B0F1A", headerBg: "#18122B", itemBg: "#1B1730", textColor: "#ffffff", titleColor: "#ffffff", accent: "#9146FF" },
  },
  {
    id: "mitternacht",
    label: "Mitternacht",
    style: { boxBg: "#05070D", headerBg: "#0B1220", itemBg: "#111827", textColor: "#E5E7EB", titleColor: "#ffffff", accent: "#38BDF8" },
  },
  {
    id: "hell",
    label: "Hell",
    style: { boxBg: "#F8FAFC", headerBg: "#E2E8F0", itemBg: "#FFFFFF", textColor: "#0F172A", titleColor: "#0F172A", accent: "#7C3AED" },
  },
  {
    id: "neon",
    label: "Neon",
    style: { boxBg: "#0A0A0F", headerBg: "#12021F", itemBg: "#1A0B2E", textColor: "#F0ABFC", titleColor: "#22D3EE", accent: "#22D3EE" },
  },
  {
    id: "wald",
    label: "Wald",
    style: { boxBg: "#0A1410", headerBg: "#0F2018", itemBg: "#132C20", textColor: "#D1FAE5", titleColor: "#ffffff", accent: "#34D399" },
  },
  {
    id: "sand",
    label: "Sand",
    style: { boxBg: "#1C1917", headerBg: "#292524", itemBg: "#332E2A", textColor: "#FAFAF9", titleColor: "#FCD34D", accent: "#F59E0B" },
  },
];

/**
 * Aufklappbarer Abschnitt — hält den Design-Tab kurz. Kein eigener Kasten, nur
 * eine Trennlinie: alles sitzt auf derselben Fläche.
 */
const Section = ({ id, title, icon: Icon, open, onToggle, children }) => (
  <div className="border-b border-white/10 last:border-b-0">
    <button
      onClick={() => onToggle(open ? null : id)}
      aria-expanded={open}
      className="w-full flex items-center gap-3 py-4 text-left text-white/80 hover:text-white transition-colors"
    >
      <Icon size={16} className="text-white/40 shrink-0" />
      <span className="font-bold text-sm flex-1">{title}</span>
      <ChevronDown size={16} className={`text-white/30 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="pb-6 pt-1">{children}</div>}
  </div>
);

/** Eingerahmter Ein/Aus-Schalter. */
const CheckField = ({ label, checked, onChange }) => (
  <label className={`${FIELD_BOX} flex items-center gap-3 cursor-pointer select-none hover:bg-white/[0.05] transition-colors`}>
    <input type="checkbox" className="w-4 h-4 accent-violet-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="text-sm font-bold text-white">{label}</span>
  </label>
);

const RangeSlider = ({ label, value, min, max, step, onChange, unit = "" }) => (
  <div className={FIELD_BOX}>
    <div className="flex justify-between items-baseline mb-3">
      <span className={FIELD_LABEL}>{label}</span>
      <span className="text-sm text-white tabular-nums">{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min} max={max} step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-white/10 rounded-sm appearance-none cursor-pointer accent-violet-500"
    />
  </div>
);

/** Auswahl aus wenigen festen Werten (Layout, Zähler-Anzeige, …). */
const Segmented = ({ label, options, value, onChange }) => (
  <div className="flex border border-white/10 rounded-sm overflow-hidden" role="group" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        aria-pressed={value === o.value}
        className={`flex-1 py-1.5 text-xs font-bold transition-colors ${value === o.value ? "bg-violet-600 text-white" : "text-white/40 hover:text-white"}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// Schrittweiten für „Zeit anpassen“ im Timer. Ein einziger Schalter plus ± ersetzt
// die frühere Reihe aus sechs einzelnen Knöpfen.
const TIMER_STEPS = [
  { label: "1 Min", ms: 60000 },
  { label: "10 Min", ms: 600000 },
  { label: "1 Std", ms: 3600000 },
];

// --- MAIN COMPONENT ---

export default function WinChallenge() {
  const { user, login } = useContext(TwitchAuthContext);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const dragIdRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const saveSeqRef = useRef(0);
  const pendingSaveRef = useRef(false);
  const timeSelectPendingRef = useRef(false);

  const [activeTab, setActiveTab] = useState("challenges");
  // Unter 768px passt nur eine Spalte: entweder der Editor oder Vorschau + Timer
  const [mobileView, setMobileView] = useState("edit");
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { id, before }
  // Design-Tab: Feineinstellungen sind eingeklappt, bis sie gebraucht werden
  const [openSection, setOpenSection] = useState("presets");
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [controlCopied, setControlCopied] = useState(false);

  const [showOverlayUrl, setShowOverlayUrl] = useState(false);
  const [showControlUrl, setShowControlUrl] = useState(false);

  const [localNow, setLocalNow] = useState(Date.now());
  const [previewLightMode, setPreviewLightMode] = useState(false);

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

  const doFullReset = async () => {
    if (!user || !window.confirm("Alles zurücksetzen? (Design, Items, Links)")) return;
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
  const addItem = () => save({ ...doc, items: [...(doc?.items || []), makeItem()] });

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

  const renderPreview = () => {
    if (!doc) return null;
    const { style } = doc;
    // Dieselbe Auflösung wie im Overlay (siehe WinChallengeOverlay.jsx)
    const st = resolveOverlayStyle(style);
    const namedItems = (doc.items || []).filter((i) => (i.name || "").trim());
    const source = namedItems.length > 0 ? namedItems : [{ id: "p1", name: "Beispiel Challenge", pinned: true }, { id: "p2", name: "Gewinne 3 Runden", useWins: true, target: 3, progress: 1 }];
    // Reihenfolge wie im Overlay: Angepinnte zuerst, erledigte optional ans Ende
    const { pinned, others } = splitOverlayItems(source, st.doneToBottom);
    const items = [...pinned, ...others].slice(0, 6);

    // Passend skalieren: so bleibt auch eine Breiten-Änderung in der Vorschau sichtbar
    const scaledW = (style.boxWidth || 320) * (style.scale || 1);
    const avail = Math.max(0, previewW - 32);
    const fit = avail > 0 ? Math.min(1, avail / scaledW) : 1;
    const zoom = (style.scale || 1) * fit;

    return (
      // margin:auto statt justify/items-center: zentriert, solange Platz ist, und
      // beginnt sonst oben — die Vorschau scrollt, statt an beiden Enden abgeschnitten
      // zu werden.
      <div ref={setPreviewEl} className={`flex-1 min-h-0 flex p-4 transition-colors overflow-auto custom-scrollbar ${previewLightMode ? "bg-gray-200" : "bg-[#09090b]"}`}>
        <div style={{
          ...overlayBoxStyle(st),
          fontFamily: OVERLAY_FONT, color: st.textColor, textShadow: st.textShadow,
          width: st.boxWidth, zoom, margin: "auto", flexShrink: 0,
        }}>
          <OverlayHeader title={doc.title || "WinChallenge"} st={st} progress={overallProgress(source)} />
          {items.map((it) => (
            <OverlayRow key={it.id} it={it} st={st} />
          ))}
          {timerVisible && (
            <OverlayFooter st={st}>
              <OverlayTimer running={running} ms={runningElapsed} fontSize={st.timerFontSize} />
            </OverlayFooter>
          )}
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

  const previewFitPercent = useMemo(() => {
    if (!doc || !previewW) return null;
    const scaledW = (doc.style?.boxWidth || 320) * (doc.style?.scale || 1);
    const avail = Math.max(0, previewW - 32);
    const fit = avail > 0 ? Math.min(1, avail / scaledW) : 1;
    return Math.round(fit * 100);
  }, [doc, previewW]);

  // Ohne Login gibt es nichts zu bearbeiten — dann zeigt die Seite, was das Overlay
  // überhaupt kann. Das ist zugleich die einzige Fassung, die Suchmaschinen je zu
  // sehen bekommen (der Crawler ist nie angemeldet), deshalb hängen die
  // strukturierten Daten zu Fragen und Einrichtung genau hier dran: FAQPage und HowTo
  // dürfen nur ausgezeichnet werden, wenn derselbe Text sichtbar auf der Seite steht.
  if (!user) {
    return (
      <div className="page-fade h-full overflow-y-auto custom-scrollbar text-white p-3 md:p-5 xl:p-6">
        <SEO
          title={WC_TITLE}
          description={WC_DESCRIPTION}
          path="/WinChallenge-Overlay"
          keywords={WC_KEYWORDS}
          jsonLd={buildWinChallengeJsonLd()} />

        <WinChallengeSeoContent>
          <div className="flex flex-col items-center gap-2">
            <button onClick={login} className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-8 py-4 rounded-sm transition-colors">
              Mit Twitch anmelden und Challenge erstellen
            </button>
            <p className="text-white/30 text-xs">Kostenlos · nur Twitch-Login nötig</p>
          </div>
        </WinChallengeSeoContent>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-white p-3 md:p-5 xl:p-6">
      <SEO
        title={WC_TITLE}
        description={WC_DESCRIPTION}
        path="/WinChallenge-Overlay"
        keywords={WC_KEYWORDS} />

      {loading || !doc ? (
        <div className="h-full flex items-center justify-center text-white/30 animate-pulse">Lade Konfiguration...</div>
      ) : (
        // Eine einzige deckende Fläche für alles: Kopfzeile, Editor, Vorschau und
        // Timer. Getrennt wird nur durch Linien — keine Glas-Panels, keine
        // einzelnen Kästen.
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#0d0d14] border border-white/10 rounded-md">

          {/* KOPFZEILE — Titel, Tabs und der OBS-Link, der immer griffbereit ist */}
          <div className="flex items-stretch border-b border-white/10 shrink-0">
            <div className="hidden lg:flex items-center gap-3 px-6 border-r border-white/10 shrink-0">
              <Trophy size={18} className="text-yellow-500 shrink-0" />
              <h1 className="font-display text-base font-bold tracking-tight text-white leading-none">WinChallenge</h1>
            </div>

            <div className="flex flex-1 min-w-0 overflow-x-auto">
              {[
                { id: "challenges", label: "Challenges", icon: ListChecks },
                { id: "custom", label: "Design", icon: Palette },
                { id: "chat", label: "Twitch-Chat", icon: MessageSquare },
                { id: "settings", label: "Einstellungen", icon: Settings },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMobileView("edit"); }}
                  className={`relative flex items-center gap-2.5 px-5 py-4 text-sm font-bold whitespace-nowrap transition-colors ${
                    activeTab === tab.id ? "text-white" : "text-white/40 hover:text-white"
                  }`}
                >
                  <tab.icon size={16} className={activeTab === tab.id ? "text-violet-400" : "opacity-50"} />
                  {tab.label}
                  {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />}
                </button>
              ))}
            </div>

            <div className="flex items-center px-3 sm:px-4 border-l border-white/10 shrink-0">
              {/* Auf dem Handy nur das Symbol, damit die Tabs Platz behalten */}
              <button
                onClick={() => handleCopy(overlayUrl, "overlay")}
                aria-label="Browser Source kopieren"
                title="Browser Source kopieren"
                className="sm:w-52 px-3 sm:px-0 flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-500 rounded-sm text-white text-sm font-bold transition-colors"
              >
                {overlayCopied ? <Check size={16} /> : <Copy size={16} />}
                <span className="hidden sm:inline">{overlayCopied ? "Kopiert" : "Browser Source kopieren"}</span>
              </button>
            </div>
          </div>

          {/* KÖRPER */}
          <div className="flex-1 flex min-h-0">

            {/* LINKS: Editor — nur dieser Teil scrollt */}
            <div className={`flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8 ${mobileView === "live" ? "hidden md:block" : ""}`}>

              {/* 1. CHALLENGES */}
              {activeTab === "challenges" && (
                <div>
                  {/* Die Liste liegt auf einem etwas helleren Ton als der Rest der Fläche,
                      damit sie sich als eigener Bereich abhebt. */}
                  <div className="border border-white/10 bg-[#171722] rounded-sm overflow-hidden">
                  <div
                    className="divide-y divide-white/10"
                    onDragEnd={endDrag}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null); }}
                  >
                    {(doc.items || []).map((it, idx) => {
                      const done = it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
                      const isDragging = draggingId === it.id;
                      const dropBefore = dropTarget?.id === it.id && dropTarget.before;
                      const dropAfter = dropTarget?.id === it.id && !dropTarget.before;
                      return (
                        <div key={it.id} onDragOver={onDragOver(it.id)} onDrop={onDrop(it.id)} className="relative">
                          {/* Einfügemarke: zeigt vor dem Loslassen, wo die Challenge landet */}
                          <div className={`absolute top-0 left-0 right-0 h-0.5 z-10 transition-opacity ${dropBefore ? "bg-violet-500 opacity-100" : "opacity-0"}`} />
                          <div className={`absolute bottom-0 left-0 right-0 h-0.5 z-10 transition-opacity ${dropAfter ? "bg-violet-500 opacity-100" : "opacity-0"}`} />

                          <div className={`group border-l-2 px-4 py-3 transition-colors ${
                            isDragging
                              ? "opacity-40 bg-violet-500/10 border-violet-500/50"
                              : done
                                ? "border-green-500/60 hover:bg-white/[0.03]"
                                : "border-transparent hover:bg-white/[0.03]"
                          }`}>
                            {/* Reicht der Platz nicht für Name + Aktionen, rutschen die Aktionen
                                in die nächste Zeile — statt den Namen auf ein paar Buchstaben
                                zusammenzuquetschen. */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              {/* Drag & Name */}
                              <div className="flex items-center gap-3 flex-1 min-w-[min(24rem,100%)]">
                                <div
                                  draggable
                                  onDragStart={onDragStart(it.id)}
                                  onDragEnd={endDrag}
                                  title="Ziehen zum Sortieren"
                                  className={`shrink-0 p-1 rounded-sm transition-colors ${isDragging ? "cursor-grabbing text-violet-400 bg-violet-500/10" : "cursor-grab text-white/20 hover:text-white/60 hover:bg-white/5"}`}
                                >
                                  <GripVertical size={18} />
                                </div>
                                {/* Tastatur-Alternative zum Ziehen */}
                                <div className="flex flex-col shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                  <button onClick={() => moveItem(it.id, -1)} disabled={idx === 0} title="Nach oben" className="text-white/25 hover:text-white disabled:opacity-20 disabled:hover:text-white/25 leading-none p-0.5"><ChevronUp size={13} /></button>
                                  <button onClick={() => moveItem(it.id, 1)} disabled={idx === (doc.items || []).length - 1} title="Nach unten" className="text-white/25 hover:text-white disabled:opacity-20 disabled:hover:text-white/25 leading-none p-0.5"><ChevronDown size={13} /></button>
                                </div>
                                <input
                                  className="flex-1 min-w-0 bg-transparent text-lg font-bold placeholder-white/20 focus:outline-none text-white truncate"
                                  placeholder="Challenge Name..."
                                  value={it.name}
                                  onChange={(e) => updateItem(it.id, { name: e.target.value })}
                                />
                                {/* Haken hinter der Challenge. Der Platz ist immer reserviert,
                                    damit die Zeile beim Abhaken nicht springt. */}
                                <Check
                                  size={18}
                                  strokeWidth={3}
                                  className={`shrink-0 text-green-400 transition-opacity ${done ? "opacity-100" : "opacity-0"}`}
                                  aria-label={done ? "erledigt" : undefined}
                                />
                              </div>

                              {/* Aktionen */}
                              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 ml-auto">
                                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white/50 hover:text-white transition-colors select-none">
                                  <input type="checkbox" className="accent-violet-500" checked={!!it.useWins} onChange={(e) => updateItem(it.id, { useWins: e.target.checked })} />
                                  <span>Zähler</span>
                                </label>

                                {it.useWins ? (
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center border border-white/10 rounded-sm px-2 py-1">
                                      <span className="text-[10px] uppercase text-white/30 font-bold mr-2">Ziel</span>
                                      <input type="number" min={1} className="w-8 bg-transparent text-right text-sm tabular-nums focus:outline-none text-white" value={it.target || 1} onChange={(e) => updateItem(it.id, { target: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
                                    </div>
                                    <div className="flex items-center border border-white/10 rounded-sm overflow-hidden">
                                      <button onClick={() => updateItem(it.id, { progress: Math.max(0, (it.progress || 0) - 1) })} className="px-3 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors">−</button>
                                      <span className="w-8 text-center font-bold text-white text-sm tabular-nums">{it.progress || 0}</span>
                                      <button onClick={() => updateItem(it.id, { progress: (it.progress || 0) + 1 })} className="px-3 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors">+</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button onClick={() => updateItem(it.id, { done: !it.done })} className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border transition-colors text-xs font-bold ${it.done ? "bg-green-500/15 border-green-500/30 text-green-400" : "border-white/10 text-white/40 hover:text-white"}`}>
                                    {it.done ? <Check size={14} /> : <div className="w-3.5 h-3.5 rounded-sm border border-white/30" />}
                                    {it.done ? "Erledigt" : "Offen"}
                                  </button>
                                )}

                                <div className="flex items-center gap-1 sm:border-l border-white/10 sm:pl-3">
                                  <button onClick={() => updateItem(it.id, { pinned: !it.pinned })} className={`p-2 rounded-sm transition-colors ${it.pinned ? "text-violet-400 bg-violet-500/10" : "text-white/20 hover:text-white hover:bg-white/5"}`} title="Anpinnen"><Pin size={16} /></button>
                                  <button onClick={() => removeItem(it.id)} className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors" title="Löschen"><Trash2 size={16} /></button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  </div>

                  {/* Die häufigste Aktion auf dieser Seite: als gefüllter Knopf unter der Liste */}
                  <button onClick={addItem} className="w-full mt-4 py-3.5 bg-violet-600 hover:bg-violet-500 rounded-sm text-white text-sm font-bold transition-colors flex justify-center items-center gap-2">
                    <Plus size={18} /> Neue Challenge hinzufügen
                  </button>
                </div>
              )}

              {/* 2. DESIGN */}
              {activeTab === "custom" && (
                <div className="max-w-4xl">

                  {/* Vorlagen — der Einstieg ohne eine einzige Zahl */}
                  <Section
                    id="presets" title="Vorlage wählen" icon={Palette}
                    open={openSection === "presets"} onToggle={setOpenSection}
                  >
                    <p className="text-xs text-white/40 mb-4">
                      Setzt alle Farben auf einmal. Danach kannst du unter „Farben" einzeln nachjustieren.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {STYLE_PRESETS.map((p) => {
                        const active = activePresetId === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => save({ ...doc, style: normalizeStyle({ ...doc.style, ...p.style }) })}
                            className={`rounded-sm border p-3.5 text-left transition-colors ${active ? "border-violet-500 bg-violet-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
                          >
                            <div className="flex items-center gap-1.5 mb-2">
                              {["boxBg", "headerBg", "itemBg", "accent", "textColor"].map((k) => (
                                <span key={k} className="w-5 h-5 rounded-sm border border-white/10" style={{ background: p.style[k] }} />
                              ))}
                            </div>
                            <span className={`text-xs font-bold ${active ? "text-white" : "text-white/60"}`}>{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  {/* Titel */}
                  <Section
                    id="title" title="Titel" icon={Layout}
                    open={openSection === "title"} onToggle={setOpenSection}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Titel Text" className="md:col-span-2">
                        <input className="w-full bg-black/40 border border-white/10 rounded-sm px-4 py-3 text-white focus:border-violet-500 focus:outline-none transition-colors" value={doc.title || ""} onChange={(e) => save({ ...doc, title: e.target.value })} placeholder="WinChallenge" />
                      </Field>
                      <RangeSlider label="Schriftgröße" value={doc.style?.titleFontSize ?? 20} min={12} max={48} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleFontSize: v }) })} />
                      <Field label="Ausrichtung">
                        <Segmented
                          label="Ausrichtung"
                          value={doc.style?.titleAlign ?? "left"}
                          onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleAlign: v }) })}
                          options={[{ value: "left", label: "Links" }, { value: "center", label: "Mittig" }]}
                        />
                      </Field>
                      <Field label="Gesamtfortschritt im Header">
                        <Segmented
                          label="Gesamtfortschritt im Header"
                          value={doc.style?.headerProgress ?? "off"}
                          onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerProgress: v }) })}
                          options={[{ value: "off", label: "Aus" }, { value: "count", label: "Zahl" }, { value: "box", label: "Box" }]}
                        />
                      </Field>
                    </div>
                  </Section>

                  {/* Farben — alle sechs auf einen Blick */}
                  <Section
                    id="colors" title="Farben" icon={Palette}
                    open={openSection === "colors"} onToggle={setOpenSection}
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <ColorPicker label="Header" value={hex3to6(doc.style?.headerBg)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerBg: v }) })} />
                      <ColorPicker label="Zeilen" value={hex3to6(doc.style?.itemBg)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemBg: v }) })} />
                      <ColorPicker label="Footer" value={hex3to6(doc.style?.boxBg)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, boxBg: v }) })} />
                      <ColorPicker label="Titel" value={hex3to6(doc.style?.titleColor)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleColor: v }) })} />
                      <ColorPicker label="Text" value={hex3to6(doc.style?.textColor)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, textColor: v }) })} />
                      <ColorPicker label="Akzent" value={hex3to6(doc.style?.accent)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, accent: v }) })} />
                    </div>
                  </Section>

                  {/* Größe & Form */}
                  <Section
                    id="layout" title="Größe & Form" icon={Settings}
                    open={openSection === "layout"} onToggle={setOpenSection}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Layout" className="md:col-span-2">
                        <Segmented
                          label="Layout"
                          value={doc.style?.layout ?? "list"}
                          onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, layout: v }) })}
                          options={[{ value: "list", label: "Liste" }, { value: "cards", label: "Karten" }, { value: "compact", label: "Kompakt" }]}
                        />
                      </Field>
                      <RangeSlider label="Breite" value={doc.style?.boxWidth ?? 320} min={280} max={1000} step={10} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, boxWidth: v }) })} />
                      <RangeSlider label="Skalierung" value={doc.style?.scale ?? 1} min={0.5} max={2} step={0.05} unit="x" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, scale: v }) })} />
                      <RangeSlider label="Challenge Größe" value={doc.style?.itemFontSize ?? 16} min={10} max={32} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemFontSize: v }) })} />
                      <RangeSlider label="Timer Größe" value={doc.style?.timerFontSize ?? doc.style?.itemFontSize ?? 16} min={10} max={48} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, timerFontSize: v }) })} />
                      <RangeSlider label="Eckenradius" value={doc.style?.borderRadius ?? 0} min={0} max={32} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, borderRadius: v }) })} />
                    </div>
                  </Section>

                  {/* Zeilen & Zähler */}
                  <Section
                    id="items" title="Zeilen & Zähler" icon={ListChecks}
                    open={openSection === "items"} onToggle={setOpenSection}
                  >
                    <div className="grid grid-cols-1 gap-3 max-w-xl">
                      <Field label="Zähler-Anzeige">
                        <Segmented
                          label="Zähler-Anzeige"
                          value={doc.style?.counterStyle ?? "plain"}
                          onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, counterStyle: v }) })}
                          options={[{ value: "plain", label: "Zahl" }, { value: "box", label: "Box" }]}
                        />
                      </Field>
                      <CheckField
                        label="Erledigte Challenges ans Ende sortieren"
                        checked={!!doc.style?.doneToBottom}
                        onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, doneToBottom: v }) })}
                      />
                    </div>
                  </Section>

                  {/* Deckkraft — jede Fläche einzeln */}
                  <Section
                    id="opacity" title="Deckkraft" icon={Eye}
                    open={openSection === "opacity"} onToggle={setOpenSection}
                  >
                    <p className="text-xs text-white/40 mb-4">
                      Jede Fläche einzeln. 0 = komplett durchsichtig, 1 = deckend.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <RangeSlider label="Header" value={doc.style?.headerOpacity ?? 0.9} min={0} max={1} step={0.05} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerOpacity: v }) })} />
                      <RangeSlider label="Challenge-Zeilen" value={doc.style?.itemOpacity ?? doc.style?.opacity ?? 0.6} min={0} max={1} step={0.05} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemOpacity: v }) })} />
                      {/* Nur die Box hat eine Füllung — eine reine Zahl hat nichts zum Durchscheinen */}
                      {(doc.style?.counterStyle === "box" || (doc.style?.headerProgress ?? "off") === "box") && (
                        <RangeSlider label="Zähler-Box" value={doc.style?.counterOpacity ?? 0.06} min={0} max={1} step={0.01} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, counterOpacity: v }) })} />
                      )}
                      <RangeSlider label="Footer" value={doc.style?.timerOpacity ?? doc.style?.opacity ?? 0.6} min={0} max={1} step={0.05} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, timerOpacity: v }) })} />
                    </div>
                  </Section>

                  {/* Animation */}
                  <Section
                    id="animation" title="Animation" icon={RefreshCw}
                    open={openSection === "animation"} onToggle={setOpenSection}
                  >
                    <p className="text-xs text-white/40 mb-4">
                      Nur nötig, wenn mehr Challenges vorhanden sind, als gleichzeitig ins Overlay passen.
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      <CheckField
                        label="Challenges automatisch durchwechseln"
                        checked={!!doc.animation?.enabled}
                        onChange={(v) => save({ ...doc, animation: { ...doc.animation, enabled: v } })}
                      />

                      {doc.animation?.enabled && (
                        <>
                          <Field label="Art" className="max-w-xl">
                            <Segmented
                              label="Art des Durchwechselns"
                              value={doc.animation?.mode === "scrolling" ? "scrolling" : "paging"}
                              onChange={(v) => save({ ...doc, animation: { ...doc.animation, mode: v } })}
                              options={[{ value: "paging", label: "Seitenweise" }, { value: "scrolling", label: "Laufschrift" }]}
                            />
                          </Field>
                          {doc.animation?.mode === "scrolling" ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <RangeSlider label="Geschwindigkeit" value={doc.animation?.scrolling?.speedPxPerSec ?? 30} min={5} max={200} step={5} unit="px/s" onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, speedPxPerSec: v } } })} />
                              <RangeSlider label="Sichtbare Zeilen" value={doc.animation?.scrolling?.visibleRows ?? 2} min={1} max={10} step={1} onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, visibleRows: v } } })} />
                              <div className="sm:col-span-2">
                                <RangeSlider label="Pause (Oben/Unten)" value={doc.animation?.scrolling?.pauseSec ?? 2} min={0} max={10} step={0.5} unit="s" onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, pauseSec: v } } })} />
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <RangeSlider label="Challenges pro Seite" value={doc.animation?.paging?.pageSize ?? 5} min={1} max={10} step={1} onChange={(v) => save({ ...doc, animation: { ...doc.animation, paging: { ...doc.animation?.paging, pageSize: v } } })} />
                              <RangeSlider label="Wechsel-Intervall" value={doc.animation?.paging?.intervalSec ?? 20} min={2} max={60} step={1} unit="s" onChange={(v) => save({ ...doc, animation: { ...doc.animation, paging: { ...doc.animation?.paging, intervalSec: v } } })} />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </Section>
                </div>
              )}

              {/* 3. TWITCH-CHAT */}
              {activeTab === "chat" && (
                <div className="max-w-3xl divide-y divide-white/10">
                  <div className="pb-6">
                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <MessageSquare size={16} className="text-white/40" /> Twitch-Chat-Befehle
                    </h4>
                    <label className="flex items-center gap-3 cursor-pointer mb-5">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-violet-500"
                        checked={!!doc.chatCommands?.enabled}
                        onChange={(e) =>
                          save({
                            ...doc,
                            chatCommands: {
                              ...DEFAULT_CHAT_COMMANDS,
                              ...doc.chatCommands,
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                      <span className="text-sm font-medium text-white">Chat-Befehle für dieses Overlay aktivieren</span>
                    </label>

                    {/* Kanäle */}
                    <div className="space-y-2">
                      <span className="text-[10px] uppercase text-white/40 font-bold tracking-wider">
                        Twitch-Kanäle ({chatChannels.length}/{MAX_CHAT_CHANNELS})
                      </span>
                      <p className="text-xs text-white/50">
                        Mehrere Kanäle möglich — z. B. wenn eine Gruppe gemeinsam ein Overlay nutzt. Mods und Streamer in jedem dieser Chats können dann dieselben Befehle verwenden.
                      </p>
                      <div className="space-y-2">
                        {chatChannels.map((c) => (
                          <div key={c} className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-sm px-3 py-2">
                            <Hash size={14} className="text-white/30 shrink-0" />
                            <span className="flex-1 text-sm font-mono text-white/80">{c}</span>
                            <button
                              onClick={() => removeChannel(c)}
                              className="p-1 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors"
                              title="Kanal entfernen"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {chatChannels.length < MAX_CHAT_CHANNELS && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="kanalname (Kleinbuchstaben, ohne #)"
                              value={newChannel}
                              onChange={(e) => setNewChannel(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChannel(); } }}
                              className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-sm px-4 py-2.5 text-sm text-white focus:border-violet-500 focus:outline-none transition-colors"
                            />
                            <button
                              onClick={addChannel}
                              disabled={!normalizeChannelName(newChannel)}
                              className="px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-sm text-white font-bold text-sm transition-colors flex items-center gap-2"
                            >
                              <Plus size={16} /> Hinzufügen
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-violet-500"
                          checked={doc.chatCommands?.requireModOrBroadcaster !== false}
                          onChange={(e) =>
                            save({
                              ...doc,
                              chatCommands: {
                                ...DEFAULT_CHAT_COMMANDS,
                                ...doc.chatCommands,
                                requireModOrBroadcaster: e.target.checked,
                              },
                            })
                          }
                        />
                        <span className="text-sm text-white/80">Nur Mods und Streamer</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-violet-500"
                          checked={doc.chatCommands?.replyInChat !== false}
                          onChange={(e) =>
                            save({
                              ...doc,
                              chatCommands: {
                                ...DEFAULT_CHAT_COMMANDS,
                                ...doc.chatCommands,
                                replyInChat: e.target.checked,
                              },
                            })
                          }
                        />
                        <span className="text-sm text-white/80">Bestätigungen im Chat (z. B. „Timer wurde pausiert“)</span>
                      </label>
                    </div>
                  </div>

                  {/* Befehls-Referenz */}
                  <div className="pt-6">
                    <p className="text-sm font-bold text-white mb-4">Befehle</p>
                    <div>
                      {CHAT_COMMAND_DOCS.map((c) => (
                        <div key={c.cmd} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-2 border-b border-white/5 last:border-b-0">
                          <code className="text-xs font-mono text-violet-300 sm:w-56 shrink-0">{c.cmd}</code>
                          <span className="text-xs text-white/60">{c.desc}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-white/40 mt-4">
                      Die Namenssuche ist unscharf: „!pin minecraft“ findet „Minecraft Enderdragon besiegen“, „!+ rocketleague“ zählt bei „Rocket League Wins“ hoch.
                    </p>
                    <p className="text-xs text-white/40 mt-2">
                      Timer-Befehle erfordern die Mod-Berechtigung „Timer steuern“, Challenge-Befehle „Challenges bearbeiten“ (Tab „Einstellungen“). Du selbst kannst als Overlay-Besitzer immer alle Befehle nutzen.
                    </p>
                  </div>
                </div>
              )}

              {/* 4. EINSTELLUNGEN */}
              {activeTab === "settings" && (
                <div className="max-w-3xl">

                  {/* 14-day inactivity notice */}
                  <div className="flex items-start gap-3 border-l-2 border-amber-500/60 pl-4 py-1 mb-6">
                    <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200/80">
                      Kostenloses Overlay: Bei <strong className="text-amber-200">14 Tagen Inaktivität</strong> (kein OBS-Zugriff auf den Overlay-Link) wird dein Overlay automatisch zurückgesetzt, um Speicherplatz freizugeben.
                    </p>
                  </div>

                  <div className="divide-y divide-white/10">
                    {/* OBS Browser Source */}
                    <div className="py-6 first:pt-0">
                      <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Monitor size={16} className="text-white/40" /> OBS Browser Source</h4>
                      <div className="flex gap-2 mb-2">
                        <input readOnly type={showOverlayUrl ? "text" : "password"} className="flex-1 min-w-0 bg-black/40 px-4 py-3 rounded-sm text-sm font-mono text-white/70 border border-white/10 outline-none" value={overlayUrl} />
                        <button onClick={() => setShowOverlayUrl(!showOverlayUrl)} className="px-4 border border-white/10 hover:bg-white/5 rounded-sm text-white/70 transition-colors">{showOverlayUrl ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                        <button onClick={() => handleCopy(overlayUrl, "overlay")} className="px-5 bg-violet-600 hover:bg-violet-500 rounded-sm text-white font-bold text-sm transition-colors flex items-center gap-2">
                          {overlayCopied ? <Check size={16} /> : <Copy size={16} />}
                          {overlayCopied ? "Kopiert" : "Kopieren"}
                        </button>
                      </div>
                      <button onClick={regenerateOverlayKey} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-2">
                        <RefreshCw size={12} /> Link neu generieren (Reset)
                      </button>
                    </div>

                    {/* Moderator Link */}
                    <div className="py-6">
                      <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><ShieldAlert size={16} className="text-white/40" /> Moderator Link</h4>
                      <p className="text-xs text-white/50 mb-4">Teile diesen Link mit Mods, damit sie Timer und Ergebnisse steuern können. In der Moderator-Ansicht sehen sie außerdem alle verfügbaren Chat-Befehle.</p>
                      <div className="flex gap-2 mb-2">
                        <input readOnly type={showControlUrl ? "text" : "password"} className="flex-1 min-w-0 bg-black/40 px-4 py-3 rounded-sm text-sm font-mono text-white/70 border border-white/10 outline-none" value={controlUrl} />
                        <button onClick={() => setShowControlUrl(!showControlUrl)} className="px-4 border border-white/10 hover:bg-white/5 rounded-sm text-white/70 transition-colors">{showControlUrl ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                        <button onClick={() => handleCopy(controlUrl, "control")} className="px-5 bg-violet-600 hover:bg-violet-500 rounded-sm text-white font-bold text-sm transition-colors flex items-center gap-2">
                          {controlCopied ? <Check size={16} /> : <Copy size={16} />}
                          {controlCopied ? "Kopiert" : "Kopieren"}
                        </button>
                      </div>
                      <button onClick={regenerateControlKey} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-2">
                        <RefreshCw size={12} /> Link neu generieren (Reset)
                      </button>
                    </div>

                    {/* Berechtigungen */}
                    <div className="py-6">
                      <h5 className="text-xs font-bold text-white/40 uppercase mb-3">Berechtigungen für Mods (Control-Link & Chat-Befehle)</h5>
                      <div className="space-y-1">
                        {[
                          { key: "allowModsTimer", label: "Timer steuern (Start/Stop/Reset/Setzen)" },
                          { key: "allowModsTitle", label: "Titel ändern" },
                          { key: "allowModsChallenges", label: "Challenges bearbeiten (Wins/Status/Pin)" },
                        ].map((perm) => (
                          <label key={perm.key} className="flex items-center gap-3 cursor-pointer py-2 rounded-sm hover:bg-white/5 transition-colors">
                            <input type="checkbox" className="w-4 h-4 accent-violet-500 bg-transparent" checked={!!doc.controlPermissions?.[perm.key]} onChange={(e) => save({ ...doc, controlPermissions: { ...doc.controlPermissions, [perm.key]: e.target.checked } })} />
                            <span className="text-sm text-white/80">{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Reset Zone (GANZ UNTEN) */}
                    <div className="pt-6">
                      <div className="flex justify-between items-center gap-4">
                        <div>
                          <h4 className="text-sm font-bold text-red-200">Gefahrenzone</h4>
                          <p className="text-xs text-red-400/70 mt-1">Setzt Design, alle Challenges und Einstellungen auf Standard zurück.</p>
                        </div>
                        <button onClick={doFullReset} className="px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-300 border border-red-900/50 rounded-sm text-sm transition-colors font-bold flex items-center gap-2 shrink-0">
                          <Trash2 size={16} /> Alles zurücksetzen
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RECHTS: Vorschau + Timer — scrollt nie, füllt immer die Höhe */}
            <div className={`${mobileView === "live" ? "flex" : "hidden md:flex"} w-full md:w-[380px] lg:w-[460px] xl:w-[560px] 2xl:w-[640px] shrink-0 flex-col min-h-0 md:border-l border-white/10`}>

              {/* Vorschau — füllt den Platz über dem Timer */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-white/50 text-xs uppercase tracking-wider font-bold">Live Vorschau</h3>
                  <span className="text-[11px] text-white/30 tabular-nums">
                    {doc.style?.boxWidth ?? 320}px{previewFitPercent != null && previewFitPercent < 100 ? ` · ${previewFitPercent}%` : ""}
                  </span>
                </div>
                <button onClick={() => setPreviewLightMode(!previewLightMode)} className="text-xs text-white/50 hover:text-white transition-colors">
                  Hintergrund: {previewLightMode ? "Hell" : "Dunkel"}
                </button>
              </div>
              {renderPreview()}

              {/* Timer — immer sichtbar, wird nie aus dem Bild geschoben */}
              <div className="border-t border-white/10 px-5 py-4 shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-white/50 text-xs uppercase tracking-wider font-bold">Timer</h3>
                    <span className={`text-xs font-bold ${running ? "text-green-400" : "text-white/35"}`}>{running ? "Läuft" : "Pausiert"}</span>
                  </div>
                  {/* Sichtbarkeit — als Text, damit der Zustand ohne Nachdenken lesbar bleibt */}
                  <button
                    onClick={toggleTimerVisible}
                    className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${timerVisible ? "text-white/50 hover:text-white" : "text-amber-300 hover:text-amber-200"}`}
                  >
                    {timerVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                    {timerVisible ? "Im Overlay sichtbar" : "Im Overlay ausgeblendet"}
                  </button>
                </div>

                {/* Uhrzeit — anklicken zum direkten Bearbeiten (Enter übernimmt, Esc bricht ab) */}
                <div className="relative">
                  <input
                    type="text"
                    aria-label="Timer-Zeit, zum Ändern anklicken"
                    title="Zum Ändern anklicken (HH:MM:SS)"
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
                    className={`w-full bg-transparent text-center text-4xl font-semibold tabular-nums tracking-wide py-2 border-b focus:outline-none transition-colors ${
                      manualTimeError
                        ? "text-red-400 border-red-500/60"
                        : editingTime
                          ? "text-white border-violet-500"
                          : "text-white border-transparent hover:border-white/15"
                    }`}
                  />
                  {!editingTime && (
                    <Pencil size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  )}
                </div>
                {manualTimeError && <p className="text-[11px] text-red-400 mt-1.5 text-center">Format: HH:MM:SS oder MM:SS</p>}

                <div className="grid grid-cols-2 gap-2 mt-3">
                  {!running ? (
                    <button onClick={startTimer} className="bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2">
                      <Play size={16} fill="currentColor" /> Start
                    </button>
                  ) : (
                    <button onClick={pauseTimer} className="bg-amber-500 hover:bg-amber-400 text-black py-2.5 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2">
                      <Pause size={16} fill="currentColor" /> Pause
                    </button>
                  )}
                  <button onClick={resetTimer} className="border border-white/15 hover:bg-white/5 text-white/80 hover:text-white py-2.5 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    <RotateCcw size={15} /> Reset
                  </button>
                </div>

                {/* Zeit anpassen — Schrittweite wählen, dann ± */}
                <div className="grid grid-cols-[auto_1fr_auto] gap-2 mt-3 pt-3 border-t border-white/10">
                  <button
                    onClick={() => adjustTimer(-timerStep)}
                    title="Zeit abziehen"
                    aria-label="Zeit abziehen"
                    className="px-3 border border-white/10 hover:bg-white/5 rounded-sm text-white/60 hover:text-white transition-colors flex items-center"
                  >
                    <Minus size={16} />
                  </button>
                  <div className="flex border border-white/10 rounded-sm overflow-hidden" role="group" aria-label="Schrittweite">
                    {TIMER_STEPS.map((s) => (
                      <button
                        key={s.ms}
                        onClick={() => setTimerStep(s.ms)}
                        aria-pressed={timerStep === s.ms}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${timerStep === s.ms ? "bg-white/10 text-white" : "text-white/40 hover:text-white"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => adjustTimer(timerStep)}
                    title="Zeit addieren"
                    aria-label="Zeit addieren"
                    className="px-3 border border-white/10 hover:bg-white/5 rounded-sm text-white/60 hover:text-white transition-colors flex items-center"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Umschalter nur auf schmalen Bildschirmen: dort passt neben dem Editor
              keine zweite Spalte mehr */}
          <div className="md:hidden grid grid-cols-2 border-t border-white/10 shrink-0">
            {[
              { id: "edit", label: "Bearbeiten", icon: Pencil },
              { id: "live", label: "Vorschau & Timer", icon: Monitor },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setMobileView(v.id)}
                aria-pressed={mobileView === v.id}
                className={`relative flex items-center justify-center gap-2 py-3.5 text-sm font-bold transition-colors ${mobileView === v.id ? "text-white" : "text-white/40 hover:text-white"}`}
              >
                <v.icon size={16} className={mobileView === v.id ? "text-violet-400" : "opacity-50"} />
                {v.label}
                {mobileView === v.id && <span className="absolute top-0 left-0 right-0 h-0.5 bg-violet-500" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
