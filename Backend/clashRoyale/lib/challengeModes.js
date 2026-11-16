// challengeModes.js — Challenges und Turnier-Läufe im Win-Tracker erkennen und ihre Runs
// (Siege/Niederlagen je Versuch) aus dem Battlelog nachbauen: Classic-, Grand- und 20-Win-Challenge,
// Crown Series (Duel + Grand Duel Weekend) und Global Tournaments.
//
// Anders als die Saison-Modi (lib/seasonalModes.js) haben diese Modi KEINEN progress-Eintrag im
// Profil — alles steckt in den Battles selbst.
//
// Classic/Grand/20 Win (live geprüft 26.10.2026): Battle `type: "trail"`, gameMode bei allen drei
// gleich ("Challenge_AllCards_EventDeck_NoSet"), challengeId/challengeTitle/challengeWinCountBefore
// kommen NICHT. Unterscheidung allein über eventTag → Titel aus GET /events.
//
// Crown Series (live geprüft 13.11.2026, 234 Duelle von 105 Spielern, erstes Duel Weekend):
//   type "unknown", gameMode "Competitive_Multideck", arena "Arena_competitive",
//   eventTag → /events-Titel "Duel", deckSelection "quadDeckPick"
//   EIN Battle = EIN ganzes Duell (Best of 3, Runden in team.rounds) = ein Sieg/eine Niederlage
//   team.startingTrophies = Siege des Laufs VOR dem Duell (fehlt bei 0), Sieg: trophyChange 1,
//   Niederlage: kein trophyChange. Daraus lässt sich der Lauf exakt nachbauen, auch über Lücken.
//   Das Ergebnis darf NICHT aus der Kronensumme kommen (siehe roundsResult in crApi.js).
//   Die Crown-Series-Liga (Dagger … King's League) steht nirgends in der API: leagueNumber ist
//   immer 1, das Profil hat keinen progress-Eintrag dazu.
//   Ablauf einer Saison: Wochenende 1 Duel, 2 Duel, (3 Duel,) dann Grand Duel, dann Pause.
//   Regeln (Supercell + Nutzerangabe 13.11.2026): Duel Weekend 8 Siege / 3 Niederlagen. Grand Duel
//   Weekend je nach Liga: "Queen Grand Duel" (Ligen 1–8) 12 Siege / 4 Niederlagen, "King Grand
//   Duel" (King's League, Ligen 9–13) genau 20 Duelle ohne Siegziel und ohne Niederlagen-Grenze.
//   Weil die Liga nicht in der API steht, wählt der Nutzer sie im Editor (crown_league am Account,
//   siehe grandDuelRules). Das Grand Duel Weekend (erstmals 27.11.2026) ist noch NICHT live
//   geprüft — Event-Titel dann an einem echten Battlelog nachsehen.
//
// Global Tournament: am 13.11.2026 lief keins (GET /globaltournaments leer) — die Erkennung über
// `isLadderTournament` bzw. den Titel ist ungeprüft. Kein Siegziel, Ende nach maxLosses Niederlagen
// (meist 5, der echte Wert kommt aus /globaltournaments, siehe challengeInfo in crWinTrackerRoutes.js).

// Zwischen zwei Crown-Series-Wochenenden liegen mindestens 96 h (Mo 09:00 bis Fr 09:00 UTC), ein
// Wochenende selbst dauert 72 h. Ruht ein Lauf länger als das hier, gehört das nächste Duell zu
// einem neuen Wochenende und damit zu einem neuen Lauf.
const WEEKEND_GAP_MS = 84 * 60 * 60 * 1000;

// maxWins 0 = kein Siegziel (Global Tournament). maxLosses 0 = keine Niederlagen-Grenze, maxGames =
// feste Zahl an Spielen (beides nur King Grand Duel). maxGapMs = längste Pause innerhalb eines Laufs.
const CHALLENGES = [
  { key: 'grandduel', maxWins: 12, maxLosses: 4, maxGapMs: WEEKEND_GAP_MS },
  { key: 'duel', maxWins: 8, maxLosses: 3, maxGapMs: WEEKEND_GAP_MS },
  { key: 'global', maxWins: 0, maxLosses: 5 },
  // Reihenfolge = Prüfreihenfolge: "20 Win" zuerst, weil ein 20-Win-Titel theoretisch auch "Grand"
  // oder "Classic" enthalten könnte. maxLosses 3 bei allen drei (In-Game-Regel).
  { key: '20win', pattern: /20[\s_-]*win/i, maxWins: 20, maxLosses: 3 },
  { key: 'grand', pattern: /grand/i, maxWins: 12, maxLosses: 3 },
  { key: 'classic', pattern: /classic/i, maxWins: 12, maxLosses: 3 },
];
const CHALLENGE_BY_KEY = new Map(CHALLENGES.map((c) => [c.key, c]));
const NAMED_CHALLENGES = CHALLENGES.filter((c) => c.pattern);

