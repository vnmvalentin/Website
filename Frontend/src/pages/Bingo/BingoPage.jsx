// src/pages/BingoPage.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
// Context nutzen statt manuellem Fetch
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import { createSession, deleteSession, getMySessions, getThemes } from "../../utils/bingoApi";
import { parseJoinKey } from "../../components/bingo/bingoUtils";

export default function BingoPage() {
  const navigate = useNavigate();
  // Zugriff auf globalen Login
  const { user, login } = useContext(TwitchAuthContext);

  const [tab, setTab] = useState("create"); // create | my
  const [themes, setThemes] = useState([]);
  const [loadingThemes, setLoadingThemes] = useState(true);

  const [mode, setMode] = useState("single"); // single | group
  const [selectedThemeId, setSelectedThemeId] = useState("");

  const [joinInput, setJoinInput] = useState("");
  const [creating, setCreating] = useState(false);

  const [my, setMy] = useState([]);
  const [loadingMy, setLoadingMy] = useState(false);

  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

  const loadThemes = async () => {
    setLoadingThemes(true);
    setError("");
    try {
      const json = await getThemes();
      setThemes(json.themes || []);
      setSelectedThemeId((prev) => prev || (json.themes?.[0]?.id || ""));
    } catch (e) {
      setError(e.message || "Fehler beim Laden der Themes");
    } finally {
      setLoadingThemes(false);
    }
  };

  useEffect(() => {
    loadThemes();
  }, []);

  const refreshMy = async () => {
    if (!user) return;
    setLoadingMy(true);
    setError("");
    try {
      const json = await getMySessions();
      setMy(json.sessions || []);
    } catch (e) {
      setError(e.message || "Fehler beim Laden");
      console.warn(e);
    } finally {
      setLoadingMy(false);
    }
  };

  useEffect(() => {
    if (user) refreshMy();
  }, [user]);

  const themeOptions = useMemo(() => {
    const list = Array.isArray(themes) ? [...themes] : [];
    if (!list.some((t) => t.id === "custom")) {
      list.push({ id: "custom", name: "Custom Theme", wordsCount: 0 });
    }
    return list;
  }, [themes]);

  const canCreate = useMemo(() => {
    if (!user) return false;
    return !!selectedThemeId;
  }, [user, selectedThemeId]);

  const startCreate = async () => {
    setError("");
    if (!user) {
      login(); // Context Login aufrufen
      return;
    }
    if (!selectedThemeId) return;

    setCreating(true);
    try {
      const payload =
        selectedThemeId === "custom"
          ? { mode, themeId: "custom", custom: true }
          : { mode, themeId: selectedThemeId };

      const json = await createSession(payload);
      navigate(`/Bingo/${json.sessionId}`);
    } catch (e) {
      setError(e.message || "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  };

  const join = () => {
    const key = parseJoinKey(joinInput);
    if (!key) return setError("Ungültiger Join-Link");
    navigate(`/Bingo/join/${key}`);
  };

  const doCopy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 900);
    } catch {}
  };

  const doDelete = async (sessionId) => {
    if (!user) return;
    const ok = window.confirm("Session wirklich löschen? (wird aus der JSON entfernt)");
    if (!ok) return;

    setError("");
    try {
      await deleteSession(sessionId);
      await refreshMy();
    } catch (e) {
      setError(e.message || "Löschen fehlgeschlagen");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 text-white">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Bingo</h1>

        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded-xl border border-white/10 ${
              tab === "create" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
            }`}
            onClick={() => setTab("create")}
          >
            Session erstellen
          </button>
          <button
            className={`px-4 py-2 rounded-xl border border-white/10 ${
              tab === "my" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
            }`}
            onClick={() => setTab("my")}
          >
            Deine Bingos
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-red-200 mb-4">
          {error}
        </div>
      )}

      {tab === "create" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Step 1: Mode + Join */}
          <div className="rounded-2xl bg-black/60 border border-white/10 p-5 space-y-4">
            <h2 className="text-xl font-semibold">1) Session-Typ</h2>

            <div className="grid grid-cols-2 gap-3">
              <button
                className={`rounded-2xl p-4 border border-white/10 text-left ${
                  mode === "single" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => setMode("single")}
              >
                <div className="font-semibold">Einzelsession</div>
                <div className="text-sm text-white/70">
                  1 Karte. Host kann Editor:innen hinzufügen.
                </div>
              </button>

              <button
                className={`rounded-2xl p-4 border border-white/10 text-left ${
                  mode === "group" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                }`}
                onClick={() => setMode("group")}
              >
                <div className="font-semibold">Gruppensession</div>
                <div className="text-sm text-white/70">
                  Mehrere Leute, jede Person hat eigene Karte & eigenen Browser-Link.
                </div>
              </button>
            </div>

            <div>
              <label className="text-sm text-white/70">Join-Link</label>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl p-2"
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  placeholder="join_xxx oder kompletter Link"
                />
                <button
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10"
                  onClick={join}
                >
                  Join
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Theme */}
          <div className="rounded-2xl bg-black/60 border border-white/10 p-5 space-y-4">
            <h2 className="text-xl font-semibold">2) Theme auswählen</h2>

            {loadingThemes ? (
              <div className="text-white/70">Lade Themes…</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {themeOptions.map((t) => (
                    <button
                      key={t.id}
                      className={`rounded-2xl p-4 border border-white/10 text-left ${
                        selectedThemeId === t.id ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                      }`}
                      onClick={() => setSelectedThemeId(t.id)}
                    >
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-sm text-white/70">
                        {t.id === "custom" ? "Wörter im Editor anpassen" : `${t.wordsCount} Wörter`}
                      </div>
                    </button>
                  ))}
                </div>

                {!user ? (
                  <button
                    onClick={login}
                    className="w-full px-4 py-3 rounded-xl font-semibold bg-[#9146FF] hover:bg-[#7d36ff] text-white transition shadow-lg"
                  >
                    Login mit Twitch zum Erstellen
                  </button>
                ) : (
                  <button
                    disabled={creating || !selectedThemeId}
                    className={`w-full px-4 py-3 rounded-xl font-semibold border border-white/10 ${
                      !creating && selectedThemeId
                        ? "bg-violet-600/70 hover:bg-violet-600 active:scale-[0.99]"
                        : "bg-white/5 text-white/40 cursor-not-allowed"
                    }`}
                    onClick={startCreate}
                  >
                    {creating ? "Erstelle…" : "Session erstellen"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "my" && (
        <div className="rounded-2xl bg-black/60 border border-white/10 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Deine aktiven Sessions</h2>
            <button
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 active:scale-[0.99]"
              onClick={refreshMy}
              disabled={!user || loadingMy}
            >
              {loadingMy ? "Lade…" : "Aktualisieren"}
            </button>
          </div>

          {!user && (
             <div className="flex flex-col items-center justify-center p-8 bg-white/5 rounded-xl border border-white/5">
                <p className="text-white/70 mb-4">Bitte logge dich ein, um deine Sessions zu sehen.</p>
                <button 
                    onClick={login}
                    className="px-4 py-2 bg-[#9146FF] hover:bg-[#7d36ff] text-white rounded-lg font-bold"
                >
                    Login mit Twitch
                </button>
             </div>
          )}

          {user && my.length === 0 && !loadingMy && (
            <div className="text-white/70">Keine Sessions gefunden.</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {my.map((s) => {
              const overlayLink = s.overlayKey
                ? `${window.location.origin}/bingo/overlay/${s.overlayKey}`
                : "";

              return (
                <div
                  key={s.sessionId}
                  className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{s.themeName}</div>
                      <div className="text-xs text-white/60">
                        {s.mode === "single" ? "Einzelsession" : "Gruppensession"} •{" "}
                        {s.locked ? "gestartet" : "nicht gestartet"} • {s.role}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {s.role === "host" && (
                        <button
                          className="px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-xs active:scale-[0.99]"
                          onClick={() => doDelete(s.sessionId)}
                        >
                          Löschen
                        </button>
                      )}
                      <button
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 active:scale-[0.99]"
                        onClick={() => navigate(`/Bingo/${s.sessionId}`)}
                      >
                        Öffnen
                      </button>
                    </div>
                  </div>

                  {overlayLink && (
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-white/70 truncate">
                        Browser: {overlayLink}
                      </div>
                      <button
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs active:scale-[0.99]"
                        onClick={() => doCopy(overlayLink, s.sessionId)}
                      >
                        {copiedKey === s.sessionId ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}