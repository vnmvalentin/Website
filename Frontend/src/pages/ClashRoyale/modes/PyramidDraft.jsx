import React, { useEffect, useState } from 'react';
import { Lock, Check } from 'lucide-react';
import { RARITY_COLOR, cardImageUrl } from '../data/cards';
import { CARD_CROP } from './cardCrop';
import unknownCardSrc from '../../../assets/clashRoyale/UnknownCard.png';
import tripleDraftIcon from '../../../assets/clashRoyale/ui/icon_triple_draft.png';
import { GameHeader, ProgressHairline, PlayerPanel, DeckGrid } from './GameChrome';
import ModeShell from './ModeShell';

/** Akzentfarbe des Modus. */
const ACCENT = '#38bdf8';

// Wie lange die Aufdeck-/Blockier-Markierung nach einem Ereignis noch als "frisch" gilt —
// muss zur Animationsdauer unten passen, sonst wird die CSS-Klasse entfernt, bevor der
// Übergang zu Ende animiert hat.
const ANIM_WINDOW_MS = 750;

const PYRAMID_I18N = {
  de: {
    loading: 'Lade Pyramidendraft…',
    round: 'Runde',
    players: 'Spieler',
    done: 'Fertig',
    yourTurn: 'Du bist dran!',
    playersTurn: (name) => `${name} ist dran`,
    blocking: 'Eine Karte wird blockiert…',
    pickHint: 'Wähle eine offene Karte.',
    waitingHint: 'Warte, bis du an der Reihe bist…',
    unknownCard: 'Verdeckte Karte',
    blockedCard: 'Blockiert',
    pickedBy: (name) => `Genommen von ${name}`,
  },
  en: {
    loading: 'Loading Pyramid Draft…',
    round: 'Round',
    players: 'Players',
    done: 'Done',
    yourTurn: 'Your turn!',
    playersTurn: (name) => `${name}'s turn`,
    blocking: 'A card is being blocked…',
    pickHint: 'Pick a face-up card.',
    waitingHint: 'Waiting for your turn…',
    unknownCard: 'Face-down card',
    blockedCard: 'Blocked',
    pickedBy: (name) => `Taken by ${name}`,
  },
  es: {
    loading: 'Cargando draft de pirámide…',
    round: 'Ronda',
    players: 'Jugadores',
    done: 'Listo',
    yourTurn: '¡Es tu turno!',
    playersTurn: (name) => `Turno de ${name}`,
    blocking: 'Se está bloqueando una carta…',
    pickHint: 'Elige una carta boca arriba.',
    waitingHint: 'Esperando tu turno…',
    unknownCard: 'Carta boca abajo',
    blockedCard: 'Bloqueada',
    pickedBy: (name) => `Tomada por ${name}`,
  },
};

// Aufdecken (Umdrehen von der Unknown- zur echten Karte), Blockieren (kurzer Puls + Abdunkeln,
// damit man sieht WAS gerade blockiert wurde) und ein leises Pop-in fürs frisch genommene
// Feld — alle drei bewusst kurz, damit man auf sie wartet, ohne dass es zäh wirkt.
const PYRAMID_STYLE = `
@keyframes pyramidReveal { 0% { transform: scaleX(1); } 50% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
@keyframes pyramidBlockPulse {
  0% { transform: scale(1); filter: brightness(1) saturate(1); }
  35% { transform: scale(1.18); filter: brightness(1.6) saturate(1.4); }
  100% { transform: scale(1); filter: brightness(0.55) saturate(0.7); }
}
@keyframes pyramidPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.pyramid-reveal { animation: pyramidReveal 0.5s ease both; }
.pyramid-block { animation: pyramidBlockPulse 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.pyramid-pop { animation: pyramidPop 0.3s ease both; }
`;

function CardImg({ id, name }) {
  return (
    <img src={cardImageUrl(id)} alt={name} className="w-full h-full object-cover" draggable={false}
      style={CARD_CROP} onError={e => { e.target.style.display = 'none'; }} />
  );
}

