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
import { 
  Trophy, 
  Palette, 
  Settings, 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  Trash2, 
  GripVertical, 
  Check, 
  Copy, 
  Monitor, 
  ShieldAlert,
  Pin, // <--- Das neue Icon
  Layout,
  RefreshCw,
  Eye,
  EyeOff
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
    overlayKey: raw.overlayKey, controlKey: raw.controlKey,
    controlPermissions: { ...DEFAULT_PERMISSIONS, ...(raw.controlPermissions || {}) },
    ...raw, timer, style, animation,
  };
}

// --- UI COMPONENTS ---

const ColorPicker = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-2">
    <span className="text-[10px] uppercase text-white/40 font-bold tracking-wider">{label}</span>
    <div className="flex items-center gap-3 bg-black/30 p-1.5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
      <div className="relative w-8 h-8 rounded-lg overflow-hidden shadow-sm ring-1 ring-white/10 shrink-0">
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
    <div className="bg-black/20 p-3 rounded-xl border border-white/5">
        <div className="flex justify-between mb-2">
            <span className="text-xs text-white/60 font-medium">{label}</span>
            <span className="text-xs text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">{value}{unit}</span>
        </div>
        <input
            type="range"
            min={min} max={max} step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-violet-500 hover:accent-violet-400 transition-colors"
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

  const [activeTab, setActiveTab] = useState("challenges");
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [controlCopied, setControlCopied] = useState(false);
  
  const [showOverlayUrl, setShowOverlayUrl] = useState(false);
  const [showControlUrl, setShowControlUrl] = useState(false);
  
  const [localNow, setLocalNow] = useState(Date.now());
  const [previewLightMode, setPreviewLightMode] = useState(false);

  const overlayUrl = useMemo(() => doc?.overlayKey ? `${window.location.origin}/WinChallengeOverlay/${doc.overlayKey}` : "", [doc?.overlayKey]);
  const controlUrl = useMemo(() => doc?.controlKey ? `${window.location.origin}/WinChallengeControl/${doc.controlKey}` : "", [doc?.controlKey]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/winchallenge/${user.id}`, { credentials: "include" });
        const data = await res.json();
        setDoc(ensureDocShape(data));
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, [user]);

  useEffect(() => () => saveTimeoutRef.current && clearTimeout(saveTimeoutRef.current), []);

  const saveToServer = async (payload) => {
    if (!user) return;
    try { await fetch(`/api/winchallenge/${user.id}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch (e) {}
  };

  const save = (nextRaw) => {
    const next = ensureDocShape(nextRaw);
    setDoc(next);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToServer(next), 300);
  };

  const doFullReset = async () => {
    if (!user || !window.confirm("Alles zurücksetzen? (Design, Items, Links)")) return;
    try {
      const res = await fetch(`/api/winchallenge/${user.id}?reset=1`, { method: "PUT", credentials: "include" });
      const fresh = await res.json();
      setDoc(ensureDocShape(fresh));
      setActiveTab("challenges");
    } catch (e) {}
  };

  const regenerateOverlayKey = () => save({ ...doc, overlayKey: nanoid(12) });
  const regenerateControlKey = () => save({ ...doc, controlKey: nanoid(12) });

  // Logic Wrapper
  const updateItem = (id, patch) => save({ ...doc, items: (doc?.items || []).map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const removeItem = (id) => save({ ...doc, items: (doc?.items || []).filter((i) => i.id !== id) });
  const addItem = () => save({ ...doc, items: [...(doc?.items || []), { id: nanoid(8), name: "", useWins: false, target: 1, progress: 0, done: false, pinned: false }] });
  
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

  // Timer
  const startTimer = () => { const base = doc?.timer?.elapsedMs || 0; save({ ...doc, timer: { ...(doc?.timer || {}), running: true, startedAt: Date.now() - base, elapsedMs: base } }); };
  const pauseTimer = () => { if (!doc?.timer?.running) return; const elapsed = Date.now() - (doc?.timer?.startedAt || 0); save({ ...doc, timer: { ...(doc?.timer || {}), running: false, startedAt: 0, elapsedMs: elapsed } }); };
  const resetTimer = () => save({ ...doc, timer: { ...DEFAULT_TIMER, visible: doc?.timer?.visible ?? true } });
  const adjustTimer = (deltaMs) => {
    if (!doc?.timer) return;
    const t = doc.timer;
    const currentElapsed = t.running ? Date.now() - (t.startedAt || 0) : t.elapsedMs || 0;
    let nextElapsed = Math.max(0, currentElapsed + deltaMs);
    const updatedTimer = { ...t, elapsedMs: nextElapsed };
    if (t.running) updatedTimer.startedAt = Date.now() - nextElapsed;
    save({ ...doc, timer: updatedTimer });
  };

  useEffect(() => { if (!doc?.timer?.running) return; const iv = setInterval(() => setLocalNow(Date.now()), 500); return () => clearInterval(iv); }, [doc?.timer?.running]);
  const running = !!doc?.timer?.running;
  const runningElapsed = running ? localNow - (doc?.timer?.startedAt || 0) : (doc?.timer?.elapsedMs || 0);

  const handleCopy = (text, which) => {
    if (!text) return; navigator.clipboard.writeText(text).catch(() => {});
    if (which === "overlay") { setOverlayCopied(true); setTimeout(() => setOverlayCopied(false), 1200); }
    else if (which === "control") { setControlCopied(true); setTimeout(() => setControlCopied(false), 1200); }
  };

  const renderPreview = () => {
    if (!doc) return null;
    const { style } = doc;
    const boxAlpha = Math.min(1, Math.max(0, Number(style.opacity ?? 0.6)));
    const headerAlpha = Math.min(1, Math.max(0, Number(style.headerOpacity ?? boxAlpha)));
    const showTimer = doc.timer?.visible !== false;
    const items = (doc.items && doc.items.length > 0 ? doc.items : [{ id: "p1", name: "Beispiel Challenge", pinned: true }, { id: "p2", name: "Gewinne 3 Runden", useWins: true, target: 3, progress: 1 }]).slice(0, 6);

    return (
      <div className={`p-8 rounded-3xl border border-white/5 flex justify-center items-start min-h-[400px] transition-colors duration-500 shadow-inner ${previewLightMode ? "bg-gray-200" : "bg-[#09090b]"}`}>
        <div style={{
            fontFamily: "Inter, sans-serif", color: style.textColor, borderRadius: style.borderRadius,
            background: "transparent", width: style.boxWidth, transform: `scale(${style.scale})`, transformOrigin: "top center",
            maxWidth: "100%", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", position: "relative"
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
                        <div key={it.id} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, overflow: "hidden" }}>
                            <div style={{ position: "absolute", inset: 0, background: style.itemBg || "#ffffff", opacity: style.itemBg ? boxAlpha : 0.04, zIndex: -1 }} />
                            <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: (it.done || (it.useWins && it.progress >= it.target)) ? "#2ecc71" : "inherit", fontSize: `${style.itemFontSize}px` }}>
                                {it.pinned && <span>📌</span>} {it.name}
                            </span>
                            {it.useWins ? (
                                <span style={{ padding: "2px 10px", borderRadius: 8, background: "rgba(255,255,255,.06)", border: `1px solid ${hexToRgba(style.accent || "#9146FF", 0.5)}`, fontSize: "0.85em" }}>
                                    {it.progress || 0} / {it.target || 0}
                                </span>
                            ) : (
                                <span style={{ width: 18, height: 18, borderRadius: 6, border: "2px solid rgba(255,255,255,.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: it.done ? "#2ecc71" : "transparent" }}>✓</span>
                            )}
                        </div>
                    ))}
                </div>
                {showTimer && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", background: "rgba(0,0,0,0.2)", padding: "10px", display: "flex", justifyContent: "center", gap: 10, fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>
                        <span style={{ fontSize: 10 }}>{doc.timer?.running ? "🟢" : "🔴"}</span>
                        <span>{msToClock(runningElapsed)}</span>
                    </div>
                )}
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full w-full p-4 md:p-8 text-white">
      <SEO title="WinChallenge" description="Challenges und Timer Overlay." path="WinChallenge" />

      {!user ? (
        <div className="flex h-[50vh] items-center justify-center">
            <button onClick={login} className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-8 py-4 rounded-2xl shadow-2xl transition-transform hover:scale-105">
                Mit Twitch anmelden um Challenges zu erstellen
            </button>
        </div>
      ) : loading || !doc ? (
        <div className="text-center p-20 text-white/30 animate-pulse">Lade Konfiguration...</div>
      ) : (
        <div className="max-w-[1600px] mx-auto">
          {/* TOP BAR */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
             <div>
                 <h1 className="text-3xl font-black tracking-tight text-white mb-1 flex items-center gap-3">
                    <Trophy className="text-yellow-500" /> WinChallenge
                 </h1>
                 <p className="text-sm text-white/50">Erstelle Challenges und tracke deine Wins live.</p>
             </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
            
            {/* EDITOR MAIN CARD */}
            <div className="xl:col-span-8 bg-[#18181b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                
                {/* TABS */}
                <div className="flex border-b border-white/5 bg-black/20 overflow-x-auto">
                    {[
                        { id: "challenges", label: "Challenges", icon: Trophy },
                        { id: "custom", label: "Design", icon: Palette },
                        { id: "settings", label: "Einstellungen", icon: Settings },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2.5 px-8 py-5 text-sm font-bold transition-colors relative whitespace-nowrap ${
                                activeTab === tab.id ? "text-white bg-white/5" : "text-white/40 hover:text-white hover:bg-white/5"
                            }`}
                        >
                            <tab.icon size={18} className={activeTab === tab.id ? "text-violet-400" : "opacity-50"} />
                            {tab.label}
                            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />}
                        </button>
                    ))}
                </div>

                {/* TAB CONTENT */}
                <div className="p-6 md:p-8 min-h-[500px]">
                    
                    {/* 1. CHALLENGES TAB */}
                    {activeTab === "challenges" && (
                        <div className="space-y-6">
                            {(doc.items || []).length === 0 && (
                                <div className="text-center py-16 border-2 border-dashed border-white/5 rounded-2xl bg-white/5">
                                    <Trophy size={40} className="mx-auto mb-4 text-white/20" />
                                    <p className="text-white/40 mb-6">Deine Liste ist leer.</p>
                                    <button onClick={addItem} className="text-violet-400 font-bold hover:text-violet-300">Erste Challenge anlegen</button>
                                </div>
                            )}

                            <div className="space-y-3">
                                {(doc.items || []).map((it) => {
                                    const done = it.useWins ? (it.progress || 0) >= (it.target || 0) : !!it.done;
                                    return (
                                        <div key={it.id} onDragOver={onDragOver(it.id)} onDrop={onDrop(it.id)}
                                             className={`group bg-black/20 hover:bg-black/30 rounded-2xl p-4 border transition-all ${done ? "border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.05)]" : "border-white/5 hover:border-white/10"}`}>
                                            
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
                                                            <div className="flex items-center bg-black/40 rounded-lg border border-white/10 px-2 py-1">
                                                                <span className="text-[10px] uppercase text-white/30 font-bold mr-2">Ziel</span>
                                                                <input type="number" min={1} className="w-8 bg-transparent text-right text-sm font-mono focus:outline-none text-white" value={it.target || 1} onChange={(e) => updateItem(it.id, { target: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
                                                            </div>
                                                            <div className="flex items-center bg-white/5 rounded-lg border border-white/5 overflow-hidden">
                                                                <button onClick={() => updateItem(it.id, { progress: Math.max(0, (it.progress || 0) - 1) })} className="px-3 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors font-mono">−</button>
                                                                <span className="w-8 text-center font-mono font-bold text-white text-sm">{it.progress || 0}</span>
                                                                <button onClick={() => updateItem(it.id, { progress: (it.progress || 0) + 1 })} className="px-3 py-1 hover:bg-white/10 text-white/50 hover:text-white transition-colors font-mono">+</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => updateItem(it.id, { done: !it.done })} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-bold ${it.done ? "bg-green-500/20 border-green-500/30 text-green-400" : "bg-white/5 border-white/5 text-white/40 hover:text-white"}`}>
                                                            {it.done ? <Check size={14}/> : <div className="w-3.5 h-3.5 rounded-full border border-white/30" />}
                                                            {it.done ? "Erledigt" : "Offen"}
                                                        </button>
                                                    )}

                                                    <div className="flex items-center gap-1 border-l border-white/10 pl-2 ml-2">
                                                        <button onClick={() => updateItem(it.id, { pinned: !it.pinned })} className={`p-2 rounded-lg transition-colors ${it.pinned ? "text-violet-400 bg-violet-500/10" : "text-white/20 hover:text-white hover:bg-white/5"}`} title="Anpinnen"><Pin size={16}/></button>
                                                        <button onClick={() => removeItem(it.id)} className="p-2 text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Löschen"><Trash2 size={16}/></button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <button onClick={addItem} className="w-full py-4 rounded-2xl border border-dashed border-white/10 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all font-bold flex justify-center items-center gap-2 mt-4">
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-2xl bg-black/20 border border-white/5">
                                    <div className="col-span-full">
                                        <label className="block text-xs font-bold text-white/40 uppercase mb-2">Titel Text</label>
                                        <input className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-violet-500 focus:outline-none transition-colors" value={doc.title || ""} onChange={(e) => save({ ...doc, title: e.target.value })} placeholder="WinChallenge" />
                                    </div>
                                    <RangeSlider label="Schriftgröße" value={doc.style?.titleFontSize ?? 20} min={12} max={48} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleFontSize: v }) })} />
                                    <div>
                                        <span className="text-xs font-bold text-white/40 uppercase mb-2 block">Ausrichtung</span>
                                        <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
                                            {['left', 'center'].map(align => (
                                                <button key={align} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all capitalize ${doc.style?.titleAlign === align ? 'bg-violet-600 text-white shadow' : 'text-white/40 hover:text-white'}`} onClick={() => save({ ...doc, style: normalizeStyle({ ...doc.style, titleAlign: align }) })}>{align}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Farben */}
                            <div>
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Palette size={20} className="text-pink-400"/> Farben</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 p-5 rounded-2xl bg-black/20 border border-white/5">
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
                                <div className="p-5 rounded-2xl bg-black/20 border border-white/5 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                      <RangeSlider label="Breite" value={doc.style?.boxWidth ?? 520} min={280} max={1000} step={10} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, boxWidth: v }) })} />
                                      <RangeSlider label="Skalierung" value={doc.style?.scale ?? 1} min={0.5} max={2} step={0.05} unit="x" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, scale: v }) })} />
                                      <RangeSlider label="Eckenradius" value={doc.style?.borderRadius ?? 12} min={0} max={32} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, borderRadius: v }) })} />
                                      <RangeSlider label="Challenge Größe" value={doc.style?.itemFontSize ?? 16} min={10} max={32} step={1} unit="px" onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemFontSize: v }) })} />
                                      
                                      {/* Hier sind jetzt beide Slider für Deckkraft */}
                                      <RangeSlider label="Hintergrund Deckkraft" value={doc.style?.opacity ?? 0.6} min={0} max={1} step={0.05} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, opacity: v }) })} />
                                      <RangeSlider label="Header Deckkraft" value={doc.style?.headerOpacity ?? 0.9} min={0} max={1} step={0.05} onChange={(v) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerOpacity: v }) })} />
                                  </div>
                                    
                                    <div className="pt-6 border-t border-white/5">
                                        <label className="flex items-center gap-3 cursor-pointer select-none mb-4">
                                            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${doc.animation?.enabled ? "bg-green-500" : "bg-white/10"}`}>
                                                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${doc.animation?.enabled ? "translate-x-4" : ""}`} />
                                            </div>
                                            <span className="text-sm font-bold text-white">Animation aktivieren (Paging/Scrolling)</span>
                                            <input type="checkbox" className="hidden" checked={!!doc.animation?.enabled} onChange={(e) => save({ ...doc, animation: { ...doc.animation, enabled: e.target.checked } })} />
                                        </label>

                                        <div className={`transition-all duration-300 ${!doc.animation?.enabled ? "opacity-30 pointer-events-none grayscale" : ""}`}>
                                            <div className="flex bg-black/40 rounded-xl p-1 border border-white/5 mb-4 max-w-sm">
                                                <button className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${doc.animation?.mode !== 'scrolling' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`} onClick={() => save({ ...doc, animation: { ...doc.animation, mode: "paging" } })}>Seitenweise (Paging)</button>
                                                <button className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${doc.animation?.mode === 'scrolling' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`} onClick={() => save({ ...doc, animation: { ...doc.animation, mode: "scrolling" } })}>Laufschrift (Scroll)</button>
                                            </div>
                                            {doc.animation?.mode === "scrolling" ? (
                                                 <div className="grid grid-cols-2 gap-4">
                                                    <RangeSlider label="Speed" value={doc.animation?.scrolling?.speedPxPerSec ?? 30} min={5} max={200} step={5} unit="px/s" onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, speedPxPerSec: v } } })} />
                                                    <RangeSlider label="Sichtbare Zeilen" value={doc.animation?.scrolling?.visibleRows ?? 2} min={1} max={10} step={1} onChange={(v) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, visibleRows: v } } })} />
                                                    {/* NEU: Pause Einstellung */}
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

                    {/* 3. SETTINGS TAB */}
                    {activeTab === "settings" && (
                        <div className="space-y-6">
                            
                            {/* OBS Browser Source */}
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <h4 className="text-sm font-bold text-white uppercase tracking-wide mb-4 flex items-center gap-2"><Monitor size={16}/> OBS Browser Source</h4>
                                <div className="flex gap-2 mb-2">
                                    <input readOnly type={showOverlayUrl ? "text" : "password"} className="flex-1 bg-black/40 px-4 py-3 rounded-xl text-sm font-mono text-white/70 border border-white/5 outline-none" value={overlayUrl} />
                                    <button onClick={() => setShowOverlayUrl(!showOverlayUrl)} className="px-4 bg-white/5 hover:bg-white/10 rounded-xl text-white/70 transition-colors">{showOverlayUrl ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                                    <button onClick={() => handleCopy(overlayUrl, "overlay")} className="px-5 bg-violet-600 hover:bg-violet-500 rounded-xl text-white font-bold text-sm transition-colors flex items-center gap-2">
                                        {overlayCopied ? <Check size={16}/> : <Copy size={16}/>}
                                        {overlayCopied ? "Kopiert" : "Kopieren"}
                                    </button>
                                </div>
                                <button onClick={regenerateOverlayKey} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-2">
                                    <RefreshCw size={12}/> Link neu generieren (Reset)
                                </button>
                            </div>

                            {/* Moderator Link */}
                            <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                                <h4 className="text-sm font-bold text-white uppercase tracking-wide mb-4 flex items-center gap-2"><ShieldAlert size={16}/> Moderator Link</h4>
                                <p className="text-xs text-white/50 mb-4">Teile diesen Link mit Mods, damit sie Timer und Ergebnisse steuern können.</p>
                                <div className="flex gap-2 mb-2">
                                    <input readOnly type={showControlUrl ? "text" : "password"} className="flex-1 bg-black/40 px-4 py-3 rounded-xl text-sm font-mono text-white/70 border border-white/5 outline-none" value={controlUrl} />
                                    <button onClick={() => setShowControlUrl(!showControlUrl)} className="px-4 bg-white/5 hover:bg-white/10 rounded-xl text-white/70 transition-colors">{showControlUrl ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                                    <button onClick={() => handleCopy(controlUrl, "control")} className="px-5 bg-violet-600 hover:bg-violet-500 rounded-xl text-white font-bold text-sm transition-colors flex items-center gap-2">
                                        {controlCopied ? <Check size={16}/> : <Copy size={16}/>}
                                        {controlCopied ? "Kopiert" : "Kopieren"}
                                    </button>
                                </div>
                                <button onClick={regenerateControlKey} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 mt-2">
                                    <RefreshCw size={12}/> Link neu generieren (Reset)
                                </button>
                                
                                <div className="mt-6 pt-4 border-t border-white/5">
                                    <h5 className="text-xs font-bold text-white/40 uppercase mb-3">Berechtigungen für Mods</h5>
                                    <div className="space-y-2">
                                        {[
                                            { key: 'allowModsTimer', label: 'Timer steuern (Start/Stop/Reset)' },
                                            { key: 'allowModsTitle', label: 'Titel ändern' },
                                            { key: 'allowModsChallenges', label: 'Challenges bearbeiten (Wins/Status)' }
                                        ].map(perm => (
                                            <label key={perm.key} className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors">
                                                <input type="checkbox" className="w-4 h-4 accent-violet-500 bg-transparent" checked={!!doc.controlPermissions?.[perm.key]} onChange={(e) => save({ ...doc, controlPermissions: { ...doc.controlPermissions, [perm.key]: e.target.checked } })} /> 
                                                <span className="text-sm text-white/80">{perm.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Reset Zone (GANZ UNTEN) */}
                            <div className="mt-8 p-5 rounded-xl border border-red-900/30 bg-red-900/5">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h4 className="text-sm font-bold text-red-200">Gefahrenzone</h4>
                                        <p className="text-xs text-red-400/70 mt-1">Setzt Design, alle Challenges und Einstellungen auf Standard zurück.</p>
                                    </div>
                                    <button onClick={doFullReset} className="px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-300 border border-red-900/50 rounded-lg text-sm transition-colors font-bold flex items-center gap-2">
                                        <Trash2 size={16}/> Alles zurücksetzen
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RECHTER BEREICH: PREVIEW & TIMER */}
            <div className="xl:col-span-4 space-y-6 sticky top-6">
                
                {/* PREVIEW BOX */}
                <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="text-white/40 text-xs uppercase tracking-wider font-bold">Live Vorschau</h3>
                        <button onClick={() => setPreviewLightMode(!previewLightMode)} className="text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/50 transition-colors border border-white/5">
                            {previewLightMode ? "BG: Hell" : "BG: Dunkel"}
                        </button>
                    </div>
                    {renderPreview()}
                </div>

                {/* TIMER CONTROLS CARD */}
                <div className="bg-[#18181b] rounded-3xl p-6 border border-white/10 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] ${running ? "bg-green-500 text-green-500" : "bg-red-500 text-red-500"}`} />
                            <span className="text-sm font-bold text-white uppercase tracking-wider">Timer Control</span>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-white/50 hover:text-white transition-colors">
                            <input type="checkbox" className="accent-violet-500" checked={doc?.timer?.visible !== false} onChange={(e) => save({ ...doc, timer: { ...(doc?.timer || {}), visible: e.target.checked } })} />
                            Sichtbar
                        </label>
                    </div>
                    
                    <div className="bg-black/40 rounded-2xl p-4 text-center border border-white/5 mb-4 shadow-inner">
                        <span className="font-mono text-4xl font-black text-white tracking-widest tabular-nums drop-shadow-lg">{msToClock(runningElapsed)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                        {!running ? (
                            <button onClick={startTimer} className="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-green-900/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                <Play size={18} fill="currentColor" /> START
                            </button>
                        ) : (
                            <button onClick={pauseTimer} className="bg-amber-500 hover:bg-amber-400 text-black py-3 rounded-xl text-sm font-bold shadow-lg shadow-amber-900/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                <Pause size={18} fill="currentColor" /> PAUSE
                            </button>
                        )}
                        <button onClick={resetTimer} className="bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 border border-white/5">
                            <RotateCcw size={18} /> RESET
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 pt-4 border-t border-white/5">
                        <button onClick={() => adjustTimer(3600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-lg text-[10px] font-mono font-bold">+1h</button>
                        <button onClick={() => adjustTimer(60000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-lg text-[10px] font-mono font-bold">+1m</button>
                        <button onClick={() => adjustTimer(-60000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-lg text-[10px] font-mono font-bold">-1m</button>
                        <button onClick={() => adjustTimer(-3600000)} className="bg-white/5 hover:bg-white/10 text-white/70 py-2 rounded-lg text-[10px] font-mono font-bold">-1h</button>
                    </div>
                </div>

            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}