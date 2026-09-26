// ── Schatten Karussel ────────────────────────────────────────────────────────
// N Spieler = N Tische mit je 8/12/16 verdeckten, global einzigartigen Karten. Alle Spieler
// wählen gleichzeitig: pro Runde je nach Aufdecksystem 1-2 Karten am eigenen Tisch aufdecken
// und dann eine beliebige Karte nehmen — auch verdeckt. Danach wandern die Tische reihum
// weiter zum nächsten Spieler.

const { ALL_CARDS, getCardPool } = require('../core/cards');
const { lobbies, shuffle, sanitizeLobby } = require('../core/lobbies');
const { clearTurnTimer, emitTimerTick } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { emitClashError } = require('../core/errors');

const CAROUSEL_DECK_SIZE = 8;
const CAROUSEL_TABLE_SIZES = [8, 12, 16];
const CAROUSEL_REVEAL_MODES = ['dynamic', 'one', 'two'];
const CAROUSEL_TRANSITION_MS = 4000;

// Kartenpool begrenzt die Tischanzahl: z.B. 122 Karten bei 16 pro Tisch → max. 7 Spieler
function carouselMaxPlayers(cardsPerTable, poolSize = ALL_CARDS.length) {
  return Math.floor(poolSize / cardsPerTable);
}

function carouselFlipLimit(g) {
  if (g.revealMode === 'one') return 1;
  if (g.revealMode === 'two') return 2;
  // dynamisch (Standard): Runden 1-4 → 2 Aufdeckungen, ab Runde 5 → nur noch 1
  return g.round <= 4 ? 2 : 1;
}

// Wie viele Aufdeckungen muss ein Spieler verbraucht haben, bevor er nehmen darf?
//
// Vorher durfte man sofort blind zugreifen und seine Aufdeckungen liegen lassen. Das war
// nie die bessere Wahl, aber es ließ die Runde in einer Sekunde vorbei sein und nahm dem
// Modus seinen Kern — erst schauen, dann entscheiden. Jetzt sind die Aufdeckungen Pflicht;
// das Risiko bleibt trotzdem, denn genommen werden darf danach jede Karte, auch verdeckte.
//
// Am Rundenende können weniger freie Plätze übrig sein als Aufdeckungen zustehen — dann
// zählt nur, was überhaupt möglich ist, sonst wäre der Tisch blockiert.
function carouselRequiredFlips(g, table) {
  const free = table ? table.slots.filter(s => !s.taken).length : 0;
  return Math.min(carouselFlipLimit(g), free);
}

// Runde 1: Sitz i → Tisch i. Jede weitere Runde wandert jeder Tisch einen Sitz weiter.
function carouselTableForSeat(seatIdx, round, numTables) {
  return ((seatIdx - (round - 1)) % numTables + numTables) % numTables;
}

function getCarouselTable(g, playerId) {
  const seat = g.seats.indexOf(playerId);
  if (seat === -1) return { seat: -1, tableIdx: -1, table: null };
  const tableIdx = carouselTableForSeat(seat, g.round, g.tables.length);
  return { seat, tableIdx, table: g.tables[tableIdx] };
}

// Ersatzkarte für Spieler am Champion-Limit: zufällige, noch nirgends vergebene Nicht-Champion-Karte
function drawCarouselReplacement(lobby) {
  const g = lobby.game;
  const usedIds = new Set([
    ...g.tables.flatMap(t => t.slots.map(s => s.card.id)),
    ...lobby.players.flatMap(p => (p.deck || []).map(c => c.id)),
    ...g.extraCardsGiven.map(c => c.id),
  ]);
  const cardPool = getCardPool(lobby);
  let pool = cardPool.filter(c => !c.isChampion && !usedIds.has(c.id));
  if (!pool.length) pool = cardPool.filter(c => !c.isChampion);
  if (!pool.length) pool = ALL_CARDS.filter(c => !c.isChampion);
  const card = pool[Math.floor(Math.random() * pool.length)];
  g.extraCardsGiven.push(card);
  return card;
}

// Zuschauer sind keine Mitspieler — welcher Sitz sitzt diese Runde an Tisch `tableIdx`,
// und was hat der (der einzige, der dort aufdecken darf) diese Runde aufgedeckt?
function tableOccupantFlips(g, tableIdx) {
  const N = g.tables.length;
  const seatIdx = g.seats.findIndex((_, s) => carouselTableForSeat(s, g.round, N) === tableIdx);
  if (seatIdx === -1) return [];
  return g.flipsThisRound[g.seats[seatIdx]] || [];
}

