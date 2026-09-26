// engine/validate.js — Datenvalidierung aller Karten (läuft in den Tests und per `npm run sigils:check`).
import { ALL_CARDS } from "../data/cards/index.js";
import { TRIBE_BY_ID } from "../data/tribes.js";
import { SIGILS, parseSigil, PUBLIC_SIGILS } from "./sigils/index.js";
import { budgetDelta, CARDS } from "./cards.js";

const SILHOUETTES = new Set(["quadruped", "bird", "fish", "insect", "serpent", "rodent", "fungus", "root", "skeleton", "candle", "horned", "moth", "construct"]);
const RARITIES = new Set(["common", "uncommon", "rare", "legendary"]);
const BUDGET_TOLERANCE = 1.5;

/**
 * @returns {{ errors: string[], warnings: string[], stats: any }}
 */
export function validateCards() {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const sigilUse = new Map();
  for (const c of ALL_CARDS) {
    const where = `Karte ${c.id}`;
    if (ids.has(c.id)) errors.push(`${where}: doppelte ID`);
    ids.add(c.id);
    if (!TRIBE_BY_ID[c.tribe]) errors.push(`${where}: unbekannter Stamm ${c.tribe}`);
    if (!RARITIES.has(c.rarity)) errors.push(`${where}: unbekannte Seltenheit ${c.rarity}`);
    if (!SILHOUETTES.has(c.art?.silhouette)) errors.push(`${where}: unbekannte Silhouette ${c.art?.silhouette}`);
    if (!c.name) errors.push(`${where}: kein Name`);
    if (!c.flavor || c.flavor.length > 90) errors.push(`${where}: Flavor fehlt oder länger als 90 Zeichen (${c.flavor?.length})`);
    const { type, amount } = c.cost;
    const ok = (type === "blood" && amount >= 0 && amount <= 4) || (type === "bones" && amount >= 1 && amount <= 10) || (type === "wax" && amount >= 1 && amount <= 6);
    if (!ok) errors.push(`${where}: ungültige Kosten ${type} ${amount}`);
    if (c.sigils.length > 4) errors.push(`${where}: mehr als 4 Sigils`);
    for (const ref of c.sigils) {
      const { id } = parseSigil(ref);
      if (!SIGILS[id]) errors.push(`${where}: unbekanntes Sigil ${ref}`);
      else if (SIGILS[id].cursedOnly && !c.cursed) errors.push(`${where}: ${id} nur auf verfluchten Karten`);
      if (!c.token && !c.cursed) sigilUse.set(id, (sigilUse.get(id) || 0) + 1);
    }
    const needsNext = c.sigils.some((s) => ["metamorphose", "nachgeburt"].includes(parseSigil(s).id));
    if (needsNext && !c.evolvesTo) errors.push(`${where}: Metamorphose/Nachgeburt ohne evolvesTo`);
    if (c.evolvesTo && !CARDS[c.evolvesTo]) errors.push(`${where}: Folgeform ${c.evolvesTo} existiert nicht`);
    if (c.rarity === "legendary" && !c.unique) errors.push(`${where}: legendär, aber nicht einzigartig`);
    if (!c.token && !c.cursed) {
      const d = budgetDelta(c);
      if (Math.abs(d) > BUDGET_TOLERANCE) warnings.push(`${where}: Wert weicht um ${d.toFixed(2)} vom Budget ab`);
    }
  }
  for (const id of PUBLIC_SIGILS) {
    const n = sigilUse.get(id) || 0;
    if (id !== "fluchmal" && n < 2) errors.push(`Sigil ${id}: nur auf ${n} sammelbaren Karten (mind. 2)`);
  }
  const collectible = ALL_CARDS.filter((c) => !c.token && !c.cursed);
  const byTribe = {};
  for (const c of collectible) byTribe[c.tribe] = (byTribe[c.tribe] || 0) + 1;
  const legendary = collectible.filter((c) => c.rarity === "legendary").length;
  const cursed = ALL_CARDS.filter((c) => c.cursed).length;
  if (collectible.length < 160) errors.push(`nur ${collectible.length} sammelbare Karten (mind. 160)`);
  if (legendary < 8) errors.push(`nur ${legendary} legendäre Karten (mind. 8)`);
  if (cursed < 8) errors.push(`nur ${cursed} verfluchte Karten (mind. 8)`);
  return { errors, warnings, stats: { total: ALL_CARDS.length, collectible: collectible.length, legendary, cursed, byTribe } };
}
