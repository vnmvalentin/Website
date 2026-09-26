// Verifizierung eigener Level: Speicher (store.js), Regeln (levelVerify.js) und HTTP-Schnittstelle (routes.js).
// Die Datenbank liegt in einem Wegwerf-Ordner — nie gegen die echte Backend/data/*.db testen. Der Dienst läuft mit dem
// ECHTEN Prüfer (Worker-Thread mit der gespiegelten Sim), damit die Prüfung nicht nur gegen Attrappen besteht.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { createStore } = require('../store');
const { createVerifier } = require('../verifier');
const { createLevelVerifyService, cleanLog, MAX_LOG_NUMBERS } = require('../levelVerify');
const { createSeedRunnersRouter } = require('../routes');
const { loadEngine, CUSTOM_MAX_TICKS } = require('../replay');

const ALICE = '1001';
const BOB = '1002';
const RIGHT = 2;

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-verify-'));
  const store = createStore(path.join(dir, 'test.db'));
  return { store, cleanup: () => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** Ein ebenes Level und ein Lauf, der es gewinnt (nach rechts halten, ab Tick `startAt`) */
async function fixture({ startAt = 0, mutate } = {}) {
  const engine = await loadEngine();
  const doc = engine.emptyDoc({ width: 40, height: 20 });
  mutate?.(doc);
  const res = engine.validateDoc(doc, { smoke: false });
  assert.ok(res.ok, res.errors?.join(' | '));
  const log = [startAt, RIGHT];
  const r = engine.runReplay(engine.createLevelWorld(res.level), log, 20000);
  assert.ok(r.finished);
  return { engine, doc, hash: res.hash, log, ticks: r.ticks, fp: engine.SIM_FINGERPRINT };
}

const submitOf = (f, extra = {}) => ({ accountId: ALICE, doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash, ...extra });

// ── Speicher ─────────────────────────────────────────────────────────────────

const rec = (over = {}) => ({ accountId: ALICE, contentHash: 'a'.repeat(64), simFp: 'fp1', ticks: 1000, deaths: 2, splits: [[1, 500]], log: [0, 2], verifiedAt: 10, ...over });

test('Speicher: nur eine schnellere Zeit ersetzt die bisherige; das Log ist nur auf Wunsch dabei', () => {
  const { store, cleanup } = tempStore();
  try {
    assert.equal(store.getVerification(ALICE, 'a'.repeat(64)), null);
    assert.equal(store.saveVerification(rec()), true);
    assert.equal(store.saveVerification(rec({ ticks: 1200, verifiedAt: 20 })), false, 'langsamer bleibt draußen');
    assert.equal(store.saveVerification(rec({ ticks: 1000, verifiedAt: 20 })), false, 'gleich schnell auch');
    assert.equal(store.getVerification(ALICE, 'a'.repeat(64)).verifiedAt, 10);
    assert.equal(store.saveVerification(rec({ ticks: 900, deaths: 0, log: [0, 2, 5, 0], verifiedAt: 30 })), true);
    const r = store.getVerification(ALICE, 'a'.repeat(64));
    assert.deepEqual([r.ticks, r.deaths, r.verifiedAt], [900, 0, 30]);
    assert.equal(r.log, undefined, 'ohne Log');
    assert.deepEqual(store.getVerification(ALICE, 'a'.repeat(64), { withLog: true }).log, [0, 2, 5, 0]);
    assert.equal(store.getVerification(BOB, 'a'.repeat(64)), null, 'ein anderes Konto sieht nichts');
  } finally {
    cleanup();
  }
});

test('Speicher: eine Verifizierung gegen eine ältere Physik wird ersetzt, auch wenn die neue langsamer ist', () => {
  const { store, cleanup } = tempStore();
  try {
    store.saveVerification(rec({ simFp: 'alt', ticks: 500 }));
    assert.equal(store.saveVerification(rec({ simFp: 'neu', ticks: 800, verifiedAt: 20 })), true);
    assert.deepEqual([store.getVerification(ALICE, 'a'.repeat(64)).simFp, store.getVerification(ALICE, 'a'.repeat(64)).ticks], ['neu', 800]);
  } finally {
    cleanup();
  }
});

test('Speicher: pro Konto bleiben nur die zuletzt verifizierten Einträge, andere Konten bleiben unberührt', () => {
  const { store, cleanup } = tempStore();
  try {
    for (let i = 0; i < 8; i++) store.saveVerification(rec({ contentHash: String(i).repeat(64), verifiedAt: 100 + i }), 5);
    store.saveVerification(rec({ accountId: BOB, contentHash: '9'.repeat(64) }), 5);
    const kept = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => store.getVerification(ALICE, String(i).repeat(64)));
    assert.deepEqual(kept, [3, 4, 5, 6, 7], 'die fünf neuesten');
    assert.ok(store.getVerification(BOB, '9'.repeat(64)));
  } finally {
    cleanup();
  }
});

