// NotFound.jsx — greift für jede URL, die es nicht (mehr) gibt.
//
// Warum das für die Suche wichtig ist: Eine SPA liefert für JEDEN Pfad die
// index.html mit Status 200. Ohne diese Route rendert React bei unbekannten
// Pfaden gar nichts — der Crawler sieht also eine leere Seite mit Status 200 und
// parkt sie dauerhaft unter "Gecrawlt – zurzeit nicht indexiert". Genau das ist
// mit alten Pfaden wie /session, /About-Me, /Games oder /pond passiert.
//
// Das noindex hier ist das Signal, mit dem Google sie wieder aus dem Index
// nimmt. Einen echten 404-Status kann nur der Webserver liefern (siehe die
// nginx-Regeln in der Projektdoku) — das noindex wirkt aber unabhängig davon.
import React from "react";
import { Link } from "react-router-dom";
import { Home, Compass } from "lucide-react";
import SEO from "../components/SEO";

export default function NotFound() {
  return (
    <div className="page-fade max-w-xl mx-auto text-center py-16 md:py-24">
      <SEO
        title="Seite nicht gefunden"
        description="Diese Seite gibt es nicht (mehr)."
        path="/404"
        noindex
      />

      <p className="text-[64px] md:text-[88px] font-black leading-none text-white/10 select-none">404</p>

      <h1 className="text-xl md:text-2xl font-black text-white mt-2">Diese Seite gibt es nicht mehr</h1>
      <p className="text-gray-500 text-sm mt-2 leading-relaxed">
        Der Link ist entweder veraltet oder hat sich vertippt. Über die Kategorien findest du alles Aktuelle.
      </p>

      <div className="flex items-center justify-center gap-2 mt-7 flex-wrap">
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          <Home size={15} />
          Zur Startseite
        </Link>
        <Link
          to="/tools"
          className="inline-flex items-center gap-2 bg-white/[0.03] border border-white/10 hover:border-white/25 text-gray-300 hover:text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          <Compass size={15} />
          Streamer-Tools
        </Link>
      </div>
    </div>
  );
}
