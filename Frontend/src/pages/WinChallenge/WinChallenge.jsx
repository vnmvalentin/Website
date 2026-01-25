// WinChallenge.jsx
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

function msToClock(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Helper für Farben
function hexToRgba(hex, alpha = 1) {
  let c = (hex || "#000000").replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ─────────────────────────  Defaults & Normalizer  ───────────────────────── */

const DEFAULT_STYLE = {
  boxBg: "#0B0F1A",
  textColor: "#ffffff",
  accent: "#9146FF",
  opacity: 0.6,
  borderRadius: 12,
  scale: 1.0,
  boxWidth: 280,
  titleAlign: "left",
  titleColor: "#ffffff",
  headerBg: "#0B0F1A",
  headerOpacity: 0.9,
  titleFontSize: 18,
  itemFontSize: 16,
  itemBg: "#151b2c",
};

const DEFAULT_TIMER = {
  running: false,
  startedAt: 0,
  elapsedMs: 0,
  visible: true,
};

const DEFAULT_PAGER = { enabled: false, pageSize: 5, intervalSec: 20 };
const DEFAULT_ANIMATION = {
  enabled: false,
  mode: "paging",
  paging: { pageSize: 5, intervalSec: 20 },
  scrolling: {
    speedPxPerSec: 30,
    visibleRows: 2,
    pauseSec: 2,
  },
};

function normalizeAnimation(animation, pagerLike) {
  const hasAnim = animation && typeof animation === "object";
  const a = hasAnim ? animation : {};

  const out = {
    ...DEFAULT_ANIMATION,
    ...a,
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

  out.paging.pageSize = Math.max(
    1,
    Math.min(10, parseInt(out.paging.pageSize ?? 5, 10))
  );
  out.paging.intervalSec = Math.max(
    2,
    Math.min(60, parseInt(out.paging.intervalSec ?? 20, 10))
  );

  out.scrolling.visibleRows = Math.max(
    1,
    Math.min(10, parseInt(out.scrolling.visibleRows ?? 2, 10))
  );
  out.scrolling.speedPxPerSec = Math.max(
    5,
    Math.min(300, parseInt(out.scrolling.speedPxPerSec ?? 30, 10))
  );
  out.scrolling.pauseSec = Math.max(
    0,
    Math.min(30, Number(out.scrolling.pauseSec ?? 2))
  );

  return out;
}

function pagerFromAnimation(animation, fallbackPager) {
  const base = { ...DEFAULT_PAGER, ...(fallbackPager || {}) };
  if (animation?.enabled && animation?.mode === "paging") {
    return {
      ...base,
      enabled: true,
      pageSize: animation.paging?.pageSize ?? base.pageSize,
      intervalSec: animation.paging?.intervalSec ?? base.intervalSec,
    };
  }
  return { ...base, enabled: false };
}

const DEFAULT_PERMISSIONS = {
  allowModsTimer: true,
  allowModsTitle: false,
  allowModsChallenges: false,
};

function hex3to6(hex) {
  if (!hex || typeof hex !== "string") return "#ffffff";
  let c = hex.trim();
  if (!c.startsWith("#")) c = "#" + c;
  if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  if (!/^#([0-9a-fA-F]{6})$/.test(c)) return "#ffffff";
  return c.toLowerCase();
}

function normalizeStyle(style) {
  const s = { ...DEFAULT_STYLE, ...(style || {}) };
  s.boxBg = hex3to6(s.boxBg);
  s.textColor = hex3to6(s.textColor);
  s.accent = hex3to6(s.accent);
  s.headerBg = hex3to6(s.headerBg);
  s.titleColor = hex3to6(s.titleColor);
  s.itemBg = hex3to6(s.itemBg);
  const baseOpacity = Math.min(1, Math.max(0, Number(s.opacity ?? 0.6)));
  s.opacity = baseOpacity;
  s.headerOpacity = Math.min(
    1,
    Math.max(0, Number(s.headerOpacity ?? baseOpacity))
  );
  s.borderRadius = Math.max(0, parseInt(s.borderRadius ?? 12, 10));
  s.scale = Number(s.scale ?? 1);
  s.boxWidth = Math.min(1600, Math.max(280, parseInt(s.boxWidth ?? 520, 10)));
  s.titleAlign = s.titleAlign === "center" ? "center" : "left";
  s.titleFontSize = Math.max(
    10,
    Math.min(48, parseInt(s.titleFontSize ?? 20, 10))
  );
  s.itemFontSize = Math.max(
    8,
    Math.min(36, parseInt(s.itemFontSize ?? 16, 10))
  );
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
  const pager = pagerFromAnimation(animation, pagerRaw);
  const controlPermissions = {
    ...DEFAULT_PERMISSIONS,
    ...(raw.controlPermissions || {}),
  };

  return {
    title: "WinChallenge",
    items: [],
    updatedAt: Date.now(),
    overlayKey: raw.overlayKey,
    controlKey: raw.controlKey,
    controlPermissions,
    ...raw,
    timer,
    style,
    pager,
    animation,
  };
}

/* ─────────────────────────────  Sub-Components  ───────────────────────────── */

const ColorPicker = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[10px] uppercase text-gray-500 font-bold tracking-wider">{label}</span>
    <div className="flex items-center gap-2 bg-black/20 p-1 rounded-lg border border-white/5">
      <div className="relative w-8 h-8 rounded-md overflow-hidden shadow-sm ring-1 ring-white/10">
        <input 
            type="color" 
            value={value} 
            onChange={(e) => onChange(e.target.value)}
            className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer p-0 border-0"
        />
      </div>
      <span className="text-xs font-mono text-gray-400">{value}</span>
    </div>
  </div>
);

const RangeSlider = ({ label, value, min, max, step, onChange, unit = "" }) => (
    <div>
        <div className="flex justify-between mb-1.5">
            <span className="text-xs text-gray-400 font-medium">{label}</span>
            <span className="text-xs text-gray-200 font-mono bg-white/5 px-1.5 rounded">{value}{unit}</span>
        </div>
        <input
            type="range"
            min={min} max={max} step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#9146FF] hover:accent-[#a86aff] transition-colors"
        />
    </div>
);

const SectionHeader = ({ title }) => (
    <div className="pb-2 mb-4 border-b border-white/5">
        <h4 className="text-sm font-bold text-gray-200 uppercase tracking-wide">{title}</h4>
    </div>
);


/* ─────────────────────────────  Main Component  ───────────────────────────── */

export default function WinChallenge() {
  const { user, login } = useContext(TwitchAuthContext);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const dragIdRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // START TAB: Challenges
  const [activeTab, setActiveTab] = useState("challenges");
  
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [controlCopied, setControlCopied] = useState(false);
  
  const [showOverlayUrl, setShowOverlayUrl] = useState(false);
  const [showControlUrl, setShowControlUrl] = useState(false);

  const [localNow, setLocalNow] = useState(Date.now());
  const [previewLightMode, setPreviewLightMode] = useState(false); // Standard Dark Mode Preview

  const overlayUrl = useMemo(() => {
    if (!doc?.overlayKey) return "";
    return `${window.location.origin}/WinChallengeOverlay/${doc.overlayKey}`;
  }, [doc?.overlayKey]);

  const controlUrl = useMemo(() => {
    if (!doc?.controlKey) return "";
    return `${window.location.origin}/WinChallengeControl/${doc.controlKey}`;
  }, [doc?.controlKey]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/winchallenge/${user.id}`, {
          credentials: "include",
        });
        const data = await res.json();
        setDoc(ensureDocShape(data));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const saveToServer = async (payload) => {
    if (!user) return;
    try {
      await fetch(`/api/winchallenge/${user.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("Speichern fehlgeschlagen", e);
    }
  };

  const save = (nextRaw) => {
    const next = ensureDocShape(nextRaw);
    setDoc(next);
    if (!user) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveToServer(next);
    }, 300);
  };

  const doFullReset = async () => {
    if (!user) return;
    if (!window.confirm("Alles zurücksetzen? (Titel, Style, Timer, Items, Links)")) return;
    try {
      const res = await fetch(`/api/winchallenge/${user.id}?reset=1`, {
        method: "PUT",
        credentials: "include",
      });
      const fresh = await res.json();
      setDoc(ensureDocShape(fresh));
      setActiveTab("challenges");
    } catch (e) {
      console.error("Reset fehlgeschlagen", e);
    }
  };

  // --- ITEM LOGIC ---
  const addItem = () =>
    save({
      ...doc,
      items: [
        ...(doc?.items || []),
        { id: nanoid(8), name: "", useWins: false, target: 1, progress: 0, done: false, pinned: false },
      ],
    });
  const updateItem = (id, patch) =>
    save({
      ...doc,
      items: (doc?.items || []).map((it) => (it.id === id ? { ...it, ...patch } : it)),
    });
  const removeItem = (id) =>
    save({
      ...doc,
      items: (doc?.items || []).filter((i) => i.id !== id),
    });

  // Drag & Drop
  const onDragStart = (id) => (e) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = () => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
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

  // Timer Logic
  const startTimer = () => {
    const base = doc?.timer?.elapsedMs || 0;
    save({ ...doc, timer: { ...(doc?.timer || {}), running: true, startedAt: Date.now() - base, elapsedMs: base } });
  };
  const pauseTimer = () => {
    if (!doc?.timer?.running) return;
    const elapsed = Date.now() - (doc?.timer?.startedAt || 0);
    save({ ...doc, timer: { ...(doc?.timer || {}), running: false, startedAt: 0, elapsedMs: elapsed } });
  };
  const resetTimer = () =>
    save({ ...doc, timer: { ...DEFAULT_TIMER, visible: doc?.timer?.visible ?? true } });
  const adjustTimer = (deltaMs) => {
    if (!doc?.timer) return;
    const t = doc.timer;
    const currentElapsed = t.running ? Date.now() - (t.startedAt || 0) : t.elapsedMs || 0;
    let nextElapsed = Math.max(0, currentElapsed + deltaMs);
    const updatedTimer = { ...t, elapsedMs: nextElapsed };
    if (t.running) updatedTimer.startedAt = Date.now() - nextElapsed;
    save({ ...doc, timer: updatedTimer });
  };

  useEffect(() => {
    if (!doc?.timer?.running) return;
    const iv = setInterval(() => setLocalNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, [doc?.timer?.running]);

  const running = !!doc?.timer?.running;
  const startedAt = doc?.timer?.startedAt || 0;
  const elapsedMs = doc?.timer?.elapsedMs || 0;
  const runningElapsed = running ? localNow - startedAt : elapsedMs;

  const handleCopy = (text, which) => {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    if (which === "overlay") {
      setOverlayCopied(true);
      setTimeout(() => setOverlayCopied(false), 1200);
    } else if (which === "control") {
      setControlCopied(true);
      setTimeout(() => setControlCopied(false), 1200);
    }
  };

  const regenerateOverlayKey = () => save({ ...doc, overlayKey: nanoid(12) });
  const regenerateControlKey = () => save({ ...doc, controlKey: nanoid(12) });

  // --- PREVIEW RENDERER (Original logik, nur styling angepasst) ---
  const renderPreview = () => {
    if (!doc) return null;
    const { style } = doc;
    const boxAlpha = Math.min(1, Math.max(0, Number(style.opacity ?? 0.6)));
    const headerAlpha = Math.min(1, Math.max(0, Number(style.headerOpacity ?? boxAlpha)));
    const effectiveTitleColor = style.titleColor || style.textColor;
    const showTimer = doc.timer?.visible !== false;
    const isCenter = style.titleAlign === "center";

    const previewItems = doc.items && doc.items.length > 0 ? doc.items : [
        { id: "p1", name: "Beispiel Challenge 1", pinned: true },
        { id: "p2", name: "Gewinne 3 Runden", useWins: true, target: 3, progress: 1 },
        { id: "p3", name: "Erledigte Aufgabe", done: true },
    ];
    const displayItems = previewItems.slice(0, 6);

    return (
      <div className="sticky top-6">
        <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Live Vorschau</h3>
            <button onClick={() => setPreviewLightMode(!previewLightMode)} className="text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-700 hover:text-white transition-colors">
                {previewLightMode ? "Hintergrund: Hell" : "Hintergrund: Dunkel"}
            </button>
        </div>
        
        <div className={`p-8 rounded-xl border border-dashed border-gray-700/50 flex justify-center items-start min-h-[300px] transition-colors duration-300 ${previewLightMode ? "bg-gray-200" : "bg-[#050505]"}`}>
            <div
            className="overflow-hidden shadow-2xl relative transition-all duration-300 ease-out"
            style={{
                fontFamily: "Inter, sans-serif",
                color: style.textColor,
                borderRadius: style.borderRadius,
                background: "transparent",
                width: style.boxWidth, 
                transform: `scale(${style.scale})`,
                transformOrigin: "top center",
                maxWidth: "100%",
            }}
            >
            <div style={{ position: "absolute", inset: 0, background: style.boxBg, opacity: boxAlpha, zIndex: 0 }} />
            <div className="relative z-10">
                <div style={{ borderBottom: "1px solid rgba(255,255,255,.08)", position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, background: style.headerBg || style.boxBg, opacity: headerAlpha, zIndex: -1 }} />
                <div style={{ display: "grid", gridTemplateColumns: isCenter ? "1fr auto 1fr" : "auto 1fr auto", alignItems: "center", padding: "10px 14px", columnGap: 8 }}>
                    {isCenter && <div />}
                    <div style={{ fontWeight: 800, textAlign: isCenter ? "center" : "left", color: effectiveTitleColor, fontSize: `${style.titleFontSize}px`, whiteSpace: "nowrap" }}>
                    {doc.title || "WinChallenge"}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {displayItems.map((it) => (
                    <div key={it.id} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, background: style.itemBg || "#ffffff", opacity: style.itemBg ? boxAlpha : 0.04, zIndex: -1 }} />
                    <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, color: (it.done || (it.useWins && it.progress >= it.target)) ? "#2ecc71" : "inherit", fontSize: `${style.itemFontSize}px` }}>
                        {it.pinned && <span>📌</span>}
                        {it.name}
                    </span>
                    {it.useWins ? (
                        <span style={{ padding: "2px 10px", borderRadius: 8, background: "rgba(255,255,255,.06)", border: `1px solid ${hexToRgba(style.accent || "#9146FF", 0.5)}`, fontSize: "0.85em", whiteSpace: "nowrap" }}>
                        {it.progress || 0} / {it.target || 0}
                        </span>
                    ) : (
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid rgba(255,255,255,.7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: it.done ? "#2ecc71" : "transparent", background: "rgba(0,0,0,.4)" }}>✓</span>
                    )}
                    </div>
                ))}
                </div>

                {showTimer && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", background: "rgba(0,0,0,0.2)", padding: "8px 14px", display: "flex", justifyContent: "center", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>
                        <span style={{ fontSize: 10 }}>{doc.timer?.running ? "🟢" : "🔴"}</span>
                        <span>{msToClock(runningElapsed)}</span>
                    </div>
                )}
            </div>
            </div>
        </div>
      </div>
    );
  };

  const renderTimerControls = () => (
    <div className="bg-[#111] rounded-xl p-5 border border-white/10 shadow-lg mt-6">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Timer</span>
                <span className={`w-2 h-2 rounded-full ${running ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-400 hover:text-white transition-colors">
                <input type="checkbox" className="accent-[#9146FF]" checked={doc?.timer?.visible !== false} onChange={(e) => save({ ...doc, timer: { ...(doc?.timer || {}), visible: e.target.checked } })} />
                Im Overlay
            </label>
        </div>
        
        <div className="flex flex-col gap-3">
            <div className="bg-black/40 rounded-lg p-3 text-center border border-white/5 mb-1">
                <span className="font-mono text-3xl font-bold text-white tracking-widest">{msToClock(runningElapsed)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {!running ? (
                    <button onClick={startTimer} className="col-span-2 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-xs font-bold shadow-lg shadow-green-900/20 transition-all active:scale-95 uppercase tracking-wide">Start</button>
                ) : (
                    <button onClick={pauseTimer} className="col-span-2 bg-yellow-600 hover:bg-yellow-500 text-white py-2.5 rounded-lg text-xs font-bold shadow-lg shadow-yellow-900/20 transition-all active:scale-95 uppercase tracking-wide">Pause</button>
                )}
                <button onClick={resetTimer} className="bg-gray-700 hover:bg-red-600 text-white py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 uppercase tracking-wide">Reset</button>
            </div>
            
            {/* NEU: Timer Adjustment */}
            <div className="grid grid-cols-4 gap-2 mt-2 pt-3 border-t border-white/5">
                <button onClick={() => adjustTimer(3600000)} className="bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-[10px] font-mono transition-colors">+1h</button>
                <button onClick={() => adjustTimer(60000)} className="bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-[10px] font-mono transition-colors">+1m</button>
                <button onClick={() => adjustTimer(-60000)} className="bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-[10px] font-mono transition-colors">-1m</button>
                <button onClick={() => adjustTimer(-3600000)} className="bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-[10px] font-mono transition-colors">-1h</button>
            </div>
        </div>
    </div>
  );

  return (
    <div className="min-h-full w-full p-4 md:p-8">
      <SEO title="WinChallenge Overlay" description="Dein interaktives Win-Challenge Overlay." path="WinChallenge-Overlay" />

      {!user ? (
        <div className="max-w-xl mx-auto bg-gray-900 rounded-2xl p-8 mt-12 text-center border border-gray-800 shadow-2xl">
          <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">WinChallenge</h1>
          <p className="mb-6 text-gray-400">Melde dich an, um dein Overlay zu erstellen.</p>
          <button onClick={() => login()} className="bg-[#9146FF] hover:bg-[#7d36ff] text-white font-bold px-6 py-3 rounded-xl transition-transform hover:scale-105">Mit Twitch anmelden</button>
        </div>
      ) : loading || !doc ? (
        <div className="text-center p-20 text-gray-500 animate-pulse">Lade Konfiguration...</div>
      ) : (
        <div className="max-w-[1600px] mx-auto">
          {/* HEADER BAR */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
             <div>
                 <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">WinChallenge Setup</h1>
                 <p className="text-sm text-gray-400">Verwalte deine Challenges und das Design.</p>
             </div>
             <button 
                onClick={() => handleCopy(overlayUrl, "overlay")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold shadow-lg transition-all active:scale-95 ${overlayCopied ? "bg-green-500 text-white" : "bg-gradient-to-r from-[#9146FF] to-[#7d36ff] text-white hover:brightness-110"}`}
             >
                <span>{overlayCopied ? "Link kopiert! ✅" : "🔗 OBS Browser Link kopieren"}</span>
             </button>
          </div>

          <div className="flex flex-col xl:flex-row gap-8 items-start">
            
            {/* LINKER BEREICH: EDITOR */}
            <div className="flex-1 w-full min-w-0 bg-[#0B0F1A] rounded-2xl shadow-xl border border-white/5 overflow-hidden">
                
                {/* TABS HEADER */}
                <div className="flex border-b border-white/5 bg-black/20">
                    {[
                        { id: "challenges", label: "Challenges" },
                        { id: "custom", label: "Design & Customization" },
                        { id: "settings", label: "Settings" },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-4 text-sm font-medium transition-colors relative ${
                                activeTab === tab.id ? "text-white bg-white/5" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                            }`}
                        >
                            {tab.label}
                            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9146FF]" />}
                        </button>
                    ))}
                </div>

                {/* CONTENT AREA */}
                <div className="p-6">
                    
                    {/* 1. CHALLENGES TAB (Standard) */}
                    {activeTab === "challenges" && (
                        <div className="space-y-6">
                            {(doc.items || []).length === 0 && (
                                <div className="text-center py-10 border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/50">
                                    <p className="text-gray-500 mb-4">Noch keine Challenges erstellt.</p>
                                    <button onClick={addItem} className="text-[#9146FF] font-bold hover:underline">Erste Challenge hinzufügen</button>
                                </div>
                            )}

                            <div className="grid gap-3">
                                {(doc.items || []).map((it) => {
                                    const done = it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
                                    return (
                                        <div key={it.id} onDragOver={onDragOver(it.id)} onDrop={onDrop(it.id)}
                                             className={`group bg-[#151925] hover:bg-[#1a1f2e] rounded-xl p-4 border transition-all ${done ? "border-green-900/50" : "border-white/5"}`}>
                                            
                                            {/* Zeile 1: Drag, Name, Pin, Delete */}
                                            <div className="flex items-center gap-3 mb-3">
                                                <span draggable onDragStart={onDragStart(it.id)} className="cursor-grab text-gray-600 hover:text-gray-400 p-1">⋮⋮</span>
                                                <input
                                                    className="flex-1 bg-transparent text-lg font-bold placeholder-gray-600 focus:outline-none text-white"
                                                    placeholder="Challenge Name..."
                                                    value={it.name}
                                                    onChange={(e) => updateItem(it.id, { name: e.target.value })}
                                                />
                                                <button onClick={() => updateItem(it.id, { pinned: !it.pinned })} className={`p-2 rounded-lg transition-colors ${it.pinned ? "bg-[#9146FF]/20 text-[#9146FF]" : "text-gray-600 hover:bg-white/5"}`} title="Anpinnen">📌</button>
                                                <button onClick={() => removeItem(it.id)} className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors" title="Löschen">🗑</button>
                                            </div>

                                            {/* Zeile 2: Controls */}
                                            <div className="flex items-center gap-4 pl-8">
                                                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-gray-200">
                                                    <input type="checkbox" className="rounded accent-[#9146FF] bg-gray-800 border-gray-700" checked={!!it.useWins} onChange={(e) => updateItem(it.id, { useWins: e.target.checked })} />
                                                    <span>Wins zählen</span>
                                                </label>

                                                {it.useWins ? (
                                                    <div className="flex items-center gap-4 ml-auto">
                                                        <div className="flex items-center gap-2 bg-black/20 px-2 py-1 rounded border border-white/5">
                                                            <span className="text-xs text-gray-500 uppercase font-bold">Ziel</span>
                                                            <input type="number" min={1} className="w-10 bg-transparent text-right text-sm font-mono focus:outline-none" value={it.target || 1} onChange={(e) => updateItem(it.id, { target: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
                                                        </div>
                                                        <div className="flex items-center bg-[#9146FF]/10 rounded-lg border border-[#9146FF]/20 overflow-hidden">
                                                            <button onClick={() => updateItem(it.id, { progress: Math.max(0, (it.progress || 0) - 1) })} className="px-3 py-1 hover:bg-[#9146FF]/20 text-[#9146FF] transition-colors">−</button>
                                                            <span className="w-10 text-center font-mono font-bold text-white">{it.progress || 0}</span>
                                                            <button onClick={() => updateItem(it.id, { progress: (it.progress || 0) + 1 })} className="px-3 py-1 hover:bg-[#9146FF]/20 text-[#9146FF] transition-colors">+</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <label className={`ml-auto px-3 py-1.5 rounded-lg cursor-pointer border transition-colors flex items-center gap-2 text-sm ${it.done ? "bg-green-900/20 border-green-500/30 text-green-400" : "bg-black/20 border-white/5 text-gray-500 hover:border-white/10"}`}>
                                                        <input type="checkbox" className="hidden" checked={!!it.done} onChange={(e) => updateItem(it.id, { done: e.target.checked, progress: e.target.checked ? 1 : 0 })} />
                                                        <span>{it.done ? "✅ Erledigt" : "Offen"}</span>
                                                    </label>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <button onClick={addItem} className="w-full py-4 rounded-xl border-2 border-dashed border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 hover:bg-white/5 transition-all font-semibold flex justify-center items-center gap-2">
                                <span className="text-2xl leading-none">+</span> Neue Challenge
                            </button>
                        </div>
                    )}

                    {/* 2. CUSTOMIZATION TAB */}
                    {activeTab === "custom" && (
                        <div className="space-y-8">
                            
                            {/* SECTION: TITEL & HEADER */}
                            <div>
                                <SectionHeader title="Titel & Header" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="col-span-full">
                                        <label className="block text-xs text-gray-400 mb-1.5 font-medium">Titel Text</label>
                                        <input
                                            className="w-full bg-[#151925] border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:border-[#9146FF] focus:outline-none transition-colors"
                                            value={doc.title || ""}
                                            onChange={(e) => save({ ...doc, title: e.target.value })}
                                            placeholder="z.B. Today's Challenges"
                                        />
                                    </div>
                                    <RangeSlider label="Schriftgröße" value={doc.style?.titleFontSize ?? 20} min={12} max={48} step={1} unit="px"
                                        onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleFontSize: v }) })} />
                                    
                                    <div>
                                        <span className="text-xs text-gray-400 font-medium mb-1.5 block">Ausrichtung</span>
                                        <div className="flex bg-black/30 rounded-lg p-1 border border-white/5">
                                            {['left', 'center'].map(align => (
                                                <button key={align}
                                                    className={`flex-1 py-1 text-xs font-medium rounded transition-all capitalize ${doc.style?.titleAlign === align ? 'bg-[#9146FF] text-white shadow' : 'text-gray-500 hover:text-white'}`}
                                                    onClick={() => save({ ...doc, style: normalizeStyle({ ...doc.style, titleAlign: align }) })}
                                                >{align === 'left' ? 'Links' : 'Zentriert'}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION: FARBEN */}
                            <div>
                                <SectionHeader title="Farbpalette" />
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                                    <ColorPicker label="Box Hintergrund" value={hex3to6(doc.style?.boxBg)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, boxBg: v }) })} />
                                    <ColorPicker label="Header Hintergrund" value={hex3to6(doc.style?.headerBg)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerBg: v }) })} />
                                    <ColorPicker label="Item Hintergrund" value={hex3to6(doc.style?.itemBg)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemBg: v }) })} />
                                    
                                    <ColorPicker label="Textfarbe" value={hex3to6(doc.style?.textColor)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, textColor: v }) })} />
                                    <ColorPicker label="Titelfarbe" value={hex3to6(doc.style?.titleColor)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleColor: v }) })} />
                                    <ColorPicker label="Akzentfarbe" value={hex3to6(doc.style?.accent)} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, accent: v }) })} />
                                </div>
                            </div>

                            {/* SECTION: LAYOUT */}
                            <div>
                                <SectionHeader title="Layout & Größe" />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                    <RangeSlider label="Breite" value={doc.style?.boxWidth ?? 520} min={280} max={1000} step={10} unit="px"
                                        onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, boxWidth: v }) })} />
                                    <RangeSlider label="Skalierung" value={doc.style?.scale ?? 1} min={0.5} max={2} step={0.05} unit="x"
                                        onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, scale: v }) })} />
                                    <RangeSlider label="Eckenradius" value={doc.style?.borderRadius ?? 12} min={0} max={32} step={1} unit="px"
                                        onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, borderRadius: v }) })} />
                                    <RangeSlider label="Challenge Schriftgröße" value={doc.style?.itemFontSize ?? 16} min={10} max={32} step={1} unit="px"
                                        onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemFontSize: v }) })} />
                                    <RangeSlider label="Deckkraft (Box)" value={doc.style?.opacity ?? 0.6} min={0} max={1} step={0.05}
                                        onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, opacity: v }) })} />
                                    <RangeSlider label="Deckkraft (Header)" value={doc.style?.headerOpacity ?? 0.6} min={0} max={1} step={0.05}
                                        onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerOpacity: v }) })} />
                                </div>
                            </div>

                            {/* SECTION: ANIMATION */}
                            <div>
                                <SectionHeader title="Animation" />
                                <div className="bg-[#151925] rounded-xl p-4 border border-white/5">
                                    <label className="flex items-center gap-3 cursor-pointer select-none mb-4">
                                        <input type="checkbox" className="w-5 h-5 accent-[#9146FF] rounded bg-gray-800 border-gray-700"
                                            checked={!!doc.animation?.enabled}
                                            onChange={(e) => save({ ...doc, animation: { ...doc.animation, enabled: e.target.checked } })}
                                        />
                                        <span className="text-sm font-semibold text-white">Animation aktivieren</span>
                                    </label>

                                    <div className={`transition-opacity ${!doc.animation?.enabled ? "opacity-50 pointer-events-none" : ""}`}>
                                        <div className="flex bg-black/30 rounded p-1 border border-white/5 mb-4 max-w-xs">
                                            <button 
                                                className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${doc.animation?.mode !== 'scrolling' ? 'bg-[#9146FF] text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                                onClick={() => save({ ...doc, animation: { ...doc.animation, mode: "paging" } })}
                                            >Paging (Seiten)</button>
                                            <button 
                                                className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${doc.animation?.mode === 'scrolling' ? 'bg-[#9146FF] text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                                onClick={() => save({ ...doc, animation: { ...doc.animation, mode: "scrolling" } })}
                                            >Scrolling (Laufband)</button>
                                        </div>

                                        {doc.animation?.mode === "scrolling" ? (
                                             <div className="grid grid-cols-2 gap-4">
                                                <RangeSlider label="Scroll-Speed" value={doc.animation?.scrolling?.speedPxPerSec ?? 30} min={5} max={200} step={5} unit="px/s"
                                                     onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, speedPxPerSec: v } } })} />
                                                <RangeSlider label="Sichtbare Zeilen" value={doc.animation?.scrolling?.visibleRows ?? 2} min={1} max={10} step={1} 
                                                     onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, visibleRows: v } } })} />
                                                
                                                {/* NEU: Pause Einstellung */}
                                                <RangeSlider label="Pause am Ende" value={doc.animation?.scrolling?.pauseSec ?? 2} min={0} max={10} step={0.5} unit="s"
                                                     onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, pauseSec: v } } })} />
                                             </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-4">
                                                <RangeSlider label="Items pro Seite" value={doc.animation?.paging?.pageSize ?? 5} min={1} max={10} step={1}
                                                     onChange={(v) => save({ ...doc, animation: { ...doc.animation, paging: { ...doc.animation?.paging, pageSize: v } } })} />
                                                <RangeSlider label="Intervall" value={doc.animation?.paging?.intervalSec ?? 20} min={2} max={60} step={1} unit="s"
                                                     onChange={(v) => save({ ...doc, animation: { ...doc.animation, paging: { ...doc.animation?.paging, intervalSec: v } } })} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. SETTINGS TAB */}
                    {activeTab === "settings" && (
                        <div className="space-y-6">
                            
                            {/* OBS Browser Link Management */}
                            <div className="bg-[#151925] p-5 rounded-xl border border-white/5">
                                <h4 className="text-sm font-bold text-white uppercase tracking-wide mb-2">OBS Browser Source</h4>
                                <p className="text-xs text-gray-400 mb-3">Diesen Link in deine Streaming-Software einfügen.</p>
                                
                                <div className="flex gap-2 mb-4">
                                    <input readOnly className="flex-1 bg-black/30 px-3 py-2 rounded text-sm font-mono text-gray-300 border border-white/5" 
                                        value={showOverlayUrl ? overlayUrl : "••••••••••••••••••••••••••••••••••"} />
                                    <button onClick={() => setShowOverlayUrl(!showOverlayUrl)} className="px-3 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white transition-colors">👁</button>
                                    <button onClick={() => handleCopy(overlayUrl, "overlay")} className="px-4 bg-[#9146FF] hover:bg-[#7d36ff] rounded text-sm text-white font-medium transition-colors">
                                        {overlayCopied ? "Kopiert!" : "Kopieren"}
                                    </button>
                                </div>
                                <button onClick={regenerateOverlayKey} className="text-xs text-red-400 hover:text-red-300 underline">Overlay Link neu generieren (setzt OBS Verbindung zurück)</button>
                            </div>

                            {/* Moderator Link */}
                            <div className="bg-[#151925] p-5 rounded-xl border border-white/5">
                                <h4 className="text-sm font-bold text-white uppercase tracking-wide mb-2">Control Link (für Moderatoren)</h4>
                                <p className="text-xs text-gray-400 mb-3">Gib diesen Link an deine Mods weiter, damit sie Timer und Challenges steuern können.</p>
                                
                                <div className="flex gap-2 mb-4">
                                    <input readOnly className="flex-1 bg-black/30 px-3 py-2 rounded text-sm font-mono text-gray-300 border border-white/5" 
                                        value={showControlUrl ? controlUrl : "••••••••••••••••••••••••••••••••••"} />
                                    <button onClick={() => setShowControlUrl(!showControlUrl)} className="px-3 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white transition-colors">👁</button>
                                    <button onClick={() => handleCopy(controlUrl, "control")} className="px-4 bg-[#9146FF] hover:bg-[#7d36ff] rounded text-sm text-white font-medium transition-colors">
                                        {controlCopied ? "Kopiert!" : "Kopieren"}
                                    </button>
                                </div>
                                
                                <button onClick={regenerateControlKey} className="text-xs text-red-400 hover:text-red-300 underline">Link neu generieren (alter Link wird ungültig)</button>

                                <div className="mt-6 pt-4 border-t border-white/5">
                                    <h5 className="text-xs font-bold text-gray-500 uppercase mb-3">Berechtigungen</h5>
                                    <div className="space-y-2">
                                        {[
                                            { key: 'allowModsTimer', label: 'Timer steuern (Start/Stop/Reset)' },
                                            { key: 'allowModsTitle', label: 'Titel ändern' },
                                            { key: 'allowModsChallenges', label: 'Challenges bearbeiten (Wins/Status)' }
                                        ].map(perm => (
                                            <label key={perm.key} className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors">
                                                <input type="checkbox" className="w-4 h-4 accent-[#9146FF]" 
                                                    checked={!!doc.controlPermissions?.[perm.key]} 
                                                    onChange={(e) => save({ ...doc, controlPermissions: { ...doc.controlPermissions, [perm.key]: e.target.checked } })} /> 
                                                <span className="text-sm text-gray-300">{perm.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Reset Zone */}
                            <div className="p-5 rounded-xl border border-red-900/30 bg-red-900/5">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h4 className="text-sm font-bold text-red-200">Reset & Gefahr</h4>
                                        <p className="text-xs text-red-400/70 mt-1">Setzt Design, Challenges und Links zurück.</p>
                                    </div>
                                    <button onClick={doFullReset} className="px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-300 border border-red-900/50 rounded-lg text-sm transition-colors">
                                        Alles zurücksetzen
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* RECHTER BEREICH: PREVIEW (Sticky) */}
            <div className="hidden xl:block w-[420px] 2xl:w-[480px] sticky top-8 self-start">
               {renderPreview()}
               {renderTimerControls()}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}