// ── Angel Royale ─────────────────────────────────────────────────────────────
// Karten treiben als "Fische" über den Fluss. Ihre komplette Bewegung (Tempo, Wellenlinie,
// Abtauch-Fenster) wird beim Spawn EINMAL ausgewürfelt und mitgeschickt — die Clients rechnen
// die Position deterministisch hoch, es gibt keinen Positions-Sync. Der Server validiert
// Fänge nur gegen Lebenszeit/Abtauch-Fenster/Cooldown.

const { getCardPool } = require('../core/cards');
const { lobbies } = require('../core/lobbies');
const { clearTurnTimer } = require('../core/timers');
const { notifyDraftComplete, updateDeckFeeds } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const FISH_TICK_MS            = 250;
const FISH_DECK_SIZE          = 8;
const FISH_COUNTDOWN_MS       = 3000;
const FISH_CAUGHT_LINGER_MS   = 1100;  // gefangene Karte bleibt kurz im State (Fang-Animation)
const FISH_MAX_ONSCREEN       = 14;
const FISH_REPEAT_COOLDOWN_MS = 12000; // rausgeschwommene Karten kommen nicht sofort wieder
const FISH_SPAWN_RATES        = [0.5, 0.75, 1, 1.5, 2]; // Karten pro Sekunde (cardsPerSecond)
const FISH_SPAWN_RATE_DEFAULT = 1;
const FISH_COOLDOWNS          = [0, 1, 2, 3, 5];        // Angel-Cooldown in Sekunden (catchCooldown)
const FISH_COOLDOWN_DEFAULT   = 3;

function fishingDrawCard(lobby) {
  const g = lobby.game;
  const now = Date.now();
  const usedIds = new Set([
    ...lobby.players.flatMap(p => (p.deck || []).map(c => c.id)),
    ...g.fish.filter(f => !f.caughtBy).map(f => f.card.id),
  ]);
  const pool = getCardPool(lobby).filter(c => !usedIds.has(c.id));
  let fresh = pool.filter(c => (g.recentUntil[c.id] || 0) <= now);
  if (!fresh.length) fresh = pool;
  if (!fresh.length) return null;
  const base = fresh[Math.floor(Math.random() * fresh.length)];
  return { id: base.id, name: base.name, rarity: base.rarity, isChampion: base.isChampion };
}

function spawnFish(lobby) {
  const g = lobby.game;
  const card = fishingDrawCard(lobby);
  if (!card) return false;
  const travelMs = 9000 + Math.random() * 8000; // individuelle Geschwindigkeit pro Karte
  // Abtauch-Fenster: 0-2 Zeiträume, in denen die Karte halbtransparent und klick-immun ist
  const dives = [];
  const diveCount = Math.random() < 0.45 ? (Math.random() < 0.35 ? 2 : 1) : 0;
  let cursor = 1200 + Math.random() * 1500;
  for (let i = 0; i < diveCount; i++) {
    const len = 900 + Math.random() * 1200;
    const latestStart = travelMs - 1500 - len;
    if (cursor >= latestStart) break;
    const start = cursor + Math.random() * ((latestStart - cursor) / (diveCount - i));
    dives.push({ start: Math.round(start), end: Math.round(start + len) });
    cursor = start + len + 700;
  }
  g.fish.push({
    fishId: `f${g.nextFishId++}`,
    card,
    spawnedAt: Date.now(),
    travelMs: Math.round(travelMs),
    dir: Math.random() < 0.5 ? 1 : -1,          // links→rechts oder rechts→links
    laneY: 0.06 + Math.random() * 0.88,         // Grundhöhe (normalisiert 0..1)
    waveAmp: Math.random() < 0.5 ? 0.03 + Math.random() * 0.07 : 0, // 0 = gerade Bahn
    waveFreq: 0.8 + Math.random() * 1.6,        // rad/s
    wavePhase: Math.random() * Math.PI * 2,
    dives,
    caughtBy: null, caughtAt: null, caughtName: null, caughtColor: null,
  });
  return true;
}

function fishIsDiving(fish, now) {
  const age = now - fish.spawnedAt;
  return fish.dives.some(d => age >= d.start && age <= d.end);
}

