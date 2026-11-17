// Tests der Stats-Seiten: Aufbereitung der API-Antworten, Meta-Zählung, Namens-Index und Routen.
// Kein Netz und keine echte Datenbank: die API ist eine Attrappe, der Speicher liegt im Temp-Ordner.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-scout-test-'));
process.env.CR_SCOUT_DB = path.join(tmpDir, 'scout.db');

const express = require('express');
const shape = require('../scoutShape');
const store = require('../scoutStore');
const { createAccumulator, createMetaCrawler, deckKey } = require('../scoutMeta');
const { createScoutRouter } = require('../scoutRoutes');
const { createCrownAccumulator } = require('../scoutCrown');
const crApi = require('../../lib/crApi');

test.after(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Bausteine für Rohdaten im Format der offiziellen API ─────────────────────
const MAX = { common: 16, rare: 14, epic: 11, legendary: 8, champion: 6 };
const card = (name, rarity, level, extra = {}) => ({
  name, id: 26000000, level, maxLevel: MAX[rarity], rarity, elixirCost: 3,
  iconUrls: { medium: `https://example.invalid/${name}.png` }, ...extra,
});
const DECK_A = [
  card('Knight', 'common', 14, { evolutionLevel: 1, iconUrls: { medium: 'm', evolutionMedium: 'e' } }),
  card('Archers', 'common', 14), card('Fireball', 'rare', 12), card('Musketeer', 'rare', 12),
  card('Skeletons', 'common', 15), card('Ice Spirit', 'common', 14), card('The Log', 'legendary', 6), card('Hog Rider', 'rare', 12),
];
const DECK_B = [
  card('Mega Knight', 'legendary', 8), card('Bats', 'common', 16), card('Zap', 'common', 16), card('Miner', 'legendary', 8),
  card('Wall Breakers', 'epic', 11), card('Inferno Dragon', 'legendary', 8), card('Goblin Gang', 'common', 16), card('Arrows', 'common', 16),
];
const side = (tag, name, cards, crowns, extra = {}) => ({ tag: `#${tag}`, name, crowns, cards, ...extra });
const battle = (time, team, opponent, extra = {}) => ({
  type: 'pathOfLegend', battleTime: time, gameMode: { id: 1, name: 'Ranked1v1_NewArena' }, arena: { name: 'League 7' }, team, opponent, ...extra,
});

test('Anzeige-Level: Level je Seltenheit wird auf das Höchstlevel der gewöhnlichen Karten bezogen', () => {
  const cap = shape.levelCap([...DECK_A, ...DECK_B]);
  assert.equal(cap, 16);
  assert.equal(shape.shapeCard(card('The Log', 'legendary', 6), cap).lvl, 14);
  assert.equal(shape.shapeCard(card('Fireball', 'rare', 12), cap).lvl, 14);
  assert.equal(shape.shapeCard(card('Knight', 'common', 14), cap).lvl, 14);
  // ohne bekanntes Höchstlevel bleibt der Rohwert stehen statt eine Zahl zu erfinden
  assert.equal(shape.shapeCard(card('The Log', 'legendary', 6), null).lvl, 6);
});

test('Karten: bekannte bekommen unsere ID, unbekannte behalten Namen und Bild', () => {
  const known = shape.shapeCard(card('Mini P.E.K.K.A', 'rare', 10), 16);
  assert.equal(known.id, 'mini-pekka');
  assert.equal(known.icon, undefined);
  const unknown = shape.shapeCard(card('Brand New Card 2099', 'epic', 5), 16);
  assert.equal(unknown.id, null);
  assert.equal(unknown.icon, 'https://example.invalid/Brand New Card 2099.png');
  assert.equal(unknown.rarity, 'Epic');
});

test('Aktive Form im Deck: evolutionLevel 1 = Evolution, 2 = Held; ohne Angabe die Grundkarte', () => {
  const both = { medium: 'm', evolutionMedium: 'e', heroMedium: 'h' };
  assert.equal(shape.shapeCard(card('Knight', 'common', 14, { evolutionLevel: 1, iconUrls: both }), 16, true).variant, 'ev1');
  assert.equal(shape.shapeCard(card('Knight', 'common', 14, { evolutionLevel: 2, iconUrls: both }), 16, true).variant, 'hero');
  // Karte hat eine Heldenform, steht aber normal im Deck (echter Fall: Barbarian Barrel)
  assert.equal(shape.shapeCard(card('Barbarian Barrel', 'epic', 11, { iconUrls: { medium: 'm', heroMedium: 'h' } }), 16, true).variant, undefined);
  // außerhalb eines Decks (Sammlung) gibt es keine aktive Form
  assert.equal(shape.shapeCard(card('Knight', 'common', 14, { evolutionLevel: 1, iconUrls: both }), 16).variant, undefined);
});

test('Sammlung: Sonderformen als Bitfeld (1 = Evolution, 2 = Held)', () => {
  const p = shape.shapePlayer({ tag: '#2PP', name: 'Ich', cards: [
    card('Wizard', 'rare', 14, { evolutionLevel: 3, maxEvolutionLevel: 3 }),
    card('Knight', 'common', 16, { evolutionLevel: 1, maxEvolutionLevel: 3 }),
    card('Mirror', 'epic', 11, { maxEvolutionLevel: 1 }),
    card('Zap', 'common', 16),
  ] });
  const forms = Object.fromEntries(p.cards.map((c) => [c.id, c.forms]));
  assert.deepEqual(forms.wizard, [{ id: 'ev1', owned: true }, { id: 'hero', owned: true }]);
  assert.deepEqual(forms.knight, [{ id: 'ev1', owned: true }, { id: 'hero', owned: false }]);
  assert.deepEqual(forms.mirror, [{ id: 'ev1', owned: false }]);
  assert.equal(forms.zap, undefined);
});

test('Ranked-Decks aus einem Battlelog: Spieler und Gegner, je Tag das neueste', () => {
  const log = shape.shapeBattles([
    battle('20261113T180000.000Z', [side('2PP', 'Ich', DECK_A, 2)], [side('8YY', 'B', DECK_B, 1)]),
    battle('20261113T200000.000Z', [side('2PP', 'Ich', DECK_B, 2)], [side('9GG', 'C', DECK_A, 1)]),
    battle('20261113T210000.000Z', [side('2PP', 'Ich', DECK_A, 2)], [side('8YY', 'B', DECK_A, 1)], { type: 'PvP', gameMode: { name: 'Ladder' } }),
  ], '2PP', 16);
  const decks = Object.fromEntries(shape.rankedDecks(log).map((d) => [d.tag, d.cards[0].id]));
  assert.deepEqual(decks, { '2PP': 'mega-knight', '8YY': 'mega-knight', '9GG': 'knight' }); // der Ladder-Kampf zählt nicht
});

test('Battlelog: Ranked-Kämpfe tragen die Liga der API, andere Modi nicht', () => {
  const log = shape.shapeBattles([
    battle('20261113T180000.000Z', [side('2PP', 'Ich', DECK_A, 2)], [side('8YY', 'B', DECK_B, 1)], { leagueNumber: 4 }),
    battle('20261113T170000.000Z', [side('2PP', 'Ich', DECK_A, 2)], [side('8YY', 'B', DECK_B, 1)]),
    battle('20261113T160000.000Z', [side('2PP', 'Ich', DECK_A, 2)], [side('8YY', 'B', DECK_A, 1)], { type: 'PvP', gameMode: { name: 'Ladder' }, leagueNumber: 4 }),
  ], '2PP', 16);
  assert.deepEqual(log.map((b) => [b.group, b.league ?? null]), [['ranked', 4], ['ranked', null], ['ladder', null]]);
});

test('Battlelog: 2v2-Liga nur an der Arena-Kennung erkannt, gewöhnliches 2v2 nicht', () => {
  const two = (time, arena) => battle(time,
    [side('2PP', 'Ich', DECK_A, 2), side('3QQ', 'Partner', DECK_B, 2)], [side('8YY', 'B', DECK_B, 1), side('9GG', 'C', DECK_A, 1)],
    { type: 'trail', gameMode: { name: 'TeamVsTeam' }, arena });
  const log = shape.shapeBattles([
    two('20261116T180000.000Z', { name: 'Legendary Arena', rawName: 'Arena_L' }),
    two('20260920T180000.000Z', { name: 'Competitive', rawName: '2v2League_202609Arena2' }),
  ], '2PP', 16);
  assert.deepEqual(log.map((b) => [b.group, b.league2v2 ?? false]), [['2v2', false], ['2v2', true]]);
});

test('Battlelog: Challenges über den Event-Titel erkannt, Siege vorher aus startingTrophies (fehlt bei 0)', () => {
  // So kommen Classic/Grand/20 Win aus der API (geprüft 16.11.2026): Kampftyp trail, ein gemeinsamer Modus
  const ch = (time, eventTag, start, extra = {}) => battle(time,
    [side('2PP', 'Ich', DECK_A, 1, start === null ? {} : { startingTrophies: start })], [side('8YY', 'B', DECK_B, 0)],
    { type: 'trail', gameMode: { name: 'Challenge_AllCards_EventDeck_NoSet' }, eventTag, ...extra });
  const events = [{ eventTag: '#GRAND', title: 'Grand Challenge' }, { eventTag: '#CLASSIC', title: 'Classic Challenge' }];
  const log = shape.shapeBattles([
    ch('20261116T180000.000Z', '#GRAND', 5),
    ch('20261116T170000.000Z', '#CLASSIC', null),
    ch('20261116T160000.000Z', '#WEG', 3), // Event nicht (mehr) bekannt
  ], '2PP', 16, events);
  assert.deepEqual(log.map((b) => [b.event ?? null, b.challenge ?? null, b.challengeWins]),
    [['Grand Challenge', 'grand', 5], ['Classic Challenge', 'classic', 0], [null, null, null]]);
  // ohne Event-Liste (ältere Aufrufer) bleibt alles wie bisher
  const [plain] = shape.shapeBattles([ch('20261116T180000.000Z', '#GRAND', 5)], '2PP', 16);
  assert.deepEqual([plain.event, plain.challenge, plain.challengeWins], [undefined, undefined, null]);
});

test('Modus-Index: offizielle Namen DE/EN, Hand-Einträge, Gruppen-Modi ohne Namen', () => {
  const { modeInfo } = require('../../lib/gameModes');
  assert.deepEqual(modeInfo('Overtime_Friendly'), { en: 'Sudden Death Battle', de: 'Kronen-K.o.-Kampf', icon: 'suddendeath' });
  assert.equal(modeInfo('Draft_Competitive').icon, 'triple_draft');
  assert.equal(modeInfo('Chaos_1v1_MegaDraft_S3').en, 'Mega Draft');
  assert.equal(modeInfo('Challenge_AllCards_EventDeck_NoSet').icon, 'challenge');
  assert.equal(modeInfo('202610_Event_Spooky_Chess').en, 'Spooky Chess'); // unbekannt: lesbarer Rohname
  for (const plain of ['Ranked1v1_NewArena2', 'Ladder', 'Friendly', 'Tournament', 'TeamVsTeam', 'Competitive_Multideck', '']) {
    assert.equal(modeInfo(plain), null, plain);
  }
  const [named, ranked] = shape.nameModes([{ mode: 'MirrorDeck_Friendly' }, { mode: 'Ranked1v1_NewArena2' }]);
  assert.deepEqual([named.modeName, named.modeIcon], [{ en: 'Mirror Battle', de: 'Spiegelkampf' }, 'mirror']);
  assert.equal(ranked.modeName, undefined);
});

test('Battlelog: der abgefragte Spieler steht vorn, auch wenn die API ihn im 2v2 an zweiter Stelle liefert', () => {
  const raw = [battle('20261113T180000.000Z',
    [side('AAA', 'Partner', DECK_B, 1), side('2PP', 'Ich', DECK_A, 1, { trophyChange: 30 })],
    [side('BBB', 'Gegner 1', DECK_B, 0), side('CCC', 'Gegner 2', DECK_A, 0)],
    { type: 'casual2v2', gameMode: { name: 'TeamVsTeam' } })];
  const [b] = shape.shapeBattles(raw, '2PP', 16);
  assert.equal(b.team[0].name, 'Ich');
  assert.equal(b.group, '2v2');
  assert.equal(b.result, 'win');
  assert.equal(b.team[0].cards[0].variant, 'ev1');
  assert.equal(b.team[0].avgLevel, 14.13);
});

test('Battlelog: im Duell entscheidet die Zahl gewonnener Runden, gezeigt wird das Deck der letzten Runde', () => {
  const round = (crowns, cards) => ({ crowns, cards });
  const raw = [battle('20261113T190000.000Z',
    [side('2PP', 'Ich', [...DECK_A, ...DECK_B], 2, { rounds: [round(0, DECK_A), round(1, DECK_B), round(1, DECK_B)] })],
    [side('BBB', 'Gegner', [...DECK_B, ...DECK_A], 3, { rounds: [round(3, DECK_B), round(0, DECK_A), round(0, DECK_A)] })],
    { type: 'riverRaceDuel', gameMode: { name: 'CW_Duel_1v1' } })];
  const [b] = shape.shapeBattles(raw, '2PP', 16);
  assert.equal(b.result, 'win'); // 2:3 Kronen, aber 2 von 3 Runden
  assert.equal(b.group, 'war');
  assert.equal(b.rounds.length, 3);
  assert.equal(b.team[0].cards.length, 8);
  assert.equal(b.team[0].cards[0].id, 'mega-knight');
});

test('Kampfgruppen', () => {
  assert.equal(shape.modeGroup('pathOfLegend', 'Ranked1v1_NewArena', 1, false), 'ranked');
  assert.equal(shape.modeGroup('PvP', 'Ranked1v1_NewArena', 1, false), 'ladder');
  assert.equal(shape.modeGroup('challenge', 'Challenge_AllCards', 1, false), 'challenge');
  assert.equal(shape.modeGroup('clanMate', 'Friendly', 1, false), 'friendly');
  assert.equal(shape.modeGroup('tournament', 'Tournament', 1, true), 'tournament');
  assert.equal(shape.modeGroup('seasonalBattle', 'SevenXElixir', 1, false), 'party');
  assert.equal(shape.modeGroup('unknown', 'Competitive_Multideck', 1, false), 'crown');
});

test('Profil: fehlende Blöcke werden zu null statt zu werfen', () => {
  const p = shape.shapePlayer({ tag: '#2PP', name: 'Ich', trophies: 9000, cards: DECK_A, currentDeck: DECK_A });
  assert.equal(p.clan, null);
  assert.equal(p.ranked.current, null);
  assert.equal(p.deck.length, 8);
  assert.equal(p.cap, 16);
  assert.equal(p.cards.find((c) => c.id === 'skeletons').lvl, 15);
  assert.equal(p.deck[0].variant, 'ev1');
  assert.equal(p.streak, 0);
});

test('Profil: Ranked-Stand, Platzierung vom Aufrufer und Saison-Fortschritt', () => {
  const p = shape.shapePlayer({
    tag: '#2PP', name: 'Ich', cards: DECK_B, clan: { tag: '#QQQ', name: 'Clan', badgeId: 16000000 },
    currentPathOfLegendSeasonResult: { leagueNumber: 7, trophies: 1820, rank: 8931 },
    progress: {
      '': { arena: { rawName: 'x' }, trophies: 60 },
      'AutoChess_2026_Season_11': { arena: { rawName: 'AutoChessArena1', name: 'Bronze I' }, trophies: 0, bestTrophies: 0 },
      '2v2League_202611': { arena: { rawName: '2v2League_202611Arena2', name: '2v2' }, trophies: 300, bestTrophies: 340 },
    },
    currentWinLoseStreak: -3, kingTowerLevel: 15,
  }, { currentRank: 512 });
  assert.deepEqual([p.streak, p.kingTowerLevel, p.seasonal[0].kind], [-3, 15, '2v2']); // unberührte Modi und der Katalog-Rest fehlen
  assert.deepEqual(p.ranked.current, { league: 7, medals: 1820, rank: 512 });
  assert.equal(p.clan.tag, 'QQQ');
  assert.equal(p.seasonal.length, 1);
  assert.equal(p.seasonal[0].best, 340);
  assert.equal(p.cards[0].maxed, true);
});

test('Clan und Kriegsverlauf', () => {
  const clan = shape.shapeClan({ tag: '#QQQ', name: 'Clan', members: 2, memberList: [
    { tag: '#2PP', name: 'Ich', role: 'leader', lastSeen: '20261113T180000.000Z', trophies: 9000, donations: 120, clanRank: 1 },
    { tag: '#AAA', name: 'Du', role: 'member', trophies: 7000, clanRank: 2 },
  ] });
  assert.equal(clan.members.length, 2);
  assert.equal(clan.members[0].lastSeen, Date.UTC(2026, 10, 13, 18));
  assert.equal(clan.members[1].lastSeen, null);
  const log = shape.shapeWarLog({ items: [{ seasonId: 120, sectionIndex: 2, createdDate: '20261110T100000.000Z', standings: [
    { rank: 1, trophyChange: 100, clan: { tag: '#ZZZ', name: 'Andere', fame: 10000 } },
    { rank: 2, trophyChange: 50, clan: { tag: '#QQQ', name: 'Clan', fame: 9000, participants: [{ tag: '#2PP', name: 'Ich', fame: 900, decksUsed: 16 }] } },
  ] }] }, 'QQQ');
  assert.equal(log[0].week, 3);
  assert.equal(log[0].own.rank, 2);
  assert.equal(log[0].own.participants[0].decksUsed, 16);
  assert.equal(shape.shapeRiverRace(null), null);
});

test('Meta: derselbe Kampf aus zwei Battlelogs zählt einmal, beide Decks werden gewertet', () => {
  const now = Date.UTC(2026, 10, 14);
  const time = '20261113T180000.000Z';
  const logA = shape.shapeBattles([battle(time, [side('2PP', 'A', DECK_A, 2)], [side('8YY', 'B', DECK_B, 1)])], '2PP', 16);
  const logB = shape.shapeBattles([battle(time, [side('8YY', 'B', DECK_B, 1)], [side('2PP', 'A', DECK_A, 2)])], '8YY', 16);
  const old = shape.shapeBattles([battle('20261001T180000.000Z', [side('2PP', 'A', DECK_A, 2)], [side('8YY', 'B', DECK_B, 1)])], '2PP', 16);
  const acc = createAccumulator({ now });
  acc.add(logA); acc.add(logB); acc.add(old);
  const meta = acc.result({ players: 2 });
  assert.equal(meta.battles, 1);
  const knight = meta.cards.find((c) => c.id === 'knight');
  assert.deepEqual([knight.uses, knight.usage, knight.winRate, knight.special], [1, 0.5, 1, 1]);
  assert.equal(meta.cards.find((c) => c.id === 'mega-knight').winRate, 0);
  assert.equal(meta.decks.length, 0); // ein Deck braucht mindestens zwei Einsätze
  acc.add(shape.shapeBattles([battle('20261113T190000.000Z', [side('2PP', 'A', DECK_A, 0)], [side('9GG', 'C', DECK_B, 1)])], '2PP', 16));
  const meta2 = acc.result({ players: 3 });
  assert.equal(meta2.decks.length, 2);
  const deckA = meta2.decks.find((d) => d.cards.some((c) => c.id === 'hog-rider'));
  assert.deepEqual([deckA.uses, deckA.winRate, deckA.players], [2, 0.5, 1]);
  assert.equal(deckA.key, deckKey(shape.shapeBattles([battle(time, [side('2PP', 'A', DECK_A, 2)], [side('8YY', 'B', DECK_B, 1)])], '2PP', 16)[0].team[0].cards));
});

test('Meta: Bilanz eines Decks gegen Gegner-Decks und -Karten, Spieler nach Platz', () => {
  const now = Date.UTC(2026, 10, 14);
  const acc = createAccumulator({ now });
  // Deck A spielt sechsmal gegen Deck B: vier Siege, zwei Niederlagen — gespielt von zwei Spielern
  for (let i = 0; i < 6; i += 1) {
    const me = i < 3 ? '2PP' : '9GG';
    const won = i < 4;
    acc.add(shape.shapeBattles([battle(`20261113T18${String(i).padStart(2, '0')}00.000Z`, [side(me, 'A', DECK_A, won ? 2 : 0)], [side('8YY', 'B', DECK_B, 1)])], me, 16));
  }
  const meta = acc.result({ players: 2 });
  const a = meta.decks.find((d) => d.cards.some((c) => c.id === 'hog-rider'));
  const b = meta.decks.find((d) => d.cards.some((c) => c.id === 'mega-knight'));
  const details = acc.details({ rankOf: (tag) => ({ '9GG': 1, '2PP': 5 }[tag]) });
  assert.deepEqual(details[a.key].vsDecks.map((v) => [v.key, v.n, v.wins]), [[b.key, 6, 4]]);
  assert.equal(details[a.key].vsDecks[0].cards.length, 8);
  assert.deepEqual(details[b.key].vsDecks.map((v) => [v.n, v.wins]), [[6, 2]]);
  assert.deepEqual(details[a.key].players, ['9GG', '2PP']); // besser Platzierte zuerst
  assert.deepEqual(details[a.key].ranks, { '9GG': 1, '2PP': 5 }); // Platz je Spieler für „Gespielt von“
  // Gegen jede Karte von Deck B steht dieselbe Bilanz wie insgesamt → weder „schwer" noch „leicht"
  assert.deepEqual([details[a.key].hard, details[a.key].easy], [[], []]);
});

test('Kartenkatalog: Formen nach dem Bitfeld, unbekannte Karten behalten Namen und Bild, Turmtruppen getrennt', () => {
  const cat = shape.shapeCatalog({
    items: [
      { name: 'Knight', rarity: 'common', elixirCost: 3, maxEvolutionLevel: 3, iconUrls: { medium: 'm', evolutionMedium: 'e', heroMedium: 'h' } },
      { name: 'Bowler', rarity: 'epic', elixirCost: 5, maxEvolutionLevel: 2, iconUrls: { medium: 'm', evolutionMedium: 'alt', heroMedium: 'h' } },
      { name: 'Brandneu', rarity: 'legendary', elixirCost: 4, iconUrls: { medium: 'neu' } },
      { rarity: 'common' },
    ],
    supportItems: [{ name: 'Tower Princess', rarity: 'common', iconUrls: { medium: 't' } }],
  });
  assert.deepEqual(cat.cards.map((c) => [c.id, !!c.ev1, !!c.hero]), [['knight', true, true], ['bowler', false, true], [null, false, false]]);
  assert.deepEqual(cat.cards[2], { id: null, name: 'Brandneu', rarity: 'Legendary', elixir: 4, icon: 'neu' });
  assert.deepEqual(cat.towers, [{ id: null, name: 'Tower Princess', rarity: 'Common', elixir: null, icon: 't' }]);
  assert.deepEqual(shape.shapeCatalog(null), { cards: [], towers: [] });
});

test('Namens-Index: findet Teile des Namens ohne Akzente, exakte Treffer zuerst', () => {
  store.rememberPlayers([
    { tag: 'AAA', name: 'Élodie', trophies: 5000, clan: 'Les Bleus' },
    { tag: 'BBB', name: 'elodie99', trophies: 9000 },
    { tag: 'CCC', name: '100%_Max', trophies: 100 },
  ]);
  const hits = store.searchPlayers('elodie');
  assert.deepEqual(hits.map((h) => h.tag), ['AAA', 'BBB']);
  assert.equal(store.searchPlayers('100%').length, 1); // % ist kein Platzhalter
  assert.equal(store.searchPlayers('e').length, 0);
  // ein Kampf (ohne Trophäen, ohne Clan-Angabe) überschreibt die besseren Angaben nicht
  store.rememberPlayers([{ tag: 'AAA', name: 'Élodie' }]);
  assert.deepEqual(store.searchPlayers('Élodie')[0], { tag: 'AAA', name: 'Élodie', trophies: 5000, clan: 'Les Bleus' });
});

test('Namens-Index: mehrere Wörter einzeln, auch wenn der Name sie mit Zeichen statt Leerzeichen trennt', () => {
  store.rememberPlayers([
    { tag: 'RGQ', name: 'Alex❤️Luisa', trophies: 14000, clan: 'Anti-Rehwald' },
    { tag: 'TEF', name: 'TEF丨Dinosaur✨弥雾', trophies: 14000 },
    { tag: 'ALX', name: 'Alex', trophies: 15000 },
  ]);
  assert.deepEqual(store.searchPlayers('Alex Luisa').map((h) => h.tag), ['RGQ']);
  assert.deepEqual(store.searchPlayers('luisa alex').map((h) => h.tag), ['RGQ']);
  assert.deepEqual(store.searchPlayers('Alex❤️Luisa').map((h) => h.tag), ['RGQ']); // so geschrieben wie im Spiel
  assert.deepEqual(store.searchPlayers('tef dinosaur').map((h) => h.tag), ['TEF']);
  assert.equal(store.searchPlayers('Alex Paul').length, 0);
});

// ── Routen mit API-Attrappe ──────────────────────────────────────────────────
function fakeApi(responses) {
  const calls = [];
  return {
    calls,
    isConfigured: () => true,
    normalizeTag: crApi.normalizeTag,
    resolvePolRank: async () => 77,
    crApiGet: async (p) => {
      calls.push(p);
      const hit = responses[p.split('?')[0]];
      if (hit instanceof Error) throw hit;
      return hit === undefined ? { notFound: true } : hit;
    },
    crApiGetSafe: async () => null,
  };
}

async function withServer(api, fn, opts = {}) {
  const app = express();
  const router = createScoutRouter({ api, store, meta: false, crawlSpacingMs: 0, ...opts });
  app.use('/s', router);
  const server = http.createServer(app);
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/s`;
  try {
    await fn(async (p, init) => {
      const res = await fetch(base + p, init);
      return { status: res.status, body: await res.json() };
    }, router);
  } finally {
    await new Promise((resolve) => { server.close(resolve); });
  }
}

test('Route Spieler: Profil + Kämpfe, zweiter Aufruf kommt aus dem Zwischenspeicher', async () => {
  const api = fakeApi({
    '/players/%232PP': { tag: '#2PP', name: 'Ich', trophies: 9000, cards: DECK_A, currentDeck: DECK_A, currentPathOfLegendSeasonResult: { leagueNumber: 7, trophies: 1800, rank: 9000 } },
    '/players/%232PP/battlelog': [battle('20261113T180000.000Z', [side('2PP', 'Ich', DECK_A, 2)], [side('8YY', 'Suchmich', DECK_B, 1)])],
  });
  await withServer(api, async (get) => {
    const [a, b] = await Promise.all([get('/player/2pp'), get('/player/%232PP')]);
    assert.equal(a.status, 200);
    assert.equal(a.body.profile.name, 'Ich');
    assert.equal(a.body.profile.ranked.current.rank, 77);
    assert.equal(a.body.battles.length, 1);
    assert.equal(b.body.profile.tag, '2PP');
    assert.equal(api.calls.length, 2); // ein Profil- und ein Battlelog-Abruf für beide Anfragen
    // der Gegner aus dem Kampf ist jetzt über seinen Namen auffindbar
    const s = await get('/search?q=suchm&clans=0');
    assert.equal(s.body.players[0].tag, '8YY');
  });
});

test('Route Spieler: Event-Titel aus /events landen am Kampf und bleiben gemerkt, Kämpfe tragen den Modusnamen', async () => {
  const grand = battle('20261116T180000.000Z', [side('YVC', 'Ich', DECK_A, 1, { startingTrophies: 4 })], [side('8YY', 'B', DECK_B, 0)],
    { type: 'trail', gameMode: { name: 'Challenge_AllCards_EventDeck_NoSet' }, eventTag: '#2PRCRPQL' });
  const mirror = battle('20261116T170000.000Z', [side('YVC', 'Ich', DECK_A, 1)], [side('8YY', 'B', DECK_B, 0)],
    { type: 'friendly', gameMode: { name: 'MirrorDeck_Friendly' } });
  const api = fakeApi({
    '/players/%23YVC': { tag: '#YVC', name: 'Ich', trophies: 9000, cards: DECK_A },
    '/players/%23YVC/battlelog': [grand, mirror],
  });
  let eventCalls = 0;
  api.fetchEvents = async () => { eventCalls += 1; return [{ eventTag: '#2PRCRPQL', title: 'Grand Challenge' }]; };
  await withServer(api, async (get) => {
    const { body } = await get('/player/YVC');
    const [g, m] = body.battles;
    assert.deepEqual([g.event, g.challenge, g.challengeWins, g.modeName.en], ['Grand Challenge', 'grand', 4, 'Challenge']);
    assert.deepEqual([m.modeName.de, m.modeIcon, m.event], ['Spiegelkampf', 'mirror', undefined]);
    assert.equal(eventCalls, 1);
  });
  assert.equal(store.getValue('eventTitles').value['#2PRCRPQL'].title, 'Grand Challenge');
  // Ein neu gestarteter Server ohne laufendes Event kennt den Titel noch
  api.fetchEvents = async () => [];
  await withServer(api, async (get) => {
    const { body } = await get('/player/YVC');
    assert.equal(body.battles[0].event, 'Grand Challenge');
  });
});

test('Route Spieler: ungültiger Tag, unbekannter Spieler, gestörte API', async () => {
  const api = fakeApi({ '/players/%238YY': new Error('Royale API HTTP 403'), '/players/%239GG': new Error('Royale API HTTP 429') });
  await withServer(api, async (get) => {
    assert.deepEqual(await get('/player/xyz!'), { status: 400, body: { ok: false, key: 'invalidTag' } });
    assert.deepEqual(await get('/player/2QQ'), { status: 404, body: { ok: false, key: 'notFound' } });
    assert.deepEqual(await get('/player/8YY'), { status: 502, body: { ok: false, key: 'apiDown' } });
    assert.deepEqual(await get('/player/9GG'), { status: 502, body: { ok: false, key: 'busy' } });
  });
});

test('Route Profil bleibt sichtbar, wenn nur das Battlelog ausfällt', async () => {
  const api = fakeApi({
    '/players/%238QQ': { tag: '#8QQ', name: 'Ich', cards: DECK_A },
    '/players/%238QQ/battlelog': new Error('Royale API HTTP 500'),
  });
  await withServer(api, async (get) => {
    const r = await get('/player/8QQ');
    assert.equal(r.status, 200);
    assert.equal(r.body.battlesAvailable, false);
    assert.deepEqual(r.body.battles, []);
  });
});

test('Route Rangliste und Clan', async () => {
  const api = fakeApi({
    '/locations/global/pathoflegend/players': { items: [{ tag: '#2PP', name: 'Ich', rank: 1, eloRating: 2400, clan: { tag: '#QQQ', name: 'Clan', badgeId: 1 } }] },
    '/clans/%23QQQ': { tag: '#QQQ', name: 'Clan', memberList: [{ tag: '#2PP', name: 'Ich', role: 'leader', trophies: 9000 }] },
    '/clans/%23QQQ/currentriverrace': { state: 'full', periodType: 'warDay', clan: { tag: '#QQQ', name: 'Clan', fame: 500, participants: [{ tag: '#2PP', name: 'Ich', fame: 500, decksUsed: 4, decksUsedToday: 4 }] }, clans: [{ tag: '#QQQ', name: 'Clan', fame: 500, participants: [{ decksUsed: 4 }, { decksUsed: 0 }] }] },
  });
  await withServer(api, async (get) => {
    const r = await get('/ranking/players?loc=kaputt');
    assert.equal(r.body.location, 'global');
    assert.equal(r.body.items[0].score, 2400);
    assert.equal((await get('/ranking/unsinn')).status, 404);
    const c = await get('/clan/QQQ');
    assert.equal(c.body.clan.members[0].role, 'leader');
    const w = await get('/clan/QQQ/war');
    assert.equal(w.body.race.clan.participants[0].decksToday, 4);
    assert.equal(w.body.race.clans[0].active, 1);
    assert.deepEqual(w.body.log, []); // Kriegsverlauf fehlt (404) → leer statt Fehler
  });
});

test('Rangliste mit Decks: Bekanntes hängt an, Unbekanntes wird nachgeladen und gemerkt', async () => {
  const api = fakeApi({
    '/locations/57000094/pathoflegend/players': { items: [
      { tag: '#JJJ', name: 'Erster', rank: 1, eloRating: 2500 },
      { tag: '#LLL', name: 'Zweiter', rank: 2, eloRating: 2400 },
      { tag: '#QQQ', name: 'Dritter', rank: 3, eloRating: 2300 },
    ] },
    '/players/%23JJJ/battlelog': [battle('20261113T180000.000Z', [side('JJJ', 'Erster', DECK_A, 2)], [side('LLL', 'Zweiter', DECK_B, 1)])],
    '/players/%23QQQ/battlelog': [battle('20261113T180000.000Z', [side('QQQ', 'Dritter', DECK_A, 2)], [side('UUU', 'X', DECK_B, 1)], { type: 'PvP', gameMode: { name: 'Ladder' } })],
  });
  await withServer(api, async (get) => {
    const before = await get('/ranking/players?loc=57000094');
    assert.deepEqual(before.body.items.map((p) => p.deck), [undefined, undefined, undefined]);
    const loaded = await get('/decks?tags=JJJ,QQQ,unsinn!');
    assert.equal(loaded.body.decks.JJJ[0].id, 'knight');
    assert.equal(loaded.body.decks.JJJ[0].variant, 'ev1');
    assert.equal(loaded.body.decks.QQQ, null); // nur Ladder im Log → geprüft, kein Ranked-Deck
    // Der Gegner aus dem Kampf von JJJ hat sein Deck gleich mitbekommen — ohne eigenen Abruf
    const again = await get('/decks?tags=LLL,JJJ');
    assert.equal(again.body.decks.LLL[0].id, 'mega-knight');
    assert.equal(api.calls.filter((c) => c.includes('battlelog')).length, 2);
    assert.deepEqual(store.getDeck('JJJ').cards.length, 8);
  });
});

test('Rangliste folgt dem Profil: neues Deck steht sofort in der Liste; anderer Medaillenstand = Deck gilt als veraltet', async (t) => {
  const responses = {
    '/locations/57000249/pathoflegend/players': { items: [{ tag: '#PPP', name: 'Wechsler', rank: 1, eloRating: 2500 }] },
    '/players/%23PPP': { tag: '#PPP', name: 'Wechsler', trophies: 9000, cards: DECK_A, currentPathOfLegendSeasonResult: { leagueNumber: 7, trophies: 2500, rank: 1 } },
    '/players/%23PPP/battlelog': [battle('20261114T180000.000Z', [side('PPP', 'Wechsler', DECK_A, 2)], [side('YYY', 'X', DECK_B, 1)])],
  };
  const api = fakeApi(responses);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  await withServer(api, async (get) => {
    assert.equal((await get('/ranking/players?loc=57000249')).body.items[0].deck, undefined);
    // Profil geöffnet → dieselbe (noch zwischengespeicherte) Rangliste zeigt das Deck ohne eigenen Abruf
    await get('/player/PPP');
    t.mock.timers.tick(11 * 1000);
    let row = (await get('/ranking/players?loc=57000249')).body.items[0];
    assert.equal(row.deck[0].id, 'knight');
    assert.equal(row.deckStale, undefined);
    assert.equal(api.calls.filter((c) => c.includes('/locations/')).length, 1);

    // Spieler spielt mit anderem Deck weiter: neue Rangliste zeigt einen anderen Medaillenstand
    responses['/locations/57000249/pathoflegend/players'] = { items: [{ tag: '#PPP', name: 'Wechsler', rank: 1, eloRating: 2530 }] };
    responses['/players/%23PPP/battlelog'] = [battle('20261114T190000.000Z', [side('PPP', 'Wechsler', DECK_B, 2)], [side('YYY', 'X', DECK_A, 1)])];
    t.mock.timers.tick(6 * 60 * 1000); // Rangliste abgelaufen → alter Stand sofort, neuer im Hintergrund
    await get('/ranking/players?loc=57000249');
    await new Promise((r) => { setImmediate(r); });
    t.mock.timers.tick(11 * 1000);
    row = (await get('/ranking/players?loc=57000249')).body.items[0];
    assert.equal(row.score, 2530);
    assert.equal(row.deckStale, undefined); // erst vor 6 Minuten geprüft: noch nicht nachfragen
    t.mock.timers.tick(10 * 60 * 1000);
    row = (await get('/ranking/players?loc=57000249')).body.items[0];
    assert.equal(row.deckStale, true);
    // Nachladen holt das neue Deck und merkt den Stand — danach gilt es wieder als aktuell
    const loaded = await get('/decks?tags=PPP');
    assert.equal(loaded.body.decks.PPP[0].id, 'mega-knight');
    t.mock.timers.tick(11 * 1000);
    row = (await get('/ranking/players?loc=57000249')).body.items[0];
    assert.equal(row.deck[0].id, 'mega-knight');
    assert.equal(row.deckStale, undefined);
    // Ohne neuen Medaillenstand bleibt es dabei, auch Stunden später
    t.mock.timers.tick(5 * 3600 * 1000);
    await get('/ranking/players?loc=57000249');
    await new Promise((r) => { setImmediate(r); });
    t.mock.timers.tick(11 * 1000);
    assert.equal((await get('/ranking/players?loc=57000249')).body.items[0].deckStale, undefined);
  });
});

test('Rangliste: nach Ablauf geht der alte Stand sofort raus, der neue kommt im Hintergrund; bei gestörter API bleibt der alte', async (t) => {
  const responses = { '/locations/57000006/rankings/clans': { items: [{ tag: '#QQQ', name: 'Alt', rank: 1, clanScore: 100 }] } };
  const api = fakeApi(responses);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  await withServer(api, async (get) => {
    assert.equal((await get('/ranking/clans?loc=57000006')).body.items[0].name, 'Alt');
    responses['/locations/57000006/rankings/clans'] = { items: [{ tag: '#QQQ', name: 'Neu', rank: 1, clanScore: 100 }] };
    t.mock.timers.tick(6 * 60 * 1000);
    assert.equal((await get('/ranking/clans?loc=57000006')).body.items[0].name, 'Alt');
    await new Promise((r) => { setImmediate(r); });
    assert.equal((await get('/ranking/clans?loc=57000006')).body.items[0].name, 'Neu');
    assert.equal(api.calls.length, 2);
    // API gestört: der letzte Stand bleibt sichtbar
    responses['/locations/57000006/rankings/clans'] = new Error('Royale API HTTP 503');
    t.mock.timers.tick(6 * 60 * 1000);
    const r = await get('/ranking/clans?loc=57000006');
    assert.equal(r.status, 200);
    assert.equal(r.body.items[0].name, 'Neu');
    // … bis er endgültig zu alt ist
    t.mock.timers.tick(40 * 60 * 1000);
    assert.equal((await get('/ranking/clans?loc=57000006')).status, 502);
  });
});

// ── Schutz vor Scrapern ──────────────────────────────────────────────────────
// Anfragen „von außen“ tragen den Kopf, den nginx anhängt — ohne ihn gelten sie als Dienst auf demselben Rechner.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const from = (ip, ua = BROWSER_UA) => ({ headers: { 'x-forwarded-for': ip, 'user-agent': ua } });

test('Schutz: Skript-Kennungen werden abgewiesen, Browser, Suchmaschinen und eigene Werkzeuge nicht', async () => {
  await withServer(fakeApi({}), async (get) => {
    const scripts = ['python-requests/2.32.3', 'curl/8.9.1', 'axios/1.7.2', 'node', 'Go-http-client/2.0', 'Scrapy/2.11.2 (+https://scrapy.org)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36'];
    for (const ua of scripts) {
      const r = await get('/status', from('203.0.113.7', ua));
      assert.deepEqual([r.status, r.body.key], [403, 'scriptBlocked'], ua);
    }
    for (const ua of [BROWSER_UA, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'vnmvalentin-prerender']) {
      assert.equal((await get('/status', from('203.0.113.7', ua))).status, 200, ua);
    }
    // Dienst auf demselben Rechner (kein nginx-Kopf): Nodes fetch meldet sich als „node“ und kommt trotzdem durch
    assert.equal((await get('/status')).status, 200);
  });
});

test('Schutz: neue Spieler- und Clan-Abrufe kosten Kontingent je Adresse, Zwischengespeichertes nicht', async () => {
  const api = fakeApi({
    '/players/%23J9J': { tag: '#J9J', name: 'Schonda', cards: DECK_A },
    '/players/%23J9J/battlelog': [],
  });
  await withServer(api, async (get) => {
    const a = (p) => get(p, from('198.51.100.1'));
    const b = (p) => get(p, from('198.51.100.2'));
    assert.equal((await b('/player/J9J')).status, 200); // B legt das Profil in den Zwischenspeicher
    assert.equal((await a('/player/2PL')).status, 404); // unbekannte Tags: je ein neuer Abruf
    assert.equal((await a('/player/2PQ')).status, 404);
    const limited = await a('/player/2PG');
    assert.deepEqual([limited.status, limited.body.key, limited.body.login], [429, 'rateLimited', true]);
    assert.ok(limited.body.retryAt > Date.now() && limited.body.retryAt <= Date.now() + 60_000); // Ende des 1-Minuten-Fensters
    const callsBefore = api.calls.length;
    assert.equal((await a('/player/J9J')).status, 200); // frisch im Zwischenspeicher → kostet nichts
    assert.equal((await a('/clan/L9L')).status, 429); // Clans zählen mit
    assert.equal((await a('/clan/L9L/war')).status, 429);
    assert.equal(api.calls.length, callsBefore); // Abgewiesenes erreicht die API nicht
    assert.equal((await b('/player/2PG')).status, 404); // andere Adresse, eigenes Kontingent
    // Suche: Spieler aus dem eigenen Index weiter, Clans erst wieder mit Kontingent
    const s = await a('/search?q=schonda');
    assert.equal(s.status, 200);
    assert.equal(s.body.players[0].tag, 'J9J');
    assert.deepEqual(s.body.clans, []);
    assert.equal(api.calls.length, callsBefore + 2); // nur die beiden Abrufe für B
  }, { limits: { lookups: [{ fensterMs: 60_000, max: 2 }] } });
});

test('Schutz: Tagesgrenze meldet sich eigens; Konten mit Twitch/Discord haben ihr eigenes Kontingent', async () => {
  const opts = {
    limits: { lookups: [{ fensterMs: 60_000, max: 10 }, { fensterMs: 24 * 3600_000, max: 2 }], accountLookups: [{ fensterMs: 60_000, max: 1 }] },
    kontoFuerKontingent: (req) => req.headers['x-test-konto'] || null,
  };
  await withServer(fakeApi({}), async (get) => {
    const anon = (p) => get(p, from('198.51.100.20'));
    const konto = (p) => get(p, { headers: { ...from('198.51.100.20').headers, 'x-test-konto': 'k1' } });
    assert.equal((await anon('/player/2PU')).status, 404);
    assert.equal((await anon('/player/2PV')).status, 404);
    const day = await anon('/player/2PC');
    assert.deepEqual([day.status, day.body.key, day.body.login], [429, 'dailyLimit', true]);
    assert.ok(day.body.retryAt > Date.now() + 23 * 3600_000); // erst morgen wieder — kein „kurz warten“
    // Dieselbe Adresse, aber angemeldet: eigenes Kontingent; erschöpft fehlt der Hinweis aufs Anmelden
    assert.equal((await konto('/player/2PC')).status, 404);
    const full = await konto('/player/2PJ');
    assert.deepEqual([full.status, full.body.key, full.body.login], [429, 'rateLimited', undefined]);
  }, opts);
});

test('Schutz: /decks lädt nur für Ranglisten-Spieler nach, im Rahmen des Kontingents', async () => {
  const log = (tag) => [battle('20261113T180000.000Z', [side(tag, 'X', DECK_A, 2)], [side('8YY', 'Y', DECK_B, 1)])];
  const api = fakeApi({
    '/locations/57000120/pathoflegend/players': { items: [{ tag: '#P9P', name: 'Erste', rank: 1 }, { tag: '#U9U', name: 'Zweite', rank: 2 }] },
    '/players/%23P9P/battlelog': log('P9P'),
    '/players/%23U9U/battlelog': log('U9U'),
    '/players/%23G9G/battlelog': log('G9G'),
  });
  await withServer(api, async (get) => {
    const g = (p) => get(p, from('198.51.100.9'));
    assert.deepEqual((await g('/decks?tags=G9G')).body.decks, {}); // beliebiger Tag: kein Abruf
    await g('/ranking/players?loc=57000120');
    const r = await g('/decks?tags=P9P,U9U,G9G');
    assert.equal(r.body.decks.P9P[0].id, 'knight');
    assert.equal(r.body.decks.U9U, undefined); // Ranglisten-Spieler, aber Kontingent (1) aufgebraucht
    assert.equal(r.body.decks.G9G, undefined); // steht in keiner Rangliste
    assert.deepEqual(api.calls.filter((c) => c.includes('battlelog')), ['/players/%23P9P/battlelog']);
  }, { limits: { decks: [{ fensterMs: 60_000, max: 1 }] } });
});

test('Schutz: gemeinsames Kontingent aller Besucher ohne Konto — viele Adressen zusammen, Konten unberührt', async () => {
  const opts = {
    limits: { global: [{ fensterMs: 60_000, max: 2 }] },
    kontoFuerKontingent: (req) => req.headers['x-test-konto'] || null,
  };
  await withServer(fakeApi({}), async (get) => {
    // Jede Anfrage aus einer anderen Adresse: je Adresse wäre nichts erreicht
    assert.equal((await get('/player/2PU', from('198.51.100.31'))).status, 404);
    assert.equal((await get('/player/2PV', from('198.51.100.32'))).status, 404);
    const voll = await get('/player/2PC', from('198.51.100.33'));
    assert.deepEqual([voll.status, voll.body.key, voll.body.login], [429, 'rateLimited', true]);
    const konto = await get('/player/2PC', { headers: { ...from('198.51.100.33').headers, 'x-test-konto': 'k7' } });
    assert.equal(konto.status, 404, 'mit Konto zählt das gemeinsame Kontingent nicht');
  }, opts);
});

test('Schutz: bei Überlast bekommen Besucher ohne Konto sofort „busy“, Zwischengespeichertes und Konten nicht', async () => {
  const last = { an: false, ueberlastet() { return this.an; } };
  const api = fakeApi({
    '/players/%23J8J': { tag: '#J8J', name: 'Warm', cards: DECK_A },
    '/players/%23J8J/battlelog': [],
  });
  const opts = { last, kontoFuerKontingent: (req) => req.headers['x-test-konto'] || null };
  await withServer(api, async (get) => {
    const anon = (p) => get(p, from('198.51.100.41'));
    assert.equal((await anon('/player/J8J')).status, 200);
    last.an = true;
    const calls = api.calls.length;
    const r = await anon('/player/2PL');
    assert.deepEqual([r.status, r.body.key], [503, 'busy']);
    assert.equal((await anon('/player/J8J/battles')).status, 503);
    assert.equal((await anon('/search?q=warm')).status, 503);
    assert.equal(api.calls.length, calls, 'Abgewiesenes erreicht die API nicht');
    assert.equal((await anon('/player/J8J')).status, 200, 'frisch im Zwischenspeicher');
    assert.equal((await anon('/status')).status, 200);
    assert.equal((await get('/player/2PL', { headers: { ...from('198.51.100.41').headers, 'x-test-konto': 'k8' } })).status, 404);
    last.an = false;
    assert.equal((await anon('/player/2PQ')).status, 404);
  }, opts);
});

test('Sammler: merkt die Rangliste im Namens-Index, speichert Auswertung und Deck-Einzelheiten; Route /deck liefert sie', async () => {
  const logs = {};
  // 30 Spieler, jeder mit zwei Kämpfen Deck A gegen Deck B (A gewinnt den ersten) → 60 Kämpfe
  const top = Array.from({ length: 30 }, (_, i) => ({ tag: `#${'2PYLQGRJCU'[i % 10]}${'89PYL'[Math.floor(i / 10)]}${'2' }`, name: `Top${i}`, rank: i + 1, eloRating: 3000 - i }));
  top.forEach((p, i) => {
    const tag = p.tag.slice(1);
    logs[`/players/%23${tag}/battlelog`] = [0, 1].map((k) => battle(`20261113T${String(10 + (i % 10)).padStart(2, '0')}${String(k * 30 + Math.floor(i / 10)).padStart(2, '0')}00.000Z`,
      [side(tag, p.name, DECK_A, k === 0 ? 2 : 0)], [side(`V${tag}`, `Gegner${i}`, DECK_B, 1)]));
  });
  const api = fakeApi({});
  api.crApiGetSafe = async (p) => (p.startsWith('/locations/global/pathoflegend/players') ? { items: top } : logs[p] || null);
  const realNow = Date.now;
  Date.now = () => Date.UTC(2026, 10, 14); // die Kämpfe der Attrappe müssen „frisch" sein
  try {
    await withServer(api, async (get, router) => {
      const snap = await router.crawler.run();
      assert.equal(snap.battles, 60);
      assert.equal(snap.players, 30);
      assert.equal(store.searchPlayers('Top29')[0].name, 'Top29'); // Rangliste im Namens-Index
      assert.equal(store.searchPlayers('Gegner7').length, 1); // … und die Gegner aus den Kämpfen
      const a = snap.decks.find((d) => d.cards.some((c) => c.id === 'hog-rider'));
      const r = await get(`/deck?karten=${[...a.key.split(',')].reverse().join(',')}`); // Reihenfolge egal
      assert.deepEqual([r.body.deck.uses, r.body.deck.winRate], [60, 0.5]);
      assert.deepEqual([r.body.vsDecks[0].n, r.body.vsDecks[0].wins], [60, 30]);
      assert.equal(r.body.players[0].name, 'Top0');
      assert.equal(r.body.players[0].rank, 1); // Platz aus der Rangliste
      const none = await get('/deck?karten=knight,zap');
      assert.deepEqual([none.body.deck, none.body.vsDecks], [null, []]);
    });
  } finally {
    Date.now = realNow;
  }
});

