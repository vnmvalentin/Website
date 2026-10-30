// quizData.js — gemeinsame Daten der Kartenspiele unter /clash (Kartenraten, Wer bin ich?, Stats-Duell).
// Merkmale: data/bingoAttributes.js (CARD_ATTRS), Elixier: data/cardElixir.js, Kampfwerte (Level 11):
// data/cardStats.json (Backend: npm run cr:card-stats, Quelle Clash-Royale-Wiki). Texte als [Deutsch, Englisch].
import { ALL_CARDS } from '../data/cards';
import { CARD_ATTRS } from '../data/bingoAttributes';
import { elixirOf } from '../data/cardElixir';
import STATS_FILE from '../data/cardStats.json';

export const POOL = ALL_CARDS.filter((c) => CARD_ATTRS[c.id]);
export const STATS = STATS_FILE.cards || {};
/** Datum JJJJ-MM-TT → TT.MM.JJJJ (de) bzw. JJJJ-MM-TT (en) */
export const fmtDate = (iso, lang) => (!iso ? '' : lang === 'en' ? iso : iso.split('-').reverse().join('.'));
export const STATS_FETCHED_ISO = STATS_FILE.fetchedAt || '';
const has = (id, k) => (CARD_ATTRS[id] || []).includes(k);
export const fmtNum = (n, lang) => Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'de-DE');
const dec = (n, lang) => (lang === 'en' ? String(n) : String(n).replace('.', ','));

/* ── Zufall mit Startwert (Tagesrunde gleich für alle) ─────────────────── */

export function berlinDay(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
}
export function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── Aussagen über eine Karte (Hinweise beim Kartenraten) ─────────────────
   Jede Aussage gibt es als „stimmt“ und „stimmt nicht“: test(card) → bool, yes/no = [de, en]. Bei Werten aus
   cardStats zählt eine Karte ohne diesen Wert (z. B. Zauber ohne Leben) bei BEIDEN Sätzen als „passt nicht“ —
   „Sie hat höchstens 1.000 Lebenspunkte“ heißt also auch „sie hat überhaupt Lebenspunkte“. */
