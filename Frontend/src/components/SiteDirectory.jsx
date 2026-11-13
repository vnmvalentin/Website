// SiteDirectory.jsx — das Text-Verzeichnis der Website: je Bereich die ersten Einträge als Links, der Rest hinter
// „Alle … ansehen". Steht auf der Startseite („Alles auf einen Blick") und als Fußzeile unter jeder Unterseite
// (SiteFooter.jsx). Die Einträge kommen aus config/navigation.js — neue Unterseiten erscheinen von selbst.
import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { getCategory } from "../config/navigation";

const DIRECTORY = [
  { key: "fun", label: "Browserspiele" },
  { key: "clash-royale", label: "Clash Royale" },
  { key: "tools", label: "Für Streamer" },
  { key: "community", label: "Community" },
];
const MAX_PER_COLUMN = 6;

export default function SiteDirectory({ className = "" }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 ${className}`}>
      {DIRECTORY.map((d) => {
        const cat = getCategory(d.key);
        if (!cat) return null;
        const links = cat.links.filter((l) => l.to && !l.soon && !l.locked);
        const shown = links.slice(0, MAX_PER_COLUMN);
        return (
          <div key={d.key} className="min-w-0">
            <Link to={cat.to} className="font-display text-[15px] font-bold text-white hover:text-accent-soft transition-colors">
              {d.label}
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
              <Link to={cat.to} className="group mt-2 inline-flex items-center gap-1.5 text-sm text-white/35 hover:text-white transition-colors">
                Alle {links.length} ansehen
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
