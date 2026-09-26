// Tests der Ideen-Räume (motive/ideenraeume.js) und der beiden Kernideen, die über sie wirken
// („Schlüsselkette", „Zwei Wege, eine Wahl").
//
// Die Lösbarkeit selbst wird NICHT hier bewiesen — das braucht den echten Solver im Fenster, bei der
// Gabelung jeder Weg einzeln mit dem anderen zugemauert (Zahlen in PLANUNG_WELTTYPEN.md, Abschnitt 12).
// Diese Tests sichern die Form ab, auf die sich jene Beweise verlassen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { IDEEN_RAEUME, IDEEN_RAUM_BY_ID, PLATTE_H } from '../motive/ideenraeume.js';
import { naechsterRaum, BODEN, RAUM_BY_ID } from '../motive/hoehlenraeume.js';
import { wendeGewichteMotive } from '../ideen/vertrag.js';
import { IDEEN } from '../ideen/registry.js';
import { createRng } from '../../../sim/rng.js';
import { reachForClass } from '../../../sim/reach.js';
import { SAFETY } from '../../generator.js';
import { generateWorld } from '../generate.js';
import { createWorld, stepWorld } from '../../../sim/world.js';
import { parseMap } from '../../../sim/tilemap.js';
import { classTuning } from '../../../sim/classes.js';
import { INPUT } from '../../../sim/inputBits.js';
import { TILE, PLAYER_W } from '../../../sim/config.js';

const F = BODEN;
function limitsFuer(cls, d) {
  const reach = reachForClass(cls);
  const safety = SAFETY[d];
  return { maxGap: Math.floor(reach.gap.jump * safety), maxGapUp: Math.floor(reach.gap.double * safety), maxUp: Math.floor(reach.height.double * safety), maxDown: 30 };
}
const ctxFuer = (seed, cls, d, extra = {}) => ({
  rng: createRng(seed, 'x'), limits: limitsFuer(cls, d), d, fortschritt: 0.5, tier: 'normal',
  wandle: (spec) => spec, erlaubt: () => true, ...extra,
});
/** Baut einen Raum mit fest vorgegebener Variante (ohne das Modul dauerhaft zu verändern) */
function baueVariante(id, variante, ctx) {
  const m = IDEEN_RAUM_BY_ID[id];
  return m.baue.call({ ...m, variante: () => variante }, ctx);
}

const VARIANTEN = { schluesselkammer: ['ablage', 'rueckweg', 'kette', 'portal'], gabelung: ['platte', 'schlucht'] };

test('Jede Variante baut für jede Schwierigkeit und Tempo-Klasse — flach, rechteckig, höchstens 56 breit', () => {
  const fails = [];
  for (const [id, varianten] of Object.entries(VARIANTEN)) {
    for (const v of varianten) {
      for (let d = 1; d <= 5; d++) {
        for (const cls of ['normal', 'fast', 'super']) {
          for (let i = 0; i < 6; i++) {
            try {
              const inst = baueVariante(id, v, ctxFuer(`b-${id}-${v}-${d}-${cls}-${i}`, cls, d));
              if (inst.entry !== inst.exit) fails.push(`${v}: nicht flach`);
              if (inst.w > 56) fails.push(`${v}: ${inst.w} breit (Parcours rechnet mit höchstens 56)`);
              if (inst.rows.length !== inst.h || inst.rows.some((r) => r.length !== inst.w)) fails.push(`${v}: Raster nicht rechteckig`);
              if (inst.tpl.variante !== v) fails.push(`${v}: tpl.variante ist ${inst.tpl.variante}`);
            } catch (e) { fails.push(`${id}/${v} d${d} ${cls} #${i}: ${e.message}`); }
          }
        }
      }
    }
  }
  assert.deepEqual(fails, []);
});