const stat = (id, k) => STATS[id]?.[k];
const statFact = (key, k, limit, yes, no) => ({
  id: key,
  test: (c) => stat(c.id, k) != null && stat(c.id, k) > limit,
  known: (c) => stat(c.id, k) != null,
  yes, no,
});
const L = (de, en) => [de, en];
export const FACTS = [
  { id: 'troop', test: (c) => has(c.id, 'type_troop'), yes: L('Sie ist eine Truppe.', 'It is a troop.'), no: L('Sie ist keine Truppe.', 'It is not a troop.') },
  { id: 'spell', test: (c) => has(c.id, 'type_spell'), yes: L('Sie ist ein Zauber.', 'It is a spell.'), no: L('Sie ist kein Zauber.', 'It is not a spell.') },
  { id: 'building', test: (c) => has(c.id, 'type_building'), yes: L('Sie ist ein Gebäude.', 'It is a building.'), no: L('Sie ist kein Gebäude.', 'It is not a building.') },
  { id: 'air', test: (c) => has(c.id, 'move_air'), yes: L('Sie fliegt.', 'It flies.'), no: L('Sie fliegt nicht.', 'It does not fly.') },
  { id: 'hitsAir', test: (c) => has(c.id, 'target_ground_air'), yes: L('Sie kann Lufteinheiten treffen.', 'It can hit air units.'), no: L('Sie kann keine Lufteinheiten treffen.', 'It cannot hit air units.') },
  { id: 'onlyBuildings', test: (c) => has(c.id, 'target_buildings'), yes: L('Sie greift nur Gebäude an.', 'It only targets buildings.'), no: L('Sie greift nicht nur Gebäude an.', 'It does not only target buildings.') },
  { id: 'splash', test: (c) => has(c.id, 'splash'), yes: L('Sie macht Flächenschaden.', 'It deals splash damage.'), no: L('Sie macht keinen Flächenschaden.', 'It deals no splash damage.') },
  { id: 'swarm', test: (c) => has(c.id, 'swarm'), yes: L('Sie besteht aus mehreren Einheiten.', 'It consists of several units.'), no: L('Sie ist keine Gruppe aus mehreren Einheiten.', 'It is not a group of several units.') },
  { id: 'ranged', test: (c) => has(c.id, 'range_ranged'), yes: L('Sie greift aus der Ferne an.', 'It attacks from range.'), no: L('Sie greift nicht aus der Ferne an.', 'It does not attack from range.') },
  { id: 'evo', test: (c) => has(c.id, 'has_evo'), yes: L('Es gibt eine Evolution von ihr.', 'It has an evolution.'), no: L('Von ihr gibt es keine Evolution.', 'It has no evolution.') },
  { id: 'female', test: (c) => has(c.id, 'gender_female'), yes: L('Sie ist weiblich.', 'It is female.'), no: L('Sie ist nicht weiblich.', 'It is not female.') },
  { id: 'common', test: (c) => c.rarity === 'Common', yes: L('Sie ist gewöhnlich.', 'It is common.'), no: L('Sie ist nicht gewöhnlich.', 'It is not common.') },
  { id: 'rare', test: (c) => c.rarity === 'Rare', yes: L('Sie ist selten.', 'It is rare.'), no: L('Sie ist nicht selten.', 'It is not rare.') },
  { id: 'epic', test: (c) => c.rarity === 'Epic', yes: L('Sie ist episch.', 'It is epic.'), no: L('Sie ist nicht episch.', 'It is not epic.') },
  { id: 'legendary', test: (c) => c.rarity === 'Legendary' || c.rarity === 'Champion', yes: L('Sie ist legendär oder ein Champion.', 'It is legendary or a champion.'), no: L('Sie ist weder legendär noch ein Champion.', 'It is neither legendary nor a champion.') },
  { id: 'e3', test: (c) => elixirOf(c.id) <= 3, yes: L('Sie kostet höchstens 3 Elixier.', 'It costs 3 elixir or less.'), no: L('Sie kostet mehr als 3 Elixier.', 'It costs more than 3 elixir.') },
  { id: 'e5', test: (c) => elixirOf(c.id) >= 5, yes: L('Sie kostet mindestens 5 Elixier.', 'It costs 5 elixir or more.'), no: L('Sie kostet weniger als 5 Elixier.', 'It costs less than 5 elixir.') },
  { id: 'eEven', test: (c) => elixirOf(c.id) % 2 === 0, yes: L('Ihre Elixierkosten sind gerade.', 'Its elixir cost is even.'), no: L('Ihre Elixierkosten sind ungerade.', 'Its elixir cost is odd.') },
  statFact('hp1000', 'hp', 1000, L('Sie hat mehr als 1.000 Lebenspunkte.', 'It has more than 1,000 hitpoints.'), L('Sie hat höchstens 1.000 Lebenspunkte.', 'It has at most 1,000 hitpoints.')),
  statFact('hp2500', 'hp', 2500, L('Sie hat mehr als 2.500 Lebenspunkte.', 'It has more than 2,500 hitpoints.'), L('Sie hat höchstens 2.500 Lebenspunkte.', 'It has at most 2,500 hitpoints.')),
  statFact('dmg300', 'damage', 300, L('Sie macht mehr als 300 Schaden pro Treffer.', 'It deals more than 300 damage per hit.'), L('Sie macht höchstens 300 Schaden pro Treffer.', 'It deals at most 300 damage per hit.')),
  statFact('fast', 'speed', 60, L('Sie ist schneller als „mittel“ unterwegs.', 'It moves faster than “medium”.'), L('Sie ist höchstens „mittel“ schnell unterwegs.', 'It moves at “medium” speed or slower.')),
  statFact('range5', 'range', 4.9, L('Sie hat mindestens 5 Felder Reichweite.', 'It has a range of 5 tiles or more.'), L('Sie hat weniger als 5 Felder Reichweite.', 'It has a range of less than 5 tiles.')),
  statFact('hitFast', 'hitSpeed', 1.2, L('Sie braucht mehr als 1,2 Sekunden pro Angriff.', 'It needs more than 1.2 seconds per attack.'), L('Sie greift höchstens alle 1,2 Sekunden an.', 'It attacks at least every 1.2 seconds.')),
  { id: 'nameAM', test: (c) => /^[a-m]/i.test(c.name), yes: L('Ihr englischer Name beginnt mit A bis M.', 'Its name starts with A to M.'), no: L('Ihr englischer Name beginnt mit N bis Z.', 'Its name starts with N to Z.') },
];
export const FACT_BY_ID = Object.fromEntries(FACTS.map((f) => [f.id, f]));

/** Passt eine Karte zur Aussage, so wie sie über die gesuchte Karte gesagt wurde? */
export function fits(card, fact, truth) {
  if (fact.known && !fact.known(card)) return false;
  return fact.test(card) === truth;
}

/**
 * Hinweisfolge für eine gesuchte Karte im Pool: jeder Hinweis stimmt für die gesuchte Karte und schließt
 * ungefähr so viele Karten aus, dass nach `count` Hinweisen nur noch sie übrig ist (24 → 15 → 9 → 6 → 4 → 3 → 1).
 */
export function hintPlan(secret, pool, count = 6, rand = Math.random) {
  let left = pool.filter((c) => c.id !== secret.id);
  const facts = shuffled(FACTS, rand).filter((f) => !f.known || f.known(secret));
  const plan = [];
  for (let i = 1; i <= count; i++) {
    const goal = Math.max(0, Math.round((pool.length - 1) ** ((count - i) / count)) - (i === count ? 1 : 0));
    let best = null;
    for (const f of facts) {
      if (plan.some((p) => p.fact.id === f.id)) continue;
      const truth = f.test(secret);
      const after = left.filter((c) => fits(c, f, truth));
      if (after.length === left.length && left.length > 0) continue; // sagt nichts Neues
      const score = Math.abs(after.length - goal);
      if (!best || score < best.score) best = { fact: f, truth, after, score };
    }
    if (!best) break;
    plan.push({ fact: best.fact, truth: best.truth });
    left = best.after;
  }
  return { plan, unresolved: left.length };
}

