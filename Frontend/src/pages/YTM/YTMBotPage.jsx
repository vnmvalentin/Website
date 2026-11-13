import React from "react";
import { Music, MessageSquare, Monitor, Sparkles, Download, Tv2, SkipForward, Laptop2 } from "lucide-react";
import SEO from "../../components/SEO";
import { Page, PageHeader, Section, Button } from "../../components/ui";

const FEATURES = [
  [MessageSquare, "Songrequest per Command oder Channel Points"],
  [Monitor, "Anzeige vom Song und Warteschlange + Kontrolle"],
  [Music, "Hohe Customization der maximalen Länge, geblockte Artists / Nutzer und extra Commands für den Chat"],
  [Tv2, "OBS Overlay — aktueller Song und Queue direkt im Stream anzeigen"],
  [SkipForward, "SongSkip per Chat-Command oder Channel Points"],
  [Laptop2, "Dual PC Unterstützung — Bot läuft auf dem Gaming-PC, OBS auf einem separaten Stream-PC"],
];

export default function YTMBotPage() {
  return (
    <Page width="text" className="py-4 md:py-8 space-y-6">
      <SEO
        title="YouTube Music — Desktop-Bot"
        description="Songrequests mit eigenem Windows-Bot, ohne Streamer.bot."
        path="/tutorial/ytm-bot"
        keywords="YouTube Music, Songrequest, Twitch, Bot, Desktop, GitHub, Deutsch"
      />

      <PageHeader
        icon={Music}
        kicker="Für Streamer"
        title="YouTube Music — Songrequest (Desktop)"
        description="Songrequests mit eigenem Windows-Bot, ohne Streamer.bot."
        className="!mb-0"
      />

      <Button href="https://github.com/vnmvalentin/YTM_Twitch_Bot" size="lg" block icon={Download}>
        Bot auf GitHub (Download / Releases)
      </Button>

      <Section icon={Sparkles} title="Funktionen">
        <ul className="space-y-3 text-sm text-white/80">
          {FEATURES.map(([Icon, text]) => (
            <li key={text} className="flex gap-3">
              <Icon className="w-5 h-5 text-accent-soft/80 shrink-0 mt-0.5" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="rounded-lg overflow-hidden border border-line">
        <img
          src="/media/vorschau_ytmbot.png"
          alt="YTM Bot Vorschau"
          loading="lazy"
          decoding="async"
          className="w-full object-cover"
        />
      </div>
    </Page>
  );
}
