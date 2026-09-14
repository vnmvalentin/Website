// ── Fallensteller ────────────────────────────────────────────────────────────
// Jede Runde bekommt jeder Spieler 3 private Trap-Karten (eine feste, kuratierte Liste
// unterdurchschnittlicher Karten — siehe TRAP_ELIGIBLE_IDS) und tarnt einen Teil davon als
// attraktive Karten (Tarn-Identität aus 4 gezogenen Kandidaten, die NICHT aus dieser Liste
// stammen). Alle Fallen landen zusammen mit echten Zufallskarten in einem gemeinsamen Raster.
// Nach einem synchronen 3-Sekunden-Countdown ist das Raster live: alle klicken so schnell wie
// möglich auf ein Feld. Bei Kollision gewinnt der schnellste Klick das echte Feld, alle anderen
// (inkl. wer gar nicht geklickt hat) werden zufällig auf ein übrig gebliebenes Feld umgeleitet —
// das kann wieder eine fremde Falle sein. Erst bei der Auflösung wird jede betroffene Falle
// aufgedeckt.
//
// WICHTIG — Spieler sehen ihre 3 Karten nie als "schlecht" beschriftet, nur als "Trap-Karten":
// sie sind unterdurchschnittlich, aber niemand soll den Umkehrschluss ziehen, jede nicht
// getarnte Karte im Raster sei automatisch gut.

const { ALL_CARDS, getCardPool } = require('../core/cards');
const { lobbies, shuffle } = require('../core/lobbies');
const { clearTurnTimer } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { emitClashError } = require('../core/errors');

// Kuratierte Liste unterdurchschnittlicher/situativer Karten — bewusst KEINE Rarity-Regel
// mehr (vorher: alle Common-Karten). Von Hand gepflegt; hier an einer Stelle ändern, dann
// gilt es überall (Trap-Karten-Auswahl UND Tarn-Ziel-Ausschluss unten).
const TRAP_ELIGIBLE_IDS = new Set([
  'barbarian-hut', 'clone', 'mirror', 'rune-giant', 'royal-recruits', 'earthquake',
  'inferno-tower', 'elixir-collector', 'goblin-curse', 'goblin-machine', 'battle-healer',
  'royal-giant', 'barbarians', 'three-musketeers', 'mortar', 'heal-spirit', 'rocket', 'rage',
  'x-bow', 'balloon', 'lava-hound', 'elixir-golem', 'goblin-drill', 'goblin-giant',
  'goblin-hut', 'graveyard', 'ice-golem', 'freeze', 'pekka', 'fisherman',
]);
const isTrapEligible = (c) => TRAP_ELIGIBLE_IDS.has(c.id);
const TRAP_CARDS_SHOWN = 3;

const TRAP_DECK_SIZE = 8;
const TRAP_MAX_ROUNDS = 8;
const TRAP_DISGUISE_COUNTS = [1, 2, 3];
const TRAP_DISGUISE_COUNT_DEFAULT = 1;
const TRAP_GRID_SIZES = [9, 12, 16]; // 3×3 / 4×3 / 4×4
const TRAP_GRID_SIZE_DEFAULT = 9;
const TRAP_DISGUISE_SECONDS_DEFAULT = 25;
const TRAP_COUNTDOWN_MS = 3000;
// Reine Anti-AFK-Absicherung der Klickphase — kein Balance-Hebel, deshalb keine Host-Einstellung.
const TRAP_RACE_TIMEOUT_MS = 20000;
// Pause nach der Auflösung, damit die Aufdeck-/Umleitungs-Animationen im Client Zeit haben.
const TRAP_REVEAL_PAUSE_MS = 4000;
const TRAP_TARGET_CANDIDATES = 4;

const trapActivePlayers = (lobby) => lobby.players.filter(p => !p.isSpectator && !p.left);

// ── Ziehen/Zurücklegen aus dem geteilten Rundenpool (Muster aus cardEvolution.js) ──────────
function drawRandom(g, count, predicate = () => true) {
  const matches = g.pool.filter(predicate);
  if (matches.length < count) return null;
  const chosen = shuffle(matches).slice(0, count);
  const chosenIds = new Set(chosen.map(c => c.id));
  g.pool = g.pool.filter(c => !chosenIds.has(c.id));
  return chosen;
}
function returnToPool(g, card) { if (card) g.pool.push(card); }

