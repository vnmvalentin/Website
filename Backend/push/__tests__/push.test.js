// npm test -- push — Mitteilungen (Web-Push): nur bekannte Push-Dienste, Themen je Gerät, persönliche Themen nur
// angemeldet, Versand in der Sprache des Geräts, tote Abos fallen weg, Live-Wächter meldet einmal, Updates einmal.
// Nur Temp-Ordner; der Push-Dienst ist eine Attrappe.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createPushStore } = require('../pushStore');
const { createPushVersand, sichereUrl } = require('../pushVersand');
const { createPushRouter, pruefeAbo } = require('../pushRoutes');
const { createLiveWaechter, meldeNeueVersion } = require('../ausloeser');
const themen = require('../themen');

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'push-test-'));
test.after(() => fs.rmSync(ordner, { recursive: true, force: true }));

const KEYS = { p256dh: `B${'a'.repeat(86)}`, auth: 'abcdefghijklmnopqrstuv' };
const abo = (n, host = 'fcm.googleapis.com') => ({ endpoint: `https://${host}/fcm/send/geraet-${n}`, keys: KEYS });

function attrappe() {
  const gesendet = [];
  const antworten = new Map(); // endpoint → statusCode für einen Fehler
  return {
    gesendet,
    antworten,
    generateVAPIDKeys: () => ({ publicKey: 'OEFFENTLICH', privateKey: 'GEHEIM' }),
    async sendNotification(sub, payload, opt) {
      const code = antworten.get(sub.endpoint);
      if (code) throw Object.assign(new Error('Push-Dienst sagt nein'), { statusCode: code });
      gesendet.push({ endpoint: sub.endpoint, daten: JSON.parse(payload), opt });
    },
  };
}

test('Abo-Prüfung: nur https zu bekannten Push-Diensten, Schlüssel in der richtigen Form', () => {
  assert.ok(pruefeAbo(abo(1)));
  assert.ok(pruefeAbo(abo(1, 'updates.push.services.mozilla.com')));
  assert.ok(pruefeAbo(abo(1, 'web.push.apple.com')));
  assert.ok(pruefeAbo(abo(1, 'wns2-db5p.notify.windows.com')));
  assert.equal(pruefeAbo(abo(1, 'evil.example')), null);
  assert.equal(pruefeAbo(abo(1, 'fcm.googleapis.com.evil.example')), null);
  assert.equal(pruefeAbo({ endpoint: 'http://fcm.googleapis.com/x', keys: KEYS }), null);
  assert.equal(pruefeAbo({ endpoint: 'https://fcm.googleapis.com:8443/x', keys: KEYS }), null);
  assert.equal(pruefeAbo({ endpoint: 'https://127.0.0.1/x', keys: KEYS }), null);
  assert.equal(pruefeAbo({ ...abo(1), keys: { p256dh: 'kurz', auth: KEYS.auth } }), null);
  assert.equal(pruefeAbo({ ...abo(1), keys: { p256dh: KEYS.p256dh, auth: 'mit leerzeichen ok?' } }), null);
});

test('Links in Mitteilungen: eigene Pfade und https, sonst die Startseite', () => {
  assert.equal(sichereUrl('/updates?v=v6.26'), '/updates?v=v6.26');
  assert.equal(sichereUrl('https://twitch.tv/vnmvalentin'), 'https://twitch.tv/vnmvalentin');
  assert.equal(sichereUrl('//evil.example'), '/');
  assert.equal(sichereUrl('javascript:alert(1)'), '/');
});

