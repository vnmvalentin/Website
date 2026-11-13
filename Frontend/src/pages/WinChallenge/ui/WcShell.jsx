// ui/WcShell.jsx — Hülle der Win-Challenge-Seiten (Editor, öffentliche Beschreibung, Moderator-
// Ansicht). Seit 11.11.2026 nur noch ein dünner Aufsatz auf die gemeinsame Tool-Hülle
// (components/toolShell/ToolShell.jsx): sie bringt die Sprachwahl in die Mitte der Leiste und die
// übersetzten Texte mit. Das OBS-Overlay selbst (/WinChallengeOverlay/…) läuft NICHT durch diese
// Hülle. Die Seiten darunter lesen Sprache und Texte über useWcShell() aus ui/shellContext.js.
import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import ToolShell from "../../../components/toolShell/ToolShell";
import { useWcLanguage } from "../useWcLanguage";
import { WC_LANGS } from "../wcI18n";
import { FlagDE, FlagGB } from "../../../components/Flags";

const LANG_FLAGS = { de: FlagDE, en: FlagGB };

export default function WcShell() {
  const { lang, t, changeLang, explicit } = useWcLanguage();
  // Die Moderator-Ansicht läuft über den Link allein — dort gibt es nichts, wofür man sich anmelden müsste.
  const isControl = /^\/winchallengecontrol\//i.test(useLocation().pathname);
  const ctx = useMemo(
    () => ({ lang, t, changeLang, langExplicit: explicit }),
    [lang, t, changeLang, explicit],
  );

  const langSwitch = (
    <div className="flex bg-white/[0.06] rounded-md p-0.5" role="group" aria-label={t.language}>
      {WC_LANGS.map((l) => {
        const Flag = LANG_FLAGS[l];
        return (
          <button
            key={l}
            type="button"
            onClick={() => changeLang(l)}
            aria-pressed={lang === l}
            className={`flex items-center gap-2 px-2 sm:px-2.5 h-8 rounded-[5px] text-xs font-bold uppercase transition-colors ${
              lang === l ? "bg-white/15 text-white" : "text-white/45 hover:text-white"
            }`}
          >
            {Flag && <Flag size={18} />}
            <span className="hidden sm:inline">{l}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <ToolShell
      title={t.brand}
      titleTo={`/WinChallenge-Overlay${lang === "de" ? "" : `?lang=${lang}`}`}
      center={langSwitch}
      hideLogin={isControl}
      lang={lang}
      labels={{ back: t.backToSite, login: t.login, logout: t.logout }}
      outletContext={ctx}
    />
  );
}
