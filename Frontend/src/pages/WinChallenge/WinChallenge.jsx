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
import {
  Trophy,
  Palette,
  Settings,
  Play,
  Pause,
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
  Layout,
  Clock,
  X,
  Hash,
} from "lucide-react";

// --- HELPER FUNCTIONS ---
function msToClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

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

function hexToRgba(hex, alpha = 1) {
  let c = (hex || "#000000").replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  borderRadius: 12, scale: 1.0, boxWidth: 280, titleAlign: "left",
  titleColor: "#ffffff", headerBg: "#0B0F1A", headerOpacity: 0.9,
  titleFontSize: 18, itemFontSize: 16, itemBg: "#151b2c",
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
  s.opacity = Math.min(1, Math.max(0, Number(s.opacity ?? 0.6)));
  s.headerOpacity = Math.min(1, Math.max(0, Number(s.headerOpacity ?? s.opacity)));
  s.borderRadius = Math.max(0, parseInt(s.borderRadius ?? 12, 10));
  s.scale = Number(s.scale ?? 1);
  s.boxWidth = Math.min(1600, Math.max(280, parseInt(s.boxWidth ?? 520, 10)));
  s.titleFontSize = Math.max(10, Math.min(48, parseInt(s.titleFontSize ?? 20, 10)));
  s.itemFontSize = Math.max(8, Math.min(36, parseInt(s.itemFontSize ?? 16, 10)));
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

const ColorPicker = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-2">
    <span className="text-[10px] uppercase text-white/40 font-bold tracking-wider">{label}</span>
    <div className="flex items-center gap-3 bg-black/30 p-1.5 rounded-sm border border-white/5 hover:border-white/10 transition-colors">
      <div className="relative w-8 h-8 rounded-sm overflow-hidden ring-1 ring-white/10 shrink-0">
        <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -top-4 -left-4 w-16 h-16 cursor-pointer p-0 border-0"
        />
      </div>
      <span className="text-xs font-mono text-white/70 uppercase">{value}</span>
    </div>
  </div>
);

