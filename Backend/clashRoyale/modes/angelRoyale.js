// ── Angel Royale ─────────────────────────────────────────────────────────────
// Karten treiben als "Fische" über den Fluss. Ihre komplette Bewegung (Tempo, Wellenlinie,
// Abtauch-Fenster) wird beim Spawn EINMAL ausgewürfelt und mitgeschickt — die Clients rechnen
// die Position deterministisch hoch, es gibt keinen Positions-Sync. Der Server validiert
// Fänge nur gegen Lebenszeit/Abtauch-Fenster/Cooldown.

const { getCardPool } = require('../core/cards');
const { lobbies } = require('../core/lobbies');
const { clearTurnTimer } = require('../core/timers');
const { notifyDraftComplete } = require('../core/streamerFeed');
const { registerMode } = require('../core/registry');
const FISH_TICK_MS            = 250;
const FISH_DECK_SIZE          = 8;
const FISH_COUNTDOWN_MS       = 3000;
const FISH_CAUGHT_LINGER_MS   = 1100;  // gefangene Karte bleibt kurz im State (Fang-Animation)
const FISH_MAX_ONSCREEN       = 20;    // mitwachsend zur höheren Spawnrate, sonst wird gedeckelt
const FISH_REPEAT_COOLDOWN_MS = 12000; // rausgeschwommene Karten kommen nicht sofort wieder
// Ein voller Fluss macht den Modus: Bei 1 Karte/Sekunde wartet man die halbe Zeit auf
// überhaupt eine Auswahl. Standard ist deshalb 2 — es liegt fast immer etwas an, und die
// Entscheidung ist „welche nehme ich", nicht „nehme ich das Einzige".
const FISH_SPAWN_RATES        = [1, 1.5, 2, 2.5, 3];    // Karten pro Sekunde (cardsPerSecond)
const FISH_SPAWN_RATE_DEFAULT = 2;
const FISH_COOLDOWNS          = [0, 1, 2, 3, 5];        // Angel-Cooldown in Sekunden (catchCooldown)
const FISH_COOLDOWN_DEFAULT   = 2;
// Angel-Zwang: Wer nach diesem Fenster (ab dem Moment, in dem die Angel wieder bereit ist)
// nicht selbst geangelt hat, bekommt eine zufällige treibende Karte zugelost. Ohne diese
// Strafe könnte man ruhig warten, bis genau die passende Karte vorbeikommt, und sich damit
// ein deutlich besseres Deck bauen als jemand, der zügig entscheidet. 0 = aus.
const FISH_IDLE_SECONDS       = [0, 3, 5, 8, 10];
const FISH_IDLE_DEFAULT       = 5;
const FISH_AFK_MS             = 12000; // getrennte Spieler: zusätzlich zum Angel-Zwang
// "Flitzer": ein Teil der Karten schießt in kurzen Schüben quer durch den Fluss.
// Der Multiplikator gilt gegenüber der Grundgeschwindigkeit DERSELBEN Karte — die Karte
// trödelt zwischen den Schüben also spürbar, damit sie trotzdem nach travelMs am Ufer ist.
const FISH_SPRINT_CHANCE      = 0.18;
const FISH_SPRINT_MULT        = 14;
const FISH_SPRINT_MIN_MS      = 500;
const FISH_SPRINT_MAX_MS      = 900;

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
  // Eine Karte ist entweder Taucher ODER Flitzer — beides zusammen wäre kaum fangbar.
  const isSprinter = Math.random() < FISH_SPRINT_CHANCE;

  // Abtauch-Fenster: 0-2 Zeiträume, in denen die Karte halbtransparent und klick-immun ist
  const dives = [];
  const diveCount = isSprinter ? 0 : (Math.random() < 0.45 ? (Math.random() < 0.35 ? 2 : 1) : 0);
  let cursor = 1200 + Math.random() * 1500;
  for (let i = 0; i < diveCount; i++) {
    const len = 900 + Math.random() * 1200;
    const latestStart = travelMs - 1500 - len;
    if (cursor >= latestStart) break;
    const start = cursor + Math.random() * ((latestStart - cursor) / (diveCount - i));
    dives.push({ start: Math.round(start), end: Math.round(start + len) });
    cursor = start + len + 700;
  }

  // Sprint-Fenster: 1-2 kurze Schübe, in denen die Karte quer durch den Fluss schießt.
  // Fangbar bleibt sie dabei — genau das ist der Reiz.
  const sprints = [];
  if (isSprinter) {
    const sprintCount = Math.random() < 0.4 ? 2 : 1;
    // Gesamtbudget durch die Anzahl teilen: zwei Schübe sind zwei kurze statt zwei langer.
    // Sonst würde die Karte zwischen den Schüben extrem langsam treiben, weil sie ihre
    // Strecke trotzdem in travelMs schaffen muss.
    let sCursor = 900 + Math.random() * 1200;
    for (let i = 0; i < sprintCount; i++) {
      const len = (FISH_SPRINT_MIN_MS + Math.random() * (FISH_SPRINT_MAX_MS - FISH_SPRINT_MIN_MS)) / sprintCount;
      const latestStart = travelMs - 900 - len;
      if (sCursor >= latestStart) break;
      const start = sCursor + Math.random() * ((latestStart - sCursor) / (sprintCount - i));
      sprints.push({ start: Math.round(start), end: Math.round(start + len) });
      sCursor = start + len + 1400;
    }
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
    sprints,
    sprintMult: sprints.length ? FISH_SPRINT_MULT : 1,
    caughtBy: null, caughtAt: null, caughtName: null, caughtColor: null,
  });
  return true;
}