test('Route /deck: „Gespielt von“ zeigt den aktuellen Platz der Weltrangliste, nicht den der Auswertung', async () => {
  const logs = {};
  const top = Array.from({ length: 30 }, (_, i) => ({ tag: `#${'2PYLQGRJCU'[i % 10]}${'89PYL'[Math.floor(i / 10)]}2`, name: `Top${i}`, rank: i + 1, eloRating: 3000 - i }));
  top.forEach((p, i) => {
    const tag = p.tag.slice(1);
    logs[`/players/%23${tag}/battlelog`] = [0, 1].map((k) => battle(`20261113T${String(10 + (i % 10)).padStart(2, '0')}${String(k * 30 + Math.floor(i / 10)).padStart(2, '0')}00.000Z`,
      [side(tag, p.name, DECK_A, k === 0 ? 2 : 0)], [side(`V${tag}`, `Gegner${i}`, DECK_B, 1)]));
  });
  // Seit der Auswertung: Top5 und Top7 sind vorbeigezogen, Top1 ist aus der Rangliste gefallen
  const live = [top[5], top[7], top[0], ...top.filter((_, i) => ![0, 1, 5, 7].includes(i))].map((p, i) => ({ ...p, rank: i + 1 }));
  const api = fakeApi({ '/locations/global/pathoflegend/players': { items: live } });
  api.crApiGetSafe = async (p) => (p.startsWith('/locations/global/pathoflegend/players') ? { items: top } : logs[p] || null);
  const realNow = Date.now;
  Date.now = () => Date.UTC(2026, 10, 14);
  try {
    await withServer(api, async (get, router) => {
      const snap = await router.crawler.run();
      const a = snap.decks.find((d) => d.cards.some((c) => c.id === 'hog-rider'));
      const r = await get(`/deck?karten=${a.key}`);
      assert.equal(r.body.ranksLive, true);
      assert.deepEqual(r.body.players.map((p) => [p.name, p.rank]), [
        ['Top5', 1], ['Top7', 2], ['Top0', 3], ['Top2', 4], ['Top3', 5], ['Top4', 6], ['Top6', 7],
        ['Top8', 8], ['Top9', 9], ['Top10', 10], ['Top11', 11], ['Top1', null],
      ]);
      // Ranglisten-Seite (Top 200 und Top 1000) liest dieselbe Liste — kein weiterer Abruf
      const board = await get('/ranking/players');
      const board1000 = await get('/ranking/players?top=1000');
      assert.equal(board.body.items[0].name, 'Top5');
      assert.equal(board1000.body.items.length, 29);
      assert.equal(api.calls.filter((c) => c.includes('pathoflegend')).length, 1);
    });
  } finally {
    Date.now = realNow;
  }
});

