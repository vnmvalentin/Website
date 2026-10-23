// "Gerade los": Schwellen, Reihenfolge, Zwischenspeicher, kaputte Quellen
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { buildItems, createActivityRouter } = require('../activityRoutes');

test('Unter der Schwelle: nichts (so wie heute im echten Betrieb)', () => {
  assert.deepEqual(buildItems({ wtBattles7: 499, wtUsers7: 9, dailyRuns7: 10, levelsPublished: 3, openTournaments: [] }), []);
  assert.deepEqual(buildItems({}), []);
});

test('Über der Schwelle: Turnier zuerst, höchstens vier', () => {
  const items = buildItems({
    wtBattles7: 2583, wtUsers7: 15, dailyRuns7: 80, levelsPublished: 25,
    openTournaments: [{ id: 'abc', name: 'Herbst-Cup' }],
  });
  assert.deepEqual(items.map((i) => i.id), ['turniere', 'wt-matches', 'wt-kanaele', 'tagesrennen']);
  assert.equal(items[0].label, 'Turnier offen: Herbst-Cup');
  assert.equal(items[0].href, '/clash-royale/turnier/abc');
  assert.equal(items[1].value, 2583);
  const zwei = buildItems({ openTournaments: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
  assert.deepEqual(zwei[0], { id: 'turniere', value: 2, label: 'Clash-Royale-Turniere offen', href: '/clash-royale' });
});

test('Route: zwischengespeichert, Fehler der Quelle → leere Liste', async () => {
  let calls = 0;
  let t = 0;
  let fail = false;
  const app = express();
  app.use('/api/activity', createActivityRouter({
    getStats: () => { calls++; if (fail) throw new Error('weg'); return { wtBattles7: 600 }; },
    now: () => t,
  }));
  const server = app.listen(0);
  const get = () => new Promise((resolve, reject) => {
    http.get({ port: server.address().port, path: '/api/activity' }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(JSON.parse(b)));
    }).on('error', reject);
  });
  try {
    assert.equal((await get()).items[0].id, 'wt-matches');
    await get();
    assert.equal(calls, 1);
    t += 6 * 60 * 1000;
    fail = true;
    assert.deepEqual((await get()).items, []);
    assert.equal(calls, 2);
  } finally {
    server.close();
  }
});
