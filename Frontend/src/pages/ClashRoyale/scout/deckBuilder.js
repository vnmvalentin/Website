// deckBuilder.js — Auswertung für den Deck-Baukasten (/clash/baukasten, BuilderPage.jsx): Rollen der Karten, Lücken
// des Decks und ähnliche Meta-Decks. Reine Funktionen ohne React und ohne JSON-Importe (in Node testbar).
//
// Die Rollen sind von Hand gepflegt. Die Bingo-Eigenschaften (data/bingoAttributes.js) taugen dafür nicht: dort
// „verteidigen" etwa Mauerbrecher, Skelettfass und Elektro-Riese gegen Luft, und neue Karten fehlen. Eine Analyse, die
// falsche Lücken meldet, ist schlimmer als keine. Neue Karte → hier in die passenden Listen eintragen (fehlt sie überall,
// hat sie im Baukasten nur keine Rolle).
// WIN_CONDITIONS (Reihenfolge zählt bei Gleichstand) und TANKS bestimmen auch den Deck-Typ der Matchups am Server —
// nach einer Änderung im Backend `npm run spiegel -- clash` (deploy.sh prüft das).
import { ELIXIR_COST } from '../data/cardElixir.js';

/** Karten, deren Aufgabe Turmschaden ist. */
export const WIN_CONDITIONS = new Set([
  'hog-rider', 'giant', 'royal-giant', 'golem', 'balloon', 'lava-hound', 'x-bow', 'mortar', 'graveyard', 'goblin-barrel',
  'miner', 'ram-rider', 'battle-ram', 'royal-hogs', 'wall-breakers', 'goblin-drill', 'electro-giant', 'elixir-golem',
  'skeleton-barrel', 'goblin-giant', 'three-musketeers', 'suspicious-bush', 'rune-giant', 'goblin-demolisher', 'minion-giant',
]);
/** Günstige Schadenszauber gegen Schwärme, Goblin-Fass und Co. */
export const SMALL_SPELLS = new Set([
  'zap', 'giant-snowball', 'arrows', 'barbarian-barrel', 'the-log', 'royal-delivery', 'goblin-curse', 'vines', 'earthquake', 'tornado',
]);
/** Große Schadenszauber gegen Hexe, Magier, Musketierin und Co. */
export const BIG_SPELLS = new Set(['fireball', 'poison', 'lightning', 'rocket', 'void']);
/** Zauber ohne Schaden (Unterstützung). */
export const OTHER_SPELLS = new Set(['rage', 'mirror', 'clone', 'freeze']);
/** Truppen und Gebäude, die Luftziele verlässlich treffen (ohne die 1-Elixier-Geister). */
export const AIR_DEFENSE = new Set([
  'spear-goblins', 'bats', 'archers', 'minions', 'goblin-gang', 'firecracker', 'skeleton-dragons', 'tesla', 'minion-horde',
  'rascals', 'mega-minion', 'dart-goblin', 'musketeer', 'goblin-hut', 'flying-machine', 'zappies', 'furnace', 'wizard',
  'inferno-tower', 'three-musketeers', 'baby-dragon', 'hunter', 'witch', 'electro-dragon', 'executioner', 'goblin-giant',
  'ice-wizard', 'princess', 'inferno-dragon', 'electro-wizard', 'phoenix', 'magic-archer', 'night-witch', 'mother-witch',
  'ram-rider', 'goblin-machine', 'spirit-empress', 'little-prince', 'archer-queen', 'goblinstein',
]);
/** Gebäude, die verteidigen (Elixiersammler und Goblin-Bohrer zählen nicht). */
export const DEFENSE_BUILDINGS = new Set([
  'cannon', 'tesla', 'tombstone', 'goblin-hut', 'goblin-cage', 'bomb-tower', 'inferno-tower', 'barbarian-hut', 'cannon-cart', 'x-bow', 'mortar',
]);
/** Truppen und Gebäude mit Flächenschaden am Boden. */
export const SPLASH = new Set([
  'bomber', 'firecracker', 'skeleton-dragons', 'mortar', 'valkyrie', 'bomb-tower', 'wizard', 'baby-dragon', 'dark-prince', 'witch',
  'bowler', 'executioner', 'giant-skeleton', 'ice-wizard', 'princess', 'royal-ghost', 'electro-wizard', 'magic-archer', 'sparky',
  'mega-knight', 'skeleton-king', 'electro-dragon', 'furnace', 'goblin-machine', 'goblin-demolisher', 'fire-spirit', 'ice-spirit',
]);
/** Zauber, die Schwärme räumen — zählen bei der Frage „Flächenschaden vorhanden?" mit. */
export const AREA_SPELLS = new Set([
  'zap', 'giant-snowball', 'arrows', 'barbarian-barrel', 'the-log', 'royal-delivery', 'goblin-curse', 'vines', 'fireball', 'poison', 'tornado',
]);
/** Große Panzer und Mini-Panzer. */
export const TANKS = new Set([
  'giant', 'royal-giant', 'golem', 'lava-hound', 'electro-giant', 'goblin-giant', 'giant-skeleton', 'pekka', 'mega-knight', 'elixir-golem',
  'rune-giant', 'goblinstein', 'boss-bandit', 'goblin-machine', 'knight', 'valkyrie', 'ice-golem', 'dark-prince', 'mighty-miner',
  'skeleton-king', 'golden-knight', 'battle-healer', 'monk', 'bowler', 'minion-giant',
]);
/** Starker Einzelschaden oder Masse gegen große Panzer. */
export const TANK_KILLERS = new Set([
  'inferno-tower', 'inferno-dragon', 'pekka', 'mini-pekka', 'hunter', 'prince', 'sparky', 'lumberjack', 'elite-barbarians',
  'barbarians', 'minion-horde', 'skeleton-army', 'mighty-miner', 'guards', 'goblin-gang', 'berserker',
]);
export const CHAMPIONS = new Set(['little-prince', 'skeleton-king', 'golden-knight', 'mighty-miner', 'archer-queen', 'monk', 'goblinstein', 'boss-bandit']);

