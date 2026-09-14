// ── Elixir Rush 2v2 ──────────────────────────────────────────────────────────
// Variante von elixirRush.js für Duo-Teams (siehe core/teams.js): jeder Spieler hat seinen
// EIGENEN, unabhängigen Marktplatz (dieselbe Karte darf gleichzeitig im Markt des Partners
// liegen — die beiden Bretter kennen sich nicht), aber beide teilen sich EINE Elixierleiste
// pro Team, die etwas schneller auflädt und mehr fasst als im Solo-Modus.
//
// Bewusst kein Refactor von elixirRush.js selbst (Risiko für den laufenden Solo-Modus) —
// diese Datei kopiert die kleinen reinen Helfer (Karte ziehen, Slot füllen, Kauf anwenden)
// und passt sie auf "pro Spieler ein Markt, pro Team ein Elixierwert" an.

const { getCardPool, getElixirCost } = require('../core/cards');
const { lobbies } = require('../core/lobbies');
const { clearTurnTimer } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const { isDuoTeamsReady } = require('../core/teams');

const RUSH2V2_ELIXIR_MS = 1500;      // ~14% schneller als Solo (1750ms) — "lädt ein bisschen schneller auf"
// Kapazität des geteilten Team-Balkens ist jetzt Host-einstellbar (rush2v2MaxElixir),
// die Aufladerate bleibt fix. Startwert bleibt bei 20% der Kapazität — dasselbe
// Verhältnis wie im Solo-Modus (Start 2 von max. 10).
const RUSH2V2_MAX_ELIXIR_DEFAULT = 20;
const RUSH2V2_MAX_ELIXIR_MIN = 10;
const RUSH2V2_MAX_ELIXIR_MAX = 40;
const RUSH2V2_START_ELIXIR_RATIO = 0.2;
const RUSH2V2_AUTOBUY_MS = 3000;
const RUSH2V2_TICK_MS = 250;
const RUSH2V2_COUNTDOWN_MS = 5000;
const RUSH2V2_DECK_SIZE = 8;
const RUSH2V2_MARKET_SIZES = [3, 4, 5, 6, 7, 8];
const RUSH2V2_LIFETIMES = [4, 6, 8, 10, 15, 20, 30];
const RUSH2V2_LIFETIME_DEFAULT = 8;
const RUSH2V2_MARKET_SIZE_DEFAULT = 5;

function rush2v2ComputeElixir(g, teamId, now = Date.now()) {
  const e = g.teamElixir[teamId];
  if (!e) return 0;
  return Math.min(g.maxElixir, e.value + (now - e.ts) / RUSH2V2_ELIXIR_MS);
}

function rush2v2SetElixir(g, teamId, value, now = Date.now()) {
  const e = g.teamElixir[teamId];
  if (!e) return;
  e.value = Math.max(0, Math.min(g.maxElixir, value));
  e.ts = now;
}

// Nur das EIGENE Deck und der EIGENE Markt zählen als "vergeben" — dieselbe Karte darf im
// Markt des Partners gleichzeitig liegen, die beiden Bretter sind bewusst unabhängig
// (anders als der eine geteilte Markt im Solo-Modus, wo niemand doppelt dieselbe Karte hält).
function rush2v2DrawCard(lobby, playerId) {
  const g = lobby.game;
  const now = Date.now();
  const player = lobby.players.find(p => p.id === playerId);
  const myMarket = g.markets[playerId] || [];
  const usedIds = new Set([
    ...(player?.deck || []).map(c => c.id),
    ...myMarket.filter(s => s?.card).map(s => s.card.id),
  ]);
  const pool = getCardPool(lobby).filter(c => !usedIds.has(c.id));
  const recent = g.recentUntil[playerId] || {};
  let fresh = pool.filter(c => (recent[c.id] || 0) <= now);
  if (!fresh.length) fresh = pool; // Notfall: Cooldown ignorieren statt leerer Slot
  if (!fresh.length) return null;
  const base = fresh[Math.floor(Math.random() * fresh.length)];
  return { id: base.id, name: base.name, rarity: base.rarity, isChampion: base.isChampion, cost: getElixirCost(base.id) };
}

