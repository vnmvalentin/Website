// npm test -- laden — Laden ohne Netz: Stripe ist eine Attrappe, alle Datenbanken liegen im Temp-Ordner bzw. im
// Arbeitsspeicher. Prüft Katalog-Regeln, Verbuchen (jede Sitzung nur einmal), Unterstützer-Summen, Abzeichen und
// Glocke, Zusammenführen/Löschen, Bezahlseite (feste Beträge, Rückweg nur eigene Seiten), Routen (Zustimmung Pflicht,
// Dankesliste nur für Unterstützer) und die Weiterleitung aus dem Abo-Webhook samt EU-Prüfung.
'use strict';

process.env.BILLING_DB = ':memory:';
process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
process.env.FRONTEND_URL = 'https://example.test/';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createLadenStore } = require('../ladenStore');
const { createLadenDienst } = require('../ladenDienst');
const { createLadenRouter } = require('../ladenRoutes');
const { gueltigeArtikel, artikelFehler } = require('../katalog');
const { createBillingService, registriereEinmalkauf, registriereRuecknahme, missingStripeConfig } = require('../../billing/billingService');

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'laden-test-'));
test.after(() => fs.rmSync(ordner, { recursive: true, force: true }));
const still = { error() {}, warn() {} };

const ARTIKEL = [
  { id: 'ss-kartenruecken-mond', spiel: 'sacrifice-and-sigils', name: { de: 'Mond-Rücken', en: 'Moon back' }, text: { de: 't', en: 't' }, preisCent: 199 },
];

function fakeStripe() {
  const calls = [];
  return {
    calls,
    checkout: { sessions: { create: async (p) => { calls.push(['checkout', p]); return { url: 'https://stripe.test/pay' }; } } },
    refunds: { create: async (p) => { calls.push(['refund', p]); } },
  };
}

function fakeKonten() {
  const erfolge = [];
  const entzogen = [];
  return {
    erfolge,
    entzogen,
    meldeErfolge: (k, spiel, ids) => erfolge.push([k, spiel, ...ids]),
    entziehErfolg: (k, spiel, id) => { entzogen.push([k, spiel, id]); return true; },
    ansicht: (k) => ({ name: `Name ${k}`, discord: k === 'kD' ? { id: 'd-1' } : null }),
  };
}

test('Katalog: Clash Royale gesperrt, Preisrahmen, Spiel muss existieren, doppelte IDs raus', () => {
  assert.equal(artikelFehler(ARTIKEL[0]), null);
  assert.equal(artikelFehler({ ...ARTIKEL[0], spiel: 'gibts-nicht' }), 'spiel');
  assert.equal(artikelFehler({ ...ARTIKEL[0], preisCent: 10 }), 'preis');
  assert.equal(artikelFehler({ ...ARTIKEL[0], preisCent: 1.5 }), 'preis');
  assert.equal(artikelFehler({ ...ARTIKEL[0], id: 'X' }), 'id');
  assert.equal(artikelFehler({ ...ARTIKEL[0], name: { de: 'nur de' } }), 'name');
  assert.deepEqual(gueltigeArtikel([ARTIKEL[0], ARTIKEL[0]], still).map((a) => a.id), [ARTIKEL[0].id]);
});

test('Echter Katalog: alle Designs gültig, mit Bild, und jedes Spiel sagt, wo man sein Design auswählt', () => {
  const echt = require('../katalog');
  assert.equal(echt.gueltigeArtikel(echt.ARTIKEL, still).length, echt.ARTIKEL.length, 'kein Artikel darf beim Start herausfallen');
  for (const a of echt.ARTIKEL) {
    assert.match(a.bild || '', /^\/media\/laden\/[a-z0-9-]+\.webp$/, `${a.id}: Bild unter /media/laden/`);
    assert.ok(fs.existsSync(path.join(__dirname, '../../../Frontend/public', a.bild)), `${a.id}: Bilddatei fehlt`);
    const info = echt.spielInfo(a.spiel);
    assert.ok(info.wo?.de && info.wo?.en, `${a.spiel}: in katalog.js SPIEL_INFO „wo“ (DE/EN) eintragen`);
    assert.match(info.pfad, /^\/[a-z0-9-]+$/);
  }
});

