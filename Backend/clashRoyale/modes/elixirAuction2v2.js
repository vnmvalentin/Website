// ── Elixir Auction 2v2 ───────────────────────────────────────────────────────
// Variante von elixirAuction.js für 2 bis 4 Teams à 2 (siehe core/teams.js). Wie in der
// Solo-Auktion liegen pro Runde MEHRERE Karten aus (das geteilte Lobby-Feld cardsPerRound, hier
// "Karten pro Seite" — Default 3), und jeder Bieter gibt pro Runde EIN Gebot auf EINE Karte ab:
//
//   Phase "hint" (10s pro Karte): Slot 1 aller Teams sieht dieselben N Karten ("Seite X"),
//   Slot 2 sieht N andere Karten ("Seite Y"). Für jede Karte 2 von 4 Merkmalen (Kosten/Typ/
//   Ziel/Besonderheit, siehe buildHintTags) an den eigenen Partner schicken.
//
//   Phase "bid" (lobby.timerSeconds): Slot 2 sieht die X-Karten verdeckt, nur mit den Hinweisen
//   seines Partners, und bietet blind auf EINE davon — aus dem gemeinsamen Team-Pool.
//   Gleichzeitig bietet Slot 1 auf eine der Y-Karten. Auflösung pro Seite genau wie in der
//   Solo-Auktion (elixirAuction.js resolveAuction): pro Karte gewinnt das höchste Gebot, jeder
//   zahlt sein Gebot; wer nichts gewinnt, bekommt eine Karte, auf die niemand geboten hat, und
//   erst wenn keine passt eine Bonuskarte von außerhalb (nie ein Champion).
//
// Jeder Spieler bekommt so genau eine Karte pro Runde — 8 Runden = volles Deck. Decks bleiben
// persönlich, nur der Elixier-Pool ist pro Team geteilt.
//
// Kein Mutterhexen-System und keine "letzte Runde = alles"-Regel in dieser Variante: zwei
// Spieler teilen sich einen Pool, ein automatisches All-in beider würde ihn doppelt belasten.

const { ALL_CARDS, getCardPool, getElixirCost } = require('../core/cards');
const { getBingoCardAttrs } = require('../core/bingoAttributes');
const { lobbies, shuffle, sanitizeLobby } = require('../core/lobbies');
const { clearTurnTimer, startTurnTimer, emitTimerTick } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { teamPlayers, isDuoTeamsReady, activeTeamIds } = require('../core/teams');

const HINT_SECONDS_PER_CARD = 10;
const REVEAL_MS_BASE = 6000;
const REVEAL_MS_PER_CARD = 2500; // mehr Karten in der Auflösung -> mehr Zeit zum Lesen
const DECK_TARGET = 8; // CR-übliche Deckgröße — bestimmt, wie viele Runden gespielt werden
const CARDS_PER_SIDE_MIN = 1;
const CARDS_PER_SIDE_MAX = 8;

// Welche der vorhandenen Trait-Keys (core/bingoAttributes.js) als "Besonderheit" zählt —
// erster Treffer gewinnt. Auffälligere/seltenere Eigenschaften zuerst.
const TRAIT_PRIORITY = [
  'splash', 'swarm', 'target_buildings', 'has_evo',
  'champion', 'rarity_legendary', 'rarity_epic', 'rarity_rare', 'rarity_common',
];

// Baut IMMER genau 4 sprachneutrale Merkmals-Tag-IDs für eine Karte (z.B. "cost:5",
// "unit:ground", "target:groundAir", "trait:splash"). Bewusst OHNE Label-Text — Spieler in
// derselben Lobby können unterschiedliche UI-Sprachen haben, die Übersetzung passiert im
// Frontend (siehe hintLabels.js).
function buildHintTags(card) {
  const attrs = getBingoCardAttrs(card.id);
  const has = (k) => attrs.includes(k);
  const unit = has('type_spell') ? 'spell' : has('type_building') ? 'building' : has('move_air') ? 'air' : 'ground';
  const target = has('target_ground_air') ? 'groundAir' : 'ground';
  const trait = TRAIT_PRIORITY.find(has) || 'rarity_common';
  return [
    `cost:${getElixirCost(card.id)}`,
    `unit:${unit}`,
    `target:${target}`,
    `trait:${trait}`,
  ];
}

