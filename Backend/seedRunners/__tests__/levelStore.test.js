// Speicher der veröffentlichten Level (levelStore.js): Anlegen, Suchen, Sortieren, Zählen, Bestenlisten, Sterne, Favoriten, Meldungen, Sperren.
// Synthetische Level — schnell, ohne Worker. Die Datenbank liegt in einem Wegwerf-Ordner.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { createStore } = require('../store');
const { KEEP_RUN_LOGS, PLAY_GAP_MS } = require('../levelStore');

function rig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-lstore-'));
  const store = createStore(path.join(dir, 'test.db'));
  return { store, L: store.levels, cleanup: () => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

let n = 0;
function level(over = {}) {
  n++;
  return {
    code: `SR-AAA-${String(n).padStart(3, '2').replace(/[^A-Z2-9]/g, '2')}`.slice(0, 10),
    accountId: '100', creatorName: 'Alice', name: `Level ${n}`, description: '', tags: [], difficulty: null, biome: 'meadow', speedClass: 'normal',
    width: 40, height: 20, elements: 0, contentHash: String(n).padStart(64, 'a').replace(/[^a-f0-9]/g, 'b'),
    doc: { version: 1, width: 40, height: 20, tiles: ['.'], elements: [] }, preview: { w: 1, h: 1, scale: 1, rows: ['.'] },
    simFp: 'fp1', creatorTicks: 900, creatorDeaths: 1, creatorSplits: [[1, 400]], creatorLog: [0, 2], createdAt: 1000 + n, ...over,
  };
}

// Eindeutige Codes ohne Gefummel
let codeCounter = 0;
const nextCode = () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let x = codeCounter++;
  let s = '';
  for (let i = 0; i < 6; i++) { s += alphabet[x % alphabet.length]; x = Math.floor(x / alphabet.length); }
  return `SR-${s.slice(0, 3)}-${s.slice(3)}`;
};
const make = (L, over = {}) => {
  const l = level({ ...over });
  l.code = over.code || nextCode();
  return { id: L.insertLevel(l), ...l };
};

test('Anlegen und Lesen: Angaben, Dokument (komprimiert, unverändert zurück), Ersteller-Lauf', () => {
  const { L, cleanup } = rig();
  try {
    const l = make(L, { name: 'Mein Level', tags: ['schwer', 'lang'], difficulty: 4, doc: { version: 1, tiles: ['#'.repeat(500)], elements: [{ type: 'spike', tx: 1, ty: 1 }] } });
    const got = L.byCode(l.code);
    assert.equal(got.name, 'Mein Level');
    assert.deepEqual(got.tags, ['schwer', 'lang']);
    assert.equal(got.difficulty, 4);
    assert.equal(got.status, 'published');
    assert.deepEqual([got.plays, got.players, got.clears, got.ratingCount, got.ratingAvg], [0, 0, 0, 0, null]);
    assert.deepEqual(L.docOf(got.id), l.doc);
    assert.deepEqual(L.creatorRun(got.id), { simFp: 'fp1', ticks: 900, deaths: 1, splits: [[1, 400]], log: [0, 2] });
    assert.equal(L.byCode('SR-ZZZ-ZZZ'), null);
    assert.equal(L.byHash(l.contentHash).code, l.code);
    assert.equal(L.docOf(99999), null);
  } finally {
    cleanup();
  }
});

test('Ein Inhalt (Hash) ist nur einmal vergeben; gelöschte Level geben ihn wieder frei; Codes sind eindeutig', () => {
  const { L, cleanup } = rig();
  try {
    const a = make(L, { contentHash: 'c'.repeat(64) });
    assert.throws(() => make(L, { contentHash: 'c'.repeat(64) }), /UNIQUE/);
    assert.throws(() => make(L, { code: a.code }), /UNIQUE/);
    L.setStatus(a.id, 'deleted', 'weg', 5000);
    assert.equal(L.byHash('c'.repeat(64)), null);
    assert.ok(make(L, { contentHash: 'c'.repeat(64) }));
  } finally {
    cleanup();
  }
});

