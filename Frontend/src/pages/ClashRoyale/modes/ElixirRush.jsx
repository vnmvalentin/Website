import React, { useState, useEffect, useRef } from 'react';
import { Check, Zap, Hourglass, Eye } from 'lucide-react';
import unknownCardImg from '../../../assets/clashRoyale/UnknownCard.png';
import crownIcon from '../../../assets/clashRoyale/ui/crown.png';
import ModeShell from './ModeShell';
import { CARD_CROP } from './cardCrop';
import { GameHeader, ProgressHairline, GameSurface, GameFooter, PlayerPanel, DeckGrid } from './GameChrome';
import ElixirBar from '../ui/ElixirBar';
import { cardImageUrl } from '../data/cards';

/** Akzentfarbe des Modus. */
const ACCENT = '#e879f9';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));

// Flip: alte Karte klappt weg → "Unknown Card" blitzt auf → neue Karte klappt rein.
// Kauf: Käufer-Overlay auf der alten Karte, danach poppt die neue Karte schnell ein.
// Exportiert für ElixirRush2v2.jsx — dieselben Flip-/Kauf-/Shake-Animationen, die
// MarketSlot voraussetzt.
export const RUSH_STYLE = `
@keyframes rushFlipOut { from { transform: rotateY(0deg); }   to { transform: rotateY(90deg); } }
@keyframes rushFlipIn  { from { transform: rotateY(-90deg); } to { transform: rotateY(0deg); } }
@keyframes rushPop     { from { transform: scale(0.65); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes rushShake   { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-5px); } 40%,80% { transform: translateX(5px); } }
.rush-flip-out { animation: rushFlipOut .16s ease-in both; }
.rush-flip-in  { animation: rushFlipIn  .18s ease-out both; }
.rush-pop      { animation: rushPop .22s cubic-bezier(0.34, 1.35, 0.64, 1) both; }
.rush-shake    { animation: rushShake .4s ease both; }
`;

const DENIED_TEXT_I18N = {
  de: {
    late:      'Zu spät!',
    elixir:    'Zu wenig Elixier!',
    champion:  'Champion-Limit!',
    deckfull:  'Deck voll!',
    countdown: 'Noch nicht — warte auf den Start!',
  },
  en: {
    late:      'Too late!',
    elixir:    'Not enough elixir!',
    champion:  'Champion limit!',
    deckfull:  'Deck full!',
    countdown: 'Not yet — wait for the start!',
  },
  es: {
    late:      '¡Demasiado tarde!',
    elixir:    '¡No hay suficiente elixir!',
    champion:  '¡Límite de campeones!',
    deckfull:  '¡Mazo completo!',
    countdown: '¡Todavía no — espera al inicio!',
  },
};

