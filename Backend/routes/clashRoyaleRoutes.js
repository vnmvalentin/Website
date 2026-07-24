const express = require('express');
const crStreamerStore = require('../lib/crStreamerStore');

const lobbies = new Map();

const VALID_MODES = ['snake', 'auction', 'bingo', 'shadow-carousel', 'elixir-rush', 'card-evolution'];

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316',
];

// Kurze Gnadenfrist bei Disconnect in der Lobby-Phase (Socket.io-Reconnects vergeben eine neue
// socket.id — ohne Gnadenfrist würde ein kurzer Netzwerk-Hänger die frisch erstellte Lobby sofort löschen).
const LOBBY_DISCONNECT_GRACE_MS = 30 * 1000;

// Grid: 11 × 11 = 121 cells — matches ALL_CARDS exactly
const GRID_COLS  = 11;
const GRID_ROWS  = 11;
const GRID_SIZE  = 121;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Streamer-Integration (OBS-Automatiken + globales Deck-Overlay) ──────────
// Spieler, die beim Verbinden per Session-Cookie eingeloggt waren, tragen ihre
// (serverseitig verifizierte) twitchId. Für jeden solchen Spieler mit
// Streamer-Konfiguration feuern Lobby-Ereignisse Events an sein Deck-Overlay,
// das als Browserquelle in OBS läuft und dort lokal Szenen/Quellen schaltet.

function lobbyStreamerIds(lobby) {
  const ids = new Set();
  for (const p of lobby.players) {
    if (p.twitchId && !p.left) ids.add(String(p.twitchId));
  }
  return [...ids];
}

function emitStreamerEvent(lobby, io, eventName) {
  for (const tid of lobbyStreamerIds(lobby)) {
    try {
      const cfg = crStreamerStore.getConfig(tid);
      if (!cfg?.overlayKey) continue;
      io.to(`croverlay:${cfg.overlayKey}`).emit('cr:streamer:event', {
        event: eventName,
        lobbyCode: lobby.code,
        mode: lobby.mode,
      });
    } catch (e) {
      console.error('[cr streamer] event failed:', e.message);
    }
  }
}

function buildDeckFeedPayload(lobby) {
  return {
    at: Date.now(),
    lobbyCode: lobby.code,
    mode: lobby.mode,
    players: lobby.players
      .filter(p => !p.isAdmin && !p.left && !p.isSpectator && (p.deck || []).length > 0)
      .map(p => ({
        name: p.name,
        color: p.color,
        avatar: p.avatar || '',
        deck: (p.deck || []).map(c => ({
          id: c.id, name: c.name, rarity: c.rarity, isChampion: !!c.isChampion,
        })),
      })),
  };
}

function updateDeckFeeds(lobby, io) {
  const payload = buildDeckFeedPayload(lobby);
  if (!payload.players.length) return;
  for (const tid of lobbyStreamerIds(lobby)) {
    try {
      const cfg = crStreamerStore.setLastDecks(tid, payload);
      if (!cfg?.overlayKey) continue; // kein Streamer-Setup für diesen Spieler
      io.to(`croverlay:${cfg.overlayKey}`).emit('cr:deckoverlay:update', payload);
    } catch (e) {
      console.error('[cr streamer] deck feed failed:', e.message);
    }
  }
}

function notifyDraftComplete(lobby, io) {
  emitStreamerEvent(lobby, io, 'draftEnd');
  updateDeckFeeds(lobby, io);
}

// ── Card pool — keep 1:1 in sync with Frontend/src/pages/ClashRoyale/data/cards.js ──
const ALL_CARDS = [
  // Commons (29)
  { id: 'skeletons',         name: 'Skeletons',         rarity: 'Common',    isChampion: false },
  { id: 'fire-spirit',       name: 'Fire Spirit',       rarity: 'Common',    isChampion: false },
  { id: 'electro-spirit',    name: 'Electro Spirit',    rarity: 'Common',    isChampion: false },
  { id: 'ice-spirit',        name: 'Ice Spirit',        rarity: 'Common',    isChampion: false },
  { id: 'goblins',           name: 'Goblins',           rarity: 'Common',    isChampion: false },
  { id: 'spear-goblins',     name: 'Spear Goblins',     rarity: 'Common',    isChampion: false },
  { id: 'bomber',            name: 'Bomber',            rarity: 'Common',    isChampion: false },
  { id: 'bats',              name: 'Bats',              rarity: 'Common',    isChampion: false },
  { id: 'zap',               name: 'Zap',               rarity: 'Common',    isChampion: false },
  { id: 'giant-snowball',    name: 'Giant Snowball',    rarity: 'Common',    isChampion: false },
  { id: 'berserker',         name: 'Berserker',         rarity: 'Common',    isChampion: false },
  { id: 'knight',            name: 'Knight',            rarity: 'Common',    isChampion: false },
  { id: 'archers',           name: 'Archers',           rarity: 'Common',    isChampion: false },
  { id: 'minions',           name: 'Minions',           rarity: 'Common',    isChampion: false },
  { id: 'goblin-gang',       name: 'Goblin Gang',       rarity: 'Common',    isChampion: false },
  { id: 'arrows',            name: 'Arrows',            rarity: 'Common',    isChampion: false },
  { id: 'cannon',            name: 'Cannon',            rarity: 'Common',    isChampion: false },
  { id: 'skeleton-barrel',   name: 'Skeleton Barrel',   rarity: 'Common',    isChampion: false },
  { id: 'firecracker',       name: 'Firecracker',       rarity: 'Common',    isChampion: false },
  { id: 'royal-delivery',    name: 'Royal Delivery',    rarity: 'Common',    isChampion: false },
  { id: 'skeleton-dragons',  name: 'Skeleton Dragons',  rarity: 'Common',    isChampion: false },
  { id: 'mortar',            name: 'Mortar',            rarity: 'Common',    isChampion: false },
  { id: 'tesla',             name: 'Tesla',             rarity: 'Common',    isChampion: false },
  { id: 'barbarians',        name: 'Barbarians',        rarity: 'Common',    isChampion: false },
  { id: 'minion-horde',      name: 'Minion Horde',      rarity: 'Common',    isChampion: false },
  { id: 'rascals',           name: 'Rascals',           rarity: 'Common',    isChampion: false },
  { id: 'royal-giant',       name: 'Royal Giant',       rarity: 'Common',    isChampion: false },
  { id: 'elite-barbarians',  name: 'Elite Barbarians',  rarity: 'Common',    isChampion: false },
  { id: 'royal-recruits',    name: 'Royal Recruits',    rarity: 'Common',    isChampion: false },
  // Rares (30)
  { id: 'heal-spirit',       name: 'Heal Spirit',       rarity: 'Rare',      isChampion: false },
  { id: 'ice-golem',         name: 'Ice Golem',         rarity: 'Rare',      isChampion: false },
  { id: 'suspicious-bush',   name: 'Suspicious Bush',   rarity: 'Rare',      isChampion: false },
  { id: 'mega-minion',       name: 'Mega Minion',       rarity: 'Rare',      isChampion: false },
  { id: 'dart-goblin',       name: 'Dart Goblin',       rarity: 'Rare',      isChampion: false },
  { id: 'earthquake',        name: 'Earthquake',        rarity: 'Rare',      isChampion: false },
  { id: 'elixir-golem',      name: 'Elixir Golem',      rarity: 'Rare',      isChampion: false },
  { id: 'tombstone',         name: 'Tombstone',         rarity: 'Rare',      isChampion: false },
  { id: 'musketeer',         name: 'Musketeer',         rarity: 'Rare',      isChampion: false },
  { id: 'mini-pekka',        name: 'Mini P.E.K.K.A',   rarity: 'Rare',      isChampion: false },
  { id: 'goblin-hut',        name: 'Goblin Hut',        rarity: 'Rare',      isChampion: false },
  { id: 'goblin-cage',       name: 'Goblin Cage',       rarity: 'Rare',      isChampion: false },
  { id: 'fireball',          name: 'Fireball',          rarity: 'Rare',      isChampion: false },
  { id: 'valkyrie',          name: 'Valkyrie',          rarity: 'Rare',      isChampion: false },
  { id: 'battle-ram',        name: 'Battle Ram',        rarity: 'Rare',      isChampion: false },
  { id: 'bomb-tower',        name: 'Bomb Tower',        rarity: 'Rare',      isChampion: false },
  { id: 'hog-rider',         name: 'Hog Rider',         rarity: 'Rare',      isChampion: false },
  { id: 'flying-machine',    name: 'Flying Machine',    rarity: 'Rare',      isChampion: false },
  { id: 'battle-healer',     name: 'Battle Healer',     rarity: 'Rare',      isChampion: false },
  { id: 'zappies',           name: 'Zappies',           rarity: 'Rare',      isChampion: false },
  { id: 'furnace',           name: 'Furnace',           rarity: 'Rare',      isChampion: false },
  { id: 'goblin-demolisher', name: 'Goblin Demolisher', rarity: 'Rare',      isChampion: false },
  { id: 'giant',             name: 'Giant',             rarity: 'Rare',      isChampion: false },
  { id: 'wizard',            name: 'Wizard',            rarity: 'Rare',      isChampion: false },
  { id: 'inferno-tower',     name: 'Inferno Tower',     rarity: 'Rare',      isChampion: false },
  { id: 'royal-hogs',        name: 'Royal Hogs',        rarity: 'Rare',      isChampion: false },
  { id: 'rocket',            name: 'Rocket',            rarity: 'Rare',      isChampion: false },
  { id: 'barbarian-hut',     name: 'Barbarian Hut',     rarity: 'Rare',      isChampion: false },
  { id: 'elixir-collector',  name: 'Elixir Collector',  rarity: 'Rare',      isChampion: false },
  { id: 'three-musketeers',  name: 'Three Musketeers',  rarity: 'Rare',      isChampion: false },
  // Epics (33)
  { id: 'mirror',            name: 'Mirror',            rarity: 'Epic',      isChampion: false },
  { id: 'barbarian-barrel',  name: 'Barbarian Barrel',  rarity: 'Epic',      isChampion: false },
  { id: 'wall-breakers',     name: 'Wall Breakers',     rarity: 'Epic',      isChampion: false },
  { id: 'rage',              name: 'Rage',              rarity: 'Epic',      isChampion: false },
  { id: 'goblin-curse',      name: 'Goblin Curse',      rarity: 'Epic',      isChampion: false },
  { id: 'skeleton-army',     name: 'Skeleton Army',     rarity: 'Epic',      isChampion: false },
  { id: 'guards',            name: 'Guards',            rarity: 'Epic',      isChampion: false },
  { id: 'vines',             name: 'Vines',             rarity: 'Epic',      isChampion: false },
  { id: 'tornado',           name: 'Tornado',           rarity: 'Epic',      isChampion: false },
  { id: 'goblin-barrel',     name: 'Goblin Barrel',     rarity: 'Epic',      isChampion: false },
  { id: 'clone',             name: 'Clone',             rarity: 'Epic',      isChampion: false },
  { id: 'void',              name: 'Void',              rarity: 'Epic',      isChampion: false },
  { id: 'baby-dragon',       name: 'Baby Dragon',       rarity: 'Epic',      isChampion: false },
  { id: 'dark-prince',       name: 'Dark Prince',       rarity: 'Epic',      isChampion: false },
  { id: 'freeze',            name: 'Freeze',            rarity: 'Epic',      isChampion: false },
  { id: 'rune-giant',        name: 'Rune Giant',        rarity: 'Epic',      isChampion: false },
  { id: 'poison',            name: 'Poison',            rarity: 'Epic',      isChampion: false },
  { id: 'hunter',            name: 'Hunter',            rarity: 'Epic',      isChampion: false },
  { id: 'goblin-drill',      name: 'Goblin Drill',      rarity: 'Epic',      isChampion: false },
  { id: 'witch',             name: 'Witch',             rarity: 'Epic',      isChampion: false },
  { id: 'balloon',           name: 'Balloon',           rarity: 'Epic',      isChampion: false },
  { id: 'prince',            name: 'Prince',            rarity: 'Epic',      isChampion: false },
  { id: 'electro-dragon',    name: 'Electro Dragon',    rarity: 'Epic',      isChampion: false },
  { id: 'bowler',            name: 'Bowler',            rarity: 'Epic',      isChampion: false },
  { id: 'executioner',       name: 'Executioner',       rarity: 'Epic',      isChampion: false },
  { id: 'cannon-cart',       name: 'Cannon Cart',       rarity: 'Epic',      isChampion: false },
  { id: 'giant-skeleton',    name: 'Giant Skeleton',    rarity: 'Epic',      isChampion: false },
  { id: 'lightning',         name: 'Lightning',         rarity: 'Epic',      isChampion: false },
  { id: 'goblin-giant',      name: 'Goblin Giant',      rarity: 'Epic',      isChampion: false },
  { id: 'x-bow',             name: 'X-Bow',             rarity: 'Epic',      isChampion: false },
  { id: 'pekka',             name: 'P.E.K.K.A',         rarity: 'Epic',      isChampion: false },
  { id: 'electro-giant',     name: 'Electro Giant',     rarity: 'Epic',      isChampion: false },
  { id: 'golem',             name: 'Golem',             rarity: 'Epic',      isChampion: false },
  // Legendaries (21)
  { id: 'the-log',           name: 'The Log',           rarity: 'Legendary', isChampion: false },
  { id: 'miner',             name: 'Miner',             rarity: 'Legendary', isChampion: false },
  { id: 'ice-wizard',        name: 'Ice Wizard',        rarity: 'Legendary', isChampion: false },
  { id: 'princess',          name: 'Princess',          rarity: 'Legendary', isChampion: false },
  { id: 'royal-ghost',       name: 'Royal Ghost',       rarity: 'Legendary', isChampion: false },
  { id: 'bandit',            name: 'Bandit',            rarity: 'Legendary', isChampion: false },
  { id: 'fisherman',         name: 'Fisherman',         rarity: 'Legendary', isChampion: false },
  { id: 'inferno-dragon',    name: 'Inferno Dragon',    rarity: 'Legendary', isChampion: false },
  { id: 'electro-wizard',    name: 'Electro Wizard',    rarity: 'Legendary', isChampion: false },
  { id: 'phoenix',           name: 'Phoenix',           rarity: 'Legendary', isChampion: false },
  { id: 'magic-archer',      name: 'Magic Archer',      rarity: 'Legendary', isChampion: false },
  { id: 'lumberjack',        name: 'Lumberjack',        rarity: 'Legendary', isChampion: false },
  { id: 'night-witch',       name: 'Night Witch',       rarity: 'Legendary', isChampion: false },
  { id: 'mother-witch',      name: 'Mother Witch',      rarity: 'Legendary', isChampion: false },
  { id: 'ram-rider',         name: 'Ram Rider',         rarity: 'Legendary', isChampion: false },
  { id: 'graveyard',         name: 'Graveyard',         rarity: 'Legendary', isChampion: false },
  { id: 'goblin-machine',    name: 'Goblin Machine',    rarity: 'Legendary', isChampion: false },
  { id: 'ronin',             name: 'Ronin',             rarity: 'Legendary', isChampion: false },
  { id: 'sparky',            name: 'Sparky',            rarity: 'Legendary', isChampion: false },
  { id: 'spirit-empress',    name: 'Spirit Empress',    rarity: 'Legendary', isChampion: false },
  { id: 'mega-knight',       name: 'Mega Knight',       rarity: 'Legendary', isChampion: false },
  { id: 'lava-hound',        name: 'Lava Hound',        rarity: 'Legendary', isChampion: false },
  // Champions (8) — max 2 per deck
  { id: 'little-prince',     name: 'Little Prince',     rarity: 'Champion',  isChampion: true },
  { id: 'skeleton-king',     name: 'Skeleton King',     rarity: 'Champion',  isChampion: true },
  { id: 'golden-knight',     name: 'Golden Knight',     rarity: 'Champion',  isChampion: true },
  { id: 'mighty-miner',      name: 'Mighty Miner',      rarity: 'Champion',  isChampion: true },
  { id: 'archer-queen',      name: 'Archer Queen',      rarity: 'Champion',  isChampion: true },
  { id: 'monk',              name: 'Monk',              rarity: 'Champion',  isChampion: true },
  { id: 'goblinstein',       name: 'Goblinstein',       rarity: 'Champion',  isChampion: true },
  { id: 'boss-bandit',        name: 'Boss Bandit',       rarity: 'Champion',  isChampion: true },
];

