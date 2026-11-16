// Tests der Zuschauer-Befehle des Win Trackers (winTrackerViewer.js): Befehl erkennen, Einstellungen, Abklingzeit und
// Antworttexte. Reine Funktionen — kein Netz, keine Datenbank; der Overlay-Zustand ist nachgebaut.
const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../winTrackerViewer');

const DECK = [
  { id: 'knight', name: 'Knight', variant: 'ev1' }, { id: 'archer-queen', name: 'Archer Queen', variant: 'hero' },
  { id: 'hog-rider', name: 'Hog Rider' }, { id: 'musketeer', name: 'Musketeer' }, { id: 'fireball', name: 'Fireball' },
  { id: 'the-log', name: 'The Log' }, { id: 'ice-spirit', name: 'Ice Spirit' }, { id: 'skeletons', name: 'Skeletons' },
];
const state = (extra = {}) => ({
  hasAccount: true, playerName: 'Vnm', trophies: 9123, bestTrophies: 9300, leagueNumber: 7, seasonMedals: 2345, polRank: 321,
  league2v2BestTrophies: 0, ladder: null, seasonal: null, daily: { profit: 120, wins: 7, losses: 3, winPct: 70 },
  deck: { mode: 'ranked', cards: DECK }, settings: { trackMode: 'medals' }, ...extra,
});

test('Befehle erkennen: deutsch und englisch, Groß/klein egal, Rest der Zeile egal; Fremdes nicht', () => {
  assert.equal(v.parseViewerCommand('!rang'), 'rang');
  assert.equal(v.parseViewerCommand('!RANK bitte'), 'rang');
  assert.equal(v.parseViewerCommand('  !Session'), 'session');
  assert.equal(v.parseViewerCommand('!record'), 'rekord');
  assert.equal(v.parseViewerCommand('!deck'), 'deck');
  for (const no of ['!rangliste', 'rang', '!tracker set #2PP', '!decks', '', null]) assert.equal(v.parseViewerCommand(no), null, String(no));
});

test('Einstellungen: nur bekannte Befehle in fester Reihenfolge, Abklingzeit aus der Liste', () => {
  assert.deepEqual(v.normalizeViewerCommands('deck,rang,unsinn'), ['rang', 'deck']);
  assert.deepEqual(v.normalizeViewerCommands(['REKORD', 'session']), ['session', 'rekord']);
  assert.deepEqual(v.normalizeViewerCommands(''), []);
  assert.deepEqual(v.normalizeViewerCommands(null), []);
  assert.equal(v.normalizeCooldownS(60), 60);
  assert.equal(v.normalizeCooldownS('15'), 15);
  assert.equal(v.normalizeCooldownS(5), v.DEFAULT_COOLDOWN_S);
});

test('Abklingzeit je Kanal und Befehl; Moderatoren kommen immer durch', () => {
  let t = 0;
  const cd = v.createCooldowns({ now: () => t });
  assert.equal(cd.take('kanal', 'rang', 30), true);
  t = 10_000;
  assert.equal(cd.take('kanal', 'rang', 30), false); // noch gesperrt
  assert.equal(cd.take('kanal', 'deck', 30), true); // anderer Befehl
  assert.equal(cd.take('anderer', 'rang', 30), true); // anderer Kanal
  assert.equal(cd.take('kanal', 'rang', 30, true), true); // Moderator
  t = 39_000;
  assert.equal(cd.take('kanal', 'rang', 30), false); // die Mod-Antwort hat die Zeit neu gestartet
  t = 41_000;
  assert.equal(cd.take('kanal', 'rang', 30), true);
});

test('!rang: Ultimate Champion mit Medaillen und Platz, darunter Liga und Stufe, dazu Trophäen', () => {
  assert.equal(v.viewerReply('rang', { state: state() }), 'Vnm: Ultimate Champion · 2.345 Medaillen · Platz 321 · 9.123 Trophäen');
  assert.equal(v.viewerReply('rang', { state: state({ leagueNumber: 5, ladder: { step: 3, maxSteps: 5, sessionDelta: 2 } }) }),
    'Vnm: Liga 5 · Stufe 3/5 · 9.123 Trophäen');
  assert.equal(v.viewerReply('rang', { state: state({ leagueNumber: 0 }), lang: 'en' }), 'Vnm: not in ranked yet · 9,123 trophies');
  assert.equal(v.viewerReply('rang', { state: state({ polRank: null }), lang: 'en' }), 'Vnm: Ultimate Champion · 2,345 medals · 9,123 trophies');
});

