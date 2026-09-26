// GameShell.jsx — die Hülle aller Seed-Runners-Seiten (außer Übungsbereich und Welten-Werkbank): eigenes Spiel statt
// Website-Seite. Keine Kopf- und Fußzeile der Website, sondern eine schmale Spielleiste (Logo = Hauptmenü, die Bereiche,
// Steuerung, Ton/Effekte, Anmelden, zurück zur Website). Die Farben folgen einem Biom (theme.css) — im Menü je Tag ein anderes, eine
// Seite kann ihr eigenes setzen (useShellBiome), z. B. die Level-Seite das Biom des Levels.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { Gamepad2, ArrowLeftToLine } from "lucide-react";
import FxSettingsButton from "../client/FxSettingsButton.jsx";
import ControlsDialog from "./ControlsDialog.jsx";
import AccountButton from "./AccountButton.jsx";
import { ShellContext, biomeOfDay } from "./shellContext.js";
import "./theme.css";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Bungee&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap";

const NAV = [
  { to: "/seed-runners/daily", label: "Tagesrennen" },
  { to: "/seed-runners/levels", label: "Level" },
  { to: "/seed-runners/sandbox", label: "Sandbox" },
];

export default function GameShell() {
  const [pageBiome, setPageBiome] = useState(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const biome = pageBiome || biomeOfDay();

  // Schriften einmal laden (siehe theme.css, warum nicht per @import)
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  const setBiome = useCallback((b) => setPageBiome(b), []);
  const openControls = useCallback(() => setControlsOpen(true), []);
  const ctx = useMemo(() => ({ biome, setBiome, openControls }), [biome, setBiome, openControls]);

  return (
    <ShellContext.Provider value={ctx}>
      <div className="sr-game flex flex-col" data-biom={biome}>
        <header className="sr-topbar">
          <div className="max-w-[1480px] mx-auto px-4 h-14 flex items-center gap-3 md:gap-6">
            <Link to="/seed-runners" className="sr-logo shrink-0" title="Hauptmenü">SEED <b>RUNNERS</b></Link>
            <nav className="hidden sm:flex items-center gap-1 min-w-0" aria-label="Bereiche">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) => `sr-cond font-semibold uppercase tracking-wider text-[14px] px-2.5 py-1.5 rounded-[2px] transition-colors ${isActive ? "sr-ink bg-white/[0.06]" : "sr-faint hover:text-[var(--sr-ink)]"}`}
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={openControls} className="sr-btn sr-btn-sm sr-btn-ghost" title="Steuerung und Tastenbelegung">
                <Gamepad2 size={15} /><span className="hidden md:inline">Steuerung</span>
              </button>
              <FxSettingsButton />
              <AccountButton />
              <Link to="/fun" className="sr-icon-btn" title="Zurück zur Website" aria-label="Zurück zur Website">
                <ArrowLeftToLine size={17} />
              </Link>
            </div>
          </div>
        </header>
        <main className="flex-1 relative">
          <Outlet />
        </main>
        <ControlsDialog open={controlsOpen} onClose={() => setControlsOpen(false)} />
      </div>
    </ShellContext.Provider>
  );
}