// ── Echte Elixierkosten (für Elixir Rush) ──────────────────────────────────
const ELIXIR_COST = {
  // Commons
  'skeletons': 1, 'fire-spirit': 1, 'electro-spirit': 1, 'ice-spirit': 1,
  'goblins': 2, 'spear-goblins': 2, 'bomber': 2, 'bats': 2, 'zap': 2, 'giant-snowball': 2, 'berserker': 2,
  'knight': 3, 'archers': 3, 'minions': 3, 'goblin-gang': 3, 'arrows': 3, 'cannon': 3,
  'skeleton-barrel': 3, 'firecracker': 3, 'royal-delivery': 3,
  'skeleton-dragons': 4, 'mortar': 4, 'tesla': 4,
  'barbarians': 5, 'minion-horde': 5, 'rascals': 5,
  'royal-giant': 6, 'elite-barbarians': 6, 'royal-recruits': 7,
  // Rares
  'heal-spirit': 1, 'ice-golem': 2, 'suspicious-bush': 2,
  'mega-minion': 3, 'dart-goblin': 3, 'earthquake': 3, 'elixir-golem': 3, 'tombstone': 3,
  'musketeer': 4, 'mini-pekka': 4, 'goblin-hut': 4, 'goblin-cage': 4, 'fireball': 4, 'valkyrie': 4,
  'battle-ram': 4, 'bomb-tower': 4, 'hog-rider': 4, 'flying-machine': 4, 'battle-healer': 4,
  'zappies': 4, 'furnace': 4, 'goblin-demolisher': 4,
  'giant': 5, 'wizard': 5, 'inferno-tower': 5, 'royal-hogs': 5,
  'rocket': 6, 'barbarian-hut': 6, 'elixir-collector': 6, 'three-musketeers': 9,
  // Epics
  'mirror': 0, 'barbarian-barrel': 2, 'wall-breakers': 2, 'rage': 2, 'goblin-curse': 2,
  'skeleton-army': 3, 'guards': 3, 'vines': 3, 'tornado': 3, 'goblin-barrel': 3, 'clone': 3, 'void': 3,
  'baby-dragon': 4, 'dark-prince': 4, 'freeze': 4, 'rune-giant': 4, 'poison': 4, 'hunter': 4, 'goblin-drill': 4,
  'witch': 5, 'balloon': 5, 'prince': 5, 'electro-dragon': 5, 'bowler': 5, 'executioner': 5, 'cannon-cart': 5,
  'giant-skeleton': 6, 'lightning': 6, 'goblin-giant': 6, 'x-bow': 6,
  'pekka': 7, 'electro-giant': 7, 'golem': 8,
  // Legendaries
  'the-log': 2, 'miner': 3, 'ice-wizard': 3, 'princess': 3, 'royal-ghost': 3, 'bandit': 3, 'fisherman': 3,
  'inferno-dragon': 4, 'electro-wizard': 4, 'phoenix': 4, 'magic-archer': 4, 'lumberjack': 4,
  'night-witch': 4, 'mother-witch': 4,
  'ram-rider': 5, 'graveyard': 5, 'goblin-machine': 5, 'ronin': 5, 'spirit-empress': 6,
  'sparky': 6, 'mega-knight': 7, 'lava-hound': 7,
  // Champions
  'little-prince': 3, 'skeleton-king': 4, 'golden-knight': 4, 'mighty-miner': 4,
  'archer-queen': 5, 'monk': 5, 'goblinstein': 5, 'boss-bandit': 6,
};
const getElixirCost = (cardId) => ELIXIR_COST[cardId] ?? 3;

// ── Bingo Attribute Data (keep in sync with Frontend/src/pages/ClashRoyale/data/bingoAttributes.js) ──
const ALL_BINGO_ATTR_KEYS = [
  'cost_low','cost_mid','cost_high',
  'type_troop','type_spell','type_building',
  'move_air','move_ground',
  'range_melee','range_ranged',
  'target_buildings','splash','swarm','single',
  'rarity_common','rarity_rare','rarity_epic','rarity_legendary','champion',
  'gender_male','gender_female','gender_none',
  'speed_slow','speed_medium','speed_fast','speed_very_fast',
  'has_evo','target_ground','target_ground_air',
];

const BINGO_CARD_ATTRS = {
  // ── Commons ──────────────────────────────────────────────────────────────
  'skeletons':         ['cost_low',  'type_troop',    'move_ground', 'range_melee',  'swarm',  'rarity_common', 'gender_none',   'speed_fast', 'has_evo', 'target_ground'],
  'fire-spirit':       ['cost_low',  'type_troop',    'move_ground', 'range_ranged',  'single', 'rarity_common', 'gender_none',   'speed_very_fast', 'splash', 'target_ground_air'],
  'electro-spirit':    ['cost_low',  'type_troop',    'move_ground', 'range_ranged',  'single', 'rarity_common', 'gender_none',   'speed_very_fast', 'target_ground_air'],
  'ice-spirit':        ['cost_low',  'type_troop',    'move_ground', 'range_ranged',  'single', 'rarity_common', 'gender_none',   'speed_very_fast', 'splash', 'has_evo', 'target_ground_air'],
  'goblins':           ['cost_low',  'type_troop',    'move_ground', 'range_melee',  'swarm',  'rarity_common', 'gender_male',   'speed_very_fast' , 'target_ground'],
  'spear-goblins':     ['cost_low',  'type_troop',    'move_ground', 'range_ranged', 'swarm',  'rarity_common', 'gender_male',   'speed_very_fast', 'target_ground_air'],
  'bomber':            ['cost_low',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_common', 'gender_male',   'speed_medium', 'splash', 'has_evo', 'target_ground'],
  'bats':              ['cost_low',  'type_troop',    'move_air',    'range_melee',  'swarm',  'rarity_common', 'gender_none',   'speed_very_fast', 'has_evo', 'target_ground_air'],
  'zap':               ['cost_low',  'type_spell',    'splash', 'rarity_common', 'has_evo', 'target_ground_air'],
  'giant-snowball':    ['cost_low',  'type_spell',    'splash', 'rarity_common', 'has_evo', 'target_ground_air'],
  'berserker':         ['cost_low',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_common', 'gender_female',   'speed_fast', 'target_ground'],
  'knight':            ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_common', 'gender_male',   'speed_medium', 'has_evo', 'target_ground'],
  'archers':           ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single',  'rarity_common', 'gender_female', 'speed_medium', 'has_evo', 'target_ground_air'],
  'minions':           ['cost_mid',  'type_troop',    'move_air',    'range_ranged',  'swarm',  'rarity_common', 'gender_none',   'speed_fast', 'target_ground_air'],
  'goblin-gang':       ['cost_mid',  'type_troop',    'move_ground', 'range_melee', 'range_ranged',  'swarm',  'rarity_common', 'gender_male',   'speed_very_fast', 'target_ground_air'],
  'arrows':            ['cost_mid',  'type_spell',    'splash', 'rarity_common', 'target_ground_air'],
  'cannon':            ['cost_mid',  'type_building', 'range_ranged', 'rarity_common', 'has_evo', 'target_ground'],
  'skeleton-barrel':   ['cost_mid',  'type_troop',    'move_air',    'range_melee',  'single', 'swarm', 'rarity_common', 'gender_none',  'speed_fast', 'target_buildings', 'has_evo', 'target_ground_air', 'splash'],
  'firecracker':       ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_common', 'gender_female', 'speed_fast', 'splash', 'has_evo', 'target_ground_air'],
  'royal-delivery':    ['cost_mid',  'type_spell',    'splash', 'rarity_common', 'target_ground_air'],
  'skeleton-dragons':  ['cost_mid',  'type_troop',    'move_air',    'range_ranged', 'swarm',  'rarity_common', 'gender_none',   'speed_fast', 'splash', 'target_ground_air'],
  'mortar':            ['cost_mid',  'type_building', 'range_ranged', 'splash', 'rarity_common', 'has_evo', 'target_ground'],
  'tesla':             ['cost_mid',  'type_building', 'range_ranged', 'rarity_common', 'has_evo', 'target_ground_air'],
  'barbarians':        ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'swarm',  'rarity_common', 'gender_male',   'speed_medium', 'has_evo', 'target_ground'],
  'minion-horde':      ['cost_high', 'type_troop',    'move_air',    'range_ranged',  'swarm',  'rarity_common', 'gender_none',   'speed_fast', 'has_evo', 'target_ground_air'],
  'rascals':           ['cost_high', 'type_troop',    'move_ground', 'range_melee','range_ranged',  'swarm',  'rarity_common', 'gender_male', 'gender_female',  'speed_medium', 'target_ground_air'],
  'royal-giant':       ['cost_high', 'type_troop',    'move_ground', 'range_ranged',  'single', 'rarity_common', 'gender_male',   'speed_slow', 'target_buildings', 'has_evo', 'target_ground'],
  'elite-barbarians':  ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'swarm',  'rarity_common', 'gender_male',   'speed_fast', 'target_ground'],
  'royal-recruits':    ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'swarm',  'rarity_common', 'gender_male', 'speed_medium', 'has_evo', 'target_ground'],

  // ── Rares ─────────────────────────────────────────────────────────────────
  'heal-spirit':       ['cost_low',  'type_troop',    'move_ground', 'range_ranged',  'single', 'rarity_rare', 'gender_none',   'speed_very_fast', 'splash', 'target_ground_air'],
  'ice-golem':         ['cost_low',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_rare', 'gender_none',   'speed_slow', 'target_buildings', 'target_ground_air'],
  'suspicious-bush':   ['cost_low',  'type_troop',    'move_ground', 'range_melee',  'single', 'swarm', 'rarity_rare', 'gender_male',   'speed_medium', 'target_buildings', 'target_ground'],
  'mega-minion':       ['cost_mid',  'type_troop',    'move_air',    'range_melee',  'single', 'rarity_rare', 'gender_none',   'speed_medium', 'target_ground_air'],
  'dart-goblin':       ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_rare', 'gender_male',   'speed_very_fast', 'has_evo', 'target_ground_air'],
  'earthquake':        ['cost_mid',  'type_spell',  'rarity_rare', 'target_ground'],
  'elixir-golem':      ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_rare', 'gender_none',   'speed_slow', 'target_buildings', 'target_ground'],
  'tombstone':         ['cost_mid',  'type_building', 'rarity_rare', 'swarm', 'target_ground'],
  'musketeer':         ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_rare', 'gender_female', 'speed_medium', 'has_evo', 'target_ground_air'],
  'mini-pekka':        ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_rare', 'gender_none',   'speed_fast', 'target_ground'],
  'goblin-hut':        ['cost_high', 'type_building', 'rarity_rare', 'target_ground_air'],
  'goblin-cage':       ['cost_mid',  'type_building', 'rarity_rare', 'has_evo', 'target_ground'],
  'fireball':          ['cost_mid',  'type_spell',    'splash', 'rarity_rare', 'target_ground_air'],
  'valkyrie':          ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_rare', 'gender_female', 'speed_medium', 'splash', 'has_evo', 'target_ground'],
  'battle-ram':        ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'swarm', 'rarity_rare', 'gender_male',   'speed_medium', 'target_buildings', 'has_evo', 'target_ground'],
  'bomb-tower':        ['cost_high', 'type_building', 'splash', 'rarity_rare', 'target_ground'],
  'hog-rider':         ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_rare', 'gender_male',   'speed_very_fast', 'target_buildings', 'target_ground'],
  'flying-machine':    ['cost_mid',  'type_troop',    'move_air',    'range_ranged', 'single', 'rarity_rare', 'gender_none',   'speed_fast', 'target_ground_air'],
  'battle-healer':     ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_rare', 'gender_female', 'speed_medium', 'target_ground'],
  'zappies':           ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'swarm',  'rarity_rare', 'gender_none',   'speed_medium', 'target_ground_air'],
  'furnace':           ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_rare', 'gender_none', 'speed_medium', 'has_evo', 'target_ground_air'],
  'goblin-demolisher': ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_rare', 'gender_male',   'speed_medium', 'target_buildings', 'splash', 'target_ground'],
  'giant':             ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_rare', 'gender_male',   'speed_slow', 'target_buildings', 'target_ground'],
  'wizard':            ['cost_high', 'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_rare', 'gender_male',   'speed_medium', 'splash', 'has_evo', 'target_ground_air'],
  'inferno-tower':     ['cost_high', 'type_building', 'rarity_rare', 'target_ground_air'],
  'royal-hogs':        ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'swarm',  'rarity_rare', 'gender_none',   'speed_very_fast', 'target_buildings', 'has_evo', 'target_ground'],
  'rocket':            ['cost_high', 'type_spell',    'splash', 'rarity_rare', 'target_ground_air'],
  'barbarian-hut':     ['cost_high', 'type_building', 'rarity_rare', 'swarm', 'target_ground'],
  'elixir-collector':  ['cost_high', 'type_building', 'rarity_rare'],
  'three-musketeers':  ['cost_high', 'type_troop',    'move_ground', 'range_ranged', 'swarm',  'rarity_rare', 'gender_female', 'speed_medium', 'target_ground_air'],

  // ── Epics ─────────────────────────────────────────────────────────────────
  'mirror':            ['cost_low',  'type_spell',    'rarity_epic'],
  'barbarian-barrel':  ['cost_low',  'type_spell',    'splash', 'rarity_epic', 'target_ground'],
  'wall-breakers':     ['cost_low',  'type_troop',    'move_ground', 'range_melee',  'swarm',  'rarity_epic', 'gender_none',   'speed_very_fast', 'target_buildings', 'splash', 'has_evo', 'target_ground_air'],
  'rage':              ['cost_low',  'type_spell',    'rarity_epic' ,  'splash', 'target_ground_air'],
  'goblin-curse':      ['cost_low',  'type_spell',    'rarity_epic', 'target_ground_air'],
  'skeleton-army':     ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'swarm',  'rarity_epic', 'gender_none',   'speed_fast', 'has_evo', 'target_ground'],
  'guards':            ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'swarm',  'rarity_epic', 'gender_none',   'speed_fast', 'target_ground'],
  'vines':             ['cost_mid',  'type_spell',    'rarity_epic', 'target_ground_air'],
  'tornado':           ['cost_mid',  'type_spell',    'splash', 'rarity_epic', 'target_ground_air'],
  'goblin-barrel':     ['cost_mid',  'type_spell',    'rarity_epic', 'swarm', 'has_evo', 'target_ground'],
  'clone':             ['cost_mid',  'type_spell',    'rarity_epic', 'target_ground_air'],
  'void':              ['cost_mid',  'type_spell',    'rarity_epic', 'target_ground_air'],
  'baby-dragon':       ['cost_mid',  'type_troop',    'move_air',    'range_ranged', 'single', 'rarity_epic', 'gender_none',   'speed_fast', 'splash', 'has_evo', 'target_ground_air'],
  'dark-prince':       ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_epic', 'gender_male',   'speed_medium', 'splash', 'target_ground'],
  'freeze':            ['cost_mid',  'type_spell',    'splash', 'rarity_epic', 'target_ground_air'],
  'rune-giant':        ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_epic', 'gender_female',   'speed_medium', 'target_buildings', 'target_ground'],
  'poison':            ['cost_mid',  'type_spell',    'rarity_epic', 'target_ground_air'],
  'hunter':            ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_epic', 'gender_male',   'speed_medium', 'has_evo', 'target_ground_air'],
  'goblin-drill':      ['cost_mid',  'type_building', 'rarity_epic', 'swarm', 'has_evo', 'target_ground'],
  'witch':             ['cost_high', 'type_troop',    'move_ground', 'range_ranged', 'single', 'swarm', 'rarity_epic', 'gender_female', 'speed_medium', 'splash', 'has_evo', 'target_ground_air'],
  'balloon':           ['cost_high', 'type_troop',    'move_air',    'range_melee',  'single', 'rarity_epic', 'gender_none',   'speed_slow', 'target_buildings', 'splash', 'target_ground'],
  'prince':            ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_epic', 'gender_male',   'speed_medium', 'target_ground'],
  'electro-dragon':    ['cost_high', 'type_troop',    'move_air',    'range_ranged', 'single', 'rarity_epic', 'gender_none',   'speed_medium', 'has_evo', 'target_ground_air'],
  'bowler':            ['cost_high', 'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_epic', 'gender_male',   'speed_slow', 'splash', 'target_ground'],
  'executioner':       ['cost_high', 'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_epic', 'gender_male',   'speed_medium', 'splash', 'has_evo', 'target_ground_air'],
  'cannon-cart':       ['cost_high', 'type_troop', 'type_building',  'move_ground', 'range_ranged', 'single', 'rarity_epic', 'gender_none',   'speed_medium', 'target_ground'],
  'giant-skeleton':    ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_epic', 'gender_none',   'speed_medium', 'splash', 'target_ground'],
  'lightning':         ['cost_high', 'type_spell',    'rarity_epic', 'target_ground_air'],
  'goblin-giant':      ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'swarm', 'single', 'rarity_epic', 'gender_male',   'speed_medium', 'target_buildings', 'has_evo', 'target_ground_air'],
  'x-bow':             ['cost_high', 'type_building', 'range_ranged', 'rarity_epic', 'target_ground'],
  'pekka':             ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_epic', 'gender_female',   'speed_slow', 'has_evo', 'target_ground'],
  'electro-giant':     ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_epic', 'gender_male',   'speed_slow', 'target_buildings', 'target_ground_air'],
  'golem':             ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'single', 'swarm', 'rarity_epic', 'gender_none',   'speed_slow', 'target_buildings', 'target_ground'],

  // ── Legendaries ───────────────────────────────────────────────────────────
  'the-log':           ['cost_low',  'type_spell',    'splash', 'rarity_legendary', 'target_ground'],
  'miner':             ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_legendary', 'gender_male',   'speed_fast', 'target_ground'],
  'ice-wizard':        ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_legendary', 'gender_male',   'speed_medium', 'splash', 'target_ground_air'],
  'princess':          ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_legendary', 'gender_female', 'speed_medium', 'splash', 'has_evo', 'target_ground_air'],
  'royal-ghost':       ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_legendary', 'gender_male',   'speed_fast', 'splash', 'has_evo', 'target_ground'],
  'bandit':            ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_legendary', 'gender_female', 'speed_fast', 'target_ground'],
  'fisherman':         ['cost_mid',  'type_troop',    'move_ground', 'range_melee', 'range_ranged',  'single', 'rarity_legendary', 'gender_male',   'speed_medium', 'target_ground'],
  'inferno-dragon':    ['cost_mid',  'type_troop',    'move_air',    'range_ranged', 'single', 'rarity_legendary', 'gender_none',   'speed_medium', 'has_evo', 'target_ground_air'],
  'electro-wizard':    ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_legendary', 'gender_male',   'speed_fast', 'splash', 'target_ground_air'],
  'phoenix':           ['cost_mid',  'type_troop',    'move_air',    'range_melee', 'single', 'rarity_legendary', 'gender_none',   'speed_medium', 'target_ground_air'],
  'magic-archer':      ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_legendary', 'gender_male',   'speed_medium', 'splash', 'target_ground_air'],
  'lumberjack':        ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_legendary', 'gender_male',   'speed_very_fast', 'has_evo', 'target_ground'],
  'night-witch':       ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'swarm', 'rarity_legendary', 'gender_female', 'speed_medium', 'target_ground_air'],
  'mother-witch':      ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_legendary', 'gender_female', 'speed_medium', 'target_ground_air'],
  'ram-rider':         ['cost_high', 'type_troop',    'move_ground', 'range_melee', 'range_ranged', 'single', 'rarity_legendary', 'gender_female', 'speed_medium', 'target_buildings', 'target_ground_air'],
  'graveyard':         ['cost_high', 'type_spell',    'rarity_legendary' ,'swarm', 'target_ground'],
  'goblin-machine':    ['cost_high', 'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_legendary', 'gender_male',   'speed_medium' , 'splash', 'target_ground_air'],
  'ronin':             ['cost_high', 'type_troop',    'move_ground', 'range_melee', 'single', 'rarity_legendary', 'gender_male',   'speed_fast' , 'target_ground'],
  'sparky':            ['cost_high', 'type_troop',    'move_ground', 'range_ranged', 'single', 'rarity_legendary', 'gender_none',   'speed_slow', 'splash', 'target_ground'],
  'spirit-empress':    ['cost_mid', 'cost_high', 'type_troop',  'move_air', 'move_ground', 'range_melee',  'range_ranged', 'single', 'rarity_legendary', 'gender_female', 'speed_medium', 'speed_fast', 'target_ground_air'],
  'mega-knight':       ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'range_ranged' , 'single', 'rarity_legendary', 'gender_male',   'speed_medium', 'splash', 'has_evo', 'target_ground'],
  'lava-hound':        ['cost_high', 'type_troop',    'move_air',    'range_ranged',  'single', 'swarm', 'rarity_legendary', 'gender_female',   'speed_slow', 'target_buildings', 'target_ground_air'],

  // ── Champions ─────────────────────────────────────────────────────────────
  'little-prince':     ['cost_mid',  'type_troop',    'move_ground', 'range_ranged', 'single', 'champion', 'gender_male',   'speed_medium', 'target_ground_air'],
  'skeleton-king':     ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'champion', 'gender_none',   'speed_medium', 'splash', 'target_ground'],
  'golden-knight':     ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'champion', 'gender_male',   'speed_medium', 'target_ground'],
  'mighty-miner':      ['cost_mid',  'type_troop',    'move_ground', 'range_melee',  'single', 'champion', 'gender_male',   'speed_medium', 'target_ground'],
  'archer-queen':      ['cost_high', 'type_troop',    'move_ground', 'range_ranged', 'single', 'champion', 'gender_female', 'speed_medium', 'target_ground_air'],
  'monk':              ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'single', 'champion', 'gender_male',   'speed_medium', 'target_ground'],
  'goblinstein':       ['cost_high', 'type_troop',    'move_ground', 'range_melee', 'range_ranged',  'swarm', 'champion', 'gender_male',   'speed_medium', 'target_ground_air'],
  'boss-bandit':       ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'single', 'champion', 'gender_female',   'speed_fast', 'target_ground'],
};

