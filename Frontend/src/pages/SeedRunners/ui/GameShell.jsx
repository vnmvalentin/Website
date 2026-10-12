// GameShell.jsx — die Hülle aller Seed-Runners-Seiten (außer Übungsbereich und Welten-Werkbank): eigenes Spiel statt
// Website-Seite. Keine Kopf- und Fußzeile der Website, sondern eine schmale Spielleiste (Logo = Hauptmenü, die Bereiche,
// Steuerung, Ton/Effekte, Anmelden, zurück zur Website). Die Farben folgen einem Biom (theme.css) — im Menü je Tag ein anderes, eine
// Seite kann ihr eigenes setzen (useShellBiome), z. B. die Level-Seite das Biom des Levels.
//
// Zurück-Knopf (27.09.2026): auf jeder Seite außer dem Hauptmenü, links neben dem Logo. Er führt zur übergeordneten Seite
// (zurueckZiel), nicht durch den Browser-Verlauf — wer über einen geteilten Link kommt, landet sonst außerhalb des Spiels.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Gamepad2, ArrowLeftToLine, ArrowLeft } from "lucide-react";
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

const BASIS = "/seed-runners";

/** Übergeordnete Seite zu einem Pfad unter /seed-runners — null im Hauptmenü */
function zurueckZiel(pathname) {
  const rest = pathname.replace(/\/+$/, "").slice(BASIS.length).split("/").filter(Boolean);
  if (!rest.length) return null;
  const [bereich, unter] = rest;
  if (bereich === "daily" && unter) return `${BASIS}/verlauf?tab=archiv`;       // ein Archiv-Tag
  if (bereich === "levels" && unter) return `${BASIS}/levels`;                  // Level-Seite, Ersteller-Profil
  if (bereich === "editor") return `${BASIS}/sandbox`;
  return BASIS;                                                                  // Tagesrennen, Verlauf, Bibliothek, Sandbox, Raum
}

export default function GameShell() {
  const { pathname } = useLocation();
  const zurueck = zurueckZiel(pathname);
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
          <div className="max-w-[1480px] mx-auto px-4 h-14 flex items-center gap-3 lg:gap-6">
            {zurueck && (
              <Link to={zurueck} className="sr-btn sr-btn-sm sr-btn-ghost shrink-0 -mr-1 lg:-mr-3" title="Zurück" aria-label="Zurück">
                <ArrowLeft size={15} /><span className="hidden lg:inline">Zurück</span>
              </Link>
            )}
            <Link to="/seed-runners" className="sr-logo shrink-0" title="Hauptmenü">SEED <b>RUNNERS</b></Link>
            <nav className="hidden md:flex items-center gap-1 min-w-0" aria-label="Bereiche">
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
                <Gamepad2 size={15} /><span className="hidden lg:inline">Steuerung</span>
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