// Ersatzkarte, falls eine Zuteilung das Champion-Limit sprengen würde (Muster aus
// elixirAuction.js / shadowCarousel.js).
function trapBonusCard(lobby, g) {
  const drawn = drawRandom(g, 1, c => !c.isChampion);
  if (drawn) return drawn[0];
  const cardPool = getCardPool(lobby).filter(c => !c.isChampion);
  if (cardPool.length) return cardPool[Math.floor(Math.random() * cardPool.length)];
  return ALL_CARDS.find(c => !c.isChampion) || null;
}

function usedBadCardIndices(g, playerId) {
  const used = new Set((g.trapChoices[playerId] || []).map(t => t.badCardIndex));
  const pending = g.pendingTrap[playerId];
  if (pending) used.add(pending.badCardIndex);
  return used;
}

// ── Zustand für EINEN Betrachter — eigene Karten/Wahl sind privat, das Raster zeigt nur die
// Tarn-Identität, bis die Runde aufgelöst ist. ──────────────────────────────────────────────
function buildTrapState(lobby, viewerId) {
  const g = lobby.game;
  const active = trapActivePlayers(lobby);
  const isDisguise = g.phase === 'disguise';
  const revealed = g.phase === 'reveal' || g.finished;

  return {
    type: 'trap-setter',
    round: g.round, maxRounds: g.maxRounds,
    phase: g.phase,
    disguiseCount: g.disguiseCount,
    gridSize: g.gridSize,
    deckSize: TRAP_DECK_SIZE,
    finished: g.finished,
    serverNow: Date.now(),
    timerRemaining: isDisguise ? g.timerRemaining : null,
    timerSeconds: lobby.trapDisguiseSeconds ?? TRAP_DISGUISE_SECONDS_DEFAULT,
    countdownUntil: g.countdownUntil || null,
    raceTimeoutAt: g.phase === 'racing' ? g.raceTimeoutAt : null,
    myBadCards: isDisguise ? (g.badCards[viewerId] || []) : [],
    myUsedBadCardIndices: isDisguise ? [...usedBadCardIndices(g, viewerId)] : [],
    myPendingTrap: isDisguise ? (g.pendingTrap[viewerId] || null) : null,
    myTrapsPlaced: (g.trapChoices[viewerId] || []).length,
    readyCount: isDisguise ? active.filter(p => (g.trapChoices[p.id] || []).length >= g.disguiseCount).length : 0,
    activeCount: active.length,
    grid: (g.grid || []).map((cell, i) => ({
      index: i,
      kind: cell.kind,
      display: cell.kind === 'trap' ? cell.fakeCard : cell.card,
      isMine: cell.kind === 'trap' && cell.ownerId === viewerId,
      claimed: !!cell.claimed,
      revealed,
      realCard: revealed ? (cell.kind === 'trap' ? cell.realCard : cell.card) : null,
      ownerName: revealed && cell.kind === 'trap'
        ? (lobby.players.find(p => p.id === cell.ownerId)?.name ?? null) : null,
    })),
    myClickedCellIndex: g.clicks?.[viewerId]?.cellIndex ?? null,
    pendingClickCount: Object.keys(g.clicks || {}).length,
    lastResolution: g.phase === 'reveal' ? g.lastResolution : null,
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
    })),
  };
}

function broadcastTrapState(lobby, io) {
  lobby.players.forEach(p => io.to(p.id).emit('clash:trap:state', buildTrapState(lobby, p.id)));
}

// ── Spielende ────────────────────────────────────────────────────────────────────────────
function endTrapGame(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'trap-setter',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  broadcastTrapState(lobby, io);
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// ── Phase "Verschleiern" ────────────────────────────────────────────────────────────────────
function startDisguisePhaseTimer(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerRemaining = lobby.trapDisguiseSeconds ?? TRAP_DISGUISE_SECONDS_DEFAULT;
  g.timerInterval = setInterval(() => {
    g.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: g.timerRemaining });
    if (g.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      finishDisguisePhase(lobby, io);
    }
  }, 1000);
}

function allDisguisesReady(lobby) {
  const g = lobby.game;
  return trapActivePlayers(lobby).every(p => (g.trapChoices[p.id] || []).length >= g.disguiseCount);
}

