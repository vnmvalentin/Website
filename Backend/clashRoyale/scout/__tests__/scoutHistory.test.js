// Tests der Verläufe für später (scoutHistory.js + scoutStore): Matchup-Zeilen aus Battlelogs und Clan-Schnappschüsse.
// Kein Netz und keine echte Datenbank: die API ist eine Attrappe, der Speicher liegt im Temp-Ordner.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-scout-history-test-'));
process.env.CR_SCOUT_DB = path.join(tmpDir, 'scout.db');

const express = require('express');
const shape = require('../scoutShape');
const store = require('../scoutStore');
const history = require('../scoutHistory');
const { createMetaCrawler } = require('../scoutMeta');
const { createScoutRouter } = require('../scoutRoutes');
const crApi = require('../../lib/crApi');

test.after(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Rohdaten im Format der offiziellen API (wie scout.test.js) ───────────────
const MAX = { common: 16, rare: 14, epic: 11, legendary: 8 };
const card = (name, rarity, level, extra = {}) => ({ name, id: 26000000, level, maxLevel: MAX[rarity], rarity, elixirCost: 3, iconUrls: { medium: `https://example.invalid/${name}.png` }, ...extra });
const DECK_A = [
  card('Knight', 'common', 14, { evolutionLevel: 1, iconUrls: { medium: 'm', evolutionMedium: 'e' } }),
  card('Archers', 'common', 14), card('Fireball', 'rare', 12), card('Musketeer', 'rare', 12),
  card('Skeletons', 'common', 15), card('Ice Spirit', 'common', 14), card('The Log', 'legendary', 6), card('Hog Rider', 'rare', 12),
];
const DECK_B = [
  card('Mega Knight', 'legendary', 8), card('Bats', 'common', 16), card('Zap', 'common', 16), card('Miner', 'legendary', 8),
  card('Wall Breakers', 'epic', 11), card('Inferno Dragon', 'legendary', 8), card('Goblin Gang', 'common', 16), card('Arrows', 'common', 16),
];
const tower = (name) => ({ supportCards: [{ name, level: 11, maxLevel: 16, rarity: 'epic', iconUrls: { medium: `https://x/${name}.png` } }] });
const side = (tag, name, cards, crowns, extra = {}) => ({ tag: `#${tag}`, name, crowns, cards, ...extra });
const battle = (time, team, opponent, extra = {}) => ({
  type: 'pathOfLegend', battleTime: time, gameMode: { id: 1, name: 'Ranked1v1_NewArena' }, arena: { name: 'League 7' }, team, opponent, ...extra,
});
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '');

// ── Matchups ─────────────────────────────────────────────────────────────────
test('Matchup-Zeilen: derselbe Kampf aus beiden Battlelogs ergibt dieselbe Zeile, Seite a = kleinerer Tag', () => {
  const time = '20261113T180000.000Z';
  // 8YY gewinnt gegen 2PP (Kronen 1:2 aus Sicht von 2PP)
  const fromA = shape.shapeBattles([battle(time, [side('2PP', 'A', DECK_A, 1, tower('Cannoneer'))], [side('8YY', 'B', DECK_B, 2, tower('Tower Princess'))])], '2PP', 16);
  const fromB = shape.shapeBattles([battle(time, [side('8YY', 'B', DECK_B, 2, tower('Tower Princess'))], [side('2PP', 'A', DECK_A, 1, tower('Cannoneer'))])], '8YY', 16);
  const [ra] = history.matchupRows(fromA);
  const [rb] = history.matchupRows(fromB);
  assert.deepEqual(ra, rb);
  assert.equal(ra.key, `${Date.UTC(2026, 10, 13, 18)}|2PP|8YY`);
  assert.equal(ra.res, 2); // Seite b (8YY) gewann
  assert.ok(ra.a.cards.includes('knight~ev1')); // gespielte Form bleibt erhalten
  assert.equal(ra.a.cards.length, 8);
  assert.equal(ra.a.tower, 't:Cannoneer');
  assert.equal(ra.b.tower, 't:Tower Princess');
});

