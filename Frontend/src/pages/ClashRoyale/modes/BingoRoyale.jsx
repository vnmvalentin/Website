import React, { useState, useMemo, useEffect } from 'react';
import { Clock, Crown, Zap, Shuffle, Gift, Search, X, Check, ArrowRight, Ban } from 'lucide-react';
import { RARITY_COLOR, RARITY_BORDER } from '../data/cards';
import { BINGO_ATTR_LABEL, BINGO_ATTR_COLOR, getCardAttrs } from '../data/bingoAttributes';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));
const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';

const BINGO_LINES = [
  [0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],
  [0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],
  [0,5,10,15],[3,6,9,12],
];
const BINGO_LINE_IDS = ['row0','row1','row2','row3','col0','col1','col2','col3','diag0','diag1'];

const POWERUP_META = {
  swap:   { Icon: Zap,     label: 'Der Dieb',   desc: 'Tausche eine deiner Karten mit einer Karte eines Gegners.' },
  reroll: { Icon: Shuffle, label: 'Der Troll',  desc: 'Wähle eine Karte eines Gegners — sie wird durch eine zufällige ersetzt.' },
  joker:  { Icon: Gift,    label: 'Der Planer', desc: 'Wähle eine beliebige Karte und füge sie deinem Deck hinzu.' },
};

// Beschreibungen für die Live-Ansicht: was macht der aktive Token-Spieler gerade?
const LIVE_STEP_TEXT = {
  choose:      'überlegt, welches Power-Up es werden soll…',
  swap_mine:   'wählt eine eigene Karte zum Tauschen…',
  swap_target: 'sucht sich eine Gegner-Karte zum Stehlen aus…',
  reroll:      'wählt eine Gegner-Karte für den Reroll…',
  joker_mine:  'wählt eine eigene Karte zum Ersetzen…',
  joker_pick:  'stöbert im Kartenpool nach einer neuen Karte…',
};

function getCompletedCellSet(completedLines) {
  const s = new Set();
  BINGO_LINE_IDS.forEach((id, li) => { if (completedLines.includes(id)) BINGO_LINES[li].forEach(ci => s.add(ci)); });
  return s;
}

// Karte anhand der ID im Broadcast-State finden (Decks + Restpool) — für die Live-Ansicht
function findStateCard(state, cardId) {
  for (const p of state.players) {
    const c = (p.deck || []).find(c => c.id === cardId);
    if (c) return c;
  }
  return (state.unpickedCards || []).find(c => c.id === cardId) || null;
}

