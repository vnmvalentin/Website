import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import CardFace from '../ui/CardFace';
import { CrCheck, CrLock, CrChat } from '../ui/CrIcons';
import { RARITY_COLOR } from '../data/cards';
import { CARD_CROP } from './cardCrop';
import unknownCardSrc from '../../../assets/clashRoyale/ui/UnknownCard.webp';
import { GameHeader, ProgressHairline, PlayerPanel, DeckGrid, TurnBanner, ViewToggle } from './GameChrome';
import { useCrPrefs } from '../ui/crPrefs';
import ModeShell from './ModeShell';
import { sparkBurst, ringPulse, floatText, bigBanner, shake, stamp } from '../ui/juice';
import { playSound } from '../ui/sound';

// 3D-Wüstenhalle (three.js) — erst geladen, wenn die Pyramide läuft. Fällt WebGL aus,
// bleibt die 2D-Pyramide darunter.
const Pyramid3D = lazy(() => import('./pyramid/Pyramid3D'));

/** Akzentfarbe des Modus. */
const ACCENT = '#38bdf8';

// Wie lange die Aufdeck-/Blockier-Markierung nach einem Ereignis noch als "frisch" gilt —
// muss zur Animationsdauer unten passen, sonst wird die CSS-Klasse entfernt, bevor der
// Übergang zu Ende animiert hat.
const ANIM_WINDOW_MS = 750;