// Wer die Tür vor dem Schlüssel erreicht, steckt fest — und ein Schlüssel zu wenig heißt: unlösbar.
test('Schlüsselkammer: genauso viele Schlüssel wie Türen, jeder Schlüssel liegt vor „seiner" Tür', () => {
  for (const v of VARIANTEN.schluesselkammer) {
    for (let i = 0; i < 20; i++) {
      const inst = baueVariante('schluesselkammer', v, ctxFuer(`k-${v}-${i}`, 'super', 1 + (i % 5)));
      const schluessel = [];
      const tueren = new Set();
      inst.rows.forEach((r) => r.forEach((ch, x) => { if (ch === 'K') schluessel.push(x); if (ch === 'Y') tueren.add(x); }));
      const tuerSpalten = [...tueren].sort((a, b) => a - b);
      assert.equal(schluessel.length, tuerSpalten.length, `${v}#${i}: ${schluessel.length} Schlüssel, ${tuerSpalten.length} Türen`);
      schluessel.sort((a, b) => a - b).forEach((x, k) => {
        assert.ok(x < tuerSpalten[k], `${v}#${i}: Schlüssel ${k + 1} (Spalte ${x}) liegt nicht vor Tür ${k + 1} (Spalte ${tuerSpalten[k]})`);
        if (k > 0) assert.ok(x > tuerSpalten[k - 1], `${v}#${i}: Schlüssel ${k + 1} liegt nicht HINTER Tür ${k} — die Kette wäre keine`);
      });
    }
  }
});

// Über Fels könnte man die Tür per Wandsprung überklettern; an Eis gibt es keinen Wandsprung.
test('Schlüsselkammer: über jeder Tür steht bis zur Oberkante Eis, nie Luft oder Fels', () => {
  for (const v of VARIANTEN.schluesselkammer) {
    const inst = baueVariante('schluesselkammer', v, ctxFuer(`w-${v}`, 'super', 3));
    for (let x = 0; x < inst.w; x++) {
      if (inst.rows[F - 1][x] !== 'Y') continue;
      for (let y = 0; y < F; y++) assert.ok(inst.rows[y][x] === 'Y' || inst.rows[y][x] === 'I', `${v}: Spalte ${x}, Zeile ${y} ist "${inst.rows[y][x]}"`);
    }
  }
});

test('Schlüsselkammer: Portale nur, wenn der Welttyp sie erlaubt', () => {
  const m = IDEEN_RAUM_BY_ID.schluesselkammer;
  for (let i = 0; i < 60; i++) {
    const ctx = ctxFuer(`p-${i}`, 'super', 3, { fortschritt: 0.9, erlaubt: (art) => art !== 'portal' });
    const inst = m.baue(ctx);
    assert.notEqual(inst.tpl.variante, 'portal');
    assert.ok(!inst.entities.some((e) => e.type === 'portal'));
  }
});

test('Schlüsselkammer: der Bogen — früh die Ablage, spät die Kette', () => {
  const m = IDEEN_RAUM_BY_ID.schluesselkammer;
  const ohnePortal = { erlaubt: (art) => art !== 'portal' };
  assert.equal(m.baue(ctxFuer('bogen-1', 'super', 3, { fortschritt: 0, ...ohnePortal })).tpl.variante, 'ablage');
  assert.equal(m.baue(ctxFuer('bogen-2', 'super', 3, { fortschritt: 1, ...ohnePortal })).tpl.variante, 'kette');
});

// Die Beweis-Läufe mauern je einen Weg zu und verlassen sich dabei auf genau diese Form.
test('Gabelung „platte": Platte, Serpentine und Einwegdeckel liegen, wo die Beweis-Läufe sie erwarten', () => {
  for (let i = 0; i < 20; i++) {
    const inst = baueVariante('gabelung', 'platte', ctxFuer(`pl-${i}`, i % 2 ? 'super' : 'normal', 1 + (i % 5)));
    const { a, b, schacht, luecken } = inst.tpl.info;
    const inLuecke = (x) => luecken.some((l) => x >= l.x && x < l.x + l.w);
    for (let x = a; x < b; x++) if (!inLuecke(x)) assert.equal(inst.rows[F - PLATTE_H][x], '#', `Platte fehlt bei Spalte ${x}`);
    for (let x = schacht; x < schacht + 4; x++) assert.equal(inst.rows[F][x], '=', `Einwegdeckel fehlt bei Spalte ${x}`);
    for (let y = F - PLATTE_H + 2; y < F; y++) assert.equal(inst.rows[y][b - 1], '#', 'der Gang unter der Platte muss enden (sonst keine Serpentine)');
  }
});