function AvatarCircle({ id, color, size = 28 }) {
  const url = id ? AVATAR_MAP[id] : null;
  return (
    <div className="rounded-full overflow-hidden shrink-0 border-2 bg-[#1a1a20]"
      style={{ width: size, height: size, borderColor: (color || '#888') + '99' }}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

function CardImg({ id, name, rarity, contain = false }) {
  return (
    <div className="relative w-full h-full" style={{ background: (RARITY_COLOR[rarity] || '#555') + '18' }}>
      <img src={`${CARD_CDN}${id}.png`} alt={name}
        className={`w-full h-full ${contain ? 'object-contain' : 'object-cover'}`}
        onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

function TimerChip({ remaining, size = 'md' }) {
  const urgent = remaining <= 10;
  return (
    <div className={`flex items-center gap-1.5 border rounded-sm px-2.5 py-1 shrink-0 ${urgent ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
      <Clock size={12} className={urgent ? 'text-red-400' : 'text-gray-500'} />
      <span className={`font-mono font-bold tabular-nums ${size === 'lg' ? 'text-base' : 'text-sm'} ${urgent ? 'text-red-400' : 'text-white'}`}>{remaining}s</span>
    </div>
  );
}

// ── Sidebar — Decks, Tokens (live) und Champion-Zähler aller Spieler ────────
function BingoSidebar({ state, myPlayerId }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators    = state.players.filter(p => p.isSpectator);
  const inTokenShop   = state.phase === 'tokenShop';

  return (
    <div className="w-60 shrink-0 bg-[#16161a] border-r border-white/5 overflow-y-auto custom-scrollbar py-3 px-2.5 flex flex-col gap-3">
      {activePlayers.map(p => {
        const isMe       = p.id === myPlayerId;
        const isActing   = inTokenShop && state.tokenShopCurrentPlayerId === p.id;
        const champCount = (p.deck || []).filter(c => c.isChampion).length;
        const tokens     = p.bingoTokensLeft ?? p.bingoTokens ?? 0;
        return (
          <div key={p.id}
            className={`rounded-sm border p-3 transition-colors ${
              isActing ? 'border-amber-400/50 bg-amber-400/5'
              : isMe ? 'border-cyan-500/40 bg-cyan-500/5'
              : 'border-white/5 bg-[#0f0f13]'}`}>
            <div className="flex items-center gap-2 mb-2.5 min-w-0">
              <AvatarCircle id={p.avatar} color={p.color} size={30} />
              <span className="text-white text-sm font-semibold truncate flex-1">{p.name}</span>
              {isMe && <span className="text-[10px] text-cyan-500 font-bold shrink-0">Du</span>}
            </div>
            {/* Tokens — im Token-Shop live mitzählend, sonst nur wenn vorhanden */}
            {(tokens > 0 || inTokenShop) && (
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm border ${
                  tokens > 0 ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 'text-gray-600 bg-white/[0.02] border-white/5'}`}>
                  {tokens} Token
                </span>
                {isActing && <span className="text-[10px] text-amber-300 font-semibold animate-pulse">am Zug</span>}
              </div>
            )}
            {/* Deck 2×4 */}
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 8 }, (_, ci) => {
                const card = p.deck?.[ci];
                return (
                  <div key={ci}
                    title={card?.name}
                    className={`aspect-square rounded-sm overflow-hidden border ${
                      card ? (RARITY_BORDER[card.rarity] || 'border-white/10') : 'border-white/5 bg-white/[0.02]'
                    }`}>
                    {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Crown size={11} className={champCount > 0 ? 'text-cyan-400' : 'text-gray-700'} />
              <span className="text-[10px] text-gray-500">{champCount}/2 Champions</span>
              <span className="text-[10px] text-gray-600 ml-auto">{p.deck?.length || 0}/8</span>
            </div>
          </div>
        );
      })}

      {spectators.length > 0 && (
        <>
          <div className="h-px bg-white/5 mt-1" />
          {spectators.map(p => (
            <div key={p.id} className="rounded-sm border border-white/5 bg-[#0f0f13]/60 px-3 py-2 flex items-center gap-2 opacity-50">
              <AvatarCircle id={p.avatar} color={p.color} size={22} />
              <span className="text-gray-400 text-xs truncate flex-1">{p.name}</span>
              {p.id === myPlayerId && <span className="text-[9px] text-cyan-600 shrink-0">Du</span>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Zug-Banner: klar sichtbar, wer gerade dran ist ─────────────────────────
function TurnBanner({ state, myPlayerId, selectedCard, freePlace, amSpectator }) {
  const currentPlayer = state.players.find(p => p.id === state.currentPlayerId);
  const isMyTurn = state.currentPlayerId === myPlayerId && !amSpectator;

  if (state.finished) return (
    <div className="shrink-0 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20 flex items-center gap-3">
      <Check size={16} className="text-green-400 shrink-0" />
      <p className="text-green-300 font-bold text-sm">Draft abgeschlossen!</p>
    </div>
  );

  if (isMyTurn) return (
    <div className="shrink-0 px-4 py-2.5 bg-cyan-500/10 border-b border-cyan-500/30 flex items-center gap-3">
      <AvatarCircle id={currentPlayer?.avatar} color={currentPlayer?.color} size={36} />
      <div className="min-w-0">
        <p className="text-cyan-300 font-black text-sm uppercase tracking-wide">Du bist dran</p>
        <p className="text-gray-300 text-xs mt-0.5 truncate">
          {!selectedCard ? 'Wähle eine der verfügbaren Karten aus.'
            : freePlace ? `„${selectedCard.name}" passt auf kein freies Feld — Feld wählen und Blockieren bestätigen.`
            : `„${selectedCard.name}" gewählt — lege sie auf ein blau markiertes Feld.`}
        </p>
      </div>
    </div>
  );

  return (
    <div className="shrink-0 px-4 py-2.5 bg-[#101016] border-b border-white/5 flex items-center gap-3">
      <AvatarCircle id={currentPlayer?.avatar} color={currentPlayer?.color} size={36} />
      <div className="min-w-0">
        <p className="font-bold text-sm truncate" style={{ color: currentPlayer?.color || '#9ca3af' }}>
          {currentPlayer?.name || '…'} ist am Zug
        </p>
        <p className="text-gray-500 text-xs mt-0.5">{amSpectator ? 'Du schaust zu.' : 'Warte, bis du an der Reihe bist.'}</p>
      </div>
    </div>
  );
}

// ── Die eigene Bingo-Karte — als abgehobenes Panel mit großen Feldern ──────
function MyBingoCard({ grid, completedLines = [], validCells, matchingCells, freePlace, pendingBlockCell, onCellClick, isMyTurn }) {
  const completedCells = useMemo(() => getCompletedCellSet(completedLines), [completedLines]);
  if (!grid?.length) return null;

  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {grid.map((cell, ci) => {
        const isFilled    = cell.card !== null;
        const isBingo     = completedCells.has(ci);
        const isValid     = validCells.has(ci);
        const isMatching  = matchingCells.has(ci);
        const isFreeSlot  = isValid && isMyTurn && freePlace;   // Blockier-Modus
        const isPending   = isFreeSlot && pendingBlockCell === ci;
        const attrColor   = BINGO_ATTR_COLOR[cell.attrKey] || '#888';
        const label       = BINGO_ATTR_LABEL[cell.attrKey] || cell.attrKey;
        // Liegt hier eine Karte, die das Feld-Attribut NICHT erfüllt (= blockiert)?
        const isBlocking  = isFilled && !getCardAttrs(cell.card.id).includes(cell.attrKey);

        return (
          <div key={ci}
            onClick={() => isValid && isMyTurn && !isFilled && onCellClick(ci)}
            title={isFilled ? `${cell.card.name}${isBlocking ? ' (blockiert)' : ''}` : label}
            className={`relative rounded-sm border-2 overflow-hidden transition-colors duration-100 select-none ${
              isValid && isMyTurn ? 'cursor-pointer' : 'cursor-default'
            }`}
            style={{
              aspectRatio: '1',
              borderColor: isBingo
                ? '#f59e0b'
                : isPending
                  ? '#ef4444'
                  : isBlocking
                    ? '#ef444488'
                    : isFreeSlot
                      ? '#f97316aa'
                      : isMatching && isMyTurn
                        ? '#06b6d4'
                        : isFilled
                          ? '#ffffff15'
                          : attrColor + '40',
              background: isFilled
                ? 'transparent'
                : isPending
                  ? '#ef444418'
                  : isFreeSlot
                    ? '#f9731610'
                    : attrColor + '0c',
            }}>

            {isFilled ? (
              <>
                <CardImg id={cell.card.id} name={cell.card.name} rarity={cell.card.rarity} />
                {isBingo && <div className="absolute inset-0 bg-amber-400/15 pointer-events-none" />}
                {/* Blockierte Felder klar kennzeichnen */}
                {isBlocking && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none bg-black/40">
                    <Ban size={26} className="text-red-400" strokeWidth={2.5} />
                    <span className="text-[10px] font-black text-red-400 uppercase tracking-wide">Blockiert</span>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-1 pt-3 text-[10px] font-bold text-center pointer-events-none truncate"
                  style={{ background: 'linear-gradient(transparent,#000d)', color: isBlocking ? '#ef4444' : attrColor }}>
                  {label}
                </div>
              </>
            ) : (
              <>
                {isValid && isMyTurn && (
                  <div className="absolute inset-0 ring-1 ring-inset pointer-events-none"
                    style={{ borderColor: isPending ? '#ef4444' : isFreeSlot ? '#f97316aa' : isMatching ? '#06b6d4' : '#ffffff22' }} />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1.5">
                  <span className="text-xs sm:text-sm font-bold text-center leading-snug w-full"
                    style={{ color: attrColor }}>
                    {label}
                  </span>
                  {isPending && (
                    <span className="text-[10px] font-black text-red-400 uppercase tracking-wide">
                      Nochmal klicken
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Kartenvergleich für die Auflösung ──────────────────────────────────────
function CardCompare({ left, right, leftLabel, rightLabel, leftColor, rightColor }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-center space-y-1">
        <div className="w-16 h-16 rounded-sm overflow-hidden border mx-auto"
          style={{ borderColor: (leftColor || '#888') + '88' }}>
          {left && <CardImg id={left.id} name={left.name} rarity={left.rarity} />}
        </div>
        <p className="text-[10px] text-gray-500 truncate max-w-[72px]">{leftLabel}</p>
        {left && <p className="text-[10px] text-white font-semibold truncate max-w-[72px]">{left.name}</p>}
      </div>
      <ArrowRight size={18} className="text-gray-600 shrink-0" />
      <div className="text-center space-y-1">
        <div className="w-16 h-16 rounded-sm overflow-hidden border mx-auto"
          style={{ borderColor: (rightColor || '#888') + '88' }}>
          {right && <CardImg id={right.id} name={right.name} rarity={right.rarity} />}
        </div>
        <p className="text-[10px] text-gray-500 truncate max-w-[72px]">{rightLabel}</p>
        {right && <p className="text-[10px] text-white font-semibold truncate max-w-[72px]">{right.name}</p>}
      </div>
    </div>
  );
}

// ── Power-Up-Auflösung ─────────────────────────────────────────────────────
function PowerupReveal({ result, players }) {
  if (!result) return null;
  const actor = players.find(p => p.id === result.playerId);
  const meta  = POWERUP_META[result.type] || POWERUP_META.joker;
  const TypeIcon = meta.Icon;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
      <div className="bg-[#16161a] border border-amber-400/30 rounded-md p-6 max-w-sm w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <AvatarCircle id={actor?.avatar} color={actor?.color} size={36} />
          <div>
            <p className="text-white font-bold text-sm">{actor?.name || '?'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <TypeIcon size={12} className="text-amber-400" />
              <span className="text-amber-400 text-sm font-semibold">{meta.label}</span>
            </div>
          </div>
        </div>

        {result.type === 'swap' && (
          <div className="space-y-2">
            <p className="text-gray-400 text-sm">
              Tausch mit <span className="font-semibold" style={{ color: result.targetPlayerColor }}>{result.targetPlayerName}</span>
            </p>
            <CardCompare
              left={result.myCard}    leftLabel="Abgegeben"  leftColor={actor?.color}
              right={result.theirCard} rightLabel="Erhalten"  rightColor={result.targetPlayerColor}
            />
          </div>
        )}

        {result.type === 'reroll' && (
          <div className="space-y-2">
            <p className="text-gray-400 text-sm">
              Karte von <span className="font-semibold" style={{ color: result.targetPlayerColor }}>{result.targetPlayerName}</span> wurde rerollt
            </p>
            <CardCompare
              left={result.oldCard} leftLabel="Vorher"  leftColor="#ef4444"
              right={result.newCard} rightLabel="Nachher" rightColor="#22c55e"
            />
          </div>
        )}

        {result.type === 'joker' && (
          <div className="space-y-2">
            <p className="text-gray-400 text-sm">Karte aus dem Pool ausgewählt</p>
            <CardCompare
              left={result.oldCard} leftLabel="Ersetzt"   leftColor="#ef4444"
              right={result.newCard} rightLabel="Neu"      rightColor="#22c55e"
            />
          </div>
        )}

        <p className="text-gray-600 text-[11px] text-center mt-4 animate-pulse">Weiter in wenigen Sekunden…</p>
      </div>
    </div>
  );
}

// ── Live-Ansicht: was macht der aktive Token-Spieler gerade? ───────────────
function TokenShopLive({ state }) {
  const live  = state.tokenShopLiveAction;
  const actor = state.players.find(p => p.id === state.tokenShopCurrentPlayerId);
  const meta  = live?.ability ? POWERUP_META[live.ability] : null;
  const MetaIcon = meta?.Icon;
  const liveCard = live?.cardId ? findStateCard(state, live.cardId) : null;
  const stepText = LIVE_STEP_TEXT[live?.step] || LIVE_STEP_TEXT.choose;
  const remaining = (state.tokenShopQueue?.length ?? 0) - (state.tokenShopIdx ?? 0);

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#111018] border border-amber-400/25 rounded-md shadow-[0_16px_40px_rgba(0,0,0,0.55)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-amber-400/10 border-b border-amber-400/20">
          <p className="text-amber-300 text-xs font-bold uppercase tracking-widest">Token-Shop</p>
          {state.tokenShopSubPhase !== 'revealing' && <TimerChip remaining={state.timerRemaining} />}
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <AvatarCircle id={actor?.avatar} color={actor?.color} size={44} />
            <div className="min-w-0">
              <p className="text-white font-black text-base truncate">{actor?.name || '?'}</p>
              <p className="text-gray-500 text-xs">{actor?.bingoTokensLeft ?? 0} eigene Token übrig</p>
            </div>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
            </span>
          </div>

          <div className="bg-[#0c0b12] border border-white/5 rounded-sm p-4 space-y-3">
            {meta ? (
              <div className="flex items-center gap-2">
                <MetaIcon size={15} className="text-amber-400" />
                <span className="text-amber-300 font-bold text-sm">{meta.label}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Gift size={15} className="text-gray-600" />
                <span className="text-gray-500 font-semibold text-sm">Noch kein Power-Up gewählt</span>
              </div>
            )}
            <p className="text-gray-300 text-sm leading-relaxed">{actor?.name || '?'} {stepText}</p>
            {liveCard && (
              <div className="flex items-center gap-3 pt-1">
                <div className="w-16 h-16 rounded-sm overflow-hidden border border-white/15 shrink-0">
                  <CardImg id={liveCard.id} name={liveCard.name} rarity={liveCard.rarity} />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{liveCard.name}</p>
                  <p className="text-gray-500 text-xs">ausgewählte Karte</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-gray-600 text-xs text-center">{remaining} Token insgesamt verbleibend</p>
        </div>
      </div>
    </div>
  );
}

// ── Token-Shop (aktiver Spieler) ───────────────────────────────────────────
function TokenShop({ state, myPlayerId, onPowerup, onTokenAction }) {
  const [step, setStep]           = useState('choose');
  const [myDeckIdx, setMyDeckIdx] = useState(null);
  const [jokerSearch, setJokerSearch] = useState('');

  const currentTokenPlayerId = state.tokenShopCurrentPlayerId;
  const me         = state.players.find(p => p.id === myPlayerId);
  const opponents  = state.players.filter(p => !p.isSpectator && p.id !== myPlayerId);
  const unpickedCards = (state.unpickedCards || []).filter(c =>
    !jokerSearch.trim() || c.name.toLowerCase().includes(jokerSearch.toLowerCase())
  );
  // Nur die 2 zugelosten Power-Ups anbieten
  const myAbilities = me?.tokenAbilities?.length ? me.tokenAbilities : Object.keys(POWERUP_META);

  // Neuer Token-Zug → lokale Schritte zurücksetzen
  useEffect(() => { setStep('choose'); setMyDeckIdx(null); setJokerSearch(''); }, [currentTokenPlayerId, state.tokenShopIdx]);

  const announce = (data) => onTokenAction?.(data);
  const goto = (nextStep, extra = {}) => { setStep(nextStep); announce({ step: nextStep, ...extra }); };
  const resetLocal = () => { setStep('choose'); setMyDeckIdx(null); setJokerSearch(''); };
  const backToChoose = () => { resetLocal(); announce({ step: 'choose', ability: null, cardId: null }); };

  // Pass values directly to avoid stale-closure issues with React setState
  const doSwap   = (tPid, tIdx) => { onPowerup('swap',   { myDeckIdx, targetPlayerId: tPid, theirDeckIdx: tIdx }); resetLocal(); };
  const doReroll = (tPid, tIdx) => { onPowerup('reroll', { targetPlayerId: tPid, theirDeckIdx: tIdx });            resetLocal(); };
  const doJoker  = (id)         => { onPowerup('joker',  { myDeckIdx, newCardId: id });                            resetLocal(); };

  const remaining = (state.tokenShopQueue || []).slice(state.tokenShopIdx ?? 0).filter(id => id === myPlayerId).length;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-white font-black text-lg">Dein Zug im Token-Shop</h2>
            <span className="text-amber-400 text-sm font-bold">{remaining} Token übrig</span>
          </div>
          {state.tokenShopSubPhase !== 'revealing' && <TimerChip remaining={state.timerRemaining} size="lg" />}
        </div>
        <p className="text-gray-500 text-sm -mt-3">
          Dir wurden 2 zufällige Power-Ups zugelost. Läuft der Timer ab, verfällt dein Token.
        </p>

        {step === 'choose' && (
          <div className={`grid gap-4 ${myAbilities.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {myAbilities.map(id => {
              const { Icon, label, desc } = POWERUP_META[id];
              return (
                <button key={id}
                  onClick={() => goto(id === 'swap' ? 'swap_mine' : id === 'reroll' ? 'reroll' : 'joker_mine', { ability: id })}
                  className="bg-[#0f0f13] hover:bg-[#1a1a20] border border-white/10 hover:border-amber-400/50 rounded-sm p-5 text-left transition-colors">
                  <Icon size={22} className="text-amber-400 mb-3" />
                  <p className="text-white font-bold text-base mb-1">{label}</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                </button>
              );
            })}
          </div>
        )}

        {step === 'swap_mine' && (
          <div className="space-y-3">
            <BackBtn onClick={backToChoose} label="Wähle eine deiner Karten zum Tauschen" />
            <DeckPicker deck={me?.deck || []}
              onSelect={i => { setMyDeckIdx(i); goto('swap_target', { ability: 'swap', cardId: me?.deck?.[i]?.id }); }} />
          </div>
        )}

        {step === 'swap_target' && (
          <div className="space-y-4">
            <BackBtn onClick={() => goto('swap_mine', { ability: 'swap', cardId: null })}
              label={<>Tausche <span className="text-cyan-400">{me?.deck[myDeckIdx]?.name}</span> gegen eine Karte eines Gegners</>} />
            {opponents.map(op => (
              <div key={op.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <AvatarCircle id={op.avatar} color={op.color} size={22} />
                  <span className="text-gray-300 text-sm font-semibold">{op.name}</span>
                </div>
                <DeckPicker deck={op.deck || []} onSelect={i => doSwap(op.id, i)} />
              </div>
            ))}
          </div>
        )}

        {step === 'reroll' && (
          <div className="space-y-4">
            <BackBtn onClick={backToChoose} label="Wähle eine Karte eines Gegners zum Reroll" />
            {opponents.map(op => (
              <div key={op.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <AvatarCircle id={op.avatar} color={op.color} size={22} />
                  <span className="text-gray-300 text-sm font-semibold">{op.name}</span>
                </div>
                <DeckPicker deck={op.deck || []} onSelect={i => doReroll(op.id, i)} />
              </div>
            ))}
          </div>
        )}

        {step === 'joker_mine' && (
          <div className="space-y-3">
            <BackBtn onClick={backToChoose} label="Wähle eine deiner Karten zum Ersetzen" />
            <DeckPicker deck={me?.deck || []}
              onSelect={i => { setMyDeckIdx(i); goto('joker_pick', { ability: 'joker', cardId: me?.deck?.[i]?.id }); }} />
          </div>
        )}

        {step === 'joker_pick' && (
          <div className="space-y-3">
            <BackBtn onClick={() => goto('joker_mine', { ability: 'joker', cardId: null })}
              label={<>Ersetze <span className="text-cyan-400">{me?.deck[myDeckIdx]?.name}</span> durch:</>} />
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input value={jokerSearch} onChange={e => setJokerSearch(e.target.value)} placeholder="Karte suchen…"
                className="w-full bg-[#1a1a20] border border-white/10 rounded-sm pl-8 pr-4 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 outline-none" />
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {unpickedCards.map(card => (
                <button key={card.id} onClick={() => doJoker(card.id)} title={card.name}
                  className="aspect-square rounded-sm overflow-hidden border border-white/10 hover:border-cyan-400/60 transition-colors">
                  <CardImg id={card.id} name={card.name} rarity={card.rarity} />
                </button>
              ))}
              {unpickedCards.length === 0 && <p className="text-gray-600 text-xs col-span-full py-4 text-center">Keine Karten gefunden</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BackBtn({ onClick, label }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onClick} className="text-gray-500 hover:text-white transition-colors shrink-0"><X size={15} /></button>
      <p className="text-white font-semibold text-sm">{label}</p>
    </div>
  );
}

function DeckPicker({ deck, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2">
      {deck.map((card, i) => (
        <button key={i} disabled={card?.protected} onClick={() => !card?.protected && onSelect(i)}
          title={card?.name + (card?.protected ? ' (geschützt)' : '')}
          className={`relative w-16 h-16 rounded-sm overflow-hidden border-2 transition-colors ${
            card?.protected ? 'border-white/5 opacity-30 cursor-not-allowed' : 'border-white/15 hover:border-cyan-400/70 cursor-pointer'
          }`}>
          {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
          {card?.protected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Check size={13} className="text-green-400" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Main BingoRoyale component ─────────────────────────────────────────────
export default function BingoRoyale({ bingoState, myPlayerId, onPick, onPowerup, onTokenAction }) {
  const [selectedCardIdx, setSelectedCardIdx] = useState(null);
  const [pendingBlockCell, setPendingBlockCell] = useState(null);

  const state = bingoState;
  const me = state?.players?.find(p => p.id === myPlayerId);
  const isMyTurn = state?.currentPlayerId === myPlayerId;
  const currentCards = state?.currentCards || [];
  const selectedCard = selectedCardIdx != null ? currentCards[selectedCardIdx] : null;

  // Wohin darf die gewählte Karte? Gibt es passende freie Felder, MUSS sie dorthin —
  // sonst (freePlace) blockiert sie ein beliebiges freies Feld.
  const placement = useMemo(() => {
    const empty = { validCells: new Set(), matchingCells: new Set(), freePlace: false };
    if (!selectedCard || !me?.bingoGrid?.length || !isMyTurn) return empty;
    const cardAttrs = getCardAttrs(selectedCard.id);
    const matching = new Set();
    me.bingoGrid.forEach((cell, ci) => {
      if (cell.card === null && cardAttrs.includes(cell.attrKey)) matching.add(ci);
    });
    const valid = new Set();
    if (matching.size > 0) matching.forEach(ci => valid.add(ci));
    else me.bingoGrid.forEach((cell, ci) => { if (cell.card === null) valid.add(ci); });
    return { validCells: valid, matchingCells: matching, freePlace: matching.size === 0 };
  }, [selectedCard, me?.bingoGrid, isMyTurn]);

  // Kartenwechsel oder neue Runde → offene Blockier-Bestätigung verwerfen
  useEffect(() => { setPendingBlockCell(null); }, [selectedCardIdx, state?.round]);

  if (!state) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">Lade Bingo Royale…</p>
    </div>
  );

  const { phase, round, maxRounds, pickedThisRound = {},
    timerRemaining, timerSeconds, finished,
    tokenShopSubPhase, lastPowerupResult } = state;

  const amSpectator = me?.isSpectator ?? false;
  const timerUrgent = timerRemaining <= 10;
  const timerPct    = timerSeconds > 0 ? (timerRemaining / timerSeconds) * 100 : 100;

  const handleCardClick = (idx) => {
    if (!isMyTurn || amSpectator || pickedThisRound[idx]) return;
    const card = currentCards[idx];
    if (!card) return;
    const champCount = (me?.deck || []).filter(c => c.isChampion).length;
    if (card.isChampion && champCount >= 2) return;
    setSelectedCardIdx(idx === selectedCardIdx ? null : idx);
    setPendingBlockCell(null);
  };

  const handleCellClick = (cellIdx) => {
    if (selectedCardIdx == null || !isMyTurn || amSpectator) return;
    // Blockieren nur nach ausdrücklicher Bestätigung (zweiter Klick auf dasselbe Feld)
    if (placement.freePlace && pendingBlockCell !== cellIdx) { setPendingBlockCell(cellIdx); return; }
    onPick(selectedCardIdx, cellIdx);
    setSelectedCardIdx(null);
    setPendingBlockCell(null);
  };

  // Token shop phase
  if (phase === 'tokenShop') {
    return (
      <div className="h-full flex overflow-hidden relative">
        <BingoSidebar state={state} myPlayerId={myPlayerId} />
        <div className="flex-1 overflow-hidden relative">
          {state.tokenShopCurrentPlayerId === myPlayerId
            ? <TokenShop state={state} myPlayerId={myPlayerId} onPowerup={onPowerup} onTokenAction={onTokenAction} />
            : <TokenShopLive state={state} />}
          {tokenShopSubPhase === 'revealing' && lastPowerupResult && (
            <PowerupReveal result={lastPowerupResult} players={state.players} />
          )}
        </div>
      </div>
    );
  }

  const myTokens = me?.bingoTokensLeft ?? me?.bingoTokens ?? 0;

  return (
    <div className="h-full flex overflow-hidden select-none">
      <BingoSidebar state={state} myPlayerId={myPlayerId} />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar: Runde + Timer */}
        <div className="shrink-0 bg-[#0f0f13] border-b border-white/5 px-4 py-2 flex items-center gap-4">
          <span className="text-white font-bold text-sm">Runde {round}/{maxRounds}</span>
          <div className="flex-1" />
          {!finished && <TimerChip remaining={timerRemaining} />}
        </div>

        {/* Timer bar */}
        {!finished && (
          <div className="shrink-0 h-1 bg-white/5">
            <div className={`h-full transition-all duration-1000 ${timerUrgent ? 'bg-red-500' : 'bg-amber-400'}`}
              style={{ width: `${timerPct}%` }} />
          </div>
        )}

        {/* Wer ist dran? */}
        <TurnBanner state={state} myPlayerId={myPlayerId}
          selectedCard={selectedCard} freePlace={placement.freePlace} amSpectator={amSpectator} />

        {/* Verfügbare Karten der Runde */}
        <div className="shrink-0 border-b border-white/5 bg-[#0a0a0d] px-4 py-4">
          <p className="text-gray-500 text-[11px] uppercase tracking-wider mb-3 text-center">Verfügbare Karten — Runde {round}</p>
          <div className="flex gap-4 flex-wrap justify-center">
            {currentCards.map((card, idx) => {
              const isPicked     = pickedThisRound[idx] != null;
              const pickedPlayer = isPicked ? state.players.find(p => p.id === pickedThisRound[idx]) : null;
              const isSelected   = selectedCardIdx === idx;
              const champCount   = (me?.deck || []).filter(c => c.isChampion).length;
              const champLocked  = card.isChampion && champCount >= 2;
              const isClickable  = isMyTurn && !amSpectator && !isPicked && !champLocked;

              return (
                <div key={idx}>
                  <div onClick={() => isClickable && handleCardClick(idx)}
                    title={card.name + (champLocked ? ' (Champion-Limit)' : '')}
                    className={`relative rounded-sm overflow-hidden border-2 transition-colors duration-100 ${
                      isPicked ? 'opacity-40 cursor-default' :
                      champLocked ? 'opacity-25 cursor-not-allowed' :
                      isSelected ? 'ring-2 ring-cyan-400 cursor-pointer' :
                      isClickable ? 'cursor-pointer hover:border-cyan-400/60' : 'cursor-default'
                    }`}
                    style={{
                      width: 96, height: 96,
                      borderColor: isPicked ? (pickedPlayer?.color || '#444') + '88' : isSelected ? '#06b6d4' : '#ffffff18',
                    }}>
                    <CardImg id={card.id} name={card.name} rarity={card.rarity} />
                    {card.isChampion && !isPicked && (
                      <div className="absolute top-0.5 right-0.5 bg-black/60 rounded-[2px] p-0.5">
                        <Crown size={10} className="text-cyan-400" />
                      </div>
                    )}
                    {isPicked && pickedPlayer && (
                      <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: pickedPlayer.color + '55' }} />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400 text-center mt-1.5 truncate max-w-[96px]">
                    {isPicked ? <span style={{ color: (pickedPlayer?.color || '#888') + 'cc' }}>{pickedPlayer?.name}</span> : card.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Eigene Bingo-Karte */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
          {!amSpectator && me?.bingoGrid?.length > 0 ? (
            <div className="max-w-2xl mx-auto space-y-4">

              {/* Deutliche Warnung, wenn die Karte ein Feld blockieren würde */}
              {selectedCard && isMyTurn && placement.freePlace && (
                <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/40 rounded-md px-4 py-3">
                  <Ban size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-red-300 text-sm font-bold">„{selectedCard.name}" passt auf kein freies Feld deiner Bingo-Karte</p>
                    <p className="text-red-200/80 text-xs mt-1 leading-relaxed">
                      {pendingBlockCell != null
                        ? <>Das Feld „{BINGO_ATTR_LABEL[me.bingoGrid[pendingBlockCell]?.attrKey] || '?'}" wird dauerhaft blockiert und zählt für kein Bingo mehr.{' '}
                            <span className="font-bold text-red-300">Klicke es erneut an, um das zu bestätigen</span> — oder wähle ein anderes Feld bzw. oben eine andere Karte.</>
                        : <>Egal wo du sie ablegst: Das Feld wird dauerhaft blockiert und zählt für kein Bingo mehr.
                            Orange markierte Felder sind wählbar — zweimal klicken zum Bestätigen.
                            Wenn du kein Feld opfern willst, wähle oben eine andere Karte.</>}
                    </p>
                  </div>
                </div>
              )}
              {selectedCard && isMyTurn && !placement.freePlace && (
                <div className="flex items-center gap-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-md px-4 py-2.5">
                  <Check size={15} className="text-cyan-400 shrink-0" />
                  <p className="text-cyan-300 text-xs font-semibold">
                    „{selectedCard.name}" passt — lege sie auf eines der blau markierten Felder.
                  </p>
                </div>
              )}

              {/* Abgehobenes Board-Panel */}
              <div className="rounded-md border border-amber-400/25 bg-[#111018] shadow-[0_16px_40px_rgba(0,0,0,0.55)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-amber-400/10 border-b border-amber-400/20">
                  <p className="text-amber-300 text-xs font-bold uppercase tracking-widest">Deine Bingo-Karte</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 font-semibold">{(me.completedLines || []).length}/10 Reihen</span>
                    {myTokens > 0 && (
                      <span className="text-amber-400 text-xs font-bold bg-amber-400/10 border border-amber-400/25 px-2 py-0.5 rounded-sm">
                        {myTokens} Token
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-3 sm:p-4 bg-[#0c0b12]">
                  <MyBingoCard
                    grid={me.bingoGrid}
                    completedLines={me.completedLines || []}
                    validCells={placement.validCells}
                    matchingCells={placement.matchingCells}
                    freePlace={placement.freePlace}
                    pendingBlockCell={pendingBlockCell}
                    onCellClick={handleCellClick}
                    isMyTurn={isMyTurn && !amSpectator}
                  />
                </div>
              </div>
            </div>
          ) : amSpectator ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600 text-sm">Zuschauer — kein eigenes Bingo-Feld</p>
            </div>
          ) : null}
        </div>

      </div>
    </div>
  );
}
