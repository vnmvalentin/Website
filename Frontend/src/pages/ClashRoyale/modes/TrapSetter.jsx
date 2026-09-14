import React, { useEffect, useState } from 'react';
import { Sparkles, Check, Zap, Shuffle } from 'lucide-react';
import skullTokenIcon from '../../../assets/clashRoyale/ui/festival_token.png';
import { RARITY_COLOR, cardImageUrl } from '../data/cards';
import { CARD_CROP } from './cardCrop';
import { ProgressHairline, PlayerPanel, DeckGrid } from './GameChrome';
import ModeShell from './ModeShell';

/** Akzentfarbe des Modus. */
const ACCENT = '#f59e0b';

const TRAP_I18N = {
  de: {
    you: 'Du',
    loading: 'Lade Fallensteller…',
    players: 'Spieler',
    done: 'Fertig',
    decksDone: (done, total) => `${done}/${total} Decks fertig`,
    disguiseTitle: 'Verschleiern',
    pickBadCard: 'Wähle eine deiner Trap-Karten, um sie zu tarnen.',
    pickTarget: 'Als welche Karte soll sie getarnt werden?',
    disguisingAs: 'wird getarnt als',
    trapsPlaced: (done, total) => `${done}/${total} Fallen gesetzt`,
    readyStatus: (ready, total) => `${ready}/${total} Spieler bereit`,
    waitingForOthers: 'Warte auf die anderen Spieler…',
    countdownGetReady: 'Bereit machen…',
    countdownSub: 'Das Raster öffnet für alle gleichzeitig',
    raceHint: 'Klicke so schnell wie möglich auf eine Karte!',
    raceClicked: 'Du hast geklickt — warte auf die anderen.',
    clickedCount: (n, total) => `${n}/${total} haben geklickt`,
    myTrap: 'Deine Falle',
    revealTitle: 'Auflösung',
    redirectedBadge: 'Umgeleitet',
    youRedirected: 'Zufällig umgeleitet!',
    wasATrap: 'Es war eine Falle!',
    trueIdentity: (name) => `In Wahrheit: ${name}`,
    nextRoundSoon: 'Nächste Runde beginnt gleich…',
  },
  en: {
    you: 'You',
    loading: 'Loading Trap Setter…',
    players: 'Players',
    done: 'Done',
    decksDone: (done, total) => `${done}/${total} decks done`,
    disguiseTitle: 'Disguise',
    pickBadCard: 'Pick one of your trap cards to disguise.',
    pickTarget: 'What should it be disguised as?',
    disguisingAs: 'disguised as',
    trapsPlaced: (done, total) => `${done}/${total} traps set`,
    readyStatus: (ready, total) => `${ready}/${total} players ready`,
    waitingForOthers: 'Waiting for the other players…',
    countdownGetReady: 'Get ready…',
    countdownSub: 'The grid opens for everyone at the same time',
    raceHint: 'Click a card as fast as you can!',
    raceClicked: 'You clicked — waiting for the others.',
    clickedCount: (n, total) => `${n}/${total} have clicked`,
    myTrap: 'Your trap',
    revealTitle: 'Resolution',
    redirectedBadge: 'Redirected',
    youRedirected: 'Redirected at random!',
    wasATrap: 'It was a trap!',
    trueIdentity: (name) => `Actually: ${name}`,
    nextRoundSoon: 'Next round starting soon…',
  },
  es: {
    you: 'Tú',
    loading: 'Cargando El Trampero…',
    players: 'Jugadores',
    done: 'Listo',
    decksDone: (done, total) => `${done}/${total} mazos listos`,
    disguiseTitle: 'Disfrazar',
    pickBadCard: 'Elige una de tus cartas trampa para disfrazarla.',
    pickTarget: '¿Como qué carta debería disfrazarse?',
    disguisingAs: 'disfrazada de',
    trapsPlaced: (done, total) => `${done}/${total} trampas colocadas`,
    readyStatus: (ready, total) => `${ready}/${total} jugadores listos`,
    waitingForOthers: 'Esperando a los demás jugadores…',
    countdownGetReady: 'Prepárate…',
    countdownSub: 'La cuadrícula se abre para todos al mismo tiempo',
    raceHint: '¡Haz clic en una carta lo más rápido posible!',
    raceClicked: 'Has hecho clic — esperando a los demás.',
    clickedCount: (n, total) => `${n}/${total} han hecho clic`,
    myTrap: 'Tu trampa',
    revealTitle: 'Resolución',
    redirectedBadge: 'Redirigido',
    youRedirected: '¡Redirigido al azar!',
    wasATrap: '¡Era una trampa!',
    trueIdentity: (name) => `En realidad: ${name}`,
    nextRoundSoon: 'La siguiente ronda empieza pronto…',
  },
};