const RUSH_I18N = {
  de: {
    you: 'Du',
    cardsLabel: 'Karten',
    loading: 'Lade Elixir Rush…',
    notPossible: 'Nicht möglich',
    done: 'Fertig',
    empty: 'Leer',
    costElixir: (name, cost) => `${name} — ${cost} Elixier`,
    yourCard: 'Deine Karte!',
    autoBuy: 'Auto-Kauf',
    championLimit: 'Champion-Limit',
    decksDone: (done, total) => `${done}/${total} Decks fertig`,
    cardsOf: (count, deckSize) => `${count}/${deckSize} Karten`,
    allDecksFull: 'Alle Decks sind voll — Draft abgeschlossen!',
    startingSoon: (s) => `Gleich geht's los — in ${s}s kann jeder gleichzeitig kaufen.`,
    spectatorLive: 'Zuschauer — du siehst den Marktplatz live.',
    yourDeckFull: 'Dein Deck ist voll! Warte, bis die anderen fertig sind…',
    grabCards: 'Schnapp dir Karten mit deinem Elixier — wer zuerst klickt, bekommt sie!',
    marketplace: 'Marktplatz',
    cardsSwapEvery: (s) => `Karten wechseln alle ${s}s`,
    getReady: 'Alle bereit machen…',
    marketOpensForAll: 'Der Marktplatz öffnet für alle gleichzeitig',
    fullElixirAutoBuy: (s) => `Volles Elixier! In ${s}s bekommst du automatisch eine zufällige Karte.`,
    spectatorNoElixir: 'Als Zuschauer hast du kein Elixier.',
    deckCompleteNoElixir: 'Deck komplett — dein Elixier wird nicht mehr gebraucht.',
  },
  en: {
    you: 'You',
    cardsLabel: 'Cards',
    loading: 'Loading Elixir Rush…',
    notPossible: 'Not possible',
    done: 'Done',
    empty: 'Empty',
    costElixir: (name, cost) => `${name} — ${cost} elixir`,
    yourCard: 'Your card!',
    autoBuy: 'Auto-buy',
    championLimit: 'Champion limit',
    decksDone: (done, total) => `${done}/${total} decks done`,
    cardsOf: (count, deckSize) => `${count}/${deckSize} cards`,
    allDecksFull: 'All decks are full — draft complete!',
    startingSoon: (s) => `Starting soon — everyone can buy at the same time in ${s}s.`,
    spectatorLive: 'Spectator — you see the marketplace live.',
    yourDeckFull: 'Your deck is full! Wait for the others to finish…',
    grabCards: 'Grab cards with your elixir — first click gets it!',
    marketplace: 'Marketplace',
    cardsSwapEvery: (s) => `Cards swap every ${s}s`,
    getReady: 'Everyone get ready…',
    marketOpensForAll: 'The marketplace opens for everyone at the same time',
    fullElixirAutoBuy: (s) => `Elixir full! In ${s}s you'll automatically get a random card.`,
    spectatorNoElixir: 'As a spectator you have no elixir.',
    deckCompleteNoElixir: "Deck complete — you don't need elixir anymore.",
  },
  es: {
    you: 'Tú',
    cardsLabel: 'Cartas',
    loading: 'Cargando Elixir Rush…',
    notPossible: 'No es posible',
    done: 'Listo',
    empty: 'Vacío',
    costElixir: (name, cost) => `${name} — ${cost} de elixir`,
    yourCard: '¡Tu carta!',
    autoBuy: 'Compra automática',
    championLimit: 'Límite de campeones',
    decksDone: (done, total) => `${done}/${total} mazos listos`,
    cardsOf: (count, deckSize) => `${count}/${deckSize} cartas`,
    allDecksFull: '¡Todos los mazos están completos — draft terminado!',
    startingSoon: (s) => `Ya casi empieza — en ${s}s todos podrán comprar a la vez.`,
    spectatorLive: 'Espectador — ves el mercado en directo.',
    yourDeckFull: '¡Tu mazo está completo! Espera a que los demás terminen…',
    grabCards: 'Consigue cartas con tu elixir — ¡el primer clic se la lleva!',
    marketplace: 'Mercado',
    cardsSwapEvery: (s) => `Las cartas cambian cada ${s}s`,
    getReady: 'Todos listos…',
    marketOpensForAll: 'El mercado se abre para todos al mismo tiempo',
    fullElixirAutoBuy: (s) => `¡Elixir al máximo! En ${s}s recibirás automáticamente una carta aleatoria.`,
    spectatorNoElixir: 'Como espectador no tienes elixir.',
    deckCompleteNoElixir: 'Mazo completo — ya no necesitas elixir.',
  },
};