// Karten pro Seite (das geteilte Lobby-Feld cardsPerRound, hier als "wie viele X- bzw.
// Y-Karten liegen pro Runde aus" gelesen). Jeder bekommt eine Karte pro Runde, also immer
// DECK_TARGET Runden — mehr Karten pro Seite heißt nur mehr Auswahl, nicht mehr Karten.
function computeRoundSizing(lobby) {
  const cardsPerSide = Math.max(CARDS_PER_SIDE_MIN, Math.min(CARDS_PER_SIDE_MAX, Number(lobby.cardsPerRound) || 3));
  return { cardsPerSide, maxRounds: DECK_TARGET };
}

// Alle aktiven Team-Spieler (2 bis 4 Teams à 2) als flaches Array (Reihenfolge egal) —
// Grundlage für "haben alle abgegeben?"-Zählungen. Scheidet jemand aus (Zuschauer/verlassen),
// schrumpft das automatisch, genau wie bei den übrigen Modi.
function activeTeamPlayers(lobby) {
  return Object.values(teamPlayers(lobby)).flat().filter(Boolean);
}

// Team + Slot + Partner eines Spielers, oder null (kein Team / kein Duo).
function playerRole(lobby, playerId) {
  for (const [team, [one, two]] of Object.entries(teamPlayers(lobby))) {
    if (one?.id === playerId) return { team, slot: 1, partner: two };
    if (two?.id === playerId) return { team, slot: 2, partner: one };
  }
  return null;
}

// Spielerliste für die Clients — mit Team-Zuordnung, damit Spiel und Endbildschirm nach Teams
// gruppieren können.
function publicPlayers(lobby) {
  return lobby.players.map(p => ({
    id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
    teamId: p.teamId ?? null, teamSlot: p.teamSlot ?? null, deck: p.deck || [], isSpectator: p.isSpectator ?? false,
  }));
}

// Hinweise: hat jeder für ALLE N Karten seiner Seite abgegeben? Gebote: hat jeder sein eines
// Gebot der Runde abgegeben?
function doneCount(map) { return Object.keys(map || {}).length; }
function allHintsSent(lobby) {
  const need = lobby.game.cardsPerSide;
  return activeTeamPlayers(lobby).every(p => doneCount(lobby.game.hints[p.id]) >= need);
}
function allBidsPlaced(lobby) {
  return activeTeamPlayers(lobby).every(p => lobby.game.bids[p.id]);
}

// Individuelle Sicht EINES Spielers auf die laufende Runde (hint- oder bid-Phase).
function buildRoundStateFor(lobby, playerId) {
  const g = lobby.game;
  const role = playerRole(lobby, playerId);
  const base = {
    type: 'auction2v2',
    phase: g.phase,
    round: g.round,
    maxRounds: g.maxRounds,
    cardsPerSide: g.cardsPerSide,
    timerRemaining: g.timerRemaining,
    timerSeconds: g.phase === 'hint' ? g.hintSeconds : lobby.timerSeconds,
    teamElixir: g.teamElixir,
    teamPool: g.teamPool,
    teamIds: g.teamIds,
    finished: g.finished,
    myRole: role,
    players: publicPlayers(lobby),
  };
  if (!role || g.phase === 'reveal') return base;

  if (g.phase === 'hint') {
    const myCards = role.slot === 1 ? g.cardsX : g.cardsY;
    const myTagsByCard = role.slot === 1 ? g.hintTagsX : g.hintTagsY;
    return {
      ...base,
      myCards, myTagsByCard,
      mySentHints: g.hints[playerId] || {}, // { cardIndex: [tag, tag] }
      partnerSentCount: doneCount(g.hints[role.partner?.id]),
    };
  }
  // phase === 'bid': Slot 1 bietet auf die Y-Karten (Hinweise kamen von Slot 2), Slot 2
  // bietet auf die X-Karten (Hinweise kamen von Slot 1) — kein Kartenbild, wirklich blind.
  const partnerHints = g.hints[role.partner?.id] || {};
  return {
    ...base,
    forCard: role.slot === 1 ? 'Y' : 'X',
    partnerHintsByCard: Array.from({ length: g.cardsPerSide }, (_, i) => partnerHints[i] || []),
    myBid: g.bids[playerId] || null, // { cardIndex, amount } — ein Gebot pro Runde
  };
}

