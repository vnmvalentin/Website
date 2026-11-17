// clanCentral.js — Auswertung der Clan-Zentrale (Ausbauplan „clan-zentrale", Spur B): Antworten für Anführer —
// wer hat seine Kriegsdecks gespielt, wer spendet, wer ist inaktiv, wer kam und ging, wen befördern oder entfernen.
//
// Quellen (alle schon vorhanden, hier nur ausgewertet):
//   • der Clan jetzt (scoutShape.shapeClan): Rolle, zuletzt online, Spenden dieser Woche
//   • der laufende Clankrieg (shapeRiverRace): Decks diese Woche und heute
//   • der Kriegsverlauf (shapeWarLog): die API liefert 10 abgeschlossene Wochen samt Teilnehmerliste — Kriegsdecks je
//     Mitglied gibt es also sofort, ohne eigene Aufzeichnung
//   • Clan-Schnappschüsse (scoutStore.getClanSnapshots, alle 3 h für angesehene Clans): Spenden je Woche, Ein- und
//     Austritte, Beförderungen — das kennt die API nur als Augenblick
//
// Reine Funktionen ohne Datenbank und Netz (Tests: __tests__/clanCentral.test.js).

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const DECKS_PER_DAY = 4;
const DECKS_PER_WEEK = 16;
// Ein Kriegstag endet je Clan zu einer festen Uhrzeit — gemessen am 16.11.2026 an drei Clans: 09:30, 09:41 und 09:49
// UTC, jede Woche dieselbe (Ende des Rennens im Kriegsverlauf). Ohne Verlauf gilt die früheste beobachtete Zeit.
const DEFAULT_RESET_MIN_UTC = 9 * 60 + 30;
// Wie weit Spenden und Ereignisse zurückreichen
const LOOKBACK_MS = 8 * WEEK;
const MAX_EVENTS = 120;
const MAX_DONATION_WEEKS = 6;
// Zwischen zwei Schnappschüssen länger als das: Zeitpunkt eines Ereignisses nur ungefähr
const EVENT_GAP_MS = 6 * HOUR;

// Schwellen der Ampel und der Vorschläge — in der Oberfläche unter „So wird gerechnet" erklärt (clanCentralTexts)
const RULES = {
  seenYellowDays: 3,
  seenRedDays: 7,
  warYellow: 0.75, // Anteil gespielter Kriegsdecks
  warRed: 0.25,
  warMinSample: 8, // so viele mögliche Decks, bevor der Krieg in die Ampel zählt
  // Hat weniger als dieser Anteil der Mitglieder überhaupt ein Kriegsdeck gespielt, zählt der Krieg nicht. Gemessen
  // 16.11.2026: Top-Clans ohne Krieg 2–16 %, ein Kriegs-Clan (immer im Ziel) 58 % — dort spielen 40 % gar nicht,
  // deshalb taugt der Mittelwert nicht.
  clanWarMin: 0.25,
  clanWarMinMembers: 5,
  promoteWar: 0.9,
  promoteSample: DECKS_PER_WEEK,
  promoteSeenDays: 3,
  promoteTenureDays: 14,
  kickSeenDays: 14,
  kickWarWeeks: 2,
  kickTenureDays: 7,
  demoteSeenDays: 14,
};

const ROLE_RANK = { member: 0, elder: 1, coLeader: 2, leader: 3 };
const roleRank = (r) => (r in ROLE_RANK ? ROLE_RANK[r] : 0);