test('!session: Bilanz des getrackten Modus mit passender Einheit', () => {
  assert.equal(v.viewerReply('session', { state: state() }), 'Session Ranked (Medaillen): 7 Siege, 3 Niederlagen (70 %) · +120 Medaillen');
  // unterhalb von UC zählen Stufen
  assert.equal(v.viewerReply('session', { state: state({ leagueNumber: 4, ladder: { step: 2, maxSteps: 5, sessionDelta: -1 } }) }),
    'Session Ranked (Medaillen): 7 Siege, 3 Niederlagen (70 %) · -1 Stufen');
  assert.equal(v.viewerReply('session', { state: state({ settings: { trackMode: 'trophies' }, daily: { profit: -60, wins: 1, losses: 3, winPct: 25 } }), lang: 'en' }),
    'Trophy Road session: 1 win, 3 losses (25%) · -60 trophies');
  // Challenge: nur Siege und Niederlagen
  assert.equal(v.viewerReply('session', { state: state({ settings: { trackMode: 'c:grand' } }) }), 'Session Grand Challenge: 7 Siege, 3 Niederlagen (70 %)');
  // Saison-Modus trägt seinen eigenen Namen
  assert.match(v.viewerReply('session', { state: state({ settings: { trackMode: 's:Halloween' }, seasonal: { label: 'Halloween-Pfad' } }) }), /^Session Halloween-Pfad: /);
  assert.equal(v.viewerReply('session', { state: state({ daily: { profit: 0, wins: 0, losses: 0, winPct: 0 } }) }), 'Session Ranked (Medaillen): noch kein Spiel.');
});

test('!deck: Karten mit gespielter Form und Link zur Deck-Seite (Adresse wie im Frontend: sortiert)', () => {
  const de = v.viewerReply('deck', { state: state() });
  assert.equal(de, 'Deck · Ranked (Medaillen): Knight (Evo), Archer Queen (Held), Hog Rider, Musketeer, Fireball, The Log, Ice Spirit, Skeletons'
    + ' → https://vnmvalentin.de/clash/decks/archer-queen,fireball,hog-rider,ice-spirit,knight,musketeer,skeletons,the-log');
  assert.match(v.viewerReply('deck', { state: state(), lang: 'en' }), /Archer Queen \(Hero\).*\?lang=en$/);
  // unbekannte Karte: Name statt ID im Link (wie scoutUtil.deckPath)
  const withNew = DECK.slice(0, 7).concat({ id: null, name: 'Neue Karte' });
  assert.match(v.deckUrl(withNew, 'de'), /n%3ANeue%20Karte/);
  // ohne volles Deck kein Link, ohne Deck ein Hinweis
  assert.equal(v.viewerReply('deck', { state: state({ deck: { cards: DECK.slice(0, 5) } }) }).includes('→'), false);
  assert.equal(v.viewerReply('deck', { state: state({ deck: null }) }), 'Noch kein Deck erfasst.');
});

test('!rekord: Trophäen-Bestwert, Saison-Medaillen und bester Platz aus dem Verlauf; ohne Werte ein Hinweis', () => {
  assert.equal(v.viewerReply('rekord', { state: state(), record: { seasonMedals: 2600, seasonRank: 150, bestTrophies: 9200 } }),
    'Vnm – Rekorde: Trophäenstraße 9.300 · diese Saison bis 2.600 Medaillen · bester Platz 150');
  assert.equal(v.viewerReply('rekord', { state: state({ bestTrophies: 0, league2v2BestTrophies: 1800 }), lang: 'en' }), 'Vnm – records: 2v2 1,800 medals');
  assert.equal(v.viewerReply('rekord', { state: state({ bestTrophies: 0 }) }), 'Vnm: noch keine Rekorde erfasst.');
});

test('Ohne verknüpften Account ein Hinweis statt Zahlen; lange Antworten werden gekürzt', () => {
  assert.equal(v.viewerReply('rang', { state: { hasAccount: false } }), 'Noch kein Account im Win Tracker verknüpft.');
  const long = v.viewerReply('deck', { state: state({ deck: { cards: DECK.map((c) => ({ ...c, name: c.name.repeat(12) })) } }) });
  assert.ok(long.length <= 480);
  assert.ok(long.endsWith('…'));
});
