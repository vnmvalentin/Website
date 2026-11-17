// Twitch-Erweiterung „Win Tracker“ (Ausbauplan „twitch-erweiterung“): Token-Prüfung, CORS nur für die Herkunft der
// Erweiterung, Panel-Zahlen mit Zwischenspeicher je Kanal, Einstellungsseite nur für den Kanal.
// Ohne echte Datenbank: die Win-Tracker-Quelle wird hereingereicht.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { verifyExtensionJwt, signExtensionJwt } = require('../jwt');
const { panelState } = require('../panelData');
const { createTwitchExtRouter, CACHE_MS } = require('../routes');

const SECRET = Buffer.from('ein-geheimnis-fuer-tests-0123456789').toString('base64');
const T0 = 1_800_000_000_000;
const token = (over = {}, secret = SECRET) => signExtensionJwt({ exp: T0 / 1000 + 3600, channel_id: '4242', role: 'viewer', opaque_user_id: 'U1', ...over }, secret);

test('Token: richtig signiert gilt, falsches Geheimnis/abgelaufen/kaputt/ohne Kanal/alg none nicht', () => {
  assert.equal(verifyExtensionJwt(token(), SECRET, T0).channel_id, '4242');
  assert.equal(verifyExtensionJwt(token({}, Buffer.from('anderes').toString('base64')), SECRET, T0), null);
  assert.equal(verifyExtensionJwt(token({ exp: T0 / 1000 - 1 }), SECRET, T0), null);
  assert.equal(verifyExtensionJwt(token({ channel_id: '' }), SECRET, T0), null);
  assert.equal(verifyExtensionJwt('a.b', SECRET, T0), null);
  assert.equal(verifyExtensionJwt(token(), '', T0), null);
  const [, body] = token().split('.');
  const none = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${body}.x`;
  assert.equal(verifyExtensionJwt(none, SECRET, T0), null);
  // Geheimnis als Text statt Base64 benutzt → passt nicht (der typische Fehler)
  const asText = signExtensionJwt({ exp: T0 / 1000 + 60, channel_id: '1' }, Buffer.from(SECRET).toString('base64'));
  assert.equal(verifyExtensionJwt(asText, SECRET, T0), null);
});

test('Panel-Zahlen: OBS-Format wird zurückgesetzt, ohne Account nur hasAccount:false', () => {
  assert.deepEqual(panelState(null), { hasAccount: false });
  assert.deepEqual(panelState({ hasAccount: false, x: 1 }), { hasAccount: false });
  const s = panelState({ hasAccount: true, playerName: 'Mika', settings: { overlayScale: 160, overlayWidth: 900, overlayHeight: 300, paginateOverlay: true, showDeck: false, language: 'de' } });
  assert.deepEqual(s.settings, { overlayScale: 100, overlayWidth: 0, overlayHeight: 0, paginateOverlay: false, showDeck: false, language: 'de' });
  assert.equal(s.playerName, 'Mika');
});

async function withServer(router, fn) {
  const app = express();
  app.use('/api/twitch-ext', router);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try { return await fn(`http://127.0.0.1:${server.address().port}/api/twitch-ext`); } finally { server.close(); }
}

test('Schnittstelle: CORS nur für die Erweiterung, Panel mit Zwischenspeicher, Status nur für den Kanal', async () => {
  let clock = T0;
  const calls = [];
  const load = (id) => { calls.push(id); return id === '4242' ? { tracker: true, state: { hasAccount: true, playerName: 'Mika', playerTag: '#2PP', settings: { trackMode: 'medals' } } } : { tracker: false, state: { hasAccount: false } }; };
  const router = createTwitchExtRouter({ secret: SECRET, clientId: 'abc123', load, now: () => clock });
  await withServer(router, async (base) => {
    const ext = 'https://abc123.ext-twitch.tv';
    const pre = await fetch(`${base}/panel`, { method: 'OPTIONS', headers: { Origin: ext, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), ext);
    assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
    const fremd = await fetch(`${base}/panel`, { method: 'OPTIONS', headers: { Origin: 'https://boese.example' } });
    assert.equal(fremd.headers.get('access-control-allow-origin'), null);

    assert.equal((await fetch(`${base}/panel`)).status, 401);
    const auth = (t) => ({ headers: { Origin: ext, Authorization: `Bearer ${t}` } });
    const r1 = await fetch(`${base}/panel`, auth(token()));
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('access-control-allow-origin'), ext);
    assert.equal(r1.headers.get('cache-control'), 'no-store');
    const d1 = await r1.json();
    assert.equal(d1.tracker, true);
    assert.equal(d1.state.playerName, 'Mika');
    // Zweiter Zuschauer im selben Zeitfenster: aus dem Zwischenspeicher
    await fetch(`${base}/panel`, auth(token({ opaque_user_id: 'U2' })));
    assert.deepEqual(calls, ['4242']);
    clock += CACHE_MS;
    await fetch(`${base}/panel`, auth(token()));
    assert.deepEqual(calls, ['4242', '4242']);

    const other = await (await fetch(`${base}/panel`, auth(token({ channel_id: '77' })))).json();
    assert.deepEqual([other.tracker, other.state.hasAccount], [false, false]);

    assert.equal((await fetch(`${base}/status`, auth(token()))).status, 403, 'Zuschauer');
    const st = await (await fetch(`${base}/status`, auth(token({ role: 'broadcaster' })))).json();
    assert.deepEqual([st.tracker, st.hasAccount, st.playerTag, st.trackMode], [true, true, '#2PP', 'medals']);
    assert.match(st.setupUrl, /\/clash-royale\/win-tracker$/);
    assert.equal((await fetch(`${base}/status`, auth(token({ role: 'moderator' })))).status, 200);
  });
});

test('Schnittstelle: ohne Geheimnis 503 statt Absturz', async () => {
  await withServer(createTwitchExtRouter({ secret: '', clientId: 'abc', load: () => ({}) }), async (base) => {
    const r = await fetch(`${base}/panel`, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).code, 'not_configured');
  });
});
