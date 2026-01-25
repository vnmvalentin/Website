// src/pages/Layout.jsx
import React, { useEffect, useMemo, useState, useContext, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import Iridescence from "../components/Iridescence";
import { TwitchAuthContext } from "../components/TwitchAuthContext";

// WICHTIG: Pfad anpassen, falls newData.js woanders liegt!
import { NEWS_UPDATES } from "../utils/newData"; 

const STREAMER_ID = "160224748";

const navItems = [
  { label: "About",
     links: [
      { label: "Home", to: "/" },
      { label: "Knowledge-Base", to: "/KnowledgeBase" }
    ],
  },
  {
    label: "Fun",
    links: [
      { label: "Casino", to: "/Casino" },
      { label: "Pack-Opening", to: "/Packs" },
      { label: "adVentures", to: "/adventures" },
    ],
  },
  {
    label: "Projects",
    links: [
      { label: "Abstimmungen", to: "/Abstimmungen" },
      { label: "Giveaways", to: "/Giveaways" },
      { label: "The aVards 2026", to: "/avards-2026" },
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
  giveaways: "/api/giveaways",
  polls: "/api/polls",
};

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, login, logout } = useContext(TwitchAuthContext);

  const isAdmin = !!user && String(user.id) === STREAMER_ID;

  const [hasActiveGiveaway, setHasActiveGiveaway] = useState(false);
  const [hasActiveAbstimmung, setHasActiveAbstimmung] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  
  // States für Modals
  const [redeemModalOpen, setRedeemModalOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoMsg, setPromoMsg] = useState("");
  
  // State für News Overlay
  const [showNews, setShowNews] = useState(false);

  // --- NEWS URL LOGIK ---
  useEffect(() => {
    // Prüft beim Laden und bei URL-Änderungen auf ?news Parameter
    const params = new URLSearchParams(location.search);
    if (params.has("news")) {
        setShowNews(true);
    } else {
        // Optional: Wenn man ?news entfernt, soll es zugehen? 
        // Meistens besser, den State unabhängig zu lassen, aber für "Deep Linking" syncen wir es hier:
        setShowNews(false);
    }
  }, [location.search]);

  // Funktion zum Öffnen der News (setzt URL Parameter)
  const openNews = () => {
      const params = new URLSearchParams(location.search);
      params.set("news", "true");
      navigate({ search: params.toString() });
  };

  // Funktion zum Schließen der News (entfernt URL Parameter)
  const closeNews = () => {
      const params = new URLSearchParams(location.search);
      params.delete("news");
      navigate({ search: params.toString() });
      setShowNews(false);
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      } catch {}

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
      } catch {}
    };

    refresh();
    const interval = setInterval(refresh, 30 * 1000);

    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  const handleRedeem = async () => {
        try {
            const res = await fetch("/api/promo/redeem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: promoCode })
            });
            const data = await res.json();
            if (data.success) {
                setPromoMsg("✅ " + data.message);
                setPromoCode("");
            } else {
                setPromoMsg("❌ " + data.error);
            }
        } catch (e) {
            setPromoMsg("❌ Fehler");
        }
    };

  const [openSections, setOpenSections] = useState(() => {
    const initial = {};
    navItems.forEach((item) => (initial[item.label] = true));
    return initial;
  });

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

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
      <div className="pointer-events-none fixed inset-0 -z-10">
        <Iridescence color={bgColor} mouseReact={false} amplitude={0.1} speed={0.1} />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* Desktop Sidebar */}
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

        {/* Mobile Drawer */}
        <div className={`md:hidden ${mobileNavOpen ? "block" : "hidden"}`}>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
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
          <header className="relative z-50 h-16 bg-black/80 backdrop-blur border-b border-white/10 flex items-center px-4 md:px-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                aria-label="Menü öffnen"
                onClick={() => setMobileNavOpen(true)}
                className="md:hidden px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10"
              >
                ☰
              </button>

              {/* --- NEWS BUTTON (Öffnet Modal) --- */}
              <button 
                onClick={openNews}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all group"
              >
                <svg className="w-4 h-4 text-fuchsia-400 group-hover:text-fuchsia-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
                <span className="font-bold text-sm tracking-wide text-white/90 group-hover:text-white">
                    NEWS
                </span>
                <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              </button>
            </div>

            <div className="md:hidden flex-1 flex justify-center">
              <Link to="/" className="text-sm font-semibold tracking-wide uppercase text-white/80">
                vnmvalentin
              </Link>
            </div>

            <div className="ml-auto flex items-center relative" ref={userMenuRef}>
              {!user ? (
                <button
                  onClick={() => login(false)} 
                  className="bg-[#9146FF] hover:bg-[#7d36ff] text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 shadow-lg shadow-purple-900/20"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                  </svg>
                  Login
                </button>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 pl-2 pr-4 py-1.5 rounded-full transition-all"
                  >
                    <img 
                      src={user.profileImageUrl} 
                      alt={user.displayName} 
                      className="w-8 h-8 rounded-full border border-white/20"
                    />
                    <span className="text-sm font-semibold hidden sm:block">{user.displayName}</span>
                    <svg className={`w-4 h-4 text-white/60 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                        <div className="px-4 py-3 border-b border-white/10">
                            <p className="text-xs text-white/50">Angemeldet als</p>
                            <p className="font-bold text-white truncate">{user.displayName}</p>
                        </div>
                        <div className="p-1">
                            <button 
                                onClick={() => { login(true); setUserMenuOpen(false); }}
                                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                Nutzer wechseln
                            </button>
                            <button 
                                  onClick={() => { setRedeemModalOpen(true); setUserMenuOpen(false); }}
                                  className="w-full text-left px-3 py-2 text-sm text-yellow-400 hover:text-yellow-300 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                              >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
                                  Code eingeben
                              </button>

                              {isAdmin && (
                                  <Link 
                                      to="/admin"
                                      onClick={() => setUserMenuOpen(false)}
                                      className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                                  >
                                      ⚙️ Admin Dashboard
                                  </Link>
                              )}
                            <button 
                                onClick={() => { logout(); setUserMenuOpen(false); }}
                                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                Logout
                            </button>
                        </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>
          
          {/* --- NEWS CONTAINER (OVERLAY) --- */}
          {showNews && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                  {/* Click Outside Handler (unsichtbar im Hintergrund) */}
                  <div className="absolute inset-0" onClick={closeNews}></div>

                  <div className="bg-gray-900 border border-purple-500/30 rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
                      
                      {/* Header des Containers */}
                      <div className="p-6 border-b border-white/10 bg-gradient-to-r from-purple-900/20 to-transparent flex justify-between items-center">
                          <div className="flex items-center gap-3">
                              <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                              </div>
                              <div>
                                  <h2 className="text-2xl font-black italic tracking-wide text-white">UPDATE NEWS</h2>
                                  <p className="text-xs text-gray-400 uppercase tracking-widest">Was ist neu?</p>
                              </div>
                          </div>
                          <button onClick={closeNews} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                      </div>

                      {/* Content Scrollbereich */}
                      <div className="overflow-y-auto p-6 space-y-8 custom-scrollbar">
                          {NEWS_UPDATES.map((update, idx) => (
                              <div key={idx} className="relative pl-6 border-l-2 border-purple-500/30 pb-2 last:border-0 last:pb-0">
                                  {/* Timeline Dot */}
                                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-gray-900 border-2 border-purple-500"></div>
                                  
                                  <div className="flex items-baseline justify-between mb-4">
                                      <h3 className="text-xl font-bold text-white">{update.version}</h3>
                                      <span className="text-sm font-mono text-gray-400 bg-white/5 px-2 py-1 rounded">{update.date}</span>
                                  </div>

                                  <div className="space-y-6">
                                      {update.sections.map((sec, sIdx) => (
                                          <div key={sIdx} className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                                              <h4 className="font-bold text-purple-300 text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
                                                  {sec.title}
                                              </h4>
                                              <ul className="space-y-2">
                                                  {sec.items.map((item, iIdx) => (
                                                      <li key={iIdx} className="text-gray-300 text-sm flex items-start gap-2">
                                                          <span className="text-purple-500 mt-1">▸</span>
                                                          <span>{item}</span>
                                                      </li>
                                                  ))}
                                              </ul>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>

                      {/* Footer */}
                      <div className="p-4 border-t border-white/10 bg-black/20 text-center">
                          <p className="text-xs text-gray-500">Besuche <span className="text-purple-400">discord.com/invite/ecRJSx2R6x</span> für mehr Infos.</p>
                      </div>
                  </div>
              </div>
          )}

          {/* Code Redeem Modal */}
          {redeemModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                  <div className="bg-gray-900 border border-yellow-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
                      <button onClick={() => setRedeemModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
                      <h2 className="text-2xl font-bold text-yellow-400 mb-4">Code einlösen</h2>
                      <input 
                          type="text" 
                          value={promoCode}
                          onChange={e => setPromoCode(e.target.value)}
                          placeholder="PROMO-CODE"
                          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-center uppercase tracking-widest mb-4 focus:outline-none focus:border-yellow-500"
                      />
                      {promoMsg && <div className="mb-4 text-center font-bold text-sm">{promoMsg}</div>}
                      <button onClick={handleRedeem} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-xl transition-colors">
                          Einlösen
                      </button>
                  </div>
              </div>
          )}

          {/* Main Page Content */}
          <section className="flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </section>
        </div>
      </div>
    </div>
  );
}