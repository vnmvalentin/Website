// src/pages/Layout.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import Iridescence from "../components/Iridescence";
import TwitchLoginButton from "../components/TwitchLoginButton";

const navItems = [
  { label: "About",
     links: [
      { label: "Home", to: "/" },
      { label: "Knowledge-Base", to: "/KnowledgeBase" }
    ],
  },
  {
    label: "Projects",
    links: [
      { label: "Abstimmungen", to: "/Abstimmungen" },
      { label: "Pack-Opening", to: "/Packs" },
      { label: "Giveaways", to: "/Giveaways" },
      { label: "The aVards 2026", to: "/avards-2026" },
      { label: "Casino", to: "/Casino" },
    ],
  },
  {
    label: "Streamer-Tools",
    links: [
      { label: "Win-Challenge Overlay", to: "/WinChallenge-Overlay" },
      { label: "Clip-Queue", to: "/Clip-Queue" },
      { label: "Bingo-Card Generator", to: "/Bingo" },
    ],
  },
  {
    label: "Contact",
    links: [
      { label: "Discord", href: "https://discord.gg/ecRJSx2R6x" },
      { label: "Instagram", href: "https://instagram.com/vnmvalentin" },
    ],
  },
];

const ACTIVE_STATUS_ENDPOINTS = {
  // Diese Endpunkte existieren in deinem Backend (siehe giveawayRoutes.js / pollRoutes.js)
  giveaways: "/api/giveaways",
  polls: "/api/polls",
};

