// GuessScaleGamePage.jsx — gemeinsamer Ablauf für alle "Zahl auf einer Skala raten"-Spiele
// (Tempdle, Velocidle, später Probabildle/Duratidle): Einstieg (Favorit, Tagesrätsel vs.
// Übung), Rundenschleife, Ergebnis. Multiplayer läuft bewusst asynchron: jeder spielt das
// gleiche Tagesrätsel für sich, das Ergebnis zählt automatisch für die Bestenliste des Tages
// (siehe dleRoutes.js) — kein Lobby-/Socket-Aufbau nötig.
//
// Extrahiert aus TempdlePage.jsx, als Velocidle als zweites Spiel exakt denselben Ablauf
// brauchte — nur Spielname/-icon/-beschreibung und die Runden-Komponente selbst
// unterscheiden sich zwischen den Spielen, der Rest (Laden, Einreichen, Cache, Zustände)
// war bereits 1:1 identisch.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Star, Loader2 } from 'lucide-react';
import SEO from '../../components/SEO';
import { getRounds, submitDaily, getLeaderboard } from './dleApi';
import { getPlayerKey, getStoredPlayerName, setStoredPlayerName } from './dlePlayerId';
import { useFavorites } from './useFavorites';
import { readCachedResult, writeCachedResult } from './dailyResultCache';
import RoundHistory from './RoundHistory';
import DailyGameResults from './DailyGameResults';

