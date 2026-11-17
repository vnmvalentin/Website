// npm test -- mitspielen — „Jetzt mitspielen“: Raumlink nur auf die eigene Seite, Spiel erkannt, Modus offen zeigt den
// Link allen, Modus Warteschlange nur Aufgerufenen; Anstellen/Position/Verlassen, „Nächste Runde“ meldet per
// Mitteilung, Chat-Text für Streamer.bot, Ablauf nach 8 Stunden, nur Betreiber steuert. Nur Temp-Ordner.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createMitspielenStore, ABLAUF_MS } = require('../mitspielenStore');
const { createMitspielenRouter, pruefeRaumlink } = require('../mitspielenRoutes');

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'mitspielen-test-'));
test.after(() => fs.rmSync(ordner, { recursive: true, force: true }));

test('Raumlinks: Pfade und Adressen der eigenen Seite, sonst nichts', () => {
  assert.equal(pruefeRaumlink('/worldflip/ABCD'), '/worldflip/ABCD');
  assert.equal(pruefeRaumlink(' https://vnmvalentin.de/lights-out/room/XY12?x=1 '), '/lights-out/room/XY12?x=1');
  assert.equal(pruefeRaumlink('http://localhost:5173/connect4/abc', 'http://localhost:5173'), '/connect4/abc');
  assert.equal(pruefeRaumlink('https://evil.example/worldflip'), null);
  assert.equal(pruefeRaumlink('//evil.example'), null);
  assert.equal(pruefeRaumlink('javascript:alert(1)'), null);
  assert.equal(pruefeRaumlink('/a b'), null);
  assert.equal(pruefeRaumlink(''), null);
});

test('Speicher: Warteschlange, Aufruf in Runden, neuer Raum leert, Ablauf nach 8 Stunden', () => {
  const uhr = { t: Date.UTC(2026, 10, 17, 19) };
  const s = createMitspielenStore({ datei: path.join(ordner, 's.db'), now: () => uhr.t });
  try {
    assert.deepEqual(s.stelleAn('kA', 'A'), { ok: false, fehler: 'kein-raum' });
    s.setzeRaum({ pfad: '/worldflip/ABCD', spiel: 'worldflip', modus: 'schlange', rundeGroesse: 2 });
    for (const k of ['kA', 'kB', 'kC']) { uhr.t += 1000; s.stelleAn(k, k.toUpperCase()); }
    assert.equal(s.eintrag('kC').position, 3);
    assert.deepEqual(s.stelleAn('kA', 'A'), { ok: true, position: 1 }, 'zweimal anstellen ändert nichts');
    assert.deepEqual(s.rufeAuf(2).map((d) => d.kontoId), ['kA', 'kB']);
    assert.equal(s.eintrag('kA').status, 'aufgerufen');
    assert.equal(s.eintrag('kC').position, 1);
    // Aufgerufener stellt sich wieder an → hinten
    s.stelleAn('kA', 'A');
    assert.equal(s.eintrag('kA').position, 2);
    // Nächste Runde räumt die Aufgerufenen der vorletzten Runde weg
    s.rufeAuf(1);
    s.rufeAuf(1);
    assert.equal(s.eintrag('kB'), null);
    // Gleicher Link ändert nur Einstellungen, anderer Link leert die Schlange
    s.setzeRaum({ pfad: '/worldflip/ABCD', spiel: 'worldflip', modus: 'offen', rundeGroesse: 4 });
    assert.equal(s.raum().modus, 'offen');
    assert.ok(s.wartende().length + s.aufgerufene().length > 0);
    s.setzeRaum({ pfad: '/connect4/x', spiel: 'connect4' });
    assert.equal(s.wartende().length + s.aufgerufene().length, 0);
    uhr.t += ABLAUF_MS + 1;
    assert.equal(s.raum(), null, 'abgelaufen');
  } finally { s.close(); }
});

