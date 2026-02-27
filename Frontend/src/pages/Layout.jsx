// src/pages/Layout.jsx
import React, { useEffect, useState, useContext, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import { NEWS_UPDATES } from "../utils/newData"; 
import { socket } from "../utils/socket";
import { Volume2, VolumeX } from "lucide-react"; // HINZUGEFÜGT: Audio Icons

const STREAMER_ID = "160224748";
const TWITCH_URL = "https://twitch.tv/vnmvalentin";

// Icons
const NAV_ICONS = {
    About: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    ),
    Fun: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    ),
    Community: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    ),
    "Streamer-Tools": (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
    ),
    Contact: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 00-2-2V7a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
    )
};

const navItems = [
  { label: "About", links: [{ label: "Home", to: "/" }] },
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
      { label: "Game Sessions", to: "/sessions" },
      { label: "Viewer Sea", to: "/pond"},
    ],
  },
  {
    label: "Streamer-Tools",
    links: [
      { label: "Win-Challenge Overlay", to: "/WinChallenge-Overlay" },
      { label: "Bingo-Card Generator", to: "/Bingo" },
      { label: "Youtube Music Songrequest", to: "/tutorial/ytm-songrequest" },
      { label: "Youtube Music Stream Deck", to: "/tutorial/ytm-streamdeck" },
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

function formatCooldown(ms) {
  if (ms <= 0) return null;
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((ms % (1000 * 60)) / 1000);
  return `${h}h ${m}m ${s}s`;
}

const NavContent = ({ 
    compact = false, 
    location, 
    openSections, 
    toggleSection, 
    hasActionableGiveaway, 
    hasActionableAbstimmung, 
    setFeedbackModalOpen, 
    setMobileNavOpen, 
    openNews 
}) => (
    <nav className={`flex-1 overflow-y-auto flex flex-col ${compact ? "p-4" : "p-5"} custom-scrollbar`}>
      <div className="space-y-6 flex-1">
        {navItems.map((section) => {
          const isSectionActive = section.links.some(link => 
              (link.label === "Giveaways" && hasActionableGiveaway) ||
              (link.label === "Abstimmungen" && hasActionableAbstimmung)
          );

          const isAbout = section.label === "About";
          const isOpen = isAbout ? true : openSections[section.label];

          return (
              <div key={section.label} className="flex flex-col">
                  {!isAbout && (
                      <button 
                          onClick={() => toggleSection(section.label)}
                          className="flex items-center justify-between px-3 mb-2 outline-none group"
                      >
                          <div className="flex items-center gap-2">
                              <span className="text-gray-500 group-hover:text-cyan-400 transition-colors">
                                  {NAV_ICONS[section.label]}
                              </span>
                              <h3 className="text-xs font-bold text-white uppercase tracking-wider group-hover:text-cyan-400 transition-colors">
                                  {section.label}
                              </h3>
                              {isSectionActive && (
                                  <span className="flex h-2 w-2 ml-1 relative">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500"></span>
                                  </span>
                              )}
                          </div>
                          <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-300 ${isOpen ? "rotate-180" : "rotate-0"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                      </button>
                  )}

                  <div className={`space-y-1 overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
                      {section.links.map((link) => {
                          const isExternal = !!link.href;
                          const isFeedback = link.to === "#feedback";
                          const isActive = !isExternal && !isFeedback && location.pathname === link.to;
                          const showDot = (link.label === "Giveaways" && hasActionableGiveaway) || (link.label === "Abstimmungen" && hasActionableAbstimmung);

                          const classes = `
                              relative overflow-hidden flex items-center justify-between w-full text-left rounded-md px-3 py-2 text-sm transition-all group
                              ${isActive 
                                  ? "bg-white/5 text-white font-bold" 
                                  : "text-gray-400 hover:text-white hover:bg-white/5"
                              }
                          `;

                          const linkContent = (
                              <>
                                  {isActive && (
                                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.8)] pointer-events-none" />
                                  )}
                                  <span className={`relative z-10 transition-colors ${isActive ? "drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]" : ""}`}>
                                      {link.label}
                                  </span>
                                  {isExternal && (
                                      <svg className="w-3 h-3 opacity-50 relative z-10 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                  )}
                                  {showDot && <span className="relative z-10 h-1.5 w-1.5 rounded-full bg-pink-400 shadow-[0_0_5px_rgba(236,72,153,0.8)] pointer-events-none" />}
                              </>
                          );

                          if (isExternal) {
                              return (
                                  <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className={classes}>
                                      {linkContent}
                                  </a>
                              );
                          }

                          if (isFeedback) {
                              return (
                                  <button key={link.label} onClick={() => { setFeedbackModalOpen(true); if(compact) setMobileNavOpen(false); }} className={classes}>
                                      {linkContent}
                                  </button>
                              );
                          }

                          return (
                          <Link key={link.label} to={link.to} onClick={() => { if(compact) setMobileNavOpen(false); }} className={classes}>
                              {linkContent}
                          </Link>
                          );
                      })}
                  </div>
              </div>
          );
        })}
      </div>

      <div className="mt-8 pt-4 border-t border-white/5">
          <button 
              onClick={() => { openNews(); if(compact) setMobileNavOpen(false); }} 
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
          >
              <span className="h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]"></span>
              <span className="font-medium text-sm text-gray-400 group-hover:text-white transition-colors">Updates & News</span>
          </button>
      </div>
    </nav>
);

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, login, logout } = useContext(TwitchAuthContext);
  const isAdmin = !!user && String(user.id) === STREAMER_ID;

  // HINZUGEFÜGT: Globaler Mute State mit localStorage Speicherung
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('globalIsMuted') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('globalIsMuted', isMuted);
  }, [isMuted]);

  const [hasActionableGiveaway, setHasActionableGiveaway] = useState(false);
  const [hasActionableAbstimmung, setHasActionableAbstimmung] = useState(false);
  
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  
  const [redeemModalOpen, setRedeemModalOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoMsg, setPromoMsg] = useState("");
  const [showNews, setShowNews] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("idle");

  const [lastDaily, setLastDaily] = useState(0);
  const [dailyStreak, setDailyStreak] = useState(0);
  const [cooldownTime, setCooldownTime] = useState(0);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [rewardMessage, setRewardMessage] = useState(null);

  const [openSections, setOpenSections] = useState({
    Fun: true,
    Community: true,
    "Streamer-Tools": true,
    Contact: true,
  });

  const toggleSection = (label) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  useEffect(() => {
    if (!user) return;
    const fetchUserData = async () => {
        try {
            const res = await fetch("/api/casino/user", { credentials: "include" });
            if (res.ok) {
                const data = await res.json();
                setLastDaily(data.lastDaily || 0);
                setDailyStreak(data.dailyStreak || 0);
            }
        } catch(e) {}
    };
    fetchUserData();
  }, [user]);

  useEffect(() => {
    const iv = setInterval(() => {
        if (lastDaily > 0) {
            const diff = (lastDaily + 24*60*60*1000) - Date.now();
            setCooldownTime(Math.max(0, diff));
        } else { setCooldownTime(0); }
    }, 1000);
    return () => clearInterval(iv);
  }, [lastDaily]);

  const claimDaily = async () => {
      setLoadingDaily(true);
      try {
        const res = await fetch("/api/casino/daily", { method: "POST", credentials: "include" });
        if (res.ok) {
            const data = await res.json();
            setRewardMessage(`+${data.reward}`);
            setLastDaily(Date.now());
            setDailyStreak(data.dailyStreak || 1);
            setTimeout(() => { setRewardMessage(null); }, 3000);
        }
      } catch (e) {}
      setLoadingDaily(false);
  };

  useEffect(() => {
    const fetchInitial = async () => {
        try {
            const [resG, resP] = await Promise.all([fetch("/api/giveaways"), fetch("/api/polls")]);
            if (resG.ok && resP.ok) {
                const gData = await resG.json();
                const pData = await resP.json();
                checkGiveaways(gData);
                checkPolls(pData);
            }
        } catch(e) { console.error("Initial check failed", e); }
    };
    fetchInitial();

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

    socket.on("giveaways_update", checkGiveaways);
    socket.on("polls_update", checkPolls);

    return () => {
        socket.off("giveaways_update", checkGiveaways);
        socket.off("polls_update", checkPolls);
    };
  }, [user]);

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

  const navProps = {
    location,
    openSections,
    toggleSection,
    hasActionableGiveaway,
    hasActionableAbstimmung,
    setFeedbackModalOpen,
    setMobileNavOpen,
    openNews
  };

  return (
    <div className="relative min-h-screen text-gray-200 font-sans selection:bg-cyan-500/30 selection:text-white bg-[#0f0f13]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[120px] rounded-full mix-blend-screen" />
            <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-pink-500/10 blur-[120px] rounded-full mix-blend-screen" />
        </div>
      <div className="relative z-10 flex min-h-screen">
        
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-[22%] min-w-[260px] max-w-[300px] bg-[#16161a] border-r border-white/5 flex-col z-40">
          <div className="p-6 border-b border-white/5">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src="/logos/logo.png" alt="Logo" className="h-8 w-auto" />
              <span className="text-lg font-bold text-white">vnmvalentin</span>
            </Link>
          </div>
          <NavContent {...navProps} />
        </aside>

        {/* Mobile Drawer */}
        <div className={`md:hidden ${mobileNavOpen ? "block" : "hidden"}`}>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
          <div className={`fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] bg-[#16161a] border-r border-white/5 transform transition-transform duration-300 shadow-xl ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"} flex flex-col`}>
            <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
              <Link to="/" className="flex items-center gap-3">
                <img src="/logos/logo.png" alt="Logo" className="h-7 w-auto" />
                <span className="text-base font-bold text-white">vnmvalentin</span>
              </Link>
              <button onClick={() => setMobileNavOpen(false)} className="p-2 text-gray-400 hover:text-white">✕</button>
            </div>
            <NavContent compact {...navProps} />
          </div>
        </div>

        {/* Header + Content */}
        <div className="flex-1 flex flex-col min-w-0">
            <header className="relative z-30 h-16 bg-[#0f0f13]/90 backdrop-blur-md border-b border-white/5 flex items-center px-4 md:px-8 justify-between">
            <div className="flex items-center gap-4">
                <button onClick={() => setMobileNavOpen(true)} className="md:hidden p-2 text-gray-400 hover:text-white">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                {user && (
                    <button 
                        onClick={claimDaily}
                        disabled={cooldownTime > 0 || loadingDaily || rewardMessage !== null}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium text-sm transition-all duration-300 ${
                            rewardMessage 
                            ? "bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)] scale-105"
                            : cooldownTime <= 0 
                            ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-900/20" 
                            : "bg-white/5 border border-white/5 text-white/40 cursor-not-allowed"
                        }`}
                    >
                        {loadingDaily ? "Lade..." : rewardMessage ? (<><span>🎉</span><span className="font-bold tracking-wider">{rewardMessage}</span></>) : cooldownTime > 0 ? (
                            <><span>⏱️</span><span className="font-mono">{formatCooldown(cooldownTime)}</span>{dailyStreak > 0 && <span className="text-orange-400 ml-1">🔥 {dailyStreak}</span>}</>
                        ) : (<><span>🎁</span><span className="hidden sm:inline">Daily Bonus</span><span className="sm:hidden">Daily</span>{dailyStreak > 0 && <span className="text-orange-400 ml-1">🔥 {dailyStreak}</span>}</>)}
                    </button>
                )}
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block">
                 <a href={TWITCH_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#9146FF]/30 text-[#9146FF] hover:bg-[#9146FF] hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" /></svg>
                    <span className="text-xs font-semibold">vnmvalentin</span>
                 </a>
            </div>

            <div className="flex items-center relative" ref={userMenuRef}>
              {/* HINZUGEFÜGT: Globaler Audio Toggle */}
              <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 mr-4 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  title={isMuted ? "Sound einschalten" : "Sound ausschalten"}
              >
                  {isMuted ? <VolumeX size={18} className="text-red-400"/> : <Volume2 size={18} className="text-green-400"/>}
              </button>

              {!user ? (
                <button onClick={() => login(false)} className="bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors">Login</button>
              ) : (
                <div className="relative">
                  <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 hover:bg-white/5 pl-1 pr-2 py-1 rounded-full transition-colors">
                    <img src={user.profileImageUrl} alt="User" className="w-8 h-8 rounded-full" />
                    <span className="hidden sm:block text-sm font-medium text-gray-200">{user.displayName}</span>
                    <svg className={`w-4 h-4 text-gray-500 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-[#1a1a20] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                        <div className="px-4 py-3 border-b border-white/5 bg-[#202028]"><p className="font-semibold text-white truncate">{user.displayName}</p></div>
                        <div className="p-1">
                            {isAdmin && (
                                <><Link to="/admin" onClick={() => setUserMenuOpen(false)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"><span>🛡️</span> Admin Panel</Link><div className="h-px bg-white/5 my-1 mx-2"></div></>
                            )}
                            <button onClick={() => { login(true); setUserMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors">Account wechseln</button>
                            <button onClick={() => { setRedeemModalOpen(true); setUserMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-md transition-colors">Code einlösen</button>
                            <div className="h-px bg-white/5 my-1 mx-2"></div>
                            <button onClick={() => { logout(); setUserMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-colors">Logout</button>
                        </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* NEWS OVERLAY */}
          {showNews && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                  <div className="absolute inset-0" onClick={closeNews}></div>
                  <div className="bg-[#1a1a20] border border-white/10 rounded-xl w-full max-w-2xl relative flex flex-col max-h-[85vh] shadow-2xl">
                      <div className="p-5 border-b border-white/5 flex justify-between items-center bg-[#202028] rounded-t-xl">
                          <div><h2 className="text-xl font-bold text-white">Update News</h2><p className="text-xs text-gray-400 mt-1">Die neuesten Änderungen am System</p></div>
                          <button onClick={closeNews} className="text-gray-400 hover:text-white p-1">✕</button>
                      </div>
                      <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar">
                          {NEWS_UPDATES.map((update, idx) => (
                              <div key={idx} className="border-b border-white/5 pb-6 last:border-0 last:pb-0">
                                  <div className="flex items-baseline justify-between mb-4">
                                      <h3 className="text-lg font-bold text-white">{update.version}</h3>
                                      <span className="text-xs font-mono text-gray-400 bg-black/30 px-2 py-1 rounded">{update.date}</span>
                                  </div>
                                  <div className="space-y-4">
                                      {update.sections.map((sec, sIdx) => (
                                          <div key={sIdx}>
                                              <h4 className="font-semibold text-cyan-400 text-sm mb-2">{sec.title}</h4>
                                              <ul className="space-y-1.5">
                                                  {sec.items.map((item, iIdx) => (
                                                      <li key={iIdx} className="text-gray-300 text-sm flex items-start gap-2"><span className="text-gray-500 mt-0.5">-</span><span className="leading-relaxed">{item}</span></li>
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
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                  <div className="bg-[#1a1a20] border border-white/10 rounded-xl p-6 w-full max-w-sm relative shadow-2xl">
                      <button onClick={() => setRedeemModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
                      <h2 className="text-lg font-bold text-white mb-4">Code einlösen</h2>
                      <input type="text" value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="Code eingeben" className="w-full bg-[#0f0f13] border border-white/10 rounded-md px-3 py-2 text-white mb-4 focus:border-cyan-500 outline-none" />
                      {promoMsg && <div className="mb-4 text-sm text-gray-300">{promoMsg}</div>}
                      <button onClick={handleRedeem} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-medium py-2 rounded-md transition-colors">Bestätigen</button>
                  </div>
              </div>
          )}

          {/* FEEDBACK MODAL */}
          {feedbackModalOpen && (
             <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-[#1a1a20] border border-white/10 rounded-xl p-6 w-full max-w-lg shadow-2xl relative flex flex-col gap-4">
                    <button onClick={() => setFeedbackModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
                    <h2 className="text-xl font-bold text-white">Feedback</h2>
                    {!user ? (
                        <div className="py-4"><p className="text-gray-400 mb-4 text-sm">Du musst eingeloggt sein, um Feedback zu senden.</p><button onClick={() => { setFeedbackModalOpen(false); login(true); }} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-md text-sm font-medium">Login</button></div>
                    ) : feedbackStatus === "success" ? (
                        <div className="py-4"><h3 className="text-lg font-medium text-white mb-2">Gesendet!</h3><p className="text-gray-400 text-sm mb-4">Vielen Dank für dein Feedback.</p><button onClick={() => { setFeedbackModalOpen(false); setFeedbackStatus("idle"); setFeedbackText(""); }} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-md text-sm">Schließen</button></div>
                    ) : (
                        <>
                            <p className="text-sm text-gray-400">Hast du Ideen oder Fehler gefunden? Lass es mich wissen.</p>
                            <textarea className="w-full h-32 bg-[#0f0f13] border border-white/10 rounded-md p-3 text-white focus:border-cyan-500 focus:outline-none resize-none custom-scrollbar text-sm" placeholder="Deine Nachricht..." value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} disabled={feedbackStatus === "sending"} />
                            {feedbackStatus === "error" && <p className="text-red-400 text-sm">Fehler beim Senden.</p>}
                            <div className="flex justify-end"><button onClick={async () => { if (feedbackText.trim().length < 5) return; setFeedbackStatus("sending"); try { const res = await fetch("/api/feedback/main", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: feedbackText, user: user.displayName }) }); if (res.ok) setFeedbackStatus("success"); else setFeedbackStatus("error"); } catch (e) { setFeedbackStatus("error"); } }} disabled={feedbackText.trim().length < 5 || feedbackStatus === "sending"} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${feedbackText.trim().length < 5 ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white'}`}>{feedbackStatus === "sending" ? "Sende..." : "Absenden"}</button></div>
                        </>
                    )}
                </div>
             </div>
          )}

          {/* PAGE CONTENT */}
          <section className="flex-1 overflow-y-auto p-4 md:p-8 relative z-0 custom-scrollbar">
            {/* HINZUGEFÜGT: isMuted wird via Context an alle Unterseiten weitergegeben */}
            <Outlet context={{ isMuted }} />
          </section>
        </div>
      </div>
    </div>
  );
}