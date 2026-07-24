import React, { useState, useEffect } from 'react';
import { Clock, Crown, Eye, Check, Hourglass, RefreshCw } from 'lucide-react';
import { RARITY_COLOR, RARITY_BORDER } from '../data/cards';
import unknownCardImg from '../../../assets/clashRoyale/UnknownCard.png';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));
const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';

const CAROUSEL_I18N = {
  de: {
    you: 'Du',
    loading: 'Lade Blindes Karussel…',
    draftDone: 'Draft abgeschlossen!',
    roundOver: 'Runde vorbei — die Tische wandern weiter…',
    spectatorOverview: 'Zuschauer — du siehst alle Tische im Überblick.',
    choiceSaved: (n) => `Wahl gespeichert — warte auf ${n} Spieler…`,
    yourTurn: 'Du bist am Zug',
    hintSelectedFlipped: (name) => `„${name}" ausgewählt — nehmen oder weitersuchen.`,
    hintSelectedFaceDown: 'Verdeckte Karte ausgewählt — aufdecken oder blind nehmen.',
    hintNoSelection: 'Decke Karten auf deinem Tisch auf und nimm eine — auch verdeckt.',
    takenBy: (name, round) => `Genommen von ${name} (Runde ${round})`,
    cardTaken: 'Karte wurde genommen',
    faceDownCard: 'Verdeckte Karte',
    table: (n) => `Tisch ${n}`,
    cardsRemaining: (remaining, total) => `${remaining} von ${total} Karten übrig`,
    ownedBy: (name) => `bei ${name}`,
    cardsLeft: (n) => `${n} Karten`,
    picksThisRound: 'Picks dieser Runde',
    championLimitReplacement: 'Champion-Limit: Ersatzkarte',
    round: (round, maxRounds) => `Runde ${round}/${maxRounds}`,
    tableN: (n) => `Tisch ${n}`,
    revealsRemainingTitle: 'Verbleibende Aufdeckungen in dieser Runde',
    tablesMovingOn: 'Die Tische wandern weiter…',
    clickCardHint: (n) => `Karte auf dem Tisch anklicken — du kannst noch ${n} Karte${n === 1 ? '' : 'n'} aufdecken. Genommen werden darf jede Karte, auch verdeckt.`,
    unknownIdentity: 'Identität unbekannt — Risiko-Pick',
    championLimitReached: 'Champion-Limit erreicht — du erhältst stattdessen eine zufällige Ersatzkarte.',
    reveal: 'Aufdecken',
    takeCard: 'Karte nehmen',
    takeFaceDown: 'Verdeckt nehmen',
    yourChoicePrefix: 'Deine Wahl:',
    choiceSavedPlain: 'Wahl gespeichert',
    championLimitGotReplacement: 'Champion-Limit — du hast eine Ersatzkarte erhalten.',
  },
  en: {
    you: 'You',
    loading: 'Loading Shadow Carousel…',
    draftDone: 'Draft complete!',
    roundOver: 'Round over — the tables are rotating…',
    spectatorOverview: 'Spectator — you see all tables at a glance.',
    choiceSaved: (n) => `Choice saved — waiting for ${n} player${n === 1 ? '' : 's'}…`,
    yourTurn: "It's your turn",
    hintSelectedFlipped: (name) => `"${name}" selected — take it or keep searching.`,
    hintSelectedFaceDown: 'Face-down card selected — reveal it or take it blind.',
    hintNoSelection: 'Reveal cards on your table and take one — even face-down.',
    takenBy: (name, round) => `Taken by ${name} (round ${round})`,
    cardTaken: 'Card was taken',
    faceDownCard: 'Face-down card',
    table: (n) => `Table ${n}`,
    cardsRemaining: (remaining, total) => `${remaining} of ${total} cards left`,
    ownedBy: (name) => `owned by ${name}`,
    cardsLeft: (n) => `${n} cards`,
    picksThisRound: 'Picks this round',
    championLimitReplacement: 'Champion limit: replacement card',
    round: (round, maxRounds) => `Round ${round}/${maxRounds}`,
    tableN: (n) => `Table ${n}`,
    revealsRemainingTitle: 'Remaining reveals this round',
    tablesMovingOn: 'The tables are rotating…',
    clickCardHint: (n) => `Click a card on the table — you can still reveal ${n} more card${n === 1 ? '' : 's'}. Any card may be taken, even face-down.`,
    unknownIdentity: 'Unknown identity — risky pick',
    championLimitReached: "Champion limit reached — you'll get a random replacement card instead.",
    reveal: 'Reveal',
    takeCard: 'Take card',
    takeFaceDown: 'Take face-down',
    yourChoicePrefix: 'Your choice:',
    choiceSavedPlain: 'Choice saved',
    championLimitGotReplacement: 'Champion limit — you received a replacement card.',
  },
};

