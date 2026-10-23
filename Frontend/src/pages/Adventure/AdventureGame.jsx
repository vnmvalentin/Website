// AdventureGame.jsx — Einstieg von adVentures (/adventures): hält Profil und Ansicht und schaltet zwischen den
// Bildschirmen um. Spiel-Logik liegt in engine/, Zeichnen in render/, Daten in data/, Bildschirme in screens/.

import React, { useCallback, useContext, useEffect, useState } from "react";
import { TwitchAuthContext } from "../../components/TwitchAuthContext";
import SEO from "../../components/SEO";
import { useAdventureShell } from "./ui/shellContext.js";
import { api, guestId, forgetGuest } from "./api.js";
import MainMenu from "./screens/MainMenu.jsx";
import KitSelect from "./screens/KitSelect.jsx";
import Unlocks from "./screens/Unlocks.jsx";
import Codex from "./screens/Codex.jsx";
import RunScreen from "./screens/RunScreen.jsx";
import EndScreen from "./screens/EndScreen.jsx";
import Achievements from "./screens/Achievements.jsx";
import History from "./screens/History.jsx";
import FlatSprite from "./ui/FlatSprite.jsx";
import { HelpDialog, FeedbackDialog, ConfirmDialog } from "./screens/Dialogs.jsx";

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