test('Zählen je Konto: aktive Level und Veröffentlichungen im Zeitfenster', () => {
  const { L, cleanup } = rig();
  try {
    const a = make(L, { createdAt: 1000 });
    make(L, { createdAt: 2000 });
    make(L, { accountId: '200', createdAt: 2500 });
    assert.equal(L.countActive('100'), 2);
    assert.equal(L.countCreatedSince('100', 1500), 1);
    assert.equal(L.countCreatedSince('100', 0), 2);
    L.setStatus(a.id, 'deleted', null, 3000);
    assert.equal(L.countActive('100'), 1, 'gelöschte zählen nicht als aktiv');
    assert.equal(L.countCreatedSince('100', 0), 2, 'aber sehr wohl fürs Stundenlimit (kein Umgehen durch Löschen)');
  } finally {
    cleanup();
  }
});

test('Suche: Name, Ersteller und Tags, ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute; Sonderzeichen sind kein Muster', () => {
  const { L, cleanup } = rig();
  try {
    make(L, { name: 'Über den Wolken', creatorName: 'Alice', tags: ['himmel'] });
    make(L, { name: 'Feuer 100%', creatorName: 'Bob', tags: ['lava', 'schwer'] });
    make(L, { name: 'Unter_Tage', creatorName: 'Carol', tags: [] });
    const names = (q) => L.list({ q }).items.map((l) => l.name).sort();
    assert.deepEqual(names('WOLKEN'), ['Über den Wolken']);
    assert.deepEqual(names('über'), ['Über den Wolken']);
    assert.deepEqual(names('bob'), ['Feuer 100%'], 'Ersteller');
    assert.deepEqual(names('lava'), ['Feuer 100%'], 'Tag');
    assert.deepEqual(names('100%'), ['Feuer 100%'], '% zählt als Zeichen');
    assert.deepEqual(names('_'), ['Unter_Tage'], '_ zählt als Zeichen, nicht als Joker');
    assert.deepEqual(names('%'), ['Feuer 100%']);
    assert.deepEqual(names('nichts da'), []);
    assert.equal(L.list({ tag: 'schwer' }).total, 1);
    assert.equal(L.list({ tag: 'sch' }).total, 0, 'Tag-Filter passt nur ganze Tags');
  } finally {
    cleanup();
  }
});

test('Suche nach Code: genau ein Level; ein Suchwort in Code-Form findet zusätzlich Namen', () => {
  const { L, cleanup } = rig();
  try {
    const a = make(L, { name: 'Erstes' });
    make(L, { name: 'Zweites' });
    make(L, { name: 'abcdef' });
    assert.deepEqual(L.list({ code: a.code }).items.map((l) => l.name), ['Erstes']);
    assert.deepEqual(L.list({ code: 'SR-ABC-DEF', q: 'abcdef' }).items.map((l) => l.name), ['abcdef'], 'ein Name in Code-Form wird trotzdem gefunden');
  } finally {
    cleanup();
  }
});

test('Filter: Schwierigkeit, Tempo-Klasse, Konto; nur veröffentlichte sind standardmäßig sichtbar', () => {
  const { L, cleanup } = rig();
  try {
    make(L, { difficulty: 2, speedClass: 'normal' });
    make(L, { difficulty: 4, speedClass: 'fast', accountId: '200' });
    const hidden = make(L, { difficulty: 4, speedClass: 'fast' });
    L.setStatus(hidden.id, 'hidden', 'x', 9);
    assert.equal(L.list({ difficulty: 4 }).total, 1);
    assert.equal(L.list({ speedClass: 'fast' }).total, 1);
    assert.equal(L.list({ accountId: '100' }).total, 1);
    assert.equal(L.list({ accountId: '100', statuses: ['published', 'hidden'] }).total, 2);
    assert.equal(L.list({ statuses: ['deleted'] }).total, 0);
  } finally {
    cleanup();
  }
});

