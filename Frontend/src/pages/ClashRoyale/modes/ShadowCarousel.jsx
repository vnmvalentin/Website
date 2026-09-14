import React, { useState, useEffect } from 'react';
import { Eye, Check, Hourglass, RefreshCw } from 'lucide-react';
import unknownCardImg from '../../../assets/clashRoyale/UnknownCard.png';
import crownIcon from '../../../assets/clashRoyale/ui/crown.png';
import telescopeIcon from '../../../assets/clashRoyale/ui/equip_icons_thrower_telescope.png';
import ModeShell from './ModeShell';
import ChunkyButton from '../ui/ChunkyButton';
import { CARD_CROP } from './cardCrop';
import { GameHeader, ProgressHairline, GameSurface, GameFooter, PlayerPanel, DeckGrid } from './GameChrome';
import { cardImageUrl } from '../data/cards';

/** Akzentfarbe des Modus. */
const ACCENT = '#22d3ee';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));

const CAROUSEL_I18N = {
  de: {
    you: 'Du',
    roundLabel: 'Runde',
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
    mustRevealHint: (n) => `Erst aufdecken: noch ${n} Karte${n === 1 ? '' : 'n'}, dann darfst du nehmen.`,
    mustRevealShort: (n) => `Noch ${n}× aufdecken`,
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
    roundLabel: 'Round',
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
    mustRevealHint: (n) => `Reveal first: ${n} more card${n === 1 ? '' : 's'}, then you may take one.`,
    mustRevealShort: (n) => `Reveal ${n} more`,
    unknownIdentity: 'Unknown identity — risky pick',
    championLimitReached: "Champion limit reached — you'll get a random replacement card instead.",
    reveal: 'Reveal',
    takeCard: 'Take card',
    takeFaceDown: 'Take face-down',
    yourChoicePrefix: 'Your choice:',
    choiceSavedPlain: 'Choice saved',
    championLimitGotReplacement: 'Champion limit — you received a replacement card.',
  },
  es: {
    you: 'Tú',
    roundLabel: 'Ronda',
    loading: 'Cargando Carrusel de Sombras…',
    draftDone: '¡Draft completado!',
    roundOver: 'Ronda terminada — las mesas están rotando…',
    spectatorOverview: 'Espectador — ves todas las mesas de un vistazo.',
    choiceSaved: (n) => `Elección guardada — esperando a ${n} jugador${n === 1 ? '' : 'es'}…`,
    yourTurn: 'Es tu turno',
    hintSelectedFlipped: (name) => `"${name}" seleccionada — tómala o sigue buscando.`,
    hintSelectedFaceDown: 'Carta boca abajo seleccionada — revélala o tómala a ciegas.',
    hintNoSelection: 'Revela cartas en tu mesa y toma una — incluso boca abajo.',
    takenBy: (name, round) => `Tomada por ${name} (ronda ${round})`,
    cardTaken: 'La carta fue tomada',
    faceDownCard: 'Carta boca abajo',
    table: (n) => `Mesa ${n}`,
    cardsRemaining: (remaining, total) => `${remaining} de ${total} cartas restantes`,
    ownedBy: (name) => `de ${name}`,
    cardsLeft: (n) => `${n} cartas`,
    picksThisRound: 'Elecciones de esta ronda',
    championLimitReplacement: 'Límite de campeones: carta de reemplazo',
    round: (round, maxRounds) => `Ronda ${round}/${maxRounds}`,
    tableN: (n) => `Mesa ${n}`,
    revealsRemainingTitle: 'Revelados restantes en esta ronda',
    tablesMovingOn: 'Las mesas están rotando…',
    clickCardHint: (n) => `Haz clic en una carta de la mesa — todavía puedes revelar ${n} carta${n === 1 ? '' : 's'} más. Se puede tomar cualquier carta, incluso boca abajo.`,
    mustRevealHint: (n) => `Primero revela: ${n} carta${n === 1 ? '' : 's'} más, luego podrás tomar una.`,
    mustRevealShort: (n) => `Revelar ${n} más`,
    unknownIdentity: 'Identidad desconocida — elección arriesgada',
    championLimitReached: 'Límite de campeones alcanzado — recibirás una carta de reemplazo aleatoria.',
    reveal: 'Revelar',
    takeCard: 'Tomar carta',
    takeFaceDown: 'Tomar boca abajo',
    yourChoicePrefix: 'Tu elección:',
    choiceSavedPlain: 'Elección guardada',
    championLimitGotReplacement: 'Límite de campeones — recibiste una carta de reemplazo.',
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
      {url && <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
    </div>
  );
}

function CardImg({ id, name }) {
  return (
    // Kein FARBIGER Hintergrund (siehe entsprechenden Kommentar in SnakeRoyale.jsx) —
    // ein neutrales Dunkelgrau verhindert nur, dass das Diamant-Karo der Spielfläche
    // durch transparente Bildränder scheint.
    <div className="relative w-full h-full bg-[#0d0d14]">
      <img src={cardImageUrl(id)} alt={name} className="w-full h-full object-cover"
        style={CARD_CROP} onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

// ── Sidebar: Decks aller Spieler, live aktualisiert (wie bei den anderen Modi) ──
function CarouselSidebar({ state, myPlayerId }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators    = state.players.filter(p => p.isSpectator);

  return (
    // Rahmen (Hintergrund, Rand, Scrollen) macht ModeShell — hier nur der Inhalt.
    <>
      {activePlayers.map(p => {
        const isMe       = p.id === myPlayerId;
        const champCount = (p.deck || []).filter(c => c.isChampion).length;
        return (
          <PlayerPanel key={p.id} isMe={isMe}
            header={
              <div className="flex items-center gap-2.5 min-w-0">
                <AvatarCircle id={p.avatar} color={p.color} size={28} />
                <span className="text-white text-[13px] font-semibold truncate flex-1">{p.name}</span>
                <span className="text-white/25 text-[11px] tabular-nums shrink-0">{p.deck?.length || 0}/8</span>
              </div>
            }>
            <DeckGrid deck={p.deck || []}
              renderCard={(card) => <CardImg id={card.id} name={card.name} />} />
            <div className="flex items-center gap-1.5">
              <img src={crownIcon} alt="" width={14} height={12} className={champCount > 0 ? '' : 'opacity-15 grayscale'} />
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

// ── Status-Banner: klar sichtbar, was gerade zu tun ist ────────────────────
function CarouselStatusBanner({ state, amSpectator, iPicked, waitingFor, selectedCard, selectedSlot, t }) {
  const { phase, finished } = state;

  // Blickdicht statt eines kaum sichtbaren Weißschleiers — das Banner sitzt jetzt auf dem
  // Diamant-Karo der Spielfläche (siehe GameSurface) statt auf einer einfarbigen Fläche,
  // bei 2% Deckkraft war der Text darauf kaum noch zu lesen.
  const wrap = (children) => (
    <div className="shrink-0 px-4 sm:px-10 py-2.5 flex items-center gap-3 bg-[#111d2c] border-b-2 border-black/40">{children}</div>
  );

  if (finished) return wrap(<>
    <Check size={15} className="text-green-400 shrink-0" />
    <p className="text-green-300 font-semibold text-sm">{t.draftDone}</p>
  </>);

  if (phase === 'transition') return wrap(<>
    <RefreshCw size={14} className="text-amber-300 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
    <p className="text-amber-200 font-semibold text-sm">{t.roundOver}</p>
  </>);

  if (amSpectator) return wrap(<>
    <Eye size={14} className="text-white/30 shrink-0" />
    <p className="text-white/40 text-sm">{t.spectatorOverview}</p>
  </>);

  if (iPicked) return wrap(<>
    <Hourglass size={14} className="text-white/30 shrink-0" />
    <p className="text-white/40 text-sm">{t.choiceSaved(waitingFor.length)}</p>
  </>);

  return wrap(<>
    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
    <p className="text-cyan-300 text-sm font-semibold shrink-0">{t.yourTurn}</p>
    <p className="text-white/40 text-sm truncate">
      {selectedSlot != null
        ? (selectedCard ? t.hintSelectedFlipped(selectedCard.name) : t.hintSelectedFaceDown)
        : t.hintNoSelection}
    </p>
  </>);
}

// ── Pick-Status aller Spieler — während der ganzen Runde sichtbar ──────────
function SeatStatusChips({ seatPlayers, hasPicked }) {
  if (!seatPlayers.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {seatPlayers.map(p => (
        <span key={p.id}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
            hasPicked[p.id] ? 'bg-green-600/40 text-green-300' : 'bg-[#111d2c] text-white/45'
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
        className="aspect-square rounded-xl bg-[#0d0d14] flex items-center justify-center"
        style={{ border: '1.5px solid rgba(0,0,0,0.5)' }}>
        <span className="w-2 h-2 rounded-full" style={{ background: (takerColor || '#3a3a42') + 'cc' }} />
      </div>
    );
  }
  return (
    // Auswahl und Überfahren als INNERER Ring: Ein Rahmen verschiebt die Kachel und
    // lässt den ganzen Tisch beim Zeigen zucken.
    <button onClick={onClick} disabled={!clickable}
      title={flippedCard ? flippedCard.name : t.faceDownCard}
      className={`group relative aspect-square rounded-xl overflow-hidden shadow-[0_8px_22px_rgba(0,0,0,0.45)] ${
        clickable ? 'cursor-pointer' : 'cursor-default'
      }`}>
      {flippedCard ? (
        <>
          <CardImg id={flippedCard.id} name={flippedCard.name} />
          {flippedCard.isChampion && (
            <span className="absolute top-1.5 right-1.5 bg-black/55 backdrop-blur-sm rounded-md p-1">
              <img src={crownIcon} alt="" width={14} height={12} />
            </span>
          )}
          <span className="absolute bottom-0 left-0 right-0 px-1.5 pb-1 pt-4 text-[11px] font-semibold text-center truncate pointer-events-none text-white"
            style={{ background: 'linear-gradient(transparent,#000e)' }}>
            {flippedCard.name}
          </span>
        </>
      ) : (
        <img src={unknownCardImg} alt={t.faceDownCard} className="w-full h-full object-cover" />
      )}

      {(isSelected || clickable) && (
        <span className={`absolute inset-0 rounded-xl pointer-events-none transition-opacity ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
          style={{ boxShadow: `inset 0 0 0 2px ${ACCENT}` }} />
      )}
    </button>
  );
}

// ── Der eigene Tisch — ein hölzernes Cartoon-Möbelstück ─────────────────────
// Vorher ganz ohne Kasten ("die Karten sind der Tisch"), dazu Beschriftung und der
// Wer-hat-schon-gewählt-Status als lose Teile drumherum. Jetzt EIN Holztisch mit
// braunem Verlauf und dickem Tinten-Rand, der Beschriftung, Kartenraster UND die
// Spielerstatus-Chips gemeinsam trägt — passend zum Comic-Look von Hub/Lobby, statt
// nur Kacheln lose auf dem Diamant-Karo schweben zu lassen.
function CarouselTable({ table, tableNumber, flipMap, selectedSlot, canAct, onSlotClick, players, t, seatStatus }) {
  const remaining = table.slots.filter(s => !s.taken).length;
  const taker = (id) => players.find(p => p.id === id);
  // 8 Karten → eine Reihe, 12 → 2×6, 16 → 2×8
  // 8 Karten → 4×2 / auf breiten Schirmen eine Reihe; 12 → 6er-Reihen; 16 → 8er-Reihen.
  // sm greift schon ab ~640px (Querformat-Handys landen darüber) — ohne diese Zwischenstufe
  // blieb es bis lg (1024px, i.d.R. Tablet/Desktop) bei 4 Spalten, obwohl im Querformat
  // längst genug Breite für mehr da wäre.
  const smCols = table.slots.length >= 12 ? 'sm:grid-cols-6' : '';
  const lgCols = table.slots.length === 12 ? 'lg:grid-cols-6' : 'lg:grid-cols-8';
  return (
    <div className="rounded-[22px] p-3 sm:p-4 space-y-3"
      style={{
        background: 'linear-gradient(to bottom, #9c6b3e, #6b4423)',
        border: '4px solid var(--cr-arcade-ink)',
        boxShadow: '0 8px 0 rgba(0,0,0,0.3), 0 18px 32px rgba(0,0,0,0.4)',
      }}>
      <div className="flex items-baseline justify-between gap-3 px-3 py-1.5 rounded-lg bg-black/25">
        <span className="text-white text-xs font-bold uppercase tracking-wider">
          {t.table(tableNumber)}
        </span>
        <span className="text-white/70 text-xs">{t.cardsRemaining(remaining, table.slots.length)}</span>
      </div>
      <div className={`grid grid-cols-4 ${smCols} ${lgCols} gap-2.5 sm:gap-4`}>
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
      {seatStatus}
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
          <div key={ti} className="cr-game-card p-4 space-y-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-white/50 text-xs font-semibold uppercase tracking-wider shrink-0">
                {t.tableN(ti + 1)}
              </span>
              {owner && (
                <span className="flex items-center gap-1.5 text-[11px] text-white/40 min-w-0">
                  <AvatarCircle id={owner.avatar} color={owner.color} size={18} />
                  <span className="truncate">{t.ownedBy(owner.name)}</span>
                </span>
              )}
              <span className="ml-auto text-[11px] text-white/30 shrink-0">{t.cardsLeft(remaining)}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {table.slots.map((slot, si) => (
                <TableSlot key={si} slot={slot} flippedCard={slot.card} clickable={false}
                  takerColor={players.find(p => p.id === slot.takenBy)?.color}
                  takerName={players.find(p => p.id === slot.takenBy)?.name}
                  t={t} />
              ))}
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
    <div className="cr-game-card p-5">
      <p className="text-white/35 text-[11px] uppercase tracking-wider mb-4 text-center">{t.picksThisRound}</p>
      <div className="flex flex-wrap justify-center gap-5">
        {entries.map(([pid, pick]) => {
          const pl = players.find(p => p.id === pid);
          return (
            <div key={pid} className="flex flex-col items-center gap-2 w-28">
              <div className="w-24 h-24 rounded-xl overflow-hidden shadow-[0_8px_22px_rgba(0,0,0,0.45)]"
                style={{ boxShadow: `inset 0 0 0 2px ${(pl?.color || '#888')}aa, 0 8px 22px rgba(0,0,0,0.45)` }}>
                <CardImg id={pick.card.id} name={pick.card.name} />
              </div>
              <div className="flex items-center gap-1.5 max-w-full">
                <AvatarCircle id={pl?.avatar} color={pl?.color} size={16} />
                <span className="text-[11px] text-white/50 truncate">{pl?.name || '?'}</span>
              </div>
              <span className="text-[12px] text-white font-semibold text-center leading-tight truncate w-full">{pick.card.name}</span>
              {pick.wasChampionBlocked && (
                <span className="text-[10px] text-amber-300 text-center leading-tight">{t.championLimitReplacement}</span>
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
    picksThisRound, tables = [], myTableIndex, timerRemaining, timerSeconds, finished,
    // Pflicht-Aufdeckungen: erst schauen, dann nehmen. Der Server rechnet das aus und
    // weist einen zu frühen Pick ab — hier wird es nur sichtbar gemacht.
    canPick = true, requiredFlips = 0 } = state;

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
    if (selectedSlot == null || !canPick) return;
    onPick(selectedSlot);
    setSelectedSlot(null);
  };
  // Wie viele Aufdeckungen fehlen noch, bis genommen werden darf
  const flipsStillRequired = Math.max(0, requiredFlips - myFlips.length);

  return (
    <ModeShell
      sidebar={<CarouselSidebar state={state} myPlayerId={myPlayerId} />}
      playerCount={state.players.filter(p => !p.isSpectator).length}
      lang={lang}
      strip={<span className="text-white/40 text-[11px] truncate">{t.round(round, maxRounds)}</span>}>
      <style>{CAROUSEL_STYLE}</style>

      <GameSurface>

        {/* Kopfzeile: Runde als Anker, Tisch und Aufdeckungen leise daneben */}
        <GameHeader
          label={t.roundLabel}
          value={round}
          total={maxRounds}
          badge={!amSpectator && myTable && (
            <span className="text-white/40 text-sm">{t.tableN(myTableIndex + 1)}</span>
          )}
          right={canAct && (
            <span className="flex items-center gap-1.5 shrink-0" title={t.revealsRemainingTitle}>
              <img src={telescopeIcon} alt="" width={16} height={16} className={flipsLeft > 0 ? '' : 'opacity-30 grayscale'} />
              <span className="text-sm font-semibold text-white/60 tabular-nums">{flipsLeft}/{flipLimit}</span>
            </span>
          )}
          timerRemaining={!finished && phase === 'picking' ? timerRemaining : undefined}
          timerUrgent={timerUrgent}
        />
        {!finished && phase === 'picking' && (
          <ProgressHairline pct={timerPct} accent={ACCENT} urgent={timerUrgent} />
        )}

        {/* Status: was ist gerade zu tun? */}
        <CarouselStatusBanner state={state} amSpectator={amSpectator} iPicked={iPicked}
          waitingFor={waitingFor} selectedCard={selectedCard} selectedSlot={selectedSlot} t={t} />

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-10 py-6 sm:py-8">
          {/* Breiter als vorher (max-w-3xl): Bei 16 Karten pro Tisch waren die Kacheln
              auf einem 1440p-Schirm nur noch briefmarkengroß.
              min-h-full + justify-center hält den Tisch senkrecht in der Mitte, solange er
              hineinpasst — sonst klebte er bei einem 8er-Tisch oben und ließ darunter den
              halben Bildschirm leer. */}
          <div className="max-w-5xl mx-auto space-y-6 min-h-full flex flex-col justify-center">

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
                    // Wer hat schon gewählt: gehört an denselben Tisch statt lose darunter
                    // zu schweben — die ganze Runde über sichtbar.
                    seatStatus={phase === 'picking' && !amSpectator
                      ? <SeatStatusChips seatPlayers={seatPlayers} hasPicked={hasPicked} />
                      : null}
                  />
                </div>
              </div>
            ) : null}

          </div>
        </div>

        {/* Aktionsleiste unten festgesetzt: Vorher stand sie unter dem Tisch im
            scrollenden Bereich — bei 16 Karten musste man auf dem Handy erst scrollen,
            um überhaupt „Aufdecken" zu finden, während der Timer lief. */}
        {canAct && (
          <GameFooter>
            <div className="max-w-4xl mx-auto">
              {selectedSlot == null ? (
                <p className="text-white/40 text-sm text-center">
                  {canPick ? t.clickCardHint(flipsLeft) : t.mustRevealHint(flipsStillRequired)}
                </p>
              ) : (
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow-[0_8px_22px_rgba(0,0,0,0.45)]">
                    {selectedCard
                      ? <CardImg id={selectedCard.id} name={selectedCard.name} />
                      : <img src={unknownCardImg} alt={t.faceDownCard} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-white text-base font-semibold">{selectedCard ? selectedCard.name : t.faceDownCard}</p>
                    <p className="text-white/35 text-xs">
                      {selectedCard ? selectedCard.rarity : t.unknownIdentity}
                    </p>
                    {selectedCard?.isChampion && champCount >= 2 && (
                      <p className="text-amber-300 text-xs mt-1">{t.championLimitReached}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!selectedIsFlipped && (
                      <ChunkyButton variant="blue" size="sm" iconSrc={telescopeIcon}
                        onClick={handleFlip} disabled={flipsLeft <= 0}>
                        {t.reveal}
                      </ChunkyButton>
                    )}
                    {/* Nehmen bleibt gesperrt, bis die Pflicht-Aufdeckungen genutzt sind */}
                    <ChunkyButton variant="green" size="sm" icon={Check}
                      onClick={handleTake} disabled={!canPick}
                      title={canPick ? undefined : t.mustRevealHint(flipsStillRequired)}>
                      {canPick
                        ? (selectedCard ? t.takeCard : t.takeFaceDown)
                        : t.mustRevealShort(flipsStillRequired)}
                    </ChunkyButton>
                  </div>
                </div>
              )}
            </div>
          </GameFooter>
        )}

        {/* Nach dem eigenen Pick: die eigene Wahl bleibt sichtbar */}
        {!amSpectator && iPicked && phase === 'picking' && (
          <GameFooter>
            <div className="max-w-4xl mx-auto flex items-center gap-3">
              {myPick?.card && (
                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 shadow-[0_8px_22px_rgba(0,0,0,0.45)]">
                  <CardImg id={myPick.card.id} name={myPick.card.name} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {myPick?.card
                    ? <>{t.yourChoicePrefix} <span className="text-cyan-300">{myPick.card.name}</span></>
                    : t.choiceSavedPlain}
                </p>
                {myPick?.wasChampionBlocked && (
                  <p className="text-amber-300 text-xs mt-0.5">{t.championLimitGotReplacement}</p>
                )}
              </div>
            </div>
          </GameFooter>
        )}
      </GameSurface>
    </ModeShell>
  );
}
