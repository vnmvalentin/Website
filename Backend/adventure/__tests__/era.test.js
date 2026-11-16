// adVentures nach dem Horde-Umbau (November 2026): alte Bestwerte werden als "Klassik" eingefroren, die Listen beginnen
// neu, und Punkte/Account-Erfahrung/Kill-Grenze passen zu Läufen mit rund 14.000 statt 2.000 Kills.
// Läuft gegen einen eigenen Ordner (ADVENTURE_DATA_DIR) — nie gegen Backend/data.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-era-'));
process.env.ADVENTURE_DATA_DIR = dir;
const express = require('express');
const createAdventureRouter = require('../routes');
const P = require('../progression');
const M = require('../meta');

// Stand von vor dem Umbau: "alt" und "nie-da" haben Bestwerte nach alter Rechnung, "uralt" hat noch keine Punktzahl
const altBest = { score: 12400, stages: 5, bosses: 6, timeSec: 1300, kitId: 'knight', difficulty: 'normal', won: true, kills: 2000, at: 1 };
fs.writeFileSync(path.join(dir, 'adventures-users.json'), JSON.stringify({
  1: { name: 'alt', v: 2, skins: ['default'], xp: 5000, runs: 9, wins: 1, discovered: [], best: altBest, kitBest: { knight: altBest, ninja: { ...altBest, kitId: 'ninja', score: 8000 } }, weekBest: { week: M.weekKey(), all: altBest, kits: { knight: altBest } }, daily: { day: M.dayKey(), best: altBest } },
  2: { name: 'nie-da', v: 2, skins: ['default'], xp: 900, runs: 3, wins: 0, discovered: [], best: { ...altBest, score: 9000, won: false } },
  3: { name: 'uralt', v: 2, skins: ['default'], xp: 100, runs: 1, wins: 0, discovered: [], best: { stages: 2, timeSec: 400, kitId: 'default', difficulty: 'normal', won: false, kills: 300 } },
}));

const optionalAuth = (req, res, next) => {
  if (req.get('x-test-user')) { req.twitchId = req.get('x-test-user'); req.twitchLogin = req.get('x-test-name') || 'tester'; }
  next();
};
const requireAuth = (req, res, next) => optionalAuth(req, res, () => (req.twitchId ? next() : res.status(401).json({ error: 'Nicht eingeloggt' })));

const app = express();
app.use(express.json());
app.use('/api/adventure', createAdventureRouter({ requireAuth, optionalAuth }));
const server = app.listen(0);