// Wählt für EINE Falle automatisch eine ungenutzte Trap-Karte + eine zufällige Tarn-Identität
// und trägt sie sofort ein (für Auto-Vervollständigung bei Zeitablauf).
function autoPlaceOneTrap(lobby, playerId) {
  const g = lobby.game;
  const badCards = g.badCards[playerId] || [];
  const used = usedBadCardIndices(g, playerId);
  const freeIdx = badCards.map((_, i) => i).filter(i => !used.has(i));
  if (!freeIdx.length) return false;
  const badCardIndex = freeIdx[Math.floor(Math.random() * freeIdx.length)];
  const badCard = badCards[badCardIndex];
  const options = drawRandom(g, TRAP_TARGET_CANDIDATES, c => !isTrapEligible(c))
    || drawRandom(g, Math.min(TRAP_TARGET_CANDIDATES, g.pool.length), () => true);
  if (!options || !options.length) return false;
  const chosen = options[Math.floor(Math.random() * options.length)];
  options.forEach(c => { if (c !== chosen) returnToPool(g, c); });
  g.trapChoices[playerId] = [...(g.trapChoices[playerId] || []), { badCardIndex, badCard, fakeCard: chosen }];
  return true;
}

function finishDisguisePhase(lobby, io) {
  const g = lobby.game;
  clearTurnTimer(lobby);

  // Offene Wahlen und unentschiedene Spieler automatisch vervollständigen — niemand blockiert
  // die Runde, exakt wie in jedem anderen Modus.
  trapActivePlayers(lobby).forEach(p => {
    const pending = g.pendingTrap[p.id];
    if (pending) {
      const chosen = pending.targetOptions[Math.floor(Math.random() * pending.targetOptions.length)];
      pending.targetOptions.forEach(c => { if (c !== chosen) returnToPool(g, c); });
      g.trapChoices[p.id] = [...(g.trapChoices[p.id] || []), { badCardIndex: pending.badCardIndex, badCard: pending.badCard, fakeCard: chosen }];
      delete g.pendingTrap[p.id];
    }
    while ((g.trapChoices[p.id] || []).length < g.disguiseCount) {
      if (!autoPlaceOneTrap(lobby, p.id)) break;
    }
    // Nicht als Falle verwendete Trap-Karten sind sonst dauerhaft aus dem Pool verschwunden,
    // ohne je bei jemandem zu landen — zurücklegen statt verschwenden.
    const usedIdx = usedBadCardIndices(g, p.id);
    (g.badCards[p.id] || []).forEach((card, i) => { if (!usedIdx.has(i)) returnToPool(g, card); });
  });

  beginCountdown(lobby, io);
}

// ── Übergang zum Raster ─────────────────────────────────────────────────────────────────────
function beginCountdown(lobby, io) {
  const g = lobby.game;
  clearTurnTimer(lobby);

  const trapCells = trapActivePlayers(lobby).flatMap(p =>
    (g.trapChoices[p.id] || []).map(t => ({
      kind: 'trap', ownerId: p.id, fakeCard: t.fakeCard, realCard: t.badCard, claimed: false,
    })),
  );
  const fillerCount = Math.max(0, g.gridSize - trapCells.length);
  const filler = drawRandom(g, fillerCount, () => true) || [];
  const fillerCells = filler.map(card => ({ kind: 'filler', card, claimed: false }));
  // Falls der Pool selbst für die Füllung nicht reicht, wird das Raster diese Runde eben
  // kleiner — lieber ein kleineres Spielfeld als ein blockiertes Spiel.
  g.grid = shuffle([...trapCells, ...fillerCells]);
  g.clicks = {};
  g.lastResolution = null;
  g.phase = 'countdown';
  g.countdownUntil = Date.now() + TRAP_COUNTDOWN_MS;
  broadcastTrapState(lobby, io);

  setTimeout(() => {
    const l = lobbies.get(lobby.code);
    if (!l?.game || l.game !== g || l.game.finished || l.game.phase !== 'countdown') return;
    beginRacing(l, io);
  }, TRAP_COUNTDOWN_MS);
}

