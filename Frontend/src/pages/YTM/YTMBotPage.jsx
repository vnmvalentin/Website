import React from "react";
import { Link } from "react-router-dom";
import { Github, Music, MessageSquare, Monitor, Sparkles, Download } from "lucide-react";
import SEO from "../../components/SEO";


export default function YTMBotPage() {
  return (
    <div className="max-w-3xl mx-auto text-white space-y-8 pb-16">
      <SEO
        title="YouTube Music — Desktop-Bot"
        description="Songrequests mit eigenem Windows-Bot, ohne Streamer.bot."
        path="/tutorial/ytm-bot"
        keywords="YouTube Music, Songrequest, Twitch, Bot, Desktop, GitHub, Deutsch"
      />

      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-amber-500/10 border border-white/10 mb-2">
          <Music className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          YouTube Music — Songrequest (Desktop)
        </h1>
      </div>

      <a
        href="https://github.com/vnmvalentin/YTM_Twitch_Bot"
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col sm:flex-row items-center justify-center gap-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold text-lg py-5 px-8 rounded-2xl shadow-lg shadow-fuchsia-900/30 transition-transform hover:scale-[1.01] border border-white/10"
      >
        <div className="flex items-center gap-3">
          <Download className="w-7 h-7 shrink-0" />
          <span>Bot auf GitHub (Download / Releases)</span>
        </div>
      </a>

      <div className="bg-[#18181b] border border-white/10 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-black flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" /> Funktionen
        </h2>
        <ul className="space-y-3 text-sm text-white/80">
          <li className="flex gap-3">
            <MessageSquare className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <span>Songrequest per Command oder Channel Points</span>
          </li>
          <li className="flex gap-3">
            <Monitor className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <span>Anzeige vom Song und Warteschlange + Kontrolle</span>
          </li>
          <li className="flex gap-3">
            <Music className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
            <span>Hohe Customization der maximalen Länge, geblocke Artists/ Nutzer und extra Commands für den Chat</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
