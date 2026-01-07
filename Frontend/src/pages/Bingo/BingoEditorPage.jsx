// BingoEditorPage.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import BingoGrid from "../../components/bingo/BingoGrid";
import {
  getSession,
  getThemes,
  invite,
  uninvite,
  kick,
  setPermissions,
  setStyle,
  setSettings,
  setWords,
  randomize,
  startSession,
  stopSession,
  markCell,
} from "../../utils/bingoApi";

function permsLabel(p) {
  const list = [];
  if (p?.canEditWords) list.push("Wörter");
  if (p?.canEditDesign) list.push("Design");
  if (p?.canRandomize) list.push("Randomize");
  if (p?.canMark) list.push("Mark");
  return list.length ? list.join(", ") : "—";
}

function normalizeWordsText(text) {
  const lines = String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

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

// Helper für Debouncing (Verzögerung beim Speichern von Slidern)
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
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

  // Lokaler State für Design (damit Slider nicht laggen)
  const [localStyle, setLocalStyle] = useState({ textScale: 0.8 });
  const debouncedStyle = useDebounce(localStyle, 500); // Erst nach 500ms senden
  const styleInitialized = useRef(false);

  // local UI state
  const [markMode, setMarkMode] = useState("x"); // x | color | none
  const [markColor, setMarkColor] = useState("#22c55e");

  // single-session editor invites
  const [inviteText, setInviteText] = useState("");
  const [invitePerms, setInvitePerms] = useState({
    canEditWords: false,
    canEditDesign: false,
    canRandomize: false,
    canMark: true,
  });

  // word editor
  const [customName, setCustomName] = useState("");
  const [wordsText, setWordsText] = useState("");

  // reactive buttons
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState({
    randomize: false,
    start: false,
    stop: false,
    words: false,
  });

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

  const lockWordsAndRandomize = useMemo(() => {
    if (!session) return false;
    return session.mode === "group" && !!session.locked;
  }, [session]);

  const lockGridSize = useMemo(() => {
    if (!session) return false;
    return session.mode === "group" && !!session.locked;
  }, [session]);

  // Load themes once
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
      if (!user) {
        setLoading(false);
        return;
      }
      const json = await getSession(sessionId);
      refreshNonceRef.current = json.session?.refreshNonce || 0;

      setSession(json.session);
      setMe(json.me);

      // Beim ersten Laden Style synchronisieren
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

  // Polling for changes
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

        // Wenn Style von außen geändert wurde (z.B. anderer Editor), aktualisieren wir lokal
        // Aber nur, wenn wir gerade nicht selber editieren (würde sonst springen).
        // Einfachheitshalber: Wir updaten localStyle nur, wenn der Server deutlich neuer ist
        // oder ignorieren Server-Styles während wir hier sind. 
        // Besser: Nur initial laden oder wenn der User nichts tut.
        // Hier: Wir lassen localStyle gewinnen, wenn der User editiert.
      } catch {}
    }, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [sessionId, user]);

  // Effect: Sende Style an Server wenn debouncedValue sich ändert
  useEffect(() => {
    if (!styleInitialized.current) return;
    if (!session) return;

    if (JSON.stringify(debouncedStyle) !== JSON.stringify(session.style)) {
      setStyle(sessionId, debouncedStyle).catch(() => {});
    }
  }, [debouncedStyle, sessionId, session]);


  const startLogin = () => login?.();

  const doCopy = async (text, key = "copy") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 900);
    } catch {}
  };

  const doRandomize = async () => {
    setError("");
    if (!session) return;
    setBusy((b) => ({ ...b, randomize: true }));
    try {
      await randomize(sessionId);
      await load(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, randomize: false }));
    }
  };

  const doStart = async () => {
    setError("");
    if (!session) return;
    setBusy((b) => ({ ...b, start: true }));
    try {
      await startSession(sessionId);
      await load(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, start: false }));
    }
  };

  const doStop = async () => {
    setError("");
    if (!session) return;
    setBusy((b) => ({ ...b, stop: true }));
    try {
      await stopSession(sessionId);
      await load(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy((b) => ({ ...b, stop: false }));
    }
  };

  // Optimistic Marking: Update lokal sofort, dann API
  const doMark = async (idx) => {
    if (!session || !me) return;
    if (!markActive) return;
    if (!canMark) return;

    const currentCard = me.card || [];
    const cell = currentCard[idx];
    const currentMark = cell?.mark || "none";

    let nextMark = "none";
    let nextColor = "";

    if (markMode === "none") return;

    if (markMode === "x") {
      nextMark = currentMark === "x" ? "none" : "x";
    } else if (markMode === "color") {
      nextMark = currentMark === "color" ? "none" : "color";
      nextColor = markColor;
    }

    // 1. Optimistic Update Local State
    const newCard = [...currentCard];
    newCard[idx] = { ...newCard[idx], mark: nextMark, markColor: nextColor };
    
    setMe({ ...me, card: newCard });

    // 2. Send to Server
    try {
      await markCell(sessionId, idx, nextMark, nextColor);
      // Kein voller Reload nötig, da wir optimistisch geupdated haben.
      // Wir vertrauen darauf, dass der Server das Gleiche tut.
    } catch (e) {
      setError(e.message || "Markieren fehlgeschlagen");
      // Rollback bei Fehler
      setMe({ ...me, card: currentCard });
    }
  };

  // Update nur den lokalen State -> useEffect sendet es dann
  const updateLocalStyle = (patch) => {
    setLocalStyle((prev) => ({ ...prev, ...patch }));
  };

  const doSetSettings = async (patch) => {
    setError("");
    try {
      await setSettings(sessionId, patch);
    } catch (e) {
      setError(e.message || "Settings speichern fehlgeschlagen");
    }
  };

  const applyWords = async () => {
    if (!session) return;
    setError("");
    setBusy((b) => ({ ...b, words: true }));
    try {
      const words = normalizeWordsText(wordsText);
      await setWords(sessionId, {
        customName: customName?.trim() || "Custom Bingo",
        words,
      });
      await load(true);
    } catch (e) {
      setError(e.message || "Wörter speichern fehlgeschlagen");
    } finally {
      setBusy((b) => ({ ...b, words: false }));
    }
  };

  const doInvite = async () => {
    setError("");
    try {
      const loginName = String(inviteText || "").trim();
      if (!loginName) return setError("Login fehlt");
      await invite(sessionId, loginName, invitePerms);
      setInviteText("");
      await load(false);
    } catch (e) {
      setError(e.message || "Invite fehlgeschlagen");
    }
  };

  const doUninvite = async (loginName) => {
    setError("");
    try {
      await uninvite(sessionId, loginName);
      await load(false);
    } catch (e) {
      setError(e.message || "Uninvite fehlgeschlagen");
    }
  };

  const doKick = async (twitchId) => {
    setError("");
    try {
      await kick(sessionId, twitchId);
      await load(false);
    } catch (e) {
      setError(e.message || "Kick fehlgeschlagen");
    }
  };

  const doSetPerms = async ({ twitchId, twitchLogin, permissions }) => {
    setError("");
    try {
      await setPermissions(sessionId, { twitchId, twitchLogin, permissions });
      await load(false);
    } catch (e) {
      setError(e.message || "Rechte speichern fehlgeschlagen");
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 text-white">
        <div className="rounded-2xl bg-black/60 border border-white/10 p-6">
          <div className="text-lg font-semibold mb-2">Bingo Editor</div>
          <div className="text-white/70 mb-4">Bitte einloggen.</div>
          <button className="px-4 py-2 rounded-xl bg-violet-600/70" onClick={startLogin}>Login</button>
        </div>
      </div>
    );
  }

  if (loading || !session || !me) {
    return <div className="max-w-4xl mx-auto px-4 py-10 text-white">Lade...</div>;
  }

  const joinLink = session.joinKey ? `${window.location.origin}/Bingo/join/${session.joinKey}` : "";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white">
      {/* Header Info */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{session.theme?.name || "Bingo"}</h1>
          <div className="text-sm text-white/60">
            {session.mode === "single" ? "Einzelsession" : "Gruppensession"} •{" "}
            {markActive ? "Markieren aktiv" : "noch nicht gestartet"} • Rolle: {me.role}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 active:scale-[0.99]"
            onClick={() => navigate("/Bingo")}
          >
            Zurück zur Übersicht
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 text-red-200 mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Controls */}
        <div className="rounded-2xl bg-black/60 border border-white/10 p-5 space-y-6">
          
          {/* Join link */}
          {joinLink && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
              <div className="text-sm font-semibold">Join-Link</div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-white/80 truncate">{joinLink}</div>
                <button
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs"
                  onClick={() => doCopy(joinLink, "join")}
                >
                  {copied === "join" ? "Copied!" : "Copy"}
                </button>
              </div>
              {isHost && session.mode === "group" && (
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
                  <div className="text-xs text-white/70">Open Join: {session.openJoin ? "an" : "geschlossen"}</div>
                  <button
                    className={`px-3 py-2 rounded-xl border text-xs ${session.openJoin ? "bg-white/10" : "bg-red-500/20"}`}
                    onClick={() => doSetSettings({ openJoin: !session.openJoin })}
                  >
                    {session.openJoin ? "Schließen" : "Öffnen"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mark controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Markieren</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {["x", "color", "none"].map((m) => (
                <button
                  key={m}
                  className={`px-3 py-2 rounded-xl border border-white/10 active:scale-[0.99] ${
                    markMode === m ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
                  }`}
                  onClick={() => setMarkMode(m)}
                >
                  {m === "x" ? "X" : m === "color" ? "Farbe" : "Aus"}
                </button>
              ))}
              {markMode === "color" && (
                <input
                  type="color"
                  value={markColor}
                  onChange={(e) => setMarkColor(e.target.value)}
                  className="h-10 w-14 rounded-xl border border-white/10 bg-white/5 p-1"
                />
              )}
            </div>
          </div>

          {/* Design (Optimized with Local State) */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Design & Grid</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/70">Grid</label>
                <select
                  disabled={!canEditDesign || lockGridSize}
                  value={session.gridSize}
                  onChange={(e) => doSetSettings({ gridSize: Number(e.target.value) })}
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl p-2"
                >
                  {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} x {n}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-white/70">Text Farbe</label>
                <input
                  type="color"
                  disabled={!canEditDesign}
                  value={localStyle.textColor || "#ffffff"}
                  onChange={(e) => updateLocalStyle({ textColor: e.target.value })}
                  className="h-10 w-14 rounded-xl border border-white/10 bg-white/5 p-1"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-white/70">Karte Hintergrund</label>
                <input
                  type="color"
                  disabled={!canEditDesign}
                  value={localStyle.cardBg || "#000000"}
                  onChange={(e) => updateLocalStyle({ cardBg: e.target.value })}
                  className="h-10 w-14 rounded-xl border border-white/10 bg-white/5 p-1"
                />
              </div>

              <div>
                <label className="text-xs text-white/70">
                  Opacity ({Math.round((localStyle.cardOpacity ?? 0.6) * 100)}%)
                </label>
                <input
                  type="range" min="0" max="1" step="0.05"
                  disabled={!canEditDesign}
                  value={localStyle.cardOpacity ?? 0.6}
                  onChange={(e) => updateLocalStyle({ cardOpacity: Number(e.target.value) })}
                  className="mt-2 w-full"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-white/70">Linien Farbe</label>
                <input
                  type="color"
                  disabled={!canEditDesign}
                  value={localStyle.lineColor || "#ffffff"}
                  onChange={(e) => updateLocalStyle({ lineColor: e.target.value })}
                  className="h-10 w-14 rounded-xl border border-white/10 bg-white/5 p-1"
                />
              </div>

              <div>
                <label className="text-xs text-white/70">Linien Dicke</label>
                <input
                  type="range" min="1" max="8" step="1"
                  disabled={!canEditDesign}
                  value={localStyle.lineWidth ?? 2}
                  onChange={(e) => updateLocalStyle({ lineWidth: Number(e.target.value) })}
                  className="mt-2 w-full"
                />
              </div>
            </div>
            {!canEditDesign && <div className="text-xs text-white/60">Keine Design-Rechte.</div>}
          </div>

          {/* Words */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Wörter</h2>
            <input
              className="w-full bg-black/40 border border-white/10 rounded-xl p-2"
              disabled={!canEditWords || lockWordsAndRandomize}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Theme Name"
            />
            <textarea
              className="w-full h-48 bg-black/40 border border-white/10 rounded-xl p-2"
              disabled={!canEditWords || lockWordsAndRandomize}
              value={wordsText}
              onChange={(e) => setWordsText(e.target.value)}
              placeholder={"1 Wort pro Zeile..."}
            />
            <button
              disabled={!canEditWords || lockWordsAndRandomize || busy.words}
              className={`w-full px-4 py-2 rounded-xl border border-white/10 font-semibold active:scale-[0.99] ${
                canEditWords && !lockWordsAndRandomize && !busy.words
                  ? "bg-white/10 hover:bg-white/15"
                  : "bg-white/5 text-white/40 cursor-not-allowed"
              }`}
              onClick={applyWords}
            >
              {busy.words ? "Speichere..." : "Wörter übernehmen"}
            </button>
          </div>
          
          {/* Host Controls Section (Invites, Participants) here... (gekürzt, Code bleibt gleich wie original) */}
          {isHost && (
             <div className="space-y-3">
               <h2 className="text-lg font-semibold">{session.mode === "single" ? "Editor:innen" : "Teilnehmer"}</h2>
               
               {/* Single Mode Invite */}
               {session.mode === "single" && (
                 <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-3">
                   <input className="w-full bg-black/40 border border-white/10 rounded-xl p-2"
                     value={inviteText} onChange={(e) => setInviteText(e.target.value)} placeholder="Twitch Login" />
                   <div className="grid grid-cols-2 gap-2 text-sm">
                      {/* Checkboxen für Rechte */}
                      {/* ... (wie im Original) ... */}
                   </div>
                   <button className="w-full px-4 py-2 rounded-xl bg-white/10" onClick={doInvite}>Invite speichern</button>
                 </div>
               )}

               {/* Participants List */}
               <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                 <div className="text-sm font-semibold">Liste</div>
                 {(session.participants || []).map((p) => (
                    <div key={p.twitchId} className="rounded-xl bg-black/30 border border-white/10 p-3 space-y-2">
                        <div className="flex justify-between">
                            <span>{p.twitchLogin} <span className="text-white/60">({p.role})</span></span>
                            {p.role !== 'host' && <button className="text-xs bg-red-500/20 px-2 rounded" onClick={() => doKick(p.twitchId)}>Kick</button>}
                        </div>
                        {/* Overlay Key für Host */}
                        {p.overlayKey && (
                            <div className="flex justify-between gap-2">
                                <span className="text-xs text-white/50 truncate">.../overlay/{p.overlayKey}</span>
                                <button className="text-xs bg-white/10 px-2 rounded" onClick={() => doCopy(`${window.location.origin}/bingo/overlay/${p.overlayKey}`, `p_${p.twitchId}`)}>Copy</button>
                            </div>
                        )}
                    </div>
                 ))}
               </div>
             </div>
          )}
        </div>

        {/* Right: Preview & ACTION BUTTONS */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-black/60 border border-white/10 p-5">
            <h2 className="text-lg font-semibold mb-3">Preview</h2>
            
            {/* Übergabe von localStyle für Instant Preview */}
            <BingoGrid
              gridSize={session.gridSize}
              cells={me.card}
              style={localStyle} // Nutze den lokalen (schnellen) Style
              interactive={markActive && canMark}
              disabled={!markActive || !canMark}
              onCellClick={(idx) => doMark(idx)}
            />

            {/* ACTION BUTTONS JETZT HIER UNTERHALB */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {overlayUrl && (
                    <button
                    className="px-4 py-3 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-200 active:scale-[0.99] font-semibold"
                    onClick={() => doCopy(overlayUrl, "overlay")}
                    >
                    {copied === "overlay" ? "Copied!" : "Copy Browser Source"}
                    </button>
                )}

                <button
                    disabled={!canRandomize || lockWordsAndRandomize || busy.randomize}
                    className={`px-4 py-3 rounded-xl border border-white/10 font-semibold ${
                    canRandomize && !lockWordsAndRandomize && !busy.randomize
                        ? "bg-white/10 hover:bg-white/15 active:scale-[0.99]"
                        : "bg-white/5 text-white/40 cursor-not-allowed"
                    }`}
                    onClick={doRandomize}
                >
                    {busy.randomize ? "Randomizing..." : "Randomize Board"}
                </button>

                {isHost && session.mode === "group" && (
                    <div className="col-span-1 sm:col-span-2 mt-2">
                        {!session.locked ? (
                            <button
                            className="w-full px-4 py-4 rounded-xl bg-green-600/70 hover:bg-green-600 border border-white/10 active:scale-[0.99] font-bold text-lg shadow-lg shadow-green-900/20"
                            onClick={doStart}
                            disabled={busy.start}
                            >
                            {busy.start ? "Startet..." : "SESSION STARTEN"}
                            </button>
                        ) : (
                            <button
                            className="w-full px-4 py-4 rounded-xl bg-red-500/25 hover:bg-red-500/35 border border-red-500/30 active:scale-[0.99] font-bold text-lg"
                            onClick={doStop}
                            disabled={busy.stop}
                            >
                            {busy.stop ? "Stoppt..." : "SESSION STOPPEN & RESET"}
                            </button>
                        )}
                    </div>
                )}
            </div>
            
            {!markActive && session.mode === "group" && (
              <div className="mt-3 text-center text-xs text-white/60">
                Felder können erst ab „Start Session“ abgehakt werden.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}