// Regeln der veröffentlichten Level (levelService.js), mit dem ECHTEN Prüfer: Veröffentlichen, Liste, Läufe, Sterne, Favoriten, Meldungen,
// Moderation, Änderungen und die Neu-Prüfung nach einer Änderung der Physik. Die Datenbank liegt in einem Wegwerf-Ordner.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { newRig, viewer, publishAs, makeLevel, guestKey, runFor } = require('./levelFixtures');
const { LIMITS } = require('../levelService');
const { isCode } = require('../shareCode');

const ALICE = '1001';
const BOB = '2002';
const ADMIN = '9999';
const guest = () => viewer(null);
const admin = () => viewer(ADMIN, 'admin', { isAdmin: true });

async function withRig(fn, opts) {
  const rig = newRig(opts);
  try {
    await fn(rig);
  } finally {
    await rig.cleanup();
  }
}

const submitBody = (f, run, key, name = 'Gast') => ({ playerKey: key, name, ticks: run.ticks, log: run.log, fp: f.fp });

// ── Veröffentlichen ─────────────────────────────────────────────────────────

test('Veröffentlichen: Code, Angaben, Vorschau, Ersteller-Zeit und Geist kommen aus der Verifizierung', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE, { name: 'Mein erstes Level', mutate: (d) => { d.meta.tags = ['schwer', 'kurz']; d.meta.difficulty = 3; d.meta.description = 'Ein Test.'; } });
    assert.ok(isCode(code), code);

    const d = rig.levels.detail(code, guest(), '');
    assert.equal(d.name, 'Mein erstes Level');
    assert.equal(d.description, 'Ein Test.');
    assert.deepEqual(d.tags, ['schwer', 'kurz']);
    assert.equal(d.difficulty, 3);
    assert.deepEqual(d.creator, { id: ALICE, name: `user${ALICE}` });
    assert.equal(d.creatorTicks, f.ticks);
    assert.equal(d.creatorRun.deaths, 0);
    assert.equal(d.speedClass, 'normal');
    assert.equal(d.status, 'published');
    assert.deepEqual(d.board, []);
    assert.equal(d.clearRate, null, 'noch niemand gespielt');
    assert.ok(d.preview.rows.length > 0 && d.preview.rows.join('').includes('S'));

    assert.deepEqual(rig.levels.ghost(code, guest(), 'creator').log, f.log, 'der Ersteller-Lauf ist der Geist');
    const doc = rig.levels.doc(code, guest());
    assert.equal(doc.hash, f.hash);
    assert.equal(f.engine.validateDoc(doc.doc, { smoke: false }).hash, f.hash, 'der Browser kann den Hash nachrechnen');
    assert.equal(doc.doc.meta.name, 'Mein erstes Level');
  });
});

test('Veröffentlichen: ohne Login, ohne Verifizierung, mit fremder oder veralteter Verifizierung geht es nicht', async () => {
  await withRig(async (rig) => {
    const f = await makeLevel({ name: 'Ungeprüft' });
    const pub = (acc, over = {}) => rig.levels.publish({ viewer: acc ? viewer(acc) : guest(), doc: f.doc, hash: f.hash, ...over });

    assert.equal((await pub(null)).status, 'nicht-erlaubt');
    assert.equal((await pub(ALICE)).status, 'nicht-verifiziert', 'nie durchgespielt');

    await rig.levelVerify.submit({ accountId: ALICE, doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash });
    assert.equal((await pub(BOB)).status, 'nicht-verifiziert', 'die Verifizierung gehört einem anderen Konto');

    // Veraltet: gegen eine ältere Physik geprüft
    rig.store.saveVerification({ accountId: BOB, contentHash: f.hash, simFp: 'alte-physik', ticks: f.ticks, deaths: 0, splits: [], log: f.log });
    const stale = await pub(BOB);
    assert.equal(stale.status, 'veraltet');
    assert.match(stale.reason, /neu durch/);
    assert.equal(rig.L.byHash(f.hash), null, 'nichts wurde veröffentlicht');
    assert.equal((await pub(ALICE)).status, 'ok');
  });
});

test('Veröffentlichen: Name ist Pflicht, Wortfilter und Links werden abgelehnt, ungültiges Level auch', async () => {
  await withRig(async (rig) => {
    const attempt = async (mutate) => {
      const f = await makeLevel({ mutate });
      await rig.levelVerify.submit({ accountId: ALICE, doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash });
      return { f, res: await rig.levels.publish({ viewer: viewer(ALICE), doc: f.doc, hash: f.hash }) };
    };
    const noName = await attempt((d) => { d.meta.name = ''; });
    assert.equal(noName.res.status, 'ungueltig');
    assert.match(noName.res.errors.join(' '), /Levelname/);

    const bad = await attempt((d) => { d.meta.name = 'Nazi Level'; });
    assert.equal(bad.res.status, 'ungueltig');
    assert.match(bad.res.reason, /nicht erlaubt/);
    assert.equal(rig.L.byHash(bad.f.hash), null);

    const link = await attempt((d) => { d.meta.description = 'schau auf https://spam.example.com'; });
    assert.equal(link.res.status, 'ungueltig');
    assert.match(link.res.reason, /Links/);

    const broken = await rig.levels.publish({ viewer: viewer(ALICE), doc: { ...noName.f.doc, tiles: [] } });
    assert.equal(broken.status, 'ungueltig');
    assert.equal((await rig.levels.publish({ viewer: viewer(ALICE), doc: null })).status, 'ungueltig');
  });
});

test('Veröffentlichen: ein abweichender Hash des Browsers ist "nicht geprüft", nicht "ungültig"', async () => {
  await withRig(async (rig) => {
    const f = await makeLevel();
    await rig.levelVerify.submit({ accountId: ALICE, doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash });
    const res = await rig.levels.publish({ viewer: viewer(ALICE), doc: f.doc, hash: 'a'.repeat(64) });
    assert.equal(res.status, 'ungeprueft');
  });
});

