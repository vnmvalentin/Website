// HTTP-Schnittstelle der veröffentlichten Level (levelsRoutes.js) mit echtem Router, echtem Prüfer und Wegwerf-Datenbank.
// Die Anmeldung ist wie im Betrieb eine Middleware, die req.twitchId/twitchLogin setzt — hier aus Kopfzeilen des Tests.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { createSeedRunnersRouter } = require('../routes');
const { newRig, publishAs, makeLevel, guestKey, runFor } = require('./levelFixtures');

const ALICE = '1001';
const BOB = '2002';
const ADMIN = '9999';

const requireAuth = (req, res, next) => {
  const id = req.headers['x-test-account'];
  if (!id) return res.status(401).json({ error: 'Nicht eingeloggt' });
  req.twitchId = String(id);
  req.twitchLogin = String(req.headers['x-test-login'] || `user${id}`);
  return next();
};
const optionalAuth = (req, res, next) => {
  const id = req.headers['x-test-account'];
  if (id) {
    req.twitchId = String(id);
    req.twitchLogin = String(req.headers['x-test-login'] || `user${id}`);
  }
  next();
};
const isAdmin = (req) => String(req.twitchId) === ADMIN;

async function withServer(fn) {
  const rig = newRig();
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/seed-runners', createSeedRunnersRouter({
    daily: {}, todayKey: () => '2026-09-22', now: () => rig.clock.t,
    levelVerify: rig.levelVerify, levelService: rig.levels, requireAuth, optionalAuth, isAdmin,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/seed-runners`;
  const call = async (method, path, { body, account, login, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(account ? { 'X-Test-Account': account } : {}), ...(login ? { 'X-Test-Login': login } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  try {
    await fn({ rig, call, base });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rig.cleanup();
  }
}

const runBody = (f, run, key, name = 'Gast') => ({ playerKey: key, name, ticks: run.ticks, log: run.log, fp: f.fp });

test('Lesen ohne Anmeldung: Liste, Detail, Dokument, Geist; falsche und unbekannte Codes sind 404', async () => {
  await withServer(async ({ rig, call }) => {
    const { code, f } = await publishAs(rig, ALICE, { name: 'Öffentlich' });
    const list = await call('GET', '/levels?sort=new&q=%C3%B6ffent');
    assert.equal(list.status, 200);
    assert.deepEqual(list.json.items.map((l) => l.name), ['Öffentlich']);
    assert.equal(list.json.total, 1);

    const detail = await call('GET', `/levels/${code}`);
    assert.equal(detail.status, 200);
    assert.deepEqual([detail.json.name, detail.json.creator.name, detail.json.me.loggedIn], ['Öffentlich', `user${ALICE}`, false]);
    assert.equal((await call('GET', `/levels/${code.toLowerCase()}`)).status, 200, 'Groß-/Kleinschreibung egal');

    const doc = await call('GET', `/levels/${code}/doc`);
    assert.equal(doc.status, 200);
    assert.equal(doc.json.hash, f.hash);
    assert.equal(f.engine.validateDoc(doc.json.doc, { smoke: false }).hash, f.hash);
    const ghost = await call('GET', `/levels/${code}/ghost/creator`);
    assert.deepEqual(ghost.json.log, f.log);

    for (const bad of ['SR-ZZZ-ZZZ', 'kaputt', 'SR-000-000', '../../etc']) assert.equal((await call('GET', `/levels/${encodeURIComponent(bad)}`)).status, 404, bad);
    assert.equal((await call('GET', `/levels/${code}/ghost/abc`)).status, 404);
    assert.equal((await call('GET', `/levels/${code}/ghost/99999`)).status, 404);
    assert.equal((await call('GET', '/creators/../x')).status, 404);
  });
});

test('Ausgeblendete Level: Gäste bekommen 404, der Ersteller sieht sie', async () => {
  await withServer(async ({ rig, call }) => {
    const { code } = await publishAs(rig, ALICE);
    rig.levels.moderation.hide(code, 'Test');
    assert.equal((await call('GET', `/levels/${code}`)).status, 404);
    assert.equal((await call('GET', `/levels/${code}/doc`)).status, 404);
    assert.equal((await call('GET', `/levels/${code}`, { account: BOB })).status, 404);
    const own = await call('GET', `/levels/${code}`, { account: ALICE });
    assert.equal(own.status, 200);
    assert.equal(own.json.status, 'hidden');
    assert.equal((await call('GET', '/levels')).json.total, 0);
    assert.equal((await call('GET', '/levels?mine=1', { account: ALICE })).json.total, 1);
    assert.equal((await call('GET', '/levels?mine=1')).json.total, 0);
  });
});

test('Die festen Wege gehen dem allgemeinen "levels/:code" vor', async () => {
  await withServer(async ({ rig, call }) => {
    const f = await makeLevel();
    const check = await call('POST', '/levels/check', { body: { doc: f.doc } });
    assert.equal(check.status, 200, 'levels/check');
    assert.equal(check.json.hash, f.hash);
    assert.equal((await call('GET', `/levels/verification/${f.hash}`)).status, 401, 'levels/verification braucht Login (nicht 404)');
    assert.equal((await call('GET', `/levels/verification/${f.hash}`, { account: ALICE })).status, 200);
    const verify = await call('POST', '/levels/verify', { account: ALICE, body: { doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash } });
    assert.equal(verify.status, 200, 'levels/verify');
    assert.equal(verify.json.status, 'ok');
    void rig;
  });
});

test('Veröffentlichen über HTTP: 401 ohne Login, 409 ohne Verifizierung, 200 mit Code, 409 bei Doppeltem, 400 bei Wortfilter', async () => {
  await withServer(async ({ rig, call }) => {
    const f = await makeLevel({ name: 'HTTP-Level' });
    const body = { doc: f.doc, hash: f.hash };
    assert.equal((await call('POST', '/levels/publish', { body })).status, 401);
    const unverified = await call('POST', '/levels/publish', { account: ALICE, body });
    assert.equal(unverified.status, 409);
    assert.equal(unverified.json.status, 'nicht-verifiziert');

    await rig.levelVerify.submit({ accountId: ALICE, doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash });
    const ok = await call('POST', '/levels/publish', { account: ALICE, login: 'alice_tv', body });
    assert.equal(ok.status, 200);
    assert.match(ok.json.code, /^SR-[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    assert.equal((await call('GET', `/levels/${ok.json.code}`)).json.creator.name, 'alice_tv', 'der Ersteller-Name ist der Twitch-Name der Sitzung');

    const dup = await call('POST', '/levels/publish', { account: ALICE, body });
    assert.deepEqual([dup.status, dup.json.status, dup.json.existing], [409, 'doppelt', ok.json.code]);

    const bad = await makeLevel({ name: 'Wichser Level' });
    await rig.levelVerify.submit({ accountId: ALICE, doc: bad.doc, log: bad.log, ticks: bad.ticks, fp: bad.fp, hash: bad.hash });
    const filtered = await call('POST', '/levels/publish', { account: ALICE, body: { doc: bad.doc, hash: bad.hash } });
    assert.equal(filtered.status, 400);
    assert.ok(filtered.json.errors.length > 0);

    assert.equal((await call('POST', '/levels/publish', { account: ALICE, body: [] })).status, 400);
    assert.equal((await call('POST', '/levels/publish', { account: ALICE, body: '{"kaputt' })).status, 400);
  });
});

test('Spielen über HTTP: Versuch zählen, Lauf einsenden (Gast), 422 bei Manipulation, 409 bei falschem Stand, 404 bei unbekanntem Level', async () => {
  await withServer(async ({ rig, call }) => {
    const { code, f } = await publishAs(rig, ALICE);
    const run = await runFor(f, 0);
    const key = guestKey(1);

    const play = await call('POST', `/levels/${code}/play`, { body: { playerKey: key } });
    assert.deepEqual([play.status, play.json.counted], [200, true]);
    assert.equal((await call('POST', '/levels/SR-ZZZ-ZZZ/play', { body: { playerKey: key } })).status, 404);

    const ok = await call('POST', `/levels/${code}/submit`, { body: runBody(f, run, key, 'Gast Eins') });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.json.status, ok.json.rank, ok.json.ticks], ['ok', 1, run.ticks]);
    const board = (await call('GET', `/levels/${code}`, { headers: { 'X-Player-Key': key } })).json;
    assert.equal(board.board[0].name, 'Gast Eins');
    assert.equal(board.me.best.rank, 1, 'der Gast erkennt sich über den Schlüssel in der Kopfzeile');
    assert.equal(board.board[0].playerKey, undefined, 'Schlüssel gehören nicht in die Antwort');

    const bad = await call('POST', `/levels/${code}/submit`, { body: runBody(f, { ...run, ticks: run.ticks + 1 }, guestKey(2)) });
    assert.deepEqual([bad.status, bad.json.status], [422, 'abgelehnt']);
    const stale = await call('POST', `/levels/${code}/submit`, { body: { ...runBody(f, run, guestKey(2)), fp: 'ffffffffffffffff' } });
    assert.deepEqual([stale.status, stale.json.status], [409, 'ungeprueft']);
    assert.equal((await call('POST', `/levels/${code}/submit`, { body: { ...runBody(f, run, 'x') } })).status, 400);
    assert.equal((await call('POST', '/levels/SR-ZZZ-ZZZ/submit', { body: runBody(f, run, key) })).status, 404);
    assert.equal((await call('POST', `/levels/${code}/submit`, { body: '{"kaputt' })).status, 400);

    // Angemeldet: das Konto ist die Identität
    const acc = await call('POST', `/levels/${code}/submit`, { account: BOB, login: 'bob_tv', body: runBody(f, run, null, 'egal') });
    assert.equal(acc.status, 200);
    assert.ok((await call('GET', `/levels/${code}`)).json.board.some((e) => e.name === 'bob_tv'));
  });
});

test('Läufe sind je Adresse begrenzt (8 pro Minute)', async () => {
  await withServer(async ({ rig, call }) => {
    const { code, f } = await publishAs(rig, ALICE);
    const run = await runFor(f, 0);
    const bad = (n) => runBody(f, { ...run, ticks: run.ticks + 1 }, guestKey(n));
    for (let i = 0; i < 8; i++) assert.equal((await call('POST', `/levels/${code}/submit`, { body: bad(i) })).status, 422, `Lauf ${i + 1}`);
    const limited = await call('POST', `/levels/${code}/submit`, { body: bad(9) });
    assert.deepEqual([limited.status, limited.json.status], [429, 'zu-viele']);
    rig.clock.t += 61000;
    assert.equal((await call('POST', `/levels/${code}/submit`, { body: bad(10) })).status, 422);
  });
});

test('Sterne und Favoriten über HTTP: Gäste per Spielerschlüssel, Statuscodes, eigene Favoriten per Kopfzeile', async () => {
  await withServer(async ({ rig, call }) => {
    const { code } = await publishAs(rig, ALICE, { name: 'Sternchen' });
    const key = guestKey(7);
    const custom = { kind: 'custom', code };
    const pfad = { kind: 'pfad', seed: 'abc123', biome: 'ice' };

    assert.equal((await call('POST', '/ratings', { body: { ref: custom, stars: 5 } })).status, 400, 'ohne Schlüssel');
    assert.equal((await call('POST', '/ratings', { account: ALICE, body: { ref: custom, stars: 5 } })).status, 409, 'eigenes Level');
    const r1 = await call('POST', '/ratings', { body: { ref: custom, stars: 4, playerKey: key } });
    assert.deepEqual([r1.status, r1.json.mine, r1.json.rating], [200, 4, { count: 1, avg: 4 }]);
    assert.equal((await call('GET', `/levels/${code}`, { headers: { 'X-Player-Key': key } })).json.me.stars, 4);
    assert.equal((await call('POST', '/ratings', { body: { ref: pfad, stars: 5, playerKey: key } })).status, 200);

    const look = await call('POST', '/ratings/lookup', { body: { refs: [custom, pfad], playerKey: key } });
    assert.deepEqual(look.json.items.map((e) => e.mine), [4, 5]);
    const top = await call('GET', '/ratings/top', { headers: { 'X-Player-Key': key } });
    assert.deepEqual(top.json.items.map((e) => [e.ref.seed, e.mine]), [['abc123', 5]]);

    assert.equal((await call('POST', '/favorites', { body: { ref: pfad, on: true, info: { leitidee: 'taktwerk' }, playerKey: key } })).status, 200);
    assert.equal((await call('POST', '/favorites', { body: { ref: custom, playerKey: key } })).json.favorite, true, 'on fehlt = hinzufügen');
    const favs = await call('GET', '/favorites', { headers: { 'X-Player-Key': key } });
    assert.deepEqual(favs.json.items.map((f) => f.ref.kind).sort(), ['custom', 'pfad']);
    assert.deepEqual((await call('GET', '/favorites')).json.items, [], 'ohne Schlüssel keine Favoriten');
    assert.equal((await call('POST', '/favorites', { body: { ref: pfad, on: false, playerKey: key } })).json.favorite, false);
  });
});

test('Melden, Ändern, Löschen: Login ist Pflicht, die Statuscodes stimmen', async () => {
  await withServer(async ({ rig, call }) => {
    const { code } = await publishAs(rig, ALICE, { name: 'Bewertbar' });
    for (const [method, path, body] of [['POST', `/levels/${code}/report`, { reason: 'sonstiges' }], ['PATCH', `/levels/${code}`, { name: 'Neuer Name' }], ['DELETE', `/levels/${code}`]]) {
      assert.equal((await call(method, path, { body })).status, 401, `${method} ${path}`);
    }

    assert.equal((await call('POST', `/levels/${code}/report`, { account: BOB, body: { reason: 'quatsch' } })).status, 400);
    assert.equal((await call('POST', `/levels/${code}/report`, { account: BOB, body: { reason: 'anstoessig', note: 'x' } })).status, 200);

    assert.equal((await call('PATCH', `/levels/${code}`, { account: BOB, body: { name: 'Klaue' } })).status, 403);
    assert.equal((await call('PATCH', `/levels/${code}`, { account: ALICE, body: { name: 'ab' } })).status, 400);
    assert.equal((await call('PATCH', `/levels/${code}`, { account: ALICE, body: { name: 'Neuer Name' } })).status, 200);
    assert.equal((await call('GET', `/levels/${code}`)).json.name, 'Neuer Name');

    assert.equal((await call('DELETE', `/levels/${code}`, { account: BOB })).status, 403);
    assert.equal((await call('DELETE', `/levels/${code}`, { account: ALICE })).status, 200);
    assert.equal((await call('GET', `/levels/${code}`)).status, 404);
    assert.equal((await call('DELETE', `/levels/${code}`, { account: ALICE })).status, 404);
  });
});

test('Ersteller-Profil über HTTP', async () => {
  await withServer(async ({ rig, call }) => {
    await publishAs(rig, ALICE, { name: 'Erstes Level' });
    const p = await call('GET', `/creators/${ALICE}`);
    assert.equal(p.status, 200);
    assert.deepEqual([p.json.name, p.json.stats.levels, p.json.levels.length], [`user${ALICE}`, 1, 1]);
    assert.equal((await call('GET', '/creators/424242')).status, 404);
  });
});

test('Moderation: nur der Admin — Meldungen ansehen, ausblenden, verwerfen, sperren, Neu-Prüfung anstoßen', async () => {
  await withServer(async ({ rig, call }) => {
    const a = await publishAs(rig, ALICE, { name: 'Zweifelhaft' });
    await call('POST', `/levels/${a.code}/report`, { account: BOB, body: { reason: 'anstoessig' } });

    for (const [method, path] of [['GET', '/mod/reports'], ['GET', '/mod/bans'], ['GET', '/mod/levels/hidden'], ['POST', `/mod/levels/${a.code}/hide`], ['POST', '/mod/reports/1/dismiss'], ['POST', `/mod/accounts/${ALICE}/ban`], ['POST', '/mod/reverify']]) {
      assert.equal((await call(method, path)).status, 401, `${method} ${path} ohne Login`);
      assert.equal((await call(method, path, { account: BOB })).status, 403, `${method} ${path} als Nutzer`);
    }
    assert.equal((await call('GET', '/mod/reports', { account: ALICE })).status, 403, 'auch der Ersteller ist kein Admin');

    const reports = await call('GET', '/mod/reports', { account: ADMIN });
    assert.equal(reports.status, 200);
    assert.equal(reports.json.reports[0].level.name, 'Zweifelhaft');
    assert.equal(reports.json.reports[0].count, 1);

    assert.equal((await call('POST', `/mod/levels/${a.code}/hide`, { account: ADMIN, body: { reason: 'Regelverstoß' } })).status, 200);
    assert.equal((await call('GET', `/levels/${a.code}`)).status, 404);
    assert.equal((await call('GET', `/levels/${a.code}`, { account: ADMIN })).status, 200, 'der Admin sieht es weiterhin');
    // Ausblenden hat die Meldung mit aufgelöst — trotzdem bleibt das Level über /mod/levels/hidden auffindbar
    assert.deepEqual((await call('GET', '/mod/reports', { account: ADMIN })).json.reports, []);
    const hiddenList = await call('GET', '/mod/levels/hidden', { account: ADMIN });
    assert.deepEqual(hiddenList.json.levels.map((l) => l.code), [a.code]);
    assert.equal((await call('POST', `/mod/levels/${a.code}/unhide`, { account: ADMIN })).status, 200);
    assert.equal((await call('GET', `/levels/${a.code}`)).status, 200);
    assert.equal((await call('POST', '/mod/levels/SR-ZZZ-ZZZ/hide', { account: ADMIN })).status, 404);

    const ban = await call('POST', `/mod/accounts/${ALICE}/ban`, { account: ADMIN, body: { reason: 'Spam' } });
    assert.deepEqual([ban.status, ban.json.hidden], [200, 1]);
    assert.equal((await call('GET', `/levels/${a.code}`)).status, 404);
    assert.deepEqual((await call('GET', '/mod/bans', { account: ADMIN })).json.bans.map((b) => b.accountId), [ALICE]);
    assert.equal((await call('POST', '/mod/accounts/../x/ban', { account: ADMIN })).status, 404);
    assert.equal((await call('POST', `/mod/accounts/${ALICE}/unban`, { account: ADMIN })).json.restored, 1);
    assert.equal((await call('GET', `/levels/${a.code}`)).status, 200);

    const re = await call('POST', '/mod/reverify', { account: ADMIN });
    assert.deepEqual([re.status, re.json.status], [200, 'ok']);
    assert.ok(re.json.summary.levels && re.json.summary.runs);
  });
});

test('Ohne Anmelde-Middleware sind die Login-Wege gesperrt statt offen; ohne Dienst gibt es die Wege nicht', async () => {
  const rig = newRig();
  const build = (deps) => {
    const app = express();
    app.use(express.json());
    app.use('/api/seed-runners', createSeedRunnersRouter({ daily: {}, todayKey: () => 'x', now: () => rig.clock.t, ...deps }));
    return app;
  };
  try {
    for (const [deps, expected] of [[{ levelVerify: rig.levelVerify, levelService: rig.levels }, 503], [{}, 404]]) {
      const server = http.createServer(build(deps));
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${server.address().port}/api/seed-runners`;
      const res = await fetch(`${base}/levels/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(res.status, expected);
      const pub = await fetch(`${base}/levels/SR-ABC-DEF/report`, { method: 'POST' });
      assert.equal(pub.status, expected);
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await rig.cleanup();
  }
});
