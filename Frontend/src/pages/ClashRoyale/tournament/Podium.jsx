// Siegerehrung (Phase 6): Podest mit 1., 2. und 3. Platz, sobald das Turnier entschieden ist.
// Platz 2 links, Platz 1 in der Mitte (höchster Sockel), Platz 3 rechts — bei Single Elimination teilen
// sich die beiden Halbfinal-Verlierer den dritten Platz (es gibt kein Spiel um Platz 3).
// Daten: structure.podium (Backend structure.podiumOf).
import React from 'react';
import { RankBadge } from '../lobby/PlayerList';
import { CrTourneyTrophy, CrCrown, CrKingBlue } from '../ui/CrIcons';

// Sockelfarben Gold/Silber/Bronze — Verläufe nur auf den Flächen, nie auf Text
const PLACES = {
  1: { height: 'h-36 md:h-44', face: 'from-[#ffd75e] to-[#d99b16]', edge: '#8a5a06', delay: '0.35s' },
  2: { height: 'h-24 md:h-32', face: 'from-[#e6edf5] to-[#9fb0c4]', edge: '#56657a', delay: '0.15s' },
  3: { height: 'h-16 md:h-24', face: 'from-[#f0a873] to-[#b8693a]', edge: '#6b3a1c', delay: '0s' },
};

function Step({ place, players, me, t }) {
  const P = PLACES[place];
  return (
    <div className="flex flex-col items-center justify-end min-w-0 flex-1 max-w-[15rem] cr-anim-rise" style={{ animationDelay: P.delay }}>
      {place === 1 && <CrTourneyTrophy size={72} className="cr-win-pop mb-1" />}
      <div className="flex flex-col items-center gap-1.5 mb-2 w-full">
        {players.map(p => (
          <div key={p.id} className={`cr-row w-full px-2 sm:px-2.5 py-1.5 flex items-center gap-2 ${me?.id === p.id ? 'cr-row--me' : ''}`}>
            <div className="min-w-0 flex-1 text-center">
              {/* Auf dem Handy nur der Name (darf umbrechen) — CR-Name und Liga erst ab sm */}
              <p className={`font-cr text-white leading-tight break-words sm:truncate ${place === 1 ? 'text-base sm:text-lg' : 'text-sm sm:text-[15px]'}`}>
                {place === 1 && <CrCrown size={18} className="hidden sm:inline-block mr-1 -mt-1" />}{p.displayName}
              </p>
              <p className="hidden sm:flex text-white/45 text-[11px] truncate items-center justify-center gap-1"><CrKingBlue size={11} />{p.crName}</p>
            </div>
            <span className="hidden sm:block"><RankBadge p={p} /></span>
          </div>
        ))}
      </div>
      <div className={`w-full ${P.height} rounded-t-xl bg-gradient-to-b ${P.face} flex items-start justify-center pt-2`}
        style={{ boxShadow: `inset 0 2px 0 rgba(255,255,255,0.45), inset 0 -6px 0 ${P.edge}55, 0 6px 0 ${P.edge}` }}>
        <span className="font-cr text-3xl md:text-4xl" style={{ color: P.edge, textShadow: '0 1px 0 rgba(255,255,255,0.4)' }}>{place}</span>
      </div>
      <p className="cr-eyebrow mt-2">{t.placeLabel(place)}</p>
    </div>
  );
}

export default function Podium({ podium, byId, me, t }) {
  if (!podium) return null;
  const pick = (ids) => ids.map(id => byId.get(id)).filter(Boolean);
  const first = pick([podium.first]), second = pick([podium.second].filter(Boolean)), third = pick(podium.third || []);
  const myPlace = me ? (podium.first === me.id ? 1 : podium.second === me.id ? 2 : (podium.third || []).includes(me.id) ? 3 : null) : null;
  return (
    <div className="cr-arcade-panel overflow-hidden">
      <div className="cr-section">
        <h2 className="cr-section-title text-xl justify-center"><CrTourneyTrophy size={28} />{t.podiumTitle}</h2>
        {myPlace && (
          <p className="text-center font-cr text-[var(--cr-arcade-gold)] text-lg mt-1">{myPlace === 1 ? t.youWon : t.youPlaced(myPlace)}</p>
        )}
        <div className="flex items-end justify-center gap-2 md:gap-4 mt-4 px-1">
          {second.length > 0 && <Step place={2} players={second} me={me} t={t} />}
          <Step place={1} players={first} me={me} t={t} />
          {third.length > 0 && <Step place={3} players={third} me={me} t={t} />}
        </div>
      </div>
    </div>
  );
}
