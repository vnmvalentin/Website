// Abzeichen-Ordnung: Gruppen, Reihenfolge und Namen — an den Namen echter Profile (API-Reihenfolge, 17.11.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeDate, badgeKind, badgeName, groupBadges, prettyBadge } from '../badgeOrder.js';

// Nicht-Meisterschafts-Abzeichen eines echten Profils, so wie die API sie liefert
const PROFILE = [
  'Classic12Wins', 'Grand12Wins', 'Crl20Wins', 'Crl20Wins2019', 'Crl20Wins2021', 'LadderTournamentTop1000', 'LadderTop1000',
  'YearsPlayed', 'BattleWins', 'ClanWarsVeteran', 'Draft', 'ClanWarWins', 'EmoteCollection', 'BannerCollection', 'CollectionLevel',
  'ClanDonations', '2v2', 'GoblinJourney2024', 'ClassicRoyale_2025', 'SeasonalBadge_202507_v2', 'SeasonalBadge_202508',
  'MergeTacticsBadge_202506', 'SeasonalBadge_202509', 'BeatingDeathBadge', 'SeasonalBadge_202510', 'SeasonalBadge_202511',
  'Royals2v2_2024', 'MegaDraftLeagueBadge', 'TouchdownLeagueBadge', '2025YearBadge', '2026YearBadge', 'CrazyArenaBadge1',
  'ChaosDraftLeagueCompletion', 'RoyalTournamentCompletion', 'RoyalTournamentRank_v2', 'ChaosDraftLeagueRank',
  '2v2LeagueCompletion', 'SpookyChessTrailCompletion', 'SpookyChessTrailRank', 'Crl20Wins2026',
].map((name) => ({ name }));

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const month = (y, m) => `${MONTHS[m - 1]} ${y}`;
const T = { badgeNames: { LadderTop1000: 'Top 1000' }, yearBadge: (y) => `Jahr ${y}`, seasonBadge: (m) => `Saison ${m}` };
const label = (n) => badgeName(n, T, month);
const grouped = () => Object.fromEntries(groupBadges(PROFILE, label).map((g) => [g.group, g.list.map((b) => b.name)]));

test('jedes Abzeichen landet in genau einer Gruppe, keins geht verloren', () => {
  const groups = groupBadges(PROFILE, label);
  assert.equal(groups.reduce((s, g) => s + g.list.length, 0), PROFILE.length);
  assert.deepEqual(groups.map((g) => g.group), ['ranks', 'crl', 'events', 'career', 'seasons']);
});

test('CRL 2026 steht bei den anderen CRL-Abzeichen, neueste zuerst, das erste CRL (ohne Jahr) zuletzt', () => {
  assert.deepEqual(grouped().crl, ['Crl20Wins2026', 'Crl20Wins2021', 'Crl20Wins2019', 'Crl20Wins']);
  const crl = groupBadges(['CrlSpectator2024', 'Crl20Wins2024', 'CrlFinalist2025', 'Crl20Wins2025', 'CrlSpectator2026'].map((name) => ({ name })), label)[0];
  assert.deepEqual(crl.list.map((b) => b.name), ['Crl20Wins2025', 'Crl20Wins2024', 'CrlFinalist2025', 'CrlSpectator2026', 'CrlSpectator2024']);
});

test('Ranglisten: Top 1000 vorn, dann die Rang-Abzeichen der Events', () => {
  assert.deepEqual(grouped().ranks, ['LadderTop1000', 'LadderTournamentTop1000', 'ChaosDraftLeagueRank', 'RoyalTournamentRank_v2', 'SpookyChessTrailRank']);
});

test('Saisons und Jahre chronologisch, neueste zuerst (Jahresabzeichen zählt als Jahresende)', () => {
  assert.deepEqual(grouped().seasons, [
    '2026YearBadge', '2025YearBadge', 'SeasonalBadge_202511', 'SeasonalBadge_202510', 'SeasonalBadge_202509', 'SeasonalBadge_202508',
    'SeasonalBadge_202507_v2',
  ]);
});

test('Laufbahn in fester Reihenfolge', () => {
  assert.deepEqual(grouped().career, ['YearsPlayed', 'BattleWins', 'CollectionLevel', 'EmoteCollection', 'BannerCollection', 'ClanDonations', 'ClanWarWins', 'ClanWarsVeteran', '2v2', 'Draft']);
});

test('Events: Challenges vorn, dann nach Datum', () => {
  const ev = grouped().events;
  assert.deepEqual(ev.slice(0, 2), ['Grand12Wins', 'Classic12Wins']);
  assert.ok(ev.indexOf('ClassicRoyale_2025') < ev.indexOf('MergeTacticsBadge_202506'));
  assert.ok(ev.indexOf('MergeTacticsBadge_202506') < ev.indexOf('GoblinJourney2024'));
});

test('Art der Zahl unter dem Abzeichen', () => {
  assert.equal(badgeKind('ChaosDraftLeagueRank'), 'placed');
  assert.equal(badgeKind('RoyalTournamentRank_v2'), 'placed');
  assert.equal(badgeKind('LadderTournamentTop1000'), 'placed');
  assert.equal(badgeKind('ChaosDraftLeagueCompletion'), 'done');
  assert.equal(badgeKind('Crl20Wins2026'), 'crl');
  assert.equal(badgeKind('CrlSpectator2026'), null);
  assert.equal(badgeKind('YearsPlayed'), null);
});

test('lesbare Namen', () => {
  assert.equal(label('ChaosDraftLeagueRank'), 'Chaos Draft League');
  assert.equal(label('SpookyChessTrailRank'), 'Spooky Chess');
  assert.equal(label('2v2LeagueCompletion'), '2v2 League');
  assert.equal(label('ClassicRoyaleTournamentRank_v2'), 'Classic Royale Tournament');
  assert.equal(label('SeasonalBadge_202507_v2'), 'Saison Juli 2025');
  assert.equal(label('2026YearBadge'), 'Jahr 2026');
  assert.equal(label('Crl20Wins2026'), 'CRL 20 Wins 2026');
  assert.equal(label('LadderTop1000'), 'Top 1000');
  assert.equal(prettyBadge('MergeTacticsBadge_202506', month), 'Merge Tactics Juni 2025');
  assert.equal(prettyBadge('Royals2v2_2024', month), 'Royals 2v2 2024');
  assert.equal(prettyBadge('GoblinJourney2024', month), 'Goblin Journey 2024');
  assert.equal(prettyBadge('CrazyArenaBadge1', month), 'Crazy Arena 1');
  assert.equal(prettyBadge('CrlSpectator2026', month), 'CRL Spectator 2026');
  assert.equal(prettyBadge('BeatingDeathBadge', month), 'Beating Death');
  assert.equal(prettyBadge('Chaos_S2', month), 'Chaos S2');
});

test('Datum im Namen', () => {
  assert.equal(badgeDate('SeasonalBadge_202507_v2'), 202507);
  assert.equal(badgeDate('Crl20Wins2026'), 202613);
  assert.equal(badgeDate('Crl20Wins'), 0);
  assert.equal(badgeDate('LadderTop1000'), 0);
  assert.equal(badgeDate('2v2LeagueRank'), 0);
});