function rush2v2FillSlot(lobby, playerId, slotIdx, changeType, buyerInfo = null, prevCard = null) {
  const g = lobby.game;
  const now = Date.now();
  const card = rush2v2DrawCard(lobby, playerId);
  const market = g.markets[playerId];
  const seq = (market[slotIdx]?.seq || 0) + 1;
  market[slotIdx] = {
    card, seq,
    spawnedAt: now,
    expiresAt: card ? now + g.cardLifetimeMs : 0,
    lastChange: { type: changeType, at: now, prevCard, ...(buyerInfo || {}) },
  };
}

function buildRush2v2State(lobby) {
  const g = lobby.game;
  const now = Date.now();
  return {
    type: 'elixir-rush-2v2',
    finished: g.finished,
    marketSize: g.marketSize,
    cardLifetimeMs: g.cardLifetimeMs,
    countdownUntil: g.countdownUntil || null,
    // Kein eigener Host-Regler dafür in 2v2 (anders als rushShowTimer im Solo-Modus) —
    // der Restzeit-Balken pro Marktkarte ist hier immer an.
    showTimer: true,
    regenMs: RUSH2V2_ELIXIR_MS,
    autoBuyMs: RUSH2V2_AUTOBUY_MS,
    maxElixir: g.maxElixir,
    deckSize: RUSH2V2_DECK_SIZE,
    serverNow: now,
    // Ein Markt pro Spieler statt eines einzigen geteilten Arrays wie im Solo-Modus
    markets: g.markets,
    teamElixir: { A: rush2v2ComputeElixir(g, 'A', now), B: rush2v2ComputeElixir(g, 'B', now) },
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      teamId: p.teamId, teamSlot: p.teamSlot,
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
      fullDeadline: g.fullSince[p.id] ? g.fullSince[p.id] + RUSH2V2_AUTOBUY_MS : null,
    })),
  };
}

// Leichter Sync (jede Sekunde): nur die beiden Team-Elixierwerte + Auto-Kauf-Fristen
function buildRush2v2Sync(lobby) {
  const g = lobby.game;
  const now = Date.now();
  return {
    serverNow: now,
    teamElixir: { A: rush2v2ComputeElixir(g, 'A', now), B: rush2v2ComputeElixir(g, 'B', now) },
    players: lobby.players.filter(p => !p.isSpectator).map(p => ({
      id: p.id,
      fullDeadline: g.fullSince[p.id] ? g.fullSince[p.id] + RUSH2V2_AUTOBUY_MS : null,
    })),
  };
}

function checkRush2v2End(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'elixir-rush-2v2' || g.finished) return;
  const active = lobby.players.filter(p => !p.isSpectator && !p.left);
  if (!active.length) return;
  if (!active.every(p => (p.deck || []).length >= RUSH2V2_DECK_SIZE)) return;

  clearTurnTimer(lobby);
  g.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'elixir-rush-2v2',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  io.to(lobby.code).emit('clash:rush2v2:state', buildRush2v2State(lobby));
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// Kauf ausführen (manuell oder Auto-Kauf). Zieht vom TEAM-Elixier, füllt nur den EIGENEN Slot.
function rush2v2ApplyBuy(lobby, player, slotIdx, io, isAuto = false) {
  const g = lobby.game;
  const now = Date.now();
  if (g.countdownUntil && now < g.countdownUntil) return { ok: false, reason: 'countdown' };
  const market = g.markets[player.id];
  const slot = market?.[slotIdx];
  if (!slot?.card) return { ok: false, reason: 'late' };
  const card = slot.card;
  if ((player.deck || []).length >= RUSH2V2_DECK_SIZE) return { ok: false, reason: 'deckfull' };
  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  if (card.isChampion && champCount >= 2) return { ok: false, reason: 'champion' };
  const teamId = player.teamId;
  const elixir = rush2v2ComputeElixir(g, teamId, now);
  if (elixir + 1e-9 < card.cost) return { ok: false, reason: 'elixir' };

  rush2v2SetElixir(g, teamId, elixir - card.cost, now);
  g.fullSince[player.id] = null;
  player.deck = [...(player.deck || []), { id: card.id, name: card.name, rarity: card.rarity, isChampion: card.isChampion }];

  rush2v2FillSlot(lobby, player.id, slotIdx, 'buy', {
    buyerId: player.id, buyerName: player.name, buyerColor: player.color, isAuto,
  }, card);

  io.to(lobby.code).emit('clash:rush2v2:state', buildRush2v2State(lobby));
  checkRush2v2End(lobby, io);
  return { ok: true };
}

