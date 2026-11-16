// Route /player/:tag/form (Reiter „Form“ im Profil): Muster aus dem gespeicherten Verlauf. Temp-Datenbank, kein Netz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-scout-form-test-'));
process.env.CR_SCOUT_DB = path.join(tmpDir, 'scout.db');

const express = require('express');
const shape = require('../scoutShape');
const store = require('../scoutStore');
const { createScoutRouter } = require('../scoutRoutes');
const crApi = require('../../lib/crApi');

test.after(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const card = (name) => ({ name, id: 26000000, level: 14, maxLevel: 16, rarity: 'common', elixirCost: 3, iconUrls: { medium: 'x' } });
const DECK = ['Knight', 'Archers', 'Fireball', 'Musketeer', 'Skeletons', 'Ice Spirit', 'The Log', 'Hog Rider'].map(card);
const OPP = ['Mega Knight', 'Bats', 'Zap', 'Miner', 'Wall Breakers', 'Inferno Dragon', 'Goblin Gang', 'Arrows'].map(card);
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '');
const raw = (ms, won, type = 'pathOfLegend', mode = 'Ranked1v1_NewArena') => ({
  type, battleTime: stamp(ms), gameMode: { id: 1, name: mode }, arena: { name: 'League 7' },
  team: [{ tag: '#2PP', name: 'Ich', crowns: won ? 2 : 0, cards: DECK }], opponent: [{ tag: '#8YY', name: 'B', crowns: won ? 0 : 1, cards: OPP }],
});

test('Form: Muster aus dem Verlauf, Freundschaftskämpfe zählen nicht, Filter nach Modus, unbekannte Zeitzone → Berlin', async () => {
  const t0 = Date.UTC(2026, 10, 10, 18);
  const log = [
    ...Array.from({ length: 12 }, (_, i) => raw(t0 + i * 5 * 60000, i % 3 !== 0)),
    ...Array.from({ length: 6 }, (_, i) => raw(t0 + (13 + i) * 5 * 60000, i % 2 === 0, 'PvP', 'Ladder')),
    raw(t0 + 30 * 5 * 60000, true, 'friendly', 'Friendly'),
  ];
  store.rememberBattles('2PP', shape.shapeBattles(log, '2PP', 16));

  const api = { isConfigured: () => true, normalizeTag: crApi.normalizeTag, crApiGet: async () => ({ notFound: true }), crApiGetSafe: async () => null };
  const app = express();
  app.use('/s', createScoutRouter({ api, store, meta: false, crawlSpacingMs: 0 }));
  const server = http.createServer(app);
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  const get = async (p) => (await fetch(`http://127.0.0.1:${server.address().port}/s${p}`)).json();
  try {
    const all = await get('/player/2PP/form?tz=America/New_York');
    assert.equal(all.patterns.n, 18); // 12 Ranked + 6 Trophäenstraße, ohne den Freundschaftskampf
    assert.deepEqual(all.groups.map((g) => [g.group, g.n]), [['ranked', 12], ['ladder', 6]]);
    assert.equal(all.patterns.hardCards.length, 0); // immer dasselbe Gegner-Deck → keine Karte fällt heraus
    const ranked = await get('/player/2PP/form?gruppe=ranked&tz=Mars/Olympus');
    assert.equal(ranked.group, 'ranked');
    assert.equal(ranked.patterns.n, 12);
    assert.equal(ranked.patterns.wins, 8);
    // 18:00 UTC ist in Berlin Abend → Zeitzone fiel auf Berlin zurück
    assert.equal(ranked.patterns.timeOfDay.find((b) => b.key === 'evening').n, 12);
    const none = await get('/player/9GG/form');
    assert.equal(none.patterns.n, 0);
  } finally {
    await new Promise((r) => { server.close(r); });
  }
});
