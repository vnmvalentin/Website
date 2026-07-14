import React, { useState, useMemo } from 'react';
import { Clock, Crown, Zap, Shuffle, Gift, Search, X, Check, ArrowRight } from 'lucide-react';
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

function getCompletedCellSet(completedLines) {
  const s = new Set();
  BINGO_LINE_IDS.forEach((id, li) => { if (completedLines.includes(id)) BINGO_LINES[li].forEach(ci => s.add(ci)); });
  return s;
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

// ── Sidebar — like SnakeRoyale: deck slots + champion counter ──────────────
function BingoSidebar({ state, myPlayerId }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators    = state.players.filter(p => p.isSpectator);

  return (
    <div className="w-56 shrink-0 bg-[#16161a] border-r border-white/5 overflow-y-auto custom-scrollbar py-3 px-2.5 flex flex-col gap-3">
      {activePlayers.map(p => {
        const isMe       = p.id === myPlayerId;
        const champCount = (p.deck || []).filter(c => c.isChampion).length;
        return (
          <div key={p.id}
            className={`rounded-sm border p-3 transition-colors ${isMe ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/5 bg-[#0f0f13]'}`}>
            <div className="flex items-center gap-2 mb-2.5 min-w-0">
              <AvatarCircle id={p.avatar} color={p.color} size={28} />
              <span className="text-white text-xs font-semibold truncate flex-1">{p.name}</span>
              {isMe && <span className="text-[10px] text-cyan-500 shrink-0">Du</span>}
            </div>
            {/* Bingo tokens */}
            {(p.bingoTokens || 0) > 0 && (
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-sm">
                  {p.bingoTokens} Bingo{p.bingoTokens > 1 ? 's' : ''}
                </span>
              </div>
            )}
            {/* Deck 2×4 */}
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 8 }, (_, ci) => {
                const card = p.deck?.[ci];
                return (
                  <div key={ci}
                    className={`aspect-square rounded-sm overflow-hidden border ${
                      card ? (RARITY_BORDER[card.rarity] || 'border-white/10') : 'border-white/5 bg-white/[0.02]'
                    }`}>
                    {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Crown size={10} className={champCount > 0 ? 'text-cyan-400' : 'text-gray-700'} />
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

// ── Full interactive bingo card ────────────────────────────────────────────
function MyBingoCard({ grid, completedLines = [], selectedCard, onCellClick, isMyTurn }) {
  const completedCells = useMemo(() => getCompletedCellSet(completedLines), [completedLines]);

  const { validCells, matchingCells, freePlace } = useMemo(() => {
    if (!isMyTurn || !selectedCard || !grid) return { validCells: new Set(), matchingCells: new Set(), freePlace: false };
    const cardAttrs = getCardAttrs(selectedCard.id);
    const matching  = new Set();
    grid.forEach((cell, ci) => {
      if (cell.card === null && cardAttrs.includes(cell.attrKey)) matching.add(ci);
    });
    const valid = new Set();
    if (matching.size > 0) {
      matching.forEach(ci => valid.add(ci));
    } else {
      grid.forEach((cell, ci) => { if (cell.card === null) valid.add(ci); });
    }
    return { validCells: valid, matchingCells: matching, freePlace: matching.size === 0 };
  }, [selectedCard, grid, isMyTurn]);

  if (!grid?.length) return null;

  return (
    <div className="bg-[#0a0a0e] rounded-sm border border-white/5 p-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {grid.map((cell, ci) => {
          const isFilled    = cell.card !== null;
          const isBingo     = completedCells.has(ci);
          const isValid     = validCells.has(ci);
          const isMatching  = matchingCells.has(ci);
          const isFreeSlot  = isValid && isMyTurn && freePlace; // free-placement mode
          const attrColor   = BINGO_ATTR_COLOR[cell.attrKey] || '#888';
          const label       = BINGO_ATTR_LABEL[cell.attrKey] || cell.attrKey;
          // Did the placed card NOT match this cell's attribute?
          const isBlocking  = isFilled && !getCardAttrs(cell.card.id).includes(cell.attrKey);

          return (
            <div key={ci}
              onClick={() => isValid && isMyTurn && !isFilled && onCellClick(ci)}
              title={isFilled ? `${cell.card.name}${isBlocking ? ' (blockiert)' : ''}` : label}
              className={`
                relative rounded-sm border overflow-hidden transition-all duration-100 select-none
                ${isValid && isMyTurn ? 'cursor-pointer hover:scale-[1.04] z-10' : 'cursor-default'}
              `}
              style={{
                aspectRatio: '1',
                borderColor: isBingo
                  ? '#f59e0b'
                  : isBlocking
                    ? '#ef444488'
                    : isFreeSlot
                      ? '#f9731688'
                      : isMatching && isMyTurn
                        ? '#06b6d4'
                        : isFilled
                          ? '#ffffff15'
                          : attrColor + '40',
                boxShadow: isBingo
                  ? '0 0 10px #f59e0b44'
                  : isFreeSlot
                    ? '0 0 6px #f9731622'
                    : isMatching && isMyTurn
                      ? '0 0 8px #06b6d433'
                      : 'none',
                background: isFilled ? 'transparent' : isFreeSlot ? '#f9731608' : attrColor + '0c',
              }}>

              {isFilled ? (
                <>
                  <CardImg id={cell.card.id} name={cell.card.name} rarity={cell.card.rarity} />
                  {isBingo && <div className="absolute inset-0 bg-amber-400/15 pointer-events-none" />}
                  {/* Red X overlay for blocking cards */}
                  {isBlocking && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/30">
                      <X size={20} className="text-red-400 drop-shadow" strokeWidth={3} />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 px-1 pb-0.5 text-[7px] font-bold text-center pointer-events-none truncate"
                    style={{ background: 'linear-gradient(transparent,#000c)', color: isBlocking ? '#ef4444' : attrColor }}>
                    {label}
                  </div>
                </>
              ) : (
                <>
                  {isValid && isMyTurn && (
                    <div className="absolute inset-0 ring-1 ring-inset pointer-events-none"
                      style={{ borderColor: isFreeSlot ? '#f97316aa' : isMatching ? '#06b6d4' : '#ffffff22' }} />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center p-1.5">
                    <span className="text-[9px] font-semibold text-center leading-tight w-full"
                      style={{ color: attrColor }}>
                      {label}
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Card comparison for reveal overlay ────────────────────────────────────
function CardCompare({ left, right, leftLabel, rightLabel, leftColor, rightColor }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-center space-y-1">
        <div className="w-16 h-16 rounded-sm overflow-hidden border mx-auto"
          style={{ borderColor: (leftColor || '#888') + '88' }}>
          {left && <CardImg id={left.id} name={left.name} rarity={left.rarity} />}
        </div>
        <p className="text-[9px] text-gray-500 truncate max-w-[72px]">{leftLabel}</p>
        {left && <p className="text-[9px] text-white font-semibold truncate max-w-[72px]">{left.name}</p>}
      </div>
      <ArrowRight size={18} className="text-gray-600 shrink-0" />
      <div className="text-center space-y-1">
        <div className="w-16 h-16 rounded-sm overflow-hidden border mx-auto"
          style={{ borderColor: (rightColor || '#888') + '88' }}>
          {right && <CardImg id={right.id} name={right.name} rarity={right.rarity} />}
        </div>
        <p className="text-[9px] text-gray-500 truncate max-w-[72px]">{rightLabel}</p>
        {right && <p className="text-[9px] text-white font-semibold truncate max-w-[72px]">{right.name}</p>}
      </div>
    </div>
  );
}

// ── Powerup reveal overlay ─────────────────────────────────────────────────
function PowerupReveal({ result, players }) {
  if (!result) return null;
  const actor = players.find(p => p.id === result.playerId);
  const typeIcon = { swap: Zap, reroll: Shuffle, joker: Gift }[result.type] || Gift;
  const TypeIcon = typeIcon;
  const typeLabel = { swap: 'Der Dieb', reroll: 'Der Troll', joker: 'Der Planer' }[result.type] || result.type;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
      <div className="bg-[#16161a] border border-amber-400/30 rounded-sm p-6 max-w-sm w-full mx-4 shadow-2xl"
        style={{ boxShadow: '0 0 32px #f59e0b22' }}>
        <div className="flex items-center gap-3 mb-4">
          <AvatarCircle id={actor?.avatar} color={actor?.color} size={36} />
          <div>
            <p className="text-white font-bold text-sm">{actor?.name || '?'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <TypeIcon size={11} className="text-amber-400" />
              <span className="text-amber-400 text-xs font-semibold">{typeLabel}</span>
            </div>
          </div>
        </div>

        {result.type === 'swap' && (
          <div className="space-y-2">
            <p className="text-gray-500 text-xs">
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
            <p className="text-gray-500 text-xs">
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
            <p className="text-gray-500 text-xs">Karte aus dem Pool ausgewählt</p>
            <CardCompare
              left={result.oldCard} leftLabel="Ersetzt"   leftColor="#ef4444"
              right={result.newCard} rightLabel="Neu"      rightColor="#22c55e"
            />
          </div>
        )}

        <p className="text-gray-600 text-[10px] text-center mt-4 animate-pulse">Weiter in wenigen Sekunden…</p>
      </div>
    </div>
  );
}

// ── Token shop (picking phase) ─────────────────────────────────────────────
function TokenShop({ state, myPlayerId, onPowerup }) {
  const [step, setStep]           = useState('choose');
  const [myDeckIdx, setMyDeckIdx] = useState(null);
  const [jokerSearch, setJokerSearch] = useState('');

  const currentTokenPlayerId = state.tokenShopCurrentPlayerId;
  const isMyTurn   = currentTokenPlayerId === myPlayerId;
  const me         = state.players.find(p => p.id === myPlayerId);
  const currentTokenPlayer = state.players.find(p => p.id === currentTokenPlayerId);
  const opponents  = state.players.filter(p => !p.isSpectator && p.id !== myPlayerId);
  const unpickedCards = (state.unpickedCards || []).filter(c =>
    !jokerSearch.trim() || c.name.toLowerCase().includes(jokerSearch.toLowerCase())
  );

  const reset = () => { setStep('choose'); setMyDeckIdx(null); setJokerSearch(''); };

  // Pass values directly to avoid stale-closure issues with React setState
  const doSwap   = (tPid, tIdx) => { onPowerup('swap',   { myDeckIdx, targetPlayerId: tPid, theirDeckIdx: tIdx }); reset(); };
  const doReroll = (tPid, tIdx) => { onPowerup('reroll', { targetPlayerId: tPid, theirDeckIdx: tIdx });            reset(); };
  const doJoker  = (id)         => { onPowerup('joker',  { myDeckIdx, newCardId: id });                            reset(); };

  // Not my turn — show waiting screen
  if (!isMyTurn) {
    const remaining = (state.tokenShopQueue?.length ?? 0) - (state.tokenShopIdx ?? 0);
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-gray-500 text-xs uppercase tracking-wider">Token-Shop</p>
        <div className="flex items-center gap-3">
          <AvatarCircle id={currentTokenPlayer?.avatar} color={currentTokenPlayer?.color} size={40} />
          <p className="text-white font-bold text-lg">{currentTokenPlayer?.name || '?'} wählt ein Power-Up…</p>
        </div>
        <p className="text-gray-600 text-xs">{remaining} Token verbleibend</p>
      </div>
    );
  }

  const remaining = (state.tokenShopQueue || []).slice(state.tokenShopIdx ?? 0).filter(id => id === myPlayerId).length;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h2 className="text-white font-bold text-lg">Dein Zug — Token-Shop</h2>
          <span className="text-amber-400 text-sm font-semibold">{remaining} Token übrig</span>
        </div>

        {step === 'choose' && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { id: 'swap',   Icon: Zap,    label: 'Der Dieb',   sub: 'Tausche eine deiner Karten mit einer Karte eines Gegners.' },
              { id: 'reroll', Icon: Shuffle, label: 'Der Troll',  sub: 'Wähle eine Karte eines Gegners — sie wird durch eine zufällige ersetzt.' },
              { id: 'joker',  Icon: Gift,   label: 'Der Planer', sub: 'Wähle eine beliebige Karte und füge sie deinem Deck hinzu.' },
            ].map(({ id, Icon, label, sub }) => (
              <button key={id}
                onClick={() => setStep(id === 'swap' ? 'swap_mine' : id === 'reroll' ? 'reroll' : 'joker_mine')}
                className="bg-[#0f0f13] hover:bg-[#1a1a20] border border-white/10 hover:border-amber-400/40 rounded-sm p-5 text-left transition-all">
                <Icon size={20} className="text-amber-400 mb-3" />
                <p className="text-white font-bold text-sm mb-1">{label}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{sub}</p>
              </button>
            ))}
          </div>
        )}

        {step === 'swap_mine' && (
          <div className="space-y-3">
            <BackBtn onClick={reset} label="Wähle eine deiner Karten zum Tauschen" />
            <DeckPicker deck={me?.deck || []} onSelect={i => { setMyDeckIdx(i); setStep('swap_target'); }} />
          </div>
        )}

        {step === 'swap_target' && (
          <div className="space-y-4">
            <BackBtn onClick={() => setStep('swap_mine')} label={<>Tausche <span className="text-cyan-400">{me?.deck[myDeckIdx]?.name}</span> gegen eine Karte eines Gegners</>} />
            {opponents.map(op => (
              <div key={op.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <AvatarCircle id={op.avatar} color={op.color} size={20} />
                  <span className="text-gray-300 text-xs font-semibold">{op.name}</span>
                </div>
                <DeckPicker deck={op.deck || []} onSelect={i => doSwap(op.id, i)} />
              </div>
            ))}
          </div>
        )}

        {step === 'reroll' && (
          <div className="space-y-4">
            <BackBtn onClick={reset} label="Wähle eine Karte eines Gegners zum Reroll" />
            {opponents.map(op => (
              <div key={op.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <AvatarCircle id={op.avatar} color={op.color} size={20} />
                  <span className="text-gray-300 text-xs font-semibold">{op.name}</span>
                </div>
                <DeckPicker deck={op.deck || []} onSelect={i => doReroll(op.id, i)} />
              </div>
            ))}
          </div>
        )}

        {step === 'joker_mine' && (
          <div className="space-y-3">
            <BackBtn onClick={reset} label="Wähle eine deiner Karten zum Ersetzen" />
            <DeckPicker deck={me?.deck || []} onSelect={i => { setMyDeckIdx(i); setStep('joker_pick'); }} />
          </div>
        )}

        {step === 'joker_pick' && (
          <div className="space-y-3">
            <BackBtn onClick={() => setStep('joker_mine')} label={<>Ersetze <span className="text-cyan-400">{me?.deck[myDeckIdx]?.name}</span> durch:</>} />
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input value={jokerSearch} onChange={e => setJokerSearch(e.target.value)} placeholder="Karte suchen…"
                className="w-full bg-[#1a1a20] border border-white/10 rounded-sm pl-8 pr-4 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 outline-none" />
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {unpickedCards.map(card => (
                <button key={card.id} onClick={() => doJoker(card.id)} title={card.name}
                  className="aspect-square rounded-sm overflow-hidden border border-white/10 hover:border-cyan-400/60 transition-all hover:scale-105">
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
      <button onClick={onClick} className="text-gray-500 hover:text-white transition-colors shrink-0"><X size={14} /></button>
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
          className={`relative w-14 h-14 rounded-sm overflow-hidden border transition-all ${
            card?.protected ? 'border-white/5 opacity-30 cursor-not-allowed' : 'border-white/15 hover:border-cyan-400/60 hover:scale-105 cursor-pointer'
          }`}>
          {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
          {card?.protected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Check size={12} className="text-green-400" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Main BingoRoyale component ─────────────────────────────────────────────
export default function BingoRoyale({ bingoState, myPlayerId, onPick, onPowerup }) {
  const [selectedCardIdx, setSelectedCardIdx] = useState(null);

  const state = bingoState;
  if (!state) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">Lade Bingo Royale…</p>
    </div>
  );

  const { phase, round, maxRounds, currentCards = [], pickedThisRound = {},
    currentPlayerId, timerRemaining, timerSeconds, finished,
    tokenShopSubPhase, lastPowerupResult } = state;

  const isMyTurn    = currentPlayerId === myPlayerId;
  const me          = state.players.find(p => p.id === myPlayerId);
  const amSpectator = me?.isSpectator ?? false;
  const currentPlayer = state.players.find(p => p.id === currentPlayerId);
  const timerUrgent = timerRemaining <= 10;
  const timerPct    = timerSeconds > 0 ? (timerRemaining / timerSeconds) * 100 : 100;
  const selectedCard = selectedCardIdx != null ? currentCards[selectedCardIdx] : null;

  const handleCardClick = (idx) => {
    if (!isMyTurn || amSpectator || pickedThisRound[idx]) return;
    const card = currentCards[idx];
    if (!card) return;
    const champCount = (me?.deck || []).filter(c => c.isChampion).length;
    if (card.isChampion && champCount >= 2) return;
    setSelectedCardIdx(idx === selectedCardIdx ? null : idx);
  };

  const handleCellClick = (cellIdx) => {
    if (selectedCardIdx == null || !isMyTurn || amSpectator) return;
    onPick(selectedCardIdx, cellIdx);
    setSelectedCardIdx(null);
  };

  // Token shop phase
  if (phase === 'tokenShop') {
    return (
      <div className="h-full flex overflow-hidden relative">
        <BingoSidebar state={state} myPlayerId={myPlayerId} />
        <div className="flex-1 overflow-hidden relative">
          <TokenShop state={state} myPlayerId={myPlayerId} onPowerup={onPowerup} />
          {tokenShopSubPhase === 'revealing' && lastPowerupResult && (
            <PowerupReveal result={lastPowerupResult} players={state.players} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden select-none">
      <BingoSidebar state={state} myPlayerId={myPlayerId} />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="shrink-0 bg-[#0f0f13] border-b border-white/5 px-4 py-2 flex items-center gap-4">
          <span className="text-white font-bold text-sm">Runde {round}/{maxRounds}</span>
          <div className="flex-1 min-w-0 text-sm">
            {finished ? (
              <span className="text-green-400 font-bold">Fertig!</span>
            ) : amSpectator ? (
              <span className="text-gray-500">Zuschauer</span>
            ) : isMyTurn ? (
              <span className="text-cyan-400 font-black">
                {selectedCard ? `${selectedCard.name} gewählt — Bingo-Feld wählen` : 'Dein Zug — Karte wählen'}
              </span>
            ) : (
              <span className="text-gray-400">
                Zug von{' '}
                <span className="font-semibold" style={{ color: currentPlayer?.color }}>
                  {currentPlayer?.name || '…'}
                </span>
              </span>
            )}
          </div>
          {!finished && (
            <div className={`flex items-center gap-1.5 border rounded-sm px-2.5 py-1 shrink-0 ${timerUrgent ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'}`}>
              <Clock size={11} className={timerUrgent ? 'text-red-400' : 'text-gray-500'} />
              <span className={`font-mono font-bold text-sm tabular-nums ${timerUrgent ? 'text-red-400' : 'text-white'}`}>{timerRemaining}s</span>
            </div>
          )}
        </div>

        {/* Timer bar */}
        {!finished && (
          <div className="shrink-0 h-px bg-white/5">
            <div className={`h-full transition-all duration-1000 ${timerUrgent ? 'bg-red-500' : 'bg-amber-400'}`}
              style={{ width: `${timerPct}%` }} />
          </div>
        )}

        {/* Round cards — centered, bigger */}
        <div className="shrink-0 border-b border-white/5 bg-[#0a0a0d] px-4 py-4">
          <p className="text-gray-600 text-[10px] uppercase tracking-wider mb-3 text-center">Verfügbare Karten — Runde {round}</p>
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
                    className={`relative rounded-sm overflow-hidden border transition-all duration-100 ${
                      isPicked ? 'opacity-40 cursor-default' :
                      champLocked ? 'opacity-25 cursor-not-allowed' :
                      isSelected ? 'ring-2 ring-cyan-400 cursor-pointer scale-105' :
                      isClickable ? 'cursor-pointer hover:scale-105' : 'cursor-default'
                    }`}
                    style={{
                      width: 88, height: 88,
                      borderColor: isPicked ? (pickedPlayer?.color || '#444') + '88' : isSelected ? '#06b6d4' : '#ffffff18',
                    }}>
                    <CardImg id={card.id} name={card.name} rarity={card.rarity} />
                    {card.isChampion && !isPicked && (
                      <div className="absolute top-0.5 right-0.5 bg-black/60 rounded-[2px] p-0.5">
                        <Crown size={9} className="text-cyan-400" />
                      </div>
                    )}
                    {isPicked && pickedPlayer && (
                      <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: pickedPlayer.color + '55' }} />
                    )}
                  </div>
                  <p className="text-[9px] text-gray-600 text-center mt-1 truncate w-22 max-w-[88px]">
                    {isPicked ? <span style={{ color: (pickedPlayer?.color || '#888') + 'cc' }}>{pickedPlayer?.name}</span> : card.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* My bingo card */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {!amSpectator && me?.bingoGrid?.length > 0 ? (
            <div className="max-w-xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-500 text-xs uppercase tracking-wider">Deine Bingo-Karte</p>
                {(me.bingoTokens || 0) > 0 && (
                  <span className="text-amber-400 text-xs font-bold bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-sm">
                    {me.bingoTokens} Bingo{me.bingoTokens > 1 ? 's' : ''}!
                  </span>
                )}
              </div>
              <MyBingoCard
                grid={me.bingoGrid}
                completedLines={me.completedLines || []}
                selectedCard={selectedCard}
                onCellClick={handleCellClick}
                isMyTurn={isMyTurn && !amSpectator}
              />
              {selectedCard && isMyTurn && (() => {
                const hasMatch = getCardAttrs(selectedCard.id).some(a =>
                  me.bingoGrid.some(c => c.card === null && c.attrKey === a)
                );
                return hasMatch ? (
                  <p className="text-center text-xs text-cyan-400 mt-3 animate-pulse">
                    Passendes Feld wählen (blau hervorgehoben)
                  </p>
                ) : (
                  <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-sm px-3 py-2">
                    <X size={13} className="text-red-400 shrink-0" />
                    <p className="text-xs text-red-400 font-semibold">
                      Kein passendes Feld — Karte blockiert ein freies Feld (kein Bingo-Wert)
                    </p>
                  </div>
                );
              })()}
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
