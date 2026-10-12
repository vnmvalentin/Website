// ui/Shell.jsx — Hülle aller Flick-Soccer-Seiten: eigenes Spiel statt Website-Seite. Schmale Leiste mit Logo
// (= Hauptmenü), Profil, Regeln, Ton an/aus und dem Weg zurück zur Website. Der Look steht in theme.css.
// Die Hülle besitzt die gemerkten Einstellungen (prefs.js), damit Menü, Profil-Fenster und Online-Raum denselben
// Stand sehen.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { ArrowLeftToLine, BookOpen, UserRound, Volume2, VolumeX } from "lucide-react";
import RulesDialog from "./RulesDialog.jsx";
import ProfileDialog from "./ProfileDialog.jsx";
import { ShellContext } from "./shellContext.js";
import { isMuted, setMuted } from "../sound.js";
import { loadPrefs, savePrefs } from "../prefs.js";
import "./theme.css";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&display=swap";

export default function FlickShell() {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [prefs, setPrefs] = useState(loadPrefs);

  // Schriften einmal laden (ein @import landet im Build mitten in der CSS-Datei, wo Browser ihn ignorieren)
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  const updatePrefs = useCallback((patch) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);
  const openRules = useCallback(() => setRulesOpen(true), []);
  const openProfile = useCallback(() => setProfileOpen(true), []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const toggleMute = useCallback(() => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
  }, []);
  const ctx = useMemo(
    () => ({ openRules, openProfile, prefs, updatePrefs, muted, toggleMute }),
    [openRules, openProfile, prefs, updatePrefs, muted, toggleMute],
  );

  return (
    <ShellContext.Provider value={ctx}>
      <div className="fk-game flex flex-col">
        <header className="fk-topbar">
          <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center gap-3">
            <Link to="/flick-soccer" className="fk-logo shrink-0" title="Hauptmenü"><span className="fk-logo-mark" aria-hidden="true" />Flick Soccer</Link>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={openProfile} className="fk-btn fk-btn-sm fk-btn-ghost" title="Profil: Name, Design, Statistik">
                <UserRound size={15} /><span className="hidden sm:inline">Profil</span>
              </button>
              <button type="button" onClick={openRules} className="fk-btn fk-btn-sm fk-btn-ghost" title="Regeln">
                <BookOpen size={15} /><span className="hidden sm:inline">Regeln</span>
              </button>
              <button type="button" onClick={toggleMute} className="fk-icon-btn" title={muted ? "Ton an" : "Ton aus"} aria-label={muted ? "Ton an" : "Ton aus"}>
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <Link to="/fun" className="fk-icon-btn" title="Zurück zur Website" aria-label="Zurück zur Website">
                <ArrowLeftToLine size={17} />
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1 relative flex flex-col">
          <Outlet />
        </main>
        <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
        {profileOpen && <ProfileDialog onClose={closeProfile} prefs={prefs} updatePrefs={updatePrefs} />}
      </div>
    </ShellContext.Provider>
  );
}
