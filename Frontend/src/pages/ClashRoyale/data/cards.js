// Clash Royale card pool — 123 Karten.
// Bild-URLs kommen aus cardIconUrls.json (offizielle Clash-Royale-API, api-assets.clashroyale.com)
// statt live von cdn.royaleapi.com — siehe cardImageUrl() unten. Die JSON-Datei wird per
// `npm run cr:card-icons` (Backend) neu erzeugt (Backend/clashRoyale/tools/cardIconSpiegel.js),
// z.B. wenn eine neue Karte dazukommt.
import CARD_ICON_URLS from './cardIconUrls.json';

export const ALL_CARDS = [
  // ── Commons (29) ──────────────────────────────────────────────────────────
  { id: 'skeletons',           name: 'Skeletons',              rarity: 'Common',     isChampion: false },
  { id: 'fire-spirit',         name: 'Fire Spirit',           rarity: 'Common',     isChampion: false },
  { id: 'electro-spirit',      name: 'Electro Spirit',        rarity: 'Common',     isChampion: false },
  { id: 'ice-spirit',          name: 'Ice Spirit',            rarity: 'Common',     isChampion: false },
  { id: 'goblins',             name: 'Goblins',               rarity: 'Common',     isChampion: false },
  { id: 'spear-goblins',       name: 'Spear Goblins',         rarity: 'Common',     isChampion: false },
  { id: 'bomber',              name: 'Bomber',                rarity: 'Common',     isChampion: false },
  { id: 'bats',                name: 'Bats',                  rarity: 'Common',     isChampion: false },
  { id: 'zap',                 name: 'Zap',                   rarity: 'Common',     isChampion: false },
  { id: 'giant-snowball',      name: 'Giant Snowball',        rarity: 'Common',     isChampion: false },
  { id: 'berserker',           name: 'Berserker',             rarity: 'Common',     isChampion: false },
  { id: 'knight',              name: 'Knight',                rarity: 'Common',     isChampion: false },
  { id: 'archers',             name: 'Archers',               rarity: 'Common',     isChampion: false },
  { id: 'minions',             name: 'Minions',               rarity: 'Common',     isChampion: false },
  { id: 'goblin-gang',         name: 'Goblin Gang',           rarity: 'Common',     isChampion: false },
  { id: 'arrows',              name: 'Arrows',                rarity: 'Common',     isChampion: false },
  { id: 'cannon',              name: 'Cannon',                rarity: 'Common',     isChampion: false },
  { id: 'skeleton-barrel',     name: 'Skeleton Barrel',       rarity: 'Common',     isChampion: false },
  { id: 'firecracker',         name: 'Firecracker',           rarity: 'Common',     isChampion: false },
  { id: 'royal-delivery',      name: 'Royal Delivery',        rarity: 'Common',     isChampion: false },
  { id: 'skeleton-dragons',    name: 'Skeleton Dragons',      rarity: 'Common',     isChampion: false },
  { id: 'mortar',              name: 'Mortar',                rarity: 'Common',     isChampion: false },
  { id: 'tesla',               name: 'Tesla',                 rarity: 'Common',     isChampion: false },
  { id: 'barbarians',          name: 'Barbarians',            rarity: 'Common',     isChampion: false },
  { id: 'minion-horde',        name: 'Minion Horde',          rarity: 'Common',     isChampion: false },
  { id: 'rascals',             name: 'Rascals',               rarity: 'Common',     isChampion: false },
  { id: 'royal-giant',         name: 'Royal Giant',           rarity: 'Common',     isChampion: false },
  { id: 'elite-barbarians',    name: 'Elite Barbarians',      rarity: 'Common',     isChampion: false },
  { id: 'royal-recruits',      name: 'Royal Recruits',        rarity: 'Common',     isChampion: false },

  // ── Rares (31) ────────────────────────────────────────────────────────────
  { id: 'heal-spirit',         name: 'Heal Spirit',           rarity: 'Rare',       isChampion: false },
  { id: 'ice-golem',           name: 'Ice Golem',             rarity: 'Rare',       isChampion: false },
  { id: 'suspicious-bush',     name: 'Suspicious Bush',       rarity: 'Rare',       isChampion: false },
  { id: 'mega-minion',         name: 'Mega Minion',           rarity: 'Rare',       isChampion: false },
  { id: 'dart-goblin',         name: 'Dart Goblin',           rarity: 'Rare',       isChampion: false },
  { id: 'earthquake',          name: 'Earthquake',            rarity: 'Rare',       isChampion: false },
  { id: 'elixir-golem',        name: 'Elixir Golem',          rarity: 'Rare',       isChampion: false },
  { id: 'tombstone',           name: 'Tombstone',             rarity: 'Rare',       isChampion: false },
  { id: 'musketeer',           name: 'Musketeer',             rarity: 'Rare',       isChampion: false },
  { id: 'mini-pekka',          name: 'Mini P.E.K.K.A',        rarity: 'Rare',       isChampion: false },
  { id: 'goblin-hut',          name: 'Goblin Hut',            rarity: 'Rare',       isChampion: false },
  { id: 'goblin-cage',         name: 'Goblin Cage',           rarity: 'Rare',       isChampion: false },
  { id: 'fireball',            name: 'Fireball',              rarity: 'Rare',       isChampion: false },
  { id: 'valkyrie',            name: 'Valkyrie',              rarity: 'Rare',       isChampion: false },
  { id: 'battle-ram',          name: 'Battle Ram',            rarity: 'Rare',       isChampion: false },
  { id: 'bomb-tower',          name: 'Bomb Tower',            rarity: 'Rare',       isChampion: false },
  { id: 'hog-rider',           name: 'Hog Rider',             rarity: 'Rare',       isChampion: false },
  { id: 'flying-machine',      name: 'Flying Machine',        rarity: 'Rare',       isChampion: false },
  { id: 'minion-giant',        name: 'Minion Giant',          rarity: 'Rare',       isChampion: false },
  { id: 'battle-healer',       name: 'Battle Healer',         rarity: 'Rare',       isChampion: false },
  { id: 'zappies',             name: 'Zappies',               rarity: 'Rare',       isChampion: false },
  { id: 'furnace',             name: 'Furnace',               rarity: 'Rare',       isChampion: false },
  { id: 'goblin-demolisher',   name: 'Goblin Demolisher',     rarity: 'Rare',       isChampion: false },
  { id: 'giant',               name: 'Giant',                 rarity: 'Rare',       isChampion: false },
  { id: 'wizard',              name: 'Wizard',                rarity: 'Rare',       isChampion: false },
  { id: 'inferno-tower',       name: 'Inferno Tower',         rarity: 'Rare',       isChampion: false },
  { id: 'royal-hogs',          name: 'Royal Hogs',            rarity: 'Rare',       isChampion: false },
  { id: 'rocket',              name: 'Rocket',                rarity: 'Rare',       isChampion: false },
  { id: 'barbarian-hut',       name: 'Barbarian Hut',         rarity: 'Rare',       isChampion: false },
  { id: 'elixir-collector',    name: 'Elixir Collector',      rarity: 'Rare',       isChampion: false },
  { id: 'three-musketeers',    name: 'Three Musketeers',      rarity: 'Rare',       isChampion: false },

  // ── Epics (33) ────────────────────────────────────────────────────────────
  { id: 'mirror',              name: 'Mirror',                rarity: 'Epic',       isChampion: false },
  { id: 'barbarian-barrel',    name: 'Barbarian Barrel',      rarity: 'Epic',       isChampion: false },
  { id: 'wall-breakers',       name: 'Wall Breakers',         rarity: 'Epic',       isChampion: false },
  { id: 'rage',                name: 'Rage',                  rarity: 'Epic',       isChampion: false },
  { id: 'goblin-curse',        name: 'Goblin Curse',          rarity: 'Epic',       isChampion: false },
  { id: 'skeleton-army',       name: 'Skeleton Army',         rarity: 'Epic',       isChampion: false },
  { id: 'guards',              name: 'Guards',                rarity: 'Epic',       isChampion: false },
  { id: 'vines',               name: 'Vines',                 rarity: 'Epic',       isChampion: false },
  { id: 'tornado',             name: 'Tornado',               rarity: 'Epic',       isChampion: false },
  { id: 'goblin-barrel',       name: 'Goblin Barrel',         rarity: 'Epic',       isChampion: false },
  { id: 'clone',               name: 'Clone',                 rarity: 'Epic',       isChampion: false },
  { id: 'void',                name: 'Void',                  rarity: 'Epic',       isChampion: false },
  { id: 'baby-dragon',         name: 'Baby Dragon',           rarity: 'Epic',       isChampion: false },
  { id: 'dark-prince',         name: 'Dark Prince',           rarity: 'Epic',       isChampion: false },
  { id: 'freeze',              name: 'Freeze',                rarity: 'Epic',       isChampion: false },
  { id: 'rune-giant',          name: 'Rune Giant',            rarity: 'Epic',       isChampion: false },
  { id: 'poison',              name: 'Poison',                rarity: 'Epic',       isChampion: false },
  { id: 'hunter',              name: 'Hunter',                rarity: 'Epic',       isChampion: false },
  { id: 'goblin-drill',        name: 'Goblin Drill',          rarity: 'Epic',       isChampion: false },
  { id: 'witch',               name: 'Witch',                 rarity: 'Epic',       isChampion: false },
  { id: 'balloon',             name: 'Balloon',               rarity: 'Epic',       isChampion: false },
  { id: 'prince',              name: 'Prince',                rarity: 'Epic',       isChampion: false },
  { id: 'electro-dragon',      name: 'Electro Dragon',        rarity: 'Epic',       isChampion: false },
  { id: 'bowler',              name: 'Bowler',                rarity: 'Epic',       isChampion: false },
  { id: 'executioner',         name: 'Executioner',           rarity: 'Epic',       isChampion: false },
  { id: 'cannon-cart',         name: 'Cannon Cart',           rarity: 'Epic',       isChampion: false },
  { id: 'giant-skeleton',      name: 'Giant Skeleton',        rarity: 'Epic',       isChampion: false },
  { id: 'lightning',           name: 'Lightning',             rarity: 'Epic',       isChampion: false },
  { id: 'goblin-giant',        name: 'Goblin Giant',          rarity: 'Epic',       isChampion: false },
  { id: 'x-bow',               name: 'X-Bow',                 rarity: 'Epic',       isChampion: false },
  { id: 'pekka',               name: 'P.E.K.K.A',             rarity: 'Epic',       isChampion: false },
  { id: 'electro-giant',       name: 'Electro Giant',         rarity: 'Epic',       isChampion: false },
  { id: 'golem',               name: 'Golem',                 rarity: 'Epic',       isChampion: false },

  // ── Legendaries (22) ──────────────────────────────────────────────────────
  { id: 'the-log',             name: 'The Log',               rarity: 'Legendary',  isChampion: false },
  { id: 'miner',               name: 'Miner',                 rarity: 'Legendary',  isChampion: false },
  { id: 'ice-wizard',          name: 'Ice Wizard',            rarity: 'Legendary',  isChampion: false },
  { id: 'princess',            name: 'Princess',              rarity: 'Legendary',  isChampion: false },
  { id: 'royal-ghost',         name: 'Royal Ghost',           rarity: 'Legendary',  isChampion: false },
  { id: 'bandit',              name: 'Bandit',                rarity: 'Legendary',  isChampion: false },
  { id: 'fisherman',           name: 'Fisherman',             rarity: 'Legendary',  isChampion: false },
  { id: 'inferno-dragon',      name: 'Inferno Dragon',        rarity: 'Legendary',  isChampion: false },
  { id: 'electro-wizard',      name: 'Electro Wizard',        rarity: 'Legendary',  isChampion: false },
  { id: 'phoenix',             name: 'Phoenix',               rarity: 'Legendary',  isChampion: false },
  { id: 'magic-archer',        name: 'Magic Archer',          rarity: 'Legendary',  isChampion: false },
  { id: 'lumberjack',          name: 'Lumberjack',            rarity: 'Legendary',  isChampion: false },
  { id: 'night-witch',         name: 'Night Witch',           rarity: 'Legendary',  isChampion: false },
  { id: 'mother-witch',        name: 'Mother Witch',          rarity: 'Legendary',  isChampion: false },
  { id: 'ram-rider',           name: 'Ram Rider',             rarity: 'Legendary',  isChampion: false },
  { id: 'graveyard',           name: 'Graveyard',             rarity: 'Legendary',  isChampion: false },
  { id: 'ronin',               name: 'Ronin',                 rarity: 'Legendary',  isChampion: false },
  { id: 'goblin-machine',      name: 'Goblin Machine',        rarity: 'Legendary',  isChampion: false },
  { id: 'sparky',              name: 'Sparky',                rarity: 'Legendary',  isChampion: false },
  { id: 'spirit-empress',      name: 'Spirit Empress',        rarity: 'Legendary',  isChampion: false },
  { id: 'mega-knight',         name: 'Mega Knight',           rarity: 'Legendary',  isChampion: false },
  { id: 'lava-hound',          name: 'Lava Hound',            rarity: 'Legendary',  isChampion: false },

  // ── Champions (8) – max 2 per deck ────────────────────────────────────────
  { id: 'little-prince',       name: 'Little Prince',         rarity: 'Champion',   isChampion: true },
  { id: 'skeleton-king',       name: 'Skeleton King',         rarity: 'Champion',   isChampion: true },
  { id: 'golden-knight',       name: 'Golden Knight',         rarity: 'Champion',   isChampion: true },
  { id: 'mighty-miner',        name: 'Mighty Miner',          rarity: 'Champion',   isChampion: true },
  { id: 'archer-queen',        name: 'Archer Queen',          rarity: 'Champion',   isChampion: true },
  { id: 'monk',                name: 'Monk',                  rarity: 'Champion',   isChampion: true },
  { id: 'goblinstein',         name: 'Goblinstein',           rarity: 'Champion',   isChampion: true },
  { id: 'boss-bandit',          name: 'Bossbandit',            rarity: 'Champion',   isChampion: true },
];

