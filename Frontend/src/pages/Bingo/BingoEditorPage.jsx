import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import BingoGrid from "../../components/bingo/BingoGrid";
import {
  getSession,
  getThemes,
  kick,
  setSettings,
  setStyle,
  setWords,
  randomize,
  startSession,
  stopSession,
  markCell,
} from "../../utils/bingoApi";
import { Copy, Users, Palette, Type, Trash2, Link as LinkIcon, Hash } from "lucide-react";

// --- HELPERS ---
function normalizeWordsText(text) {
  const lines = String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const w of lines) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

// Check ob Styles gleich sind
function stylesAreEqual(s1, s2) {
    if (!s1 || !s2) return false;
    return (
        s1.textScale == s2.textScale && 
        s1.cardOpacity == s2.cardOpacity &&
        s1.cardBg === s2.cardBg &&
        s1.textColor === s2.textColor &&
        s1.lineColor === s2.lineColor &&
        s1.lineWidth == s2.lineWidth
    );
}

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function BingoEditorPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(TwitchAuthContext);

  // Layout State
  const [activeTab, setActiveTab] = useState("words");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);

  const refreshNonceRef = useRef(0);
  const themesRef = useRef([]);

  // Style State
  const [localStyle, setLocalStyle] = useState({ 
    textScale: 0.8, cardOpacity: 0.6, cardBg: "#000000",
    textColor: "#ffffff", lineColor: "#ffffff", lineWidth: 2 
  });
  
  const debouncedStyle = useDebounce(localStyle, 500);
  const styleInitialized = useRef(false);

  // Gameplay State
  const [markMode, setMarkMode] = useState("x");
  const [markColor, setMarkColor] = useState("#22c55e");
  
  // Inputs
  const [customName, setCustomName] = useState("");
  const [wordsText, setWordsText] = useState("");

  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState({ randomize: false, start: false, stop: false, words: false, grid: false });

  // Permissions & Roles
  const isHost = useMemo(() => me?.role === "host", [me]);
  const canEditDesign = !!me?.permissions?.canEditDesign;
  const canEditWords = !!me?.permissions?.canEditWords;
  const canRandomize = !!me?.permissions?.canRandomize;
  const canMark = !!me?.permissions?.canMark;

  const overlayUrl = useMemo(() => {
    if (!me?.overlayKey) return "";
    return `${window.location.origin}/bingo/overlay/${me.overlayKey}`;
  }, [me?.overlayKey]);

  const markActive = useMemo(() => {
    if (!session) return false;
    return session.mode === "single" || !!session.locked;
  }, [session]);

  const lockWordsAndRandomize = useMemo(() => session?.mode === "group" && !!session?.locked, [session]);
  const lockGridSize = useMemo(() => session?.mode === "group" && !!session?.locked, [session]);

  // Initial Load
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await getThemes();
        if (!alive) return;
        themesRef.current = json.themes || [];
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const initWordEditorFromSession = (sess) => {
    if (!sess) return;
    const themeId = sess.theme?.id || "";
    const themeName = sess.theme?.name || (themeId === "custom" ? "Custom Bingo" : "Bingo");
    setCustomName(themeName);
    let words = Array.isArray(sess.theme?.words) ? sess.theme.words : null;
    if (!words) {
      const t = (themesRef.current || []).find((x) => String(x.id) === String(themeId));
      words = Array.isArray(t?.words) ? t.words : [];
    }
    setWordsText((words || []).join("\n"));
  };

  const load = async (forceInitWords = false) => {
    setError("");
    try {
      if (!user) { setLoading(false); return; }
      const json = await getSession(sessionId);
      refreshNonceRef.current = json.session?.refreshNonce || 0;
      setSession(json.session);
      setMe(json.me);

      if (!styleInitialized.current && json.session?.style) {
        setLocalStyle(json.session.style);
        styleInitialized.current = true;
      }
      setLoading(false);
      if (forceInitWords) initWordEditorFromSession(json.session);
    } catch (e) {
      setError(e.message || "Fehler");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    load(true);
  }, [sessionId, user]);

  // Polling
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        if (document.hidden) return; 
        
        const json = await getSession(sessionId);
        const nonce = json.session?.refreshNonce || 0;
        if (!alive) return;
        if (nonce === refreshNonceRef.current) return;
        
        refreshNonceRef.current = nonce;
        setSession(json.session);
        setMe(json.me);
        
        if (activeTab !== 'design' && json.session?.style) {
             setLocalStyle(json.session.style);
        }

      } catch {}
    }, 3000); 
    return () => { alive = false; clearInterval(t); };
  }, [sessionId, user, activeTab]);

  // Sync Style
  useEffect(() => {
    if (!styleInitialized.current) return;
    if (!session) return;
    if (activeTab !== "design") return; // WICHTIG: Nur im Design Tab syncen

    if (!stylesAreEqual(debouncedStyle, session.style)) {
      setStyle(sessionId, debouncedStyle).catch(() => {});
    }
  }, [debouncedStyle, sessionId, session, activeTab]);

  // Actions
  const doCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 900);
    } catch {}
  };

  const doKick = async (twitchId) => {
    try { await kick(sessionId, twitchId); await load(false); } catch (e) { setError(e.message); }
  };

  const doRandomize = async () => {
    setBusy(b => ({ ...b, randomize: true }));
    try { await randomize(sessionId); await load(true); } 
    catch (e) { setError(e.message); } finally { setBusy(b => ({ ...b, randomize: false })); }
  };

  const doStart = async () => {
    setBusy(b => ({ ...b, start: true }));
    try { await startSession(sessionId); await load(false); } 
    catch (e) { setError(e.message); } finally { setBusy(b => ({ ...b, start: false })); }
  };

  const doStop = async () => {
    setBusy(b => ({ ...b, stop: true }));
    try { await stopSession(sessionId); await load(false); } 
    catch (e) { setError(e.message); } finally { setBusy(b => ({ ...b, stop: false })); }
  };

  const doMark = async (idx) => {
    if (!session || !me || !markActive || !canMark) return;
    if (markMode === "none") return;
    const currentCard = me.card || [];
    const cell = currentCard[idx];
    
    let nextMark = "none";
    let nextColor = "";
    if (markMode === "x") nextMark = cell?.mark === "x" ? "none" : "x";
    else if (markMode === "color") {
      nextMark = cell?.mark === "color" ? "none" : "color";
      nextColor = markColor;
    }

    const newCard = [...currentCard];
    newCard[idx] = { ...newCard[idx], mark: nextMark, markColor: nextColor };
    setMe({ ...me, card: newCard });

    try { await markCell(sessionId, idx, nextMark, nextColor); }
    catch (e) { setError(e.message); setMe({ ...me, card: currentCard }); }
  };

  const updateLocalStyle = (patch) => setLocalStyle(prev => ({ ...prev, ...patch }));
  const doSetSettings = async (patch) => {
    try { await setSettings(sessionId, patch); } catch (e) { setError(e.message); }
  };

  // Optimistic Grid Change
  const handleGridChange = async (newSize) => {
    if (newSize === session.gridSize) return;
    const oldSize = session.gridSize;
    const oldCard = me.card;
    const tempSession = { ...session, gridSize: newSize };
    setSession(tempSession);

    const newCount = newSize * newSize;
    const tempCard = Array.from({ length: newCount }, (_, i) => 
        (oldCard && oldCard[i]) ? oldCard[i] : { text: "", mark: "none" }
    );
    setMe(prev => ({ ...prev, card: tempCard }));

    setBusy(b => ({ ...b, grid: true }));
    try {
        await setSettings(sessionId, { gridSize: newSize });
        await load(false);
    } catch (e) {
        setError(e.message);
        setSession(prev => ({ ...prev, gridSize: oldSize }));
        setMe(prev => ({ ...prev, card: oldCard }));
    } finally {
        setBusy(b => ({ ...b, grid: false }));
    }
  };

  const applyWords = async () => {
    setBusy(b => ({ ...b, words: true }));
    try {
      const words = normalizeWordsText(wordsText);
      await setWords(sessionId, { customName: customName?.trim() || "Custom Bingo", words });
      await load(true);
    } catch (e) { setError(e.message); } finally { setBusy(b => ({ ...b, words: false })); }
  };

  if (!user) return <div className="p-10 text-white">Bitte einloggen.</div>;
  if (loading || !session || !me) return <div className="p-10 text-white">Lade...</div>;

  const joinLink = session.joinKey ? `${window.location.origin}/Bingo/join/${session.joinKey}` : "";
  const joinCode = session.joinKey || "";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-6 border-b border-white/10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{session.theme?.name || "Bingo"}</h1>
          <div className="flex gap-2 text-sm mt-1 text-white/50">
             <span className="uppercase tracking-wider font-semibold text-white/70">{session.mode}</span>
             <span>•</span>
             <span>{session.locked ? "LÄUFT" : "SETUP"}</span>
          </div>
        </div>
        <div className="flex gap-3">
             {overlayUrl && (
                <button 
                  onClick={() => doCopy(overlayUrl, "overlay")}
                  className="px-4 py-2 bg-violet-600/10 hover:bg-violet-600/20 text-violet-300 border border-violet-500/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Copy size={16} /> {copied === "overlay" ? "Kopiert!" : "Browser Source"}
                </button>
             )}
             <button onClick={() => navigate("/Bingo")} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium">Zurück</button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-200 mb-6">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: TABS & CONTROLS */}
        <div className="xl:col-span-5 flex flex-col h-full min-h-[500px]">
            {/* Tab Headers */}
            <div className="flex p-1 bg-[#121212] border border-white/10 rounded-xl mb-4">
                <button onClick={() => setActiveTab("words")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === "words" ? "bg-white/10 text-white shadow" : "text-white/50 hover:text-white"}`}>
                    <Type size={16} /> Wörter
                </button>
                <button onClick={() => setActiveTab("design")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === "design" ? "bg-white/10 text-white shadow" : "text-white/50 hover:text-white"}`}>
                    <Palette size={16} /> Design
                </button>
                
                {session.mode === "group" && (
                  <button onClick={() => setActiveTab("participants")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${activeTab === "participants" ? "bg-white/10 text-white shadow" : "text-white/50 hover:text-white"}`}>
                      <Users size={16} /> Teilnehmer
                  </button>
                )}
            </div>

            <div className="flex-1 bg-[#121212] border border-white/10 rounded-2xl p-5 relative overflow-hidden">
                
                {/* 1. WORDS TAB */}
                {activeTab === "words" && (
                    <div className="h-full flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                        <div>
                            <label className="text-xs text-white/50 uppercase tracking-wider font-bold mb-1.5 block">Titel</label>
                            <input 
                                value={customName} 
                                onChange={e => setCustomName(e.target.value)} 
                                disabled={!canEditWords || lockWordsAndRandomize}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus:border-white/30 outline-none" 
                                placeholder="Name des Themas"
                            />
                        </div>
                        <div className="flex-1 flex flex-col">
                            <label className="text-xs text-white/50 uppercase tracking-wider font-bold mb-1.5 flex justify-between">
                                <span>Wörterliste (1 pro Zeile)</span>
                                <span>{normalizeWordsText(wordsText).length} Wörter</span>
                            </label>
                            <textarea 
                                className="flex-1 w-full bg-white/5 border border-white/10 rounded-xl p-4 focus:border-white/30 outline-none resize-none text-sm leading-relaxed" 
                                disabled={!canEditWords || lockWordsAndRandomize} 
                                value={wordsText} 
                                onChange={e => setWordsText(e.target.value)}
                                placeholder="Schreibe hier deine Bingo-Begriffe..." 
                            />
                        </div>
                        <button 
                            disabled={!canEditWords || lockWordsAndRandomize || busy.words} 
                            className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" 
                            onClick={applyWords}
                        >
                            {busy.words ? "Speichern..." : "Liste Speichern"}
                        </button>
                        {lockWordsAndRandomize && <div className="text-center text-xs text-white/40">Gesperrt während das Spiel läuft.</div>}
                    </div>
                )}

                {/* 2. DESIGN TAB */}
                {activeTab === "design" && (
                    <div className="h-full overflow-y-auto pr-2 custom-scrollbar animate-in fade-in zoom-in-95 duration-200 space-y-6">
                         
                         {/* Grid Size */}
                         <div>
                             <label className="text-xs text-white/50 uppercase tracking-wider font-bold mb-2 block">Grid Größe</label>
                             <div className="grid grid-cols-3 gap-2">
                                 {[3, 4, 5].map(n => (
                                     <button 
                                        key={n}
                                        disabled={!canEditDesign || lockGridSize || busy.grid}
                                        onClick={() => handleGridChange(n)}
                                        className={`py-2 rounded-xl border font-bold text-sm transition-all ${session.gridSize === n ? "bg-white text-black border-white" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}
                                     >
                                         {n}x{n}
                                     </button>
                                 ))}
                             </div>
                         </div>

                         {/* Colors */}
                         <div className="space-y-4">
                             <label className="text-xs text-white/50 uppercase tracking-wider font-bold block border-b border-white/5 pb-2">Farben</label>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-white/70 block mb-1">Text</label>
                                    <div className="flex items-center gap-2">
                                        <input type="color" disabled={!canEditDesign} value={localStyle.textColor || "#ffffff"} onChange={e => updateLocalStyle({ textColor: e.target.value })} className="h-8 w-8 rounded overflow-hidden border-none bg-transparent cursor-pointer" />
                                        <span className="text-xs text-white/40 font-mono">{localStyle.textColor}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-white/70 block mb-1">Karte</label>
                                    <div className="flex items-center gap-2">
                                        <input type="color" disabled={!canEditDesign} value={localStyle.cardBg || "#000000"} onChange={e => updateLocalStyle({ cardBg: e.target.value })} className="h-8 w-8 rounded overflow-hidden border-none bg-transparent cursor-pointer" />
                                        <span className="text-xs text-white/40 font-mono">{localStyle.cardBg}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-white/70 block mb-1">Linien</label>
                                    <div className="flex items-center gap-2">
                                        <input type="color" disabled={!canEditDesign} value={localStyle.lineColor || "#ffffff"} onChange={e => updateLocalStyle({ lineColor: e.target.value })} className="h-8 w-8 rounded overflow-hidden border-none bg-transparent cursor-pointer" />
                                        <span className="text-xs text-white/40 font-mono">{localStyle.lineColor}</span>
                                    </div>
                                </div>
                             </div>
                         </div>

                         {/* Sliders */}
                         <div className="space-y-4">
                             <label className="text-xs text-white/50 uppercase tracking-wider font-bold block border-b border-white/5 pb-2">Anpassung</label>
                             
                             <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-white/70">Schriftgröße</span>
                                    <span className="text-white/40">{Math.round(localStyle.textScale * 100)}%</span>
                                </div>
                                <input type="range" min="0.7" max="1.8" step="0.1" disabled={!canEditDesign} value={localStyle.textScale ?? 0.8} onChange={e => updateLocalStyle({ textScale: Number(e.target.value) })} className="w-full accent-white" />
                             </div>

                             <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-white/70">Deckkraft (Hintergrund)</span>
                                    <span className="text-white/40">{Math.round(localStyle.cardOpacity * 100)}%</span>
                                </div>
                                <input type="range" min="0" max="1" step="0.05" disabled={!canEditDesign} value={localStyle.cardOpacity ?? 0.6} onChange={e => updateLocalStyle({ cardOpacity: Number(e.target.value) })} className="w-full accent-white" />
                             </div>

                             <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-white/70">Linienstärke</span>
                                    <span className="text-white/40">{localStyle.lineWidth}px</span>
                                </div>
                                <input type="range" min="0" max="10" step="1" disabled={!canEditDesign} value={localStyle.lineWidth ?? 2} onChange={e => updateLocalStyle({ lineWidth: Number(e.target.value) })} className="w-full accent-white" />
                             </div>
                         </div>
                    </div>
                )}

                {/* 3. PARTICIPANTS TAB */}
                {activeTab === "participants" && session.mode === "group" && (
                    <div className="h-full flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                        
                        {/* INVITE AREA (CODE & LINK) */}
                        {isHost && (
                             <div className="space-y-3 bg-white/5 border border-white/10 rounded-xl p-4">
                                <h3 className="text-sm font-bold text-white/80 uppercase tracking-wide">Spieler einladen</h3>
                                
                                {/* Lobby Code */}
                                <div>
                                    <div className="text-xs text-white/50 mb-1">Lobby Code</div>
                                    <div className="flex gap-2">
                                        <div className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono text-center tracking-widest text-lg select-all">
                                            {joinCode}
                                        </div>
                                        <button 
                                            onClick={() => doCopy(joinCode, "code")}
                                            className="px-3 bg-white/10 hover:bg-white/20 rounded-lg border border-white/5 transition-colors"
                                            title="Code kopieren"
                                        >
                                            {copied === "code" ? <CheckIcon /> : <Copy size={18} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Link */}
                                <div>
                                    <div className="text-xs text-white/50 mb-1">Direktlink</div>
                                    <div className="flex gap-2">
                                        <input 
                                            readOnly 
                                            value={joinLink}
                                            className="flex-1 bg-black/20 border border-white/5 rounded-lg px-3 py-2 text-xs text-white/40 truncate select-all" 
                                        />
                                        <button 
                                            onClick={() => doCopy(joinLink, "join")}
                                            className="px-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-colors"
                                            title="Link kopieren"
                                        >
                                            {copied === "join" ? <CheckIcon /> : <LinkIcon size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="text-[10px] text-white/40 text-center pt-1">
                                    Spieler können den Code auf der Startseite eingeben.
                                </div>
                             </div>
                        )}

                        <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                            <h3 className="text-xs font-bold text-white/40 uppercase tracking-wide mt-2">Dabei ({session.participants?.length || 0})</h3>
                            {(session.participants || []).map(p => (
                                <div key={p.twitchId} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${p.role === 'host' ? "bg-violet-500" : "bg-emerald-500"}`} />
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">{p.twitchLogin}</span>
                                            <span className="text-[10px] text-white/40 uppercase tracking-wider">{p.role}</span>
                                        </div>
                                    </div>
                                    {isHost && p.role !== 'host' && (
                                        <button onClick={() => doKick(p.twitchId)} className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* RIGHT COLUMN: PREVIEW */}
        <div className="xl:col-span-7 flex flex-col gap-6">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between p-2 bg-[#121212] border border-white/10 rounded-xl">
                 <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40 uppercase font-bold px-2 hidden sm:block">Werkzeug:</span>
                    <button onClick={() => setMarkMode("none")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${markMode === "none" ? "bg-white text-black" : "text-white/60 hover:bg-white/5"}`}>Maus</button>
                    <button onClick={() => setMarkMode("x")} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${markMode === "x" ? "bg-red-500 text-white shadow-lg shadow-red-500/20" : "text-white/60 hover:bg-white/5"}`}>X</button>
                    <button onClick={() => setMarkMode("color")} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${markMode === "color" ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "text-white/60 hover:bg-white/5"}`}>
                        <span>Farbe</span>
                        {markMode === "color" && <input type="color" value={markColor} onChange={e => setMarkColor(e.target.value)} className="w-4 h-4 rounded overflow-hidden border-none bg-transparent cursor-pointer" />}
                    </button>
                 </div>
                 
                 <button disabled={!canRandomize || lockWordsAndRandomize || busy.randomize} onClick={doRandomize} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 text-white/70">
                    {busy.randomize ? "..." : "Board mischen"}
                 </button>
            </div>

            {/* Grid */}
            <div className="flex flex-col gap-4">
                <div className="w-full bg-[#121212] border border-white/10 rounded-2xl p-4 sm:p-8 flex items-center justify-center shadow-2xl relative min-h-[400px]">
                    <div className="w-full max-w-[600px] aspect-square">
                        <BingoGrid 
                            gridSize={session.gridSize} 
                            cells={me.card} 
                            style={localStyle} 
                            interactive={markActive && canMark} 
                            disabled={!markActive || !canMark} 
                            onCellClick={(idx) => doMark(idx)} 
                        />
                    </div>
                </div>

                {!markActive && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center animate-pulse">
                        <h3 className="font-bold text-white text-lg">Warten auf Host</h3>
                        <p className="text-white/50 text-sm">Die Session wurde noch nicht gestartet. Du kannst noch keine Felder markieren.</p>
                    </div>
                )}
            </div>

            {/* Host Controls */}
            {isHost && session.mode === "group" && (
                <div className="grid grid-cols-1">
                    <button 
                        onClick={session.locked ? doStop : doStart} 
                        disabled={busy.start || busy.stop}
                        className={`w-full py-4 rounded-xl border text-lg font-bold shadow-xl transition-all active:scale-[0.99] ${
                            session.locked 
                            ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-200" 
                            : "bg-emerald-500 text-black hover:bg-emerald-400 border-emerald-400"
                        }`}
                    >
                        {session.locked ? "SESSION STOPPEN (BEARBEITEN)" : "SPIEL STARTEN (SPERREN)"}
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

// Kleines Helper Icon für Success
function CheckIcon() {
    return <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><polyline points="20 6 9 17 4 12"></polyline></svg>
}