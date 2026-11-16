// scoutHistory.js — Verläufe, die erst über Wochen nützlich werden und deshalb früh gesammelt werden (Ausbauplan,
// Spur B: „Sammler für Matchups und Clan-Schnappschüsse früh starten"):
//
//   • Matchups: jeder Ranked-Kampf der Bestplatzierten, den der Meta-Sammler sieht, genau einmal — beide Decks mit
//     gespielter Form (Evolution/Held), Turmtruppen und Ergebnis. Der Meta-Schnappschuss (scoutMeta.js) zählt nur die
//     letzten drei Tage und wirft danach alles weg; aus diesen Zeilen entstehen später Siegquoten Deck gegen Deck und
//     Karte gegen Karte über Wochen (Idee „matchups").
//   • Clan-Schnappschüsse: Mitglieder (Spenden, zuletzt online, Rolle, Trophäen) und laufender Clankrieg (Decks, Ruhm)
//     angesehener Clans in festen Abständen. Die API kennt nur den Augenblick — Wochen-Spenden, Kriegsdecks je Tag,
//     Ein- und Austritte ergeben sich erst aus der Folge (Idee „clan-zentrale").
//
// Hier stehen nur die reinen Umformungen (ohne Datenbank testbar); gespeichert wird in scoutStore.js.

// ── Matchups ─────────────────────────────────────────────────────────────────

/** Karte als Zeichenkette: unsere ID, mit gespielter Form „~ev1"/„~hero"; Karten, die wir nicht kennen, als „n:Name". */
const cardToken = (c) => (c?.id ? (c.variant ? `${c.id}~${c.variant}` : c.id) : `n:${c?.name || '?'}`);
/** Turmtruppe als Zeichenkette („t:Name") oder null. */
const towerToken = (t) => (t?.id || t?.name ? `t:${t.id || t.name}` : null);
const sideOf = (s) => ({ cards: s.cards.map(cardToken).sort(), tower: towerToken(s.tower) });

/**
 * Ranked-1v1-Kämpfe eines aufbereiteten Battlelogs (scoutShape.shapeBattles) als Matchup-Zeilen.
 * Seite a ist die mit dem kleineren Tag — derselbe Kampf ergibt aus beiden Battlelogs dieselbe Zeile (gleicher key).
 * @returns {Array<{ key: string, t: number, a: {cards: string[], tower: string|null}, b: object, res: 0|1|2 }>}
 *   res: 1 = Seite a gewann, 2 = Seite b, 0 = unentschieden
 */
function matchupRows(battles) {
  const out = [];
  for (const b of Array.isArray(battles) ? battles : []) {
    if (!b || b.group !== 'ranked' || !Number.isFinite(b.t) || b.t <= 0) continue;
    if (b.team?.length !== 1 || b.opponent?.length !== 1) continue;
    const me = b.team[0];
    const opp = b.opponent[0];
    if (!me?.tag || !opp?.tag || me.cards?.length !== 8 || opp.cards?.length !== 8) continue;
    const swap = me.tag > opp.tag;
    const mine = b.result === 'win' ? 1 : b.result === 'loss' ? 2 : 0;
    out.push({
      key: swap ? `${b.t}|${opp.tag}|${me.tag}` : `${b.t}|${me.tag}|${opp.tag}`,
      t: b.t,
      a: sideOf(swap ? opp : me),
      b: sideOf(swap ? me : opp),
      res: swap && mine ? 3 - mine : mine,
    });
  }
  return out;
}

// ── Clan-Schnappschüsse ──────────────────────────────────────────────────────
// Kompakt als Spalten-Listen (gemessen Nov. 2026: 50 Mitglieder + 59 Kriegsteilnehmer ≈ 4,9 KB, gepackt ≈ 1,8 KB).
// Die Spaltenfolge gehört zum Format v1 — neue Spalten nur hinten anhängen, sonst v hochzählen.
const SNAPSHOT_VERSION = 1;
const MEMBER_COLS = ['tag', 'name', 'role', 'lastSeen', 'expLevel', 'trophies', 'donations', 'received', 'rank'];
const PARTICIPANT_COLS = ['tag', 'name', 'fame', 'repair', 'boatAttacks', 'decksUsed', 'decksToday'];
const RIVAL_COLS = ['tag', 'name', 'fame', 'repair', 'periodPoints', 'score', 'finished', 'active'];

const toRow = (obj, cols) => cols.map((k) => (obj?.[k] === undefined ? null : obj[k]));
const fromRow = (row, cols) => Object.fromEntries(cols.map((k, i) => [k, Array.isArray(row) && row[i] !== undefined ? row[i] : null]));

/**
 * Schnappschuss aus Clan (scoutShape.shapeClan) und laufendem Clankrieg (scoutShape.shapeRiverRace, darf null sein).
 * Rivalen = alle Clans des Rennens samt dem eigenen (Ruhm und aktive Spieler, keine Teilnehmerlisten).
 */
function packClanSnapshot(clan, race) {
  if (!clan) return null;
  return {
    v: SNAPSHOT_VERSION,
    clan: {
      score: clan.score ?? null,
      warTrophies: clan.warTrophies ?? null,
      members: clan.memberCount ?? (Array.isArray(clan.members) ? clan.members.length : null),
      required: clan.requiredTrophies ?? null,
      donationsPerWeek: clan.donationsPerWeek ?? null,
      type: clan.type || null,
    },
    m: (Array.isArray(clan.members) ? clan.members : []).map((m) => toRow(m, MEMBER_COLS)),
    race: race?.clan ? {
      state: race.state || null,
      periodType: race.periodType || null,
      periodIndex: race.periodIndex ?? null,
      sectionIndex: race.sectionIndex ?? null,
      fame: race.clan.fame ?? null,
      repair: race.clan.repair ?? null,
      periodPoints: race.clan.periodPoints ?? null,
      score: race.clan.score ?? null,
      finished: race.clan.finished ?? null,
      p: (Array.isArray(race.clan.participants) ? race.clan.participants : []).map((p) => toRow(p, PARTICIPANT_COLS)),
      o: (Array.isArray(race.clans) ? race.clans : []).map((c) => toRow(c, RIVAL_COLS)),
    } : null,
  };
}

/** Gegenstück zu packClanSnapshot: Spalten-Listen wieder als Objekte. */
function unpackClanSnapshot(packed) {
  if (!packed || typeof packed !== 'object') return null;
  const race = packed.race ? {
    ...packed.race,
    participants: (packed.race.p || []).map((r) => fromRow(r, PARTICIPANT_COLS)),
    rivals: (packed.race.o || []).map((r) => fromRow(r, RIVAL_COLS)),
  } : null;
  if (race) { delete race.p; delete race.o; }
  return {
    v: packed.v,
    clan: packed.clan || null,
    members: (packed.m || []).map((r) => fromRow(r, MEMBER_COLS)),
    race,
  };
}

module.exports = {
  matchupRows, cardToken, towerToken,
  packClanSnapshot, unpackClanSnapshot, MEMBER_COLS, PARTICIPANT_COLS, RIVAL_COLS, SNAPSHOT_VERSION,
};
