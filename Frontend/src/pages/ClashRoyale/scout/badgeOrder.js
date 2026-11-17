// badgeOrder.js — Ordnung und lesbare Namen der Profil-Abzeichen (Reiter „Abzeichen" in playerTabs.jsx).
// Die API liefert die Abzeichen ungefähr in der Reihenfolge, in der Supercell sie eingeführt hat — CRL 2026 landete so
// z. B. ganz hinten statt bei den anderen CRL-Abzeichen. Hier werden sie nach Art gruppiert und innerhalb sortiert.
//
// Event-Ligen und -Turniere haben je zwei Abzeichen: „…Completion" (Event durchgespielt) und „…Rank" (in der Rangliste
// gelandet). Den Platz selbst gibt die API NICHT heraus: level und progress zählen nur, wie oft (geprüft 17.11.2026 an
// vier echten Profilen — im Spiel stand beim selben Abzeichen „#864", die API sagte level 1, progress 1). Dasselbe gilt
// für LadderTop1000/LadderTournamentTop1000: progress = wie oft unter den besten 1000.

/** Reihenfolge der Gruppen auf der Seite */
export const BADGE_GROUPS = ['ranks', 'crl', 'events', 'career', 'seasons', 'special'];

const EVENT_BADGE = /^(.+?)(Rank(?:_v\d+)?|Completion)$/;
const TOP1000 = /^Ladder(Tournament)?Top1000$/;
const CAREER = [
  'YearsPlayed', 'BattleWins', 'CollectionLevel', 'EmoteCollection', 'BannerCollection', 'ClanDonations', 'ClanWarWins',
  'ClanWarsVeteran', 'TopLeague', '2v2', 'Draft', 'SuddenDeath', '2xElixir', 'RampUp',
];
// Feste Reihenfolge innerhalb einer Gruppe; Namen mit Jahreszahl am Ende zählen ohne sie (CrlSpectator2026 → CrlSpectator)
const ORDER = ['LadderTop1000', 'LadderTournamentTop1000', 'Crl20Wins', 'CrlFinalist', 'CrlCompetitor', 'CrlSpectator', 'Grand12Wins', 'Classic12Wins', ...CAREER];

/** Gruppe eines Abzeichens. Unbekannte neue Namen sind bisher fast immer Event-Abzeichen. */
export function badgeGroup(name) {
  if (/^Crl/.test(name)) return 'crl';
  if (TOP1000.test(name)) return 'ranks';
  const ev = EVENT_BADGE.exec(name);
  if (ev) return ev[2] === 'Completion' ? 'events' : 'ranks';
  if (CAREER.includes(name)) return 'career';
  if (/^\d{4}YearBadge$|^SeasonalBadge_/.test(name)) return 'seasons';
  if (/^(EasterEgg|Creator|SupercellPancake)$/.test(name)) return 'special';
  return 'events';
}

/**
 * Was unter dem Abzeichen als Zahl steht: 'placed' = wie oft in einer Rangliste, 'done' = wie oft ein Event
 * durchgespielt, 'crl' = Siege von 20 in der CRL-Challenge; null = Stufe/Fortschritt wie bisher.
 */
export function badgeKind(name) {
  if (/^Crl20Wins/.test(name)) return 'crl';
  if (TOP1000.test(name)) return 'placed';
  const ev = EVENT_BADGE.exec(name);
  if (ev) return ev[2] === 'Completion' ? 'done' : 'placed';
  return null;
}

/** Datum im Namen als Sortierwert (JJJJMM; nur ein Jahr zählt als Jahresende), ohne Datum 0 */
export function badgeDate(name) {
  const ym = /(20\d{2})(0[1-9]|1[0-2])(?!\d)/.exec(name);
  if (ym) return Number(ym[1]) * 100 + Number(ym[2]);
  const y = /(20\d{2})(?!\d)/.exec(name);
  return y ? Number(y[1]) * 100 + 13 : 0;
}

const orderIndex = (name) => {
  const i = ORDER.indexOf(name.replace(/20\d{2}$/, ''));
  return i < 0 ? ORDER.length : i;
};

/**
 * Abzeichen in Gruppen, in Seitenreihenfolge; leere Gruppen fallen weg.
 * Innerhalb: feste Reihenfolge (ORDER), dann neueste zuerst, dann nach Anzeigename.
 * @param {Array<{name: string}>} list
 * @param {(name: string) => string} label  Anzeigename (für die letzte Sortierstufe)
 * @returns {Array<{group: string, list: Array}>}
 */
export function groupBadges(list, label = (n) => n) {
  const byGroup = new Map(BADGE_GROUPS.map((g) => [g, []]));
  for (const b of list) byGroup.get(badgeGroup(b.name)).push(b);
  const cmp = (a, b) => orderIndex(a.name) - orderIndex(b.name) || badgeDate(b.name) - badgeDate(a.name)
    || label(a.name).localeCompare(label(b.name));
  return BADGE_GROUPS.map((group) => ({ group, list: byGroup.get(group).slice().sort(cmp) })).filter((g) => g.list.length);
}

/**
 * Lesbarer Name aus dem internen (ohne feste Übersetzung): Jahr-Monat als Monatsname, „Badge" und Versionsendungen
 * weg, Zahlen abgesetzt — MergeTacticsBadge_202506 → „Merge Tactics Juni 2025", Royals2v2_2024 → „Royals 2v2 2024".
 * @param {(y: number, m: number) => string} month  Monatsname mit Jahr in der Seitensprache
 */
export function prettyBadge(name, month) {
  return String(name)
    .replace(/_v\d+$/, '')
    .replace(/_?(20\d{2})(0[1-9]|1[0-2])(?=_|$)/, (_, y, m) => ` ${month(Number(y), Number(m))}`)
    .replace(/Badge/, '')
    .replace(/^Crl/, 'CRL ')
    .replace(/(?<!\d)([a-z])(?=\d)/g, '$1 ')
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Anzeigename eines Abzeichens.
 * @param {object} t  Texte (badgeNames, yearBadge, seasonBadge)
 * @param {(y: number, m: number) => string} month
 */
export function badgeName(name, t, month) {
  if (t.badgeNames[name]) return t.badgeNames[name];
  const crl = /^Crl20Wins(\d{4})?$/.exec(name);
  if (crl) return `CRL 20 Wins${crl[1] ? ` ${crl[1]}` : ''}`;
  const ev = EVENT_BADGE.exec(name);
  if (ev) return prettyBadge(ev[1].replace(/Trail$/, ''), month);
  const year = /^(\d{4})YearBadge$/.exec(name);
  if (year) return t.yearBadge(year[1]);
  const season = /^SeasonalBadge_(20\d{2})(0[1-9]|1[0-2])/.exec(name);
  if (season) return t.seasonBadge(month(Number(season[1]), Number(season[2])));
  return prettyBadge(name, month);
}