test('Matchup-Zeilen: nur Ranked 1v1 mit vollen Decks', () => {
  const ladder = battle('20261113T180000.000Z', [side('2PP', 'A', DECK_A, 1)], [side('8YY', 'B', DECK_B, 0)], { type: 'PvP', gameMode: { id: 2, name: 'Ladder' } });
  const short = battle('20261113T190000.000Z', [side('2PP', 'A', DECK_A.slice(0, 7), 1)], [side('8YY', 'B', DECK_B, 0)]);
  assert.deepEqual(history.matchupRows(shape.shapeBattles([ladder, short], '2PP', 16)), []);
  assert.deepEqual(history.matchupRows(null), []);
});

test('Matchup-Speicher: doppelte Kämpfe zählen einmal, der bessere Platz gilt, Decks kommen vollständig zurück', () => {
  const now = Date.now();
  const t1 = stamp(now - 60 * 60 * 1000);
  const t2 = stamp(now - 2 * 60 * 60 * 1000);
  const fromA = shape.shapeBattles([
    battle(t1, [side('2PP', 'A', DECK_A, 2, tower('Cannoneer'))], [side('8YY', 'B', DECK_B, 0)]),
    battle(t2, [side('2PP', 'A', DECK_A, 0)], [side('9GG', 'C', DECK_B, 1)]),
  ], '2PP', 16);
  const fromB = shape.shapeBattles([battle(t1, [side('8YY', 'B', DECK_B, 0)], [side('2PP', 'A', DECK_A, 2, tower('Cannoneer'))])], '8YY', 16);
  assert.equal(store.rememberMatchups(fromA, 40), 2);
  assert.equal(store.rememberMatchups(fromB, 7), 0); // schon bekannt …
  const rows = store.getMatchups({ since: now - 24 * 60 * 60 * 1000 });
  assert.equal(rows.length, 2);
  const first = rows.find((r) => r.b.cards.includes('mega-knight') && r.top === 7); // … aber Platz 7 statt 40
  assert.ok(first, 'Platz wurde nicht verbessert');
  assert.equal(first.res, 1);
  assert.equal(first.a.tower, 't:Cannoneer');
  assert.equal(first.b.tower, null);
  assert.deepEqual(first.a.cards, history.matchupRows(fromA)[0].a.cards);
  assert.equal(store.rememberMatchups(fromA, 0), 0); // unbekannter Platz überschreibt nichts
  assert.equal(store.matchupStats().n, 2);
});

test('Matchup-Speicher: Kämpfe älter als 45 Tage fallen beim Aufräumen weg', () => {
  store.close(); // frische Aufräum-Uhr
  const old = Date.now() - 50 * 24 * 60 * 60 * 1000;
  const before = store.matchupStats().n;
  store.rememberMatchups(shape.shapeBattles([battle(stamp(old), [side('2QQ', 'X', DECK_A, 1)], [side('8QQ', 'Y', DECK_B, 0)])], '2QQ', 16), 3);
  assert.equal(store.matchupStats().n, before);
});

test('Meta-Sammler reicht jedes Battlelog mit Platz weiter; ein Fehler dabei hält den Lauf nicht auf', async () => {
  const kv = new Map();
  const mem = { getValue: (k) => (kv.has(k) ? { value: kv.get(k) } : null), setValue: (k, v) => kv.set(k, v) };
  const seen = [];
  const top = [{ tag: '2PP', rank: 1 }, { tag: '8YY', rank: 2 }];
  const crawler = createMetaCrawler({
    store: mem, players: 2, spacingMs: 0, fetchTopPlayers: async () => top,
    fetchBattles: async (tag) => shape.shapeBattles([battle(stamp(Date.now() - 60000), [side(tag, 'A', DECK_A, 1)], [side('9GG', 'B', DECK_B, 0)])], tag, 16),
    onBattles: (battles, place) => { seen.push([battles[0].team[0].tag, place]); if (place === 1) throw new Error('kaputt'); },
    log: { warn: () => {} },
  });
  await crawler.run();
  assert.deepEqual(seen, [['2PP', 1], ['8YY', 2]]);
});

