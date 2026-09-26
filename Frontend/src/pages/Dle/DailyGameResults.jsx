// DailyGameResults.jsx — Endergebnis für jedes -dle-Spiel: Gesamtpunktzahl, Runden-Rückblick,
// Bestenliste (nur Tagesmodus) und Teilen-Buttons. Spielunabhängig bis auf gameId/gameName/
// gameSubtitle (fürs Teilen-Bild und den Dateinamen) — deshalb hier auf Dle-Ebene statt in
// einem einzelnen Spielordner, seit Velocidle als zweites Spiel dieselbe Ergebnis-Logik
// braucht.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, RotateCcw, Trophy, ArrowLeft, Copy, Check, AlertCircle } from 'lucide-react';
import { generateShareCard, downloadShareCard } from './shareCard';

// navigator.clipboard.write mit einem image/png-ClipboardItem ist der einzige Weg, ein Bild
// per Strg+V direkt in Discord/Slack/etc. einfügbar zu machen (ein <a download> tut das
// nicht — der Nutzer müsste die Datei erst öffnen und dann von dort kopieren). Chrome/Edge/
// Firefox aktuell unterstützt, Safari nur teilweise — deshalb Feature-Check und ein Fallback,
// der den Button einfach ausblendet statt kaputt zu wirken.
const CLIPBOARD_IMAGE_SUPPORTED =
  typeof navigator !== 'undefined' && !!navigator.clipboard?.write && typeof window !== 'undefined' && 'ClipboardItem' in window;

export default function DailyGameResults({
  gameId, gameName, gameSubtitle,
  mode, rounds, totalScore, maxScore, dateKey, leaderboard, playedCount, unit, alreadyPlayed, onPracticeAgain,
}) {
  const [sharing, setSharing] = useState(false);
  const [copyState, setCopyState] = useState('idle'); // idle | copying | copied | error

  const buildShareCard = () =>
    generateShareCard({
      gameName,
      gameSubtitle: `${gameSubtitle} — ${mode === 'daily' ? 'Tagesrätsel' : 'Übung'}`,
      dateKey,
      rounds: rounds.map((r) => ({ score: r.score })),
      totalScore,
      maxScore,
    });

  const handleShare = async () => {
    setSharing(true);
    try {
      const blob = await buildShareCard();
      downloadShareCard(blob, `${gameId}-${dateKey || 'uebung'}.png`);
    } finally {
      setSharing(false);
    }
  };

  const handleCopy = async () => {
    setCopyState('copying');
    try {
      const blob = await buildShareCard();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2500);
    }
  };

  return (
    <div className="panel p-6 md:p-8">
      <div className="text-center mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-violet-300/80 mb-2">
          {mode === 'daily' ? `Tagesrätsel — ${dateKey}` : 'Übungsrunde'}
        </p>
        <p className="font-display text-6xl font-bold text-white tabular-nums">{totalScore}</p>
        <p className="text-white/40 text-sm mt-1">von {maxScore} Punkten</p>
        {alreadyPlayed && (
          <p className="text-xs text-amber-300/80 mt-3">
            Du hast heute schon mitgespielt — das ist dein gespeichertes Ergebnis von vorhin.
          </p>
        )}
      </div>

      <div className="space-y-2 mb-8">
        {rounds.map((r, i) => (
          <div key={r.id || i} className="flex items-center justify-between panel p-3">
            <div className="min-w-0 pr-3">
              <p className="text-white text-sm font-semibold truncate">{r.label}</p>
              <p className="text-white/40 text-xs tabular-nums">{r.guess}{r.unit ?? unit} geraten — richtig war {r.value}{r.unit ?? unit}</p>
            </div>
            <span className="shrink-0 text-white font-bold tabular-nums bg-violet-500/15 border border-violet-400/20 rounded-lg px-2.5 py-1 text-sm">
              {r.score}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
        >
          <Download size={16} /> {sharing ? 'Bild wird erstellt…' : 'Ergebnis-Bild speichern'}
        </button>
        {CLIPBOARD_IMAGE_SUPPORTED && (
          <button
            type="button"
            onClick={handleCopy}
            disabled={copyState === 'copying'}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 disabled:opacity-60 text-white font-semibold text-sm transition-colors"
            title="Danach z.B. mit Strg+V direkt in Discord einfügen"
          >
            {copyState === 'copied' ? (
              <><Check size={16} className="text-emerald-400" /> Kopiert!</>
            ) : copyState === 'error' ? (
              <><AlertCircle size={16} className="text-red-400" /> Fehlgeschlagen</>
            ) : (
              <><Copy size={16} /> {copyState === 'copying' ? 'Wird kopiert…' : 'In Zwischenablage kopieren'}</>
            )}
          </button>
        )}
        {mode === 'practice' && (
          <button
            type="button"
            onClick={onPracticeAgain}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white font-semibold text-sm transition-colors"
          >
            <RotateCcw size={16} /> Nochmal üben
          </button>
        )}
      </div>

      {mode === 'daily' && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={16} className="text-amber-300" />
            <h3 className="text-white font-semibold text-sm">
              Bestenliste heute {typeof playedCount === 'number' ? `(${playedCount} Mitspieler)` : ''}
            </h3>
          </div>
          <div className="space-y-1.5">
            {leaderboard?.length ? (
              leaderboard.map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-sm panel p-2.5">
                  <span className="text-white/70">
                    <span className="text-white/30 tabular-nums mr-2">#{i + 1}</span>
                    {entry.playerName}
                  </span>
                  <span className="text-white font-bold tabular-nums">{entry.totalScore}</span>
                </div>
              ))
            ) : (
              <p className="text-white/30 text-sm">Noch keine Einträge.</p>
            )}
          </div>
        </div>
      )}

      <Link to="/daily" className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors">
        <ArrowLeft size={14} /> Zurück zu Daily Games
      </Link>
    </div>
  );
}
