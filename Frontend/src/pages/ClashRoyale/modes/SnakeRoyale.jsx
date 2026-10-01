import React, { useMemo } from 'react';
import { CrTv } from '../ui/CrIcons';
import crownIcon from '../../../assets/clashRoyale/ui/crown.png';
import ModeShell from './ModeShell';
import { CARD_RATIO } from './cardCrop';
import CardFace from '../ui/CardFace';
import { GameHeader, ProgressHairline, GameSurface, PlayerPanel, DeckGrid, TurnBanner } from './GameChrome';
import { avatarUrl } from '../components/avatars';

/** Akzentfarbe des Modus — Kopfzeile, Fortschritt, gültige Felder. */
const ACCENT = '#22d3ee';


function AvatarCircle({ id, color, size = 28 }) {
  const url = avatarUrl(id);
  return (
    <div className="rounded-full overflow-hidden shrink-0 border-2 cr-avatar-pick"
      style={{ width: size, height: size, borderColor: (color || '#888') + '99' }}>
      {url && <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className="w-full h-full object-cover object-center" />}
    </div>
  );
}

const SNAKE_I18N = {
  de: {
    you: 'Du',
    roundLabel: 'Runde',
    gameOver: 'Spiel beendet',
    newSnake: 'Neue Schlange — freie Auswahl!',
    noMoveTimer: 'Kein Zug möglich – Timer läuft ab…',
    yourTurn: 'Du bist am Zug!',
    isTurn: 'ist am Zug',
    turnTag: 'Am Zug',
    round: (n) => `Runde ${n}/8`,
    championLimitSuffix: ' (Champion-Limit)',
  },
  en: {
    you: 'You',
    roundLabel: 'Round',
    gameOver: 'Game over',
    newSnake: 'New snake — pick anywhere!',
    noMoveTimer: 'No move possible – timer running out…',
    yourTurn: 'Your turn!',
    isTurn: 'is up',
    turnTag: 'Turn',
    round: (n) => `Round ${n}/8`,
    championLimitSuffix: ' (champion limit)',
  },
  es: {
    you: 'Tú',
    roundLabel: 'Ronda',
    gameOver: 'Partida terminada',
    newSnake: 'Nueva serpiente — ¡elección libre!',
    noMoveTimer: 'No hay movimiento posible – se acaba el tiempo…',
    yourTurn: '¡Es tu turno!',
    isTurn: 'está jugando',
    turnTag: 'Turno',
    round: (n) => `Ronda ${n}/8`,
    championLimitSuffix: ' (límite de campeones)',
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

// Kein FARBIGER Hintergrund: Bei Artworks mit transparentem Rand schimmerte er durch und
// legte einen farbigen Schleier über jede Karte. Ein neutrales Dunkelgrau macht denselben
// Fehler nicht — das Muster der Spielfläche (siehe GameSurface, cr-arcade-bg) durfte aber
// vorher am transparenten Rand direkt durchscheinen, das ist jetzt der neue Grund für einen
// (unbunten) Untergrund.
function CardImg({ id, name }) {
  return (
    <div data-card-cell className="relative w-full h-full bg-[#0d0d14]">
      <CardFace
        id={id}
        alt={name}
        onError={e => {
          e.target.style.display = 'none';
          const fb = e.target.closest('[data-card-cell]')?.querySelector('.fb');
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
  const gridRows   = Math.ceil(totalCells / gridCols);
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

  // Die Seitenleiste steht am Desktop links, auf dem Handy in einem Blatt (ModeShell).
  const sidebar = (
    <>
      {/* Aktive Spieler mit Deck */}
      {players.map((player, idx) => {
          if (player.isSpectator) return null;
          const isCurrent  = turnOrder?.[currentTurn] === idx;
          const champCount = (player.deck || []).filter(c => c.isChampion).length;
          return (
            <PlayerPanel key={player.id} isMe={player.id === myPlayerId}
              active={isCurrent && !finished} activeLabel={t.turnTag}
              header={
                <div className="flex items-center gap-2.5 min-w-0">
                  <AvatarCircle id={player.avatar} color={player.color} size={28} />
                  <span className="text-white text-[13px] font-semibold truncate flex-1">{player.name}</span>
                  <span className="text-white/25 text-[11px] tabular-nums shrink-0">{player.deck?.length || 0}/8</span>
                </div>
              }>
              <DeckGrid deck={player.deck || []}
                renderCard={(card) => <CardImg id={card.id} name={card.name} />} />
              <div className="flex items-center gap-1.5">
                <img src={crownIcon} alt="" width={14} height={12} className={champCount > 0 ? '' : 'opacity-15 grayscale'} />
                <span className="text-white/30 text-[11px]">{champCount}/2 Champions</span>
              </div>
            </PlayerPanel>
          );
        })}

        {/* Zuschauer — kompakt, ganz unten */}
        {players.some(p => p.isSpectator) && (
          <>
            <div className="h-px bg-white/[0.06]" />
            {players.filter(p => p.isSpectator).map(player => (
              <div key={player.id} className="flex items-center gap-2 px-1 py-1 opacity-45">
                <AvatarCircle id={player.avatar} color={player.color} size={20} />
                <span className="text-white/60 text-[11px] truncate flex-1">{player.name}</span>
                <CrTv size={16} className="text-white/40 shrink-0" />
              </div>
            ))}
          </>
        )}
    </>
  );

  const activePlayers = players.filter(p => !p.isSpectator);

  return (
    <ModeShell
      sidebar={sidebar}
      playerCount={activePlayers.length}
      width="lg:w-56"
      lang={lang}
      strip={
        // Kurzfassung im Handy-Streifen: wer ist dran, wie voll ist sein Deck
        <span className="text-white/40 text-[11px] truncate">
          {currentPlayer ? `${currentPlayer.name} · ${currentPlayer.deck?.length || 0}/8` : ''}
        </span>
      }>

      <GameSurface>
        {/* Kopfzeile: große Rundenzahl als Anker, Spielstatus leise daneben */}
        <GameHeader
          label={t.roundLabel}
          value={round}
          total={8}
          badge={
            finished ? (
              <span className="text-green-400 text-sm font-semibold">{t.gameOver}</span>
            ) : isSnakeReset ? (
              <span className="text-amber-300 text-sm font-semibold">{t.newSnake}</span>
            ) : isMyTurn && validSet.size === 0 ? (
              <span className="text-orange-300 text-sm font-semibold">{t.noMoveTimer}</span>
            ) : (
              <TurnBanner player={currentPlayer} mine={isMyTurn} text={isMyTurn ? t.yourTurn : t.isTurn} />
            )
          }
          timerRemaining={finished ? undefined : timerRemaining}
          timerUrgent={timerUrgent}
        />
        {!finished && <ProgressHairline pct={timerPct} accent={ACCENT} urgent={timerUrgent} />}

        {/* Raster */}
        {/* container-type: size macht die Größe dieses Kastens für die cqw/cqh-Rechnung
            des Rasters messbar — siehe direkt darunter. */}
        <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-3 sm:p-6"
          style={{ containerType: 'size' }}>
          {/* Größe aus dem VERFÜGBAREN Platz, nicht aus dem Viewport: Hier stand einmal
              calc(100vw - 15rem - 3rem) — die 15rem waren die Breite der Seitenleiste,
              fest einkodiert. Seit die Leiste auf dem Handy verschwindet, stimmte die
              Rechnung dort nicht mehr und ließ vom Raster nur noch ~100px übrig.

              Danach stand hier `w-full` + `aspect-ratio` + `max-height: 100%`. Das sieht
              richtig aus, ist es aber nicht: max-height kappt nur die HÖHE, die Breite
              bleibt stehen. Auf 1600×900 war das Raster dadurch 860 breit und 662 hoch,
              während die Kacheln (aspect-square) stur 82px behielten — sie liefen unten
              aus dem gestauchten Kasten heraus. Auf 1440p fiel das nicht auf, weil dort
              die Breite die knappere Grenze ist.

              min(100%, 100cqh × Seitenverhältnis) nimmt stattdessen die tatsächlich
              knappere der beiden Grenzen: 100% ist die Breite des Elternteils, 100cqh
              seine Höhe. Das Raster bleibt damit auf JEDER Auflösung formtreu und wird
              einfach kleiner, statt sich zu verziehen. */}
          <div
            className="grid gap-0.5 sm:gap-1"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
              // Kacheln im echten Kartenformat (285×420, siehe cardCrop.js) statt quadratisch —
              // quadratische Kacheln schnitten Kopf und Sockel der Karten ab.
              aspectRatio: `${gridCols * CARD_RATIO} / ${gridRows}`,
              // 86px statt 62px pro Feld: Auf einem 1440p-Schirm blieb das Raster
              // sonst in der Mitte stehen und ließ links und rechts große Leerflächen.
              width: `min(100%, ${gridCols * 86}px, ${(gridCols * CARD_RATIO / gridRows).toFixed(4)} * 100cqh)`,
              maxWidth: '100%',
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
                  // Abdunkeln bedeutet "für dich gerade nicht wählbar" — das gilt nur
                  // WÄHREND des eigenen Zugs. Ist niemand am Zug, der man selbst ist, sind
                  // validSet/blockedSet immer leer (siehe useMemo oben) und die Bedingung
                  // traf vorher auf JEDES Feld zu: das ganze Raster verblasste bei 25%
                  // Deckkraft im Diamant-Karo fast unsichtbar, obwohl gerade niemand
                  // überhaupt etwas wählen darf. Jetzt nur während des eigenen Zugs dunkler.
                  className={`
                    group relative aspect-[4/5] rounded-md overflow-hidden
                    ${isValid && isMyTurn && !finished ? 'cursor-pointer cr-card-hover' : 'cursor-default'}
                    ${isPicked ? 'opacity-70' : ''}
                    ${!isPicked && isMyTurn && !isValid && !isBlocked ? 'opacity-25' : ''}
                    ${isBlocked ? 'opacity-15 grayscale' : ''}
                  `}
                  // Auswahl als INNERER Ring statt Rahmen: Ein Rahmen verschiebt die
                  // Kachel um einen Pixel, wodurch das ganze Raster beim Überfahren
                  // zuckte. Der Ring liegt im Bild und bewegt nichts.
                  style={{
                    boxShadow: isLast
                      ? `inset 0 0 0 2px ${picker?.color || '#fff'}`
                      : isPicked
                        ? `inset 0 0 0 2px ${(picker?.color || '#444')}cc`
                        : isValid
                          ? `inset 0 0 0 1px ${ACCENT}66`
                          : 'none',
                  }}
                >
                  {/* Zuletzt gewählte Karte springt kurz auf (key wechselt mit dem Zug) */}
                  <div key={isLast ? `last-${currentTurn}` : 'c'} className={`w-full h-full ${isLast ? 'cr-card-pop' : ''}`}>
                    <CardImg id={cell.card.id} name={cell.card.name} />
                  </div>

                  {/* Genommen: in der Farbe des Spielers eingefärbt */}
                  {isPicked && picker && (
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ backgroundColor: picker.color + '40' }} />
                  )}

                  {/* Gültig: beim Überfahren deutlicher, ohne Größenwechsel */}
                  {isValid && isMyTurn && !finished && (
                    <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ boxShadow: `inset 0 0 0 2px ${ACCENT}` }} />
                  )}

                  {/* Champion-Krone */}
                  {cell.card.isChampion && !isPicked && (
                    <div className="absolute top-0.5 right-0.5 bg-black/55 rounded p-0.5 pointer-events-none">
                      <img src={crownIcon} alt="" width={11} height={10} />
                    </div>
                  )}

                  {/* Zuletzt genommen */}
                  {isLast && (
                    <div className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </GameSurface>
    </ModeShell>
  );
}