function broadcastRound2v2(lobby, io) {
  lobby.players.forEach(p => {
    io.to(p.id).emit('clash:auction2v2:round', buildRoundStateFor(lobby, p.id));
  });
}

function buildRevealPayload(lobby, resultsX, resultsY) {
  const g = lobby.game;
  return {
    type: 'auction2v2',
    phase: 'reveal',
    round: g.round, maxRounds: g.maxRounds,
    cardsPerSide: g.cardsPerSide,
    cardsX: g.cardsX, cardsY: g.cardsY,
    hintTagsX: g.hintTagsX, hintTagsY: g.hintTagsY,
    hints: g.hints, // jetzt gefahrlos für alle sichtbar — die Runde ist entschieden
    bids: g.bids,
    resultsX, resultsY,
    teamElixir: g.teamElixir,
    teamPool: g.teamPool,
    teamIds: g.teamIds,
    finished: g.finished,
    players: publicPlayers(lobby),
  };
}

// Eigener, fester Timer für die Hinweis-Phase (HINT_SECONDS_PER_CARD × Kartenzahl) — bewusst
// NICHT über core/timers.js startTurnTimer(), das an lobby.timerSeconds hängt (der
// Host-Regler gilt hier nur für die Gebot-Phase). Nutzt denselben lobby.game.timerInterval-
// Slot, clearTurnTimer() räumt ihn also genauso auf wie bei jedem anderen Modus.
function startHintTimer(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerRemaining = g.hintSeconds;
  emitTimerTick(lobby, io);
  g.timerInterval = setInterval(() => {
    // lobby.game === g: läuft die Lobby inzwischen in einem ANDEREN Spiel (Neustart +
    // sofortiger Moduswechsel/Start, während dieses Intervall noch tickt), sofort abbrechen —
    // sonst würde startBidPhase2v2() unten auf einem komplett fremden game-Objekt herumschreiben
    // (reproduziert per Bot-Testlauf: Absturz in nextRound2v2, weil g.pool auf einmal zum
    // Rush-2v2-Spiel gehörte). clearInterval genügt hier, clearTurnTimer(lobby) würde
    // fälschlich den Timer des NEUEN Spiels anfassen.
    if (lobby.game !== g) { clearInterval(g.timerInterval); return; }
    g.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: g.timerRemaining });
    if (g.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      startBidPhase2v2(lobby, io);
    }
  }, 1000);
}

function startBidPhase2v2(lobby, io) {
  const g = lobby.game;
  g.phase = 'bid';
  g.bids = {};
  broadcastRound2v2(lobby, io);
  // core/timers.js — nutzt lobby.timerSeconds und ruft bei Ablauf onTimerExpire() unten auf.
  // Das passiert dadurch NUR während der Bid-Phase, die Hint-Phase läuft komplett über den
  // eigenen Timer oben.
  startTurnTimer(lobby, io);
  scheduleBotAuctionActions(lobby, io);
}

function nextRound2v2(lobby, io) {
  const g = lobby.game;
  const need = g.cardsPerSide * 2;
  if (g.round >= g.maxRounds || g.poolIdx + need > g.pool.length) {
    endAuction2v2Game(lobby, io); return;
  }
  g.round++;
  g.phase = 'hint';
  g.cardsX = g.pool.slice(g.poolIdx, g.poolIdx + g.cardsPerSide);
  g.poolIdx += g.cardsPerSide;
  g.cardsY = g.pool.slice(g.poolIdx, g.poolIdx + g.cardsPerSide);
  g.poolIdx += g.cardsPerSide;
  g.hintTagsX = g.cardsX.map(buildHintTags);
  g.hintTagsY = g.cardsY.map(buildHintTags);
  g.hints = {};
  g.bids = {};
  broadcastRound2v2(lobby, io);
  startHintTimer(lobby, io);
  scheduleBotAuctionActions(lobby, io);
}