const median = (list) => {
  const s = list.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── Kriegstag ────────────────────────────────────────────────────────────────

/** Uhrzeit (Minuten nach Mitternacht UTC), zu der die Kriegstage dieses Clans enden — aus dem letzten Rennen. */
function resetMinuteOf(log) {
  const last = (Array.isArray(log) ? log : []).find((w) => Number.isFinite(w?.date));
  if (!last) return { minute: DEFAULT_RESET_MIN_UTC, source: 'default' };
  const d = new Date(last.date);
  return { minute: d.getUTCHours() * 60 + d.getUTCMinutes(), source: 'log' };
}

/** Nächstes Tagesende nach `now` bei Tagesende `minute` (UTC). */
function nextDayEnd(now, minute) {
  const d = new Date(now);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + minute * 60000;
  if (t <= now) t += DAY;
  return t;
}

const isWarPeriod = (race) => race?.periodType === 'warDay' || race?.periodType === 'colosseum';

/** Kriegstag 1–4 der Woche (periodIndex zählt die Tage der Saison: Mo–Mi Training, Do–So Krieg), sonst null. */
function warDayNumber(race) {
  if (!isWarPeriod(race) || !Number.isFinite(race.periodIndex)) return null;
  const n = (race.periodIndex % 7) - 2;
  return n >= 1 && n <= 4 ? n : null;
}

/**
 * Laufender Kriegstag: Ende, wer noch Decks offen hat (nur aktuelle Mitglieder) — null außerhalb der Kriegstage.
 * @returns {{ type, day, endsAt, resetSource, open: Array<{tag, name, left, today}>, decksLeft, players }|null}
 */
function warDayStatus(race, clan, log, now = Date.now()) {
  if (!isWarPeriod(race)) return null;
  const members = new Set((clan?.members || []).map((m) => m.tag));
  const { minute, source } = resetMinuteOf(log);
  const open = (race.clan?.participants || [])
    .filter((p) => members.has(p.tag) && p.decksToday < DECKS_PER_DAY)
    .map((p) => ({ tag: p.tag, name: p.name, left: DECKS_PER_DAY - p.decksToday, today: p.decksToday }));
  // Mitglieder, die noch gar nicht in der Teilnehmerliste stehen, haben ebenfalls alle Decks offen
  const listed = new Set((race.clan?.participants || []).map((p) => p.tag));
  for (const m of clan?.members || []) {
    if (!listed.has(m.tag)) open.push({ tag: m.tag, name: m.name, left: DECKS_PER_DAY, today: 0 });
  }
  // Wer heute schon angefangen hat, steht vorn (da fehlt nur ein Rest)
  open.sort((a, b) => b.today - a.today || a.name.localeCompare(b.name));
  return {
    type: race.periodType,
    day: warDayNumber(race),
    endsAt: nextDayEnd(now, minute),
    resetSource: source,
    open,
    decksLeft: open.reduce((s, p) => s + p.left, 0),
    players: (clan?.members || []).length,
  };
}

// ── Kriegsverlauf je Mitglied ────────────────────────────────────────────────

/** Abgeschlossene Wochen des Verlaufs, neueste zuerst, mit „möglichen" Decks (höchstens 16, mindestens 4). */
function warWeeks(log) {
  return (Array.isArray(log) ? log : []).filter((w) => w?.own).map((w) => {
    const parts = Array.isArray(w.own.participants) ? w.own.participants : [];
    // Wer früh ins Ziel kommt, kann nicht alle 16 Decks spielen — die meisten gespielten Decks im Clan gelten als möglich
    const top = parts.reduce((m, p) => Math.max(m, p.decksUsed || 0), 0);
    return {
      season: w.season ?? null,
      week: w.week ?? null,
      date: w.date ?? null,
      rank: w.own.rank ?? null,
      fame: w.own.fame ?? 0,
      trophyChange: w.own.trophyChange ?? null,
      possible: Math.min(DECKS_PER_WEEK, Math.max(DECKS_PER_DAY, top)),
      byTag: new Map(parts.map((p) => [p.tag, p])),
    };
  });
}

// ── Schnappschüsse: Spenden je Woche und Ereignisse ──────────────────────────

/**
 * Folge der Clan-Zustände: Schnappschüsse (älteste zuerst) und als letzter der Clan jetzt.
 * @returns {Array<{ t: number, members: Map<string, object> }>}
 */
function stateSequence(snaps, clan, now) {
  const seq = [];
  for (const s of Array.isArray(snaps) ? snaps : []) {
    if (!Number.isFinite(s?.t) || !Array.isArray(s.members) || !s.members.length) continue;
    seq.push({ t: s.t, members: new Map(s.members.filter((m) => m?.tag).map((m) => [m.tag, m])) });
  }
  if (clan?.members?.length) {
    const last = seq[seq.length - 1];
    if (!last || now > last.t) seq.push({ t: now, members: new Map(clan.members.map((m) => [m.tag, m])), live: true });
  }
  return seq;
}

/**
 * Spenden je Woche: der Spenden-Zähler zählt wochenweise hoch und springt zum Wochenwechsel zurück. Ein Wechsel ist,
 * wo bei mindestens der Hälfte der Mitglieder, die vorher etwas gespendet hatten, der Zähler kleiner wird. Je Woche
 * gilt der höchste gesehene Stand (bis zu 3 h vor dem Wechsel fehlen also).
 * @returns {{ weeks: Array<{start, end, current}>, byTag: Map<string, Array<{given, received}|null>> }} neueste zuerst
 */
function donationWeeks(seq) {
  const segments = [];
  let cur = null;
  for (let i = 0; i < seq.length; i++) {
    const s = seq[i];
    if (cur && i > 0) {
      const prev = seq[i - 1];
      let before = 0;
      let dropped = 0;
      for (const [tag, m] of s.members) {
        const p = prev.members.get(tag);
        if (!p || !(p.donations > 0)) continue;
        before += 1;
        if ((m.donations || 0) < p.donations) dropped += 1;
      }
      if (before > 0 && dropped * 2 >= before) cur = null;
    }
    if (!cur) {
      cur = { start: s.t, end: s.t, best: new Map() };
      segments.push(cur);
    }
    cur.end = s.t;
    for (const [tag, m] of s.members) {
      const b = cur.best.get(tag) || { given: 0, received: 0 };
      cur.best.set(tag, { given: Math.max(b.given, m.donations || 0), received: Math.max(b.received, m.received || 0) });
    }
  }
  const recent = segments.slice(-MAX_DONATION_WEEKS).reverse();
  const byTag = new Map();
  recent.forEach((seg, i) => {
    for (const [tag, v] of seg.best) {
      if (!byTag.has(tag)) byTag.set(tag, new Array(recent.length).fill(null));
      byTag.get(tag)[i] = v;
    }
  });
  const lastT = seq.length ? seq[seq.length - 1].t : 0;
  return {
    weeks: recent.map((seg) => ({ start: seg.start, end: seg.end, current: seg.end === lastT })),
    byTag,
  };
}

/** Ein- und Austritte, Beförderungen und Zurückstufungen zwischen aufeinanderfolgenden Zuständen, neueste zuerst. */
function clanEvents(seq) {
  const out = [];
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1];
    const cur = seq[i];
    const approx = cur.t - prev.t > EVENT_GAP_MS;
    const base = { t: cur.t, after: prev.t, ...(approx ? { approx: true } : null) };
    for (const [tag, m] of cur.members) {
      const p = prev.members.get(tag);
      if (!p) out.push({ ...base, kind: 'join', tag, name: m.name, role: m.role });
      else if (p.role !== m.role && p.role && m.role) {
        out.push({ ...base, kind: roleRank(m.role) > roleRank(p.role) ? 'promote' : 'demote', tag, name: m.name, from: p.role, to: m.role });
      }
    }
    for (const [tag, p] of prev.members) {
      if (!cur.members.has(tag)) out.push({ ...base, kind: 'leave', tag, name: p.name, role: p.role });
    }
  }
  return out.sort((a, b) => b.t - a.t).slice(0, MAX_EVENTS);
}