// Crown-Series-Duell im Format der offiziellen API (wie bei der Crown-Series-Auswertung weiter unten): je Runde ein
// eigenes Deck — ich gewinne beide Runden
const crownDuelRaw = (time, me, opp) => ({
  type: 'unknown', battleTime: time, gameMode: { name: 'Competitive_Multideck' }, arena: { name: 'x' },
  team: [{ tag: `#${me}`, name: 'Duellant', crowns: 2, cards: [...DECK_A, ...DECK_B], rounds: [{ crowns: 1, cards: DECK_A }, { crowns: 1, cards: DECK_B }] }],
  opponent: [{ tag: `#${opp}`, name: 'Gegner', crowns: 0, cards: [...DECK_B, ...DECK_A], rounds: [{ crowns: 0, cards: DECK_B }, { crowns: 0, cards: DECK_A }] }],
});

test('Crown Series: Duelle bleiben eigens gemerkt (höchstens 10) und gehen mit dem Profil mit', async () => {
  const duels = shape.shapeBattles(Array.from({ length: 12 }, (_, i) => crownDuelRaw(`202611${String(i + 1).padStart(2, '0')}T100000.000Z`, '9CU', '8LV')), '9CU', null);
  assert.ok(duels.every((b) => b.group === 'crown' && b.team[0].decks.length === 2));
  store.rememberBattles('9CU', duels);
  const kept = store.getCrownBattles('9CU');
  assert.equal(kept.length, 10); // es bleiben die neuesten 10
  assert.equal(kept[0].t, Math.max(...duels.map((b) => b.t))); // neueste zuerst
  assert.deepEqual(Object.keys(kept[0]).sort(), ['group', 'result', 'rounds', 't', 'team']); // verkleinert
  assert.deepEqual(kept[0].rounds, [{ f: 1, a: 0 }, { f: 1, a: 0 }]);
  assert.equal(kept[0].team[0].decks[1][0].id, 'mega-knight');
  // 250 Ranked-Kämpfe danach schieben die Duelle aus dem Verlauf — der eigene Speicher behält sie
  const newest = kept[0].t;
  store.rememberBattles('9CU', Array.from({ length: 250 }, (_, i) => ({ t: newest + (i + 1) * 60 * 1000, group: 'ranked', result: 'win', team: [], opponent: [] })));
  assert.equal(store.getBattles('9CU', { limit: 200 }).filter((b) => b.group === 'crown').length, 0);
  assert.equal(store.getCrownBattles('9CU').length, 10);
  // Das Profil liefert sie mit
  const api = fakeApi({ '/players/%239CU': { tag: '#9CU', name: 'Duellant', cards: DECK_A }, '/players/%239CU/battlelog': [] });
  await withServer(api, async (get) => {
    const r = await get('/player/9CU');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.crownBattles.length, 10);
    assert.equal(r.body.battles.filter((b) => b.group === 'crown').length, 0);
  });
});

