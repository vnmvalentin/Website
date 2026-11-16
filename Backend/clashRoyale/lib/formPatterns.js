// formPatterns.js — Muster in den eigenen Kämpfen (Ausbauplan „cr-form“): wann man verliert, gegen wen und nach wie
// vielen Niederlagen in Folge — und daraus abgeleitete Tipps. Genutzt vom Spielerprofil der Stats
// (scout/scoutRoutes.js: /player/:tag/form) und vom Saisonrückblick des Win Trackers (winTrackerRecap.js).
//
// Reine Funktion über eine neutrale Kampfliste, damit beide Quellen sie füttern können:
//   { t: ms, result: 'win'|'loss'|'draw', myCards?: Array<{id,name,icon?}>, oppCards?: Array<…>, levelDiff?: number }
// Tipps gibt es nur bei genug Kämpfen UND einem deutlichen Unterschied — sonst wären es Zufallsmuster, die als Rat
// verkleidet sind.

/** Ab dieser Pause zwischen zwei Kämpfen beginnt eine neue Sitzung. */
const SESSION_GAP_MS = 45 * 60 * 1000;
/** So viele Kämpfe braucht eine Gruppe, bevor sie für einen Tipp zählt. */
const MIN_BUCKET = 8;
/** So deutlich (Prozentpunkte als Anteil) muss eine Gruppe vom Schnitt abweichen. */
const MIN_GAP = 0.1;

const TIMES = [
  { key: 'night', from: 0, to: 6 },
  { key: 'morning', from: 6, to: 12 },
  { key: 'afternoon', from: 12, to: 18 },
  { key: 'evening', from: 18, to: 24 },
];
const POSITIONS = [
  { key: '1-3', from: 1, to: 3 },
  { key: '4-6', from: 4, to: 6 },
  { key: '7-10', from: 7, to: 10 },
  { key: '11+', from: 11, to: Infinity },
];

const rate = (wins, n) => (n ? Math.round((wins / n) * 1000) / 1000 : null);

// Weicht eine Gruppe mehr als zufällig ab? Vergleich mit der Erwartung bei der Gesamtquote p (Normalnäherung der
// Binomialverteilung): z = (erwartete − tatsächliche Siege) / Streuung. Ab z ≈ 1,64 ist ein so schwaches Ergebnis bei
// gleicher Spielstärke seltener als 1 zu 20. Gesehen an echten Daten (Nov. 2026): ohne diese Prüfung wurde bei einem
// Spieler mit 90 % Siegquote „gegen Furnace tust du dich schwer“ aus EINER Niederlage in vier Kämpfen.
const zBelow = (e, p) => {
  const sd = Math.sqrt(e.n * p * (1 - p));
  return sd > 0 ? (e.n * p - e.wins) / sd : 0;
};
const Z_GROUP = 1.64;
/** Bei Karten werden Dutzende gleichzeitig verglichen — dort braucht es mehr, sonst fällt immer irgendeine heraus. */
const Z_CARD = 2.33;
const bucket = (key) => ({ key, n: 0, wins: 0 });
const finish = (b) => ({ ...b, winRate: rate(b.wins, b.n) });
const cardKey = (c) => c?.id || `n:${c?.name || '?'}`;
const slimCard = (c) => ({ id: c?.id || null, name: c?.name || '', ...(c?.icon ? { icon: c.icon } : null) });

/** Stunde (0–23) eines Zeitpunkts in einer Zeitzone; unbekannte Zone → Europe/Berlin. */
function hourIn(tz) {
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' });
  }
  return (ms) => Number(fmt.format(ms)) % 24;
}

/** Gültige IANA-Zeitzone oder null. */
function validTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return null; }
}

/**
 * @param {Array} battles  neutrale Kampfliste (Reihenfolge egal)
 * @param {{ tz?: string }} [opts]  Zeitzone für die Tageszeit
 */