test('Speicher: jede Sitzung nur einmal, Summen, Besitz, Zusammenführen und Löschen', () => {
  const uhr = { t: 1000 };
  const s = createLadenStore({ datei: path.join(ordner, 's.db'), now: () => uhr.t });
  try {
    assert.equal(s.verbuche({ sessionId: 'cs_1', kontoId: 'kA', typ: 'unterstuetzer', betragCent: 500, aufListe: false }), true);
    assert.equal(s.verbuche({ sessionId: 'cs_1', kontoId: 'kA', typ: 'unterstuetzer', betragCent: 500 }), false, 'doppelt zugestellt');
    uhr.t = 2000;
    s.verbuche({ sessionId: 'cs_2', kontoId: 'kA', typ: 'unterstuetzer', betragCent: 1000, aufListe: true });
    assert.deepEqual(s.unterstuetzer('kA'), { summeCent: 1500, anzahl: 2, seit: 1000, aufListe: true });
    s.verbuche({ sessionId: 'cs_3', kontoId: 'kB', typ: 'artikel', artikelId: 'ss-kartenruecken-mond', betragCent: 199 });
    assert.equal(s.besitzt('kB', 'ss-kartenruecken-mond'), true);
    assert.deepEqual(s.summen(), { unterstuetzer: { anzahl: 2, cent: 1500 }, artikel: { anzahl: 1, cent: 199 } });
    assert.deepEqual(s.dankesliste(), [{ kontoId: 'kA', seit: 1000 }]);
    assert.equal(s.setzeDankesliste('kA', false), true);
    assert.deepEqual(s.dankesliste(), []);
    assert.equal(s.setzeDankesliste('kNiemand', true), false);

    // Zusammenführen: Besitz und Beiträge wandern, Beiträge addieren sich
    s.verbuche({ sessionId: 'cs_4', kontoId: 'kB', typ: 'unterstuetzer', betragCent: 300, aufListe: true });
    uhr.t = 3000;
    s.zusammenfuehren('kA', 'kB');
    assert.equal(s.besitzt('kA', 'ss-kartenruecken-mond'), true);
    assert.equal(s.besitzt('kB', 'ss-kartenruecken-mond'), false);
    assert.deepEqual(s.unterstuetzer('kA'), { summeCent: 1800, anzahl: 3, seit: 1000, aufListe: true });
    assert.equal(s.unterstuetzer('kB'), null);

    // Löschen: Besitz und Dankesliste weg, Buchungen bleiben (ohne Konto)
    s.kontoLoeschen('kA');
    assert.deepEqual(s.besitz('kA'), []);
    assert.equal(s.unterstuetzer('kA'), null);
    assert.equal(s.summen().unterstuetzer.anzahl, 3);
  } finally { s.close(); }
});

test('Speicher: Erstattung nimmt genau eine Zahlung zurück — Design weg, Beitrag weg, letzter Beitrag beendet Unterstützer', () => {
  const s = createLadenStore({ datei: path.join(ordner, 'r.db'), now: () => 5000 });
  try {
    s.verbuche({ sessionId: 'cs_a', kontoId: 'kA', typ: 'unterstuetzer', betragCent: 500, aufListe: true, paymentIntent: 'pi_a' });
    s.verbuche({ sessionId: 'cs_b', kontoId: 'kA', typ: 'unterstuetzer', betragCent: 300, paymentIntent: 'pi_b' });
    s.verbuche({ sessionId: 'cs_c', kontoId: 'kB', typ: 'artikel', artikelId: 'ss-kartenruecken-mond', betragCent: 199, paymentIntent: 'pi_c' });

    assert.equal(s.nimmZurueck('pi_unbekannt'), null, 'z. B. eine Abo-Zahlung');
    assert.equal(s.nimmZurueck(null), null);

    assert.deepEqual(s.nimmZurueck('pi_a'), { kontoId: 'kA', typ: 'unterstuetzer', artikelId: null, nochUnterstuetzer: true });
    assert.deepEqual(s.unterstuetzer('kA'), { summeCent: 300, anzahl: 1, seit: 5000, aufListe: true });
    assert.equal(s.nimmZurueck('pi_a'), null, 'zweite Meldung derselben Erstattung ändert nichts');
    assert.equal(s.nimmZurueck('pi_b').nochUnterstuetzer, false);
    assert.equal(s.unterstuetzer('kA'), null);
    assert.deepEqual(s.dankesliste(), [], 'ohne Beitrag nicht mehr auf der Dankesliste');

    assert.deepEqual(s.nimmZurueck('pi_c'), { kontoId: 'kB', typ: 'artikel', artikelId: 'ss-kartenruecken-mond', nochUnterstuetzer: false });
    assert.equal(s.besitzt('kB', 'ss-kartenruecken-mond'), false);
    assert.deepEqual(s.summen(), {}, 'zurückgenommene Zahlungen zählen nicht mehr');

    // Doppelt bezahltes Design: eine Erstattung lässt den Besitz stehen, die zweite nimmt ihn
    s.verbuche({ sessionId: 'cs_d', kontoId: 'kC', typ: 'artikel', artikelId: 'ss-kartenruecken-mond', betragCent: 199, paymentIntent: 'pi_d' });
    s.verbuche({ sessionId: 'cs_e', kontoId: 'kC', typ: 'artikel', artikelId: 'ss-kartenruecken-mond', betragCent: 199, paymentIntent: 'pi_e' });
    s.nimmZurueck('pi_d');
    assert.equal(s.besitzt('kC', 'ss-kartenruecken-mond'), true);
    s.nimmZurueck('pi_e');
    assert.equal(s.besitzt('kC', 'ss-kartenruecken-mond'), false);
  } finally { s.close(); }
});

