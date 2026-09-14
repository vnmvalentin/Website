// Kartenpool und Elixierkosten — reine Daten, kein Spielzustand.
// WICHTIG: 1:1 synchron halten mit Frontend/src/pages/ClashRoyale/data/cards.js

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
  // Rares (31)
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
  { id: 'minion-giant',      name: 'Minion Giant',      rarity: 'Rare',      isChampion: false },
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
  // Legendaries (22)
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
  'minion-giant': 4,
  'heal-spirit': 1, 'ice-golem': 2, 'suspicious-bush': 2,
  'mega-minion': 3, 'dart-goblin': 3, 'earthquake': 3, 'elixir-golem': 3, 'tombstone': 3,
  'musketeer': 4, 'mini-pekka': 4, 'goblin-hut': 4, 'goblin-cage': 4, 'fireball': 4, 'valkyrie': 4,
  'battle-ram': 4, 'bomb-tower': 4, 'hog-rider': 4, 'flying-machine': 4, 'battle-healer': 4,
  'zappies': 4, 'furnace': 4, 'goblin-demolisher': 4,
  'giant': 5, 'wizard': 5, 'inferno-tower': 5, 'royal-hogs': 5,
  'rocket': 6, 'barbarian-hut': 6, 'elixir-collector': 6, 'three-musketeers': 9,
  // Epics
  'mirror': 0, 'barbarian-barrel': 2, 'wall-breakers': 2, 'rage': 2, 'goblin-curse': 2,
  'skeleton-army': 3, 'guards': 3, 'vines': 3, 'tornado': 3, 'goblin-barrel': 3, 'clone': 3, 'void': 5,
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

// Kartenpool einer Lobby: alle Karten abzüglich der global ausgeschlossenen
function getCardPool(lobby) {
  if (!lobby.excludedCards?.length) return ALL_CARDS;
  const excluded = new Set(lobby.excludedCards);
  return ALL_CARDS.filter(c => !excluded.has(c.id));
}

// Offizieller Kartenname (aus der Clash-Royale-API, z.B. "Mini P.E.K.K.A" oder "X-Bow") ->
// lokale Karten-ID. Verglichen wird über Kleinbuchstaben ohne Sonderzeichen, damit
// Schreibweisen wie ".", "-" keinen Unterschied machen. Geteilter Baustein für alles, was
// API-Kartennamen gegen ALL_CARDS auflösen muss (Win-Tracker-Deck-Erkennung, freigeschaltete
// Karten pro Spieler — siehe fetchPlayerCards in lib/crApi.js).
const normalizeCardName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const CARD_ID_BY_NAME = new Map(ALL_CARDS.map(c => [normalizeCardName(c.name), c.id]));
const cardIdByOfficialName = (name) => CARD_ID_BY_NAME.get(normalizeCardName(name)) || null;

module.exports = { ALL_CARDS, ELIXIR_COST, getElixirCost, getCardPool, normalizeCardName, cardIdByOfficialName };