// Converts old rarity_low/high keys to specific rarity keys based on ALL_CARDS
function getBingoCardAttrs(cardId) {
  const raw  = BINGO_CARD_ATTRS[cardId] || [];
  const clean = raw.filter(k => k !== 'rarity_low' && k !== 'rarity_high');
  const card  = ALL_CARDS.find(c => c.id === cardId);
  if (card) {
    if (card.isChampion) {
      if (!clean.includes('champion')) clean.push('champion');
    } else {
      const rarityMap = { Common: 'rarity_common', Rare: 'rarity_rare', Epic: 'rarity_epic', Legendary: 'rarity_legendary' };
      const key = rarityMap[card.rarity];
      if (key && !clean.includes(key)) clean.push(key);
    }
  }
  return clean;
}

// Bingo lines: [cellIndices] for a 4x4 grid
const BINGO_LINES = [
  [0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],   // rows
  [0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],    // cols
  [0,5,10,15],[3,6,9,12],                           // diagonals
];
const BINGO_LINE_IDS = ['row0','row1','row2','row3','col0','col1','col2','col3','diag0','diag1'];

function generateBingoCard() {
  const shuffled = shuffle([...ALL_BINGO_ATTR_KEYS]);
  return shuffled.slice(0, 16).map(attrKey => ({ attrKey, card: null, protected: false }));
}

// Returns line IDs newly completed after placing a card on cellIndex
function getNewlyCompletedLines(grid, cellIndex, completedBefore) {
  const newly = [];
  BINGO_LINES.forEach((line, li) => {
    const id = BINGO_LINE_IDS[li];
    if (completedBefore.includes(id)) return;
    if (!line.includes(cellIndex)) return;
    // Blocked cards (card doesn't match cell attribute) don't count toward bingo
    if (line.every(ci => {
      const cell = grid[ci];
      return cell.card !== null && getBingoCardAttrs(cell.card.id).includes(cell.attrKey);
    })) newly.push(id);
  });
  return newly;
}

// Snake-Draft: pro Rundenpaar hin + zurück (fair), aber die Spielerreihenfolge wird
// für jedes Paar neu zufällig gemischt — so ist niemand in jedem Paar "Spieler 1".
function generateSnakeDraftOrder(playerIndices, numRounds) {
  const order = [];
  let current = playerIndices;
  for (let r = 0; r < numRounds; r++) {
    if (r % 2 === 0) current = shuffle(playerIndices);
    order.push(...(r % 2 === 0 ? current : [...current].reverse()));
  }
  return order;
}

// Build bingo state for broadcast
function buildBingoState(lobby) {
  const g = lobby.game;
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const currentPlayerIdx = g.phase === 'draft' ? g.turnOrder[g.currentTurn] : null;
  const currentPlayer = currentPlayerIdx != null ? lobby.players[currentPlayerIdx] : null;

  // Unpicked cards: cards not in any player's deck (excluded cards never appear)
  const pickedIds = new Set(lobby.players.flatMap(p => (p.deck||[]).map(c => c.id)));
  const unpickedCards = getCardPool(lobby).filter(c => !pickedIds.has(c.id));

  // Verbleibende Tokens pro Spieler: während des Token-Shops aus der Queue abgeleitet,
  // damit die Anzeige bei jedem Einsatz live mitzählt (Reveal-Token gilt bereits als verbraucht)
  const queueFrom = (g.tokenShopIdx ?? 0) + (g.tokenShopSubPhase === 'revealing' ? 1 : 0);
  const remainingQueue = (g.tokenShopQueue || []).slice(queueFrom);
  const tokensLeftFor = (pid) => remainingQueue.filter(id => id === pid).length;

  return {
    type: 'bingo',
    phase: g.phase,
    round: g.round,
    maxRounds: g.maxRounds,
    currentCards: g.currentCards,
    pickedThisRound: g.pickedThisRound,
    currentPlayerId: currentPlayer?.id ?? null,
    timerRemaining: g.timerRemaining,
    timerSeconds: g.phase === 'tokenShop' ? (lobby.tokenShopTimerSeconds ?? lobby.timerSeconds) : lobby.timerSeconds,
    finished: g.finished,
    tokenShopCurrentPlayerId: g.tokenShopQueue?.[g.tokenShopIdx] ?? null,
    tokenShopQueue: g.tokenShopQueue || [],
    tokenShopIdx: g.tokenShopIdx ?? 0,
    tokenShopSubPhase: g.tokenShopSubPhase || 'picking',
    tokenShopLiveAction: g.tokenShopLiveAction || null,
    lastPowerupResult: g.lastPowerupResult || null,
    unpickedCards: g.phase === 'tokenShop' ? unpickedCards : [],
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [],
      bingoGrid: p.bingoGrid || [],
      bingoTokens: p.bingoTokens || 0,
      bingoTokensLeft: g.phase === 'tokenShop' ? tokensLeftFor(p.id) : (p.bingoTokens || 0),
      tokenAbilities: p.tokenAbilities || [],
      completedLines: p.completedLines || [],
      isSpectator: p.isSpectator ?? false,
    })),
  };
}

// ── Bingo Royale ────────────────────────────────────────────────────────────
const BINGO_POWERUP_TYPES = ['swap', 'reroll', 'joker'];

function startBingoRoyale(lobby, io) {
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const N = activePlayers.length;
  const activeIndices = lobby.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.isSpectator)
    .map(({ i }) => i);

  // Assign bingo grids to all active players
  lobby.players.forEach(p => {
    p.deck = [];
    p.bingoGrid = generateBingoCard();
    p.bingoTokens = 0;
    p.completedLines = [];
    p.tokenAbilities = [];
    if (p.isSpectator) p.bingoGrid = [];
  });

  const cardsPerRound = Math.max(N, lobby.cardsPerRound || N);
  const turnOrder = generateSnakeDraftOrder(activeIndices, 8);

  lobby.game = {
    type: 'bingo',
    pool: shuffle(getCardPool(lobby)),
    poolIdx: 0,
    round: 0,
    maxRounds: 8,
    cardsPerRound,
    currentCards: [],
    pickedThisRound: {},   // cardIndex → playerId
    phase: 'draft',
    turnOrder,
    currentTurn: 0,
    timerRemaining: lobby.timerSeconds,
    timerInterval: null,
    finished: false,
    tokenShopQueue: [],
    tokenShopIdx: 0,
    tokenShopSubPhase: 'picking',
    tokenShopLiveAction: null,
    lastPowerupResult: null,
  };

  io.to(lobby.code).emit('clash:gameStart', { mode: 'bingo' });
  nextBingoRound(lobby, io);
}

function nextBingoRound(lobby, io) {
  const g = lobby.game;
  if (g.round >= g.maxRounds) { endBingoDraft(lobby, io); return; }
  g.round++;
  g.currentCards = g.pool.slice(g.poolIdx, g.poolIdx + g.cardsPerRound);
  g.poolIdx += g.cardsPerRound;
  g.pickedThisRound = {};
  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
  startBingoTurnTimer(lobby, io);
}

function startBingoTurnTimer(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerRemaining = lobby.timerSeconds;
  g.timerInterval = setInterval(() => {
    g.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: g.timerRemaining });
    if (g.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      autoAdvanceBingo(lobby, io);
    }
  }, 1000);
}

function autoAdvanceBingo(lobby, io) {
  const g = lobby.game;
  const curIdx    = g.turnOrder[g.currentTurn];
  const curPlayer = lobby.players[curIdx];
  if (!curPlayer || curPlayer.isSpectator) { advanceBingoTurn(lobby, io); return; }

  // Pick random available card
  const availableCards = g.currentCards
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => !g.pickedThisRound[i]);
  if (!availableCards.length) { advanceBingoTurn(lobby, io); return; }
  const { c: card, i: cardIndex } = availableCards[Math.floor(Math.random() * availableCards.length)];

  // Find best bingo cell (matching, then any empty)
  const cardAttrs = getBingoCardAttrs(card.id);
  const grid = curPlayer.bingoGrid;
  let cellIndex = grid.findIndex(cell => cell.card === null && cardAttrs.includes(cell.attrKey));
  if (cellIndex === -1) cellIndex = grid.findIndex(cell => cell.card === null);
  if (cellIndex === -1) { advanceBingoTurn(lobby, io); return; } // no space

  applyBingoPick(lobby, cardIndex, cellIndex, curPlayer, io, true);
}

function applyBingoPick(lobby, cardIndex, cellIndex, player, io, isAuto = false) {
  const g = lobby.game;
  clearTurnTimer(lobby);

  const card = g.currentCards[cardIndex];
  g.pickedThisRound[cardIndex] = player.id;

  // Place on bingo grid
  const grid = player.bingoGrid;
  grid[cellIndex].card = card;

  // Add to deck
  player.deck = [...(player.deck || []), card];
  const lobbyPlayer = lobby.players.find(p => p.id === player.id);
  if (lobbyPlayer) {
    lobbyPlayer.deck = player.deck;
    lobbyPlayer.bingoGrid = grid;
  }

  // Check for new bingo lines
  const newLines = getNewlyCompletedLines(grid, cellIndex, player.completedLines || []);
  if (newLines.length > 0) {
    player.completedLines = [...(player.completedLines || []), ...newLines];
    player.bingoTokens = (player.bingoTokens || 0) + newLines.length;
    if (lobbyPlayer) {
      lobbyPlayer.completedLines = player.completedLines;
      lobbyPlayer.bingoTokens = player.bingoTokens;
    }
  }

  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
  advanceBingoTurn(lobby, io);
}

function advanceBingoTurn(lobby, io) {
  const g = lobby.game;
  g.currentTurn++;

  // Check if this round is done (all active players have picked)
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const roundPickCount = Object.keys(g.pickedThisRound).length;

  if (roundPickCount >= activePlayers.length || g.currentTurn >= g.turnOrder.length) {
    // Round over
    if (g.round >= g.maxRounds) {
      endBingoDraft(lobby, io);
    } else {
      setTimeout(() => {
        if (!lobby.game || lobby.game.finished) return;
        nextBingoRound(lobby, io);
      }, 1000);
    }
    return;
  }

  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
  startBingoTurnTimer(lobby, io);
}

function endBingoDraft(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;

  // Build token shop queue
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const queue = [];
  const maxTokens = Math.max(...activePlayers.map(p => p.bingoTokens || 0), 0);
  for (let t = 0; t < maxTokens; t++) {
    for (const p of activePlayers) {
      if ((p.bingoTokens || 0) > t) queue.push(p.id);
    }
  }

  if (queue.length === 0) {
    endBingoGame(lobby, io);
    return;
  }

  g.phase = 'tokenShop';
  g.tokenShopQueue = queue;
  g.tokenShopIdx   = 0;
  g.tokenShopSubPhase = 'picking';
  g.tokenShopLiveAction = null;
  // Jeder Spieler bekommt 2 der 3 Power-Ups zufällig zugelost — nur die darf er einsetzen
  activePlayers.forEach(p => { p.tokenAbilities = shuffle(BINGO_POWERUP_TYPES).slice(0, 2); });
  startTokenShopTimer(lobby, io); // vor dem Broadcast, damit timerRemaining bereits frisch ist
  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
}

// Token-Shop-Timer: Wer sein Power-Up nicht rechtzeitig einsetzt, verliert den Token
function startTokenShopTimer(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.timerRemaining = lobby.tokenShopTimerSeconds ?? 60;
  g.timerInterval = setInterval(() => {
    g.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: g.timerRemaining });
    if (g.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      skipTokenShopTurn(lobby, io);
    }
  }, 1000);
}

function skipTokenShopTurn(lobby, io) {
  const g = lobby.game;
  if (!g || g.type !== 'bingo' || g.phase !== 'tokenShop' || g.tokenShopSubPhase !== 'picking') return;
  g.tokenShopIdx++;
  g.tokenShopLiveAction = null;
  if (g.tokenShopIdx >= g.tokenShopQueue.length) { endBingoGame(lobby, io); return; }
  startTokenShopTimer(lobby, io);
  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
}

function endBingoGame(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  g.phase    = 'finished';
  g.finished = true;

  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'bingo',
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false,
    })),
  });

  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
    })),
  });
  notifyDraftComplete(lobby, io);
}

