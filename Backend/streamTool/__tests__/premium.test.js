// Abo-Extras der Twitch-Overlays (Ausbauplan „premium-wert“): Happy Hour im Subathon, eigene Töne und Bilder der
// Alerts, eigene Schrift — und dass die OBS-Quelle ohne Abo nichts davon bekommt.
// Alle Datenbanken im Speicher, Dateien in einem Temp-Ordner — nie gegen Backend/data.
'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'stm-premium-'));
process.env.STREAM_TOOL_DB = ':memory:';
process.env.BILLING_DB = ':memory:';
process.env.STREAMER_ZENTRALE_DB = ':memory:';
process.env.STREAM_TOOL_MEDIA_DIR = TMP;
// Der Betreiber hat immer das Abo — so braucht der Test keine Stripe-Daten
process.env.STREAMER_TWITCH_ID = 'owner1';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const core = require('../lib/subathonCore');
const { stripPremium } = require('../lib/premiumExtras');
const media = require('../lib/streamToolMedia');
const subathon = require('../lib/streamToolSubathon');
const { db } = require('../lib/streamToolStore');
const createRouter = require('../routes/streamToolRoutes');

const MIN = 60000;
const T0 = 1_700_000_000_000;
const mod = (patch = {}) => ({ enabled: true, startMinutes: 60, rules: { ...core.DEFAULT_RULES }, ...patch });

test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/* ── Happy Hour: Logik ───────────────────────────────────────────────────── */

test('Happy Hour: nur während der Subathon läuft oder pausiert, endet von selbst', () => {
  assert.deepEqual(core.startHappy(core.emptyState(), 30, 2, T0), { error: 'subathon_not_running' });

  let s = core.start(core.emptyState(), mod(), T0);
  s = core.startHappy(s, 30, 3, T0);
  assert.deepEqual(s.happy, { factor: 3, until: T0 + 30 * MIN });
  assert.equal(core.happyFactor(s, T0 + 10 * MIN), 3);
  assert.equal(core.happyFactor(s, T0 + 30 * MIN), 1, 'genau am Ende vorbei');

  // In der Pause läuft sie nach der Uhr weiter
  const paused = core.pause(s, T0 + 5 * MIN);
  assert.equal(core.happyFactor(paused, T0 + 20 * MIN), 3);

  assert.equal(core.happyFactor(core.stopHappy(s, T0 + MIN), T0 + 2 * MIN), 1);
  assert.equal(core.reset(s).happy, null);
});

test('Happy Hour: Faktor und Dauer werden geprüft', () => {
  const s = core.start(core.emptyState(), mod(), T0);
  assert.equal(core.startHappy(s, 30, 4, T0).error, 'subathon_bad_amount');
  assert.equal(core.startHappy(s, 0, 2, T0).error, 'subathon_bad_amount');
  assert.equal(core.startHappy(s, 241, 2, T0).error, 'subathon_bad_amount');
  assert.equal(core.startHappy(s, 240, 2, T0).happy.factor, 2);
  // Kaputter gespeicherter Stand fällt weg
  assert.equal(core.normalize({ ...s, happy: { factor: 5, until: T0 } }).happy, null);
  assert.deepEqual(core.normalize({ ...s, happy: { factor: 2, until: T0 + MIN } }).happy, { factor: 2, until: T0 + MIN });
});

test('Happy Hour: Verlauf merkt sich den Faktor, die Quelle sieht die Restzeit', () => {
  let s = core.start(core.emptyState(), mod(), T0);
  s = core.startHappy(s, 30, 2, T0);
  const { state, entry } = core.addTime(s, mod(), 2 * 300000, { kind: 'sub', name: 'Anna', amount: 1, tier: '1', factor: 2 }, T0 + MIN);
  assert.equal(entry.x, 2);
  assert.equal(entry.ms, 600000);
  const view = core.publicView(state, mod(), T0 + MIN);
  assert.deepEqual(view.happy, { factor: 2, until: T0 + 30 * MIN });
  assert.equal(view.recent.at(-1).x, 2);
  assert.equal(core.publicView(state, mod(), T0 + 31 * MIN).happy, null);
  // Ohne Faktor kein Zeichen im Verlauf
  assert.equal(core.addTime(s, mod(), 1000, { kind: 'manual' }, T0).entry.x, undefined);
});