// Zufällige Trostkarte aus dem Rest-Pool — nie ein Champion (vermeidet, dass eine Trostkarte
// selbst am Champion-Limit scheitert), nie eine der Karten dieser Runde selbst, nie eine in
// dieser Runde schon verteilte Trostkarte (sonst könnten zwei Verlierer dieselbe bekommen).
// 1:1 dieselbe Fallback-Kette wie drawBonusCard() in elixirAuction.js.
function drawBonusCard2v2(lobby, alreadyGiven) {
  const g = lobby.game;
  const cardPool = getCardPool(lobby);
  const currentIds = new Set([...g.cardsX, ...g.cardsY].map(c => c.id));
  const givenIds = new Set(alreadyGiven.map(c => c.id));
  const pool = cardPool.filter(c => !c.isChampion && !currentIds.has(c.id) && !givenIds.has(c.id));
  if (pool.length === 0) {
    let fallback = cardPool.filter(c => !c.isChampion && !currentIds.has(c.id));
    if (!fallback.length) fallback = ALL_CARDS.filter(c => !c.isChampion && !currentIds.has(c.id));
    return fallback[Math.floor(Math.random() * Math.max(1, fallback.length))];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function resolveRound2v2(lobby, io) {
  const g = lobby.game;
  clearTurnTimer(lobby);
  g.phase = 'reveal';

  // Pro Seite bieten die passenden Slots ALLER Teams gegeneinander: Slot 2 jedes Teams auf die
  // X-Karten (Hinweise kamen von Slot 1), Slot 1 auf die Y-Karten.
  const teams = teamPlayers(lobby);
  const biddersFor = (slotIdx) => Object.entries(teams)
    .map(([team, pair]) => ({ team, player: pair[slotIdx] }))
    .filter(b => b.player);
  const bonusCardsGiven = []; // über die ganze Runde hinweg geteilt, keine Dopplung

  // Eine Seite auflösen — dieselben Regeln wie resolveAuction() der Solo-Auktion.
  const resolveSide = (cards, bidders) => {
    const bids = bidders.map(b => {
      const bid = g.bids[b.player.id];
      const cardIndex = Number.isInteger(bid?.cardIndex) ? bid.cardIndex : -1;
      return { team: b.team, playerId: b.player.id, cardIndex, amount: cardIndex >= 0 ? bid.amount : 0 };
    });
    // Jeder zahlt sein Gebot, gewonnen oder nicht
    bids.forEach(b => { g.teamElixir[b.team] = Math.max(0, (g.teamElixir[b.team] ?? 0) - b.amount); });

    // Höchstes Gebot je Karte; bei Gleichstand entscheidet das Los
    const winners = cards.map((_, i) => {
      const on = bids.filter(b => b.cardIndex === i);
      if (!on.length) return null;
      const top = Math.max(...on.map(b => b.amount));
      const tied = on.filter(b => b.amount === top);
      return tied[Math.floor(Math.random() * tied.length)].playerId;
    });

    // Trostkarten = Karten dieser Seite, auf die niemand geboten hat
    const uncontested = shuffle(cards.filter((_, i) => winners[i] === null));
    const usedConsol = new Set();
    const results = bids.map(b => {
      const player = bidders.find(x => x.player.id === b.playerId).player;
      const cantTakeChamp = (player.deck || []).filter(c => c.isChampion).length >= 2;
      const won = b.cardIndex >= 0 && winners[b.cardIndex] === b.playerId;
      let got = null;
      let isBonus = false;
      if (won) {
        const card = cards[b.cardIndex];
        // Blind geboten — das Champion-Limit kann der Bieter nicht sehen, also Sicherheitsnetz
        if (cantTakeChamp && card.isChampion) { got = drawBonusCard2v2(lobby, bonusCardsGiven); isBonus = true; }
        else got = card;
      } else {
        for (let ci = 0; ci < uncontested.length; ci++) {
          if (usedConsol.has(ci) || (cantTakeChamp && uncontested[ci].isChampion)) continue;
          got = uncontested[ci];
          usedConsol.add(ci);
          break;
        }
        if (!got) { got = drawBonusCard2v2(lobby, bonusCardsGiven); isBonus = true; }
      }
      if (isBonus) bonusCardsGiven.push(got);
      player.deck = [...(player.deck || []), got];
      return { ...b, won, got, isBonus };
    });
    return { winners, results };
  };

  const resultsX = resolveSide(g.cardsX, biddersFor(1));
  const resultsY = resolveSide(g.cardsY, biddersFor(0));

  io.to(lobby.code).emit('clash:auction2v2:reveal', buildRevealPayload(lobby, resultsX, resultsY));
  io.to(lobby.code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

  setTimeout(() => {
    // lobby.game === g (nicht nur "existiert und ist nicht finished"!) — ohne diesen
    // Identitätsvergleich würde ein verspäteter Timer aus einer VORHERIGEN Partie sonst mitten
    // in ein komplett anderes, inzwischen gestartetes Spiel hineinschreiben (reproduziert durch
    // restartLobby + sofortigen Moduswechsel während der 6s-Reveal-Pause).
    if (lobby.game !== g || g.finished) return;
    nextRound2v2(lobby, io);
  }, g.revealMs);
}

function endAuction2v2Game(lobby, io) {
  clearTurnTimer(lobby);
  lobby.game.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'elixir-auction-2v2',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false, teamId: p.teamId ?? null })),
  });
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false, teamId: p.teamId ?? null })),
  });
  notifyDraftComplete(lobby, io);
}