function applyBingoPowerup(lobby, type, params, playerId, io) {
  const g = lobby.game;
  if (g.phase !== 'tokenShop') return false;
  if (g.tokenShopQueue[g.tokenShopIdx] !== playerId) return false;

  const player = lobby.players.find(p => p.id === playerId);
  if (!player) return false;

  // Nur die dem Spieler zugelosten Power-Ups sind erlaubt
  const allowedTypes = player.tokenAbilities?.length ? player.tokenAbilities : BINGO_POWERUP_TYPES;
  if (!allowedTypes.includes(type)) return false;

  let result = { type, playerId, playerName: player.name, playerColor: player.color, playerAvatar: player.avatar || '' };

  if (type === 'swap') {
    const { myDeckIdx, targetPlayerId, theirDeckIdx } = params;
    const target = lobby.players.find(p => p.id === targetPlayerId);
    if (!target || !player.deck[myDeckIdx] || !target.deck[theirDeckIdx]) return false;
    if (player.deck[myDeckIdx]?.protected || target.deck[theirDeckIdx]?.protected) return false;
    const myCard    = player.deck[myDeckIdx];
    const theirCard = target.deck[theirDeckIdx];
    const myChamps    = player.deck.filter((c,i) => c.isChampion && i !== myDeckIdx).length;
    const theirChamps = target.deck.filter((c,i) => c.isChampion && i !== theirDeckIdx).length;
    if (theirCard.isChampion && myChamps >= 2) return false;
    if (myCard.isChampion && theirChamps >= 2) return false;
    player.deck[myDeckIdx]    = { ...theirCard, protected: true };
    target.deck[theirDeckIdx] = { ...myCard,    protected: true };
    result = { ...result, myCard, theirCard, targetPlayerName: target.name, targetPlayerColor: target.color };

  } else if (type === 'reroll') {
    const { targetPlayerId, theirDeckIdx } = params;
    const target = lobby.players.find(p => p.id === targetPlayerId);
    if (!target || !target.deck[theirDeckIdx]) return false;
    if (target.deck[theirDeckIdx]?.protected) return false;
    const oldCard = target.deck[theirDeckIdx];
    const pickedIds = new Set(lobby.players.flatMap(p => (p.deck||[]).map(c => c.id)));
    const champCount = target.deck.filter((c,i) => c.isChampion && i !== theirDeckIdx).length;
    const cardPool = getCardPool(lobby);
    let pool = cardPool.filter(c => !pickedIds.has(c.id) && !(c.isChampion && champCount >= 2));
    if (!pool.length) pool = cardPool.filter(c => !(c.isChampion && champCount >= 2));
    if (!pool.length) pool = ALL_CARDS.filter(c => !(c.isChampion && champCount >= 2));
    const newCard = pool[Math.floor(Math.random() * pool.length)];
    target.deck[theirDeckIdx] = { ...newCard, protected: true };
    result = { ...result, oldCard, newCard, targetPlayerName: target.name, targetPlayerColor: target.color };

  } else if (type === 'joker') {
    const { myDeckIdx, newCardId } = params;
    if (!player.deck[myDeckIdx]) return false;
    if (player.deck[myDeckIdx]?.protected) return false;
    const newCard = getCardPool(lobby).find(c => c.id === newCardId);
    if (!newCard) return false;
    const pickedIds = new Set(lobby.players.flatMap(p => (p.deck||[]).map(c => c.id)));
    if (pickedIds.has(newCardId)) return false;
    const champCount = player.deck.filter((c,i) => c.isChampion && i !== myDeckIdx).length;
    if (newCard.isChampion && champCount >= 2) return false;
    const oldCard = player.deck[myDeckIdx];
    player.deck[myDeckIdx] = { ...newCard, protected: true };
    result = { ...result, oldCard, newCard };
  } else {
    return false;
  }

  // Reveal phase: broadcast what happened, then advance after 5s
  clearTurnTimer(lobby);
  g.tokenShopSubPhase = 'revealing';
  g.tokenShopLiveAction = null;
  g.lastPowerupResult = result;
  io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));

  setTimeout(() => {
    if (!lobby.game || lobby.game.phase !== 'tokenShop') return;
    g.tokenShopIdx++;
    g.tokenShopSubPhase = 'picking';
    g.lastPowerupResult = null;
    if (g.tokenShopIdx >= g.tokenShopQueue.length) {
      endBingoGame(lobby, io);
    } else {
      startTokenShopTimer(lobby, io);
      io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
    }
  }, 5000);

  return true;
}

// ── Helpers ────────────────────────────────────────────────────────────────
// Kartenpool der Lobby: alle Karten abzüglich der vom Host global ausgeschlossenen
function getCardPool(lobby) {
  if (!lobby.excludedCards?.length) return ALL_CARDS;
  const excluded = new Set(lobby.excludedCards);
  return ALL_CARDS.filter(c => !excluded.has(c.id));
}

// Mindestgröße des Kartenpools für den aktuellen Modus mit den aktuellen Einstellungen
function requiredPoolSize(lobby) {
  const activeCount = lobby.players.filter(p => !p.isSpectator).length;
  if (lobby.mode === 'snake') {
    const s = Math.max(7, Math.min(11, lobby.gridSize || 11));
    return s * s;
  }
  if (lobby.mode === 'shadow-carousel') {
    return activeCount * (lobby.carouselCardsPerTable || 8);
  }
  if (lobby.mode === 'elixir-rush') {
    // Jeder braucht 8 Karten, plus der Markt muss immer befüllbar bleiben
    return activeCount * 8 + (lobby.rushMarketSize || 5);
  }
  // auction & bingo: 8 Runden × Karten pro Runde (mind. 1 pro aktivem Spieler)
  return 8 * Math.max(activeCount, lobby.cardsPerRound || activeCount);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getAdjacentIndices(idx, cols, totalCells) {
  const col = idx % cols;
  const adj = [];
  if (idx - cols >= 0)         adj.push(idx - cols);
  if (idx + cols < totalCells) adj.push(idx + cols);
  if (col > 0)                 adj.push(idx - 1);
  if (col < cols - 1)          adj.push(idx + 1);
  return adj;
}

// Valid cells adjacent to last pick (or all cells if snake just started/reset)
function getValidCells(game, player) {
  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  const candidates = game.lastPickedCellIndex === null
    ? Array.from({ length: game.grid.length }, (_, i) => i)
    : getAdjacentIndices(game.lastPickedCellIndex, game.gridCols, game.grid.length);
  return candidates.filter(idx =>
    game.grid[idx]?.pickedBy === null &&
    !(game.grid[idx].card.isChampion && champCount >= 2)
  );
}

// Any remaining unpicked cell (used after a snake reset)
function getAnyValidCells(game, player) {
  const champCount = (player.deck || []).filter(c => c.isChampion).length;
  return Array.from({ length: game.grid.length }, (_, i) => i).filter(idx =>
    game.grid[idx]?.pickedBy === null &&
    !(game.grid[idx].card.isChampion && champCount >= 2)
  );
}

function sanitizeLobby(lobby) {
  return {
    code: lobby.code,
    mode: lobby.mode,
    host: lobby.host,
    timerSeconds: lobby.timerSeconds,
    tokenShopTimerSeconds: lobby.tokenShopTimerSeconds ?? 60,
    cardsPerRound: lobby.cardsPerRound || 4,
    startElixir: lobby.startElixir ?? 100,
    showElixir: lobby.showElixir ?? false,
    motherWitchEnabled: lobby.motherWitchEnabled ?? false,
    gridSize: lobby.gridSize || 11,
    carouselCardsPerTable: lobby.carouselCardsPerTable || 8,
    carouselRevealMode: lobby.carouselRevealMode || 'dynamic',
    rushMarketSize: lobby.rushMarketSize || 5,
    rushCardLifetime: lobby.rushCardLifetime || 15,
    rushShowElixir: lobby.rushShowElixir ?? false,
    rushShowTimer: lobby.rushShowTimer ?? true,
    evolutionTimerSeconds: lobby.evolutionTimerSeconds || 0,
    evolutionTokensStart: lobby.evolutionTokensStart || EVOLUTION_TOKENS_START,
    evolutionSuperTokensStart: lobby.evolutionSuperTokensStart ?? EVOLUTION_SUPER_TOKENS_START,
    excludedCards: lobby.excludedCards || [],
    historyCount: lobby.history?.length || 0,
    // Aktiv gegangene Spieler tauchen in der Lobby-Liste nicht mehr auf
    players: lobby.players.filter(p => !p.left).map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || 'knight',
      deck: p.deck || [], elixir: p.elixir ?? (lobby.startElixir ?? 100),
      isSpectator: p.isSpectator ?? false, disconnected: p.disconnected ?? false,
      isAdmin: p.isAdmin ?? false,
    })),
    started: lobby.started,
  };
}

// ── Admin: Übersicht aller aktuell laufenden Lobbys ─────────────────────────
function getActiveLobbiesForAdmin() {
  return [...lobbies.values()]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(l => {
      const realPlayers = l.players.filter(p => !p.isAdmin && !p.left);
      const hostPlayer = l.players.find(p => p.id === l.host);
      return {
        code: l.code,
        mode: l.mode,
        phase: !l.started ? 'lobby' : (l.game?.finished ? 'finished' : 'playing'),
        playerCount: realPlayers.length,
        hostName: hostPlayer?.name || '—',
        createdAt: l.createdAt || null,
      };
    });
}

function buildGameState(lobby) {
  const g = lobby.game;
  return {
    grid: g.grid.map(c => ({ card: c.card, pickedBy: c.pickedBy, pickOrder: c.pickOrder })),
    gridCols: g.gridCols,
    gridRows: g.gridRows,
    currentTurn: g.currentTurn,
    turnOrder: g.turnOrder,
    lastPickedCellIndex: g.lastPickedCellIndex,
    timerRemaining: g.timerRemaining,
    timerSeconds: lobby.timerSeconds,
    finished: g.finished,
    totalTurns: g.turnOrder.length,
    isSnakeReset: g.isSnakeReset,   // tells frontend the snake just restarted
  };
}

// ── Timer ──────────────────────────────────────────────────────────────────
function clearTurnTimer(lobby) {
  if (lobby.game?.timerInterval) {
    clearInterval(lobby.game.timerInterval);
    lobby.game.timerInterval = null;
  }
}

function startTurnTimer(lobby, io) {
  clearTurnTimer(lobby);
  const game = lobby.game;
  game.timerRemaining = lobby.timerSeconds;
  game.timerInterval = setInterval(() => {
    game.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: game.timerRemaining });
    if (game.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      if (lobby.game?.type === 'auction') resolveAuction(lobby, io);
      else autoAdvanceTurn(lobby, io);
    }
  }, 1000);
}

// ── Turn logic ─────────────────────────────────────────────────────────────
function endGame(lobby, io) {
  clearTurnTimer(lobby);
  lobby.game.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'snake',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  io.to(lobby.code).emit('clash:gameState', buildGameState(lobby));
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// wasSkip=true → player had no valid move and turn was skipped without picking
function advanceTurn(lobby, io, wasSkip = false) {
  const game = lobby.game;

  if (wasSkip) {
    game.consecutiveSkips = (game.consecutiveSkips || 0) + 1;
    // All players exhausted at current snake head → reset to new position
    if (game.consecutiveSkips >= lobby.players.length) {
      game.lastPickedCellIndex = null;
      game.consecutiveSkips   = 0;
      game.isSnakeReset       = true;
    }
  } else {
    game.consecutiveSkips = 0;
    game.isSnakeReset     = false;
  }

  game.currentTurn++;
  if (game.currentTurn >= game.turnOrder.length) { endGame(lobby, io); return; }
  if (game.grid.filter(c => c.pickedBy === null).length === 0) { endGame(lobby, io); return; }

  // Sofort Schlangenkopf freigeben falls der aktive Spieler keinen gültigen Zug hat —
  // kein langes Durchlaufen aller Spieler nötig
  if (game.lastPickedCellIndex !== null) {
    const curIdx    = game.turnOrder[game.currentTurn];
    const curPlayer = lobby.players[curIdx];
    if (curPlayer) {
      const valid = getValidCells(game, curPlayer);
      if (valid.length === 0) {
        game.lastPickedCellIndex = null;
        game.consecutiveSkips   = 0;
        game.isSnakeReset       = true;
      }
    }
  }

  io.to(lobby.code).emit('clash:gameState', buildGameState(lobby));
  startTurnTimer(lobby, io);
}

function applyPick(lobby, cellIndex, player, io) {
  const game = lobby.game;
  clearTurnTimer(lobby);

  const cell = game.grid[cellIndex];
  cell.pickedBy  = player.id;
  cell.pickOrder = game.currentTurn;
  player.deck    = [...(player.deck || []), cell.card];
  game.lastPickedCellIndex = cellIndex;
  game.isSnakeReset        = false;

  const lobbyPlayer = lobby.players.find(p => p.id === player.id);
  if (lobbyPlayer) lobbyPlayer.deck = player.deck;

  io.to(lobby.code).emit('clash:cardPicked', {
    cellIndex, playerId: player.id, playerColor: player.color, card: cell.card,
  });
  io.to(lobby.code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

  advanceTurn(lobby, io, false);
}

// Timer expired: auto-pick a random valid card; if stuck → new snake head
function autoAdvanceTurn(lobby, io) {
  const game = lobby.game;
  const currentPlayerIdx = game.turnOrder[game.currentTurn];
  const currentPlayer    = lobby.players[currentPlayerIdx];
  if (!currentPlayer) { advanceTurn(lobby, io, true); return; }

  let valid = getValidCells(game, currentPlayer);

  if (valid.length === 0) {
    // No adjacent valid cells → skip this player, keep snake head for others
    advanceTurn(lobby, io, true);
    return;
  }

  applyPick(lobby, valid[Math.floor(Math.random() * valid.length)], currentPlayer, io);
}

// ── Snake Royale init ──────────────────────────────────────────────────────
function startSnakeRoyale(lobby, io) {
  const size       = Math.max(7, Math.min(11, lobby.gridSize || 11));
  const totalCells = size * size;
  const cards = shuffle(getCardPool(lobby)).slice(0, totalCells);
  const grid  = cards.map(card => ({ card, pickedBy: null, pickOrder: null }));

  // Only active (non-spectator) players participate in turn order
  const activeIndices = lobby.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.isSpectator)
    .map(({ i }) => i);
  const playerOrder = shuffle(activeIndices);
  const turnOrder   = [];
  for (let r = 0; r < 8; r++) turnOrder.push(...playerOrder);

  lobby.players.forEach(p => { p.deck = []; });
  lobby.game = {
    grid,
    gridCols: size,
    gridRows: size,
    turnOrder,
    currentTurn: 0,
    lastPickedCellIndex: null,
    timerRemaining: lobby.timerSeconds,
    timerInterval: null,
    finished: false,
    consecutiveSkips: 0,
    isSnakeReset: false,
  };

  io.to(lobby.code).emit('clash:gameStart', { mode: 'snake' });
  io.to(lobby.code).emit('clash:gameState', buildGameState(lobby));
  startTurnTimer(lobby, io);
}

// ── Elixir Auction ────────────────────────────────────────────────────────

// Mutterhexen-Besuche: 20% Chance pro Runde (2-7), trifft einen zufälligen Spieler
const MOTHER_WITCH_ROUND_MIN = 2;
const MOTHER_WITCH_ROUND_MAX = 7;
const MOTHER_WITCH_CHANCE = 0.3;

const MOTHER_WITCH_ABILITIES = [
  {
    id: 'pigs',
    name: 'Schweinezauber',
    costPct: 0.15,
    greeting: 'Na, mein Täubchen... die Mutterhexe hat einen kleinen Handel für dich!',
    description: 'In der nächsten Runde sehen alle anderen Spieler statt der echten Karten nur Schweine — sie müssen blind bieten. Du siehst alles wie gewohnt.',
  },
  {
    id: 'swap',
    name: 'Vertauschte Karten',
    costPct: 0.20,
    greeting: 'Hihihi... ein kleiner Kartentrick gefällig, meine Süße?',
    description: 'In der nächsten Runde sehen alle anderen Spieler die Karten an falschen Stellen — erst nach dem Bieten wird alles richtiggestellt. Nur du siehst die Wahrheit.',
  },
  {
    id: 'halved',
    name: 'Halbierte Einsätze',
    costPct: 0.10,
    greeting: 'Ein kleiner Fluch für deine Gegner gefällig, mein Schatz?',
    description: 'In der nächsten Runde zählen die Gebote aller Gegner nur halb so viel — dafür bekommen sie einen Teil ihres eingesetzten Elixiers zurück.',
  },
];

// Zufällige Permutation ohne Fixpunkte (jede Karte landet garantiert an falscher Stelle)
function buildDerangement(n) {
  const base = Array.from({ length: n }, (_, i) => i);
  if (n <= 1) return base;
  let arr = base;
  for (let attempt = 0; attempt < 50; attempt++) {
    arr = shuffle(base);
    if (arr.every((v, i) => v !== i)) return arr;
  }
  return arr;
}

function buildAuctionState(lobby, bidsVisible = false, viewerId = null) {
  const g = lobby.game;
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const mw = g.motherWitch;
  const effect = mw?.activeEffect && mw.activeEffect.round === g.round ? mw.activeEffect : null;

  let currentCards = g.currentCards;
  let motherWitchMine = null;

  if (effect) {
    if (viewerId === effect.exemptPlayerId) {
      motherWitchMine = effect.ability;
    } else if (viewerId) {
      // Betroffene Gegner sehen nur den Effekt selbst (Schweine, vertauschte Karten, stillschweigend
      // halbiertes Gebot) — kein Hinweis, dass die Mutterhexe dahintersteckt, sonst ist die Überraschung hin.
      if (effect.ability === 'pigs') {
        currentCards = g.currentCards.map(() => ({ id: 'pig', name: 'Schwein', rarity: 'Common', isChampion: false, isPig: true }));
      } else if (effect.ability === 'swap') {
        if (!mw.swapMap) mw.swapMap = buildDerangement(g.currentCards.length);
        currentCards = mw.swapMap.map(realIdx => g.currentCards[realIdx]);
      }
    }
  }

  return {
    type: 'auction',
    round: g.round,
    maxRounds: g.maxRounds,
    phase: g.phase,
    cardsPerRound: g.cardsPerRound,
    currentCards,
    pendingBidCount: Object.keys(g.bids).length,
    activePlayerCount: activePlayers.length,
    timerRemaining: g.timerRemaining,
    timerSeconds: lobby.timerSeconds,
    showElixir: lobby.showElixir ?? false,
    finished: g.finished,
    motherWitchMine,
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      elixir: p.elixir ?? 100, deck: p.deck || [],
      isSpectator: p.isSpectator ?? false,
    })),
    ...(bidsVisible ? { bids: g.bids } : {}),
  };
}

