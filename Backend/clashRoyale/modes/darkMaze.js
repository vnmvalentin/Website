// ── Dunkles Labyrinth ────────────────────────────────────────────────────────
// Prozedural generiertes Labyrinth (Recursive Backtracker + Braiding für Schleifen).
// Spieler bewegen sich in Echtzeit auf einem Kachel-Grid, sehen aber nur ihren eigenen
// Lichtkegel (Fog of War rendert der Client — Zuschauer sehen alles). Items: Draft-Kisten
// (1 aus 2), lose Bodenkarten und genau EIN Joker in der Labyrinth-Mitte. Nichts löst
// beim Betreten aus — jedes Item wird bewusst per Leertaste/Klick aufgenommen.

const { getCardPool } = require('../core/cards');
const { lobbies, shuffle } = require('../core/lobbies');
const { clearTurnTimer } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { emitClashError } = require('../core/errors');
const MAZE_DECK_SIZE         = 8;
const MAZE_COUNTDOWN_MS      = 3000;
const MAZE_STEP_MS           = 130;   // Mindestabstand zwischen zwei Schritten (Server-Limit)
// Schritt-Guthaben statt hartem Mindestabstand: Der Client läuft mit exakt MAZE_STEP_MS,
// über das Netz kommen die Schritte aber gebündelt an (TCP-Stau, WLAN-Aussetzer). Ein
// starres Fenster hätte die nachgereichten Schritte verworfen — der Spieler wäre auf
// seinem Bildschirm schon weiter gewesen und danach sichtbar zurückgerissen worden.
// Mit einem Guthaben von ein paar Schritten werden solche Bündel angenommen; das
// Dauertempo bleibt trotzdem auf einen Schritt pro MAZE_STEP_MS begrenzt.
const MAZE_STEP_BURST        = 4;
const MAZE_POS_BROADCAST_MS  = 100;
const MAZE_LIGHT_RADIUS      = 3.4;   // Sichtweite in Kacheln (Anzeige-Info fürs Frontend)
const MAZE_BRAID_CHANCE      = 0.12;  // Anteil geöffneter Zusatzwände → Schleifen statt perfektem Labyrinth
// Deutlich mehr Karten auf der Map als gebraucht werden (8/Spieler) — niemand ist gezwungen,
// alles mitzunehmen. Bei kleinem Kartenpool schrumpfen die Zahlen automatisch (Budget-Check).
const MAZE_CHESTS_PER_PLAYER = 5;
const MAZE_CARDS_PER_PLAYER  = 7;
const MAZE_TIME_LIMITS       = [60, 90, 120, 180, 240]; // timeLimitInSeconds (Host-Einstellung)
const MAZE_TIME_DEFAULT      = 120;

// Recursive Backtracker über ein Zellraster; Kachelkarte (2*cells+1)² mit 1 = Wand.
// Danach Braiding: einige Innenwände zwischen zwei Bodenzellen öffnen → Schleifen,
// damit man sich nicht in Sackgassen festrennt.
function generateMaze(cells) {
  const W = 2 * cells + 1, H = W;
  const walls = Array.from({ length: H }, () => Array(W).fill(1));
  const visited = Array.from({ length: cells }, () => Array(cells).fill(false));
  const stack = [[0, 0]];
  visited[0][0] = true;
  walls[1][1] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ nx: cx + dx, ny: cy + dy, dx, dy }))
      .filter(({ nx, ny }) => nx >= 0 && ny >= 0 && nx < cells && ny < cells && !visited[ny][nx]);
    if (!nbs.length) { stack.pop(); continue; }
    const { nx, ny, dx, dy } = nbs[Math.floor(Math.random() * nbs.length)];
    visited[ny][nx] = true;
    walls[2 * ny + 1][2 * nx + 1] = 0;
    walls[2 * cy + 1 + dy][2 * cx + 1 + dx] = 0;
    stack.push([nx, ny]);
  }
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (walls[y][x] !== 1 || (x + y) % 2 === 0) continue; // nur Kantenwände zwischen zwei Zellen
      const open = y % 2 === 1
        ? walls[y][x - 1] === 0 && walls[y][x + 1] === 0
        : walls[y - 1][x] === 0 && walls[y + 1][x] === 0;
      if (open && Math.random() < MAZE_BRAID_CHANCE) walls[y][x] = 0;
    }
  }
  return { walls, W, H };
}