test('Crown Series: Nachtrag übernimmt Duelle, die schon im Kampf-Verlauf liegen — nur einmal', async () => {
  const duels = shape.shapeBattles([0, 1, 2].map((i) => crownDuelRaw(`2026100${i + 1}T100000.000Z`, 'QRJ', 'YLQ')), 'QRJ', null);
  const ranked = shape.shapeBattles([battle('20261005T100000.000Z', [side('QRJ', 'A', DECK_A, 1)], [side('YLQ', 'B', DECK_B, 0)])], 'QRJ', null);
  // Direkt in den Verlauf schreiben, wie vor dem eigenen Speicher: rememberBattles würde sie gleich mitnehmen
  const Database = require('better-sqlite3');
  const zlib = require('node:zlib');
  const raw = new Database(process.env.CR_SCOUT_DB);
  const put = raw.prepare('INSERT OR IGNORE INTO battles (tag, t, data) VALUES (?, ?, ?)');
  for (const b of [...duels, ...ranked]) put.run('QRJ', b.t, zlib.deflateRawSync(JSON.stringify(b)));
  raw.close();
  assert.equal(store.getCrownBattles('QRJ').length, 0);
  // Kleine Schritte, damit das Fortsetzen über mehrere Schritte geprüft ist
  let after = null;
  let steps = 0;
  do { after = store.crownBackfillStep(after, 2); steps += 1; } while (after && steps < 10000);
  assert.ok(steps > 1);
  assert.deepEqual(store.getCrownBattles('QRJ').map((b) => b.t), duels.map((b) => b.t).sort((a, b) => b - a)); // nur die Duelle
  // Über den Router: läuft einmal und merkt sich das
  await withServer(fakeApi({}), async (get, router) => {
    assert.equal(await router.backfillCrown({ pauseMs: 0 }), true);
    assert.equal(await router.backfillCrown({ pauseMs: 0 }), false);
  });
});

