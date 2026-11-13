// ShellLegalLinks.jsx — Impressum, Datenschutz & Co. als schmale Zeile für Seiten in eigenen Hüllen (Spiele,
// CR-Hub), die keine Website-Fußzeile haben. Erscheint wie LegalFooter erst, wenn die Rechtsseiten
// freigeschaltet sind (config/legal.js). Aussehen über className, damit es in jeden Look passt.
import React from "react";
import { Link } from "react-router-dom";
import { LEGAL_LINKS, salesVisible } from "../../config/legal";

export default function ShellLegalLinks({ className = "", linkClassName = "" }) {
  if (!salesVisible()) return null;
  return (
    <nav aria-label="Rechtliches" className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs ${className}`}>
      {LEGAL_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className={linkClassName || "opacity-60 hover:opacity-100 transition-opacity"}>{l.label}</Link>
      ))}
    </nav>
  );
}