// Anti-AFK: eigener Idle-Timer pro Spieler, prüft aber den GETEILTEN Team-Füllstand — ist
// der Pool voll und ein Spieler kauft 3s lang nichts vom eigenen Markt, bekommt er eine
// zufällige Karte aus dem eigenen Markt zugelost.
function rush2v2AutoBuy(lobby, player, io) {
  const g = lobby.game;
  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  const market = g.markets[player.id] || [];
  const options = market
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s?.card && !(s.card.isChampion && champCount >= 2));
  if (!options.length) {
    g.fullSince[player.id] = Date.now();
    return;
  }
  const { i } = options[Math.floor(Math.random() * options.length)];
  rush2v2ApplyBuy(lobby, player, i, io, true);
}

function startRush2v2Tick(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  let tickCount = 0;
  g.timerInterval = setInterval(() => {
    if (lobby.game !== g || g.finished) return;
    const now = Date.now();
    if (g.countdownUntil && now < g.countdownUntil) return; // Start-Countdown — Märkte pausiert
    let marketChanged = false;

    lobby.players.forEach(p => {
      if (p.isSpectator || p.left) return;
      const market = g.markets[p.id];
      if (!market) return;

      market.forEach((slot, i) => {
        if (!slot?.card) {
          if (tickCount % 8 === 0) {
            const refill = rush2v2DrawCard(lobby, p.id);
            if (refill) { rush2v2FillSlot(lobby, p.id, i, 'swap', null, null); marketChanged = true; }
          }
          return;
        }
        if (now >= slot.expiresAt) {
          g.recentUntil[p.id] = g.recentUntil[p.id] || {};
          g.recentUntil[p.id][slot.card.id] = now + g.repeatCooldownMs;
          rush2v2FillSlot(lobby, p.id, i, 'swap', null, slot.card);
          marketChanged = true;
        }
      });

      if ((p.deck || []).length >= RUSH2V2_DECK_SIZE) { g.fullSince[p.id] = null; return; }
      if (rush2v2ComputeElixir(g, p.teamId, now) >= g.maxElixir - 1e-9) {
        if (!g.fullSince[p.id]) g.fullSince[p.id] = now;
        else if (now - g.fullSince[p.id] >= RUSH2V2_AUTOBUY_MS) rush2v2AutoBuy(lobby, p, io);
      } else {
        g.fullSince[p.id] = null;
      }

      // Test-Bot: kauft aktiv, sobald etwas Erschwingliches im eigenen Markt liegt — wartet
      // NICHT erst wie beim Anti-AFK-Fall oben auf einen vollen Balken. g.botNextActionAt
      // sorgt für eine kleine, zufällige Pause zwischen zwei Käufen desselben Bots, statt dass
      // er den Markt jeden Tick (250ms) leerräumt, sobald er kann.
      if (p.isBot) {
        if (!g.botNextActionAt[p.id] || now >= g.botNextActionAt[p.id]) {
          const elixir = rush2v2ComputeElixir(g, p.teamId, now);
          const champCount = (p.deck || []).filter(c => c.isChampion).length;
          const options = market
            .map((s, i) => ({ s, i }))
            .filter(({ s }) => s?.card && s.card.cost <= elixir + 1e-9 && !(s.card.isChampion && champCount >= 2));
          if (options.length) {
            const { i } = options[Math.floor(Math.random() * options.length)];
            rush2v2ApplyBuy(lobby, p, i, io, false);
            g.botNextActionAt[p.id] = now + 500 + Math.random() * 1200;
          } else {
            g.botNextActionAt[p.id] = now + 300;
          }
        }
      }
    });

    tickCount++;
    if (marketChanged) {
      io.to(lobby.code).emit('clash:rush2v2:state', buildRush2v2State(lobby));
    } else if (tickCount % 4 === 0) {
      io.to(lobby.code).emit('clash:rush2v2:sync', buildRush2v2Sync(lobby));
    }
  }, RUSH2V2_TICK_MS);
}

