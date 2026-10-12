// Abgeleiteter Zustand von Elixir Auction 2v2 (2 bis 4 Teams à 2).
//
// Hinweis-Phase: alle Karten der eigenen Seite liegen nebeneinander, unter jeder wählt man
// direkt 2 Merkmale und schickt sie pro Karte ab. Gebot-Phase: wie in der Solo-Auktion legt
// der Regler in der Fußzeile den Betrag fest, ein Klick auf EINE der verdeckten Karten bietet
// ihn — ein Gebot pro Runde.

import { useEffect, useState } from 'react';

export function useAuction2v2View({ auctionState, revealState, myPlayerId, onBid, onSendHint }) {
  const state = revealState || auctionState;

  // { kartenIndex: [tagId, tagId] } — lokale Auswahl, bis "Senden" gedrückt wird
  const [selectedByCard, setSelectedByCard] = useState({});
  const [bidAmount, setBidAmount] = useState(0);

  // Neue Runde oder Phasenwechsel → lokale Auswahl/Eingabe zurücksetzen
  useEffect(() => {
    setSelectedByCard({});
    setBidAmount(0);
  }, [state?.round, state?.phase]);

  if (!state) return { ready: false };

  const {
    phase, round, maxRounds, timerRemaining, timerSeconds,
    teamElixir = {}, teamPool, teamIds = ['A', 'B'], players = [], myRole,
    cardsPerSide = 0,
  } = state;
  const mySentHints = state.mySentHints || {};
  const myBid = state.myBid || null;

  const me = players.find(p => p.id === myPlayerId);
  const myTeam = myRole?.team || null;
  const partner = myRole?.partner ? players.find(p => p.id === myRole.partner.id) || myRole.partner : null;
  const myPoolAmount = myTeam ? (teamElixir[myTeam] ?? 0) : 0;
  const myAvailable = myPoolAmount;

  const toggleTag = (cardIdx, tagId) => {
    if (mySentHints[cardIdx] != null) return;
    setSelectedByCard(prev => {
      const cur = prev[cardIdx] || [];
      if (cur.includes(tagId)) return { ...prev, [cardIdx]: cur.filter(id => id !== tagId) };
      if (cur.length >= 2) return prev; // genau 2 Hinweise, nicht mehr
      return { ...prev, [cardIdx]: [...cur, tagId] };
    });
  };

  const sendHint = (cardIdx) => {
    const tags = selectedByCard[cardIdx] || [];
    if (tags.length !== 2 || mySentHints[cardIdx] != null) return;
    onSendHint(cardIdx, tags);
  };

  const placeBid = (cardIdx) => {
    if (myBid) return;
    onBid(cardIdx, Math.max(0, Math.min(myAvailable, Math.round(bidAmount))));
  };

  const hintDoneCount = Object.keys(mySentHints).length;

  return {
    ready: true,
    state, phase, round, maxRounds, timerRemaining, timerSeconds,
    timerUrgent: timerRemaining <= 3,
    timerPct: timerSeconds > 0 ? Math.max(0, Math.min(100, (timerRemaining / timerSeconds) * 100)) : 100,
    players, me, myRole, myTeam, partner, cardsPerSide, teamIds, teamElixir,
    teamPool: teamPool || Math.max(1, ...Object.values(teamElixir)),
    myPoolAmount, myAvailable,
    isReveal: phase === 'reveal',

    // Hinweis-Phase
    selectedByCard, toggleTag, sendHint, mySentHints, hintDoneCount,

    // Gebot-Phase
    bidAmount: Math.min(bidAmount, myAvailable), setBidAmount, placeBid, myBid,
  };
}
