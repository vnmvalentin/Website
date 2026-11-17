// Link-Vorschau: Tags je Adresse, eingesetzt in die index.html, und das Bild dazu. Datenquellen sind Attrappen.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { resolveMeta, cleanPath } = require('../ogMeta');
const { buildHtml, createOgRouter } = require('../ogRoutes');

const sources = {
  todayKey: () => '2026-10-15',
  tournament: (id) => (id === 'abcd1234'
    ? { name: 'Herbst-Cup', description: 'Für alle.', maxPlayers: 16, status: 'registration', ownerLogin: 'vnmvalentin', count: 12 }
    : null),
  level: (code) => (code === 'SR-Y4R-QAY'
    ? { code, name: 'Himmelsschacht', creator: { name: 'vnm' }, difficulty: 4, players: 10, clearRate: 0.3, rating: { avg: 4.25, count: 4 }, creatorTicks: 120 * 65, preview: { w: 2, h: 1, rows: ['S#'] }, biome: 'sky' }
    : null),
  creator: () => null,
  dailyBoard: (k) => (k === '2026-10-15'
    ? { total: 80, entries: [{ rank: 1, name: 'Anna', ticks: 120 * 102 + 36 }, { rank: 2, name: 'Bob', ticks: 120 * 110 }] }
    : { total: 0, entries: [] }),
};

test('Pfade: Query und Slash weg, Unsinn abgewiesen', () => {
  assert.equal(cleanPath('/seed-runners/?x=1'), '/seed-runners');
  assert.equal(cleanPath('/'), '/');
  assert.equal(cleanPath('seed-runners'), null);
  assert.equal(cleanPath('/%E0%A4%A'), null);
});

test('Feste Seite, Turnier, Level, Tagesrennen, Einladung', () => {
  assert.equal(resolveMeta('/garden', sources).title, 'Virtual Farm');

  const t = resolveMeta('/clash-royale/turnier/abcd1234', sources);
  assert.equal(t.title, 'Herbst-Cup — Clash Royale Turnier');
  assert.match(t.description, /^12\/16 Spieler · Anmeldung offen · von vnmvalentin — Für alle\.$/);
  assert.deepEqual(t.card.stat, { value: '12/16', label: 'Spieler' });
  assert.equal(resolveMeta('/clash-royale/turnier/zzzz9999', sources), null, 'unbekanntes Turnier: Standard-Vorschau');

  const l = resolveMeta('/seed-runners/levels/SR-Y4R-QAY', sources);
  assert.equal(l.title, 'Himmelsschacht — Seed Runners-Level');
  assert.match(l.description, /von vnm · Schwer · 10 Spieler, 30\u00a0% geschafft · 4,3 von 5 Sternen/);
  assert.equal(l.card.stat.value, '1:05.00');

  const d = resolveMeta('/seed-runners/daily', sources);
  assert.equal(d.title, 'Tagesrennen 15.10.2026 — Seed Runners');
  assert.match(d.description, /80 bestätigte Läufe, Bestzeit 1:42\.30 von Anna\./);
  assert.equal(d.card.table.length, 2);
  const a = resolveMeta('/seed-runners/daily/2026-10-01', sources);
  assert.equal(a.noindex, true);
  assert.match(a.description, /niemand eine Zeit/);

  const inv = resolveMeta('/blobby/AB12', sources);
  assert.equal(inv.title, 'Einladung: Blobby Volley');
  assert.equal(inv.shot, 'blobby', 'Einladung zeigt das Spielbild');
  assert.equal(inv.card.kicker, 'Einladung');
  assert.equal(resolveMeta('/flick-soccer', sources).shot, 'flick-soccer');
  assert.equal(resolveMeta('/seed-runners/XYZ9', sources).title, 'Einladung: Seed Runners');
  assert.equal(resolveMeta('/seed-runners/verlauf', sources), null, 'Unterseite ist kein Raumcode');
  assert.equal(resolveMeta('/irgendwas', sources), null);
});

test('Öffentliches Profil: Zusammenfassung aus den Abschnitten, ausgeschaltet → Standard', () => {
  const src = {
    profile: (login) => (login === 'vali'
      ? { login: 'vali', displayName: 'Vali', sections: {
        winTracker: { trackMode: 'medals', leagueNumber: 7, last30: { wins: 54, losses: 31, draws: 0 } },
        tournaments: [{ champion: true }, { champion: false }],
        seedRunners: { levels: 3 },
      } }
      : null),
  };
  const p = resolveMeta('/u/Vali', src);
  assert.equal(p.title, 'Vali — Profil');
  assert.equal(p.description, 'Ultimate Champion · 54–31 in 30 Tagen · 1 Turniersieg · 3 Seed-Runners-Level. Das ganze Profil auf vnmvalentin.de.');
  assert.equal(p.section, 'cr');
  assert.equal(resolveMeta('/u/niemand', src), null);
});

test('Werfende Quelle führt zur Standard-Vorschau statt zum Absturz', () => {
  assert.equal(resolveMeta('/clash-royale/turnier/abcd1234', { tournament: () => { throw new Error('DB weg'); } }), null);
});