function buildFishingState(lobby) {
  const g = lobby.game;
  const now = Date.now();
  return {
    type: 'angel-royale',
    finished: g.finished,
    countdownUntil: g.countdownUntil || null,
    serverNow: now,
    deckSize: FISH_DECK_SIZE,
    catchCooldownMs: g.catchCooldownMs,
    spawnRate: g.spawnRate,
    fish: g.fish,
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
      cooldownUntil: g.cooldowns[p.id] || 0,
    })),
  };
}

function checkFishingEnd(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'angel-royale' || g.finished) return;
  const active = lobby.players.filter(p => !p.isSpectator && !p.left);
  if (!active.length) return;
  if (!active.every(p => (p.deck || []).length >= FISH_DECK_SIZE)) return;

  clearTurnTimer(lobby);
  g.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'angel-royale',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  io.to(lobby.code).emit('clash:fish:state', buildFishingState(lobby));
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// Fang ausführen (Klick oder AFK-Autofang). Gibt { ok } bzw. { ok: false, reason } zurück.
function fishingApplyCatch(lobby, player, fishId, io) {
  const g = lobby.game;
  const now = Date.now();
  if (g.countdownUntil && now < g.countdownUntil) return { ok: false, reason: 'countdown' };
  if ((player.deck || []).length >= FISH_DECK_SIZE) return { ok: false, reason: 'deckfull' };
  if ((g.cooldowns[player.id] || 0) > now) return { ok: false, reason: 'cooldown' };
  const fish = g.fish.find(f => f.fishId === fishId);
  if (!fish || fish.caughtBy) return { ok: false, reason: 'late' };
  const age = now - fish.spawnedAt;
  if (age < 0 || age > fish.travelMs) return { ok: false, reason: 'late' };
  if (fishIsDiving(fish, now)) return { ok: false, reason: 'diving' };
  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  if (fish.card.isChampion && champCount >= 2) return { ok: false, reason: 'champion' };

  fish.caughtBy = player.id;
  fish.caughtAt = now;
  fish.caughtName = player.name;
  fish.caughtColor = player.color;
  player.deck = [...(player.deck || []), { ...fish.card }];
  if (g.catchCooldownMs > 0 && player.deck.length < FISH_DECK_SIZE) {
    g.cooldowns[player.id] = now + g.catchCooldownMs;
  }
  updateDeckFeeds(lobby, io);
  io.to(lobby.code).emit('clash:fish:state', buildFishingState(lobby));
  checkFishingEnd(lobby, io);
  return { ok: true };
}

function startFishingTick(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerInterval = setInterval(() => {
    if (lobby.game !== g || g.finished) return;
    const now = Date.now();
    if (g.countdownUntil && now < g.countdownUntil) return;
    let changed = false;

    // Rausgeschwommene und fertig animierte gefangene Fische entfernen
    const keep = [];
    for (const f of g.fish) {
      if (f.caughtBy) {
        if (now - f.caughtAt < FISH_CAUGHT_LINGER_MS) keep.push(f);
        else changed = true;
      } else if (now - f.spawnedAt < f.travelMs) {
        keep.push(f);
      } else {
        g.recentUntil[f.card.id] = now + FISH_REPEAT_COOLDOWN_MS;
        changed = true;
      }
    }
    g.fish = keep;

    // Spawnen gemäß Rate (cardsPerSecond) — solange noch jemand Karten braucht
    const needCards = lobby.players.some(p => !p.isSpectator && !p.left && (p.deck || []).length < FISH_DECK_SIZE);
    const activeFish = g.fish.filter(f => !f.caughtBy).length;
    if (needCards && activeFish < FISH_MAX_ONSCREEN) {
      g.spawnCarry += (FISH_TICK_MS / 1000) * g.spawnRate;
      while (g.spawnCarry >= 1) {
        g.spawnCarry -= 1;
        if (spawnFish(lobby)) changed = true;
        else { g.spawnCarry = 0; break; }
      }
    }

    // Anti-Blockade: Für länger getrennte Spieler wird automatisch geangelt,
    // damit das Spiel für alle anderen enden kann (analog Rush-Auto-Kauf)
    for (const p of lobby.players) {
      if (p.isSpectator || p.left || !p.disconnected) continue;
      if ((p.deck || []).length >= FISH_DECK_SIZE) continue;
      if (now - (p.disconnectedAt || now) < 12000) continue;
      if ((g.cooldowns[p.id] || 0) > now) continue;
      const champBlocked = (p.deck || []).filter(c => c.isChampion).length >= 2;
      const catchable = g.fish.filter(f => {
        if (f.caughtBy) return false;
        const age = now - f.spawnedAt;
        if (age < 0 || age > f.travelMs) return false;
        if (fishIsDiving(f, now)) return false;
        return !(f.card.isChampion && champBlocked);
      });
      if (catchable.length) {
        fishingApplyCatch(lobby, p, catchable[Math.floor(Math.random() * catchable.length)].fishId, io);
        changed = false; // fishingApplyCatch hat bereits gebroadcastet
      }
    }

    if (changed) io.to(lobby.code).emit('clash:fish:state', buildFishingState(lobby));
  }, FISH_TICK_MS);
}

