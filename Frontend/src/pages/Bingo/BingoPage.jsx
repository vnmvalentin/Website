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

  const [mode, setMode] = useState("single");
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [creating, setCreating] = useState(false);

  const [my, setMy] = useState([]);
  const [loadingMy, setLoadingMy] = useState(false);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

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

  // LIMIT CHECK
  const sessionLimitReached = user && my.length >= 3;

  const startCreate = async () => {
    setError("");
    if (!user) { login(); return; }
    if (!selectedThemeId) return;
    if (sessionLimitReached) {
        setError("Limit erreicht (3/3). Bitte lösche alte Sessions unter 'Deine Bingos'.");
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

  const doCopy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopiedKey(key); setTimeout(() => setCopiedKey(""), 900); } catch {}
  };

  const doDelete = async (sessionId) => {
    if (!user) return;
    if (!window.confirm("Wirklich löschen?")) return;
    try { await deleteSession(sessionId); await refreshMy(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 text-white">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Bingo</h1>
        <div className="flex gap-2">
          <button className={`px-4 py-2 rounded-xl border border-white/10 ${tab === "create" ? "bg-white/15" : "bg-white/5"}`} onClick={() => setTab("create")}>Erstellen</button>
          <button className={`px-4 py-2 rounded-xl border border-white/10 ${tab === "my" ? "bg-white/15" : "bg-white/5"}`} onClick={() => setTab("my")}>Deine Bingos ({my.length})</button>
        </div>
      </div>

      {error && <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-red-200 mb-4">{error}</div>}

      {tab === "create" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-black/60 border border-white/10 p-5 space-y-4">
            <h2 className="text-xl font-semibold">1) Session-Typ</h2>
            <div className="grid grid-cols-2 gap-3">
              <button className={`rounded-2xl p-4 border border-white/10 text-left ${mode === "single" ? "bg-white/15" : "bg-white/5"}`} onClick={() => setMode("single")}>
                <div className="font-semibold">Einzelsession</div>
                <div className="text-sm text-white/70">1 Karte, Host = Spieler</div>
              </button>
              <button className={`rounded-2xl p-4 border border-white/10 text-left ${mode === "group" ? "bg-white/15" : "bg-white/5"}`} onClick={() => setMode("group")}>
                <div className="font-semibold">Gruppensession</div>
                <div className="text-sm text-white/70">Mehrere Spieler, Synchroner Start</div>
              </button>
            </div>
            <div>
              <label className="text-sm text-white/70">Join-Link</label>
              <div className="mt-1 flex gap-2">
                <input className="flex-1 bg-black/40 border border-white/10 rounded-xl p-2" value={joinInput} onChange={e => setJoinInput(e.target.value)} placeholder="Link einfügen" />
                <button className="px-4 py-2 rounded-xl bg-white/10 border border-white/10" onClick={join}>Join</button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-black/60 border border-white/10 p-5 space-y-4">
            <h2 className="text-xl font-semibold">2) Theme</h2>
            {loadingThemes ? <div className="text-white/70">Lade...</div> : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {themeOptions.map(t => (
                    <button key={t.id} className={`rounded-2xl p-4 border border-white/10 text-left ${selectedThemeId === t.id ? "bg-white/15" : "bg-white/5"}`} onClick={() => setSelectedThemeId(t.id)}>
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-sm text-white/70">{t.id === "custom" ? "Wörter anpassen" : `${t.wordsCount} Wörter`}</div>
                    </button>
                  ))}
                </div>
                {!user ? (
                  <button onClick={login} className="w-full px-4 py-3 rounded-xl font-semibold bg-[#9146FF] text-white">Login mit Twitch</button>
                ) : (
                  <>
                      {sessionLimitReached && (
                          <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                              Maximale Anzahl an gleichzeitigen Sessions (3/3) erreicht. <br/>
                              Bitte navigiere zu "Deine Bingos" und lösche alte Sessions.
                          </div>
                      )}
                      <button
                        disabled={creating || !selectedThemeId || sessionLimitReached}
                        className={`w-full px-4 py-3 rounded-xl font-semibold border border-white/10 ${!creating && selectedThemeId && !sessionLimitReached ? "bg-violet-600/70 hover:bg-violet-600" : "bg-white/5 text-white/40 cursor-not-allowed"}`}
                        onClick={startCreate}
                      >
                        {creating ? "Erstelle..." : "Session erstellen"}
                      </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "my" && (
        <div className="rounded-2xl bg-black/60 border border-white/10 p-5 space-y-4">
          <div className="flex justify-between">
             <h2 className="text-xl font-semibold">Deine Sessions ({my.length}/3)</h2>
             <button onClick={refreshMy} disabled={loadingMy} className="px-4 py-2 bg-white/10 rounded-xl border border-white/10">Aktualisieren</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {my.map(s => (
              <div key={s.sessionId} className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
                 <div className="flex justify-between">
                    <div>
                        <div className="font-semibold">{s.themeName}</div>
                        <div className="text-xs text-white/60">{s.mode} • {s.role}</div>
                    </div>
                    <div className="flex gap-2">
                        {s.role === "host" && <button className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-xs" onClick={() => doDelete(s.sessionId)}>Löschen</button>}
                        <button className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs" onClick={() => navigate(`/Bingo/${s.sessionId}`)}>Öffnen</button>
                    </div>
                 </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
