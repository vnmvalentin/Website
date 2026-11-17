// npm test -- profile — Visitenkarte /u/<adresse>: opt-in je Konto, Adressregeln (Sperrliste, fremde Twitch-Namen),
// Reihenfolge und Ausblenden, Abzeichen-Vitrine, Lieblingsspiel, CR-Konto, Übernahme alter Twitch-Profile,
// Zusammenführen und Löschen von Konten. Nur Temp-Ordner, Quellen und APIs sind Attrappen.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createProfileStore } = require('../profileStore');
const { createVisitenkarten, baueAbschnitte, adresseAusName, normalisiereCrTag } = require('../profileRoutes');
const { createKontoStore } = require('../../konto/kontoStore');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-'));
const uhr = { t: Date.UTC(2026, 10, 16, 12) };
const store = createProfileStore(path.join(dir, 'p.db'), { now: () => uhr.t });
const kontoStore = createKontoStore({ datei: path.join(dir, 'k.db'), now: () => uhr.t, erfolgErlaubt: () => true });

// Wie kontoFuerBrowser, nur mit festen Namen statt der echten (leeren) Kataloge
const kontoAnsicht = (id) => {
  const a = kontoStore.ansicht(id);
  return a && {
    ...a,
    spiele: a.spiele.map((s) => ({ ...s, name: s.spiel })),
    erfolge: a.erfolge.map((e) => ({ ...e, name: { de: e.erfolg }, text: null })),
    bestwerte: [],
  };
};

const twitchKonten = { vnmvalentin: '1', streamer: '42' };
let twitchKaputt = false;
const crAufrufe = [];
const sources = {
  winTracker: (id) => (id === '1' ? { playerName: 'Vali', trophies: 9000 } : null),
  tournaments: () => [],
  adventure: () => { throw new Error('Datei kaputt'); },
  garden: (id) => (id === '1' ? { level: 12, gold: 5000 } : null),
};
const karten = createVisitenkarten({
  store,
  kontoAnsicht,
  getSources: () => sources,
  now: () => uhr.t,
  log: { error() {} },
  twitchIdVonLogin: async (login) => {
    if (twitchKaputt) throw new Error('Twitch weg');
    return twitchKonten[login] || null;
  },
  holeCrSpieler: async (tag) => {
    crAufrufe.push(tag);
    if (tag === '999') return { notFound: true };
    if (tag === 'GGG') throw new Error('API weg');
    return { name: `Spieler ${tag}`, trophies: 9000 + crAufrufe.length, leagueNumber: 7, seasonMedals: 1200, clan: { name: 'Clan' } };
  },
  crKontenVon: (twitchId) => (twitchId === '1' ? [{ tag: '#2PP', name: 'Vali' }, { tag: '2pp', name: 'doppelt' }, { tag: 'kaputt!' }] : []),
});

const requireKonto = (req, res, next) => {
  if (!req.get('x-konto')) return res.status(401).json({ error: 'Nicht angemeldet' });
  req.kontoId = req.get('x-konto');
  if (req.get('x-twitch-login')) req.twitchLogin = req.get('x-twitch-login');
  return next();
};
const app = express();
app.use(express.json());
app.use('/api/public-profile', karten.router({ requireKonto }));
const server = app.listen(0);

