// Turnier-Bausteine für die normale Minigame-Lobby und den Endbildschirm: Hinweis-Banner in einer
// Turnier-Draft-Lobby und der Rückweg in den Match-Raum.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import ChunkyButton from '../ui/ChunkyButton';
import { CrTourneyTrophy, CrCheck, CrClock } from '../ui/CrIcons';
import { tDict } from './tI18n';
import { withLang } from './tournamentApi';

/** Banner über der Lobby: welches Turnier-Match, und dass es von selbst startet. */
export function TournamentLobbyBanner({ tournament, players = [], lang }) {
  const t = tDict(lang);
  const sides = ['a', 'b'].map(side => players.find(p => p.tournamentSide === side && !p.disconnected));
  return (
    <div className="cr-arcade-panel cr-anim-rise px-4 py-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <CrTourneyTrophy size={40} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-cr text-white text-lg leading-tight truncate">{t.lobbyBannerTitle(tournament.name, tournament.gameNo)}</p>
        <p className="text-white/55 text-xs">{t.lobbyBannerText}</p>
      </div>
      <div className="flex items-center gap-2">
        {sides.map((p, i) => (
          <span key={i} className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${
            p ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10' : 'text-white/45 border-white/10 bg-black/20'
          }`}>
            {p ? <CrCheck size={14} /> : <CrClock size={14} />}
            {p ? p.name : (i === 0 ? 'A' : 'B')}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Endbildschirm einer Turnier-Lobby: Lobby verlassen (Sitzung beenden) und zurück in den Match-Raum. */
export function BackToTournamentButton({ tournament, lang, onLeave }) {
  const t = tDict(lang);
  const navigate = useNavigate();
  const go = () => {
    onLeave?.();
    navigate(withLang(`/clash-royale/turnier/${tournament.id}`, lang) + `${lang && lang !== 'de' ? '&' : '?'}tab=raum&match=${encodeURIComponent(tournament.matchId)}`);
  };
  return (
    <ChunkyButton variant="gold" size="sm" icon={CrTourneyTrophy} onClick={go}>
      {t.backToRoom}
    </ChunkyButton>
  );
}
