// Level-Vorrat (levelVorrat.js): Güte-Schwelle, Auffüllen, Vergeben, Ausliefern, Tages-Level, HTTP-Schnittstelle —
// mit einem gestellten Bau (schnell), dazu EIN echter Bau im Worker-Thread (vorratWorker.js) samt Vergleich mit dem
// direkt gebauten Level. Die Datenbank liegt in einem Wegwerf-Ordner.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const http = require('http');
const express = require('express');
const { createStore } = require('../store');
const { createVerifier } = require('../verifier');
const { createLevelVorrat, bewerte, GUETE, GUETE_LAUF } = require('../levelVorrat');
const { createSeedRunnersRouter } = require('../routes');
const { createRoomManager } = require('../roomManager');
const { PFAD_GEN_VERSION } = require('../genVersion');
const { loadEngine } = require('../replay');

const GUT = { zuege: 90, schlicht: 45, folge: 8, arten: 13, extrem: false };

/** Vorrat mit gestelltem Bau: `plan(seed)` liefert die Kennzahlen (oder einen Fehler-Status) je Seed */
function rig({ plan = () => GUT, config = {}, heute = '2026-11-14' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-vorrat-'));
  const store = createStore(path.join(dir, 'test.db'));
  let t = 1_000_000;
  let n = 0;
  const gebaut = [];
  const tag = { heute };
  const vorrat = createLevelVorrat({
    db: store.db,
    gv: PFAD_GEN_VERSION,
    heute: () => tag.heute,
    now: () => t,
    zufallsSeed: () => `s${++n}`,
    config: { ZIEL: 3, PAUSE_MS: 0, ...config },
    baue: async (params) => {
      gebaut.push(params.seed);
      const k = plan(params.seed);
      if (k && k.status) return k;
      return { status: 'ok', json: JSON.stringify({ seed: params.seed, rows: ['S.E'] }), hash: 'abcd1234', kennzahlen: k };
    },
  });
  return {
    vorrat, store, gebaut, tag,
    vor: (ms) => { t += ms; },
    cleanup: () => { vorrat.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

const entpackt = (z) => JSON.parse(zlib.gunzipSync(z).toString('utf8'));

test('Güte-Schwelle: abwechslungsreiche Level bestehen, eintönige nicht', () => {
  assert.equal(bewerte(GUT).ok, true);
  assert.equal(bewerte({ ...GUT, schlicht: Math.ceil(90 * GUETE.schlichtMax) + 1 }).ok, false);
  assert.equal(bewerte({ ...GUT, folge: GUETE.folgeMax + 1 }).ok, false);
  assert.equal(bewerte({ ...GUT, arten: GUETE.artenMin - 1 }).ok, false);
  assert.equal(bewerte({ ...GUT, zuege: GUETE.zuegeMin - 1, schlicht: 10 }).ok, false);
  // Ein Extrem-Level trägt absichtlich nur wenige Aufgaben — aber auch es darf nicht aus schlichten Sprüngen bestehen
  assert.equal(bewerte({ ...GUT, arten: 2, extrem: true }).ok, true);
  assert.equal(bewerte({ ...GUT, arten: 2, extrem: true, schlicht: 80 }).ok, false);
  assert.equal(bewerte(null).ok, false);
  assert.equal(bewerte({}).ok, false);
});

test('Güte-Schwelle der Lauflinie (ab gv 5): fängt nur Ausreißer', () => {
  const LAUF = { welt: 'lauf', zuege: 55, schlicht: 7, folge: 1, arten: 13, strecken: 12, geplant: 12, kettenlauf: true };
  assert.equal(bewerte(LAUF).ok, true);
  // (die Pfad-Schwelle verlangte 80 Züge — ein Lauf-Level hat ~55 Schritte und besteht trotzdem)
  assert.ok(LAUF.zuege < GUETE.zuegeMin);
  assert.equal(bewerte({ ...LAUF, kettenlauf: false }).grund, 'Kettenlauf gescheitert');
  assert.equal(bewerte({ ...LAUF, strecken: 12 - GUETE_LAUF.streckenFehlMax }).ok, true);
  assert.equal(bewerte({ ...LAUF, strecken: 12 - GUETE_LAUF.streckenFehlMax - 1 }).grund, 'zu kurz');
  assert.equal(bewerte({ ...LAUF, schlicht: Math.ceil(55 * GUETE_LAUF.schlichtMax) + 1 }).ok, false);
  assert.equal(bewerte({ ...LAUF, folge: GUETE_LAUF.folgeMax + 1 }).ok, false);
  assert.equal(bewerte({ ...LAUF, arten: GUETE_LAUF.artenMin - 1 }).ok, false);
});

test('Auffüllen: baut bis zum Ziel, verwirft eintönige Level, vergibt jedes nur einmal', async () => {
  // Jeder zweite Kandidat ist eintönig
  const r = rig({ plan: (seed) => (Number(seed.slice(1)) % 2 === 0 ? { ...GUT, schlicht: 70 } : GUT) });
  try {
    assert.equal(r.vorrat.nimm(), null, 'leerer Vorrat gibt nichts her');
    await r.vorrat.auffuellen();
    const stand = r.vorrat.stand();
    assert.equal(stand.frei, 3);
    assert.equal(stand.aufgenommen, 3);
    assert.equal(stand.verworfen, 2);
    assert.deepEqual(r.gebaut, ['s1', 's2', 's3', 's4', 's5']);

    // Freie Level werden nicht ausgeliefert — erst nach der Vergabe
    assert.equal(r.vorrat.hole({ seed: 's1', biome: 'random', gv: PFAD_GEN_VERSION }), null);
    const seed = r.vorrat.nimm();
    assert.equal(seed, 's1', 'das älteste zuerst');
    assert.equal(entpackt(r.vorrat.hole({ seed, biome: 'random', gv: PFAD_GEN_VERSION })).seed, 's1');
    assert.equal(r.vorrat.hole({ seed: 's2', biome: 'random', gv: PFAD_GEN_VERSION }), null, 'das verworfene liegt nicht im Vorrat');

    const zweiter = r.vorrat.nimm();
    assert.equal(zweiter, 's3');
    assert.notEqual(zweiter, seed);
    // Ein festes Biom bedient der Vorrat nicht
    assert.equal(r.vorrat.nimm('ice'), null);
    // Falsche Version, falsches Biom, kaputte Eingaben: nichts
    assert.equal(r.vorrat.hole({ seed, biome: 'random', gv: PFAD_GEN_VERSION - 1 }), null);
    assert.equal(r.vorrat.hole({ seed, biome: 'ice', gv: PFAD_GEN_VERSION }), null);
    assert.equal(r.vorrat.hole({ seed: "s1' OR 1=1", biome: 'random', gv: PFAD_GEN_VERSION }), null);
    assert.equal(r.vorrat.hole({ seed, biome: 'random', gv: NaN }), null);
  } finally {
    r.cleanup();
  }
});

test('Nach der Vergabe füllt sich der Vorrat von selbst wieder auf', async () => {
  const r = rig();
  try {
    await r.vorrat.auffuellen();
    assert.equal(r.vorrat.stand().frei, 3);
    r.vorrat.nimm();
    // nimm() stößt das Auffüllen an (läuft asynchron)
    await new Promise((res) => setTimeout(res, 20));
    assert.equal(r.vorrat.stand().frei, 3);
    assert.equal(r.gebaut.length, 4);
  } finally {
    r.cleanup();
  }
});

test('Fehler beim Bauen: Auffüllen pausiert, statt endlos zu rechnen', async () => {
  const r = rig({ plan: () => ({ status: 'error', reason: 'kaputt' }), config: { FEHLER_FOLGE_MAX: 3 } });
  try {
    await r.vorrat.auffuellen();
    assert.equal(r.gebaut.length, 3, 'nach drei Fehlschlägen ist Pause');
    assert.equal(r.vorrat.stand().frei, 0);
    await r.vorrat.auffuellen();
    assert.equal(r.gebaut.length, 3, 'in der Pause wird nicht gebaut');
    r.vor(11 * 60 * 1000);
    await r.vorrat.auffuellen();
    assert.equal(r.gebaut.length, 6, 'danach geht es weiter');
  } finally {
    r.cleanup();
  }
});

test('Vorrat aus (Ziel 0): baut nichts, vergibt nichts', async () => {
  const r = rig({ config: { ZIEL: 0 } });
  try {
    await r.vorrat.auffuellen();
    assert.equal(r.gebaut.length, 0);
    assert.equal(r.vorrat.nimm(), null);
    assert.equal(await r.vorrat.tagVorbauen({ seed: 'daily-2026-11-14', biome: 'random', gen: 'pfad', gv: PFAD_GEN_VERSION }), false);
  } finally {
    r.cleanup();
  }
});

test('Tages-Level: ohne Güte-Schwelle, nur einmal gebaut, erst ab seinem Tag abrufbar', async () => {
  // (eintönig — das Tages-Level kommt trotzdem hinein: Sein Seed steht fest)
  const r = rig({ plan: () => ({ ...GUT, schlicht: 80 }) });
  try {
    const heute = { seed: 'daily-2026-11-14', biome: 'random', gen: 'pfad', gv: PFAD_GEN_VERSION };
    const morgen = { ...heute, seed: 'daily-2026-11-15' };
    assert.equal(await r.vorrat.tagVorbauen(heute), true);
    assert.equal(await r.vorrat.tagVorbauen(heute), true);
    assert.equal(await r.vorrat.tagVorbauen(morgen), true);
    assert.deepEqual(r.gebaut, ['daily-2026-11-14', 'daily-2026-11-15']);
    assert.ok(r.vorrat.hole(heute));
    assert.equal(r.vorrat.hole(morgen), null, 'das Level von morgen gibt es erst morgen');
    r.tag.heute = '2026-11-15';
    assert.ok(r.vorrat.hole(morgen));
    // Kein Tages-Level: andere Version, kein Pfad, kein Tages-Seed
    assert.equal(await r.vorrat.tagVorbauen({ ...heute, gv: PFAD_GEN_VERSION - 1 }), false);
    assert.equal(await r.vorrat.tagVorbauen({ seed: 'daily-2026-11-14', length: 'medium', speedClass: 'normal', biome: 'random' }), false);
    assert.equal(await r.vorrat.tagVorbauen({ ...heute, seed: 'irgendwas' }), false);
    // Tages-Level zählen nicht als freie Zufallslevel
    assert.equal(r.vorrat.nimm(), null);
  } finally {
    r.cleanup();
  }
});

test('Der Raum nimmt den Seed einer Zufallsrunde aus dem Vorrat', async () => {
  const r = rig();
  try {
    await r.vorrat.auffuellen();
    const mgr = createRoomManager({ randomSeed: (biome) => r.vorrat.nimm(biome) || 'gewuerfelt', setTimer: () => 0, clearTimer: () => {} });
    const erstellt = mgr.create({ id: 'sock1' }, { name: 'Anna', token: 'token-1-abcdefgh' });
    assert.ok(erstellt.ok, JSON.stringify(erstellt));
    const res = mgr.start({ id: 'sock1' }, {});
    assert.ok(res.ok, JSON.stringify(res));
    assert.equal(r.vorrat.stand().vergeben, 1);
    assert.ok(r.vorrat.hole({ seed: 's1', biome: 'random', gv: PFAD_GEN_VERSION }), 'das Level der Runde ist jetzt abrufbar');
  } finally {
    r.cleanup();
  }
});

test('HTTP: GET /vorrat/level liefert das Level (gzip), sonst 404; nie einen Bau auf Zuruf', async () => {
  const r = rig();
  const app = express();
  app.use('/api/seed-runners', createSeedRunnersRouter({ daily: {}, todayKey: () => '2026-11-14', vorrat: r.vorrat }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/seed-runners/vorrat/level`;
  try {
    await r.vorrat.auffuellen();
    const gebautVorher = r.gebaut.length;
    const seed = r.vorrat.nimm();

    const ok = await fetch(`${base}?seed=${seed}&biome=random&gv=${PFAD_GEN_VERSION}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-encoding'), 'gzip');
    assert.match(ok.headers.get('cache-control'), /immutable/);
    assert.equal((await ok.json()).seed, seed);

    // Ohne gzip-Fähigkeit: unkomprimiert
    const roh = await new Promise((resolve, reject) => {
      http.get(`${base}?seed=${seed}&biome=random&gv=${PFAD_GEN_VERSION}`, { headers: { 'accept-encoding': 'identity' } }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, enc: res.headers['content-encoding'], text }));
      }).on('error', reject);
    });
    assert.equal(roh.status, 200);
    assert.equal(roh.enc, undefined);
    assert.equal(JSON.parse(roh.text).seed, seed);

    for (const q of ['seed=unbekannt&biome=random&gv=' + PFAD_GEN_VERSION, 'seed=' + seed + '&biome=random&gv=abc', '', 'seed=s2&biome=random&gv=' + PFAD_GEN_VERSION]) {
      const fehlt = await fetch(`${base}?${q}`);
      assert.equal(fehlt.status, 404, q);
      assert.equal(fehlt.headers.get('cache-control'), 'no-store');
    }
    await new Promise((res) => setTimeout(res, 20));
    assert.equal(r.gebaut.length, gebautVorher + 1, 'nur das Nachfüllen nach nimm() — keine Anfrage hat einen Bau ausgelöst');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    r.cleanup();
  }
});

test('HTTP: ohne Vorrat antwortet die Schnittstelle mit 404', async () => {
  const app = express();
  app.use('/api/seed-runners', createSeedRunnersRouter({ daily: {}, todayKey: () => '2026-11-14' }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/seed-runners/vorrat/level?seed=a&biome=random&gv=${PFAD_GEN_VERSION}`);
    assert.equal(res.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Echter Bau im Worker: dasselbe Level wie direkt gebaut, mit Kennzahlen', async () => {
  const engine = await loadEngine();
  // (ein schneller Seed: ~3 s)
  const params = { seed: 'audit-20', length: 'long', speedClass: 'super', biome: 'random', gen: 'pfad', gv: PFAD_GEN_VERSION };
  const bauer = createVerifier({ workerFile: path.join(__dirname, '..', 'vorratWorker.js'), timeoutMs: 120000 });
  try {
    const res = await bauer.verify(params);
    assert.equal(res.status, 'ok', res.reason);
    const direkt = engine.levelFuerParams(params);
    assert.equal(res.hash, direkt.hash);
    // Über JSON verschickt ist es dasselbe Level wie im Browser gebaut (dort geht es über structuredClone)
    assert.deepEqual(JSON.parse(res.json), JSON.parse(JSON.stringify(direkt)));
    // …und JSON verliert nichts, was die Sim braucht: dieselbe Welt, dieselben Elemente
    const a = engine.createLevelWorld(JSON.parse(res.json));
    const b = engine.createLevelWorld(direkt);
    assert.equal(a.elements.length, b.elements.length);
    assert.deepEqual(a.spawns, b.spawns);

    // Ab gv 5 baut der Vorrat die Lauflinie: Kennzahlen an den Schritten der Strecken (vorratWorker.js kennzahlenLauf)
    const k = res.kennzahlen;
    assert.equal(k.welt, 'lauf');
    assert.ok(k.zuege >= 30, `Schritte ${k.zuege}`);
    assert.ok(k.schlicht >= 0 && k.schlicht < k.zuege, `schlichte Schritte ${k.schlicht}`);
    assert.ok(k.folge <= k.schlicht);
    assert.ok(k.arten >= 5, `Zug-Arten ${k.arten}`);
    assert.ok(k.strecken >= 10 && k.geplant === 12, `Strecken ${k.strecken}/${k.geplant}`);
    assert.equal(k.kettenlauf, true);
    assert.equal(k.autor, 'lauflinie');
    assert.match(String(k.leitidee), /^lauf-(strom|hoch|runter)$/);
    assert.equal(bewerte(k).ok, true, JSON.stringify(bewerte(k)));

    // Eine andere Generator-Version baut der Vorrat nicht
    const alt = await bauer.verify({ ...params, gv: PFAD_GEN_VERSION - 1 });
    assert.equal(alt.status, 'error');
  } finally {
    await bauer.close();
  }
});
