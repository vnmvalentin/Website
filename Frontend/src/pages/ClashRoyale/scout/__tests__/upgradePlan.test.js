// Tests der Aufwert-Rechnung (Karten und Gold bis zum Höchstlevel).
import test from 'node:test';
import assert from 'node:assert/strict';
import { RARITIES, cardsForLevel, goldForLevel, planFor, collectionPlan, supported } from '../upgradePlan.js';

const sum = (rarity, fn) => {
  let total = 0;
  for (let level = 1; level <= 16; level += 1) total += fn(rarity, level) || 0;
  return total;
};

test('Tabellen: Summen wie die „Total"-Zeilen im Wiki (Karten ohne die Karte fürs Freischalten)', () => {
  // Wiki-Summe der Karten zählt die erste gefundene Karte mit: 23.087 / 4.787 / 597 / 68; Champions 40 ohne sie
  assert.deepEqual(RARITIES.map((r) => sum(r, cardsForLevel)), [23086, 4786, 596, 67, 40]);
  assert.deepEqual(RARITIES.map((r) => sum(r, goldForLevel)), [365625, 365600, 364400, 355000, 335000]);
  assert.equal(goldForLevel('Epic', 7), 400);
  assert.equal(goldForLevel('Legendary', 10), 5000);
  assert.equal(cardsForLevel('Legendary', 9), null); // Einstiegslevel: kein Schritt dorthin
});

test('Eine Karte: nächster Schritt, mit dem Vorrat erreichbares Level, Rest bis Höchstlevel', () => {
  // Gewöhnlich Level 12 mit 4.200 Karten: 2.500 für 13 reichen, die 3.500 für 14 nicht mehr
  const p = planFor({ lvl: 12, count: 4200, rarity: 'Common' });
  assert.deepEqual(p.next, { level: 13, cards: 2500, gold: 40000, have: 4200, ready: true });
  assert.deepEqual([p.reach, p.reachGold], [13, 40000]);
  assert.equal(p.missingCards, 2500 + 3500 + 5500 + 7500 - 4200);
  assert.equal(p.goldToMax, 40000 + 60000 + 90000 + 120000);
});

test('Eine Karte: nicht aufwertbar, auf Höchstlevel, unbekannt', () => {
  const stuck = planFor({ lvl: 13, count: 3, rarity: 'Legendary' });
  assert.deepEqual([stuck.next.ready, stuck.next.cards, stuck.reach, stuck.reachGold, stuck.missingCards], [false, 12, 13, 0, 12 + 14 + 20 - 3]);
  const done = planFor({ lvl: 16, count: 0, rarity: 'Champion' });
  assert.deepEqual([done.next, done.missingCards, done.goldToMax], [null, 0, 0]);
  assert.equal(planFor({ lvl: null, count: 5, rarity: 'Rare' }), null);
  assert.equal(planFor({ lvl: 5, count: 5, rarity: 'Unbekannt' }), null);
  assert.equal(planFor({ lvl: 4, count: 5, rarity: 'Legendary' }), null); // Level unter dem Einstieg der Seltenheit
  assert.equal(supported(16), true);
  assert.equal(supported(17), false);
});

test('Sammlung: aufwertbare Karten mit Goldbedarf, Summen je Seltenheit', () => {
  const plan = collectionPlan([
    { id: 'a', name: 'A', lvl: 14, count: 9000, rarity: 'Common' },   // ein Schritt: 5.500 für 15 reichen, die 7.500 für 16 nicht mehr
    { id: 'b', name: 'B', lvl: 15, count: 20, rarity: 'Legendary' }, // ein Schritt, aufs Höchstlevel — steht deshalb vorn
    { id: 'c', name: 'C', lvl: 16, count: 0, rarity: 'Epic' },       // fertig
    { id: 'd', name: 'D', lvl: 11, count: 0, rarity: 'Champion' },   // nichts da
  ]);
  assert.deepEqual(plan.ready.map((r) => r.card.id), ['b', 'a']);
  assert.equal(plan.readyGold, 90000 + 120000);
  assert.equal(plan.goldToMax, (90000 + 120000) + 120000 + 0 + 335000);
  assert.deepEqual(plan.byRarity.map((r) => [r.rarity, r.cards, r.maxed, r.missingCards]), [
    ['Common', 1, 0, 5500 + 7500 - 9000], ['Epic', 1, 1, 0], ['Legendary', 1, 0, 0], ['Champion', 1, 0, 40],
  ]);
});
