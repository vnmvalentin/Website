// ── Elixir Rush ─────────────────────────────────────────────────────────────
// Echtzeit-Marktplatz: Elixier lädt kontinuierlich nach, Karten liegen mit ihren echten
// Elixierkosten aus und werden nach Ablaufzeit ausgetauscht. Wer zuerst klickt, bekommt sie.

const { getCardPool, getElixirCost } = require('../core/cards');
const { lobbies } = require('../core/lobbies');
const { clearTurnTimer } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');

const RUSH_ELIXIR_MS     = 1750;   // 1 Elixier pro 1,75s
const RUSH_START_ELIXIR  = 2;
const RUSH_MAX_ELIXIR    = 10;
const RUSH_AUTOBUY_MS    = 3000;  // voller Balken ohne Kauf → nach 10s zufällige Karte
const RUSH_TICK_MS       = 250;

const RUSH_COUNTDOWN_MS  = 5000;
const RUSH_DECK_SIZE     = 8;
const RUSH_MARKET_SIZES  = [3, 4, 5, 6, 7, 8];
const RUSH_LIFETIMES     = [4, 6, 8, 10, 15, 20, 30]; // Sekunden pro Karte auf dem Markt
// 15 Sekunden waren zu gemütlich: Der Markt stand länger still, als man zum Entscheiden
// braucht, und „Rush" hieß vor allem Warten. Bei 8 Sekunden dreht sich das Angebot
// spürbar, ohne dass man die Karten nicht mehr lesen kann.
const RUSH_LIFETIME_DEFAULT = 8;
const RUSH_MARKET_SIZE_DEFAULT = 5;

function rushComputeElixir(g, playerId, now = Date.now()) {
  const e = g.elixir[playerId];
  if (!e) return 0;
  return Math.min(RUSH_MAX_ELIXIR, e.value + (now - e.ts) / RUSH_ELIXIR_MS);
}

function rushSetElixir(g, playerId, value, now = Date.now()) {
  const e = g.elixir[playerId];
  if (!e) return;
  e.value = Math.max(0, Math.min(RUSH_MAX_ELIXIR, value));
  e.ts = now;
}

// Neue Marktkarte ziehen: nie eine Karte, die schon in einem Deck oder auf dem Markt liegt;
// kürzlich abgelaufene Karten haben einen Cooldown, damit nicht immer dieselben erscheinen.
function rushDrawCard(lobby) {
  const g = lobby.game;
  const now = Date.now();
  const usedIds = new Set([
    ...lobby.players.flatMap(p => (p.deck || []).map(c => c.id)),
    ...g.market.filter(s => s?.card).map(s => s.card.id),
  ]);
  const pool = getCardPool(lobby).filter(c => !usedIds.has(c.id));
  let fresh = pool.filter(c => (g.recentUntil[c.id] || 0) <= now);
  if (!fresh.length) fresh = pool; // Notfall: Cooldown ignorieren statt leerer Slot
  if (!fresh.length) return null;
  const base = fresh[Math.floor(Math.random() * fresh.length)];
  return { id: base.id, name: base.name, rarity: base.rarity, isChampion: base.isChampion, cost: getElixirCost(base.id) };
}

// Slot neu befüllen. lastChange beschreibt für die Clients, WIE der Wechsel passierte
// (Kauf mit Käufer-Info vs. Ablauf) — daran hängen die Animationen im Frontend.
function rushFillSlot(lobby, slotIdx, changeType, buyerInfo = null, prevCard = null) {
  const g = lobby.game;
  const now = Date.now();
  const card = rushDrawCard(lobby);
  const seq = (g.market[slotIdx]?.seq || 0) + 1;
  g.market[slotIdx] = {
    card, seq,
    spawnedAt: now,
    expiresAt: card ? now + g.cardLifetimeMs : 0,
    lastChange: { type: changeType, at: now, prevCard, ...(buyerInfo || {}) },
  };
}

