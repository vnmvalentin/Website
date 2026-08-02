// src/pages/Layout.jsx
import React, { useEffect, useState, useContext, useRef, useCallback } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { TwitchAuthContext } from "../components/TwitchAuthContext";
import { socket, ensureSocketConnected } from "../utils/socket";
import AppBackground from "../components/AppBackground";
import { NAV_CATEGORIES } from "../config/navigation";
import {
  Volume2,
  VolumeX,
  AlertTriangle,
  Info,
  Menu,
  X,
  ChevronDown,
  ExternalLink,
  Newspaper,
  UserRound,
} from "lucide-react";

const STREAMER_ID = "160224748";

function TwitchGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

export default function Layout() {
  const location = useLocation();
  const { user, login } = useContext(TwitchAuthContext);

  const [systemBroadcast, setSystemBroadcast] = useState(null);

  const isFullBleedGame =
    location.pathname === "/garden" || location.pathname === "/adventures" ||
    location.pathname === "/discord-bot" || location.pathname === "/WinChallenge-Overlay" ||
    location.pathname === "/clash-royale";

  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('globalIsMuted') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('globalIsMuted', isMuted);
  }, [isMuted]);

  const [hasActionableGiveaway, setHasActionableGiveaway] = useState(false);
  const [hasActionableAbstimmung, setHasActionableAbstimmung] = useState(false);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const closeTimerRef = useRef(null);

  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("idle");

  const openMenu = (key) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setOpenDropdown(key);
  };
  const scheduleClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpenDropdown(null), 140);
  };
  useEffect(() => () => closeTimerRef.current && clearTimeout(closeTimerRef.current), []);

  // Menüs bei Seitenwechsel schließen
  useEffect(() => {
    setOpenDropdown(null);
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
      const fetchActiveBroadcast = async () => {
          try {
              const res = await fetch("/api/system/broadcast");
              if (res.ok) {
                  const data = await res.json();
                  if (data && data.message) {
                      setSystemBroadcast(data);
                  }
              }
          } catch (e) {
              console.error("Konnte aktiven Broadcast nicht laden", e);
          }
      };

      fetchActiveBroadcast();

      if (socket) {
          socket.on("system_broadcast", (data) => {
              setSystemBroadcast(data);
          });

          return () => {
              socket.off("system_broadcast");
          };
      }
  }, []);

  // Die Punkte in der Navigation ("da wartet noch was auf dich").
  //
  // Der Server rechnet das jetzt selbst aus und schickt uns zwei Booleans statt
  // der kompletten Abstimmungs- und Giveaway-Listen. Vorher landete bei JEDER
  // Stimme die volle Liste inklusive aller Teilnehmer bei jeder verbundenen
  // Socket — auch bei OBS-Overlays und Clash-Royale-Spielern.
  useEffect(() => {
    ensureSocketConnected();
    const subscribe = () => socket.emit("badges:subscribe", { userId: user?.id || null });
    const onBadges = ({ polls, giveaways }) => {
        setHasActionableAbstimmung(!!polls);
        setHasActionableGiveaway(!!giveaways);
    };

    socket.on("badges:update", onBadges);
    socket.on("connect", subscribe);   // nach einem Reconnect neu anmelden
    subscribe();

    return () => {
        socket.off("badges:update", onBadges);
        socket.off("connect", subscribe);
    };
  }, [user]);

  const linkHasDot = (label) =>
    (label === "Giveaways" && hasActionableGiveaway) ||
    (label === "Abstimmungen" && hasActionableAbstimmung);

  const categoryHasDot = (cat) => cat.links.some((l) => linkHasDot(l.label));

  const isCategoryActive = (cat) =>
    location.pathname === cat.to ||
    cat.links.some((l) => l.to && location.pathname === l.to);

  const openFeedback = useCallback(() => setFeedbackModalOpen(true), []);

  // Ein Eintrag im Dropdown / Mobile-Menü (interner Link, externer Link oder Aktion)
  const renderNavLink = (link, { onNavigate } = {}) => {
    const Icon = link.icon;
    const baseClasses =
      "flex items-start gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5 group";

    const inner = (
      <>
        {Icon && (
          <span className="mt-0.5 text-white/35 group-hover:text-violet-300 transition-colors shrink-0">
            <Icon size={17} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-white/85 group-hover:text-white">
            {link.label}
            {linkHasDot(link.label) && <span className="h-1.5 w-1.5 rounded-full bg-pink-400 shrink-0" />}
            {link.href && <ExternalLink size={11} className="text-white/25 shrink-0" />}
          </span>
          {link.description && (
            <span className="block text-xs text-white/40 leading-snug mt-0.5">{link.description}</span>
          )}
        </span>
      </>
    );

    if (link.href) {
      return (
        <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className={baseClasses}>
          {inner}
        </a>
      );
    }
    if (link.action === "feedback") {
      return (
        <button
          key={link.label}
          onClick={() => { setFeedbackModalOpen(true); onNavigate?.(); }}
          className={baseClasses}
        >
          {inner}
        </button>
      );
    }
    return (
      <Link key={link.label} to={link.to} onClick={() => onNavigate?.()} className={baseClasses}>
        {inner}
      </Link>
    );
  };

  return (
    <div className="relative text-gray-200 font-sans selection:bg-violet-500/30 selection:text-white">
      <AppBackground />

      {systemBroadcast && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-md panel-strong shadow-2xl shadow-black/60 overflow-hidden">
                  <div className={`h-[3px] w-full ${
                      systemBroadcast.type === 'warning' ? 'bg-red-500' : 'bg-violet-500'
                  }`} />
                  <div className="p-6">
                      <div className="flex items-center gap-2 mb-4">
                          {systemBroadcast.type === 'warning' ? (
                              <AlertTriangle size={15} className="text-red-400 shrink-0" />
                          ) : (
                              <Info size={15} className="text-violet-300 shrink-0" />
                          )}
                          <span className={`text-xs font-bold uppercase tracking-wider ${
                              systemBroadcast.type === 'warning' ? 'text-red-400' : 'text-violet-300'
                          }`}>
                              {systemBroadcast.type === 'warning' ? 'System-Warnung' : 'System-Hinweis'}
                          </span>
                      </div>

                      <p className="text-white/90 text-sm leading-relaxed mb-6">
                          {systemBroadcast.message}
                      </p>

                      <div className="flex justify-end">
                          <button
                              onClick={() => setSystemBroadcast(null)}
                              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white font-bold py-2 px-5 rounded-lg transition-colors text-xs uppercase tracking-wider"
                          >
                              Verstanden
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="relative z-10 flex flex-col h-[100dvh] min-h-0 w-full max-w-full overflow-hidden">

        {/* ================= HEADER ================= */}
        <header className="relative z-40 shrink-0 border-b border-white/10 bg-[#0a0a16]/70 backdrop-blur-xl">
          <div className="flex items-center h-16 lg:h-[68px] px-4 md:px-6 xl:px-10 gap-3">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 shrink-0 pr-2 lg:pr-6 hover:opacity-80 transition-opacity">
              <img src="/logos/logo.png" alt="Logo" className="h-8 w-auto" />
              <span className="font-display text-lg font-bold text-white tracking-tight">vnmvalentin</span>
            </Link>

            {/* Desktop-Navigation */}
            <nav className="hidden lg:flex items-stretch self-stretch">
              {NAV_CATEGORIES.map((cat) => {
                const active = isCategoryActive(cat);
                const open = openDropdown === cat.key;
                return (
                  <div
                    key={cat.key}
                    className="relative flex items-stretch"
                    onMouseEnter={() => openMenu(cat.key)}
                    onMouseLeave={scheduleClose}
                  >
                    <Link
                      to={cat.to}
                      className={`relative flex items-center gap-1.5 px-4 xl:px-5 font-display text-[15px] xl:text-base font-semibold tracking-wide transition-colors ${
                        active || open ? "text-white" : "text-white/60 hover:text-white"
                      }`}
                    >
                      {cat.label}
                      {categoryHasDot(cat) && <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />}
                      <ChevronDown
                        size={13}
                        className={`transition-transform duration-200 ${open ? "rotate-180 text-violet-300" : "text-white/30"}`}
                      />
                      {active && (
                        <span className="absolute left-4 right-4 -bottom-px h-0.5 bg-violet-400 rounded-full" />
                      )}
                    </Link>

                    {open && (
                      <div className="absolute left-0 top-full pt-1.5 w-[300px] dropdown-in z-50">
                        <div className="panel-strong p-2 shadow-2xl shadow-black/60">
                          <div className="px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30">
                            {cat.tagline}
                          </div>
                          {cat.links.map((link) => renderNavLink(link))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            <div className="flex-1" />

            {/* Rechte Seite */}
            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
              <Link
                to="/updates"
                className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  location.pathname === "/updates" ? "text-white bg-white/5" : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
                title="Updates & News"
              >
                <Newspaper size={16} />
                <span className="text-sm font-medium hidden xl:block">Updates</span>
              </Link>

              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                title={isMuted ? "Sound einschalten" : "Sound ausschalten"}
              >
                {isMuted ? <VolumeX size={18} className="text-red-400"/> : <Volume2 size={18}/>}
              </button>

              {!user ? (
                <button
                  onClick={() => login(false)}
                  className="flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white pl-3 pr-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  <TwitchGlyph className="w-4 h-4" />
                  <span className="hidden sm:block">Mit Twitch anmelden</span>
                  <span className="sm:hidden">Login</span>
                </button>
              ) : (
                <Link
                  to="/profile"
                  className={`flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-lg border transition-colors ${
                    location.pathname === "/profile"
                      ? "bg-white/10 border-white/15"
                      : "border-transparent hover:bg-white/5 hover:border-white/10"
                  }`}
                  title="Profil öffnen"
                >
                  <img src={user.profileImageUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  <span className="hidden md:flex flex-col items-start leading-tight">
                    <span className="text-sm font-semibold text-white">{user.displayName}</span>
                    <span className="text-[10px] text-white/40 flex items-center gap-1"><UserRound size={9} /> Profil</span>
                  </span>
                </Link>
              )}

              {/* Mobile Burger */}
              <button
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                title="Menü öffnen"
              >
                <Menu size={22} />
              </button>
            </div>
          </div>
        </header>

        {/* ================= MOBILE MENU ================= */}
        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[88%] max-w-[360px] bg-[#0c0c18]/95 backdrop-blur-xl border-r border-white/10 flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                <Link to="/" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3">
                  <img src="/logos/logo.png" alt="Logo" className="h-7 w-auto" />
                  <span className="font-display text-base font-bold text-white">vnmvalentin</span>
                </Link>
                <button onClick={() => setMobileNavOpen(false)} className="p-2 text-white/50 hover:text-white rounded-lg hover:bg-white/5">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                {NAV_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <div key={cat.key}>
                      <Link
                        to={cat.to}
                        onClick={() => setMobileNavOpen(false)}
                        className="flex items-center gap-2 px-2 mb-1.5 group"
                      >
                        <span className="text-white/35 group-hover:text-violet-300 transition-colors"><Icon size={15} /></span>
                        <span className="font-display text-xs font-bold uppercase tracking-widest text-white/70 group-hover:text-white transition-colors">
                          {cat.label}
                        </span>
                        {categoryHasDot(cat) && <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />}
                      </Link>
                      <div className="space-y-0.5">
                        {cat.links.map((link) => renderNavLink(link, { onNavigate: () => setMobileNavOpen(false) }))}
                      </div>
                    </div>
                  );
                })}

                <div className="pt-4 border-t border-white/10">
                  <Link
                    to="/updates"
                    onClick={() => setMobileNavOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <Newspaper size={17} className="text-white/35" /> Updates & News
                  </Link>
                  {user && (
                    <Link
                      to="/profile"
                      onClick={() => setMobileNavOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <img src={user.profileImageUrl} alt="" className="w-6 h-6 rounded-md object-cover" />
                      Mein Profil
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= FEEDBACK MODAL ================= */}
        {feedbackModalOpen && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="panel-strong p-6 w-full max-w-lg shadow-2xl shadow-black/60 relative flex flex-col gap-4">
                  <button onClick={() => setFeedbackModalOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"><X size={18} /></button>
                  <h2 className="font-display text-xl font-bold text-white">Feedback</h2>
                  {!user ? (
                      <div className="py-4"><p className="text-white/50 mb-4 text-sm">Du musst eingeloggt sein, um Feedback zu senden.</p><button onClick={() => { setFeedbackModalOpen(false); login(true); }} className="flex items-center gap-2 bg-[#9146FF] hover:bg-[#7c3aed] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"><TwitchGlyph className="w-4 h-4" /> Mit Twitch anmelden</button></div>
                  ) : feedbackStatus === "success" ? (
                      <div className="py-4"><h3 className="text-lg font-semibold text-white mb-2">Gesendet!</h3><p className="text-white/50 text-sm mb-4">Vielen Dank für dein Feedback.</p><button onClick={() => { setFeedbackModalOpen(false); setFeedbackStatus("idle"); setFeedbackText(""); }} className="bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-lg text-sm transition-colors">Schließen</button></div>
                  ) : (
                      <>
                          <p className="text-sm text-white/50">Hast du Ideen oder Fehler gefunden? Lass es mich wissen.</p>
                          <textarea className="w-full h-32 bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-violet-500 focus:outline-none resize-none custom-scrollbar text-sm transition-colors" placeholder="Deine Nachricht..." value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} disabled={feedbackStatus === "sending"} />
                          {feedbackStatus === "error" && <p className="text-red-400 text-sm">Fehler beim Senden.</p>}
                          <div className="flex justify-end"><button onClick={async () => { if (feedbackText.trim().length < 5) return; setFeedbackStatus("sending"); try { const res = await fetch("/api/feedback/main", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: feedbackText, user: user.displayName }) }); if (res.ok) setFeedbackStatus("success"); else setFeedbackStatus("error"); } catch { setFeedbackStatus("error"); } }} disabled={feedbackText.trim().length < 5 || feedbackStatus === "sending"} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${feedbackText.trim().length < 5 ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}>{feedbackStatus === "sending" ? "Sende..." : "Absenden"}</button></div>
                      </>
                  )}
              </div>
           </div>
        )}

        {/* ================= PAGE CONTENT ================= */}
        <section
          className={
            isFullBleedGame
              ? "flex-1 min-h-0 overflow-hidden p-0 relative z-0 flex flex-col"
              : "flex-1 overflow-y-auto p-4 md:p-8 relative z-0 custom-scrollbar"
          }
        >
          <Outlet context={{ isMuted, openFeedback }} />
        </section>
      </div>
    </div>
  );
}
