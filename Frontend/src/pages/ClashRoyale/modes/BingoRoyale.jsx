import React, { useState, useMemo, useEffect } from 'react';
import { Clock, Crown, Zap, Shuffle, Gift, Search, X, Check, ArrowRight, Ban, Eye } from 'lucide-react';
import { RARITY_COLOR } from '../data/cards';
import { BINGO_ATTR_COLOR, getCardAttrs, bingoAttrLabel } from '../data/bingoAttributes';
import ModeShell from './ModeShell';
import { CARD_CROP } from './cardCrop';
import { GameHeader, ProgressHairline, GameSurface, PlayerPanel, DeckGrid } from './GameChrome';

const _ag = import.meta.glob('/src/assets/avatars/*.{png,jpg,jpeg,gif,webp,PNG,JPG,JPEG,GIF,WEBP}', { eager: true });
const AVATAR_MAP = Object.fromEntries(Object.entries(_ag).map(([p, m]) => [p.split('/').pop(), m.default]));
const CARD_CDN = 'https://cdn.royaleapi.com/static/img/cards-150/';

/** Akzentfarbe des Modus — Bingo ist golden. */
const ACCENT = '#fbbf24';

const BINGO_I18N = {
  de: {
    loading: 'Lade Bingo Royale…',
    you: 'Du',
    tokensCount: (n) => `${n} Token`,
    actingNow: 'am Zug',
    draftDone: 'Draft abgeschlossen!',
    yourTurn: 'Du bist dran',
    turnHintChoose: 'Wähle eine der verfügbaren Karten aus.',
    turnHintFreePlace: (name) => `„${name}" passt auf kein freies Feld — Feld wählen und Blockieren bestätigen.`,
    turnHintMatching: (name) => `„${name}" gewählt — lege sie auf ein blau markiertes Feld.`,
    turnOf: (name) => `${name} ist am Zug`,
    spectatorWatching: 'Du schaust zu.',
    waitYourTurn: 'Warte, bis du an der Reihe bist.',
    blockedSuffix: ' (blockiert)',
    blocked: 'Blockiert',
    clickAgain: 'Nochmal klicken',
    tradeWithPrefix: 'Tausch mit',
    rerolledPrefix: 'Karte von',
    rerolledSuffix: 'wurde rerollt',
    jokerPoolPick: 'Karte aus dem Pool ausgewählt',
    continueShortly: 'Weiter in wenigen Sekunden…',
    givenLabel: 'Abgegeben',
    receivedLabel: 'Erhalten',
    beforeLabel: 'Vorher',
    afterLabel: 'Nachher',
    replacedLabel: 'Ersetzt',
    newLabel: 'Neu',
    tokenShopTitle: 'Token-Shop',
    ownTokensLeft: (n) => `${n} eigene Token übrig`,
    live: 'Live',
    noPowerupChosen: 'Noch kein Power-Up gewählt',
    selectedCardLabel: 'ausgewählte Karte',
    tokensRemainingTotal: (n) => `${n} Token insgesamt verbleibend`,
    yourTokenShopTurn: 'Dein Zug im Token-Shop',
    tokensLeftBadge: (n) => `${n} Token übrig`,
    tokenShopIntro: 'Dir wurden 2 zufällige Power-Ups zugelost. Läuft der Timer ab, verfällt dein Token.',
    pickOwnCardSwap: 'Wähle eine deiner Karten zum Tauschen',
    tradePrefix: 'Tausche',
    tradeSuffix: 'gegen eine Karte eines Gegners',
    pickOpponentCardReroll: 'Wähle eine Karte eines Gegners zum Reroll',
    pickOwnCardJoker: 'Wähle eine deiner Karten zum Ersetzen',
    replacePrefix: 'Ersetze',
    replaceSuffix: 'durch:',
    searchCardPlaceholder: 'Karte suchen…',
    noCardsFound: 'Keine Karten gefunden',
    protectedSuffix: ' (geschützt)',
    roundOf: (round, maxRounds) => `Runde ${round}/${maxRounds}`,
    availableCardsRound: (round) => `Verfügbare Karten — Runde ${round}`,
    championLimitSuffix: ' (Champion-Limit)',
    blockWarningTitle: (name) => `„${name}" passt auf kein freies Feld deiner Bingo-Karte`,
    blockFieldPrefix: (label) => `Das Feld „${label}" wird dauerhaft blockiert und zählt für kein Bingo mehr.`,
    blockConfirmHint: 'Klicke es erneut an, um das zu bestätigen',
    blockConfirmSuffix: '— oder wähle ein anderes Feld bzw. oben eine andere Karte.',
    blockGenericBody: 'Egal wo du sie ablegst: Das Feld wird dauerhaft blockiert und zählt für kein Bingo mehr. Orange markierte Felder sind wählbar — zweimal klicken zum Bestätigen. Wenn du kein Feld opfern willst, wähle oben eine andere Karte.',
    matchesHint: (name) => `„${name}" passt — lege sie auf eines der blau markierten Felder.`,
    yourBingoCard: 'Deine Bingo-Karte',
    rowsOf10: (n) => `${n}/10 Reihen`,
    watchingBoardOf: (name) => `Board von ${name}`,
    pickPlayerToWatch: 'Wähle links einen Spieler, um sein Board zu sehen.',
  },
  en: {
    loading: 'Loading Bingo Royale…',
    you: 'You',
    tokensCount: (n) => `${n} token${n === 1 ? '' : 's'}`,
    actingNow: 'acting now',
    draftDone: 'Draft complete!',
    yourTurn: "You're up",
    turnHintChoose: 'Choose one of the available cards.',
    turnHintFreePlace: (name) => `"${name}" doesn't fit any free cell — pick a cell and confirm the block.`,
    turnHintMatching: (name) => `"${name}" selected — place it on a blue-marked cell.`,
    turnOf: (name) => `${name}'s turn`,
    spectatorWatching: "You're watching.",
    waitYourTurn: "Wait until it's your turn.",
    blockedSuffix: ' (blocked)',
    blocked: 'Blocked',
    clickAgain: 'Click again',
    tradeWithPrefix: 'Traded with',
    rerolledPrefix: "Card from",
    rerolledSuffix: 'was rerolled',
    jokerPoolPick: 'Card selected from the pool',
    continueShortly: 'Continuing in a few seconds…',
    givenLabel: 'Given',
    receivedLabel: 'Received',
    beforeLabel: 'Before',
    afterLabel: 'After',
    replacedLabel: 'Replaced',
    newLabel: 'New',
    tokenShopTitle: 'Token Shop',
    ownTokensLeft: (n) => `${n} of your own tokens left`,
    live: 'Live',
    noPowerupChosen: 'No power-up chosen yet',
    selectedCardLabel: 'selected card',
    tokensRemainingTotal: (n) => `${n} tokens remaining in total`,
    yourTokenShopTurn: 'Your turn in the Token Shop',
    tokensLeftBadge: (n) => `${n} token${n === 1 ? '' : 's'} left`,
    tokenShopIntro: 'You were randomly assigned 2 power-ups. If the timer runs out, your token is lost.',
    pickOwnCardSwap: 'Choose one of your cards to trade',
    tradePrefix: 'Trade',
    tradeSuffix: "for an opponent's card",
    pickOpponentCardReroll: "Choose an opponent's card to reroll",
    pickOwnCardJoker: 'Choose one of your cards to replace',
    replacePrefix: 'Replace',
    replaceSuffix: 'with:',
    searchCardPlaceholder: 'Search cards…',
    noCardsFound: 'No cards found',
    protectedSuffix: ' (protected)',
    roundOf: (round, maxRounds) => `Round ${round}/${maxRounds}`,
    availableCardsRound: (round) => `Available cards — round ${round}`,
    championLimitSuffix: ' (champion limit)',
    blockWarningTitle: (name) => `"${name}" doesn't fit any free cell on your bingo card`,
    blockFieldPrefix: (label) => `The cell "${label}" will be permanently blocked and won't count for any bingo.`,
    blockConfirmHint: 'Click it again to confirm',
    blockConfirmSuffix: '— or choose a different cell, or a different card above.',
    blockGenericBody: "No matter where you place it: the cell will be permanently blocked and won't count for any bingo. Orange-marked cells are selectable — click twice to confirm. If you don't want to sacrifice a cell, choose a different card above.",
    matchesHint: (name) => `"${name}" fits — place it on one of the blue-marked cells.`,
    yourBingoCard: 'Your bingo card',
    rowsOf10: (n) => `${n}/10 lines`,
    watchingBoardOf: (name) => `${name}'s board`,
    pickPlayerToWatch: 'Pick a player on the left to see their board.',
  },
};

