const express = require('express');

const lobbies = new Map();

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
  'electro-giant':     ['cost_high', 'type_troop',    'move_ground', 'range_melee',  'single', 'rarity_epic', 'gender_none',   'speed_slow', 'target_buildings', 'target_ground_air'],
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

// Snake draft order — see comments in BingoRoyale.jsx
function generateSnakeDraftOrder(playerIndices, numRounds) {
  const N = playerIndices.length;
  const order = [];
  for (let r = 0; r < numRounds; r++) {
    const pairIdx = Math.floor(r / 2);
    const shift   = pairIdx % N;
    const rotated = Array.from({ length: N }, (_, i) => playerIndices[(shift + i) % N]);
    order.push(...(r % 2 === 0 ? rotated : [...rotated].reverse()));
  }
  return order;
}

// Build bingo state for broadcast
function buildBingoState(lobby) {
  const g = lobby.game;
  const activePlayers = lobby.players.filter(p => !p.isSpectator);
  const currentPlayerIdx = g.phase === 'draft' ? g.turnOrder[g.currentTurn] : null;
  const currentPlayer = currentPlayerIdx != null ? lobby.players[currentPlayerIdx] : null;

  // Unpicked cards: cards not in any player's deck
  const pickedIds = new Set(lobby.players.flatMap(p => (p.deck||[]).map(c => c.id)));
  const unpickedCards = ALL_CARDS.filter(c => !pickedIds.has(c.id));

  return {
    type: 'bingo',
    phase: g.phase,
    round: g.round,
    maxRounds: g.maxRounds,
    currentCards: g.currentCards,
    pickedThisRound: g.pickedThisRound,
    currentPlayerId: currentPlayer?.id ?? null,
    timerRemaining: g.timerRemaining,
    timerSeconds: lobby.timerSeconds,
    finished: g.finished,
    tokenShopCurrentPlayerId: g.tokenShopQueue?.[g.tokenShopIdx] ?? null,
    tokenShopQueue: g.tokenShopQueue || [],
    tokenShopIdx: g.tokenShopIdx ?? 0,
    tokenShopSubPhase: g.tokenShopSubPhase || 'picking',
    lastPowerupResult: g.lastPowerupResult || null,
    unpickedCards: g.phase === 'tokenShop' ? unpickedCards : [],
    players: lobby.players.map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
      deck: p.deck || [],
      bingoGrid: p.bingoGrid || [],
      bingoTokens: p.bingoTokens || 0,
      completedLines: p.completedLines || [],
      isSpectator: p.isSpectator ?? false,
    })),
  };
}

// ── Bingo Royale ────────────────────────────────────────────────────────────
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
    if (p.isSpectator) p.bingoGrid = [];
  });

  const cardsPerRound = Math.max(N, lobby.cardsPerRound || N);
  const turnOrder = generateSnakeDraftOrder(activeIndices, 8);

  lobby.game = {
    type: 'bingo',
    pool: shuffle(ALL_CARDS),
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
}

function applyBingoPowerup(lobby, type, params, playerId, io) {
  const g = lobby.game;
  if (g.phase !== 'tokenShop') return false;
  if (g.tokenShopQueue[g.tokenShopIdx] !== playerId) return false;

  const player = lobby.players.find(p => p.id === playerId);
  if (!player) return false;

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
    let pool = ALL_CARDS.filter(c => !pickedIds.has(c.id) && !(c.isChampion && champCount >= 2));
    if (!pool.length) pool = ALL_CARDS.filter(c => !(c.isChampion && champCount >= 2));
    const newCard = pool[Math.floor(Math.random() * pool.length)];
    target.deck[theirDeckIdx] = { ...newCard, protected: true };
    result = { ...result, oldCard, newCard, targetPlayerName: target.name, targetPlayerColor: target.color };

  } else if (type === 'joker') {
    const { myDeckIdx, newCardId } = params;
    if (!player.deck[myDeckIdx]) return false;
    if (player.deck[myDeckIdx]?.protected) return false;
    const newCard = ALL_CARDS.find(c => c.id === newCardId);
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
  g.tokenShopSubPhase = 'revealing';
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
      io.to(lobby.code).emit('clash:bingo:state', buildBingoState(lobby));
    }
  }, 5000);

  return true;
}