function buildRushState(lobby) {
  const g = lobby.game;
  const now = Date.now();
  return {
    type: 'elixir-rush',
    finished: g.finished,
    marketSize: g.marketSize,
    cardLifetimeMs: g.cardLifetimeMs,
    showElixir: lobby.rushShowElixir ?? false,
    showTimer: lobby.rushShowTimer ?? true,
    countdownUntil: g.countdownUntil || null,
    regenMs: RUSH_ELIXIR_MS,
    autoBuyMs: RUSH_AUTOBUY_MS,
    maxElixir: RUSH_MAX_ELIXIR,
    deckSize: RUSH_DECK_SIZE,
    serverNow: now,
    market: g.market,
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
      elixir: (p.isSpectator || !g.elixir[p.id]) ? 0 : rushComputeElixir(g, p.id, now),
      fullDeadline: g.elixir[p.id]?.fullSince ? g.elixir[p.id].fullSince + RUSH_AUTOBUY_MS : null,
    })),
  };
}

// Leichter Sync (jede Sekunde): nur Elixierstände + Auto-Kauf-Deadlines
function buildRushSync(lobby) {
  const g = lobby.game;
  const now = Date.now();
  return {
    serverNow: now,
    players: lobby.players.filter(p => !p.isSpectator).map(p => ({
      id: p.id,
      elixir: g.elixir[p.id] ? rushComputeElixir(g, p.id, now) : 0,
      fullDeadline: g.elixir[p.id]?.fullSince ? g.elixir[p.id].fullSince + RUSH_AUTOBUY_MS : null,
    })),
  };
}

function checkRushEnd(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'elixir-rush' || g.finished) return;
  const active = lobby.players.filter(p => !p.isSpectator && !p.left);
  if (!active.length) return;
  if (!active.every(p => (p.deck || []).length >= RUSH_DECK_SIZE)) return;

  clearTurnTimer(lobby);
  g.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'elixir-rush',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  io.to(lobby.code).emit('clash:rush:state', buildRushState(lobby));
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// Kauf ausführen (manuell oder Auto-Kauf). Gibt { ok } bzw. { ok: false, reason } zurück.
function rushApplyBuy(lobby, player, slotIdx, io, isAuto = false) {
  const g = lobby.game;
  const now = Date.now();
  if (g.countdownUntil && now < g.countdownUntil) return { ok: false, reason: 'countdown' };
  const slot = g.market[slotIdx];
  if (!slot?.card) return { ok: false, reason: 'late' };
  const card = slot.card;
  if ((player.deck || []).length >= RUSH_DECK_SIZE) return { ok: false, reason: 'deckfull' };
  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  if (card.isChampion && champCount >= 2) return { ok: false, reason: 'champion' };
  const elixir = rushComputeElixir(g, player.id, now);
  if (elixir + 1e-9 < card.cost) return { ok: false, reason: 'elixir' };

  rushSetElixir(g, player.id, elixir - card.cost, now);
  if (g.elixir[player.id]) g.elixir[player.id].fullSince = null;
  player.deck = [...(player.deck || []), { id: card.id, name: card.name, rarity: card.rarity, isChampion: card.isChampion }];

  rushFillSlot(lobby, slotIdx, 'buy', {
    buyerId: player.id, buyerName: player.name, buyerColor: player.color, isAuto,
  }, card);

  io.to(lobby.code).emit('clash:rush:state', buildRushState(lobby));
  checkRushEnd(lobby, io);
  return { ok: true };
}

// Anti-AFK: Wer 10s lang mit vollem Balken nichts kauft, bekommt eine zufällige Marktkarte
function rushAutoBuy(lobby, player, io) {
  const g = lobby.game;
  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  const options = g.market
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s?.card && !(s.card.isChampion && champCount >= 2));
  if (!options.length) {
    // Gerade nichts Kaufbares — Frist neu starten und später erneut versuchen
    if (g.elixir[player.id]) g.elixir[player.id].fullSince = Date.now();
    return;
  }
  const { i } = options[Math.floor(Math.random() * options.length)];
  rushApplyBuy(lobby, player, i, io, true);
}