const BINGO_LINES = [
  [0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],
  [0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],
  [0,5,10,15],[3,6,9,12],
];
const BINGO_LINE_IDS = ['row0','row1','row2','row3','col0','col1','col2','col3','diag0','diag1'];

const POWERUP_ICONS = { swap: Zap, reroll: Shuffle, joker: Gift };

const POWERUP_META_I18N = {
  de: {
    swap:   { label: 'Der Dieb',   desc: 'Tausche eine deiner Karten mit einer Karte eines Gegners.' },
    reroll: { label: 'Der Troll',  desc: 'Wähle eine Karte eines Gegners — sie wird durch eine zufällige ersetzt.' },
    joker:  { label: 'Der Planer', desc: 'Wähle eine beliebige Karte und füge sie deinem Deck hinzu.' },
  },
  en: {
    swap:   { label: 'The Thief',    desc: "Trade one of your cards for an opponent's card." },
    reroll: { label: 'The Troll',    desc: "Choose an opponent's card — it gets replaced with a random one." },
    joker:  { label: 'The Planner',  desc: 'Choose any card and add it to your deck.' },
  },
};

// Beschreibungen für die Live-Ansicht: was macht der aktive Token-Spieler gerade?
const LIVE_STEP_TEXT_I18N = {
  de: {
    choose:      'überlegt, welches Power-Up es werden soll…',
    swap_mine:   'wählt eine eigene Karte zum Tauschen…',
    swap_target: 'sucht sich eine Gegner-Karte zum Stehlen aus…',
    reroll:      'wählt eine Gegner-Karte für den Reroll…',
    joker_mine:  'wählt eine eigene Karte zum Ersetzen…',
    joker_pick:  'stöbert im Kartenpool nach einer neuen Karte…',
  },
  en: {
    choose:      'is deciding which power-up to use…',
    swap_mine:   'is choosing one of its own cards to trade…',
    swap_target: "is picking an opponent's card to steal…",
    reroll:      "is choosing an opponent's card to reroll…",
    joker_mine:  'is choosing one of its own cards to replace…',
    joker_pick:  'is browsing the card pool for a new card…',
  },
};

function getCompletedCellSet(completedLines) {
  const s = new Set();
  BINGO_LINE_IDS.forEach((id, li) => { if (completedLines.includes(id)) BINGO_LINES[li].forEach(ci => s.add(ci)); });
  return s;
}