function newMarket(lobby, playerId, marketSize, countdownUntil) {
  lobby.game.markets[playerId] = Array.from({ length: marketSize }, () => null);
  lobby.game.fullSince[playerId] = null;
  for (let i = 0; i < marketSize; i++) rush2v2FillSlot(lobby, playerId, i, 'spawn', null, null);
  // Karten sollen erst NACH dem Countdown ablaufen, sonst wechseln sie schon, bevor gekauft
  // werden durfte (siehe elixirRush.js — dieselbe Überlegung).
  lobby.game.markets[playerId].forEach(slot => { if (slot) slot.expiresAt = countdownUntil + lobby.game.cardLifetimeMs; });
}

function startElixirRush2v2(lobby, io) {
  const marketSize = RUSH2V2_MARKET_SIZES.includes(lobby.rush2v2MarketSize) ? lobby.rush2v2MarketSize : RUSH2V2_MARKET_SIZE_DEFAULT;
  const lifeSec = RUSH2V2_LIFETIMES.includes(lobby.rush2v2CardLifetime) ? lobby.rush2v2CardLifetime : RUSH2V2_LIFETIME_DEFAULT;
  const maxElixir = Number.isInteger(lobby.rush2v2MaxElixir) && lobby.rush2v2MaxElixir >= RUSH2V2_MAX_ELIXIR_MIN && lobby.rush2v2MaxElixir <= RUSH2V2_MAX_ELIXIR_MAX
    ? lobby.rush2v2MaxElixir
    : RUSH2V2_MAX_ELIXIR_DEFAULT;
  const startElixir = Math.round(maxElixir * RUSH2V2_START_ELIXIR_RATIO);
  const now = Date.now();
  const countdownUntil = now + RUSH2V2_COUNTDOWN_MS;
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  activePlayers.forEach(p => { p.deck = []; });

  lobby.game = {
    type: 'elixir-rush-2v2',
    marketSize,
    cardLifetimeMs: lifeSec * 1000,
    repeatCooldownMs: Math.max(15000, lifeSec * 2000),
    maxElixir,
    markets: {}, recentUntil: {}, fullSince: {}, botNextActionAt: {},
    teamElixir: {
      A: { value: startElixir, ts: now },
      B: { value: startElixir, ts: now },
    },
    finished: false, timerInterval: null, countdownUntil,
  };
  activePlayers.forEach(p => newMarket(lobby, p.id, marketSize, countdownUntil));

  io.to(lobby.code).emit('clash:gameStart', { mode: 'elixir-rush-2v2' });
  io.to(lobby.code).emit('clash:rush2v2:state', buildRush2v2State(lobby));
  startRush2v2Tick(lobby, io);
}

