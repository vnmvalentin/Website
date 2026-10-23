// LegalFooter.jsx — schmale Fußzeile mit den Rechtsseiten, unter jedem normalen Seiteninhalt
// (pages/Layout.jsx). Impressum, Datenschutz und der Weg zum Kündigen müssen von jeder Seite aus
// mit einem Klick erreichbar sein.
import React from "react";
import { Link } from "react-router-dom";
import { LEGAL_LINKS, salesVisible } from "../config/legal";

export default function LegalFooter() {
  if (!salesVisible()) return null;
  return (
    <footer className="mt-12 pt-5 pb-2 border-t border-white/10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/40">
      {LEGAL_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className="hover:text-white transition-colors">{l.label}</Link>
      ))}
    </footer>
  );
}