test('Versand: Sprache des Geräts, nur passende Themen, persönliche nur an Konten, tote Abos weg; VAPID bleibt', async () => {
  const store = createPushStore({ datei: path.join(ordner, 'versand.db') });
  const wp = attrappe();
  const versand = createPushVersand({ store, webpush: wp, log: { log() {}, error() {} } });
  assert.equal(versand.publicKey, 'OEFFENTLICH');
  assert.equal(createPushVersand({ store, webpush: { generateVAPIDKeys: () => { throw new Error('nicht neu erzeugen'); } } }).publicKey, 'OEFFENTLICH');

  store.speichere({ ...abo(1), themen: ['live', 'updates'], sprache: 'de' });
  store.speichere({ ...abo(2), themen: ['live'], sprache: 'en', kontoId: 'kA' });
  store.speichere({ ...abo(3), themen: ['updates'] });

  let r = await versand.sende({ thema: 'live', titel: { de: 'Live!', en: 'Live now!' }, text: { de: 'Hallo', en: 'Hello' }, url: '/', tag: 'live', urgency: 'high' });
  assert.deepEqual(r, { ok: 2, weg: 0, fehler: 0 });
  assert.deepEqual(wp.gesendet.map((g) => [g.endpoint.slice(-8), g.daten.titel]), [['geraet-1', 'Live!'], ['geraet-2', 'Live now!']]);
  assert.equal(wp.gesendet[0].opt.urgency, 'high');
  assert.equal(wp.gesendet[0].opt.vapidDetails.privateKey, 'GEHEIM');

  // Gerät 3 gibt es beim Push-Dienst nicht mehr → gelöscht; Gerät 1 hat einen vorübergehenden Fehler → bleibt
  wp.antworten.set(abo(3).endpoint, 410);
  wp.antworten.set(abo(1).endpoint, 500);
  r = await versand.sende({ thema: 'updates', titel: 'Neu', text: 'x', url: '/updates' });
  assert.deepEqual(r, { ok: 0, weg: 1, fehler: 1 });
  assert.equal(store.abo(abo(3).endpoint), null);
  assert.equal(store.abo(abo(1).endpoint).fehler, 1);

  await assert.rejects(versand.sende({ thema: 'gibts-nicht', titel: 'x' }), /Unbekanntes Thema/);
  store.close();
});

test('Persönliche Themen: nur an die Geräte der genannten Konten', async () => {
  const store = createPushStore({ datei: path.join(ordner, 'persoenlich.db') });
  const wp = attrappe();
  themen.THEMEN.push({ id: 'probe-persoenlich', persoenlich: true, name: { de: 'P', en: 'P' }, text: { de: '', en: '' } });
  try {
    const versand = createPushVersand({ store, webpush: wp, log: { log() {}, error() {} } });
    store.speichere({ ...abo(1), themen: ['probe-persoenlich'], kontoId: 'kA' });
    store.speichere({ ...abo(2), themen: ['probe-persoenlich'], kontoId: 'kB' });
    await assert.rejects(versand.sende({ thema: 'probe-persoenlich', titel: 'x' }), /braucht konten/);
    const r = await versand.sende({ thema: 'probe-persoenlich', konten: ['kB'], titel: 'x', text: 'y' });
    assert.deepEqual(r, { ok: 1, weg: 0, fehler: 0 });
    assert.match(wp.gesendet[0].endpoint, /geraet-2$/);
    // Konto zusammengeführt: Geräte ziehen mit; Konto gelöscht: Gerät bleibt, aber ohne Konto
    assert.equal(store.kontoUmziehen('kA', 'kB'), 1);
    assert.equal(store.fuerThema('probe-persoenlich', { kontoIds: ['kA'] }).length, 2);
    store.kontoLoesen('kA');
    assert.equal(store.fuerThema('probe-persoenlich', { kontoIds: ['kA'] }).length, 0);
  } finally {
    themen.THEMEN.pop();
    store.close();
  }
});

