// SiteFooter.jsx — Fußzeile unter jedem Seiteninhalt im Website-Layout (components/Layout.jsx): das Text-Verzeichnis
// aller Bereiche, die Sprachwahl, darunter die Rechtsseiten. Auf der Startseite entfällt das Verzeichnis — dort steht
// es schon im Inhalt. Breite wie die breiten Seiten (Page width="wide"), damit Verzeichnis und Inhalt bündig stehen.
// Die Sprachwahl steht hier für jede Breite; im Kopf nur, wo neben dem Menü Platz ist.
import React from "react";
import SiteDirectory from "./SiteDirectory";
import LegalFooter from "./LegalFooter";
import LanguageSwitch from "../i18n/LanguageSwitch";
import { useLanguage } from "../i18n/language.js";
import { HUELLE_TEXTE } from "./huelleTexte.js";
import { BARRIEREFREI_TEXTE } from "./barrierefreiTexte.js";
import { Link } from "react-router-dom";
import { Accessibility } from "lucide-react";

export default function SiteFooter({ showDirectory = true }) {
  const { lang, setLang } = useLanguage({ supported: HUELLE_TEXTE.langs });
  const t = HUELLE_TEXTE.dict(lang);
  const tb = BARRIEREFREI_TEXTE.dict(lang);
  return (
    <div className="w-full max-w-7xl mx-auto">
      {showDirectory && (
        <nav aria-label={t.alleBereiche} className="mt-16 md:mt-24 pt-8 md:pt-10 border-t border-line">
          <SiteDirectory />
        </nav>
      )}
      <div className={`flex items-center justify-end gap-3 ${showDirectory ? "mt-10" : "mt-16 md:mt-20"}`}>
        {/* Einstellungen für Barrierefreiheit — von jeder Seite aus erreichbar, auch ohne Rechtsseiten-Leiste */}
        <Link to="/barrierefreiheit" className="mr-auto inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white transition-colors">
          <Accessibility size={14} aria-hidden="true" /> {tb.fussLink}
        </Link>
        <span className="text-xs text-white/55">{t.sprache}</span>
        <LanguageSwitch lang={lang} langs={HUELLE_TEXTE.langs} onChange={setLang} label={t.sprache} />
      </div>
      <LegalFooter />
    </div>
  );
}