// ── Log-Prüfung ─────────────────────────────────────────────────────────────

test('Input-Log: gerade Länge, aufsteigende Ticks, Masken 0–255, begrenzte Größe', () => {
  assert.deepEqual(cleanLog([0, 2, 10, 0]), [0, 2, 10, 0]);
  assert.deepEqual(cleanLog([]), []);
  for (const bad of [[0], [0, 2, 5], [5, 2, 3, 0], [-1, 2], [0, 256], [0, -1], [0.5, 2], [0, 2.5], ['0', 2], null, 'log', {}, [CUSTOM_MAX_TICKS + 1, 2]]) {
    assert.equal(cleanLog(bad), null, JSON.stringify(bad));
  }
  assert.equal(cleanLog(new Array(MAX_LOG_NUMBERS + 2).fill(0)), null, 'zu lang');
  assert.ok(cleanLog([0, 2, 0, 0]), 'gleicher Tick zweimal ist erlaubt (Wechsel im selben Tick)');
});

// ── Dienst mit echtem Prüfer ────────────────────────────────────────────────

async function withService(fn, opts = {}) {
  const { store, cleanup } = tempStore();
  const verifier = createVerifier();
  const calls = [];
  const spy = { verify: (job) => { calls.push(job); return verifier.verify(job); }, stats: () => verifier.stats() };
  const service = createLevelVerifyService({ store, verifier: opts.verifier || spy, ...opts.deps });
  try {
    await fn({ service, store, calls, verifier });
  } finally {
    await verifier.close();
    cleanup();
  }
}

test('Dienst: ein echter Lauf wird nachgespielt, gespeichert und als verifiziert gemeldet', async () => {
  const f = await fixture();
  await withService(async ({ service, store, calls }) => {
    const res = await service.submit(submitOf(f));
    assert.equal(res.status, 'ok');
    assert.equal(res.hash, f.hash);
    assert.equal(res.ticks, f.ticks);
    assert.equal(res.deaths, 0);
    assert.equal(res.improved, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, 'custom');
    assert.equal(calls[0].hash, f.hash, 'der Server gibt SEINEN Hash an den Worker');

    const stored = store.getVerification(ALICE, f.hash, { withLog: true });
    assert.deepEqual(stored.log, f.log, 'das Log liegt als späterer Geist da');
    assert.equal(stored.simFp, f.fp);
    assert.deepEqual(await service.status(ALICE, f.hash), { verified: true, current: true, ticks: f.ticks, deaths: 0, verifiedAt: stored.verifiedAt });
    assert.deepEqual(await service.status(BOB, f.hash), { verified: false });
    assert.deepEqual(await service.status(ALICE, 'f'.repeat(64)), { verified: false });
    assert.deepEqual(await service.status(ALICE, 'kein-hash'), { verified: false });
  });
});

test('Dienst: die offizielle Zeit ist die beste; ein langsamerer Lauf ändert sie nicht und wird gar nicht erst nachgespielt', async () => {
  const slow = await fixture({ startAt: 300 });
  const fast = await fixture();
  assert.equal(slow.hash, fast.hash, 'gleiches Level');
  assert.ok(slow.ticks > fast.ticks);
  await withService(async ({ service, calls }) => {
    assert.equal((await service.submit(submitOf(slow))).ticks, slow.ticks);
    const better = await service.submit(submitOf(fast));
    assert.deepEqual([better.status, better.ticks, better.improved], ['ok', fast.ticks, true]);
    const worse = await service.submit(submitOf(slow));
    assert.deepEqual([worse.status, worse.ticks, worse.improved, worse.playedTicks], ['ok', fast.ticks, false, slow.ticks]);
    assert.equal(calls.length, 2, 'der dritte Lauf war langsamer: keine Rechenzeit verschwendet');
  });
});

