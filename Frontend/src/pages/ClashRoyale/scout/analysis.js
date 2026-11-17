// analysis.js — Auswertung des Battlelogs für die Spielerseite: Bilanz (gesamt, je Modus, je Tag), laufende Serie,
// Level-Vergleich, verschenktes Elixier, Karten-Matchups, das zuletzt gespielte Deck je Modus und die
// meistgespielten Decks.
//
// Reine Funktionen über die aufbereiteten Kämpfe aus /api/clash/scout/player (Backend: scoutShape.shapeBattles).
// Keine Importe, damit die Tests ohne Vite laufen.
//
// Das Battlelog der API reicht nur über die letzten rund 30 Kämpfe. Alle Aussagen gelten für diesen Ausschnitt.

export const cardKey = (c) => c.id || `n:${c.name}`;
export const deckKey = (cards) => cards.map(cardKey).sort().join(',');

/** Ø Elixier und Kosten der vier billigsten Karten (ein Umlauf). Karten ohne bekannte Kosten zählen nicht mit. */
export function deckStats(cards) {
  const costs = (cards || []).map((c) => c?.elixir).filter((e) => typeof e === 'number' && e > 0);
  if (!costs.length) return { avgElixir: null, cycle: null };
  const sorted = [...costs].sort((a, b) => a - b);
  return {
    avgElixir: Math.round((costs.reduce((a, b) => a + b, 0) / costs.length) * 10) / 10,
    cycle: sorted.length >= 4 ? sorted.slice(0, 4).reduce((a, b) => a + b, 0) : null,
  };
}

const rate = (wins, n) => (n ? wins / n : 0);
const round1 = (v) => Math.round(v * 10) / 10;

// In dieser Reihenfolge wird „das Deck" eines Spielers gesucht: Ranked zuerst (dort wird um Platzierung gespielt),
// dann Trophäenstraße und die übrigen 1v1-Modi.
export const DECK_GROUP_ORDER = ['ranked', 'ladder', 'crown', 'challenge', 'tournament', 'war', 'friendly', 'party'];

/** Wie deutlich ein Kampf ausging: Kronen-Unterschied, im Duell der Unterschied gewonnener Runden. 1 bis 3. */
function margin(b, me, opp) {
  if (b.rounds) {
    const won = b.rounds.filter((r) => r.f > r.a).length;
    const lost = b.rounds.filter((r) => r.f < r.a).length;
    return Math.max(1, Math.min(3, Math.abs(won - lost)));
  }
  return Math.max(1, Math.min(3, Math.abs(me.crowns - opp.crowns)));
}

// Ab dieser Ranked-Liga zählt das Spiel Medaillen (7 = Ultimate Champion, wie data/leagueIcons.js — hier ohne Import)
const MEDAL_LEAGUE = 7;

/**
 * Was ein Ranked-Kampf auf der Leiter bewegt hat. In Liga 1–6 zählt das Spiel Stufen (Sieg +1, Niederlage −1 — wie
 * im Win Tracker), erst ab Ultimate Champion Medaillen. Die API schreibt unterhalb von UC jedem Sieger pauschal
 * „trophyChange 30" gut und dem Verlierer nichts, einen Stand (startingTrophies) gibt es dort nicht — das ist kein
 * Medaillenwert (geprüft 15.11.2026 an einem Spieler in Liga 4). Liga des Kampfs aus der API (league), sonst
 * verrät der Stand die Medaillen-Liga: nur ab UC steht er im Kampf.
 * Den Season-Bonus und „auf Stufe 1 kostet eine Niederlage nichts" kann ein einzelner Kampf nicht wissen.
 * @returns {null | { kind: 'steps' | 'medals', delta: number }}
 */
export function rankedChange(b) {
  if (b?.group !== 'ranked') return null;
  const me = b.team?.[0];
  const opp = b.opponent?.[0];
  const medals = b.league ? b.league >= MEDAL_LEAGUE : typeof me?.start === 'number' || typeof opp?.start === 'number';
  if (medals) return typeof me?.change === 'number' && me.change !== 0 ? { kind: 'medals', delta: me.change } : null;
  if (b.result === 'win') return { kind: 'steps', delta: 1 };
  if (b.result === 'loss') return { kind: 'steps', delta: -1 };
  return null;
}