function formPatterns(battles, { tz = 'Europe/Berlin' } = {}) {
  const hour = hourIn(tz);
  const list = (Array.isArray(battles) ? battles : [])
    .filter((b) => b && Number.isFinite(b.t) && (b.result === 'win' || b.result === 'loss'))
    .sort((a, b) => a.t - b.t);
  const n = list.length;
  const wins = list.filter((b) => b.result === 'win').length;
  const overall = rate(wins, n);

  const after = [bucket('afterWin'), bucket('after1'), bucket('after2'), bucket('after3')];
  const times = TIMES.map((x) => bucket(x.key));
  const positions = POSITIONS.map((x) => bucket(x.key));
  const levels = { under: bucket('under'), even: bucket('even'), over: bucket('over') };
  const opp = new Map();
  const mine = new Map();
  const decks = new Set();
  let sessions = 0;
  let pos = 0;
  let lossesBefore = 0;
  let prevT = null;

  for (const b of list) {
    const won = b.result === 'win';
    const newSession = prevT === null || b.t - prevT > SESSION_GAP_MS;
    if (newSession) { sessions += 1; pos = 0; lossesBefore = 0; }
    pos += 1;
    // Nach Niederlagen in Folge: nur innerhalb einer Sitzung, der erste Kampf einer Sitzung zählt nicht
    if (!newSession) {
      const a = after[Math.min(3, lossesBefore)];
      a.n += 1;
      if (won) a.wins += 1;
    }
    lossesBefore = won ? 0 : lossesBefore + 1;
    prevT = b.t;

    const h = hour(b.t);
    const tb = times[TIMES.findIndex((x) => h >= x.from && h < x.to)];
    tb.n += 1;
    if (won) tb.wins += 1;
    const pb = positions[POSITIONS.findIndex((x) => pos >= x.from && pos <= x.to)];
    pb.n += 1;
    if (won) pb.wins += 1;

    if (typeof b.levelDiff === 'number' && Number.isFinite(b.levelDiff)) {
      const lb = b.levelDiff <= -0.25 ? levels.under : b.levelDiff >= 0.25 ? levels.over : levels.even;
      lb.n += 1;
      if (won) lb.wins += 1;
    }
    for (const c of Array.isArray(b.oppCards) ? b.oppCards : []) {
      const e = opp.get(cardKey(c)) || { card: slimCard(c), n: 0, wins: 0 };
      e.n += 1;
      if (won) e.wins += 1;
      opp.set(cardKey(c), e);
    }
    if (Array.isArray(b.myCards) && b.myCards.length) {
      decks.add(b.myCards.map(cardKey).sort().join(','));
      for (const c of b.myCards) {
        const e = mine.get(cardKey(c)) || { card: slimCard(c), n: 0, wins: 0 };
        e.n += 1;
        if (won) e.wins += 1;
        mine.set(cardKey(c), e);
      }
    }
  }

  // Laufende Niederlagenserie (vom neuesten Kampf rückwärts)
  let currentLossStreak = 0;
  for (let i = list.length - 1; i >= 0 && list[i].result === 'loss'; i--) currentLossStreak += 1;

  // Karte fällt auf: genug Begegnungen, mindestens drei Niederlagen, deutlich unter dem Schnitt UND kaum Zufall
  const cardBelow = (e, minN, gap) => e.n >= minN && e.n - e.wins >= 3 && overall !== null
    && rate(e.wins, e.n) <= overall - gap && zBelow(e, overall) >= Z_CARD;
  const hardCards = [...opp.values()].filter((e) => cardBelow(e, 5, 0.15)).map(finish).sort((a, b) => a.winRate - b.winRate || b.n - a.n).slice(0, 5);
  // Eigene Karten vergleichen ist nur sinnvoll, wenn mehrere Decks gespielt wurden — sonst hat jede Karte dieselbe Bilanz
  const weakCards = decks.size >= 2
    ? [...mine.values()].filter((e) => cardBelow(e, 6, 0.12)).map(finish).sort((a, b) => a.winRate - b.winRate || b.n - a.n).slice(0, 4)
    : [];

  const r = {
    n, wins, winRate: overall, from: list[0]?.t ?? null, to: list[n - 1]?.t ?? null, sessions, currentLossStreak,
    afterLosses: after.map(finish), timeOfDay: times.map(finish), sessionPos: positions.map(finish),
    levels: { under: finish(levels.under), even: finish(levels.even), over: finish(levels.over) },
    hardCards, weakCards, tips: [],
  };

  // ── Tipps ──────────────────────────────────────────────────────────────────
  const tips = r.tips;
  if (currentLossStreak >= 3) tips.push({ key: 'lossStreakNow', tone: 'warn', n: currentLossStreak });
  if (overall !== null) {
    const tilt = { n: after[2].n + after[3].n, wins: after[2].wins + after[3].wins };
    const tiltRate = rate(tilt.wins, tilt.n);
    if (tilt.n >= MIN_BUCKET && tiltRate <= overall - MIN_GAP && zBelow(tilt, overall) >= Z_GROUP) {
      tips.push({ key: 'tilt', tone: 'bad', winRate: tiltRate, overall, n: tilt.n });
    } else if (tilt.n >= MIN_BUCKET * 1.5 && tiltRate >= overall + MIN_GAP / 2) {
      tips.push({ key: 'resilient', tone: 'good', winRate: tiltRate, overall, n: tilt.n });
    }

    const early = r.sessionPos[0];
    const late = { n: positions[2].n + positions[3].n, wins: positions[2].wins + positions[3].wins };
    const lateRate = rate(late.wins, late.n);
    if (early.n >= MIN_BUCKET && late.n >= MIN_BUCKET && lateRate <= early.winRate - MIN_GAP && zBelow(late, overall) >= Z_GROUP) {
      tips.push({ key: 'fatigue', tone: 'bad', early: early.winRate, late: lateRate, from: POSITIONS[2].from });
    }

    const timed = r.timeOfDay.filter((x) => x.n >= MIN_BUCKET);
    if (timed.length >= 2) {
      const best = timed.reduce((a, b) => (b.winRate > a.winRate ? b : a));
      const worst = timed.reduce((a, b) => (b.winRate < a.winRate ? b : a));
      // die schwächste Tageszeit muss mehr als zufällig hinter dem Schnitt liegen
      if (best.winRate - worst.winRate >= 0.12 && zBelow(worst, overall) >= Z_GROUP) {
        tips.push({ key: 'bestTime', tone: 'info', best: best.key, bestRate: best.winRate, worst: worst.key, worstRate: worst.winRate });
      }
    }

    const under = r.levels.under;
    if (under.n >= 6 && under.winRate <= overall - 0.15 && zBelow(under, overall) >= Z_GROUP) {
      tips.push({ key: 'underLevel', tone: 'bad', winRate: under.winRate, overall, n: under.n });
    }
    if (hardCards.length) tips.push({ key: 'hardCards', tone: 'bad', cards: hardCards.slice(0, 3) });
    if (weakCards.length) tips.push({ key: 'weakCards', tone: 'bad', cards: weakCards.slice(0, 3) });
  }
  return r;
}

/** Ein aufbereiteter Kampf der Stats (scoutShape.shapeBattles) in der neutralen Form — nur 1v1. */
function fromScoutBattle(b) {
  if (!b || b.team?.length !== 1 || b.opponent?.length !== 1) return null;
  const me = b.team[0];
  const opp = b.opponent[0];
  return {
    t: b.t,
    result: b.result,
    myCards: Array.isArray(me.cards) && me.cards.length === 8 ? me.cards : null,
    oppCards: Array.isArray(opp.cards) && opp.cards.length === 8 ? opp.cards : null,
    levelDiff: typeof me.avgLevel === 'number' && typeof opp.avgLevel === 'number' ? me.avgLevel - opp.avgLevel : undefined,
  };
}

module.exports = { formPatterns, fromScoutBattle, validTimeZone, SESSION_GAP_MS, MIN_BUCKET, TIMES, POSITIONS };