test('Speicher: ältere Datenbank ohne Zahlungs-ID wird nachgerüstet, Buchungen bleiben', () => {
  const datei = path.join(ordner, 'alt.db');
  const Database = require('better-sqlite3');
  const alt = new Database(datei);
  alt.exec(`CREATE TABLE zahlungen (session_id TEXT PRIMARY KEY, konto_id TEXT NOT NULL, typ TEXT NOT NULL, artikel_id TEXT,
    betrag_cent INTEGER NOT NULL, bezahlt INTEGER NOT NULL);
    INSERT INTO zahlungen VALUES ('cs_alt', 'kA', 'unterstuetzer', NULL, 500, 1);`);
  alt.close();
  const s = createLadenStore({ datei });
  try {
    assert.deepEqual(s.summen(), { unterstuetzer: { anzahl: 1, cent: 500 } });
    assert.equal(s.verbuche({ sessionId: 'cs_neu', kontoId: 'kA', typ: 'unterstuetzer', betragCent: 300, paymentIntent: 'pi_neu' }), true);
    assert.equal(s.nimmZurueck('pi_neu').typ, 'unterstuetzer');
  } finally { s.close(); }
});

test('Dienst: Bezahlseite nur mit festen Beträgen, Rückweg nur eigene Seiten, schon Gekauftes nicht zweimal', async () => {
  const store = createLadenStore({ datei: path.join(ordner, 'd.db') });
  const stripe = fakeStripe();
  const dienst = createLadenDienst({ store, kontoStore: fakeKonten(), stripe: () => stripe, frontendUrl: 'https://example.test/', artikel: ARTIKEL, log: still });
  try {
    assert.deepEqual(await dienst.checkout({ kontoId: 'kA', typ: 'unterstuetzer', betragCent: 123 }), { fehler: 'betrag' });
    assert.deepEqual(await dienst.checkout({ kontoId: 'kA', typ: 'artikel', artikelId: 'gibts-nicht' }), { fehler: 'artikel' });
    assert.deepEqual(await dienst.checkout({ kontoId: 'kA', typ: 'abo' }), { fehler: 'typ' });
    assert.equal(stripe.calls.length, 0);

    const r = await dienst.checkout({ kontoId: 'kA', typ: 'unterstuetzer', betragCent: 500, aufListe: true, returnPath: 'https://evil.example', lang: 'en' });
    assert.equal(r.url, 'https://stripe.test/pay');
    const p = stripe.calls[0][1];
    assert.equal(p.mode, 'payment');
    assert.equal(p.line_items[0].price_data.unit_amount, 500);
    assert.equal(p.line_items[0].price_data.currency, 'eur');
    assert.equal(p.line_items[0].price_data.tax_behavior, 'inclusive', 'Betrag ist Endpreis inkl. Umsatzsteuer');
    assert.deepEqual(p.automatic_tax, { enabled: true });
    assert.deepEqual(p.metadata, { art: 'laden', konto_id: 'kA', typ: 'unterstuetzer', artikel_id: '', auf_liste: '1' });
    assert.equal(p.success_url, 'https://example.test/laden?kauf=ok', 'fremde Rücksprungadresse ersetzt');
    assert.equal(p.locale, 'en');

    store.verbuche({ sessionId: 'cs_x', kontoId: 'kA', typ: 'artikel', artikelId: ARTIKEL[0].id, betragCent: 199 });
    assert.deepEqual(await dienst.checkout({ kontoId: 'kA', typ: 'artikel', artikelId: ARTIKEL[0].id }), { fehler: 'schon' });
    await dienst.checkout({ kontoId: 'kB', typ: 'artikel', artikelId: ARTIKEL[0].id, returnPath: '/profile' });
    assert.equal(stripe.calls[1][1].line_items[0].price_data.unit_amount, 199);
    assert.equal(stripe.calls[1][1].cancel_url, 'https://example.test/profile?kauf=abbruch');
  } finally { store.close(); }
});