function beginRacing(lobby, io) {
  const g = lobby.game;
  g.phase = 'racing';
  g.raceTimeoutAt = Date.now() + TRAP_RACE_TIMEOUT_MS;
  broadcastTrapState(lobby, io);

  clearTurnTimer(lobby);
  g.timerInterval = setInterval(() => {
    if (lobby.game !== g || g.finished || g.phase !== 'racing') return;
    if (Date.now() >= g.raceTimeoutAt) {
      clearTurnTimer(lobby);
      resolveTrapRound(lobby, io);
    }
  }, 250);
}

// ── Auflösung: Renn-Gewinner je Feld, Verlierer zufällig auf Restfelder umgeleitet ─────────
function resolveTrapRound(lobby, io) {
  const g = lobby.game;
  clearTurnTimer(lobby);
  g.phase = 'reveal';
  const active = trapActivePlayers(lobby);

  // Klicks nach Zielfeld gruppieren, je Feld nach Zeit sortiert — Erster gewinnt.
  const byCell = new Map();
  Object.entries(g.clicks).forEach(([playerId, { cellIndex, at }]) => {
    if (!byCell.has(cellIndex)) byCell.set(cellIndex, []);
    byCell.get(cellIndex).push({ playerId, at });
  });

  const claims = {}; // playerId → cellIndex
  const races = [];
  byCell.forEach((entries, cellIndex) => {
    entries.sort((a, b) => a.at - b.at);
    claims[entries[0].playerId] = cellIndex;
    if (entries.length > 1) {
      races.push({
        cellIndex,
        winnerId: entries[0].playerId,
        entries: entries.map(e => ({ playerId: e.playerId, ms: Math.max(0, e.at - g.countdownUntil) })),
      });
    }
  });

  // Verlierer = alle, die ein umkämpftes Feld verloren haben ODER gar nicht geklickt haben.
  const losers = active.filter(p => claims[p.id] === undefined).map(p => p.id);
  const unclaimedIndices = shuffle(
    g.grid.map((_, i) => i).filter(i => !Object.values(claims).includes(i)),
  );
  const redirects = [];
  losers.forEach(playerId => {
    const cellIndex = unclaimedIndices.pop();
    if (cellIndex === undefined) return; // rechnerisch ausgeschlossen (gridSize ≥ active), Absicherung bleibt
    claims[playerId] = cellIndex;
    redirects.push({ playerId, cellIndex });
  });

  // Zuteilungen anwenden — gleichzeitig die Auflösungsliste fürs Frontend aufbauen: EINE
  // Zeile pro Spieler mit der Karte, die er tatsächlich bekommen hat (nach einer eventuellen
  // Champion-Limit-Ersatzkarte), nicht nur die umkämpften Felder wie zuvor — sonst fehlten
  // unbestrittene Picks (nur ein Klick auf dem Feld) in der Auflösung komplett.
  const results = [];
  Object.entries(claims).forEach(([playerId, cellIndex]) => {
    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return;
    const cell = g.grid[cellIndex];
    cell.claimed = true;
    let card = cell.kind === 'trap' ? cell.realCard : cell.card;
    const champCount = (player.deck || []).filter(c => c.isChampion).length;
    if (card?.isChampion && champCount >= 2) card = trapBonusCard(lobby, g) || card;
    if (card) player.deck = [...(player.deck || []), card];
    if (cell.kind === 'trap') returnToPool(g, cell.fakeCard); // Tarnung war nie eine echte Zuteilung
    const click = g.clicks[playerId];
    results.push({
      playerId,
      cellIndex,
      card,
      ms: click ? Math.max(0, click.at - g.countdownUntil) : null,
      contested: races.some(r => r.cellIndex === cellIndex),
      redirected: redirects.some(r => r.playerId === playerId),
    });
  });
  // Schnellste zuerst; wer gar nicht geklickt hat (kein `ms`) landet am Ende statt vorne.
  results.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity));

  // Nie beanspruchte Felder geben ihre Karten an den Pool zurück statt sie zu verschwenden.
  g.grid.forEach(cell => {
    if (cell.claimed) return;
    if (cell.kind === 'trap') { returnToPool(g, cell.fakeCard); returnToPool(g, cell.realCard); }
    else returnToPool(g, cell.card);
  });

  g.lastResolution = { races, redirects, results };
  broadcastTrapState(lobby, io);

  setTimeout(() => {
    const l = lobbies.get(lobby.code);
    if (!l?.game || l.game !== g || l.game.finished) return;
    nextTrapRound(l, io);
  }, TRAP_REVEAL_PAUSE_MS);
}

