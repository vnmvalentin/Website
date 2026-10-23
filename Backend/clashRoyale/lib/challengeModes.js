// challengeModes.js — 20-Win-, Classic- und Grand-Challenge im Win-Tracker erkennen und ihre Runs
// (Siege/Niederlagen je Versuch) aus dem Battlelog nachbauen.
//
// Anders als die Saison-Modi (lib/seasonalModes.js) haben Challenges KEINEN progress-Eintrag im
// Profil — alles steckt in den Battles selbst. Die offizielle API liefert dort bei Challenge-Matches
// (battle.type enthält "challenge") zusätzlich:
//   challengeId              — numerische Challenge-ID
//   challengeTitle           — Anzeigename, z.B. "Classic Challenge"
//   challengeWinCountBefore  — Siege des laufenden Runs VOR diesem Match
// Stand 21.10.2026 nicht live geprüft (Heim-IP bei der API gesperrt, die 20-Win-Challenge läuft erst
// ab nächster Woche). Deshalb erkennt classifyBattle die Challenge an JEDEM verfügbaren Namen
// (challengeTitle, gameMode, /events-Titel per eventTag), und buildRuns zählt auch ohne
// challengeWinCountBefore korrekt mit — das Feld korrigiert nur Lücken (verpasste Matches).

// Reihenfolge = Prüfreihenfolge: "20 Win" zuerst, weil ein 20-Win-Titel theoretisch auch "Grand"
// oder "Classic" enthalten könnte. maxLosses 3 bei allen drei (In-Game-Regel).
const CHALLENGES = [
  { key: '20win', pattern: /20[\s_-]*win/i, maxWins: 20, maxLosses: 3 },
  { key: 'grand', pattern: /grand/i, maxWins: 12, maxLosses: 3 },
  { key: 'classic', pattern: /classic/i, maxWins: 12, maxLosses: 3 },
];
const CHALLENGE_BY_KEY = new Map(CHALLENGES.map((c) => [c.key, c]));

// Spielarten, die nie eine offizielle Challenge sind, auch wenn der Name so klingt: Freundschafts-
// spiele und selbst erstellte Turniere ("Classic Challenge" als Turniername wäre möglich).
const NON_CHALLENGE_TYPES = /^(friendly|clanmate|tournament)/i;

/**
 * Challenge-Schlüssel eines Battles ('20win' | 'grand' | 'classic') oder null.
 * @param {{type?: string, challengeId?: number|null, challengeTitle?: string, gameMode?: string, eventTag?: string}} b
 * @param {Array<{eventTag: string, title: string}>} [events] GET /events
 */
function classifyBattle(b, events) {
  if (!b) return null;
  const type = String(b.type || '');
  if (type && NON_CHALLENGE_TYPES.test(type)) return null;
  const eventTitle = b.eventTag && Array.isArray(events)
    ? (events.find((e) => e?.eventTag === b.eventTag)?.title || '')
    : '';
  const text = [b.challengeTitle, eventTitle, b.gameMode].filter(Boolean).join(' ');
  // Muss nach Challenge aussehen: Spielart, Challenge-ID oder das Wort selbst im Namen.
  const looksLikeChallenge = /challenge/i.test(type) || b.challengeId != null || /challenge/i.test(text);
  if (!looksLikeChallenge) return null;
  const hit = CHALLENGES.find((c) => c.pattern.test(text));
  return hit ? hit.key : null;
}

/**
 * Runs einer Challenge aus ihren Battles (älteste zuerst) nachbauen.
 * Ein neuer Run beginnt, wenn der vorige vorbei ist (maxLosses Niederlagen oder maxWins Siege) oder
 * challengeWinCountBefore kleiner ist als die bisher gezählten Siege (Run abgebrochen/neu gestartet).
 * Ein Unentschieden zählt in Challenges als Niederlage.
 * @param {Array<{battle_time_ms: number, result: string, challenge_wins_before: number|null}>} rows
 * @returns {Array<{startMs: number, lastMs: number, wins: number, losses: number, finished: boolean}>}
 */
function buildRuns(rows, key) {
  const cfg = CHALLENGE_BY_KEY.get(key);
  if (!cfg) return [];
  const runs = [];
  let cur = null;
  for (const r of rows || []) {
    const before = Number.isInteger(r.challenge_wins_before) ? r.challenge_wins_before : null;
    if (!cur || cur.finished || (before !== null && before < cur.wins)) {
      cur = { startMs: r.battle_time_ms, lastMs: r.battle_time_ms, wins: before ?? 0, losses: 0, finished: false };
      runs.push(cur);
    } else if (before !== null && before > cur.wins) {
      // Matches dazwischen nie gesehen (Sync-Lücke): Siege laut API übernehmen.
      cur.wins = before;
    }
    if (r.result === 'win') cur.wins += 1;
    else cur.losses += 1;
    cur.lastMs = r.battle_time_ms;
    cur.finished = cur.losses >= cfg.maxLosses || cur.wins >= cfg.maxWins;
  }
  return runs;
}

/**
 * Was das Overlay zeigt: aktueller Run + wievielter Versuch in der Session.
 * Ist der letzte Run schon VOR der Session zu Ende gegangen, steht ein frischer Run (0 Siege) da.
 * Ein Run, der vor der Session begann und noch läuft, ist Versuch 1.
 */
function challengeState(runs, key, sessionStartMs) {
  const cfg = CHALLENGE_BY_KEY.get(key);
  const sessionRuns = runs.filter((r) => r.lastMs >= sessionStartMs);
  const last = runs[runs.length - 1];
  const fresh = !last || (last.finished && last.lastMs < sessionStartMs);
  return {
    key,
    maxWins: cfg?.maxWins || 0,
    maxLosses: cfg?.maxLosses || 0,
    wins: fresh ? 0 : last.wins,
    losses: fresh ? 0 : last.losses,
    finished: fresh ? false : last.finished,
    attempt: fresh ? sessionRuns.length + 1 : Math.max(1, sessionRuns.length),
    bestWins: sessionRuns.reduce((m, r) => Math.max(m, r.wins), 0),
  };
}

const isChallengeKey = (key) => CHALLENGE_BY_KEY.has(key);

module.exports = { CHALLENGES, classifyBattle, buildRuns, challengeState, isChallengeKey };