export default function Layout() {
  const location = useLocation();

  const [hasActiveGiveaway, setHasActiveGiveaway] = useState(false);
  const [hasActiveAbstimmung, setHasActiveAbstimmung] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const parseTime = (value) => {
      if (value == null) return NaN;
      if (typeof value === "number") return value;

      if (typeof value === "string") {
        const asNumber = Number(value);
        if (!Number.isNaN(asNumber) && asNumber > 0) return asNumber;
        const asDate = Date.parse(value);
        return asDate;
      }

      return NaN;
    };

    const isPollActive = (poll) => {
      const end = parseTime(poll?.endDate);
      if (Number.isNaN(end)) return false;
      return end > Date.now();
    };

    const refresh = async () => {
      // Giveaways: Backend liefert { active: [...], expired: [...] }
      try {
        const res = await fetch(ACTIVE_STATUS_ENDPOINTS.giveaways, {
          credentials: "include",
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          const activeList = Array.isArray(data?.active) ? data.active : [];
          setHasActiveGiveaway(activeList.length > 0);
        }
      } catch {
        // Wenn Backend/Route nicht erreichbar ist, bleibt der Dot einfach aus.
      }

      // Polls/Abstimmungen: Backend liefert ein Array an Polls (/api/polls)
      try {
        const res = await fetch(ACTIVE_STATUS_ENDPOINTS.polls, {
          credentials: "include",
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          const polls = Array.isArray(data) ? data : Array.isArray(data?.polls) ? data.polls : [];
          setHasActiveAbstimmung(polls.some(isPollActive));
        }
      } catch {
        // same as above
      }
    };

    refresh();
    const interval = setInterval(refresh, 30 * 1000);

    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);


  const [openSections, setOpenSections] = useState(() => {
    const initial = {};
    navItems.forEach((item) => (initial[item.label] = true));
    return initial;
  });

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Mobile Drawer automatisch schließen beim Navigieren
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // ESC schließt Drawer
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSection = (label) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const bgColor = useMemo(() => [0, 0, 0.1], []);

  const NavContent = ({ compact = false }) => (
    <nav className={`flex-1 overflow-y-auto ${compact ? "p-4" : "p-4"} space-y-6`}>
      {navItems.map((section) => (
        <div key={section.label}>
          <button
            type="button"
            onClick={() => toggleSection(section.label)}
            className="flex w-full items-center justify-between text-xs font-semibold tracking-[0.15em] uppercase text-white/70 hover:text-white"
          >
            <span>{section.label}</span>
            <span
              className={`transform transition-transform ${
                openSections[section.label] ? "rotate-90" : ""
              }`}
            >
              ▸
            </span>
          </button>

          {openSections[section.label] && (
            <div className="mt-3 space-y-2">
              {section.links.map((link, index) => {
                const isExternal = !!link.href;
                const isActive = !isExternal && location.pathname === link.to;

                const showDot =
                  (link.label === "Giveaways" && hasActiveGiveaway) ||
                  (link.label === "Abstimmungen" && hasActiveAbstimmung);

                const baseClasses =
                  "rounded-xl border border-white/5 px-3 py-2 pr-7 text-sm transition-colors cursor-pointer relative";
                const variationClasses =
                  index % 2 === 0
                    ? "bg-white/5 hover:bg-white/10"
                    : "bg-white/10 hover:bg-white/20";
                const activeClasses = isActive
                  ? "border-violet-400 bg-violet-600/40"
                  : "";

                const classes = `${baseClasses} ${variationClasses} ${activeClasses}`;

                if (isExternal) {
                  return (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <div className={classes}>
                        {link.label}
                        {showDot && (
                          <span
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]"
                            aria-label="Aktiv"
                          />
                        )}
                      </div>
                    </a>
                  );
                }

                return (
                  <Link key={link.label} to={link.to} className="block">
                    <div className={classes}>
                        {link.label}
                        {showDot && (
                          <span
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]"
                            aria-label="Aktiv"
                          />
                        )}
                      </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="relative min-h-screen text-white">
      {/* Hintergrund */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <Iridescence color={bgColor} mouseReact={false} amplitude={0.1} speed={0.1} />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* Desktop Sidebar (nur md+) */}
        <aside className="hidden md:flex w-[20%] min-w-[220px] max-w-[320px] bg-black/80 backdrop-blur border-r border-white/10 flex-col">
          <div className="p-4 border-b border-white/10">
            <Link to="/" className="flex items-center gap-3">
              <img src="/logos/logo.png" alt="vnmvalentin Logo" className="h-12 w-auto cursor-pointer" />
              <span className="text-sm font-semibold tracking-wide uppercase text-white/80">
                vnmvalentin
              </span>
            </Link>
          </div>
          <NavContent />
        </aside>

        {/* Mobile Drawer (nur < md) */}
        <div className={`md:hidden ${mobileNavOpen ? "block" : "hidden"}`}>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
          {/* Panel */}
          <div
            className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] bg-black/90 backdrop-blur border-r border-white/10
                        transform transition-transform duration-200 ${
                          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
                        }`}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-3">
                <img src="/logos/logo.png" alt="vnmvalentin Logo" className="h-10 w-auto" />
                <span className="text-sm font-semibold tracking-wide uppercase text-white/80">
                  vnmvalentin
                </span>
              </Link>
              <button
                type="button"
                aria-label="Menü schließen"
                onClick={() => setMobileNavOpen(false)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10"
              >
                ✕
              </button>
            </div>

            <NavContent compact />
          </div>
        </div>

        {/* Rechts: Header + Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 bg-black/80 backdrop-blur border-b border-white/10 flex items-center px-4 md:px-6">
            {/* Links: (Mobile Burger / ggf. Desktop empty spacer) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Menü öffnen"
                onClick={() => setMobileNavOpen(true)}
                className="md:hidden px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10"
              >
                ☰
              </button>
            </div>

            {/* Mitte: Mobile Titel */}
            <div className="md:hidden flex-1 flex justify-center">
              <Link to="/" className="text-sm font-semibold tracking-wide uppercase text-white/80">
                vnmvalentin
              </Link>
            </div>

            {/* Rechts: Login immer ganz rechts */}
            <div className="ml-auto flex items-center">
              <TwitchLoginButton />
            </div>
          </header>

          <section className="flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </section>
        </div>
      </div>
    </div>
  );
}