// ── Zusammenführen ───────────────────────────────────────────────────────────

/**
 * Seit wann ein Mitglied im Clan ist: ein gesehener Eintritt ist genau (zwischen zwei Schnappschüssen); sonst eine
 * Untergrenze aus dem ersten Schnappschuss und den Kriegswochen, in denen es ohne Lücke bis heute dabei war.
 */
function memberSince(tag, events, seq, weeks) {
  const join = events.find((e) => e.kind === 'join' && e.tag === tag);
  if (join) return { t: join.t, exact: !join.approx };
  let bound = null;
  const first = seq.find((s) => !s.live);
  if (first && first.members.has(tag)) bound = first.t;
  let run = 0;
  for (const w of weeks) {
    if (!w.byTag.has(tag)) break;
    run += 1;
    if (Number.isFinite(w.date)) bound = Math.min(bound ?? Infinity, w.date - WEEK);
  }
  return bound === null ? null : { t: bound, exact: false, weeks: run };
}

/** Anteil gespielter Kriegsdecks: abgeschlossene Tage dieser Woche und die letzten zwei Wochen, in denen es dabei war. */
function warShare(tag, weeks, race) {
  let used = 0;
  let possible = 0;
  const day = warDayNumber(race);
  if (day && day > 1) {
    const p = (race.clan?.participants || []).find((x) => x.tag === tag);
    if (p) {
      used += Math.max(0, p.decksUsed - p.decksToday);
      possible += (day - 1) * DECKS_PER_DAY;
    }
  }
  let counted = 0;
  for (const w of weeks) {
    if (counted >= 2) break;
    const p = w.byTag.get(tag);
    if (!p) continue;
    used += Math.min(p.decksUsed || 0, w.possible);
    possible += w.possible;
    counted += 1;
  }
  return possible > 0 ? { rate: used / possible, used, possible } : null;
}

