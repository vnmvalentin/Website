// Tests der Bestenliste der CR-Tagesrunde (dailyStore.js + dailyRoutes.js). Speicher im Temp-Ordner, kein Netz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-daily-test-'));
process.env.CR_DAILY_DB = path.join(tmpDir, 'daily.db');

const express = require('express');
const store = require('../dailyStore');
const { createDailyRouter, prevDay } = require('../dailyRoutes');

test.after(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Speicher: je Spiel zählt die erste Meldung, neue Spiele kommen dazu, Unsinn fällt weg', () => {
  const d = '2026-11-10';
  store.submit(d, 'u1', 'eins', { wordle: 90, farbe: 40.6, unsinn: 100, zoom: 'x' }, 1000);
  const again = store.submit(d, 'u1', 'eins', { wordle: 100, kartenraten: 250 }, 2000);
  assert.deepEqual(again.scores, { wordle: 90, farbe: 41, kartenraten: 100 });
  assert.equal(again.total, 231);
  assert.equal(again.games, 3);
});

test('Plätze: mehr Punkte zuerst, bei Gleichstand wer früher fertig war', () => {
  const d = '2026-11-11';
  store.submit(d, 'a', 'Anna', { wordle: 80 }, 3000);
  store.submit(d, 'b', 'Ben', { wordle: 80 }, 1000);
  store.submit(d, 'c', 'Cem', { wordle: 100 }, 5000);
  const b = store.board(d);
  assert.deepEqual(b.top.map((e) => [e.rank, e.name]), [[1, 'Cem'], [2, 'Ben'], [3, 'Anna']]);
  assert.equal(b.players, 3);
  assert.equal(store.entry(d, 'a').rank, 3);
  assert.equal(store.entry(d, 'niemand'), null);
});

async function withServer({ loggedIn, now }, fn) {
  const app = express();
  const auth = (req, res, next) => (loggedIn ? Object.assign(req, { twitchId: '42', twitchLogin: 'vnm' }) && next() : res.status(401).json({ ok: false }));
  const optional = (req, res, next) => { if (loggedIn) Object.assign(req, { twitchId: '42', twitchLogin: 'vnm' }); next(); };
  app.use('/h', createDailyRouter({ requireAuth: auth, optionalAuth: optional, now }));
  const server = http.createServer(app);
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  const base = `http://127.0.0.1:${server.address().port}/h`;
  try {
    await fn({
      get: async (p) => { const res = await fetch(base + p); return { status: res.status, body: await res.json() }; },
      post: async (p, body) => {
        const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { status: res.status, body: await res.json() };
      },
    });
  } finally {
    await new Promise((r) => { server.close(r); });
  }
}

test('Route: melden nur angemeldet und nur für heute oder gestern; Bestenliste mit eigenem Eintrag', async () => {
  const now = () => new Date('2026-11-16T10:00:00Z'); // in Berlin der 16.11.
  await withServer({ loggedIn: false, now }, async ({ get, post }) => {
    assert.equal((await post('/result', { day: '2026-11-16', scores: { wordle: 90 } })).status, 401);
    const b = await get('/board');
    assert.equal(b.body.day, '2026-11-16');
    assert.equal(b.body.me, null);
    assert.equal(b.body.loggedIn, false);
  });
  await withServer({ loggedIn: true, now }, async ({ get, post }) => {
    assert.deepEqual((await post('/result', { day: '2026-11-14', scores: { wordle: 90 } })).body, { ok: false, key: 'wrongDay' });
    assert.deepEqual((await post('/result', { day: '2026-11-16', scores: { quatsch: 1 } })).body, { ok: false, key: 'noScores' });
    const r = await post('/result', { day: '2026-11-16', scores: { wordle: 90, zoom: 75 } });
    assert.equal(r.body.me.total, 165);
    assert.equal(r.body.me.name, 'vnm');
    assert.equal((await post('/result', { day: prevDay('2026-11-16'), scores: { farbe: 50 } })).status, 200); // kurz nach Mitternacht
    const b = await get('/board');
    assert.equal(b.body.me.rank, 1);
    assert.equal(b.body.top[0].total, 165);
    const y = await get('/board?tag=2026-11-15');
    assert.equal(y.body.top[0].scores.farbe, 50);
  });
});

test('Route: Berliner Datum auch kurz nach Mitternacht UTC-Vortag', async () => {
  // 23:30 UTC am 16.11. ist in Berlin schon der 17.11.
  await withServer({ loggedIn: true, now: () => new Date('2026-11-16T23:30:00Z') }, async ({ get, post }) => {
    assert.equal((await get('/board')).body.today, '2026-11-17');
    assert.equal((await post('/result', { day: '2026-11-17', scores: { pixel: 100 } })).status, 200);
  });
});

test('Partien für den Admin: eine vollständige Tagesrunde zählt genau einmal als cr-ratespiele', async () => {
  const statistik = require('../../../lib/spielStatistik');
  const gezaehlt = [];
  statistik.verbindePartienSpeicher((id) => { gezaehlt.push(id); });
  try {
    await withServer({ loggedIn: true, now: () => new Date('2026-11-20T10:00:00Z') }, async ({ post }) => {
      await post('/result', { day: '2026-11-20', scores: { wordle: 90, kartenraten: 50 } });
      assert.deepEqual(gezaehlt, []); // noch nicht vollständig
      await post('/result', { day: '2026-11-20', scores: { wordle: 90, kartenraten: 50, zoom: 75, pixel: 0, farbe: 60 } });
      await post('/result', { day: '2026-11-20', scores: { wordle: 90, kartenraten: 50, zoom: 75, pixel: 0, farbe: 60 } });
    });
    assert.deepEqual(gezaehlt, ['cr-ratespiele']);
  } finally {
    statistik.verbindePartienSpeicher(null);
  }
});