test('Route /deck: ohne erreichbare Weltrangliste bleibt der Platz der Auswertung', async () => {
  const logs = {};
  const top = Array.from({ length: 30 }, (_, i) => ({ tag: `#${'2PYLQGRJCU'[i % 10]}${'89PYL'[Math.floor(i / 10)]}2`, name: `Top${i}`, rank: i + 1, eloRating: 3000 - i }));
  top.forEach((p, i) => {
    const tag = p.tag.slice(1);
    logs[`/players/%23${tag}/battlelog`] = [0, 1].map((k) => battle(`20261113T${String(10 + (i % 10)).padStart(2, '0')}${String(k * 30 + Math.floor(i / 10)).padStart(2, '0')}00.000Z`,
      [side(tag, p.name, DECK_A, k === 0 ? 2 : 0)], [side(`V${tag}`, `Gegner${i}`, DECK_B, 1)]));
  });
  const api = fakeApi({ '/locations/global/pathoflegend/players': new Error('Royale API HTTP 503') });
  api.crApiGetSafe = async (p) => (p.startsWith('/locations/global/pathoflegend/players') ? { items: top } : logs[p] || null);
  const realNow = Date.now;
  Date.now = () => Date.UTC(2026, 10, 14);
  try {
    await withServer(api, async (get, router) => {
      const snap = await router.crawler.run();
      const a = snap.decks.find((d) => d.cards.some((c) => c.id === 'hog-rider'));
      const r = await get(`/deck?karten=${a.key}`);
      assert.equal(r.status, 200);
      assert.equal(r.body.ranksLive, false);
      assert.deepEqual(r.body.players.slice(0, 3).map((p) => [p.name, p.rank]), [['Top0', 1], ['Top1', 2], ['Top2', 3]]);
    });
  } finally {
    Date.now = realNow;
  }
});

