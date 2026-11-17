// ToolShell.jsx — gemeinsame Hülle der Streamer-Werkzeuge (Win Challenge, Twitch-Overlays,
// Stream-Szenen, Bingo, Discord-Bot).
//
// Vorher hatte jedes Werkzeug seine eigene Lösung: die Win Challenge eine eigene Hülle, Discord und
// die Twitch-Overlays legten sich per Portal mit eigener Kopfleiste über die Website, Bingo und die
// Stream-Szenen liefen im normalen Website-Layout. Jetzt überall dieselbe schmale Leiste:
//   Zurück zu den Streamer-Tools · Werkzeug · [Knöpfe der Seite über <ToolHeader>] · Tools-Menü · Konto
// Darunter gehört die ganze Fensterhöhe der Seite (main ist flex-1 min-h-0 relative; Seiten nehmen
// h-full oder <ToolScroll>). OBS-Overlays laufen NICHT durch diese Hülle.
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ArrowLeft, Check, Home, LayoutGrid, LogOut, Wrench } from "lucide-react";
import { TwitchAuthContext } from "../TwitchAuthContext";
import { TwitchLoginButton } from "../ui";
import KontoBild from "../KontoBild";
import Glocke from "../Glocke";
import { useKonto } from "../../utils/konto.js";
import { LEGAL_LINKS, salesVisible } from "../../config/legal";
import { ToolShellContext } from "./toolShellContext";
import { visibleTools, toolForPath, toolLabel } from "./tools";
import { SHELL_TEXT } from "./toolShellText";
import { useLanguage } from "../../i18n/language";
import LanguageSwitch from "../../i18n/LanguageSwitch";

const DE_ONLY = ["de"];