// Modi, in denen die API als „Stand vor dem Kampf“ (startingTrophies) die bisherigen Siege zählt statt Trophäen
export const WIN_COUNT_GROUPS = new Set(['crown', 'party', 'challenge', 'tournament']);

/**
 * Siege eines Spielers im laufenden Lauf VOR dem Kampf (Challenge, Crown Series, Turnier, Events mit Siegzählung)
 * oder null. Die API lässt startingTrophies bei 0 Siegen weg — geprüft 16.11.2026 an rund 8.000 gespeicherten
 * Kämpfen: dort zählt der Stand ab 1, und er fehlt bei beiden Seiten so oft wie „1 Sieg“ vorkommt. Reine Spaß-Events
 * (z. B. Showdown) haben gar keinen Stand; bei Events heißt „fehlt“ deshalb nur 0, wenn es eine Challenge ist oder die
 * andere Seite einen Stand hat. Global Tournament ist ungeprüft — dort nur, was die API ausdrücklich nennt.
 * @param {object} b  aufbereiteter Kampf
 * @param {object} p  Spieler aus b.team bzw. b.opponent
 * @param {boolean} mine  p ist der abgefragte Spieler (team[0]) — nur für ihn nennt die API challengeWinCountBefore
 */
export function winsBefore(b, p, mine = false) {
  if (!b || !p || !WIN_COUNT_GROUPS.has(b.group)) return null;
  if (typeof p.start === 'number') return p.start;
  if (mine && typeof b.challengeWins === 'number') return b.challengeWins;
  if (b.challenge === 'global') return null;
  if (b.group !== 'party') return 0;
  const sides = [...(b.team || []), ...(b.opponent || [])];
  const isRun = b.challenge || typeof b.challengeWins === 'number' || /^Challenge_/i.test(b.mode || '')
    || sides.some((s) => typeof s?.start === 'number');
  return isRun ? 0 : null;
}

/** Kalendertag eines Zeitpunkts in der Zeitzone des Geräts, z. B. "2026-11-14". */
export function localDayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Bilanz je Kalendertag, neuester Tag zuerst: Siege, Niederlagen und was der Tag an Medaillen bzw. Stufen (Ranked,
 * siehe rankedChange) und Trophäen (Trophäenstraße) gebracht hat. Unentschieden zählen nicht mit.
 * @param {Array} battles   neueste zuerst
 * @param {(ms: number) => string} [dayKey]  Tag eines Zeitpunkts (Tests geben eine feste Zeitzone vor)
 */