test('Happy Hour: Chat-Befehl', () => {
  assert.deepEqual(core.parseCommand('!subathon happy 30m x3'), { action: 'happy', minutes: 30, factor: 3 });
  assert.deepEqual(core.parseCommand('!subathon happy 1h'), { action: 'happy', minutes: 60, factor: 2 });
  assert.deepEqual(core.parseCommand('!subathon hh 3x 1h30m'), { action: 'happy', minutes: 90, factor: 3 });
  assert.deepEqual(core.parseCommand('!subathon happy 45'), { action: 'happy', minutes: 45, factor: 2 });
  assert.deepEqual(core.parseCommand('!subathon happy stop'), { action: 'happyStop' });
  assert.deepEqual(core.parseCommand('!subathon happy'), { action: 'invalid' });
  assert.deepEqual(core.parseCommand('!subathon happy 5h'), { action: 'invalid' }, 'über 240 Minuten');
  assert.deepEqual(core.parseCommand('!subathon happy x4 30m'), { action: 'invalid' });
});

/* ── Konfiguration ohne Abo ──────────────────────────────────────────────── */

test('Ohne Abo: Szenen aus, Schrift und eigene Medien weg — das Original bleibt', () => {
  const config = {
    theme: { accent: '#ff0000', font: 'oswald' },
    modules: {
      hypeTrain: { enabled: true },
      alerts: { enabled: true, media: { sub: { sound: 'a'.repeat(16) } }, seconds: 6 },
      poll: { enabled: true },
    },
  };
  const out = stripPremium(config, ['hypeTrain']);
  assert.equal(out.modules.hypeTrain.enabled, false);
  assert.equal(out.theme.font, undefined);
  assert.equal(out.theme.accent, '#ff0000');
  assert.equal(out.modules.alerts.media, undefined);
  assert.equal(out.modules.alerts.seconds, 6);
  assert.equal(out.modules.poll.enabled, true);
  assert.equal(config.theme.font, 'oswald', 'gespeicherte Einstellung unverändert');
  assert.ok(config.modules.alerts.media.sub);
  assert.equal(stripPremium(null), null);
});

/* ── Dateien ─────────────────────────────────────────────────────────────── */

const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const withHead = (head, size = 64) => Buffer.concat([Buffer.from(head, 'latin1'), Buffer.alloc(Math.max(0, size - head.length), 0)]);

test('Dateityp an den ersten Bytes — nicht am Namen', () => {
  assert.equal(media.detectType(png()).mime, 'image/png');
  assert.equal(media.detectType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])).mime, 'image/jpeg');
  assert.equal(media.detectType(withHead('GIF89a')).mime, 'image/gif');
  assert.equal(media.detectType(withHead('RIFF\0\0\0\0WEBPVP8 ')).mime, 'image/webp');
  assert.equal(media.detectType(withHead('RIFF\0\0\0\0WAVEfmt ')).kind, 'sound');
  assert.equal(media.detectType(withHead('OggS')).mime, 'audio/ogg');
  assert.equal(media.detectType(withHead('ID3\x04')).mime, 'audio/mpeg');
  assert.equal(media.detectType(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90]), Buffer.alloc(20)])).mime, 'audio/mpeg');
  assert.equal(media.detectType(withHead('<svg xmlns="http://www.w3.org/2000/svg">')), null, 'SVG kann Skripte enthalten');
  assert.equal(media.detectType(withHead('<!doctype html>')), null);
  assert.equal(media.detectType(Buffer.from('GIF8')), null, 'zu kurz');
  assert.equal(media.detectType('GIF89a-und-mehr'), null);
});

/* ── Routen ──────────────────────────────────────────────────────────────── */