test('Routen: offen vs. Warteschlange, Aufruf meldet, Chat-Text, nur Betreiber steuert', async () => {
  const store = createMitspielenStore({ datei: path.join(ordner, 'r.db') });
  const gemeldet = [];
  const discord = [];
  const konto = (req, res, next) => { if (req.get('x-konto')) req.kontoId = req.get('x-konto'); next(); };
  const pflicht = (req, res, next) => (req.get('x-konto') ? konto(req, res, next) : res.status(401).json({ error: 'Nicht angemeldet' }));
  const auth = (req, res, next) => { if (!req.get('x-twitch')) return res.status(401).json({ error: 'x' }); req.twitchId = req.get('x-twitch'); return next(); };
  const app = express();
  app.use(express.json());
  app.use('/api/mitspielen', createMitspielenRouter({
    store, optionalKonto: konto, requireKonto: pflicht, requireAuth: auth, istBetreiber: (req) => req.twitchId === '1',
    kontoAnsicht: (id) => ({ name: `Name ${id}` }), melde: async (n) => { gemeldet.push(n); },
    liveZustand: async () => ({ live: true }), frontendUrl: 'https://vnmvalentin.de',
    discordPost: async (text) => { discord.push(text); }, log: { error() {} },
  }));
  const server = app.listen(0);
  const call = (method, p, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port: server.address().port, path: `/api/mitspielen${p}`, method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: b, body: (() => { try { return JSON.parse(b); } catch { return null; } })() }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
  const betreiber = { 'x-twitch': '1' };
  try {
    assert.deepEqual((await call('GET', '/')).body, { aktiv: false });
    assert.equal((await call('GET', '/chat')).text, 'Gerade ist kein Raum offen.');
    assert.equal((await call('PUT', '/raum', { url: '/worldflip/ABCD' }, { 'x-twitch': '2' })).status, 403);
    assert.equal((await call('PUT', '/raum', { url: 'https://evil.example/x' }, betreiber)).status, 400);

    // Offen: Link für alle
    let r = await call('PUT', '/raum', { url: 'https://vnmvalentin.de/worldflip/ABCD', notiz: 'Viererrunde', modus: 'offen' }, betreiber);
    assert.deepEqual([r.body.raum.spiel, r.body.raum.spielName, r.body.raum.link], ['worldflip', 'Worldflip', 'https://vnmvalentin.de/worldflip/ABCD']);
    assert.equal(discord.length, 1);
    assert.match(discord[0], /Jetzt mitspielen: Worldflip.*Viererrunde\nhttps:\/\/vnmvalentin\.de\/worldflip\/ABCD/);
    const oeffentlich = (await call('GET', '/')).body;
    assert.deepEqual([oeffentlich.aktiv, oeffentlich.url, oeffentlich.live, oeffentlich.notiz], [true, '/worldflip/ABCD', true, 'Viererrunde']);
    assert.equal((await call('GET', '/chat')).text, 'Jetzt mitspielen bei Worldflip: https://vnmvalentin.de/worldflip/ABCD');
    assert.equal((await call('GET', '/chat?lang=en')).text, 'Play along in Worldflip: https://vnmvalentin.de/worldflip/ABCD');

    // Warteschlange: Link nur für Aufgerufene; gleicher Link → kein zweiter Discord-Post
    await call('PUT', '/raum', { url: '/worldflip/ABCD', modus: 'schlange', rundeGroesse: 2 }, betreiber);
    assert.equal(discord.length, 1);
    assert.equal((await call('GET', '/')).body.url, null);
    assert.equal((await call('POST', '/anstellen')).status, 401);
    for (const k of ['kA', 'kB', 'kC']) await call('POST', '/anstellen', {}, { 'x-konto': k });
    const c = (await call('GET', '/', null, { 'x-konto': 'kC' })).body;
    assert.deepEqual([c.ich, c.schlange.wartend, c.url], [{ status: 'wartet', position: 3 }, 3, null]);
    assert.equal((await call('GET', '/chat')).text, 'Stell dich für Worldflip an: https://vnmvalentin.de/mitspielen (3 warten)');

    r = await call('POST', '/aufrufen', { anzahl: 2 }, betreiber);
    assert.deepEqual(r.body.aufgerufen.map((d) => d.name), ['Name kA', 'Name kB']);
    assert.deepEqual([gemeldet[0].thema, gemeldet[0].konten, gemeldet[0].url], ['mitspielen', ['kA', 'kB'], '/worldflip/ABCD']);
    const a = (await call('GET', '/', null, { 'x-konto': 'kA' })).body;
    assert.deepEqual([a.ich.status, a.url], ['aufgerufen', '/worldflip/ABCD']);
    assert.equal((await call('GET', '/', null, { 'x-konto': 'kC' })).body.ich.position, 1);

    await call('POST', '/verlassen', {}, { 'x-konto': 'kC' });
    assert.equal((await call('GET', '/steuerung', null, betreiber)).body.wartende.length, 0);
    await call('POST', '/beenden', {}, betreiber);
    assert.deepEqual((await call('GET', '/')).body, { aktiv: false });
  } finally {
    server.close();
    store.close();
  }
});
