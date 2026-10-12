// ui/Shell.jsx — Hülle von adVentures: eigenes Spiel statt Website-Seite. Oben eine schmale Steinleiste (Logo, zurück zur
// Website); sobald ein Lauf läuft, verschwindet sie (setImmersive), damit das Spielfeld die ganze Höhe bekommt.
import React, { useEffect, useMemo, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { ArrowLeftToLine } from "lucide-react";
import { ShellContext } from "./shellContext.js";
import "./theme.css";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=Tiny5&display=swap";

export default function AdventureShell() {
  const [immersive, setImmersive] = useState(false);

  // Schrift einmal laden (per <link>, ein @import landet im Build mitten in der CSS)
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  const ctx = useMemo(() => ({ setImmersive }), []);

  return (
    <ShellContext.Provider value={ctx}>
      <div className="av-game h-[100dvh] flex flex-col overflow-hidden">
        {!immersive && (
          <header className="av-topbar shrink-0">
            <div className="max-w-[1400px] mx-auto px-4 h-12 flex items-center gap-3">
              <Link to="/adventures" className="av-logo" title="Hauptmenü">ad<b>V</b>entures</Link>
              <Link to="/fun" className="av-btn av-btn-stone av-btn-sm ml-auto" title="Zurück zur Website" aria-label="Zurück zur Website">
                <ArrowLeftToLine size={15} /><span className="hidden sm:inline">Website</span>
              </Link>
            </div>
          </header>
        )}
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </ShellContext.Provider>
  );
}
