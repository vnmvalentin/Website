// Bingo-Attribute — reine Daten.
// WICHTIG: synchron halten mit Frontend/src/pages/ClashRoyale/data/bingoAttributes.js
const { ALL_CARDS } = require('./cards');

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
  'void':              ['cost_high',  'type_spell',    'rarity_epic', 'target_ground_air'],
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

module.exports = { ALL_BINGO_ATTR_KEYS, BINGO_CARD_ATTRS, getBingoCardAttrs };
