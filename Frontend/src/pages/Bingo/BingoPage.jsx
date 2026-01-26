import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { createSession, deleteSession, getMySessions, getThemes } from "../../utils/bingoApi";
import { parseJoinKey } from "../../components/bingo/bingoUtils";

export default function BingoPage() {
  const navigate = useNavigate();
  const { user, login } = useContext(TwitchAuthContext);

  const [tab, setTab] = useState("create");
  const [themes, setThemes] = useState([]);
  const [loadingThemes, setLoadingThemes] = useState(true);

  // Setup States
  const [mode, setMode] = useState("single");
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [creating, setCreating] = useState(false);

  // My Sessions States
  const [my, setMy] = useState([]);
  const [loadingMy, setLoadingMy] = useState(false);
  const [error, setError] = useState("");

  const loadThemes = async () => {
    setLoadingThemes(true); setError("");
    try {
      const json = await getThemes();
      setThemes(json.themes || []);
      setSelectedThemeId(prev => prev || (json.themes?.[0]?.id || ""));
    } catch (e) { setError(e.message); } finally { setLoadingThemes(false); }
  };

  useEffect(() => { loadThemes(); }, []);

  const refreshMy = async () => {
    if (!user) return;
    setLoadingMy(true); setError("");
    try {
      const json = await getMySessions();
      setMy(json.sessions || []);
    } catch (e) { setError(e.message); } finally { setLoadingMy(false); }
  };

  useEffect(() => { if (user) refreshMy(); }, [user]);

  const themeOptions = useMemo(() => {
    const list = Array.isArray(themes) ? [...themes] : [];
    if (!list.some((t) => t.id === "custom")) list.push({ id: "custom", name: "Custom Theme", wordsCount: 0 });
    return list;
  }, [themes]);

  const sessionLimitReached = user && my.length >= 3;

  const startCreate = async () => {
    setError("");
    if (!user) { login(); return; }
    if (!selectedThemeId) return;
    if (sessionLimitReached) {
        setError("Limit erreicht (3/3). Bitte lösche alte Sessions.");
        return;
    }

    setCreating(true);
    try {
      const payload = selectedThemeId === "custom" ? { mode, themeId: "custom", custom: true } : { mode, themeId: selectedThemeId };
      const json = await createSession(payload);
      navigate(`/Bingo/${json.sessionId}`);
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  };

  const join = () => {
    const key = parseJoinKey(joinInput);
    if (!key) return setError("Ungültiger Join-Link");
    navigate(`/Bingo/join/${key}`);
  };

  const doDelete = async (sessionId) => {
    if (!user) return;
    if (!window.confirm("Wirklich löschen?")) return;
    try { await deleteSession(sessionId); await refreshMy(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-white">
      {/* Header Tabs */}
      <div className="flex flex-col items-center mb-10">
        <h1 className="text-4xl font-black tracking-tight mb-6">BINGO</h1>
        <div className="flex p-1 bg-white/5 rounded-2xl border border-white/10">
          <button 
            className={`px-6 py-2 rounded-xl font-medium transition-all ${tab === "create" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white"}`} 
            onClick={() => setTab("create")}
          >
            Neue Session
          </button>
          <button 
            className={`px-6 py-2 rounded-xl font-medium transition-all ${tab === "my" ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white"}`} 
            onClick={() => setTab("my")}
          >
            Deine Bingos ({my.length})
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-red-200 mb-6 text-center">{error}</div>}

      {tab === "create" && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* STEP 1: MODE */}
          <div className="space-y-4">
             <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/10 font-bold text-sm">1</span>
                <h2 className="text-xl font-bold">Session Typ wählen</h2>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                    onClick={() => setMode("single")}
                    className={`relative p-5 rounded-2xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${mode === "single" ? "bg-violet-500/20 border-violet-500/50 ring-1 ring-violet-500/30" : "bg-[#18181b] border-white/10 hover:border-white/20"}`}
                >
                    <div className="font-bold text-lg mb-1">Singleplayer</div>
                    <div className="text-sm text-white/60">Du spielst alleine. Perfekt für Content Creation oder Just Chatting.</div>
                </button>

                <button 
                    onClick={() => setMode("group")}
                    className={`relative p-5 rounded-2xl border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${mode === "group" ? "bg-emerald-500/20 border-emerald-500/50 ring-1 ring-emerald-500/30" : "bg-[#18181b] border-white/10 hover:border-white/20"}`}
                >
                    <div className="font-bold text-lg mb-1">Multiplayer</div>
                    <div className="text-sm text-white/60">Spiele live gegen Freunde oder Viewer. Synchronisierter Start.</div>
                </button>
             </div>
          </div>

          <div className="w-full h-px bg-white/5" />

          {/* STEP 2: THEME */}
          <div className="space-y-4">
             <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/10 font-bold text-sm">2</span>
                <h2 className="text-xl font-bold">Thema wählen</h2>
             </div>

             {loadingThemes ? (
                 <div className="p-8 text-center text-white/40 bg-white/5 rounded-2xl animate-pulse">Lade Themes...</div>
             ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {themeOptions.map(t => (
                        <button 
                            key={t.id} 
                            onClick={() => setSelectedThemeId(t.id)}
                            className={`px-4 py-3 rounded-xl border text-left transition-colors flex justify-between items-center ${selectedThemeId === t.id ? "bg-white/15 border-white/30 text-white" : "bg-[#18181b] border-white/10 text-white/70 hover:bg-white/5"}`}
                        >
                            <span className="font-medium">{t.name}</span>
                            <span className="text-xs bg-black/30 px-2 py-1 rounded text-white/50">
                                {t.id === "custom" ? "Editor" : t.wordsCount}
                            </span>
                        </button>
                    ))}
                </div>
             )}
          </div>

          {/* ACTION AREA */}
          <div className="pt-4">
            {!user ? (
                <button onClick={login} className="w-full py-4 rounded-2xl font-bold text-lg bg-[#9146FF] hover:bg-[#772ce8] transition-colors text-white shadow-lg shadow-purple-900/20">
                    Login mit Twitch zum Erstellen
                </button>
            ) : (
                <button
                    disabled={creating || !selectedThemeId || sessionLimitReached}
                    onClick={startCreate}
                    className={`w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-lg ${
                        creating || !selectedThemeId || sessionLimitReached 
                        ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5" 
                        : "bg-white text-black hover:bg-gray-200 border border-white"
                    }`}
                >
                    {creating ? "Erstelle Lobby..." : sessionLimitReached ? "Limit erreicht" : "Session starten"}
                </button>
            )}
          </div>

          {/* Join Alternative */}
          <div className="pt-8 mt-8 border-t border-white/10">
            <label className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3 block">Oder einer Lobby beitreten</label>
            <div className="flex gap-2">
                <input 
                    className="flex-1 bg-[#18181b] border border-white/10 focus:border-white/30 outline-none rounded-xl px-4 py-3 text-white transition-colors" 
                    value={joinInput} 
                    onChange={e => setJoinInput(e.target.value)} 
                    placeholder="Bingo Link einfügen..." 
                />
                <button 
                    onClick={join}
                    className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 font-semibold"
                >
                    Join
                </button>
            </div>
          </div>

        </div>
      )}

      {tab === "my" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <div className="flex justify-between items-center px-2">
                 <div className="text-sm text-white/50">Slots belegt: {my.length} / 3</div>
                 <button onClick={refreshMy} disabled={loadingMy} className="text-sm text-white/70 hover:text-white underline">Refresh</button>
             </div>
             
             {my.length === 0 && <div className="text-center py-12 text-white/30 bg-white/5 rounded-2xl border border-white/5">Keine aktiven Sessions.</div>}

             {my.map(s => (
                  <div key={s.sessionId} className="group relative bg-[#18181b] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-colors">
                      <div className="flex justify-between items-start">
                          <div>
                              <h3 className="text-lg font-bold text-white mb-1">{s.themeName || "Unbekanntes Thema"}</h3>
                              <div className="flex gap-2 text-xs font-mono uppercase tracking-wide text-white/50">
                                  <span className={s.mode === "group" ? "text-emerald-400" : "text-violet-400"}>{s.mode}</span>
                                  <span>•</span>
                                  <span>{s.role}</span>
                              </div>
                          </div>
                          <div className="flex items-center gap-3">
                              {s.role === "host" && (
                                  <button onClick={() => doDelete(s.sessionId)} className="text-xs text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors">
                                      Löschen
                                  </button>
                              )}
                              <button onClick={() => navigate(`/Bingo/${s.sessionId}`)} className="px-5 py-2 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors">
                                  Öffnen
                              </button>
                          </div>
                      </div>
                  </div>
             ))}
        </div>
      )}
    </div>
  );
}