test('Dienst: Abschluss bucht einmal, vergibt das Abzeichen und legt einen Dank in die Glocke', async () => {
  const store = createLadenStore({ datei: path.join(ordner, 'a.db') });
  const konten = fakeKonten();
  const gemeldet = [];
  const dienst = createLadenDienst({ store, kontoStore: konten, stripe: () => fakeStripe(), melde: async (n) => { gemeldet.push(n); }, artikel: ARTIKEL, log: still });
  try {
    const sitzung = { id: 'cs_9', amount_total: 1000, metadata: { art: 'laden', konto_id: 'kD', typ: 'unterstuetzer', artikel_id: '', auf_liste: '1' } };
    assert.equal(await dienst.abschliessen(sitzung), true);
    assert.equal(await dienst.abschliessen(sitzung), false, 'zweite Zustellung');
    assert.deepEqual(konten.erfolge, [['kD', 'website', 'unterstuetzer']]);
    assert.equal(gemeldet.length, 1);
    assert.equal(gemeldet[0].nurGlocke, true, 'kein Push-Thema nötig');
    assert.deepEqual(gemeldet[0].konten, ['kD']);
    assert.deepEqual(dienst.dankesliste(), [{ name: 'Name kD', seit: store.unterstuetzer('kD').seit }]);
    assert.deepEqual(dienst.discordIdsDerUnterstuetzer(), ['d-1']);

    await dienst.abschliessen({ id: 'cs_10', amount_total: 199, metadata: { konto_id: 'kE', typ: 'artikel', artikel_id: ARTIKEL[0].id } });
    assert.deepEqual(dienst.besitzImSpiel('kE', 'sacrifice-and-sigils'), [ARTIKEL[0].id]);
    assert.deepEqual(dienst.besitzImSpiel('kE', 'garden'), []);
    assert.equal(konten.erfolge.length, 1, 'Kosmetik gibt kein Unterstützer-Abzeichen');
    // Glocke nach einem Design: führt ins Spiel (ohne SPIEL_INFO: erste Adresse aus analytics/spiele.js)
    assert.equal(gemeldet[1].url, '/sacrifice-and-sigils');
    assert.equal(gemeldet[1].text.de, 'Mond-Rücken gehört jetzt dir.');

    assert.equal(await dienst.abschliessen({ id: 'cs_11', metadata: { typ: 'unterstuetzer' } }), false, 'ohne Konto');
  } finally { store.close(); }
});

test('Dienst: Erstattung oder Rückbuchung entzieht das Abzeichen erst mit dem letzten Beitrag', async () => {
  const store = createLadenStore({ datei: path.join(ordner, 'e.db') });
  const konten = fakeKonten();
  const dienst = createLadenDienst({ store, kontoStore: konten, stripe: () => fakeStripe(), artikel: ARTIKEL, log: still });
  try {
    const beitrag = (id, cent) => ({ id: `cs_${id}`, payment_intent: `pi_${id}`, amount_total: cent, metadata: { konto_id: 'kA', typ: 'unterstuetzer', auf_liste: '1' } });
    await dienst.abschliessen(beitrag('1', 500));
    await dienst.abschliessen({ ...beitrag('2', 300), payment_intent: { id: 'pi_2' } });

    assert.equal(dienst.ruecknahme({ paymentIntent: 'pi_1', grund: 'erstattet' }), true);
    assert.deepEqual(konten.entzogen, [], 'zweiter Beitrag zählt noch');
    assert.equal(dienst.ruecknahme({ paymentIntent: 'pi_2', grund: 'rueckbuchung' }), true, 'Zahlungs-ID auch als Objekt gemerkt');
    assert.deepEqual(konten.entzogen, [['kA', 'website', 'unterstuetzer']]);
    assert.deepEqual(dienst.dankesliste(), []);
    assert.equal(dienst.ruecknahme({ paymentIntent: 'pi_2', grund: 'erstattet' }), false, 'schon zurückgenommen');
    assert.equal(dienst.ruecknahme({ paymentIntent: 'pi_abo', grund: 'erstattet' }), false, 'Abo-Zahlung: Laden tut nichts');

    await dienst.abschliessen({ id: 'cs_3', payment_intent: 'pi_3', amount_total: 199, metadata: { konto_id: 'kE', typ: 'artikel', artikel_id: ARTIKEL[0].id } });
    dienst.ruecknahme({ paymentIntent: 'pi_3', grund: 'erstattet' });
    assert.deepEqual(dienst.besitzImSpiel('kE', 'sacrifice-and-sigils'), []);
    assert.equal(konten.entzogen.length, 1, 'Design-Erstattung nimmt kein Abzeichen');
  } finally { store.close(); }
});

