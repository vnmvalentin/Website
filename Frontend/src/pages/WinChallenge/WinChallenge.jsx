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
  boxBg: "#000000",
  textColor: "#ffffff",
  accent: "#ffffff",
  opacity: 0.6,
  borderRadius: 12,
  scale: 1.0,
  boxWidth: 280,
  titleAlign: "left",
  titleColor: "#ffffff",
  headerBg: "#000000",
  headerOpacity: 0.9,
  titleFontSize: 18,
  itemFontSize: 16,
  itemBg: "#282424",
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

/* ─────────────────────────────  Component  ───────────────────────────── */

export default function WinChallenge() {
  const { user, login } = useContext(TwitchAuthContext);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const dragIdRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const [activeTab, setActiveTab] = useState("custom");
  const [overlayCopied, setOverlayCopied] = useState(false);
  const [controlCopied, setControlCopied] = useState(false);

  const [showOverlayUrl, setShowOverlayUrl] = useState(false);
  const [showControlUrl, setShowControlUrl] = useState(false);

  const [localNow, setLocalNow] = useState(Date.now());
  const [previewLightMode, setPreviewLightMode] = useState(true);

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
    if (
      !window.confirm(
        "Alles zurücksetzen? (Titel, Style, Timer, Items, Links)"
      )
    )
      return;
    try {
      const res = await fetch(`/api/winchallenge/${user.id}?reset=1`, {
        method: "PUT",
        credentials: "include",
      });
      const fresh = await res.json();
      setDoc(ensureDocShape(fresh));
      setActiveTab("custom");
    } catch (e) {
      console.error("Reset fehlgeschlagen", e);
    }
  };

  // Helper functions
  const addItem = () =>
    save({
      ...doc,
      items: [
        ...(doc?.items || []),
        {
          id: nanoid(8),
          name: "",
          useWins: false,
          target: 1,
          progress: 0,
          done: false,
          pinned: false,
        },
      ],
    });
  const updateItem = (id, patch) =>
    save({
      ...doc,
      items: (doc?.items || []).map((it) =>
        it.id === id ? { ...it, ...patch } : it
      ),
    });
  const removeItem = (id) =>
    save({
      ...doc,
      items: (doc?.items || []).filter((i) => i.id !== id),
    });

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

  const startTimer = () => {
    const base = doc?.timer?.elapsedMs || 0;
    save({
      ...doc,
      timer: {
        ...(doc?.timer || {}),
        running: true,
        startedAt: Date.now() - base,
        elapsedMs: base,
      },
    });
  };
  const pauseTimer = () => {
    if (!doc?.timer?.running) return;
    const elapsed = Date.now() - (doc?.timer?.startedAt || 0);
    save({
      ...doc,
      timer: {
        ...(doc?.timer || {}),
        running: false,
        startedAt: 0,
        elapsedMs: elapsed,
      },
    });
  };
  const resetTimer = () =>
    save({
      ...doc,
      timer: { ...DEFAULT_TIMER, visible: doc?.timer?.visible ?? true },
    });
  const adjustTimer = (deltaMs) => {
    if (!doc?.timer) return;
    const t = doc.timer;
    const currentElapsed = t.running
      ? Date.now() - (t.startedAt || 0)
      : t.elapsedMs || 0;
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

  const regenerateOverlayKey = () => {
    const newKey = nanoid(12);
    save({ ...doc, overlayKey: newKey });
  };

  const regenerateControlKey = () => {
    const newKey = nanoid(12);
    save({ ...doc, controlKey: newKey });
  };

  // --- PREVIEW RENDERER ---
  const renderPreview = () => {
    if (!doc) return null;
    const { style } = doc;
    const boxAlpha = Math.min(1, Math.max(0, Number(style.opacity ?? 0.6)));
    const headerAlpha = Math.min(
      1,
      Math.max(0, Number(style.headerOpacity ?? boxAlpha))
    );
    const effectiveTitleColor = style.titleColor || style.textColor;
    const showTimer = doc.timer?.visible !== false;
    const isCenter = style.titleAlign === "center";

    const previewItems =
      doc.items && doc.items.length > 0
        ? doc.items 
        : [
            { id: "p1", name: "Beispiel Challenge 1", pinned: true },
            { id: "p2", name: "Gewinne 3 Runden", useWins: true, target: 3, progress: 1 },
            { id: "p3", name: "Erledigte Aufgabe", done: true },
          ];

    const displayItems = previewItems.slice(0, 6);

    return (
      <div className="sticky top-6">
        <div className="flex items-center justify-between mb-2">
            <h3 className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Live Vorschau</h3>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setPreviewLightMode(!previewLightMode)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${previewLightMode ? "bg-white text-black border-gray-300" : "bg-gray-800 text-gray-300 border-gray-700"}`}
                title="Hintergrund umschalten"
              >
                {previewLightMode ? "Hintergrund: ☀️" : "Hintergrund: 🌑"}
              </button>
              <span className="text-[10px] text-gray-500 bg-gray-900 px-2 py-0.5 rounded">1:1</span>
            </div>
        </div>
        
        {/* Preview Container mit Toggle für Hintergrund */}
        <div className={`p-4 rounded-xl border border-dashed border-gray-700/50 flex justify-center items-start min-h-[250px] transition-colors duration-300 ${previewLightMode ? "bg-gray-100" : "bg-black/40"}`}>
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
            {/* Main BG Layer */}
            <div
                style={{
                position: "absolute",
                inset: 0,
                background: style.boxBg,
                opacity: boxAlpha,
                zIndex: 0,
                }}
            />

            {/* Content Wrapper */}
            <div className="relative z-10">
                {/* Header */}
                <div style={{ borderBottom: "1px solid rgba(255,255,255,.08)", position: "relative" }}>
                <div
                    style={{
                    position: "absolute",
                    inset: 0,
                    background: style.headerBg || style.boxBg,
                    opacity: headerAlpha,
                    zIndex: -1,
                    }}
                />
                <div
                    style={{
                    display: "grid",
                    gridTemplateColumns: isCenter ? "1fr auto 1fr" : "auto 1fr auto",
                    alignItems: "center",
                    padding: "10px 14px",
                    columnGap: 8,
                    }}
                >
                    {isCenter && <div />}
                    <div
                    style={{
                        fontWeight: 800,
                        textAlign: isCenter ? "center" : "left",
                        color: effectiveTitleColor,
                        fontSize: `${style.titleFontSize}px`,
                        whiteSpace: "nowrap"
                    }}
                    >
                    {doc.title || "WinChallenge"}
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {displayItems.map((it) => (
                    <div
                    key={it.id}
                    style={{
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        borderRadius: 10,
                        overflow: "hidden",
                    }}
                    >
                    <div
                        style={{
                        position: "absolute",
                        inset: 0,
                        background: style.itemBg || "#ffffff",
                        opacity: style.itemBg ? boxAlpha : 0.04,
                        zIndex: -1,
                        }}
                    />
                    <span
                        style={{
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        color: (it.done || (it.useWins && it.progress >= it.target)) ? "#2ecc71" : "inherit",
                        fontSize: `${style.itemFontSize}px`,
                        }}
                    >
                        {it.pinned && <span>📌</span>}
                        {it.name}
                    </span>

                    {it.useWins ? (
                        <span
                        style={{
                            padding: "2px 10px",
                            borderRadius: 8,
                            background: "rgba(255,255,255,.06)",
                            border: `1px solid ${hexToRgba(style.accent || "#9146FF", 0.5)}`,
                            fontSize: "0.85em",
                            whiteSpace: "nowrap"
                        }}
                        >
                        {it.progress || 0} / {it.target || 0}
                        </span>
                    ) : (
                        <span
                        style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            border: "2px solid rgba(255,255,255,.7)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color: it.done ? "#2ecc71" : "transparent",
                            background: "rgba(0,0,0,.4)",
                        }}
                        >
                        ✓
                        </span>
                    )}
                    </div>
                ))}
                </div>

                {/* NEUER ORT FÜR DEN TIMER: UNTER DEN ITEMS */}
                {showTimer && (
                    <div style={{
                        borderTop: "1px solid rgba(255,255,255,.08)",
                        background: "rgba(0,0,0,0.2)",
                        padding: "8px 14px",
                        display: "flex",
                        justifyContent: "center", // oder "flex-end"
                        alignItems: "center",
                        gap: 8,
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: "monospace"
                    }}>
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

  // --- NEU: Timer Controls für die rechte Spalte ---
  const renderTimerControls = () => (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 shadow-lg mt-4">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <span className="text-sm font-bold uppercase tracking-wider text-gray-400">Timer Steuerung</span>
                <span className={`w-2 h-2 rounded-full ${running ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
            </div>
            <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-400 hover:text-white transition-colors">
                    <input type="checkbox" className="accent-[#9146FF]"
                        checked={doc?.timer?.visible !== false}
                        onChange={(e) => save({ ...doc, timer: { ...(doc?.timer || {}), visible: e.target.checked } })}
                    />
                    Anzeigen
                </label>
            </div>
        </div>
        
        <div className="flex flex-col gap-3">
            <div className="bg-black/40 rounded-lg p-2 text-center border border-white/5 mb-1">
                <span className="font-mono text-3xl font-bold text-white tracking-widest">
                    {msToClock(runningElapsed)}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {!running ? (
                    <button onClick={startTimer} className="col-span-2 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg text-sm font-bold shadow-lg shadow-green-900/20 transition-all active:scale-95">START</button>
                ) : (
                    <button onClick={pauseTimer} className="col-span-2 bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-lg text-sm font-bold shadow-lg shadow-yellow-900/20 transition-all active:scale-95">PAUSE</button>
                )}
                <button onClick={resetTimer} className="bg-gray-700 hover:bg-red-600 text-white py-3 rounded-lg text-sm font-bold transition-all active:scale-95">RESET</button>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-2">
                <button onClick={() => adjustTimer(60 * 60 * 1000)} className="bg-gray-800 hover:bg-gray-700 py-2 rounded text-xs font-mono transition-colors">+1h</button>
                <button onClick={() => adjustTimer(60 * 1000)} className="bg-gray-800 hover:bg-gray-700 py-2 rounded text-xs font-mono transition-colors">+1m</button>
                <button onClick={() => adjustTimer(-60 * 1000)} className="bg-gray-800 hover:bg-gray-700 py-2 rounded text-xs font-mono transition-colors">−1m</button>
                <button onClick={() => adjustTimer(-60 * 60 * 1000)} className="bg-gray-800 hover:bg-gray-700 py-2 rounded text-xs font-mono transition-colors">−1h</button>
            </div>
        </div>
    </div>
  );

  return (
    <div className="min-h-full w-full p-4">
      <div className="text-center text-lg md:text-xl text-gray-100 font-bold underline mb-4">
        Win Challenge Overlay für OBS
      </div>

      <SEO
        title="WinChallenge Overlay"
        description="Erstelle dein interaktives Win-Challenge Overlay für OBS auf vnmvalentin.de. Tracke Wins, erstelle Challenges und binde sie direkt in deinen Stream ein."
        path="WinChallenge-Overlay"
      />

      {!user ? (
        <div className="max-w-3xl mx-auto bg-gray-900/80 rounded-2xl p-6 mt-8 text-center">
          <h1 className="text-2xl font-bold mb-2">WinChallenge</h1>
          <p className="mb-4">
            Bitte mit deinem Twitch-Account verbinden, um dein Overlay zu
            konfigurieren.
          </p>
          <button
            onClick={() => login()}
            className="bg-[#9146FF] hover:bg-[#7d36ff] px-4 py-2 rounded-lg"
          >
            Mit Twitch anmelden
          </button>
        </div>
      ) : loading || !doc ? (
        <div className="text-center p-8">Lade…</div>
      ) : (
        /* HAUPT-LAYOUT: Flex auf Large Screens (2 Spalten) */
        <div className="flex flex-col xl:flex-row gap-8 items-start max-w-[1800px] mx-auto">
          
          {/* LINKE SPALTE: Editor Controls */}
          <div className="flex-1 w-full min-w-0 bg-gray-900/80 rounded-2xl p-6 shadow-lg border border-gray-800">
            <div className="flex gap-2 mb-6 border-b border-gray-800">
              {[
                { id: "custom", label: "Customization" },
                { id: "challenges", label: "Challenges" },
                { id: "settings", label: "Settings & Links" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm rounded-t-lg border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-[#9146FF] text-white bg-white/5"
                      : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "custom" && (
              <div className="space-y-8">
                {/* Titel-Box */}
                <div className="relative bg-gray-900 rounded-xl p-6 border border-gray-800/80">
                  <span className="absolute -top-3 left-4 text-[10px] uppercase tracking-wide bg-white text-gray-900 px-3 py-0.5 rounded-full shadow">
                    Titel & Header
                  </span>
                  
                  <div className="flex flex-col gap-5 mt-2">
                    <div>
                        <label className="block text-sm mb-1 text-gray-400">Titel-Text</label>
                        <input
                        className="w-full text-lg font-bold bg-transparent border-b border-gray-600 focus:border-[#9146FF] focus:outline-none py-1 transition-colors"
                        value={doc.title || ""}
                        onChange={(e) => save({ ...doc, title: e.target.value })}
                        placeholder="Titel (z. B. Stream Challenges)"
                        />
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">Titelfarbe</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-mono">{hex3to6(doc.style?.titleColor)}</span>
                                <input
                                    type="color"
                                    value={hex3to6(doc.style?.titleColor)}
                                    onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleColor: e.target.value }) })}
                                    className="w-10 h-8 rounded cursor-pointer bg-transparent p-0 border-0"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">Header-Hintergrund</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-mono">{hex3to6(doc.style?.headerBg)}</span>
                                <input
                                    type="color"
                                    value={hex3to6(doc.style?.headerBg)}
                                    onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerBg: e.target.value }) })}
                                    className="w-10 h-8 rounded cursor-pointer bg-transparent p-0 border-0"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6 pt-2 border-t border-gray-800">
                        <div>
                            <label className="block text-sm mb-2 text-gray-400 flex justify-between">
                                <span>Titel-Größe</span>
                                <span className="text-white font-mono bg-black/30 px-2 rounded">{doc.style?.titleFontSize ?? 20}px</span>
                            </label>
                            <input
                                type="range" min={12} max={48} step={1}
                                value={doc.style?.titleFontSize ?? 20}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, titleFontSize: parseInt(e.target.value, 10) }) })}
                                className="w-full accent-[#9146FF] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        <div>
                            <label className="block text-sm mb-2 text-gray-400">Ausrichtung</label>
                            <div className="flex bg-black/30 rounded p-1 border border-gray-700">
                                <button 
                                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${doc.style?.titleAlign !== 'center' ? 'bg-[#9146FF] text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                    onClick={() => save({ ...doc, style: normalizeStyle({ ...doc.style, titleAlign: "left" }) })}
                                >Links</button>
                                <button 
                                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${doc.style?.titleAlign === 'center' ? 'bg-[#9146FF] text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                    onClick={() => save({ ...doc, style: normalizeStyle({ ...doc.style, titleAlign: "center" }) })}
                                >Zentriert</button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm mb-2 text-gray-400 flex justify-between">
                                <span>Header Deckkraft</span>
                                <span className="text-white font-mono bg-black/30 px-2 rounded">{Math.round((doc.style?.headerOpacity ?? doc.style?.opacity ?? 0.6) * 100)}%</span>
                            </label>
                            <input
                                type="range" min={0} max={1} step={0.05}
                                value={doc.style?.headerOpacity ?? doc.style?.opacity ?? 0.6}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, headerOpacity: parseFloat(e.target.value) }) })}
                                className="w-full accent-[#9146FF] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                  </div>
                </div>

                {/* Style Controls (Box) */}
                <div className="relative bg-gray-900 rounded-xl p-6 border border-gray-800/80">
                  <span className="absolute -top-3 left-4 text-[10px] uppercase tracking-wide bg-white text-gray-900 px-3 py-0.5 rounded-full shadow">
                    Box Design
                  </span>

                  <div className="flex flex-col gap-6 mt-2">
                    {/* Farben Grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                       <div className="flex flex-col gap-2">
                          <label className="text-xs text-gray-400">Box-Farbe</label>
                          <div className="flex items-center gap-2">
                            <input type="color" className="w-8 h-8 rounded cursor-pointer p-0 border-0 bg-transparent" 
                                value={hex3to6(doc.style?.boxBg)}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, boxBg: e.target.value }) })}
                            />
                            <span className="text-xs text-gray-600 font-mono">{hex3to6(doc.style?.boxBg)}</span>
                          </div>
                       </div>
                       <div className="flex flex-col gap-2">
                          <label className="text-xs text-gray-400">Textfarbe</label>
                          <div className="flex items-center gap-2">
                            <input type="color" className="w-8 h-8 rounded cursor-pointer p-0 border-0 bg-transparent" 
                                value={hex3to6(doc.style?.textColor)}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, textColor: e.target.value }) })}
                            />
                            <span className="text-xs text-gray-600 font-mono">{hex3to6(doc.style?.textColor)}</span>
                          </div>
                       </div>
                       <div className="flex flex-col gap-2">
                          <label className="text-xs text-gray-400">Akzentfarbe</label>
                          <div className="flex items-center gap-2">
                            <input type="color" className="w-8 h-8 rounded cursor-pointer p-0 border-0 bg-transparent" 
                                value={hex3to6(doc.style?.accent)}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, accent: e.target.value }) })}
                            />
                            <span className="text-xs text-gray-600 font-mono">{hex3to6(doc.style?.accent)}</span>
                          </div>
                       </div>
                       <div className="flex flex-col gap-2">
                          <label className="text-xs text-gray-400">Item-Hintergrund</label>
                          <div className="flex items-center gap-2">
                            <input type="color" className="w-8 h-8 rounded cursor-pointer p-0 border-0 bg-transparent" 
                                value={hex3to6(doc.style?.itemBg)}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemBg: e.target.value }) })}
                            />
                            <span className="text-xs text-gray-600 font-mono">{hex3to6(doc.style?.itemBg)}</span>
                          </div>
                       </div>
                    </div>

                    <hr className="border-gray-800" />

                    {/* Sliders Stack */}
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm mb-2 text-gray-400 flex justify-between">
                                <span>Allgemeine Deckkraft</span>
                                <span className="text-white font-mono bg-black/30 px-2 rounded">{Math.round((doc.style?.opacity ?? 0.6) * 100)}%</span>
                            </label>
                            <input type="range" min={0} max={1} step={0.05} className="w-full accent-[#9146FF] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                value={doc.style?.opacity ?? 0.6}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, opacity: parseFloat(e.target.value) }) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm mb-2 text-gray-400 flex justify-between">
                                <span>Ecken-Radius</span>
                                <span className="text-white font-mono bg-black/30 px-2 rounded">{doc.style?.borderRadius ?? 12}px</span>
                            </label>
                            <input type="range" min={0} max={32} step={1} className="w-full accent-[#9146FF] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                value={doc.style?.borderRadius ?? 12}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, borderRadius: parseInt(e.target.value, 10) }) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm mb-2 text-gray-400 flex justify-between">
                                <span>Gesamt-Skalierung</span>
                                <span className="text-white font-mono bg-black/30 px-2 rounded">{doc.style?.scale ?? 1}x</span>
                            </label>
                            <input type="range" min={0.5} max={2} step={0.05} className="w-full accent-[#9146FF] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                value={doc.style?.scale ?? 1}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, scale: parseFloat(e.target.value) }) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm mb-2 text-gray-400 flex justify-between">
                                <span>Box-Breite</span>
                                <span className="text-white font-mono bg-black/30 px-2 rounded">{doc.style?.boxWidth ?? 520}px</span>
                            </label>
                            <input type="range" min={280} max={1600} step={10} className="w-full accent-[#9146FF] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                value={doc.style?.boxWidth ?? 520}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, boxWidth: parseInt(e.target.value, 10) }) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm mb-2 text-gray-400 flex justify-between">
                                <span>Challenge Textgröße</span>
                                <span className="text-white font-mono bg-black/30 px-2 rounded">{doc.style?.itemFontSize ?? 16}px</span>
                            </label>
                            <input type="range" min={10} max={32} step={1} className="w-full accent-[#9146FF] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                value={doc.style?.itemFontSize ?? 16}
                                onChange={(e) => save({ ...doc, style: normalizeStyle({ ...doc.style, itemFontSize: parseInt(e.target.value, 10) }) })}
                            />
                        </div>
                    </div>
                  </div>
                </div>

                {/* Animationen */}
                <div className="relative bg-gray-900 rounded-xl p-6 border border-gray-800/80">
                  <span className="absolute -top-3 left-4 text-[10px] uppercase tracking-wide bg-white text-gray-900 px-3 py-0.5 rounded-full shadow">
                    Animationen
                  </span>
                  
                  <div className="flex flex-col gap-5 mt-2">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" className="w-5 h-5 accent-[#9146FF] rounded bg-gray-800 border-gray-700"
                            checked={!!doc.animation?.enabled}
                            onChange={(e) => save({ ...doc, animation: { ...doc.animation, enabled: e.target.checked } })}
                        />
                        <span className="text-sm font-semibold">Animation aktivieren</span>
                    </label>

                    <div>
                        <label className="block text-sm mb-2 text-gray-400">Modus</label>
                        <div className="flex bg-black/30 rounded p-1 border border-gray-700">
                            <button 
                                className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${doc.animation?.mode !== 'scrolling' ? 'bg-[#9146FF] text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                disabled={!doc.animation?.enabled}
                                onClick={() => save({ ...doc, animation: { ...doc.animation, mode: "paging" } })}
                            >Paging (Seiten)</button>
                            <button 
                                className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${doc.animation?.mode === 'scrolling' ? 'bg-[#9146FF] text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                disabled={!doc.animation?.enabled}
                                onClick={() => save({ ...doc, animation: { ...doc.animation, mode: "scrolling" } })}
                            >Scrolling (Laufband)</button>
                        </div>
                    </div>

                    {/* Optionen je nach Modus */}
                    {doc.animation?.enabled && doc.animation?.mode !== "scrolling" && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs mb-1 text-gray-400">Items / Seite</label>
                          <input type="number" min={1} max={10} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:border-[#9146FF] focus:outline-none"
                            value={doc.animation?.paging?.pageSize ?? 5}
                            onChange={(e) => save({ ...doc, animation: { ...doc.animation, paging: { ...doc.animation?.paging, pageSize: Math.max(1, parseInt(e.target.value || "1", 10)) } } })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs mb-1 text-gray-400">Intervall (Sek)</label>
                          <input type="number" min={2} max={60} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:border-[#9146FF] focus:outline-none"
                            value={doc.animation?.paging?.intervalSec ?? 20}
                            onChange={(e) => save({ ...doc, animation: { ...doc.animation, paging: { ...doc.animation?.paging, intervalSec: Math.max(2, parseInt(e.target.value || "20", 10)) } } })}
                          />
                        </div>
                      </div>
                    )}

                    {doc.animation?.enabled && doc.animation?.mode === "scrolling" && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs mb-1 text-gray-400 flex justify-between">
                                    <span>Scroll-Speed</span>
                                    <span>{doc.animation?.scrolling?.speedPxPerSec ?? 30} px/s</span>
                                </label>
                                <input type="range" min={5} max={300} className="w-full accent-[#9146FF] h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                    value={doc.animation?.scrolling?.speedPxPerSec ?? 30}
                                    onChange={(e) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, speedPxPerSec: Math.max(5, parseInt(e.target.value || "30", 10)) } } })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs mb-1 text-gray-400">Box-Höhe (Items)</label>
                                    <input type="number" min={1} max={10} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:border-[#9146FF] focus:outline-none"
                                        value={doc.animation?.scrolling?.visibleRows ?? 2}
                                        onChange={(e) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, visibleRows: Math.max(1, parseInt(e.target.value || "2", 10)) } } })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs mb-1 text-gray-400">Pause (Sek)</label>
                                    <input type="number" min={0} max={30} step={0.5} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:border-[#9146FF] focus:outline-none"
                                        value={doc.animation?.scrolling?.pauseSec ?? 2}
                                        onChange={(e) => save({ ...doc, animation: { ...doc.animation, scrolling: { ...doc.animation?.scrolling, pauseSec: Math.max(0, Number(e.target.value || "0")) } } })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Challenges */}
            {activeTab === "challenges" && (
              <div className="space-y-4">
                {(doc.items || []).map((it) => {
                  const done = it.useWins
                    ? (it.progress || 0) >= (it.target || 0)
                    : !!it.done;
                  return (
                    <div
                      key={it.id}
                      onDragOver={onDragOver(it.id)}
                      onDrop={onDrop(it.id)}
                      className="bg-gray-900/70 rounded-lg p-4 flex flex-col gap-3 border border-gray-800 transition-all hover:border-gray-600"
                    >
                      <div className={`flex items-center gap-2 ${done ? "text-green-400" : ""}`}>
                        <span 
                          draggable
                          onDragStart={onDragStart(it.id)}
                          className="cursor-grab select-none pr-2 text-gray-500 hover:text-white">⋮⋮</span>
                        <input
                          className="flex-1 bg-gray-800 px-3 py-2 rounded border border-transparent focus:border-[#9146FF] focus:outline-none transition-colors"
                          placeholder="Challenge-Name (z. B. Rocket League Wins)"
                          value={it.name}
                          onChange={(e) => updateItem(it.id, { name: e.target.value })}
                        />
                        <label className="flex items-center gap-1 text-sm bg-gray-800 px-2 py-2 rounded cursor-pointer hover:bg-gray-700 transition-colors">
                          <input
                            type="checkbox"
                            checked={!!it.pinned}
                            onChange={(e) => updateItem(it.id, { pinned: e.target.checked })}
                            className="accent-[#9146FF]"
                          />
                          Anpinnen
                        </label>
                        <button
                          onClick={() => removeItem(it.id)}
                          className="bg-red-900/50 hover:bg-red-700 px-3 py-2 rounded text-red-200 transition-colors"
                          title="Löschen"
                        >
                          🗑
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            className="accent-[#9146FF]"
                            checked={!!it.useWins}
                            onChange={(e) => updateItem(it.id, { useWins: e.target.checked })}
                          />
                          Wins zählen
                        </label>

                        {it.useWins ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">Ziel:</span>
                              <input
                                type="number" min={1}
                                className="w-16 bg-gray-800 px-2 py-1 rounded text-sm text-center border border-transparent focus:border-[#9146FF] focus:outline-none"
                                value={it.target || 1}
                                onChange={(e) => updateItem(it.id, { target: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                              />
                            </div>
                            <div className="flex items-center gap-2 ml-auto bg-black/20 p-1 rounded-lg">
                              <span className="text-xs text-gray-400 pl-2">Wins:</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => updateItem(it.id, { progress: Math.max(0, (it.progress || 0) - 1) })} className="bg-gray-700 hover:bg-gray-600 w-6 h-6 flex items-center justify-center rounded transition-colors" title="Win -1">−</button>
                                <span className="w-12 text-center font-mono font-bold">{it.progress || 0}</span>
                                <button onClick={() => updateItem(it.id, { progress: (it.progress || 0) + 1 })} className="bg-gray-700 hover:bg-gray-600 w-6 h-6 flex items-center justify-center rounded transition-colors" title="Win +1">+</button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <label className="flex items-center gap-2 ml-auto cursor-pointer bg-gray-800 px-3 py-1 rounded-lg hover:bg-gray-700 transition-colors">
                            <input
                              type="checkbox"
                              className="accent-green-500 w-4 h-4"
                              checked={!!it.done}
                              onChange={(e) => updateItem(it.id, { done: e.target.checked, progress: e.target.checked ? 1 : 0 })}
                            />
                            <span className={it.done ? "text-green-400 font-medium" : "text-gray-400"}>Erledigt</span>
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="mt-6 pt-4 border-t border-gray-800 flex justify-center">
                  <button
                    onClick={addItem}
                    className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 shadow-lg shadow-purple-900/20 transition-all hover:scale-105"
                  >
                    <span>+</span> Neue Challenge erstellen
                  </button>
                </div>
              </div>
            )}

            {/* TAB: Settings */}
            {activeTab === "settings" && (
              <div className="space-y-6">
                <div className="relative bg-gray-900 rounded-xl p-4 border border-gray-800/80">
                  <span className="absolute -top-3 left-4 text-[10px] uppercase tracking-wide bg-white text-gray-900 px-3 py-0.5 rounded-full shadow">Overlay-Link</span>
                  <div className="mt-2 flex flex-col gap-2">
                    <span className="text-xs text-gray-400">Diesen Link als Browser-Source in OBS einfügen.</span>
                    <div className="flex flex-wrap gap-2 items-center">
                      <input readOnly className="flex-1 bg-gray-800 px-3 py-2 rounded text-sm truncate border border-gray-700 text-gray-300" value={showOverlayUrl ? overlayUrl || "wird generiert…" : overlayUrl ? "•••••••••••••••••••••••" : "wird generiert…"} />
                      <button onClick={() => setShowOverlayUrl((v) => !v)} className="px-3 py-2 rounded text-sm bg-gray-700 hover:bg-gray-600 transition-colors border border-gray-600">{showOverlayUrl ? "Ausblenden" : "Anzeigen"}</button>
                      <button onClick={() => handleCopy(overlayUrl, "overlay")} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${overlayCopied ? "bg-green-600 text-white" : "bg-[#9146FF] hover:bg-[#7d36ff] text-white"}`}>{overlayCopied ? "Kopiert!" : "Kopieren"}</button>
                      <button onClick={regenerateOverlayKey} className="px-3 py-2 rounded text-sm bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-200 transition-colors border border-gray-700" title="Link neu generieren">Neu generieren</button>
                    </div>
                  </div>
                </div>

                <div className="relative bg-gray-900 rounded-xl p-4 border border-gray-800/80">
                  <span className="absolute -top-3 left-4 text-[10px] uppercase tracking-wide bg-white text-gray-900 px-3 py-0.5 rounded-full shadow">Control-Link</span>
                  <div className="mt-2 flex flex-col gap-2">
                    <span className="text-xs text-gray-400">Für Moderatoren (nur Timer/Titel/Challenges).</span>
                    <div className="flex flex-wrap gap-2 items-center">
                      <input readOnly className="flex-1 bg-gray-800 px-3 py-2 rounded text-sm truncate border border-gray-700 text-gray-300" value={showControlUrl ? controlUrl || "wird generiert…" : controlUrl ? "•••••••••••••••••••••••" : "wird generiert…"} />
                      <button onClick={() => setShowControlUrl((v) => !v)} className="px-3 py-2 rounded text-sm bg-gray-700 hover:bg-gray-600 transition-colors border border-gray-600">{showControlUrl ? "Ausblenden" : "Anzeigen"}</button>
                      <button onClick={() => handleCopy(controlUrl, "control")} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${controlCopied ? "bg-green-600 text-white" : "bg-[#9146FF] hover:bg-[#7d36ff] text-white"}`}>{controlCopied ? "Kopiert!" : "Kopieren"}</button>
                      <button onClick={regenerateControlKey} className="px-3 py-2 rounded text-sm bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-200 transition-colors border border-gray-700" title="Link neu generieren">Neu generieren</button>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-gray-800">
                        <label className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2 block">Berechtigungen für Mods</label>
                        <div className="flex flex-col gap-3">
                            <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors">
                                <input type="checkbox" className="w-4 h-4 accent-[#9146FF]" checked={!!doc.controlPermissions?.allowModsTimer} onChange={(e) => save({ ...doc, controlPermissions: { ...doc.controlPermissions, allowModsTimer: e.target.checked } })} /> 
                                <span className="text-sm">Timer steuern (Start/Stop/Reset)</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors">
                                <input type="checkbox" className="w-4 h-4 accent-[#9146FF]" checked={!!doc.controlPermissions?.allowModsTitle} onChange={(e) => save({ ...doc, controlPermissions: { ...doc.controlPermissions, allowModsTitle: e.target.checked } })} /> 
                                <span className="text-sm">Titel ändern</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors">
                                <input type="checkbox" className="w-4 h-4 accent-[#9146FF]" checked={!!doc.controlPermissions?.allowModsChallenges} onChange={(e) => save({ ...doc, controlPermissions: { ...doc.controlPermissions, allowModsChallenges: e.target.checked } })} /> 
                                <span className="text-sm">Challenges bearbeiten (Wins/Erledigt)</span>
                            </label>
                        </div>
                    </div>
                  </div>
                </div>

                <div className="relative bg-gray-900 rounded-xl p-4 border border-red-900/30">
                  <span className="absolute -top-3 left-4 text-[10px] uppercase tracking-wide bg-red-900 text-red-100 px-3 py-0.5 rounded-full shadow">Danger Zone</span>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-gray-400">Setzt alles auf Standard zurück. <br/>Achtung: Dein Overlay-Link wird ungültig!</p>
                    <button onClick={doFullReset} className="bg-red-900/80 hover:bg-red-800 text-white px-4 py-2 rounded text-sm font-semibold border border-red-700 transition-colors">Alles zurücksetzen</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RECHTE SPALTE: PREVIEW + TIMER (Sticky) */}
          <div className="hidden xl:block w-[400px] 2xl:w-[500px] sticky top-6 self-start space-y-4">
            {renderPreview()}
            {renderTimerControls()}
          </div>

        </div>
      )}
    </div>
  );
}