// ── Rundenwechsel ────────────────────────────────────────────────────────────────────────
function nextTrapRound(lobby, io) {
  const g = lobby.game;
  if (g.round >= g.maxRounds) { endTrapGame(lobby, io); return; }
  g.round++;
  g.phase = 'disguise';
  g.badCards = {};
  g.pendingTrap = {};
  g.trapChoices = {};
  g.grid = [];
  g.clicks = {};
  g.lastResolution = null;

  trapActivePlayers(lobby).forEach(p => {
    g.badCards[p.id] = drawRandom(g, TRAP_CARDS_SHOWN, isTrapEligible)
      || drawRandom(g, Math.min(TRAP_CARDS_SHOWN, g.pool.filter(isTrapEligible).length), isTrapEligible)
      || [];
  });

  broadcastTrapState(lobby, io);
  startDisguisePhaseTimer(lobby, io);
}

function startTrapSetter(lobby, io) {
  lobby.players.forEach(p => { p.deck = []; });
  lobby.game = {
    type: 'trap-setter',
    pool: shuffle(getCardPool(lobby)),
    round: 0,
    maxRounds: TRAP_MAX_ROUNDS,
    disguiseCount: TRAP_DISGUISE_COUNTS.includes(lobby.trapDisguiseCount) ? lobby.trapDisguiseCount : TRAP_DISGUISE_COUNT_DEFAULT,
    gridSize: TRAP_GRID_SIZES.includes(lobby.trapGridSize) ? lobby.trapGridSize : TRAP_GRID_SIZE_DEFAULT,
    phase: 'disguise',
    badCards: {}, pendingTrap: {}, trapChoices: {},
    grid: [], clicks: {}, lastResolution: null,
    timerRemaining: null, timerInterval: null,
    countdownUntil: null, raceTimeoutAt: null,
    finished: false,
  };
  io.to(lobby.code).emit('clash:gameStart', { mode: 'trap-setter' });
  nextTrapRound(lobby, io);
}