// Spielarten, die nie eine offizielle Challenge sind, auch wenn der Name so klingt: Freundschafts-
// spiele, selbst erstellte Turniere ("Classic Challenge" als Turniername wäre möglich) und der
// Clankrieg (dort gibt es ebenfalls Duelle: type "riverRaceDuel", gameMode "CW_Duel_1v1").
const NON_CHALLENGE_TYPES = /^(friendly|clanmate|tournament|riverrace|boatbattle|clanwar)/i;

/**
 * Challenge-Schlüssel eines Battles oder null.
 * @param {{type?: string, challengeId?: number|null, challengeTitle?: string, gameMode?: string, eventTag?: string, isLadderTournament?: boolean}} b
 * @param {Array<{eventTag: string, title: string}>} [events] GET /events
 * @returns {'grandduel'|'duel'|'global'|'20win'|'grand'|'classic'|null}
 */
function classifyBattle(b, events) {
  if (!b) return null;
  const type = String(b.type || '');
  if (type && NON_CHALLENGE_TYPES.test(type)) return null;
  const eventTitle = b.eventTag && Array.isArray(events)
    ? (events.find((e) => e?.eventTag === b.eventTag)?.title || '')
    : '';
  const gameMode = String(b.gameMode || '');
  // Crown Series: am Modusnamen (bleibt gültig, wenn das Event aus /events verschwunden ist) oder
  // am Event-Titel "Duel". "Grand" im Titel/Modus = Grand Duel Weekend.
  if (/^competitive_multideck/i.test(gameMode) || /\bduels?\b/i.test(eventTitle)) {
    return /grand/i.test(`${eventTitle} ${gameMode}`) ? 'grandduel' : 'duel';
  }
  const text = [b.challengeTitle, eventTitle, gameMode].filter(Boolean).join(' ');
  if (b.isLadderTournament === true || /(global|royal)[\s_-]*tournament/i.test(text)) return 'global';
  // Muss nach Challenge aussehen: Spielart, Challenge-ID oder das Wort selbst im Namen.
  const looksLikeChallenge = /challenge/i.test(type) || b.challengeId != null || /challenge/i.test(text);
  if (!looksLikeChallenge) return null;
  const hit = NAMED_CHALLENGES.find((c) => c.pattern.test(text));
  return hit ? hit.key : null;
}

// Crown-Series-Ligen: 1 Dagger … 8 Queen's League, 9–13 King's League I–V. 0 = nicht gewählt.
const CROWN_LEAGUE_COUNT = 13;
const KING_LEAGUE_FROM = 9;
const KING_GRAND_DUEL_GAMES = 20;

/** Regel-Überschreibung fürs Grand Duel Weekend je Liga: King's League spielt 20 Duelle. */
function grandDuelRules(crownLeague) {
  return Number(crownLeague) >= KING_LEAGUE_FROM ? { maxWins: 0, maxLosses: 0, maxGames: KING_GRAND_DUEL_GAMES } : undefined;
}

/** Regeln eines Modus, einzelne Werte überschreibbar (Global Tournament: maxLosses laut API,
 *  King Grand Duel: maxWins/maxLosses 0 + maxGames). */
function rulesOf(key, overrides) {
  const cfg = CHALLENGE_BY_KEY.get(key);
  if (!cfg) return null;
  const pick = (name) => (Number.isInteger(overrides?.[name]) && overrides[name] >= 0 ? overrides[name] : (cfg[name] || 0));
  const rules = { ...cfg, maxWins: pick('maxWins'), maxLosses: pick('maxLosses'), maxGames: pick('maxGames') };
  // Ohne jede Grenze endete ein Lauf nie — dann gelten die Standardwerte.
  return rules.maxWins || rules.maxLosses || rules.maxGames ? rules : { ...cfg, maxGames: 0 };
}

