import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import BingoGrid from "../../components/bingo/BingoGrid";
import {
  getSession,
  getThemes,
  invite,
  kick,
  setSettings,
  setStyle,
  setWords,
  randomize,
  startSession,
  stopSession,
  markCell,
} from "../../utils/bingoApi";

// Helpers
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
  const { user, login } = useContext(TwitchAuthContext);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);

  const refreshNonceRef = useRef(0);
  const themesRef = useRef([]);

  // Local style state for instant preview
  const [localStyle, setLocalStyle] = useState({ 
    textScale: 0.8, 
    cardOpacity: 0.6, 
    cardBg: "#000000",
    textColor: "#ffffff",
    lineColor: "#ffffff",
    lineWidth: 2 
  });
  
  const debouncedStyle = useDebounce(localStyle, 500);
  const styleInitialized = useRef(false);

  const [markMode, setMarkMode] = useState("x");
  const [markColor, setMarkColor] = useState("#22c55e");
  const [inviteText, setInviteText] = useState("");
  
  const [customName, setCustomName] = useState("");
  const [wordsText, setWordsText] = useState("");

  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState({ randomize: false, start: false, stop: false, words: false });

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

  // Initial Load Theme Data
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user]);

  // Polling
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const json = await getSession(sessionId);
        const nonce = json.session?.refreshNonce || 0;
        if (!alive) return;
        if (nonce === refreshNonceRef.current) return;
        refreshNonceRef.current = nonce;
        setSession(json.session);
        setMe(json.me);
      } catch {}
    }, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [sessionId, user]);

  // Sync Style
  useEffect(() => {
    if (!styleInitialized.current) return;
    if (!session) return;
    if (JSON.stringify(debouncedStyle) !== JSON.stringify(session.style)) {
      setStyle(sessionId, debouncedStyle).catch(() => {});
    }
  }, [debouncedStyle, sessionId, session]);

  // Actions
  const doCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 900);
    } catch {}
  };

  const doKick = async (twitchId) => {
    setError("");
    try { await kick(sessionId, twitchId); await load(false); } catch (e) { setError(e.message); }
  };

  const doRandomize = async () => {
    setError(""); setBusy(b => ({ ...b, randomize: true }));
    try { await randomize(sessionId); await load(true); } 
    catch (e) { setError(e.message); } finally { setBusy(b => ({ ...b, randomize: false })); }
  };

  const doStart = async () => {
    setError(""); setBusy(b => ({ ...b, start: true }));
    try { await startSession(sessionId); await load(false); } 
    catch (e) { setError(e.message); } finally { setBusy(b => ({ ...b, start: false })); }
  };

  const doStop = async () => {
    setError(""); setBusy(b => ({ ...b, stop: true }));
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
  const applyWords = async () => {
    setError(""); setBusy(b => ({ ...b, words: true }));
    try {
      const words = normalizeWordsText(wordsText);
      await setWords(sessionId, { customName: customName?.trim() || "Custom Bingo", words });
      await load(true);
    } catch (e) { setError(e.message); } finally { setBusy(b => ({ ...b, words: false })); }
  };
  const doInvite = async () => {
    try {
      const loginName = String(inviteText || "").trim();
      if (!loginName) return setError("Login fehlt");
      await invite(sessionId, loginName, {});
      setInviteText(""); await load(false);
    } catch (e) { setError(e.message); }
  };

  if (!user) return <div className="p-10 text-white">Bitte einloggen.</div>;
  if (loading || !session || !me) return <div className="p-10 text-white">Lade...</div>;

  const joinLink = session.joinKey ? `${window.location.origin}/Bingo/join/${session.joinKey}` : "";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{session.theme?.name || "Bingo"}</h1>
          <div className="text-sm text-white/60">
            {session.mode === "single" ? "Einzelsession" : "Gruppensession"} • {markActive ? "Markieren aktiv" : "Warten auf Start"} • Rolle: {me.role}
          </div>
        </div>
        <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10" onClick={() => navigate("/Bingo")}>Zurück</button>
      </div>

      {error && <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-red-200 mb-6">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* LEFT: Controls */}
        <div className="rounded-2xl bg-black/60 border border-white/10 p-5 space-y-6 h-fit">
          
          {/* Join Info */}
          {joinLink && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
              <div className="text-sm font-semibold">Join-Link</div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-white/80 truncate">{joinLink}</div>
                <button className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs" onClick={() => doCopy(joinLink, "join")}>
                  {copied === "join" ? "Copied!" : "Copy"}
                </button>
              </div>
              {isHost && session.mode === "group" && (
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
                  <div className="text-xs text-white/70">Open Join: {session.openJoin ? "an" : "geschlossen"}</div>
                  <button className={`px-3 py-2 rounded-xl border text-xs ${session.openJoin ? "bg-white/10" : "bg-red-500/20"}`} onClick={() => doSetSettings({ openJoin: !session.openJoin })}>
                    {session.openJoin ? "Schließen" : "Öffnen"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mark Controls */}
          <div className="space-y-3">
             <h2 className="text-lg font-semibold">Markier-Werkzeug</h2>
             <div className="flex flex-wrap gap-2">
                {["x", "color", "none"].map(m => (
                   <button key={m} onClick={() => setMarkMode(m)} className={`px-3 py-2 rounded-xl border border-white/10 ${markMode === m ? "bg-white/15" : "bg-white/5"}`}>
                      {m === "x" ? "X" : m === "color" ? "Farbe" : "Maus aus"}
                   </button>
                ))}
                {markMode === "color" && <input type="color" value={markColor} onChange={e => setMarkColor(e.target.value)} className="h-10 w-14 rounded-xl border border-white/10 bg-white/5 p-1" />}
             </div>
          </div>

          {/* Design Controls */}
          <div className="space-y-4">
             <h2 className="text-lg font-semibold">Design & Grid</h2>
             <div className="grid grid-cols-2 gap-4">
                
                {/* Grid Size */}
                <div className="col-span-2">
                  <label className="text-xs text-white/70 block mb-1">Grid Größe</label>
                  <select disabled={!canEditDesign || lockGridSize} value={session.gridSize} onChange={e => doSetSettings({ gridSize: Number(e.target.value) })} className="w-full bg-black/40 border border-white/10 rounded-xl p-2">
                     {[3,4,5,6].map(n => <option key={n} value={n}>{n}x{n}</option>)}
                  </select>
                </div>

                {/* Text Color */}
                <div>
                   <label className="text-xs text-white/70 block mb-1">Text Farbe</label>
                   <input type="color" disabled={!canEditDesign} value={localStyle.textColor || "#ffffff"} onChange={e => updateLocalStyle({ textColor: e.target.value })} className="block w-full h-8 rounded border border-white/10 bg-white/5" />
                </div>

                {/* Card Background */}
                <div>
                   <label className="text-xs text-white/70 block mb-1">Card Farbe</label>
                   <input type="color" disabled={!canEditDesign} value={localStyle.cardBg || "#000000"} onChange={e => updateLocalStyle({ cardBg: e.target.value })} className="block w-full h-8 rounded border border-white/10 bg-white/5" />
                </div>

                {/* Line Color - WIEDER DA */}
                <div>
                   <label className="text-xs text-white/70 block mb-1">Linien Farbe</label>
                   <input type="color" disabled={!canEditDesign} value={localStyle.lineColor || "#ffffff"} onChange={e => updateLocalStyle({ lineColor: e.target.value })} className="block w-full h-8 rounded border border-white/10 bg-white/5" />
                </div>

                {/* Text Scale - WIEDER DA */}
                <div>
                  <label className="text-xs text-white/70 block mb-1">Schriftgröße</label>
                  <input type="range" min="0.7" max="1.8" step="0.1" disabled={!canEditDesign} value={localStyle.textScale ?? 0.8} onChange={e => updateLocalStyle({ textScale: Number(e.target.value) })} className="w-full h-8" />
                </div>

                {/* Opacity - WIEDER DA */}
                <div className="col-span-2">
                  <label className="text-xs text-white/70 flex justify-between mb-1">
                     <span>Hintergrund Opacity</span>
                     <span>{Math.round((localStyle.cardOpacity ?? 0.6) * 100)}%</span>
                  </label>
                  <input type="range" min="0" max="1" step="0.05" disabled={!canEditDesign} value={localStyle.cardOpacity ?? 0.6} onChange={e => updateLocalStyle({ cardOpacity: Number(e.target.value) })} className="w-full" />
                </div>

                {/* Line Width */}
                <div className="col-span-2">
                   <label className="text-xs text-white/70 block mb-1">Linien Dicke</label>
                   <input type="range" min="1" max="8" disabled={!canEditDesign} value={localStyle.lineWidth ?? 2} onChange={e => updateLocalStyle({ lineWidth: Number(e.target.value) })} className="w-full" />
                </div>

             </div>
             {!canEditDesign && <div className="text-xs text-white/50 italic">Nur Hosts/Designer können das Layout ändern.</div>}
          </div>

          {/* Words */}
          <div className="space-y-3">
             <h2 className="text-lg font-semibold">Wörter</h2>
             <textarea className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-2" disabled={!canEditWords || lockWordsAndRandomize} value={wordsText} onChange={e => setWordsText(e.target.value)} />
             <button disabled={!canEditWords || lockWordsAndRandomize || busy.words} className="w-full px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10" onClick={applyWords}>
                {busy.words ? "..." : "Speichern"}
             </button>
          </div>

          {/* HOST LIST */}
          {isHost && (
             <div className="space-y-3 pt-4 border-t border-white/10">
               <h2 className="text-lg font-semibold">Teilnehmer</h2>
               {session.mode === "single" && (
                 <div className="flex gap-2">
                   <input className="flex-1 bg-black/40 border border-white/10 rounded-xl p-2" value={inviteText} onChange={e => setInviteText(e.target.value)} placeholder="Twitch Name" />
                   <button className="px-4 py-2 bg-white/10 rounded-xl border border-white/10" onClick={doInvite}>Add</button>
                 </div>
               )}
               <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                 {(session.participants || []).map(p => (
                    <div key={p.twitchId} className="flex flex-col gap-2 rounded-xl bg-white/5 border border-white/10 p-3">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold">{p.twitchLogin}</span>
                            {p.role !== 'host' && (
                                <button className="text-xs bg-red-500/20 hover:bg-red-500/30 px-2 py-1 rounded border border-red-500/30" 
                                        onClick={(e) => { e.stopPropagation(); doKick(p.twitchId); }}>
                                    Kick
                                </button>
                            )}
                        </div>
                        {p.overlayKey && (
                            <div className="flex justify-between items-center bg-black/20 rounded p-1">
                                <span className="text-xs text-white/40 truncate w-32">Overlay...</span>
                                <button className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded" 
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            doCopy(`${window.location.origin}/bingo/overlay/${p.overlayKey}`, `p_${p.twitchId}`); 
                                        }}>
                                    {copied === `p_${p.twitchId}` ? "Copied" : "Copy"}
                                </button>
                            </div>
                        )}
                    </div>
                 ))}
               </div>
             </div>
          )}
        </div>

        {/* RIGHT: Preview */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-black/60 border border-white/10 p-2 overflow-hidden">
             <div className="w-full">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {overlayUrl && (
                    <button className="px-4 py-3 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-200 font-semibold" onClick={() => doCopy(overlayUrl, "overlay")}>
                      {copied === "overlay" ? "Copied!" : "Copy Browser Source"}
                    </button>
                )}
                <button disabled={!canRandomize || lockWordsAndRandomize || busy.randomize} className="px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 font-semibold" onClick={doRandomize}>
                    {busy.randomize ? "..." : "Randomize Board"}
                </button>
                {isHost && session.mode === "group" && (
                    <button 
                        className={`col-span-1 sm:col-span-2 px-4 py-4 rounded-xl border active:scale-[0.99] font-bold text-lg shadow-lg ${session.locked ? "bg-red-500/25 border-red-500/30 hover:bg-red-500/35" : "bg-green-600/70 border-white/10 hover:bg-green-600"}`} 
                        onClick={session.locked ? doStop : doStart} 
                        disabled={busy.start || busy.stop}>
                      {session.locked ? "STOP SESSION" : "START SESSION"}
                    </button>
                )}
          </div>
        </div>
      </div>
    </div>
  );
}