test('Dienst: Name, Beschreibung, Tags und Biom ändern den Hash nicht — die Verifizierung bleibt', async () => {
  const f = await fixture();
  const renamed = await fixture({ mutate: (d) => { d.meta = { name: 'Neuer Name', description: 'Text', tags: ['neu'], difficulty: 3, biome: 'cave' }; } });
  assert.equal(renamed.hash, f.hash);
  await withService(async ({ service }) => {
    await service.submit(submitOf(f));
    const again = await service.submit(submitOf(renamed));
    assert.deepEqual([again.status, again.improved, again.ticks], ['ok', false, f.ticks]);
    assert.equal((await service.status(ALICE, renamed.hash)).verified, true);
  });
});

test('Dienst: jede Änderung am Spielinhalt (Gelände, Element, Tempo-Klasse) ist ein neues Level ohne Verifizierung', async () => {
  const f = await fixture();
  const variants = {
    Gelände: await fixture({ mutate: (d) => { d.tiles[5] = `${d.tiles[5].slice(0, 10)}#${d.tiles[5].slice(11)}`; } }),
    Element: await fixture({ mutate: (d) => d.elements.push({ type: 'key', tx: 20, ty: 5 }) }),
    'Tempo-Klasse': await fixture({ mutate: (d) => { d.speedClass = 'fast'; } }),
  };
  await withService(async ({ service }) => {
    await service.submit(submitOf(f));
    for (const [name, v] of Object.entries(variants)) {
      assert.notEqual(v.hash, f.hash, name);
      assert.deepEqual(await service.status(ALICE, v.hash), { verified: false }, name);
    }
  });
});

test('Dienst: Manipulation wird abgelehnt — falsche Zeit, Log ohne Ziel, fremdes Dokument zum Hash', async () => {
  const f = await fixture();
  await withService(async ({ service, store }) => {
    for (const bad of [{ ticks: f.ticks - 1 }, { ticks: f.ticks + 5 }, { ticks: 60 }, { log: [0, 1] }, { log: [] }]) {
      const res = await service.submit(submitOf(f, bad));
      assert.equal(res.status, 'abgelehnt', JSON.stringify(bad));
    }
    assert.equal(store.getVerification(ALICE, f.hash), null, 'nichts gespeichert');
    // Eine Zeit über dem Limit wird gar nicht erst nachgespielt
    const over = await service.submit(submitOf(f, { ticks: CUSTOM_MAX_TICKS + 1 }));
    assert.equal(over.status, 'abgelehnt');
    assert.match(over.reason, /20 Minuten/);
  });
});

test('Dienst: ungültige Eingaben werden benannt, ohne zu rechnen', async () => {
  const f = await fixture();
  await withService(async ({ service, calls }) => {
    assert.equal((await service.submit(submitOf(f, { accountId: '' }))).status, 'ungueltig');
    assert.equal((await service.submit(submitOf(f, { ticks: 'schnell' }))).status, 'ungueltig');
    assert.equal((await service.submit(submitOf(f, { ticks: 5 }))).status, 'ungueltig');
    assert.equal((await service.submit(submitOf(f, { log: 'nope' }))).status, 'ungueltig');
    assert.equal((await service.submit(submitOf(f, { log: [5, 2, 1, 0] }))).status, 'ungueltig', 'Ticks absteigend');

    const broken = await service.submit(submitOf(f, { doc: { ...f.doc, tiles: f.doc.tiles.slice(1) } }));
    assert.equal(broken.status, 'ungueltig');
    assert.ok(broken.errors.length > 0 && broken.errors.every((e) => typeof e === 'string'));
    for (const doc of [null, 'text', [], { __proto__: null }]) assert.equal((await service.submit(submitOf(f, { doc }))).status, 'ungueltig');
    assert.equal(calls.length, 0, 'nichts davon erreichte den Worker');
  });
});