function fishIsDiving(fish, now) {
  const age = now - fish.spawnedAt;
  return fish.dives.some(d => age >= d.start && age <= d.end);
}

// Frist für den Angel-Zwang neu setzen. Sie läuft erst ab dem Moment, in dem die Angel
// wieder einsatzbereit ist — sonst würde ein Cooldown von 5s das Fenster komplett
// auffressen und man wäre schon beim Einholen "zu langsam".
function resetFishIdle(g, playerId, from) {
  g.idleUntil[playerId] = Math.max(from, g.cooldowns[playerId] || 0) + g.idleMs;
}

// Alle Karten, die dieser Spieler in diesem Moment wirklich fangen könnte
function catchableFish(g, player, now) {
  const champBlocked = (player.deck || []).filter(c => c.isChampion).length >= 2;
  return g.fish.filter(f => {
    if (f.caughtBy) return false;
    const age = now - f.spawnedAt;
    if (age < 0 || age > f.travelMs) return false;
    if (fishIsDiving(f, now)) return false;
    return !(f.card.isChampion && champBlocked);
  });
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
    idleMs: g.idleMs,
    spawnRate: g.spawnRate,
    fish: g.fish,
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
      cooldownUntil: g.cooldowns[p.id] || 0,
      idleUntil: g.idleUntil[p.id] || 0,
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
  resetFishIdle(g, player.id, now);
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

    // Angel-Zwang + Anti-Blockade: Wer sein Zeitfenster verstreichen lässt, bekommt eine
    // zufällige treibende Karte zugelost; für länger getrennte Spieler gilt dasselbe,
    // damit das Spiel für alle anderen enden kann (analog Rush-Auto-Kauf).
    for (const p of lobby.players) {
      if (p.isSpectator || p.left) continue;
      if ((p.deck || []).length >= FISH_DECK_SIZE) continue;
      if ((g.cooldowns[p.id] || 0) > now) continue;
      if (g.idleUntil[p.id] === undefined) { resetFishIdle(g, p.id, now); continue; }
      const idleDue = g.idleMs > 0 && now >= g.idleUntil[p.id];
      const afkDue = p.disconnected && now - (p.disconnectedAt || now) >= FISH_AFK_MS;
      if (!idleDue && !afkDue) continue;
      const catchable = catchableFish(g, p, now);
      if (!catchable.length) {
        // Gerade ist nichts fangbar (leerer Fluss, alles abgetaucht, nur noch Champions bei
        // vollem Limit) — die Frist beginnt neu, sobald wieder Karten erreichbar sind.
        if (idleDue) { resetFishIdle(g, p.id, now); changed = true; }
        continue;
      }
      const pick = catchable[Math.floor(Math.random() * catchable.length)];
      if (fishingApplyCatch(lobby, p, pick.fishId, io).ok) {
        if (!p.disconnected) io.to(p.id).emit('clash:fish:auto', { fishId: pick.fishId, card: pick.card });
        changed = false; // fishingApplyCatch hat bereits gebroadcastet
      }
    }

    if (changed) io.to(lobby.code).emit('clash:fish:state', buildFishingState(lobby));
  }, FISH_TICK_MS);
}