// ── Clan-Schnappschüsse ──────────────────────────────────────────────────────
const RAW_CLAN = {
  tag: '#QQQ', name: 'Clan', type: 'inviteOnly', clanScore: 50000, clanWarTrophies: 3000, requiredTrophies: 8000, donationsPerWeek: 4000, members: 2,
  memberList: [
    { tag: '#2PP', name: 'Ich', role: 'leader', lastSeen: '20261113T180000.000Z', expLevel: 60, trophies: 9000, donations: 120, donationsReceived: 80, clanRank: 1 },
    { tag: '#AAA', name: 'Du', role: 'member', trophies: 7000, clanRank: 2 },
  ],
};
const RAW_RACE = {
  state: 'full', periodType: 'warDay', periodIndex: 4, sectionIndex: 1,
  clan: { tag: '#QQQ', name: 'Clan', fame: 1200, repairPoints: 0, periodPoints: 9000, clanScore: 3000, participants: [
    { tag: '#2PP', name: 'Ich', fame: 800, repairPoints: 0, boatAttacks: 1, decksUsed: 8, decksUsedToday: 4 },
    { tag: '#9QQ', name: 'Weg', fame: 400, decksUsed: 4, decksUsedToday: 0 },
  ] },
  clans: [{ tag: '#QQQ', name: 'Clan', fame: 1200, participants: [{ decksUsed: 8 }, { decksUsed: 4 }] }, { tag: '#8LL', name: 'Andere', fame: 900, participants: [{ decksUsed: 2 }] }],
};

test('Clan-Schnappschuss: packen und entpacken ergibt Mitglieder, Kriegsteilnehmer und Rivalen', () => {
  const packed = history.packClanSnapshot(shape.shapeClan(RAW_CLAN), shape.shapeRiverRace(RAW_RACE));
  const back = history.unpackClanSnapshot(JSON.parse(JSON.stringify(packed)));
  assert.equal(back.v, 1);
  assert.deepEqual(back.clan, { score: 50000, warTrophies: 3000, members: 2, required: 8000, donationsPerWeek: 4000, type: 'inviteOnly' });
  assert.deepEqual(back.members[0], { tag: '2PP', name: 'Ich', role: 'leader', lastSeen: Date.UTC(2026, 10, 13, 18), expLevel: 60, trophies: 9000, donations: 120, received: 80, rank: 1 });
  assert.equal(back.members[1].lastSeen, null);
  assert.deepEqual(back.race.participants.map((p) => [p.tag, p.decksUsed, p.decksToday]), [['2PP', 8, 4], ['9QQ', 4, 0]]);
  assert.deepEqual(back.race.rivals.map((r) => [r.tag, r.fame, r.active]), [['QQQ', 1200, 2], ['8LL', 900, 1]]);
  assert.equal(back.race.periodType, 'warDay');
  // ohne laufenden Krieg bleibt race leer
  assert.equal(history.unpackClanSnapshot(history.packClanSnapshot(shape.shapeClan(RAW_CLAN), null)).race, null);
});