test('Meta: je Deck die am häufigsten gespielte Turmtruppe, auch bei den Gegner-Decks', () => {
  const now = Date.UTC(2026, 10, 14);
  const tw = (name) => ({ supportCards: [{ name, level: 11, maxLevel: 16, iconUrls: { medium: `https://x/${name}.png` } }] });
  const acc = createAccumulator({ now });
  [['Tower Princess', '20261113T100000.000Z'], ['Tower Princess', '20261113T110000.000Z'], ['Cannoneer', '20261113T120000.000Z']].forEach(([t, time], i) => {
    acc.add(shape.shapeBattles([battle(time, [side('2PP', 'A', DECK_A, 1, tw(t))], [side(`8Y${'0289'[i]}`, 'B', DECK_B, 0, tw('Dagger Duchess'))])], '2PP', 16));
  });
  const meta = acc.result({ players: 1 });
  const a = meta.decks.find((d) => d.cards.some((c) => c.id === 'hog-rider'));
  assert.equal(a.tower.name, 'Tower Princess');
  assert.equal(a.tower.icon, 'https://x/Tower Princess.png');
  const details = acc.details();
  assert.equal(details[a.key].vsDecks[0].tower.name, 'Dagger Duchess');
});

test('Sammler: Top-100/250/500-Auswertung zählt nur die Kämpfe der Spieler bis zu diesem Platz', async () => {
  const kv = new Map();
  const mem = { getValue: (k) => (kv.has(k) ? { value: kv.get(k) } : null), setValue: (k, v) => kv.set(k, v) };
  // Gültige Tags aus dem Tag-Alphabet; jeder Spieler hat genau einen frischen Ranked-Kampf gegen einen eigenen Gegner
  const ABC = '0289PYLQGRJCUV';
  const tagOf = (n, pre) => { let s = ''; let x = n + 1; while (x) { s = ABC[x % 14] + s; x = Math.floor(x / 14); } return `${pre}${s}`; };
  const stamp = (i) => new Date(Date.now() - (i + 1) * 60000).toISOString().replace(/[-:]/g, '');
  const top = Array.from({ length: 600 }, (_, i) => ({ tag: tagOf(i, '2'), rank: i + 1 }));
  const byTag = new Map(top.map((p, i) => [p.tag, i]));
  const crawler = createMetaCrawler({
    store: mem, players: 600, spacingMs: 0, fetchTopPlayers: async () => top,
    fetchBattles: async (tag) => { const i = byTag.get(tag); return shape.shapeBattles([battle(stamp(i), [side(tag, 'A', DECK_A, 1)], [side(tagOf(i, '8'), 'B', DECK_B, 0)])], tag, 16); },
  });
  const all = await crawler.run();
  assert.equal(all.battles, 600);
  assert.deepEqual([100, 250, 500].map((n) => [crawler.currentTier(n).battles, crawler.currentTier(n).players]), [[100, 100], [250, 250], [500, 500]]);
  assert.equal(crawler.currentTier(1000), null); // die ganze Liste ist die Hauptauswertung
  assert.ok(kv.has('metaTiers'));
});

