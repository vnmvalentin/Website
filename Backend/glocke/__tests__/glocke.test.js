// npm test -- glocke — Glocke: Nachrichten je Konto (gleiche tag ersetzt Ungelesenes, höchstens 100, gelesen),
// Routen mit und ohne Anmeldung samt Updates-Liste, Feedback speichern und im Admin beantworten → Glocke.
// Nur Temp-Ordner; Discord und Mitteilungen sind Attrappen.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createGlockeStore, MAX_JE_KONTO } = require('../glockeStore');
const { createGlockeRouter } = require('../glockeRoutes');
const { createFeedbackStore } = require('../../feedback/feedbackStore');
const createFeedbackRouter = require('../../routes/feedbackRoutes');

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'glocke-test-'));
test.after(() => fs.rmSync(ordner, { recursive: true, force: true }));

function starte(app) {
  const server = app.listen(0);
  const call = (method, p, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port: server.address().port, path: p, method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
  return { call, stop: () => server.close() };
}

test('Speicher: Nachrichten je Konto, gleiche tag ersetzt Ungelesenes, gelesen, Obergrenze, Umzug', () => {
  const uhr = { t: Date.UTC(2026, 10, 17, 10) };
  const store = createGlockeStore({ datei: path.join(ordner, 'g1.db'), now: () => uhr.t });
  try {
    assert.equal(store.lege({ konten: ['kA', 'kB', 'kA', ''], thema: 'antworten', titel: { de: 'Antwort', en: 'Reply' }, text: 'Danke!', url: '/?glocke=1', tag: 'feedback-1' }), 2);
    let a = store.liste('kA');
    assert.equal(a.ungelesen, 1);
    assert.deepEqual(a.eintraege[0].titel, { de: 'Antwort', en: 'Reply' });
    assert.deepEqual(a.eintraege[0].text, { de: 'Danke!', en: 'Danke!' });
    assert.equal(a.eintraege[0].url, '/?glocke=1');

    // Gleiche tag, noch ungelesen → ersetzt; nach dem Lesen bleibt die alte stehen
    uhr.t += 1000;
    store.lege({ konten: ['kA'], thema: 'antworten', titel: 'Antwort', text: 'Danke, korrigiert', tag: 'feedback-1' });
    a = store.liste('kA');
    assert.deepEqual([a.eintraege.length, a.eintraege[0].text.de], [1, 'Danke, korrigiert']);
    assert.equal(store.markiereGelesen('kA'), 1);
    store.lege({ konten: ['kA'], thema: 'antworten', titel: 'Antwort', text: 'Noch was', tag: 'feedback-1' });
    a = store.liste('kA');
    assert.deepEqual([a.eintraege.length, a.ungelesen], [2, 1]);
    assert.equal(store.markiereGelesen('kA', [a.eintraege[0].id, 99999]), 1);

    // Fremde Links fallen weg
    store.lege({ konten: ['kC'], thema: 'x', titel: 't', url: 'javascript:alert(1)' });
    assert.equal(store.liste('kC').eintraege[0].url, null);

    // Höchstens 100 je Konto
    for (let i = 0; i < MAX_JE_KONTO + 5; i++) { uhr.t += 1; store.lege({ konten: ['kD'], thema: 'x', titel: `n${i}` }); }
    a = store.liste('kD', { limit: 1000 });
    assert.equal(a.eintraege.length, MAX_JE_KONTO);
    assert.equal(a.eintraege[0].titel.de, `n${MAX_JE_KONTO + 4}`);

    // Konto zusammengeführt / gelöscht
    assert.equal(store.kontoUmziehen('kA', 'kB'), 1);
    assert.equal(store.liste('kA').eintraege.length, 3);
    store.kontoLoeschen('kA');
    assert.equal(store.liste('kA').eintraege.length, 0);

    // Nach 90 Tagen aufgeräumt
    uhr.t += 91 * 24 * 3600_000;
    assert.ok(store.raeumeAuf() > 0);
  } finally {
    store.close();
  }
});

test('Routen: ohne Anmeldung nur die Updates, angemeldet Nachrichten; alles oder einzelnes gelesen', async () => {
  const store = createGlockeStore({ datei: path.join(ordner, 'g2.db') });
  store.setzeKv('updates', [{ version: 'v6.27: Glocke', date: '17.11.2026' }, { version: 'v6.26: x', date: '16.11.2026' }]);
  store.lege({ konten: ['kA'], thema: 'antworten', titel: 'Antwort', text: 'eins' });
  store.lege({ konten: ['kA'], thema: 'antworten', titel: 'Antwort', text: 'zwei' });
  const konto = (req, res, next) => { if (req.get('x-konto')) req.kontoId = req.get('x-konto'); next(); };
  const pflicht = (req, res, next) => (req.get('x-konto') ? konto(req, res, next) : res.status(401).json({ error: 'Nicht angemeldet' }));
  const app = express();
  app.use(express.json());
  app.use('/api/glocke', createGlockeRouter({ store, optionalKonto: konto, requireKonto: pflicht }));
  const s = starte(app);
  try {
    let r = await s.call('GET', '/api/glocke');
    assert.deepEqual(r.body, { eintraege: [], ungelesen: 0, updates: [{ version: 'v6.27: Glocke', date: '17.11.2026' }, { version: 'v6.26: x', date: '16.11.2026' }], mitspielen: null });
    r = await s.call('GET', '/api/glocke', null, { 'x-konto': 'kA' });
    assert.equal(r.body.ungelesen, 2);
    assert.deepEqual(r.body.eintraege.map((e) => e.text.de), ['zwei', 'eins']);
    r = await s.call('POST', '/api/glocke/gelesen', { ids: [r.body.eintraege[1].id] }, { 'x-konto': 'kA' });
    assert.deepEqual(r.body, { ungelesen: 1 });
    r = await s.call('POST', '/api/glocke/gelesen', {}, { 'x-konto': 'kA' });
    assert.deepEqual(r.body, { ungelesen: 0 });
    assert.equal((await s.call('POST', '/api/glocke/gelesen', {})).status, 401);
  } finally {
    s.stop();
    store.close();
  }
});

test('Feedback: mit Konto gespeichert (Name vom Konto), Discord-Fehler kostet nichts; Admin nur Betreiber; Antwort → Glocke', async () => {
  const store = createFeedbackStore({ datei: path.join(ordner, 'fb.db') });
  const discord = [];
  const gemeldet = [];
  let discordKaputt = false;
  const konto = (req, res, next) => { if (req.get('x-konto')) req.kontoId = req.get('x-konto'); next(); };
  const auth = (req, res, next) => { if (!req.get('x-twitch')) return res.status(401).json({ error: 'Nicht eingeloggt' }); req.twitchId = req.get('x-twitch'); return next(); };
  const app = express();
  app.use(express.json());
  app.use('/api/feedback', createFeedbackRouter({
    store, optionalKonto: konto, requireAuth: auth, istBetreiber: (req) => req.twitchId === '1',
    kontoAnsicht: (id) => (id === 'kA' ? { name: 'Mäxchen' } : null),
    melde: async (n) => { gemeldet.push(n); return { ok: 1 }; },
    discord: async (x) => { if (discordKaputt) throw new Error('weg'); discord.push(x); return true; },
    log: { error() {} },
  }));
  const s = starte(app);
  try {
    assert.equal((await s.call('POST', '/api/feedback/main', { message: '   ' })).status, 400);
    let r = await s.call('POST', '/api/feedback/main', { message: 'Die Glocke ist toll', user: 'Gefälscht', seite: '/fun' }, { 'x-konto': 'kA' });
    assert.deepEqual(r.body, { success: true });
    assert.deepEqual(discord[0], { name: 'Mäxchen', nachricht: 'Die Glocke ist toll', beantwortbar: true });
    discordKaputt = true;
    r = await s.call('POST', '/api/feedback/main', { message: 'Anonym gesendet', user: 'Besucher' });
    assert.equal(r.status, 200, 'gespeichert, auch wenn Discord nicht geht');

    assert.equal((await s.call('GET', '/api/feedback/admin')).status, 401);
    assert.equal((await s.call('GET', '/api/feedback/admin', null, { 'x-twitch': '2' })).status, 403);
    r = await s.call('GET', '/api/feedback/admin', null, { 'x-twitch': '1' });
    assert.deepEqual(r.body.eintraege.map((e) => [e.name, e.kontoId, e.seite]), [['Besucher', null, null], ['Mäxchen', 'kA', '/fun']]);
    assert.deepEqual(r.body.zahlen, { offen: 2 });

    const [ohne, mit] = r.body.eintraege;
    assert.equal((await s.call('POST', `/api/feedback/admin/${mit.id}/antwort`, { text: ' ' }, { 'x-twitch': '1' })).status, 400);
    r = await s.call('POST', `/api/feedback/admin/${mit.id}/antwort`, { text: 'Danke dir!' }, { 'x-twitch': '1' });
    assert.equal(r.body.zugestellt, true);
    assert.equal(r.body.eintrag.status, 'beantwortet');
    assert.deepEqual([gemeldet[0].thema, gemeldet[0].konten, gemeldet[0].text.de, gemeldet[0].tag], ['antworten', ['kA'], 'Danke dir!', `feedback-${mit.id}`]);
    r = await s.call('POST', `/api/feedback/admin/${ohne.id}/antwort`, { text: 'Hallo' }, { 'x-twitch': '1' });
    assert.equal(r.body.zugestellt, false, 'ohne Konto niemand zum Zustellen');
    assert.equal(gemeldet.length, 1);

    r = await s.call('POST', `/api/feedback/admin/${ohne.id}/status`, { status: 'erledigt' }, { 'x-twitch': '1' });
    assert.equal(r.body.eintrag.status, 'erledigt');
    assert.equal((await s.call('POST', `/api/feedback/admin/${ohne.id}/status`, { status: 'quatsch' }, { 'x-twitch': '1' })).status, 400);
    r = await s.call('GET', '/api/feedback/admin?status=alle', null, { 'x-twitch': '1' });
    assert.equal(r.body.eintraege.length, 2);

    // Konto gelöscht → Feedback bleibt, ohne Konto
    store.kontoLoesen('kA');
    assert.equal(store.eins(mit.id).kontoId, null);
  } finally {
    s.stop();
    store.close();
  }
});
