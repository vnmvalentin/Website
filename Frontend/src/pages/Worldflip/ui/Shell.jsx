// ui/Shell.jsx — Hülle aller Worldflip-Seiten: eigenes Spiel statt Website-Seite. Schmale Leiste mit Logo
// (= Hauptmenü), Regeln, Ton an/aus und dem Weg zurück zur Website. Der Look steht in theme.css.
// Die Hülle besitzt die gemerkten Einstellungen (prefs.js), damit Menü, Spiel und Online-Raum denselben Stand sehen.
import React, { useCallback, useMemo, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { BookOpen, Volume2, VolumeX } from "lucide-react";
import RulesDialog from "./RulesDialog.jsx";
import { ShellContext } from "./shellContext.js";
import { isMuted, setMuted } from "../sound.js";
import { loadPrefs, savePrefs } from "../prefs.js";
import "./theme.css";
import { useFontLink } from "../../../components/shell/useFontLink";
import BackToSite from "../../../components/shell/BackToSite";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Rubik:wght@400..900&display=swap";

export default function WfShell() {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [prefs, setPrefs] = useState(loadPrefs);

  // Schrift einmal laden (ein @import landet im Build mitten in der CSS-Datei, wo Browser ihn ignorieren)
  useFontLink(FONT_HREF);

  const updatePrefs = useCallback((patch) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);
  const openRules = useCallback(() => setRulesOpen(true), []);
  const closeRules = useCallback(() => setRulesOpen(false), []);
  const toggleMute = useCallback(() => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
  }, []);
  const ctx = useMemo(() => ({ openRules, prefs, updatePrefs }), [openRules, prefs, updatePrefs]);

  return (
    <ShellContext.Provider value={ctx}>
      <div className="wf-game flex flex-col">
        <header className="wf-topbar">
          <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center gap-3">
            <Link to="/worldflip" className="wf-logo shrink-0" title="Hauptmenü">
              <span className="wf-logo-mark" aria-hidden="true"><i /><i /><i /><i /></span>Worldflip
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={openRules} className="wf-btn wf-btn-sm wf-btn-ghost" title="Regeln">
                <BookOpen size={15} /><span className="hidden sm:inline">Regeln</span>
              </button>
              <button type="button" onClick={toggleMute} className="wf-icon-btn" title={muted ? "Ton an" : "Ton aus"} aria-label={muted ? "Ton an" : "Ton aus"}>
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <BackToSite className="wf-btn wf-btn-sm wf-btn-ghost" iconSize={15} />
            </div>
          </div>
        </header>
        <main className="flex-1 relative flex flex-col">
          <Outlet />
        </main>
        <RulesDialog open={rulesOpen} onClose={closeRules} />
      </div>
    </ShellContext.Provider>
  );
}