// Spawn-Reihenfolge so, dass 2 Spieler automatisch an GEGENÜBERLIEGENDEN Ecken starten
// und bis 4 Spieler jeder eine eigene Ecke bekommt; darüber hinaus Kanten-Mitten.
function mazeSpawnPoints(W, H) {
  const mid = (n) => { let m = Math.floor(n / 2); if (m % 2 === 0) m -= 1; return m; };
  return [
    { x: 1, y: 1 }, { x: W - 2, y: H - 2 }, { x: W - 2, y: 1 }, { x: 1, y: H - 2 },
    { x: mid(W), y: 1 }, { x: mid(W), y: H - 2 }, { x: 1, y: mid(H) }, { x: W - 2, y: mid(H) },
  ];
}

// Mehrquellen-BFS: liefert für jede Bodenkachel die Schrittdistanz zur nächstgelegenen Quelle.
// Wichtig: echte Laufdistanz statt Luftlinie — zwei Kacheln können durch eine Wand getrennt
// nebeneinander liegen und trotzdem 20 Schritte auseinander sein.
function mazeDistanceField(walls, W, H, sources) {
  const dist = Array.from({ length: H }, () => Array(W).fill(Infinity));
  const q = [];
  for (const s of sources) {
    if (s.x < 0 || s.y < 0 || s.x >= W || s.y >= H || walls[s.y][s.x] === 1) continue;
    if (dist[s.y][s.x] !== Infinity) continue;
    dist[s.y][s.x] = 0;
    q.push(s);
  }
  for (let head = 0; head < q.length; head++) {
    const { x, y } = q[head];
    const d = dist[y][x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (walls[ny][nx] === 1 || dist[ny][nx] !== Infinity) continue;
      dist[ny][nx] = d + 1;
      q.push({ x: nx, y: ny });
    }
  }
  return dist;
}

// Items gleichmäßig übers Labyrinth verteilen (Greedy "farthest point"): jede neue Position
// liegt möglichst weit von Spawns und bereits gesetzten Items entfernt. Unter allen Kacheln
// nahe der Bestdistanz wird zufällig gewählt — das verhindert Nester aus 4 Kisten an einer
// Ecke, bleibt aber von Runde zu Runde unvorhersehbar.
function mazeSpreadPositions(walls, W, H, candidates, count, seeds) {
  const placed = [...seeds];
  const chosen = [];
  let pool = [...candidates];
  for (let i = 0; i < count && pool.length; i++) {
    const dist = mazeDistanceField(walls, W, H, placed);
    let bestD = -1;
    const reachable = [];
    for (const t of pool) {
      const d = dist[t.y][t.x];
      if (d === Infinity) continue;
      reachable.push({ t, d });
      if (d > bestD) bestD = d;
    }
    if (!reachable.length) break;
    // Alles ab 75% der Bestdistanz gilt als "weit genug weg"
    const good = reachable.filter(e => e.d >= bestD * 0.75);
    const pick = good[Math.floor(Math.random() * good.length)].t;
    chosen.push(pick);
    placed.push(pick);
    pool = pool.filter(t => t !== pick);
  }
  return chosen;
}

// Frische Spielerposition. seq = zuletzt verarbeitete Zug-Nummer des Clients; der Client
// hängt daran seine eigene Vorhersage auf (siehe Kommentar in DarkMaze.jsx).
function mazePosition(x, y, dir) {
  return { x, y, dir, stepTokens: MAZE_STEP_BURST, refilledAt: 0, seq: 0 };
}

// Guthaben auffüllen und einen Schritt abbuchen; false = zu schnell.
function mazeSpendStep(pos, now) {
  const since = pos.refilledAt ? now - pos.refilledAt : 0;
  pos.stepTokens = Math.min(MAZE_STEP_BURST, (pos.stepTokens ?? MAZE_STEP_BURST) + since / MAZE_STEP_MS);
  pos.refilledAt = now;
  if (pos.stepTokens < 1) return false;
  pos.stepTokens -= 1;
  return true;
}

