// Tests des Deck-Baukastens (deckBuilder.js): Rollenlisten, Adresse, Champion-Regel, Lücken, ähnliche Meta-Decks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ELIXIR_COST } from '../../data/cardElixir.js';
import {
  ROLES, WIN_CONDITIONS, SMALL_SPELLS, BIG_SPELLS, OTHER_SPELLS, AIR_DEFENSE, DEFENSE_BUILDINGS, SPLASH, AREA_SPELLS, TANKS,
  TANK_KILLERS, CHAMPIONS, analyzeDeck, canAdd, hasRole, parseDeckParam, similarDecks,
} from '../deckBuilder.js';

const HOG_26 = ['hog-rider', 'musketeer', 'cannon', 'ice-golem', 'skeletons', 'ice-spirit', 'fireball', 'the-log'];

test('Jede Karte in den Rollenlisten gibt es wirklich (Tippfehler fielen sonst nie auf)', () => {
  const lists = { WIN_CONDITIONS, SMALL_SPELLS, BIG_SPELLS, OTHER_SPELLS, AIR_DEFENSE, DEFENSE_BUILDINGS, SPLASH, AREA_SPELLS, TANKS, TANK_KILLERS, CHAMPIONS };
  for (const [name, set] of Object.entries(lists)) {
    for (const id of set) assert.ok(id in ELIXIR_COST, `${name}: unbekannte Karte „${id}"`);
  }
  // Grobe Plausibilität: Zauber sind keine Luftabwehr, Champions stimmen mit der Seltenheit überein (8 Stück)
  for (const id of [...SMALL_SPELLS, ...BIG_SPELLS]) assert.equal(AIR_DEFENSE.has(id), false, id);
  assert.equal(CHAMPIONS.size, 8);
});

test('Hog 2.6: Elixier 2,6, Zyklus 6, alle Rollen da, keine Lücke', () => {
  const a = analyzeDeck(HOG_26);
  assert.equal(a.avgElixir, 2.6);
  assert.equal(a.cycle, 6);
  assert.deepEqual(a.roles.win, ['hog-rider']);
  assert.deepEqual(a.roles.smallSpell, ['the-log']);
  assert.deepEqual(a.roles.bigSpell, ['fireball']);
  assert.deepEqual(a.roles.air, ['musketeer']);
  assert.deepEqual(a.roles.building, ['cannon']);
  assert.ok(a.roles.splash.includes('the-log'));
  // nur eine Luftabwehr ist ein Hinweis, keine Lücke
  assert.deepEqual(a.gaps.map((g) => [g.key, g.level]), [['weakAir', 'hint']]);
});

test('Lücken: keine Win-Condition, kein Zauber, keine Luftabwehr, kein Flächenschaden — mit passender Rolle zum Filtern', () => {
  const a = analyzeDeck(['knight', 'mini-pekka', 'skeletons', 'goblins', 'guards', 'prince', 'bandit', 'lumberjack']);
  const keys = Object.fromEntries(a.gaps.map((g) => [g.key, g]));
  assert.equal(keys.noWin.level, 'gap');
  assert.equal(keys.noWin.role, 'win');
  assert.equal(keys.noSpell.level, 'gap');
  assert.equal(keys.noAir.role, 'air');
  assert.equal(keys.noSplash.level, 'gap');
  assert.equal(keys.noSmallSpell, undefined); // ohne jeden Zauber steht nur „kein Zauber"
  assert.ok(a.gaps.every((g) => g.level === 'gap' || g.level === 'hint'));
});

test('Hinweise: drei Win-Conditions, nur großer Zauber, teures Deck, nichts gegen Panzer', () => {
  const a = analyzeDeck(['golem', 'lava-hound', 'balloon', 'baby-dragon', 'lightning', 'night-witch', 'mega-minion', 'electro-dragon']);
  const keys = a.gaps.map((g) => g.key);
  assert.ok(keys.includes('manyWin'));
  assert.ok(keys.includes('noSmallSpell'));
  assert.ok(keys.includes('heavy'));
  assert.ok(keys.includes('noTankAnswer'));
  assert.equal(keys.includes('noAir'), false);
});

test('Unvollständiges Deck: Rollen ja, Lücken noch nicht', () => {
  const a = analyzeDeck(['hog-rider', 'fireball']);
  assert.deepEqual(a.roles.win, ['hog-rider']);
  assert.deepEqual(a.gaps, []);
  assert.equal(a.cycle, null);
  assert.equal(analyzeDeck([]).avgElixir, null);
});

test('Adresse: unbekannte und doppelte Karten fallen weg, höchstens 8 und ein Champion', () => {
  assert.deepEqual(parseDeckParam('hog-rider,unsinn,hog-rider,the-log'), ['hog-rider', 'the-log']);
  assert.deepEqual(parseDeckParam('archer-queen,golden-knight,knight'), ['archer-queen', 'knight']);
  assert.equal(parseDeckParam([...HOG_26, 'zap', 'arrows'].join(',')).length, 8);
  assert.deepEqual(parseDeckParam(''), []);
});

test('Karte hinzufügen: voll, schon drin, zweiter Champion', () => {
  assert.equal(canAdd(['knight'], 'archers'), 'ok');
  assert.equal(canAdd(['knight'], 'knight'), 'present');
  assert.equal(canAdd(HOG_26, 'zap'), 'full');
  assert.equal(canAdd(['monk'], 'archer-queen'), 'champion');
  assert.equal(hasRole('musketeer', 'air'), true);
  assert.equal(hasRole('wall-breakers', 'air'), false);
});

test('Ähnliche Meta-Decks: meiste gemeinsame Karten zuerst, bei Gleichstand die häufigeren; gleiches Deck erkannt', () => {
  const deck = (ids, uses) => ({ key: [...ids].sort().join(','), cards: ids.map((id) => ({ id })), uses, winRate: 0.5 });
  const meta = [
    deck(['hog-rider', 'musketeer', 'cannon', 'ice-golem', 'skeletons', 'ice-spirit', 'fireball', 'the-log'], 100),
    deck(['hog-rider', 'musketeer', 'cannon', 'ice-golem', 'skeletons', 'ice-spirit', 'earthquake', 'the-log'], 300),
    deck(['hog-rider', 'valkyrie', 'tesla', 'ice-golem', 'skeletons', 'ice-spirit', 'fireball', 'the-log'], 500),
    deck(['golem', 'night-witch', 'baby-dragon', 'lightning', 'tornado', 'lumberjack', 'mega-minion', 'zap'], 900),
  ];
  const r = similarDecks(HOG_26, meta);
  assert.deepEqual(r.map((x) => [x.deck.uses, x.shared, x.same]), [[100, 8, true], [300, 7, false], [500, 6, false]]);
  // mit wenigen Karten genügt, dass alle gewählten vorkommen
  assert.deepEqual(similarDecks(['golem', 'zap'], meta).map((x) => x.deck.uses), [900]);
  assert.deepEqual(similarDecks([], meta), []);
  assert.equal(ROLES.length, 8);
});
