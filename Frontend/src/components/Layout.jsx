// src/components/Layout.jsx
import React, { useEffect, useState, useContext, useRef, useCallback } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import SiteFooter from "./SiteFooter";
import { useLiveStatus } from "../utils/useLiveStatus";
import { TwitchAuthContext } from "./TwitchAuthContext";
import { socket, ensureSocketConnected } from "../utils/socket";
import AppBackground from "./AppBackground";
import KontoBild from "./KontoBild";
import { useKonto, oeffneAnmeldung } from "../utils/konto.js";
// Seitenliste (config/navigation.js) in der gewählten Sprache, Texte der Hülle DE/EN (huelleTexte.js)
import { navigationFuer } from "../config/navigationEn";
import { useLanguage } from "../i18n/language.js";
import LanguageSwitch from "../i18n/LanguageSwitch";
import { HUELLE_TEXTE } from "./huelleTexte.js";
import { installieren, useInstallation } from "../utils/mitteilungen.js";
import Glocke from "./Glocke.jsx";
import Schnellsuche, { SucheKnopf } from "./Schnellsuche.jsx";
import EinladungHinweis from "./EinladungHinweis.jsx";
// Barrierefreiheit: Sprungmarke, Seitenansage, Fokus in Menü und Fenstern (Texte in barrierefreiTexte.js)
import { BARRIEREFREI_TEXTE } from "./barrierefreiTexte.js";
import useFokusFalle from "./ui/useFokusFalle.js";
// 96-px-WebP (2 KB) statt /logos/logo.png: das Original ist 512×512 und 255 KB groß, wird hier
// aber nur 32 px hoch gezeigt — und das auf jeder Seite. Das PNG bleibt für og:image (SEO.jsx).
import logoHeader from "../assets/logo-header.webp";
import {
  AlertTriangle,
  Info,
  Menu,
  X,
  ChevronDown,
  ExternalLink,
  Newspaper,
  UserRound,
  Lock,
  Download,
} from "lucide-react";