function startAuction2v2(lobby, io) {
  lobby.players.forEach(p => { p.deck = []; });
  const pool = lobby.teamElixirPool ?? 200;
  const teamIds = activeTeamIds(lobby);
  const { cardsPerSide, maxRounds } = computeRoundSizing(lobby);
  lobby.game = {
    type: 'auction2v2',
    pool: shuffle(getCardPool(lobby)), poolIdx: 0,
    round: 0, maxRounds,
    cardsPerSide,
    hintSeconds: HINT_SECONDS_PER_CARD * cardsPerSide,
    revealMs: REVEAL_MS_BASE + cardsPerSide * REVEAL_MS_PER_CARD,
    phase: 'hint',
    cardsX: [], cardsY: [], hintTagsX: [], hintTagsY: [],
    hints: {}, bids: {},
    teamIds,
    teamPool: pool, // Startvorrat — Maßstab für den Elixierbalken im Client
    teamElixir: Object.fromEntries(teamIds.map(id => [id, pool])),
    timerRemaining: 0, timerInterval: null,
    finished: false,
  };
  io.to(lobby.code).emit('clash:gameStart', { mode: 'elixir-auction-2v2' });
  nextRound2v2(lobby, io);
}

// Läuft eine der beiden Phasen gerade noch, aber alle verbliebenen aktiven Team-Spieler
// haben für alle ihre Karten schon abgegeben (z.B. weil jemand die Lobby verlassen/Zuschauer
// wurde und dadurch die Sollzahl gesunken ist) — dann nicht auf den Timer warten, sondern
// sofort weiter.
function maybeAdvance(lobby, io) {
  const g = lobby.game;
  if (!g || g.finished) return;
  if (!activeTeamPlayers(lobby).length) return;
  if (g.phase === 'hint' && allHintsSent(lobby)) {
    clearTurnTimer(lobby);
    startBidPhase2v2(lobby, io);
  } else if (g.phase === 'bid' && allBidsPlaced(lobby)) {
    clearTurnTimer(lobby);
    resolveRound2v2(lobby, io);
  }
}