function startAngelRoyale(lobby, io) {
  const now = Date.now();
  lobby.players.forEach(p => { p.deck = []; });
  const countdownUntil = now + FISH_COUNTDOWN_MS;
  lobby.game = {
    type: 'angel-royale',
    fish: [],
    nextFishId: 1,
    cooldowns: {},
    idleUntil: {},
    recentUntil: {},
    spawnCarry: 1.4, // direkt nach dem Countdown tauchen die ersten Karten auf
    spawnRate: FISH_SPAWN_RATES.includes(lobby.fishSpawnRate) ? lobby.fishSpawnRate : FISH_SPAWN_RATE_DEFAULT,
    catchCooldownMs: (FISH_COOLDOWNS.includes(lobby.fishCatchCooldown) ? lobby.fishCatchCooldown : FISH_COOLDOWN_DEFAULT) * 1000,
    idleMs: (FISH_IDLE_SECONDS.includes(lobby.fishIdleSeconds) ? lobby.fishIdleSeconds : FISH_IDLE_DEFAULT) * 1000,
    finished: false,
    timerInterval: null,
    countdownUntil,
  };
  // Die Frist läuft erst ab dem Start — während des Countdowns kann niemand angeln
  lobby.players.forEach(p => {
    if (!p.isSpectator && !p.left) resetFishIdle(lobby.game, p.id, countdownUntil);
  });
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
    fishIdleSeconds: {
      default: FISH_IDLE_DEFAULT,
      event: 'clash:setFishIdle',
      payloadKey: 'seconds',
      sanitize: (v) => (FISH_IDLE_SECONDS.includes(Number(v)) ? Number(v) : undefined),
    },
  },
  // Jeder braucht 8 Karten, plus es müssen immer ein paar Karten im Fluss schwimmen können
  requiredPool: (lobby, active) => active * 8 + 6,
  start: (lobby, io) => startAngelRoyale(lobby, io),
  buildState: (lobby) => ({ event: 'clash:fish:state', payload: buildFishingState(lobby) }),
  remapPlayerId: (game, oldId, newId) => {
    if (game.cooldowns?.[oldId] !== undefined) { game.cooldowns[newId] = game.cooldowns[oldId]; delete game.cooldowns[oldId]; }
    if (game.idleUntil?.[oldId] !== undefined) { game.idleUntil[newId] = game.idleUntil[oldId]; delete game.idleUntil[oldId]; }
    (game.fish || []).forEach(f => { if (f.caughtBy === oldId) f.caughtBy = newId; });
  },
  onPlayerLeft: (lobby, io) => {
    io.to(lobby.code).emit('clash:fish:state', buildFishingState(lobby));
    checkFishingEnd(lobby, io);
  },
  // Der neue Zuschauer war vielleicht der Letzte mit unvollem Deck
  onSpectatorChanged: (lobby, io, player) => {
    if (lobby.game.finished) return;
    // Wer neu mitspielt, startet mit einer vollen Frist statt sofort zwangsgeangelt zu werden
    if (player && !player.isSpectator) resetFishIdle(lobby.game, player.id, Date.now());
    else if (player) delete lobby.game.idleUntil[player.id];
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