function buildCarouselState(lobby, viewerId, { spectator = false } = {}) {
  const g = lobby.game;
  const N = g.tables.length;
  const myFlips = g.flipsThisRound[viewerId] || [];
  const viewerSeat = g.seats.indexOf(viewerId);
  const viewerTableIdx = viewerSeat >= 0 ? carouselTableForSeat(viewerSeat, g.round, N) : -1;

  return {
    type: 'shadow-carousel',
    phase: g.phase,
    round: g.round,
    maxRounds: g.maxRounds,
    cardsPerTable: g.cardsPerTable,
    revealMode: g.revealMode,
    flipLimit: carouselFlipLimit(g),
    // Pflicht-Aufdeckungen des Betrachters und ob er damit schon nehmen darf — der Client
    // soll die Regel anzeigen, aber nicht selbst nachrechnen müssen.
    requiredFlips: carouselRequiredFlips(g, viewerTableIdx >= 0 ? g.tables[viewerTableIdx] : null),
    canPick: myFlips.length >= carouselRequiredFlips(g, viewerTableIdx >= 0 ? g.tables[viewerTableIdx] : null),
    myTableIndex: viewerTableIdx,
    myFlips,
    myPick: g.picksThisRound[viewerId] || null,
    hasPicked: Object.fromEntries(g.seats.map(id => [id, !!g.picksThisRound[id]])),
    // Picks werden erst beim Rundenübergang für alle sichtbar
    picksThisRound: (g.phase === 'transition' || g.phase === 'finished') ? g.picksThisRound : {},
    tables: g.tables.map((table, ti) => ({
      ownerId: g.seats[(ti + g.round - 1) % N] ?? null,
      slots: table.slots.map((s, si) => ({
        taken: s.taken,
        takenBy: s.takenBy,
        takenRound: s.takenRound,
        // Kartenidentität für eigene, in dieser Runde aufgedeckte Karten — Zuschauer sehen
        // zusätzlich jede Aufdeckung an jedem Tisch live (keine Mitspieler, keine Geheimhaltung nötig)
        card: ((ti === viewerTableIdx && myFlips.some(f => f.slotIdx === si))
            || (spectator && tableOccupantFlips(g, ti).some(f => f.slotIdx === si)))
          ? s.card : null,
      })),
    })),
    timerRemaining: g.timerRemaining,
    timerSeconds: lobby.timerSeconds,
    finished: g.finished,
    // Frisch in dieser Runde gepickte Karte erst beim Rundenübergang in fremden Decks zeigen
    // (sonst reicht Warten + Sidebar-Beobachtung, um den Pick der Gegner vorab zu sehen)
    players: lobby.players.map(p => {
      const deck = p.deck || [];
      const pickedThisRound = g.picksThisRound[p.id];
      const hideLatestPick = g.phase === 'picking' && p.id !== viewerId && pickedThisRound && !pickedThisRound.ghost;
      return {
        id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
        deck: hideLatestPick ? deck.slice(0, -1) : deck,
        isSpectator: p.isSpectator ?? false,
      };
    }),
  };
}

// Jeder Spieler bekommt seine individuelle Sicht — eigene Aufdeckungen bleiben privat.
// Zuschauer bekommen stattdessen die Live-Reveal-Sicht (siehe tableOccupantFlips).
function broadcastCarouselState(lobby, io) {
  lobby.players.forEach(p => {
    io.to(p.id).emit('clash:carousel:state', buildCarouselState(lobby, p.id, { spectator: !!p.isSpectator }));
  });
}

function startShadowCarousel(lobby, io) {
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const cardsPerTable = CAROUSEL_TABLE_SIZES.includes(lobby.carouselCardsPerTable)
    ? lobby.carouselCardsPerTable : 8;
  const revealMode = CAROUSEL_REVEAL_MODES.includes(lobby.carouselRevealMode)
    ? lobby.carouselRevealMode : 'dynamic';
  const pool = shuffle(getCardPool(lobby));
  const tables = activePlayers.map((_, t) => ({
    slots: pool
      .slice(t * cardsPerTable, (t + 1) * cardsPerTable)
      .map(card => ({ card, taken: false, takenBy: null, takenRound: null })),
  }));
  lobby.players.forEach(p => { p.deck = []; });
  lobby.game = {
    type: 'shadow-carousel',
    tables,
    cardsPerTable,
    revealMode,
    seats: activePlayers.map(p => p.id),
    round: 1,
    maxRounds: CAROUSEL_DECK_SIZE,
    phase: 'picking',
    flipsThisRound: {},   // playerId → [{ slotIdx, card }]
    picksThisRound: {},   // playerId → { tableIndex, slotIdx, card, wasChampionBlocked }
    extraCardsGiven: [],
    timerRemaining: lobby.timerSeconds,
    timerInterval: null,
    finished: false,
  };
  io.to(lobby.code).emit('clash:gameStart', { mode: 'shadow-carousel' });
  broadcastCarouselState(lobby, io);
  startCarouselTimer(lobby, io);
}