test('Sortierung: neu, beliebt, bestbewertet (nur mit Sternen, geglättet), am schwersten (erst ab 3 Spielern), zufällig', () => {
  const { L, cleanup } = rig();
  try {
    const a = make(L, { name: 'A', createdAt: 1000 });
    const b = make(L, { name: 'B', createdAt: 2000 });
    const c = make(L, { name: 'C', createdAt: 3000 });
    const d = make(L, { name: 'D', createdAt: 4000 });
    // Spieler (davon geschafft): A 10 (9), B 10 (2), C 2 (0 — zu dünn), D 0
    const play = (id, players, clears) => {
      for (let i = 0; i < players; i++) {
        if (i < clears) L.markCleared(id, `k:${id}-${i}`, 1);
        else L.touchPlayer(id, `k:${id}-${i}`, 1);
      }
    };
    play(a.id, 10, 9); play(b.id, 10, 2); play(c.id, 2, 0);
    L.rate(`c:${a.code}`, 'a:u1', 4, 1);                                  // eine 4: geglättet (4 + 6) / 3 = 3,33
    L.rate(`c:${c.code}`, 'a:u1', 5, 1); L.rate(`c:${c.code}`, 'a:u2', 5, 1); // zwei 5er: (10 + 6) / 4 = 4
    const order = (sort) => L.list({ sort }).items.map((l) => l.name).join('');

    assert.equal(order('new'), 'DCBA');
    assert.equal(order('popular'), 'ABCD', 'Spiele + 3 × Bewertungen: A 13, B 10, C 8, D 0');
    assert.equal(order('rated'), 'CADB', 'C: 4, A: 3,33; ohne Sterne danach, neueste zuerst');
    assert.equal(order('hardest'), 'BACD', 'B: 20 % geschafft, A: 90 %; dünn gespielte danach');
    assert.equal(order('unbekannt'), 'DCBA', 'unbekannte Sortierung: wie neu');

    const seen = new Set();
    for (let i = 0; i < 12; i++) seen.add(order('random'));
    assert.ok(seen.size > 1, 'zufällig ist nicht immer gleich');
    assert.ok([...seen].every((s) => [...s].sort().join('') === 'ABCD'), 'aber immer alle');
    void d;
  } finally {
    cleanup();
  }
});

test('Seiten: Gesamtzahl und Ausschnitt', () => {
  const { L, cleanup } = rig();
  try {
    for (let i = 0; i < 7; i++) make(L, { name: `L${i}`, createdAt: 1000 + i });
    const p1 = L.list({ sort: 'new', limit: 3, offset: 0 });
    const p3 = L.list({ sort: 'new', limit: 3, offset: 6 });
    assert.equal(p1.total, 7);
    assert.deepEqual(p1.items.map((l) => l.name), ['L6', 'L5', 'L4']);
    assert.deepEqual(p3.items.map((l) => l.name), ['L0']);
    assert.equal(L.list({ limit: 3, offset: 30 }).items.length, 0);
  } finally {
    cleanup();
  }
});