// Positionen für den Client — ohne die serverinternen Guthaben-Felder
function mazePublicPositions(g) {
  return Object.fromEntries(Object.entries(g.positions).map(([id, p]) => [id, { x: p.x, y: p.y, dir: p.dir, seq: p.seq || 0 }]));
}

function mazeUsedCardIds(lobby) {
  const g = lobby.game;
  const used = new Set(lobby.players.flatMap(p => (p.deck || []).map(c => c.id)));
  if (g?.type === 'dark-maze') {
    g.items.forEach(it => {
      if (it.card) used.add(it.card.id);
      (it.options || []).forEach(c => used.add(c.id)); // fest vorbestimmte Kisteninhalte
    });
    Object.values(g.drafts).forEach(d => (d.options || []).forEach(c => used.add(c.id)));
  }
  return used;
}

function mazeDrawCards(lobby, count, { noChampions = false } = {}) {
  const used = mazeUsedCardIds(lobby);
  let pool = getCardPool(lobby).filter(c => !used.has(c.id));
  if (noChampions) pool = pool.filter(c => !c.isChampion);
  return shuffle(pool).slice(0, count)
    .map(c => ({ id: c.id, name: c.name, rarity: c.rarity, isChampion: c.isChampion }));
}

function buildMazeState(lobby) {
  const g = lobby.game;
  return {
    type: 'dark-maze',
    finished: g.finished,
    countdownUntil: g.countdownUntil,
    endsAt: g.endsAt,
    serverNow: Date.now(),
    W: g.W, H: g.H,
    walls: g.walls.map(row => row.join('')), // kompakt: eine Zeichenkette pro Zeile
    lightRadius: MAZE_LIGHT_RADIUS,
    stepMs: MAZE_STEP_MS,
    deckSize: MAZE_DECK_SIZE,
    items: g.items,
    drafts: g.drafts,
    poolIds: getCardPool(lobby).map(c => c.id), // für die Joker-Auswahl im Client
    positions: mazePublicPositions(g),
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
    })),
  };
}

function finishMaze(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'dark-maze' || g.finished) return;
  clearTurnTimer(lobby);

  // Offene Popups verfallen — niemand wird zu einer Karte gezwungen, das Auffüllen
  // unten bestückt ohnehin jedes unvollständige Deck
  g.drafts = {};

  // Liegengebliebene Items geben ihre reservierten Karten frei — das Auffüllen darf
  // aus dem vollen Restpool schöpfen
  g.items = [];

  // Zeit abgelaufen: unvollständige Decks mit zufälligen freien Karten auffüllen
  for (const p of lobby.players) {
    if (p.isSpectator || p.left) continue;
    while ((p.deck || []).length < MAZE_DECK_SIZE) {
      const champBlocked = (p.deck || []).filter(c => c.isChampion).length >= 2;
      const [card] = mazeDrawCards(lobby, 1, { noChampions: champBlocked });
      if (!card) break;
      p.deck = [...(p.deck || []), card];
    }
  }

  g.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'dark-maze',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  io.to(lobby.code).emit('clash:maze:state', buildMazeState(lobby));
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

function checkMazeEnd(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'dark-maze' || g.finished) return;
  const active = lobby.players.filter(p => !p.isSpectator && !p.left);
  if (active.length && active.every(p => (p.deck || []).length >= MAZE_DECK_SIZE)) finishMaze(lobby, io);
}

function startMazeTick(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerInterval = setInterval(() => {
    if (lobby.game !== g || g.finished) return;
    const now = Date.now();
    if (g.posDirty) {
      g.posDirty = false;
      io.to(lobby.code).emit('clash:maze:pos', { serverNow: now, positions: mazePublicPositions(g) });
    }
    if (now >= g.endsAt) finishMaze(lobby, io);
  }, MAZE_POS_BROADCAST_MS);
}