registerMode({
  id: 'trap-setter',
  gameType: 'trap-setter',
  settings: {
    trapDisguiseSeconds: {
      default: TRAP_DISGUISE_SECONDS_DEFAULT,
      event: 'clash:setTrapDisguiseSeconds',
      payloadKey: 'seconds',
      sanitize: (v) => Math.max(5, Math.min(90, Number(v) || TRAP_DISGUISE_SECONDS_DEFAULT)),
    },
    trapDisguiseCount: {
      default: TRAP_DISGUISE_COUNT_DEFAULT,
      event: 'clash:setTrapDisguiseCount',
      payloadKey: 'count',
      sanitize: (v) => (TRAP_DISGUISE_COUNTS.includes(Number(v)) ? Number(v) : undefined),
    },
    trapGridSize: {
      default: TRAP_GRID_SIZE_DEFAULT,
      event: 'clash:setTrapGridSize',
      payloadKey: 'size',
      sanitize: (v) => (TRAP_GRID_SIZES.includes(Number(v)) ? Number(v) : undefined),
    },
  },
  // 8 Runden × 8 echte Deckkarten, plus Puffer für den gleichzeitig reservierten Bestand
  // (Trap-Karten + Tarn-Kandidaten in der Mache, Füllkarten fürs größte Raster).
  requiredPool: (lobby, active) =>
    active * 8 + (TRAP_GRID_SIZES.includes(lobby.trapGridSize) ? lobby.trapGridSize : TRAP_GRID_SIZE_DEFAULT),
  // Das Raster muss jede gleichzeitig aktive Falle aufnehmen können — sonst passen die
  // Fallen aller Spieler gar nicht erst hinein.
  canStart: (lobby, poolSize) => {
    void poolSize;
    const active = trapActivePlayers(lobby).length || lobby.players.filter(p => !p.isSpectator).length;
    const disguiseCount = TRAP_DISGUISE_COUNTS.includes(lobby.trapDisguiseCount) ? lobby.trapDisguiseCount : TRAP_DISGUISE_COUNT_DEFAULT;
    const gridSize = TRAP_GRID_SIZES.includes(lobby.trapGridSize) ? lobby.trapGridSize : TRAP_GRID_SIZE_DEFAULT;
    return active * disguiseCount > gridSize
      ? { key: 'trapGridTooSmall', params: { active, disguiseCount, gridSize } }
      : null;
  },
  start: (lobby, io) => startTrapSetter(lobby, io),
  buildState: (lobby, socket) => ({ event: 'clash:trap:state', payload: buildTrapState(lobby, socket.id) }),
  remapPlayerId: (game, oldId, newId) => {
    ['badCards', 'pendingTrap', 'trapChoices', 'clicks'].forEach(key => {
      if (game[key]?.[oldId] !== undefined) { game[key][newId] = game[key][oldId]; delete game[key][oldId]; }
    });
    (game.grid || []).forEach(cell => { if (cell.ownerId === oldId) cell.ownerId = newId; });
  },
  onPlayerLeft: (lobby, io) => {
    const g = lobby.game;
    if (g.phase === 'disguise' && allDisguisesReady(lobby)) { clearTurnTimer(lobby); finishDisguisePhase(lobby, io); return; }
    if (g.phase === 'racing') {
      const active = trapActivePlayers(lobby);
      if (active.length && active.every(p => g.clicks[p.id])) { clearTurnTimer(lobby); resolveTrapRound(lobby, io); return; }
    }
    broadcastTrapState(lobby, io);
  },
  onPlayerDisconnected: (lobby, io) => {
    const g = lobby.game;
    const active = trapActivePlayers(lobby);
    if (g.phase === 'disguise' && active.length && allDisguisesReady(lobby)) { clearTurnTimer(lobby); finishDisguisePhase(lobby, io); return; }
    if (g.phase === 'racing' && active.length && active.every(p => g.clicks[p.id])) { clearTurnTimer(lobby); resolveTrapRound(lobby, io); }
  },
  socketHandlers: {
    'clash:trap:chooseBadCard': ({ socket }, { code, badCardIndex }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'trap-setter' || lobby.game.phase !== 'disguise') return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      if ((g.trapChoices[socket.id] || []).length >= g.disguiseCount) return;
      if (g.pendingTrap[socket.id]) return emitClashError(socket, 'alreadyPending');
      const badCards = g.badCards[socket.id] || [];
      const idx = Number(badCardIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= badCards.length) return;
      if (usedBadCardIndices(g, socket.id).has(idx)) return emitClashError(socket, 'cardAlreadyPicked');

      const options = drawRandom(g, TRAP_TARGET_CANDIDATES, c => !isTrapEligible(c));
      if (!options) return emitClashError(socket, 'poolEmpty');
      g.pendingTrap[socket.id] = { badCardIndex: idx, badCard: badCards[idx], targetOptions: options };
      socket.emit('clash:trap:state', buildTrapState(lobby, socket.id));
    },

    'clash:trap:chooseTarget': ({ socket, io }, { code, targetIndex }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'trap-setter' || lobby.game.phase !== 'disguise') return;
      const g = lobby.game;
      const pending = g.pendingTrap[socket.id];
      if (!pending) return;
      const idx = Number(targetIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= pending.targetOptions.length) return;
      const chosen = pending.targetOptions[idx];
      pending.targetOptions.forEach(c => { if (c !== chosen) returnToPool(g, c); });
      g.trapChoices[socket.id] = [...(g.trapChoices[socket.id] || []), {
        badCardIndex: pending.badCardIndex, badCard: pending.badCard, fakeCard: chosen,
      }];
      delete g.pendingTrap[socket.id];
      broadcastTrapState(lobby, io);
      if (allDisguisesReady(lobby)) { clearTurnTimer(lobby); finishDisguisePhase(lobby, io); }
    },

    'clash:trap:click': ({ socket, io }, { code, cellIndex }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'trap-setter' || lobby.game.phase !== 'racing') return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      if (g.clicks[socket.id]) return; // nur ein Klick pro Runde
      const now = Date.now();
      if (g.countdownUntil && now < g.countdownUntil) return;
      const idx = Number(cellIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= g.grid.length) return;

      g.clicks[socket.id] = { cellIndex: idx, at: now };
      io.to(lobby.code).emit('clash:trap:clickUpdate', { pendingClickCount: Object.keys(g.clicks).length });

      const active = trapActivePlayers(lobby);
      if (active.length && active.every(p => g.clicks[p.id])) {
        clearTurnTimer(lobby);
        resolveTrapRound(lobby, io);
      }
    },
  },
});