registerMode({
  id: 'elixir-rush-2v2',
  gameType: 'elixir-rush-2v2',
  partyModes: ['duo'],
  settings: {
    rush2v2MarketSize: {
      default: RUSH2V2_MARKET_SIZE_DEFAULT,
      event: 'clash:setRush2v2MarketSize',
      payloadKey: 'count',
      sanitize: (v) => (RUSH2V2_MARKET_SIZES.includes(Number(v)) ? Number(v) : undefined),
    },
    rush2v2CardLifetime: {
      default: RUSH2V2_LIFETIME_DEFAULT,
      event: 'clash:setRush2v2Lifetime',
      payloadKey: 'seconds',
      sanitize: (v) => (RUSH2V2_LIFETIMES.includes(Number(v)) ? Number(v) : undefined),
    },
    // Kapazität des geteilten Team-Balkens — Startwert skaliert proportional mit
    // (siehe startElixirRush2v2), die Aufladerate selbst bleibt fix.
    rush2v2MaxElixir: {
      default: RUSH2V2_MAX_ELIXIR_DEFAULT,
      event: 'clash:setRush2v2MaxElixir',
      payloadKey: 'amount',
      sanitize: (v) => Math.max(RUSH2V2_MAX_ELIXIR_MIN, Math.min(RUSH2V2_MAX_ELIXIR_MAX, Math.round(Number(v)) || RUSH2V2_MAX_ELIXIR_DEFAULT)),
    },
  },
  // Zwei unabhängige Märkte, die sich keine Karten teilen müssen — jeder braucht 8 Karten
  // plus seinen eigenen befüllbaren Markt.
  requiredPool: (lobby) => 2 * (RUSH2V2_DECK_SIZE + (lobby.rush2v2MarketSize || RUSH2V2_MARKET_SIZE_DEFAULT)),
  canStart: (lobby) => (isDuoTeamsReady(lobby) ? null : { key: 'teamsNotReady' }),
  start: (lobby, io) => startElixirRush2v2(lobby, io),
  buildState: (lobby) => ({ event: 'clash:rush2v2:state', payload: buildRush2v2State(lobby) }),
  remapPlayerId: (game, oldId, newId) => {
    if (game.markets?.[oldId]) { game.markets[newId] = game.markets[oldId]; delete game.markets[oldId]; }
    if (game.recentUntil?.[oldId]) { game.recentUntil[newId] = game.recentUntil[oldId]; delete game.recentUntil[oldId]; }
    if (game.fullSince && Object.prototype.hasOwnProperty.call(game.fullSince, oldId)) {
      game.fullSince[newId] = game.fullSince[oldId]; delete game.fullSince[oldId];
    }
    Object.values(game.markets || {}).forEach(market => {
      market.forEach(s => { if (s?.lastChange?.buyerId === oldId) s.lastChange.buyerId = newId; });
    });
  },
  onPlayerLeft: (lobby, io) => {
    io.to(lobby.code).emit('clash:rush2v2:state', buildRush2v2State(lobby));
    checkRush2v2End(lobby, io);
  },
  // Reaktivierte Spieler brauchen einen eigenen Markt; wird jemand Zuschauer, könnte das
  // Spiel dadurch beendet sein (alle übrigen Decks voll) — dieselbe Überlegung wie Solo.
  onSpectatorChanged: (lobby, io, player) => {
    if (lobby.game.finished) return;
    if (!player.isSpectator && !lobby.game.markets[player.id]) {
      newMarket(lobby, player.id, lobby.game.marketSize, Date.now());
    }
    io.to(lobby.code).emit('clash:rush2v2:state', buildRush2v2State(lobby));
    checkRush2v2End(lobby, io);
  },
  socketHandlers: {
    // Kauf-Klick: nur der EIGENE Markt (g.markets[socket.id]) ist erreichbar — es gibt
    // keinen Zielspieler-Parameter, ein Kauf vom Markt des Partners ist so ausgeschlossen.
    'clash:rush2v2:buy': ({ socket, io }, { code, slotIdx, seq }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'elixir-rush-2v2' || lobby.game.finished) return;
      const g = lobby.game;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator || player.left) return;
      const market = g.markets[socket.id];
      if (!market || !Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= market.length) return;
      const slot = market[slotIdx];
      if (!slot?.card || (typeof seq === 'number' && slot.seq !== seq)) {
        return socket.emit('clash:rush2v2:denied', { slotIdx, reason: 'late' });
      }
      const res = rush2v2ApplyBuy(lobby, player, slotIdx, io, false);
      if (!res.ok) socket.emit('clash:rush2v2:denied', { slotIdx, reason: res.reason });
    },
  },
});