// Kernlogik eines Hinweises — von echten Spielern (Socket-Handler unten) UND von Bots
// (scheduleBotAuctionActions) gleichermaßen genutzt, damit beide Wege exakt dieselbe
// Validierung durchlaufen. playerId ist bei einem Bot seine synthetische ID (kein Socket).
function applyAuctionHint(lobby, io, playerId, cardIndex, tagIds) {
  const g = lobby.game;
  if (!g || g.type !== 'auction2v2' || g.phase !== 'hint') return;
  const idx = Number(cardIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= g.cardsPerSide) return;
  const role = playerRole(lobby, playerId);
  if (!role) return;
  if (!g.hints[playerId]) g.hints[playerId] = {};
  if (g.hints[playerId][idx]) return; // diese Karte schon abgeschickt
  const validTags = (role.slot === 1 ? g.hintTagsX : g.hintTagsY)[idx] || [];
  // Nur echte Tags DIESER Karte zählen — zusammengeklickte IDs, die die Karte gar nicht hat,
  // werden verworfen (kein Vertrauen in den Client, gilt genauso für Bot-Eingaben).
  const chosen = Array.isArray(tagIds) ? [...new Set(tagIds)].filter(id => validTags.includes(id)) : [];
  if (chosen.length !== 2) return;
  g.hints[playerId][idx] = chosen;

  if (allHintsSent(lobby)) {
    clearTurnTimer(lobby);
    startBidPhase2v2(lobby, io);
  } else {
    // WICHTIG: dem Absender (und allen anderen) die eigene, aktualisierte Sicht erneut
    // zuschicken — sonst weiß der Client, der gerade EINE von mehreren Karten abgeschickt
    // hat, nichts davon (mySentHints bliebe auf seinem alten Stand hängen), die "nächste
    // offene Karte"-Automatik in useAuction2v2View.js würde nie weiterspringen, und ein
    // erneuter Klick auf "Hinweis senden" liefe ins Leere (Server verwirft den Zweitversuch
    // stillschweigend, siehe die "schon abgeschickt"-Prüfung oben) — genau der gemeldete Bug
    // ("Hinweis senden tut nichts" nach der ersten von mehreren Karten).
    broadcastRound2v2(lobby, io);
    // Fortschritt zusätzlich als schlanke Zusammenfassung, ohne die Auswahl selbst zu
    // verraten (die geht nur an den Partner) — für eine mögliche "X/Y Spieler fertig"-Anzeige.
    const total = activeTeamPlayers(lobby).length;
    const done = activeTeamPlayers(lobby).filter(p => doneCount(g.hints[p.id]) >= g.cardsPerSide).length;
    io.to(lobby.code).emit('clash:auction2v2:hintProgress', { pendingCount: done, total });
  }
}

// Kernlogik eines Gebots — siehe applyAuctionHint, dasselbe Prinzip. Ein Gebot pro Runde.
function applyAuctionBid(lobby, io, playerId, cardIndex, amount) {
  const g = lobby.game;
  if (!g || g.type !== 'auction2v2' || g.phase !== 'bid') return;
  const idx = Number(cardIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= g.cardsPerSide) return;
  const role = playerRole(lobby, playerId);
  if (!role) return;
  if (g.bids[playerId]) return; // schon geboten
  const pool = g.teamElixir[role.team] ?? 0;
  g.bids[playerId] = { cardIndex: idx, amount: Math.max(0, Math.min(pool, Math.round(Number(amount) || 0))) };

  if (allBidsPlaced(lobby)) {
    clearTurnTimer(lobby);
    resolveRound2v2(lobby, io);
  } else {
    // Ohne diesen Broadcast bliebe myBid beim Absender auf dem alten Stand
    broadcastRound2v2(lobby, io);
    const players = activeTeamPlayers(lobby);
    io.to(lobby.code).emit('clash:auction2v2:bidProgress', { pendingCount: players.filter(p => g.bids[p.id]).length, total: players.length });
  }
}

