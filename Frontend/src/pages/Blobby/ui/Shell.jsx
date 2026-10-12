// ui/Shell.jsx — Hülle aller Blobby-Volley-Seiten: eigenes Spiel statt Website-Seite. Statt Kopf- und Fußzeile der Website
// eine schmale Strandleiste (Logo = Hauptmenü, Steuerung & Regeln, zurück zur Website). Der Look steht in theme.css.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { ArrowLeftToLine, Keyboard } from "lucide-react";
import HelpDialog from "./HelpDialog.jsx";
import { ShellContext } from "./shellContext.js";
import "./theme.css";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Lilita+One&family=Rubik:wght@400;500;600;700&display=swap";

export default function BlobbyShell() {
  const [helpOpen, setHelpOpen] = useState(false);

  // Schriften einmal laden (siehe theme.css, warum nicht per @import)
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const ctx = useMemo(() => ({ openHelp }), [openHelp]);

  return (
    <ShellContext.Provider value={ctx}>
      <div className="bv-game flex flex-col">
        <header className="bv-topbar">
          <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center gap-3">
            <Link to="/blobby" className="bv-logo shrink-0" title="Hauptmenü">Blobby <b>Volley</b></Link>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={openHelp} className="bv-btn bv-btn-sm bv-btn-ghost" title="Steuerung und Regeln">
                <Keyboard size={15} /><span className="hidden sm:inline">Steuerung &amp; Regeln</span>
              </button>
              <Link to="/fun" className="bv-icon-btn" title="Zurück zur Website" aria-label="Zurück zur Website">
                <ArrowLeftToLine size={17} />
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1 relative flex flex-col">
          <Outlet />
        </main>
        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    </ShellContext.Provider>
  );
}