function ToolsMenu({ activeKey, labels, user, lang }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex items-center gap-2.5 w-full h-9 px-3 rounded-md text-sm font-semibold transition-colors";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={labels.menu}
        aria-label={labels.menu}
        className={`w-9 h-9 inline-flex items-center justify-center rounded-md transition-colors ${open ? "bg-white/10 text-white" : "text-white/50 hover:text-white hover:bg-white/5"}`}
      >
        <LayoutGrid size={17} />
      </button>
      {open && (
        <div role="menu" className="dropdown-in absolute right-0 top-full mt-1.5 z-50 w-60 max-w-[calc(100vw-16px)] p-1.5 rounded-lg border border-line bg-surface-raised shadow-2xl shadow-black/60">
          {visibleTools(user).map((t) => { const { key, icon: Icon, to } = t; return (
            <Link key={key} to={to} role="menuitem"
              className={`${item} ${key === activeKey ? "bg-accent/15 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}>
              <Icon size={15} className={key === activeKey ? "text-accent-soft" : "text-white/40"} />
              <span className="flex-1 truncate">{toolLabel(t, lang)}</span>
              {key === activeKey && <Check size={14} className="text-accent-soft" />}
            </Link>
          ); })}
          <div className="my-1.5 border-t border-line" />
          <Link to="/tools" role="menuitem" className={`${item} text-white/70 hover:bg-white/5 hover:text-white`}>
            <Wrench size={15} className="text-white/40" />{labels.allTools}
          </Link>
          <Link to="/" role="menuitem" className={`${item} text-white/70 hover:bg-white/5 hover:text-white`}>
            <Home size={15} className="text-white/40" />{labels.home}
          </Link>
          {salesVisible() && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pt-2 pb-1 mt-1.5 border-t border-line">
              {LEGAL_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="text-[11px] text-white/40 hover:text-white transition-colors">{l.label}</Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {React.ReactNode} [props.title]   Name in der Leiste; sonst aus tools.js nach der Adresse
 * @param {string} [props.titleTo]          wohin der Name führt (Startseite des Werkzeugs)
 * @param {React.ReactNode} [props.center]  feste Mitte der Leiste; ohne Angabe steht dort der Sprachumschalter, wenn
 *                                          das Werkzeug laut tools.js (langs) mehrere Sprachen kann
 * @param {boolean} [props.hideLogin]       kein Anmelde-Knopf (Seiten, die über einen geheimen Link laufen)
 * @param {object} [props.labels]          einzelne Texte der Leiste überschreiben (Schlüssel wie in toolShellText.js)
 * @param {object} [props.outletContext]    wird an die Seiten durchgereicht (useOutletContext)
 * @param {string} [props.lang]             Sprache von Leiste und Menü, wenn ein Aufsatz sie selbst bestimmt (WcShell);
 *                                          sonst die gewählte Sprache, sofern das Werkzeug sie kann, und Deutsch
 */
export default function ToolShell({ title, titleTo, center, hideLogin = false, labels: labelsIn, outletContext, lang: langProp }) {
  const { user, logout } = useContext(TwitchAuthContext);
  const { konto } = useKonto();
  const { pathname } = useLocation();
  const tool = toolForPath(pathname, user);
  // Nur Werkzeuge, die laut tools.js übersetzt sind, folgen der gewählten Sprache — sonst stünde eine englische
  // Leiste über deutschem Inhalt
  const toolLangs = tool?.langs || DE_ONLY;
  const site = useLanguage({ supported: toolLangs });
  const lang = langProp || site.lang;
  const labels = { ...SHELL_TEXT.dict(lang), ...labelsIn };
  const middle = center !== undefined ? center
    : toolLangs.length > 1 ? <LanguageSwitch lang={lang} langs={toolLangs} onChange={site.setLang} label={labels.language} />
    : null;
  const Icon = tool?.icon || Wrench;

  // Platz in der Leiste für <ToolHeader>. Als State statt Ref, damit die Seiten neu zeichnen,
  // sobald er existiert.
  const [headerSlot, setHeaderSlot] = useState(null);
  const ctx = useMemo(() => ({ headerSlot }), [headerSlot]);

  return (
    <ToolShellContext.Provider value={ctx}>
      <div className="h-dvh flex flex-col overflow-hidden bg-[#0b0b11] text-white font-sans" lang={lang}>
        <header className="relative z-40 h-12 shrink-0 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 border-b border-line bg-surface">
          <Link to="/tools" title={labels.back} aria-label={labels.back}
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-md text-white/45 hover:text-white hover:bg-white/5 transition-colors">
            <ArrowLeft size={17} />
          </Link>
          <Link to={titleTo || tool?.to || "/tools"} className="flex items-center gap-2 min-w-0 shrink-0 pr-1">
            <span className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md bg-accent/15 text-accent-soft">
              <Icon size={15} />
            </span>
            <span className="hidden sm:inline font-display text-[15px] font-bold tracking-tight truncate max-w-[14rem]">
              {title || (tool ? toolLabel(tool, lang) : labels.allTools)}
            </span>
          </Link>

          {middle && (
            <div className="md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 shrink-0">{middle}</div>
          )}

          {/* Knöpfe der Seite (ToolHeader) */}
          <div ref={setHeaderSlot} className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2" />

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 pl-1.5 sm:pl-2 border-l border-line">
            {/* Glocke wie auf der Website (Anschluss glocke-huellen) — am Handy fehlt in der Leiste der Platz */}
            <span className="hidden sm:block"><Glocke /></span>
            <ToolsMenu activeKey={tool?.key} labels={labels} user={user} lang={lang} />
            {user ? (
              <>
                <Link to="/profile" title={labels.profile} aria-label={labels.profile}
                  className="h-9 inline-flex items-center gap-2 px-1 sm:pr-2.5 rounded-md hover:bg-white/5 transition-colors">
                  {user.profileImageUrl
                    ? <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-md object-cover" />
                    : <span className="w-7 h-7 rounded-md bg-white/10" />}
                  <span className="hidden lg:inline text-sm font-semibold text-white/80 max-w-[9rem] truncate">{user.displayName}</span>
                </Link>
                <button type="button" onClick={logout} title={labels.logout} aria-label={labels.logout}
                  className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors">
                  <LogOut size={16} />
                </button>
              </>
            ) : konto ? (
              // Mit Discord oder als Gast angemeldet (utils/konto.js) — z. B. im Discord-Dashboard, das kein Twitch braucht.
              // Twitch-Werkzeuge fragen auf ihrer Seite selbst nach Twitch.
              <>
                <Link to="/profile" title={labels.profile} aria-label={labels.profile}
                  className="h-9 inline-flex items-center gap-2 px-1 sm:pr-2.5 rounded-md hover:bg-white/5 transition-colors">
                  <KontoBild konto={konto} className="w-7 h-7 rounded-md" schrift="text-xs" />
                  <span className="hidden lg:inline text-sm font-semibold text-white/80 max-w-[9rem] truncate">{konto.name}</span>
                </Link>
                <button type="button" onClick={logout} title={labels.logout} aria-label={labels.logout}
                  className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors">
                  <LogOut size={16} />
                </button>
              </>
            ) : !hideLogin && (
              <TwitchLoginButton size="sm">
                <span className="hidden sm:inline">{labels.login}</span>
                <span className="sm:hidden">{labels.loginShort}</span>
              </TwitchLoginButton>
            )}
          </div>
        </header>

        <main className="flex-1 min-h-0 relative">
          <Outlet context={outletContext} />
        </main>
      </div>
    </ToolShellContext.Provider>
  );
}