function startDarkMaze(lobby, io) {
  const active = lobby.players.filter(p => !p.isSpectator && !p.left);
  const a = active.length;
  // Labyrinthgröße skaliert mit der Spieleranzahl (cells ungerade → exakte Mittelzelle für den Joker).
  // Bewusst groß — mit der Nahsicht-Kamera soll man sich verlaufen können und den Weg
  // zur Mitte nicht direkt sehen.
  const cells = a <= 2 ? 13 : a <= 4 ? 15 : a <= 6 ? 17 : 19;
  const { walls, W, H } = generateMaze(cells);
  const now = Date.now();
  const countdownUntil = now + MAZE_COUNTDOWN_MS;
  const timeLimitInSeconds = Math.max(30, Math.min(600, lobby.mazeTimeSeconds || MAZE_TIME_DEFAULT));

  lobby.players.forEach(p => { p.deck = []; });

  const spawns = mazeSpawnPoints(W, H);
  const positions = {};
  active.forEach((p, i) => {
    const s = spawns[i % spawns.length];
    positions[p.id] = mazePosition(s.x, s.y, s.x > W / 2 ? -1 : 1);
  });

  lobby.game = {
    type: 'dark-maze',
    walls, W, H,
    positions,
    items: [],
    nextItemId: 1,
    drafts: {},
    finished: false,
    countdownUntil,
    endsAt: countdownUntil + timeLimitInSeconds * 1000,
    posDirty: true,
    timerInterval: null,
  };
  const g = lobby.game;

  // Items auf Bodenzellen verteilen — nicht neben Spawns, nicht auf der Joker-Mitte
  const center = { x: Math.floor(W / 2), y: Math.floor(H / 2) };
  const usedSpawns = Object.values(positions);
  const cellTiles = [];
  for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) cellTiles.push({ x, y });
  const candidates = cellTiles.filter(t =>
    !(t.x === center.x && t.y === center.y) &&
    !usedSpawns.some(s => Math.abs(s.x - t.x) + Math.abs(s.y - t.y) <= 4)
  );

  // Karten-Budget: Kisten reservieren je 2 eindeutige Karten, lose Karten je 1 — zusammen
  // darf das den Pool nicht sprengen (kleiner Puffer bleibt für die Joker-Wahl übrig)
  let chestCount = Math.min(a * MAZE_CHESTS_PER_PLAYER, Math.floor(candidates.length * 0.35));
  let looseCount = Math.min(a * MAZE_CARDS_PER_PLAYER, Math.floor(candidates.length * 0.35));
  const budget = getCardPool(lobby).length - 4;
  while (2 * chestCount + looseCount > budget && (chestCount > 0 || looseCount > 0)) {
    if (looseCount >= chestCount) looseCount--; else chestCount--;
  }

  // Erst ALLE Positionen gleichmäßig streuen (Spawns und Joker-Mitte gelten als besetzt),
  // dann die Typen zufällig darauf verteilen — so liegen Kisten und Karten gemischt und
  // trotzdem gleichmäßig übers Labyrinth verteilt
  const spots = mazeSpreadPositions(
    walls, W, H, candidates, chestCount + looseCount,
    [...usedSpawns.map(s => ({ x: s.x, y: s.y })), center],
  );
  const kinds = shuffle([
    ...Array.from({ length: chestCount }, () => 'chest'),
    ...Array.from({ length: looseCount }, () => 'card'),
  ]).slice(0, spots.length);

  // Kisteninhalte werden JETZT fest ausgewürfelt — jede Kiste zeigt jedem Spieler dieselben
  // 2 Karten, egal wer sie wann öffnet. Alle Karten in EINEM Zug ziehen: die Items landen
  // erst danach in g.items, zwei getrennte Ziehungen könnten dieselbe Karte liefern.
  const chestNeeded = kinds.filter(k => k === 'chest').length;
  const looseNeeded = kinds.filter(k => k === 'card').length;
  const drawn = mazeDrawCards(lobby, chestNeeded * 2 + looseNeeded);
  const chestCards = drawn.slice(0, chestNeeded * 2);
  const looseCards = drawn.slice(chestNeeded * 2);
  let chestIdx = 0, looseIdx = 0;
  spots.forEach((t, i) => {
    if (kinds[i] === 'chest') {
      const options = chestCards.slice(chestIdx * 2, chestIdx * 2 + 2);
      if (options.length < 2) return;
      chestIdx++;
      g.items.push({ id: `i${g.nextItemId++}`, kind: 'chest', x: t.x, y: t.y, options });
    } else {
      const card = looseCards[looseIdx++];
      if (!card) return;
      g.items.push({ id: `i${g.nextItemId++}`, kind: 'card', x: t.x, y: t.y, card });
    }
  });
  g.items.push({ id: `i${g.nextItemId++}`, kind: 'joker', x: center.x, y: center.y });

  io.to(lobby.code).emit('clash:gameStart', { mode: 'dark-maze' });
  io.to(lobby.code).emit('clash:maze:state', buildMazeState(lobby));
  startMazeTick(lobby, io);
}

