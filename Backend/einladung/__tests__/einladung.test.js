// npm test -- einladung — Einladungslinks: Code je Konto, nur neue Konten nehmen an (nie den eigenen, nur einmal),
// Bestätigung erst an einem späteren Tag über den Beobachter „aktiv“, Abzeichen-Stufen 1/3/10, Mitteilung an den
// Werber, Zusammenführen und Löschen, Routen. Nur Temp-Ordner; Mitteilungen sind eine Attrappe.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createKontoStore } = require('../../konto/kontoStore');
const { createEinladungStore, normalisiere } = require('../einladungStore');
const { createEinladungDienst } = require('../einladungDienst');
const { createEinladungRouter } = require('../einladungRoutes');

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'einladung-test-'));
test.after(() => fs.rmSync(ordner, { recursive: true, force: true }));

const TAG = 24 * 3600 * 1000;

function aufbau(name) {
  const uhr = { t: Date.UTC(2026, 10, 17, 11, 0, 0) };
  const kontoStore = createKontoStore({ datei: path.join(ordner, `${name}-k.db`), now: () => uhr.t });
  const store = createEinladungStore({ datei: path.join(ordner, `${name}-e.db`), now: () => uhr.t });
  const gemeldet = [];
  const dienst = createEinladungDienst({ store, kontoStore, melde: async (n) => { gemeldet.push(n); }, now: () => uhr.t, log: { error() {} } });
  kontoStore.beobachte({
    aktiv: (k, tag) => dienst.aktiv(k, tag),
    zusammengefuehrt: (z, q) => store.zusammenfuehren(z, q),
    geloescht: (k) => store.loesche(k),
  });
  return { uhr, kontoStore, store, dienst, gemeldet, schliessen: () => { kontoStore.close(); store.close(); } };
}

test('Codes: einer je Konto, tolerant gelesen', () => {
  const a = aufbau('codes');
  try {
    const k = a.kontoStore.erstelleGast().kontoId;
    const code = a.store.codeFuer(k);
    assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    assert.equal(a.store.codeFuer(k), code, 'bleibt gleich');
    assert.equal(a.store.kontoVonCode(` ${code.slice(0, 4).toLowerCase()}-${code.slice(4)} `), k);
    assert.equal(normalisiere('O0I1LLLL'), null, 'Zeichen außerhalb des Alphabets');
  } finally { a.schliessen(); }
});

test('Annehmen: nur neue Konten, nie der eigene Code, nur einmal; Bestätigung erst am nächsten Tag, dann Abzeichen', () => {
  const a = aufbau('ablauf');
  try {
    const werber = a.kontoStore.anmelden('twitch', '1', { name: 'Vali' }).kontoId;
    const code = a.store.codeFuer(werber);
    assert.deepEqual(a.dienst.annehmen(werber, code), { ok: false, fehler: 'eigener' });
    const alt = a.kontoStore.anmelden('twitch', '9', { name: 'Alt' }, { bestand: true }).kontoId;
    assert.deepEqual(a.dienst.annehmen(alt, code), { ok: false, fehler: 'zu-alt' });

    const gast = a.kontoStore.erstelleGast().kontoId;
    a.kontoStore.setzeName(gast, 'Mäxchen');
    assert.deepEqual(a.dienst.annehmen(gast, 'ZZZZZZZZ'), { ok: false, fehler: 'unbekannt' });
    assert.equal(a.dienst.annehmen(gast, code).ok, true);
    assert.deepEqual(a.dienst.annehmen(gast, code), { ok: false, fehler: 'schon' });

    // Am selben Tag aktiv → noch nichts
    a.kontoStore.merkeAktiv(gast);
    assert.equal(a.dienst.meinStand(werber).wartend, 1);
    assert.equal(a.kontoStore.ansicht(werber).erfolge.length, 0);

    // Nächster Tag → bestätigt, beide bekommen Abzeichen, Werber eine Mitteilung
    a.uhr.t += TAG;
    a.kontoStore.merkeAktiv(gast);
    const s = a.dienst.meinStand(werber);
    assert.deepEqual([s.bestaetigt, s.wartend, s.naechste.id], [1, 0, 'netzwerker']);
    assert.deepEqual(a.kontoStore.ansicht(werber).erfolge.map((e) => `${e.spiel}:${e.erfolg}`), ['website:gastgeber']);
    assert.deepEqual(a.kontoStore.ansicht(gast).erfolge.map((e) => e.erfolg), ['eingeladen']);
    assert.equal(a.gemeldet.length, 1);
    assert.deepEqual([a.gemeldet[0].thema, a.gemeldet[0].konten], ['einladungen', [werber]]);
    assert.match(a.gemeldet[0].text.de, /^Mäxchen ist über deinen Link dazugekommen.*Neues Abzeichen/);

    // Ein Konto, das älter als 3 Tage ist, kann nicht mehr annehmen
    const spaet = a.kontoStore.erstelleGast().kontoId;
    a.uhr.t += 4 * TAG;
    assert.deepEqual(a.dienst.annehmen(spaet, code), { ok: false, fehler: 'zu-alt' });
  } finally { a.schliessen(); }
});