test('Gabelung „schlucht": tiefer als jeder Doppelsprung, rechte Wand Eis, genau ein Aufzug hinaus', () => {
  for (let i = 0; i < 20; i++) {
    const inst = baueVariante('gabelung', 'schlucht', ctxFuer(`sc-${i}`, 'super', 1 + (i % 5)));
    const { x0, span, tief } = inst.tpl.info;
    assert.ok(tief > reachForClass('super').height.double, 'Schlucht nicht tiefer als ein Doppelsprung');
    for (let y = F + 1; y < F + tief; y++) assert.equal(inst.rows[y][x0 + span], 'I');
    const aufzuege = inst.entities.filter((e) => e.type === 'mover');
    assert.equal(aufzuege.length, 1);
    assert.equal(aufzuege[0].ly + aufzuege[0].path[1][1], F, 'Aufzug endet nicht bündig mit dem Boden');
    // Kein Bröckelstück in den Spalten des Aufzugs
    const lift = new Set([aufzuege[0].lx, aufzuege[0].lx + 1]);
    assert.ok(!inst.entities.some((e) => e.type === 'crumble' && lift.has(e.lx)), 'Bröckelstück im Aufzugsschacht');
  }
});

test('Optionale Gefahren respektieren erlaubt() — verboten heißt wirklich keine', () => {
  for (const [id, varianten] of Object.entries(VARIANTEN)) {
    for (const v of varianten) {
      for (let i = 0; i < 10; i++) {
        const inst = baueVariante(id, v, ctxFuer(`g-${v}-${i}`, 'super', 5, { erlaubt: () => false }));
        const gefahren = inst.entities.filter((e) => ['spike', 'saw', 'laser'].includes(e.type));
        assert.deepEqual(gefahren, [], `${v}: Gefahr trotz erlaubt() === false`);
      }
    }
  }
});

// ── Kernidee-Haken ───────────────────────────────────────────────────────────

test('wendeGewichteMotive: ohne Idee oder bei unbrauchbarer Antwort unverändert', () => {
  assert.deepEqual(wendeGewichteMotive(null, ['a'], [1], {}), [1]);
  assert.deepEqual(wendeGewichteMotive({ gewichteMotive: () => [NaN] }, ['a'], [1], {}), [1]);
  assert.deepEqual(wendeGewichteMotive({ gewichteMotive: () => [1, 2] }, ['a'], [1], {}), [1]);
});

test('naechsterRaum: Gewicht 0 vom Haken schließt ein Motiv wirklich aus', () => {
  const ctx = ctxFuer('null-gewicht', 'super', 3, { gewichte: (ids, g) => g.map((w, i) => (ids[i] === 'gabelung' ? w : 0)) });
  for (let i = 0; i < 10; i++) assert.equal(naechsterRaum(ctx, null, IDEEN_RAEUME).tpl.id, 'gabelung');
  const keiner = ctxFuer('kein-gewicht', 'super', 3, { gewichte: (ids, g) => g.map(() => 0) });
  assert.equal(naechsterRaum(keiner, null, IDEEN_RAEUME), null);
});

// Eine Kernidee steht über dem Level — sie muss darin dann auch vorkommen.
test('Schlüsselkette/Zwei Wege: mittlere und lange Level enthalten ihren Raum, ohne Idee (Parcours) nie', () => {
  const MOTIV = { schluesselkette: 'schluesselkammer', zweiWege: 'gabelung' };
  const fails = [];
  for (const kernidee of Object.keys(MOTIV)) {
    for (const worldType of IDEEN[kernidee].kompatibel) {
      for (const length of ['medium', 'long']) {
        for (const difficulty of [1, 3, 5]) {
          for (let i = 0; i < 3; i++) {
            const lv = generateWorld({ seed: `iv-${i}`, length, difficulty, worldType, kernidee });
            if (!lv.meta.bausteine.some((b) => b.id === MOTIV[kernidee])) fails.push(`${kernidee}/${worldType}/${length}/S${difficulty}/${i}`);
          }
        }
      }
    }
  }
  assert.deepEqual(fails, []);
  for (let i = 0; i < 6; i++) {
    const lv = generateWorld({ seed: `ohne-${i}`, length: 'long', worldType: 'parcours', kernidee: null });
    assert.ok(!lv.meta.bausteine.some((b) => b.id === 'schluesselkammer' || b.id === 'gabelung'), 'Parcours ohne Idee bekam einen Ideen-Raum');
  }
});