test('Routen: Zustimmung Pflicht, ohne Stripe 503, Dankesliste nur für Unterstützer, Besitz ohne Anmeldung leer', async () => {
  const store = createLadenStore({ datei: path.join(ordner, 'r.db') });
  const stripe = fakeStripe();
  const dienst = createLadenDienst({ store, kontoStore: fakeKonten(), stripe: () => stripe, artikel: ARTIKEL, log: still });
  const an = { eingerichtet: true };
  const konto = (req, res, next) => { if (req.get('x-konto')) req.kontoId = req.get('x-konto'); next(); };
  const pflicht = (req, res, next) => (req.get('x-konto') ? konto(req, res, next) : res.status(401).json({ error: 'Nicht angemeldet' }));
  const app = express();
  app.use(express.json());
  app.use('/api/laden', createLadenRouter({ dienst, store, optionalKonto: konto, requireKonto: pflicht, eingerichtet: () => an.eingerichtet, log: still }));
  const server = app.listen(0);
  const call = (method, p, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ port: server.address().port, path: `/api/laden${p}`, method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
  const A = { 'x-konto': 'kA' };
  try {
    const k = await call('GET', '/katalog');
    assert.equal(k.body.verfuegbar, true);
    assert.deepEqual(k.body.unterstuetzer.betraege, [300, 500, 1000, 2500]);
    assert.equal(k.body.artikel[0].id, ARTIKEL[0].id);
    assert.deepEqual(Object.keys(k.body.spiele), ['sacrifice-and-sigils'], 'je Spiel mit Artikeln eine Info');
    assert.equal(k.body.spiele['sacrifice-and-sigils'].pfad, '/sacrifice-and-sigils');

    assert.equal((await call('POST', '/checkout', { typ: 'unterstuetzer', betragCent: 500, zustimmung: true })).status, 401);
    const ohne = await call('POST', '/checkout', { typ: 'unterstuetzer', betragCent: 500 }, A);
    assert.equal(ohne.status, 400);
    assert.equal(ohne.body.fehler, 'zustimmung');
    assert.equal(stripe.calls.length, 0);
    const ok = await call('POST', '/checkout', { typ: 'unterstuetzer', betragCent: 500, zustimmung: true, aufListe: true }, A);
    assert.equal(ok.body.url, 'https://stripe.test/pay');
    assert.equal((await call('POST', '/checkout', { typ: 'unterstuetzer', betragCent: 7, zustimmung: true }, A)).body.fehler, 'betrag');

    an.eingerichtet = false;
    assert.equal((await call('POST', '/checkout', { typ: 'unterstuetzer', betragCent: 500, zustimmung: true }, A)).status, 503);
    an.eingerichtet = true;

    assert.equal((await call('PUT', '/dankesliste', { an: true }, A)).status, 403);
    await dienst.abschliessen({ id: 'cs_r', amount_total: 500, metadata: { konto_id: 'kA', typ: 'unterstuetzer', auf_liste: '0' } });
    assert.deepEqual((await call('GET', '/dankesliste')).body.namen, []);
    const liste = await call('PUT', '/dankesliste', { an: true }, A);
    assert.equal(liste.body.unterstuetzer.aufListe, true);
    assert.deepEqual((await call('GET', '/dankesliste')).body.namen.map((n) => n.name), ['Name kA']);
    assert.equal((await call('GET', '/mein', null, A)).body.unterstuetzer.summeCent, 500);

    await dienst.abschliessen({ id: 'cs_s', amount_total: 199, metadata: { konto_id: 'kA', typ: 'artikel', artikel_id: ARTIKEL[0].id } });
    assert.deepEqual((await call('GET', '/besitz/sacrifice-and-sigils')).body.artikel, []);
    assert.deepEqual((await call('GET', '/besitz/sacrifice-and-sigils', null, A)).body.artikel, [ARTIKEL[0].id]);
  } finally {
    server.close();
    store.close();
  }
});

test('Abo-Webhook reicht Ladenkäufe weiter: nur bezahlt, außerhalb der EU erstattet, Abo-Preis nicht nötig', async () => {
  assert.deepEqual(missingStripeConfig(), [], 'ohne STRIPE_PRICE_PREMIUM eingerichtet');
  const stripe = fakeStripe();
  const service = createBillingService({ stripe, log: still });
  const angekommen = [];
  registriereEinmalkauf(async (s) => { angekommen.push(s.id); });
  try {
    const sitzung = (id, extra) => ({
      type: 'checkout.session.completed', id: `evt_${id}`,
      data: { object: { id, mode: 'payment', payment_status: 'paid', payment_intent: `pi_${id}`, amount_total: 500, metadata: { art: 'laden', konto_id: 'kA', typ: 'unterstuetzer' }, customer_details: { address: { country: 'DE' } }, ...extra } },
    });
    await service.handleEvent(sitzung('cs_de'));
    assert.deepEqual(angekommen, ['cs_de']);
    assert.equal(await service.handleEvent(sitzung('cs_de')), false, 'Ereignis doppelt');

    await service.handleEvent(sitzung('cs_us', { customer_details: { address: { country: 'US' } } }));
    assert.deepEqual(angekommen, ['cs_de']);
    assert.deepEqual(stripe.calls.find((c) => c[0] === 'refund'), ['refund', { payment_intent: 'pi_cs_us' }]);

    // Überweisung o. Ä.: erst „completed“ ohne Geld, dann async_payment_succeeded
    await service.handleEvent(sitzung('cs_spaet', { payment_status: 'unpaid' }));
    assert.deepEqual(angekommen, ['cs_de']);
    await service.handleEvent({ ...sitzung('cs_spaet'), id: 'evt_cs_spaet_2', type: 'checkout.session.async_payment_succeeded' });
    assert.deepEqual(angekommen, ['cs_de', 'cs_spaet']);

    // Ohne verbundenen Laden: Fehler → Stripe stellt später erneut zu (Ereignis gilt nicht als verarbeitet)
    registriereEinmalkauf(null);
    await assert.rejects(service.handleEvent(sitzung('cs_offen')));
    registriereEinmalkauf(async (s) => { angekommen.push(s.id); });
    assert.equal(await service.handleEvent(sitzung('cs_offen')), true);
    assert.deepEqual(angekommen.at(-1), 'cs_offen');
  } finally {
    registriereEinmalkauf(null);
  }
});

test('Abo-Webhook: volle Erstattung und Rückbuchung gehen an den Laden, Teilerstattung nicht', async () => {
  const service = createBillingService({ stripe: fakeStripe(), log: still });
  const zurueck = [];
  registriereRuecknahme(async (r) => { zurueck.push(r); return true; });
  try {
    const charge = (id, extra) => ({ type: 'charge.refunded', id: `evt_${id}`, data: { object: { id: `ch_${id}`, payment_intent: `pi_${id}`, amount: 500, ...extra } } });
    await service.handleEvent(charge('teil', { refunded: false, amount_refunded: 200 }));
    assert.deepEqual(zurueck, [], 'Kulanz-Teilerstattung lässt den Kauf bestehen');
    await service.handleEvent(charge('voll', { refunded: true, amount_refunded: 500 }));
    assert.deepEqual(zurueck, [{ paymentIntent: 'pi_voll', grund: 'erstattet' }]);
    await service.handleEvent({ type: 'charge.dispute.created', id: 'evt_dp', data: { object: { id: 'dp_1', charge: 'ch_x', payment_intent: { id: 'pi_x' } } } });
    assert.deepEqual(zurueck.at(-1), { paymentIntent: 'pi_x', grund: 'rueckbuchung' });

    // Scheitert die Rücknahme, stellt Stripe das Ereignis erneut zu
    registriereRuecknahme(async () => { throw new Error('kaputt'); });
    await assert.rejects(service.handleEvent(charge('fehler', { refunded: true })));
    registriereRuecknahme(async (r) => { zurueck.push(r); return true; });
    assert.equal(await service.handleEvent(charge('fehler', { refunded: true })), true);
    assert.equal(zurueck.at(-1).paymentIntent, 'pi_fehler');
  } finally {
    registriereRuecknahme(null);
  }
});