function startRushTick(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  let tickCount = 0;
  g.timerInterval = setInterval(() => {
    if (lobby.game !== g || g.finished) return;
    const now = Date.now();
    if (g.countdownUntil && now < g.countdownUntil) return; // noch im Start-Countdown — Marktplatz pausiert
    let marketChanged = false;

    // Abgelaufene Karten austauschen; leere Slots nachfüllen sobald wieder Karten frei sind
    g.market.forEach((slot, i) => {
      if (!slot?.card) {
        if (tickCount % 8 === 0) {
          const refill = rushDrawCard(lobby);
          if (refill) { rushFillSlot(lobby, i, 'swap', null, null); marketChanged = true; }
        }
        return;
      }
      if (now >= slot.expiresAt) {
        g.recentUntil[slot.card.id] = now + g.repeatCooldownMs;
        rushFillSlot(lobby, i, 'swap', null, slot.card);
        marketChanged = true;
      }
    });

    // Auto-Kauf-Überwachung bei vollem Elixierbalken
    for (const p of lobby.players) {
      const e = g.elixir[p.id];
      if (!e) continue;
      if (p.isSpectator || p.left || (p.deck || []).length >= RUSH_DECK_SIZE) { e.fullSince = null; continue; }
      if (rushComputeElixir(g, p.id, now) >= RUSH_MAX_ELIXIR - 1e-9) {
        if (!e.fullSince) e.fullSince = now;
        else if (now - e.fullSince >= RUSH_AUTOBUY_MS) rushAutoBuy(lobby, p, io);
      } else {
        e.fullSince = null;
      }
    }

    tickCount++;
    if (marketChanged) {
      io.to(lobby.code).emit('clash:rush:state', buildRushState(lobby));
    } else if (tickCount % 4 === 0) {
      io.to(lobby.code).emit('clash:rush:sync', buildRushSync(lobby));
    }
  }, RUSH_TICK_MS);
}

function startElixirRush(lobby, io) {
  const marketSize = RUSH_MARKET_SIZES.includes(lobby.rushMarketSize) ? lobby.rushMarketSize : RUSH_MARKET_SIZE_DEFAULT;
  const lifeSec = RUSH_LIFETIMES.includes(lobby.rushCardLifetime) ? lobby.rushCardLifetime : RUSH_LIFETIME_DEFAULT;
  const now = Date.now();
  const countdownUntil = now + RUSH_COUNTDOWN_MS;
  lobby.players.forEach(p => { p.deck = []; });
  lobby.game = {
    type: 'elixir-rush',
    marketSize,
    cardLifetimeMs: lifeSec * 1000,
    // Abgelaufene Karten dürfen erst nach einem Abstand wieder erscheinen
    repeatCooldownMs: Math.max(15000, lifeSec * 2000),
    market: Array.from({ length: marketSize }, () => null),
    recentUntil: {},
    elixir: {},
    finished: false,
    timerInterval: null,
    countdownUntil,
  };
  lobby.players.forEach(p => {
    if (!p.isSpectator) lobby.game.elixir[p.id] = { value: RUSH_START_ELIXIR, ts: now, fullSince: null };
  });
  for (let i = 0; i < marketSize; i++) rushFillSlot(lobby, i, 'spawn', null, null);
  // Karten sollen erst ablaufen NACHDEM der Countdown vorbei ist, sonst wechseln sie schon,
  // bevor überhaupt jemand kaufen durfte
  lobby.game.market.forEach(slot => { if (slot) slot.expiresAt = countdownUntil + lobby.game.cardLifetimeMs; });

  io.to(lobby.code).emit('clash:gameStart', { mode: 'elixir-rush' });
  io.to(lobby.code).emit('clash:rush:state', buildRushState(lobby));
  startRushTick(lobby, io);
}