test('Sammler ohne Rangliste oder mit zu wenigen Kämpfen behält den alten Stand', async () => {
  const kv = new Map();
  const mem = { getValue: (k) => (kv.has(k) ? { value: kv.get(k) } : null), setValue: (k, v) => kv.set(k, v) };
  const crawler = createMetaCrawler({ store: mem, fetchTopPlayers: async () => [], fetchBattles: async () => [], spacingMs: 0 });
  assert.equal(await crawler.run(), null);
  const few = createMetaCrawler({ store: mem, fetchTopPlayers: async () => [{ tag: '2PP' }], fetchBattles: async () => [], spacingMs: 0 });
  assert.equal(await few.run(), null);
  assert.equal(kv.size, 0);
  assert.equal(few.deckDetails('egal'), null);
});

test('Route Katalog: Karten des Spiels, einmal abgerufen', async () => {
  const api = fakeApi({ '/cards': { items: [{ name: 'Knight', rarity: 'common', elixirCost: 3, maxEvolutionLevel: 1, iconUrls: { medium: 'm', evolutionMedium: 'e' } }], supportItems: [] } });
  await withServer(api, async (get) => {
    const [a, b] = [await get('/catalog'), await get('/catalog')];
    assert.deepEqual(a.body.cards, [{ id: 'knight', name: 'Knight', rarity: 'Common', elixir: 3, icon: 'm', ev1: 'e' }]);
    assert.equal(b.body.fetchedAt, a.body.fetchedAt);
    assert.equal(api.calls.length, 1);
  });
});

test('Kampfgruppen: Saison-Trophäenstraße (Kampfart "trail", Modus "Ladder") zählt zur Trophäenstraße', () => {
  assert.equal(shape.modeGroup('trail', 'Ladder', 1, false), 'ladder');
  assert.equal(shape.modeGroup('PvP', 'Ladder', 1, false), 'ladder');
  assert.equal(shape.modeGroup('trail', 'TeamVsTeam', 2, false), '2v2');
  assert.equal(shape.modeGroup('riverRacePvP', 'Rage_Ladder', 1, false), 'war');
  assert.equal(shape.modeGroup('trail', 'Chaos_1v1_MegaDraft_S3', 1, false), 'party');
  assert.equal(shape.modeGroup('quickplay', 'Friendly', 1, false), 'friendly');
  assert.equal(shape.modeGroup('quickplay', 'Draft_Competitive', 1, false), 'friendly');
});

// Crown Series: ein Duell mit Runden-Decks (so liefert die API es, geprüft 15.11.2026)
const DECK_C = [
  card('Giant', 'rare', 12), card('Prince', 'epic', 9), card('Bandit', 'legendary', 6), card('Lightning', 'epic', 9),
  card('Tornado', 'epic', 9), card('Bomber', 'common', 14), card('Barbarians', 'common', 14), card('Rage', 'epic', 9),
];
const DECK_D = [
  card('Golem', 'epic', 9), card('Night Witch', 'legendary', 6), card('Baby Dragon', 'epic', 9), card('Lumberjack', 'legendary', 6),
  card('Mega Minion', 'rare', 12), card('Barbarian Barrel', 'epic', 9), card('Elixir Collector', 'rare', 12), card('Tombstone', 'rare', 12),
];
const duelSide = (tag, name, decks, roundCrowns) => ({
  tag: `#${tag}`, name, crowns: roundCrowns.filter(Boolean).length, cards: decks.flat(),
  rounds: decks.map((cards, i) => ({ crowns: roundCrowns[i], cards })),
});
const duel = (time, me, opp) => ({ type: 'unknown', battleTime: time, gameMode: { name: 'Competitive_Multideck' }, arena: { name: 'x' }, team: [me], opponent: [opp] });

test('Duell: jede Runde mit eigenem Deck, das zuletzt gespielte vorn', () => {
  const [b] = shape.shapeBattles([duel('20261114T120000.000Z', duelSide('2PP', 'A', [DECK_A, DECK_C], [1, 1]), duelSide('8YY', 'B', [DECK_B, DECK_D], [0, 0]))], '2PP', 16);
  assert.equal(b.group, 'crown');
  assert.equal(b.result, 'win');
  assert.deepEqual(b.team[0].decks.map((d) => d[0].id), ['knight', 'giant']);
  assert.equal(b.team[0].cards[0].id, 'giant');
  assert.deepEqual(b.rounds, [{ f: 1, a: 0 }, { f: 1, a: 0 }]);
});

test('Crown Series: Rundensiegquote je Deck, Set eines Spielers ohne doppelte Karte, zusammengestellte Sets', () => {
  const now = Date.UTC(2026, 10, 14, 20);
  const acc = createCrownAccumulator({ now });
  // A spielt dreimal mit A/C gegen B mit B/D; ein älterer Kampf zeigt ein Deck, das mit DECK_A eine Karte teilt
  const SHARES_KNIGHT = [DECK_A[0], ...DECK_D.slice(1)];
  for (let i = 0; i < 3; i += 1) {
    acc.add(shape.shapeBattles([duel(`20261114T1${i}0000.000Z`, duelSide('2PP', 'A', [DECK_A, DECK_C], [1, i === 0 ? 0 : 1]), duelSide('8YY', 'B', [DECK_B, DECK_D], [0, i === 0 ? 1 : 0]))], '2PP', 16));
  }
  acc.add(shape.shapeBattles([duel('20261113T100000.000Z', duelSide('2PP', 'A', [SHARES_KNIGHT, DECK_B], [1, 1]), duelSide('9GG', 'C', [DECK_C, DECK_D], [0, 0]))], '2PP', 16));
  const r = acc.result({ rankOf: (tag) => ({ '2PP': 3, '8YY': 9 }[tag]) });
  assert.equal(r.battles, 4);
  const byKey = new Map(r.decks.map((d) => [d.key, d]));
  const keyOf = (cards) => deckKey(shape.shapeBattles([battle('20261113T180000.000Z', [side('X', 'X', cards, 1)], [side('Y', 'Y', DECK_B, 0)])], 'X', 16)[0].team[0].cards);
  assert.deepEqual([byKey.get(keyOf(DECK_A)).uses, byKey.get(keyOf(DECK_A)).winRate], [3, 1]);
  assert.deepEqual([byKey.get(keyOf(DECK_C)).uses, byKey.get(keyOf(DECK_C)).winRate], [4, 0.5]); // 3× bei A (2 Siege), 1× bei C (verloren)
  // Set von A: die neuesten Decks (A, C), dann aus dem älteren Kampf nur DECK_B — das Deck mit dem Knight fällt weg
  const setA = r.sets.find((s) => s.player.tag === '2PP');
  assert.deepEqual(setA.decks, [keyOf(DECK_A), keyOf(DECK_C), keyOf(DECK_B)]);
  assert.deepEqual(setA.record, { wins: 3, n: 4 }); // der erste Kampf endete 1:1
  assert.equal(r.sets[0].player.tag, '2PP'); // besser platziert zuerst
  assert.equal(r.sets.some((s) => s.player.tag === '9GG'), false); // ohne Platz kein Set
  // Zusammengestellt: vier Decks ohne gemeinsame Karte (A, B, C, D teilen keine)
  assert.equal(r.built.length >= 1, true);
  for (const s of r.built) {
    const cards = s.decks.flatMap((k) => k.split(','));
    assert.equal(new Set(cards).size, cards.length);
    assert.equal(s.decks.length, 4);
  }
  for (const k of [...r.sets.flatMap((s) => s.decks), ...r.built.flatMap((s) => s.decks)]) assert.ok(byKey.has(k), `Deck fehlt: ${k}`);
});

test('Kampf-Verlauf: wächst über das Battlelog hinaus, doppelte Kämpfe zählen einmal, Seiten nach Zeitpunkt', async () => {
  const mk = (h) => battle(`20261110T${String(h).padStart(2, '0')}0000.000Z`, [side('2YY', 'Lang', DECK_A, 1)], [side('8YY', 'B', DECK_B, 0)]);
  const first = Array.from({ length: 20 }, (_, i) => mk(i));
  const second = Array.from({ length: 20 }, (_, i) => mk(i + 4)); // 16 bekannt, 4 neu
  store.rememberBattles('2YY', shape.shapeBattles(first, '2YY', 16));
  assert.equal(store.rememberBattles('2YY', shape.shapeBattles(second, '2YY', 16)), 4);
  assert.deepEqual(store.battleStats('2YY').n, 24);
  const page1 = store.getBattles('2YY', { limit: 10 });
  assert.equal(page1.length, 10);
  assert.equal(page1[0].t > page1[9].t, true);
  const page2 = store.getBattles('2YY', { before: page1[9].t, limit: 100 });
  assert.equal(page2.length, 14);
  assert.equal(page2[0].team[0].cards[0].id, 'knight');

  const api = fakeApi({
    '/players/%232YY': { tag: '#2YY', name: 'Lang', cards: DECK_A },
    '/players/%232YY/battlelog': [battle('20261111T010000.000Z', [side('2YY', 'Lang', DECK_A, 1)], [side('8YY', 'B', DECK_B, 0)])],
  });
  await withServer(api, async (get) => {
    const r = await get('/player/2YY');
    assert.equal(r.body.battles.length, 25); // 1 aus dem Battlelog + 24 aus dem Verlauf
    assert.deepEqual(r.body.history.n, 25);
    const older = await get(`/player/2YY/battles?vor=${r.body.battles[9].t}`);
    assert.equal(older.body.battles.length, 15);
    assert.equal(older.body.more, false);
  });
});