// ── Sidebar: Spieler mit Deck-Fortschritt ──────────────────────────────────
const PyramidSidebar = React.memo(function PyramidSidebar({ state, myPlayerId, t }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  return (
    <div className="flex flex-col gap-3">
      {activePlayers.map(p => {
        const isMe = p.id === myPlayerId;
        const done = (p.deck || []).length >= state.deckSize;
        return (
          <PlayerPanel key={p.id} isMe={isMe}
            header={
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#888' }} />
                <span className="text-white text-[13px] font-semibold truncate flex-1">{p.name}</span>
                {done
                  ? <Check size={13} className="text-green-400 shrink-0" title={t.done} />
                  : <span className="text-white/25 text-[11px] tabular-nums shrink-0">{p.deck?.length || 0}/{state.deckSize}</span>}
              </div>
            }>
            <DeckGrid deck={p.deck || []} size={state.deckSize}
              renderCard={(card) => <CardImg id={card.id} name={card.name} />} />
          </PlayerPanel>
        );
      })}
    </div>
  );
});

// ── Ein Feld der Pyramide ────────────────────────────────────────────────────
// `cellSize` ist ein fertiger CSS-Ausdruck (min(4rem, ...cqw...)) — dieselbe Kachelgröße
// für jedes Feld, berechnet vom Elternteil aus der breitesten (untersten) Reihe. Ohne das
// lief die Basisreihe einer großen Pyramide auf dem Handy seitlich aus dem Bild: eine feste
// Tailwind-Größe kennt die tatsächliche Spaltenzahl nicht.
function PyramidCell({ cell, cellSize, clickable, ownerColor, ownerName, t, onClick, justRevealed, justBlocked, justPicked }) {
  const style = { width: cellSize, height: cellSize };

  if (!cell.revealed) {
    return (
      <div className="rounded-lg overflow-hidden bg-[#0d0d14] shrink-0" style={style} title={t.unknownCard}>
        <img src={unknownCardSrc} alt="" className="w-full h-full object-cover opacity-80" draggable={false} />
      </div>
    );
  }

  if (cell.pickedBy) {
    // Genommene Karte bleibt sichtbar (nur verwaschen) statt komplett zu verschwinden —
    // wer da war, sieht man weiter, nur nicht mehr scharf. overflow-hidden UND das leichte
    // Aufskalieren des geblurrten Bilds verhindern, dass der Weichzeichner am Kachelrand
    // einen hellen "Blur-Saum" nach außen durchscheinen lässt.
    return (
      <div className={`relative rounded-lg overflow-hidden shrink-0 flex items-center justify-center ${justPicked ? 'pyramid-pop' : ''}`}
        style={style} title={t.pickedBy(ownerName || '?')}>
        <div className="absolute inset-0" style={{ filter: 'blur(4px)', transform: 'scale(1.15)' }}>
          <CardImg id={cell.cardId} name={cell.name} />
        </div>
        <span className="absolute inset-0 bg-black/45" />
        <span className="relative w-2.5 h-2.5 rounded-full ring-2 ring-black/50" style={{ backgroundColor: ownerColor || '#555' }} />
      </div>
    );
  }

  const rarity = cell.rarity;
  return (
    <button type="button" disabled={!clickable} onClick={onClick} title={cell.blocked ? t.blockedCard : cell.name}
      className={`group relative rounded-lg overflow-hidden shrink-0 bg-[#0d0d14] transition-transform ${
        clickable ? 'cursor-pointer hover:scale-[1.06] active:scale-95' : 'cursor-default'
      } ${cell.blocked ? 'opacity-35' : ''} ${justRevealed ? 'pyramid-reveal' : ''} ${justBlocked ? 'pyramid-block' : ''}`}
      style={{ ...style, boxShadow: rarity ? `0 0 0 1.5px ${RARITY_COLOR[rarity]}88` : undefined }}>
      <CardImg id={cell.cardId} name={cell.name} />
      {cell.blocked && (
        <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Lock size={14} className="text-white/70" />
        </span>
      )}
    </button>
  );
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function PyramidDraft({ pyramidState, myPlayerId, onPick, lang = 'de' }) {
  const t = PYRAMID_I18N[lang] || PYRAMID_I18N.de;
  const state = pyramidState;

  // Das letzte Ereignis (Pick oder Blockade) kurz als Animation markieren, dann wieder
  // vergessen — sonst würde ein späteres, unabhängiges Neuzeichnen (z.B. nach Reconnect)
  // dieselbe Animation ungewollt erneut abspielen.
  const [anim, setAnim] = useState({ revealed: new Set(), blocked: new Set(), picked: null });
  useEffect(() => {
    const ev = state?.lastEvent;
    if (!ev) return undefined;
    const revealed = new Set((ev.revealed || []).map(({ r, c }) => `${r},${c}`));
    const blocked = new Set(ev.type === 'block' ? (ev.cells || []).map(({ r, c }) => `${r},${c}`) : []);
    const picked = ev.type === 'pick' ? `${ev.cells[0].r},${ev.cells[0].c}` : null;
    setAnim({ revealed, blocked, picked });
    const timer = setTimeout(() => setAnim({ revealed: new Set(), blocked: new Set(), picked: null }), ANIM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [state?.lastEvent]);

  if (!state) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">{t.loading}</p>
    </div>
  );

  const activePlayers = state.players.filter(p => !p.isSpectator);
  const playersById = Object.fromEntries(state.players.map(p => [p.id, p]));
  const blocking = state.phase === 'blocking';
  const isMyTurn = !state.finished && !blocking && state.currentPlayerId === myPlayerId;
  const currentPlayer = state.currentPlayerId ? playersById[state.currentPlayerId] : null;
  const timeUrgent = typeof state.timerRemaining === 'number' && state.timerRemaining <= 5;

  const strip = (
    <div className="flex -space-x-1.5">
      {activePlayers.slice(0, 6).map(p => (
        <span key={p.id} className="w-5 h-5 rounded-full border border-[#16161a] shrink-0"
          style={{ backgroundColor: p.color || '#888' }} />
      ))}
    </div>
  );

  return (
    <>
      <style>{PYRAMID_STYLE}</style>
      <ModeShell
        sidebar={<PyramidSidebar state={state} myPlayerId={myPlayerId} t={t} />}
        strip={strip}
        playerCount={activePlayers.length}
        lang={lang}>
        <div className="flex-1 flex flex-col overflow-hidden cr-arcade-bg">
          <GameHeader
            label={t.round} value={state.round} total={state.maxRounds}
            badge={
              <span className={`flex items-center gap-1.5 text-sm font-semibold ${
                blocking ? 'text-amber-300' : isMyTurn ? 'text-sky-300' : 'text-white/40'
              }`}>
                {blocking
                  ? <Lock size={13} className="text-amber-400" />
                  : <img src={tripleDraftIcon} alt="" width={16} height={13} className={isMyTurn ? '' : 'opacity-30 grayscale'} />}
                {blocking ? t.blocking : isMyTurn ? t.yourTurn : (currentPlayer ? t.playersTurn(currentPlayer.name) : '')}
              </span>
            }
            timerRemaining={blocking ? null : state.timerRemaining}
            timerUrgent={timeUrgent}
          />
          <ProgressHairline pct={(state.round / Math.max(1, state.maxRounds)) * 100} accent={ACCENT} />

          {/* container-type:size macht die eigene Breite UND Höhe als cqw/cqh messbar (siehe
              MyBingoCard in BingoRoyale.jsx für dieselbe Technik). min-h-0 ist nötig, weil ein
              Flex-Kind sonst nie kleiner als sein Inhalt wird — ohne das hätte der Container
              keine feste Höhe, auf die sich 100cqh beziehen könnte. Die Kachelgröße wird aus
              BEIDEN Bounds bestimmt (Breite durch Spaltenzahl der breitesten Reihe, Höhe durch
              Zeilenzahl) statt nur der Breite — vorher blieb bei wenigen Reihen viel Höhe
              ungenutzt, jetzt füllt die Pyramide den verfügbaren Platz in beide Richtungen. */}
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar relative px-4 sm:px-8 py-6" style={{ containerType: 'size' }}>
            {/* Warmes Gold-Glühen passend zum Pyramiden-Motiv, via radial-gradient statt
                filter:blur (wie .app-bg__orb in index.css — Blur wäre auf dieser Fläche beim
                Neuzeichnen spürbar teurer). Rein dekorativ, liegt hinter dem Raster.
                inset-0 statt eines eigenen Innenabstands, damit es bis an den Rand des
                gepolsterten Bereichs reicht — die Polsterung sitzt bewusst am äußeren
                Container, nicht hier, sonst würden 100cqw/100cqh sie nicht mitzählen und
                die Kachelgröße würde den verfügbaren Platz überschätzen. */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true" style={{
              background: 'radial-gradient(ellipse 75% 55% at 50% 12%, rgba(250,204,90,0.14), rgba(250,204,90,0.05) 45%, transparent 70%),'
                + 'radial-gradient(ellipse 60% 45% at 50% 100%, rgba(250,204,90,0.05), transparent 65%)',
            }} />
            <div className="relative min-w-full min-h-full flex flex-col items-center justify-center">
              {(() => {
                const GAP_PX = 6;
                const bottomWidth = state.rows[0]?.length || 1;
                const rowCount = state.rows.length;
                const widthBound = `calc((100cqw - ${(bottomWidth - 1) * GAP_PX}px) / ${bottomWidth})`;
                const heightBound = `calc((100cqh - ${(rowCount - 1) * GAP_PX}px) / ${rowCount})`;
                // Die Breite ist eine harte Obergrenze (min(...) außen) — sie darf NIE
                // überschritten werden, sonst läuft die breiteste Reihe seitlich aus dem Bild
                // (bei z.B. 8 Spielern/12 Spalten auf einem Handy wäre die Untergrenze unten
                // sonst breiter, als überhaupt Platz ist — waagerechtes Scrollen erwartet hier
                // niemand). Die Untergrenze fürs Lesen/Tippen und die Obergrenze gegen zu
                // große Kacheln auf einem großen Monitor gelten nur für die Höhen-Seite; reicht
                // die Höhe nicht, wird stattdessen senkrecht gescrollt — das ist normal.
                const cellSize = `min(${widthBound}, clamp(2.25rem, ${heightBound}, 6.5rem))`;
                return (
                  <div className="relative flex flex-col items-center" style={{ gap: GAP_PX }}>
                    {/* Sandstein-Sockel exakt in Dreiecksform hinter dem Kartenraster — die
                        Karten wirken dadurch wie in eine echte Steinpyramide eingelassen statt
                        lose auf dem Diamant-Karo zu liegen. Der negative inset lässt den Stein
                        an jeder Kante ein Stück überstehen (auch über die einzelne Spitzenkarte
                        oben hinaus), wie einen Rahmen um die Karten. */}
                    <div className="absolute pointer-events-none" aria-hidden="true"
                      style={{
                        inset: '-18px -26px -14px',
                        clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
                        background: 'linear-gradient(180deg, #eccb8a 0%, #d9ac5e 30%, #bd8640 65%, #9c6a2e 100%)',
                        border: '4px solid #6e4a1f',
                      }} />
                    {[...state.rows].reverse().map((row, ri) => {
                      const r = state.rows.length - 1 - ri; // Original-Reihenindex (0 = unten) für den Pick
                      return (
                        <div key={r} className="flex items-center" style={{ gap: GAP_PX }}>
                          {row.map((cell, c) => {
                            const key = `${r},${c}`;
                            return (
                              <PyramidCell key={c} cell={cell} t={t} cellSize={cellSize}
                                clickable={isMyTurn && cell.revealed && !cell.pickedBy && !cell.blocked}
                                ownerColor={cell.pickedBy ? playersById[cell.pickedBy]?.color : null}
                                ownerName={cell.pickedBy ? playersById[cell.pickedBy]?.name : null}
                                justRevealed={anim.revealed.has(key)}
                                justBlocked={anim.blocked.has(key)}
                                justPicked={anim.picked === key}
                                onClick={() => onPick(r, c)} />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

          {!state.finished && (
            <div className="shrink-0 px-4 sm:px-8 pb-4 text-center">
              {/* Eigene Plakette statt bloßen Fließtexts — sitzt auf dem Diamant-Karo der
                  Spielfläche und braucht dafür einen eigenen Untergrund. */}
              <span className={`inline-block text-xs px-3 py-1.5 rounded-lg bg-[#111d2c] ${blocking ? 'text-amber-300/80' : isMyTurn ? 'text-sky-300/80' : 'text-white/40'}`}>
                {blocking ? t.blocking : isMyTurn ? t.pickHint : t.waitingHint}
              </span>
            </div>
          )}
        </div>
      </ModeShell>
    </>
  );
}