registerMode({
  id: 'elixir-rush',
  gameType: 'elixir-rush',
  settings: {
    rushMarketSize: {
      default: RUSH_MARKET_SIZE_DEFAULT,
      event: 'clash:setRushMarketSize',
      payloadKey: 'count',
      sanitize: (v) => (RUSH_MARKET_SIZES.includes(Number(v)) ? Number(v) : undefined),
    },
    rushCardLifetime: {
      default: RUSH_LIFETIME_DEFAULT,
      event: 'clash:setRushLifetime',
      payloadKey: 'seconds',
      sanitize: (v) => (RUSH_LIFETIMES.includes(Number(v)) ? Number(v) : undefined),
    },
    rushShowElixir: {
      default: false,
      event: 'clash:setRushShowElixir',
      payloadKey: 'show',
      duringGame: true,
      sanitize: (v) => !!v,
      afterChange: (lobby, io) => {
        if (lobby.game?.type === 'elixir-rush' && !lobby.game.finished) {
          io.to(lobby.code).emit('clash:rush:state', buildRushState(lobby));
        }
      },
    },
    rushShowTimer: {
      default: true,
      event: 'clash:setRushShowTimer',
      payloadKey: 'show',
      duringGame: true,
      sanitize: (v) => !!v,
      afterChange: (lobby, io) => {
        if (lobby.game?.type === 'elixir-rush' && !lobby.game.finished) {
          io.to(lobby.code).emit('clash:rush:state', buildRushState(lobby));
        }
      },
    },
  },
  // Jeder braucht 8 Karten, plus der Markt muss immer befüllbar bleiben
  requiredPool: (lobby, active) => active * 8 + (lobby.rushMarketSize || 5),
  start: (lobby, io) => startElixirRush(lobby, io),
  buildState: (lobby) => ({ event: 'clash:rush:state', payload: buildRushState(lobby) }),
  remapPlayerId: (game, oldId, newId) => {
    if (game.elixir?.[oldId]) { game.elixir[newId] = game.elixir[oldId]; delete game.elixir[oldId]; }
    (game.market || []).forEach(s => { if (s?.lastChange?.buyerId === oldId) s.lastChange.buyerId = newId; });
  },
  onPlayerLeft: (lobby, io) => {
    io.to(lobby.code).emit('clash:rush:state', buildRushState(lobby));
    checkRushEnd(lobby, io);
  },
  // Reaktivierte Spieler brauchen einen Elixierbalken; wird jemand Zuschauer, könnte
  // das Spiel dadurch beendet sein (alle übrigen Decks voll)
  onSpectatorChanged: (lobby, io, player) => {
    if (lobby.game.finished) return;
    if (!player.isSpectator && !lobby.game.elixir[player.id]) {
      lobby.game.elixir[player.id] = { value: RUSH_START_ELIXIR, ts: Date.now(), fullSince: null };
    }
    io.to(lobby.code).emit('clash:rush:state', buildRushState(lobby));
    checkRushEnd(lobby, io);
  },
  socketHandlers: {
    // Kauf-Klick: seq stellt sicher, dass genau DIE Karte gekauft wird, die der Spieler
    // gesehen hat — wurde der Slot inzwischen ersetzt/weggekauft, kommt "zu spät"-Feedback
    'clash:rush:buy': ({ socket, io }, { code, slotIdx, seq }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'elixir-rush' || lobby.game.finished) return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator || player.left) return;
      if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= g.market.length) return;
      const slot = g.market[slotIdx];
      if (!slot?.card || (typeof seq === 'number' && slot.seq !== seq)) {
        return socket.emit('clash:rush:denied', { slotIdx, reason: 'late' });
      }
      const res = rushApplyBuy(lobby, player, slotIdx, io, false);
      if (!res.ok) socket.emit('clash:rush:denied', { slotIdx, reason: res.reason });
    },
  },
});
