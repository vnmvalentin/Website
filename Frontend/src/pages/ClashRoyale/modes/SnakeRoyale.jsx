import React, { useMemo } from 'react';
import { Clock, Crown } from 'lucide-react';
import { RARITY_COLOR, RARITY_BORDER } from '../data/cards';

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

const SNAKE_I18N = {
  de: {
    you: 'Du',
    gameOver: 'Spiel beendet',
    newSnake: 'Neue Schlange — freie Auswahl!',
    noMoveTimer: 'Kein Zug möglich – Timer läuft ab…',
    yourTurn: 'Dein Zug',
    turnOfPrefix: 'Zug von',
    round: (n) => `Runde ${n}/8`,
    championLimitSuffix: ' (Champion-Limit)',
  },
  en: {
    you: 'You',
    gameOver: 'Game over',
    newSnake: 'New snake — pick anywhere!',
    noMoveTimer: 'No move possible – timer running out…',
    yourTurn: 'Your turn',
    turnOfPrefix: 'Turn:',
    round: (n) => `Round ${n}/8`,
    championLimitSuffix: ' (champion limit)',
  },
};

function getAdjacentIndices(idx, cols, totalCells) {
  const col = idx % cols;
  const adj = [];
  if (idx - cols >= 0)         adj.push(idx - cols);
  if (idx + cols < totalCells) adj.push(idx + cols);
  if (col > 0)                 adj.push(idx - 1);
  if (col < cols - 1)          adj.push(idx + 1);
  return adj;
}

function CardImg({ id, name, rarity }) {
  const color = RARITY_COLOR[rarity] || '#555';
  return (
    <div className="relative w-full h-full" style={{ background: color + '18' }}>
      <img
        src={`${CARD_CDN}${id}.png`}
        alt={name}
        className="w-full h-full object-cover"
        onError={e => {
          e.target.style.display = 'none';
          const fb = e.target.parentElement?.querySelector('.fb');
          if (fb) fb.classList.remove('hidden');
        }}
      />
      <div className="fb hidden absolute inset-0 flex items-center justify-center p-0.5">
        <span className="text-[6px] text-center leading-tight font-bold text-white/60 break-words">
          {name.length > 12 ? name.substring(0, 11) + '…' : name}
        </span>
      </div>
    </div>
  );
}