test('Höhlen verbieten Portale — auch die Schlüsselkammer bringt dort keine mit', () => {
  for (let i = 0; i < 8; i++) {
    const lv = generateWorld({ seed: `hp-${i}`, length: 'long', difficulty: 4, worldType: 'hoehlen', kernidee: 'schluesselkette' });
    assert.ok(!lv.entities.some((e) => e.type === 'portal'), `hp-${i}: Portal in einer Höhle`);
  }
});

// ── Menschentauglichkeit der Bröckel-Stellen ─────────────────────────────────
//
// Der Solver beweist nur, dass es IRGENDEINEN Weg gibt. Hier spielt ein Bot den gedachten Weg wie ein Mensch:
// rechts halten, an jeder Absprungkante mit 2–18 Ticks (17–150 ms) Verzögerung springen, Sprung gehalten.
// Gefunden hat er zwei echte Fehler (PLANUNG_WELTTYPEN.md, Abschnitt 13): 2 Kacheln breite Bröckelstücke, die ein
// voller Sprung überspringt, und einen Sprung-Schlüssel, den man bei schnellem Tempo immer verfehlte.

/** Raum im Fenster (Boden links/rechts), Start in Raumspalte `startX` */
function fensterWelt(inst, cls, startX) {
  const L = 12;
  const TOP = 12;
  const W = L + inst.w + 14;
  const g = Array.from({ length: TOP + inst.h + 2 }, () => Array(W).fill('.'));
  for (let y = TOP + F; y < g.length; y++) { for (let x = 0; x < L; x++) g[y][x] = '#'; for (let x = L + inst.w; x < W; x++) g[y][x] = '#'; }
  for (let y = 0; y < inst.h; y++) for (let x = 0; x < inst.w; x++) g[TOP + y][L + x] = inst.rows[y][x];
  g[TOP + F - 1][L + startX] = 'S';
  for (let i = 0; i < 3; i++) g[TOP + F - 1][L + inst.w + 6 + i] = 'E';
  const entities = inst.entities.map(({ lx, ly, ...s }) => ({ ...s, tx: L + lx, ty: TOP + ly }));
  return { w: createWorld(parseMap(g.map((r) => r.join('')), { entities }), { tuning: classTuning(cls) }), px: (x) => (L + x) * TILE };
}

function menschenBot(w, kanten, verzoegerung) {
  let zaehl = -1;
  let halten = 0;
  const genutzt = new Set();
  for (let t = 0; t < 3000 && !w.finished && w.deaths === 0; t++) {
    const p = w.player;
    let m = INPUT.RIGHT;
    if (halten > 0) { halten--; m |= INPUT.JUMP; } else if (zaehl >= 0) { if (--zaehl < 0) { halten = 30; m |= INPUT.JUMP; } } else {
      const k = kanten.find((kx) => !genutzt.has(kx) && p.x + PLAYER_W >= kx - 1.5 * TILE && p.x < kx);
      if (k !== undefined && p.onGround) { genutzt.add(k); zaehl = verzoegerung; }
    }
    stepWorld(w, m);
  }
  return w;
}