function useNow(intervalMs = 200) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Flip-Animation fürs Aufdecken einer Falle (2D statt echtem 3D-Flip — auf schwachen Handy-
// GPUs bleibt eine reine Skalierung/Deckkraft flüssiger als eine rotateY-Perspektive) und ein
// kurzer "Ping" für die Umleitung, bevor derselbe Flip greift.
const TRAP_STYLE = `
@keyframes trapFlip { 0% { transform: scaleX(1); } 50% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
@keyframes trapRedirect { 0% { transform: scale(1) rotate(0deg); } 40% { transform: scale(1.15) rotate(-4deg); } 100% { transform: scale(1) rotate(0deg); } }
@keyframes trapPop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.trap-flip-front, .trap-flip-back { animation: trapFlip .5s ease both; }
.trap-redirected { animation: trapRedirect .6s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.trap-pop { animation: trapPop .25s ease both; }
`;

function CardImg({ id, name }) {
  return (
    // bg-[#0d0d14]: blickdichter Untergrund — die Kachel sitzt auf dem Diamant-Karo.
    <div className="relative w-full h-full bg-[#0d0d14]">
      <img src={cardImageUrl(id)} alt={name} className="w-full h-full object-cover" draggable={false}
        style={CARD_CROP} onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

// ── Sidebar: Spieler mit Deck-Fortschritt ──────────────────────────────────
const TrapSidebar = React.memo(function TrapSidebar({ state, myPlayerId, t }) {
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

// ── Eine Kachel im Raster: Vorderseite (Tarnung) klappt bei Auflösung zur Rückseite (echt) ──
// `cellWidth`/`cellHeight` sind fertige CSS-Ausdrücke vom Elternteil (siehe GridPhase) —
// explizite Breite/Höhe im nativen 5:6-Seitenverhältnis der Karten statt `aspect-square`:
// erzwungene Quadrate schnitten oben UND unten je 10% des Artworks weg (objec-cover auf
// falschem Seitenverhältnis), bei Legendarys war dadurch der Sockel weg. Nebenbei auch die
// Ursache eines früheren Bugs behoben: bei einem nicht-quadratischen Raster (4×3) stimmten
// Spaltenbreite und Zeilenhöhe der `1fr`-Tracks nicht exakt überein, ein erzwungenes
// Seitenverhältnis pro Kachel lief dadurch unten aus ihrer Zeile heraus.
function TrapCell({ cell, cellWidth, cellHeight, isRedirectTarget, onClick, clickable, isClicked, t }) {
  const showBack = cell.revealed && cell.kind === 'trap';
  const shownCard = showBack ? cell.realCard : cell.display;
  const rarity = shownCard?.rarity;

  return (
    <button type="button" disabled={!clickable} onClick={onClick} title={shownCard?.name}
      className={`group relative rounded-xl overflow-hidden shadow-[0_8px_20px_rgba(0,0,0,0.45)] transition-transform ${
        clickable ? 'cursor-pointer hover:scale-[1.04] active:scale-95' : 'cursor-default'
      } ${isClicked ? 'ring-2 ring-amber-400' : ''} ${isRedirectTarget ? 'trap-redirected' : ''}`}
      style={{
        width: cellWidth, height: cellHeight,
        border: '2.5px solid var(--cr-arcade-ink)',
        boxShadow: rarity ? `0 0 0 1.5px ${RARITY_COLOR[rarity]}55, 0 8px 20px rgba(0,0,0,0.45)` : undefined,
      }}>
      {shownCard
        ? <div className={cell.revealed && cell.kind === 'trap' ? 'trap-flip-back' : 'trap-pop'}>
            <CardImg id={shownCard.id} name={shownCard.name} />
          </div>
        : <div className="w-full h-full bg-[#0d0d14]" />}
      {cell.isMine && !cell.revealed && (
        <span className="absolute top-1 right-1 bg-black/70 rounded-md p-1" title={t.myTrap}>
          <img src={skullTokenIcon} alt="" width={14} height={14} />
        </span>
      )}
      {cell.revealed && cell.kind === 'trap' && (
        <span className="absolute bottom-0 inset-x-0 bg-black/70 text-amber-300 text-[9px] font-bold text-center py-0.5 truncate px-1">
          {t.wasATrap}
        </span>
      )}
      {cell.claimed && (
        <span className="absolute inset-0 bg-black/35 pointer-events-none" />
      )}
    </button>
  );
}

// ── Phase "Verschleiern" ────────────────────────────────────────────────────
function DisguisePhase({ state, onChooseBadCard, onChooseTarget, t }) {
  const timeUrgent = typeof state.timerRemaining === 'number' && state.timerRemaining <= 5;
  const pct = state.timerSeconds > 0 ? (state.timerRemaining / state.timerSeconds) * 100 : 0;
  const done = state.myTrapsPlaced >= state.disguiseCount;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 sm:px-10 pt-5 sm:pt-6 pb-4 flex items-baseline gap-3 sm:gap-4 flex-wrap
        bg-gradient-to-b from-[#17293f] to-[#0c1725] border-b-[3px]"
        style={{ borderColor: 'var(--cr-arcade-ink)' }}>
        <h2 className="font-display text-2xl sm:text-[28px] font-bold text-white leading-none flex items-center gap-2">
          <img src={skullTokenIcon} alt="" width={24} height={24} /> {t.disguiseTitle}
        </h2>
        <div className="flex-1" />
        <span className={`font-display text-2xl font-bold tabular-nums ${timeUrgent ? 'text-red-400' : 'text-white/70'}`}>
          {Math.max(0, state.timerRemaining ?? 0)}s
        </span>
      </div>
      <ProgressHairline pct={pct} accent={ACCENT} urgent={timeUrgent} />

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-10 py-6 sm:py-8">
        {/* Ein gemeinsames Fenster statt drei einzeln schwebender Plaketten (Status,
            Hinweis, Kartenreihe) — dieselbe Comic-Panel-Fläche wie im Hub. */}
        <div className="max-w-2xl mx-auto cr-arcade-panel p-5 sm:p-6 flex flex-col items-center gap-5">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-amber-300 font-semibold">{t.trapsPlaced(state.myTrapsPlaced, state.disguiseCount)}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/50">{t.readyStatus(state.readyCount, state.activeCount)}</span>
          </div>

          {done ? (
            <p className="text-white/60 text-sm animate-pulse">{t.waitingForOthers}</p>
          ) : state.myPendingTrap ? (
            <>
              <p className="text-white/70 text-sm">{t.pickTarget}</p>
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span>{state.myPendingTrap.badCard.name}</span>
                <Shuffle size={12} />
                <span className="text-amber-300">?</span>
              </div>
              {/* flex+wrap+justify-center statt eines festen Spaltenrasters: bei 4 Kandidaten
                  wäre ein grid-cols-4 zufällig passend, bei 3 Trap-Karten (siehe unten) bliebe
                  eine Spalte leer und die Reihe säße links statt mittig. */}
              <div className="flex flex-wrap justify-center gap-3">
                {state.myPendingTrap.targetOptions.map((card, i) => (
                  <button key={card.id} onClick={() => onChooseTarget(i)}
                    className="group w-28 sm:w-32 rounded-xl overflow-hidden border-2 border-white/10 hover:border-amber-400 transition-colors">
                    <div className="aspect-[5/6]"><CardImg id={card.id} name={card.name} /></div>
                    <div className="px-2 py-1.5 bg-black/40">
                      <span className="text-white text-xs font-semibold truncate block">{card.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-white/70 text-sm">{t.pickBadCard}</p>
              <div className="flex flex-wrap justify-center gap-3">
                {state.myBadCards.map((card, i) => {
                  const used = state.myUsedBadCardIndices.includes(i);
                  return (
                    <button key={i} disabled={used} onClick={() => onChooseBadCard(i)}
                      className={`group w-28 sm:w-32 rounded-xl overflow-hidden border-2 transition-colors ${
                        used ? 'border-white/5 opacity-30 cursor-not-allowed' : 'border-white/10 hover:border-amber-400'}`}>
                      <div className="aspect-[5/6]"><CardImg id={card.id} name={card.name} /></div>
                      <div className="px-2 py-1.5 bg-black/40">
                        <span className="text-white text-xs font-semibold truncate block">{card.name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 9 = 3×3, 12 = 4×3, 16 = 4×4 — muss zu TRAP_GRID_SIZES im Backend passen.
const TRAP_GRID_SHAPE = { 9: [3, 3], 12: [4, 3], 16: [4, 4] };

// ── Auflösung: EINE Zeile pro Spieler mit der Karte, die er bekommen hat ───────────────────
// Ersetzt die frühere, nach umkämpften Feldern gruppierte Ansicht: die zeigte unbestrittene
// Picks (nur ein Klick auf dem Feld) gar nicht erst an. Steht als eigenes Flex-Geschwister
// UNTER dem Raster statt darüber zu schweben — dafür bekommt das Raster während der Auflösung
// bewusst weniger Höhe (siehe GridPhase), es muss ja nicht mehr die ganze Fläche ausfüllen.
function ResultsPanel({ state, myPlayerId, t }) {
  const results = state.lastResolution?.results || [];
  const myRedirect = state.lastResolution?.redirects?.find(r => r.playerId === myPlayerId);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 sm:px-6 pb-4">
      {/* Überschrift und Ergebnisliste als EIN Fenster statt loser Überschrift über
          einzeln schwebenden Zeilen. */}
      <div className="max-w-xl mx-auto cr-arcade-panel p-4 sm:p-5">
        <p className="text-amber-300 text-sm font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Sparkles size={15} /> {t.revealTitle}
        </p>
        {myRedirect && (
          <p className="text-amber-200 text-sm font-semibold mb-3">{t.youRedirected}</p>
        )}
        <div className="flex flex-col gap-1.5">
          {results.map(r => {
            const player = state.players.find(p => p.id === r.playerId);
            const isMe = r.playerId === myPlayerId;
            return (
              <div key={r.playerId}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isMe ? 'bg-white/[0.08]' : 'bg-white/[0.04]'}`}>
                {/* aspect-[5/6] statt eines Quadrats — dasselbe native Kartenformat wie im
                    Raster darüber, sonst wäre hier derselbe Beschnitt am unteren Rand. */}
                <div className="w-10 aspect-[5/6] rounded-md overflow-hidden shrink-0 bg-white/[0.04]">
                  <CardImg id={r.card?.id} name={r.card?.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-white text-sm font-semibold truncate block">{r.card?.name}</span>
                  <span className="text-[11px] truncate block" style={{ color: player?.color || 'rgba(255,255,255,0.4)' }}>
                    {player?.name || '?'}
                  </span>
                </div>
                <span className={`text-xs font-semibold tabular-nums shrink-0 ${r.redirected ? 'text-amber-300' : 'text-white/50'}`}>
                  {r.redirected ? t.redirectedBadge : (r.ms != null ? `${r.ms} ms` : '—')}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-white/30 text-xs mt-3 text-center">{t.nextRoundSoon}</p>
      </div>
    </div>
  );
}

// ── Raster (Countdown / Rennen / Auflösung) ─────────────────────────────────
function GridPhase({ state, now, myPlayerId, onClick, t }) {
  const [cols, rows] = TRAP_GRID_SHAPE[state.gridSize] || [3, 3];
  const inCountdown = state.phase === 'countdown';
  const countdownRemaining = inCountdown ? Math.max(1, Math.ceil((state.countdownUntil - now) / 1000)) : 0;
  const racing = state.phase === 'racing';
  const revealing = state.phase === 'reveal';
  const myRedirect = revealing ? state.lastResolution?.redirects?.find(r => r.playerId === myPlayerId) : null;

  // Der Server bestätigt den eigenen Klick erst mit der vollen Auflösung, nicht mit dem
  // leichten Zwischen-Update (das verrät nur die Gesamtzahl, keine Ziele — siehe
  // clash:trap:clickUpdate). Ohne diese optimistische Markierung bliebe das Raster für den
  // klickenden Spieler bis zur Auflösung fälschlich weiter klickbar.
  const [optimisticClick, setOptimisticClick] = useState(null);
  useEffect(() => { setOptimisticClick(null); }, [state.round]);
  const myClickedCellIndex = state.myClickedCellIndex ?? optimisticClick;
  const handleClick = (cellIndex) => { setOptimisticClick(cellIndex); onClick(cellIndex); };

  // Feste Lücke statt responsiver `gap-2 sm:gap-3`-Klassen: die Kachelgröße unten wird aus
  // cqw/cqh UND dieser Lücke berechnet — ein Klassenwechsel bei `sm` hätte diese Rechnung
  // sonst unbemerkt falsch gemacht (siehe genau dieser Bug weiter unten).
  const GAP_PX = 8;
  // Kartenkacheln waren hier bisher erzwungen quadratisch (1:1) — die Bilder von
  // royaleapi sind aber nativ 150×180px, also 5:6 (geprüft, keine Annahme). object-cover
  // schneidet den Überstand mittig weg: bei 1:1 verschwinden dadurch oben UND unten je 10%
  // des Bilds, beim Sockel legendärer Karten sichtbar. Jede andere Kartenkachel im Spiel
  // (Verschleiern-Auswahl weiter oben, Dark Maze, Angel Royale, …) nutzt deshalb schon
  // `aspect-[5/6]` statt eines Quadrats — hier jetzt genauso, macht den Schnitt zu 0%.
  const RATIO_H_OVER_W = 6 / 5;
  // Breite ist eine harte Obergrenze (min(...) außen) — sie darf nie überschritten werden,
  // sonst läuft die Reihe seitlich aus dem Bild. Die Höhen-Bound wird zurück auf eine
  // Breite umgerechnet (÷ Seitenverhältnis), damit beide Bounds vergleichbar sind. Reicht
  // die Höhe nicht, wird stattdessen gescrollt statt die Karten zu quetschen.
  const widthBound = `calc((100cqw - ${(cols - 1) * GAP_PX}px) / ${cols})`;
  const heightBoundAsWidth = `calc(((100cqh - ${(rows - 1) * GAP_PX}px) / ${rows}) / ${RATIO_H_OVER_W})`;
  // Obergrenze bewusst großzügig (8rem Breite = 9.6rem Höhe) — das Raster hat höchstens 16
  // Felder (anders als z.B. die Pyramide mit bis zu 78), es darf ruhig deutlich mehr vom
  // Bildschirm einnehmen; die beiden Bounds oben verhindern trotzdem jedes Überlaufen.
  const cellWidth = `min(${widthBound}, clamp(2.5rem, ${heightBoundAsWidth}, 8rem))`;
  const cellHeight = `calc(${cellWidth} * ${RATIO_H_OVER_W})`;

  return (
    <div className="flex-1 relative overflow-hidden bg-[#0a0a0d] flex flex-col">
      {/* Während des Countdowns wird das Raster gar nicht erst gerendert (nicht nur
          verdeckt) — sonst sieht man durch eine halbtransparente Fläche schon vorher, was
          wo liegt, und der eigentliche "Start" verliert seine Überraschung. Echter
          Black-Screen bis der Countdown durch ist.

          Während der Auflösung ist das Raster NICHT mehr flex-1 (nimmt sich also nicht mehr
          die ganze verbleibende Höhe), sondern bekommt nur noch einen gedeckelten Anteil
          (clamp in vh) — die Auflösungsliste als Geschwister darunter braucht selbst Platz,
          statt wie zuvor als Overlay über dem Raster zu schweben. */}
      {!inCountdown && (
        // container-type: size macht die eigene Breite UND Höhe als cqw/cqh messbar. Die
        // Innenabstände (Padding) müssen an DERSELBEN Box wie container-type stehen — sonst
        // zählt cqh Platz mit, den ein Kind-Element per eigenem Padding längst verbraucht hat,
        // und die Kachelgröße wird zu groß berechnet (Karten laufen unten aus dem Bild).
        <div className={`overflow-y-auto custom-scrollbar flex items-center justify-center p-3 sm:p-6 ${
          revealing ? 'shrink-0' : 'flex-1 min-h-0'}`}
          style={{ containerType: 'size', height: revealing ? 'clamp(240px, 46vh, 460px)' : undefined }}>
          <div className="grid" style={{
            gap: GAP_PX,
            gridTemplateColumns: `repeat(${cols}, ${cellWidth})`,
            gridTemplateRows: `repeat(${rows}, ${cellHeight})`,
          }}>
            {state.grid.map(cell => (
              <TrapCell key={cell.index} cell={cell} t={t} cellWidth={cellWidth} cellHeight={cellHeight}
                isRedirectTarget={myRedirect?.cellIndex === cell.index}
                clickable={racing && myClickedCellIndex == null}
                isClicked={myClickedCellIndex === cell.index}
                onClick={() => handleClick(cell.index)} />
            ))}
          </div>
        </div>
      )}

      {revealing && <ResultsPanel state={state} myPlayerId={myPlayerId} t={t} />}

      {inCountdown && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0a0a0d]">
          <div className="text-center">
            <p className="text-amber-300 text-sm font-bold uppercase tracking-widest mb-3">{t.countdownGetReady}</p>
            <p className="text-white font-black text-7xl tabular-nums leading-none">{countdownRemaining}</p>
            <p className="text-gray-400 text-xs mt-3">{t.countdownSub}</p>
          </div>
        </div>
      )}

      {racing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-lg border bg-amber-950/30 border-amber-500/30 backdrop-blur-md">
          <Zap size={13} className="text-amber-400 animate-pulse" />
          <span className="text-amber-200 text-xs font-bold">
            {myClickedCellIndex != null ? t.raceClicked : t.raceHint}
          </span>
        </div>
      )}
      {racing && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-lg bg-white/[0.06] border border-white/10 backdrop-blur-md">
          <span className="text-white/60 text-[11px] font-bold tabular-nums">
            {t.clickedCount(state.pendingClickCount, state.activeCount)}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function TrapSetter({ trapState, myPlayerId, onChooseBadCard, onChooseTarget, onCellClick, lang = 'de' }) {
  const t = TRAP_I18N[lang] || TRAP_I18N.de;
  const now = useNow(200);
  const state = trapState;

  if (!state) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">{t.loading}</p>
    </div>
  );

  const activePlayers = state.players.filter(p => !p.isSpectator);
  const doneCount = activePlayers.filter(p => (p.deck || []).length >= state.deckSize).length;
  const raceRemaining = state.phase === 'racing' && state.raceTimeoutAt
    ? Math.max(0, Math.ceil((state.raceTimeoutAt - now) / 1000)) : null;

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
      <style>{TRAP_STYLE}</style>
      <ModeShell
        sidebar={<TrapSidebar state={state} myPlayerId={myPlayerId} t={t} />}
        strip={strip}
        playerCount={activePlayers.length}
        lang={lang}>
        <div className="flex-1 flex flex-col overflow-hidden cr-arcade-bg">
          {state.phase === 'disguise' ? (
            <DisguisePhase state={state} onChooseBadCard={onChooseBadCard} onChooseTarget={onChooseTarget} t={t} />
          ) : (
            <>
              <div className="shrink-0 px-4 sm:px-10 pt-5 sm:pt-6 pb-4 flex items-baseline gap-3 sm:gap-4 flex-wrap
                bg-gradient-to-b from-[#17293f] to-[#0c1725] border-b-[3px]"
                style={{ borderColor: 'var(--cr-arcade-ink)' }}>
                <h2 className="font-display text-2xl sm:text-[28px] font-bold text-white leading-none">
                  {t.players} {doneCount}
                  <span className="text-white/20 font-normal"> / {activePlayers.length} {t.done}</span>
                </h2>
                <div className="flex-1" />
                <span className="text-white/35 text-sm hidden sm:block">
                  {t.decksDone(doneCount, activePlayers.length)}
                </span>
                {/* Der Anti-AFK-Timer der Klickphase (raceTimeoutAt) lief bisher komplett
                    unsichtbar mit — nach 20s löst der Server die Runde automatisch auf, ohne
                    dass irgendwo eine Uhr das ankündigt. Gleiche Darstellung wie GameHeader
                    (großer Countdown rechts, rot ab 5s), damit sie auch neben der Kopfzeile
                    der anderen Modi vertraut wirkt. */}
                {raceRemaining != null && (
                  <span className={`font-display text-2xl font-bold tabular-nums ${
                    raceRemaining <= 5 ? 'text-red-400' : 'text-white/70'}`}>
                    {raceRemaining}s
                  </span>
                )}
              </div>
              <ProgressHairline pct={(doneCount / Math.max(1, activePlayers.length)) * 100} accent={ACCENT} />
              <GridPhase state={state} now={now} myPlayerId={myPlayerId} onClick={onCellClick} t={t} />
            </>
          )}
        </div>
      </ModeShell>
    </>
  );
}
