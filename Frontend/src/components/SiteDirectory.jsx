// SiteDirectory.jsx — das Text-Verzeichnis der Website: je Bereich die ersten Einträge als Links, der Rest hinter
// „Alle … ansehen". Steht auf der Startseite („Alles auf einen Blick") und als Fußzeile unter jeder Unterseite
// (SiteFooter.jsx). Die Einträge kommen aus config/navigation.js — neue Unterseiten erscheinen von selbst; auf Englisch
// mit den Texten aus config/navigationEnTexte.js.
import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { kategorieFuer } from "../config/navigationEn";
import { useLanguage } from "../i18n/language.js";
import { HUELLE_TEXTE } from "./huelleTexte.js";

const DIRECTORY = ["fun", "clash-royale", "tools", "community"];
const MAX_PER_COLUMN = 6;

export default function SiteDirectory({ className = "" }) {
  const { lang } = useLanguage({ supported: HUELLE_TEXTE.langs });
  const t = HUELLE_TEXTE.dict(lang);
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 ${className}`}>
      {DIRECTORY.map((key) => {
        const cat = kategorieFuer(key, lang);
        if (!cat) return null;
        const links = cat.links.filter((l) => l.to && !l.soon && !l.locked);
        const shown = links.slice(0, MAX_PER_COLUMN);
        return (
          <div key={key} className="min-w-0">
            <Link to={cat.to} className="font-display text-[15px] font-bold text-white hover:text-accent-soft transition-colors">
              {t.verzeichnis[key] || cat.label}
            </Link>
            <ul className="mt-3">
              {shown.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="block py-1.5 text-sm text-white/55 hover:text-white transition-colors truncate">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            {links.length > shown.length && (
              <Link to={cat.to} className="group mt-2 inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors">
                {t.alleAnsehen(links.length)}
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