test('Spieler und Zählung: ein Versuch zählt erst nach einer Pause erneut; geschafft zählt einmal; Abschlussquote', () => {
  const { L, cleanup } = rig();
  try {
    const l = make(L);
    assert.equal(L.hasAttempt(l.id, 'k:x'), false);
    assert.deepEqual(L.touchPlayer(l.id, 'k:x', 1000), { newPlayer: true, counted: true });
    assert.deepEqual(L.touchPlayer(l.id, 'k:x', 1000 + PLAY_GAP_MS - 1), { newPlayer: false, counted: false }, 'zu schnell hintereinander');
    assert.deepEqual(L.touchPlayer(l.id, 'k:x', 1000 + PLAY_GAP_MS), { newPlayer: false, counted: true });
    assert.equal(L.hasAttempt(l.id, 'k:x'), true);
    let row = L.byId(l.id);
    assert.deepEqual([row.plays, row.players, row.clears], [2, 1, 0]);

    assert.deepEqual(L.markCleared(l.id, 'k:x', 99999), { newClear: true });
    assert.deepEqual(L.markCleared(l.id, 'k:x', 99999), { newClear: false }, 'einmal pro Person');
    // Direkt im Ziel, ohne vorherigen Versuch (Beacon verloren): zählt als Spieler UND als geschafft
    assert.deepEqual(L.markCleared(l.id, 'k:y', 1), { newClear: true });
    row = L.byId(l.id);
    assert.deepEqual([row.plays, row.players, row.clears], [3, 2, 2]);
    assert.equal(L.hasAttempt(l.id, 'a:100'), false, 'Konto und Gast sind verschiedene Identitäten');
  } finally {
    cleanup();
  }
});

test('Bestenliste: nur eine schnellere Zeit ersetzt die alte; Rang; Gleichstand nach Eingang; Logs nur für die Besten', () => {
  const { L, cleanup } = rig();
  try {
    const l = make(L);
    const run = (playerKey, ticks, createdAt, over = {}) => L.saveRun({ levelId: l.id, playerKey, playerName: playerKey.toUpperCase(), ticks, deaths: 0, log: [0, 2, ticks, 0], simFp: 'fp1', createdAt, ...over });
    assert.equal(run('a', 900, 10), true);
    assert.equal(run('a', 950, 20), false, 'langsamer');
    assert.equal(run('a', 900, 30), false, 'gleich');
    assert.equal(run('a', 850, 40), true);
    run('b', 850, 50);                       // Gleichstand mit a, aber später
    run('c', 700, 60);
    assert.deepEqual(L.board(l.id).map((e) => [e.rank, e.name, e.ticks]), [[1, 'C', 700], [2, 'A', 850], [3, 'B', 850]]);
    assert.equal(L.rankOf(l.id, 850, 40), 2);
    assert.equal(L.rankOf(l.id, 850, 50), 3);
    assert.equal(L.runCount(l.id), 3);
    assert.equal(L.getRun(l.id, 'a').ticks, 850);

    // Läufe gegen ältere Physik werden ersetzt, auch wenn sie langsamer sind
    assert.equal(run('b', 900, 70, { simFp: 'fp2' }), true);
    assert.equal(L.getRun(l.id, 'b').ticks, 900);

    // Nur die besten 50 behalten ihr Log
    for (let i = 0; i < 60; i++) run(`p${i}`, 1000 + i, 100 + i);
    const board = L.board(l.id, 100);
    assert.equal(board.length, 63);
    const withGhost = board.filter((e) => e.hasGhost);
    assert.equal(withGhost.length, KEEP_RUN_LOGS);
    assert.ok(board.slice(0, KEEP_RUN_LOGS).every((e) => e.hasGhost), 'die schnellsten');
    assert.equal(L.runGhost(l.id, board[0].runId).ticks, 700);
    assert.equal(L.runGhost(l.id, board[62].runId), null, 'kein Log mehr → kein Geist');
    assert.equal(L.runGhost(l.id + 1, board[0].runId), null, 'ein Lauf gehört zu seinem Level');
  } finally {
    cleanup();
  }
});