function startAngelRoyale(lobby, io) {
  const now = Date.now();
  lobby.players.forEach(p => { p.deck = []; });
  lobby.game = {
    type: 'angel-royale',
    fish: [],
    nextFishId: 1,
    cooldowns: {},
    recentUntil: {},
    spawnCarry: 1.4, // direkt nach dem Countdown tauchen die ersten Karten auf
    spawnRate: FISH_SPAWN_RATES.includes(lobby.fishSpawnRate) ? lobby.fishSpawnRate : FISH_SPAWN_RATE_DEFAULT,
    catchCooldownMs: (FISH_COOLDOWNS.includes(lobby.fishCatchCooldown) ? lobby.fishCatchCooldown : FISH_COOLDOWN_DEFAULT) * 1000,
    finished: false,
    timerInterval: null,
    countdownUntil: now + FISH_COUNTDOWN_MS,
  };
  io.to(lobby.code).emit('clash:gameStart', { mode: 'angel-royale' });
  io.to(lobby.code).emit('clash:fish:state', buildFishingState(lobby));
  startFishingTick(lobby, io);
}

registerMode({
  id: 'angel-royale',
  gameType: 'angel-royale',
  settings: {
    fishSpawnRate: {
      default: FISH_SPAWN_RATE_DEFAULT,
      event: 'clash:setFishSpawnRate',
      payloadKey: 'rate',
      sanitize: (v) => (FISH_SPAWN_RATES.includes(Number(v)) ? Number(v) : undefined),
    },
    fishCatchCooldown: {
      default: FISH_COOLDOWN_DEFAULT,
      event: 'clash:setFishCooldown',
      payloadKey: 'seconds',
      sanitize: (v) => (FISH_COOLDOWNS.includes(Number(v)) ? Number(v) : undefined),
    },
  },
  // Jeder braucht 8 Karten, plus es müssen immer ein paar Karten im Fluss schwimmen können
  requiredPool: (lobby, active) => active * 8 + 6,
  start: (lobby, io) => startAngelRoyale(lobby, io),
  buildState: (lobby) => ({ event: 'clash:fish:state', payload: buildFishingState(lobby) }),
  remapPlayerId: (game, oldId, newId) => {
    if (game.cooldowns?.[oldId] !== undefined) { game.cooldowns[newId] = game.cooldowns[oldId]; delete game.cooldowns[oldId]; }
    (game.fish || []).forEach(f => { if (f.caughtBy === oldId) f.caughtBy = newId; });
  },
  onPlayerLeft: (lobby, io) => {
    io.to(lobby.code).emit('clash:fish:state', buildFishingState(lobby));
    checkFishingEnd(lobby, io);
  },
  // Der neue Zuschauer war vielleicht der Letzte mit unvollem Deck
  onSpectatorChanged: (lobby, io) => {
    if (lobby.game.finished) return;
    io.to(lobby.code).emit('clash:fish:state', buildFishingState(lobby));
    checkFishingEnd(lobby, io);
  },

  socketHandlers: {
    'clash:fish:catch': ({ socket, io }, { code, fishId }) => {
      const lobby = lobbies.get(code);
      if (!lobby?.game || lobby.game.type !== 'angel-royale' || lobby.game.finished) return;
      const player = lobby.players.find(p => p.id === socket.id);
      if (!player || player.isSpectator) return;
      const result = fishingApplyCatch(lobby, player, fishId, io);
      if (!result.ok) socket.emit('clash:fish:denied', { fishId, reason: result.reason });
    },
  },
});
