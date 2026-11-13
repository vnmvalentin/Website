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
import { Home, Compass } from "lucide-react";
import SEO from "../components/SEO";
import { Page, Button } from "../components/ui";

export default function NotFound() {
  return (
    <Page width="narrow" className="text-center py-16 md:py-24">
      <SEO
        title="Seite nicht gefunden"
        description="Diese Seite gibt es nicht (mehr)."
        path="/404"
        noindex
      />

      <p className="font-display text-[64px] md:text-[88px] font-bold leading-none text-white/10 select-none">404</p>

      <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white mt-2">Diese Seite gibt es nicht mehr</h1>
      <p className="text-white/55 text-sm mt-2 leading-relaxed">
        Der Link ist entweder veraltet oder hat sich vertippt. Über die Kategorien findest du alles Aktuelle.
      </p>

      <div className="flex items-center justify-center gap-2 mt-7 flex-wrap">
        <Button to="/" icon={Home}>Zur Startseite</Button>
        <Button to="/tools" variant="secondary" icon={Compass}>Streamer-Tools</Button>
      </div>
    </Page>
  );
}