export default function Layout() {
  const location = useLocation();
  // Feedback geht seit 17.11.2026 mit jedem Konto — Twitch-Anmeldung braucht der Kopf nicht mehr selbst
  const { user } = useContext(TwitchAuthContext);
  // Konto ohne Twitch (Discord oder Gast) — dann zeigt der Kopf das Konto statt „Anmelden“
  const { konto } = useKonto();
  // Kanal gerade live? Dann steht in der Kopfzeile ein Hinweis (Backend fragt Twitch, siehe utils/useLiveStatus.js)
  const liveStatus = useLiveStatus();
  // Eine Sprachwahl für die ganze Website (i18n/language.js); Bereiche ohne Englisch bleiben deutsch
  const { lang, setLang } = useLanguage({ supported: HUELLE_TEXTE.langs });
  const t = HUELLE_TEXTE.dict(lang);
  const tb = BARRIEREFREI_TEXTE.dict(lang);
  const kategorien = navigationFuer(lang);
  // Bietet der Browser an, die Website als App zu installieren? (utils/mitteilungen.js) — dann im Handy-Menü
  const installation = useInstallation();

  const [systemBroadcast, setSystemBroadcast] = useState(null);

  // React Router matcht Routen unabhängig von einem abschließenden "/" (/clash-royale UND
  // /clash-royale/ rendern dieselbe Seite) — dieser Vergleich hier war das aber NICHT: ein
  // exakter String-Vergleich auf location.pathname sah bei "/clash-royale/" kein Match mehr,
  // isFullBleedGame kippte auf false, und die Seite bekam plötzlich die normale Polsterung
  // (p-4 md:p-8) und overflow-y-auto statt randlos volle Höhe — genau das sah dann wie ein
  // "Rausgezoomt" mit Rand ringsum aus, obwohl es nur eine falsch behandelte Route war.
  const normalizedPath = location.pathname.length > 1
    ? location.pathname.replace(/\/+$/, "")
    : location.pathname;
  // Spiele haben eigene Hüllen außerhalb von Layout (seit 27.09.2026), die Streamer-Werkzeuge seit
  // 11.11.2026 die gemeinsame Tool-Hülle (components/toolShell/ToolShell.jsx) — hier läuft nur noch
  // die normale, scrollende Seite.

  // Den Ton-Knopf in der Kopfzeile gibt es seit 12.11.2026 nicht mehr: er speicherte nur seinen eigenen
  // Zustand ('globalIsMuted'), keine Seite las ihn. Spiele mit Ton haben eigene Schalter in ihrer Hülle.

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

  // Fenster mit eigenem Look: Fokus hinein, Tab bleibt drin, beim Schließen zurück (ui/useFokusFalle.js)
  const mobilRef = useRef(null);
  const feedbackRef = useRef(null);
  const broadcastRef = useRef(null);
  useFokusFalle(mobilRef, mobileNavOpen, { start: "[data-start-fokus]" });
  useFokusFalle(feedbackRef, feedbackModalOpen, { start: "textarea, [data-start-fokus]" });
  useFokusFalle(broadcastRef, Boolean(systemBroadcast), { start: "[data-start-fokus]" });

  // Seitenwechsel für Screenreader: neuen Seitentitel ansagen und den Fokus an den Anfang des Inhalts setzen, wenn er
  // nicht schon im Inhalt steht (sonst bliebe er auf dem Menüpunkt oder fiele auf <body> zurück). Nicht beim ersten
  // Laden — da liest der Screenreader die Seite ohnehin vor. Der Titel kommt aus SEO.jsx, bei nachgeladenen Seiten
  // etwas später, deshalb die kurze Wartezeit.
  const mainRef = useRef(null);
  const [seitenAnsage, setSeitenAnsage] = useState("");
  const erstesLaden = useRef(true);
  useEffect(() => {
    if (erstesLaden.current) { erstesLaden.current = false; return undefined; }
    setSeitenAnsage("");
    const uhr = setTimeout(() => {
      setSeitenAnsage(tb.seiteGeladen(document.title));
      const aktiv = document.activeElement;
      const offenesFenster = document.querySelector('[aria-modal="true"]');
      if (!offenesFenster && mainRef.current && (!aktiv || aktiv === document.body || !mainRef.current.contains(aktiv))) {
        mainRef.current.focus({ preventScroll: true });
      }
    }, 500);
    return () => clearTimeout(uhr);
    // tb wechselt nur mit der Sprache — die Ansage soll beim Seitenwechsel kommen, nicht beim Sprachwechsel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Escape schließt, was gerade offen ist (Dropdown, Handy-Menü, Feedback-Dialog)
  useEffect(() => {
    if (!mobileNavOpen && !feedbackModalOpen && !openDropdown) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpenDropdown(null);
      setMobileNavOpen(false);
      setFeedbackModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, feedbackModalOpen, openDropdown]);

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

  // Über die ID, nicht den Namen — der ist je nach Sprache ein anderer
  const linkHasDot = (link) =>
    (link.id === "giveaways" && hasActionableGiveaway) ||
    (link.id === "abstimmungen" && hasActionableAbstimmung);

  const categoryHasDot = (cat) => cat.links.some((l) => linkHasDot(l));

  const isCategoryActive = (cat) =>
    normalizedPath === cat.to ||
    cat.links.some((l) => l.to && normalizedPath === l.to);

  const openFeedback = useCallback(() => setFeedbackModalOpen(true), []);

  // Ein Eintrag im Dropdown / Mobile-Menü (interner Link, externer Link oder Aktion)
  const renderNavLink = (link, { onNavigate } = {}) => {
    const Icon = link.locked ? Lock : link.icon;
    const baseClasses =
      "flex items-start gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/5 group";

    const inner = (
      <>
        {Icon && (
          <span className={`mt-0.5 shrink-0 transition-colors ${link.locked ? "text-white/25" : "text-white/50 group-hover:text-violet-300"}`}>
            <Icon size={17} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-2 text-sm font-semibold ${link.locked ? "text-white/55" : "text-white/85 group-hover:text-white"}`}>
            {link.label}
            {linkHasDot(link) && <span className="h-1.5 w-1.5 rounded-full bg-pink-400 shrink-0" />}
            {link.href && <ExternalLink size={11} className="text-white/25 shrink-0" />}
          </span>
          {(link.locked ? link.lockedNote || link.description : link.description) && (
            <span className={`block text-xs leading-snug mt-0.5 ${link.locked ? "text-white/25" : "text-white/55"}`}>
              {link.locked ? link.lockedNote || link.description : link.description}
            </span>
          )}
        </span>
      </>
    );

    // Gesperrt: bleibt sichtbar, ist aber nicht mehr anklickbar. Die Route existiert weiter,
    // wer den Link kennt, kommt also nach wie vor über die URL rein.
    if (link.locked) {
      return (
        <div
          key={link.label}
          aria-disabled="true"
          title={link.lockedNote || t.gesperrt}
          className="flex items-start gap-3 w-full rounded-lg px-3 py-2.5 text-left cursor-not-allowed"
        >
          {inner}
        </div>
      );
    }

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
              <div ref={broadcastRef} role="alertdialog" aria-modal="true"
                  aria-label={systemBroadcast.type === 'warning' ? t.systemWarnung : t.systemHinweis}
                  className="w-full max-w-md panel-strong shadow-2xl shadow-black/60 overflow-hidden">
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
                              {systemBroadcast.type === 'warning' ? t.systemWarnung : t.systemHinweis}
                          </span>
                      </div>

                      <p className="text-white/90 text-sm leading-relaxed mb-6">
                          {systemBroadcast.message}
                      </p>

                      <div className="flex justify-end">
                          <button
                              data-start-fokus
                              onClick={() => setSystemBroadcast(null)}
                              className="bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white font-bold py-2 px-5 rounded-lg transition-colors text-xs uppercase tracking-wider"
                          >
                              {t.verstanden}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Erster Tab-Halt jeder Seite: über Kopf und Menü hinweg direkt in den Inhalt */}
      <a href="#inhalt" className="sprung-link"
        onClick={(e) => { e.preventDefault(); mainRef.current?.focus({ preventScroll: false }); }}>
        {tb.zumInhalt}
      </a>
      {/* Seitenwechsel für Screenreader (siehe Effekt oben) */}
      <div className="sr-only" role="status" aria-live="polite">{seitenAnsage}</div>

      <div className="relative z-10 flex flex-col h-[100dvh] min-h-0 w-full max-w-full overflow-hidden">

        {/* ================= HEADER ================= */}
        <header className="relative z-40 shrink-0 border-b border-white/10 bg-[#0a0a16]/70 backdrop-blur-xl">
          <div className="flex items-center h-16 lg:h-[68px] px-3 sm:px-4 md:px-6 xl:px-10 gap-2 sm:gap-3">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 sm:gap-3 shrink-0 sm:pr-2 lg:pr-6 hover:opacity-80 transition-opacity">
              <img src={logoHeader} alt={t.logo} width="32" height="32" className="h-8 w-auto" />
              <span className="max-[359px]:hidden font-display text-base sm:text-lg font-bold text-white tracking-tight">vnmvalentin</span>
            </Link>

            {/* Desktop-Navigation */}
            <nav aria-label={tb.hauptmenue} className="hidden lg:flex items-stretch self-stretch">
              {kategorien.map((cat) => {
                const active = isCategoryActive(cat);
                const open = openDropdown === cat.key;
                return (
                  <div
                    key={cat.key}
                    className="relative flex items-stretch"
                    onMouseEnter={() => openMenu(cat.key)}
                    onMouseLeave={scheduleClose}
                    // Tastatur: beim Durchtabben öffnet sich das Menü wie beim Überfahren
                    onFocus={() => openMenu(cat.key)}
                    onBlur={scheduleClose}
                  >
                    <Link
                      to={cat.to}
                      aria-haspopup="true"
                      aria-expanded={open}
                      className={`relative flex items-center gap-1.5 px-3 xl:px-5 font-display text-[15px] xl:text-base font-semibold tracking-wide whitespace-nowrap transition-colors ${
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
                        <span className="absolute left-3 right-3 xl:left-5 xl:right-5 -bottom-px h-0.5 bg-violet-400 rounded-full" />
                      )}
                    </Link>

                    {open && (
                      <div className="absolute left-0 top-full pt-1.5 w-[300px] dropdown-in z-50">
                        <div className="panel-strong p-2 shadow-2xl shadow-black/60">
                          <div className="px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/55">
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
              {liveStatus.live && (
                <a
                  href="https://twitch.tv/vnmvalentin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                  title={liveStatus.title ? t.jetztLiveMit(liveStatus.title) : t.jetztLive}
                >
                  <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
                  {/* 768–1279 px nur der Punkt (Text bleibt für Screenreader), unter 640 px gar nicht — dort zeigen Glocke und Startseite den Stream */}
                  <span className="md:max-xl:sr-only">{t.live}</span>
                  {/* Spielname erst ab 1720 px — sonst ragt der Kopf während eines Streams über den Rand */}
                  {liveStatus.game && <span className="hidden min-[1720px]:inline font-normal text-white/50 max-w-[180px] truncate">{liveStatus.game}</span>}
                </a>
              )}
              {/* Neben dem Menü (1024–1535 px) fehlt der Platz, vor allem während eines Streams und mit langem Namen —
                  dort steht die Sprachwahl in der Fußzeile und im Handy-Menü */}
              <div className="hidden md:block lg:hidden 2xl:block">
                <LanguageSwitch lang={lang} langs={HUELLE_TEXTE.langs} onChange={setLang} label={t.sprache} />
              </div>
              {/* Glocke (Glocke.jsx): Updates, Stream live und persönliche Nachrichten — ersetzt den Updates-Link */}
              <SucheKnopf />
              <Glocke />

              {!user && konto ? (
                // Mit Discord oder als Gast angemeldet (utils/konto.js) — Twitch-Bereiche fragen bei Bedarf selbst nach Twitch
                <Link
                  to="/profile"
                  className={`flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-lg border transition-colors ${
                    normalizedPath === "/profile"
                      ? "bg-white/10 border-white/15"
                      : "border-transparent hover:bg-white/5 hover:border-white/10"
                  }`}
                  title={t.profilOeffnen}
                >
                  <KontoBild konto={konto} />
                  <span className="hidden md:flex lg:hidden 2xl:flex flex-col items-start leading-tight">
                    <span className="text-sm font-semibold text-white max-w-[10rem] truncate">{konto.name}</span>
                    <span className="text-[10px] text-white/55 flex items-center gap-1"><UserRound size={9} /> {t.profil}</span>
                  </span>
                </Link>
              ) : !user ? (
                <button
                  onClick={oeffneAnmeldung}
                  className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-2.5 sm:pl-3 sm:pr-4 lg:max-xl:px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  <UserRound size={16} />
                  <span className="max-sm:sr-only lg:max-xl:sr-only">{t.anmelden}</span>
                </button>
              ) : (
                <Link
                  to="/profile"
                  className={`flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-lg border transition-colors ${
                    normalizedPath === "/profile"
                      ? "bg-white/10 border-white/15"
                      : "border-transparent hover:bg-white/5 hover:border-white/10"
                  }`}
                  title={t.profilOeffnen}
                >
                  <img src={user.profileImageUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  <span className="hidden md:flex lg:hidden 2xl:flex flex-col items-start leading-tight">
                    <span className="text-sm font-semibold text-white max-w-[10rem] truncate">{user.displayName}</span>
                    <span className="text-[10px] text-white/55 flex items-center gap-1"><UserRound size={9} /> {t.profil}</span>
                  </span>
                </Link>
              )}

              {/* Mobile Burger */}
              <button
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                title={t.menueOeffnen}
                aria-label={t.menueOeffnen}
                aria-expanded={mobileNavOpen}
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
            <div ref={mobilRef} role="dialog" aria-modal="true" aria-label={tb.hauptmenue}
              className="absolute inset-y-0 left-0 w-[88%] max-w-[360px] bg-[#0c0c18]/95 backdrop-blur-xl border-r border-white/10 flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                <Link to="/" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3">
                  <img src={logoHeader} alt={t.logo} width="28" height="28" className="h-7 w-auto" />
                  <span className="font-display text-base font-bold text-white">vnmvalentin</span>
                </Link>
                <button data-start-fokus onClick={() => setMobileNavOpen(false)} aria-label={t.menueSchliessen} className="p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/5">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                {kategorien.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <div key={cat.key}>
                      <Link
                        to={cat.to}
                        onClick={() => setMobileNavOpen(false)}
                        className="flex items-center gap-2 px-2 mb-1.5 group"
                      >
                        <span className="text-white/50 group-hover:text-violet-300 transition-colors"><Icon size={15} /></span>
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
                  <div className="flex items-center justify-between gap-3 px-3 pb-3">
                    <span className="text-xs font-semibold text-white/55">{t.sprache}</span>
                    <LanguageSwitch lang={lang} langs={HUELLE_TEXTE.langs} onChange={setLang} label={t.sprache} />
                  </div>
                  <Link
                    to="/updates"
                    onClick={() => setMobileNavOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <Newspaper size={17} className="text-white/50" /> {t.updatesNews}
                  </Link>
                  {(user || konto) && (
                    <Link
                      to="/profile"
                      onClick={() => setMobileNavOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      {user
                        ? <img src={user.profileImageUrl} alt="" className="w-6 h-6 rounded-md object-cover" />
                        : <KontoBild konto={konto} className="w-6 h-6 rounded-md" />}
                      {t.meinProfil}
                    </Link>
                  )}
                  {installation.kann && !installation.installiert && (
                    <button
                      type="button"
                      onClick={() => { installieren(); setMobileNavOpen(false); }}
                      className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <Download size={17} className="text-white/50" /> {t.appInstallieren}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Schnellsuche (Strg+K, Knopf oben) — „Feedback“ aus der Seitenliste öffnet das Fenster unten */}
        <Schnellsuche onAktion={(aktion) => { if (aktion === "feedback") setFeedbackModalOpen(true); }} />

        {/* ================= FEEDBACK MODAL ================= */}
        {feedbackModalOpen && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div ref={feedbackRef} role="dialog" aria-modal="true" aria-labelledby="feedback-titel" className="panel-strong p-6 w-full max-w-lg shadow-2xl shadow-black/60 relative flex flex-col gap-4">
                  <button onClick={() => setFeedbackModalOpen(false)} aria-label={t.schliessen} className="absolute top-4 right-4 p-1.5 rounded-lg text-white/55 hover:text-white hover:bg-white/5 transition-colors"><X size={18} /></button>
                  <h2 id="feedback-titel" className="font-display text-xl font-bold text-white">{t.feedback}</h2>
                  {!user && !konto ? (
                      <div className="py-4"><p className="text-white/60 mb-4 text-sm">{t.feedbackLogin}</p><button data-start-fokus onClick={() => { setFeedbackModalOpen(false); oeffneAnmeldung(); }} className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"><UserRound size={16} /> {t.anmelden}</button></div>
                  ) : feedbackStatus === "success" ? (
                      <div className="py-4" role="status"><h3 className="text-lg font-semibold text-white mb-2">{t.gesendet}</h3><p className="text-white/60 text-sm mb-4">{t.danke}</p><button data-start-fokus onClick={() => { setFeedbackModalOpen(false); setFeedbackStatus("idle"); setFeedbackText(""); }} className="bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-lg text-sm transition-colors">{t.schliessen}</button></div>
                  ) : (
                      <>
                          <p id="feedback-frage" className="text-sm text-white/60">{t.feedbackFrage}</p>
                          <textarea aria-labelledby="feedback-titel" aria-describedby="feedback-frage" className="w-full h-32 bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-violet-500 focus:outline-none resize-none custom-scrollbar text-sm transition-colors" placeholder={t.feedbackPlatzhalter} value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} disabled={feedbackStatus === "sending"} />
                          {feedbackStatus === "error" && <p role="alert" className="text-red-400 text-sm">{t.sendeFehler}</p>}
                          <div className="flex justify-end"><button onClick={async () => { if (feedbackText.trim().length < 5) return; setFeedbackStatus("sending"); try { const res = await fetch("/api/feedback/main", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ message: feedbackText, user: user?.displayName || konto?.name, seite: location.pathname }) }); if (res.ok) setFeedbackStatus("success"); else setFeedbackStatus("error"); } catch { setFeedbackStatus("error"); } }} disabled={feedbackText.trim().length < 5 || feedbackStatus === "sending"} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${feedbackText.trim().length < 5 ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500 text-white'}`}>{feedbackStatus === "sending" ? t.sende : t.absenden}</button></div>
                      </>
                  )}
              </div>
           </div>
        )}

        {/* ================= PAGE CONTENT ================= */}
        {/* Hauptbereich: Ziel der Sprungmarke und des Fokus nach einem Seitenwechsel (tabIndex -1: nur per Skript) */}
        <main id="inhalt" ref={mainRef} tabIndex={-1} className="flex-1 overflow-y-auto p-4 md:p-8 relative z-0 custom-scrollbar focus:outline-none">
          {/* Einladungslink: Hinweis für Eingeladene, Annahme nach der Anmeldung (utils/einladung.js) */}
          <EinladungHinweis />
          <Outlet context={{ openFeedback }} />
          <SiteFooter showDirectory={normalizedPath !== "/"} />
        </main>
      </div>
    </div>
  );
}
