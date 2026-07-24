import React, { useState, useEffect } from 'react';
import { Clock, Crown, CheckCircle, Droplets, Trophy, Shuffle, Sparkles } from 'lucide-react';
import { RARITY_COLOR, RARITY_BORDER } from '../data/cards';
import { PIG_IMG } from '../data/motherWitchAssets';
import MotherWitchVisit from './MotherWitchVisit';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));

function AvatarCircle({ id, color, size = 28 }) {
  const url = id ? AVATAR_MAP[id] : null;
  return (
    <div className="rounded-full overflow-hidden shrink-0 border-2 bg-[#1a1a20]"
      style={{ width: size, height: size, borderColor: (color || '#888') + '99' }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover object-center" />}
    </div>
  );
}

const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';

function CardImg({ id, name, rarity, contain = false, isPig = false }) {
  if (isPig) {
    return (
      <div className="relative w-full h-full bg-white/5 flex items-center justify-center">
        {PIG_IMG
          ? <img src={PIG_IMG} alt="Schwein" className={`w-full h-full ${contain ? 'object-contain' : 'object-cover'}`} />
          : <span className="text-gray-600 text-2xl font-black">?</span>}
      </div>
    );
  }
  return (
    <div className="relative w-full h-full" style={{ background: (RARITY_COLOR[rarity] || '#555') + '18' }}>
      <img src={`${CARD_CDN}${id}.png`} alt={name}
        className={`w-full h-full ${contain ? 'object-contain' : 'object-cover'}`}
        onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

// Während der Bid-Runde selbst bekommt nur der Spieler, der die Fähigkeit angenommen hat, den Badge
// zu sehen — sonst wäre der Überraschungseffekt für die betroffenen Gegner hin (die merken den Effekt
// ja trotzdem: Schweine, vertauschte Karten, ...). Nach dem Bieten (Reveal-Phase) wird aufgedeckt.
const MOTHER_WITCH_BADGE_I18N = {
  de: {
    mine: {
      pigs: 'Mutterhexe: Gegner bieten blind (Schweine)',
      swap: 'Mutterhexe: Gegner sehen falsche Karten',
      halved: 'Mutterhexe: Gebote der Gegner zählen nur halb',
    },
  },
  en: {
    mine: {
      pigs: 'Mother Witch: opponents bid blind (pigs)',
      swap: 'Mother Witch: opponents see the wrong cards',
      halved: "Mother Witch: opponents' bids only count half",
    },
  },
};

const MOTHER_WITCH_REVEAL_TEXT_I18N = {
  de: {
    pigs: 'Mutterhexe war im Spiel: Du hast blind geboten',
    swap: 'Mutterhexe war im Spiel: Deine Karten waren vertauscht',
    halved: 'Mutterhexe war im Spiel: Dein Gebot zählte nur halb',
  },
  en: {
    pigs: 'The Mother Witch was in play: you bid blind',
    swap: 'The Mother Witch was in play: your cards were swapped',
    halved: 'The Mother Witch was in play: your bid only counted half',
  },
};

const AUCTION_I18N = {
  de: {
    loading: 'Lade Auktion…',
    you: 'Du',
    round: (round, maxRounds) => `Runde ${round}/${maxRounds}`,
    nextRoundIn: (s) => `Nächste Runde in ${s}s`,
    allBid: 'Alle haben geboten!',
    waitingForMore: (n) => `Warte auf ${n} weitere…`,
    bidStatus: (bid, total) => `${bid}/${total} geboten`,
    motherWitchRevealing: 'Mutterhexe deckt auf…',
    notAwarded: 'Nicht vergeben',
    maxTwoChamps: 'Max 2 Champs',
    bidSet: (amount) => `${amount} gesetzt`,
    cannotBid: 'Nicht bietbar',
    bidBtn: (amount) => `Bieten · ${amount}`,
    bonusCardsHeading: 'Bonus Karten — außerhalb des Pools',
    randomNoChampion: 'Random · kein Champion möglich',
    spectatorNoBidding: '👁 Zuschauer — kein Bieten möglich',
    bidOnCard: (name, amount) => `Geboten auf ${name} · ${amount} Elixier`,
    elixir: 'Elixier',
    setAmountHint: 'Betrag setzen — dann auf eine Karte klicken',
    availableElixir: 'verfügbares Elixier',
  },
  en: {
    loading: 'Loading auction…',
    you: 'You',
    round: (round, maxRounds) => `Round ${round}/${maxRounds}`,
    nextRoundIn: (s) => `Next round in ${s}s`,
    allBid: 'Everyone has bid!',
    waitingForMore: (n) => `Waiting for ${n} more…`,
    bidStatus: (bid, total) => `${bid}/${total} bid`,
    motherWitchRevealing: 'The Mother Witch reveals…',
    notAwarded: 'Not awarded',
    maxTwoChamps: 'Max 2 champs',
    bidSet: (amount) => `${amount} set`,
    cannotBid: 'Cannot bid',
    bidBtn: (amount) => `Bid · ${amount}`,
    bonusCardsHeading: 'Bonus cards — outside the pool',
    randomNoChampion: 'Random · no champion possible',
    spectatorNoBidding: '👁 Spectator — bidding not possible',
    bidOnCard: (name, amount) => `Bid on ${name} · ${amount} elixir`,
    elixir: 'Elixir',
    setAmountHint: 'Set an amount — then click a card',
    availableElixir: 'available elixir',
  },
};

export default function ElixirAuction({ auctionState, revealState, myPlayerId, myBid, onBid, showElixirProp, motherWitchVisit, onMotherWitchRespond, lang = 'de' }) {
  const t = AUCTION_I18N[lang] || AUCTION_I18N.de;
  const state = revealState || auctionState;

  // All hooks at the top — no early returns before hooks
  const [bidAmount, setBidAmount] = useState(0);
  const [revealCountdown, setRevealCountdown] = useState(7);
  const [swapRevealed, setSwapRevealed] = useState(true);

  const isReveal = state?.phase === 'reveal';
  const mwReveal = isReveal ? state?.motherWitchReveal : null;
  const swapAffectsMe = !!(mwReveal?.ability === 'swap' && mwReveal.exemptPlayerId !== myPlayerId && mwReveal.swapMap);

  useEffect(() => {
    if (state && !isReveal && !myBid) {
      const me = state.players?.find(p => p.id === myPlayerId);
      setBidAmount(Math.min(10, me?.elixir ?? 100));
    }
  }, [state?.round, isReveal]);

  useEffect(() => {
    if (!isReveal) { setRevealCountdown(7); return; }
    const iv = setInterval(() => setRevealCountdown(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(iv);
  }, [isReveal]);

  // Vertauschte Karten: Gegner sehen erst kurz die falsche Zuordnung, dann wird aufgedeckt
  useEffect(() => {
    if (!swapAffectsMe) { setSwapRevealed(true); return; }
    setSwapRevealed(false);
    const t1 = setTimeout(() => setSwapRevealed(true), 900);
    return () => clearTimeout(t1);
  }, [isReveal, state?.round, swapAffectsMe]);

  if (!state) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">{t.loading}</p>
    </div>
  );

  const { round, maxRounds, currentCards = [], pendingBidCount = 0,
    activePlayerCount, timerRemaining, timerSeconds, players = [],
    showElixir, motherWitchMine,
    winners, cardBids, playerResults } = state;
  const showOthersElixir = showElixirProp ?? showElixir ?? false;
  // Während des Bietens: Badge nur für den Auslöser — betroffene Gegner sehen den Effekt selbst
  // (Schweine, vertauschte Karten, halbiertes Gebot), aber keinen Hinweis, dass es die Mutterhexe war.
  // Nach dem Bieten (Reveal-Phase) wird es für alle aufgedeckt.
  const mwBadge = MOTHER_WITCH_BADGE_I18N[lang] || MOTHER_WITCH_BADGE_I18N.de;
  const mwRevealText = MOTHER_WITCH_REVEAL_TEXT_I18N[lang] || MOTHER_WITCH_REVEAL_TEXT_I18N.de;
  const mwBadgeText = !isReveal && motherWitchMine
    ? mwBadge.mine[motherWitchMine]
    : isReveal && mwReveal
      ? (mwReveal.exemptPlayerId === myPlayerId
        ? mwBadge.mine[mwReveal.ability]
        : mwRevealText[mwReveal.ability])
      : null;

  const me = players.find(p => p.id === myPlayerId);
  const amSpectator = me?.isSpectator ?? false;
  const myElixir = me?.elixir ?? 100;
  const myChampCount = (me?.deck || []).filter(c => c.isChampion).length;
  const timerUrgent = timerRemaining <= 10;
  const timerPct = timerSeconds > 0 ? (timerRemaining / timerSeconds) * 100 : 100;
  const effectiveActiveCount = activePlayerCount ?? players.filter(p => !p.isSpectator).length;
  const allBid = pendingBidCount >= effectiveActiveCount;

  const handleBid = (cardIndex) => {
    if (myBid || isReveal) return;
    const safeAmount = Math.max(0, Math.min(myElixir, bidAmount));
    onBid(cardIndex, safeAmount);
  };

  return (
    <div className="h-full flex overflow-hidden select-none">
      <MotherWitchVisit visit={motherWitchVisit} onRespond={onMotherWitchRespond} lang={lang} />

      {/* ── Left sidebar ────────────────────────────────────────────────── */}
      <div className="w-48 shrink-0 bg-[#16161a] border-r border-white/5 overflow-y-auto custom-scrollbar py-3 px-2.5 flex flex-col gap-3">
        {/* Aktive Spieler mit Deck + Elixier */}
        {players.filter(p => !p.isSpectator).map(p => (
          <div key={p.id}
            className={`rounded-sm border p-2.5 space-y-2 ${p.id === myPlayerId ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/5 bg-[#0f0f13]'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <AvatarCircle id={p.avatar} color={p.color} size={24} />
              <span className="text-white text-xs font-semibold truncate flex-1">{p.name}</span>
              {p.id === myPlayerId && <span className="text-[9px] text-cyan-400 shrink-0">{t.you}</span>}
            </div>
            {(p.id === myPlayerId || showOthersElixir) && (
              <div className="flex items-center gap-1.5">
                <Droplets size={9} className="text-purple-400 shrink-0" />
                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((p.elixir ?? 0) / 200) * 100)}%` }} />
                </div>
                <span className="text-[9px] text-purple-300 font-mono shrink-0">{p.elixir ?? 0}</span>
              </div>
            )}
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 8 }, (_, ci) => {
                const card = p.deck?.[ci];
                return (
                  <div key={ci} className={`aspect-square rounded-[2px] overflow-hidden border ${card ? (RARITY_BORDER[card.rarity] || 'border-white/10') : 'border-white/5 bg-white/[0.02]'}`}>
                    {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
                  </div>
                );
              })}
            </div>
            <div className="text-[9px] text-gray-600">{p.deck?.length || 0}/8</div>
          </div>
        ))}

        {/* Zuschauer — kompakt, ganz unten */}
        {players.some(p => p.isSpectator) && (
          <>
            <div className="h-px bg-white/5 mt-1" />
            {players.filter(p => p.isSpectator).map(p => (
              <div key={p.id} className="rounded-sm border border-white/5 bg-[#0f0f13]/60 px-2.5 py-2 flex items-center gap-2 opacity-50">
                <AvatarCircle id={p.avatar} color={p.color} size={20} />
                <span className="text-gray-400 text-[11px] truncate flex-1">{p.name}</span>
                {p.id === myPlayerId && <span className="text-[9px] text-cyan-600 shrink-0">{t.you}</span>}
                <span className="text-[9px] text-gray-600 shrink-0">👁</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="shrink-0 bg-[#0f0f13] border-b border-white/5 px-4 py-2 flex items-center gap-4">
          <span className="text-white font-bold text-sm">{t.round(round, maxRounds)}</span>
          {mwBadgeText && (
            <div className="flex items-center gap-1.5 border border-purple-500/30 bg-purple-500/5 rounded-sm px-2.5 py-1">
              <Sparkles size={11} className="text-purple-300 shrink-0" />
              <span className="text-purple-300 text-[10px] font-semibold">{mwBadgeText}</span>
            </div>
          )}
          <div className="flex-1" />
          {isReveal ? (
            <span className="text-amber-400 text-sm font-semibold">
              {t.nextRoundIn(revealCountdown)}
            </span>
          ) : allBid ? (
            <span className="text-green-400 text-sm font-semibold">{t.allBid}</span>
          ) : myBid ? (
            <span className="text-cyan-400 text-sm">{t.waitingForMore(effectiveActiveCount - pendingBidCount)}</span>
          ) : (
            <span className="text-gray-400 text-sm">{t.bidStatus(pendingBidCount, effectiveActiveCount)}</span>
          )}
          {!isReveal && (
            <div className={`flex items-center gap-1.5 border rounded-sm px-2.5 py-1 ${timerUrgent ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'}`}>
              <Clock size={11} className={timerUrgent ? 'text-red-400' : 'text-gray-500'} />
              <span className={`font-mono font-bold text-sm tabular-nums ${timerUrgent ? 'text-red-400' : 'text-white'}`}>{timerRemaining}s</span>
            </div>
          )}
        </div>

        {/* Timer bar */}
        {!isReveal && (
          <div className="shrink-0 h-px bg-white/5">
            <div className={`h-full ${timerUrgent ? 'bg-red-500' : 'bg-purple-500'}`}
              style={{ width: `${timerPct}%`, transition: 'width 1s linear' }} />
          </div>
        )}

        {/* Cards area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-8">

          {/* Cards — feste Breite, mehr Abstand */}
          <div className="flex flex-wrap gap-10 justify-center items-start">
            {currentCards.map((card, idx) => {
              const isMyBidCard = myBid?.cardIndex === idx;
              const winner = isReveal && winners ? winners[idx] : null;
              const winnerPlayer = winner ? players.find(p => p.id === winner) : null;
              const consolationPlayer = isReveal && !winner && playerResults
                ? players.find(p => playerResults[p.id]?.got?.id === card.id)
                : null;
              const bidsOnCard = isReveal && cardBids
                ? [...(cardBids[idx] || [])].sort((a, b) => (b.value ?? b.amount) - (a.value ?? a.amount))
                : [];
              const alreadyBid = !!myBid;

              // ── Reveal view ──────────────────────────────────────────
              if (isReveal) {
                // Vertauschte Karten: bis zur Aufdeckung zeigen wir die (falsche) Karte,
                // die der betroffene Spieler auch während des Bietens gesehen hat.
                const showFake = swapAffectsMe && !swapRevealed;
                const displayCard = showFake ? currentCards[mwReveal.swapMap[idx]] : card;

                return (
                  <div key={idx} className="rounded-sm border overflow-hidden transition-opacity duration-300"
                    style={{
                      width: 160,
                      borderColor: showFake ? '#a855f755' : winnerPlayer ? winnerPlayer.color + 'aa' : consolationPlayer ? '#f59e0b88' : '#2a2a35',
                      boxShadow: !showFake && winnerPlayer ? `0 0 16px ${winnerPlayer.color}33` : undefined,
                    }}>

                    {/* Winner / Consolation banner mit Avatar */}
                    {showFake ? (
                      <div className="px-3 py-2 text-purple-300 text-xs font-semibold flex items-center gap-1.5">
                        <Sparkles size={11} /> {t.motherWitchRevealing}
                      </div>
                    ) : winnerPlayer ? (
                      <div className="flex items-center gap-2 px-3 py-2"
                        style={{ backgroundColor: winnerPlayer.color + '28' }}>
                        <AvatarCircle id={winnerPlayer.avatar} color={winnerPlayer.color} size={22} />
                        <span className="font-bold text-sm truncate" style={{ color: winnerPlayer.color }}>
                          {winnerPlayer.name}
                        </span>
                      </div>
                    ) : consolationPlayer ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10">
                        <AvatarCircle id={consolationPlayer.avatar} color={consolationPlayer.color} size={22} />
                        <span className="font-bold text-sm truncate text-amber-300">{consolationPlayer.name}</span>
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-gray-600 text-xs">{t.notAwarded}</div>
                    )}

                    {/* Card image + name */}
                    <div className="aspect-square overflow-hidden transition-opacity duration-300" style={{ opacity: showFake ? 0.55 : 1 }}>
                      <CardImg id={displayCard.id} name={displayCard.name} rarity={displayCard.rarity} />
                    </div>
                    <div className="px-2.5 py-2 border-t border-white/5">
                      <p className="text-white text-xs font-bold truncate">{displayCard.name}</p>
                      {!showFake && displayCard.isChampion && <Crown size={9} className="text-cyan-400 mt-0.5" />}
                    </div>

                    {/* Bid list */}
                    {!showFake && bidsOnCard.length > 0 && (
                      <div className="border-t border-white/5 divide-y divide-white/[0.04]">
                        {bidsOnCard.map((bid) => {
                          const bp = players.find(p => p.id === bid.playerId);
                          const isWin = bid.playerId === winner;
                          return (
                            <div key={bid.playerId}
                              className={`flex items-center gap-2 px-2.5 py-1.5 ${isWin ? '' : 'opacity-50'}`}
                              style={isWin ? { backgroundColor: bp?.color + '14' } : {}}>
                              <AvatarCircle id={bp?.avatar} color={bp?.color} size={18} />
                              <span className={`flex-1 text-xs font-semibold truncate ${isWin ? 'text-white' : 'text-gray-400'}`}>
                                {bp?.name}
                              </span>
                              <span className={`font-mono font-bold text-sm ${isWin ? 'text-white' : 'text-gray-500'}`}>
                                {bid.amount}
                              </span>
                              {bid.halved && <span className="text-[9px] text-purple-400 shrink-0">(½)</span>}
                              <Droplets size={10} className={isWin ? 'text-purple-400' : 'text-gray-600'} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // ── Bidding view ─────────────────────────────────────────
              const champLocked = card.isChampion && myChampCount >= 2;
              return (
                <div key={idx} className={`relative rounded-sm overflow-hidden flex flex-col transition-all ${isMyBidCard ? 'ring-2 ring-cyan-500/60' : ''} ${champLocked ? 'opacity-40' : ''}`}
                  style={{ width: 130 }}>

                  {/* Card image — kein Hintergrund, volles Bild */}
                  <div className="relative rounded-sm overflow-hidden" style={{ aspectRatio: '4/5' }}>
                    <CardImg id={card.id} name={card.name} rarity={card.rarity} contain isPig={card.isPig} />
                    {card.isChampion && (
                      <div className="absolute top-1 right-1 bg-black/60 rounded-[2px] p-0.5">
                        <Crown size={9} className="text-cyan-400" />
                      </div>
                    )}
                    {champLocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="text-red-400 text-[10px] font-bold text-center px-1 leading-tight">{t.maxTwoChamps}</span>
                      </div>
                    )}
                  </div>

                  {/* Name only — keine Rarity */}
                  <p className="text-white text-xs font-semibold truncate pt-1.5 pb-1 px-0.5 text-center">{card.name}</p>

                  {/* Bid button */}
                  {alreadyBid ? (
                    isMyBidCard ? (
                      <div className="text-cyan-400 text-[10px] font-semibold flex items-center justify-center gap-1 pb-1">
                        <CheckCircle size={9} /> {t.bidSet(myBid.amount)}
                      </div>
                    ) : null
                  ) : champLocked ? (
                    <div className="text-red-400/60 text-[9px] text-center pb-1">{t.cannotBid}</div>
                  ) : (
                    <button onClick={() => handleBid(idx)}
                      className="w-full bg-purple-500/15 hover:bg-purple-500/40 border border-purple-500/30 text-purple-300 font-bold py-1.5 rounded-[2px] text-xs transition-colors">
                      {t.bidBtn(bidAmount)} <Droplets size={9} className="inline-block" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Bonus cards (außerhalb Auktions-Pool) ──────────────── */}
          {isReveal && playerResults && Object.values(playerResults).some(r => r.isBonus && r.got) && (
            <div className="mt-10">
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="h-px flex-1 bg-amber-500/20 max-w-32" />
                <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">{t.bonusCardsHeading}</span>
                <div className="h-px flex-1 bg-amber-500/20 max-w-32" />
              </div>
              <div className="flex flex-wrap gap-6 justify-center">
                {Object.entries(playerResults).filter(([, r]) => r.isBonus && r.got).map(([pid, r]) => {
                  const bp = players.find(p => p.id === pid);
                  return (
                    <div key={pid} className="rounded-sm overflow-hidden border border-amber-500/50"
                      style={{ width: 140, boxShadow: '0 0 14px #f59e0b28' }}>
                      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10">
                        <AvatarCircle id={bp?.avatar} color={bp?.color} size={20} />
                        <span className="text-amber-300 text-xs font-bold truncate flex-1">{bp?.name}</span>
                        <Shuffle size={10} className="text-amber-500 shrink-0" />
                      </div>
                      <div className="aspect-square overflow-hidden">
                        <CardImg id={r.got.id} name={r.got.name} rarity={r.got.rarity} />
                      </div>
                      <div className="px-2.5 py-2 border-t border-white/5">
                        <p className="text-white text-xs font-bold truncate">{r.got.name}</p>
                        <p className="text-amber-500 text-[9px] mt-0.5">{t.randomNoChampion}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom bar ─────────────────────────────────────────────── */}
        {!isReveal && amSpectator && (
          <div className="shrink-0 bg-[#16161a] border-t border-white/5 px-5 py-3 flex items-center justify-center">
            <span className="text-gray-600 text-sm">{t.spectatorNoBidding}</span>
          </div>
        )}
        {!isReveal && !amSpectator && (
          <div className="shrink-0 bg-[#16161a] border-t border-white/5 px-5 pt-3 pb-4">
            {myBid ? (
              /* Already bid: compact confirmation */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold">
                  <CheckCircle size={14} />
                  {t.bidOnCard(currentCards[myBid.cardIndex]?.name || '?', myBid.amount)}
                </div>
                <div className="flex items-center gap-1.5">
                  <Droplets size={14} className="text-purple-400" />
                  <span className="text-white font-bold text-base tabular-nums">{myElixir}</span>
                  <span className="text-gray-500 text-xs">{t.elixir}</span>
                </div>
              </div>
            ) : (
              /* Bid controls */
              <div className="space-y-2">
                {/* Hint */}
                <p className="text-gray-600 text-xs text-center">{t.setAmountHint}</p>

                {/* Big centered amount */}
                <div className="text-center">
                  <span className="font-black tabular-nums"
                    style={{ fontSize: 38, color: '#c084fc', lineHeight: 1 }}>
                    {bidAmount}
                  </span>
                </div>

                {/* Slider row with ± buttons */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setBidAmount(v => Math.max(0, v - 5))}
                    className="w-8 h-8 bg-white/5 hover:bg-white/10 rounded-sm text-white font-bold shrink-0 transition-colors">−</button>
                  <input type="range" min={0} max={myElixir} value={bidAmount}
                    onChange={e => setBidAmount(Number(e.target.value))}
                    className="flex-1 accent-purple-400" />
                  <button onClick={() => setBidAmount(v => Math.min(myElixir, v + 5))}
                    className="w-8 h-8 bg-white/5 hover:bg-white/10 rounded-sm text-white font-bold shrink-0 transition-colors">+</button>
                </div>

                {/* Divider */}
                <div className="border-t border-white/5 pt-2">
                  {/* Elixir display — centered, larger */}
                  <div className="flex items-center justify-center gap-2">
                    <Droplets size={18} className="text-purple-400" />
                    <span className="text-white font-black text-2xl tabular-nums">{myElixir}</span>
                    <span className="text-gray-500 text-sm">{t.availableElixir}</span>
                    <div className="w-24 h-2 bg-white/5 rounded-full overflow-hidden ml-2">
                      <div className="h-full bg-purple-500 rounded-full transition-all duration-300"
                        style={{ width: `${myElixir}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