test('Clan-Schnappschüsse: 35 Tage vollständig, danach einer je Tag, nach 400 Tagen weg', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 16, 12);
  const packed = history.packClanSnapshot(shape.shapeClan(RAW_CLAN), null);
  // je Tag drei Schnappschüsse (03, 09, 21 Uhr UTC), für 40 Tage zurück, dazu einer vor 401 Tagen
  for (let d = 0; d < 40; d += 1) {
    for (const h of [3, 9, 21]) store.rememberClanSnapshot('THN', packed, now - d * DAY - 12 * 60 * 60 * 1000 + h * 60 * 60 * 1000);
  }
  store.rememberClanSnapshot('THN', packed, now - 401 * DAY);
  store.thinClanSnapshots(now);
  const snaps = store.getClanSnapshots('THN', { limit: 5000 });
  const cut = now - 35 * DAY;
  const recent = snaps.filter((s) => s.t >= cut);
  const older = snaps.filter((s) => s.t < cut);
  assert.ok(recent.length >= 35 * 3 - 3, `zu wenige neue: ${recent.length}`);
  const days = new Set(older.map((s) => Math.floor(s.t / DAY)));
  assert.equal(days.size, older.length); // höchstens einer je Tag
  assert.ok(older.every((s) => new Date(s.t).getUTCHours() === 21 || s.t >= cut - DAY)); // der letzte des Tages bleibt
  assert.ok(!snaps.some((s) => s.t < now - 400 * DAY));
  assert.equal(snaps[0].members[0].tag, '2PP');
  assert.equal(store.clanSnapshotStats('THN').n, snaps.length);
});

test('Clan-Verfolgung: angesehen → fällig, nach dem Abruf erst wieder nach der Pause; nur die zuletzt angesehenen', () => {
  const H = 60 * 60 * 1000;
  const realNow = Date.now;
  const base = realNow();
  try {
    // nacheinander angesehen (C3Q zuletzt)
    ['C1Q', 'C2Q', 'C3Q'].forEach((tag, i) => { Date.now = () => base - (3 - i) * 1000; store.markClanViewed(tag); });
    Date.now = realNow;
    const due = store.dueClans({ sinceMs: 30 * 24 * H, everyMs: 3 * H, limit: 10, max: 10 });
    assert.deepEqual(due.sort(), ['C1Q', 'C2Q', 'C3Q']);
    store.markClanPolled('C1Q');
    assert.deepEqual(store.dueClans({ sinceMs: 30 * 24 * H, everyMs: 3 * H, limit: 10, max: 10 }).sort(), ['C2Q', 'C3Q']);
    // Obergrenze: nur der zuletzt angesehene Clan wird verfolgt
    assert.deepEqual(store.dueClans({ sinceMs: 30 * 24 * H, everyMs: 3 * H, limit: 10, max: 1 }), ['C3Q']);
    // länger nicht angesehen → fällt aus der Verfolgung
    Date.now = () => base + 31 * 24 * H;
    assert.deepEqual(store.dueClans({ sinceMs: 30 * 24 * H, everyMs: 3 * H, limit: 10, max: 10 }), []);
  } finally {
    Date.now = realNow;
  }
});

// ── Route + Sammler mit API-Attrappe ─────────────────────────────────────────
test('Clan-Seite vormerken, Sammler hält Mitglieder und Krieg fest; unbekannte Clans werden nicht verfolgt', async () => {
  const responses = { '/clans/%23QQQ': RAW_CLAN, '/clans/%23QQQ/currentriverrace': RAW_RACE };
  const api = {
    isConfigured: () => true,
    normalizeTag: crApi.normalizeTag,
    resolvePolRank: async () => null,
    crApiGet: async (p) => responses[p.split('?')[0]] || { notFound: true },
    crApiGetSafe: async (p) => responses[p.split('?')[0]] || null,
  };
  const app = express();
  const router = createScoutRouter({ api, store, meta: false, crawlSpacingMs: 0 });
  app.use('/s', router);
  const server = http.createServer(app);
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/s`;
  try {
    assert.equal((await fetch(`${base}/clan/2YY`)).status, 404);
    assert.equal((await fetch(`${base}/clan/QQQ`)).status, 200);
    assert.equal(await router.pollClans(), 1);
    const [snap] = store.getClanSnapshots('QQQ');
    assert.equal(snap.members.length, 2);
    assert.equal(snap.race.participants[0].decksToday, 4);
    assert.equal(store.clanSnapshotStats('2YY').n, 0);
    assert.equal(await router.pollClans(), 0); // gerade erst festgehalten
  } finally {
    await new Promise((resolve) => { server.close(resolve); });
  }
});