export default function GuessScaleGamePage({
  gameId, gameName, gameSubtitle, icon: Icon, description,
  seoTitle, seoDescription, seoKeywords, seoPath,
  RoundComponent,
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [phase, setPhase] = useState('loading'); // loading | intro | playing | submitting | results | error
  const [error, setError] = useState('');

  const [dailyPreview, setDailyPreview] = useState(null); // { dateKey, unit, rounds, leaderboard, playedCount }
  const [cachedResult, setCachedResult] = useState(null);
  const [playerName, setPlayerName] = useState(getStoredPlayerName() || '');

  const [mode, setMode] = useState('daily');
  const [rounds, setRounds] = useState([]);
  const [unit, setUnit] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playedRounds, setPlayedRounds] = useState([]);
  const [resultData, setResultData] = useState(null);

  const loadIntro = useCallback(async () => {
    setPhase('loading');
    setError('');
    try {
      const daily = await getRounds(gameId, 'daily');
      const lb = await getLeaderboard(gameId, daily.dateKey);
      setDailyPreview({ ...daily, leaderboard: lb.leaderboard, playedCount: lb.playedCount });
      setCachedResult(readCachedResult(gameId, daily.dateKey));
      setPhase('intro');
    } catch (err) {
      setError(err.message || 'Konnte die heutigen Runden nicht laden.');
      setPhase('error');
    }
  }, [gameId]);

  useEffect(() => {
    loadIntro();
  }, [loadIntro]);

  const startDaily = () => {
    if (!dailyPreview) return;
    setStoredPlayerName(playerName);
    setMode('daily');
    setRounds(dailyPreview.rounds);
    setUnit(dailyPreview.unit);
    setCurrentIndex(0);
    setPlayedRounds([]);
    setPhase('playing');
  };

  const startPractice = async () => {
    setPhase('loading');
    try {
      const practice = await getRounds(gameId, 'practice');
      setMode('practice');
      setRounds(practice.rounds);
      setUnit(practice.unit);
      setCurrentIndex(0);
      setPlayedRounds([]);
      setPhase('playing');
    } catch (err) {
      setError(err.message || 'Konnte keine Übungsrunde laden.');
      setPhase('error');
    }
  };

  const viewCachedResult = () => {
    if (!cachedResult || !dailyPreview) return;
    setMode('daily');
    setUnit(dailyPreview.unit);
    setResultData({
      rounds: cachedResult.rounds,
      totalScore: cachedResult.totalScore,
      maxScore: cachedResult.rounds.length * 100,
      dateKey: dailyPreview.dateKey,
      leaderboard: dailyPreview.leaderboard,
      playedCount: dailyPreview.playedCount,
      alreadyPlayed: true,
    });
    setPhase('results');
  };

  const handleRoundDone = async (guess, score) => {
    const finished = [...playedRounds, { ...rounds[currentIndex], guess, score }];
    setPlayedRounds(finished);

    if (currentIndex + 1 < rounds.length) {
      setCurrentIndex(currentIndex + 1);
      return;
    }

    // Letzte Runde fertig
    if (mode === 'practice') {
      setResultData({
        rounds: finished,
        totalScore: finished.reduce((sum, r) => sum + r.score, 0),
        maxScore: finished.length * 100,
        dateKey: null,
        leaderboard: null,
        playedCount: null,
        alreadyPlayed: false,
      });
      setPhase('results');
      return;
    }

    setPhase('submitting');
    try {
      const res = await submitDaily(gameId, {
        dateKey: dailyPreview.dateKey,
        playerKey: getPlayerKey(),
        playerName: playerName || 'Anonym',
        guesses: finished.map((r) => r.guess),
      });
      writeCachedResult(gameId, dailyPreview.dateKey, { rounds: res.result.rounds, totalScore: res.result.totalScore });
      // Für eine genaue Mitspieler-Anzahl reicht die Bestenliste aus der Einsendungsantwort
      // nicht (die liefert kein playedCount mit) — ein zweiter, günstiger Abruf danach.
      const lb = await getLeaderboard(gameId, dailyPreview.dateKey);
      setResultData({
        rounds: res.result.rounds,
        totalScore: res.result.totalScore,
        maxScore: finished.length * 100,
        dateKey: dailyPreview.dateKey,
        leaderboard: lb.leaderboard,
        playedCount: lb.playedCount,
        alreadyPlayed: !!res.alreadyPlayed,
      });
      setPhase('results');
    } catch (err) {
      setError(err.message || 'Einsendung fehlgeschlagen.');
      setPhase('error');
    }
  };

  const alreadyPlayedToday = !!cachedResult;

  return (
    <div className={`page-fade w-full mx-auto px-4 py-8 md:py-14 ${phase === 'playing' ? 'max-w-4xl xl:max-w-[1200px]' : 'max-w-2xl'}`}>
      <SEO title={seoTitle} description={seoDescription} path={seoPath} keywords={seoKeywords} />

      <Link to="/daily" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-6">
        <ArrowLeft size={14} /> Alle Daily Games
      </Link>

      {phase === 'loading' && (
        <div className="panel p-10 flex items-center justify-center gap-2 text-white/50">
          <Loader2 size={18} className="animate-spin" /> Lädt…
        </div>
      )}

      {phase === 'error' && (
        <div className="panel p-6 text-center">
          <p className="text-white/70 text-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={loadIntro}
            className="px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-semibold transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {phase === 'intro' && dailyPreview && (
        <div className="panel p-6 md:p-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-400/20 text-violet-300">
                <Icon size={22} />
              </span>
              <div>
                <h1 className="font-display text-xl font-bold text-white">{gameName}</h1>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-300/70">{gameSubtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleFavorite(gameId)}
              aria-label={isFavorite(gameId) ? 'Von Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              aria-pressed={isFavorite(gameId)}
              className="p-2 rounded-lg text-white/25 hover:text-amber-300 hover:bg-white/[0.06] transition-colors"
            >
              <Star size={18} fill={isFavorite(gameId) ? 'currentColor' : 'none'} className={isFavorite(gameId) ? 'text-amber-300' : ''} />
            </button>
          </div>

          <p className="text-white/50 text-sm leading-relaxed mb-6">{description}</p>

          <div className="panel p-4 mb-6">
            <p className="text-xs text-white/40 mb-3">
              Tagesrätsel vom {dailyPreview.dateKey} — dein Ergebnis zählt automatisch für die
              Bestenliste des Tages ({dailyPreview.playedCount} Mitspieler bisher).
            </p>
            <label className="block text-xs text-white/40 mb-1.5">Dein Name für die Bestenliste</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={24}
              placeholder="Anonym"
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:border-violet-400/50"
            />

            {alreadyPlayedToday ? (
              <button
                type="button"
                onClick={viewCachedResult}
                className="w-full py-3 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-semibold text-sm transition-colors"
              >
                Heutiges Ergebnis ansehen
              </button>
            ) : (
              <button
                type="button"
                onClick={startDaily}
                className="w-full py-3 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-semibold text-sm transition-colors"
              >
                Tagesrätsel starten
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={startPractice}
            className="w-full py-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white font-semibold text-sm transition-colors"
          >
            Nur üben (zählt nicht für die Bestenliste)
          </button>
        </div>
      )}

      {phase === 'playing' && rounds[currentIndex] && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] xl:grid-cols-[220px_minmax(0,1fr)_220px] gap-6 items-start">
          {/* Nur ab xl sichtbar/im Grid — reserviert links denselben Platz wie der Verlauf
              rechts, damit das Hauptfeld (Bild+Regler, das eigentliche Rate-Element) wirklich
              mittig auf dem Bildschirm steht statt vom Verlauf nach links verdrängt zu werden.
              Darunter (lg) reicht der Platz dafür nicht, da bleibt es beim einfachen
              Zwei-Spalten-Nebeneinander. */}
          <div className="hidden xl:block" aria-hidden="true" />
          <RoundComponent
            key={rounds[currentIndex].id}
            round={rounds[currentIndex]}
            unit={unit}
            roundNumber={currentIndex + 1}
            totalRounds={rounds.length}
            onDone={handleRoundDone}
          />
          <RoundHistory rounds={rounds} playedRounds={playedRounds} currentIndex={currentIndex} />
        </div>
      )}

      {phase === 'submitting' && (
        <div className="panel p-10 flex items-center justify-center gap-2 text-white/50">
          <Loader2 size={18} className="animate-spin" /> Ergebnis wird gespeichert…
        </div>
      )}

      {phase === 'results' && resultData && (
        <DailyGameResults
          gameId={gameId}
          gameName={gameName}
          gameSubtitle={gameSubtitle}
          mode={mode}
          rounds={resultData.rounds}
          totalScore={resultData.totalScore}
          maxScore={resultData.maxScore}
          dateKey={resultData.dateKey}
          leaderboard={resultData.leaderboard}
          playedCount={resultData.playedCount}
          unit={unit}
          alreadyPlayed={resultData.alreadyPlayed}
          onPracticeAgain={startPractice}
        />
      )}
    </div>
  );
}