test('Veröffentlichen: ein Inhalt nur einmal — auch nicht als Kopie durch ein anderes Konto; Löschen gibt ihn frei', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE);
    const again = await rig.levels.publish({ viewer: viewer(ALICE), doc: f.doc, hash: f.hash });
    assert.deepEqual([again.status, again.existing], ['doppelt', code]);

    // Bob hat das Level kopiert und selbst durchgespielt
    await rig.levelVerify.submit({ accountId: BOB, doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash });
    const copy = await rig.levels.publish({ viewer: viewer(BOB), doc: f.doc, hash: f.hash });
    assert.equal(copy.status, 'doppelt');
    assert.equal(copy.existing, undefined, 'den Code des fremden Levels gibt es nicht preis');

    assert.equal(rig.levels.remove(code, viewer(ALICE)).status, 'ok');
    const fresh = await rig.levels.publish({ viewer: viewer(BOB), doc: f.doc, hash: f.hash });
    assert.equal(fresh.status, 'ok', 'nach dem Löschen ist der Inhalt wieder frei');
  });
});

test(`Veröffentlichen: höchstens ${LIMITS.publishesPerHour} pro Stunde (Löschen umgeht das nicht) und ${LIMITS.activePerAccount} aktive Level`, async () => {
  await withRig(async (rig) => {
    const codes = [];
    for (let i = 0; i < LIMITS.publishesPerHour; i++) codes.push((await publishAs(rig, ALICE)).code);
    const f = await makeLevel();
    await rig.levelVerify.submit({ accountId: ALICE, doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash });
    const blocked = await rig.levels.publish({ viewer: viewer(ALICE), doc: f.doc, hash: f.hash });
    assert.equal(blocked.status, 'zu-viele');
    assert.match(blocked.reason, /pro Stunde/);
    rig.levels.remove(codes[0], viewer(ALICE));
    assert.equal((await rig.levels.publish({ viewer: viewer(ALICE), doc: f.doc, hash: f.hash })).status, 'zu-viele', 'Löschen setzt das Stundenlimit nicht zurück');
    assert.equal((await publishAs(rig, BOB)).result.status, 'ok', 'ein anderes Konto ist nicht betroffen');

    rig.clock.t += 61 * 60 * 1000;
    assert.equal((await rig.levels.publish({ viewer: viewer(ALICE), doc: f.doc, hash: f.hash })).status, 'ok', 'eine Stunde später');
  });

  await withRig(async (rig) => {
    for (let i = 0; i < LIMITS.activePerAccount; i++) {
      rig.L.insertLevel({
        code: `SR-AAA-${String(i).padStart(3, '2').replace(/\d/g, (d) => 'ABCDEFGHJK'[d])}`, accountId: ALICE, creatorName: 'x', name: `L${i}`, biome: 'meadow', speedClass: 'normal',
        width: 40, height: 20, elements: 0, contentHash: String(i).padStart(64, 'e'), doc: {}, preview: {}, simFp: 'x', creatorTicks: 1, creatorDeaths: 0, creatorLog: [], createdAt: 1,
      });
    }
    const f = await makeLevel();
    await rig.levelVerify.submit({ accountId: ALICE, doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash });
    const res = await rig.levels.publish({ viewer: viewer(ALICE), doc: f.doc, hash: f.hash });
    assert.equal(res.status, 'limit');
    assert.match(res.reason, /20/);
  });
});

test('Veröffentlichen: gesperrte Konten dürfen nicht', async () => {
  await withRig(async (rig) => {
    const f = await makeLevel();
    await rig.levelVerify.submit({ accountId: ALICE, doc: f.doc, log: f.log, ticks: f.ticks, fp: f.fp, hash: f.hash });
    rig.levels.moderation.ban(ALICE, 'Spam');
    assert.equal((await rig.levels.publish({ viewer: viewer(ALICE), doc: f.doc, hash: f.hash })).status, 'gesperrt');
    rig.levels.moderation.unban(ALICE);
    assert.equal((await rig.levels.publish({ viewer: viewer(ALICE), doc: f.doc, hash: f.hash })).status, 'ok');
  });
});

// ── Liste und Detail ────────────────────────────────────────────────────────

test('Liste: Karten mit Ersteller, Zeit und Vorschau; Suche nach Name, Ersteller, Tag und Code; Seiten', async () => {
  await withRig(async (rig) => {
    const a = await publishAs(rig, ALICE, { name: 'Feuerberg', mutate: (d) => { d.meta.tags = ['lava']; d.meta.difficulty = 4; } });
    const b = await publishAs(rig, BOB, { name: 'Eiswüste', mutate: (d) => { d.meta.difficulty = 2; d.speedClass = 'fast'; } });
    const names = (q, viewerX = guest()) => rig.levels.list(q, viewerX).items.map((l) => l.name).sort();

    const all = rig.levels.list({}, guest());
    assert.equal(all.total, 2);
    assert.deepEqual([all.page, all.pages], [1, 1]);
    const card = all.items.find((l) => l.name === 'Feuerberg');
    assert.deepEqual(Object.keys(card).sort(), ['biome', 'clearRate', 'clears', 'code', 'createdAt', 'creator', 'creatorTicks', 'difficulty', 'elements', 'height', 'name', 'players', 'plays', 'preview', 'rating', 'speedClass', 'status', 'tags', 'width'].sort());
    assert.equal(card.creatorTicks, a.f.ticks);

    assert.deepEqual(names({ q: 'feuer' }), ['Feuerberg']);
    assert.deepEqual(names({ q: `user${BOB}` }), ['Eiswüste'], 'Ersteller');
    assert.deepEqual(names({ tag: 'lava' }), ['Feuerberg']);
    assert.deepEqual(names({ difficulty: '2' }), ['Eiswüste']);
    assert.deepEqual(names({ speed: 'fast' }), ['Eiswüste']);
    assert.deepEqual(names({ q: b.code.toLowerCase().replace(/-/g, ' ') }), ['Eiswüste'], 'Code, klein und mit Leerzeichen');
    assert.deepEqual(names({ q: 'x'.repeat(200) }), []);
    assert.deepEqual(names({ difficulty: '9' }), ['Eiswüste', 'Feuerberg'], 'ungültige Filter werden ignoriert');
    assert.equal(rig.levels.list({ sort: 'quatsch' }, guest()).items.length, 2);

    assert.deepEqual(rig.levels.list({ limit: 1, page: 2, sort: 'new' }, guest()).items.map((l) => l.name), ['Feuerberg']);
    assert.equal(rig.levels.list({ limit: 1 }, guest()).pages, 2);
    assert.equal(rig.levels.list({ limit: 9999 }, guest()).items.length, 2, 'Seitengröße ist begrenzt');
    assert.equal(rig.levels.list({ page: 99 }, guest()).items.length, 0);
    assert.equal(rig.levels.list({ page: -3 }, guest()).page, 1);
  });
});

