// ui/WcShell.jsx — Hülle der Win-Challenge-Seiten (Editor, öffentliche Beschreibung, Moderator-
// Ansicht): eigenes Werkzeug statt Unterseite im Website-Layout. Eine schmale Kopfzeile mit Marke,
// Sprachwahl, Konto und dem Weg zurück zur Website; darunter gehört die ganze Höhe der Seite.
// Das OBS-Overlay selbst (/WinChallengeOverlay/…) läuft NICHT durch diese Hülle. Die Seiten
// darunter lesen Sprache und Texte über useWcShell() aus ui/shellContext.js.
import React, { useContext, useMemo } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ArrowLeft, LogOut, Trophy } from "lucide-react";
import { TwitchAuthContext } from "../../../components/TwitchAuthContext";
import { useWcLanguage } from "../useWcLanguage";
import { WC_LANGS } from "../wcI18n";
import { FlagDE, FlagGB } from "../../../components/Flags";

const LANG_FLAGS = { de: FlagDE, en: FlagGB };
import "./wcTheme.css";

export default function WcShell() {
  const { user, login, logout } = useContext(TwitchAuthContext);
  const { lang, t, changeLang, explicit } = useWcLanguage();
  // Die Moderator-Ansicht läuft über den Link allein — dort gibt es nichts, wofür man sich anmelden müsste.
  const isControl = /^\/winchallengecontrol\//i.test(useLocation().pathname);
  const ctx = useMemo(
    () => ({ lang, t, changeLang, langExplicit: explicit }),
    [lang, t, changeLang, explicit],
  );

  return (
    // Der Grund (Raster, Bänder, Schriftzug) steht in wcTheme.css
    <div className="wc-shell h-dvh flex flex-col text-white overflow-hidden" lang={lang}>
      <div aria-hidden="true" className="wc-mark">WIN</div>
      <header className="relative h-14 shrink-0 flex items-center gap-3 px-3 sm:px-5 border-b border-white/10 bg-[#0d0d14]">
        <Link
          to="/tools"
          title={t.backToSite}
          aria-label={t.backToSite}
          className="p-2 -ml-1 rounded-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <Link to={`/WinChallenge-Overlay${lang === "de" ? "" : `?lang=${lang}`}`} className="flex items-center gap-2.5 min-w-0">
          <span className="wc-badge"><Trophy size={16} strokeWidth={2.5} /></span>
          <span className="font-display text-[17px] font-bold italic uppercase tracking-tight text-white truncate pr-1.5">{t.brand}</span>
        </Link>

        {/* Sprachwahl mit Flaggen: ab mittlerer Breite mittig in der Kopfzeile, auf dem Handy
            (wo die Mitte der Marke gehört) rechts neben dem Konto */}
        <div
          className="ml-auto md:ml-0 md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 flex bg-white/[0.06] rounded-sm p-0.5"
          role="group"
          aria-label={t.language}
        >
          {WC_LANGS.map((l) => {
            const Flag = LANG_FLAGS[l];
            return (
              <button
                key={l}
                onClick={() => changeLang(l)}
                aria-pressed={lang === l}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[3px] text-xs font-bold uppercase transition-colors ${
                  lang === l ? "bg-white/15 text-white" : "text-white/45 hover:text-white"
                }`}
              >
                {Flag && <Flag size={18} />}
                {l}
              </button>
            );
          })}
        </div>

        <div className="md:ml-auto flex items-center gap-2 sm:gap-3">

          {user ? (
            <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-white/10">
              {user.profileImageUrl && (
                <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-sm object-cover" />
              )}
              <span className="hidden sm:inline text-sm font-semibold text-white/80 max-w-[10rem] truncate">
                {user.displayName}
              </span>
              <button
                onClick={logout}
                title={t.logout}
                aria-label={t.logout}
                className="p-2 rounded-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : !isControl && (
            <button
              onClick={() => login()}
              className="px-3.5 py-2 bg-violet-600 hover:bg-violet-500 rounded-sm text-white text-sm font-bold transition-colors"
            >
              {t.login}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 min-h-0 relative">
        <Outlet context={ctx} />
      </main>
    </div>
  );
}
