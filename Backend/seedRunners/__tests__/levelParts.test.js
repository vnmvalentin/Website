// Die reinen Bausteine der veröffentlichten Level: Share-Code, Wortfilter und Vorschau-Raster.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCode, isCode, normalizeCode, ALPHABET } = require('../shareCode');
const { findBlocked, checkLevelTexts } = require('../wordFilter');
const { buildPreview, MAX_W, MAX_H } = require('../levelPreview');
const { loadEngine } = require('../replay');

// ── Share-Code ──────────────────────────────────────────────────────────────

test('Share-Code: Form SR-XXX-XXX, nur eindeutige Zeichen, zufällig', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const c = generateCode();
    assert.match(c, /^SR-[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    assert.ok(isCode(c), c);
    assert.ok(!/[01ILO]/.test(c.slice(3)), `verwechselbares Zeichen in ${c}`);
    seen.add(c);
  }
  assert.ok(seen.size > 495, 'praktisch keine Doppelten');
  assert.equal(ALPHABET.length, 31);
  assert.equal(new Set(ALPHABET).size, 31);
});

test('Share-Code: deterministisch mit ersetzter Zufallsquelle, Randwerte', () => {
  assert.equal(generateCode(() => 0), 'SR-AAA-AAA');
  assert.equal(generateCode(() => ALPHABET.length - 1), 'SR-999-999');
  let i = 0;
  assert.equal(generateCode(() => i++), `SR-${ALPHABET.slice(0, 3)}-${ALPHABET.slice(3, 6)}`);
});

test('Share-Code: Eingaben werden großzügig gelesen, Unsinn wird abgelehnt', () => {
  for (const ok of ['SR-7K2-QX9', 'sr-7k2-qx9', ' sr 7k2 qx9 ', '7K2QX9', '7k2-qx9', 'SR7K2QX9']) assert.equal(normalizeCode(ok), 'SR-7K2-QX9', ok);
  for (const bad of ['', 'SR-7K2', 'SR-7K2-QX9-1', 'SR-0K2-QX9', 'SR-7K2-QXO', 'meinlevel', null, undefined, 42, {}]) assert.equal(normalizeCode(bad), null, String(bad));
  assert.equal(isCode('SR-7K2-QX9'), true);
  assert.equal(isCode('sr-7k2-qx9'), false, 'Normalform ist groß');
});

// ── Wortfilter ───────────────────────────────────────────────────────────────

test('Wortfilter: schwere Ausdrücke werden erkannt — auch mit Zahlen, Akzenten, Zeichen und Leerzeichen dazwischen', () => {
  for (const bad of ['Nigger', 'n1gg3r', 'N I G G E R', 'n.i.g.g.e.r', 'Hurensohn', 'HUR3NS0HN', 'Wichser Level', 'Sieg Heil', 'h1tl3r Run', 'Nazi Level', 'fick dich', 'f i c k', 'P0RN', 'Kanäke', 'Schwuchtel-Land']) {
    assert.ok(findBlocked(bad), `${bad} hätte blockiert werden müssen`);
  }
});

test('Wortfilter: harmlose Wörter, die Bruchstücke enthalten, kommen durch (kein Scunthorpe-Problem)', () => {
  for (const ok of ['Scunthorpe Run', 'Assassin', 'Klassiker', 'Hello World', 'Grand Prix', 'Sextant', 'Analyse', 'Pass auf', 'Bastard Mode', 'Speedrun 1337', 'Level 2', 'Über den Wolken', 'Fickle Fate', 'Nazione', 'Hurrikan', 'Kommissar', 'Mongolei', 'Negativ Ball']) {
    assert.equal(findBlocked(ok), null, ok);
  }
});

test('Wortfilter: Links in Namen, Beschreibungen und Tags sind nicht erlaubt', () => {
  for (const text of ['https://example.com', 'schau auf www.foo.de', 'geh zu discord.gg', 'meinkanal.tv', 'HTTP://X']) {
    assert.ok(checkLevelTexts({ name: 'Ok', description: text }).length > 0, text);
  }
  assert.deepEqual(checkLevelTexts({ name: 'Ein Level.', description: 'Version 1.2 — schwer. Viel Erfolg', tags: ['schwer', 'lang'] }), []);
});