test('Liste "meine": der Ersteller sieht auch ausgeblendete Level, Gäste nichts', async () => {
  await withRig(async (rig) => {
    const a = await publishAs(rig, ALICE, { name: 'Sichtbar' });
    const b = await publishAs(rig, ALICE, { name: 'Versteckt' });
    rig.levels.moderation.hide(b.code, 'Test');
    assert.deepEqual(rig.levels.list({}, guest()).items.map((l) => l.name), ['Sichtbar']);
    const mine = rig.levels.list({ mine: true }, viewer(ALICE)).items;
    assert.deepEqual(mine.map((l) => [l.name, l.status]).sort(), [['Sichtbar', 'published'], ['Versteckt', 'hidden']]);
    assert.equal(rig.levels.list({ mine: true }, guest()).total, 0);
    assert.equal(rig.levels.list({ mine: true }, viewer(BOB)).total, 0);
    void a;
  });
});

test('Detail: ausgeblendete Level sehen nur Ersteller und Moderation, gelöschte nur die Moderation', async () => {
  await withRig(async (rig) => {
    const { code } = await publishAs(rig, ALICE);
    rig.levels.moderation.hide(code, 'Beleidigende Beschreibung');
    assert.equal(rig.levels.detail(code, guest(), ''), null);
    assert.equal(rig.levels.detail(code, viewer(BOB), ''), null);
    assert.equal(rig.levels.doc(code, guest()), null);
    assert.equal(rig.levels.ghost(code, guest(), 'creator'), null);
    const own = rig.levels.detail(code, viewer(ALICE), '');
    assert.equal(own.status, 'hidden');
    assert.match(own.statusReason, /Beleidigende/);
    assert.ok(rig.levels.detail(code, admin(), ''));

    rig.levels.remove(code, viewer(ALICE));
    assert.equal(rig.levels.detail(code, viewer(ALICE), ''), null, 'gelöscht: auch der Ersteller sieht es nicht mehr');
    assert.ok(rig.levels.detail(code, admin(), ''), 'die Moderation schon');
    assert.equal(rig.levels.detail('SR-ZZZ-ZZZ', admin(), ''), null);
  });
});

// ── Spielen: Versuche und Läufe ─────────────────────────────────────────────

test('Versuche: zählen Spiele und Spieler; Gäste über Schlüssel, Angemeldete über das Konto', async () => {
  await withRig(async (rig) => {
    const { code } = await publishAs(rig, ALICE);
    const k = guestKey(1);
    assert.deepEqual(rig.levels.play(code, guest(), k), { counted: true });
    assert.deepEqual(rig.levels.play(code, guest(), k), { counted: false }, 'sofort nochmal: derselbe Versuch');
    rig.clock.t += 21000;
    assert.deepEqual(rig.levels.play(code, guest(), k), { counted: true });
    assert.deepEqual(rig.levels.play(code, viewer(BOB), ''), { counted: true }, 'Angemeldete brauchen keinen Schlüssel');
    assert.deepEqual(rig.levels.play(code, guest(), 'kein-schluessel'), { counted: false }, 'ohne gültige Identität zählt nichts');
    assert.equal(rig.levels.play('SR-ZZZ-ZZZ', guest(), k), null);
    const d = rig.levels.detail(code, guest(), '');
    assert.deepEqual([d.plays, d.players], [3, 2]);
  });
});

test('Läufe: nachgespielt, in die Bestenliste einsortiert, Zählung und Abschlussquote stimmen', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE);
    const fast = await runFor(f, 0);
    const slow = await runFor(f, 300);
    assert.ok(slow.ticks > fast.ticks);

    const k1 = guestKey(1);
    const k2 = guestKey(2);
    rig.levels.play(code, guest(), k1);
    const r1 = await rig.levels.submit(code, guest(), submitBody(f, slow, k1, 'Langsamer Gast'));
    assert.deepEqual([r1.status, r1.rank, r1.ticks, r1.improved], ['ok', 1, slow.ticks, true]);
    rig.clock.t += 1000;
    const r2 = await rig.levels.submit(code, guest(), submitBody(f, fast, k2, 'Schneller Gast'));
    assert.deepEqual([r2.status, r2.rank], ['ok', 1]);
    rig.clock.t += 1000;
    const r3 = await rig.levels.submit(code, viewer(BOB, 'bob_tv'), { ...submitBody(f, fast, null), name: 'ignoriert' });
    assert.equal(r3.status, 'ok');
    assert.equal(r3.rank, 2, 'gleiche Zeit wie der schnelle Gast, aber später');

    const d = rig.levels.detail(code, guest(), '');
    assert.deepEqual(d.board.map((e) => [e.rank, e.name, e.ticks]), [[1, 'Schneller Gast', fast.ticks], [2, 'bob_tv', fast.ticks], [3, 'Langsamer Gast', slow.ticks]]);
    assert.equal(d.runs, 3);
    assert.deepEqual([d.plays, d.players, d.clears, d.clearRate], [3, 3, 3, 1]);
    assert.ok(d.board.every((e) => e.hasGhost));
    assert.equal(rig.levels.detail(code, guest(), k1).me.best.rank, 3);
    assert.equal(rig.levels.detail(code, viewer(BOB), '').me.best.rank, 2);
    assert.equal(rig.levels.detail(code, guest(), guestKey(7)).me.best, null);

    // Geist eines Bestenlisten-Eintrags
    const ghost = rig.levels.ghost(code, guest(), String(d.board[2].runId));
    assert.deepEqual([ghost.name, ghost.ticks, ghost.log], ['Langsamer Gast', slow.ticks, slow.log]);
    assert.equal(rig.levels.ghost(code, guest(), '99999'), null);
    assert.equal(rig.levels.ghost(code, guest(), 'abc'), null);
  });
});

