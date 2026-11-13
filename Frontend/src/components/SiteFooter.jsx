// SiteFooter.jsx — Fußzeile unter jedem Seiteninhalt im Website-Layout (pages/Layout.jsx): das Text-Verzeichnis
// aller Bereiche, darunter die Rechtsseiten. Auf der Startseite entfällt das Verzeichnis — dort steht es schon
// im Inhalt. Breite wie die breiten Seiten (Page width="wide"), damit Verzeichnis und Inhalt bündig stehen.
import React from "react";
import SiteDirectory from "./SiteDirectory";
import LegalFooter from "./LegalFooter";

export default function SiteFooter({ showDirectory = true }) {
  return (
    <div className="w-full max-w-7xl mx-auto">
      {showDirectory && (
        <nav aria-label="Alle Bereiche" className="mt-16 md:mt-24 pt-8 md:pt-10 border-t border-line">
          <SiteDirectory />
        </nav>
      )}
      <LegalFooter />
    </div>
  );
}
