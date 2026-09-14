// Abgeleiteter Zustand von Elixir Auction 2v2 — mehrere Karten pro Seite (cardsPerSide),
// je eine wird angeklickt/geöffnet und einzeln bearbeitet (Hinweis geben bzw. blind bieten),
// bevor es zur nächsten offenen Karte weitergeht. Mirrort das Muster von
// modes/auction/useAuctionView.js für den Solo-Modus, nur mit Team/Slot/Phase/Mehrkarten-
// Logik statt eines einzelnen "biete auf eine von mehreren Karten"-Flusses.

import { useEffect, useState } from 'react';

export function useAuction2v2View({ auctionState, revealState, myPlayerId, onBid, onSendHint }) {
  const state = revealState || auctionState;

  const [openHintIdx, setOpenHintIdx] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [openBidIdx, setOpenBidIdx] = useState(null);
  const [bidAmount, setBidAmount] = useState(0);

  // Neue Runde oder Phasenwechsel → lokale Auswahl/Eingabe zurücksetzen, dann automatisch
  // die erste noch offene Karte öffnen (siehe zweiter Effekt unten).
  useEffect(() => {
    setOpenHintIdx(null);
    setSelectedTags([]);
    setOpenBidIdx(null);
    setBidAmount(0);
  }, [state?.round, state?.phase]);

  const cardsPerSide = state?.cardsPerSide || 0;
  const mySentHints = state?.mySentHints || {};
  const myBids = state?.myBids || {};

  // Sobald eine Karte fertig ist (oder beim Betreten der Phase), automatisch die nächste
  // unerledigte Karte öffnen — das ist das "reihum anklicken", ohne dass man manuell danach
  // suchen muss.
  useEffect(() => {
    if (state?.phase !== 'hint' || !cardsPerSide) return;
    if (openHintIdx != null && mySentHints[openHintIdx] == null) return; // noch in Bearbeitung
    const next = Array.from({ length: cardsPerSide }, (_, i) => i).find(i => mySentHints[i] == null);
    setOpenHintIdx(next ?? null);
    setSelectedTags([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, cardsPerSide, Object.keys(mySentHints).length]);

  useEffect(() => {
    if (state?.phase !== 'bid' || !cardsPerSide) return;
    if (openBidIdx != null && myBids[openBidIdx] == null) return;
    const next = Array.from({ length: cardsPerSide }, (_, i) => i).find(i => myBids[i] == null);
    setOpenBidIdx(next ?? null);
    setBidAmount(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, cardsPerSide, Object.keys(myBids).length]);

  if (!state) return { ready: false };

  const {
    phase, round, maxRounds, timerRemaining, timerSeconds,
    teamElixir, players = [], myRole,
  } = state;

  const me = players.find(p => p.id === myPlayerId);
  const myTeam = myRole?.team || null;
  const myPoolAmount = myTeam ? (teamElixir?.[myTeam] ?? 0) : 0;

  const toggleTag = (tagId) => {
    setSelectedTags(prev => {
      if (prev.includes(tagId)) return prev.filter(id => id !== tagId);
      if (prev.length >= 2) return prev; // genau 2 Hinweise, nicht mehr
      return [...prev, tagId];
    });
  };

  const sendHint = () => {
    if (openHintIdx == null || selectedTags.length !== 2) return;
    onSendHint(openHintIdx, selectedTags);
  };

  const placeBid = () => {
    if (openBidIdx == null) return;
    onBid(openBidIdx, Math.max(0, Math.min(myPoolAmount, Math.round(bidAmount))));
  };

  const hintDoneCount = Object.keys(mySentHints).length;
  const bidDoneCount = Object.keys(myBids).length;

  return {
    ready: true,
    state, phase, round, maxRounds, timerRemaining, timerSeconds,
    timerUrgent: timerRemaining <= 3,
    timerPct: timerSeconds > 0 ? Math.max(0, Math.min(100, (timerRemaining / timerSeconds) * 100)) : 100,
    players, me, myRole, myTeam, myPoolAmount, cardsPerSide,
    isReveal: phase === 'reveal',

    // Hinweis-Phase — setOpenHintIdx/setSelectedTags auch direkt exportiert, damit man eine
    // ANDERE noch offene Karte anklicken kann, statt nur der automatisch nächsten zu folgen.
    openHintIdx,
    openHint: (idx) => { setOpenHintIdx(idx); setSelectedTags([]); },
    selectedTags, toggleTag, sendHint,
    mySentHints, hintDoneCount,

    // Gebot-Phase
    openBidIdx,
    openBid: (idx) => { setOpenBidIdx(idx); setBidAmount(0); },
    bidAmount, setBidAmount, placeBid,
    myBids, bidDoneCount,
  };
}