test('Läufe: nur eine schnellere Zeit ersetzt die alte; ein langsamerer Lauf wird nicht nachgespielt', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE);
    const fast = await runFor(f, 0);
    const slow = await runFor(f, 300);
    const k = guestKey(3);
    assert.equal((await rig.levels.submit(code, guest(), submitBody(f, slow, k))).improved, true);
    const better = await rig.levels.submit(code, guest(), submitBody(f, fast, k));
    assert.deepEqual([better.status, better.ticks, better.improved], ['ok', fast.ticks, true]);
    const calls = [];
    const original = rig.verifier.verify;
    rig.verifier.verify = (job) => { calls.push(job); return original(job); };
    const worse = await rig.levels.submit(code, guest(), submitBody(f, slow, k));
    assert.deepEqual([worse.status, worse.ticks, worse.rank], ['nicht-besser', fast.ticks, 1]);
    assert.equal(calls.length, 0, 'kein Nachspielen für einen Lauf, der nichts ändern kann');
    const d = rig.levels.detail(code, guest(), '');
    assert.deepEqual([d.players, d.clears, d.runs], [1, 1, 1], 'eine Person zählt einmal');
  });
});

test('Läufe: Manipulation, falscher Stand, unbekannte oder ausgeblendete Level werden abgelehnt', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE);
    const run = await runFor(f, 0);
    const k = guestKey(4);
    const body = (over = {}) => ({ ...submitBody(f, run, k), ...over });
    const status = async (over, v = guest()) => (await rig.levels.submit(code, v, body(over))).status;

    assert.equal(await status({ ticks: run.ticks - 1 }), 'abgelehnt');
    assert.equal(await status({ ticks: run.ticks + 1 }), 'abgelehnt');
    assert.equal(await status({ log: [0, 1] }), 'abgelehnt', 'läuft nach links');
    assert.equal(await status({ log: [] }), 'abgelehnt');
    assert.equal(await status({ ticks: 144001 }), 'abgelehnt', 'über dem Zeitlimit');
    assert.equal(await status({ fp: 'ffffffffffffffff' }), 'ungeprueft');
    assert.equal(await status({ fp: f.engine.ENGINE_FINGERPRINT }), 'ungeprueft', 'ENGINE ist der falsche Fingerprint');
    assert.equal(await status({ ticks: 'schnell' }), 'ungueltig');
    assert.equal(await status({ ticks: 5 }), 'ungueltig');
    assert.equal(await status({ log: [5, 2, 1, 0] }), 'ungueltig');
    assert.equal(await status({ log: 'nope' }), 'ungueltig');
    assert.equal(await status({ playerKey: 'x' }), 'ungueltig', 'ohne Identität');
    assert.equal(rig.levels.detail(code, guest(), '').runs, 0, 'nichts kam in die Bestenliste');

    assert.equal((await rig.levels.submit('SR-ZZZ-ZZZ', guest(), body())).status, 'nicht-gefunden');
    rig.levels.moderation.hide(code, 'x');
    assert.equal((await rig.levels.submit(code, guest(), body())).status, 'nicht-gefunden', 'ausgeblendet: keine neuen Läufe');
  });
});

test('Läufe: Namen von Gästen werden bereinigt; Angemeldete stehen mit ihrem Konto-Namen da', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE);
    const run = await runFor(f, 0);
    await rig.levels.submit(code, guest(), submitBody(f, run, guestKey(5), '  Böser\u0000  Name   mit   Lücken und viel zu lang für die Liste  '));
    const name = rig.levels.detail(code, guest(), '').board[0].name;
    assert.ok(name.length <= 24 && !name.includes('\u0000') && !/\s{2}/.test(name), name);
    assert.equal((await rig.levels.submit(code, guest(), submitBody(f, run, guestKey(6), ''))).status, 'ok');
    assert.ok(rig.levels.detail(code, guest(), '').board.some((e) => e.name === 'Anonym'));
    // Der Name steht öffentlich in der Liste: derselbe Filter wie für Levelnamen (Schimpfwort, Link) — dann steht dort "Anonym"
    await rig.levels.submit(code, guest(), submitBody(f, run, guestKey(7), 'www.zockerseite.de'));
    await rig.levels.submit(code, guest(), submitBody(f, run, guestKey(8), 'Fick Dich'));
    const names = rig.levels.detail(code, guest(), '').board.map((e) => e.name);
    assert.ok(!names.some((n) => /zocker|fick/i.test(n)), names.join(' | '));
  });
});

test('Läufe: ein überlasteter Prüfer meldet "busy", nichts wird gespeichert', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE);
    const run = await runFor(f, 0);
    rig.verifier.verify = async () => ({ status: 'busy' });
    const res = await rig.levels.submit(code, guest(), submitBody(f, run, guestKey(8)));
    assert.equal(res.status, 'busy');
    assert.equal(rig.levels.detail(code, guest(), '').runs, 0);
    rig.verifier.verify = async () => ({ status: 'error', reason: 'Zeitüberschreitung' });
    assert.equal((await rig.levels.submit(code, guest(), submitBody(f, run, guestKey(8)))).status, 'fehler');
  });
});

// ── Sterne und Favoriten ────────────────────────────────────────────────────