// Karussel-Animation: nur transform/opacity → GPU-Compositing, keine Layout-Kosten.
// Der Server hält die Übergangsphase 4s: ~2.8s Picks zeigen, dann fährt der alte Tisch
// raus (0.55s) und der neue Tisch der Folgerunde fährt rein.
const CAROUSEL_STYLE = `
@keyframes crslIn  { from { transform: translateX(70%);  opacity: 0; } to { transform: translateX(0);     opacity: 1; } }
@keyframes crslOut { from { transform: translateX(0);    opacity: 1; } to { transform: translateX(-70%);  opacity: 0; } }
.crsl-in  { animation: crslIn  0.55s cubic-bezier(0.22, 0.8, 0.3, 1)   both; }
.crsl-out { animation: crslOut 0.55s cubic-bezier(0.55, 0.1, 0.8, 0.4) both; animation-delay: 2.8s; }
`;

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
      <img src={`${CARD_CDN}${id}.png`} alt={name} className="w-full h-full object-cover"
        onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

// ── Sidebar: Decks aller Spieler, live aktualisiert (wie bei den anderen Modi) ──
function CarouselSidebar({ state, myPlayerId, t }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators    = state.players.filter(p => p.isSpectator);

  return (
    <div className="w-60 shrink-0 bg-[#16161a] border-r border-white/5 overflow-y-auto custom-scrollbar py-3 px-2.5 flex flex-col gap-3">
      {activePlayers.map(p => {
        const isMe       = p.id === myPlayerId;
        const champCount = (p.deck || []).filter(c => c.isChampion).length;
        return (
          <div key={p.id}
            className={`rounded-sm border p-3 transition-colors ${isMe ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/5 bg-[#0f0f13]'}`}>
            <div className="flex items-center gap-2 mb-2.5 min-w-0">
              <AvatarCircle id={p.avatar} color={p.color} size={30} />
              <span className="text-white text-sm font-semibold truncate flex-1">{p.name}</span>
              {isMe && <span className="text-[10px] text-cyan-500 font-bold shrink-0">{t.you}</span>}
            </div>
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
              {p.id === myPlayerId && <span className="text-[9px] text-cyan-600 shrink-0">{t.you}</span>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Status-Banner: klar sichtbar, was gerade zu tun ist ────────────────────
function CarouselStatusBanner({ state, amSpectator, iPicked, waitingFor, selectedCard, selectedSlot, t }) {
  const { phase, finished } = state;

  if (finished) return (
    <div className="shrink-0 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20 flex items-center gap-3">
      <Check size={16} className="text-green-400 shrink-0" />
      <p className="text-green-300 font-bold text-sm">{t.draftDone}</p>
    </div>
  );

  if (phase === 'transition') return (
    <div className="shrink-0 px-4 py-2.5 bg-amber-400/10 border-b border-amber-400/25 flex items-center gap-3">
      <RefreshCw size={15} className="text-amber-400 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
      <p className="text-amber-300 font-bold text-sm">{t.roundOver}</p>
    </div>
  );

  if (amSpectator) return (
    <div className="shrink-0 px-4 py-2.5 bg-[#101016] border-b border-white/5 flex items-center gap-3">
      <Eye size={15} className="text-gray-500 shrink-0" />
      <p className="text-gray-400 font-semibold text-sm">{t.spectatorOverview}</p>
    </div>
  );

  if (iPicked) return (
    <div className="shrink-0 px-4 py-2.5 bg-[#101016] border-b border-white/5 flex items-center gap-3">
      <Hourglass size={15} className="text-gray-500 shrink-0" />
      <p className="text-gray-400 font-semibold text-sm">
        {t.choiceSaved(waitingFor.length)}
      </p>
    </div>
  );

  return (
    <div className="shrink-0 px-4 py-2.5 bg-cyan-500/10 border-b border-cyan-500/30 flex items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
      <div className="min-w-0">
        <p className="text-cyan-300 font-black text-sm uppercase tracking-wide">{t.yourTurn}</p>
        <p className="text-gray-300 text-xs mt-0.5 truncate">
          {selectedSlot != null
            ? (selectedCard ? t.hintSelectedFlipped(selectedCard.name) : t.hintSelectedFaceDown)
            : t.hintNoSelection}
        </p>
      </div>
    </div>
  );
}

// ── Pick-Status aller Spieler — während der ganzen Runde sichtbar ──────────
function SeatStatusChips({ seatPlayers, hasPicked }) {
  if (!seatPlayers.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {seatPlayers.map(p => (
        <span key={p.id}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-sm border ${
            hasPicked[p.id] ? 'border-green-500/30 bg-green-500/5 text-green-400' : 'border-white/10 text-gray-500'
          }`}>
          {hasPicked[p.id] ? <Check size={11} /> : <Hourglass size={11} />}
          {p.name}
        </span>
      ))}
    </div>
  );
}

// ── Ein Kartenplatz auf dem Tisch: Lücke, verdeckte Karte oder eigene Aufdeckung ──
function TableSlot({ slot, flippedCard, isSelected, clickable, onClick, takerColor, takerName, t }) {
  if (slot.taken) {
    return (
      <div title={takerName ? t.takenBy(takerName, slot.takenRound) : t.cardTaken}
        className="aspect-square rounded-sm border border-dashed border-white/10 bg-white/[0.02] flex items-center justify-center">
        <span className="w-2 h-2 rounded-full" style={{ background: (takerColor || '#3a3a42') + 'cc' }} />
      </div>
    );
  }
  return (
    <button onClick={onClick} disabled={!clickable}
      title={flippedCard ? flippedCard.name : t.faceDownCard}
      className={`relative aspect-square rounded-sm overflow-hidden border-2 transition-colors ${
        isSelected
          ? 'border-cyan-400 ring-1 ring-cyan-400'
          : clickable
            ? 'border-white/15 hover:border-cyan-400/60 cursor-pointer'
            : 'border-white/10 cursor-default'
      }`}>
      {flippedCard ? (
        <>
          <CardImg id={flippedCard.id} name={flippedCard.name} rarity={flippedCard.rarity} />
          {flippedCard.isChampion && (
            <span className="absolute top-0.5 right-0.5 bg-black/60 rounded-[2px] p-0.5">
              <Crown size={10} className="text-cyan-400" />
            </span>
          )}
          <span className="absolute bottom-0 left-0 right-0 px-1 pb-0.5 pt-2 text-[10px] font-bold text-center truncate pointer-events-none"
            style={{ background: 'linear-gradient(transparent,#000d)', color: RARITY_COLOR[flippedCard.rarity] || '#ccc' }}>
            {flippedCard.name}
          </span>
        </>
      ) : (
        <img src={unknownCardImg} alt={t.faceDownCard} className="w-full h-full object-cover" />
      )}
    </button>
  );
}

// ── Der eigene Tisch — als abgehobenes Panel ────────────────────────────────
function CarouselTable({ table, tableNumber, flipMap, selectedSlot, canAct, onSlotClick, players, t }) {
  const remaining = table.slots.filter(s => !s.taken).length;
  const taker = (id) => players.find(p => p.id === id);
  // 8 Karten → eine Reihe, 12 → 2×6, 16 → 2×8
  const lgCols = table.slots.length === 12 ? 'lg:grid-cols-6' : 'lg:grid-cols-8';
  return (
    <div className="rounded-md border border-violet-500/30 bg-[#131020] shadow-[0_16px_40px_rgba(0,0,0,0.55)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-violet-500/10 border-b border-violet-500/20">
        <span className="text-white font-black text-base">{t.table(tableNumber)}</span>
        <span className="text-violet-300 text-xs font-semibold">{t.cardsRemaining(remaining, table.slots.length)}</span>
      </div>
      <div className="p-5 bg-[#0e0c18]">
        <div className={`grid grid-cols-4 ${lgCols} gap-3`}>
          {table.slots.map((slot, si) => (
            <TableSlot key={si} slot={slot}
              flippedCard={flipMap[si] || null}
              isSelected={selectedSlot === si}
              clickable={canAct && !slot.taken}
              onClick={() => onSlotClick(si)}
              takerColor={taker(slot.takenBy)?.color}
              takerName={taker(slot.takenBy)?.name}
              t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Zuschauer-Sicht: alle Tische im Überblick — aufgedeckte Karten sieht man live ─────
function SpectatorTables({ tables, players, t }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {tables.map((table, ti) => {
        const owner = players.find(p => p.id === table.ownerId);
        const remaining = table.slots.filter(s => !s.taken).length;
        return (
          <div key={ti} className="rounded-md border border-violet-500/25 bg-[#131020] shadow-[0_10px_28px_rgba(0,0,0,0.45)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-500/10 border-b border-violet-500/15 min-w-0">
              <span className="text-white text-sm font-bold shrink-0">{t.tableN(ti + 1)}</span>
              {owner && (
                <span className="flex items-center gap-1.5 text-[11px] text-gray-400 min-w-0">
                  <AvatarCircle id={owner.avatar} color={owner.color} size={18} />
                  <span className="truncate">{t.ownedBy(owner.name)}</span>
                </span>
              )}
              <span className="ml-auto text-[11px] text-violet-300 shrink-0">{t.cardsLeft(remaining)}</span>
            </div>
            <div className="p-4 bg-[#0e0c18]">
              <div className="grid grid-cols-4 gap-1.5">
                {table.slots.map((slot, si) => (
                  <TableSlot key={si} slot={slot} flippedCard={slot.card} clickable={false}
                    takerColor={players.find(p => p.id === slot.takenBy)?.color}
                    takerName={players.find(p => p.id === slot.takenBy)?.name}
                    t={t} />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Rundenauswertung während des Tischwechsels ──────────────────────────────
function PicksReveal({ picks, players, t }) {
  const entries = Object.entries(picks || {}).filter(([, p]) => !p.ghost && p.card);
  if (!entries.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-[#0f0f13] shadow-[0_10px_28px_rgba(0,0,0,0.45)] p-4">
      <p className="text-gray-500 text-[11px] uppercase tracking-wider mb-3 text-center">{t.picksThisRound}</p>
      <div className="flex flex-wrap justify-center gap-4">
        {entries.map(([pid, pick]) => {
          const pl = players.find(p => p.id === pid);
          return (
            <div key={pid} className="flex flex-col items-center gap-1.5 w-24">
              <div className="w-16 h-16 rounded-sm overflow-hidden border-2" style={{ borderColor: (pl?.color || '#888') + '88' }}>
                <CardImg id={pick.card.id} name={pick.card.name} rarity={pick.card.rarity} />
              </div>
              <div className="flex items-center gap-1 max-w-full">
                <AvatarCircle id={pl?.avatar} color={pl?.color} size={16} />
                <span className="text-[10px] text-gray-400 truncate">{pl?.name || '?'}</span>
              </div>
              <span className="text-[11px] text-white font-semibold text-center leading-tight truncate w-full">{pick.card.name}</span>
              {pick.wasChampionBlocked && (
                <span className="text-[9px] text-amber-400 text-center leading-tight">{t.championLimitReplacement}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function ShadowCarousel({ carouselState, myPlayerId, onFlip, onPick, lang = 'de' }) {
  const t = CAROUSEL_I18N[lang] || CAROUSEL_I18N.de;
  const [selectedSlot, setSelectedSlot] = useState(null);
  const state = carouselState;

  // Neue Runde → Auswahl zurücksetzen
  useEffect(() => { setSelectedSlot(null); }, [state?.round]);

  if (!state) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">{t.loading}</p>
    </div>
  );

  const { phase, round, maxRounds, flipLimit, myFlips = [], myPick, hasPicked = {},
    picksThisRound, tables = [], myTableIndex, timerRemaining, timerSeconds, finished } = state;

  const me          = state.players.find(p => p.id === myPlayerId);
  const amSpectator = !me || (me.isSpectator ?? false) || myTableIndex < 0;
  const myTable     = myTableIndex >= 0 ? tables[myTableIndex] : null;
  const flipsLeft   = Math.max(0, flipLimit - myFlips.length);
  const iPicked     = !!hasPicked[myPlayerId];
  const champCount  = (me?.deck || []).filter(c => c.isChampion).length;
  const flipMap     = Object.fromEntries(myFlips.map(f => [f.slotIdx, f.card]));
  // hasPicked enthält genau die Sitz-Spieler — Zuschauer/Verlassene ausblenden
  const seatPlayers = state.players.filter(p => !p.isSpectator && hasPicked[p.id] !== undefined);
  const waitingFor  = seatPlayers.filter(p => !hasPicked[p.id]);
  const timerUrgent = timerRemaining <= 10;
  const timerPct    = timerSeconds > 0 ? (timerRemaining / timerSeconds) * 100 : 100;
  const canAct      = phase === 'picking' && !amSpectator && !iPicked;

  const selectedCard      = selectedSlot != null ? (flipMap[selectedSlot] || null) : null;
  const selectedIsFlipped = selectedSlot != null && flipMap[selectedSlot] != null;

  const handleSlotClick = (si) => {
    if (!canAct) return;
    setSelectedSlot(prev => (prev === si ? null : si));
  };
  const handleFlip = () => {
    if (selectedSlot == null || flipsLeft <= 0 || selectedIsFlipped) return;
    onFlip(selectedSlot);
  };
  const handleTake = () => {
    if (selectedSlot == null) return;
    onPick(selectedSlot);
    setSelectedSlot(null);
  };

  return (
    <div className="h-full flex overflow-hidden select-none">
      <style>{CAROUSEL_STYLE}</style>
      <CarouselSidebar state={state} myPlayerId={myPlayerId} t={t} />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar: Runde, Tisch, Aufdeckungen, Timer */}
        <div className="shrink-0 bg-[#0f0f13] border-b border-white/5 px-4 py-2 flex items-center gap-4">
          <span className="text-white font-bold text-sm shrink-0">{t.round(round, maxRounds)}</span>
          {!amSpectator && myTable && (
            <span className="text-violet-300 text-xs font-semibold shrink-0">{t.tableN(myTableIndex + 1)}</span>
          )}
          <div className="flex-1" />
          {canAct && (
            <div className="flex items-center gap-1.5 border border-white/10 rounded-sm px-2.5 py-1 shrink-0"
              title={t.revealsRemainingTitle}>
              <Eye size={12} className={flipsLeft > 0 ? 'text-cyan-400' : 'text-gray-600'} />
              <span className="text-sm font-semibold text-gray-300 tabular-nums">{flipsLeft}/{flipLimit}</span>
            </div>
          )}
          {!finished && phase === 'picking' && (
            <div className={`flex items-center gap-1.5 border rounded-sm px-2.5 py-1 shrink-0 ${timerUrgent ? 'border-red-500/40 bg-red-500/5' : 'border-white/10'}`}>
              <Clock size={12} className={timerUrgent ? 'text-red-400' : 'text-gray-500'} />
              <span className={`font-mono font-bold text-sm tabular-nums ${timerUrgent ? 'text-red-400' : 'text-white'}`}>{timerRemaining}s</span>
            </div>
          )}
        </div>

        {/* Timer bar */}
        {!finished && phase === 'picking' && (
          <div className="shrink-0 h-1 bg-white/5">
            <div className={`h-full transition-all duration-1000 ${timerUrgent ? 'bg-red-500' : 'bg-cyan-400'}`}
              style={{ width: `${timerPct}%` }} />
          </div>
        )}

        {/* Status: was ist gerade zu tun? */}
        <CarouselStatusBanner state={state} amSpectator={amSpectator} iPicked={iPicked}
          waitingFor={waitingFor} selectedCard={selectedCard} selectedSlot={selectedSlot} t={t} />

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-4">

            {phase === 'transition' && (
              <>
                <PicksReveal picks={picksThisRound} players={state.players} t={t} />
                <p className="text-center text-gray-500 text-xs flex items-center justify-center gap-2">
                  <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
                  {t.tablesMovingOn}
                </p>
              </>
            )}

            {amSpectator ? (
              <SpectatorTables tables={tables} players={state.players} t={t} />
            ) : myTable ? (
              <div className="relative overflow-hidden">
                {/* key={round} remountet den Tisch pro Runde → Einfahr-Animation;
                    in der Übergangsphase fährt derselbe Tisch verzögert raus */}
                <div key={round} className={phase === 'transition' ? 'crsl-out' : 'crsl-in'}>
                  <CarouselTable
                    table={myTable}
                    tableNumber={myTableIndex + 1}
                    flipMap={flipMap}
                    selectedSlot={selectedSlot}
                    canAct={canAct}
                    onSlotClick={handleSlotClick}
                    players={state.players}
                    t={t}
                  />
                </div>
              </div>
            ) : null}

            {/* Pick-Status aller Spieler — die ganze Runde über sichtbar */}
            {phase === 'picking' && !amSpectator && (
              <SeatStatusChips seatPlayers={seatPlayers} hasPicked={hasPicked} />
            )}

            {/* Aktionsleiste: Aufdecken / Nehmen */}
            {canAct && (
              <div className="rounded-md border border-white/10 bg-[#0f0f13] shadow-[0_10px_28px_rgba(0,0,0,0.45)] p-4">
                {selectedSlot == null ? (
                  <p className="text-gray-400 text-sm text-center">
                    {t.clickCardHint(flipsLeft)}
                  </p>
                ) : (
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="w-16 h-16 rounded-sm overflow-hidden border border-white/15 shrink-0">
                      {selectedCard
                        ? <CardImg id={selectedCard.id} name={selectedCard.name} rarity={selectedCard.rarity} />
                        : <img src={unknownCardImg} alt={t.faceDownCard} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <p className="text-white text-base font-bold">{selectedCard ? selectedCard.name : t.faceDownCard}</p>
                      <p className="text-gray-500 text-xs">
                        {selectedCard ? selectedCard.rarity : t.unknownIdentity}
                      </p>
                      {selectedCard?.isChampion && champCount >= 2 && (
                        <p className="text-amber-400 text-xs mt-1">
                          {t.championLimitReached}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!selectedIsFlipped && (
                        <button onClick={handleFlip} disabled={flipsLeft <= 0}
                          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-sm border text-sm font-bold transition-colors ${
                            flipsLeft > 0
                              ? 'border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10'
                              : 'border-white/10 text-gray-600 cursor-not-allowed'
                          }`}>
                          <Eye size={14} /> {t.reveal}
                        </button>
                      )}
                      <button onClick={handleTake}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-sm bg-cyan-500 hover:bg-cyan-400 text-black text-sm font-bold transition-colors">
                        <Check size={14} /> {selectedCard ? t.takeCard : t.takeFaceDown}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Nach dem eigenen Pick: eigene Wahl */}
            {!amSpectator && iPicked && phase === 'picking' && (
              <div className="rounded-md border border-white/10 bg-[#0f0f13] shadow-[0_10px_28px_rgba(0,0,0,0.45)] p-4">
                <div className="flex items-center gap-3">
                  {myPick?.card && (
                    <div className="w-14 h-14 rounded-sm overflow-hidden border border-white/15 shrink-0">
                      <CardImg id={myPick.card.id} name={myPick.card.name} rarity={myPick.card.rarity} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold truncate">
                      {myPick?.card ? <>{t.yourChoicePrefix} <span className="text-cyan-400">{myPick.card.name}</span></> : t.choiceSavedPlain}
                    </p>
                    {myPick?.wasChampionBlocked && (
                      <p className="text-amber-400 text-xs mt-0.5">{t.championLimitGotReplacement}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