test('Sterne: eine Stimme je Person (ändern ersetzt), Schnitt und Anzahl folgen — auch in sr_levels', () => {
  const { L, cleanup } = rig();
  try {
    const l = make(L);
    const key = `c:${l.code}`;
    assert.deepEqual(L.rate(key, 'a:u1', 5, 1), { count: 1, avg: 5 });
    assert.deepEqual(L.rate(key, 'a:u1', 3, 2), { count: 1, avg: 3 }, 'ändern ersetzt');
    assert.deepEqual(L.rate(key, 'k:gast', 4, 3), { count: 2, avg: 3.5 });
    assert.equal(L.myRating(key, 'a:u1'), 3);
    assert.deepEqual([L.byId(l.id).ratingCount, L.byId(l.id).ratingAvg], [2, 3.5]);
    assert.deepEqual(L.rate(key, 'a:u1', null, 4), { count: 1, avg: 4 }, 'zurücknehmen');
    assert.equal(L.myRating(key, 'a:u1'), null);
    assert.deepEqual(L.ratingOf(key), { count: 1, avg: 4 });
    L.rate(key, 'k:gast', null, 5);
    assert.deepEqual(L.ratingOf(key), { count: 0, avg: null });
    assert.deepEqual([L.byId(l.id).ratingCount, L.byId(l.id).ratingAvg], [0, null]);
  } finally {
    cleanup();
  }
});

test('Sterne für Zufallslevel und die Bestenliste der Zufallslevel (geglättet, nur p:-Schlüssel)', () => {
  const { L, cleanup } = rig();
  try {
    L.rate('p:abc|random', 'k:1', 5, 1);                               // (5 + 6) / 3 = 3,67
    L.rate('p:def|ice', 'k:1', 5, 1); L.rate('p:def|ice', 'k:2', 4, 1); // (9 + 6) / 4 = 3,75
    L.rate('p:ghi|cave', 'k:1', 1, 1);
    const l = make(L);
    L.rate(`c:${l.code}`, 'k:1', 5, 1);
    assert.deepEqual(L.topRated('p:').map((t) => t.key), ['p:def|ice', 'p:abc|random', 'p:ghi|cave']);
    assert.deepEqual(L.topRated('p:', { minCount: 2 }).map((t) => t.key), ['p:def|ice']);
    assert.equal(L.topRated('p:', { limit: 1 }).length, 1);
  } finally {
    cleanup();
  }
});

test('Favoriten: setzen, Info aktualisieren, entfernen, neueste zuerst', () => {
  const { L, cleanup } = rig();
  try {
    L.setFavorite('k:1', 'p:abc|random', { leitidee: 'seilakt' }, 10);
    L.setFavorite('k:1', 'c:SR-AAA-AAA', {}, 20);
    L.setFavorite('k:1', 'p:abc|random', { leitidee: 'taktwerk' }, 30);
    assert.deepEqual(L.favorites('k:1').map((f) => [f.key, f.info.leitidee]), [['c:SR-AAA-AAA', undefined], ['p:abc|random', 'taktwerk']]);
    assert.equal(L.isFavorite('k:1', 'p:abc|random'), true);
    assert.equal(L.isFavorite('k:2', 'p:abc|random'), false);
    assert.equal(L.favoriteCount('k:1'), 2);
    assert.equal(L.removeFavorite('k:1', 'p:abc|random'), true);
    assert.equal(L.removeFavorite('k:1', 'p:abc|random'), false);
    assert.equal(L.favoriteCount('k:1'), 1);
  } finally {
    cleanup();
  }
});

test('Anmelden: Sterne und Favoriten des Gasts gehen aufs Konto über; was das Konto schon hat, gewinnt', () => {
  const { L, cleanup } = rig();
  try {
    L.rate('p:a|random', 'k:g', 2, 1);
    L.rate('p:b|random', 'k:g', 4, 1);
    L.rate('p:b|random', 'a:1', 5, 1);                    // das Konto hat b schon bewertet
    L.setFavorite('k:g', 'p:a|random', {}, 1);
    L.setFavorite('k:g', 'p:b|random', {}, 1);
    L.setFavorite('a:1', 'p:b|random', {}, 2);
    L.adoptVoter('k:g', 'a:1', 3);
    assert.equal(L.myRating('p:a|random', 'a:1'), 2);
    assert.equal(L.myRating('p:b|random', 'a:1'), 5, 'die Stimme des Kontos bleibt');
    assert.deepEqual(L.ratingOf('p:b|random'), { count: 1, avg: 5 }, 'die doppelte Gast-Stimme ist weg');
    assert.equal(L.myRating('p:a|random', 'k:g'), null);
    assert.deepEqual(L.favorites('a:1').map((f) => f.key).sort(), ['p:a|random', 'p:b|random']);
    assert.equal(L.favoriteCount('k:g'), 0);
  } finally {
    cleanup();
  }
});

