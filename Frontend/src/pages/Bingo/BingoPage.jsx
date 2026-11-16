import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { createSession, deleteSession, getMySessions, getThemes } from "../../utils/bingoApi";
import { parseJoinKey } from "./bingoUtils";
import SEO from "../../components/SEO";
import { TwitchLoginButton } from "../../components/ui";
import { useLanguage } from "../../i18n/language";
import { BINGO_TEXTS, bingoErrorText } from "./bingoI18n";

export default function BingoPage() {
  const navigate = useNavigate();
  const { user, login } = useContext(TwitchAuthContext);
  const { lang } = useLanguage({ supported: BINGO_TEXTS.langs });
  const t = BINGO_TEXTS.dict(lang);

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
  // { key } für eigene Meldungen, { err } für Fehler vom Server — erst beim Anzeigen übersetzt, damit ein
  // Sprachwechsel auch die stehende Meldung umstellt
  const [error, setError] = useState(null);

  const loadThemes = async () => {
    setLoadingThemes(true); setError(null);
    try {
      const json = await getThemes();
      setThemes(json.themes || []);
      setSelectedThemeId(prev => prev || (json.themes?.[0]?.id || ""));
    } catch (e) { setError({ err: e }); } finally { setLoadingThemes(false); }
  };

  useEffect(() => { loadThemes(); }, []);

  const refreshMy = async () => {
    if (!user) return;
    setLoadingMy(true); setError(null);
    try {
      const json = await getMySessions();
      setMy(json.sessions || []);
    } catch (e) { setError({ err: e }); } finally { setLoadingMy(false); }
  };

  useEffect(() => { if (user) refreshMy(); }, [user]);

  const themeOptions = useMemo(() => {
    const list = Array.isArray(themes) ? [...themes] : [];
    if (!list.some((th) => th.id === "custom")) list.push({ id: "custom", name: t.customTheme, wordsCount: 0 });
    return list;
  }, [themes, t]);

  const sessionLimitReached = user && my.length >= 3;

  const startCreate = async () => {
    setError(null);
    if (!user) { login(); return; }
    if (!selectedThemeId) return;
    if (sessionLimitReached) {
        setError({ key: "limitError" });
        return;
    }

    setCreating(true);
    try {
      const payload = selectedThemeId === "custom" ? { mode, themeId: "custom", custom: true } : { mode, themeId: selectedThemeId };
      const json = await createSession(payload);
      navigate(`/Bingo/${json.sessionId}`);
    } catch (e) { setError({ err: e }); } finally { setCreating(false); }
  };

  const join = () => {
    const key = parseJoinKey(joinInput);
    if (!key) return setError({ key: "badJoinLink" });
    navigate(`/Bingo/join/${key}`);
  };

  const doDelete = async (sessionId) => {
    if (!user) return;
    if (!window.confirm(t.confirmDelete)) return;
    try { await deleteSession(sessionId); await refreshMy(); } catch (e) { setError({ err: e }); }
  };

  const errorText = error ? (error.key ? t[error.key] : bingoErrorText(error.err, lang)) : "";

  return (
    <div className="page-fade max-w-3xl mx-auto px-4 py-12 text-white">
      <SEO title={t.seoTitle} />
      {/* Header Tabs */}
      <div className="flex flex-col items-center mb-10">
        <h1 className="font-display text-4xl font-bold tracking-tight mb-6">{t.heading}</h1>
        <div className="flex border-b border-white/10">
          <button
            className={`pb-3 px-4 font-medium transition-colors border-b-2 -mb-px ${tab === "create" ? "border-accent text-white" : "border-transparent text-white/50 hover:text-white"}`}
            onClick={() => setTab("create")}
          >
            {t.tabCreate}
          </button>
          <button
            className={`pb-3 px-4 font-medium transition-colors border-b-2 -mb-px ${tab === "my" ? "border-accent text-white" : "border-transparent text-white/50 hover:text-white"}`}
            onClick={() => setTab("my")}
          >
            {t.tabMine(my.length)}
          </button>
        </div>
      </div>

      {errorText && <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-red-200 mb-6 text-center">{errorText}</div>}

      {tab === "create" && (
        <div className="space-y-8">

          {/* STEP 1: MODE */}
          <div className="space-y-4">
             <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-md bg-white/10 border border-line font-bold text-sm">1</span>
                <h2 className="text-xl font-bold">{t.stepMode}</h2>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                    onClick={() => setMode("single")}
                    className={`relative p-5 rounded-lg border text-left transition-colors ${mode === "single" ? "bg-accent/20 border-accent/50 ring-1 ring-accent/30" : "bg-black/30 border-white/10 hover:border-white/20"}`}
                >
                    <div className="font-bold text-lg mb-1">{t.singleTitle}</div>
                    <div className="text-sm text-white/60">{t.singleText}</div>
                </button>

                <button
                    onClick={() => setMode("group")}
                    className={`relative p-5 rounded-lg border text-left transition-colors ${mode === "group" ? "bg-emerald-500/20 border-emerald-500/50 ring-1 ring-emerald-500/30" : "bg-black/30 border-white/10 hover:border-white/20"}`}
                >
                    <div className="font-bold text-lg mb-1">{t.groupTitle}</div>
                    <div className="text-sm text-white/60">{t.groupText}</div>
                </button>
             </div>
          </div>

          <div className="w-full h-px bg-white/5" />

          {/* STEP 2: THEME */}
          <div className="space-y-4">
             <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-md bg-white/10 border border-line font-bold text-sm">2</span>
                <h2 className="text-xl font-bold">{t.stepTheme}</h2>
             </div>

             {loadingThemes ? (
                 <div className="p-8 text-center text-white/40 bg-white/5 rounded-lg">{t.loadingThemes}</div>
             ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {themeOptions.map(th => (
                        <button
                            key={th.id}
                            onClick={() => setSelectedThemeId(th.id)}
                            className={`px-4 py-3 rounded-lg border text-left transition-colors flex justify-between items-center ${selectedThemeId === th.id ? "bg-white/15 border-white/30 text-white" : "bg-black/30 border-white/10 text-white/70 hover:bg-white/5"}`}
                        >
                            <span className="font-medium">{th.id === "custom" ? t.customTheme : th.name}</span>
                            <span className="text-xs bg-black/30 px-2 py-1 rounded text-white/50">
                                {th.id === "custom" ? t.editorBadge : th.wordsCount}
                            </span>
                        </button>
                    ))}
                </div>
             )}
          </div>

          {/* ACTION AREA */}
          <div className="pt-4">
            {!user ? (
                <TwitchLoginButton size="lg" block>{t.loginCta}</TwitchLoginButton>
            ) : (
                <button
                    disabled={creating || !selectedThemeId || sessionLimitReached}
                    onClick={startCreate}
                    className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
                        creating || !selectedThemeId || sessionLimitReached
                        ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                        : "bg-accent hover:bg-accent-hover text-white"
                    }`}
                >
                    {creating ? t.creating : sessionLimitReached ? t.limitShort : t.startSession}
                </button>
            )}
          </div>

          {/* Join Alternative */}
          <div className="pt-8 mt-8 border-t border-white/10">
            <label className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3 block">{t.joinLabel}</label>
            <div className="flex gap-2">
                <input
                    className="flex-1 bg-black/30 border border-white/10 focus:border-white/30 outline-none rounded-lg px-4 py-3 text-white transition-colors"
                    value={joinInput}
                    onChange={e => setJoinInput(e.target.value)}
                    placeholder={t.joinPlaceholder}
                />
                <button
                    onClick={join}
                    className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 font-semibold transition-colors"
                >
                    {t.joinButton}
                </button>
            </div>
          </div>

        </div>
      )}

      {tab === "my" && (
        <div className="space-y-4">
             <div className="flex justify-between items-center px-2">
                 <div className="text-sm text-white/50">{t.slots(my.length)}</div>
                 <button onClick={refreshMy} disabled={loadingMy} className="text-sm text-white/70 hover:text-white underline">{t.refresh}</button>
             </div>

             {my.length === 0 && <div className="text-center py-12 text-white/30 bg-white/5 rounded-lg border border-white/5">{t.noSessions}</div>}

             {my.map(s => (
                  <div key={s.sessionId} className="group relative bg-black/30 border border-white/10 rounded-lg p-5 hover:border-white/20 transition-colors">
                      <div className="flex justify-between items-start">
                          <div>
                              <h3 className="text-lg font-bold text-white mb-1">{s.themeName || t.unknownTheme}</h3>
                              <div className="flex gap-2 text-xs font-mono uppercase tracking-wide text-white/50">
                                  <span className={s.mode === "group" ? "text-emerald-400" : "text-accent-soft"}>{t.modes[s.mode] || s.mode}</span>
                                  <span>•</span>
                                  <span>{t.roles[s.role] || s.role}</span>
                              </div>
                          </div>
                          <div className="flex items-center gap-3">
                              {s.role === "host" && (
                                  <button onClick={() => doDelete(s.sessionId)} className="text-xs text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors">
                                      {t.remove}
                                  </button>
                              )}
                              <button onClick={() => navigate(`/Bingo/${s.sessionId}`)} className="px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-bold text-sm transition-colors">
                                  {t.open}
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