test('Routen: abonnieren, Stand, Themen ändern, abbestellen, Probe; kaputte Abos abgelehnt', async () => {
  const store = createPushStore({ datei: path.join(ordner, 'routen.db') });
  const wp = attrappe();
  const versand = createPushVersand({ store, webpush: wp, log: { log() {}, error() {} } });
  const optionalKonto = (req, res, next) => { if (req.get('x-konto')) req.kontoId = req.get('x-konto'); next(); };
  const app = express();
  app.use(express.json());
  app.use('/api/push', createPushRouter({ store, versand, optionalKonto }));
  const server = app.listen(0);
  const call = (method, p, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port: server.address().port, path: `/api/push${p}`, method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
  try {
    const s = await call('GET', '/schluessel');
    assert.equal(s.body.publicKey, 'OEFFENTLICH');
    assert.deepEqual(s.body.themen.map((t) => t.id), ['live', 'updates', 'antworten', 'einladungen', 'mitspielen', 'giveaways']);
    assert.equal(s.body.themen.find((t) => t.id === 'antworten').persoenlich, true);

    assert.equal((await call('PUT', '/abo', { abo: abo(1, 'evil.example'), themen: ['live'] })).status, 400);
    let r = await call('PUT', '/abo', { abo: abo(1), themen: ['live', 'quatsch', 'live'], sprache: 'en' }, { 'x-konto': 'kA' });
    assert.deepEqual(r.body, { themen: ['live'] });
    assert.equal(store.abo(abo(1).endpoint).kontoId, 'kA');
    assert.equal(store.abo(abo(1).endpoint).sprache, 'en');
    assert.deepEqual((await call('POST', '/abo/stand', { endpoint: abo(1).endpoint })).body, { themen: ['live'], sprache: 'en' });
    assert.deepEqual((await call('POST', '/abo/stand', { endpoint: 'https://fcm.googleapis.com/unbekannt' })).body, { themen: [], sprache: null });

    r = await call('PUT', '/abo', { abo: abo(1), themen: ['live', 'updates', 'antworten'] });
    assert.deepEqual(r.body.themen, ['live', 'updates'], 'persönliches Thema nur angemeldet');
    assert.equal(store.abo(abo(1).endpoint).kontoId, 'kA', 'ohne Anmeldung bleibt das Konto am Gerät');

    r = await call('POST', '/test', { endpoint: abo(1).endpoint });
    assert.equal(r.body.ergebnis, 'ok');
    assert.equal(wp.gesendet.at(-1).daten.url, '/profile');
    assert.equal((await call('POST', '/test', { endpoint: abo(9).endpoint })).status, 404);

    // Leere Themenliste = abbestellen; /abo/abbestellen ebenso
    assert.deepEqual((await call('PUT', '/abo', { abo: abo(1), themen: [] })).body, { themen: [] });
    assert.equal(store.abo(abo(1).endpoint), null);
    await call('PUT', '/abo', { abo: abo(2), themen: ['updates'] });
    await call('POST', '/abo/abbestellen', { endpoint: abo(2).endpoint });
    assert.equal(store.abo(abo(2).endpoint), null);
  } finally {
    server.close();
    store.close();
  }
});

test('Live-Wächter: neuer Stream einmal, nicht nach Neustart, nicht spät, nicht kurz nach einem Abbruch', async () => {
  const store = createPushStore({ datei: path.join(ordner, 'live.db') });
  const gemeldet = [];
  const uhr = { t: Date.UTC(2026, 10, 16, 20, 0, 0) };
  let stand = { live: false };
  const waechter = () => createLiveWaechter({ zustand: async () => stand, store, melde: async (n) => { gemeldet.push(n); return n; }, now: () => uhr.t, log: { error() {} } });
  const w = waechter();
  try {
    await w.pruefe();
    assert.equal(gemeldet.length, 0);
    stand = { live: true, title: 'Clash mit Chat', game: 'Clash Royale', startedAt: new Date(uhr.t - 60_000).toISOString() };
    await w.pruefe();
    await w.pruefe();
    assert.equal(gemeldet.length, 1);
    assert.equal(gemeldet[0].text.de, 'Clash mit Chat · Clash Royale');
    assert.equal(gemeldet[0].thema, 'live');
    await waechter().pruefe(); // Backend neu gestartet
    assert.equal(gemeldet.length, 1, 'kein zweites Mal nach einem Neustart');

    // Stream bricht ab und startet 10 Minuten später neu → Ruhezeit, keine zweite Mitteilung
    uhr.t += 10 * 60_000;
    stand = { ...stand, startedAt: new Date(uhr.t - 30_000).toISOString() };
    await w.pruefe();
    assert.equal(gemeldet.length, 1);

    // Am nächsten Tag: neuer Stream, aber das Backend kommt erst nach 40 Minuten Stream hoch → zu spät
    uhr.t += 24 * 3600_000;
    stand = { ...stand, startedAt: new Date(uhr.t - 40 * 60_000).toISOString() };
    await w.pruefe();
    assert.equal(gemeldet.length, 1);

    // Tag darauf pünktlich → gemeldet
    uhr.t += 24 * 3600_000;
    stand = { live: true, title: '', startedAt: new Date(uhr.t - 2 * 60_000).toISOString() };
    await w.pruefe();
    assert.equal(gemeldet.length, 2);
    assert.equal(gemeldet[1].text.en, 'Watch now on Twitch');
  } finally {
    store.close();
  }
});

test('Neue Updates: nur die neueste Version, jede einmal', async () => {
  const store = createPushStore({ datei: path.join(ordner, 'updates.db') });
  const gemeldet = [];
  const melde = async (n) => { gemeldet.push(n); return n; };
  try {
    const v = (n) => ({ version: `v6.${n}: Titel ${n}`, date: '16.11.2026', sections: [] });
    await meldeNeueVersion({ entries: [v(26), v(25)], store, melde });
    await meldeNeueVersion({ entries: [v(26), v(25)], store, melde });
    assert.equal(gemeldet.length, 1);
    assert.deepEqual([gemeldet[0].titel.de, gemeldet[0].text.de, gemeldet[0].url], ['Neu auf vnmvalentin.de (v6.26)', 'Titel 26', '/updates?v=v6.26']);
    await meldeNeueVersion({ entries: [v(27), v(26)], store, melde });
    assert.equal(gemeldet.length, 2);
    assert.equal(await meldeNeueVersion({ entries: [], store, melde }), null);
  } finally {
    store.close();
  }
});