test('HTML: alte Kopf-Tags raus, neue rein, Werte escaped', () => {
  const index = '<html><head><title data-default>Alt</title><meta property="og:title" content="Home"><meta name="description" content="x"><link rel="canonical" href="https://vnmvalentin.de"></head><body><div id="root">Startseite</div></body></html>';
  const meta = { path: '/x', title: 'A "B" <C>', description: 'D & E', section: 'cr' };
  const html = buildHtml(index, meta);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.ok(!html.includes('content="Home"'));
  assert.ok(html.includes('<title>A &quot;B&quot; &lt;C&gt; - vnmvalentin</title>'));
  assert.ok(html.includes('content="D &amp; E"'));
  assert.ok(html.includes('<link rel="canonical" href="https://vnmvalentin.de/x">'));
  assert.ok(html.includes('og:image" content="https://vnmvalentin.de/api/og/image.png?u=%2Fx&amp;v='));
  assert.ok(html.includes('<div id="root">Startseite</div>'), 'Körper bleibt unverändert');
  assert.match(buildHtml(null, meta), /^<!DOCTYPE html>/);
});

test('Routen: Seite per X-Original-URI, Bild mit Zwischenspeicher, unbekannt → 404', async () => {
  let renders = 0;
  const app = express();
  app.use('/api/og', createOgRouter({ getSources: () => sources, render: () => { renders++; return Buffer.from('png'); } }));
  const server = app.listen(0);
  const port = server.address().port;
  const get = (p, headers = {}) => new Promise((resolve, reject) => {
    http.get({ port, path: p, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', reject);
  });
  try {
    const page = await get('/api/og/page', { 'X-Original-URI': '/clash-royale/turnier/abcd1234?ref=discord' });
    assert.equal(page.status, 200);
    assert.match(page.body, /Herbst-Cup — Clash Royale Turnier - vnmvalentin/);
    const img = page.body.match(/og:image" content="https:\/\/vnmvalentin\.de([^"]+)"/)[1].replace(/&amp;/g, '&');
    const a = await get(img);
    const b = await get(img);
    assert.equal(a.status, 200);
    assert.match(a.type, /image\/png/);
    assert.equal(b.body, 'png');
    assert.equal(renders, 1, 'zweites Mal aus dem Zwischenspeicher');
    assert.equal((await get('/api/og/image.png?u=%2Fgibtsnicht')).status, 404);
  } finally {
    server.close();
  }
});

test('Clash-Royale-Stats: Spieler mit Namen aus dem Index, ohne Eintrag nur der Tag; Clan und Karte', () => {
  const src = {
    scoutPlayer: (tag) => (tag === '2PP0LYQ8' ? { name: 'Kronprinz', trophies: 7695, clan: 'Bayern Royale' } : null),
    card: (id) => (id === 'knight' ? { id: 'knight', name: 'Knight' } : null),
  };
  const known = resolveMeta('/clash/spieler/2pp0lyq8?reiter=kaempfe', src);
  assert.equal(known.title, 'Kronprinz (#2PP0LYQ8) — Clash Royale Stats');
  assert.match(known.description, /^7\.695 Trophäen · Bayern Royale\. /);
  assert.equal(resolveMeta('/clash/spieler/8YY2QRLG', src).title, 'Spieler #8YY2QRLG — Clash Royale Stats');
  assert.equal(resolveMeta('/clash/spieler/8YY2QRLG', {}).section, 'cr'); // ohne Quelle weiter mit dem Tag
  assert.equal(resolveMeta('/clash/clan/QQQ', src).title, 'Clan #QQQ — Clash Royale');
  assert.equal(resolveMeta('/clash/karten/knight', src).title, 'Knight — Clash Royale Karte');
  assert.equal(resolveMeta('/clash/karten/gibtsnicht', src), null);
  assert.equal(resolveMeta('/clash/spieler/XYZ', src), null); // kein gültiger Tag
  assert.equal(resolveMeta('/clash/decks', src).title, 'Clash Royale Decks der Besten');
});

test('Visitenkarte: Stufe, Lieblingsspiel, Abzeichen und gewähltes CR-Konto in der Vorschau', () => {
  const src = {
    profile: (adresse) => (adresse === 'maxchen'
      ? { login: 'maxchen', displayName: 'Mäxchen', stufe: { stufe: 4 }, sections: {
        lieblingsspiel: { id: 'worldflip', name: 'Worldflip' },
        abzeichen: { vitrine: [{}], weitere: [{}, {}] },
        clash: { leagueNumber: 0, trophies: 7400 },
      } }
      : null),
  };
  const p = resolveMeta('/u/maxchen', src);
  assert.equal(p.description, 'Stufe 4 · spielt am liebsten Worldflip · 3 Abzeichen · 7400 Trophäen. Das ganze Profil auf vnmvalentin.de.');
  assert.equal(p.section, 'cr');
  assert.equal(p.image.key, 'maxchen');
});