test('Umstieg: bisherige Likes zählen einmalig als 5 Sterne desselben Kontos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-lstore-mig-'));
  const file = path.join(dir, 'alt.db');
  try {
    // Eine Datenbank im alten Stand: ohne Sterne-Spalten, mit zwei Likes
    let store = createStore(file);
    const l = make(store.levels);
    store.close();
    const raw = new Database(file);
    raw.exec('ALTER TABLE sr_levels DROP COLUMN rating_count');
    raw.exec('ALTER TABLE sr_levels DROP COLUMN rating_sum');
    raw.exec('DELETE FROM sr_ratings; DELETE FROM sr_rating_stats');
    raw.prepare('INSERT INTO sr_level_likes (level_id, account_id, created_at) VALUES (?, ?, ?)').run(l.id, 'u1', 5);
    raw.prepare('INSERT INTO sr_level_likes (level_id, account_id, created_at) VALUES (?, ?, ?)').run(l.id, 'u2', 6);
    raw.close();

    store = createStore(file);
    const got = store.levels.byId(l.id);
    assert.deepEqual([got.ratingCount, got.ratingAvg], [2, 5]);
    assert.equal(store.levels.myRating(`c:${l.code}`, 'a:u1'), 5);
    store.close();
    store = createStore(file);                            // ein zweiter Start zählt nicht noch einmal
    assert.equal(store.levels.byId(l.id).ratingCount, 2);
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Meldungen: pro Konto einmal je Level, gruppiert je Level, lösen sich auf', () => {
  const { L, cleanup } = rig();
  try {
    const a = make(L, { name: 'A' });
    const b = make(L, { name: 'B' });
    assert.equal(L.addReport({ levelId: a.id, accountId: 'u1', reason: 'anstoessig', note: 'Text', at: 10 }), true);
    assert.equal(L.addReport({ levelId: a.id, accountId: 'u1', reason: 'sonstiges', at: 11 }), false, 'dasselbe Konto meldet nicht zweimal');
    L.addReport({ levelId: a.id, accountId: 'u2', reason: 'unspielbar', at: 12 });
    L.addReport({ levelId: b.id, accountId: 'u1', reason: 'kopie', at: 13 });
    assert.equal(L.openReportCount(a.id), 2);
    const groups = L.openReports();
    assert.equal(groups.length, 2);
    const ga = groups.find((g) => g.level.name === 'A');
    assert.equal(ga.count, 2);
    assert.deepEqual(ga.reports.map((r) => r.reason).sort(), ['anstoessig', 'unspielbar']);
    assert.equal(L.resolveReports(a.id, 'actioned'), 2);
    assert.equal(L.openReports().length, 1);
    const id = L.openReports()[0].reports[0].id;
    assert.equal(L.dismissReport(id), true);
    assert.equal(L.dismissReport(id), false);
    assert.equal(L.openReports().length, 0);
    // gelöschte Level tauchen nicht mehr in der Moderationsliste auf
    L.addReport({ levelId: b.id, accountId: 'u3', reason: 'sonstiges', at: 20 });
    L.setStatus(b.id, 'deleted', null, 21);
    assert.equal(L.openReports().length, 0);
  } finally {
    cleanup();
  }
});