test('Sterne für veröffentlichte Level: Gäste und Konten, nicht das eigene, ändern und zurücknehmen', async () => {
  await withRig(async (rig) => {
    const { code } = await publishAs(rig, ALICE);
    const ref = { kind: 'custom', code };
    assert.equal(rig.levels.rate(guest(), '', ref, 5).status, 'ungueltig', 'ohne Spielerschlüssel keine Stimme');
    assert.equal(rig.levels.rate(viewer(ALICE), '', ref, 5).status, 'eigenes');
    assert.equal(rig.levels.rate(viewer(BOB), '', { kind: 'custom', code: 'SR-ZZZ-ZZZ' }, 5).status, 'nicht-gefunden');
    assert.equal(rig.levels.rate(viewer(BOB), '', ref, 6).status, 'ungueltig');
    assert.equal(rig.levels.rate(viewer(BOB), '', ref, 2.5).status, 'ungueltig');
    assert.equal(rig.levels.detail(code, viewer(ALICE), '').me.canRate, false);
    assert.equal(rig.levels.detail(code, viewer(BOB), '').me.canRate, true, 'kein Versuch nötig — auch nach einer Lobby-Runde bewertbar');

    assert.deepEqual(rig.levels.rate(viewer(BOB), '', ref, 4), { status: 'ok', key: `c:${code}`, mine: 4, rating: { count: 1, avg: 4 } });
    assert.deepEqual(rig.levels.rate(guest(), guestKey(9), ref, 2).rating, { count: 2, avg: 3 });
    assert.equal(rig.levels.detail(code, viewer(BOB), '').me.stars, 4);
    assert.equal(rig.levels.detail(code, guest(), guestKey(9)).me.stars, 2);
    assert.deepEqual(rig.levels.detail(code, guest(), '').rating, { avg: 3, count: 2 });
    assert.deepEqual(rig.levels.rate(viewer(BOB), '', ref, 0).rating, { count: 1, avg: 2 }, 'zurücknehmen');

    rig.levels.moderation.ban(BOB, 'x');
    assert.equal(rig.levels.rate(viewer(BOB), '', ref, 5).status, 'gesperrt');
  });
});

test('Sterne für Zufallslevel: Seed + Biom ist das Level; ungültige Angaben werden abgelehnt; Bestenliste', async () => {
  await withRig(async (rig) => {
    const a = { kind: 'pfad', seed: 'a1b2c3d4', biome: 'random' };
    const b = { kind: 'pfad', seed: 'daily-2026-09-28', biome: 'random' };
    assert.equal(rig.levels.rate(guest(), guestKey(1), { kind: 'pfad', seed: '', biome: 'random' }, 3).status, 'ungueltig');
    assert.equal(rig.levels.rate(guest(), guestKey(1), { kind: 'pfad', seed: 'x', biome: 'mond' }, 3).status, 'ungueltig');
    assert.equal(rig.levels.rate(guest(), guestKey(1), { kind: 'pfad', seed: 'x'.repeat(41), biome: 'ice' }, 3).status, 'ungueltig');
    assert.equal(rig.levels.rate(guest(), guestKey(1), { kind: 'chunk', seed: 'x', biome: 'ice' }, 3).status, 'ungueltig');
    assert.equal(rig.levels.rate(guest(), guestKey(1), a, 3).status, 'ok');
    rig.levels.rate(guest(), guestKey(2), b, 5);
    rig.levels.rate(guest(), guestKey(3), b, 5);
    assert.deepEqual(rig.levels.rate(guest(), guestKey(1), { ...a, biome: 'ice' }, 1).rating, { count: 1, avg: 1 }, 'anderes Biom = anderes Level');

    const top = rig.levels.topRandom(guest(), guestKey(2)).items;
    assert.deepEqual(top.map((e) => e.ref.seed), ['daily-2026-09-28', 'a1b2c3d4', 'a1b2c3d4']);
    assert.equal(top[0].mine, 5);
    assert.equal(top[0].favorite, false);

    const look = rig.levels.ratings(guest(), guestKey(1), [a, b, { kind: 'quatsch' }]).items;
    assert.deepEqual(look.map((e) => [e.key, e.mine, e.rating.count]), [['p1:random:a1b2c3d4', 3, 1], ['p1:random:daily-2026-09-28', null, 2]]);
  });
});

test('Favoriten: Zufalls- und veröffentlichte Level, Info nur als Kennungen, ausgeblendete fallen heraus, Obergrenze', async () => {
  await withRig(async (rig) => {
    const { code } = await publishAs(rig, ALICE);
    const k = guestKey(4);
    const r = { kind: 'pfad', seed: 'seed-1', biome: 'cave' };
    assert.equal(rig.levels.favorite(guest(), '', r, true).status, 'ungueltig');
    assert.equal(rig.levels.favorite(guest(), k, { kind: 'custom', code: 'SR-ZZZ-ZZZ' }, true).status, 'nicht-gefunden');
    assert.equal(rig.levels.favorite(guest(), k, r, true, { leitidee: 'seilakt', autor: '<b>böse</b>', extra: 'x' }).status, 'ok');
    assert.equal(rig.levels.favorite(guest(), k, { kind: 'custom', code }, true).status, 'ok');
    let favs = rig.levels.favorites(guest(), k).items;
    assert.deepEqual(favs.map((f) => f.ref.kind).sort(), ['custom', 'pfad']);
    const pf = favs.find((f) => f.ref.kind === 'pfad');
    assert.deepEqual(pf.info, { leitidee: 'seilakt' }, 'freie Texte werden nicht gespeichert');
    assert.equal(pf.favorite, true);
    assert.equal(favs.find((f) => f.ref.kind === 'custom').level.code, code);
    assert.equal(rig.levels.detail(code, guest(), k).me.favorite, true);

    rig.levels.moderation.hide(code, 'x');
    favs = rig.levels.favorites(guest(), k).items;
    assert.deepEqual(favs.map((f) => f.ref.kind), ['pfad'], 'ein ausgeblendetes Level verschwindet aus den Favoriten');
    assert.equal(rig.levels.favorite(guest(), k, r, false).favorite, false);
    assert.deepEqual(rig.levels.favorites(guest(), k).items, []);

    const k2 = guestKey(5);
    for (let i = 0; i < 200; i++) rig.levels.favorite(guest(), k2, { kind: 'pfad', seed: `s${i}`, biome: 'random' }, true);
    assert.equal(rig.levels.favorite(guest(), k2, { kind: 'pfad', seed: 'eins-zu-viel', biome: 'random' }, true).status, 'limit');
    assert.equal(rig.levels.favorite(guest(), k2, { kind: 'pfad', seed: 's5', biome: 'random' }, true).status, 'ok', 'ein vorhandener Favorit geht trotzdem');
  });
});