test('Menschen-Bot: Bröckelpfad der Schlucht (oberer Weg) mit 17–150 ms Reaktionszeit, alle Stufen und Tempi', () => {
  const fails = [];
  for (const cls of ['normal', 'fast', 'super']) for (let d = 1; d <= 5; d++) for (let i = 0; i < 2; i++) {
    const inst = baueVariante('gabelung', 'schlucht', ctxFuer(`mb-s-${cls}-${d}-${i}`, cls, d));
    const { x0, span, tief } = inst.tpl.info;
    for (let x = x0; x < x0 + span; x++) inst.entities.push({ type: 'spike', lx: x, ly: F + tief - 1 });   // Fall = Tod: nur der obere Weg zählt
    const pfad = new Set(inst.entities.filter((e) => e.type === 'crumble').map((e) => e.lx));
    const kanten = [...pfad].filter((x) => !pfad.has(x + 1)).map((x) => x + 1);
    for (const v of [2, 6, 12, 18]) {
      const { w, px } = fensterWelt(inst, cls, 2);
      menschenBot(w, kanten.map(px), v);
      if (!w.finished || w.deaths) fails.push(`${cls}/S${d}/#${i}/v${v}: ${w.deathReason || 'nicht im Ziel'}`);
    }
  }
  assert.deepEqual(fails, []);
});

test('Menschen-Bot: Schlüssel 2 auf dem Bröckelpfad der Kette, alle Stufen und Tempi', () => {
  const fails = [];
  for (const cls of ['normal', 'fast', 'super']) for (let d = 1; d <= 5; d++) for (let i = 0; i < 2; i++) {
    const inst = baueVariante('schluesselkammer', 'kette', ctxFuer(`mb-k-${cls}-${d}-${i}`, cls, d));
    // Start hinter Tür 1: Tür 1 und Schlüssel 1 entfernen (die Ablage ist nicht Gegenstand dieses Tests)
    const t1 = Math.min(...inst.rows.flatMap((r) => r.map((c, x) => (c === 'Y' ? x : Infinity))));
    for (let y = 0; y < F; y++) inst.rows[y][t1] = '.';
    inst.rows.forEach((r) => r.forEach((c, x) => { if (c === 'K' && x < t1) r[x] = '.'; }));
    for (const v of [2, 18]) {
      const { w } = fensterWelt(inst, cls, t1 + 2);
      menschenBot(w, [], v);
      if (!w.finished || w.deaths) fails.push(`${cls}/S${d}/#${i}/v${v}: ${w.deathReason || 'nicht im Ziel'}`);
    }
  }
  assert.deepEqual(fails, []);
});

test('Menschen-Bot: Federkette — nur rechts halten trägt von Feder zu Feder ins Ziel, alle Stufen und Tempi', () => {
  const fails = [];
  for (const cls of ['normal', 'fast', 'super']) for (let d = 1; d <= 5; d++) for (let i = 0; i < 3; i++) {
    const inst = IDEEN_RAUM_BY_ID.federkette.baue(ctxFuer(`mb-f-${cls}-${d}-${i}`, cls, d, { reach: reachForClass(cls) }));
    const { w } = fensterWelt(inst, cls, 2);
    for (let t = 0; t < 3000 && !w.finished && w.deaths === 0; t++) stepWorld(w, INPUT.RIGHT);
    if (!w.finished || w.deaths) fails.push(`${cls}/S${d}/#${i}: ${w.deathReason || 'nicht im Ziel'}`);
  }
  assert.deepEqual(fails, []);
});

test('Federkette: ohne Stacheln wird sie nicht gewählt (sonst säße man in der Grube fest)', () => {
  const ctx = ctxFuer('ohne-stachel', 'super', 3, { reach: reachForClass('super'), erlaubt: (art) => art !== 'spike' });
  for (let i = 0; i < 10; i++) assert.notEqual(naechsterRaum(ctx, null, IDEEN_RAEUME)?.tpl.id, 'federkette');
});