test('Wortfilter: die Meldung nennt das Feld, nicht das Wort', () => {
  const errors = checkLevelTexts({ name: 'Nazi Level', description: 'http://x.de', tags: ['ok'] });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /^Der Levelname/);
  assert.match(errors[1], /^Die Beschreibung/);
  assert.ok(errors.every((e) => !/nazi/i.test(e)), 'das Wort selbst steht nicht in der Meldung');
  assert.match(checkLevelTexts({ name: 'Gut', tags: ['fick'] })[0], /^Die Tags/);
});

// ── Vorschau-Raster ────────────────────────────────────────────────────────

async function docWith(width, height, mutate) {
  const engine = await loadEngine();
  const doc = engine.emptyDoc({ width, height });
  mutate?.(doc, engine);
  const res = engine.validateDoc(doc, { smoke: false });
  assert.ok(res.ok, res.errors?.join(' | '));
  return res.doc;
}

test('Vorschau: ein kleines Level bleibt 1:1, Start und Ziel sind markiert', async () => {
  const doc = await docWith(40, 20);
  const p = buildPreview(doc);
  assert.deepEqual([p.w, p.h, p.scale], [40, 20, 1]);
  assert.equal(p.rows.length, 20);
  assert.ok(p.rows.every((r) => r.length === 40));
  assert.equal(p.rows[15][2], 'S');
  assert.equal(p.rows[15][37], 'E');
  assert.equal(p.rows[16], '#'.repeat(40), 'Boden');
  assert.equal(p.rows[0], '.'.repeat(40));
});

test('Vorschau: große Level werden auf höchstens 96 × 32 Zellen verkleinert, Markierungen überleben', async () => {
  for (const [w, h] of [[500, 60], [1200, 160], [96, 32], [97, 33], [120, 40]]) {
    const doc = await docWith(w, h);
    const p = buildPreview(doc);
    assert.ok(p.w <= MAX_W && p.h <= MAX_H, `${w}x${h} → ${p.w}x${p.h}`);
    assert.equal(p.rows.length, p.h);
    assert.ok(p.rows.every((r) => r.length === p.w));
    const all = p.rows.join('');
    assert.ok(all.includes('S') && all.includes('E'), 'Start und Ziel bleiben sichtbar');
    assert.ok(all.includes('#'));
  }
  assert.equal(buildPreview(await docWith(1200, 160)).scale, 13);
});

test('Vorschau: Gelände-Arten, Gefahren und Checkpoints kommen an', async () => {
  const doc = await docWith(40, 20, (d, engine) => {
    const put = (x, y, ch) => { d.tiles[y] = d.tiles[y].slice(0, x) + ch + d.tiles[y].slice(x + 1); };
    put(10, 12, 'I'); put(11, 12, 'W'); put(12, 12, '>'); put(13, 12, '<'); put(14, 12, '=');
    put(20, 15, 'C');
    d.elements.push({ type: 'spike', tx: 25, ty: 15 }, { type: 'saw', tx: 28, ty: 8 }, { type: 'key', tx: 30, ty: 8 });
    return engine;
  });
  const rows = buildPreview(doc).rows;
  assert.equal(rows[12].slice(10, 15), 'IW><=');
  assert.equal(rows[15][20], 'C');
  assert.equal(rows[15][25], 'h', 'Spikes');
  assert.equal(rows[8][28], 'h', 'Säge');
  assert.equal(rows[8][30], '.', 'ein Schlüssel ist keine Gefahr');
});

test('Vorschau: in einem verkleinerten Level entscheidet mindestens die Hälfte; Größe bleibt klein', async () => {
  const doc = await docWith(200, 40, (d) => {
    // Skala 3: jede Zelle ist 3 × 3 Kacheln. Zelle (0,0): eine feste Kachel; Zelle (1,0): fünf von neun; Zelle (2,0): vier von neun
    const put = (x, y) => { d.tiles[y] = d.tiles[y].slice(0, x) + '#' + d.tiles[y].slice(x + 1); };
    put(0, 0);
    for (const [x, y] of [[3, 0], [4, 0], [3, 1], [4, 1], [5, 1]]) put(x, y);
    for (const [x, y] of [[6, 0], [7, 0], [6, 1], [7, 1]]) put(x, y);
  });
  const p = buildPreview(doc);
  assert.equal(p.scale, 3);
  assert.equal(p.rows[0][0], '.', 'eine von neun Kacheln: Luft');
  assert.equal(p.rows[0][1], '#', 'fünf von neun: Block');
  assert.equal(p.rows[0][2], '.', 'vier von neun: noch Luft');
  assert.ok(JSON.stringify(p).length < 4000, 'bleibt unter 4 KB');
});