/* ── Fragevorschläge für „Wer bin ich?“ (der Gegner antwortet selbst mit Ja/Nein) ── */
export const ASK = [
  L('Ist deine Karte eine Truppe?', 'Is your card a troop?'), L('Ist deine Karte ein Zauber?', 'Is your card a spell?'), L('Ist deine Karte ein Gebäude?', 'Is your card a building?'),
  L('Kann deine Karte fliegen?', 'Can your card fly?'), L('Greift deine Karte aus der Ferne an?', 'Does your card attack from range?'), L('Kann deine Karte Lufteinheiten treffen?', 'Can your card hit air units?'),
  L('Greift deine Karte nur Gebäude an?', 'Does your card only target buildings?'), L('Macht deine Karte Flächenschaden?', 'Does your card deal splash damage?'), L('Besteht deine Karte aus mehreren Einheiten?', 'Does your card spawn several units?'),
  L('Kostet deine Karte 4 Elixier oder mehr?', 'Does your card cost 4 elixir or more?'), L('Kostet deine Karte 3 Elixier oder weniger?', 'Does your card cost 3 elixir or less?'),
  L('Ist deine Karte gewöhnlich?', 'Is your card common?'), L('Ist deine Karte selten?', 'Is your card rare?'), L('Ist deine Karte episch?', 'Is your card epic?'), L('Ist deine Karte legendär?', 'Is your card legendary?'), L('Ist deine Karte ein Champion?', 'Is your card a champion?'),
  L('Ist deine Karte weiblich?', 'Is your card female?'), L('Hat deine Karte eine Evolution?', 'Does your card have an evolution?'), L('Trägt deine Karte eine Waffe?', 'Does your card carry a weapon?'), L('Ist deine Karte ein Kobold?', 'Is your card a goblin?'), L('Ist deine Karte ein Skelett?', 'Is your card a skeleton?'),
];

/* ── Stat-Kategorien fürs Stats-Duell ──────────────────────────────────── */
const SPEED_NAMES = { 45: L('Langsam', 'Slow'), 60: L('Mittel', 'Medium'), 90: L('Schnell', 'Fast'), 120: L('Sehr schnell', 'Very fast') };
export const DUEL_STATS = [
  { key: 'hp', label: L('Lebenspunkte', 'Hitpoints'), short: L('Leben', 'HP'), more: L('mehr', 'more'), less: L('weniger', 'fewer'), format: (n, l) => fmtNum(n, l) },
  { key: 'damage', label: L('Schaden pro Treffer', 'Damage per hit'), short: L('Schaden', 'Damage'), more: L('mehr', 'more'), less: L('weniger', 'less'), format: (n, l) => fmtNum(n, l) },
  { key: 'dps', label: L('Schaden pro Sekunde', 'Damage per second'), short: L('DPS', 'DPS'), more: L('mehr', 'more'), less: L('weniger', 'less'), format: (n, l) => fmtNum(n, l) },
  // Angriffstempo: kleinere Zahl = schneller — gefragt wird „schneller/langsamer“, verglichen wird umgekehrt
  { key: 'hitSpeed', label: L('Angriffstempo', 'Hit speed'), short: L('Angriffstempo', 'Hit speed'), more: L('schneller', 'faster'), less: L('langsamer', 'slower'), invert: true, format: (n, l) => `${dec(n, l)} s` },
  { key: 'speed', label: L('Laufgeschwindigkeit', 'Movement speed'), short: L('Tempo', 'Speed'), more: L('schneller', 'faster'), less: L('langsamer', 'slower'), format: (n, l) => (SPEED_NAMES[n] ? `${SPEED_NAMES[n][l === 'en' ? 1 : 0]} (${n})` : String(n)) },
  { key: 'range', label: L('Reichweite', 'Range'), short: L('Reichweite', 'Range'), more: L('mehr', 'more'), less: L('weniger', 'less'), format: (n, l) => `${dec(n, l)} ${l === 'en' ? 'tiles' : 'Felder'}` },
  { key: 'count', label: L('Anzahl Einheiten', 'Unit count'), short: L('Anzahl', 'Count'), more: L('mehr', 'more'), less: L('weniger', 'fewer'), format: (n) => `×${n}` },
];

export function randomCard(exceptId, filter = () => true) {
  const list = POOL.filter((c) => c.id !== exceptId && filter(c));
  return list[Math.floor(Math.random() * list.length)];
}

/* ── Merker im Browser ─────────────────────────────────────────────────── */
export function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privater Modus */ }
}
