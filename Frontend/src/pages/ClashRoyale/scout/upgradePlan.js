// upgradePlan.js — was es kostet, die Sammlung hochzuleveln: Karten und Gold je Level, und daraus pro Karte
// „jetzt aufwertbar", „fehlt bis Höchstlevel" sowie die Summen für die ganze Sammlung.
//
// Tabellen: Clash-Royale-Wiki, Seite „Cards" (Abschnitt Upgrade), Stand 14.11.2026 — gültig seit dem Level-16-Update
// vom 24.11.2025. Schlüssel ist das ZIEL-Level (Anzeige-Level im Spiel), der Wert der Preis des Schritts dorthin.
// Die Summen je Seltenheit stimmen mit den „Total"-Zeilen der Wiki-Tabellen überein (siehe Tests). Ändert Supercell die
// Preise oder das Höchstlevel, müssen diese Tabellen nachgezogen werden — bei einem anderen Höchstlevel als 16
// rechnet planFor() bewusst nichts (supported() === false) statt falsche Zahlen zu zeigen.
//
// Der Vorrat einer Karte (`count` aus der API) ist die Zahl der Karten, die für die nächsten Level bereitliegen.

export const PLAN_MAX_LEVEL = 16;

const CARDS = {
  Common: { 2: 2, 3: 4, 4: 10, 5: 20, 6: 50, 7: 100, 8: 200, 9: 400, 10: 800, 11: 1000, 12: 1500, 13: 2500, 14: 3500, 15: 5500, 16: 7500 },
  Rare: { 4: 2, 5: 4, 6: 10, 7: 20, 8: 50, 9: 100, 10: 200, 11: 300, 12: 400, 13: 550, 14: 750, 15: 1000, 16: 1400 },
  Epic: { 7: 2, 8: 4, 9: 10, 10: 20, 11: 30, 12: 50, 13: 70, 14: 100, 15: 130, 16: 180 },
  Legendary: { 10: 2, 11: 4, 12: 6, 13: 9, 14: 12, 15: 14, 16: 20 },
  Champion: { 12: 1, 13: 5, 14: 8, 15: 11, 16: 15 },
};

const GOLD = { 2: 5, 3: 20, 4: 50, 5: 150, 6: 400, 7: 1000, 8: 2000, 9: 4000, 10: 8000, 11: 15000, 12: 25000, 13: 40000, 14: 60000, 15: 90000, 16: 120000 };
// Der erste Schritt nach dem Freischalten ist bei zwei Seltenheiten günstiger
const GOLD_FIRST_STEP = { Epic: { 7: 400 }, Legendary: { 10: 5000 } };

export const RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];

/** Karten für den Schritt auf dieses Level, oder null, wenn es den Schritt für die Seltenheit nicht gibt. */
export const cardsForLevel = (rarity, level) => CARDS[rarity]?.[level] ?? null;
/** Gold für den Schritt auf dieses Level. */
export const goldForLevel = (rarity, level) => (cardsForLevel(rarity, level) === null ? null : GOLD_FIRST_STEP[rarity]?.[level] ?? GOLD[level] ?? null);

/** Rechnen die Tabellen für dieses Höchstlevel? */
export const supported = (cap) => cap === PLAN_MAX_LEVEL;

/**
 * Plan für eine Karte.
 * @param {{ lvl: number, count: number, rarity: string }} card
 * @returns {null | {
 *   next: null | { level, cards, gold, have, ready },   nächster Schritt (null auf Höchstlevel)
 *   reach: number,        Level, das mit dem Vorrat erreichbar ist
 *   reachGold: number,    Gold für alle Schritte bis dorthin
 *   missingCards: number, Karten, die bis zum Höchstlevel noch fehlen (Vorrat abgezogen)
 *   goldToMax: number,    Gold für alle Schritte bis zum Höchstlevel
 * }}  null, wenn Level oder Seltenheit unbekannt sind
 */
export function planFor(card) {
  if (!card || typeof card.lvl !== 'number' || !CARDS[card.rarity]) return null;
  let stock = Math.max(0, card.count || 0);
  let reach = card.lvl;
  let reachGold = 0;
  let needed = 0;
  let goldToMax = 0;
  let next = null;
  let blocked = false;
  for (let level = card.lvl + 1; level <= PLAN_MAX_LEVEL; level += 1) {
    const cards = cardsForLevel(card.rarity, level);
    const gold = goldForLevel(card.rarity, level);
    if (cards === null || gold === null) return null; // Level unterhalb des Einstiegs der Seltenheit — Daten passen nicht
    if (!next) next = { level, cards, gold, have: stock, ready: stock >= cards };
    needed += cards;
    goldToMax += gold;
    if (!blocked && stock >= cards) {
      stock -= cards;
      reach = level;
      reachGold += gold;
    } else {
      blocked = true;
    }
  }
  return { next, reach, reachGold, missingCards: Math.max(0, needed - Math.max(0, card.count || 0)), goldToMax };
}

/**
 * Summen über die Sammlung.
 * @returns {{ ready: Array<{ card, plan }>, readyGold: number, goldToMax: number,
 *   byRarity: Array<{ rarity, cards, maxed, missingCards, goldToMax }> }}
 */
export function collectionPlan(cards) {
  const byRarity = new Map(RARITIES.map((r) => [r, { rarity: r, cards: 0, maxed: 0, missingCards: 0, goldToMax: 0 }]));
  const ready = [];
  let readyGold = 0;
  let goldToMax = 0;
  for (const card of cards || []) {
    const plan = planFor(card);
    const row = byRarity.get(card.rarity);
    if (!plan || !row) continue;
    row.cards += 1;
    if (!plan.next) row.maxed += 1;
    row.missingCards += plan.missingCards;
    row.goldToMax += plan.goldToMax;
    goldToMax += plan.goldToMax;
    if (plan.next?.ready) {
      ready.push({ card, plan });
      readyGold += plan.reachGold;
    }
  }
  // Am lohnendsten zuerst: die meisten erreichbaren Level, dann das höhere Ziel
  ready.sort((a, b) => (b.plan.reach - b.card.lvl) - (a.plan.reach - a.card.lvl) || b.plan.reach - a.plan.reach || a.card.name.localeCompare(b.card.name));
  return { ready, readyGold, goldToMax, byRarity: [...byRarity.values()].filter((r) => r.cards > 0) };
}