/**
 * Die ganze Zentrale für einen Clan.
 * @param {{ clan: object, race?: object|null, log?: object[], snaps?: object[], snapStats?: object, now?: number }} input
 */
function buildClanCentral({ clan, race = null, log = [], snaps = [], snapStats = null, now = Date.now() }) {
  if (!clan) return null;
  const weeks = warWeeks(log);
  const seq = stateSequence(snaps, clan, now);
  const events = clanEvents(seq);
  const donations = donationWeeks(seq);

  const rows = clan.members.map((m) => {
    const share = warShare(m.tag, weeks, race);
    const since = memberSince(m.tag, events, seq, weeks);
    const p = race?.clan?.participants?.find((x) => x.tag === m.tag) || null;
    return {
      tag: m.tag,
      name: m.name,
      role: m.role,
      trophies: m.trophies,
      lastSeen: m.lastSeen ?? null,
      donations: m.donations ?? 0,
      received: m.received ?? 0,
      since,
      war: weeks.map((w) => {
        const x = w.byTag.get(m.tag);
        return x ? { decks: x.decksUsed || 0, fame: x.fame || 0 } : null;
      }),
      warNow: isWarPeriod(race) && p ? { decks: p.decksUsed, today: p.decksToday, fame: p.fame } : null,
      share,
      donationWeeks: donations.byTag.get(m.tag) || donations.weeks.map(() => null),
    };
  });

  // Spielt der Clan kaum Krieg, sagt der Krieg nichts über einzelne Mitglieder — dann zählt nur die Online-Zeit
  const sampled = rows.filter((r) => r.share && r.share.possible >= RULES.warMinSample);
  const warIgnored = sampled.length >= RULES.clanWarMinMembers
    && sampled.filter((r) => r.share.used > 0).length / sampled.length < RULES.clanWarMin;
  const giftMedian = median(rows.map((r) => r.donations));

  const counts = { green: 0, yellow: 0, red: 0 };
  for (const r of rows) {
    const reasons = [];
    const seenDays = r.lastSeen ? (now - r.lastSeen) / DAY : null;
    const tenureDays = r.since ? (now - r.since.t) / DAY : null;
    let level = 0;
    if (seenDays !== null && seenDays > RULES.seenRedDays) { level = 2; reasons.push({ k: 'offline', days: Math.floor(seenDays) }); }
    else if (seenDays !== null && seenDays > RULES.seenYellowDays) { level = 1; reasons.push({ k: 'offline', days: Math.floor(seenDays) }); }
    const war = !warIgnored && r.share && r.share.possible >= RULES.warMinSample ? r.share : null;
    if (war && war.rate < RULES.warRed) { level = 2; reasons.push({ k: 'warLow', used: war.used, possible: war.possible }); }
    else if (war && war.rate < RULES.warYellow) { level = Math.max(level, 1); reasons.push({ k: 'warLow', used: war.used, possible: war.possible }); }
    if (r.since?.exact && tenureDays !== null && tenureDays < RULES.kickTenureDays) reasons.push({ k: 'new' });
    r.light = ['green', 'yellow', 'red'][level];
    r.reasons = reasons;
    counts[r.light] += 1;

    // Vorschläge
    r.hint = null;
    const tenureOk = (d) => tenureDays !== null && tenureDays >= d;
    if (r.role === 'member') {
      const fullWar = !warIgnored && r.share && r.share.possible >= RULES.promoteSample && r.share.rate >= RULES.promoteWar;
      const donor = giftMedian !== null && r.donations > 0 && r.donations >= giftMedian;
      const active = seenDays !== null && seenDays <= RULES.promoteSeenDays;
      if (active && tenureOk(RULES.promoteTenureDays) && (fullWar || (warIgnored && donor))) {
        const why = [];
        if (fullWar) why.push({ k: 'warFull', used: r.share.used, possible: r.share.possible });
        if (donor) why.push({ k: 'donor', n: r.donations });
        why.push({ k: 'tenure', days: Math.floor(tenureDays) });
        r.hint = { k: 'promote', to: 'elder', why };
      }
    }
    if (!r.hint && (r.role === 'member' || r.role === 'elder')) {
      const why = [];
      if (seenDays !== null && seenDays > RULES.kickSeenDays) why.push({ k: 'offline', days: Math.floor(seenDays) });
      // Zwei abgeschlossene Wochen hintereinander dabei und kein einziges Deck — außer, es spielt diese Woche wieder
      const playsNow = r.warNow && r.warNow.decks > 0;
      if (!warIgnored && !playsNow) {
        const recent = r.war.slice(0, RULES.kickWarWeeks);
        if (recent.length === RULES.kickWarWeeks && recent.every((w) => w && w.decks === 0)) why.push({ k: 'warNone', weeks: RULES.kickWarWeeks });
      }
      const isNew = r.since?.exact && !tenureOk(RULES.kickTenureDays);
      if (why.length && !isNew) r.hint = { k: 'kick', why };
    }
    if (!r.hint && r.role === 'coLeader' && seenDays !== null && seenDays > RULES.demoteSeenDays) {
      r.hint = { k: 'demote', to: 'elder', why: [{ k: 'offline', days: Math.floor(seenDays) }] };
    }
    delete r.share; // nur intern; die Oberfläche bekommt die Wochen einzeln
    if (war) r.warRate = Math.round(war.rate * 100) / 100;
  }

  const firstSnap = seq.find((s) => !s.live);
  return {
    history: {
      snaps: snapStats?.n ?? seq.filter((s) => !s.live).length,
      oldest: snapStats?.oldest ?? firstSnap?.t ?? null,
      newest: snapStats?.newest ?? null,
    },
    warIgnored,
    weeks: weeks.map(({ byTag, ...w }) => w),
    donationWeeks: donations.weeks,
    warDay: warDayStatus(race, clan, log, now),
    events: events.filter((e) => now - e.t <= LOOKBACK_MS),
    counts,
    members: rows,
  };
}

module.exports = {
  buildClanCentral, warDayStatus, warWeeks, donationWeeks, clanEvents, stateSequence, resetMinuteOf, nextDayEnd,
  warDayNumber, isWarPeriod, RULES, DECKS_PER_DAY, DECKS_PER_WEEK, LOOKBACK_MS, DEFAULT_RESET_MIN_UTC,
};
