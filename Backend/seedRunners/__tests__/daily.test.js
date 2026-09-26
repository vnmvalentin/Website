// Tests der Tages-Rangliste: Speicher (store.js), Regeln (daily.js) und HTTP-Schnittstelle (routes.js).
// Die Datenbank liegt in einem Wegwerf-Ordner — nie gegen Backend/data/*.db testen. Der Prüfer ist ein
// Doppelgänger; die echte Prüfung testen replay.test.js und verifier.test.js.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { createStore } = require('../store');
const { createDailyService, dailyParams, dailyDateOf, dailyKeyFromToken, previousDay } = require('../daily');
const { createSeedRunnersRouter } = require('../routes');

const KEY_A = dailyKeyFromToken('token-a-abcdefgh');
const KEY_B = dailyKeyFromToken('token-b-abcdefgh');
const KEY_C = dailyKeyFromToken('token-c-abcdefgh');
const LOG = [0, 1, 300, 0];
const DAY = '2026-09-21';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-test-'));
  const store = createStore(path.join(dir, 'test.db'));
  return { store, cleanup: () => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

// ── Speicher ────────────────────────────────────────────────────────────────

test('Speicher: nur eine bessere Zeit ersetzt die bisherige; Rangliste nach Zeit, Gleichstand nach Eingang', () => {
  const { store, cleanup } = tempStore();
  try {
    const run = (playerKey, ticks, createdAt, name = 'X') => store.saveRun({
      dateKey: DAY, playerKey, playerName: name, ticks, deaths: 1, splits: [[1, 10]], log: LOG, simFp: 'fp', source: 'solo', createdAt,
    });
    assert.equal(run(KEY_A, 5000, 100, 'Anna'), true);
    assert.equal(run(KEY_A, 5200, 200), false, 'schlechter: bleibt beim alten');
    assert.equal(run(KEY_A, 5000, 300), false, 'gleich: bleibt beim alten');
    assert.equal(store.getRun(DAY, KEY_A).ticks, 5000);
    assert.equal(run(KEY_A, 4800, 400, 'Anna II'), true, 'besser: ersetzt, auch den Namen');
    assert.equal(store.getRun(DAY, KEY_A).name, 'Anna II');
    run(KEY_B, 4800, 500, 'Bob');       // Gleichstand mit Anna, aber später
    run(KEY_C, 4000, 600, 'Cleo');

    const board = store.getBoard(DAY);
    assert.deepEqual(board.map((e) => [e.rank, e.name]), [[1, 'Cleo'], [2, 'Anna II'], [3, 'Bob']]);
    assert.equal(store.count(DAY), 3);
    assert.equal(store.rankOf(DAY, 4800, 400), 2);
    assert.equal(store.rankOf(DAY, 4800, 500), 3);
    assert.equal(store.getBoard('2026-09-20').length, 0, 'andere Tage sind getrennt');
    assert.deepEqual(store.getRun(DAY, KEY_A).log, LOG);
    assert.deepEqual(store.getRun(DAY, KEY_A).splits, [[1, 10]]);
  } finally {
    cleanup();
  }
});

test('Speicher: alte Logs werden gelöscht, die Einträge bleiben', () => {
  const { store, cleanup } = tempStore();
  try {
    for (const [dateKey, key] of [['2026-09-01', KEY_A], ['2026-09-20', KEY_B]]) {
      store.saveRun({ dateKey, playerKey: key, playerName: 'X', ticks: 5000, deaths: 0, splits: [], log: LOG, simFp: 'fp', source: 'solo' });
    }
    assert.equal(store.pruneLogs('2026-09-10'), 1);
    assert.equal(store.getRun('2026-09-01', KEY_A).log, null);
    assert.equal(store.getRun('2026-09-01', KEY_A).ticks, 5000);
    assert.deepEqual(store.getRun('2026-09-20', KEY_B).log, LOG);
  } finally {
    cleanup();
  }
});

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

test('Tages-Level erkennen, Vortag berechnen, Schlüssel ableiten', () => {
  assert.equal(dailyDateOf(dailyParams(DAY)), DAY);
  assert.equal(dailyDateOf({ ...dailyParams(DAY), length: 'long' }), null, 'anderes Level');
  assert.equal(dailyDateOf({ seed: 'abc', length: 'medium', speedClass: 'normal', biome: 'random' }), null);
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(previousDay('2027-01-01'), '2026-12-31');
  assert.match(KEY_A, /^[a-f0-9]{64}$/);
  assert.notEqual(KEY_A, KEY_B);
  assert.equal(dailyKeyFromToken('token-a-abcdefgh'), KEY_A);
});

// ── Regeln ───────────────────────────────────────────────────────────────────

function service({ verdict = { status: 'ok' }, now = Date.UTC(2026, 8, 21, 12, 0), today = DAY } = {}) {
  const { store, cleanup } = tempStore();
  const calls = [];
  const verifier = {
    verify: async (job) => {
      calls.push(job);
      const v = typeof verdict === 'function' ? verdict(job) : verdict;
      return v.status === 'ok' ? { status: 'ok', ticks: job.ticks, deaths: 2, splits: [[1, 50]], ...v } : v;
    },
  };
  const daily = createDailyService({ store, verifier, todayKey: () => today, now: () => now });
  return { daily, store, calls, cleanup };
}

const submission = (over = {}) => ({ dateKey: DAY, playerKey: KEY_A, name: 'Anna', ticks: 5000, deaths: 3, log: LOG, fp: 'fp1', ...over });

test('Einsendung: Prüfung mit den Parametern des Tages-Levels, danach steht sie in der Liste', async () => {
  const { daily, calls, cleanup } = service();
  try {
    const res = await daily.submit(submission());
    assert.equal(res.status, 'ok');
    assert.equal(res.rank, 1);
    assert.deepEqual(res.entry, { name: 'Anna', ticks: 5000, deaths: 2 }, 'Tode stammen aus dem Nachspielen');
    assert.deepEqual(calls[0].params, dailyParams(DAY), 'Parameter vom Server, nicht vom Client');
    assert.equal(calls[0].fp, 'fp1');
    const board = daily.board(DAY);
    assert.equal(board.total, 1);
    assert.deepEqual(board.entries, [{ rank: 1, name: 'Anna', ticks: 5000, deaths: 2 }], 'öffentlich: kein Schlüssel, kein Log');
    assert.deepEqual(daily.me(DAY, KEY_A), { name: 'Anna', ticks: 5000, deaths: 2, rank: 1 });
    assert.equal(daily.me(DAY, KEY_B), null);
    assert.equal(daily.me(DAY, 'unsinn'), null);
  } finally {
    cleanup();
  }
});

test('Einsendung: Nicht besser wird gar nicht erst nachgespielt; besser ersetzt und steigt auf', async () => {
  const { daily, calls, cleanup } = service();
  try {
    await daily.submit(submission({ playerKey: KEY_B, name: 'Bob', ticks: 4500 }));
    await daily.submit(submission());
    assert.equal(calls.length, 2);
    const same = await daily.submit(submission({ ticks: 5100 }));
    assert.equal(same.status, 'nicht-besser');
    assert.equal(same.best.ticks, 5000);
    assert.equal(same.rank, 2);
    assert.equal(calls.length, 2, 'keine zusätzliche Prüfung');
    const better = await daily.submit(submission({ ticks: 4400 }));
    assert.equal(better.status, 'ok');
    assert.equal(better.rank, 1);
  } finally {
    cleanup();
  }
});

test('Einsendung: Urteile des Prüfers werden übersetzt, nichts Ungeprüftes kommt in die Liste', async () => {
  const table = [
    [{ status: 'invalid', reason: 'Zeit weicht ab' }, 'abgelehnt'],
    [{ status: 'skipped', reason: 'version' }, 'ungeprueft'],
    [{ status: 'busy' }, 'busy'],
    [{ status: 'error', reason: 'x' }, 'fehler'],
  ];
  for (const [verdict, expected] of table) {
    const { daily, cleanup } = service({ verdict });
    try {
      const res = await daily.submit(submission());
      assert.equal(res.status, expected);
      assert.equal(daily.board(DAY).total, 0, expected);
    } finally {
      cleanup();
    }
  }
});

test('Einsendung: ungültige Eingaben werden abgewiesen, bevor etwas geprüft wird', async () => {
  const { daily, calls, cleanup } = service();
  try {
    for (const bad of [
      { dateKey: 'gestern' }, { playerKey: 'kurz' }, { playerKey: '' }, { ticks: 10 }, { ticks: 5000.5 }, { ticks: '5000' },
      { deaths: -1 }, { log: [1, 2, 3] }, { log: 'x' }, { log: [] .concat(Array(60002).fill(1)) }, { log: [0, -5] },
    ]) {
      const res = await daily.submit(submission(bad));
      assert.equal(res.status, 'ungueltig', JSON.stringify(bad).slice(0, 40));
    }
    assert.equal(calls.length, 0);
  } finally {
    cleanup();
  }
});

test('Tageswechsel: Der Vortag wird bis 2 Uhr Berliner Zeit noch angenommen, danach nicht mehr; Zukunft nie', async () => {
  // 22.09., 00:30 Berliner Zeit (= 21.09., 22:30 UTC)
  const early = service({ today: '2026-09-22', now: Date.UTC(2026, 8, 21, 22, 30) });
  // 22.09., 03:30 Berliner Zeit
  const late = service({ today: '2026-09-22', now: Date.UTC(2026, 8, 22, 1, 30) });
  try {
    assert.equal((await early.daily.submit(submission({ dateKey: '2026-09-21' }))).status, 'ok');
    assert.equal((await early.daily.submit(submission({ dateKey: '2026-09-22', playerKey: KEY_B }))).status, 'ok');
    assert.equal((await early.daily.submit(submission({ dateKey: '2026-09-20', playerKey: KEY_C }))).status, 'ungueltig');
    assert.equal((await late.daily.submit(submission({ dateKey: '2026-09-21' }))).status, 'ungueltig');
    assert.equal((await late.daily.submit(submission({ dateKey: '2026-09-23' }))).status, 'ungueltig');
  } finally {
    early.cleanup();
    late.cleanup();
  }
});

test('Läufe aus dem Raum (schon geprüft) landen in derselben Liste, ein Mensch nur einmal', async () => {
  const { daily, cleanup } = service();
  try {
    daily.recordVerified({ dateKey: DAY, playerKey: KEY_A, name: 'Anna', ticks: 5200, deaths: 1, splits: [], log: LOG, fp: 'fp1', source: 'raum' });
    assert.equal((await daily.submit(submission({ ticks: 4900 }))).status, 'ok', 'Solo-Lauf, besser');
    const worse = daily.recordVerified({ dateKey: DAY, playerKey: KEY_A, name: 'Anna', ticks: 6000, deaths: 1, splits: [], log: LOG, fp: 'fp1', source: 'raum' });
    assert.equal(worse.saved, false);
    const board = daily.board(DAY);
    assert.equal(board.total, 1);
    assert.equal(board.entries[0].ticks, 4900);
    assert.deepEqual(daily.recordVerified({ dateKey: DAY, playerKey: 'kaputt', name: 'X', ticks: 1, deaths: 0, splits: [], log: LOG, fp: 'f', source: 'raum' }), { saved: false, rank: null });
  } finally {
    cleanup();
  }
});

test('Namen werden gesäubert und gekürzt', async () => {
  const { daily, cleanup } = service();
  try {
    await daily.submit(submission({ name: '  Anna\n\u0000<b>' + 'x'.repeat(50) }));
    const name = daily.board(DAY).entries[0].name;
    assert.equal(name.length, 24);
    assert.ok(!/[\u0000-\u001f]/.test(name));
    await daily.submit(submission({ playerKey: KEY_B, name: '   ' }));
    assert.equal(daily.board(DAY).entries.find((e) => e.name === 'Anonym') !== undefined, true);
  } finally {
    cleanup();
  }
});

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function withServer(opts, fn) {
  const rig = service(opts);
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  let clock = Date.UTC(2026, 8, 21, 12, 0);
  app.use('/api/seed-runners', createSeedRunnersRouter({ daily: rig.daily, todayKey: () => DAY, now: () => clock }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/seed-runners`;
  try {
    await fn({ base, tick: (ms) => { clock += ms; }, rig });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rig.cleanup();
  }
}

const post = (base, body, headers = {}) => fetch(`${base}/daily/submit`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('HTTP: Einsenden, Rangliste, eigener Platz per Kopfzeile, Vortag', async () => {
  await withServer({}, async ({ base }) => {
    const res = await post(base, submission());
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');

    const board = await (await fetch(`${base}/daily`, { headers: { 'X-Player-Key': KEY_A } })).json();
    assert.equal(board.today.dateKey, DAY);
    assert.equal(board.today.entries.length, 1);
    assert.deepEqual(board.me, { name: 'Anna', ticks: 5000, deaths: 2, rank: 1 });
    assert.equal(board.yesterday.dateKey, '2026-09-20');
    assert.ok(!JSON.stringify(board).includes(KEY_A), 'der Schlüssel steht nie in einer Antwort');
    assert.equal((await (await fetch(`${base}/daily`)).json()).me, null);
  });
});

test('HTTP: Statuscodes — 422 abgelehnt, 409 ungeprüft, 503 überlastet, 400 ungültig', async () => {
  for (const [verdict, code] of [
    [{ status: 'invalid', reason: 'x' }, 422], [{ status: 'skipped', reason: 'version' }, 409], [{ status: 'busy' }, 503], [{ status: 'error' }, 503],
  ]) {
    await withServer({ verdict }, async ({ base }) => {
      assert.equal((await post(base, submission())).status, code);
    });
  }
  await withServer({}, async ({ base }) => {
    assert.equal((await post(base, submission({ ticks: 3 }))).status, 400);
    assert.equal((await post(base, [])).status, 400, 'ein Array statt eines Objekts');
  });
});

test('HTTP: Zu viele Einsendungen pro Minute werden gebremst, danach geht es wieder', async () => {
  await withServer({}, async ({ base, tick }) => {
    const codes = [];
    for (let i = 0; i < 10; i++) codes.push((await post(base, submission({ ticks: 5000 - i }))).status);
    assert.equal(codes.filter((c) => c === 429).length, 2, 'die ersten 8 gehen durch');
    tick(61_000);
    assert.equal((await post(base, submission({ ticks: 100 }))).status, 200);
  });
});

test('HTTP: Rangliste eines Tages nur für die letzten 30 Tage und gültige Daten', async () => {
  await withServer({}, async ({ base }) => {
    assert.equal((await fetch(`${base}/daily/2026-09-20`)).status, 200);
    assert.equal((await fetch(`${base}/daily/2026-09-22`)).status, 404, 'Zukunft');
    assert.equal((await fetch(`${base}/daily/2025-01-01`)).status, 404, 'zu alt');
    assert.equal((await fetch(`${base}/daily/heute`)).status, 400);
  });
});

// Phase D: Ab dem Stichtag ist das Tagesrennen ein Pfad-Level (lang, super); frühere Tage bleiben beim Chunk-Generator —
// und dailyDateOf erkennt nur die zum Datum passenden Parameter (kein Tag mit fremden Einstellungen).
test('Phase D: Tagesrennen wechselt am Stichtag auf Pfad, alte Tage bleiben gültig', () => {
  const alt = dailyParams('2026-09-25');
  const neu = dailyParams('2026-09-26');
  assert.deepEqual(alt, { seed: 'daily-2026-09-25', length: 'medium', speedClass: 'normal', biome: 'random' });
  assert.deepEqual(neu, { seed: 'daily-2026-09-26', length: 'long', speedClass: 'super', biome: 'random', gen: 'pfad', gv: 1 });
  assert.equal(dailyDateOf(alt), '2026-09-25');
  assert.equal(dailyDateOf(neu), '2026-09-26');
  assert.equal(dailyDateOf({ ...neu, gv: 2 }), null, 'ein Tag behält seine Generator-Version');
  assert.equal(dailyDateOf({ ...neu, gen: undefined }), null, 'Pfad-Tag ohne Pfad-Kennung');
  assert.equal(dailyDateOf({ ...alt, gen: 'pfad' }), null, 'alter Tag mit Pfad-Kennung');
});
