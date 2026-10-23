// Öffentliches Profil: opt-in, Login aus der Session, Abschnitte aus Quellen (Attrappen), kaputte Quelle kostet nur sich
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createProfileStore } = require('../profileStore');
const { createProfileRouter, buildProfile } = require('../profileRoutes');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-'));
const store = createProfileStore(path.join(dir, 'p.db'));

const requireAuth = (req, res, next) => {
  if (!req.get('x-test-user')) return res.status(401).json({ error: 'Nicht eingeloggt' });
  req.twitchId = req.get('x-test-user');
  req.twitchLogin = req.get('x-test-login');
  return next();
};
const sources = {
  winTracker: (id) => (id === '1' ? { playerName: 'Vali', trophies: 9000 } : null),
  tournaments: () => [],
  adventure: () => { throw new Error('Datei kaputt'); },
  garden: (id) => (id === '1' ? { level: 12, gold: 5000 } : null),
};
const app = express();
app.use(express.json());
app.use('/api/public-profile', createProfileRouter({ requireAuth, store, getSources: () => sources }));
const server = app.listen(0);

function call(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port: server.address().port, path: `/api/public-profile${p}`, method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test.after(() => { server.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('Abschnitte: leere und werfende Quellen fallen weg', () => {
  assert.deepEqual(buildProfile('1', sources), { winTracker: { playerName: 'Vali', trophies: 9000 }, garden: { level: 12, gold: 5000 } });
  assert.deepEqual(buildProfile('2', sources), {});
});

test('Ohne Einschalten kein öffentliches Profil; nach dem Einschalten unter dem Login (Groß/klein egal)', async () => {
  const me = { 'x-test-user': '1', 'x-test-login': 'VnmValentin' };
  assert.equal((await call('GET', '/u/vnmvalentin')).status, 404);
  assert.deepEqual((await call('GET', '/me', { headers: me })).body, { enabled: false, login: 'vnmvalentin' });
  const on = await call('PUT', '/me', { headers: me, body: { enabled: true } });
  assert.deepEqual(on.body, { enabled: true, login: 'vnmvalentin' });
  const p = await call('GET', '/u/VNMVALENTIN');
  assert.equal(p.status, 200);
  assert.equal(p.body.login, 'vnmvalentin');
  assert.deepEqual(Object.keys(p.body.sections), ['winTracker', 'garden']);
});

test('Bild nur vom Twitch-CDN, Anzeigename ohne HTML', async () => {
  const me = { 'x-test-user': '1', 'x-test-login': 'vnmvalentin' };
  const ok = 'https://static-cdn.jtvnw.net/jtv_user_pictures/abc-profile_image-300x300.png';
  await call('PUT', '/me', { headers: me, body: { enabled: true, displayName: 'VnmValentin', avatar: ok } });
  let p = (await call('GET', '/u/vnmvalentin')).body;
  assert.deepEqual([p.displayName, p.avatar], ['VnmValentin', ok]);
  await call('PUT', '/me', { headers: me, body: { enabled: true, displayName: '<b>x</b>', avatar: 'https://evil.example/x.png' } });
  p = (await call('GET', '/u/vnmvalentin')).body;
  assert.deepEqual([p.displayName, p.avatar], ['bx/b', '']);
});

test('Ausschalten wirkt sofort (Zwischenspeicher wird verworfen); fremde Logins und Unsinn → 404', async () => {
  const me = { 'x-test-user': '1', 'x-test-login': 'vnmvalentin' };
  await call('PUT', '/me', { headers: me, body: { enabled: false } });
  assert.equal((await call('GET', '/u/vnmvalentin')).status, 404);
  assert.equal((await call('GET', '/u/..%2Fetc')).status, 404);
  assert.equal((await call('PUT', '/me', { body: { enabled: true } })).status, 401);
});
