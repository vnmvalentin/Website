// ui/Shell.jsx — Hülle des Spieleabends: schmale Leiste mit Logo, Ton an/aus und dem Weg zurück zur Website.
// Darunter füllt das Zimmer (3D) den ganzen Rest des Fensters. Der Look steht in theme.css.
import React, { useCallback, useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Volume2, VolumeX } from "lucide-react";
import { abonniere, isMuted, setMuted } from "../sound.js";
import "./theme.css";
import "../../Worldflip/ui/theme.css"; // für den Blob-Editor aus Worldflip
import { useFontLink } from "../../../components/shell/useFontLink";
import BackToSite from "../../../components/shell/BackToSite";
import { spieleabendKonto } from "../konto.js";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Rubik:wght@400..900&display=swap";

export default function SaShell() {
  const [muted, setMutedState] = useState(isMuted);
  useFontLink(FONT_HREF);
  // Partien und Siege am Konto (kontoStand.js)
  spieleabendKonto.useAnbindung();
  // auch das Einstellungsmenü im Zimmer schaltet den Ton
  useEffect(() => abonniere(() => setMutedState(isMuted())), []);
  const toggleMute = useCallback(() => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
  }, []);

  return (
    <div className="sa-game">
      <header className="sa-topbar">
        <div className="px-4 h-12 flex items-center gap-3">
          <Link to="/spieleabend" className="sa-logo shrink-0" title="Neues Zimmer">
            <span className="sa-logo-mark" aria-hidden="true"><i /><i /></span>Spieleabend
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={toggleMute} className="sa-icon-btn" title={muted ? "Ton an" : "Ton aus"} aria-label={muted ? "Ton an" : "Ton aus"}>
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <BackToSite className="sa-btn sa-btn-sm sa-btn-ghost" iconSize={15} />
          </div>
        </div>
      </header>
      <main className="flex-1 min-h-0 relative flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