test('Anmelden: Sterne und Favoriten des Browsers gehen aufs Konto über', async () => {
  await withRig(async (rig) => {
    const k = guestKey(6);
    const r = { kind: 'pfad', seed: 'mein-seed', biome: 'sky' };
    rig.levels.rate(guest(), k, r, 4);
    rig.levels.favorite(guest(), k, r, true);
    const favs = rig.levels.favorites(viewer(BOB), k).items;   // angemeldet, derselbe Browser
    assert.deepEqual(favs.map((f) => f.key), ['p1:sky:mein-seed']);
    assert.equal(favs[0].mine, 4);
    assert.deepEqual(rig.levels.favorites(guest(), k).items, [], 'der Browser allein hat sie nicht mehr');
    assert.deepEqual(rig.levels.favorites(viewer(BOB), '').items.map((f) => f.key), ['p1:sky:mein-seed'], 'auf jedem Gerät');
  });
});

// ── Meldungen und Moderation ────────────────────────────────────────────────

test('Meldungen: Login, gültiger Grund, nicht das eigene Level; pro Konto einmal; Moderation sieht sie', async () => {
  await withRig(async (rig) => {
    const { code } = await publishAs(rig, ALICE, { name: 'Gemeldetes' });
    assert.equal(rig.levels.report(code, guest(), { reason: 'anstoessig' }).status, 'nicht-erlaubt');
    assert.equal(rig.levels.report(code, viewer(BOB), { reason: 'quatsch' }).status, 'ungueltig');
    assert.equal(rig.levels.report(code, viewer(BOB), {}).status, 'ungueltig');
    assert.equal(rig.levels.report(code, viewer(ALICE), { reason: 'sonstiges' }).status, 'eigenes');
    assert.equal(rig.levels.report('SR-ZZZ-ZZZ', viewer(BOB), { reason: 'sonstiges' }).status, 'nicht-gefunden');
    assert.deepEqual(rig.levels.report(code, viewer(BOB), { reason: 'anstoessig', note: 'Böse\u0000 Wörter  im Text' }), { status: 'ok' });
    assert.deepEqual(rig.levels.report(code, viewer(BOB), { reason: 'kopie' }), { status: 'ok', already: true });
    rig.levels.report(code, viewer('3003'), { reason: 'unspielbar' });

    const reports = rig.levels.moderation.reports();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].level.name, 'Gemeldetes');
    assert.equal(reports[0].count, 2);
    assert.deepEqual(reports[0].reports.map((r) => r.reason).sort(), ['anstoessig', 'unspielbar']);
    assert.ok(reports[0].reports.every((r) => !/\u0000/.test(r.note)));
  });
});

test('Moderation: ausblenden (löst Meldungen auf), wieder einblenden, Meldung verwerfen; sperren blendet alles aus', async () => {
  await withRig(async (rig) => {
    const a = await publishAs(rig, ALICE, { name: 'Alpha' });
    const b = await publishAs(rig, ALICE, { name: 'Beta' });
    const c = await publishAs(rig, BOB, { name: 'Gamma' });
    rig.levels.report(a.code, viewer(BOB), { reason: 'anstoessig' });
    rig.levels.report(b.code, viewer(BOB), { reason: 'kopie' });
    const openId = rig.levels.moderation.reports().find((g) => g.level.name === 'Beta').reports[0].id;

    assert.equal(rig.levels.moderation.hide(a.code, 'Regelverstoß').status, 'ok');
    assert.deepEqual(rig.levels.list({}, guest()).items.map((l) => l.name).sort(), ['Beta', 'Gamma']);
    assert.equal(rig.levels.moderation.reports().length, 1, 'die Meldungen zu A sind erledigt');
    assert.equal(rig.levels.moderation.dismiss(openId).status, 'ok');
    assert.equal(rig.levels.moderation.dismiss(openId).status, 'nicht-gefunden');
    assert.equal(rig.levels.moderation.reports().length, 0);
    assert.equal(rig.levels.moderation.unhide(a.code).status, 'ok');
    assert.equal(rig.levels.moderation.unhide(a.code).status, 'nicht-gefunden', 'war nicht ausgeblendet');
    assert.equal(rig.levels.moderation.hide('SR-ZZZ-ZZZ', 'x').status, 'nicht-gefunden');

    const banned = rig.levels.moderation.ban(ALICE, 'Wiederholter Spam');
    assert.deepEqual(banned, { status: 'ok', hidden: 2 });
    assert.deepEqual(rig.levels.list({}, guest()).items.map((l) => l.name), ['Gamma'], 'nur Bobs Level bleibt');
    assert.deepEqual(rig.levels.moderation.bans().map((x) => x.accountId), [ALICE]);
    assert.deepEqual(rig.levels.moderation.unban(ALICE), { status: 'ok', restored: 2 });
    assert.equal(rig.levels.list({}, guest()).total, 3);
    void c;
  });
});

test('Moderation: ausgeblendete Level bleiben auffindbar, auch nachdem ihre Meldung erledigt ist', async () => {
  await withRig(async (rig) => {
    const a = await publishAs(rig, ALICE, { name: 'Alpha' });
    const b = await publishAs(rig, ALICE, { name: 'Beta' });
    await publishAs(rig, BOB, { name: 'Gamma' });
    assert.deepEqual(rig.levels.moderation.hidden(), [], 'anfangs nichts ausgeblendet');

    rig.levels.report(a.code, viewer(BOB), { reason: 'anstoessig' });
    rig.levels.moderation.hide(a.code, 'Regelverstoß');
    // hide() löst die Meldung mit auf — trotzdem bleibt das Level über "hidden()" auffindbar
    assert.equal(rig.levels.moderation.reports().length, 0);
    let hidden = rig.levels.moderation.hidden();
    assert.deepEqual(hidden.map((l) => l.name), ['Alpha']);
    assert.equal(hidden[0].statusReason, 'Regelverstoß');

    rig.levels.moderation.hide(b.code, undefined);   // ohne Grund: ein Standardtext greift
    hidden = rig.levels.moderation.hidden();
    assert.deepEqual(hidden.map((l) => l.name).sort(), ['Alpha', 'Beta']);
    assert.equal(hidden.find((l) => l.name === 'Beta').statusReason, 'Von der Moderation ausgeblendet');

    rig.levels.moderation.unhide(a.code);
    assert.deepEqual(rig.levels.moderation.hidden().map((l) => l.name), ['Beta']);
  });
});