// 29 Common + 31 Rare + 33 Epic + 22 Legendary + 8 Champion = 123 Karten
// (der alte Kommentar hier sprach von 120/121 fürs 11×11-Grid — der zählte schon vor Minion
// Giant nicht mehr, es waren schon 122; jetzt sind es 123).

export const RARITY_COLOR = {
  Common:    '#9ca3af',
  Rare:      '#f97316',
  Epic:      '#a855f7',
  Legendary: '#f59e0b',
  Champion:  '#06b6d4',
};

// RARITY_BORDER wurde entfernt: Kartenkacheln werden bewusst rahmenlos dargestellt,
// damit nur das Artwork wirkt (siehe ui/CardTile.jsx). Auswahl und Zustände markiert
// jetzt ein innerer Ring, der das Bild nicht staucht. Die Seltenheit bleibt über
// RARITY_COLOR als Hintergrundton und in den Überschriften der Kartenraster sichtbar.
// Das Deck-Overlay für OBS (streamer/DeckOverlayPage.jsx) führt weiterhin eine eigene,
// lokale Tabelle — dort ist der farbige Rahmen als Lesehilfe im Stream gewollt.

// variant: undefined/null für die Basiskarte, "ev1" für die Evolution, "hero" für die seit
// Dezember 2025 existierende Hero-Form mancher Karten (ein permanenter Kartenrework, kein
// Deck-Slot). Fällt auf die Basiskarte zurück, wenn die Karte die verlangte Form gar nicht hat
// (z.B. variant="hero" bei einer Karte ohne Hero-Form) — besser ein sichtbares Bild als gar
// keins. Bestehende Aufrufer mit nur einer id bleiben unverändert.
export function cardImageUrl(id, variant) {
  const entry = CARD_ICON_URLS[id];
  if (!entry) return null;
  if (variant === 'ev1' && entry.ev1) return entry.ev1;
  if (variant === 'hero' && entry.hero) return entry.hero;
  return entry.base;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