/**
 * Runs einer Challenge aus ihren Battles (älteste zuerst) nachbauen.
 * Ein neuer Run beginnt, wenn der vorige vorbei ist (maxLosses Niederlagen oder maxWins Siege),
 * challenge_wins_before kleiner ist als die bisher gezählten Siege (Run abgebrochen/neu gestartet)
 * oder die Pause länger war als maxGapMs (Crown Series: neues Wochenende).
 * Ein Unentschieden zählt in Challenges als Niederlage.
 * @param {Array<{battle_time_ms: number, result: string, challenge_wins_before: number|null}>} rows
 * @param {string} key
 * @param {{maxLosses?: number, maxWins?: number, maxGames?: number}} [overrides]
 * @returns {Array<{startMs: number, lastMs: number, wins: number, losses: number, finished: boolean, results: string}>}
 *          results = Ergebnisse der gesehenen Matches in Spielreihenfolge ("w"/"l")
 */
function buildRuns(rows, key, overrides) {
  const cfg = rulesOf(key, overrides);
  if (!cfg) return [];
  const runs = [];
  let cur = null;
  for (const r of rows || []) {
    const before = Number.isInteger(r.challenge_wins_before) ? r.challenge_wins_before : null;
    const paused = cur && cfg.maxGapMs && r.battle_time_ms - cur.lastMs > cfg.maxGapMs;
    if (!cur || cur.finished || paused || (before !== null && before < cur.wins)) {
      cur = { startMs: r.battle_time_ms, lastMs: r.battle_time_ms, wins: before ?? 0, losses: 0, finished: false, results: '' };
      runs.push(cur);
    } else if (before !== null && before > cur.wins) {
      // Matches dazwischen nie gesehen (Sync-Lücke): Siege laut API übernehmen.
      cur.wins = before;
    }
    if (r.result === 'win') cur.wins += 1;
    else cur.losses += 1;
    cur.results += r.result === 'win' ? 'w' : 'l';
    cur.lastMs = r.battle_time_ms;
    cur.finished = (cfg.maxLosses > 0 && cur.losses >= cfg.maxLosses) || (cfg.maxWins > 0 && cur.wins >= cfg.maxWins)
      || (cfg.maxGames > 0 && cur.wins + cur.losses >= cfg.maxGames);
  }
  return runs;
}

/**
 * Was das Overlay zeigt: aktueller Run + wievielter Versuch in der Session.
 * Ist der letzte Run schon VOR der Session zu Ende gegangen (oder ruht er länger als maxGapMs),
 * steht ein frischer Run (0 Siege) da. Ein Run, der vor der Session begann und noch läuft, ist
 * Versuch 1. maxWins 0 = kein Siegziel, maxLosses 0 = keine Niederlagen-Grenze, maxGames > 0 =
 * feste Zahl an Spielen (King Grand Duel); results = Spielfolge des Laufs ("wwlw").
 */
function challengeState(runs, key, sessionStartMs, overrides, nowMs = Date.now()) {
  const cfg = rulesOf(key, overrides);
  const sessionRuns = runs.filter((r) => r.lastMs >= sessionStartMs);
  const last = runs[runs.length - 1];
  const stale = !!(last && cfg?.maxGapMs && nowMs - last.lastMs > cfg.maxGapMs);
  const fresh = !last || stale || (last.finished && last.lastMs < sessionStartMs);
  return {
    key,
    maxWins: cfg?.maxWins || 0,
    maxLosses: cfg?.maxLosses || 0,
    maxGames: cfg?.maxGames || 0,
    results: fresh ? '' : (last.results || ''),
    wins: fresh ? 0 : last.wins,
    losses: fresh ? 0 : last.losses,
    finished: fresh ? false : last.finished,
    attempt: fresh ? sessionRuns.length + 1 : Math.max(1, sessionRuns.length),
    bestWins: sessionRuns.reduce((m, r) => Math.max(m, r.wins), 0),
  };
}

const isChallengeKey = (key) => CHALLENGE_BY_KEY.has(key);

/** Modi, bei denen team.startingTrophies die Siege des Laufs vor dem Match ist (Crown Series). */
const countsWinsInStartingTrophies = (key) => key === 'duel' || key === 'grandduel';

module.exports = {
  CHALLENGES, CROWN_LEAGUE_COUNT, classifyBattle, buildRuns, challengeState, isChallengeKey,
  countsWinsInStartingTrophies, grandDuelRules,
};
