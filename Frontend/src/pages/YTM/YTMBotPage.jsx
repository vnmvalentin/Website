import React from "react";
import { Link } from "react-router-dom";
import { Music, MessageSquare, Monitor, Sparkles, Download, Tv2, SkipForward, Laptop2 } from "lucide-react";
import SEO from "../../components/SEO";


export default function YTMBotPage() {
  return (
    <div className="page-fade max-w-3xl mx-auto text-white space-y-8 pb-16">
      <SEO
        title="YouTube Music — Desktop-Bot"
        description="Songrequests mit eigenem Windows-Bot, ohne Streamer.bot."
        path="/tutorial/ytm-bot"
        keywords="YouTube Music, Songrequest, Twitch, Bot, Desktop, GitHub, Deutsch"
      />

      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 mb-2">
          <Music className="w-7 h-7 text-violet-300" />
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
          YouTube Music — Songrequest (Desktop)
        </h1>
      </div>

      <a
        href="https://github.com/vnmvalentin/YTM_Twitch_Bot"
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col sm:flex-row items-center justify-center gap-4 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-base py-4 px-8 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3">
          <Download className="w-5 h-5 shrink-0" />
          <span>Bot auf GitHub (Download / Releases)</span>
        </div>
      </a>

      <div className="bg-[#12121c] border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-300" /> Funktionen
        </h2>
        <ul className="space-y-3 text-sm text-white/80">
          <li className="flex gap-3">
            <MessageSquare className="w-5 h-5 text-violet-300/80 shrink-0 mt-0.5" />
            <span>Songrequest per Command oder Channel Points</span>
          </li>
          <li className="flex gap-3">
            <Monitor className="w-5 h-5 text-violet-300/80 shrink-0 mt-0.5" />
            <span>Anzeige vom Song und Warteschlange + Kontrolle</span>
          </li>
          <li className="flex gap-3">
            <Music className="w-5 h-5 text-violet-300/80 shrink-0 mt-0.5" />
            <span>Hohe Customization der maximalen Länge, geblockte Artists / Nutzer und extra Commands für den Chat</span>
          </li>
          <li className="flex gap-3">
            <Tv2 className="w-5 h-5 text-violet-300/80 shrink-0 mt-0.5" />
            <span>OBS Overlay — aktueller Song und Queue direkt im Stream anzeigen</span>
          </li>
          <li className="flex gap-3">
            <SkipForward className="w-5 h-5 text-violet-300/80 shrink-0 mt-0.5" />
            <span>SongSkip per Chat-Command oder Channel Points</span>
          </li>
          <li className="flex gap-3">
            <Laptop2 className="w-5 h-5 text-violet-300/80 shrink-0 mt-0.5" />
            <span>Dual PC Unterstützung — Bot läuft auf dem Gaming-PC, OBS auf einem separaten Stream-PC</span>
          </li>
        </ul>
      </div>

      <div className="rounded-xl overflow-hidden border border-white/10">
        <img
          src="/media/vorschau_ytmbot.png"
          alt="YTM Bot Vorschau"
          loading="lazy"
          decoding="async"
          className="w-full object-cover"
        />
      </div>
    </div>
  );
}