// ── Ändern und Löschen ──────────────────────────────────────────────────────

test('Angaben ändern: nur der Ersteller; Hash und Verifizierung bleiben; Wortfilter und Regeln gelten weiter', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE, { name: 'Alter Name' });
    const patch = (v, body) => rig.levels.patchMeta(code, v, body);

    assert.equal((await patch(guest(), { name: 'Neuer Name' })).status, 'nicht-erlaubt');
    assert.equal((await patch(viewer(BOB), { name: 'Neuer Name' })).status, 'nicht-erlaubt');
    assert.equal((await patch(viewer(ALICE), { name: 'ab' })).status, 'ungueltig', 'zu kurz');
    assert.equal((await patch(viewer(ALICE), { name: 'Nazi Level' })).status, 'ungueltig', 'Wortfilter');
    assert.equal((await patch(viewer(ALICE), { biome: 'lava' })).status, 'ungueltig', 'unbekanntes Biom');
    assert.equal((await patch(viewer(ALICE), { difficulty: 9 })).status, 'ungueltig');
    assert.equal(rig.levels.detail(code, guest(), '').name, 'Alter Name');

    const ok = await patch(viewer(ALICE), { name: 'Neuer Name', description: 'Jetzt mit Text', tags: ['Neu', 'Lang'], difficulty: 5, biome: 'cave' });
    assert.equal(ok.status, 'ok');
    const d = rig.levels.detail(code, guest(), '');
    assert.deepEqual([d.name, d.description, d.tags, d.difficulty, d.biome], ['Neuer Name', 'Jetzt mit Text', ['neu', 'lang'], 5, 'cave']);
    assert.equal(rig.levels.doc(code, guest()).hash, f.hash, 'der Spielinhalt ist derselbe');
    assert.equal(rig.levels.doc(code, guest()).doc.meta.biome, 'cave', 'die Angaben im Dokument sind die aktuellen');
    assert.equal(rig.levels.list({ q: 'neuer name' }, guest()).total, 1, 'die Suche findet den neuen Namen');
    assert.equal(rig.levels.list({ q: 'alter name' }, guest()).total, 0);
    assert.equal((await patch(viewer(ALICE), { name: 'Nochmal' })).status, 'ok', 'einzelne Felder genügen');
    assert.equal(rig.levels.detail(code, guest(), '').description, 'Jetzt mit Text');

    // Läufe auf dem Level laufen nach der Änderung weiter (die Angaben im Dokument spielen beim Nachspielen keine Rolle)
    const run = await runFor(f, 0);
    assert.equal((await rig.levels.submit(code, guest(), submitBody(f, run, guestKey(10)))).status, 'ok');
  });
});

test('Löschen: Ersteller oder Moderation; danach ist es weg und der Platz frei', async () => {
  await withRig(async (rig) => {
    const a = await publishAs(rig, ALICE, { name: 'Alpha' });
    const b = await publishAs(rig, ALICE, { name: 'Beta' });
    assert.equal(rig.levels.remove(a.code, guest()).status, 'nicht-erlaubt');
    assert.equal(rig.levels.remove(a.code, viewer(BOB)).status, 'nicht-erlaubt');
    assert.equal(rig.levels.remove('SR-ZZZ-ZZZ', viewer(ALICE)).status, 'nicht-gefunden');
    assert.equal(rig.levels.remove(a.code, viewer(ALICE)).status, 'ok');
    assert.equal(rig.levels.remove(a.code, viewer(ALICE)).status, 'nicht-gefunden', 'schon gelöscht');
    assert.equal(rig.levels.remove(b.code, admin()).status, 'ok', 'die Moderation darf jedes löschen');
    assert.equal(rig.levels.list({}, guest()).total, 0);
    assert.equal(rig.levels.list({ mine: true }, viewer(ALICE)).total, 0);
    assert.equal((await rig.levels.patchMeta(a.code, viewer(ALICE), { name: 'Wieder da' })).status, 'nicht-gefunden');
    assert.equal(rig.L.countActive(ALICE), 0);
  });
});

// ── Ersteller-Profil ────────────────────────────────────────────────────────

test('Ersteller-Profil: Name, Summen, veröffentlichte Level; unbekannt oder nur Ausgeblendetes gibt es nicht', async () => {
  await withRig(async (rig) => {
    const a = await publishAs(rig, ALICE, { name: 'Alpha' });
    await publishAs(rig, ALICE, { name: 'Beta' });
    rig.levels.play(a.code, viewer(BOB), '');
    rig.levels.rate(viewer(BOB), '', { kind: 'custom', code: a.code }, 4);
    const p = rig.levels.creator(ALICE, guest());
    assert.equal(p.name, `user${ALICE}`);
    assert.deepEqual(p.stats, { levels: 2, plays: 1, ratings: 1, ratingAvg: 4, clears: 0 });
    assert.deepEqual(p.levels.map((l) => l.name).sort(), ['Alpha', 'Beta']);
    assert.equal(p.isMe, false);
    assert.equal(rig.levels.creator(ALICE, viewer(ALICE)).isMe, true);
    assert.equal(rig.levels.creator('424242', guest()), null);
    rig.levels.moderation.ban(ALICE, 'x');
    assert.equal(rig.levels.creator(ALICE, guest()), null, 'gesperrter Ersteller ohne sichtbare Level');
  });
});

// ── Physik-Änderung ─────────────────────────────────────────────────────────

test('Neu-Prüfung: ein Level, dessen Ersteller-Lauf die neue Physik besteht, bleibt sichtbar und bekommt den neuen Stand', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE);
    const l = rig.L.byCode(code);
    rig.L.setSimFp(l.id, 'alte-physik', 1);
    assert.equal(rig.L.staleLevels(f.fp).length, 1);
    const summary = await rig.levels.reverifyStale();
    assert.deepEqual(summary.levels, { checked: 1, ok: 1, hidden: 0, skipped: 0 });
    assert.equal(rig.L.byCode(code).simFp, f.fp);
    assert.equal(rig.L.byCode(code).status, 'published');
    assert.equal(rig.L.staleLevels(f.fp).length, 0);
    assert.deepEqual((await rig.levels.reverifyStale()).levels, { checked: 0, ok: 0, hidden: 0, skipped: 0 }, 'nichts mehr zu tun');
  });
});