test('Stufen: 3 Freunde → Netzwerker; Zusammenführen zählt sich selbst nicht; Löschen räumt auf', () => {
  const a = aufbau('stufen');
  try {
    const werber = a.kontoStore.erstelleGast().kontoId;
    const code = a.store.codeFuer(werber);
    const gaeste = [1, 2, 3].map(() => a.kontoStore.erstelleGast().kontoId);
    for (const g of gaeste) a.dienst.annehmen(g, code);
    a.uhr.t += TAG;
    for (const g of gaeste) a.kontoStore.merkeAktiv(g);
    assert.deepEqual(a.kontoStore.ansicht(werber).erfolge.map((e) => e.erfolg).sort(), ['gastgeber', 'netzwerker']);
    assert.equal(a.dienst.meinStand(werber).naechste.id, 'botschafter');

    // Gast 1 und Werber sind dieselbe Person (zusammengeführt) → diese Einladung fällt weg
    a.kontoStore.fasseZusammen(werber, gaeste[0]);
    assert.equal(a.dienst.meinStand(werber).bestaetigt, 2);

    a.kontoStore.loesche(werber);
    assert.equal(a.store.kontoVonCode(code), null);
    assert.equal(a.store.zahlen().angenommen, 0);
  } finally { a.schliessen(); }
});

test('Routen: eigener Stand, Info zum Code, Annehmen', async () => {
  const a = aufbau('routen');
  const werber = a.kontoStore.erstelleGast().kontoId;
  a.kontoStore.setzeName(werber, 'Vali');
  const gast = a.kontoStore.erstelleGast().kontoId;
  const pflicht = (req, res, next) => (req.get('x-konto') ? ((req.kontoId = req.get('x-konto')), next()) : res.status(401).json({ error: 'Nicht angemeldet' }));
  const app = express();
  app.use(express.json());
  app.use('/api/einladung', createEinladungRouter({ dienst: a.dienst, requireKonto: pflicht }));
  const server = app.listen(0);
  const call = (method, p, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port: server.address().port, path: `/api/einladung${p}`, method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
  try {
    assert.equal((await call('GET', '/mein')).status, 401);
    const mein = (await call('GET', '/mein', null, { 'x-konto': werber })).body;
    assert.match(mein.code, /^[A-Z2-9]{8}$/);
    assert.deepEqual([mein.bestaetigt, mein.wartend, mein.naechste.id], [0, 0, 'gastgeber']);
    assert.deepEqual((await call('GET', `/info/${mein.code}`)).body, { name: 'Vali' });
    assert.equal((await call('GET', '/info/ZZZZZZZZ')).status, 404);
    assert.deepEqual((await call('POST', '/annehmen', { code: mein.code }, { 'x-konto': gast })).body, { ok: true });
    const r = await call('POST', '/annehmen', { code: mein.code }, { 'x-konto': gast });
    assert.deepEqual([r.status, r.body.fehler], [400, 'schon']);
  } finally {
    server.close();
    a.schliessen();
  }
});
