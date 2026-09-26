// Server-Prüfung von Level-Dokumenten (levelCheck.js und POST /levels/check). Der Server nimmt nur an, was durch
// dieselbe Funktion läuft wie im Editor — und bestimmt den Inhalts-Hash selbst. Kein Datenbankzugriff.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const express = require('express');
const { checkLevel, loadLevelEngine } = require('../levelCheck');
const { createSeedRunnersRouter } = require('../routes');

const FRONTEND_LEVEL = path.resolve(__dirname, '..', '..', '..', 'Frontend', 'src', 'pages', 'SeedRunners', 'level', 'index.js');

async function newDoc(mutate) {
  const { emptyDoc } = await loadLevelEngine();
  const doc = emptyDoc();
  mutate?.(doc);
  return doc;
}

test('checkLevel: ein gültiges Dokument liefert Hash, Kennzahlen und Fingerprints', async () => {
  const res = await checkLevel(await newDoc((d) => d.elements.push({ type: 'spring', tx: 10, ty: 25 })));
  assert.equal(res.ok, true);
  assert.match(res.hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(res.stats, { width: 60, height: 30, elements: 1, checkpoints: 0 });
  assert.deepEqual(res.warnings, []);
  assert.match(res.fp.sim, /^[0-9a-f]{16}$/);
  assert.match(res.fp.engine, /^[0-9a-f]{16}$/);
});

test('Der Server berechnet denselben Hash wie das Frontend (Spiegel und Quelle sind bitgleich)', async () => {
  const frontend = await import(pathToFileURL(FRONTEND_LEVEL).href);
  const doc = await newDoc((d) => {
    d.meta.name = 'Vergleich';
    d.elements.push({ type: 'saw', tx: 20, ty: 20, path: [[0, 0], [6, 0]] }, { type: 'laser', tx: 30, ty: 20, dir: 'down' });
  });
  const local = frontend.validateDoc(doc);
  assert.equal(local.ok, true);
  const server = await checkLevel(doc);
  assert.equal(server.hash, local.hash);
});

test('checkLevel: ungültige Dokumente und die Namenspflicht für die Veröffentlichung', async () => {
  const bad = await newDoc((d) => d.elements.push({ type: 'saw', tx: 20, ty: 20, speed: 1e9 }));
  const res = await checkLevel(bad);
  assert.equal(res.ok, false);
  assert.ok(res.errors.length > 0);

  const draft = await newDoc();
  assert.equal((await checkLevel(draft)).ok, true, 'Entwurf ohne Namen ist in Ordnung');
  assert.equal((await checkLevel(draft, { requireName: true })).ok, false, 'Veröffentlichung braucht einen Namen');
  draft.meta.name = 'Mit Namen';
  assert.equal((await checkLevel(draft, { requireName: true })).ok, true);
});

// ── HTTP ─────────────────────────────────────────────────────────────────────

async function withServer(fn) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  let clock = Date.UTC(2026, 8, 21, 12, 0);
  app.use('/api/seed-runners', createSeedRunnersRouter({ daily: {}, todayKey: () => '2026-09-21', now: () => clock }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/seed-runners`;
  try {
    await fn({ base, tick: (ms) => { clock += ms; } });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const postCheck = (base, body) => fetch(`${base}/levels/check`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('HTTP: 200 mit Hash für gültige, 422 mit Fehlerliste für ungültige Level', async () => {
  await withServer(async ({ base }) => {
    const ok = await postCheck(base, { doc: await newDoc() });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.ok, true);
    assert.match(body.hash, /^[0-9a-f]{64}$/);

    const bad = await postCheck(base, { doc: await newDoc((d) => { d.tiles.pop(); }) });
    assert.equal(bad.status, 422);
    const errors = (await bad.json()).errors;
    assert.ok(Array.isArray(errors) && errors.length > 0 && errors.every((e) => typeof e === 'string'));

    const named = await postCheck(base, { doc: await newDoc(), forPublish: true });
    assert.equal(named.status, 422, 'ohne Levelnamen nicht veröffentlichbar');
  });
});

test('HTTP: kaputte und feindliche Anfragen liefern 400/422, nie einen Absturz', async () => {
  await withServer(async ({ base }) => {
    assert.equal((await postCheck(base, {})).status, 400, 'ohne doc');
    assert.equal((await postCheck(base, [])).status, 400, 'Array statt Objekt');
    assert.equal((await postCheck(base, { doc: null })).status, 422);
    assert.equal((await postCheck(base, { doc: 'text' })).status, 422);
    assert.equal((await postCheck(base, { doc: [1, 2, 3] })).status, 422);

    const doc = JSON.stringify(await newDoc());
    const proto = await postCheck(base, `{"doc":${doc.replace('{', '{"__proto__":{"admin":true},')}}`);
    assert.equal(proto.status, 422);
    assert.equal({}.admin, undefined, 'Object.prototype blieb sauber');

    const huge = await postCheck(base, { doc: { ...(await newDoc()), junk: 'x'.repeat(500_000) } });
    assert.equal(huge.status, 422);
    assert.match((await huge.json()).errors[0], /zu groß/);
  });
});

test('HTTP: Prüfungen sind je Adresse begrenzt (20 pro Minute), danach wieder frei', async () => {
  await withServer(async ({ base, tick }) => {
    const doc = await newDoc();
    for (let i = 0; i < 20; i++) assert.equal((await postCheck(base, { doc })).status, 200, `Prüfung ${i + 1}`);
    assert.equal((await postCheck(base, { doc })).status, 429);
    tick(61_000);
    assert.equal((await postCheck(base, { doc })).status, 200);
  });
});