// Sendet jedem Spieler seine individuelle Sicht der Runde (relevant bei aktivem Mutterhexen-Effekt)
function broadcastAuctionRound(lobby, io) {
  lobby.players.forEach(p => {
    io.to(p.id).emit('clash:auctionRound', buildAuctionState(lobby, false, p.id));
  });
}

function maybeTriggerMotherWitch(lobby, io) {
  if (!lobby.motherWitchEnabled) return;
  const g = lobby.game;
  if (g.round < MOTHER_WITCH_ROUND_MIN || g.round > MOTHER_WITCH_ROUND_MAX) return;
  if (Math.random() >= MOTHER_WITCH_CHANCE) return;

  const eligible = lobby.players.filter(p => !p.isSpectator && !p.disconnected);
  if (!eligible.length) return;

  const target = eligible[Math.floor(Math.random() * eligible.length)];
  const ability = MOTHER_WITCH_ABILITIES[Math.floor(Math.random() * MOTHER_WITCH_ABILITIES.length)];
  const cost = Math.max(1, Math.round((lobby.startElixir ?? 100) * ability.costPct));

  g.motherWitch.pending = { targetPlayerId: target.id, ability: ability.id, cost, forRound: g.round };
  io.to(target.id).emit('clash:motherWitch:visit', {
    ability: ability.id, name: ability.name, greeting: ability.greeting,
    description: ability.description, cost, round: g.round,
  });
}

function startElixirAuction(lobby, io) {
  const startElixir = lobby.startElixir ?? 100;
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const n = activePlayers.length;
  const perRound = Math.max(n, lobby.cardsPerRound || n);
  lobby.players.forEach(p => { p.deck = []; p.elixir = p.isSpectator ? 0 : startElixir; });
  lobby.game = {
    type: 'auction',
    pool: shuffle(getCardPool(lobby)),
    poolIdx: 0,
    round: 0,
    maxRounds: 8,
    cardsPerRound: perRound,
    phase: 'bidding',
    currentCards: [],
    bids: {},
    timerRemaining: lobby.timerSeconds,
    timerInterval: null,
    finished: false,
    motherWitch: { pending: null, activeEffect: null, swapMap: null },
  };
  io.to(lobby.code).emit('clash:gameStart', { mode: 'auction' });
  nextAuctionRound(lobby, io);
}

function nextAuctionRound(lobby, io) {
  const g = lobby.game;
  if (g.round >= g.maxRounds || g.poolIdx + g.cardsPerRound > g.pool.length) {
    endAuctionGame(lobby, io); return;
  }
  g.round++;
  g.phase = 'bidding';
  g.currentCards = g.pool.slice(g.poolIdx, g.poolIdx + g.cardsPerRound);
  g.poolIdx += g.cardsPerRound;
  g.bids = {};
  g.motherWitch.swapMap = null;
  broadcastAuctionRound(lobby, io);
  maybeTriggerMotherWitch(lobby, io);
  startTurnTimer(lobby, io);
}

// Draw a random non-champion bonus card not in the current round's pool
function drawBonusCard(lobby, alreadyGiven = []) {
  const g = lobby.game;
  const cardPool = getCardPool(lobby);
  const currentIds = new Set(g.currentCards.map(c => c.id));
  const givenIds   = new Set(alreadyGiven.map(c => c.id));
  const pool = cardPool.filter(c => !c.isChampion && !currentIds.has(c.id) && !givenIds.has(c.id));
  if (pool.length === 0) {
    let fallback = cardPool.filter(c => !c.isChampion && !currentIds.has(c.id));
    if (!fallback.length) fallback = ALL_CARDS.filter(c => !c.isChampion && !currentIds.has(c.id));
    return fallback[Math.floor(Math.random() * Math.max(1, fallback.length))];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function resolveAuction(lobby, io) {
  const g = lobby.game;
  clearTurnTimer(lobby);
  g.phase = 'reveal';

  const mw = g.motherWitch;
  const effect = mw?.activeEffect && mw.activeEffect.round === g.round ? mw.activeEffect : null;

  // Unbeantworteter Mutterhexen-Besuch für diese Runde verfällt
  if (mw?.pending && mw.pending.forRound === g.round) {
    io.to(mw.pending.targetPlayerId).emit('clash:motherWitch:expire');
    mw.pending = null;
  }

  // Fill missing bids (timer expired active players only — spectators skip)
  lobby.players.forEach(p => {
    if (p.isSpectator) return;
    if (!g.bids[p.id]) g.bids[p.id] = { cardIndex: -1, amount: 0 };
  });

  // Aggregate bids per card — "Halbierte Einsätze" lässt Gegner-Gebote nur halb zählen
  const cardBids = Object.fromEntries(g.currentCards.map((_, i) => [i, []]));
  Object.entries(g.bids).forEach(([pid, bid]) => {
    if (bid.cardIndex < 0) return;
    const halved = effect?.ability === 'halved' && pid !== effect.exemptPlayerId;
    const value  = halved ? Math.floor(bid.amount / 2) : bid.amount;
    cardBids[bid.cardIndex].push({ playerId: pid, amount: bid.amount, value, halved });
  });

  // Determine winner per card (nutzt den ggf. halbierten Wert)
  const winners = {};
  g.currentCards.forEach((_, i) => {
    const bids = cardBids[i];
    if (!bids.length) { winners[i] = null; return; }
    const max = Math.max(...bids.map(b => b.value));
    const tops = bids.filter(b => b.value === max);
    winners[i] = tops[Math.floor(Math.random() * tops.length)].playerId;
  });

  // Consolation pool = uncontested cards (nobody bid on them)
  const uncontested = shuffle(
    Object.entries(winners).filter(([, w]) => w === null).map(([i]) => g.currentCards[Number(i)])
  );
  const usedConsolIdx = new Set();
  const bonusCardsGiven = [];

  // Assign cards + deduct elixir (spectators get nothing)
  const playerResults = {};
  lobby.players.forEach(p => {
    if (p.isSpectator) { playerResults[p.id] = { won: false, bidCard: null, bidAmount: 0, got: null, isBonus: false }; return; }
    const bid      = g.bids[p.id];
    const bidCard  = bid.cardIndex >= 0 ? g.currentCards[bid.cardIndex] : null;
    const won      = bidCard && winners[bid.cardIndex] === p.id;
    const champCount   = (p.deck || []).filter(c => c.isChampion).length;
    const cantTakeChamp = champCount >= 2;
    const halved = effect?.ability === 'halved' && p.id !== effect.exemptPlayerId;
    p.elixir = Math.max(0, (p.elixir ?? 100) - bid.amount);
    if (halved) p.elixir += Math.floor(bid.amount / 2); // Gegner bekommen die Hälfte ihres Einsatzes zurück

    let got     = null;
    let isBonus = false;

    if (won) {
      if (cantTakeChamp && bidCard.isChampion) {
        // Safety-net: bid-check should prevent this, but guard anyway
        got = drawBonusCard(lobby, bonusCardsGiven);
        bonusCardsGiven.push(got);
        isBonus = true;
        winners[bid.cardIndex] = null;
      } else {
        got = bidCard;
      }
    } else {
      // Find first suitable consolation card
      for (let ci = 0; ci < uncontested.length; ci++) {
        if (usedConsolIdx.has(ci)) continue;
        const candidate = uncontested[ci];
        if (cantTakeChamp && candidate.isChampion) continue; // skip champion for capped player
        got = candidate;
        usedConsolIdx.add(ci);
        break;
      }
      // No suitable consolation found → bonus card
      if (!got) {
        got = drawBonusCard(lobby, bonusCardsGiven);
        bonusCardsGiven.push(got);
        isBonus = true;
      }
    }

    if (got) p.deck = [...(p.deck || []), got];
    playerResults[p.id] = { won, bidCard, bidAmount: bid.amount, got, isBonus };
  });

  const state = buildAuctionState(lobby, true);
  state.winners = winners;
  state.cardBids = cardBids;
  state.playerResults = playerResults;
  state.motherWitchReveal = effect ? {
    ability: effect.ability,
    exemptPlayerId: effect.exemptPlayerId,
    swapMap: effect.ability === 'swap' ? mw.swapMap : null,
  } : null;

  if (effect) mw.activeEffect = null;

  io.to(lobby.code).emit('clash:auctionReveal', state);
  io.to(lobby.code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

  setTimeout(() => {
    if (!lobby.game || lobby.game.finished) return;
    nextAuctionRound(lobby, io);
  }, 7000);
}

function endAuctionGame(lobby, io) {
  clearTurnTimer(lobby);
  lobby.game.finished = true;
  if (!lobby.history) lobby.history = [];
  lobby.history.push({
    gameNum: lobby.history.length + 1,
    mode: 'auction',
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: [...(p.deck || [])], isSpectator: p.isSpectator ?? false })),
  });
  io.to(lobby.code).emit('clash:gameOver', {
    players: lobby.players.map(p => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar || '', deck: p.deck || [], isSpectator: p.isSpectator ?? false })),
  });
  notifyDraftComplete(lobby, io);
}

// ── Schatten Karussel ────────────────────────────────────────────────────────
// N Spieler = N Tische mit je 8/12/16 verdeckten, global einzigartigen Karten. Alle Spieler
// wählen gleichzeitig: pro Runde je nach Aufdecksystem 1-2 Karten am eigenen Tisch aufdecken
// und dann eine beliebige Karte nehmen — auch verdeckt. Danach wandern die Tische reihum
// weiter (Tisch 1 → Spieler 2, letzter Tisch → Spieler 1). Nach 8 Picks (volles Deck) ist
// Schluss — bei mehr als 8 Karten pro Tisch bleiben die Reste ungenutzt liegen.
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

// Reconnect/Session-Übernahme: alle Spielreferenzen des jeweiligen Modus auf die neue ID umhängen
function remapGamePlayerId(game, oldId, newId) {
  if (!game || oldId === newId) return;
  if (game.type === 'shadow-carousel') { remapCarouselPlayerId(game, oldId, newId); return; }
  if (game.type === 'auction') {
    if (game.bids?.[oldId]) { game.bids[newId] = game.bids[oldId]; delete game.bids[oldId]; }
    const mw = game.motherWitch;
    if (mw?.pending?.targetPlayerId === oldId) mw.pending.targetPlayerId = newId;
    if (mw?.activeEffect?.exemptPlayerId === oldId) mw.activeEffect.exemptPlayerId = newId;
    return;
  }
  if (game.type === 'bingo') {
    if (Array.isArray(game.tokenShopQueue)) game.tokenShopQueue = game.tokenShopQueue.map(id => (id === oldId ? newId : id));
    Object.keys(game.pickedThisRound || {}).forEach(k => { if (game.pickedThisRound[k] === oldId) game.pickedThisRound[k] = newId; });
    if (game.tokenShopLiveAction?.playerId === oldId) game.tokenShopLiveAction.playerId = newId;
    if (game.lastPowerupResult?.playerId === oldId) game.lastPowerupResult.playerId = newId;
    return;
  }
  if (game.type === 'elixir-rush') {
    if (game.elixir?.[oldId]) { game.elixir[newId] = game.elixir[oldId]; delete game.elixir[oldId]; }
    (game.market || []).forEach(s => { if (s?.lastChange?.buyerId === oldId) s.lastChange.buyerId = newId; });
    return;
  }
  if (game.type === 'card-evolution') {
    if (game.players?.[oldId]) { game.players[newId] = game.players[oldId]; delete game.players[oldId]; }
    if (game.pending?.[oldId]) { game.pending[newId] = game.pending[oldId]; delete game.pending[oldId]; }
    return;
  }
  // Snake (kein type-Feld): Grid-Zuordnungen
  if (Array.isArray(game.grid)) game.grid.forEach(c => { if (c.pickedBy === oldId) c.pickedBy = newId; });
}

// ── Elixir Rush ─────────────────────────────────────────────────────────────
const RUSH_ELIXIR_MS     = 1750;   // 1 Elixier pro 1,75s
const RUSH_START_ELIXIR  = 2;
const RUSH_MAX_ELIXIR    = 10;
const RUSH_AUTOBUY_MS    = 3000;  // voller Balken ohne Kauf → nach 10s zufällige Karte
const RUSH_TICK_MS       = 250;

const RUSH_COUNTDOWN_MS  = 5000;
const RUSH_DECK_SIZE     = 8;
const RUSH_MARKET_SIZES  = [3, 4, 5, 6, 7, 8];
const RUSH_LIFETIMES     = [5, 8, 10, 15, 20, 30]; // Sekunden pro Karte auf dem Markt

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
  const marketSize = RUSH_MARKET_SIZES.includes(lobby.rushMarketSize) ? lobby.rushMarketSize : 5;
  const lifeSec = RUSH_LIFETIMES.includes(lobby.rushCardLifetime) ? lobby.rushCardLifetime : 15;
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

// ── Karten-Evolution ─────────────────────────────────────────────────────────
// Jeder Spieler startet mit 8 Wildcard-Platzhaltern (3 Common/3 Rare/2 Epic) und wertet sie
// mit zwei Token-Arten auf oder ab: normale Tokens liefern eine zufällige Karte der Zielstufe,
// Super-Tokens lassen zwischen 2 gezogenen Kandidaten wählen. Alle echten Karten kommen aus
// einem geteilten Pool pro Lobby — eine Karte kann nie bei zwei Spielern gleichzeitig liegen;
// wird eine Karte erneut auf-/abgewertet, wandert die alte zurück in den Pool.
const EVOLUTION_START_COUNTS = { Common: 3, Rare: 3, Epic: 2 };
const EVOLUTION_TOKENS_START = 15;
const EVOLUTION_SUPER_TOKENS_START = 3;
// Bleiben bei Spielende ungenutzte Wildcards übrig, bekommen Spieler diese Zeit, den
// Auflösungs-Flip noch zu sehen, bevor der Endscreen (GameOverScreen) sie überdeckt.
const EVOLUTION_REVEAL_DELAY_MS = 2400;
const RARITY_CHAIN = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];
const CHAMPION_MAX_PER_PLAYER = 2;

function evolutionSlotRarity(slot) {
  return slot.card ? slot.card.rarity : slot.rarity;
}

// Zielstufe einer Auf-/Abwertung. Beide Enden der Kette rerollen statt zu blockieren:
// Downgrade von Common → anderes Common; Upgrade von Champion → anderer Champion.
function evolutionTargetRarity(rarity, direction) {
  const idx = RARITY_CHAIN.indexOf(rarity);
  if (idx === -1) return null;
  if (direction === 'up') return idx >= RARITY_CHAIN.length - 1 ? RARITY_CHAIN[idx] : RARITY_CHAIN[idx + 1];
  return idx === 0 ? RARITY_CHAIN[0] : RARITY_CHAIN[idx - 1];
}

// Nur der Weg ZU einem Champion (Aufwertung von Legendary, oder Reroll eines bereits
// vorhandenen Champions) kostet 2 Tokens. Champion → Legendary (Abwertung) kostet wieder
// nur 1, wie jede andere Abwertung auch.
function evolutionActionCost(rarity, targetRarity) {
  return targetRarity === 'Champion' ? 2 : 1;
}

function evolutionChampionCount(playerState) {
  return playerState.slots.filter(s => s.card?.isChampion).length;
}

// Nebenläufigkeits-Hinweis: Ziehen aus dem Pool ist bewusst nirgends async — weder hier
// noch in evolutionApplyNormal/Super/resolvePending liegt ein `await` zwischen dem Lesen
// und dem Mutieren von g.pool. Node verarbeitet Socket-Events strikt sequenziell (ein
// Event läuft immer vollständig durch, bevor das nächste startet); zwei Spieler, die in
// derselben Millisekunde auf "Aufwerten" klicken, werden also nie wirklich gleichzeitig
// verarbeitet, sondern garantiert nacheinander. Dadurch kann dieselbe Karte nie doppelt
// gezogen werden — SOLANGE hier kein `await` eingebaut wird, das diese Kette unterbricht.
//
// Zieht `count` zufällige, verschiedene Karten der gewünschten Rarity aus dem Pool und
// entfernt sie daraus (Reservierung) — gibt null zurück, wenn nicht genug vorhanden sind.
function drawFromPool(g, rarity, count) {
  const matches = g.pool.filter(c => c.rarity === rarity);
  if (matches.length < count) return null;
  const chosen = shuffle(matches).slice(0, count);
  const chosenIds = new Set(chosen.map(c => c.id));
  g.pool = g.pool.filter(c => !chosenIds.has(c.id));
  return chosen;
}

function returnToPool(g, card) {
  if (card) g.pool.push(card);
}

function syncEvolutionDeck(lobby, playerId) {
  const ps = lobby.game.players[playerId];
  const player = lobby.players.find(p => p.id === playerId);
  if (ps && player) player.deck = ps.slots.filter(s => s.card).map(s => s.card);
}

