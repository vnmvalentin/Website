// lib/winTrackerRecap.js — Saisonrückblick des Win Trackers ("Wrapped"): was in einer Clash-Royale-Saison passiert ist,
// berechnet aus den gespeicherten Matches (cr_wintracker_battles). Reine Funktionen, ohne Datenbank.
//
// Saisongrenze: Eine Saison beginnt am ersten Montag des Monats. Die Uhrzeit ist offiziell nicht veröffentlicht;
// RoyaleAPI nennt 9:00 UTC (help.royaleapi.com, „Ranked Seasons"). Für einen Rückblick reicht das — ein paar Stunden
// Unschärfe an der Grenze ändern an den Zahlen praktisch nichts.
'use strict';

const RESET_HOUR_UTC = 9;
const KEY_RE = /^(\d{4})-(\d{2})$/;
const TZ = 'Europe/Berlin';
const MONTHS = {
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** "2026-10" → "Oktober 2026" / "October 2026" (Sprache wie der Editor, settings.language) */
function seasonLabel(key, lang = 'de') {
  const m = KEY_RE.exec(String(key || ''));
  return m ? `${(MONTHS[lang] || MONTHS.de)[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** Erster Montag des Monats, 9:00 UTC, als Zeitstempel (month0: 0–11) */
function seasonStartMs(year, month0) {
  const first = new Date(Date.UTC(year, month0, 1, RESET_HOUR_UTC));
  const offset = (8 - first.getUTCDay()) % 7; // 0 = Sonntag … 1 = Montag
  return Date.UTC(year, month0, 1 + offset, RESET_HOUR_UTC);
}

const keyOf = (year, month0) => `${year}-${String(month0 + 1).padStart(2, '0')}`;

/** Saison "JJJJ-MM" (die im Monat MM beginnt) → { key, start, end, label } oder null */
function seasonWindow(key) {
  const m = KEY_RE.exec(String(key || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month0 = Number(m[2]) - 1;
  if (month0 < 0 || month0 > 11) return null;
  const next = month0 === 11 ? [year + 1, 0] : [year, month0 + 1];
  return { key, start: seasonStartMs(year, month0), end: seasonStartMs(next[0], next[1]) };
}

/** Die Saison, in die ein Zeitpunkt fällt */
function seasonKeyAt(ms) {
  const d = new Date(ms);
  let year = d.getUTCFullYear();
  let month0 = d.getUTCMonth();
  if (ms < seasonStartMs(year, month0)) {
    month0 -= 1;
    if (month0 < 0) { month0 = 11; year -= 1; }
  }
  return keyOf(year, month0);
}

/** Alle Saisons von firstMs bis now, neueste zuerst (höchstens max) */
function seasonKeysSince(firstMs, now = Date.now(), max = 12) {
  const keys = [];
  let key = seasonKeyAt(now);
  const stop = seasonKeyAt(firstMs);
  while (keys.length < max) {
    keys.push(key);
    if (key === stop) break;
    key = seasonKeyAt(seasonWindow(key).start - 1);
  }
  return keys;
}

/** Spielmodus des Matches → Gruppe für den Rückblick (Schlüssel; Beschriftung in Bild und Editor je Sprache) */
function modeGroup(gameMode) {
  const g = String(gameMode || '');
  if (/^ranked/i.test(g)) return 'ranked';
  if (/^ladder/i.test(g)) return 'ladder';
  if (/^teamvsteam/i.test(g) || /2v2/i.test(g)) return '2v2';
  if (/friendly$/i.test(g)) return 'friendly';
  return 'events';
}

// Lesbare Namen der Untermodi (game_mode der API). Unbekannte werden aus dem Rohnamen gebaut (humanMode).
const SUB_NAMES = [
  [/^7xElixir/i, '7x Elixir'], [/^DoubleElixir/i, 'Double Elixir'], [/^TripleElixir/i, 'Triple Elixir'],
  [/MegaDraft/i, 'Mega Draft'], [/^MirrorDeck/i, 'Mirror'], [/^Overtime/i, 'Overtime'], [/^RampUpElixir/i, 'Ramp Up'],
  [/^All_Random/i, 'All Random'], [/^Draft_Competitive/i, 'Draft (Competitive)'], [/^DraftMode/i, 'Draft'],
  [/^PickMode/i, 'Pick Mode'], [/^Touchdown/i, 'Touchdown'], [/Blackout/i, 'Blackout'], [/^EventDeck_4Card/i, '4-Card Deck'],
  [/^Challenge_AllCards_EventDeck/i, 'All Cards'], [/^Friendly$/i, 'Classic'], [/^TeamVsTeam$/i, '2v2'],
];
function humanMode(gameMode) {
  const g = String(gameMode || '');
  const hit = SUB_NAMES.find(([re]) => re.test(g));
  if (hit) return hit[1];
  const name = g.replace(/^\d{6}_/, '').replace(/^(Event|Challenge)_/i, '').replace(/_Friendly$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
  return name || 'Event';
}

/**
 * Wozu ein Match gehört: { group, sub }. Vorrang hat die Spielart laut API (battle_type, gespeichert ab Okt. 2026:
 * "friendly"/"clanMate" = Freundschaftskampf — darüber laufen auch die Turniere hier auf der Seite —, "tournament" =
 * Turnier im Spiel, "casual…" = Partymodi, "challenge" …). Ältere Matches ohne Spielart werden am Modusnamen erkannt.
 * Sondermodi mit eigener Punktzahl (Saison-Modi wie Spooky Chess, 2v2 Ranked) bekommen eine eigene Gruppe "s:<schlüssel>".
 */
function modeOf(b) {
  const gm = String(b.game_mode || '');
  const type = String(b.battle_type || '');
  if (b.seasonal_prefix) return { group: `s:${b.seasonal_prefix}`, sub: null };
  if (/^2v2League/i.test(String(b.battle_arena || ''))) return { group: 's:2v2league', sub: null };
  if (type === 'pathOfLegend' || /^ranked/i.test(gm)) return { group: 'ranked', sub: null };
  if (/^ladder/i.test(gm)) return { group: 'ladder', sub: null };
  if (type === 'friendly' || type === 'clanMate' || (!type && /^friendly$/i.test(gm))) {
    return { group: 'friendly', sub: type === 'clanMate' ? 'clanMate' : humanMode(gm) };
  }
  if (type === 'tournament') return { group: 'tournament', sub: humanMode(gm) };
  if (/riverrace|boatbattle|clanwar/i.test(type)) return { group: 'clanwar', sub: humanMode(gm) };
  if (/challenge/i.test(type) || (!type && /^challenge_/i.test(gm))) return { group: 'challenge', sub: humanMode(gm) };
  if (/^teamvsteam/i.test(gm) || /2v2/i.test(gm)) return { group: '2v2', sub: humanMode(gm) };
  if (/casual|party/i.test(type) || (!type && /_friendly$|megadraft|^draft|^pickmode|^touchdown/i.test(gm))) return { group: 'party', sub: humanMode(gm) };
  return { group: 'events', sub: humanMode(gm) };
}

// Tag als JJJJ-MM-TT (en-CA formatiert so) — die Anzeige formatiert je Sprache
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
// Nur der Stundenteil: de-DE formatiert sonst "20 Uhr"
const hourFmt = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' });
const hourOf = (ms) => Number(hourFmt.formatToParts(ms).find((p) => p.type === 'hour')?.value);

// Ein Deck wiedererkennen: dieselben 8 Karten, egal in welcher Reihenfolge (Evo/Held-Plätze zählen nicht extra)
const deckKey = (deck) => deck.map((c) => c.id || c.name).sort().join('|');
const parseDeck = (raw) => {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return Array.isArray(d) && d.length === 8 ? d : null;
  } catch { return null; }
};
const CURVE_POINTS = 120;
const DECK_MIN_MATCHES = 3;

const UC_LEAGUE = 7;
const STEP_WIN = 30; // so meldet die API einen Sieg in Liga 1–6 (eine Ligastufe, keine Medaillen)

/**
 * Wann die Saison in Ultimate Champion ankam (erstes Ranked-Match dort) — oder null.
 * In Liga 1–6 meldet die API je Sieg +30 und je Niederlage 0: das sind Ligastufen, keine Medaillen. In UC schwankt die
 * Änderung (±27–34) und Niederlagen kosten Medaillen. Erstes Match, das nicht ins Stufen-Muster passt = erstes UC-Match.
 * Der gespeicherte Verlauf (league_number je Sync, ab Okt. 2026) korrigiert das, wenn er mehr weiß.
 */
function ucStartMs(ranked, snapshots) {
  const hit = ranked.find((b) => {
    const c = Number(b.trophy_change) || 0;
    return c < 0 || (c !== 0 && c !== STEP_WIN);
  });
  let t = hit ? hit.battle_time_ms : null;
  const ucAt = snapshots.filter((s) => s.league_number >= UC_LEAGUE).map((s) => s.at);
  const belowAt = snapshots.filter((s) => s.league_number > 0 && s.league_number < UC_LEAGUE).map((s) => s.at);
  const lastBelow = belowAt.length ? Math.max(...belowAt) : null;
  const firstUc = ucAt.filter((x) => lastBelow === null || x > lastBelow);
  if (firstUc.length) {
    // Laut Verlauf in UC: spätestens das erste Match nach dem ersten UC-Stand. Matches davor (bis zum letzten Stand
    // unter UC) bleiben Aufstieg, außer das Medaillen-Muster zeigt UC schon früher.
    const bound = Math.min(...firstUc);
    const after = ranked.find((b) => b.battle_time_ms >= bound);
    if (t === null || t > bound) t = after ? after.battle_time_ms : null;
    if (t !== null && lastBelow !== null && t <= lastBelow) t = after ? after.battle_time_ms : null;
  } else if (lastBelow !== null && t !== null && t <= lastBelow) {
    t = null; // laut Verlauf noch gar nicht in UC — das "Muster" war Zufall
  }
  return t;
}

/**
 * @param battles  [{ battle_time_ms, result: 'win'|'loss'|'draw', trophy_change, crowns_for, game_mode, deck?,
 *                    starting_trophies? }]  Stand vor dem Match laut API (Medaillen in UC) — macht die Kurve exakt
 * @param opts     { snapshots?: [{ at, season_medals, league_number, pol_rank, trophies }],  Verlauf in der Saison
 *                   endMedals?: number,  aktueller Medaillenstand (nur laufende Saison) — daraus wird rückwärts gerechnet
 *                   specials?: { [gruppe]: { label?, best?, end? } },  Name, Höchst- und Endstand der Sondermodi (cr_wintracker_seasonal)
 *                   points?: true }  intern: Auswertung EINES Sondermodus (Kennzahl = dessen Punkte)
 * @returns Kennzahlen der Saison (matches = 0 → nichts gespielt)
 */
function computeRecap(battles, opts = {}) {
  const list = [...(battles || [])].sort((a, b) => a.battle_time_ms - b.battle_time_ms);
  const snaps = [...(opts.snapshots || [])].sort((a, b) => a.at - b.at);
  const r = {
    matches: list.length, wins: 0, losses: 0, draws: 0, winRate: null,
    longestWinStreak: 0, longestLossStreak: 0, threeCrownWins: 0, crowns: 0,
    rankedMedals: 0, ladderTrophies: 0,
    bestDay: null, biggestGain: null, biggestTilt: null, topHour: null,
    modes: [], decks: [], decksTracked: 0, curve: null, peak: null, climb: null, medals: null, specials: [],
  };
  const pointsMode = !!opts.points;
  const ranked = pointsMode ? [] : list.filter((b) => modeGroup(b.game_mode) === 'ranked' && !b.seasonal_prefix);
  const ucFrom = ucStartMs(ranked, snaps);
  const inUc = (b) => ucFrom !== null && b.battle_time_ms >= ucFrom;

  // Kennzahl für Kurve, Gain und Tilt: Medaillen (nur Ranked IN Ultimate Champion), sonst Trophäenstraße, sonst
  // Siege minus Niederlagen. Gain/Tilt eines Tages zählen NUR die Matches dieser Kennzahl.
  // Sondermodus: seine Punkte (|Änderung| ≤ 1 sind Qualifikations-/Fortschrittsschritte, keine Punkte)
  const metric = pointsMode ? 'points' : ranked.some(inUc)
    ? 'medals'
    : list.some((b) => modeGroup(b.game_mode) === 'ladder' && Number(b.trophy_change)) ? 'trophies' : 'record';
  const metricDelta = (b) => {
    if (metric === 'points') { const c = Number(b.trophy_change) || 0; return Math.abs(c) > 1 ? c : null; }
    const g = modeGroup(b.game_mode);
    if (metric === 'medals') return g === 'ranked' && !b.seasonal_prefix && inUc(b) ? Number(b.trophy_change) || 0 : null;
    if (metric === 'trophies') return g === 'ladder' ? Number(b.trophy_change) || 0 : null;
    return b.result === 'win' ? 1 : b.result === 'loss' ? -1 : 0;
  };
  let winStreak = 0;
  let lossStreak = 0;
  const days = new Map();
  const hours = new Map();
  const modes = new Map();
  const decks = new Map();
  for (const b of list) {
    const win = b.result === 'win';
    const loss = b.result === 'loss';
    if (win) r.wins += 1; else if (loss) r.losses += 1; else r.draws += 1;
    winStreak = win ? winStreak + 1 : 0;
    lossStreak = loss ? lossStreak + 1 : 0;
    if (winStreak > r.longestWinStreak) r.longestWinStreak = winStreak;
    if (lossStreak > r.longestLossStreak) r.longestLossStreak = lossStreak;
    r.crowns += Number(b.crowns_for) || 0;
    if (win && Number(b.crowns_for) === 3) r.threeCrownWins += 1;

    const group = modeGroup(b.game_mode);
    const kind = modeOf(b);
    const m = modes.get(kind.group) || { mode: kind.group, count: 0, wins: 0, losses: 0, draws: 0, subs: new Map() };
    m.count += 1;
    if (win) m.wins += 1; else if (loss) m.losses += 1; else m.draws += 1;
    if (kind.sub) {
      const sub = m.subs.get(kind.sub) || { label: kind.sub, count: 0, wins: 0, losses: 0, draws: 0 };
      sub.count += 1;
      if (win) sub.wins += 1; else if (loss) sub.losses += 1; else sub.draws += 1;
      m.subs.set(kind.sub, sub);
    }
    modes.set(kind.group, m);

    // Medaillen nur in UC (davor sind die +30 Ligastufen), Trophäen nur auf der Trophäenstraße
    const change = Number(b.trophy_change) || 0;
    if (group === 'ranked' && !b.seasonal_prefix && inUc(b)) r.rankedMedals += change;
    if (group === 'ladder') r.ladderTrophies += change;
    // Aufstieg durch Liga 1–6
    if (!pointsMode && group === 'ranked' && !b.seasonal_prefix && !inUc(b)) {
      if (!r.climb) r.climb = { from: b.battle_time_ms, to: b.battle_time_ms, matches: 0, wins: 0, losses: 0, reachedUc: false };
      r.climb.to = b.battle_time_ms;
      r.climb.matches += 1;
      if (win) r.climb.wins += 1; else if (loss) r.climb.losses += 1;
    }

    const day = dayFmt.format(b.battle_time_ms);
    if (win) days.set(day, (days.get(day) || 0) + 1);

    const hour = hourOf(b.battle_time_ms);
    hours.set(hour, (hours.get(hour) || 0) + 1);

    const deck = parseDeck(b.deck);
    if (deck) {
      r.decksTracked += 1;
      const key = deckKey(deck);
      const e = decks.get(key) || { cards: deck, matches: 0, wins: 0, losses: 0, lastAt: 0 };
      e.matches += 1;
      if (win) e.wins += 1; else if (loss) e.losses += 1;
      if (b.battle_time_ms >= e.lastAt) { e.cards = deck; e.lastAt = b.battle_time_ms; }
      decks.set(key, e);
    }
  }
  if (r.climb) r.climb.reachedUc = ucFrom !== null;
  const decided = r.wins + r.losses;
  if (decided > 0) r.winRate = Math.round((r.wins / decided) * 100);
  for (const [date, wins] of days) if (!r.bestDay || wins > r.bestDay.wins) r.bestDay = { date, wins };
  for (const [hour, count] of hours) if (r.topHour === null || count > hours.get(r.topHour)) r.topHour = hour;
  r.modes = [...modes.values()].sort((a, b) => b.count - a.count).map((m) => ({
    ...m,
    label: opts.specials?.[m.mode]?.label || null,
    // Untermodi nur, wenn sie etwas aufschlüsseln (ein einziger Untermodus = die Gruppe selbst)
    subs: m.subs.size > 1 || (m.subs.size === 1 && m.mode !== 'friendly' && m.mode !== '2v2')
      ? [...m.subs.values()].sort((a, b) => b.count - a.count) : [],
  }));

  // Beste Decks: ab DECK_MIN_MATCHES Matches, nach Siegquote, bei Gleichstand das öfter gespielte
  r.decks = [...decks.values()]
    .filter((e) => e.matches >= DECK_MIN_MATCHES)
    .map((e) => ({ cards: e.cards, matches: e.matches, wins: e.wins, losses: e.losses,
      winRate: e.wins + e.losses > 0 ? Math.round((e.wins / (e.wins + e.losses)) * 100) : 0 }))
    .sort((a, b) => b.winRate - a.winRate || b.matches - a.matches)
    .slice(0, 5);

  // Kurve: dieselbe Kennzahl wie Gain/Tilt. Jeder Punkt trägt Zeit, Ergebnis und Änderung (Hinweis beim Überfahren).
  if (list.length) {
    const metricBattles = list.filter((b) => metricDelta(b) !== null);
    const deltas = metricBattles.map(metricDelta);
    const t0 = metric === 'medals' ? ucFrom : (metricBattles[0]?.battle_time_ms ?? list[0].battle_time_ms);

    // Stand NACH jedem Match. Medaillen: die API nennt je Match den Stand davor (starting_trophies, gespeichert ab
    // Okt. 2026) — damit sind die Werte exakt, und fehlende Matches (Tracker aus) zeigen sich als Sprung statt alles
    // davor zu verschieben. Ohne diese Angabe: vom aktuellen Stand bzw. Verlauf zurückgerechnet (ungenau bei Lücken).
    let after = null;
    let offset = null;
    let approx = true;
    if (metric === 'medals' || metric === 'points') {
      const known = metricBattles.map((b) => (Number.isFinite(b.starting_trophies) && b.starting_trophies > 0 ? b.starting_trophies : null));
      const firstK = known.findIndex((x) => x !== null);
      let sum = 0;
      const cum = deltas.map((d) => (sum += d));
      if (firstK >= 0) {
        after = new Array(deltas.length);
        let cur = known[firstK];
        for (let i = firstK; i < deltas.length; i++) {
          if (known[i] !== null) cur = known[i];
          cur += deltas[i];
          after[i] = cur;
        }
        let back = known[firstK];
        for (let i = firstK - 1; i >= 0; i--) { after[i] = back; back -= deltas[i]; }
        approx = known.some((x) => x === null);
      } else {
        const lastUcSnap = [...snaps].reverse().find((s) => s.league_number >= UC_LEAGUE && s.season_medals > 0
          && !snaps.some((o) => o.league_number > 0 && o.league_number < UC_LEAGUE && o.at > s.at));
        let base = null;
        if (Number.isFinite(opts.endMedals) && opts.endMedals > 0) {
          base = opts.endMedals - sum;
        } else if (lastUcSnap) {
          const k = metricBattles.filter((b) => b.battle_time_ms <= lastUcSnap.at).length;
          base = lastUcSnap.season_medals - (k ? cum[k - 1] : 0);
        }
        // Genau ist der Startstand nur, wenn der Verlauf ihn vor dem ersten UC-Match festgehalten hat
        const firstUcBattle = metricBattles[0] ? metricBattles[0].battle_time_ms : Infinity;
        const startSnap = snaps.find((s) => s.league_number >= UC_LEAGUE && s.season_medals > 0 && s.at <= firstUcBattle
          && !snaps.some((o) => o.league_number > 0 && o.league_number < UC_LEAGUE && o.at > s.at));
        if (startSnap) { base = startSnap.season_medals; approx = false; }
        if (base !== null) after = cum.map((c) => base + c);
      }
      if (after && after.length) offset = after[0] - deltas[0];
    }

    // i = Nummer des Matches (die Kurve läuft über Matches, nicht über die Zeit — Nächte/Pausen sind keine Strecke).
    // v = Stand relativ zum Start (bei bekannten Medaillen: echter Stand − Startstand).
    const points = [{ t: t0, v: 0, c: null, r: null, i: 0 }];
    let v = 0;
    metricBattles.forEach((b, k) => {
      v = after ? after[k] - offset : v + deltas[k];
      points.push({ t: b.battle_time_ms, v, c: deltas[k], r: b.result, i: points.length });
    });

    // Gain/Tilt: größter Anstieg bzw. Absturz INNERHALB eines Tages (vom Hoch zum späteren Tief), nicht die
    // Tagesbilanz — ein Tag mit erst -300 und abends +350 ist trotzdem der größte Tilt.
    const span = (date, a, b, net) => {
      let wins = 0;
      let losses = 0;
      for (let k = a; k < b; k++) { if (metricBattles[k].result === 'win') wins += 1; else if (metricBattles[k].result === 'loss') losses += 1; }
      return { date, wins, losses, net, metric, from: offset !== null ? offset + points[a].v : null, to: offset !== null ? offset + points[b].v : null };
    };
    const byDay = new Map();
    metricBattles.forEach((b, k) => {
      const day = dayFmt.format(b.battle_time_ms);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(k + 1);
    });
    for (const [date, idx] of byDay) {
      let hiI = idx[0] - 1;
      let loI = idx[0] - 1;
      for (const j of idx) {
        const drop = points[j].v - points[hiI].v;
        const rise = points[j].v - points[loI].v;
        if (drop < 0 && (!r.biggestTilt || drop < r.biggestTilt.net)) r.biggestTilt = span(date, hiI, j, drop);
        if (rise > 0 && (!r.biggestGain || rise > r.biggestGain.net)) r.biggestGain = span(date, loI, j, rise);
        if (points[j].v > points[hiI].v) hiI = j;
        if (points[j].v < points[loI].v) loI = j;
      }
    }

    // Ausdünnen auf höchstens CURVE_POINTS — Hoch- und Tiefpunkt bleiben immer drin
    let curve = points;
    if (points.length > CURVE_POINTS) {
      const step = (points.length - 1) / (CURVE_POINTS - 1);
      const keep = new Set([0, points.length - 1]);
      for (let i = 0; i < CURVE_POINTS; i++) keep.add(Math.round(i * step));
      let hi = 0;
      let lo = 0;
      points.forEach((p, i) => { if (p.v > points[hi].v) hi = i; if (p.v < points[lo].v) lo = i; });
      keep.add(hi);
      keep.add(lo);
      curve = [...keep].sort((a, b) => a - b).map((i) => points[i]);
    }
    const values = points.map((p) => p.v);
    // Liga-Wechsel aus dem Verlauf (Aufstiege) + UC-Einstieg
    const leagueMarks = [];
    let prev = null;
    for (const s of snaps) {
      if (s.league_number > 0 && prev !== null && s.league_number > prev && s.league_number < UC_LEAGUE) leagueMarks.push({ t: s.at, league: s.league_number });
      if (s.league_number > 0) prev = s.league_number;
    }
    if (ucFrom !== null) leagueMarks.push({ t: ucFrom, league: UC_LEAGUE });
    r.curve = {
      metric, points: curve, count: metricBattles.length, end: v, max: Math.max(...values), min: Math.min(...values), offset, approx,
      from: r.climb ? r.climb.from : t0, ucFrom, leagueMarks,
    };
    if ((metric === 'medals' || metric === 'points') && offset !== null) {
      r.medals = { start: offset, end: offset + v, gain: v, approx };
    }
  }

  if (pointsMode) {
    const fromCurve = r.curve?.offset !== null && r.curve?.offset !== undefined ? r.curve.offset + r.curve.max : null;
    const best = Math.max(fromCurve ?? 0, Number(opts.best) || 0);
    r.peak = best > 0 ? { points: best } : null;
    return r;
  }

  // Sondermodi (Saison-Modi, 2v2 Ranked): eigene Auswertung mit Punkten, Kurve, Decks — für die eigenen Reiter
  r.specials = r.modes.filter((m) => m.mode.startsWith('s:')).map((m) => {
    const info = opts.specials?.[m.mode] || {};
    const sub = computeRecap(list.filter((b) => modeOf(b).group === m.mode), { points: true, best: info.best, endMedals: info.end || undefined });
    delete sub.modes;
    return { key: m.mode, label: m.label, ...sub };
  });

  // Höchstwerte der Saison: Verlauf (ab Okt. 2026 gespeichert) und Kurve in UC (mit echtem Stand)
  let maxMedals = snaps.length ? Math.max(...snaps.map((s) => s.season_medals || 0)) : null;
  if (r.curve?.metric === 'medals' && r.curve.offset !== null) maxMedals = Math.max(maxMedals ?? 0, r.curve.offset + r.curve.max);
  const ranks = snaps.map((s) => s.pol_rank).filter((x) => Number.isFinite(x) && x > 0);
  const leagues = snaps.map((s) => s.league_number || 0);
  if (ucFrom !== null) leagues.push(UC_LEAGUE);
  if (maxMedals || ranks.length || leagues.some((l) => l > 0)) {
    r.peak = {
      medals: maxMedals || null,
      rank: ranks.length ? Math.min(...ranks) : null,
      league: leagues.length ? Math.max(...leagues) : null,
    };
  }
  return r;
}

module.exports = { seasonStartMs, seasonWindow, seasonLabel, seasonKeyAt, seasonKeysSince, modeGroup, modeOf, humanMode, computeRecap, RESET_HOUR_UTC };