function useNow(intervalMs = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function AvatarCircle({ id, color, size = 28 }) {
  const url = id ? AVATAR_MAP[id] : null;
  return (
    <div className="rounded-full overflow-hidden shrink-0 border-2 bg-[#1a1a20]"
      style={{ width: size, height: size, borderColor: (color || '#888') + '99' }}>
      {url && <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
    </div>
  );
}

function CardImg({ id, name }) {
  return (
    // Kein eingefärbter Hintergrund mehr: Bei Artworks mit transparentem Rand
    // schimmerte er durch und legte einen farbigen Schleier über jede Karte.
    <div className="relative w-full h-full">
      <img src={cardImageUrl(id)} alt={name} className="w-full h-full object-cover" draggable={false}
        style={CARD_CROP} onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

// Kosten-Plakette auf jeder Marktkarte — Flachfarbe statt Verlauf, derselbe Tinten-Rand
// wie der Rest des Arcade-Skins statt eines schlichten weißen Rings (siehe ui/ElixirBar.jsx
// für dieselbe Cartoon-Regel: eine Fläche plus ein schmaler Glanzstreifen statt eines
// mehrstufigen Verlaufs).
function CostBadge({ cost, affordable }) {
  return (
    <div className="absolute -top-2.5 -left-2.5 w-9 h-9 rounded-full flex items-center justify-center z-10 overflow-hidden"
      style={{ border: '2.5px solid var(--cr-arcade-ink)', background: affordable ? '#d926e0' : '#3f3f46' }}>
      {affordable && <div className="absolute inset-x-1.5 top-1 h-2 bg-white/35 rounded-full" />}
      <span className={`relative font-black text-base tabular-nums ${affordable ? 'text-white' : 'text-gray-400'}`}>{cost}</span>
    </div>
  );
}

// ── Sidebar: Spieler mit Elixier + Deck-Fortschritt ────────────────────────
function RushSidebar({ state, myPlayerId, elixirOf, t }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators    = state.players.filter(p => p.isSpectator);
  return (
    // Rahmen (Hintergrund, Rand, Scrollen) macht ModeShell — hier nur der Inhalt.
    <>
      {activePlayers.map(p => {
        const isMe = p.id === myPlayerId;
        const done = (p.deck || []).length >= state.deckSize;
        const champCount = (p.deck || []).filter(c => c.isChampion).length;
        // Host-Einstellung: Elixier der Mitspieler verstecken — der eigene Balken bleibt sichtbar
        const showBar = !done && (isMe || state.showElixir !== false);
        return (
          <PlayerPanel key={p.id} isMe={isMe}
            header={
              <div className="flex items-center gap-2.5 min-w-0">
                <AvatarCircle id={p.avatar} color={p.color} size={28} />
                <span className="text-white text-[13px] font-semibold truncate flex-1">{p.name}</span>
                {done
                  ? <Check size={13} className="text-green-400 shrink-0" title={t.done} />
                  : <span className="text-white/25 text-[11px] tabular-nums shrink-0">{p.deck?.length || 0}/{state.deckSize}</span>}
              </div>
            }>
            {showBar && <ElixirBar value={elixirOf(p)} max={state.maxElixir} size="sm" />}
            <DeckGrid deck={p.deck || []} size={state.deckSize}
              renderCard={(card) => <CardImg id={card.id} name={card.name} />} />
            <div className="flex items-center gap-1.5">
              <img src={crownIcon} alt="" width={14} height={12}
                className={champCount > 0 ? '' : 'opacity-15 grayscale'} />
              <span className="text-white/30 text-[11px]">{champCount}/2 Champions</span>
            </div>
          </PlayerPanel>
        );
      })}
      {spectators.length > 0 && (
        <>
          <div className="h-px bg-white/[0.06]" />
          {spectators.map(p => (
            <div key={p.id} className="flex items-center gap-2 px-1 py-1 opacity-45">
              <AvatarCircle id={p.avatar} color={p.color} size={20} />
              <span className="text-white/60 text-[11px] truncate flex-1">{p.name}</span>
              <Eye size={11} className="text-white/40 shrink-0" />
            </div>
          ))}
        </>
      )}
    </>
  );
}

// ── Ein Marktplatz-Slot mit Kauf-/Wechsel-Animationen ──────────────────────
// Exportiert, damit ElixirRush2v2.jsx dieselbe Kachel für die getrennten 2v2-Märkte
// wiederverwenden kann, statt sie zu duplizieren.
export function MarketSlot({ slot, myPlayerId, canInteract, myElixir, myChampCount, denied, onBuy, cardLifetimeMs, clientOffset, now, showTimer, t, lang = 'de' }) {
  const [phase, setPhase] = useState('idle'); // idle | bought | out | unknown | unknownOut | in
  const prevSeqRef = useRef(null);
  const timersRef = useRef([]);

  useEffect(() => {
    if (prevSeqRef.current !== null && slot && slot.seq !== prevSeqRef.current) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      const lc = slot.lastChange || {};
      const later = (fn, ms) => timersRef.current.push(setTimeout(fn, ms));
      if (lc.type === 'buy') {
        setPhase('bought');
        later(() => setPhase('in'), 900);
        later(() => setPhase('idle'), 1150);
      } else {
        setPhase(lc.prevCard ? 'out' : 'in');
        if (lc.prevCard) {
          later(() => setPhase('unknown'), 160);
          later(() => setPhase('unknownOut'), 160 + 420);
          later(() => setPhase('in'), 160 + 420 + 160);
          later(() => setPhase('idle'), 160 + 420 + 160 + 250);
        } else {
          later(() => setPhase('idle'), 250);
        }
      }
    }
    prevSeqRef.current = slot?.seq ?? null;
  }, [slot?.seq]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  if (!slot) return null;
  const card = slot.card;
  const lc = slot.lastChange || {};
  const showNewCard = phase === 'idle' || phase === 'in';
  const isDenied = denied && (now - denied.ts) < 900;

  const affordable   = card ? myElixir + 1e-9 >= card.cost : false;
  const champBlocked = card ? (card.isChampion && myChampCount >= 2) : false;
  const clickable    = canInteract && showNewCard && card && affordable && !champBlocked;

  const expiresAtClient = card ? slot.expiresAt + clientOffset : 0;
  const lifePct = card ? Math.max(0, Math.min(100, ((expiresAtClient - now) / cardLifetimeMs) * 100)) : 0;
  const lifeUrgent = lifePct < 25;

  return (
    // Am Desktop deutlich größer als die früheren 112px: Der Marktplatz ist das Spielfeld
    // dieses Modus, und bei einem Modus, der auf Reaktionszeit läuft, entscheidet die
    // Trefferfläche.
    //
    // Auf dem Handy bewusst KLEINER (96px): Bei 128px passen auf 390px Breite nur zwei
    // Karten nebeneinander, fünf Marktplätze brauchen dann drei Reihen — und die letzte
    // stand unter dem sichtbaren Bereich. In einem Spiel, in dem der Erste gewinnt, ist
    // eine Karte, die man erst herunterscrollen muss, wertlos. Bei 96px passen drei in
    // eine Reihe und der ganze Markt bleibt ohne Scrollen sichtbar.
    <div className={`group w-24 sm:w-40 select-none ${isDenied ? 'rush-shake' : ''}`}>
      <div
        onClick={() => clickable && onBuy(slot.seq)}
        title={card ? t.costElixir(card.name, card.cost) : t.empty}
        className={`relative rounded-2xl aspect-square shadow-[0_10px_30px_rgba(0,0,0,0.5)] ${
          clickable ? 'cursor-pointer group-hover:shadow-[0_16px_44px_rgba(0,0,0,0.65)] transition-shadow' : ''
        }`}
        style={{ perspective: '400px', border: '3px solid var(--cr-arcade-ink)' }}>

        {/* Eigene beschnittene Ebene für Kartenbild/Effekte — die Kosten-Plakette hängt
            bewusst über die Kartenecke hinaus (wie im Original) und braucht dafür ein
            Elternelement OHNE overflow-hidden; vorher saß sie im selben, beschnittenen
            Kasten wie das Kartenbild und wurde oben links abgeschnitten. */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden" style={{ background: '#0c0812' }}>
          {/* Auswahl als innerer Ring — ein Rahmen würde die Kachel verschieben */}
          {clickable && (
            <span className="absolute inset-0 z-10 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ boxShadow: `inset 0 0 0 2px ${ACCENT}` }} />
          )}

          {/* Phasen-Inhalt */}
          {phase === 'bought' ? (
            <>
              {lc.prevCard && <CardImg id={lc.prevCard.id} name={lc.prevCard.name} rarity={lc.prevCard.rarity} />}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-1"
                style={{ background: (lc.buyerColor || '#22c55e') + 'd9' }}>
                {lc.buyerId === myPlayerId
                  ? <Check size={26} className="text-white" strokeWidth={3} />
                  : <Zap size={22} className="text-white" />}
                <span className="text-white font-black text-[11px] text-center leading-tight truncate w-full">
                  {lc.buyerId === myPlayerId ? t.yourCard : lc.buyerName || '?'}
                </span>
                {lc.isAuto && <span className="text-white/80 text-[9px] font-bold uppercase">{t.autoBuy}</span>}
              </div>
            </>
          ) : phase === 'out' ? (
            <div className="w-full h-full rush-flip-out">
              {lc.prevCard && <CardImg id={lc.prevCard.id} name={lc.prevCard.name} rarity={lc.prevCard.rarity} />}
            </div>
          ) : phase === 'unknown' ? (
            <img src={unknownCardImg} alt="?" className="w-full h-full object-cover rush-flip-in" draggable={false} />
          ) : phase === 'unknownOut' ? (
            <img src={unknownCardImg} alt="?" className="w-full h-full object-cover rush-flip-out" draggable={false} />
          ) : card ? (
            <div className={`w-full h-full ${phase === 'in' ? (lc.type === 'buy' ? 'rush-pop' : 'rush-flip-in') : ''}`}>
              <CardImg id={card.id} name={card.name} rarity={card.rarity} />
              {!affordable && canInteract && <div className="absolute inset-0 bg-black/55 pointer-events-none" />}
              {champBlocked && canInteract && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                  <span className="text-amber-400 text-[10px] font-bold text-center px-1">{t.championLimit}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Hourglass size={18} className="text-gray-700" />
            </div>
          )}

          {/* Abgelehnt-Feedback */}
          {isDenied && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/40 pointer-events-none z-20">
              <span className="text-white font-black text-[11px] text-center px-1 leading-tight">
                {(DENIED_TEXT_I18N[lang] || DENIED_TEXT_I18N.de)[denied.reason] || t.notPossible}
              </span>
            </div>
          )}
        </div>

        {/* Kosten-Badge — AUSSERHALB der beschnittenen Ebene, damit die obere linke Ecke
            wie im echten Spiel über den Kartenrand hinausragen darf. */}
        {card && showNewCard && <CostBadge cost={card.cost} affordable={!canInteract || affordable} />}

        {/* Champion-Krone */}
        {card && showNewCard && card.isChampion && (
          <div className="absolute top-2 right-2 bg-black/55 backdrop-blur-sm rounded-lg p-1 z-10">
            <img src={crownIcon} alt="" width={16} height={14} />
          </div>
        )}
      </div>

      {/* Restzeit-Balken — per Host-Einstellung ein-/ausblendbar */}
      {showTimer && (
        <div className="mt-2 h-1 rounded-full overflow-hidden bg-white/[0.07]">
          {card && showNewCard && (
            <div className="h-full rounded-full"
              style={{
                width: `${lifePct}%`,
                backgroundColor: lifeUrgent ? '#f87171' : ACCENT,
                transition: 'width .25s linear',
              }} />
          )}
        </div>
      )}
      {/* Eigene Plakette statt bloßen Fließtexts — der Name steht jetzt direkt im
          Diamant-Karo der Spielfläche, nicht mehr auf der Karte selbst. */}
      <p className="text-[13px] text-white font-semibold text-center mt-2 truncate px-2 py-0.5 rounded-md"
        style={{ background: card && showNewCard ? '#111d2c' : 'transparent' }}>
        {card && showNewCard ? card.name : ' '}
      </p>
    </div>
  );
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function ElixirRush({ rushState, myPlayerId, onBuy, denied, lang = 'de' }) {
  const t = RUSH_I18N[lang] || RUSH_I18N.de;
  const now = useNow(100);
  const state = rushState;

  if (!state) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">{t.loading}</p>
    </div>
  );

  // Serverzeit ↔ Clientzeit: Offset aus dem letzten Empfang ableiten
  const clientOffset = state.clientReceivedAt - state.serverNow;
  const elixirOf = (p) => p.isSpectator ? 0
    : Math.min(state.maxElixir, p.elixir + Math.max(0, now - state.clientReceivedAt) / state.regenMs);

  const me           = state.players.find(p => p.id === myPlayerId);
  const amSpectator  = !me || (me.isSpectator ?? false);
  const myElixir     = me && !amSpectator ? elixirOf(me) : 0;
  const myDeckCount  = me?.deck?.length || 0;
  const myDeckFull   = myDeckCount >= state.deckSize;
  const myChampCount = (me?.deck || []).filter(c => c.isChampion).length;

  // Start-Countdown: verhindert, dass der Host (der sofort startet) einen Klick-Vorsprung
  // vor allen anderen hat, die erst auf das Netzwerk-Event warten müssen
  const countdownUntilClient = state.countdownUntil ? state.countdownUntil + clientOffset : null;
  const inCountdown = !!(countdownUntilClient && countdownUntilClient > now);
  const countdownRemaining = inCountdown ? Math.max(1, Math.ceil((countdownUntilClient - now) / 1000)) : 0;

  const canInteract  = !amSpectator && !myDeckFull && !state.finished && !inCountdown;

  const activePlayers = state.players.filter(p => !p.isSpectator);
  const doneCount     = activePlayers.filter(p => (p.deck || []).length >= state.deckSize).length;

  // Auto-Kauf-Countdown bei vollem Balken
  const fullDeadlineClient = me?.fullDeadline ? me.fullDeadline + clientOffset : null;
  const autoBuyIn = (canInteract && fullDeadlineClient && fullDeadlineClient > now)
    ? Math.ceil((fullDeadlineClient - now) / 1000) : null;

  return (
    <ModeShell
      sidebar={<RushSidebar state={state} myPlayerId={myPlayerId} elixirOf={elixirOf} t={t} />}
      playerCount={state.players.filter(p => !p.isSpectator).length}
      lang={lang}>
      <style>{RUSH_STYLE}</style>

      <GameSurface>

        {/* Kopfzeile: eigener Deckfortschritt als große Zahl — das ist das Ziel des Modus */}
        <GameHeader
          label={t.cardsLabel}
          value={amSpectator ? '–' : myDeckCount}
          total={amSpectator ? undefined : state.deckSize}
          badge={
            state.finished ? (
              <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold">
                <Check size={14} /> {t.allDecksFull}
              </span>
            ) : inCountdown ? (
              <span className="flex items-center gap-1.5 text-fuchsia-300 text-sm font-semibold">
                <Hourglass size={13} /> {t.startingSoon(countdownRemaining)}
              </span>
            ) : amSpectator ? (
              <span className="flex items-center gap-1.5 text-white/35 text-sm">
                <Eye size={13} /> {t.spectatorLive}
              </span>
            ) : myDeckFull ? (
              <span className="flex items-center gap-1.5 text-green-400 text-sm font-semibold">
                <Check size={14} /> {t.yourDeckFull}
              </span>
            ) : (
              <span className="text-fuchsia-300 text-sm font-semibold">{t.grabCards}</span>
            )
          }
          meta={t.decksDone(doneCount, activePlayers.length)}
          right={
            <span className="text-white/25 text-xs">
              {t.cardsSwapEvery(Math.round(state.cardLifetimeMs / 1000))}
            </span>
          }
        />
        <ProgressHairline
          pct={amSpectator ? 0 : (myDeckCount / state.deckSize) * 100}
          accent={ACCENT} />

        {/* Marktplatz — flächig statt in einem eigenen Kasten. Die Karten SIND der
            Marktplatz, ein Rahmen drumherum macht sie nur kleiner. */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-10 py-6 sm:py-8 flex items-center justify-center">
          <div className="w-full max-w-5xl relative">
            <div className="flex flex-wrap justify-center gap-4 sm:gap-7">
                {state.market.map((slot, i) => (
                  <MarketSlot key={i}
                    slot={slot}
                    myPlayerId={myPlayerId}
                    canInteract={canInteract}
                    myElixir={myElixir}
                    myChampCount={myChampCount}
                    denied={denied && denied.slotIdx === i ? denied : null}
                    onBuy={(seq) => onBuy(i, seq)}
                    cardLifetimeMs={state.cardLifetimeMs}
                    clientOffset={clientOffset}
                    now={now}
                    showTimer={state.showTimer !== false}
                    t={t}
                    lang={lang}
                  />
                ))}
            </div>

            {/* Countdown-Fenster deckt exakt den Marktplatz ab (komplett blickdicht,
                damit man die Karten nicht schon durchscheinen sieht) */}
            {inCountdown && (
              <div className="absolute -inset-4 z-20 flex items-center justify-center bg-[#0b0b12]">
                <div className="text-center">
                  <p className="text-fuchsia-300 text-sm font-semibold uppercase tracking-widest mb-3">{t.getReady}</p>
                  <p className="text-white font-display font-bold text-7xl tabular-nums leading-none">{countdownRemaining}</p>
                  <p className="text-white/35 text-xs mt-3">{t.marketOpensForAll}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Auto-Kauf-Warnung + eigener Elixierbalken */}
        <GameFooter className="space-y-3">
          {autoBuyIn != null && autoBuyIn <= state.autoBuyMs / 1000 && (
            <div className="flex items-center gap-2.5 bg-amber-400/[0.08] rounded-lg px-4 py-2 max-w-4xl mx-auto">
              <Hourglass size={14} className="text-amber-300 shrink-0" />
              <p className="text-amber-200 text-xs font-semibold">
                {t.fullElixirAutoBuy(autoBuyIn)}
              </p>
            </div>
          )}
          <div className="max-w-4xl mx-auto">
            {!amSpectator && !myDeckFull ? (
              <ElixirBar value={myElixir} max={state.maxElixir} size="lg" />
            ) : (
              <p className="text-white/30 text-xs text-center">
                {amSpectator ? t.spectatorNoElixir : t.deckCompleteNoElixir}
              </p>
            )}
          </div>
        </GameFooter>

      </GameSurface>
    </ModeShell>
  );
}
