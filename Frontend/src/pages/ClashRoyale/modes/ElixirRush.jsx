import React, { useState, useEffect, useRef } from 'react';
import { Crown, Check, Zap, Hourglass } from 'lucide-react';
import { RARITY_COLOR, RARITY_BORDER } from '../data/cards';
import unknownCardImg from '../../../assets/clashRoyale/UnknownCard.png';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));
const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';

// Flip: alte Karte klappt weg → "Unknown Card" blitzt auf → neue Karte klappt rein.
// Kauf: Käufer-Overlay auf der alten Karte, danach poppt die neue Karte schnell ein.
const RUSH_STYLE = `
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
};

const RUSH_I18N = {
  de: {
    you: 'Du',
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
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

function CardImg({ id, name, rarity }) {
  return (
    <div className="relative w-full h-full" style={{ background: (RARITY_COLOR[rarity] || '#555') + '18' }}>
      <img src={`${CARD_CDN}${id}.png`} alt={name} className="w-full h-full object-cover" draggable={false}
        onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

// Elixiertropfen mit Kosten — pink/lila wie in Clash Royale
function CostBadge({ cost, affordable }) {
  return (
    <div className="absolute -top-2.5 -left-2.5 w-9 h-9 rounded-full flex items-center justify-center border-2 z-10"
      style={{
        borderColor: affordable ? '#ffffffcc' : '#ffffff30',
        background: affordable ? 'linear-gradient(180deg,#f472b6 0%,#d946ef 55%,#9333ea 100%)' : '#3f3f46',
      }}>
      <span className={`font-black text-base tabular-nums ${affordable ? 'text-white' : 'text-gray-400'}`}>{cost}</span>
    </div>
  );
}

// ── Der Elixierbalken (Clash-Royale-Look: pink, segmentiert, mit Tropfen-Zähler) ──
function ElixirBar({ value, max = 10, big = false }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const whole = Math.floor(value + 1e-6);
  if (!big) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-fuchsia-300 font-black text-xs tabular-nums w-5 text-right">{whole}</span>
        <div className="flex-1 relative h-2 rounded-sm overflow-hidden bg-[#17101f] border border-fuchsia-500/20">
          <div className="absolute inset-y-0 left-0"
            style={{ width: `${pct}%`, background: 'linear-gradient(180deg,#f9a8d4,#c026d3)' }} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="w-14 h-14 rounded-full border-[3px] border-white/60 flex items-center justify-center shrink-0 shadow-lg"
        style={{ background: 'linear-gradient(180deg,#f472b6 0%,#d946ef 55%,#9333ea 100%)' }}>
        <span className="text-white font-black text-2xl tabular-nums">{whole}</span>
      </div>
      <div className="flex-1 relative h-9 rounded-md overflow-hidden border-2 border-[#4a2a5e] bg-[#17101f]">
        <div className="absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear"
          style={{ width: `${pct}%`, background: 'linear-gradient(180deg,#f9a8d4 0%,#ec4899 45%,#a21caf 100%)' }} />
        {Array.from({ length: max - 1 }, (_, i) => (
          <div key={i} className="absolute inset-y-0 w-px bg-black/45" style={{ left: `${((i + 1) / max) * 100}%` }} />
        ))}
        <div className="absolute inset-0 flex items-center justify-end pr-3 pointer-events-none">
          <span className="text-white/80 font-bold text-xs tabular-nums">{value.toFixed(1)} / {max}</span>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar: Spieler mit Elixier + Deck-Fortschritt ────────────────────────
function RushSidebar({ state, myPlayerId, elixirOf, t }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators    = state.players.filter(p => p.isSpectator);
  return (
    <div className="w-60 shrink-0 bg-[#16161a] border-r border-white/5 overflow-y-auto custom-scrollbar py-3 px-2.5 flex flex-col gap-3">
      {activePlayers.map(p => {
        const isMe = p.id === myPlayerId;
        const done = (p.deck || []).length >= state.deckSize;
        const champCount = (p.deck || []).filter(c => c.isChampion).length;
        // Host-Einstellung: Elixier der Mitspieler verstecken — der eigene Balken bleibt sichtbar
        const showBar = !done && (isMe || state.showElixir !== false);
        return (
          <div key={p.id}
            className={`rounded-sm border p-3 transition-colors ${isMe ? 'border-fuchsia-500/40 bg-fuchsia-500/5' : 'border-white/5 bg-[#0f0f13]'}`}>
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <AvatarCircle id={p.avatar} color={p.color} size={30} />
              <span className="text-white text-sm font-semibold truncate flex-1">{p.name}</span>
              {isMe && <span className="text-[10px] text-fuchsia-400 font-bold shrink-0">{t.you}</span>}
              {done && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/25 px-1.5 py-0.5 rounded-sm shrink-0">
                  <Check size={10} /> {t.done}
                </span>
              )}
            </div>
            {showBar && <div className="mb-2"><ElixirBar value={elixirOf(p)} max={state.maxElixir} /></div>}
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: state.deckSize }, (_, ci) => {
                const card = p.deck?.[ci];
                return (
                  <div key={ci} title={card?.name}
                    className={`aspect-square rounded-sm overflow-hidden border ${
                      card ? (RARITY_BORDER[card.rarity] || 'border-white/10') : 'border-white/5 bg-white/[0.02]'}`}>
                    {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Crown size={11} className={champCount > 0 ? 'text-cyan-400' : 'text-gray-700'} />
              <span className="text-[10px] text-gray-500">{champCount}/2 Champions</span>
              <span className="text-[10px] text-gray-600 ml-auto">{p.deck?.length || 0}/{state.deckSize}</span>
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
              {p.id === myPlayerId && <span className="text-[9px] text-fuchsia-500 shrink-0">{t.you}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Ein Marktplatz-Slot mit Kauf-/Wechsel-Animationen ──────────────────────
function MarketSlot({ slot, myPlayerId, canInteract, myElixir, myChampCount, denied, onBuy, cardLifetimeMs, clientOffset, now, showTimer, t, lang = 'de' }) {
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
    <div className={`w-28 select-none ${isDenied ? 'rush-shake' : ''}`}>
      <div
        onClick={() => clickable && onBuy(slot.seq)}
        title={card ? t.costElixir(card.name, card.cost) : t.empty}
        className={`relative rounded-md border-2 overflow-hidden aspect-square transition-colors ${
          clickable ? 'cursor-pointer border-white/25 hover:border-fuchsia-400' :
          card && showNewCard ? 'border-white/10' : 'border-white/10'
        }`}
        style={{ perspective: '400px', background: '#0c0812' }}>

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

        {/* Kosten-Badge */}
        {card && showNewCard && <CostBadge cost={card.cost} affordable={!canInteract || affordable} />}

        {/* Champion-Krone */}
        {card && showNewCard && card.isChampion && (
          <div className="absolute top-0.5 right-0.5 bg-black/60 rounded-[2px] p-0.5 z-10">
            <Crown size={10} className="text-cyan-400" />
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

      {/* Restzeit-Balken — per Host-Einstellung ein-/ausblendbar */}
      {showTimer && (
        <div className="mt-1.5 h-1 rounded-sm overflow-hidden bg-white/5">
          {card && showNewCard && (
            <div className={`h-full ${lifeUrgent ? 'bg-red-500' : 'bg-fuchsia-500/70'}`}
              style={{ width: `${lifePct}%`, transition: 'width .25s linear' }} />
          )}
        </div>
      )}
      <p className="text-[11px] text-gray-400 text-center mt-1 truncate">
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
    <div className="h-full flex overflow-hidden select-none">
      <style>{RUSH_STYLE}</style>
      <RushSidebar state={state} myPlayerId={myPlayerId} elixirOf={elixirOf} t={t} />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="shrink-0 bg-[#0f0f13] border-b border-white/5 px-4 py-2 flex items-center gap-4">
          <span className="text-white font-bold text-sm shrink-0">Elixir Rush</span>
          <span className="text-gray-500 text-xs shrink-0">{t.decksDone(doneCount, activePlayers.length)}</span>
          <div className="flex-1" />
          {!amSpectator && (
            <span className={`text-sm font-bold tabular-nums shrink-0 ${myDeckFull ? 'text-green-400' : 'text-fuchsia-300'}`}>
              {t.cardsOf(myDeckCount, state.deckSize)}
            </span>
          )}
        </div>

        {/* Status-Banner */}
        {state.finished ? (
          <div className="shrink-0 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20 flex items-center gap-3">
            <Check size={16} className="text-green-400 shrink-0" />
            <p className="text-green-300 font-bold text-sm">{t.allDecksFull}</p>
          </div>
        ) : inCountdown ? (
          <div className="shrink-0 px-4 py-2.5 bg-fuchsia-500/10 border-b border-fuchsia-500/30 flex items-center gap-3">
            <Hourglass size={14} className="text-fuchsia-300 shrink-0" />
            <p className="text-fuchsia-200 font-bold text-sm">
              {t.startingSoon(countdownRemaining)}
            </p>
          </div>
        ) : amSpectator ? (
          <div className="shrink-0 px-4 py-2.5 bg-[#101016] border-b border-white/5 flex items-center gap-3">
            <p className="text-gray-400 font-semibold text-sm">{t.spectatorLive}</p>
          </div>
        ) : myDeckFull ? (
          <div className="shrink-0 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20 flex items-center gap-3">
            <Check size={16} className="text-green-400 shrink-0" />
            <p className="text-green-300 font-bold text-sm">{t.yourDeckFull}</p>
          </div>
        ) : (
          <div className="shrink-0 px-4 py-2.5 bg-fuchsia-500/10 border-b border-fuchsia-500/30 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-pulse shrink-0" />
            <p className="text-fuchsia-200 font-bold text-sm">
              {t.grabCards}
            </p>
          </div>
        )}

        {/* Marktplatz */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 flex items-center justify-center">
          <div className="w-full max-w-3xl rounded-md border border-fuchsia-500/30 bg-[#190f22] shadow-[0_16px_40px_rgba(0,0,0,0.55)] overflow-hidden relative">
            <div className="flex items-center justify-between px-5 py-3 bg-fuchsia-500/10 border-b border-fuchsia-500/20">
              <span className="text-fuchsia-300 text-xs font-bold uppercase tracking-widest">{t.marketplace}</span>
              <span className="text-gray-500 text-[11px]">{t.cardsSwapEvery(Math.round(state.cardLifetimeMs / 1000))}</span>
            </div>
            <div className="p-6 bg-[#120a1a]">
              <div className="flex flex-wrap justify-center gap-6">
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
            </div>

            {/* Countdown-Fenster deckt exakt den Marktplatz ab (komplett blickdicht,
                damit man die Karten nicht schon durchscheinen sieht) */}
            {inCountdown && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#120a1a]">
                <div className="text-center">
                  <p className="text-fuchsia-300 text-sm font-bold uppercase tracking-widest mb-3">{t.getReady}</p>
                  <p className="text-white font-black text-7xl tabular-nums leading-none">{countdownRemaining}</p>
                  <p className="text-gray-400 text-xs mt-3">{t.marketOpensForAll}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Auto-Kauf-Warnung + eigener Elixierbalken */}
        <div className="shrink-0 border-t border-white/5 bg-[#0f0f13] px-4 sm:px-6 py-4 space-y-3">
          {autoBuyIn != null && autoBuyIn <= state.autoBuyMs / 1000 && (
            <div className="flex items-center gap-2.5 bg-amber-400/10 border border-amber-400/30 rounded-md px-4 py-2">
              <Hourglass size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-xs font-bold">
                {t.fullElixirAutoBuy(autoBuyIn)}
              </p>
            </div>
          )}
          {!amSpectator && !myDeckFull ? (
            <ElixirBar value={myElixir} max={state.maxElixir} big />
          ) : (
            <p className="text-gray-600 text-xs text-center">
              {amSpectator ? t.spectatorNoElixir : t.deckCompleteNoElixir}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