// ── Helpers ────────────────────────────────────────────────────────────────
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
    cardsPerRound: lobby.cardsPerRound || 4,
    startElixir: lobby.startElixir ?? 100,
    showElixir: lobby.showElixir ?? false,
    motherWitchEnabled: lobby.motherWitchEnabled ?? false,
    gridSize: lobby.gridSize || 11,
    historyCount: lobby.history?.length || 0,
    players: lobby.players.map(p => ({
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
      const realPlayers = l.players.filter(p => !p.isAdmin);
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
  const cards = shuffle(ALL_CARDS).slice(0, totalCells);
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
    pool: shuffle(ALL_CARDS),
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
function drawBonusCard(g, alreadyGiven = []) {
  const currentIds = new Set(g.currentCards.map(c => c.id));
  const givenIds   = new Set(alreadyGiven.map(c => c.id));
  const pool = ALL_CARDS.filter(c => !c.isChampion && !currentIds.has(c.id) && !givenIds.has(c.id));
  if (pool.length === 0) {
    const fallback = ALL_CARDS.filter(c => !c.isChampion && !currentIds.has(c.id));
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
        got = drawBonusCard(g, bonusCardsGiven);
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
        got = drawBonusCard(g, bonusCardsGiven);
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
function registerClashRoyaleSocket(socket, io, { isAdmin = false } = {}) {
  // Host-Aktionen dürfen genauso vom (server-seitig verifizierten) Admin ausgeführt werden
  const canControl = (lobby) => lobby.host === socket.id || isAdmin;

  socket.on('clash:createLobby', ({ playerName, mode, timerSeconds = 60, cardsPerRound = 4, avatar = 'knight' }) => {
    if (!playerName?.trim()) return;
    const code = generateCode();
    const lobby = {
      code, mode: mode || 'snake', host: socket.id,
      timerSeconds: Math.max(15, Math.min(300, Number(timerSeconds) || 60)),
      cardsPerRound: Math.max(2, Math.min(12, Number(cardsPerRound) || 4)),
      startElixir: 100,
      showElixir: false,
      motherWitchEnabled: false,
      gridSize: 11,
      createdAt: Date.now(),
      players: [{ id: socket.id, name: playerName.trim(), color: PLAYER_COLORS[0], avatar: avatar || 'knight', deck: [], elixir: 100, isSpectator: false }],
      started: false, game: null,
      history: [],
    };
    lobbies.set(code, lobby);
    socket.join(code);
    socket.emit('clash:lobbyCreated', { code });
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:joinLobby', ({ code, playerName, avatar = 'knight' }) => {
    const uCode = (code || '').toUpperCase();
    const lobby = lobbies.get(uCode);
    if (!lobby)               return socket.emit('clash:error', { message: 'Lobby nicht gefunden' });
    if (!playerName?.trim())  return socket.emit('clash:error', { message: 'Bitte Namen eingeben' });

    // Reconnect: player with same name disconnected during active game
    if (lobby.started && lobby.game && !lobby.game.finished) {
      const dc = lobby.players.find(p => p.disconnected && p.name === playerName.trim());
      if (dc) {
        dc.id = socket.id;
        dc.disconnected = false;
        dc.disconnectedAt = null;
        if (dc.wasHost) { lobby.host = socket.id; dc.wasHost = false; }
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
        } else {
          socket.emit('clash:gameReconnect', { mode: 'snake' });
          socket.emit('clash:gameState', buildGameState(lobby));
        }
        return;
      }
      return socket.emit('clash:error', { message: 'Spiel läuft bereits' });
    }

    // Reconnect: gleicher Name war gerade in der Gnadenfrist (kurzer Netzwerk-Hänger, Tab-Reload, ...)
    const dcLobby = lobby.players.find(p => p.disconnected && p.name === playerName.trim());
    if (dcLobby) {
      dcLobby.id = socket.id;
      dcLobby.disconnected = false;
      dcLobby.disconnectedAt = null;
      if (dcLobby.wasHost) { lobby.host = socket.id; dcLobby.wasHost = false; }
    } else {
      if (lobby.players.length >= 8) return socket.emit('clash:error', { message: 'Lobby voll (max. 8)' });
      if (!lobby.players.find(p => p.id === socket.id)) {
        lobby.players.push({
          id: socket.id, name: playerName.trim(),
          color: PLAYER_COLORS[lobby.players.length % PLAYER_COLORS.length],
          avatar: avatar || 'knight', deck: [], elixir: lobby.startElixir ?? 100,
          isSpectator: false,
        });
      }
    }
    socket.join(uCode);
    socket.emit('clash:lobbyJoined', { code: uCode, isHost: lobby.host === socket.id });
    io.to(uCode).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    if (lobby.game) {
      if (lobby.game.type === 'bingo') socket.emit('clash:bingo:state', buildBingoState(lobby));
      else if (lobby.game.type === 'auction') socket.emit('clash:auctionRound', buildAuctionState(lobby, false, socket.id));
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

  socket.on('clash:setCardsPerRound', ({ code, count }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    lobby.cardsPerRound = Math.max(2, Math.min(12, Number(count) || 4));
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
  });

  socket.on('clash:startGame', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (lobby.players.length < 2) return socket.emit('clash:error', { message: 'Mindestens 2 Spieler benötigt' });
    lobby.started = true;
    if (lobby.mode === 'auction') startElixirAuction(lobby, io);
    else if (lobby.mode === 'bingo') startBingoRoyale(lobby, io);
    else startSnakeRoyale(lobby, io);
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
      else socket.emit('clash:gameState', buildGameState(lobby));
    }
  });

  // Explizites Verlassen (Leave-Button). Im Gegensatz zu einem Disconnect (Netzwerk-Hänger, Tab-Reload)
  // soll das SOFORT wirken, ohne die Gnadenfrist abzuwarten.
  socket.on('clash:leaveLobby', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    // Während einer laufenden Runde übernimmt der normale disconnect-Handler (Auto-Advance, Reconnect-Fenster) —
    // ein Sofort-Entfernen hier würde die turnOrder-Indizes durcheinanderbringen.
    if (lobby.started && lobby.game && !lobby.game.finished) return;

    const idx = lobby.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;
    const leavingPlayer = lobby.players[idx];
    const wasHost = lobby.host === socket.id;

    lobby.players.splice(idx, 1);
    if (lobby.players.filter(p => !p.isAdmin).length === 0) {
      clearTurnTimer(lobby);
      lobbies.delete(code);
      return;
    }
    if (wasHost && !leavingPlayer.isAdmin) {
      const nextHost = lobby.players.find(p => !p.isAdmin);
      if (nextHost) lobby.host = nextHost.id;
    }
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
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
    lobby.gridSize = Math.max(7, Math.min(11, Number(size) || 11));
    io.to(code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
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
    lobby.players.forEach(p => { p.deck = []; p.elixir = lobby.startElixir ?? 100; p.bingoGrid = []; p.bingoTokens = 0; p.completedLines = []; });
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
        id: socket.id, name: 'Admin', color: '#ffffff', avatar: 'admin',
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

  socket.on('clash:bingo:requestState', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby?.game || lobby.game.type !== 'bingo') return;
    socket.emit('clash:bingo:state', buildBingoState(lobby));
  });

  socket.on('disconnect', () => {
    for (const [code, lobby] of lobbies.entries()) {
      const idx = lobby.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;
      const player = lobby.players[idx];

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
          const pi = l.players.findIndex(p => p.id === socket.id && p.disconnected);
          if (pi === -1) return;
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

module.exports = { createClashRoyaleRouter, registerClashRoyaleSocket };