function startCarouselTimer(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerRemaining = lobby.timerSeconds;
  emitTimerTick(lobby, io);
  g.timerInterval = setInterval(() => {
    g.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: g.timerRemaining });
    if (g.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      autoPickCarousel(lobby, io);
    }
  }, 1000);
}

// Kern-Pick ohne Broadcast/Abschlussprüfung — wird von Hand- und Auto-Picks genutzt
function doCarouselPick(lobby, player, slotIdx) {
  const g = lobby.game;
  const { tableIdx, table } = getCarouselTable(g, player.id);
  if (!table) return false;
  const slot = table.slots[slotIdx];
  if (!slot || slot.taken) return false;

  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  const blocked = slot.card.isChampion && champCount >= 2;
  const got = blocked ? drawCarouselReplacement(lobby) : slot.card;

  slot.taken = true;
  slot.takenBy = player.id;
  slot.takenRound = g.round;
  player.deck = [...(player.deck || []), got];
  g.picksThisRound[player.id] = { tableIndex: tableIdx, slotIdx, card: got, wasChampionBlocked: blocked };
  return true;
}

// Timer abgelaufen: alle fehlenden Picks zufällig (blind) ausführen
function autoPickCarousel(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'shadow-carousel' || g.phase !== 'picking') return;
  g.seats.forEach(id => {
    if (g.picksThisRound[id]) return;
    const player = lobby.players.find(p => p.id === id);
    if (!player || player.isSpectator) return; // Geister-Sitze räumt die Abschlussprüfung ab
    const { table } = getCarouselTable(g, id);
    const avail = table ? table.slots.map((s, i) => ({ s, i })).filter(({ s }) => !s.taken) : [];
    if (!avail.length) return;
    doCarouselPick(lobby, player, avail[Math.floor(Math.random() * avail.length)].i);
  });
  broadcastCarouselState(lobby, io);
  checkCarouselRoundComplete(lobby, io);
}

function checkCarouselRoundComplete(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'shadow-carousel' || g.phase !== 'picking') return;
  const pending = g.seats.some(id => {
    const p = lobby.players.find(pl => pl.id === id);
    if (!p || p.isSpectator) return false; // verlassene/zuschauende Sitze blockieren die Runde nicht
    return !g.picksThisRound[id];
  });
  if (pending) return;

  // Tische von Geister-Sitzen trotzdem um eine Karte reduzieren, damit alle Tische synchron leer werden
  g.seats.forEach((id, seat) => {
    if (g.picksThisRound[id]) return;
    const tableIdx = carouselTableForSeat(seat, g.round, g.tables.length);
    const avail = g.tables[tableIdx].slots.map((s, i) => ({ s, i })).filter(({ s }) => !s.taken);
    if (!avail.length) return;
    const { s, i } = avail[Math.floor(Math.random() * avail.length)];
    s.taken = true; s.takenBy = id; s.takenRound = g.round;
    g.picksThisRound[id] = { tableIndex: tableIdx, slotIdx: i, card: null, ghost: true };
  });

  clearTurnTimer(lobby);
  g.phase = 'transition';
  broadcastCarouselState(lobby, io);
  io.to(lobby.code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

  setTimeout(() => {
    const l = lobbies.get(lobby.code);
    if (!l?.game || l.game.type !== 'shadow-carousel' || l.game.finished || l.game.phase !== 'transition') return;
    nextCarouselRound(l, io);
  }, CAROUSEL_TRANSITION_MS);
}

function nextCarouselRound(lobby, io) {
  const g = lobby.game;
  if (g.round >= g.maxRounds) { endCarouselGame(lobby, io); return; }
  g.round++;
  g.flipsThisRound = {};
  g.picksThisRound = {};
  g.phase = 'picking';
  broadcastCarouselState(lobby, io);
  startCarouselTimer(lobby, io);
}