test('Dienst: anderer Sim-Stand oder abweichender Hash des Clients — nicht geprüft, nicht bestraft', async () => {
  const f = await fixture();
  await withService(async ({ service, calls, store }) => {
    for (const fp of ['ffffffffffffffff', f.engine.ENGINE_FINGERPRINT, '', undefined]) {
      const res = await service.submit(submitOf(f, { fp }));
      assert.equal(res.status, 'ungeprueft', String(fp));
    }
    const drift = await service.submit(submitOf(f, { hash: 'a'.repeat(64) }));
    assert.equal(drift.status, 'ungeprueft');
    assert.match(drift.reason, /nicht gleich/);
    assert.equal(calls.length, 0);
    assert.equal(store.getVerification(ALICE, f.hash), null);
  });
});

test('Dienst: Prüfer überlastet, hängt oder ist beendet — Fehlerstatus, nichts gespeichert', async () => {
  const f = await fixture();
  for (const [verdict, status] of [[{ status: 'busy' }, 'busy'], [{ status: 'error', reason: 'x' }, 'fehler'], [{ status: 'skipped', reason: 'version' }, 'ungeprueft'], [{ status: 'invalid', reason: 'Nein.' }, 'abgelehnt']]) {
    await withService(async ({ service, store }) => {
      const res = await service.submit(submitOf(f));
      assert.equal(res.status, status);
      assert.equal(store.getVerification(ALICE, f.hash), null);
    }, { verifier: { verify: async () => verdict } });
  }
});

test('Dienst: nach einer Änderung der Sim ist die alte Verifizierung veraltet; ein neuer Lauf ersetzt sie', async () => {
  const f = await fixture();
  await withService(async ({ service, store }) => {
    store.saveVerification({ accountId: ALICE, contentHash: f.hash, simFp: 'alte-physik', ticks: f.ticks - 50, deaths: 0, splits: [], log: [0, 2] });
    assert.deepEqual(await service.status(ALICE, f.hash), { verified: true, current: false, ticks: f.ticks - 50, deaths: 0, verifiedAt: store.getVerification(ALICE, f.hash).verifiedAt });
    const res = await service.submit(submitOf(f));
    assert.deepEqual([res.status, res.ticks, res.improved], ['ok', f.ticks, true], 'die alte war schneller, gilt aber nicht mehr');
    assert.equal((await service.status(ALICE, f.hash)).current, true);
  });
});

// ── HTTP ─────────────────────────────────────────────────────────────────────

// Anmeldung wie im Betrieb: eine Middleware, die req.twitchId setzt. Hier aus einer Kopfzeile, ohne sie 401.
const fakeAuth = (req, res, next) => {
  const id = req.headers['x-test-account'];
  if (!id) return res.status(401).json({ error: 'Nicht eingeloggt' });
  req.twitchId = String(id);
  return next();
};