registerMode({
  id: 'dark-maze',
  gameType: 'dark-maze',
  settings: {
    mazeTimeSeconds: {
      default: MAZE_TIME_DEFAULT,
      event: 'clash:setMazeTime',
      payloadKey: 'seconds',
      sanitize: (v) => Math.max(30, Math.min(600, Number(v) || MAZE_TIME_DEFAULT)),
    },
  },
  // Die Item-Anzahl schrumpft automatisch mit dem Pool (Budget-Check beim Generieren) —
  // das Minimum ist nur, dass das Auffüllen am Ende alle Decks eindeutig bestücken kann
  requiredPool: (lobby, active) => active * 8 + 2,
  start: (lobby, io) => startDarkMaze(lobby, io),
  buildState: (lobby) => ({ event: 'clash:maze:state', payload: buildMazeState(lobby) }),
  remapPlayerId: (game, oldId, newId) => {
    if (game.positions?.[oldId]) {
      game.positions[newId] = game.positions[oldId];
      delete game.positions[oldId];
      // Nach einem Reconnect zählt der Client seine Züge wieder bei 1 — die alte
      // Quittungsnummer würde jeden neuen Zug als "längst erledigt" abstempeln.
      game.positions[newId].seq = 0;
    }
    if (game.drafts?.[oldId]) { game.drafts[newId] = game.drafts[oldId]; delete game.drafts[oldId]; }
  },
  onPlayerLeft: (lobby, io, playerId) => {
    const g = lobby.game;
    delete g.drafts[playerId];
    delete g.positions[playerId];
    g.posDirty = true;
    io.to(lobby.code).emit('clash:maze:state', buildMazeState(lobby));
    checkMazeEnd(lobby, io);
  },
  // Reaktivierte brauchen eine Position, neue Zuschauer verlieren ihr offenes Popup
  onSpectatorChanged: (lobby, io, player) => {
    const g = lobby.game;
    if (g.finished) return;
    if (player.isSpectator) {
      delete g.drafts[player.id];
      delete g.positions[player.id];
    } else if (!g.positions[player.id]) {
      const spawns = mazeSpawnPoints(g.W, g.H);
      const s = spawns[lobby.players.filter(p => !p.isSpectator && !p.left).length % spawns.length];
      g.positions[player.id] = mazePosition(s.x, s.y, 1);
    }
    g.posDirty = true;
    io.to(lobby.code).emit('clash:maze:state', buildMazeState(lobby));
    checkMazeEnd(lobby, io);
  },

  socketHandlers: {
    'clash:maze:move': ({ socket, io }, { code, dir, seq }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'dark-maze' || lobby.game.finished) return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      const pos = g.positions[player.id];
      if (!pos) return;
      // Jeder Zug wird quittiert — auch ein abgelehnter. Der Client verwirft daraufhin
      // genau die Schritte, die der Server nicht übernommen hat, statt bis zur nächsten
      // Abweichung weiterzulaufen und dann mehrere Kacheln weit zurückzuspringen.
      const ack = () => {
        if (typeof seq === 'number' && seq > (pos.seq || 0)) { pos.seq = seq; g.posDirty = true; }
      };
      if (g.drafts[player.id]) return ack(); // offenes Kisten-/Joker-Popup friert den Spieler ein
      const now = Date.now();
      if (g.countdownUntil && now < g.countdownUntil) return ack();
      const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
      if (!D) return ack();
      const nx = pos.x + D[0], ny = pos.y + D[1];
      if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H || g.walls[ny][nx] === 1) return ack();
      if (!mazeSpendStep(pos, now)) return ack();
      pos.x = nx; pos.y = ny;
      if (D[0] !== 0) pos.dir = D[0];
      ack();
      g.posDirty = true;
      // Kein Item löst beim Betreten aus — das erledigt 'clash:maze:pickup'
    },

    'clash:maze:pickup': ({ socket, io }, { code }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'dark-maze' || lobby.game.finished) return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      const pos = g.positions[player.id];
      if (!pos || g.drafts[player.id]) return;
      const now = Date.now();
      if (g.countdownUntil && now < g.countdownUntil) return;
      // Kiste, Joker und lose Karte werden alle bewusst aufgenommen. Das Item wird dabei
      // sofort aus g.items entfernt — presst ein zweiter Spieler auf derselben Kachel
      // eine Millisekunde später die Leertaste, findet er nichts mehr vor.
      const item = g.items.find(it => it.x === pos.x && it.y === pos.y);
      if (!item) return;
      if ((player.deck || []).length >= MAZE_DECK_SIZE)
        return emitClashError(socket, 'deckFull');
      const champCount = (player.deck || []).filter(c => c.isChampion).length;

      if (item.kind === 'chest') {
        // Inhalt wurde bei der Generierung festgelegt — für alle Spieler dieselben Karten.
        // Kann der Spieler keine der Optionen nehmen (Champion-Limit), bleibt die Kiste zu.
        const pickable = (item.options || []).filter(c => !(c.isChampion && champCount >= 2));
        if (!pickable.length)
          return emitClashError(socket, 'championLimit');
        g.items = g.items.filter(it2 => it2.id !== item.id);
        g.drafts[player.id] = { kind: 'chest', options: item.options, openedAt: now };
        return io.to(code).emit('clash:maze:state', buildMazeState(lobby));
      }

      if (item.kind === 'joker') {
        g.items = g.items.filter(it2 => it2.id !== item.id);
        g.drafts[player.id] = { kind: 'joker', openedAt: now };
        return io.to(code).emit('clash:maze:state', buildMazeState(lobby));
      }

      if (item.card.isChampion && champCount >= 2)
        return emitClashError(socket, 'championLimit');
      g.items = g.items.filter(it2 => it2.id !== item.id);
      player.deck = [...(player.deck || []), item.card];
      io.to(code).emit('clash:maze:state', buildMazeState(lobby));
      checkMazeEnd(lobby, io);
    },

    'clash:maze:draftPick': ({ socket, io }, { code, choice }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'dark-maze' || lobby.game.finished) return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      const draft = g.drafts[socket.id];
      if (!player || !draft || draft.kind !== 'chest') return;
      const card = draft.options?.[Number(choice)];
      if (!card) return;
      const champCount = (player.deck || []).filter(c => c.isChampion).length;
      if (card.isChampion && champCount >= 2)
        return emitClashError(socket, 'championLimit');
      delete g.drafts[socket.id];
      if ((player.deck || []).length < MAZE_DECK_SIZE) {
        player.deck = [...(player.deck || []), card];
      }
      io.to(code).emit('clash:maze:state', buildMazeState(lobby));
      checkMazeEnd(lobby, io);
    },

    // Popup schließen, ohne eine Karte zu nehmen (Kiste/Joker sind trotzdem verbraucht)
    'clash:maze:closeDraft': ({ socket, io }, { code }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'dark-maze' || lobby.game.finished) return;
      const g = lobby.game;
      if (!g.drafts[socket.id]) return;
      delete g.drafts[socket.id];
      io.to(code).emit('clash:maze:state', buildMazeState(lobby));
    },

    'clash:maze:jokerPick': ({ socket, io }, { code, cardId }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'dark-maze' || lobby.game.finished) return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      const draft = g.drafts[socket.id];
      if (!player || !draft || draft.kind !== 'joker') return;
      const card = getCardPool(lobby).find(c => c.id === cardId);
      if (!card) return;
      if (mazeUsedCardIds(lobby).has(card.id))
        return emitClashError(socket, 'cardTaken');
      const champCount = (player.deck || []).filter(c => c.isChampion).length;
      if (card.isChampion && champCount >= 2)
        return emitClashError(socket, 'championLimit');
      delete g.drafts[socket.id];
      if ((player.deck || []).length < MAZE_DECK_SIZE) {
        player.deck = [...(player.deck || []), { id: card.id, name: card.name, rarity: card.rarity, isChampion: card.isChampion }];
      }
      io.to(code).emit('clash:maze:state', buildMazeState(lobby));
      checkMazeEnd(lobby, io);
    },
  },
});
