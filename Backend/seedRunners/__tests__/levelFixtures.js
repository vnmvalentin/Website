// Gemeinsame Bausteine der Tests für veröffentlichte Level: kleine Level mit gewinnendem Lauf, eine Wegwerf-Datenbank mit dem
// ECHTEN Prüfer (Worker-Thread mit der gespiegelten Sim) und ein Helfer, der ein Level in einem Schritt veröffentlicht.
'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../store');
const { createVerifier } = require('../verifier');
const { createLevelVerifyService } = require('../levelVerify');
const { createLevelService } = require('../levelService');
const { loadEngine } = require('../replay');

const RIGHT = 2;
let counter = 0;

/**
 * Ein ebenes Level (40 × 20) und ein Lauf, der es gewinnt (nach rechts halten, ab Tick `startAt`). Jedes Level bekommt einen
 * eigenen schwebenden Block, damit der Inhalts-Hash verschieden ist — der Block behindert den Lauf nicht.
 */
async function makeLevel({ name = 'Testlevel', startAt = 0, unique = true, mutate } = {}) {
  const engine = await loadEngine();
  const doc = engine.emptyDoc({ width: 40, height: 20 });
  doc.meta.name = name;
  if (unique) {
    const n = counter++;
    const x = 4 + (n % 30);
    const y = 1 + Math.floor(n / 30);
    doc.tiles[y] = `${doc.tiles[y].slice(0, x)}#${doc.tiles[y].slice(x + 1)}`;
  }
  mutate?.(doc);
  const res = engine.validateDoc(doc, { smoke: false });
  assert.ok(res.ok, res.errors?.join(' | '));
  const log = [startAt, RIGHT];
  const r = engine.runReplay(engine.createLevelWorld(res.level), log, 20000);
  assert.ok(r.finished, 'der Testlauf erreicht das Ziel');
  return { engine, doc: res.doc, hash: res.hash, log, ticks: r.ticks, deaths: r.deaths, fp: engine.SIM_FINGERPRINT };
}

/** Ein anderer Lauf auf demselben Level (später losgelaufen = langsamer): { log, ticks, deaths } */
async function runFor(f, startAt = 0, mask = RIGHT) {
  const res = f.engine.validateDoc(f.doc, { smoke: false });
  const log = [startAt, mask];
  const r = f.engine.runReplay(f.engine.createLevelWorld(res.level), log, 20000);
  assert.ok(r.finished, 'der Lauf erreicht das Ziel');
  return { log, ticks: r.ticks, deaths: r.deaths };
}

/** Wegwerf-Datenbank + echter Prüfer + Dienste. `clock` lässt sich von Hand vorstellen. */
function newRig(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-levels-'));
  const store = createStore(path.join(dir, 'test.db'));
  const verifier = createVerifier();
  const clock = { t: Date.UTC(2026, 8, 22, 12, 0) };
  const now = () => clock.t;
  const levelVerify = createLevelVerifyService({ store, verifier });
  const levels = createLevelService({ store, verifier, now, log: () => {}, ...opts.deps });
  return {
    store, verifier, levelVerify, levels, clock, L: store.levels,
    async cleanup() {
      await verifier.close();
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

const viewer = (accountId, name = `user${accountId}`, extra = {}) => ({ accountId: accountId ? String(accountId) : null, name, isAdmin: false, ...extra });

/** Verifiziert ein Level für ein Konto (wie der Editor) und veröffentlicht es. Liefert { code, f, result } */
async function publishAs(rig, accountId, opts = {}) {
  const f = opts.f || await makeLevel(opts);
  const v = await rig.levelVerify.submit({ accountId: String(accountId), doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash });
  assert.equal(v.status, 'ok', `Verifizierung: ${v.reason}`);
  const result = await rig.levels.publish({ viewer: viewer(accountId), doc: f.doc, hash: f.hash });
  assert.equal(result.status, 'ok', `Veröffentlichen: ${result.reason} ${result.errors || ''}`);
  return { code: result.code, f, result };
}

/** Ein Spieler-Schlüssel wie im Browser (64 Hex-Zeichen) */
const guestKey = (n) => String(n).padStart(2, '0').repeat(32).slice(0, 64).replace(/[^a-f0-9]/g, 'a');

module.exports = { makeLevel, newRig, viewer, publishAs, guestKey, runFor, RIGHT };
