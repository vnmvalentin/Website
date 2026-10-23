// StreamerToolsPage.jsx — /tools „Für Streamer": eine Vorschau-Karte je Tool (components/TileCard.jsx, Bilder aus
// navigation.js → previews; das Twitch-Overlay-Tool wechselt durch seine Module), daneben die Overlay-Galerie als
// eigene Seite (/tools/vorlagen) und „In 2 Minuten in OBS". Gleiche Karten wie Startseite und /fun, /clash, /community.
// Ersetzt die generische Kategorieseite an derselben Adresse (vorgerendert, siehe prerender.js).
import React from "react";
import { Copy, LayoutTemplate, MonitorPlay, MousePointerClick } from "lucide-react";
import SEO from "../../components/SEO";
import TileCard from "../../components/TileCard";
import { getCategory } from "../../config/navigation";

const STEPS = [
  { icon: MousePointerClick, title: "Tool öffnen und anmelden", text: "Mit Twitch anmelden, Overlay nach Geschmack einstellen — die Vorschau zeigt sofort, wie es im Stream aussieht." },
  { icon: Copy, title: "Overlay-Link kopieren", text: "Jedes Tool hat seinen eigenen, privaten Link. Den nicht im Stream zeigen." },
  { icon: MonitorPlay, title: "In OBS als Browserquelle einfügen", text: "Quelle hinzufügen → Browser → Link einfügen. Die passende Größe steht im Tool, bei den Twitch-Overlays z. B. 1920 × 1080." },
];

export default function StreamerToolsPage() {
  const category = getCategory("tools");
  // Nur allgemeine Streamer-Tools — der Win Tracker ist Clash-Royale-spezifisch und steht unter Clash Royale
  const tools = category.links.filter((l) => l && !l.soon && !l.locked);
  const galleryImages = ["/media/previews/twitch-prediction.webp", "/media/previews/twitch-goal.webp", "/media/previews/win-challenge.webp"];

  return (
    <div className="page-fade w-full max-w-7xl mx-auto px-2 md:px-4 py-8 md:py-14">
      <SEO
        title={category.seoTitle || category.label}
        description={category.seoDescription || category.description}
        keywords={category.keywords}
        path={category.to}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Startseite", item: "https://vnmvalentin.de" },
              { "@type": "ListItem", position: 2, name: category.label, item: `https://vnmvalentin.de${category.to}` },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: category.label,
            itemListElement: tools.map((l, i) => ({ "@type": "ListItem", position: i + 1, name: l.label, description: l.description, url: `https://vnmvalentin.de${l.to}` })),
          },
        ]}
      />

      <header className="mb-10 md:mb-12 max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-2">Für Streamer</p>
        <h1 className="font-display text-3xl md:text-5xl font-bold text-white tracking-tight mb-4">Overlays & Tools für deinen Stream</h1>
        <p className="text-white/55 text-sm md:text-base leading-relaxed">
          Kostenlos und ohne Download: einstellen, Link kopieren, in OBS einfügen.
        </p>
      </header>

      <section aria-label="Tools" className="mb-14 md:mb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-7">
          {tools.map((l, i) => (
            <TileCard key={l.to} index={i} to={l.to} title={l.label} text={l.description} images={l.previews || []} icon={l.icon} />
          ))}
          <TileCard
            index={tools.length}
            to="/tools/vorlagen"
            kicker="Galerie"
            title="Overlay-Vorlagen"
            text="Fertige Looks für Win Tracker, Win Challenge und die Twitch-Overlays — mit einem Klick übernehmen."
            images={galleryImages}
            icon={LayoutTemplate}
          />
        </div>
      </section>

      <section id="obs" aria-labelledby="st-obs" className="scroll-mt-6">
        <h2 id="st-obs" className="font-display text-xl md:text-2xl font-bold text-white tracking-tight mb-5">In 2 Minuten in OBS</h2>
        <ol className="grid grid-cols-1 md:grid-cols-3 rounded-xl border border-white/10 bg-[#101016] divide-y md:divide-y-0 md:divide-x divide-white/10">
          {STEPS.map((s, i) => (
            <li key={s.title} className="p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-display text-2xl font-bold text-white/30 tabular-nums">{i + 1}</span>
                <s.icon size={18} className="text-violet-300" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-white mb-1.5">{s.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