export default function AdventureGame() {
  const { user, login } = useContext(TwitchAuthContext);
  const { setImmersive } = useAdventureShell();
  const [view, setView] = useState("menu");
  const [profile, setProfile] = useState(null);
  const [kitMode, setKitMode] = useState("normal"); // "daily" = Tageslauf
  const [menuKey, setMenuKey] = useState(0); // neu laden der Bestenliste nach einem Lauf
  const [run, setRun] = useState(null);
  const [result, setResult] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Ohne Login als Gast spielen (ID aus diesem Browser). Nur wenn der Browser nichts speichern darf, bleibt die Anmeldung Pflicht.
  const [canGuest] = useState(() => (user ? true : !!guestId(true)));

  const refresh = useCallback(async () => {
    if (!user && !canGuest) return;
    try {
      // Frisch angemeldet und vorher als Gast gespielt: Fortschritt ins Konto übernehmen, dann die Gast-ID vergessen
      if (user && guestId()) {
        try {
          const c = await api.claimGuest();
          forgetGuest();
          if (c?.merged && c.runs > 0) setNotice(`Dein Gast-Fortschritt (${c.runs} ${c.runs === 1 ? "Lauf" : "Läufe"}) ist jetzt in deinem Konto.`);
        } catch { /* nächster Versuch beim nächsten Laden */ }
      }
      if (!user) guestId(true); // nach einem Logout wieder als Gast
      const p = await api.profile();
      setProfile(p);
      setMenuKey((k) => k + 1);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [user, canGuest]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    setImmersive(view === "run");
    return () => setImmersive(false);
  }, [view, setImmersive]);

  const startRun = async (kitId, difficulty, opts = {}) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.startRun(kitId, difficulty, opts);
      setRun({ runId: r.runId, seed: r.seed, kitId, difficulty: r.difficulty || difficulty, mode: r.mode, skin: r.skin, ascension: r.ascension,
        lockedItems: r.lockedItems, startItems: r.startItems, snapshot: null });
      setView("run");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const resumeRun = async () => {
    setBusy(true);
    try {
      const r = await api.loadRun();
      if (!r.success) { await refresh(); return; }
      setRun({ ...r.run, startItems: 0 });
      setView("run");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const abandonRun = async () => {
    setDialog(null);
    setBusy(true);
    try { await api.abandonRun(); } catch (e) { setError(e.message); }
    await refresh();
    setBusy(false);
  };

  const newRunRequest = (mode = "normal") => {
    setKitMode(mode);
    if (profile?.activeRun) setDialog({ type: "replace" });
    else setView("kits");
  };

  const onFinished = (res) => {
    setResult(res);
    setRun(null);
    setView("end");
    refresh();
  };

  const onQuit = () => {
    setRun(null);
    setView("menu");
    refresh();
  };

  if (!user && !canGuest) {
    return (
      <div className="av-floor relative h-full w-full flex items-center justify-center p-6">
        <SEO title="adVentures" />
        <div className="absolute inset-0 bg-[var(--av-bg)]/80" aria-hidden="true" />
        <div className="relative av-block p-8 md:p-10 max-w-md w-full flex flex-col items-center gap-5 text-center">
          <FlatSprite kind="hero" id="knight" size={84} animate />
          <div>
            <h1 className="av-title text-[40px] mb-2">ad<span className="av-torch">V</span>entures</h1>
            <p className="av-dim">Melde dich mit Twitch an, damit deine Stufe, deine Kits und deine Rekorde gespeichert werden.</p>
          </div>
          <button onClick={() => login(false)} className="av-btn"><TwitchGlyph className="w-4 h-4" /> Mit Twitch anmelden</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full min-h-[400px] overflow-hidden ${view === "run" ? "bg-black" : "av-floor"}`}>
      <SEO title="adVentures" />
      {view !== "run" && <div className="absolute inset-0 bg-[var(--av-bg)]/[0.84] pointer-events-none" aria-hidden="true" />}

      {view === "menu" && (
        <MainMenu
          profile={profile} busy={busy} leaderboardKey={menuKey}
          onNewRun={() => newRunRequest("normal")} onDaily={() => newRunRequest("daily")} onResume={resumeRun} onAbandon={() => setDialog({ type: "abandon" })}
          onUnlocks={() => setView("unlocks")} onCodex={() => setView("codex")}
          onAchievements={() => setView("achievements")} onHistory={() => setView("history")}
          onHelp={() => setDialog({ type: "help" })} onFeedback={() => setDialog({ type: "feedback" })}
          guestNote={!user && (
            <div className="mt-3 av-slot px-4 py-3 flex flex-col gap-2.5">
              <p className="text-[14px] av-dim leading-relaxed">
                Du spielst als Gast: Dein Fortschritt bleibt nur in diesem Browser, und die Bestenliste ist Konten vorbehalten.
                Mit Twitch angemeldet nimmst du alles mit.
              </p>
              <button onClick={() => login(false)} className="av-btn av-btn-stone self-start"><TwitchGlyph className="w-4 h-4" /> Mit Twitch anmelden</button>
            </div>
          )}
        />
      )}
      {notice && view === "menu" && (
        <button type="button" onClick={() => setNotice(null)} className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 av-block px-4 py-2 text-left">{notice}</button>
      )}
      {view === "kits" && <KitSelect profile={profile} mode={kitMode} busy={busy} error={error} onBack={() => { setError(null); setView("menu"); }} onStart={startRun} />}
      {view === "achievements" && <Achievements profile={profile} onBack={() => setView("menu")} />}
      {view === "history" && <History onBack={() => setView("menu")} />}
      {view === "unlocks" && <Unlocks profile={profile} onBack={() => setView("menu")} />}
      {view === "codex" && <Codex profile={profile} onBack={() => setView("menu")} />}
      {view === "run" && run && <RunScreen key={run.runId} run={run} onFinished={onFinished} onQuit={onQuit} />}
      {view === "end" && result && <EndScreen result={result} onAgain={() => { setKitMode(result.mode || "normal"); setView("kits"); }} onMenu={() => setView("menu")} />}

      {error && view === "menu" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 av-block px-4 py-2 av-blood">{error}</div>
      )}

      {dialog?.type === "help" && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog?.type === "feedback" && <FeedbackDialog onClose={() => setDialog(null)} />}
      {dialog?.type === "abandon" && (
        <ConfirmDialog title="Lauf aufgeben?" text="Der gespeicherte Lauf wird gelöscht und nicht gewertet." confirmLabel="Aufgeben" onConfirm={abandonRun} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === "replace" && (
        <ConfirmDialog title="Neuen Lauf starten?" text="Du hast noch einen gespeicherten Lauf. Ein neuer Lauf ersetzt ihn, ohne ihn zu werten."
          confirmLabel="Neuer Lauf" onConfirm={() => { setDialog(null); setView("kits"); }} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