test('Neu-Prüfung: besteht der Ersteller-Lauf nicht mehr, ist das Level unsichtbar, bis der Ersteller es neu durchspielt', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE, { name: 'Wackelig' });
    const l = rig.L.byCode(code);
    // Der gespeicherte Lauf führt "nicht mehr" ins Ziel (simuliert eine Physik, die ihn bricht)
    rig.L.setCreatorRun(l.id, { simFp: 'alte-physik', ticks: f.ticks, deaths: 0, splits: [], log: [0, 1] }, 1);
    const summary = await rig.levels.reverifyStale();
    assert.deepEqual(summary.levels, { checked: 1, ok: 0, hidden: 1, skipped: 0 });
    assert.equal(rig.L.byCode(code).status, 'reverify');
    assert.equal(rig.levels.list({}, guest()).total, 0, 'im Browser nicht mehr zu sehen');
    assert.equal(rig.levels.detail(code, guest(), ''), null);
    const own = rig.levels.detail(code, viewer(ALICE), '');
    assert.equal(own.status, 'reverify');
    assert.match(own.statusReason, /neu durch/);
    assert.equal(rig.levels.list({ mine: true }, viewer(ALICE)).items[0].status, 'reverify');

    // Nur der Ersteller kann es retten — mit einem Lauf, der die aktuelle Physik besteht
    const run = await runFor(f, 0);
    assert.equal((await rig.levels.reverify(code, viewer(BOB), { ticks: run.ticks, log: run.log, fp: f.fp })).status, 'nicht-erlaubt');
    assert.equal((await rig.levels.reverify(code, viewer(ALICE), { ticks: run.ticks, log: [0, 1], fp: f.fp })).status, 'abgelehnt');
    assert.equal((await rig.levels.reverify(code, viewer(ALICE), { ticks: run.ticks, log: run.log, fp: 'anderer-stand' })).status, 'ungeprueft');
    const ok = await rig.levels.reverify(code, viewer(ALICE), { ticks: run.ticks, log: run.log, fp: f.fp });
    assert.deepEqual([ok.status, ok.ticks, ok.improved], ['ok', run.ticks, true]);
    assert.equal(rig.L.byCode(code).status, 'published');
    assert.equal(rig.L.byCode(code).simFp, f.fp);
    assert.equal(rig.levels.list({}, guest()).total, 1, 'wieder sichtbar');
  });
});

test('Ersteller-Zeit verbessern: ein schnellerer Lauf ersetzt Zeit und Geist, ein langsamerer nicht', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE, { f: await makeLevel({ startAt: 300 }) });
    const slowTicks = f.ticks;
    const fast = await runFor(f, 0);
    const back = await rig.levels.reverify(code, viewer(ALICE), { ticks: slowTicks + 10, log: [400, 2], fp: f.fp });
    assert.equal(back.status, 'ok');
    assert.equal(back.improved, false, 'langsamer: nichts ändert sich');
    const up = await rig.levels.reverify(code, viewer(ALICE), { ticks: fast.ticks, log: fast.log, fp: f.fp });
    assert.deepEqual([up.status, up.ticks, up.improved], ['ok', fast.ticks, true]);
    assert.equal(rig.levels.detail(code, guest(), '').creatorTicks, fast.ticks);
    assert.deepEqual(rig.levels.ghost(code, guest(), 'creator').log, fast.log);
  });
});

test('Neu-Prüfung der Bestenliste: bestehende Läufe behalten ihren Platz, nicht mehr bestehende und unbelegte fliegen raus', async () => {
  await withRig(async (rig) => {
    const { code, f } = await publishAs(rig, ALICE);
    const l = rig.L.byCode(code);
    const good = await runFor(f, 0);
    const other = await runFor(f, 100);
    await rig.levels.submit(code, guest(), submitBody(f, good, guestKey(1), 'Gut'));
    await rig.levels.submit(code, guest(), submitBody(f, other, guestKey(2), 'Auch gut'));
    // Zwei Einträge stammen aus der "alten Physik": einer besteht, einer nicht, einer hat kein Log mehr
    const board = () => rig.levels.detail(code, guest(), '').board.map((e) => e.name);
    for (const key of [guestKey(1), guestKey(2)]) rig.L.setRunSim(rig.L.getRun(l.id, key).id, 'alte-physik');
    rig.L.saveRun({ levelId: l.id, playerKey: guestKey(3), playerName: 'Kaputt', ticks: 5000, deaths: 0, log: [0, 1], simFp: 'alte-physik', createdAt: 5 });
    rig.L.saveRun({ levelId: l.id, playerKey: guestKey(4), playerName: 'Ohne Beweis', ticks: 6000, deaths: 0, log: null, simFp: 'alte-physik', createdAt: 6 });
    assert.equal(board().length, 4);

    const summary = await rig.levels.reverifyStale();
    assert.deepEqual(summary.runs, { checked: 4, ok: 2, dropped: 2, skipped: 0 });
    assert.deepEqual(board(), ['Gut', 'Auch gut']);
    assert.equal(rig.L.levelsWithStaleRuns(f.fp).length, 0);
  });
});

test('Neu-Prüfung: ist der Prüfer nicht erreichbar, bleibt alles, wie es war', async () => {
  await withRig(async (rig) => {
    const { code } = await publishAs(rig, ALICE);
    rig.L.setSimFp(rig.L.byCode(code).id, 'alte-physik', 1);
    rig.verifier.verify = async () => ({ status: 'error', reason: 'Zeitüberschreitung' });
    const summary = await rig.levels.reverifyStale();
    assert.deepEqual(summary.levels, { checked: 1, ok: 0, hidden: 0, skipped: 1 });
    assert.equal(rig.L.byCode(code).status, 'published', 'kein Fehler des Servers darf ein Level verstecken');
    assert.equal(rig.L.byCode(code).simFp, 'alte-physik', 'der nächste Start versucht es erneut');
  });
});