function call(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port: server.address().port, path: `/api/adventure${p}`, method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const users = () => JSON.parse(fs.readFileSync(path.join(dir, 'adventures-users.json'), 'utf8'));

test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('Vor dem ersten Besuch: neue Listen sind leer, Klassik zeigt alle alten Bestwerte (auch ohne gespeicherte Punkte)', async () => {
  for (const scope of ['all', 'week', 'daily']) assert.deepEqual((await call('GET', `/leaderboard?scope=${scope}`)).body, [], scope);
  const classic = (await call('GET', '/leaderboard?scope=classic')).body;
  assert.deepEqual(classic.map((r) => [r.name, r.score]), [['alt', 12400], ['nie-da', 9000], ['uralt', P.classicScore({ kills: 300, stagesCleared: 2, timeSec: 400, difficulty: 'normal' })]]);
  assert.deepEqual((await call('GET', '/leaderboard?scope=classic&kit=ninja')).body.map((r) => [r.name, r.score]), [['alt', 8000]]);
});

test('Erster Besuch hebt das Konto: Bestwerte wandern nach Klassik, Stufe und Erfolge bleiben', async () => {
  const p = await call('GET', '/profile', { headers: { 'x-test-user': '1', 'x-test-name': 'alt' } });
  assert.equal(p.status, 200);
  assert.equal(p.body.best, null);
  assert.equal(p.body.classicBest, 12400);
  assert.equal(p.body.xp, 5000);
  assert.equal(p.body.runs, 9);
  const u = users()['1'];
  assert.equal(u.era, 2);
  assert.equal(u.classic.best.score, 12400);
  assert.equal(u.classic.kitBest.ninja.score, 8000);
  assert.equal(u.weekBest, undefined);
  assert.equal(u.daily, undefined);
  // Klassik bleibt für alle gleich, egal ob schon gehoben
  assert.deepEqual((await call('GET', '/leaderboard?scope=classic')).body.map((r) => r.name), ['alt', 'nie-da', 'uralt']);
});

test('Neuer Lauf: zählt in den neuen Listen, Klassik bleibt unberührt, 14.000 Kills werden nicht gekappt', async () => {
  const h = { 'x-test-user': '1', 'x-test-name': 'alt' };
  const start = await call('POST', '/start-run', { headers: h, body: { kitId: 'default', difficulty: 'normal' } });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  // Laufbeginn 20 Minuten zurückdatieren (der Server prüft gegen die echte Zeit)
  const db = users();
  db['1'].activeRun.startedAt = Date.now() - 1200 * 1000;
  fs.writeFileSync(path.join(dir, 'adventures-users.json'), JSON.stringify(db));
  const end = await call('POST', '/end-run', { headers: h, body: { runId: start.body.runId, kills: 14000, stagesCleared: 5, bossesKilled: 6, timeSec: 1190, won: true } });
  assert.equal(end.status, 200, JSON.stringify(end.body));
  assert.equal(end.body.result.kills, 14000);
  assert.equal(end.body.isRecord, true);
  assert.equal(end.body.score, P.runScore({ kills: 14000, stagesCleared: 5, bossesKilled: 6, timeSec: 1190, won: true, difficulty: 'normal' }));
  // Ein Horde-Lauf bringt ähnlich viele Punkte und Account-Erfahrung wie ein gleich guter Lauf vorher
  assert.ok(Math.abs(end.body.score - 12400) < 2500, `Punkte ${end.body.score}`);
  const xpAlt = 2000 + 5 * 80 + 6 * 100 + 19 * 12 + 400;
  assert.ok(Math.abs(end.body.xpGained - xpAlt) < 600, `Erfahrung ${end.body.xpGained} statt etwa ${xpAlt}`);
  assert.ok(end.body.newAchievements.some((a) => a.id === 'kills1000'));
  assert.deepEqual((await call('GET', '/leaderboard')).body.map((r) => [r.name, r.score]), [['alt', end.body.score]]);
  assert.deepEqual((await call('GET', '/leaderboard?scope=week')).body.map((r) => r.name), ['alt']);
  assert.deepEqual((await call('GET', '/leaderboard?scope=classic')).body.map((r) => [r.name, r.score]).slice(0, 2), [['alt', 12400], ['nie-da', 9000]]);
});

test('Kill-Erfolg liegt bei 5.000: ein kurzer Lauf mit 1.200 Kills bekommt ihn nicht mehr', () => {
  const got = M.newAchievements([], { kills: 1200, stagesCleared: 1, bossesKilled: 1, timeSec: 300, won: false, difficulty: 'normal', kitId: 'default', mode: 'normal', ascension: 0 }, { evolutions: 0, champions: 0, loop: 0, itemCount: 5 });
  assert.ok(!got.some((a) => a.id === 'kills1000' || a.id === 'frost_default'));
  const big = M.newAchievements([], { kills: 5000, stagesCleared: 2, bossesKilled: 2, timeSec: 600, won: false, difficulty: 'normal', kitId: 'default', mode: 'normal', ascension: 0 }, { evolutions: 0, champions: 0, loop: 0, itemCount: 5 });
  assert.ok(big.some((a) => a.id === 'kills1000') && big.some((a) => a.id === 'frost_default'));
});

test('Horde-Erfolge: Serie, Kill-Mengen, Kolosse, sechs Waffen und Segen — und der Server glaubt keine Serie über den geprüften Kills', async () => {
  const r = { kills: 16000, stagesCleared: 5, bossesKilled: 6, timeSec: 1200, won: true, difficulty: 'normal', kitId: 'default', mode: 'normal', ascension: 0 };
  const six = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6'].map((id) => ({ id, level: 1 }));
  const ids = (res, x) => M.newAchievements([], res, { evolutions: 0, champions: 0, loop: 0, itemCount: 20, bestStreak: 0, giants: 0, boons: 0, weapons: [], ...x }).map((a) => a.id);
  const neu = ['serie1000', 'serie5000', 'kills15000', 'kills30000', 'kolosse5', 'sechsWaffen', 'segen'];
  assert.deepEqual(ids(r, {}).filter((id) => neu.includes(id)), ['kills15000']);
  assert.deepEqual(ids(r, { bestStreak: 2499, giants: 4, weapons: six.slice(0, 5) }).filter((id) => neu.includes(id)), ['serie1000', 'kills15000']);
  assert.deepEqual(ids({ ...r, kills: 30000 }, { bestStreak: 2500, giants: 5, weapons: six, boons: 1 }).filter((id) => neu.includes(id)), neu);
  // Ein älterer Client meldet die neuen Werte nicht — das darf nichts auslösen und nicht abstürzen
  assert.deepEqual(M.newAchievements([], { ...r, kills: 100 }, { evolutions: 0, champions: 0, loop: 0, itemCount: 5 }).map((a) => a.id).filter((id) => neu.includes(id)), []);

  // Über die Schnittstelle: 60 Sekunden echter Lauf, gemeldet werden 9.000er-Serie und 50 Kolosse
  const h = { 'x-test-user': '2', 'x-test-name': 'nie-da' };
  const start = await call('POST', '/start-run', { headers: h, body: { kitId: 'default', difficulty: 'normal' } });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const db = users();
  db['2'].activeRun.startedAt = Date.now() - 60 * 1000;
  fs.writeFileSync(path.join(dir, 'adventures-users.json'), JSON.stringify(db));
  const end = await call('POST', '/end-run', { headers: h, body: { runId: start.body.runId, kills: 9000, stagesCleared: 1, bossesKilled: 1, timeSec: 60, bestStreak: 9000, giants: 50, boons: 3, weapons: six } });
  assert.equal(end.status, 200, JSON.stringify(end.body));
  assert.ok(end.body.result.kills < 2000, `Kills ${end.body.result.kills}`);
  const got = end.body.newAchievements.map((a) => a.id);
  assert.ok(got.includes('serie1000') && got.includes('sechsWaffen') && got.includes('segen'), got.join(','));
  assert.ok(!got.includes('serie5000') && !got.includes('kolosse5'), got.join(','));
});
