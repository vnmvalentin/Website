// ui/WcShell.jsx — Hülle der Win-Challenge-Seiten (Editor, öffentliche Beschreibung, Moderator-
// Ansicht). Seit 11.11.2026 nur noch ein dünner Aufsatz auf die gemeinsame Tool-Hülle
// (components/toolShell/ToolShell.jsx): sie bringt die Sprachwahl in die Mitte der Leiste und gibt
// der Hülle die Sprache für Leiste und Menü mit. Das OBS-Overlay selbst (/WinChallengeOverlay/…) läuft
// NICHT durch diese Hülle. Die Seiten darunter lesen Sprache und Texte über useWcShell() aus ui/shellContext.js.
import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import ToolShell from "../../../components/toolShell/ToolShell";
import LanguageSwitch from "../../../i18n/LanguageSwitch";
import { useWcLanguage } from "../useWcLanguage";
import { WC_LANGS } from "../wcI18n";

export default function WcShell() {
  const { lang, t, changeLang, explicit } = useWcLanguage();
  // Die Moderator-Ansicht läuft über den Link allein — dort gibt es nichts, wofür man sich anmelden müsste.
  const isControl = /^\/winchallengecontrol\//i.test(useLocation().pathname);
  const ctx = useMemo(
    () => ({ lang, t, changeLang, langExplicit: explicit }),
    [lang, t, changeLang, explicit],
  );

  return (
    <ToolShell
      title={t.brand}
      titleTo={`/WinChallenge-Overlay${lang === "de" ? "" : `?lang=${lang}`}`}
      center={<LanguageSwitch lang={lang} langs={WC_LANGS} onChange={changeLang} label={t.language} />}
      hideLogin={isControl}
      lang={lang}
      outletContext={ctx}
    />
  );
}
