// Abgeleiteter Zustand der Elixier-Auktion — geteilt von allen Design-Varianten.
//
// Damit sich die Entwürfe NUR im Aussehen unterscheiden und nicht im Verhalten: Wer
// bietet, wie viel Elixier da ist, wann die Runde aufgelöst wird, ob die Mutterhexe im
// Spiel war — all das steht hier einmal. Eine Variante bekommt es fertig geliefert und
// entscheidet ausschließlich, wie es aussieht.

import { useEffect, useState } from 'react';

export function useAuctionView({ auctionState, revealState, myPlayerId, myBid, onBid, showElixirProp }) {
  const state = revealState || auctionState;

  // Alle Hooks vor jedem frühen Ausstieg — sonst ändert sich ihre Reihenfolge,
  // sobald der erste Spielstand eintrifft.
  const [bidAmount, setBidAmount] = useState(0);
  const [revealCountdown, setRevealCountdown] = useState(7);

  const isReveal = state?.phase === 'reveal';

  // Neue Runde: Gebot auf einen sinnvollen Startwert setzen
  useEffect(() => {
    if (state && !isReveal && !myBid) {
      const me = state.players?.find(p => p.id === myPlayerId);
      setBidAmount(Math.min(10, me?.elixir ?? 100));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.round, isReveal]);

  useEffect(() => {
    if (!isReveal) { setRevealCountdown(7); return; }
    const iv = setInterval(() => setRevealCountdown(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(iv);
  }, [isReveal]);

  if (!state) return { ready: false };

  const {
    round, maxRounds, currentCards = [], pendingBidCount = 0,
    activePlayerCount, timerRemaining, timerSeconds, players = [],
    showElixir, winners, cardBids, playerResults, finalRound = false,
  } = state;

  const me = players.find(p => p.id === myPlayerId);
  const activePlayers = players.filter(p => !p.isSpectator);
  const spectators = players.filter(p => p.isSpectator);
  const myElixir = me?.elixir ?? 100;
  const effectiveActiveCount = activePlayerCount ?? activePlayers.length;

  /**
   * Auflösung einer Karte, vollständig aufbereitet.
   *
   * Bewusst hier und nicht in den Varianten: So bekommt jede Variante Gewinner,
   * Trostpreis UND die sortierte Gebotsliste fertig geliefert. Eine Variante kann
   * dadurch nicht mehr versehentlich eine dieser Angaben verlieren — genau das war
   * beim ersten Entwurf passiert.
   */
  const revealFor = (card, idx) => {
    const winnerId = isReveal && winners ? winners[idx] : null;
    return {
      winner: winnerId ? players.find(p => p.id === winnerId) || null : null,
      // Hat niemand geboten, bekommt jemand einen Trostpreis zugelost
      consolation: isReveal && !winnerId && playerResults
        ? players.find(p => playerResults[p.id]?.got?.id === card.id) || null
        : null,
      // Höchstes Gebot zuerst; `value` ist das ggf. halbierte Gebot der Mutterhexe
      bids: isReveal && cardBids
        ? [...(cardBids[idx] || [])].sort((a, b) => (b.value ?? b.amount) - (a.value ?? a.amount))
        : [],
    };
  };

  return {
    ready: true,
    state, isReveal, round, maxRounds, currentCards, players, activePlayers, spectators,
    me, myElixir, revealFor,
    // Startguthaben dieser Runde — Bezugsgröße für die Elixierbalken, damit ein voller
    // Vorrat auch als voller Balken erscheint (statt an einer festen 200er-Skala zu hängen)
    startElixir: state.startElixir ?? 100,
    amSpectator: me?.isSpectator ?? false,
    myChampCount: (me?.deck || []).filter(c => c.isChampion).length,
    showOthersElixir: showElixirProp ?? showElixir ?? false,
    timerRemaining, timerSeconds,
    timerUrgent: timerRemaining <= 10,
    timerPct: timerSeconds > 0 ? (timerRemaining / timerSeconds) * 100 : 100,
    pendingBidCount, effectiveActiveCount,
    allBid: pendingBidCount >= effectiveActiveCount,
    revealCountdown,
    winners, cardBids, playerResults,
    // Letzte Runde: Restelixier ist danach wertlos, deshalb bietet der Server ohnehin
    // automatisch alles. Die Ansicht blendet den Regler aus und zeigt stattdessen, dass
    // es um das gesamte Guthaben geht.
    finalRound,
    // In der letzten Runde ist das Gebot fix — sonst der Reglerwert.
    bidAmount: finalRound ? myElixir : bidAmount,
    setBidAmount,
    // Gebot immer auf das tatsächlich vorhandene Elixier begrenzen — der Regler kann
    // stehen bleiben, während ein Kauf das Guthaben senkt.
    placeBid: (cardIndex) => {
      if (myBid || isReveal) return;
      onBid(cardIndex, finalRound ? myElixir : Math.max(0, Math.min(myElixir, bidAmount)));
    },
  };
}