test('Beobachtung: angesehene Profile werden nachgeholt, danach erst wieder nach der Pause', async () => {
  const api = fakeApi({ '/players/%232QQ': { tag: '#2QQ', name: 'Watch', cards: DECK_A } });
  const logs = { '/players/%232QQ/battlelog': [battle('20261111T100000.000Z', [side('2QQ', 'Watch', DECK_A, 1)], [side('8YY', 'B', DECK_B, 0)])] };
  api.crApiGetSafe = async (p) => logs[p] || null;
  await withServer(api, async (get, router) => {
    await get('/player/2QQ'); // vermerkt den Besuch
    assert.equal(await router.pollWatched(), 1);
    assert.equal(store.battleStats('2QQ').n, 1);
    assert.equal(await router.pollWatched(), 0); // gerade erst abgefragt
  });
});

test('Ranglisten-Deck mit Turmtruppe', () => {
  const withTower = shape.shapeBattles([battle('20261113T180000.000Z', [side('LQQ', 'T', DECK_A, 1, { supportCards: [{ name: 'Cannoneer', level: 15, maxLevel: 16, rarity: 'epic', iconUrls: { medium: 'cn' } }] })], [side('8YY', 'B', DECK_B, 0)])], 'LQQ', 16);
  store.rememberDecks(shape.rankedDecks(withTower));
  assert.deepEqual(store.getDeck('LQQ').tower, { id: null, name: 'Cannoneer', icon: 'cn' });
});

test('Ranglisten-Deck aus der Zeit vor der Turmtruppe wird einmal nachgeholt, danach nicht mehr', async () => {
  const Database = require('better-sqlite3');
  const tag = 'G2G';
  // Zeile wie vor Nov. 2026: frisch geprüft, aber tower = NULL
  store.rememberDecks([{ tag, t: Date.parse('2026-11-13T18:00:00Z'), cards: shape.shapeBattles([battle('20261113T180000.000Z', [side(tag, 'T', DECK_A, 1)], [side('8YY', 'B', DECK_B, 0)])], tag, 16)[0].team[0].cards }]);
  const raw = new Database(process.env.CR_SCOUT_DB);
  raw.prepare('UPDATE decks SET tower = NULL WHERE tag = ?').run(tag);
  raw.close();
  assert.equal(store.getDeck(tag).towerChecked, false);
  const withTower = [battle('20261113T180000.000Z', [side(tag, 'T', DECK_A, 1, { supportCards: [{ name: 'Cannoneer', rarity: 'epic', iconUrls: { medium: 'cn' } }] })], [side('8YY', 'B', DECK_B, 0)])];
  const api = fakeApi({ [`/players/%23${tag}/battlelog`]: withTower });
  await withServer(api, async (get) => {
    const first = await get(`/decks?tags=${tag}`);
    assert.equal(first.body.towers[tag].name, 'Cannoneer');
    const again = await get(`/decks?tags=${tag}`);
    assert.equal(again.body.towers[tag].name, 'Cannoneer');
    assert.equal(api.calls.filter((c) => c.includes('battlelog')).length, 1); // nur einmal nachgeholt
  });
  // Findet ein Nachholen kein neueres Deck, gilt die Zeile trotzdem als geprüft
  store.rememberDecks([{ tag: 'G2Q', t: 500, cards: [{ id: 'knight' }] }]);
  const raw2 = new Database(process.env.CR_SCOUT_DB);
  raw2.prepare("UPDATE decks SET tower = NULL WHERE tag = 'G2Q'").run();
  raw2.close();
  store.rememberDecks([{ tag: 'G2Q', t: 0, cards: [] }]);
  assert.equal(store.getDeck('G2Q').towerChecked, true);
});

test('Index-Füller: Länder-Ranglisten und Top-Clans landen im Namens-Index, ein Tag Pause dazwischen', async () => {
  const api = fakeApi({});
  const ranking = {
    '/locations/57000001/pathoflegend/players': { items: [{ tag: '#Q2Q', name: 'Landeskönig', rank: 1, eloRating: 2100, clan: { tag: '#C2C', name: 'Dorfclan' } }] },
    '/locations/57000001/rankings/clans': { items: [{ tag: '#C2C', name: 'Dorfclan', rank: 1, clanScore: 50000 }] },
    '/clans/%23C2C': { tag: '#C2C', name: 'Dorfclan', memberList: [{ tag: '#R2R', name: 'Mitglied Eins', trophies: 7000 }, { tag: '#U2U', name: 'Mitglied Zwei', trophies: 6500 }] },
    // Land ohne Rangliste: leere Listen, kein Fehler
    '/locations/57000002/pathoflegend/players': { items: [] },
    '/locations/57000002/rankings/clans': { items: [] },
  };
  api.crApiGetSafe = async (p) => {
    if (p.startsWith('/locations?')) return { items: [{ id: 57000001, isCountry: true }, { id: 57000002, isCountry: true }, { id: 57000000, isCountry: false }] };
    return ranking[p.split('?')[0]] || null;
  };
  await withServer(api, async (get, router) => {
    const stats = await router.indexFeeder.run();
    assert.deepEqual(stats, { countries: 2, players: 1, clans: 1, members: 2 });
    assert.equal(store.searchPlayers('Landeskönig')[0].clan, 'Dorfclan');
    assert.equal(store.searchPlayers('Mitglied Zwei')[0].trophies, 6500);
    assert.equal(store.getValue('indexFeed').value.members, 2);
  });
});

test('Deck-Speicher: ein älterer Kampf überschreibt kein neueres Deck', () => {
  store.rememberDecks([{ tag: 'VVV', t: 200, cards: [{ id: 'knight', variant: 'ev1' }, { id: null, name: 'Neu', icon: 'u' }] }]);
  store.rememberDecks([{ tag: 'VVV', t: 100, cards: [{ id: 'zap' }] }, { tag: 'VVV', t: 0, cards: [] }]);
  assert.deepEqual(store.getDeck('VVV').cards, [{ id: 'knight', variant: 'ev1' }, { id: null, name: 'Neu', icon: 'u' }]);
  assert.equal(store.getDeck('GGG'), null);
});

// ── Frühere Namen + Bewertungen ──────────────────────────────────────────────
test('Frühere Namen: Umbenennung landet in der Liste, ein alter Kampf überschreibt den neuen Namen nicht', () => {
  const t0 = Date.UTC(2026, 10, 1);
  store.rememberPlayers([{ tag: 'J2J', name: 'Alt', at: t0 }]);
  store.rememberPlayers([{ tag: 'J2J', name: 'Neu', clan: 'Neuclan', at: t0 + 1000 }]);
  // ein älterer Kampf mit dem alten Namen und altem Clan kommt danach
  store.rememberPlayers([{ tag: 'J2J', name: 'Alt', clan: 'Altclan', at: t0 + 500 }]);
  assert.deepEqual(store.getPlayer('J2J'), { tag: 'J2J', name: 'Neu', trophies: 0, clan: 'Neuclan' });
  assert.deepEqual(store.formerNames('J2J'), [{ name: 'Alt', t: t0 + 500 }]);
  // ein noch älterer, dritter Name kommt dazu, der aktuelle steht nie in der Liste
  store.rememberPlayers([{ tag: 'J2J', name: 'Uralt', at: t0 - 1000 }]);
  assert.deepEqual(store.formerNames('J2J').map((n) => n.name), ['Alt', 'Uralt']);
  // zurückbenannt: „Alt" ist wieder aktuell, „Neu" wird früherer Name
  store.rememberPlayers([{ tag: 'J2J', name: 'Alt' }]);
  assert.deepEqual(store.formerNames('J2J').map((n) => n.name), ['Neu', 'Uralt']);
});

test('Route Spieler: frühere Namen aus dem Battlelog', async () => {
  const api = fakeApi({
    '/players/%23V2V': { tag: '#V2V', name: 'Heute', cards: DECK_A },
    '/players/%23V2V/battlelog': [battle('20261113T180000.000Z', [side('V2V', 'Gestern', DECK_A, 2)], [side('8YY', 'B', DECK_B, 1)])],
  });
  await withServer(api, async (get) => {
    const r = await get('/player/V2V');
    assert.equal(r.body.profile.name, 'Heute');
    assert.deepEqual(r.body.profile.formerNames.map((n) => n.name), ['Gestern']);
    assert.equal(store.getPlayer('V2V').name, 'Heute');
  });
});

test('Bewertungen: eine Stimme je Konto, umstellbar und zurücknehmbar; ohne Login nur lesen', async () => {
  store.rememberPlayers([{ tag: 'Y2Y', name: 'Bewertet' }]);
  store.setVote('Y2Y', 'a', 1);
  store.setVote('Y2Y', 'b', 1);
  store.setVote('Y2Y', 'c', -1);
  store.setVote('Y2Y', 'a', -1);
  assert.deepEqual(store.voteSummary('Y2Y', 'a'), { up: 1, down: 2, mine: -1 });
  store.setVote('Y2Y', 'a', 0);
  assert.deepEqual(store.voteSummary('Y2Y', 'a'), { up: 1, down: 1, mine: 0 });
  assert.deepEqual(store.voteSummary('Y2Y', null), { up: 1, down: 1, mine: 0 });

  const app = express();
  app.use(express.json());
  const fakeAuth = (req, res, next) => {
    if (!req.headers['x-user']) return res.status(401).json({ error: 'Nicht eingeloggt' });
    req.twitchId = req.headers['x-user'];
    next();
  };
  const optional = (req, res, next) => { req.twitchId = req.headers['x-user'] || undefined; next(); };
  app.use('/s', createScoutRouter({ api: fakeApi({}), store, meta: false, requireAuth: fakeAuth, optionalAuth: optional }));
  const server = http.createServer(app);
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/s`;
  const post = (p, body, user) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : null) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('/player/Y2Y/vote', { value: 1 })).status, 401);
    const ok = await (await post('/player/Y2Y/vote', { value: 1 }, 'd')).json();
    assert.deepEqual(ok, { ok: true, up: 2, down: 1, mine: 1 });
    assert.equal((await post('/player/Y2Y/vote', { value: 5 }, 'd')).status, 400);
    assert.equal((await post('/player/QQ2QQ/vote', { value: 1 }, 'd')).status, 404); // unbekannter Spieler
    const read = await (await fetch(`${base}/player/Y2Y/votes`, { headers: { 'x-user': 'd' } })).json();
    assert.deepEqual(read, { ok: true, up: 2, down: 1, mine: 1 });
  } finally {
    await new Promise((resolve) => { server.close(resolve); });
  }
});