export default function SnakeRoyale({ gameState, players, myPlayerId, onPickCard, lang = 'de' }) {
  const t = SNAKE_I18N[lang] || SNAKE_I18N.de;
  const {
    grid, gridCols = 11, currentTurn, turnOrder,
    lastPickedCellIndex, timerRemaining, timerSeconds, finished, isSnakeReset,
  } = gameState;

  const totalCells = grid.length;
  const currentPlayerIdx = turnOrder?.[currentTurn];
  const currentPlayer    = players[currentPlayerIdx];
  const isMyTurn         = currentPlayer?.id === myPlayerId;

  const { validSet, blockedSet } = useMemo(() => {
    const valid   = new Set();
    const blocked = new Set();
    if (finished || !isMyTurn || !grid) return { validSet: valid, blockedSet: blocked };

    const me = players.find(p => p.id === myPlayerId);
    const champCount = (me?.deck || []).filter(c => c.isChampion).length;
    const candidates = lastPickedCellIndex === null
      ? Array.from({ length: totalCells }, (_, i) => i)
      : getAdjacentIndices(lastPickedCellIndex, gridCols, totalCells);

    for (const idx of candidates) {
      if (grid[idx]?.pickedBy !== null) continue;
      if (grid[idx].card.isChampion && champCount >= 2) blocked.add(idx);
      else valid.add(idx);
    }
    return { validSet: valid, blockedSet: blocked };
  }, [grid, isMyTurn, myPlayerId, players, lastPickedCellIndex, finished, gridCols, totalCells]);

  const timerPct    = timerSeconds > 0 ? (timerRemaining / timerSeconds) * 100 : 100;
  const timerUrgent = timerRemaining <= 10;
  const activePlayerCount = players.filter(p => !p.isSpectator).length;
  const round       = Math.min(Math.floor(currentTurn / Math.max(activePlayerCount, 1)) + 1, 8);

  return (
    <div className="h-full flex overflow-hidden select-none">

      {/* ── Deck sidebar ──────────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 bg-[#16161a] border-r border-white/5 overflow-y-auto custom-scrollbar py-3 px-2.5 flex flex-col gap-3">
        {/* Aktive Spieler mit Deck */}
        {players.map((player, idx) => {
          if (player.isSpectator) return null;
          const isCurrent  = turnOrder?.[currentTurn] === idx;
          const champCount = (player.deck || []).filter(c => c.isChampion).length;
          return (
            <div key={player.id}
              className={`rounded-sm border p-3 transition-colors ${
                isCurrent ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/5 bg-[#0f0f13]'
              }`}>
              <div className="flex items-center gap-2 mb-2.5 min-w-0">
                <AvatarCircle id={player.avatar} color={player.color} size={28} />
                <span className="text-white text-xs font-semibold truncate flex-1">{player.name}</span>
                {player.id === myPlayerId && (
                  <span className="text-[10px] text-cyan-500 shrink-0">{t.you}</span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 8 }, (_, ci) => {
                  const card = player.deck?.[ci];
                  return (
                    <div key={ci}
                      className={`aspect-square rounded-sm overflow-hidden border ${
                        card ? RARITY_BORDER[card.rarity] || 'border-white/10' : 'border-white/5 bg-white/[0.02]'
                      }`}>
                      {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1 mt-2">
                <Crown size={10} className={champCount > 0 ? 'text-cyan-400' : 'text-gray-700'} />
                <span className="text-[10px] text-gray-500">{champCount}/2 Champions</span>
                <span className="text-[10px] text-gray-600 ml-auto">{player.deck?.length || 0}/8</span>
              </div>
            </div>
          );
        })}

        {/* Zuschauer — kompakt, ganz unten */}
        {players.some(p => p.isSpectator) && (
          <>
            <div className="h-px bg-white/5 mt-1" />
            {players.filter(p => p.isSpectator).map(player => (
              <div key={player.id} className="rounded-sm border border-white/5 bg-[#0f0f13]/60 px-3 py-2 flex items-center gap-2 opacity-50">
                <AvatarCircle id={player.avatar} color={player.color} size={22} />
                <span className="text-gray-400 text-xs truncate flex-1">{player.name}</span>
                {player.id === myPlayerId && <span className="text-[9px] text-cyan-600 shrink-0">{t.you}</span>}
                <span className="text-[9px] text-gray-600 shrink-0">👁</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Turn bar */}
        <div className="shrink-0 bg-[#0f0f13] border-b border-white/5 px-4 py-2 flex items-center gap-4">
          <div className="flex-1 min-w-0 text-sm">
            {finished ? (
              <span className="text-green-400 font-bold">{t.gameOver}</span>
            ) : isSnakeReset ? (
              <span className="text-amber-400 font-bold">{t.newSnake}</span>
            ) : isMyTurn && validSet.size === 0 ? (
              <span className="text-orange-400 font-semibold">{t.noMoveTimer}</span>
            ) : isMyTurn ? (
              <span className="text-cyan-400 font-black">{t.yourTurn}</span>
            ) : (
              <span className="text-gray-400">
                {t.turnOfPrefix}{' '}
                <span className="font-semibold" style={{ color: currentPlayer?.color }}>
                  {currentPlayer?.name || '…'}
                </span>
              </span>
            )}
          </div>

          <span className="text-gray-600 text-xs shrink-0">{t.round(round)}</span>

          {!finished && (
            <div className={`flex items-center gap-1.5 border rounded-sm px-2.5 py-1 shrink-0 ${
              timerUrgent ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'
            }`}>
              <Clock size={11} className={timerUrgent ? 'text-red-400' : 'text-gray-500'} />
              <span className={`font-mono font-bold text-sm tabular-nums ${timerUrgent ? 'text-red-400' : 'text-white'}`}>
                {timerRemaining}s
              </span>
            </div>
          )}
        </div>

        {/* Timer bar */}
        {!finished && (
          <div className="shrink-0 h-px bg-white/5">
            <div
              className={`h-full transition-all duration-1000 ${timerUrgent ? 'bg-red-500' : 'bg-cyan-500'}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
              width: `min(${gridCols * 62}px, calc(100vw - 15rem - 3rem))`,
              aspectRatio: `${gridCols} / ${Math.ceil(totalCells / gridCols)}`,
            }}
          >
            {grid.map((cell, idx) => {
              const isPicked   = cell.pickedBy !== null;
              const isValid    = validSet.has(idx);
              const isBlocked  = blockedSet.has(idx);
              const isLast     = idx === lastPickedCellIndex;
              const picker     = isPicked ? players.find(p => p.id === cell.pickedBy) : null;

              return (
                <div
                  key={idx}
                  onClick={() => isValid && !finished && isMyTurn && onPickCard(idx)}
                  title={`${cell.card.name}${isBlocked ? t.championLimitSuffix : ''}`}
                  className={`
                    relative aspect-square rounded-[2px] border overflow-hidden transition-transform duration-100
                    ${isValid && isMyTurn && !finished ? 'cursor-pointer hover:scale-110 z-10' : 'cursor-default'}
                    ${isPicked ? 'opacity-65' : ''}
                    ${!isPicked && !isValid && !isBlocked ? 'opacity-25' : ''}
                    ${isBlocked ? 'opacity-15 grayscale' : ''}
                  `}
                  style={{
                    borderColor: isPicked
                      ? (picker?.color || '#444') + 'aa'
                      : isValid
                        ? '#06b6d466'
                        : '#ffffff0f',
                    boxShadow: isLast ? `0 0 0 2px ${picker?.color || '#fff'}` : isValid ? '0 0 6px #06b6d422' : 'none',
                  }}
                >
                  <CardImg id={cell.card.id} name={cell.card.name} rarity={cell.card.rarity} />

                  {/* Picked: color tint */}
                  {isPicked && picker && (
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ backgroundColor: picker.color + '40' }} />
                  )}

                  {/* Valid: ring */}
                  {isValid && isMyTurn && !finished && (
                    <div className="absolute inset-0 ring-1 ring-inset ring-cyan-400/50 pointer-events-none" />
                  )}

                  {/* Champion crown */}
                  {cell.card.isChampion && !isPicked && (
                    <div className="absolute top-0 right-0 p-[2px] bg-black/50 pointer-events-none">
                      <Crown size={7} className="text-cyan-400" />
                    </div>
                  )}

                  {/* Last-pick dot */}
                  {isLast && (
                    <div className="absolute bottom-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