test('Menschen-Bot: Bröckelschlucht (Höhlen-Raum) mit vollem Sprung und 17–150 ms Reaktionszeit, alle Stufen und Tempi', () => {
  const fails = [];
  for (const cls of ['normal', 'fast', 'super']) for (let d = 1; d <= 5; d++) for (let i = 0; i < 2; i++) {
    const inst = RAUM_BY_ID.broeckelschlucht.baue(ctxFuer(`mb-b-${cls}-${d}-${i}`, cls, d, { reach: reachForClass(cls) }));
    const pfad = new Set(inst.entities.filter((e) => e.type === 'crumble').map((e) => e.lx));
    let x0 = Math.min(...pfad) - 1;
    while (inst.rows[F][x0 - 1] !== '#') x0--;                 // Kante vor dem Abgrund
    const kanten = [x0, ...[...pfad].filter((x) => !pfad.has(x + 1)).map((x) => x + 1)];
    for (const v of [2, 6, 12, 18]) {
      const { w, px } = fensterWelt(inst, cls, 2);
      menschenBot(w, kanten.map(px), v);
      if (!w.finished || w.deaths) fails.push(`${cls}/S${d}/#${i}/v${v}: ${w.deathReason || 'nicht im Ziel'}`);
    }
  }
  assert.deepEqual(fails, []);
});

// ── Deckengang („Die Decke lebt") und Kletterschlucht („Wandsprung-Schluchten") ─────────────────────

test('Deckengang: die Decke ist über dem ganzen Tunnel geschlossen, auch über Gruben', () => {
  for (const v of ['zapfen', 'steinschlag', 'gitter', 'zapfen+gitter', 'steinschlag+gitter']) {
    for (let i = 0; i < 10; i++) {
      const inst = baueVariante('deckengang', v, ctxFuer(`dg-${v}-${i}`, i % 2 ? 'super' : 'normal', 1 + (i % 5), { reach: reachForClass(i % 2 ? 'super' : 'normal') }));
      const { a, b } = inst.tpl.info;
      for (let x = a; x < b; x++) for (let y = 0; y < F - 5; y++) assert.equal(inst.rows[y][x], '#', `${v}: Loch in der Decke bei ${x}/${y}`);
    }
  }
});

test('Deckengang „zapfen": über dem Sprungbereich jeder Grube hängt kein Stachel', () => {
  for (const cls of ['normal', 'fast', 'super']) {
    const J = reachForClass(cls).gap.jump;
    for (let i = 0; i < 10; i++) {
      const inst = baueVariante('deckengang', 'zapfen', ctxFuer(`dz-${cls}-${i}`, cls, 3, { reach: reachForClass(cls) }));
      const zapfen = inst.entities.filter((e) => e.type === 'spike' && e.dir === 'down').map((e) => e.lx);
      const gruben = [...new Set(inst.entities.filter((e) => e.type === 'spike' && e.dir !== 'down').map((e) => e.lx))];
      assert.ok(zapfen.length > 0 && gruben.length > 0, `${cls}#${i}: keine Zapfen oder keine Grube`);
      for (const g of gruben) for (const z of zapfen) assert.ok(Math.abs(g - z) >= 0.4 * J, `${cls}#${i}: Zapfen ${z} nur ${Math.abs(g - z)} von Grube ${g}`);
    }
  }
});

test('Menschen-Bot: Deckengang — an den Gruben voll springen (Zapfen) bzw. einfach durchlaufen (Steinschlag)', () => {
  const fails = [];
  for (const cls of ['normal', 'fast', 'super']) for (let d = 1; d <= 5; d++) for (let i = 0; i < 2; i++) {
    const zapfen = baueVariante('deckengang', 'zapfen', ctxFuer(`mb-dz-${cls}-${d}-${i}`, cls, d, { reach: reachForClass(cls) }));
    const grubenKante = [...new Set(zapfen.entities.filter((e) => e.type === 'spike' && e.dir !== 'down').map((e) => e.lx))]
      .filter((x, _, alle) => !alle.includes(x - 1));
    for (const v of [2, 6, 12, 18]) {
      const { w, px } = fensterWelt(zapfen, cls, 2);
      menschenBot(w, grubenKante.map(px), v);
      if (!w.finished || w.deaths) fails.push(`zapfen ${cls}/S${d}/#${i}/v${v}: ${w.deathReason || 'nicht im Ziel'}`);
    }
    const stein = baueVariante('deckengang', 'steinschlag', ctxFuer(`mb-ds-${cls}-${d}-${i}`, cls, d));
    const { w } = fensterWelt(stein, cls, 2);
    for (let t = 0; t < 3000 && !w.finished && w.deaths === 0; t++) stepWorld(w, INPUT.RIGHT);
    if (!w.finished || w.deaths) fails.push(`steinschlag ${cls}/S${d}/#${i}: ${w.deathReason || 'nicht im Ziel'}`);
  }
  assert.deepEqual(fails, []);
});