export const DECK_SIZE = 8;
const SPELLS = new Set([...SMALL_SPELLS, ...BIG_SPELLS, ...OTHER_SPELLS, 'graveyard', 'goblin-barrel']);

/** Rollen, in der Reihenfolge der Anzeige. Jede mit Kartenliste, die der Kartenpool als Filter nutzen kann. */
export const ROLES = [
  { key: 'win', set: WIN_CONDITIONS },
  { key: 'smallSpell', set: SMALL_SPELLS },
  { key: 'bigSpell', set: BIG_SPELLS },
  { key: 'air', set: AIR_DEFENSE },
  { key: 'building', set: DEFENSE_BUILDINGS },
  { key: 'splash', set: new Set([...SPLASH, ...AREA_SPELLS]) },
  { key: 'tank', set: TANKS },
  { key: 'tankKiller', set: TANK_KILLERS },
];
const ROLE_SET = Object.fromEntries(ROLES.map((r) => [r.key, r.set]));

/** Gehört die Karte zu dieser Rolle? (Filter im Kartenpool) */
export const hasRole = (id, role) => !!ROLE_SET[role]?.has(id);

/** Karten-IDs aus der Adresse (?karten=a,b): nur bekannte, ohne doppelte, höchstens 8, höchstens ein Champion. */
export function parseDeckParam(raw, known = (id) => id in ELIXIR_COST) {
  const out = [];
  for (const id of String(raw || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (out.length >= DECK_SIZE || out.includes(id) || !known(id)) continue;
    if (CHAMPIONS.has(id) && out.some((x) => CHAMPIONS.has(x))) continue;
    out.push(id);
  }
  return out;
}

/**
 * Darf die Karte ins Deck? 'ok' | 'full' | 'champion' (schon ein Champion drin) | 'present'
 */
export function canAdd(deck, id) {
  if (deck.includes(id)) return 'present';
  if (deck.length >= DECK_SIZE) return 'full';
  if (CHAMPIONS.has(id) && deck.some((x) => CHAMPIONS.has(x))) return 'champion';
  return 'ok';
}

/**
 * Auswertung eines (auch unvollständigen) Decks.
 * @param {string[]} deck  Karten-IDs
 * @returns {{ avgElixir: number|null, cycle: number|null, roles: Record<string, string[]>, spells: string[], gaps: Array<{ key: string, level: 'gap'|'hint', role?: string }> }}
 *   gaps nur bei vollem Deck — vorher wäre fast alles eine Lücke. level gap = echte Schwäche, hint = Hinweis.
 */
export function analyzeDeck(deck) {
  const ids = Array.isArray(deck) ? deck.filter(Boolean) : [];
  const costs = ids.map((id) => ELIXIR_COST[id]).filter((e) => typeof e === 'number');
  const sorted = [...costs].sort((a, b) => a - b);
  const avgElixir = costs.length ? Math.round((costs.reduce((a, b) => a + b, 0) / costs.length) * 10) / 10 : null;
  const cycle = sorted.length >= 4 ? sorted.slice(0, 4).reduce((a, b) => a + b, 0) : null;
  const roles = Object.fromEntries(ROLES.map((r) => [r.key, ids.filter((id) => r.set.has(id))]));
  const spells = ids.filter((id) => SPELLS.has(id));

  const gaps = [];
  if (ids.length === DECK_SIZE) {
    if (!roles.win.length) gaps.push({ key: 'noWin', level: 'gap', role: 'win' });
    else if (roles.win.length >= 3) gaps.push({ key: 'manyWin', level: 'hint' });
    if (!spells.length) gaps.push({ key: 'noSpell', level: 'gap', role: 'smallSpell' });
    else if (!roles.smallSpell.length) gaps.push({ key: 'noSmallSpell', level: 'gap', role: 'smallSpell' });
    if (spells.length && !roles.bigSpell.length) gaps.push({ key: 'noBigSpell', level: 'hint', role: 'bigSpell' });
    if (!roles.air.length) gaps.push({ key: 'noAir', level: 'gap', role: 'air' });
    else if (roles.air.length === 1) gaps.push({ key: 'weakAir', level: 'hint', role: 'air' });
    if (!roles.splash.length) gaps.push({ key: 'noSplash', level: 'gap', role: 'splash' });
    if (!roles.building.length && !roles.tankKiller.length) gaps.push({ key: 'noTankAnswer', level: 'hint', role: 'tankKiller' });
    if (avgElixir !== null && avgElixir > 4.3) gaps.push({ key: 'heavy', level: 'hint' });
  }
  return { avgElixir, cycle, roles, spells, gaps };
}

/**
 * Meta-Decks, die dem Deck am ähnlichsten sind (gleiche Karten, Form egal): die meisten gemeinsamen Karten zuerst,
 * bei Gleichstand die häufiger gespielten.
 * @param {string[]} deck
 * @param {Array<{ key: string, cards: Array<{id: string}>, uses: number, winRate: number }>} metaDecks  /meta → decks
 * @param {{ min?: number, limit?: number }} [opts]  min = so viele gemeinsame Karten mindestens
 * @returns {Array<{ deck: object, shared: number, same: boolean }>}
 */
export function similarDecks(deck, metaDecks, { min = 4, limit = 5 } = {}) {
  const mine = new Set(deck || []);
  if (!mine.size || !Array.isArray(metaDecks)) return [];
  return metaDecks
    .map((d) => {
      const ids = (d.cards || []).map((c) => c.id).filter(Boolean);
      const shared = ids.filter((id) => mine.has(id)).length;
      return { deck: d, shared, same: shared === DECK_SIZE && mine.size === DECK_SIZE };
    })
    .filter((x) => x.shared >= Math.min(min, mine.size))
    .sort((a, b) => b.shared - a.shared || (b.deck.uses || 0) - (a.deck.uses || 0))
    .slice(0, limit);
}
