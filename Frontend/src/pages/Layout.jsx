// src/pages/Layout.jsx
import React, { useEffect, useState, useContext, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import { NEWS_UPDATES } from "../utils/newData"; 
import { socket } from "../utils/socket";

const STREAMER_ID = "160224748";
const TWITCH_URL = "https://twitch.tv/vnmvalentin";

// Icons
const NAV_ICONS = {
    About: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    ),
    Fun: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    ),
    Community: (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    ),
    "Streamer-Tools": (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
    ),
    Contact: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
    )
};

const navItems = [
  { label: "About",
     links: [
      { label: "Home", to: "/" },
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
    label: "Community",
    links: [
      { label: "Abstimmungen", to: "/Abstimmungen" },
      { label: "Giveaways", to: "/Giveaways" },
      { label: "The aVards 2026", to: "/avards-2026" },
      { label: "Perk Shop", to: "/shop" },
    ],
  },
  {
    label: "Streamer-Tools",
    links: [
      { label: "Win-Challenge Overlay", to: "/WinChallenge-Overlay" },
      { label: "Bingo-Card Generator", to: "/Bingo" },
      { label: "Youtube Music Songrequest Twitch", to: "/tutorial/ytm-songrequest" },
      { label: "Youtube Music Stream Deck Control", to: "/tutorial/ytm-streamdeck" },
      { label: "Viewer Sea Overlay", to: "/pond"},
    ],
  },
  {
    label: "Contact",
    links: [
      { label: "Discord", href: "https://discord.gg/ecRJSx2R6x" },
      { label: "Instagram", href: "https://instagram.com/vnmvalentin" },
      { label: "Feedback", to: "#feedback" },
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

  // Umbenannt zu "actionable", damit klar ist: Hier muss man noch was tun
  const [hasActionableGiveaway, setHasActionableGiveaway] = useState(false);
  const [hasActionableAbstimmung, setHasActionableAbstimmung] = useState(false);
  
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  
  const [redeemModalOpen, setRedeemModalOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoMsg, setPromoMsg] = useState("");
  const [showNews, setShowNews] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // --- FEEDBACK STATE ---
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("idle");


  // --- SOCKET LISTENERS ---
  useEffect(() => {
    // 1. Initial einmal abrufen, falls man die Seite neu lädt
    const fetchInitial = async () => {
        try {
            const [resG, resP] = await Promise.all([
                fetch("/api/giveaways"),
                fetch("/api/polls")
            ]);
            // Fehler abfangen, falls JSON invalid
            if (resG.ok && resP.ok) {
                const gData = await resG.json();
                const pData = await resP.json();
                checkGiveaways(gData);
                checkPolls(pData);
            }
        } catch(e) { console.error("Initial check failed", e); }
    };
    fetchInitial();

    // 2. Helper Funktionen (Logik wann der Punkt leuchtet)
    const checkGiveaways = (data) => {
        const activeList = data?.active || [];
        const needsAction = activeList.some(g => {
             if (!user) return true; 
             const participants = g.participants || {};
             return !participants[user.id]; 
        });
        setHasActionableGiveaway(needsAction);
    };

    const checkPolls = (data) => {
        const polls = Array.isArray(data) ? data : data?.polls || [];
        const activePolls = polls.filter(p => new Date(p.endDate).getTime() > Date.now());
        const needsAction = activePolls.some(p => {
             if (!user) return true;
             const votes = p.votes || {};
             return !votes[user.id];
        });
        setHasActionableAbstimmung(needsAction);
    };

    // 3. Socket Events abonnieren (Das ersetzt das Polling!)
    socket.on("giveaways_update", checkGiveaways);
    socket.on("polls_update", checkPolls);

    return () => {
        socket.off("giveaways_update", checkGiveaways);
        socket.off("polls_update", checkPolls);
    };
  }, [user]);


  // --- NEWS LOGIC ---
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setShowNews(params.has("news"));
  }, [location.search]);

  const openNews = () => {
      const params = new URLSearchParams(location.search);
      params.set("news", "true");
      navigate({ search: params.toString() });
  };

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


  const handleRedeem = async () => {
    try {
        const res = await fetch("/api/promo/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: promoCode })
        });
        const data = await res.json();
        setPromoMsg(data.success ? "✅ " + data.message : "❌ " + data.error);
        if(data.success) setPromoCode("");
    } catch (e) { setPromoMsg("❌ Fehler"); }
  };

  // --- NAVIGATIONS LOGIK ---
  const [openSection, setOpenSection] = useState("About"); 

  const toggleSection = (label) => {
    setOpenSection((prev) => (prev === label ? null : label));
  };

  const NavContent = ({ compact = false }) => (
    <nav className={`flex-1 overflow-y-auto ${compact ? "p-4" : "p-6"} space-y-4 custom-scrollbar`}>
      {navItems.map((section) => {
        const isOpen = openSection === section.label;
        
        // Prüfen, ob für diese Hauptsektion ein Punkt angezeigt werden muss
        const isSectionActive = section.links.some(link => 
            (link.label === "Giveaways" && hasActionableGiveaway) ||
            (link.label === "Abstimmungen" && hasActionableAbstimmung)
        );

        return (
            <div key={section.label} className="group relative">
            <button
                type="button"
                onClick={() => toggleSection(section.label)}
                className={`
                    w-full relative overflow-hidden rounded-2xl border transition-all duration-300
                    flex items-center justify-between p-4 cursor-pointer outline-none focus:outline-none select-none
                    ${isOpen 
                        ? "bg-white/10 border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.1)]" 
                        : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20"
                    }
                `}
            >
                <div className={`absolute inset-0 bg-gradient-to-r from-cyan-600/20 via-transparent to-fuchsia-600/20 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} />
                
                <div className="relative z-10 flex items-center gap-3">
                    <span className={`transition-colors duration-300 ${isOpen ? "text-cyan-400" : "text-gray-400"}`}>
                        {NAV_ICONS[section.label]}
                    </span>
                    <span className={`text-base font-bold tracking-wide uppercase bg-clip-text text-transparent bg-gradient-to-r ${isOpen ? "from-cyan-400 to-fuchsia-400" : "from-gray-200 to-gray-400"} drop-shadow-sm`}>
                        {section.label}
                    </span>

                    {/* HAUPTKATEGORIE PUNKT */}
                    {isSectionActive && (
                        <span className="flex h-2.5 w-2.5 relative ml-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500 shadow-[0_0_10px_#22d3ee]"></span>
                        </span>
                    )}
                </div>

                <span className={`relative z-10 text-cyan-400 transition-transform duration-300 ${isOpen ? "rotate-180" : "rotate-0"}`}>
                ▼
                </span>
            </button>

            <div 
                className={`
                    overflow-hidden transition-all duration-300 ease-in-out
                    ${isOpen ? "max-h-96 opacity-100 mt-2" : "max-h-0 opacity-0 mt-0"}
                `}
            >
                <div className="pl-2 space-y-2 pb-2">
                {section.links.map((link) => {
                    const isExternal = !!link.href;
                    const isFeedback = link.to === "#feedback";
                    const isActive = !isExternal && !isFeedback && location.pathname === link.to;

                    // Hier prüfen wir auf die "Actionable" States
                    const showDot =
                    (link.label === "Giveaways" && hasActionableGiveaway) ||
                    (link.label === "Abstimmungen" && hasActionableAbstimmung);

                    const classes = `
                        block w-full text-left rounded-xl border-l-2 pl-4 py-3 pr-4 text-sm font-medium transition-all relative overflow-hidden
                        ${isActive 
                            ? "border-fuchsia-500 bg-gradient-to-r from-fuchsia-500/10 to-transparent text-white" 
                            : "border-white/10 text-gray-400 hover:text-white hover:border-cyan-400 hover:bg-white/5"
                        }
                    `;

                    if (isExternal) {
                        return (
                            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className={classes}>
                                <span className="relative z-10 flex items-center gap-2">
                                    {link.label}
                                    <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </span>
                            </a>
                        );
                    }

                    if (isFeedback) {
                         return (
                             <button 
                                key={link.label} 
                                onClick={() => { setFeedbackModalOpen(true); if(compact) setMobileNavOpen(false); }} 
                                className={classes}
                             >
                                <span className="relative z-10 flex items-center gap-2">
                                    {link.label}
                                </span>
                             </button>
                        );
                    }

                    return (
                    <Link key={link.label} to={link.to} onClick={() => { if(compact) setMobileNavOpen(false); }} className={classes}>
                            <span className="relative z-10">{link.label}</span>
                            {/* UNTERMENÜ PUNKT */}
                            {showDot && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
                            )}
                    </Link>
                    );
                })}
                </div>
            </div>
            </div>
        );
      })}
    </nav>
  );

  return (
    <div className="relative min-h-screen text-white font-sans selection:bg-fuchsia-500 selection:text-white bg-[#0a0a0f]">
      
      {/* BACKGROUND */}
      <div className="fixed inset-0 z-0 bg-[#05050a]"></div>
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/30 rounded-full blur-[120px] pointer-events-none z-0 mix-blend-screen" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-900/20 rounded-full blur-[120px] pointer-events-none z-0 mix-blend-screen" />
      <div className="fixed top-[40%] left-[50%] translate-x-[-50%] w-[60%] h-[60%] bg-violet-900/10 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* WRAPPER */}
      <div className="relative z-10 flex min-h-screen">
        
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-[22%] min-w-[260px] max-w-[340px] bg-[#0a0a0f]/80 backdrop-blur-xl border-r border-white/5 flex-col shadow-2xl z-40">
          <div className="p-6 border-b border-white/5">
            <Link to="/" className="flex items-center gap-4 group">
              <div className="relative">
                 <div className="absolute inset-0 bg-cyan-500 blur-lg opacity-20 group-hover:opacity-60 transition-opacity duration-500 rounded-full"></div>
                 <img src="/logos/logo.png" alt="Logo" className="h-10 w-auto relative z-10 transform transition-transform group-hover:scale-110" />
              </div>
              <div className="flex flex-col">
                  <span className="text-base font-black tracking-wider uppercase text-white">
                    vnmvalentin
                  </span>
              </div>
            </Link>
          </div>
          
          <NavContent />

          {/* ADMIN BUTTON (DESKTOP) - GANZ UNTEN */}
          {isAdmin && (
              <div className="p-4 mt-auto border-t border-white/5">
                  <Link 
                    to="/admin" 
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 transition-all group"
                  >
                      <span className="text-lg group-hover:scale-110 transition-transform">🛡️</span>
                      <span className="font-bold uppercase text-xs tracking-wider">Admin Dashboard</span>
                  </Link>
              </div>
          )}
        </aside>

        {/* Mobile Drawer */}
        <div className={`md:hidden ${mobileNavOpen ? "block" : "hidden"}`}>
          <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <div className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] bg-[#0f0f13] border-r border-white/10 transform transition-transform duration-300 shadow-2xl ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"} flex flex-col`}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-cyan-900/20 to-transparent shrink-0">
              <Link to="/" className="flex items-center gap-3">
                <img src="/logos/logo.png" alt="Logo" className="h-8 w-auto" />
                <span className="text-sm font-bold tracking-wide uppercase text-white">vnmvalentin</span>
              </Link>
              <button onClick={() => setMobileNavOpen(false)} className="px-3 py-2 rounded-xl bg-white/5 text-gray-400 hover:text-white border border-white/5">✕</button>
            </div>
            
            <NavContent compact />
            
            {/* ADMIN BUTTON (MOBILE) - GANZ UNTEN */}
            {isAdmin && (
                <div className="p-4 mt-auto border-t border-white/5">
                    <Link 
                        to="/admin" 
                        onClick={() => setMobileNavOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 transition-all"
                    >
                        <span className="text-lg">🛡️</span>
                        <span className="font-bold uppercase text-xs tracking-wider">Admin Dashboard</span>
                    </Link>
                </div>
            )}
          </div>
        </div>

        {/* Rechts: Header + Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="relative z-40 h-20 bg-[#0a0a0f]/60 backdrop-blur-xl border-b border-white/5 flex items-center px-4 md:px-8 justify-between">
            {/* Left Header Area */}
            <div className="flex items-center gap-4">
              <button onClick={() => setMobileNavOpen(true)} className="md:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-white">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <button onClick={openNews} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-400/30 transition-all group">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="font-bold text-xs tracking-widest text-gray-400 group-hover:text-white uppercase">News</span>
              </button>
            </div>

            {/* Middle: Twitch Button */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
                 <a href={TWITCH_URL} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-6 py-2 rounded-full bg-[#9146FF]/10 border border-[#9146FF]/30 hover:bg-[#9146FF] hover:border-[#9146FF] hover:shadow-[0_0_20px_rgba(145,70,255,0.4)] transition-all duration-300 group">
                    <svg className="w-5 h-5 text-[#9146FF] group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                    </svg>
                    <span className="text-sm font-bold text-[#9146FF] group-hover:text-white uppercase tracking-wider transition-colors">check out: vnmvalentin</span>
                 </a>
            </div>

            {/* RECHTS: User Profile */}
            <div className="flex items-center relative" ref={userMenuRef}>
              {!user ? (
                <button
                  onClick={() => login(false)} 
                  className="bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-400 border border-white/10 hover:border-cyan-400/50 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                >
                  Login
                </button>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-3 bg-black/40 hover:bg-white/10 border border-white/10 pl-2 pr-4 py-1.5 rounded-full transition-all"
                  >
                    <img 
                      src={user.profileImageUrl} 
                      alt={user.displayName} 
                      className="w-9 h-9 rounded-full border-2 border-cyan-500/30"
                    />
                    <div className="hidden sm:flex flex-col items-start text-xs">
                        <span className="font-bold text-white leading-tight">{user.displayName}</span>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-3 w-56 bg-[#0f0f13] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                        <div className="bg-gradient-to-r from-cyan-900/20 to-fuchsia-900/20 px-4 py-4 border-b border-white/10">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Account</p>
                            <p className="font-bold text-white text-lg truncate">{user.displayName}</p>
                        </div>
                        <div className="p-2 space-y-1">
                            <button 
                                onClick={() => { login(true); setUserMenuOpen(false); }}
                                className="w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3"
                            >
                                <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                Account wechseln
                            </button>
                            <button 
                                  onClick={() => { setRedeemModalOpen(true); setUserMenuOpen(false); }}
                                  className="w-full text-left px-3 py-2.5 text-sm text-yellow-400 hover:text-yellow-300 hover:bg-yellow-400/10 rounded-xl transition-colors flex items-center gap-3"
                              >
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
                                  Code einlösen
                              </button>
                            <div className="h-px bg-white/10 my-1 mx-2"></div>
                            <button 
                                onClick={() => { logout(); setUserMenuOpen(false); }}
                                className="w-full text-left px-3 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors flex items-center gap-3"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
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
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
                  <div className="absolute inset-0" onClick={closeNews}></div>

                  <div className="bg-[#0f0f13] border border-fuchsia-500/30 rounded-3xl w-full max-w-2xl shadow-[0_0_50px_rgba(192,38,211,0.15)] relative flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
                      
                      {/* Header */}
                      <div className="p-6 border-b border-white/10 bg-gradient-to-r from-fuchsia-900/20 to-transparent flex justify-between items-center">
                          <div className="flex items-center gap-4">
                              <div className="p-3 bg-fuchsia-500/10 rounded-xl text-fuchsia-400 border border-fuchsia-500/20">
                                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                              </div>
                              <div>
                                  <h2 className="text-2xl font-black italic tracking-wide text-white">UPDATE NEWS</h2>
                                  <p className="text-xs text-fuchsia-400 uppercase tracking-widest font-bold">Latest Changes</p>
                              </div>
                          </div>
                          <button onClick={closeNews} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                      </div>

                      {/* Content */}
                      <div className="overflow-y-auto p-6 space-y-8 custom-scrollbar">
                          {NEWS_UPDATES.map((update, idx) => (
                              <div key={idx} className="relative pl-8 border-l-2 border-white/10 pb-2 last:border-0 last:pb-0">
                                  {/* Timeline Dot */}
                                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-[#0f0f13] border-2 border-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.5)]"></div>
                                  
                                  <div className="flex items-baseline justify-between mb-6">
                                      <h3 className="text-2xl font-bold text-white">{update.version}</h3>
                                      <span className="text-xs font-bold font-mono text-cyan-400 bg-cyan-900/10 border border-cyan-500/20 px-3 py-1 rounded-full uppercase">{update.date}</span>
                                  </div>

                                  <div className="space-y-4">
                                      {update.sections.map((sec, sIdx) => (
                                          <div key={sIdx} className="bg-white/5 rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-colors">
                                              <h4 className="font-bold text-fuchsia-300 text-sm uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-white/5 pb-2">
                                                  {sec.title}
                                              </h4>
                                              <ul className="space-y-3">
                                                  {sec.items.map((item, iIdx) => (
                                                      <li key={iIdx} className="text-gray-300 text-sm flex items-start gap-3">
                                                          <span className="text-fuchsia-500 mt-1">▸</span>
                                                          <span className="leading-relaxed">{item}</span>
                                                      </li>
                                                  ))}
                                              </ul>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          )}

          {/* REDEEM MODAL */}
          {redeemModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
                  <div className="bg-[#121216] border border-yellow-500/20 rounded-2xl p-8 w-full max-w-md shadow-2xl relative">
                      <button onClick={() => setRedeemModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
                      <h2 className="text-xl font-bold text-yellow-400 mb-6 text-center">Code einlösen</h2>
                      <input type="text" value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="CODE EINGEBEN" className="w-full bg-black border border-white/20 rounded-xl px-4 py-3 text-white text-center mb-4 focus:border-yellow-500 outline-none" />
                      {promoMsg && <div className="mb-4 text-center text-sm font-bold text-white">{promoMsg}</div>}
                      <button onClick={handleRedeem} className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded-xl transition-colors">Bestätigen</button>
                  </div>
              </div>
          )}

          {/* FEEDBACK MODAL */}
          {feedbackModalOpen && (
             <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-[#121216] border border-cyan-500/20 rounded-2xl p-8 w-full max-w-lg shadow-2xl relative flex flex-col gap-4">
                    <button onClick={() => setFeedbackModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
                    
                    <h2 className="text-2xl font-bold text-cyan-400 text-center mb-2">Feedback & Vorschläge</h2>
                    
                    {!user ? (
                        <div className="text-center py-6">
                            <p className="text-gray-400 mb-4">Du musst eingeloggt sein, um Feedback zu senden.</p>
                            <button onClick={() => { setFeedbackModalOpen(false); login(true); }} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded-xl font-bold">
                                Login
                            </button>
                        </div>
                    ) : feedbackStatus === "success" ? (
                        <div className="flex flex-col items-center justify-center py-6 animate-in zoom-in">
                            <div className="text-5xl mb-4">✅</div>
                            <h3 className="text-xl font-bold text-white mb-2">Gesendet!</h3>
                            <p className="text-gray-400 text-center text-sm">Vielen Dank für dein Feedback.</p>
                            <button onClick={() => { setFeedbackModalOpen(false); setFeedbackStatus("idle"); setFeedbackText(""); }} className="mt-6 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-xl">Schließen</button>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-400 text-center">
                                Hast du Ideen, Wünsche oder Fehler gefunden? Schreib mir direkt! 
                                <br/><span className="text-xs text-gray-600">Dein Name ({user.displayName}) wird mitgesendet.</span>
                            </p>

                            <textarea 
                                className="w-full h-32 bg-black/50 border border-white/20 rounded-xl p-3 text-white focus:border-cyan-500 focus:outline-none resize-none placeholder-gray-600 custom-scrollbar"
                                placeholder="Deine Nachricht an mich..."
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                disabled={feedbackStatus === "sending"}
                            />
                            
                            {feedbackStatus === "error" && <p className="text-red-500 text-xs font-bold text-center">Fehler beim Senden. Versuch es später nochmal.</p>}

                            <button 
                                onClick={async () => {
                                    if (feedbackText.trim().length < 5) return;
                                    setFeedbackStatus("sending");
                                    try {
                                        const res = await fetch("/api/feedback/main", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ message: feedbackText, user: user.displayName })
                                        });
                                        if (res.ok) setFeedbackStatus("success");
                                        else setFeedbackStatus("error");
                                    } catch (e) {
                                        setFeedbackStatus("error");
                                    }
                                }} 
                                disabled={feedbackText.trim().length < 5 || feedbackStatus === "sending"}
                                className={`w-full font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2
                                    ${feedbackText.trim().length < 5 
                                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                                        : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/20'
                                    }`}
                            >
                                {feedbackStatus === "sending" ? "Sende..." : "Absenden 🚀"}
                            </button>
                        </>
                    )}
                </div>
             </div>
          )}

          {/* PAGE CONTENT */}
          <section className="flex-1 overflow-y-auto p-4 md:p-8 relative z-0 custom-scrollbar">
            <Outlet />
          </section>
        </div>
      </div>
    </div>
  );
}