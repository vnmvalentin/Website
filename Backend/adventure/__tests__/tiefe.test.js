// adVentures „Tiefe“ (Ausbauplan av-meta, November 2026): Bestmarke je Konto, Bestenliste „Am weitesten gekommen“,
// Erfolge für Zyklus 3/4 und Tiefe 15/20. Läuft gegen einen eigenen Ordner (ADVENTURE_DATA_DIR) — nie gegen Backend/data.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-tiefe-'));
process.env.ADVENTURE_DATA_DIR = dir;
const express = require('express');
const createAdventureRouter = require('../routes');
const M = require('../meta');

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
const file = () => path.join(dir, 'adventures-users.json');
const users = () => JSON.parse(fs.readFileSync(file(), 'utf8'));

/** Einen Lauf spielen: Start, Beginn zurückdatieren (der Server prüft gegen die echte Zeit), beenden */
async function lauf(id, name, { difficulty = 'normal', stagesCleared, sekunden = 4000, kills = 60000, won = true }) {
  const h = { 'x-test-user': id, 'x-test-name': name };
  const start = await call('POST', '/start-run', { headers: h, body: { kitId: 'default', difficulty } });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const db = users();
  db[id].activeRun.startedAt = Date.now() - sekunden * 1000;
  fs.writeFileSync(file(), JSON.stringify(db));
  const end = await call('POST', '/end-run', { headers: h, body: { runId: start.body.runId, kills, stagesCleared, bossesKilled: Math.min(stagesCleared + 1, 6 + stagesCleared), timeSec: sekunden - 10, won } });
  assert.equal(end.status, 200, JSON.stringify(end.body));
  return end.body;
}

test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('Tiefe: Bestmarke je Konto, Rekord erst beim Übertreffen, Bestenliste nach Tiefe dann Punkten', async () => {
  // Erster Lauf: Tiefe 9 (Zyklus 2, Welt 3) — erste Bestmarke ist kein „Rekord“
  const a = await lauf('1', 'anna', { stagesCleared: 8 });
  assert.equal(a.depth, 9);
  assert.equal(a.depthBest, 9);
  assert.equal(a.isDepthRecord, false);
  // Zweiter Lauf flacher: Bestmarke bleibt
  const b = await lauf('1', 'anna', { stagesCleared: 3, sekunden: 900, kills: 8000, won: false });
  assert.equal(b.depth, 4);
  assert.equal(b.depthBest, 9);
  assert.equal(b.isDepthRecord, false);
  // Dritter Lauf tiefer: Rekord
  const c = await lauf('1', 'anna', { stagesCleared: 13, sekunden: 5000 });
  assert.equal(c.depthBest, 14);
  assert.equal(c.isDepthRecord, true);
  // Profil kennt die Bestmarke (für die Anzeige im Spiel)
  assert.equal((await call('GET', '/profile', { headers: { 'x-test-user': '1', 'x-test-name': 'anna' } })).body.depthBest, 14);

  // Zwei weitere Spieler: gleiche Tiefe wie Anna → mehr Punkte entscheiden; Entspannt zählt nicht
  await lauf('2', 'bert', { stagesCleared: 13, sekunden: 5000, kills: 90000 });
  await lauf('3', 'cara', { difficulty: 'easy', stagesCleared: 19, sekunden: 6000 });
  const board = (await call('GET', '/leaderboard?scope=tiefe')).body;
  assert.deepEqual(board.map((r) => [r.name, r.depth]), [['bert', 14], ['anna', 14]]);
  assert.ok(board[0].score > board[1].score);
  // Die übrigen Listen tragen die Tiefe mit
  assert.ok((await call('GET', '/leaderboard')).body.every((r) => Number.isInteger(r.depth)));
});

test('Erfolge der Tiefe: an den geprüften geschafften Welten', () => {
  const r = (stagesCleared) => ({ kills: 50000, stagesCleared, bossesKilled: 6, timeSec: 4000, won: true, difficulty: 'normal', kitId: 'default', mode: 'normal', ascension: 0 });
  const x = { evolutions: 0, champions: 0, loop: 0, itemCount: 20, bestStreak: 0, giants: 0, boons: 0, weapons: [] };
  const ids = (n) => M.newAchievements([], r(n), x).map((a) => a.id).filter((id) => ['zyklus3', 'tiefe15', 'zyklus4', 'tiefe20'].includes(id));
  assert.deepEqual(ids(11), []);
  assert.deepEqual(ids(12), ['zyklus3']);
  assert.deepEqual(ids(14), ['zyklus3', 'tiefe15']);
  assert.deepEqual(ids(18), ['zyklus3', 'tiefe15', 'zyklus4']);
  assert.deepEqual(ids(19), ['zyklus3', 'tiefe15', 'zyklus4', 'tiefe20']);
});