// Karte anhand der ID im Broadcast-State finden (Decks + Restpool) — für die Live-Ansicht
function findStateCard(state, cardId) {
  for (const p of state.players) {
    const c = (p.deck || []).find(c => c.id === cardId);
    if (c) return c;
  }
  return (state.unpickedCards || []).find(c => c.id === cardId) || null;
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

function CardImg({ id, name, contain = false }) {
  return (
    // Kein eingefärbter Hintergrund mehr: Bei Artworks mit transparentem Rand
    // schimmerte er durch und legte einen farbigen Schleier über jede Karte.
    <div className="relative w-full h-full">
      <img src={`${CARD_CDN}${id}.png`} alt={name}
        className={`w-full h-full ${contain ? 'object-contain' : 'object-cover'}`}
        style={CARD_CROP} onError={e => { e.target.style.display = 'none'; }} />
    </div>
  );
}

function TimerChip({ remaining, size = 'md' }) {
  const urgent = remaining <= 10;
  return (
    <div className={`flex items-center gap-1.5 border rounded-sm px-2.5 py-1 shrink-0 ${urgent ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
      <Clock size={12} className={urgent ? 'text-red-400' : 'text-gray-500'} />
      <span className={`font-mono font-bold tabular-nums ${size === 'lg' ? 'text-base' : 'text-sm'} ${urgent ? 'text-red-400' : 'text-white'}`}>{remaining}s</span>
    </div>
  );
}

// ── Sidebar — Decks, Tokens (live) und Champion-Zähler aller Spieler ────────
function BingoSidebar({ state, myPlayerId, t, amSpectator = false, watchPlayerId, onWatchSelect }) {
  const activePlayers = state.players.filter(p => !p.isSpectator);
  const spectators    = state.players.filter(p => p.isSpectator);
  const inTokenShop   = state.phase === 'tokenShop';

  return (
    // Rahmen (Hintergrund, Rand, Scrollen) macht ModeShell — hier nur der Inhalt.
    <>
      {activePlayers.map(p => {
        const isMe       = p.id === myPlayerId;
        const isActing   = inTokenShop && state.tokenShopCurrentPlayerId === p.id;
        const isWatched  = amSpectator && watchPlayerId === p.id;
        const champCount = (p.deck || []).filter(c => c.isChampion).length;
        const tokens     = p.bingoTokensLeft ?? p.bingoTokens ?? 0;
        return (
          <PlayerPanel key={p.id} isMe={isMe || isWatched}
            className={`${amSpectator ? 'cursor-pointer' : ''} ${
              isActing ? 'ring-1 ring-inset ring-amber-400/50' : ''
            }`}
            header={
              <div onClick={amSpectator ? () => onWatchSelect?.(p.id) : undefined}
                className="flex items-center gap-2.5 min-w-0">
                <AvatarCircle id={p.avatar} color={p.color} size={28} />
                <span className="text-white text-[13px] font-semibold truncate flex-1">{p.name}</span>
                {isWatched && <Eye size={12} className="text-cyan-400 shrink-0" />}
                <span className="text-white/25 text-[11px] tabular-nums shrink-0">{p.deck?.length || 0}/8</span>
              </div>
            }>
            {/* Tokens — im Token-Shop live mitzählend, sonst nur wenn vorhanden */}
            {(tokens > 0 || inTokenShop) && (
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${
                  tokens > 0 ? 'text-amber-300 bg-amber-400/12' : 'text-white/25 bg-white/[0.04]'}`}>
                  {t.tokensCount(tokens)}
                </span>
                {isActing && <span className="text-[11px] text-amber-300 font-semibold">{t.actingNow}</span>}
              </div>
            )}
            <DeckGrid deck={p.deck || []}
              renderCard={(card) => <CardImg id={card.id} name={card.name} />} />
            <div className="flex items-center gap-1.5">
              <Crown size={11} className={champCount > 0 ? 'text-amber-300' : 'text-white/15'} />
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

// ── Zug-Banner: klar sichtbar, wer gerade dran ist ─────────────────────────
function TurnBanner({ state, myPlayerId, selectedCard, freePlace, amSpectator, t }) {
  const currentPlayer = state.players.find(p => p.id === state.currentPlayerId);
  const isMyTurn = state.currentPlayerId === myPlayerId && !amSpectator;

  // Flächig statt umrandet — der Hinweis führt, ohne als Kasten aufzufallen.
  const wrap = (children) => (
    <div className="shrink-0 px-4 sm:px-10 py-2.5 bg-white/[0.02] flex items-center gap-3">{children}</div>
  );

  if (state.finished) return wrap(<>
    <Check size={15} className="text-green-400 shrink-0" />
    <p className="text-green-300 font-semibold text-sm">{t.draftDone}</p>
  </>);

  if (isMyTurn) return wrap(<>
    <AvatarCircle id={currentPlayer?.avatar} color={currentPlayer?.color} size={32} />
    <p className="text-cyan-300 text-sm font-semibold shrink-0">{t.yourTurn}</p>
    <p className="text-white/40 text-sm truncate">
      {!selectedCard ? t.turnHintChoose
        : freePlace ? t.turnHintFreePlace(selectedCard.name)
        : t.turnHintMatching(selectedCard.name)}
    </p>
  </>);

  return wrap(<>
    <AvatarCircle id={currentPlayer?.avatar} color={currentPlayer?.color} size={32} />
    <p className="text-sm font-semibold truncate shrink-0" style={{ color: currentPlayer?.color || '#9ca3af' }}>
      {t.turnOf(currentPlayer?.name || '…')}
    </p>
    <p className="text-white/35 text-sm truncate">{amSpectator ? t.spectatorWatching : t.waitYourTurn}</p>
  </>);
}

// ── Die eigene Bingo-Karte — als abgehobenes Panel mit großen Feldern ──────
function MyBingoCard({ grid, completedLines = [], validCells, matchingCells, freePlace, pendingBlockCell, onCellClick, isMyTurn, t, lang = 'de' }) {
  const completedCells = useMemo(() => getCompletedCellSet(completedLines), [completedLines]);
  if (!grid?.length) return null;

  return (
    // Ein Quadrat, das in BEIDE Richtungen passt — die eigentlich knifflige Stelle.
    //
    // `width:100%` + `aspect-ratio` + `max-height` funktioniert NICHT: max-height kappt
    // zwar die Höhe, lässt die Breite aber stehen. Das Feld wurde dadurch breiter als
    // hoch, die Zellen (aspect-ratio:1) sprengten es und auf 1920×1080 lief die untere
    // Reihe aus dem Bild. `h-full`/`w-auto` wiederum ließ es auf dem Handy zu einem
    // Streifen zusammenfallen, weil dort die Höhe die knappe Größe ist.
    //
    // `min(100%, 100cqh)` löst beides: 100cqh ist die Höhe des Elternteils (deshalb
    // steht dort container-type: size), 100% seine Breite — es gewinnt die knappere
    // von beiden, und aspect-ratio macht daraus ein Quadrat.
    <div className="mx-auto" style={{ width: 'min(100%, 100cqh)', maxWidth: '100%', aspectRatio: '1 / 1' }}>
    <div className="grid gap-1.5 sm:gap-2.5 h-full" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)' }}>
      {grid.map((cell, ci) => {
        const isFilled    = cell.card !== null;
        const isBingo     = completedCells.has(ci);
        const isValid     = validCells.has(ci);
        const isMatching  = matchingCells.has(ci);
        const isFreeSlot  = isValid && isMyTurn && freePlace;   // Blockier-Modus
        const isPending   = isFreeSlot && pendingBlockCell === ci;
        const attrColor   = BINGO_ATTR_COLOR[cell.attrKey] || '#888';
        const label       = bingoAttrLabel(cell.attrKey, lang);
        // Liegt hier eine Karte, die das Feld-Attribut NICHT erfüllt (= blockiert)?
        const isBlocking  = isFilled && !getCardAttrs(cell.card.id).includes(cell.attrKey);

        return (
          <div key={ci}
            onClick={() => isValid && isMyTurn && !isFilled && onCellClick(ci)}
            title={isFilled ? `${cell.card.name}${isBlocking ? t.blockedSuffix : ''}` : label}
            className={`relative rounded-sm border-2 overflow-hidden transition-colors duration-100 select-none ${
              isValid && isMyTurn ? 'cursor-pointer' : 'cursor-default'
            }`}
            style={{
              aspectRatio: '1',
              borderColor: isBingo
                ? '#f59e0b'
                : isPending
                  ? '#ef4444'
                  : isBlocking
                    ? '#ef444488'
                    : isFreeSlot
                      ? '#f97316aa'
                      : isMatching && isMyTurn
                        ? '#06b6d4'
                        : isFilled
                          ? '#ffffff15'
                          : attrColor + '40',
              background: isFilled
                ? 'transparent'
                : isPending
                  ? '#ef444418'
                  : isFreeSlot
                    ? '#f9731610'
                    : attrColor + '0c',
            }}>

            {isFilled ? (
              <>
                <CardImg id={cell.card.id} name={cell.card.name} rarity={cell.card.rarity} />
                {isBingo && <div className="absolute inset-0 bg-amber-400/15 pointer-events-none" />}
                {/* Blockierte Felder klar kennzeichnen */}
                {isBlocking && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none bg-black/40">
                    <Ban size={26} className="text-red-400" strokeWidth={2.5} />
                    <span className="text-[10px] font-black text-red-400 uppercase tracking-wide">{t.blocked}</span>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-1 pt-3 text-[10px] font-bold text-center pointer-events-none truncate"
                  style={{ background: 'linear-gradient(transparent,#000d)', color: isBlocking ? '#ef4444' : attrColor }}>
                  {label}
                </div>
              </>
            ) : (
              <>
                {isValid && isMyTurn && (
                  <div className="absolute inset-0 ring-1 ring-inset pointer-events-none"
                    style={{ borderColor: isPending ? '#ef4444' : isFreeSlot ? '#f97316aa' : isMatching ? '#06b6d4' : '#ffffff22' }} />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1.5">
                  <span className="text-xs sm:text-sm font-bold text-center leading-snug w-full"
                    style={{ color: attrColor }}>
                    {label}
                  </span>
                  {isPending && (
                    <span className="text-[10px] font-black text-red-400 uppercase tracking-wide">
                      {t.clickAgain}
                    </span>
                  )}
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

// ── Kartenvergleich für die Auflösung ──────────────────────────────────────
function CardCompare({ left, right, leftLabel, rightLabel, leftColor, rightColor }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-center space-y-1">
        <div className="w-16 h-16 rounded-sm overflow-hidden border mx-auto"
          style={{ borderColor: (leftColor || '#888') + '88' }}>
          {left && <CardImg id={left.id} name={left.name} rarity={left.rarity} />}
        </div>
        <p className="text-[10px] text-gray-500 truncate max-w-[72px]">{leftLabel}</p>
        {left && <p className="text-[10px] text-white font-semibold truncate max-w-[72px]">{left.name}</p>}
      </div>
      <ArrowRight size={18} className="text-gray-600 shrink-0" />
      <div className="text-center space-y-1">
        <div className="w-16 h-16 rounded-sm overflow-hidden border mx-auto"
          style={{ borderColor: (rightColor || '#888') + '88' }}>
          {right && <CardImg id={right.id} name={right.name} rarity={right.rarity} />}
        </div>
        <p className="text-[10px] text-gray-500 truncate max-w-[72px]">{rightLabel}</p>
        {right && <p className="text-[10px] text-white font-semibold truncate max-w-[72px]">{right.name}</p>}
      </div>
    </div>
  );
}

// ── Power-Up-Auflösung ─────────────────────────────────────────────────────
function PowerupReveal({ result, players, t, lang = 'de' }) {
  if (!result) return null;
  const actor = players.find(p => p.id === result.playerId);
  const meta  = (POWERUP_META_I18N[lang] || POWERUP_META_I18N.de)[result.type] || (POWERUP_META_I18N[lang] || POWERUP_META_I18N.de).joker;
  const TypeIcon = POWERUP_ICONS[result.type] || POWERUP_ICONS.joker;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
      <div className="bg-[#16161a] border border-amber-400/30 rounded-md p-6 max-w-sm w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <AvatarCircle id={actor?.avatar} color={actor?.color} size={36} />
          <div>
            <p className="text-white font-bold text-sm">{actor?.name || '?'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <TypeIcon size={12} className="text-amber-400" />
              <span className="text-amber-400 text-sm font-semibold">{meta.label}</span>
            </div>
          </div>
        </div>

        {result.type === 'swap' && (
          <div className="space-y-2">
            <p className="text-gray-400 text-sm">
              {t.tradeWithPrefix} <span className="font-semibold" style={{ color: result.targetPlayerColor }}>{result.targetPlayerName}</span>
            </p>
            <CardCompare
              left={result.myCard}    leftLabel={t.givenLabel}  leftColor={actor?.color}
              right={result.theirCard} rightLabel={t.receivedLabel}  rightColor={result.targetPlayerColor}
            />
          </div>
        )}

        {result.type === 'reroll' && (
          <div className="space-y-2">
            <p className="text-gray-400 text-sm">
              {t.rerolledPrefix} <span className="font-semibold" style={{ color: result.targetPlayerColor }}>{result.targetPlayerName}</span> {t.rerolledSuffix}
            </p>
            <CardCompare
              left={result.oldCard} leftLabel={t.beforeLabel}  leftColor="#ef4444"
              right={result.newCard} rightLabel={t.afterLabel} rightColor="#22c55e"
            />
          </div>
        )}

        {result.type === 'joker' && (
          <div className="space-y-2">
            <p className="text-gray-400 text-sm">{t.jokerPoolPick}</p>
            <CardCompare
              left={result.oldCard} leftLabel={t.replacedLabel}   leftColor="#ef4444"
              right={result.newCard} rightLabel={t.newLabel}      rightColor="#22c55e"
            />
          </div>
        )}

        <p className="text-gray-600 text-[11px] text-center mt-4 animate-pulse">{t.continueShortly}</p>
      </div>
    </div>
  );
}

// ── Live-Ansicht: was macht der aktive Token-Spieler gerade? ───────────────
function TokenShopLive({ state, t, lang = 'de' }) {
  const live  = state.tokenShopLiveAction;
  const actor = state.players.find(p => p.id === state.tokenShopCurrentPlayerId);
  const metaDict = POWERUP_META_I18N[lang] || POWERUP_META_I18N.de;
  const meta  = live?.ability ? metaDict[live.ability] : null;
  const MetaIcon = live?.ability ? POWERUP_ICONS[live.ability] : null;
  const liveCard = live?.cardId ? findStateCard(state, live.cardId) : null;
  const stepDict = LIVE_STEP_TEXT_I18N[lang] || LIVE_STEP_TEXT_I18N.de;
  const stepText = stepDict[live?.step] || stepDict.choose;
  const remaining = (state.tokenShopQueue?.length ?? 0) - (state.tokenShopIdx ?? 0);

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#111018] border border-amber-400/25 rounded-md shadow-[0_16px_40px_rgba(0,0,0,0.55)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-amber-400/10 border-b border-amber-400/20">
          <p className="text-amber-300 text-xs font-bold uppercase tracking-widest">{t.tokenShopTitle}</p>
          {state.tokenShopSubPhase !== 'revealing' && <TimerChip remaining={state.timerRemaining} />}
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <AvatarCircle id={actor?.avatar} color={actor?.color} size={44} />
            <div className="min-w-0">
              <p className="text-white font-black text-base truncate">{actor?.name || '?'}</p>
              <p className="text-gray-500 text-xs">{t.ownTokensLeft(actor?.bingoTokensLeft ?? 0)}</p>
            </div>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {t.live}
            </span>
          </div>

          <div className="bg-[#0c0b12] border border-white/5 rounded-sm p-4 space-y-3">
            {meta ? (
              <div className="flex items-center gap-2">
                <MetaIcon size={15} className="text-amber-400" />
                <span className="text-amber-300 font-bold text-sm">{meta.label}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Gift size={15} className="text-gray-600" />
                <span className="text-gray-500 font-semibold text-sm">{t.noPowerupChosen}</span>
              </div>
            )}
            <p className="text-gray-300 text-sm leading-relaxed">{actor?.name || '?'} {stepText}</p>
            {liveCard && (
              <div className="flex items-center gap-3 pt-1">
                <div className="w-16 h-16 rounded-sm overflow-hidden border border-white/15 shrink-0">
                  <CardImg id={liveCard.id} name={liveCard.name} rarity={liveCard.rarity} />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{liveCard.name}</p>
                  <p className="text-gray-500 text-xs">{t.selectedCardLabel}</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-gray-600 text-xs text-center">{t.tokensRemainingTotal(remaining)}</p>
        </div>
      </div>
    </div>
  );
}

// ── Token-Shop (aktiver Spieler) ───────────────────────────────────────────
function TokenShop({ state, myPlayerId, onPowerup, onTokenAction, t, lang = 'de' }) {
  const [step, setStep]           = useState('choose');
  const [myDeckIdx, setMyDeckIdx] = useState(null);
  const [jokerSearch, setJokerSearch] = useState('');

  const currentTokenPlayerId = state.tokenShopCurrentPlayerId;
  const me         = state.players.find(p => p.id === myPlayerId);
  const opponents  = state.players.filter(p => !p.isSpectator && p.id !== myPlayerId);
  const unpickedCards = (state.unpickedCards || []).filter(c =>
    !jokerSearch.trim() || c.name.toLowerCase().includes(jokerSearch.toLowerCase())
  );
  const metaDict = POWERUP_META_I18N[lang] || POWERUP_META_I18N.de;
  // Nur die 2 zugelosten Power-Ups anbieten
  const myAbilities = me?.tokenAbilities?.length ? me.tokenAbilities : Object.keys(POWERUP_ICONS);

  // Neuer Token-Zug → lokale Schritte zurücksetzen
  useEffect(() => { setStep('choose'); setMyDeckIdx(null); setJokerSearch(''); }, [currentTokenPlayerId, state.tokenShopIdx]);

  const announce = (data) => onTokenAction?.(data);
  const goto = (nextStep, extra = {}) => { setStep(nextStep); announce({ step: nextStep, ...extra }); };
  const resetLocal = () => { setStep('choose'); setMyDeckIdx(null); setJokerSearch(''); };
  const backToChoose = () => { resetLocal(); announce({ step: 'choose', ability: null, cardId: null }); };

  // Pass values directly to avoid stale-closure issues with React setState
  const doSwap   = (tPid, tIdx) => { onPowerup('swap',   { myDeckIdx, targetPlayerId: tPid, theirDeckIdx: tIdx }); resetLocal(); };
  const doReroll = (tPid, tIdx) => { onPowerup('reroll', { targetPlayerId: tPid, theirDeckIdx: tIdx });            resetLocal(); };
  const doJoker  = (id)         => { onPowerup('joker',  { myDeckIdx, newCardId: id });                            resetLocal(); };

  const remaining = (state.tokenShopQueue || []).slice(state.tokenShopIdx ?? 0).filter(id => id === myPlayerId).length;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-white font-black text-lg">{t.yourTokenShopTurn}</h2>
            <span className="text-amber-400 text-sm font-bold">{t.tokensLeftBadge(remaining)}</span>
          </div>
          {state.tokenShopSubPhase !== 'revealing' && <TimerChip remaining={state.timerRemaining} size="lg" />}
        </div>
        <p className="text-gray-500 text-sm -mt-3">
          {t.tokenShopIntro}
        </p>

        {step === 'choose' && (
          <div className={`grid gap-4 ${myAbilities.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {myAbilities.map(id => {
              const Icon = POWERUP_ICONS[id];
              const { label, desc } = metaDict[id];
              return (
                <button key={id}
                  onClick={() => goto(id === 'swap' ? 'swap_mine' : id === 'reroll' ? 'reroll' : 'joker_mine', { ability: id })}
                  className="bg-[#0f0f13] hover:bg-[#1a1a20] border border-white/10 hover:border-amber-400/50 rounded-sm p-5 text-left transition-colors">
                  <Icon size={22} className="text-amber-400 mb-3" />
                  <p className="text-white font-bold text-base mb-1">{label}</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                </button>
              );
            })}
          </div>
        )}

        {step === 'swap_mine' && (
          <div className="space-y-3">
            <BackBtn onClick={backToChoose} label={t.pickOwnCardSwap} />
            <DeckPicker deck={me?.deck || []} t={t}
              onSelect={i => { setMyDeckIdx(i); goto('swap_target', { ability: 'swap', cardId: me?.deck?.[i]?.id }); }} />
          </div>
        )}

        {step === 'swap_target' && (
          <div className="space-y-4">
            <BackBtn onClick={() => goto('swap_mine', { ability: 'swap', cardId: null })}
              label={<>{t.tradePrefix} <span className="text-cyan-400">{me?.deck[myDeckIdx]?.name}</span> {t.tradeSuffix}</>} />
            {opponents.map(op => (
              <div key={op.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <AvatarCircle id={op.avatar} color={op.color} size={22} />
                  <span className="text-gray-300 text-sm font-semibold">{op.name}</span>
                </div>
                <DeckPicker deck={op.deck || []} onSelect={i => doSwap(op.id, i)} t={t} />
              </div>
            ))}
          </div>
        )}

        {step === 'reroll' && (
          <div className="space-y-4">
            <BackBtn onClick={backToChoose} label={t.pickOpponentCardReroll} />
            {opponents.map(op => (
              <div key={op.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <AvatarCircle id={op.avatar} color={op.color} size={22} />
                  <span className="text-gray-300 text-sm font-semibold">{op.name}</span>
                </div>
                <DeckPicker deck={op.deck || []} onSelect={i => doReroll(op.id, i)} t={t} />
              </div>
            ))}
          </div>
        )}

        {step === 'joker_mine' && (
          <div className="space-y-3">
            <BackBtn onClick={backToChoose} label={t.pickOwnCardJoker} />
            <DeckPicker deck={me?.deck || []} t={t}
              onSelect={i => { setMyDeckIdx(i); goto('joker_pick', { ability: 'joker', cardId: me?.deck?.[i]?.id }); }} />
          </div>
        )}

        {step === 'joker_pick' && (
          <div className="space-y-3">
            <BackBtn onClick={() => goto('joker_mine', { ability: 'joker', cardId: null })}
              label={<>{t.replacePrefix} <span className="text-cyan-400">{me?.deck[myDeckIdx]?.name}</span> {t.replaceSuffix}</>} />
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input value={jokerSearch} onChange={e => setJokerSearch(e.target.value)} placeholder={t.searchCardPlaceholder}
                className="w-full bg-[#1a1a20] border border-white/10 rounded-sm pl-8 pr-4 py-2 text-white text-sm placeholder-gray-600 focus:border-cyan-500 outline-none" />
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
              {unpickedCards.map(card => (
                <button key={card.id} onClick={() => doJoker(card.id)} title={card.name}
                  className="aspect-square rounded-sm overflow-hidden border border-white/10 hover:border-cyan-400/60 transition-colors">
                  <CardImg id={card.id} name={card.name} rarity={card.rarity} />
                </button>
              ))}
              {unpickedCards.length === 0 && <p className="text-gray-600 text-xs col-span-full py-4 text-center">{t.noCardsFound}</p>}
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
      <button onClick={onClick} className="text-gray-500 hover:text-white transition-colors shrink-0"><X size={15} /></button>
      <p className="text-white font-semibold text-sm">{label}</p>
    </div>
  );
}

function DeckPicker({ deck, onSelect, t }) {
  return (
    <div className="flex flex-wrap gap-2">
      {deck.map((card, i) => (
        <button key={i} disabled={card?.protected} onClick={() => !card?.protected && onSelect(i)}
          title={card?.name + (card?.protected ? t.protectedSuffix : '')}
          className={`relative w-16 h-16 rounded-sm overflow-hidden border-2 transition-colors ${
            card?.protected ? 'border-white/5 opacity-30 cursor-not-allowed' : 'border-white/15 hover:border-cyan-400/70 cursor-pointer'
          }`}>
          {card && <CardImg id={card.id} name={card.name} rarity={card.rarity} />}
          {card?.protected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Check size={13} className="text-green-400" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Main BingoRoyale component ─────────────────────────────────────────────
export default function BingoRoyale({ bingoState, myPlayerId, onPick, onPowerup, onTokenAction, lang = 'de' }) {
  const t = BINGO_I18N[lang] || BINGO_I18N.de;
  const [selectedCardIdx, setSelectedCardIdx] = useState(null);
  const [pendingBlockCell, setPendingBlockCell] = useState(null);

  const state = bingoState;
  const me = state?.players?.find(p => p.id === myPlayerId);
  const amSpectator = me?.isSpectator ?? false;
  const isMyTurn = state?.currentPlayerId === myPlayerId;
  const currentCards = state?.currentCards || [];
  const selectedCard = selectedCardIdx != null ? currentCards[selectedCardIdx] : null;

  // Zuschauer: welchen Spieler beobachten wir gerade? Fällt auf den aktuell
  // ziehenden Spieler zurück, wenn noch keine/keine gültige Auswahl besteht
  // (z.B. Rundenstart oder der bisher beobachtete Spieler hat verlassen).
  const [watchPlayerId, setWatchPlayerId] = useState(null);
  useEffect(() => {
    if (!amSpectator || !state?.players) return;
    const active = state.players.filter(p => !p.isSpectator);
    if (watchPlayerId && active.some(p => p.id === watchPlayerId)) return;
    const fallback = active.find(p => p.id === state.currentPlayerId) || active[0];
    setWatchPlayerId(fallback ? fallback.id : null);
  }, [amSpectator, state?.players, state?.currentPlayerId, watchPlayerId]);

  // Wohin darf die gewählte Karte? Gibt es passende freie Felder, MUSS sie dorthin —
  // sonst (freePlace) blockiert sie ein beliebiges freies Feld.
  const placement = useMemo(() => {
    const empty = { validCells: new Set(), matchingCells: new Set(), freePlace: false };
    if (!selectedCard || !me?.bingoGrid?.length || !isMyTurn) return empty;
    const cardAttrs = getCardAttrs(selectedCard.id);
    const matching = new Set();
    me.bingoGrid.forEach((cell, ci) => {
      if (cell.card === null && cardAttrs.includes(cell.attrKey)) matching.add(ci);
    });
    const valid = new Set();
    if (matching.size > 0) matching.forEach(ci => valid.add(ci));
    else me.bingoGrid.forEach((cell, ci) => { if (cell.card === null) valid.add(ci); });
    return { validCells: valid, matchingCells: matching, freePlace: matching.size === 0 };
  }, [selectedCard, me?.bingoGrid, isMyTurn]);

  // Kartenwechsel oder neue Runde → offene Blockier-Bestätigung verwerfen
  useEffect(() => { setPendingBlockCell(null); }, [selectedCardIdx, state?.round]);

  if (!state) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-gray-500 text-sm">{t.loading}</p>
    </div>
  );

  const { phase, round, maxRounds, pickedThisRound = {},
    timerRemaining, timerSeconds, finished,
    tokenShopSubPhase, lastPowerupResult } = state;

  const timerUrgent = timerRemaining <= 10;
  const timerPct    = timerSeconds > 0 ? (timerRemaining / timerSeconds) * 100 : 100;

  const handleCardClick = (idx) => {
    if (!isMyTurn || amSpectator || pickedThisRound[idx]) return;
    const card = currentCards[idx];
    if (!card) return;
    const champCount = (me?.deck || []).filter(c => c.isChampion).length;
    if (card.isChampion && champCount >= 2) return;
    setSelectedCardIdx(idx === selectedCardIdx ? null : idx);
    setPendingBlockCell(null);
  };

  const handleCellClick = (cellIdx) => {
    if (selectedCardIdx == null || !isMyTurn || amSpectator) return;
    // Blockieren nur nach ausdrücklicher Bestätigung (zweiter Klick auf dasselbe Feld)
    if (placement.freePlace && pendingBlockCell !== cellIdx) { setPendingBlockCell(cellIdx); return; }
    onPick(selectedCardIdx, cellIdx);
    setSelectedCardIdx(null);
    setPendingBlockCell(null);
  };

  // Token shop phase
  if (phase === 'tokenShop') {
    return (
      <ModeShell
        sidebar={<BingoSidebar state={state} myPlayerId={myPlayerId} t={t} />}
        playerCount={state.players.filter(p => !p.isSpectator).length}
        lang={lang}
        strip={<span className="text-white/40 text-[11px] truncate">{t.tokenShopTitle}</span>}>
        <div className="flex-1 overflow-hidden relative min-h-0">
          {state.tokenShopCurrentPlayerId === myPlayerId
            ? <TokenShop state={state} myPlayerId={myPlayerId} onPowerup={onPowerup} onTokenAction={onTokenAction} t={t} lang={lang} />
            : <TokenShopLive state={state} t={t} lang={lang} />}
          {tokenShopSubPhase === 'revealing' && lastPowerupResult && (
            <PowerupReveal result={lastPowerupResult} players={state.players} t={t} lang={lang} />
          )}
        </div>
      </ModeShell>
    );
  }

  const myTokens = me?.bingoTokensLeft ?? me?.bingoTokens ?? 0;

  const watchedPlayer = amSpectator ? state.players.find(p => p.id === watchPlayerId) : null;

  return (
    <ModeShell
      sidebar={
        <BingoSidebar state={state} myPlayerId={myPlayerId} t={t}
          amSpectator={amSpectator} watchPlayerId={watchPlayerId} onWatchSelect={setWatchPlayerId} />
      }
      playerCount={state.players.filter(p => !p.isSpectator).length}
      lang={lang}
      strip={<span className="text-white/40 text-[11px] truncate">{t.roundOf(round, maxRounds)}</span>}>

      <GameSurface>

        {/* Kopfzeile: große Rundenzahl als Anker */}
        <GameHeader
          label={lang === 'en' ? 'Round' : 'Runde'}
          value={round}
          total={maxRounds}
          timerRemaining={finished ? undefined : timerRemaining}
          timerUrgent={timerUrgent}
        />
        {!finished && <ProgressHairline pct={timerPct} accent={ACCENT} urgent={timerUrgent} />}

        {/* Wer ist dran? */}
        <TurnBanner state={state} myPlayerId={myPlayerId}
          selectedCard={selectedCard} freePlace={placement.freePlace} amSpectator={amSpectator} t={t} />

        {/* Verfügbare Karten der Runde */}
        <div className="shrink-0 px-4 sm:px-10 py-4">
          <p className="text-white/30 text-[11px] uppercase tracking-wider mb-3 text-center">{t.availableCardsRound(round)}</p>
          <div className="flex gap-4 sm:gap-5 flex-wrap justify-center">
            {currentCards.map((card, idx) => {
              const isPicked     = pickedThisRound[idx] != null;
              const pickedPlayer = isPicked ? state.players.find(p => p.id === pickedThisRound[idx]) : null;
              const isSelected   = selectedCardIdx === idx;
              const champCount   = (me?.deck || []).filter(c => c.isChampion).length;
              const champLocked  = card.isChampion && champCount >= 2;
              const isClickable  = isMyTurn && !amSpectator && !isPicked && !champLocked;

              return (
                <div key={idx} className="group">
                  {/* Deutlich größer als die früheren 96px und mit innerem Ring statt
                      Rahmen — so verspringt die Reihe beim Überfahren nicht. */}
                  <div onClick={() => isClickable && handleCardClick(idx)}
                    title={card.name + (champLocked ? t.championLimitSuffix : '')}
                    className={`relative rounded-2xl overflow-hidden shadow-[0_10px_28px_rgba(0,0,0,0.45)] w-24 h-24 sm:w-32 sm:h-32 ${
                      isPicked ? 'opacity-40 cursor-default' :
                      champLocked ? 'opacity-25 cursor-not-allowed' :
                      isClickable ? 'cursor-pointer' : 'cursor-default'
                    }`}>
                    <CardImg id={card.id} name={card.name} />
                    {card.isChampion && !isPicked && (
                      <div className="absolute top-1.5 right-1.5 bg-black/55 backdrop-blur-sm rounded-md p-1">
                        <Crown size={11} className="text-amber-300" />
                      </div>
                    )}
                    {isPicked && pickedPlayer && (
                      <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: pickedPlayer.color + '55' }} />
                    )}
                    {(isSelected || isClickable || isPicked) && (
                      <span className={`absolute inset-0 rounded-2xl pointer-events-none transition-opacity ${
                        isSelected || isPicked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                        style={{
                          boxShadow: `inset 0 0 0 2px ${
                            isPicked ? (pickedPlayer?.color || '#444') + 'cc' : ACCENT}`,
                        }} />
                    )}
                  </div>
                  <p className="text-[12px] text-white/60 text-center mt-2 truncate max-w-[8rem]">
                    {isPicked ? <span style={{ color: (pickedPlayer?.color || '#888') + 'cc' }}>{pickedPlayer?.name}</span> : card.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Eigene Bingo-Karte */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-6 flex flex-col">
          {!amSpectator && me?.bingoGrid?.length > 0 ? (
            // Ab lg dreispaltig: links eine LEERE Spalte, in der Mitte das Bingofeld,
            // rechts die Hinweise. Ohne die leere Spalte säßen Feld und Hinweise
            // gemeinsam mittig — das Feld selbst stünde dadurch nach links versetzt.
            // Unter lg stapelt alles: nebeneinander blieben vom Feld auf einem
            // 390px-Handy nur gut 100px übrig.
            // lg:grid-rows-1 ist nicht kosmetisch: Ohne definierte Zeilenhöhe richtet sich
            // die Rasterzeile nach ihrem Inhalt, das maxHeight:100% des Bingofelds hat
            // dann keinen Bezugswert und das Feld wird so hoch wie es breit ist — auf
            // 1920×1080 lief es dadurch unten aus dem Bild.
            <div className="w-full mx-auto flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_15rem] lg:grid-rows-1 gap-3 lg:gap-4">

              {/* Gegengewicht zur Hinweisspalte — hält das Feld in der Bildschirmmitte */}
              <div className="hidden lg:block" aria-hidden="true" />

              {/* Abgehobenes Board-Panel — das Board selbst skaliert per aspect-square mit,
                  damit auf niedrigeren Auflösungen (z.B. 1920×1080) kein Scrollen nötig ist,
                  die Felder aber so groß wie möglich bleiben */}
              {/* overflow-hidden MUSS bleiben: Ohne es hat der Kasten keine feste Höhe
                  mehr, das maxHeight:100% des Bingofelds greift ins Leere und die
                  unteren Reihen laufen aus dem Bild. */}
              <div className="min-w-0 min-h-0 h-full flex-1 lg:flex-none overflow-hidden flex flex-col gap-3">
                <div className="shrink-0 flex items-center justify-between gap-3">
                  <p className="text-white/40 text-xs font-semibold uppercase tracking-wider">{t.yourBingoCard}</p>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] text-white/30">{t.rowsOf10((me.completedLines || []).length)}</span>
                    {myTokens > 0 && (
                      <span className="text-amber-300 text-xs font-semibold bg-amber-400/12 px-2 py-0.5 rounded-lg">
                        {t.tokensCount(myTokens)}
                      </span>
                    )}
                  </div>
                </div>
                {/* container-type: size macht die eigene Größe für 100cqh im Bingofeld
                    messbar — siehe Erklärung in MyBingoCard. */}
                <div className="flex-1 min-h-0 flex items-center justify-center"
                  style={{ containerType: 'size' }}>
                  <MyBingoCard
                    grid={me.bingoGrid}
                    completedLines={me.completedLines || []}
                    validCells={placement.validCells}
                    matchingCells={placement.matchingCells}
                    freePlace={placement.freePlace}
                    pendingBlockCell={pendingBlockCell}
                    onCellClick={handleCellClick}
                    isMyTurn={isMyTurn && !amSpectator}
                    t={t}
                    lang={lang}
                  />
                </div>
              </div>

              {/* Hinweisspalte neben dem Feld. Die Breite ist IMMER reserviert, auch wenn
                  gerade kein Hinweis ansteht — sonst würde das Bingofeld bei jedem
                  Ein- und Ausblenden seine Größe ändern. */}
              <div className="w-full min-w-0 flex flex-col justify-center gap-3">
                {/* Deutliche Warnung, wenn die Karte ein Feld blockieren würde */}
                {selectedCard && isMyTurn && placement.freePlace && (
                  <div className="flex flex-col gap-2 bg-red-500/10 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Ban size={16} className="text-red-400 shrink-0" />
                      <p className="text-red-300 text-sm font-bold leading-snug">{t.blockWarningTitle(selectedCard.name)}</p>
                    </div>
                    <p className="text-red-200/80 text-xs leading-relaxed">
                      {pendingBlockCell != null
                        ? <>{t.blockFieldPrefix(me.bingoGrid[pendingBlockCell] ? bingoAttrLabel(me.bingoGrid[pendingBlockCell].attrKey, lang) : '?')}{' '}
                            <span className="font-bold text-red-300">{t.blockConfirmHint}</span> {t.blockConfirmSuffix}</>
                        : t.blockGenericBody}
                    </p>
                  </div>
                )}
                {selectedCard && isMyTurn && !placement.freePlace && (
                  <div className="flex flex-col gap-2 bg-cyan-500/10 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Check size={15} className="text-cyan-400 shrink-0" />
                      <p className="text-cyan-300 text-xs font-bold uppercase tracking-wider">{t.yourTurn}</p>
                    </div>
                    <p className="text-cyan-300/90 text-xs leading-relaxed">
                      {t.matchesHint(selectedCard.name)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : amSpectator ? (
            watchedPlayer?.bingoGrid?.length > 0 ? (
              <div className="max-w-3xl w-full mx-auto flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
                  <div className="shrink-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Eye size={13} className="text-cyan-400 shrink-0" />
                      <p className="text-white/40 text-xs font-semibold uppercase tracking-wider truncate">{t.watchingBoardOf(watchedPlayer.name)}</p>
                    </div>
                    <span className="text-[11px] text-white/30 shrink-0">{t.rowsOf10((watchedPlayer.completedLines || []).length)}</span>
                  </div>
                  {/* container-type: size macht die eigene Größe für 100cqh im Bingofeld
                    messbar — siehe Erklärung in MyBingoCard. */}
                <div className="flex-1 min-h-0 flex items-center justify-center"
                  style={{ containerType: 'size' }}>
                    <MyBingoCard
                      grid={watchedPlayer.bingoGrid}
                      completedLines={watchedPlayer.completedLines || []}
                      validCells={new Set()}
                      matchingCells={new Set()}
                      freePlace={false}
                      pendingBlockCell={null}
                      onCellClick={() => {}}
                      isMyTurn={false}
                      t={t}
                      lang={lang}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-white/30 text-sm">{t.pickPlayerToWatch}</p>
              </div>
            )
          ) : null}
        </div>

      </GameSurface>
    </ModeShell>
  );
}
