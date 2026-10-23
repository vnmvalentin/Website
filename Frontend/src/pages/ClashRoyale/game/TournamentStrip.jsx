// Schmale Leiste über dem Spielfeld, solange in der Lobby ein Lobby-Turnier läuft:
//   eigener Draft je Begegnung → um welche Begegnung es gerade geht ("Halbfinale · Bo3: A gegen B")
//   gemeinsamer Draft          → die Paarungen der ersten Runde, das eigene Spiel hervorgehoben
import React from 'react';
import { CrTourneyTrophy } from '../ui/CrIcons';
import { tDict } from '../tournament/tI18n';
import { matchLabel, hasPlayer } from '../tournament/matchLabels';
import { ltDict } from '../lobby/ltourI18n';

export default function TournamentStrip({ lobbyData, myId, lang }) {
  const ltour = lobbyData.ltour;
  const lt = ltDict(lang);
  const tt = tDict(lang);
  const nameOf = (id) => ltour.participants.find(p => p.id === id)?.displayName || tt.tbd;
  const myLtId = (lobbyData.players || []).find(p => p.id === myId)?.ltId || null;
  const labelOf = (m) => (m.stage === 'group' ? tt.roundN(m.round) : matchLabel(m, ltour.matches, tt));

  let content = null;
  const current = ltour.matches.find(m => m.id === ltour.currentMatchId);
  if (current) {
    const mine = hasPlayer(current, myLtId);
    content = (
      <span className={`truncate ${mine ? 'text-[var(--cr-arcade-gold)]' : 'text-white'}`}>
        {lt.stripMatch(`${labelOf(current)} · ${tt.bestOfShort(current.bestOf)}`, nameOf(current.a), nameOf(current.b))}
      </span>
    );
  } else if (ltour.draftingRound) {
    // Runden-Draft: alle Paarungen der Runde, die gerade draftet
    const round = ltour.matches.filter(m => m.wave === ltour.draftingRound && m.a && m.b && m.status === 'pending');
    const roundLabel = round.length && round.every(m => labelOf(m) === labelOf(round[0])) ? labelOf(round[0]) : tt.roundN(ltour.draftingRound);
    const myMatch = round.find(m => hasPlayer(m, myLtId));
    content = (
      <>
        <span className="text-white shrink-0">{lt.stripShared(roundLabel)}</span>
        {myMatch && (
          <span className="text-[var(--cr-arcade-gold)] shrink-0">
            {lt.stripYou(nameOf(myMatch.a === myLtId ? myMatch.b : myMatch.a))}
          </span>
        )}
        <span className="flex gap-1.5 min-w-0 overflow-x-auto custom-scrollbar">
          {round.map(m => (
            <span key={m.id} className={`shrink-0 rounded-md px-2 py-0.5 bg-[#081426] text-xs font-sans ${hasPlayer(m, myLtId) ? 'text-[var(--cr-arcade-gold)]' : 'text-white/70'}`}>
              {nameOf(m.a)} – {nameOf(m.b)}
            </span>
          ))}
        </span>
      </>
    );
  }
  if (!content) return null;

  return (
    <div className="cr-game-header shrink-0 flex items-center gap-2.5 px-3 sm:px-4 py-1.5 font-cr text-sm min-w-0">
      <CrTourneyTrophy size={20} className="shrink-0" />
      {content}
    </div>
  );
}
