// adVentures als Gast: spielen ohne Login, getrennte Datei, nicht in der Bestenliste, Übernahme ins Konto nach dem Login.
// Läuft gegen einen eigenen Ordner (ADVENTURE_DATA_DIR) — nie gegen Backend/data.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-guest-'));
process.env.ADVENTURE_DATA_DIR = dir;
const express = require('express');
const createAdventureRouter = require('../routes');

const GUEST = '0f8b3c6e-2d4a-4b7e-9c1a-5e6f7a8b9c0d';
// Session-Attrappe: Header x-test-user = eingeloggt
const optionalAuth = (req, res, next) => {
  if (req.get('x-test-user')) { req.twitchId = req.get('x-test-user'); req.twitchLogin = 'tester'; }
  next();
};
const requireAuth = (req, res, next) => optionalAuth(req, res, () => (req.twitchId ? next() : res.status(401).json({ error: 'Nicht eingeloggt' })));

const app = express();
app.use(express.json());
app.use('/api/adventure', createAdventureRouter({ requireAuth, optionalAuth }));
const server = app.listen(0);
const port = () => server.address().port;

function call(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port: port(), path: `/api/adventure${p}`, method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const readFile = (name) => (fs.existsSync(path.join(dir, name)) ? JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) : {});

test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('Ohne Login und ohne Gast-ID: 401; nur ansehen legt keinen Gast an', async () => {
  assert.equal((await call('GET', '/profile')).status, 401);
  assert.equal((await call('GET', '/profile', { headers: { 'x-adventure-guest': 'kaputt' } })).status, 401);
  const p = await call('GET', '/profile', { headers: { 'x-adventure-guest': GUEST } });
  assert.equal(p.status, 200);
  assert.equal(p.body.guest, true);
  assert.equal(p.body.level, 1);
  assert.deepEqual(readFile('adventures-guests.json'), {});
});

test('Gast spielt einen Lauf: landet in der Gast-Datei, nicht in der Bestenliste', async () => {
  const h = { 'x-adventure-guest': GUEST };
  const prof = await call('GET', '/profile', { headers: h });
  const kitId = prof.body.unlocks.kits[0];
  const start = await call('POST', '/start-run', { headers: h, body: { kitId, difficulty: prof.body.unlocks.difficulties[0] } });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const end = await call('POST', '/end-run', { headers: h, body: { runId: start.body.runId, kills: 20, stagesCleared: 0, timeSec: 20 } });
  assert.equal(end.status, 200, JSON.stringify(end.body));
  assert.ok(end.body.xpGained > 0);
  const guests = readFile('adventures-guests.json');
  assert.equal(guests[GUEST].runs, 1);
  assert.equal(guests[GUEST].name, 'Gast');
  assert.deepEqual(readFile('adventures-users.json'), {});
  assert.deepEqual((await call('GET', '/leaderboard')).body, []);
  assert.equal((await call('GET', '/history', { headers: h })).body.length, 1);
});

test('Nach dem Login: Fortschritt wird übernommen, Gast gelöscht, zweiter Aufruf ist leer', async () => {
  const xpGast = readFile('adventures-guests.json')[GUEST].xp;
  const h = { 'x-test-user': '42', 'x-adventure-guest': GUEST };
  const claim = await call('POST', '/claim-guest', { headers: h });
  assert.deepEqual([claim.status, claim.body.merged], [200, true]);
  const users = readFile('adventures-users.json');
  assert.equal(users['42'].xp, xpGast);
  assert.equal(users['42'].runs, 1);
  assert.equal(readFile('adventures-guests.json')[GUEST], undefined);
  assert.equal((await call('POST', '/claim-guest', { headers: h })).body.merged, false);
  // Session hat Vorrang vor dem Gast-Header
  assert.equal((await call('GET', '/profile', { headers: h })).body.guest, false);
  assert.equal((await call('POST', '/claim-guest', { headers: { 'x-adventure-guest': GUEST } })).status, 401);
});