/** Zickzack-Kletterer: Stoppt ihn eine Wand, springt er hoch und klettert — an jeder Wand `d` Ticks rutschen (Reaktionszeit),
 * dann Wandsprung. Fällt er dagegen nur eine Kante hinunter, lässt er sich fallen (kein Wandsprung an der Felswand). */
function kletterBot(w, d) {
  let dir = INPUT.RIGHT;
  let wandSeit = -1;
  let letzte = 0;
  let lx = w.player.x;
  let still = 0;
  let halten = 0;
  let klettern = false;
  for (let t = 0; t < 6000 && !w.finished && w.deaths === 0; t++) {
    const p = w.player;
    let m = dir;
    if (p.onGround) {
      still = Math.abs(p.x - lx) < 0.2 ? still + 1 : 0;
      if (dir === INPUT.LEFT) dir = INPUT.RIGHT;
      m = dir;
      if (halten <= 0) klettern = false;
      if (still > 4 && !(letzte & INPUT.JUMP)) { m = dir | INPUT.JUMP; halten = 30; klettern = true; }
    } else if (klettern && p.wallDir !== 0) {
      if (wandSeit < 0) wandSeit = t;
      if (t - wandSeit >= d) {
        if (letzte & INPUT.JUMP) m = p.wallDir > 0 ? INPUT.RIGHT : INPUT.LEFT;
        else { dir = p.wallDir > 0 ? INPUT.LEFT : INPUT.RIGHT; m = dir | INPUT.JUMP; halten = 20; wandSeit = -1; }
      } else m = p.wallDir > 0 ? INPUT.RIGHT : INPUT.LEFT;
    } else { wandSeit = -1; if (halten > 0) { halten--; m = dir | INPUT.JUMP; } }
    if (p.onGround && halten > 0) { halten--; m |= INPUT.JUMP; }
    lx = p.x;
    stepWorld(w, m);
    letzte = m;
  }
  return w;
}

test('Menschen-Bot: Kletterschlucht (einfach und doppelt) im Zickzack mit 17–150 ms Reaktionszeit, alle Stufen und Tempi', () => {
  const fails = [];
  for (const v of ['einfach', 'doppelt']) for (const cls of ['normal', 'fast', 'super']) for (let d = 1; d <= 5; d++) {
    const inst = baueVariante('kletterschlucht', v, ctxFuer(`mb-k-${v}-${cls}-${d}`, cls, d));
    for (const r of [2, 6, 12, 18]) {
      const { w } = fensterWelt(inst, cls, 2);
      kletterBot(w, r);
      if (!w.finished || w.deaths) fails.push(`${v} ${cls}/S${d}/v${r}: ${w.deathReason || 'nicht im Ziel'}`);
    }
  }
  assert.deepEqual(fails, []);
});

test('Kletterschlucht: jede Stufe ist höher als ein Doppelsprung, der Schacht 4 breit, an den Wänden keine Stacheln', () => {
  for (let i = 0; i < 20; i++) {
    const inst = baueVariante('kletterschlucht', i % 2 ? 'doppelt' : 'saegentor', ctxFuer(`ks-${i}`, 'super', 1 + (i % 5)));
    for (const s of inst.tpl.info.schluchten) {
      assert.ok(F - s.oben > reachForClass('super').height.double, `Stufe nur ${F - s.oben} hoch`);
      for (let y = s.oben; y < F - 2; y++) assert.equal(inst.rows[y][s.fels - 5], '#', 'Säule fehlt');
    }
    assert.ok(!inst.entities.some((e) => e.type === 'spike'), 'Stachel in der Kletterschlucht');
  }
});
