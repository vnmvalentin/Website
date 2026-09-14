// CrColorMatchPage.jsx — "CR Color Match". Nutzt denselben Ablauf wie alle anderen -dle-Spiele
// (GuessScaleGamePage.jsx: Einstieg, Rundenschleife, Ergebnis, Bestenliste) — obwohl hier
// keine Zahl auf einer Skala geraten wird, sondern eine Farbe. GuessScaleGamePage.jsx ist dem
// Ratewert selbst gegenüber komplett neutral (reicht `guess`/`score` nur durch), das
// Farb-spezifische steckt komplett in CrColorMatchRound.jsx — siehe dort.
//
// Gesperrt, solange gamesConfig.js's Eintrag nicht `status: 'live'` ist (siehe dortiger
// Kommentar) — die Hub-Kachel (DleHubPage.jsx) zeigt in diesem Zustand schon "Bald verfügbar"
// und ist nicht anklickbar, das reicht aber allein nicht: wer die URL direkt aufruft oder einen
// alten Link/Bookmark nutzt, würde sonst trotzdem am Spiel selbst vorbeikommen. Diese Seite
// prüft den Status deshalb selbst noch einmal und zeigt sonst denselben Platzhalter.
import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, Palette } from 'lucide-react';
import SEO from '../../../components/SEO';
import GuessScaleGamePage from '../GuessScaleGamePage';
import CrColorMatchRound from './CrColorMatchRound';
import { getDleGame } from '../gamesConfig';

function ComingSoonPage() {
  return (
    <div className="page-fade w-full max-w-2xl mx-auto px-4 py-8 md:py-14">
      <SEO
        title="CR Color Match — bald verfügbar"
        description="CR Color Match ist noch in Arbeit und bald als tägliches Rätsel verfügbar."
        path="/daily/cr-color-match"
      />
      <Link to="/daily" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-6">
        <ArrowLeft size={14} /> Alle Daily Games
      </Link>
      <div className="panel p-8 text-center">
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-400/20 text-violet-300 mb-5">
          <Palette size={26} />
        </span>
        <h1 className="font-display text-xl font-bold text-white mb-2">CR Color Match</h1>
        <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white/40 mb-4">
          <Lock size={13} /> Bald verfügbar
        </p>
        <p className="text-white/50 text-sm leading-relaxed">
          Dieses Spiel wird gerade noch nachjustiert, damit die Kartenflächen sauber getroffen
          werden. Schau bald wieder vorbei!
        </p>
      </div>
    </div>
  );
}

export default function CrColorMatchPage() {
  if (getDleGame('cr-color-match')?.status !== 'live') {
    return <ComingSoonPage />;
  }

  return (
    <GuessScaleGamePage
      gameId="cr-color-match"
      gameName="CR Color Match"
      gameSubtitle="Clash Royale"
      icon={Palette}
      description="Färbe in 5 Runden eine markante Stelle einer Clash-Royale-Karte so ein, wie du sie in Erinnerung hast — ganz ohne Vorlage. Je näher deine Farbe an der echten dran ist, desto mehr Punkte."
      seoTitle="CR Color Match — Clash Royale Farbraten"
      seoDescription="Triff aus dem Gedächtnis die exakte Farbe markanter Clash-Royale-Karten. Fünf Runden pro Tag, Bestenliste inklusive."
      seoPath="/daily/cr-color-match"
      seoKeywords="CR Color Match, Clash Royale Farben raten, Karten Quiz, tägliches Rätsel"
      RoundComponent={CrColorMatchRound}
    />
  );
}