// Spielende: Wildcards, die nie angefasst wurden, verwandeln sich in eine zufällige echte
// Karte ihrer Rarity (noch aus dem Pool) — niemand soll mit einem ungenutzten Platzhalter
// dastehen. Ist der Pool für eine Rarity leer, bleibt die Wildcard ausnahmsweise bestehen.
// Gibt zurück, ob mindestens eine Wildcard aufgelöst wurde — steuert, ob checkEvolutionEnd
// mit dem Abschluss kurz wartet, damit der Auflösungs-Flip überhaupt sichtbar wird.
function resolveRemainingWildcards(lobby) {
  const g = lobby.game;
  let anyResolved = false;
  lobby.players.filter(p => !p.isSpectator).forEach(p => {
    const ps = g.players[p.id];
    if (!ps) return;
    ps.slots.forEach(slot => {
      if (slot.card) return;
      const drawn = drawFromPool(g, slot.rarity, 1);
      if (drawn) { slot.card = drawn[0]; anyResolved = true; }
    });
    syncEvolutionDeck(lobby, p.id);
  });
  return anyResolved;
}

function buildEvolutionState(lobby) {
  const g = lobby.game;
  const poolCounts = {};
  RARITY_CHAIN.forEach(r => { poolCounts[r] = 0; });
  g.pool.forEach(c => { poolCounts[c.rarity] = (poolCounts[c.rarity] || 0) + 1; });

  return {
    type: 'card-evolution',
    finished: g.finished,
    poolCounts,
    timerRemaining: g.timerRemaining ?? null,
    timerSeconds: lobby.evolutionTimerSeconds || 0,
    players: lobby.players.filter(p => !p.isSpectator).map(p => {
      const ps = g.players[p.id];
      return {
        id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
        slots: ps ? ps.slots : [],
        tokens: ps ? ps.tokens : 0,
        superTokens: ps ? ps.superTokens : 0,
        pending: g.pending[p.id] || null,
      };
    }),
  };
}

function broadcastEvolutionState(lobby, io) {
  io.to(lobby.code).emit('clash:evo:state', buildEvolutionState(lobby));
}

function startCardEvolution(lobby, io) {
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const tokensStart = lobby.evolutionTokensStart || EVOLUTION_TOKENS_START;
  const superTokensStart = lobby.evolutionSuperTokensStart ?? EVOLUTION_SUPER_TOKENS_START;
  const players = {};
  activePlayers.forEach(p => {
    const slots = [];
    Object.entries(EVOLUTION_START_COUNTS).forEach(([rarity, count]) => {
      for (let i = 0; i < count; i++) slots.push({ rarity, card: null });
    });
    players[p.id] = { slots, tokens: tokensStart, superTokens: superTokensStart };
  });
  lobby.players.forEach(p => { p.deck = []; });
  lobby.game = {
    type: 'card-evolution',
    players,
    pool: shuffle(getCardPool(lobby)),
    pending: {},
    finished: false,
    timerRemaining: null,
    timerInterval: null,
  };
  io.to(lobby.code).emit('clash:gameStart', { mode: 'card-evolution' });
  broadcastEvolutionState(lobby, io);
  startEvolutionTimer(lobby, io);
}

// Gesamt-Timer fürs Picken (0/undefined = unbegrenzt, kein Countdown). Nutzt denselben
// lobby.game.timerInterval-Slot wie die anderen Modi, daher funktioniert clearTurnTimer(lobby)
// unverändert auch hier.
function startEvolutionTimer(lobby, io) {
  clearTurnTimer(lobby);
  const g = lobby.game;
  const seconds = lobby.evolutionTimerSeconds || 0;
  if (!seconds) { g.timerRemaining = null; return; }
  g.timerRemaining = seconds;
  g.timerInterval = setInterval(() => {
    g.timerRemaining--;
    io.to(lobby.code).emit('clash:timerTick', { remaining: g.timerRemaining });
    if (g.timerRemaining <= 0) {
      clearTurnTimer(lobby);
      checkEvolutionEnd(lobby, io, { force: true });
    }
  }, 1000);
}

function evolutionApplyNormal(lobby, socket, playerId, slotIdx, direction) {
  const g = lobby.game;
  const ps = g.players[playerId];
  const slot = ps.slots[slotIdx];
  const rarity = evolutionSlotRarity(slot);
  const targetRarity = evolutionTargetRarity(rarity, direction);
  if (!targetRarity) { socket.emit('clash:error', { message: 'Diese Karte kann nicht weiter aufgewertet werden.' }); return false; }
  const cost = evolutionActionCost(rarity, targetRarity);
  if (ps.tokens < cost) { socket.emit('clash:error', { message: 'Nicht genug Evolution-Tokens.' }); return false; }
  // Limit gilt nur beim Erwerb eines NEUEN Champions — ein bereits vorhandener Champion darf
  // sich jederzeit in einen anderen umrollen, ohne dass das die Gesamtzahl erhöht.
  const becomesNewChampion = targetRarity === 'Champion' && rarity !== 'Champion';
  if (becomesNewChampion && evolutionChampionCount(ps) >= CHAMPION_MAX_PER_PLAYER) {
    socket.emit('clash:error', { message: 'Champion-Limit erreicht (max. 2).' });
    return false;
  }
  const drawn = drawFromPool(g, targetRarity, 1);
  if (!drawn) { socket.emit('clash:error', { message: `Keine ${targetRarity}-Karten mehr im Pool.` }); return false; }
  ps.tokens -= cost;
  returnToPool(g, slot.card);
  slot.card = drawn[0];
  slot.rarity = targetRarity;
  return true;
}

function evolutionApplySuper(lobby, socket, playerId, slotIdx, direction) {
  const g = lobby.game;
  const ps = g.players[playerId];
  const slot = ps.slots[slotIdx];
  const rarity = evolutionSlotRarity(slot);
  const targetRarity = evolutionTargetRarity(rarity, direction);
  if (!targetRarity) { socket.emit('clash:error', { message: 'Diese Karte kann nicht weiter aufgewertet werden.' }); return false; }
  const cost = evolutionActionCost(rarity, targetRarity);
  if (ps.superTokens < cost) { socket.emit('clash:error', { message: 'Nicht genug Super-Tokens.' }); return false; }
  const becomesNewChampion = targetRarity === 'Champion' && rarity !== 'Champion';
  if (becomesNewChampion && evolutionChampionCount(ps) >= CHAMPION_MAX_PER_PLAYER) {
    socket.emit('clash:error', { message: 'Champion-Limit erreicht (max. 2).' });
    return false;
  }
  const drawn = drawFromPool(g, targetRarity, 2);
  if (!drawn) { socket.emit('clash:error', { message: `Nicht genug ${targetRarity}-Karten im Pool (2 nötig).` }); return false; }
  ps.superTokens -= cost;
  // Beide Kandidaten sind ab jetzt aus dem Pool entfernt/blockiert, bis der Spieler wählt
  g.pending[playerId] = { slotIdx, direction, targetRarity, candidates: drawn };
  return true;
}

function evolutionResolvePending(lobby, playerId, chosenIndex) {
  const g = lobby.game;
  const pending = g.pending[playerId];
  if (!pending || (chosenIndex !== 0 && chosenIndex !== 1)) return false;
  const ps = g.players[playerId];
  const slot = ps.slots[pending.slotIdx];
  const chosen = pending.candidates[chosenIndex];
  const other = pending.candidates[1 - chosenIndex];
  returnToPool(g, other);
  returnToPool(g, slot.card);
  slot.card = chosen;
  slot.rarity = pending.targetRarity;
  delete g.pending[playerId];
  return true;
}

function checkEvolutionEnd(lobby, io, { force = false } = {}) {
  const g = lobby.game;
  if (!g || g.type !== 'card-evolution' || g.finished) return;
  if (!force) {
    // Getrennte Spieler blockieren das Spielende nicht auf unbestimmte Zeit (analog zu den
    // anderen Modi, die getrennte Spieler von ihren Fertig-Checks ausnehmen)
    const activePlayers = lobby.players.filter(p => !p.isSpectator && !p.disconnected);
    const done = activePlayers.length > 0 && activePlayers.every(p => {
      const ps = g.players[p.id];
      return ps && ps.tokens === 0 && ps.superTokens === 0 && !g.pending[p.id];
    });
    if (!done) return;
  }
  clearTurnTimer(lobby);
  // Erzwungenes Ende (Timer abgelaufen): offene Super-Token-Wahlen zufällig auflösen —
  // sonst blieben deren 2 reservierte Kandidaten für immer aus dem Pool verschwunden.
  const hadPendingChoices = Object.keys(g.pending).length > 0;
  Object.keys(g.pending).forEach(pid => {
    evolutionResolvePending(lobby, pid, Math.random() < 0.5 ? 0 : 1);
  });
  const anyWildcardsResolved = resolveRemainingWildcards(lobby) || hadPendingChoices;
  g.finished = true;
  // Zustand mit den aufgelösten Karten sofort zeigen (Flip-Animation im Frontend), den
  // eigentlichen Spielende-Wechsel zum GameOverScreen aber erst kurz danach auslösen —
  // sonst wäre die Auflösung nie sichtbar, weil beide Events sonst im selben Tick ankämen.
  broadcastEvolutionState(lobby, io);
  const finalize = () => {
    if (!lobby.history) lobby.history = [];
    const historyPlayers = lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [], isSpectator: p.isSpectator ?? false,
    }));
    lobby.history.push({ gameNum: lobby.history.length + 1, mode: 'card-evolution', players: historyPlayers });
    io.to(lobby.code).emit('clash:gameOver', { players: historyPlayers });
    notifyDraftComplete(lobby, io);
  };
  if (anyWildcardsResolved) {
    setTimeout(() => {
      const l = lobbies.get(lobby.code);
      if (!l || l.game !== g) return; // Lobby zwischenzeitlich neugestartet/Modus gewechselt
      finalize();
    }, EVOLUTION_REVEAL_DELAY_MS);
  } else {
    finalize();
  }
}

// ── HTTP ───────────────────────────────────────────────────────────────────
function createClashRoyaleRouter({ requireAuth, STREAMER_TWITCH_ID } = {}) {
  const router = express.Router();

  router.get('/lobby/:code', (req, res) => {
    const lobby = lobbies.get(req.params.code.toUpperCase());
    if (!lobby) return res.status(404).json({ error: 'Lobby nicht gefunden' });
    res.json(sanitizeLobby(lobby));
  });

  if (requireAuth) {
    router.get('/admin/lobbies', requireAuth, (req, res) => {
      if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
        return res.status(403).json({ error: 'Access Denied' });
      }
      res.json(getActiveLobbiesForAdmin());
    });
  }

  return router;
}

