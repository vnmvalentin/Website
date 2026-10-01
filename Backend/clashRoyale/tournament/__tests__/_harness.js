// Gemeinsamer Prüfstand der Turnier-HTTP-Tests: temporäre Datenbank, Attrappen für die übrigen
// CR-Stores (die beim Laden der Modi sonst die echten Datenbanken öffnen) und die CR-API,
// Auth per Header x-test-user = "<id>:<login>". MUSS vor routes/store geladen werden.
const path = require('path');
const os = require('os');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-turnier-'));
process.env.CR_TOURNAMENT_DB = path.join(tmpDir, 'test.db');

const stub = new Proxy({}, { get: () => () => null });
for (const s of ['bannedCardsStore', 'crPresetStore', 'crProfileStore', 'crStreamerStore', 'winTrackerStore']) {
  const p = require.resolve(path.join(__dirname, '../../lib', s + '.js'));
  require.cache[p] = { id: p, filename: p, loaded: true, exports: stub };
}
// CR-API: echte Tag-Normalisierung (nur Zeichen 0289PYLQGRJCUV sind gültig), gefälschte Profilabfrage
const crApiPath = require.resolve('../../lib/crApi');
const realCrApi = require(crApiPath);
require.cache[crApiPath].exports = {
  ...realCrApi,
  isConfigured: () => true,
  fetchPlayerSummary: async (tag) => (tag === 'Q0Q0Q0' ? { notFound: true } : { name: `Spieler ${tag}`, leagueNumber: 4, trophies: 9000 }),
};

const express = require('express');
const createTournamentRouter = require('../routes');
const store = require('../store');

const readUser = (req) => {
  const h = req.get('x-test-user');
  if (h) { const [id, login] = h.split(':'); req.twitchId = id; req.twitchLogin = login; }
};
const requireAuth = (req, res, next) => { readUser(req); if (!req.twitchId) return res.status(401).json({ error: 'auth' }); next(); };
const optionalAuth = (req, res, next) => { readUser(req); next(); };

/** Startet den Server (test.before) und räumt danach auf (test.after); liefert call(). */
function setup(test) {
  let base, server;
  test.before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/t', createTournamentRouter({ requireAuth, optionalAuth, autoStartIntervalMs: 0 }));
    await new Promise(r => { server = app.listen(0, r); });
    base = `http://127.0.0.1:${server.address().port}/t`;
  });
  test.after(() => { server.close(); store._close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

  return async (method, url, { user, body, secret } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (user) headers['x-test-user'] = user;
    if (secret) headers['x-tournament-secret'] = secret;
    const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
}

// Gültige CR-Kürzel (nur Zeichen 0289PYLQGRJCUV) für Testspieler
const TAGS = ['2PPQ0', '8LQGR', '9YJCU', '2V8Y9', 'GRJ2P', 'UVC0Q', 'QQ2PP', 'LLRR8', 'C0C0C', 'JJYY2', 'PG9PG', 'RVRV0', '820QL', 'YLYL9', 'GCGC2', 'UUQQ8'];

module.exports = { setup, store, createTournamentRouter, TAGS };