function endCarouselGame(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.phase = 'finished';
  g.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'shadow-carousel',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  broadcastCarouselState(lobby, io);
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// Reconnect vergibt eine neue socket.id — alle Karussel-Referenzen auf die alte ID umhängen
function remapCarouselPlayerId(g, oldId, newId) {
  const seat = g.seats.indexOf(oldId);
  if (seat !== -1) g.seats[seat] = newId;
  if (g.flipsThisRound[oldId]) { g.flipsThisRound[newId] = g.flipsThisRound[oldId]; delete g.flipsThisRound[oldId]; }
  if (g.picksThisRound[oldId]) { g.picksThisRound[newId] = g.picksThisRound[oldId]; delete g.picksThisRound[oldId]; }
  g.tables.forEach(t => t.slots.forEach(s => { if (s.takenBy === oldId) s.takenBy = newId; }));
}

registerMode({
  id: 'shadow-carousel',
  gameType: 'shadow-carousel',
  settings: {
    carouselCardsPerTable: {
      default: 8,
      event: 'clash:setCarouselCards',
      payloadKey: 'count',
      sanitize: (v, lobby) => {
        const n = Number(v);
        if (!CAROUSEL_TABLE_SIZES.includes(n)) return undefined;
        if (Math.floor(getCardPool(lobby).length / n) < 2) return undefined; // nicht mal 2 Tische möglich
        return n;
      },
    },
    carouselRevealMode: {
      default: 'dynamic',
      event: 'clash:setCarouselReveal',
      payloadKey: 'mode',
      sanitize: (v) => (CAROUSEL_REVEAL_MODES.includes(v) ? v : undefined),
    },
  },
  requiredPool: (lobby, active) => active * (lobby.carouselCardsPerTable || 8),
  // Der Pool begrenzt zusätzlich die Tischanzahl (z.B. 16 Karten/Tisch → max. 7 Spieler).
  // Rückgabe ist ein Fehlerschlüssel mit Platzhaltern (siehe core/errors.js), kein fertiger
  // Satz — der Client ist zweisprachig und übersetzt selbst.
  canStart: (lobby, poolSize) => {
    const activeCount = lobby.players.filter(p => !p.isSpectator).length;
    const perTable = lobby.carouselCardsPerTable || 8;
    const maxP = carouselMaxPlayers(perTable, poolSize);
    return activeCount > maxP
      ? { key: 'carouselTooManyPlayers', params: { perTable, maxPlayers: maxP, poolSize } }
      : null;
  },
  start: (lobby, io) => startShadowCarousel(lobby, io),
  buildState: (lobby, socket) => ({ event: 'clash:carousel:state', payload: buildCarouselState(lobby, socket.id) }),
  remapPlayerId: (game, oldId, newId) => remapCarouselPlayerId(game, oldId, newId),
  onPlayerLeft: (lobby, io) => {
    broadcastCarouselState(lobby, io);
    checkCarouselRoundComplete(lobby, io);
  },
  // Der neue Zuschauer war vielleicht der letzte fehlende Pick der Runde
  onSpectatorChanged: (lobby, io) => {
    if (lobby.game?.phase !== 'picking') return;
    broadcastCarouselState(lobby, io);
    checkCarouselRoundComplete(lobby, io);
  },
  socketHandlers: {
    // ── Schatten-Karussel events ───────────────────────────────────────────────
    'clash:carousel:flip': ({ socket, io }, { code, slotIdx }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'shadow-carousel' || lobby.game.phase !== 'picking') return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      if (g.picksThisRound[socket.id]) return; // nach dem eigenen Pick kein Aufdecken mehr
      const { table } = getCarouselTable(g, socket.id);
      if (!table || typeof slotIdx !== 'number') return;
      const slot = table.slots[slotIdx];
      if (!slot || slot.taken) return;
      const flips = g.flipsThisRound[socket.id] || (g.flipsThisRound[socket.id] = []);
      if (flips.some(f => f.slotIdx === slotIdx)) return; // bereits aufgedeckt
      if (flips.length >= carouselFlipLimit(g)) {
        return emitClashError(socket, 'noRevealsLeft');
      }
      flips.push({ slotIdx, card: slot.card });
      // Andere Mitspieler sehen die Aufdeckung nicht (Privatsphäre), Zuschauer aber schon —
      // ein voller Broadcast ist nötig, damit Zuschauer sie sofort live sehen (nicht erst
      // beim nächsten Pick/Rundenwechsel)
      broadcastCarouselState(lobby, io);
    },

    'clash:carousel:pick': ({ socket, io }, { code, slotIdx }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'shadow-carousel' || lobby.game.phase !== 'picking') return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      if (g.picksThisRound[socket.id]) return emitClashError(socket, 'alreadyPicked');
      if (typeof slotIdx !== 'number') return;
      // Erst aufdecken, dann nehmen — siehe carouselRequiredFlips()
      const { table: myTable } = getCarouselTable(g, socket.id);
      const needed = carouselRequiredFlips(g, myTable);
      const done = (g.flipsThisRound[socket.id] || []).length;
      if (done < needed) return emitClashError(socket, 'revealBeforePick', { needed, done });
      if (!doCarouselPick(lobby, player, slotIdx)) return;
      broadcastCarouselState(lobby, io);
      checkCarouselRoundComplete(lobby, io);
    },
  },
});