const PYRAMID_I18N = {
  de: {
    loading: 'Lade Pyramidendraft…',
    viewMode: 'Ansicht',
    round: 'Runde',
    players: 'Spieler',
    done: 'Fertig',
    yourTurn: 'Du bist dran!',
    playersTurn: (name) => `${name} ist dran`,
    isTurn: 'ist dran',
    turnTag: 'Am Zug',
    blocking: 'Eine Karte wird blockiert…',
    pickHint: 'Wähle eine offene Karte.',
    waitingHint: 'Warte, bis du an der Reihe bist…',
    unknownCard: 'Verdeckte Karte',
    blockedCard: 'Blockiert',
    pickedBy: (name) => `Genommen von ${name}`,
    chatPicksFor: (name) => `Chat wählt für ${name}`,
    chatHint: (max) => `Tippe 1–${max} in den Chat`,
    chatVotes: (n) => `${n} ${n === 1 ? 'Stimme' : 'Stimmen'}`,
    chatEndNow: 'Jetzt auswerten',
    chatResult: (n, votes, total) => (total ? `Chat hat Nr. ${n} gewählt · ${votes} von ${total} Stimmen` : 'Keine Stimmen — Zufall'),
  },
  en: {
    loading: 'Loading Pyramid Draft…',
    viewMode: 'View',
    round: 'Round',
    players: 'Players',
    done: 'Done',
    yourTurn: 'Your turn!',
    playersTurn: (name) => `${name}'s turn`,
    isTurn: 'is up',
    turnTag: 'Turn',
    blocking: 'A card is being blocked…',
    pickHint: 'Pick a face-up card.',
    waitingHint: 'Waiting for your turn…',
    unknownCard: 'Face-down card',
    blockedCard: 'Blocked',
    pickedBy: (name) => `Taken by ${name}`,
    chatPicksFor: (name) => `Chat picks for ${name}`,
    chatHint: (max) => `Type 1–${max} in chat`,
    chatVotes: (n) => `${n} ${n === 1 ? 'vote' : 'votes'}`,
    chatEndNow: 'Resolve now',
    chatResult: (n, votes, total) => (total ? `Chat picked #${n} · ${votes} of ${total} votes` : 'No votes — random pick'),
  },
  es: {
    loading: 'Cargando draft de pirámide…',
    viewMode: 'Vista',
    round: 'Ronda',
    players: 'Jugadores',
    done: 'Listo',
    yourTurn: '¡Es tu turno!',
    playersTurn: (name) => `Turno de ${name}`,
    isTurn: 'está jugando',
    turnTag: 'Turno',
    blocking: 'Se está bloqueando una carta…',
    pickHint: 'Elige una carta boca arriba.',
    waitingHint: 'Esperando tu turno…',
    unknownCard: 'Carta boca abajo',
    blockedCard: 'Bloqueada',
    pickedBy: (name) => `Tomada por ${name}`,
    chatPicksFor: (name) => `El chat elige para ${name}`,
    chatHint: (max) => `Escribe 1–${max} en el chat`,
    chatVotes: (n) => `${n} ${n === 1 ? 'voto' : 'votos'}`,
    chatEndNow: 'Resolver ya',
    chatResult: (n, votes, total) => (total ? `El chat eligió el n.º ${n} · ${votes} de ${total} votos` : 'Sin votos — al azar'),
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
@keyframes pyramidChatResult {
  0% { transform: translate(-50%, 12px) scale(0.85); opacity: 0; }
  18% { transform: translate(-50%, 0) scale(1.04); opacity: 1; }
  28% { transform: translate(-50%, 0) scale(1); }
  85% { opacity: 1; }
  100% { transform: translate(-50%, -6px); opacity: 0; }
}
.pyramid-chat-result { animation: pyramidChatResult 2.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.pyramid-vote-fill { transition: width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); }
`;

// Wie lange die Ergebnis-Plakette der Chat-Abstimmung stehen bleibt (= Animationsdauer oben)
const CHAT_RESULT_MS = 2600;

function CardImg({ id, name }) {
  return (
    <CardFace id={id} alt={name} />
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
            active={!state.finished && state.phase !== 'blocking' && state.currentPlayerId === p.id} activeLabel={t.turnTag}
            header={
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#888' }} />
                <span className="text-white text-[13px] font-semibold truncate flex-1">{p.name}</span>
                {done
                  ? <CrCheck size={19} className="text-green-400 shrink-0" title={t.done} />
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
function PyramidCell({ cell, cellKey, cellSize, clickable, ownerColor, ownerName, t, onClick, justRevealed, justBlocked, justPicked, chatOption }) {
  // Kachel im Kartenformat 4:5 (ui/CardFace.jsx) statt quadratisch — die Karte füllt sie aus
  const style = { width: cellSize, height: `calc(${cellSize} * 1.25)` };

  if (!cell.revealed) {
    return (
      <div data-pyr-cell={cellKey} className="rounded-lg overflow-hidden bg-[#0d0d14] shrink-0" style={style} title={t.unknownCard}>
        <img src={unknownCardSrc} alt="" className="w-full h-full object-contain opacity-80" draggable={false} />
      </div>
    );
  }

  if (cell.pickedBy) {
    // Genommene Karte bleibt sichtbar (nur verwaschen) statt komplett zu verschwinden —
    // wer da war, sieht man weiter, nur nicht mehr scharf. overflow-hidden UND das leichte
    // Aufskalieren des geblurrten Bilds verhindern, dass der Weichzeichner am Kachelrand
    // einen hellen "Blur-Saum" nach außen durchscheinen lässt.
    return (
      <div data-pyr-cell={cellKey} className={`relative rounded-lg overflow-hidden shrink-0 flex items-center justify-center ${justPicked ? 'pyramid-pop' : ''}`}
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
    <button type="button" data-pyr-cell={cellKey} disabled={!clickable} onClick={onClick} title={cell.blocked ? t.blockedCard : cell.name}
      className={`group relative rounded-lg overflow-hidden shrink-0 bg-[#0d0d14] transition-transform ${
        clickable ? 'cursor-pointer hover:scale-[1.06] active:scale-95' : 'cursor-default'
      } ${cell.blocked ? 'opacity-35' : ''} ${justRevealed ? 'pyramid-reveal' : ''} ${justBlocked ? 'pyramid-block' : ''}`}
      style={{ ...style, boxShadow: rarity ? `0 0 0 1.5px ${RARITY_COLOR[rarity]}88` : undefined }}>
      <CardImg id={cell.cardId} name={cell.name} />
      {chatOption && <ChatVoteOverlay option={chatOption} cellSize={cellSize} />}
      {cell.blocked && (
        <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <CrLock size={21} className="text-white/70" />
        </span>
      )}
    </button>
  );
}

// Chat-Abstimmung auf einer Karte: große Nummer oben links (muss im Stream lesbar sein),
// Stimmenbalken unten, die führende Karte bekommt einen goldenen Rahmen.
function ChatVoteOverlay({ option, cellSize }) {
  const { n, count, pct, leading } = option;
  return (
    <>
      <span className="absolute inset-0 pointer-events-none rounded-lg"
        style={{ boxShadow: leading ? 'inset 0 0 0 3px var(--cr-arcade-gold, #f5c542)' : 'inset 0 0 0 1px rgba(255,255,255,0.25)' }} />
      <span className="absolute top-0.5 left-0.5 min-w-[1.4em] px-1 rounded-md bg-[#0b1626]/85 text-white font-cr text-center leading-[1.35] pointer-events-none"
        style={{ fontSize: `calc(${cellSize} * 0.34)`, WebkitTextStroke: '0.5px #000' }}>
        {n}
      </span>
      <span className="absolute left-0 right-0 bottom-0 h-[22%] min-h-[12px] bg-black/70 pointer-events-none">
        <span className="pyramid-vote-fill absolute left-0 top-0 bottom-0"
          style={{ width: `${pct}%`, background: leading ? 'var(--cr-arcade-gold, #f5c542)' : '#8b5cf6' }} />
        <span className="relative block text-center text-white font-cr leading-none tabular-nums"
          style={{ fontSize: `calc(${cellSize} * 0.2)`, paddingTop: '0.15em', textShadow: '0 1px 0 #000, 0 0 3px #000, 0 0 3px #000' }}>
          {count}
        </span>
      </span>
    </>
  );
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function PyramidDraft({ pyramidState, myPlayerId, onPick, onChatVoteEnd, canControl = false, lang = 'de' }) {
  const t = PYRAMID_I18N[lang] || PYRAMID_I18N.de;
  const state = pyramidState;

  // Ergebnis der Chat-Abstimmung kurz als Plakette zeigen (kommt mit dem Pick-Ereignis)
  const [chatResult, setChatResult] = useState(null);
  useEffect(() => {
    const ev = state?.lastEvent;
    if (ev?.type !== 'pick' || !ev.chat) return undefined;
    setChatResult({ ...ev.chat, key: Date.now() });
    const timer = setTimeout(() => setChatResult(null), CHAT_RESULT_MS);
    return () => clearTimeout(timer);
  }, [state?.lastEvent]);

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

  // ── Effekte ──
  // Pick: Funken in der Farbe des Nehmenden (bei Mitspielern dazu ihr Name), aufgedeckte Karten
  // darunter funkeln golden; Blockade: Stein wackelt, Staub, roter Stempel.
  // Jedes Ereignis kommt mit jedem Zustands-Update erneut mit — deshalb die Signatur.
  const stage3dRef = useRef(null);
  const stageRef = useRef(null);
  const [webglFailed, setWebglFailed] = useState(false);
  // 3D nur, wenn gewünscht (Einstellung / Umschalter in der Kopfzeile) UND WebGL läuft
  const { prefs } = useCrPrefs();
  const show3d = prefs.scene3d && !webglFailed;
  const fxSigRef = useRef(null);
  useEffect(() => {
    const ev = state?.lastEvent;
    if (!ev) return;
    const sig = `${state.round}|${ev.type}|${(ev.cells || []).map(({ r, c }) => `${r},${c}`).join(';')}`;
    if (sig === fxSigRef.current) return;
    const first = fxSigRef.current === null;
    fxSigRef.current = sig;
    if (first) return; // beim Betreten/Neuladen nichts nachspielen
    const cellEl = ({ r, c }) => (show3d
      ? stage3dRef.current?.getCellRect(r, c)
      : document.querySelector(`[data-pyr-cell="${r},${c}"]`));
    if (ev.type === 'pick' && ev.cells?.[0]) {
      const { r, c } = ev.cells[0];
      const picker = state.players.find(pl => pl.id === state.rows[r]?.[c]?.pickedBy);
      const color = picker?.color || ACCENT;
      const el = cellEl(ev.cells[0]);
      sparkBurst(el, { color, count: picker?.id === myPlayerId ? 22 : 14, spread: 100 });
      ringPulse(el, { color });
      if (picker && picker.id !== myPlayerId) { floatText(el, picker.name, { color, size: 16, rise: 44 }); playSound('pick'); }
    }
    (ev.revealed || []).forEach((cell, i) => {
      setTimeout(() => sparkBurst(cellEl(cell), { colors: ['#fde68a', '#f5c542', '#ffffff'], count: 10, spread: 60, size: 5 }), 220 + i * 90);
    });
    if (ev.revealed?.length) setTimeout(() => playSound('open'), 220);
    if (ev.type === 'block') {
      (ev.cells || []).forEach((cell, i) => {
        setTimeout(() => {
          const el = cellEl(cell);
          shake(el, { intensity: 6 });
          sparkBurst(el, { colors: ['#6e4a1f', '#a16207', '#57534e'], count: 14, spread: 70 });
          // In 3D zeigt der gekippte Stein selbst das Verbotszeichen
          if (!show3d) stamp(el, t.blockedCard.toUpperCase(), { color: '#ef4444' });
          playSound('stamp');
        }, i * 200);
      });
    }
  }, [state?.lastEvent, state?.round, state?.rows, state?.players, myPlayerId, t, show3d]);

  // Neue Runde: Banner; beim ersten Erscheinen werden die Stufen von oben nach unten gesetzt
  const prevRoundRef = useRef(state?.round);
  useEffect(() => {
    const prev = prevRoundRef.current;
    prevRoundRef.current = state?.round;
    if (prev == null || state?.round == null || state.round === prev || state.finished) return;
    // Über der Spielfläche zentriert (nicht über dem Fenster — links sitzt die Spielerleiste),
    // "/8" in derselben Zeile
    bigBanner(`${t.round} ${state.round}`, { color: '#f5c542', sub: state.maxRounds ? `/${state.maxRounds}` : '', inline: true, within: stageRef.current });
    playSound('start');
  }, [state?.round, state?.finished, state?.maxRounds, t]);
  const [building, setBuilding] = useState(true);
  useEffect(() => {
    const tm = setTimeout(() => setBuilding(false), 1400);
    return () => clearTimeout(tm);
  }, []);

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

  // Laufende Chat-Abstimmung: Nummer, Stimmen und Anteil je Feld (Schlüssel "r,c")
  const chatVote = !state.finished && !blocking ? state.chatVote : null;
  const chatOptions = new Map();
  if (chatVote) {
    const max = Math.max(0, ...chatVote.counts);
    chatVote.options.forEach(({ r, c }, i) => {
      const count = chatVote.counts[i] || 0;
      chatOptions.set(`${r},${c}`, {
        n: i + 1, count,
        pct: chatVote.total ? (count / chatVote.total) * 100 : 0,
        leading: max > 0 && count === max,
      });
    });
  }
  const chatPlayer = chatVote ? playersById[chatVote.playerId] : null;
  const clickable3d = new Set();
  if (isMyTurn && !chatVote) {
    state.rows.forEach((row, r) => row.forEach((cell, c) => {
      if (cell.revealed && !cell.pickedBy && !cell.blocked) clickable3d.add(`${r},${c}`);
    }));
  }
  const canEndChatVote = !!chatVote && (chatVote.playerId === myPlayerId || canControl);

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
            badge={blocking ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-300">
                <CrLock size={19} />{t.blocking}
              </span>
            ) : chatVote ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-violet-200 min-w-0">
                <CrChat size={20} className="shrink-0" />
                <span className="truncate">{t.chatPicksFor(chatPlayer?.name || '?')}</span>
              </span>
            ) : !state.finished ? (
              <TurnBanner player={currentPlayer} mine={isMyTurn} text={isMyTurn ? t.yourTurn : t.isTurn} />
            ) : null}
            right={<ViewToggle available={!webglFailed} label={t.viewMode} />}
            timerRemaining={blocking ? null : state.timerRemaining}
            timerUrgent={timeUrgent}
          />
          {/* Zeitbalken des aktuellen Zugs (vorher: Rundenfortschritt round/maxRounds — der
              bewegte sich nur einmal pro Runde und wirkte neben der laufenden Uhr wie ein
              hängender Timer). Die Runde steht ohnehin groß in der Kopfzeile. Während der
              Blockade-Phase gibt es keinen Zugtimer → leerer Balken. */}
          <ProgressHairline
            pct={!blocking && state.timerSeconds > 0 && typeof state.timerRemaining === 'number'
              ? (state.timerRemaining / state.timerSeconds) * 100 : 0}
            accent={ACCENT} urgent={!blocking && timeUrgent} />

          {/* container-type:size macht die eigene Breite UND Höhe als cqw/cqh messbar (siehe
              MyBingoCard in BingoRoyale.jsx für dieselbe Technik). min-h-0 ist nötig, weil ein
              Flex-Kind sonst nie kleiner als sein Inhalt wird — ohne das hätte der Container
              keine feste Höhe, auf die sich 100cqh beziehen könnte. Die Kachelgröße wird aus
              BEIDEN Bounds bestimmt (Breite durch Spaltenzahl der breitesten Reihe, Höhe durch
              Zeilenzahl) statt nur der Breite — vorher blieb bei wenigen Reihen viel Höhe
              ungenutzt, jetzt füllt die Pyramide den verfügbaren Platz in beide Richtungen. */}
          <div ref={stageRef} className={show3d
            ? 'flex-1 min-h-0 relative overflow-hidden bg-[#120a05]'
            : 'flex-1 min-h-0 overflow-auto custom-scrollbar relative px-4 sm:px-8 py-6'}
            style={show3d ? undefined : { containerType: 'size' }}>
            {show3d ? (
              <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">{t.loading}</div>}>
                <Pyramid3D ref={stage3dRef}
                  rows={state.rows}
                  clickable={clickable3d}
                  colors={Object.fromEntries(state.players.map(p => [p.id, p.color]))}
                  names={Object.fromEntries(state.players.map(p => [p.id, p.name]))}
                  chatOptions={chatOptions}
                  onPick={onPick}
                  unknownImg={unknownCardSrc}
                  onUnsupported={() => setWebglFailed(true)} />
              </Suspense>
            ) : (<>
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
                const STEP_PAD_X = 12; // Stein steht seitlich so weit über die Karten einer Reihe
                const STEP_PAD_Y = 5;  // … und oben/unten
                const bottomWidth = state.rows[0]?.length || 1;
                const rowCount = state.rows.length;
                const widthBound = `calc((100cqw - ${(bottomWidth - 1) * GAP_PX + STEP_PAD_X * 2}px) / ${bottomWidth})`;
                // Höhe je Reihe = Kachelhöhe (1,25 × Breite, 4:5) + senkrechter Stufen-Rand oben/unten
                // + 3 px je Reihe: der Steinrand (3 px oben/unten, Stufen überlappen um 3 px) + 6 px Rest
                const heightBound = `calc((100cqh - ${rowCount * (STEP_PAD_Y * 2 + 3) + 6}px) / ${rowCount} / 1.25)`;
                // Die Breite ist eine harte Obergrenze (min(...) außen) — sie darf NIE
                // überschritten werden, sonst läuft die breiteste Reihe seitlich aus dem Bild
                // (bei z.B. 8 Spielern/12 Spalten auf einem Handy wäre die Untergrenze unten
                // sonst breiter, als überhaupt Platz ist — waagerechtes Scrollen erwartet hier
                // niemand). Die Untergrenze fürs Lesen/Tippen und die Obergrenze gegen zu
                // große Kacheln auf einem großen Monitor gelten nur für die Höhen-Seite; reicht
                // die Höhe nicht, wird stattdessen senkrecht gescrollt — das ist normal.
                const cellSize = `min(${widthBound}, clamp(2.25rem, ${heightBound}, 6.5rem))`;
                return (
                  // STUFENPYRAMIDE: Vorher lag ein exaktes Dreieck (clip-path) hinter dem Raster.
                  // Die Kartenreihen bilden aber eine Treppe aus ganzen Karten — je weiter oben,
                  // desto weiter ragten die Karten seitlich aus dem Dreieck, die Spitze war viel
                  // dünner als die oberste Karte. Jetzt trägt jede Reihe ihren eigenen Sandstein-
                  // Block (etwas breiter als die Reihe), die Blöcke liegen lückenlos aufeinander:
                  // eine Stufenpyramide, die jede Karte bis zur Spitze umschließt.
                  <div className="relative flex flex-col items-center drop-shadow-[0_10px_18px_rgba(2,8,20,0.45)]">
                    {[...state.rows].reverse().map((row, ri) => {
                      const r = state.rows.length - 1 - ri; // Original-Reihenindex (0 = unten) für den Pick
                      // Oben heller Sandstein, nach unten dunkler (wie zuvor der Verlauf des Dreiecks)
                      const depth = rowCount > 1 ? ri / (rowCount - 1) : 0;
                      const tone = (a, b) => Math.round(a + (b - a) * depth);
                      const stone = `rgb(${tone(236, 156)}, ${tone(203, 106)}, ${tone(138, 46)})`;
                      const stoneDark = `rgb(${tone(217, 128)}, ${tone(172, 86)}, ${tone(94, 36)})`;
                      return (
                        <div key={r} className={`flex items-center rounded-md ${building ? 'cr-deal-card' : ''}`}
                          style={{
                            animationDelay: building ? `${ri * 0.09}s` : undefined,
                            gap: GAP_PX,
                            padding: `${STEP_PAD_Y}px ${STEP_PAD_X}px`,
                            background: `linear-gradient(180deg, ${stone}, ${stoneDark})`,
                            border: '3px solid #6e4a1f',
                            // Stufen überlappen um die Randbreite, damit keine doppelte Linie entsteht
                            marginTop: ri === 0 ? 0 : -3,
                            boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.12)',
                          }}>
                          {row.map((cell, c) => {
                            const key = `${r},${c}`;
                            return (
                              <PyramidCell key={c} cell={cell} cellKey={key} t={t} cellSize={cellSize}
                                clickable={isMyTurn && !chatVote && cell.revealed && !cell.pickedBy && !cell.blocked}
                                chatOption={chatOptions.get(key) || null}
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
            </>)}
            {show3d && !state.finished && !chatVote && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
                <span className={`text-xs px-3 py-1.5 rounded-lg bg-[#111d2c]/90 ${blocking ? 'text-amber-300/80' : isMyTurn ? 'text-sky-300/80' : 'text-white/50'}`}>
                  {blocking ? t.blocking : isMyTurn ? t.pickHint : t.waitingHint}
                </span>
              </div>
            )}
            {chatResult && (
              <div key={chatResult.key}
                className="pyramid-chat-result absolute left-1/2 top-3 z-10 px-4 py-2 rounded-xl bg-[#1a1036] border-2 border-violet-400/70 text-white font-cr text-sm sm:text-base flex items-center gap-2 w-max max-w-[92%] pointer-events-none">
                <CrChat size={22} className="shrink-0" />
                {t.chatResult(chatResult.n, chatResult.votes, chatResult.total)}
              </div>
            )}
          </div>

          {chatVote && (
            <div className="shrink-0 px-4 sm:px-8 pb-4 flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a1036] border-2 border-violet-400/60 text-white font-cr text-base sm:text-lg">
                <CrChat size={24} className="shrink-0" />
                {t.chatHint(chatVote.options.length)}
              </span>
              <span className="text-white/70 text-sm tabular-nums">{t.chatVotes(chatVote.total || 0)}</span>
              {canEndChatVote && onChatVoteEnd && (
                <button type="button" onClick={onChatVoteEnd}
                  className="cr-tile-btn !w-auto px-3 py-1.5 font-cr text-sm text-white">
                  {t.chatEndNow}
                </button>
              )}
            </div>
          )}

          {!state.finished && !chatVote && !show3d && (
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