// Test-Bots spielen sich selbst: für jede ihrer cardsPerSide Karten wird nach einer kleinen
// zufälligen Wartezeit applyAuctionHint/applyAuctionBid aufgerufen — dieselbe Funktion, die auch
// ein echter Klick auslösen würde. g wird als Objekt-Referenz "eingefroren" und vor der
// Ausführung per Identität (lobby.game === g) erneut geprüft: läuft die Runde inzwischen weiter
// ODER wurde die Lobby zwischenzeitlich neu gestartet/auf einen anderen Modus umgestellt (ein
// NEUES game-Objekt), verfällt der verspätete Bot-Zug stillschweigend, statt in ein fremdes
// Spiel hineinzuschreiben. Ein reiner round/phase-Wertevergleich reicht dafür NICHT — ein
// komplett anderes Spiel könnte zufällig dieselben Werte tragen (z.B. auch round 1).
function scheduleBotAuctionActions(lobby, io) {
  const g = lobby.game;
  const phaseToken = g.phase;
  activeTeamPlayers(lobby).filter(p => p.isBot).forEach(bot => {
    const role = playerRole(lobby, bot.id);
    if (!role) return;
    const actions = phaseToken === 'hint' ? g.cardsPerSide : 1;
    for (let n = 0; n < actions; n++) {
      const idx = phaseToken === 'hint' ? n : Math.floor(Math.random() * g.cardsPerSide);
      const delay = 600 + Math.random() * (phaseToken === 'hint' ? 2800 : 2200);
      setTimeout(() => {
        if (lobby.game !== g || g.phase !== phaseToken) return;
        if (phaseToken === 'hint') {
          const tags = (role.slot === 1 ? g.hintTagsX : g.hintTagsY)[idx];
          if (!tags) return;
          const shuffled = [...tags].sort(() => Math.random() - 0.5);
          applyAuctionHint(lobby, io, bot.id, idx, shuffled.slice(0, 2));
        } else {
          const pool = g.teamElixir[role.team] ?? 0;
          const amount = Math.round(Math.random() * Math.min(pool, 30));
          applyAuctionBid(lobby, io, bot.id, idx, amount);
        }
      }, delay);
    }
  });
}

registerMode({
  id: 'elixir-auction-2v2',
  gameType: 'auction2v2',
  partyModes: ['duo'],
  settings: {
    teamElixirPool: {
      default: 200,
      event: 'clash:setTeamElixirPool',
      payloadKey: 'amount',
      sanitize: (v) => Math.max(20, Math.min(2000, Number(v) || 200)),
    },
  },
  requiredPool: (lobby) => {
    const { cardsPerSide, maxRounds } = computeRoundSizing(lobby);
    return maxRounds * cardsPerSide * 2;
  },
  canStart: (lobby) => (isDuoTeamsReady(lobby) ? null : { key: 'teamsNotReady' }),
  start: (lobby, io) => startAuction2v2(lobby, io),
  buildState: (lobby, socket) => ({ event: 'clash:auction2v2:round', payload: buildRoundStateFor(lobby, socket.id) }),
  remapPlayerId: (game, oldId, newId) => {
    if (game.hints?.[oldId]) { game.hints[newId] = game.hints[oldId]; delete game.hints[oldId]; }
    if (game.bids?.[oldId]) { game.bids[newId] = game.bids[oldId]; delete game.bids[oldId]; }
  },
  // Feuert nur während der Bid-Phase (die Hint-Phase hat ihren eigenen Timer oben, der nie
  // über die Registry läuft).
  onTimerExpire: (lobby, io) => resolveRound2v2(lobby, io),
  onPlayerLeft: (lobby, io) => maybeAdvance(lobby, io),
  onPlayerDisconnected: (lobby, io) => maybeAdvance(lobby, io),
  onSpectatorChanged: (lobby, io) => maybeAdvance(lobby, io),
  socketHandlers: {
    'clash:auction2v2:hint': ({ socket, io }, { code, cardIndex, tagIds }) => {
      const lobby = lobbies.get(code);
      if (!lobby) return;
      applyAuctionHint(lobby, io, socket.id, cardIndex, tagIds);
    },
    'clash:auction2v2:bid': ({ socket, io }, { code, cardIndex, amount }) => {
      const lobby = lobbies.get(code);
      if (!lobby) return;
      applyAuctionBid(lobby, io, socket.id, cardIndex, amount);
    },
  },
});