function call(method, p, { body, konto, twitchLogin } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { ...(data ? { 'content-type': 'application/json' } : {}), ...(konto ? { 'x-konto': konto } : {}), ...(twitchLogin ? { 'x-twitch-login': twitchLogin } : {}) };
    const req = http.request({ port: server.address().port, path: `/api/public-profile${p}`, method, headers }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Konten: Valentin mit Twitch (ID 1), ein Gast, ein Discord-Konto mit Discord-Bild
const vali = kontoStore.anmelden('twitch', '1', { name: 'VnmValentin', avatar: 'https://static-cdn.jtvnw.net/jtv_user_pictures/v-profile_image-300x300.png' }).kontoId;
const gast = kontoStore.erstelleGast().kontoId;
kontoStore.setzeName(gast, 'Mäxchen Groß');
const disc = kontoStore.anmelden('discord', '555', { name: 'Disco', avatar: 'https://cdn.discordapp.com/avatars/555/abc.png' }).kontoId;

test.after(() => { server.close(); store.close(); kontoStore.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('Hilfen: Adresse aus dem Namen, CR-Tag tolerant lesen', () => {
  assert.equal(adresseAusName('Mäxchen Groß'), 'maxchen_gross');
  assert.equal(adresseAusName('!!'), '');
  assert.equal(normalisiereCrTag(' #2ppO '), '2PP0');
  assert.equal(normalisiereCrTag('#ABC'), null);
});

test('Abschnitte: Reihenfolge des Besitzers, Versteckte fehlen, Twitch-Bereiche nur mit Twitch, werfende Quelle fällt weg', () => {
  kontoStore.meldeErfolge(vali, 'worldflip', ['sieg', 'serie']);
  kontoStore.speichereStand(vali, 'worldflip', { x: 1 }, { xp: 120, version: 0 });
  const konto = kontoAnsicht(vali);
  const karte = {
    einstellungen: { reihenfolge: ['garden', 'abzeichen'], versteckt: ['winTracker'], lieblingsspiel: 'worldflip', vitrine: ['worldflip:serie', 'worldflip:fehlt'], crTag: '' },
    crStand: null,
  };
  const a = baueAbschnitte({ konto, karte, quellen: sources });
  assert.deepEqual(a.alle, ['garden', 'abzeichen', 'lieblingsspiel', 'spiele', 'winTracker']);
  assert.deepEqual(a.sichtbar, ['garden', 'abzeichen', 'lieblingsspiel', 'spiele']);
  assert.deepEqual(a.sections.lieblingsspiel, { id: 'worldflip', name: 'Worldflip', pfad: '/worldflip', xp: 120 });
  assert.deepEqual(a.sections.abzeichen.vitrine.map((x) => x.key), ['worldflip:serie'], 'nicht erreichte fallen aus der Vitrine');
  assert.deepEqual(a.sections.abzeichen.weitere.map((x) => x.key), ['worldflip:sieg']);
  // Ohne Twitch keine Twitch-Bereiche; das Lieblingsspiel steht auch ohne Spielstand da
  const g = baueAbschnitte({ konto: kontoAnsicht(gast), karte: { einstellungen: karte.einstellungen, crStand: null }, quellen: sources });
  assert.deepEqual(g.alle, ['lieblingsspiel']);
  assert.equal(g.sections.lieblingsspiel.xp, 0);
});

test('Editor: Vorschlag aus Twitch-Login bzw. Namen, ohne Adresse kein Speichern, Einschalten macht /u/ sichtbar', async () => {
  let me = await call('GET', '/me', { konto: gast });
  assert.equal(me.body.vorschlag, 'maxchen_gross');
  assert.equal(me.body.an, false);
  assert.equal((await call('GET', '/me', { konto: vali, twitchLogin: 'VnmValentin' })).body.vorschlag, 'vnmvalentin');

  assert.equal((await call('PUT', '/me', { konto: gast, body: { an: true } })).body.fehler, 'adresse-fehlt');
  assert.equal((await call('GET', '/u/maxchen_gross')).status, 404);
  me = await call('PUT', '/me', { konto: gast, body: { an: true, adresse: ' Maxchen_Gross ' } });
  assert.equal(me.status, 200);
  assert.deepEqual([me.body.an, me.body.adresse], [true, 'maxchen_gross']);
  const u = await call('GET', '/u/MAXCHEN_GROSS');
  assert.equal(u.status, 200);
  assert.equal(u.body.displayName, 'Mäxchen Groß');
  assert.equal(u.body.twitchLogin, null);
  assert.equal(u.body.stufe, null, 'ohne Spielstand keine Stufe');
  assert.equal((await call('GET', '/me')).status, 401);
});

test('Adressen: Form, Sperrliste, vergeben, fremder Twitch-Name, Twitch nicht erreichbar; eigener Twitch-Name geht immer', async () => {
  const put = (konto, adresse, twitchLogin) => call('PUT', '/me', { konto, twitchLogin, body: { adresse } });
  assert.equal((await put(disc, 'a')).body.fehler, 'adresse-form');
  assert.equal((await put(disc, 'mit-strich')).body.fehler, 'adresse-form');
  assert.equal((await put(disc, 'admin')).body.fehler, 'reserviert');
  assert.equal((await put(disc, 'maxchen_gross')).body.fehler, 'vergeben');
  assert.equal((await put(disc, 'streamer')).body.fehler, 'twitch-name');
  twitchKaputt = true;
  assert.equal((await put(disc, 'disco_fan')).status, 503);
  twitchKaputt = false;
  assert.equal((await put(disc, 'disco_fan')).status, 200);
  // „vnmvalentin“ steht in der Sperrliste — für den echten Twitch-Inhaber trotzdem frei
  const v = await put(vali, 'vnmvalentin', 'vnmvalentin');
  assert.equal(v.status, 200);
  assert.equal(v.body.adresse, 'vnmvalentin');
  // Ohne Twitch-Sitzung (z. B. per Discord angemeldet) erkennt der Server ihn an der verknüpften Twitch-ID
  await call('PUT', '/me', { konto: vali, body: { adresse: 'vali_tmp' } });
  assert.equal((await put(vali, 'vnmvalentin')).status, 200);
});

test('Einstellungen: Reihenfolge, Ausblenden, Vitrine (höchstens 6), Lieblingsspiel; Bild nur von Twitch', async () => {
  const me = await call('PUT', '/me', {
    konto: vali,
    twitchLogin: 'vnmvalentin',
    body: {
      an: true,
      einstellungen: {
        reihenfolge: ['garden', 'quatsch', 'garden', 'abzeichen'],
        versteckt: ['winTracker'],
        lieblingsspiel: 'gibts-nicht',
        vitrine: ['worldflip:serie', 'kaputt', ...Array.from({ length: 8 }, (_, i) => `x:y${i}`)],
      },
    },
  });
  assert.equal(me.status, 200);
  assert.deepEqual(me.body.einstellungen.reihenfolge, ['garden', 'abzeichen']);
  assert.equal(me.body.einstellungen.lieblingsspiel, '');
  assert.equal(me.body.einstellungen.vitrine.length, 6);
  assert.equal(me.body.einstellungen.vitrine[0], 'worldflip:serie');
  assert.deepEqual(me.body.abschnitte.find((a) => a.key === 'winTracker'), { key: 'winTracker', versteckt: true });
  assert.deepEqual(me.body.crKonten, [{ tag: '2PP', name: 'Vali' }], 'doppelte und kaputte CR-Konten fallen weg');

  const u = (await call('GET', '/u/vnmvalentin')).body;
  assert.deepEqual(u.reihenfolge, ['garden', 'abzeichen', 'spiele']);
  assert.equal(u.sections.winTracker, undefined);
  assert.equal(u.twitchLogin, 'vnmvalentin');
  assert.match(u.avatar, /^https:\/\/static-cdn\.jtvnw\.net\//);
  assert.equal(u.stufe.stufe, 2);

  await call('PUT', '/me', { konto: disc, body: { an: true } });
  assert.equal((await call('GET', '/u/disco_fan')).body.avatar, '', 'Discord-Bild verriete die Discord-ID');
});

test('CR-Konto: Tag wird geprüft und gemerkt, Unbekanntes und API-Ausfall gemeldet, im Hintergrund nach 30 min aufgefrischt', async () => {
  assert.equal((await call('PUT', '/me', { konto: vali, body: { crTag: '#ABC' } })).body.fehler, 'cr-form');
  assert.equal((await call('PUT', '/me', { konto: vali, body: { crTag: '999' } })).body.fehler, 'cr-unbekannt');
  assert.equal((await call('PUT', '/me', { konto: vali, body: { crTag: 'GGG' } })).status, 503);
  const me = await call('PUT', '/me', { konto: vali, body: { crTag: '#2pp' } });
  assert.deepEqual(me.body.cr, { tag: '2PP', name: 'Spieler 2PP' });
  let u = (await call('GET', '/u/vnmvalentin')).body;
  assert.equal(u.sections.clash.leagueNumber, 7);
  assert.equal(u.sections.clash.clan, 'Clan');
  const vorher = crAufrufe.length;

  uhr.t += 31 * 60 * 1000;
  u = (await call('GET', '/u/vnmvalentin')).body; // liefert den alten Stand und frischt im Hintergrund auf
  await new Promise((r) => setImmediate(r));
  assert.equal(crAufrufe.length, vorher + 1);
  uhr.t += 61 * 1000; // Zwischenspeicher der Seite abgelaufen
  const neu = (await call('GET', '/u/vnmvalentin')).body;
  assert.ok(neu.sections.clash.trophies > u.sections.clash.trophies);

  await call('PUT', '/me', { konto: vali, body: { crTag: '' } });
  assert.equal((await call('GET', '/u/vnmvalentin')).body.sections.clash, undefined);
});

test('Ausschalten wirkt sofort; Unsinn → 404', async () => {
  await call('PUT', '/me', { konto: gast, body: { an: false } });
  assert.equal((await call('GET', '/u/maxchen_gross')).status, 404);
  assert.equal((await call('GET', '/u/a')).status, 404);
  assert.equal((await call('GET', '/u/..%2F..')).status, 404);
});

test('Alte Twitch-Profile werden einmal übernommen, Adresse = Login; ausgeschaltete nicht', () => {
  store.legeAltesAn('900', 'AlterHase', true, { displayName: 'AlterHase' });
  store.legeAltesAn('901', 'leise', false);
  const angelegt = [];
  const kontoFuer = (twitchId, info) => {
    angelegt.push(twitchId);
    return kontoStore.kontoVonLink('twitch', twitchId) || kontoStore.anmelden('twitch', twitchId, info, { bestand: true }).kontoId;
  };
  assert.equal(store.uebernimmAlte(kontoFuer), 1);
  assert.deepEqual(angelegt, ['900']);
  const k = store.vonAdresse('alterhase');
  assert.equal(k.an, true);
  assert.equal(k.twitchLogin, 'alterhase');
  assert.equal(kontoStore.kontoVonLink('twitch', '900'), k.kontoId);
  assert.equal(store.uebernimmAlte(kontoFuer), 0, 'zweiter Lauf tut nichts');
  assert.equal(karten.karteZu('alterhase').displayName, 'AlterHase');
});

test('Konten zusammengeführt: Karte zieht um bzw. die des bleibenden Kontos gewinnt; gelöscht: Karte weg', async () => {
  kontoStore.beobachte({
    zusammengefuehrt: (ziel, quelle) => store.zusammenfuehren(ziel, quelle),
    geloescht: (k) => store.loesche(k),
  });
  // Gast mit Karte verknüpft ein neues Twitch-Konto ohne eigenes Konto → Gast bleibt, Karte bleibt
  // Discord-Konto mit Karte trifft auf Twitch-Konto mit Karte → Twitch bleibt, Discord-Karte weg
  const tw = kontoStore.anmelden('twitch', '42', { name: 'Streamer' }).kontoId;
  await call('PUT', '/me', { konto: tw, twitchLogin: 'streamer', body: { an: true, adresse: 'streamer' } });
  const r = kontoStore.verknuepfe(disc, 'twitch', '42', { name: 'Streamer' });
  assert.equal(r.kontoId, tw);
  assert.equal(store.karte(disc), null);
  assert.equal(store.karte(tw).adresse, 'streamer');
  assert.ok(store.adresseFrei('disco_fan', 'irgendwer'), 'Adresse der gelöschten Karte ist wieder frei');

  // Gast mit Karte wird in ein Twitch-Konto ohne Karte zusammengeführt → Karte zieht um
  const neuTw = kontoStore.anmelden('twitch', '43', { name: 'Neu' }).kontoId;
  kontoStore.fasseZusammen(neuTw, gast);
  assert.equal(store.karte(neuTw).adresse, 'maxchen_gross');

  kontoStore.loesche(neuTw);
  assert.equal(store.karte(neuTw), null);
});