async function withServer(fn, opts = {}) {
  const { store, cleanup } = tempStore();
  const verifier = createVerifier();
  const levelVerify = createLevelVerifyService({ store, verifier });
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  let clock = Date.UTC(2026, 8, 22, 12, 0);
  app.use('/api/seed-runners', createSeedRunnersRouter({ daily: {}, todayKey: () => '2026-09-22', now: () => clock, levelVerify, ...opts.deps }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/seed-runners`;
  try {
    await fn({ base, tick: (ms) => { clock += ms; }, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await verifier.close();
    cleanup();
  }
}

const authed = { requireAuth: fakeAuth };
const postVerify = (base, body, account = ALICE) => fetch(`${base}/levels/verify`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(account ? { 'X-Test-Account': account } : {}) }, body: JSON.stringify(body),
});
const getStatus = (base, hash, account = ALICE) => fetch(`${base}/levels/verification/${hash}`, { headers: account ? { 'X-Test-Account': account } : {} });
const bodyOf = (f, extra = {}) => ({ doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash, ...extra });

test('HTTP: ohne Anmeldung 401, mit Anmeldung wird geprüft, gespeichert und der Stand abgefragt', async () => {
  const f = await fixture();
  await withServer(async ({ base }) => {
    assert.equal((await postVerify(base, bodyOf(f), null)).status, 401);
    assert.equal((await getStatus(base, f.hash, null)).status, 401);

    const res = await postVerify(base, bodyOf(f));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.deepEqual([json.status, json.hash, json.ticks, json.improved], ['ok', f.hash, f.ticks, true]);

    const status = await (await getStatus(base, f.hash)).json();
    assert.deepEqual([status.verified, status.current, status.ticks], [true, true, f.ticks]);
    assert.deepEqual(await (await getStatus(base, f.hash, BOB)).json(), { verified: false }, 'anderes Konto');
    assert.equal((await getStatus(base, 'kein-hash')).status, 400);
  }, { deps: authed });
});

test('HTTP: Statuscodes — abgelehnt 422, ungeprüft 409, ungültig 400, kaputter Body kein Absturz', async () => {
  const f = await fixture();
  await withServer(async ({ base }) => {
    assert.equal((await postVerify(base, bodyOf(f, { ticks: f.ticks + 1 }))).status, 422);
    const stale = await postVerify(base, bodyOf(f, { fp: 'ffffffffffffffff' }));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).status, 'ungeprueft');
    const invalid = await postVerify(base, bodyOf(f, { doc: { ...f.doc, tiles: [] } }));
    assert.equal(invalid.status, 400);
    assert.ok((await invalid.json()).errors.length > 0);
    assert.equal((await postVerify(base, {})).status, 400);
    assert.equal((await postVerify(base, [])).status, 400);
    const proto = await fetch(`${base}/levels/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-Account': ALICE },
      body: `{"doc":${JSON.stringify(f.doc).replace('{', '{"__proto__":{"admin":true},')},"log":[0,2],"ticks":${f.ticks},"fp":"${f.fp}"}`,
    });
    assert.equal(proto.status, 400);
    assert.equal({}.admin, undefined);
  }, { deps: authed });
});

test('HTTP: Verifizierungen sind je Konto begrenzt (6 pro Minute); ein anderes Konto und die nächste Minute sind frei', async () => {
  const f = await fixture();
  await withServer(async ({ base, tick }) => {
    const bad = bodyOf(f, { ticks: f.ticks + 1 });          // abgelehnt, kostet aber Rechenzeit
    for (let i = 0; i < 6; i++) assert.equal((await postVerify(base, bad)).status, 422, `Lauf ${i + 1}`);
    const limited = await postVerify(base, bad);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).status, 'zu-viele');
    assert.equal((await postVerify(base, bad, BOB)).status, 422, 'Bob ist nicht betroffen');
    tick(61_000);
    assert.equal((await postVerify(base, bad)).status, 422);
  }, { deps: authed });
});

test('HTTP: auch je Adresse begrenzt (12 pro Minute) — viele Konten von einer Adresse fluten die Prüfung nicht', async () => {
  const f = await fixture();
  await withServer(async ({ base, tick }) => {
    const bad = bodyOf(f, { ticks: f.ticks + 1 });
    // Zwölf verschiedene Konten, je eine Anfrage: keines für sich begrenzt
    for (let i = 0; i < 12; i++) assert.equal((await postVerify(base, bad, `acc-${i}`)).status, 422, `Konto ${i}`);
    const limited = await postVerify(base, bad, 'acc-frisch');
    assert.equal(limited.status, 429, 'das 13. Konto derselben Adresse wird gebremst');
    tick(61_000);
    assert.equal((await postVerify(base, bad, 'acc-frisch')).status, 422);
  }, { deps: authed });
});

test('HTTP: ohne Anmelde-Middleware oder Dienst sind die Wege gesperrt statt offen', async () => {
  const f = await fixture();
  await withServer(async ({ base }) => {
    assert.equal((await postVerify(base, bodyOf(f))).status, 503, 'keine Anmeldung konfiguriert');
    assert.equal((await getStatus(base, f.hash)).status, 503);
  });
  await withServer(async ({ base }) => {
    assert.equal((await postVerify(base, bodyOf(f))).status, 503, 'kein Dienst');
    assert.equal((await getStatus(base, f.hash)).status, 503);
  }, { deps: { requireAuth: fakeAuth, levelVerify: null } });
});