test('Sperren: blendet alle Level des Kontos aus, Entsperren nur die dadurch ausgeblendeten', () => {
  const { L, cleanup } = rig();
  try {
    const a = make(L, { name: 'A' });
    const b = make(L, { name: 'B' });
    const other = make(L, { name: 'Fremd', accountId: '200' });
    L.setStatus(b.id, 'hidden', 'Von der Moderation ausgeblendet', 5);     // schon vorher aus anderem Grund ausgeblendet
    assert.equal(L.isBanned('100'), false);
    assert.equal(L.ban('100', 'Spam', 10), 1, 'nur das veröffentlichte wird ausgeblendet');
    assert.equal(L.isBanned('100'), true);
    assert.equal(L.byId(a.id).status, 'hidden');
    assert.equal(L.byId(other.id).status, 'published');
    assert.deepEqual(L.bans().map((x) => [x.accountId, x.reason]), [['100', 'Spam']]);
    assert.equal(L.unban('100', 20), 1, 'nur das wegen der Sperre ausgeblendete kommt zurück');
    assert.equal(L.byId(a.id).status, 'published');
    assert.equal(L.byId(b.id).status, 'hidden');
    assert.equal(L.isBanned('100'), false);
  } finally {
    cleanup();
  }
});

test('Neu-Prüfung: veraltete Level und Läufe werden gefunden', () => {
  const { L, cleanup } = rig();
  try {
    const old = make(L, { simFp: 'alt' });
    make(L, { simFp: 'neu' });
    const hidden = make(L, { simFp: 'alt' });
    L.setStatus(hidden.id, 'hidden', 'x', 5);
    assert.deepEqual(L.staleLevels('neu').map((l) => l.id), [old.id], 'nur veröffentlichte mit anderem Stand');

    L.saveRun({ levelId: old.id, playerKey: 'a', playerName: 'A', ticks: 900, deaths: 0, log: [0, 2], simFp: 'alt', createdAt: 1 });
    L.saveRun({ levelId: old.id, playerKey: 'b', playerName: 'B', ticks: 950, deaths: 0, log: [0, 2], simFp: 'neu', createdAt: 2 });
    assert.deepEqual(L.levelsWithStaleRuns('neu'), [old.id]);
    const stale = L.staleRuns(old.id, 'neu');
    assert.deepEqual(stale.map((r) => r.ticks), [900]);
    L.setRunSim(stale[0].id, 'neu');
    assert.deepEqual(L.levelsWithStaleRuns('neu'), []);

    L.setCreatorRun(old.id, { simFp: 'neu', ticks: 800, deaths: 0, splits: [], log: [0, 2, 5, 0] }, 9);
    assert.deepEqual(L.staleLevels('neu'), []);
    assert.deepEqual(L.creatorRun(old.id).log, [0, 2, 5, 0]);
  } finally {
    cleanup();
  }
});

test('Ersteller-Statistik und Metadaten ändern', () => {
  const { L, cleanup } = rig();
  try {
    const a = make(L, { name: 'A' });
    const b = make(L, { name: 'B' });
    L.touchPlayer(a.id, 'k:1', 1); L.markCleared(a.id, 'k:1', 2); L.rate(`c:${a.code}`, 'a:u1', 4, 1); L.touchPlayer(b.id, 'k:2', 1);
    assert.deepEqual(L.creatorStats('100'), { name: 'Alice', levels: 2, plays: 2, ratings: 1, ratingAvg: 4, clears: 1 });
    assert.equal(L.creatorStats('999').name, null);
    L.updateMeta(a.id, { name: 'Neuer Name', description: 'Neu', tags: ['x1'], difficulty: 3, biome: 'cave', creatorName: 'Alice' }, 50);
    const got = L.byId(a.id);
    assert.deepEqual([got.name, got.description, got.tags, got.difficulty, got.biome, got.updatedAt], ['Neuer Name', 'Neu', ['x1'], 3, 'cave', 50]);
    assert.deepEqual(L.list({ q: 'neuer' }).items.map((l) => l.id), [a.id], 'die Suche findet den neuen Namen');
    assert.equal(L.list({ q: 'A' }).items.some((l) => l.id === a.id), true);
  } finally {
    cleanup();
  }
});