const RangeSlider = ({ label, value, min, max, step, onChange, unit = "" }) => (
    <div className="bg-black/20 p-3 rounded-sm border border-white/5">
        <div className="flex justify-between mb-2">
            <span className="text-xs text-white/60 font-medium">{label}</span>
            <span className="text-xs text-white font-mono bg-white/10 px-1.5 py-0.5 rounded-sm">{value}{unit}</span>
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

// --- MAIN COMPONENT ---

export default function WinChallenge() {
  const { user, login } = useContext(TwitchAuthContext);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const dragIdRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const saveSeqRef = useRef(0);
  const pendingSaveRef = useRef(false);

  const [activeTab, setActiveTab] = useState("challenges");
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [controlCopied, setControlCopied] = useState(false);

  const [showOverlayUrl, setShowOverlayUrl] = useState(false);
  const [showControlUrl, setShowControlUrl] = useState(false);

  const [localNow, setLocalNow] = useState(Date.now());
  const [previewLightMode, setPreviewLightMode] = useState(false);

  const [newChannel, setNewChannel] = useState("");
  const [manualTime, setManualTime] = useState("");
  const [manualTimeError, setManualTimeError] = useState(false);

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

  // DnD
  const onDragStart = (id) => (e) => { dragIdRef.current = id; e.dataTransfer.effectAllowed = "move"; };
  const onDragOver = () => (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const onDrop = (id) => (e) => {
    e.preventDefault();
    const from = dragIdRef.current;
    const to = id;
    if (!from || !to || from === to) return;
    const list = [...(doc?.items || [])];
    const fromIdx = list.findIndex((x) => x.id === from);
    const toIdx = list.findIndex((x) => x.id === to);
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    save({ ...doc, items: list });
    dragIdRef.current = null;
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
  const applyManualTime = () => {
    const ms = parseClockInput(manualTime);
    if (ms == null) { setManualTimeError(true); return; }
    setManualTimeError(false);
    const t = doc?.timer || {};
    const next = { ...t, elapsedMs: ms };
    if (t.running) next.startedAt = Date.now() - ms;
    save({ ...doc, timer: next }, { flush: true });
    setManualTime("");
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
    const boxAlpha = Math.min(1, Math.max(0, Number(style.opacity ?? 0.6)));
    const headerAlpha = Math.min(1, Math.max(0, Number(style.headerOpacity ?? boxAlpha)));
    const showTimer = timerVisible;
    const namedItems = (doc.items || []).filter((i) => (i.name || "").trim());
    const items = (namedItems.length > 0 ? namedItems : [{ id: "p1", name: "Beispiel Challenge", pinned: true }, { id: "p2", name: "Gewinne 3 Runden", useWins: true, target: 3, progress: 1 }]).slice(0, 6);

    // Passend skalieren: so bleibt auch eine Breiten-Änderung in der Vorschau sichtbar
    const scaledW = (style.boxWidth || 520) * (style.scale || 1);
    const avail = Math.max(0, previewW - 32);
    const fit = avail > 0 ? Math.min(1, avail / scaledW) : 1;
    const zoom = (style.scale || 1) * fit;

    return (
      <div ref={setPreviewEl} className={`flex-1 min-h-0 rounded-sm border border-white/5 flex justify-center items-center p-4 transition-colors overflow-hidden ${previewLightMode ? "bg-gray-200" : "bg-[#09090b]"}`}>
        <div style={{
            fontFamily: "Inter, sans-serif", color: style.textColor, borderRadius: style.borderRadius,
            background: "transparent", width: style.boxWidth, zoom,
            overflow: "hidden", boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4)", position: "relative"
        }}>
            <div style={{ position: "absolute", inset: 0, background: style.boxBg, opacity: boxAlpha, zIndex: 0 }} />
            <div className="relative z-10">
                <div style={{ borderBottom: "1px solid rgba(255,255,255,.08)", position: "relative" }}>
                    <div style={{ position: "absolute", inset: 0, background: style.headerBg || style.boxBg, opacity: headerAlpha, zIndex: -1 }} />
                    <div style={{ padding: "14px 18px", fontWeight: 800, textAlign: style.titleAlign === "center" ? "center" : "left", color: style.titleColor || style.textColor, fontSize: `${style.titleFontSize}px` }}>
                        {doc.title || "WinChallenge"}
                    </div>
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {items.map((it) => (
                        <div key={it.id} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: Math.min(10, style.borderRadius), overflow: "hidden" }}>
                            <div style={{ position: "absolute", inset: 0, background: style.itemBg || "#ffffff", opacity: style.itemBg ? boxAlpha : 0.04, zIndex: -1 }} />
                            <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: (it.done || (it.useWins && it.progress >= it.target)) ? "#2ecc71" : "inherit", fontSize: `${style.itemFontSize}px` }}>
                                {it.pinned && <Pin size="1em" strokeWidth={2.5} style={{ color: style.accent, flexShrink: 0 }} />} {it.name}
                            </span>
                            {it.useWins ? (
                                <span style={{ padding: "2px 10px", borderRadius: 6, background: "rgba(255,255,255,.06)", border: `1px solid ${hexToRgba(style.accent || "#9146FF", 0.5)}`, fontSize: "0.85em" }}>
                                    {it.progress || 0} / {it.target || 0}
                                </span>
                            ) : (
                                <span style={{ width: 18, height: 18, borderRadius: 4, border: "2px solid rgba(255,255,255,.5)", display: "flex", alignItems: "center", justifyContent: "center", color: (it.done || (it.useWins && it.progress >= it.target)) ? "#2ecc71" : "transparent" }}>
                                    <Check size={12} strokeWidth={4} />
                                </span>
                            )}
                        </div>
                    ))}
                </div>
                {showTimer && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", background: "rgba(0,0,0,0.2)", padding: "10px", display: "flex", justifyContent: "center", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: running ? "#22c55e" : "#ef4444", display: "inline-block", flexShrink: 0 }} />
                        <span>{msToClock(runningElapsed)}</span>
                    </div>
                )}
            </div>
        </div>
      </div>
    );
  };

  const previewFitPercent = useMemo(() => {
    if (!doc || !previewW) return null;
    const scaledW = (doc.style?.boxWidth || 520) * (doc.style?.scale || 1);
    const avail = Math.max(0, previewW - 32);
    const fit = avail > 0 ? Math.min(1, avail / scaledW) : 1;
    return Math.round(fit * 100);
  }, [doc, previewW]);

  return (
    <div className="h-full flex flex-col overflow-hidden text-white p-3 md:p-5 xl:p-6 gap-3 md:gap-5">
      <SEO
        title="Win Challenge Overlay"
        description="Win Challenge Overlay für OBS. Hohe Customization für Streamer."
        path="/WinChallenge-Overlay"
        keywords="Win Challenge Overlay, Win Challenge, OBS Overlay, Twitch, WinChallenge, Overlay" />

      {!user ? (
        <div className="h-full flex items-center justify-center">
            <button onClick={login} className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-8 py-4 rounded-sm transition-colors">
                Mit Twitch anmelden um Challenges zu erstellen
            </button>
        </div>
      ) : loading || !doc ? (
        <div className="h-full flex items-center justify-center text-white/30 animate-pulse">Lade Konfiguration...</div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 gap-3 md:gap-5">

            {/* HEADER — never scrolls */}
            <div className="panel px-6 py-4 flex items-center gap-4 shrink-0">
               <Trophy size={20} className="text-yellow-500 shrink-0" />
               <div>
                   <h1 className="font-display text-lg font-bold tracking-tight text-white leading-none">WinChallenge</h1>
                   <p className="text-[11px] text-white/40 mt-0.5">OBS Overlay Editor</p>
               </div>
            </div>

            {/* BODY — flex-row, fills remaining height */}
            <div className="flex-1 flex overflow-hidden min-h-0 gap-3 md:gap-5">

              {/* LEFT: EDITOR — only this scrolls */}
              <div className="panel flex-1 flex flex-col min-w-0 overflow-hidden">
                  {/* TABS */}
                  <div className="flex border-b border-white/10 bg-black/25 overflow-x-auto shrink-0">
                      {[
                          { id: "challenges", label: "Challenges", icon: Trophy },
                          { id: "custom", label: "Design", icon: Palette },
                          { id: "chat", label: "Twitch-Chat", icon: MessageSquare },
                          { id: "settings", label: "Einstellungen", icon: Settings },
                      ].map((tab) => (
                          <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={`flex items-center gap-2.5 px-8 py-4 text-sm font-bold transition-colors relative whitespace-nowrap ${
                                  activeTab === tab.id ? "text-white bg-white/5" : "text-white/40 hover:text-white hover:bg-white/5"
                              }`}
                          >
                              <tab.icon size={18} className={activeTab === tab.id ? "text-violet-400" : "opacity-50"} />
                              {tab.label}
                              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />}
                          </button>
                      ))}
                  </div>

                  {/* TAB CONTENT (SCROLLABLE) */}
                  <div className="p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar">
                      {/* 1. CHALLENGES TAB */}
                      {activeTab === "challenges" && (
                          <div className="space-y-6">
                              <div className="space-y-3">
                                  {(doc.items || []).map((it) => {
                                      const done = it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
                                      return (
                                          <div key={it.id} onDragOver={onDragOver(it.id)} onDrop={onDrop(it.id)}
                                               className={`group bg-black/20 hover:bg-black/30 rounded-sm p-4 border transition-colors ${done ? "border-green-500/30" : "border-white/5 hover:border-white/10"}`}>

                                              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                                  {/* Drag & Name */}
                                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                                      <div draggable onDragStart={onDragStart(it.id)} className="cursor-grab text-white/20 hover:text-white/50 p-1"><GripVertical size={18}/></div>
                                                      <input
                                                          className="flex-1 bg-transparent text-lg font-bold placeholder-white/20 focus:outline-none text-white truncate"
                                                          placeholder="Challenge Name..."
                                                          value={it.name}
                                                          onChange={(e) => updateItem(it.id, { name: e.target.value })}
                                                      />
                                                  </div>

                                                  {/* Actions */}
                                                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                                                      <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-white/50 hover:text-white transition-colors select-none">
                                                          <input type="checkbox" className="accent-violet-500" checked={!!it.useWins} onChange={(e) => updateItem(it.id, { useWins: e.target.checked })} />
                                                          <span>Zähler</span>
                                                      </label>

                                                      {it.useWins ? (
                                                          <div className="flex items-center gap-3">
                                                              <div className="flex items-center bg-black/40 rounded-sm border border-white/10 px-2 py-1">
                                                                  <span className="text-[10px] uppercase text-white/30 font-bold mr-2">Ziel</span>
                                                                  <input type="number" min={1} className="w-8 bg-transparent text-right text-sm font-mono focus:outline-none text-white" value={it.target || 1} onChange={(e) => updateItem(it.id, { target: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
                                                              </div>
                                                              <div className="flex items-center bg-white/5 rounded-sm border border-white/5 overflow-hidden">
                                                                  <button onClick={() => updateItem(it.id, { progress: Math.max(0, (it.progress || 0) - 1) })} className="px-3 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors font-mono">−</button>
                                                                  <span className="w-8 text-center font-mono font-bold text-white text-sm">{it.progress || 0}</span>
                                                                  <button onClick={() => updateItem(it.id, { progress: (it.progress || 0) + 1 })} className="px-3 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors font-mono">+</button>
                                                              </div>
                                                          </div>
                                                      ) : (
                                                          <button onClick={() => updateItem(it.id, { done: !it.done })} className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border transition-colors text-xs font-bold ${it.done ? "bg-green-500/20 border-green-500/30 text-green-400" : "bg-white/5 border-white/5 text-white/40 hover:text-white"}`}>
                                                              {it.done ? <Check size={14}/> : <div className="w-3.5 h-3.5 rounded-sm border border-white/30" />}
                                                              {it.done ? "Erledigt" : "Offen"}
                                                          </button>
                                                      )}

                                                      <div className="flex items-center gap-1 border-l border-white/10 pl-2 ml-2">
                                                          <button onClick={() => updateItem(it.id, { pinned: !it.pinned })} className={`p-2 rounded-sm transition-colors ${it.pinned ? "text-violet-400 bg-violet-500/10" : "text-white/20 hover:text-white hover:bg-white/5"}`} title="Anpinnen"><Pin size={16}/></button>
                                                          <button onClick={() => removeItem(it.id)} className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors" title="Löschen"><Trash2 size={16}/></button>
                                                      </div>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>

                              <button onClick={addItem} className="w-full py-4 rounded-sm border border-dashed border-white/10 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors font-bold flex justify-center items-center gap-2 mt-4">
                                  <Plus size={20} /> Neue Challenge hinzufügen
                              </button>
                          </div>
                      )}

                      {/* 2. CUSTOM TAB */}
                      {activeTab === "custom" && (
                          <div className="space-y-10">

                              {/* Header & Titel */}
                              <div>
                                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Layout size={20} className="text-violet-400"/> Header & Titel</h3>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-sm bg-black/20 border border-white/5">
                                      <div className="col-span-full">
                                          <label className="block text-xs font-bold text-white/40 uppercase mb-2">Titel Text</label>
                                          <input className="w-full bg-black/40 border border-white/10 rounded-sm px-4 py-3 text-white focus:border-violet-500 focus:outline-none transition-colors" value={doc.title || ""} onChange={(e) => save({ ...doc, title: e.target.value })} placeholder="WinChallenge" />
                                      </div>
                                      <RangeSlider label="Schriftgröße" value={doc.style?.titleFontSize ?? 20} min={12} max={48} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleFontSize: v }) })} />
                                      <div>
                                          <span className="text-xs font-bold text-white/40 uppercase mb-2 block">Ausrichtung</span>
                                          <div className="flex bg-black/40 rounded-sm p-1 border border-white/5">
                                              {['left', 'center'].map(align => (
                                                  <button key={align} className={`flex-1 py-1.5 text-xs font-bold rounded-sm transition-colors capitalize ${doc.style?.titleAlign === align ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`} onClick={() => save({ ...doc, style: normalizeStyle({ ...doc.style, titleAlign: align }) })}>{align}</button>
                                              ))}
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              {/* Farben */}
                              <div>
                                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Palette size={20} className="text-pink-400"/> Farben</h3>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 p-5 rounded-sm bg-black/20 border border-white/5">
                                      <ColorPicker label="Box BG" value={hex3to6(doc.style?.boxBg)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, boxBg: v }) })} />
                                      <ColorPicker label="Header BG" value={hex3to6(doc.style?.headerBg)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerBg: v }) })} />
                                      <ColorPicker label="Item BG" value={hex3to6(doc.style?.itemBg)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemBg: v }) })} />
                                      <ColorPicker label="Text" value={hex3to6(doc.style?.textColor)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, textColor: v }) })} />
                                      <ColorPicker label="Titel" value={hex3to6(doc.style?.titleColor)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleColor: v }) })} />
                                      <ColorPicker label="Akzent" value={hex3to6(doc.style?.accent)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, accent: v }) })} />
                                  </div>
                              </div>

                              {/* Layout & Animation */}
                              <div>
                                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Settings size={20} className="text-blue-400"/> Layout & Animation</h3>
                                  <div className="p-5 rounded-sm bg-black/20 border border-white/5 space-y-6">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                        <RangeSlider label="Breite" value={doc.style?.boxWidth ?? 520} min={280} max={1000} step={10} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, boxWidth: v }) })} />
                                        <RangeSlider label="Skalierung" value={doc.style?.scale ?? 1} min={0.5} max={2} step={0.05} unit="x" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, scale: v }) })} />
                                        <RangeSlider label="Eckenradius" value={doc.style?.borderRadius ?? 12} min={0} max={32} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, borderRadius: v }) })} />
                                        <RangeSlider label="Challenge Größe" value={doc.style?.itemFontSize ?? 16} min={10} max={32} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemFontSize: v }) })} />

                                        <RangeSlider label="Hintergrund Deckkraft" value={doc.style?.opacity ?? 0.6} min={0} max={1} step={0.05} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, opacity: v }) })} />
                                        <RangeSlider label="Header Deckkraft" value={doc.style?.headerOpacity ?? 0.9} min={0} max={1} step={0.05} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerOpacity: v }) })} />
                                    </div>

                                      <div className="pt-6 border-t border-white/5">
                                          <label className="flex items-center gap-3 cursor-pointer select-none mb-4">
                                              <input type="checkbox" className="w-4 h-4 accent-violet-500" checked={!!doc.animation?.enabled} onChange={(e) => save({ ...doc, animation: { ...doc.animation, enabled: e.target.checked } })} />
                                              <span className="text-sm font-bold text-white">Animation aktivieren (Paging/Scrolling)</span>
                                          </label>

                                          <div className={`transition-opacity duration-300 ${!doc.animation?.enabled ? "opacity-30 pointer-events-none" : ""}`}>
                                              <div className="flex bg-black/40 rounded-sm p-1 border border-white/5 mb-4 max-w-sm">
                                                  <button className={`flex-1 py-1.5 text-xs font-bold rounded-sm transition-colors ${doc.animation?.mode !== 'scrolling' ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`} onClick={() => save({ ...doc, animation: { ...doc.animation, mode: "paging" } })}>Seitenweise (Paging)</button>
                                                  <button className={`flex-1 py-1.5 text-xs font-bold rounded-sm transition-colors ${doc.animation?.mode === 'scrolling' ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`} onClick={() => save({ ...doc, animation: { ...doc.animation, mode: "scrolling" } })}>Laufschrift (Scroll)</button>
                                              </div>
                                              {doc.animation?.mode === "scrolling" ? (
                                                   <div className="grid grid-cols-2 gap-4">
                                                      <RangeSlider label="Speed" value={doc.animation?.scrolling?.speedPxPerSec ?? 30} min={5} max={200} step={5} unit="px/s" onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, speedPxPerSec: v } } })} />
                                                      <RangeSlider label="Sichtbare Zeilen" value={doc.animation?.scrolling?.visibleRows ?? 2} min={1} max={10} step={1} onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, visibleRows: v } } })} />
                                                      <div className="col-span-2">
                                                          <RangeSlider label="Pause (Oben/Unten)" value={doc.animation?.scrolling?.pauseSec ?? 2} min={0} max={10} step={0.5} unit="s" onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, pauseSec: v } } })} />
                                                      </div>
                                                   </div>
                                              ) : (
                                                  <div className="grid grid-cols-2 gap-4">
                                                      <RangeSlider label="Items pro Seite" value={doc.animation?.paging?.pageSize ?? 5} min={1} max={10} step={1} onChange={(v) => save({ ...doc, animation: { ...doc.animation, paging: { ...doc.animation?.paging, pageSize: v } } })} />
                                                      <RangeSlider label="Wechsel-Intervall" value={doc.animation?.paging?.intervalSec ?? 20} min={2} max={60} step={1} unit="s" onChange={(v) => save({ ...doc, animation: { ...doc.animation, paging: { ...doc.animation?.paging, intervalSec: v } } })} />
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* 3. CHAT TAB */}
                      {activeTab === "chat" && (
                          <div className="space-y-6 max-w-3xl">
                              <div className="bg-black/20 p-5 rounded-sm border border-white/5">
                                  <h4 className="text-sm font-bold text-white uppercase tracking-wide mb-2 flex items-center gap-2">
                                      <MessageSquare size={16} className="text-cyan-400" /> Twitch-Chat-Befehle
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
                                  <div className="space-y-2 mb-2">
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
                                                      className="flex-1 bg-black/40 border border-white/10 rounded-sm px-4 py-2.5 text-sm text-white focus:border-violet-500 focus:outline-none transition-colors"
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

                                  <label className="flex items-center gap-3 cursor-pointer pt-3 border-t border-white/5 mt-4">
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
                                  <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-white/5 mt-2">
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

                              {/* Befehls-Referenz */}
                              <div className="bg-black/20 border border-white/5 rounded-sm p-5">
                                  <p className="text-sm font-bold text-white uppercase tracking-wide mb-4">Befehle</p>
                                  <div className="space-y-2">
                                      {CHAT_COMMAND_DOCS.map((c) => (
                                          <div key={c.cmd} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-1.5 border-b border-white/5 last:border-b-0">
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

                      {/* 4. SETTINGS TAB */}
                      {activeTab === "settings" && (
                          <div className="space-y-6">

                              {/* 14-day inactivity notice */}
                              <div className="flex items-start gap-3 bg-amber-950/20 border border-amber-500/20 rounded-sm p-4">
                                  <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                  <p className="text-sm text-amber-200/80">
                                      Kostenloses Overlay: Bei <strong className="text-amber-200">14 Tagen Inaktivität</strong> (kein OBS-Zugriff auf den Overlay-Link) wird dein Overlay automatisch zurückgesetzt, um Speicherplatz freizugeben.
                                  </p>
                              </div>

                              {/* OBS Browser Source */}
                              <div className="bg-black/20 p-5 rounded-sm border border-white/5">
                                  <h4 className="text-sm font-bold text-white uppercase tracking-wide mb-4 flex items-center gap-2"><Monitor size={16}/> OBS Browser Source</h4>
                                  <div className="flex gap-2 mb-2">
                                      <input readOnly type={showOverlayUrl ? "text" : "password"} className="flex-1 bg-black/40 px-4 py-3 rounded-sm text-sm font-mono text-white/70 border border-white/5 outline-none" value={overlayUrl} />
                                      <button onClick={() => setShowOverlayUrl(!showOverlayUrl)} className="px-4 bg-white/5 hover:bg-white/10 rounded-sm text-white/70 transition-colors">{showOverlayUrl ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                                      <button onClick={() => handleCopy(overlayUrl, "overlay")} className="px-5 bg-violet-600 hover:bg-violet-500 rounded-sm text-white font-bold text-sm transition-colors flex items-center gap-2">
                                          {overlayCopied ? <Check size={16}/> : <Copy size={16}/>}
                                          {overlayCopied ? "Kopiert" : "Kopieren"}
                                      </button>
                                  </div>
                                  <button onClick={regenerateOverlayKey} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-2">
                                      <RefreshCw size={12}/> Link neu generieren (Reset)
                                  </button>
                              </div>

                              {/* Moderator Link */}
                              <div className="bg-black/20 p-5 rounded-sm border border-white/5">
                                  <h4 className="text-sm font-bold text-white uppercase tracking-wide mb-4 flex items-center gap-2"><ShieldAlert size={16}/> Moderator Link</h4>
                                  <p className="text-xs text-white/50 mb-4">Teile diesen Link mit Mods, damit sie Timer und Ergebnisse steuern können. In der Moderator-Ansicht sehen sie außerdem alle verfügbaren Chat-Befehle.</p>
                                  <div className="flex gap-2 mb-2">
                                      <input readOnly type={showControlUrl ? "text" : "password"} className="flex-1 bg-black/40 px-4 py-3 rounded-sm text-sm font-mono text-white/70 border border-white/5 outline-none" value={controlUrl} />
                                      <button onClick={() => setShowControlUrl(!showControlUrl)} className="px-4 bg-white/5 hover:bg-white/10 rounded-sm text-white/70 transition-colors">{showControlUrl ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                                      <button onClick={() => handleCopy(controlUrl, "control")} className="px-5 bg-violet-600 hover:bg-violet-500 rounded-sm text-white font-bold text-sm transition-colors flex items-center gap-2">
                                          {controlCopied ? <Check size={16}/> : <Copy size={16}/>}
                                          {controlCopied ? "Kopiert" : "Kopieren"}
                                      </button>
                                  </div>
                                  <button onClick={regenerateControlKey} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-2">
                                      <RefreshCw size={12}/> Link neu generieren (Reset)
                                  </button>

                                  <div className="mt-6 pt-4 border-t border-white/5">
                                      <h5 className="text-xs font-bold text-white/40 uppercase mb-3">Berechtigungen für Mods (Control-Link & Chat-Befehle)</h5>
                                      <div className="space-y-2">
                                          {[
                                              { key: 'allowModsTimer', label: 'Timer steuern (Start/Stop/Reset/Setzen)' },
                                              { key: 'allowModsTitle', label: 'Titel ändern' },
                                              { key: 'allowModsChallenges', label: 'Challenges bearbeiten (Wins/Status/Pin)' }
                                          ].map(perm => (
                                              <label key={perm.key} className="flex items-center gap-3 cursor-pointer p-2 rounded-sm hover:bg-white/5 transition-colors">
                                                  <input type="checkbox" className="w-4 h-4 accent-violet-500 bg-transparent" checked={!!doc.controlPermissions?.[perm.key]} onChange={(e) => save({ ...doc, controlPermissions: { ...doc.controlPermissions, [perm.key]: e.target.checked } })} />
                                                  <span className="text-sm text-white/80">{perm.label}</span>
                                              </label>
                                          ))}
                                      </div>
                                  </div>
                              </div>

                              {/* Reset Zone (GANZ UNTEN) */}
                              <div className="mt-8 p-5 rounded-sm border border-red-900/30 bg-red-900/5">
                                  <div className="flex justify-between items-center">
                                      <div>
                                          <h4 className="text-sm font-bold text-red-200">Gefahrenzone</h4>
                                          <p className="text-xs text-red-400/70 mt-1">Setzt Design, alle Challenges und Einstellungen auf Standard zurück.</p>
                                      </div>
                                      <button onClick={doFullReset} className="px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-300 border border-red-900/50 rounded-sm text-sm transition-colors font-bold flex items-center gap-2">
                                          <Trash2 size={16}/> Alles zurücksetzen
                                      </button>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>

              {/* RIGHT: PREVIEW + TIMER — never scrolls, always fills viewport height */}
              <div className="hidden md:flex w-[380px] lg:w-[460px] xl:w-[560px] 2xl:w-[640px] shrink-0 flex-col overflow-hidden gap-3 md:gap-5">

                  {/* PREVIEW — fills remaining space above timer */}
                  <div className="panel flex-1 p-5 flex flex-col min-h-0 overflow-hidden">
                      <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                          <div className="flex items-center gap-2">
                              <h3 className="text-white/40 text-xs uppercase tracking-wider font-bold">Live Vorschau</h3>
                              <span className="text-[10px] text-white/30 font-mono">
                                  {doc.style?.boxWidth ?? 520}px{previewFitPercent != null && previewFitPercent < 100 ? ` · ${previewFitPercent}%` : ""}
                              </span>
                          </div>
                          <button onClick={() => setPreviewLightMode(!previewLightMode)} className="text-[10px] px-2 py-1 rounded-sm bg-white/5 hover:bg-white/10 text-white/50 transition-colors border border-white/5">
                              {previewLightMode ? "BG: Hell" : "BG: Dunkel"}
                          </button>
                      </div>
                      {renderPreview()}
                  </div>

                  {/* TIMER — always visible, never pushed off screen */}
                  <div className="panel p-5 shrink-0">
                      <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                              <div className={`w-2.5 h-2.5 rounded-full ${running ? "bg-green-500" : "bg-red-500"}`} />
                              <span className="text-sm font-bold text-white uppercase tracking-wider">Timer</span>
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${running ? "text-green-400" : "text-white/30"}`}>
                              {running ? "Läuft" : "Pausiert"}
                          </span>
                      </div>

                      {/* Sichtbarkeit — deutlich sichtbar statt versteckter Checkbox */}
                      <button
                          onClick={toggleTimerVisible}
                          className={`w-full mb-4 py-2.5 rounded-sm text-xs font-bold transition-colors flex items-center justify-center gap-2 border ${
                              timerVisible
                                  ? "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
                                  : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/40"
                          }`}
                      >
                          {timerVisible ? <Eye size={15}/> : <EyeOff size={15}/>}
                          {timerVisible ? "Timer im Overlay sichtbar" : "Timer im Overlay ausgeblendet"}
                      </button>

                      <div className="bg-black/40 rounded-sm p-4 text-center border border-white/5 mb-4">
                          <span className="font-mono text-4xl font-black text-white tracking-widest tabular-nums">{msToClock(runningElapsed)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                          {!running ? (
                              <button onClick={startTimer} className="bg-green-600 hover:bg-green-500 text-white py-3 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2">
                                  <Play size={18} fill="currentColor" /> START
                              </button>
                          ) : (
                              <button onClick={pauseTimer} className="bg-amber-500 hover:bg-amber-400 text-black py-3 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2">
                                  <Pause size={18} fill="currentColor" /> PAUSE
                              </button>
                          )}
                          <button onClick={resetTimer} className="bg-white/10 hover:bg-white/20 text-white py-3 rounded-sm text-sm font-bold transition-colors flex items-center justify-center gap-2 border border-white/5">
                              <RotateCcw size={18} /> RESET
                          </button>
                      </div>

                      <div className="grid grid-cols-6 gap-2 pt-4 border-t border-white/5">
                          <button onClick={() => adjustTimer(3600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">+1h</button>
                          <button onClick={() => adjustTimer(600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">+10m</button>
                          <button onClick={() => adjustTimer(60000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">+1m</button>
                          <button onClick={() => adjustTimer(-60000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">-1m</button>
                          <button onClick={() => adjustTimer(-600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">-10m</button>
                          <button onClick={() => adjustTimer(-3600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-sm text-[10px] font-mono font-bold">-1h</button>
                      </div>

                      {/* Manuelle Zeit-Eingabe */}
                      <div className="flex gap-2 mt-4">
                          <input
                              type="text"
                              value={manualTime}
                              onChange={(e) => { setManualTime(e.target.value); setManualTimeError(false); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyManualTime(); } }}
                              placeholder="01:30:00"
                              className={`flex-1 bg-black/40 border rounded-sm px-3 py-2 text-sm font-mono text-white text-center focus:outline-none transition-colors ${manualTimeError ? "border-red-500/60" : "border-white/10 focus:border-violet-500"}`}
                          />
                          <button onClick={applyManualTime} disabled={!manualTime.trim()} className="px-4 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed rounded-sm text-white/70 text-xs font-bold transition-colors border border-white/5">
                              Zeit setzen
                          </button>
                      </div>
                      {manualTimeError && <p className="text-[11px] text-red-400 mt-1.5">Format: HH:MM:SS oder MM:SS</p>}
                  </div>

              </div>

            </div>
        </div>
      )}
    </div>
  );
}
