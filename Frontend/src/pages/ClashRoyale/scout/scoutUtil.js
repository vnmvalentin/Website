// scoutUtil.js — kleine Helfer der Stats-Seiten ohne eigene Oberfläche.
import { useSearchParams } from 'react-router-dom';
import { ALL_CARDS, cardImageUrl } from '../data/cards';
import { ELIXIR_COST } from '../data/cardElixir';
import { cardKey } from './analysis';
import { CARD_ATTRS } from '../data/bingoAttributes';
import { leagueIconUrl, leagueName, ULTIMATE_CHAMPION_LEAGUE } from '../data/leagueIcons';
import { isLeague2v2 } from '../data/modeArt';

export const CARD_BY_ID = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));

/** Kartenart aus den Karten-Eigenschaften: 'troop' | 'spell' | 'building' | null */
export function cardType(id) {
  const attrs = CARD_ATTRS[id] || [];
  if (attrs.includes('type_spell')) return 'spell';
  if (attrs.includes('type_building')) return 'building';
  if (attrs.includes('type_troop')) return 'troop';
  return null;
}

/** Karte unserer Liste in der Form, die ScoutCard/DeckRow erwarten. */
export const localCard = (id) => (CARD_BY_ID[id] ? { id, name: CARD_BY_ID[id].name, elixir: ELIXIR_COST[id] ?? null, rarity: CARD_BY_ID[id].rarity } : null);

/** Deck aus einer Rangliste ({ id, variant } je Karte) um Namen und Elixier ergänzen; unbekannte Karten bleiben, wie sie sind. */
export const expandDeck = (cards) => (Array.isArray(cards) ? cards.map((c) => (c.id && CARD_BY_ID[c.id] ? { ...localCard(c.id), variant: c.variant } : c)) : cards);

/** Adresse der Deck-Seite (acht Karten, Reihenfolge egal) oder null, wenn das Deck unvollständig ist. */
export const deckPath = (cards) => (Array.isArray(cards) && cards.length === 8
  ? `/clash/decks/${cards.map((c) => encodeURIComponent(cardKey(c))).sort().join(',')}` : null);

/** Gegenstück zu deckPath: Karten aus dem Adress-Teil; unbekannte Karten (n:Name) tragen nur ihren Namen. */
export function cardsFromDeckParam(param) {
  return String(param || '').split(',').filter(Boolean).slice(0, 8).map((key) => {
    if (key.startsWith('n:')) return { id: null, name: key.slice(2) };
    return localCard(key) || { id: null, name: key };
  });
}

/**
 * Was es im Spiel gibt, aus dem Kartenkatalog des Servers (/catalog, Antwort von useScout): alle Evolutionen und
 * Helden mit ihrem Bild und alle Karten, die unsere eigene Liste noch nicht kennt. Solange der Katalog fehlt,
 * springen unsere eigenen Karten- und Bilddaten ein.
 * @returns {{ ev1: Array, hero: Array, unknown: Array, live: boolean }}  Einträge: { id, name, rarity, elixir, icon }
 */
export function gameForms(catalog) {
  if (catalog?.cards?.length) {
    const form = (which) => catalog.cards.filter((c) => c[which]).map((c) => ({ id: c.id, name: c.name, rarity: c.rarity, elixir: c.elixir, icon: c[which] }));
    return { ev1: form('ev1'), hero: form('hero'), unknown: catalog.cards.filter((c) => !c.id), live: true };
  }
  const local = (which) => ALL_CARDS.filter((c) => cardImageUrl(c.id, which) !== cardImageUrl(c.id))
    .map((c) => ({ ...localCard(c.id), icon: cardImageUrl(c.id, which) }));
  return { ev1: local('ev1'), hero: local('hero'), unknown: [], live: false };
}

/** Reiter einer Seite; der gewählte steht als ?reiter= in der Adresse (Zurück behält ihn). */
export function useTab(ids) {
  const [params, setParams] = useSearchParams();
  const tab = ids.includes(params.get('reiter')) ? params.get('reiter') : ids[0];
  const setTab = (id) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (id === ids[0]) next.delete('reiter'); else next.set('reiter', id);
    return next;
  }, { replace: true });
  return [tab, setTab];
}

/** Zuletzt-online-Ampel: frisch (≤ 1 Tag), mittel (≤ 7 Tage), kalt. */
export function seenClass(ms, now = Date.now()) {
  if (!ms) return '';
  const days = (now - ms) / 86400000;
  return days <= 1 ? 'is-fresh' : days <= 7 ? 'is-stale' : 'is-cold';
}

// Ranked-Ligen: heute sieben Stufen (7 = Ultimate Champion). Ältere Saisons stehen im Profil noch in der früheren
// Zählung mit zehn Stufen (bestPathOfLegendSeasonResult.leagueNumber bis 10) — erkennbar an Werten über 7. Die
// Abzeichen-Dateien tragen die alte Nummerierung (leagueIconUrl rechnet für die neue Zählung +3).
const OLD_LEAGUE_NAMES = { 8: 'Grand Champion', 9: 'Royal Champion', 10: 'Ultimate Champion' };
export const rankedBadge = (league) => (league > ULTIMATE_CHAMPION_LEAGUE ? leagueIconUrl(league - 3) : leagueIconUrl(league));
export const rankedName = (league, lang) => OLD_LEAGUE_NAMES[league] || leagueName(league, lang);
/** Zählt die Liga Medaillen (statt Stufen)? */
export const hasMedals = (league) => league >= ULTIMATE_CHAMPION_LEAGUE;

/** Name des Modus eines Kampfes: Titel des Events im Spiel, sonst der Name aus dem Modus-Index des Servers
 *  (Backend lib/gameModes.js) in der Sprache der Seite. '' = Modus, den schon die Kampfgruppe benennt. */
export const battleModeName = (b, lang) => b?.event || b?.challengeTitle || b?.modeName?.[lang] || b?.modeName?.en
  || (isLeague2v2(b) ? (lang === 'en' ? '2v2 League' : '2v2-Liga') : '');

/** Sortieren mit Richtung: by liefert den Vergleichswert, Namen entscheiden bei Gleichstand. */
export function sortBy(list, value, dir, name = (x) => x.name || '') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (typeof va === 'string' || typeof vb === 'string') return sign * String(va).localeCompare(String(vb));
    return sign * ((va ?? -Infinity) - (vb ?? -Infinity)) || name(a).localeCompare(name(b));
  });
}