export function byDay(battles, dayKey = localDayKey) {
  const days = new Map();
  for (const b of Array.isArray(battles) ? battles : []) {
    const me = b.team?.[0];
    if (!me || !b.opponent?.[0] || (b.result !== 'win' && b.result !== 'loss')) continue;
    const key = dayKey(b.t);
    const day = days.get(key) || { key, t: b.t, n: 0, wins: 0, medals: 0, steps: 0, trophies: 0 };
    day.n += 1;
    if (b.result === 'win') day.wins += 1;
    const ranked = rankedChange(b);
    if (ranked) day[ranked.kind] += ranked.delta;
    else if (b.group === 'ladder' && typeof me.change === 'number') day.trophies += me.change;
    days.set(key, day);
  }
  return [...days.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

/**
 * Laufende Serie aus den neuesten entschiedenen Kämpfen: { result: 'win' | 'loss', n } oder null ohne Kampf.
 * Bewusst aus dem Log gezählt — der Serien-Wert des Profils (currentWinLoseStreak) passt nicht zu den gezeigten
 * Kämpfen (geprüft 14.11.2026: −3 bei einem Spieler, dessen letzte sechs Kämpfe Siege waren).
 */
export function currentStreak(battles) {
  let result = null;
  let n = 0;
  for (const b of Array.isArray(battles) ? battles : []) {
    if (b.result !== 'win' && b.result !== 'loss') continue;
    if (!result) result = b.result;
    if (b.result !== result) break;
    n += 1;
  }
  return result ? { result, n } : null;
}

/**
 * Duell-Set aus der Crown Series: die Runden-Decks der neuesten Crown-Series-Kämpfe, ohne gemeinsame Karte, höchstens
 * vier (so viele erlaubt das Spiel). Ein älteres Deck, das mit einem neueren eine Karte teilt, wurde offenbar ersetzt.
 * @returns {null | { decks: Array<{ cards, rounds: number, wins: number }>, t: number, battles: number }}
 */
export function crownSet(battles) {
  const duels = (Array.isArray(battles) ? battles : []).filter((b) => b.group === 'crown' && Array.isArray(b.team?.[0]?.decks));
  if (!duels.length) return null;
  const set = [];
  const used = new Set();
  const stats = new Map();
  for (const b of duels) {
    b.team[0].decks.forEach((cards, i) => {
      if (cards.length !== 8) return;
      const key = deckKey(cards);
      const s = stats.get(key) || { rounds: 0, wins: 0 };
      s.rounds += 1;
      if (b.rounds?.[i] && b.rounds[i].f > b.rounds[i].a) s.wins += 1;
      stats.set(key, s);
      if (set.length >= 4 || set.some((d) => d.key === key) || cards.some((c) => used.has(cardKey(c)))) return;
      set.push({ key, cards });
      cards.forEach((c) => used.add(cardKey(c)));
    });
  }
  return { decks: set.map((d) => ({ cards: d.cards, ...stats.get(d.key) })), t: duels[0].t, battles: duels.length };
}

/**
 * Kämpfe plus eigens gemerkte Crown-Series-Duelle (Profil-Antwort `crownBattles`), ohne doppelte, neueste zuerst —
 * so bleibt das Duell-Set sichtbar, auch wenn die Duelle schon aus den letzten Kämpfen gerutscht sind.
 */
function withCrownBattles(list, crown) {
  if (!Array.isArray(crown) || !crown.length) return list;
  const seen = new Set(list.map((b) => b.t));
  return [...list, ...crown.filter((b) => b && !seen.has(b.t))].sort((a, b) => b.t - a.t);
}

/**
 * @param {Array} battles   neueste zuerst
 * @param {{ crown?: Array }} [extra]  gemerkte Crown-Series-Duelle — zählen nur für das Duell-Set
 */
export function analyze(battles, { crown = null } = {}) {
  const list = Array.isArray(battles) ? battles : [];
  const decided = list.filter((b) => b.result === 'win' || b.result === 'loss');
  const wins = decided.filter((b) => b.result === 'win').length;

  const groups = new Map();
  const oppCards = new Map();
  const decks = new Map();
  const latest = new Map();
  const level = { n: 0, sum: 0, mine: 0, theirs: 0, under: { n: 0, wins: 0 }, even: { n: 0, wins: 0 }, over: { n: 0, wins: 0 } };
  const leaked = { n: 0, mine: 0, theirs: 0 };
  const close = { n: 0, wins: 0 };
  let crownsFor = 0;
  let crownsAgainst = 0;
  let threeCrown = 0;
  const line = [];
  const form = [];

  for (const b of list) {
    const me = b.team?.[0];
    const opp = b.opponent?.[0];
    if (!me || !opp) continue;
    const won = b.result === 'win';
    const lost = b.result === 'loss';
    const counted = won || lost;

    form.push({ result: b.result, t: b.t, group: b.group, margin: counted ? margin(b, me, opp) : 0, f: me.crowns, a: opp.crowns, opponent: opp.name });

    if (counted) {
      const g = groups.get(b.group) || { group: b.group, n: 0, wins: 0 };
      g.n += 1;
      if (won) g.wins += 1;
      groups.set(b.group, g);
    }

    crownsFor += me.crowns;
    crownsAgainst += opp.crowns;
    if (won && !b.rounds && me.crowns >= 3) threeCrown += 1;
    if (typeof me.start === 'number' && (b.group === 'ladder' || b.group === 'ranked')) {
      line.push({ t: b.t, group: b.group, v: me.start + (typeof me.change === 'number' ? me.change : 0) });
    }

    const solo = b.team.length === 1 && b.opponent.length === 1;
    if (!solo) continue;

    // Zuletzt gespieltes Deck je Modus (die Liste läuft vom neuesten zum ältesten Kampf)
    if (me.cards.length === 8 && !latest.has(b.group)) latest.set(b.group, { group: b.group, cards: me.cards, tower: me.tower, t: b.t });
    if (!counted) continue;

    // Knappes Spiel: eine Krone Unterschied (kein Duell — dort sind Kronen eine Summe über Runden)
    if (!b.rounds && Math.abs(me.crowns - opp.crowns) === 1) {
      close.n += 1;
      if (won) close.wins += 1;
    }
    if (typeof me.avgLevel === 'number' && typeof opp.avgLevel === 'number') {
      const diff = me.avgLevel - opp.avgLevel;
      level.n += 1;
      level.sum += diff;
      level.mine += me.avgLevel;
      level.theirs += opp.avgLevel;
      const bucket = diff <= -0.25 ? level.under : diff >= 0.25 ? level.over : level.even;
      bucket.n += 1;
      if (won) bucket.wins += 1;
    }
    if (typeof me.leaked === 'number' && typeof opp.leaked === 'number') {
      leaked.n += 1;
      leaked.mine += me.leaked;
      leaked.theirs += opp.leaked;
    }
    for (const c of opp.cards) {
      const e = oppCards.get(cardKey(c)) || { card: c, n: 0, wins: 0 };
      e.n += 1;
      if (won) e.wins += 1;
      oppCards.set(cardKey(c), e);
    }
    if (me.cards.length === 8) {
      const key = deckKey(me.cards);
      const d = decks.get(key) || { key, cards: me.cards, tower: me.tower, n: 0, wins: 0, lastT: b.t, groups: new Set() };
      d.n += 1;
      if (won) d.wins += 1;
      d.groups.add(b.group);
      decks.set(key, d);
    }
  }

  const matchups = [...oppCards.values()].filter((e) => e.n >= 3).map((e) => ({ ...e, winRate: rate(e.wins, e.n) }));
  return {
    count: list.length,
    decided: decided.length,
    wins,
    losses: decided.length - wins,
    draws: list.length - decided.length,
    winRate: rate(wins, decided.length),
    crownsFor: list.length ? round1(crownsFor / list.length) : 0,
    crownsAgainst: list.length ? round1(crownsAgainst / list.length) : 0,
    threeCrown,
    byGroup: [...groups.values()].map((g) => ({ ...g, winRate: rate(g.wins, g.n) })).sort((a, b) => b.n - a.n),
    level: {
      ...level,
      avgDiff: level.n ? level.sum / level.n : null,
      avgMine: level.n ? round1(level.mine / level.n) : null,
      avgTheirs: level.n ? round1(level.theirs / level.n) : null,
    },
    leaked: leaked.n ? { n: leaked.n, mine: round1(leaked.mine / leaked.n), theirs: round1(leaked.theirs / leaked.n) } : null,
    close,
    // Karten, gegen die es am schlechtesten bzw. am besten läuft (mindestens drei Begegnungen, klare Tendenz)
    hardAgainst: matchups.filter((e) => e.winRate < 0.5).sort((a, b) => a.winRate - b.winRate || b.n - a.n).slice(0, 5),
    strongAgainst: matchups.filter((e) => e.winRate > 0.5).sort((a, b) => b.winRate - a.winRate || b.n - a.n).slice(0, 5),
    decks: [...decks.values()].map((d) => ({ ...d, groups: [...d.groups], winRate: rate(d.wins, d.n), ...deckStats(d.cards) })).sort((a, b) => b.n - a.n || b.lastT - a.lastT),
    // Zuletzt gespieltes Deck je Modus, Ranked zuerst
    latestDecks: DECK_GROUP_ORDER.map((g) => latest.get(g)).filter(Boolean),
    // neueste zuerst
    form,
    days: byDay(list),
    streak: currentStreak(list),
    crownSet: crownSet(withCrownBattles(list, crown)),
    // Trophäen-/Medaillenverlauf je Gruppe, ältester Wert zuerst
    lines: ['ranked', 'ladder'].map((group) => ({ group, points: line.filter((p) => p.group === group).reverse() })).filter((l) => l.points.length >= 3),
  };
}

/**
 * Wie gut passt ein Deck zur Sammlung: Ø-Level, schwächste Karte, fehlende Karten.
 * @param {Array} deckCards  Karten des Decks ({ id, name })
 * @param {Map<string, object>} owned  Sammlung nach cardKey
 */
export function deckFit(deckCards, owned) {
  const levels = [];
  const missing = [];
  for (const c of deckCards) {
    const mine = owned.get(cardKey(c));
    if (!mine || typeof mine.lvl !== 'number') missing.push(c);
    else levels.push(mine.lvl);
  }
  return {
    missing,
    avgLevel: levels.length ? round1(levels.reduce((x, y) => x + y, 0) / levels.length) : null,
    minLevel: levels.length ? Math.min(...levels) : null,
  };
}