function startApp() {
  const app = express();
  app.use(express.json());
  const requireAuth = (req, res, next) => {
    const id = req.get('x-user');
    if (!id) return res.status(401).json({ error: 'Login nötig', code: 'no_login' });
    req.twitchId = id;
    next();
  };
  app.use('/api/stream-tool', createRouter({ requireAuth }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/stream-tool`;
  const call = async (method, p, { user, json, raw, headers } = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: {
        ...(user ? { 'x-user': user } : {}),
        ...(json ? { 'content-type': 'application/json' } : {}),
        ...(raw ? { 'content-type': 'application/octet-stream' } : {}),
        ...(headers || {}),
      },
      body: json ? JSON.stringify(json) : raw,
    });
    const type = res.headers.get('content-type') || '';
    const body = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body };
  };
  return { server, call };
}

test('Hochladen: nur mit Abo, Typ und Größe geprüft, öffentlich abrufbar, nur der Besitzer löscht', async () => {
  const { server, call } = startApp();
  try {
    let r = await call('POST', '/media', { user: 'u2', raw: png() });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'premium_needed');

    r = await call('POST', '/media', { user: 'owner1', raw: png(), headers: { 'x-file-name': encodeURIComponent('Herz <3>.png') } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const file = r.body.media;
    assert.equal(file.kind, 'image');
    assert.equal(file.name, 'Herz 3 .png', 'spitze Klammern fliegen raus');
    assert.equal(r.body.usage.files, 1);

    r = await call('GET', `/media/file/${file.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.match(r.headers.get('cache-control'), /immutable/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(r.body, png());

    r = await call('POST', '/media', { user: 'owner1', raw: withHead('<html><script>alert(1)</script>') });
    assert.equal(r.status, 415);
    assert.equal(r.body.code, 'media_type');

    // Ton über 2 MB (unter der Grenze fürs Einlesen) und Datei über 3 MB (schon beim Einlesen abgelehnt)
    r = await call('POST', '/media', { user: 'owner1', raw: withHead('ID3\x04', 2 * 1024 * 1024 + 10) });
    assert.equal(r.status, 413);
    assert.equal(r.body.code, 'media_too_big');
    r = await call('POST', '/media', { user: 'owner1', raw: Buffer.concat([png(), Buffer.alloc(3 * 1024 * 1024)]) });
    assert.equal(r.status, 413);
    assert.equal(r.body.code, 'media_too_big');

    r = await call('GET', '/media', { user: 'owner1' });
    assert.equal(r.body.media.length, 1);
    assert.equal(r.body.premium, true);
    assert.equal((await call('GET', '/media', { user: 'u2' })).body.media.length, 0, 'fremde Dateien sieht keiner');

    assert.equal((await call('DELETE', `/media/${file.id}`, { user: 'u2' })).status, 404);
    assert.equal((await call('DELETE', `/media/${file.id}`, { user: 'owner1' })).status, 200);
    assert.equal((await call('GET', `/media/file/${file.id}`)).status, 404);
    assert.equal((await call('GET', '/media/file/..%2F..%2Fetc')).status, 404);
    assert.deepEqual(fs.readdirSync(path.join(TMP, 'owner1')), [], 'Datei auch auf der Platte weg');
  } finally {
    server.close();
  }
});

test('Speicher voll: höchstens 30 Dateien je Konto', () => {
  const ids = [];
  for (let i = 0; i < media.LIMITS.files; i++) ids.push(media.save('owner1', png(), `bild${i}`).media.id);
  assert.equal(media.save('owner1', png(), 'zu viel').error, 'media_quota');
  for (const id of ids) assert.equal(media.remove('owner1', id), true);
  assert.equal(media.usage('owner1').files, 0);
});

const SUB_CONFIG = (extra = {}) => ({
  config: {
    v: 2,
    theme: { font: 'oswald' },
    modules: {
      subathon: { enabled: true, startMinutes: 60, rules: { ...core.DEFAULT_RULES } },
      alerts: { enabled: true, media: { sub: { image: 'b'.repeat(16) } } },
      ...extra,
    },
  },
});

const setLogin = (userId, login) => db.prepare('UPDATE stream_tool_settings SET twitch_login = ? WHERE user_id = ?').run(login, userId);
const rowOf = (userId) => db.prepare('SELECT * FROM stream_tool_settings WHERE user_id = ?').get(userId);
const tagsOf = (name) => ({ 'display-name': name, login: name.toLowerCase() });

test('OBS-Quelle: Schrift und eigene Bilder nur mit Abo', async () => {
  const { server, call } = startApp();
  try {
    for (const user of ['owner1', 'u2']) {
      assert.equal((await call('PUT', '/config', { user, json: SUB_CONFIG() })).status, 200);
    }
    const keyOwner = (await call('GET', '/me', { user: 'owner1' })).body.overlayKey;
    const keyU2 = (await call('GET', '/me', { user: 'u2' })).body.overlayKey;
    const owner = (await call('GET', `/overlay/${keyOwner}`)).body.config;
    const u2 = (await call('GET', `/overlay/${keyU2}`)).body.config;
    assert.equal(owner.theme.font, 'oswald');
    assert.ok(owner.modules.alerts.media.sub);
    assert.equal(u2.theme.font, undefined);
    assert.equal(u2.modules.alerts.media, undefined);
    // /me liefert die gespeicherte Einstellung — mit Abo ist alles wieder da
    assert.equal((await call('GET', '/me', { user: 'u2' })).body.config.theme.font, 'oswald');
  } finally {
    server.close();
  }
});

test('Happy Hour: Routen, Gutschrift ×3 mit Abo, ohne Abo nichts', async () => {
  const { server, call } = startApp();
  try {
    for (const user of ['owner1', 'u2']) {
      await call('PUT', '/config', { user, json: SUB_CONFIG() });
      assert.equal((await call('POST', '/subathon/start', { user, json: {} })).status, 200);
    }
    setLogin('owner1', 'ownerchan');
    setLogin('u2', 'zweiterchan');

    let r = await call('POST', '/subathon/happy', { user: 'u2', json: { minutes: 30, factor: 3 } });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'premium_needed');

    r = await call('POST', '/subathon/happy', { user: 'owner1', json: { minutes: 30, factor: 5 } });
    assert.equal(r.body.code, 'subathon_bad_amount');
    r = await call('POST', '/subathon/happy', { user: 'owner1', json: { minutes: 30, factor: 3 } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.subathon.happy.factor, 3);

    assert.equal(subathon.onSub('#ownerchan', 'anna', { plan: '1000' }, '', tagsOf('Anna')), true);
    const entry = subathon.collectDashboard(rowOf('owner1')).log[0];
    assert.equal(entry.ms, 3 * 300000);
    assert.equal(entry.x, 3);
    assert.equal(subathon.collect(rowOf('owner1')).happy.factor, 3, 'OBS-Quelle zeigt das Band');

    // Spende aus dem Dashboard zählt ebenfalls dreifach, Zeit von Hand nicht
    r = await call('POST', '/subathon/donation', { user: 'owner1', json: { amount: 2 } });
    assert.equal(r.body.subathon.log[0].ms, 3 * 2 * 60000);
    r = await call('POST', '/subathon/add', { user: 'owner1', json: { seconds: 60 } });
    assert.equal(r.body.subathon.log[0].ms, 60000);
    assert.equal(r.body.subathon.log[0].x, undefined);

    // Ohne Abo: eine (etwa aus Abo-Zeiten) gespeicherte Happy Hour zählt nicht und wird nicht gezeigt
    const state = JSON.parse(rowOf('u2').subathon);
    db.prepare('UPDATE stream_tool_settings SET subathon = ? WHERE user_id = ?')
      .run(JSON.stringify({ ...state, happy: { factor: 3, until: Date.now() + 30 * MIN } }), 'u2');
    assert.equal(subathon.onSub('#zweiterchan', 'bert', { plan: '1000' }, '', tagsOf('Bert')), true);
    const plain = subathon.collectDashboard(rowOf('u2'));
    assert.equal(plain.log[0].ms, 300000);
    assert.equal(plain.log[0].x, undefined);
    assert.equal(plain.happy, null);

    r = await call('POST', '/subathon/happy/stop', { user: 'owner1', json: {} });
    assert.equal(r.body.subathon.happy, null);
  } finally {
    server.close();
  }
});