// ── Socket ─────────────────────────────────────────────────────────────────
function registerClashRoyaleSocket(socket, io, { isAdmin = false, twitchId = null, twitchLogin = null } = {}) {
  // Host-Aktionen dürfen genauso vom (server-seitig verifizierten) Admin ausgeführt werden
  const canControl = (lobby) => lobby.host === socket.id || isAdmin;

  socket.on('clash:createLobby', ({ playerName, mode, timerSeconds = 60, cardsPerRound = 4, avatar = 'knight' }) => {
    if (!playerName?.trim()) return;
    const code = generateCode();
    const lobby = {
      code, mode: VALID_MODES.includes(mode) ? mode : 'snake', host: socket.id,
      timerSeconds: Math.max(15, Math.min(300, Number(timerSeconds) || 60)),
      tokenShopTimerSeconds: 60,
      cardsPerRound: Math.max(2, Math.min(12, Number(cardsPerRound) || 4)),
      startElixir: 100,
      showElixir: false,
      motherWitchEnabled: false,
      gridSize: 11,
      carouselCardsPerTable: 8,
      carouselRevealMode: 'dynamic',
      rushMarketSize: 5,
      rushCardLifetime: 15,
      rushShowElixir: false,
      rushShowTimer: true,
      evolutionTimerSeconds: 0,
      evolutionTokensStart: EVOLUTION_TOKENS_START,
      evolutionSuperTokensStart: EVOLUTION_SUPER_TOKENS_START,
      excludedCards: [],
      createdAt: Date.now(),
      players: [{ id: socket.id, name: playerName.trim(), color: PLAYER_COLORS[0], avatar: avatar || 'knight', deck: [], elixir: 100, isSpectator: false, twitchId: twitchId || null }],
      started: false, game: null,
      history: [],
    };
    lobbies.set(code, lobby);
    socket.join(code);
    socket.emit('clash:lobbyCreated', { code });
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:joinLobby', ({ code, playerName, avatar = 'knight', auto = false }) => {
    const uCode = (code || '').toUpperCase();
    const lobby = lobbies.get(uCode);
    // auto = stiller Auto-Rejoin aus localStorage: bei ungültiger Sitzung keinen Fehler zeigen,
    // sondern dem Client nur signalisieren, dass er die gespeicherte Sitzung verwerfen soll
    if (!lobby) {
      if (auto) return socket.emit('clash:sessionExpired');
      return socket.emit('clash:error', { message: 'Lobby nicht gefunden' });
    }
    if (!playerName?.trim())  return socket.emit('clash:error', { message: 'Bitte Namen eingeben' });
    const trimmedName = playerName.trim();

    // Reconnect/Übernahme: Spieler mit gleichem Namen während eines laufenden Spiels.
    // Auch bei noch aktiver alter Verbindung (z.B. zweiter Tab) wird die Sitzung übernommen,
    // statt einen Duplikat-Spieler zu erzeugen.
    if (lobby.started && lobby.game && !lobby.game.finished) {
      const dc = lobby.players.find(p => !p.left && !p.isAdmin && p.name === trimmedName);
      if (dc) {
        const oldId = dc.id;
        if (!dc.disconnected && oldId !== socket.id) {
          io.to(oldId).emit('clash:sessionTakeover');
          io.sockets.sockets.get(oldId)?.leave(uCode);
        }
        dc.id = socket.id;
        dc.disconnected = false;
        dc.disconnectedAt = null;
        dc.twitchId = twitchId || dc.twitchId || null;
        if (dc.wasHost) { lobby.host = socket.id; dc.wasHost = false; }
        if (lobby.host === oldId) lobby.host = socket.id;
        remapGamePlayerId(lobby.game, oldId, socket.id);
        socket.join(uCode);
        socket.emit('clash:lobbyJoined', { code: uCode, isHost: lobby.host === socket.id, reconnected: true });
        io.to(uCode).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
        // Send current game state depending on mode
        if (lobby.game.type === 'bingo') {
          socket.emit('clash:gameReconnect', { mode: 'bingo' });
          socket.emit('clash:bingo:state', buildBingoState(lobby));
        } else if (lobby.game.type === 'auction') {
          socket.emit('clash:gameReconnect', { mode: 'auction' });
          socket.emit('clash:auctionRound', buildAuctionState(lobby, false, socket.id));
        } else if (lobby.game.type === 'shadow-carousel') {
          socket.emit('clash:gameReconnect', { mode: 'shadow-carousel' });
          socket.emit('clash:carousel:state', buildCarouselState(lobby, socket.id));
        } else if (lobby.game.type === 'elixir-rush') {
          socket.emit('clash:gameReconnect', { mode: 'elixir-rush' });
          socket.emit('clash:rush:state', buildRushState(lobby));
        } else {
          socket.emit('clash:gameReconnect', { mode: 'snake' });
          socket.emit('clash:gameState', buildGameState(lobby));
        }
        return;
      }
      if (auto) return socket.emit('clash:sessionExpired');
      return socket.emit('clash:error', { message: 'Spiel läuft bereits' });
    }

    // Reconnect: gleicher Name war gerade in der Gnadenfrist (kurzer Netzwerk-Hänger, Tab-Reload, ...)
    const dcLobby = lobby.players.find(p => p.disconnected && !p.left && p.name === trimmedName);
    // Übernahme: gleicher Name, alte Verbindung noch aktiv (z.B. anderer Tab)
    const activeSame = !dcLobby
      ? lobby.players.find(p => !p.disconnected && !p.isAdmin && p.name === trimmedName && p.id !== socket.id)
      : null;
    if (dcLobby) {
      dcLobby.id = socket.id;
      dcLobby.disconnected = false;
      dcLobby.disconnectedAt = null;
      dcLobby.twitchId = twitchId || dcLobby.twitchId || null;
      if (dcLobby.wasHost) { lobby.host = socket.id; dcLobby.wasHost = false; }
    } else if (activeSame) {
      io.to(activeSame.id).emit('clash:sessionTakeover');
      io.sockets.sockets.get(activeSame.id)?.leave(uCode);
      if (lobby.host === activeSame.id) lobby.host = socket.id;
      activeSame.id = socket.id;
      activeSame.disconnected = false;
      activeSame.disconnectedAt = null;
      activeSame.twitchId = twitchId || activeSame.twitchId || null;
    } else {
      if (lobby.players.filter(p => !p.left).length >= 8) {
        if (auto) return socket.emit('clash:sessionExpired');
        return socket.emit('clash:error', { message: 'Lobby voll (max. 8)' });
      }
      if (!lobby.players.find(p => p.id === socket.id)) {
        lobby.players.push({
          id: socket.id, name: trimmedName,
          color: PLAYER_COLORS[lobby.players.length % PLAYER_COLORS.length],
          avatar: avatar || 'knight', deck: [], elixir: lobby.startElixir ?? 100,
          isSpectator: false, twitchId: twitchId || null,
        });
      }
    }
    socket.join(uCode);
    socket.emit('clash:lobbyJoined', { code: uCode, isHost: lobby.host === socket.id });
    io.to(uCode).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    if (lobby.game) {
      if (lobby.game.type === 'bingo') socket.emit('clash:bingo:state', buildBingoState(lobby));
      else if (lobby.game.type === 'auction') socket.emit('clash:auctionRound', buildAuctionState(lobby, false, socket.id));
      else if (lobby.game.type === 'shadow-carousel') socket.emit('clash:carousel:state', buildCarouselState(lobby, socket.id));
      else if (lobby.game.type === 'elixir-rush') socket.emit('clash:rush:state', buildRushState(lobby));
      else socket.emit('clash:gameState', buildGameState(lobby));
    }
  });

  socket.on('clash:kickPlayer', ({ code, playerId }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started || playerId === socket.id) return;
    const idx = lobby.players.findIndex(p => p.id === playerId);
    if (idx !== -1 && !lobby.players[idx].isAdmin) {
      lobby.players.splice(idx, 1);
      io.to(playerId).emit('clash:kicked');
      io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    }
  });

  // Admin: erzwingt Zuschauer-Status eines beliebigen Spielers, auch während einer laufenden Runde
  socket.on('clash:setPlayerSpectator', ({ code, targetPlayerId, isSpectator }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    const target = lobby.players.find(p => p.id === targetPlayerId && !p.isAdmin);
    if (!target) return;
    target.isSpectator = !!isSpectator;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    // Falls dadurch in einer laufenden Auction-Bidrunde alle verbliebenen aktiven Spieler geboten haben → sofort auflösen
    if (lobby.game?.type === 'auction' && lobby.game.phase === 'bidding') {
      const activePlayers = lobby.players.filter(p => !p.isSpectator);
      if (Object.keys(lobby.game.bids).length >= activePlayers.length) {
        clearTurnTimer(lobby);
        resolveAuction(lobby, io);
      }
    }
    // Analog im Karussel: wenn der neue Zuschauer der letzte fehlende Pick war → Runde abschließen
    if (lobby.game?.type === 'shadow-carousel' && lobby.game.phase === 'picking') {
      broadcastCarouselState(lobby, io);
      checkCarouselRoundComplete(lobby, io);
    }
    // Elixir Rush: Reaktivierte Spieler brauchen einen Elixierbalken; wird jemand Zuschauer,
    // könnte das Spiel dadurch beendet sein (alle übrigen Decks voll)
    if (lobby.game?.type === 'elixir-rush' && !lobby.game.finished) {
      if (!target.isSpectator && !lobby.game.elixir[target.id]) {
        lobby.game.elixir[target.id] = { value: RUSH_START_ELIXIR, ts: Date.now(), fullSince: null };
      }
      io.to(code).emit('clash:rush:state', buildRushState(lobby));
      checkRushEnd(lobby, io);
    }
  });

  // Host (oder Admin) überträgt den Host-Status an einen anderen Spieler
  socket.on('clash:transferHost', ({ code, targetPlayerId }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    const target = lobby.players.find(p => p.id === targetPlayerId && !p.isAdmin);
    if (!target) return;
    lobby.host = targetPlayerId;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:setTimer', ({ code, seconds }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    lobby.timerSeconds = Math.max(5, Math.min(300, Number(seconds) || 60));
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  // Host: Zeitlimit pro Token im Bingo-Token-Shop
  socket.on('clash:setTokenShopTimer', ({ code, seconds }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    lobby.tokenShopTimerSeconds = Math.max(10, Math.min(300, Number(seconds) || 60));
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  // Host (oder Admin) wechselt den Spielmodus — nur in der Lobby-Phase, nie während einer laufenden Runde
  socket.on('clash:setMode', ({ code, mode }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (!VALID_MODES.includes(mode)) return;
    lobby.mode = mode;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:setCardsPerRound', ({ code, count }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    const n = Math.max(2, Math.min(12, Number(count) || 4));
    if (8 * n > getCardPool(lobby).length) return; // Pool reicht für 8 Runden × n Karten nicht
    lobby.cardsPerRound = n;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  // Host (oder Admin) schließt Karten global vom Draft aus — gilt für alle Spielmodi dieser Lobby
  socket.on('clash:setExcludedCards', ({ code, cardIds }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (!Array.isArray(cardIds)) return;
    const validIds = new Set(ALL_CARDS.map(c => c.id));
    lobby.excludedCards = [...new Set(cardIds.filter(id => validIds.has(id)))];

    // Einstellungen automatisch nach unten anpassen, wenn der geschrumpfte Pool sie nicht mehr zulässt
    const poolSize = getCardPool(lobby).length;
    if (lobby.gridSize * lobby.gridSize > poolSize) {
      lobby.gridSize = Math.max(7, Math.min(11, Math.floor(Math.sqrt(poolSize))));
    }
    const maxPerRound = Math.floor(poolSize / 8); // Auction/Bingo: 8 Runden × Karten pro Runde
    if (lobby.cardsPerRound > maxPerRound) {
      lobby.cardsPerRound = Math.max(2, maxPerRound);
    }
    if (Math.floor(poolSize / lobby.carouselCardsPerTable) < 2) {
      // Größte Tischgröße wählen, die noch mind. 2 Spieler erlaubt
      const fitting = [...CAROUSEL_TABLE_SIZES].reverse().find(s => Math.floor(poolSize / s) >= 2);
      lobby.carouselCardsPerTable = fitting || 8;
    }

    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:startGame', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (lobby.players.length < 2) return socket.emit('clash:error', { message: 'Mindestens 2 Spieler benötigt' });
    const poolSize = getCardPool(lobby).length;
    // Karussel: Kartenpool muss für alle Tische reichen (z.B. 16 Karten → max. 7 Spieler)
    if (lobby.mode === 'shadow-carousel') {
      const activeCount = lobby.players.filter(p => !p.isSpectator).length;
      const perTable = lobby.carouselCardsPerTable || 8;
      const maxP = carouselMaxPlayers(perTable, poolSize);
      if (activeCount > maxP) {
        return socket.emit('clash:error', {
          message: `Bei ${perTable} Karten pro Tisch sind max. ${maxP} Spieler möglich (Kartenpool: ${poolSize})!`,
        });
      }
    } else if (lobby.mode === 'card-evolution') {
      // Kein Mindestpool nötig — der Start besteht nur aus Wildcards, echte Karten kommen
      // erst on-demand durch Tokens; ein knapper Pool wird während des Spiels durch
      // ausgegraute Aktionen abgefangen (kein Crash/Absturz möglich).
    } else if (poolSize < requiredPoolSize(lobby)) {
      return socket.emit('clash:error', {
        message: `Kartenpool zu klein: ${requiredPoolSize(lobby)} Karten benötigt, nur ${poolSize} verfügbar. Schließe weniger Karten aus!`,
      });
    }
    lobby.started = true;
    if (lobby.mode === 'auction') startElixirAuction(lobby, io);
    else if (lobby.mode === 'bingo') startBingoRoyale(lobby, io);
    else if (lobby.mode === 'shadow-carousel') startShadowCarousel(lobby, io);
    else if (lobby.mode === 'elixir-rush') startElixirRush(lobby, io);
    else if (lobby.mode === 'card-evolution') startCardEvolution(lobby, io);
    else startSnakeRoyale(lobby, io);
    // Streamer-Automatik: z. B. OBS auf die Minigame-Szene schalten
    emitStreamerEvent(lobby, io, 'gameStart');
  });

  // Deck-Overlay (Browserquelle in OBS) meldet sich mit seinem Overlay-Key an
  socket.on('cr:deckoverlay:join', ({ overlayKey }) => {
    const cfg = crStreamerStore.findByOverlayKey(String(overlayKey || ''));
    if (!cfg) return socket.emit('cr:deckoverlay:error', { message: 'Overlay nicht gefunden' });
    socket.join(`croverlay:${cfg.overlayKey}`);
    socket.emit('cr:deckoverlay:state', {
      obs: cfg.obs,
      actions: cfg.actions,
      lastDecks: cfg.lastDecks,
    });
  });

  socket.on('clash:auction:bid', ({ code, cardIndex, amount }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'auction' || lobby.game.phase !== 'bidding') return;
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player || player.isSpectator || lobby.game.bids[socket.id]) return; // already bid or spectator
    const safeAmount = Math.max(0, Math.min(player.elixir ?? 100, Number(amount) || 0));
    const safeIdx = Number(cardIndex);
    if (safeIdx < -1 || safeIdx >= lobby.game.currentCards.length) return;

    // Champion-Limit: max 2 Champions pro Deck
    if (safeIdx >= 0) {
      const biddingCard  = lobby.game.currentCards[safeIdx];
      const champCount   = (player.deck || []).filter(c => c.isChampion).length;
      if (biddingCard?.isChampion && champCount >= 2) {
        return socket.emit('clash:error', { message: 'Du hast bereits 2 Champions — kein weiterer möglich!' });
      }
    }

    lobby.game.bids[socket.id] = { cardIndex: safeIdx, amount: safeAmount };
    // Notify everyone (without revealing what was bid)
    io.to(code).emit('clash:auctionBidUpdate', {
      pendingBidCount: Object.keys(lobby.game.bids).length,
      totalPlayers: lobby.players.length,
    });
    // Auto-reveal if all active players have bid
    const activePlayers = lobby.players.filter(p => !p.isSpectator);
    if (Object.keys(lobby.game.bids).length >= activePlayers.length) {
      clearTurnTimer(lobby);
      resolveAuction(lobby, io);
    }
  });

  socket.on('clash:pickCard', ({ code, cellIndex }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || !lobby.started || lobby.game.finished) return;

    const game = lobby.game;
    const currentPlayerIdx = game.turnOrder[game.currentTurn];
    const currentPlayer    = lobby.players[currentPlayerIdx];
    if (currentPlayer?.id !== socket.id) return;
    if (typeof cellIndex !== 'number' || cellIndex < 0 || cellIndex >= game.grid.length) return;
    if (game.grid[cellIndex].pickedBy !== null) return;

    // Adjacency check
    if (game.lastPickedCellIndex !== null) {
      const adj = getAdjacentIndices(game.lastPickedCellIndex, game.gridCols, game.grid.length);
      if (!adj.includes(cellIndex))
        return socket.emit('clash:error', { message: 'Karte nicht benachbart' });
    }

    // Champion-limit check
    const champCount = (currentPlayer.deck || []).filter(c => c.isChampion).length;
    if (game.grid[cellIndex].card.isChampion && champCount >= 2)
      return socket.emit('clash:error', { message: 'Max. 2 Champions pro Deck!' });

    applyPick(lobby, cellIndex, currentPlayer, io);
  });

  socket.on('clash:requestState', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    socket.emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    if (lobby.game) {
      if (lobby.game.type === 'bingo') socket.emit('clash:bingo:state', buildBingoState(lobby));
      else if (lobby.game.type === 'auction') socket.emit('clash:auctionRound', buildAuctionState(lobby, false, socket.id));
      else if (lobby.game.type === 'shadow-carousel') socket.emit('clash:carousel:state', buildCarouselState(lobby, socket.id));
      else if (lobby.game.type === 'elixir-rush') socket.emit('clash:rush:state', buildRushState(lobby));
      else socket.emit('clash:gameState', buildGameState(lobby));
    }
  });

  // Explizites Verlassen (Leave-Button). Im Gegensatz zu einem Disconnect (Netzwerk-Hänger, Tab-Reload)
  // wirkt das SOFORT — auch während eines laufenden Spiels, ohne Reconnect-Fenster.
  // Der Ack-Callback erlaubt dem Client, erst NACH der Verarbeitung die Verbindung zu trennen.
  socket.on('clash:leaveLobby', ({ code }, ack) => {
    const done = () => { if (typeof ack === 'function') ack(); };
    const lobby = lobbies.get(code);
    if (!lobby) return done();
    const idx = lobby.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return done();
    const leavingPlayer = lobby.players[idx];
    const wasHost = lobby.host === socket.id;
    socket.leave(code);

    // Laufende Runde: aus dem Array darf nicht gespleißt werden (turnOrder hält Indizes),
    // aber der Spieler wird sofort als "gegangen" markiert: unsichtbar in der Lobby-Liste,
    // Zuschauer fürs Spiel, kein Reconnect-Fenster. Endgültig entfernt beim Lobby-Neustart.
    if (lobby.started && lobby.game && !lobby.game.finished) {
      leavingPlayer.left = true;
      leavingPlayer.disconnected = true;
      leavingPlayer.disconnectedAt = Date.now();
      leavingPlayer.isSpectator = true;

      if (lobby.players.filter(p => !p.isAdmin && !p.left).length === 0) {
        clearTurnTimer(lobby);
        lobbies.delete(code);
        return done();
      }
      if (wasHost && !leavingPlayer.isAdmin) {
        const next = lobby.players.find(p => !p.left && !p.disconnected && !p.isAdmin);
        if (next) lobby.host = next.id;
      }
      io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

      // Spiel-Logik nachziehen (wie bei Disconnect bzw. Zuschauer-Setzen)
      const g = lobby.game;
      if (g.type === 'bingo') {
        if (g.phase === 'tokenShop') {
          const wasCurrent = g.tokenShopQueue[g.tokenShopIdx] === socket.id && g.tokenShopSubPhase === 'picking';
          // Künftige Tokens des Spielers verfallen
          g.tokenShopQueue = g.tokenShopQueue.filter((id, i) => i <= g.tokenShopIdx || id !== socket.id);
          if (wasCurrent) { clearTurnTimer(lobby); skipTokenShopTurn(lobby, io); }
          else io.to(code).emit('clash:bingo:state', buildBingoState(lobby));
        } else {
          const curIdx = g.turnOrder?.[g.currentTurn];
          if (lobby.players[curIdx]?.id === socket.id) autoAdvanceBingo(lobby, io);
          else io.to(code).emit('clash:bingo:state', buildBingoState(lobby));
        }
      } else if (g.type === 'auction') {
        if (g.phase === 'bidding') {
          delete g.bids[socket.id]; // sein Gebot zählt nicht mehr
          const activePlayers = lobby.players.filter(p => !p.isSpectator);
          if (Object.keys(g.bids).length >= activePlayers.length) {
            clearTurnTimer(lobby);
            resolveAuction(lobby, io);
          }
        }
      } else if (g.type === 'shadow-carousel') {
        broadcastCarouselState(lobby, io);
        checkCarouselRoundComplete(lobby, io);
      } else if (g.type === 'elixir-rush') {
        io.to(code).emit('clash:rush:state', buildRushState(lobby));
        checkRushEnd(lobby, io);
      } else {
        const curIdx = g.turnOrder?.[g.currentTurn];
        if (curIdx !== undefined && lobby.players[curIdx]?.id === socket.id) autoAdvanceTurn(lobby, io);
      }
      return done();
    }

    // Lobby-Phase oder Spielende: sofort komplett entfernen
    lobby.players.splice(idx, 1);
    if (lobby.players.filter(p => !p.isAdmin).length === 0) {
      clearTurnTimer(lobby);
      lobbies.delete(code);
      return done();
    }
    if (wasHost && !leavingPlayer.isAdmin) {
      const nextHost = lobby.players.find(p => !p.isAdmin);
      if (nextHost) lobby.host = nextHost.id;
    }
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    done();
  });

  socket.on('clash:toggleSpectator', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby || lobby.started) return;
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player) return;
    player.isSpectator = !player.isSpectator;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:setShowElixir', ({ code, show }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    lobby.showElixir = !!show;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    // Auch im laufenden Spiel broadcasten
    if (lobby.game?.type === 'auction') {
      broadcastAuctionRound(lobby, io);
    }
  });

  socket.on('clash:setStartElixir', ({ code, amount }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    lobby.startElixir = Math.max(10, Math.min(500, Number(amount) || 100));
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:setMotherWitch', ({ code, enabled }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    lobby.motherWitchEnabled = !!enabled;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:motherWitch:respond', ({ code, accept }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'auction' || lobby.game.phase !== 'bidding') return;
    const g = lobby.game;
    const mw = g.motherWitch;
    const pending = mw?.pending;
    if (!pending || pending.targetPlayerId !== socket.id || pending.forRound !== g.round) return;
    mw.pending = null;

    if (!accept) { socket.emit('clash:motherWitch:resolved', { accepted: false }); return; }

    const player = lobby.players.find(p => p.id === socket.id);
    if (!player || (player.elixir ?? 0) < pending.cost) {
      socket.emit('clash:motherWitch:resolved', { accepted: false, reason: 'insufficient' });
      return;
    }
    player.elixir = Math.max(0, player.elixir - pending.cost);
    mw.activeEffect = { ability: pending.ability, exemptPlayerId: socket.id, round: g.round + 1 };
    mw.swapMap = null;
    socket.emit('clash:motherWitch:resolved', { accepted: true, elixir: player.elixir, ability: pending.ability });
  });

  socket.on('clash:setGridSize', ({ code, size }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    const s = Math.max(7, Math.min(11, Number(size) || 11));
    if (s * s > getCardPool(lobby).length) return; // Pool reicht für dieses Raster nicht
    lobby.gridSize = s;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:setCarouselCards', ({ code, count }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (!CAROUSEL_TABLE_SIZES.includes(Number(count))) return;
    if (Math.floor(getCardPool(lobby).length / Number(count)) < 2) return; // nicht mal 2 Tische möglich
    lobby.carouselCardsPerTable = Number(count);
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:setCarouselReveal', ({ code, mode }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (!CAROUSEL_REVEAL_MODES.includes(mode)) return;
    lobby.carouselRevealMode = mode;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  // ── Karten-Evolution: Host-Einstellungen ────────────────────────────────────
  // Gesamt-Timer fürs Picken statt Pro-Zug-Timer (0 = unbegrenzt, kein Countdown)
  socket.on('clash:setEvolutionTimer', ({ code, seconds }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    const s = Number(seconds) || 0;
    if (![0, 60, 90].includes(s)) return;
    lobby.evolutionTimerSeconds = s;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:setEvolutionTokens', ({ code, count }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    lobby.evolutionTokensStart = Math.max(1, Math.min(99, Number(count) || EVOLUTION_TOKENS_START));
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:setEvolutionSuperTokens', ({ code, count }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    lobby.evolutionSuperTokensStart = Math.max(0, Math.min(20, Number(count) ?? EVOLUTION_SUPER_TOKENS_START));
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  // ── Elixir Rush events ─────────────────────────────────────────────────────
  socket.on('clash:setRushMarketSize', ({ code, count }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (!RUSH_MARKET_SIZES.includes(Number(count))) return;
    lobby.rushMarketSize = Number(count);
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:setRushLifetime', ({ code, seconds }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (!RUSH_LIFETIMES.includes(Number(seconds))) return;
    lobby.rushCardLifetime = Number(seconds);
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  // Elixierbalken der Mitspieler ein-/ausblenden — wie bei der Auction auch mitten im Spiel umschaltbar
  socket.on('clash:setRushShowElixir', ({ code, show }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    lobby.rushShowElixir = !!show;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    if (lobby.game?.type === 'elixir-rush' && !lobby.game.finished) {
      io.to(code).emit('clash:rush:state', buildRushState(lobby));
    }
  });

  // Restzeit-Timer auf den Marktplatz-Karten ein-/ausblenden — auch mitten im Spiel umschaltbar
  socket.on('clash:setRushShowTimer', ({ code, show }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    lobby.rushShowTimer = !!show;
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    if (lobby.game?.type === 'elixir-rush' && !lobby.game.finished) {
      io.to(code).emit('clash:rush:state', buildRushState(lobby));
    }
  });

  // Kauf-Klick: seq stellt sicher, dass genau DIE Karte gekauft wird, die der Spieler
  // gesehen hat — wurde der Slot inzwischen ersetzt/weggekauft, kommt "zu spät"-Feedback
  socket.on('clash:rush:buy', ({ code, slotIdx, seq }) => {
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
  });

  socket.on('clash:requestHistory', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    socket.emit('clash:historyData', lobby.history || []);
  });

  // Wird sowohl für "Erneut spielen" (nach Spielende) als auch "Spiel abbrechen"
  // (mitten in einer laufenden Runde, host- oder admin-only) genutzt.
  socket.on('clash:restartLobby', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    const wasCancelled = !!(lobby.started && lobby.game && !lobby.game.finished);
    clearTurnTimer(lobby);
    lobby.started = false;
    lobby.game = null;
    // Während des Spiels nur ausgeblendete (aktiv gegangene) Spieler jetzt endgültig entfernen
    lobby.players = lobby.players.filter(p => !p.left);
    lobby.players.forEach(p => { p.deck = []; p.elixir = lobby.startElixir ?? 100; p.bingoGrid = []; p.bingoTokens = 0; p.completedLines = []; p.tokenAbilities = []; });
    io.to(code).emit('clash:lobbyRestart', { cancelled: wasCancelled });
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  // Admin klinkt sich als sichtbarer, nicht mitspielender Zuschauer in eine beliebige Lobby ein
  socket.on('clash:adminJoinLobby', ({ code }) => {
    if (!isAdmin) return socket.emit('clash:error', { message: 'Keine Berechtigung' });
    const uCode = (code || '').toUpperCase();
    const lobby = lobbies.get(uCode);
    if (!lobby) return socket.emit('clash:error', { message: 'Lobby nicht gefunden' });

    if (!lobby.players.find(p => p.id === socket.id)) {
      lobby.players.push({
        id: socket.id, name: twitchLogin || 'Admin', color: '#ffffff', avatar: 'admin',
        deck: [], elixir: 0, isSpectator: true, isAdmin: true,
      });
    }
    socket.join(uCode);
    socket.emit('clash:lobbyJoined', { code: uCode, isHost: false, isAdmin: true });
    io.to(uCode).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

    if (lobby.game) {
      socket.emit('clash:gameStart', { mode: lobby.mode });
      if (lobby.game.type === 'bingo') socket.emit('clash:bingo:state', buildBingoState(lobby));
      else if (lobby.game.type === 'auction') socket.emit('clash:auctionRound', buildAuctionState(lobby, true, socket.id));
      else if (lobby.game.type === 'shadow-carousel') socket.emit('clash:carousel:state', buildCarouselState(lobby, socket.id));
      else if (lobby.game.type === 'elixir-rush') socket.emit('clash:rush:state', buildRushState(lobby));
      else socket.emit('clash:gameState', buildGameState(lobby));

      if (lobby.game.finished) {
        socket.emit('clash:gameOver', {
          players: lobby.players.filter(p => !p.isAdmin).map(p => ({
            id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
            deck: p.deck || [], isSpectator: p.isSpectator ?? false,
          })),
        });
      }
    }
  });

  // Admin: tauscht im Endscreen eine Deck-Karte eines Spielers gegen eine beliebige andere
  socket.on('clash:admin:swapCard', ({ code, targetPlayerId, deckIndex, newCardId }) => {
    if (!isAdmin) return socket.emit('clash:error', { message: 'Keine Berechtigung' });
    const lobby = lobbies.get(code);
    if (!lobby?.game?.finished) return; // nur im Endscreen, nicht während einer laufenden Runde
    const target = lobby.players.find(p => p.id === targetPlayerId && !p.isAdmin);
    if (!target?.deck) return;
    const idx = Number(deckIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= target.deck.length) return;
    const newCard = ALL_CARDS.find(c => c.id === newCardId);
    if (!newCard) return;
    // Keine Duplikate im Deck
    if (target.deck.some((c, i) => i !== idx && c.id === newCard.id)) {
      return socket.emit('clash:error', { message: `${newCard.name} ist bereits im Deck von ${target.name}` });
    }
    // Champion-Limit (max. 2) gilt auch beim Admin-Tausch
    const champCount = target.deck.filter((c, i) => c.isChampion && i !== idx).length;
    if (newCard.isChampion && champCount >= 2) {
      return socket.emit('clash:error', { message: 'Max. 2 Champions pro Deck!' });
    }
    target.deck[idx] = { ...newCard };
    // Letzten History-Eintrag mitkorrigieren, damit der Verlauf das finale Deck zeigt
    const hist = lobby.history?.[lobby.history.length - 1];
    const histPlayer = hist?.players.find(p => p.id === targetPlayerId);
    if (histPlayer?.deck?.[idx]) histPlayer.deck[idx] = { ...newCard };
    // Endscreen bei allen aktualisieren
    io.to(code).emit('clash:gameOver', {
      players: lobby.players.filter(p => !p.isAdmin).map(p => ({
        id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
        deck: p.deck || [], isSpectator: p.isSpectator ?? false,
      })),
    });
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    // Korrigierte Decks auch ins globale Deck-Overlay übernehmen (ohne OBS-Event)
    updateDeckFeeds(lobby, io);
  });

  // ── Bingo events ───────────────────────────────────────────────────────────
  socket.on('clash:bingo:pick', ({ code, cardIndex, bingoCell }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'bingo' || lobby.game.phase !== 'draft') return;
    const g = lobby.game;
    const curIdx    = g.turnOrder[g.currentTurn];
    const curPlayer = lobby.players[curIdx];
    if (curPlayer?.id !== socket.id) return;
    if (typeof cardIndex !== 'number' || cardIndex < 0 || cardIndex >= g.currentCards.length) return;
    if (g.pickedThisRound[cardIndex]) return socket.emit('clash:error', { message: 'Karte bereits gewählt' });
    if (typeof bingoCell !== 'number' || bingoCell < 0 || bingoCell >= 16) return;
    if (curPlayer.bingoGrid[bingoCell]?.card !== null) return socket.emit('clash:error', { message: 'Feld bereits belegt' });

    // Champion limit
    const card = g.currentCards[cardIndex];
    const champCount = (curPlayer.deck || []).filter(c => c.isChampion).length;
    if (card.isChampion && champCount >= 2) return socket.emit('clash:error', { message: 'Max. 2 Champions pro Deck!' });

    // Attribute check: if card matches ANY bingo cell attr, player must place it on a matching cell
    const cardAttrs = getBingoCardAttrs(card.id);
    const hasFreeMatchingCell = curPlayer.bingoGrid.some((cell, ci) =>
      cell.card === null && cardAttrs.includes(cell.attrKey) && ci !== bingoCell
    );
    const chosenCellAttr = curPlayer.bingoGrid[bingoCell].attrKey;
    const chosenCellMatches = cardAttrs.includes(chosenCellAttr);

    // If there is a matching empty cell and the chosen cell does NOT match → reject
    const anyMatchingEmpty = curPlayer.bingoGrid.some(cell => cell.card === null && cardAttrs.includes(cell.attrKey));
    if (anyMatchingEmpty && !chosenCellMatches) {
      return socket.emit('clash:error', { message: 'Die Karte passt auf ein freies Attribut-Feld — dort muss sie platziert werden!' });
    }

    applyBingoPick(lobby, cardIndex, bingoCell, curPlayer, io, false);
  });

  socket.on('clash:bingo:powerup', ({ code, type, ...params }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'bingo') return;
    const ok = applyBingoPowerup(lobby, type, params, socket.id, io);
    if (!ok) socket.emit('clash:error', { message: 'Ungültiges Power-Up' });
  });

  // Live-Übertragung: der aktive Token-Spieler teilt jeden Auswahl-Schritt mit allen,
  // damit die anderen statt eines Wartebildschirms live zusehen können
  socket.on('clash:bingo:tokenAction', ({ code, step, ability, cardId }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'bingo') return;
    const g = lobby.game;
    if (g.phase !== 'tokenShop' || g.tokenShopSubPhase !== 'picking') return;
    if (g.tokenShopQueue[g.tokenShopIdx] !== socket.id) return;
    g.tokenShopLiveAction = {
      playerId: socket.id,
      step:    typeof step === 'string' ? step.slice(0, 24) : null,
      ability: BINGO_POWERUP_TYPES.includes(ability) ? ability : null,
      cardId:  typeof cardId === 'string' ? cardId.slice(0, 40) : null,
    };
    io.to(code).emit('clash:bingo:state', buildBingoState(lobby));
  });

  socket.on('clash:bingo:requestState', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'bingo') return;
    socket.emit('clash:bingo:state', buildBingoState(lobby));
  });

  // ── Schatten-Karussel events ───────────────────────────────────────────────
  socket.on('clash:carousel:flip', ({ code, slotIdx }) => {
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
      return socket.emit('clash:error', { message: 'Keine Aufdeckungen mehr übrig in dieser Runde!' });
    }
    flips.push({ slotIdx, card: slot.card });
    // Andere Mitspieler sehen die Aufdeckung nicht (Privatsphäre), Zuschauer aber schon —
    // ein voller Broadcast ist nötig, damit Zuschauer sie sofort live sehen (nicht erst
    // beim nächsten Pick/Rundenwechsel)
    broadcastCarouselState(lobby, io);
  });

  socket.on('clash:carousel:pick', ({ code, slotIdx }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'shadow-carousel' || lobby.game.phase !== 'picking') return;
    const g = lobby.game;
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player || player.isSpectator) return;
    if (g.picksThisRound[socket.id]) return socket.emit('clash:error', { message: 'Du hast bereits gewählt!' });
    if (typeof slotIdx !== 'number') return;
    if (!doCarouselPick(lobby, player, slotIdx)) return;
    broadcastCarouselState(lobby, io);
    checkCarouselRoundComplete(lobby, io);
  });

  socket.on('clash:evo:action', ({ code, slotIdx, tokenType, direction }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'card-evolution' || lobby.game.finished) return;
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player || player.isSpectator) return;
    const g = lobby.game;
    const ps = g.players[socket.id];
    if (!ps || typeof slotIdx !== 'number' || !ps.slots[slotIdx]) return;
    if (direction !== 'up' && direction !== 'down') return;
    if (g.pending[socket.id]) return socket.emit('clash:error', { message: 'Du hast bereits eine offene Wahl.' });

    const ok = tokenType === 'super'
      ? evolutionApplySuper(lobby, socket, socket.id, slotIdx, direction)
      : evolutionApplyNormal(lobby, socket, socket.id, slotIdx, direction);
    if (!ok) return;

    syncEvolutionDeck(lobby, socket.id);
    broadcastEvolutionState(lobby, io);
    checkEvolutionEnd(lobby, io);
  });

  socket.on('clash:evo:resolvePending', ({ code, chosenIndex }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'card-evolution' || lobby.game.finished) return;
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player || player.isSpectator) return;
    if (!evolutionResolvePending(lobby, socket.id, chosenIndex)) return;
    syncEvolutionDeck(lobby, socket.id);
    broadcastEvolutionState(lobby, io);
    checkEvolutionEnd(lobby, io);
  });

  socket.on('disconnect', () => {
    for (const [code, lobby] of lobbies.entries()) {
      const idx = lobby.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;
      const player = lobby.players[idx];

      // Spieler hatte die Lobby bereits aktiv verlassen — nichts mehr zu tun
      // (endgültiges Entfernen passiert beim Lobby-Neustart)
      if (player.left) break;

      // Admin-Zuschauer: sofort entfernen, kein 5-Minuten-Reconnect-Slot nötig
      if (player.isAdmin) {
        lobby.players.splice(idx, 1);
        if (lobby.players.filter(p => !p.isAdmin).length === 0) {
          clearTurnTimer(lobby);
          lobbies.delete(code);
        } else {
          io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
        }
        break;
      }

      // During active game: mark disconnected, keep slot for 5-minute reconnect window
      if (lobby.started && lobby.game && !lobby.game.finished) {
        player.disconnected    = true;
        player.disconnectedAt  = Date.now();
        if (lobby.host === socket.id) {
          player.wasHost = true;
          const next = lobby.players.find(p => p.id !== socket.id && !p.disconnected && !p.isAdmin);
          if (next) lobby.host = next.id;
        }
        io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

        // Auto-advance if it was their turn
        const g = lobby.game;
        if (g.type === 'bingo') {
          const curIdx = g.turnOrder?.[g.currentTurn];
          if (lobby.players[curIdx]?.id === socket.id) autoAdvanceBingo(lobby, io);
        } else if (g.type === 'auction') {
          const bidCount   = Object.keys(g.bids || {}).length;
          const activeCount = lobby.players.filter(p => !p.isSpectator && !p.disconnected).length;
          if (g.phase === 'bidding' && bidCount >= activeCount) {
            clearTurnTimer(lobby); resolveAuction(lobby, io);
          }
        } else {
          const curIdx = g.turnOrder?.[g.currentTurn];
          if (curIdx !== undefined && lobby.players[curIdx]?.id === socket.id) autoAdvanceTurn(lobby, io);
        }

        // Remove after 5 minutes if still disconnected
        setTimeout(() => {
          const l = lobbies.get(code);
          if (!l) return;
          const pi = l.players.findIndex(p => p.id === socket.id && p.disconnected && !p.left);
          if (pi === -1) return;
          // Läuft das Spiel noch, nicht aus dem Array spleißen (turnOrder hält Indizes!) —
          // nur ausblenden; endgültig entfernt wird beim Lobby-Neustart
          if (l.started && l.game && !l.game.finished) {
            l.players[pi].left = true;
            l.players[pi].isSpectator = true;
            io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(l));
            return;
          }
          l.players.splice(pi, 1);
          if (l.players.filter(p => !p.isAdmin).length === 0) { clearTurnTimer(l); lobbies.delete(code); }
          else io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(l));
        }, 5 * 60 * 1000);
        break;
      }

      // Not in active game: kurze Gnadenfrist statt Sofort-Entfernung — ein simpler Reconnect
      // (Socket.io vergibt dabei eine neue socket.id) sollte die Lobby nicht sofort zerstören.
      player.disconnected   = true;
      player.disconnectedAt = Date.now();
      if (lobby.host === socket.id) {
        player.wasHost = true;
        const next = lobby.players.find(p => p.id !== socket.id && !p.disconnected && !p.isAdmin);
        if (next) lobby.host = next.id;
      }
      io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));

      setTimeout(() => {
        const l = lobbies.get(code);
        if (!l) return;
        const pi = l.players.findIndex(p => p.id === socket.id && p.disconnected);
        if (pi === -1) return; // in der Zwischenzeit reconnected
        l.players.splice(pi, 1);
        if (l.players.filter(p => !p.isAdmin).length === 0) { clearTurnTimer(l); lobbies.delete(code); }
        else io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(l));
      }, LOBBY_DISCONNECT_GRACE_MS);
      break;
    }
  });

  // Disconnect: check if remaining active players all bid
  // (old duplicate restartLobby removed — now handled above with history preservation)
}

module.exports = { createClashRoyaleRouter, registerClashRoyaleSocket, ALL_CARDS };
