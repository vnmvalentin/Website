// Kurze Shows im Match-Raum: VS-Bildschirm zum Spielstart und die fallende Krone beim Matchsieg.
// Beide laufen nur, wenn man den Moment live erlebt, schließen sich selbst (Klick überspringt) und
// entfallen mit ausgeschalteten Animationen (CR-Einstellungen) ganz.
import React, { useEffect, useRef } from 'react';
import { RankBadge } from '../lobby/PlayerList';
import { CrKingBlue, CrKingRed, CrTourneyTrophy } from '../ui/CrIcons';
import crownGif from '../../../assets/clashRoyale/ui/crown-animated.webp';
import { useCrPrefs } from '../ui/crPrefs';
import { playSound } from '../ui/sound';

/** Gemeinsames Gerüst: Vollbild-Bühne, Auto-Schließen nach `ms`, Klick schließt sofort. */
function Stage({ ms, sound, onDone, label, children }) {
  const { prefs } = useCrPrefs();
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);
  useEffect(() => {
    if (!prefs.animations) { doneRef.current?.(); return undefined; }
    if (sound) playSound(sound);
    const id = setTimeout(() => doneRef.current?.(), ms);
    return () => clearTimeout(id);
  }, [prefs.animations, ms, sound]);
  if (!prefs.animations) return null;
  return (
    <div className="cr-stage fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-hidden"
      role="dialog" aria-label={label} onClick={() => doneRef.current?.()}>
      {children}
    </div>
  );
}

function SideBanner({ player, side }) {
  const King = side === 'a' ? CrKingBlue : CrKingRed;
  const color = side === 'a' ? 'linear-gradient(to bottom, #3b82f6, #1d4ed8)' : 'linear-gradient(to bottom, #ef4444, #b91c1c)';
  return (
    <div className={`${side === 'a' ? 'cr-vs-left' : 'cr-vs-right'} rounded-2xl px-5 py-4 md:px-8 md:py-6 w-full max-w-[22rem] border-2 border-[rgba(2,8,20,0.6)]`}
      style={{ background: color, boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.3), 0 8px 0 rgba(2,8,20,0.55)' }}>
      {/* Inhalt gegen die Schräge des Banners zurückdrehen */}
      <div style={{ transform: 'skewX(8deg)' }} className={`flex items-center gap-3 ${side === 'b' ? 'flex-row-reverse text-right' : ''}`}>
        <King size={54} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-cr text-white text-2xl md:text-3xl leading-tight truncate" style={{ textShadow: '0 3px 0 rgba(2,8,20,0.5)' }}>
            {player?.displayName || '—'}
          </p>
          <p className="text-white/75 text-xs truncate">{player?.crName}</p>
        </div>
        {player && <RankBadge p={player} />}
      </div>
    </div>
  );
}

/**
 * Großer Countdown über der Seite (Raum: beide bereit → Spielstart). endsAt in Client-Zeit; zeigt die
 * verbleibenden Sekunden, tickt hörbar und verschwindet bei 0. Ohne Animationen bleibt die Zahl, nur ohne Bewegung.
 */
export function BigCountdown({ endsAt, label }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const left = Math.ceil((endsAt - now) / 1000);
  const lastRef = useRef(null);
  useEffect(() => {
    if (left > 0 && left !== lastRef.current) { lastRef.current = left; playSound('count'); }
  }, [left]);
  if (left <= 0) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/55 pointer-events-none" role="status" aria-label={label}>
      <span key={left} className="cr-count-in font-cr text-[9rem] md:text-[12rem] leading-none text-[var(--cr-arcade-gold)]"
        style={{ textShadow: '0 8px 0 rgba(2,8,20,0.7)' }}>{left}</span>
      <span className="font-cr text-white text-xl mt-2" style={{ textShadow: '0 2px 0 rgba(2,8,20,0.7)' }}>{label}</span>
    </div>
  );
}

/** VS-Bildschirm beim Start eines Spiels. */
export function MatchIntro({ players, gameNo, bestOf, t, onDone }) {
  return (
    <Stage ms={2300} sound="start" onDone={onDone} label="VS">
      <div className="w-full max-w-4xl flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
        <SideBanner player={players.a} side="a" />
        <div className="cr-vs-text shrink-0 text-center">
          <p className="font-cr text-6xl md:text-7xl text-[var(--cr-arcade-gold)]" style={{ textShadow: '0 4px 0 rgba(2,8,20,0.7)' }}>VS</p>
          <p className="cr-eyebrow mt-1">{t.gameN(gameNo)} · {t.bestOfShort(bestOf)}</p>
        </div>
        <SideBanner player={players.b} side="b" />
      </div>
    </Stage>
  );
}

/** Matchsieg: Krone fällt auf den Gewinner (Ton spielt der Raum schon beim entscheidenden Spiel). */
export function MatchWin({ winner, side, scoreA, scoreB, t, onDone }) {
  return (
    <Stage ms={3200} sound={null} onDone={onDone} label={t.matchWonBy(winner?.displayName || '')}>
      <div className="flex flex-col items-center text-center">
        <img src={crownGif} alt="" className="cr-crown-drop h-24 md:h-28 w-auto -mb-3 relative z-10 drop-shadow-[0_6px_6px_rgba(2,8,20,0.5)]" />
        <div className="cr-win-pop rounded-2xl px-8 py-5 border-2 border-[var(--cr-arcade-gold)]"
          style={{ background: side === 'a' ? 'linear-gradient(to bottom, #3b82f6, #1d4ed8)' : 'linear-gradient(to bottom, #ef4444, #b91c1c)', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.3), 0 8px 0 rgba(2,8,20,0.55)' }}>
          <p className="font-cr text-white text-3xl md:text-4xl" style={{ textShadow: '0 3px 0 rgba(2,8,20,0.5)' }}>{winner?.displayName}</p>
        </div>
        <p className="font-cr text-[var(--cr-arcade-gold)] text-2xl mt-4 flex items-center gap-2">
          <CrTourneyTrophy size={32} />{t.matchWonBy(winner?.displayName || '')}
        </p>
        <p className="font-cr text-white/80 text-xl mt-1 tabular-nums">{scoreA} : {scoreB}</p>
      </div>
    </Stage>
  );
}
