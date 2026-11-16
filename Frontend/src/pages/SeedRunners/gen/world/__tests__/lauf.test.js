// Welttyp „Lauflinie“ (Prototyp, typen/lauf.js): Strecken mit vollem Schwung.
//
// Der Beweis der Spielbarkeit ist der Läufer (lauf/spiel.js): Er spielt jede Strecke und das ganze Level am Stück in der
// echten Sim, mit der Ungenauigkeit eines Menschen (Reaktionszeit, Haltedauer, Absprunglinie). Geprüft wird hier auch mit
// FRISCHEN Zitter-Sätzen, die der Bau nie gesehen hat — sonst bewiese der Test nur, dass der Bau zu seinen eigenen Proben passt.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, WELT_BAU } from '../generate.js';
import { checkLevel } from '../reichweite/graph.js';
import { pruefeStart } from '../gemeinsam/plattform.js';
import { ZUFALLS_TYPEN } from '../registry.js';
import { LIMITS } from '../../../level/limits.js';
import { createRng } from '../../../sim/rng.js';
import { neuerBau, baueKette, baueKamin, baueSturz, KETTEN_ARTEN, HAERTE, istSchlicht } from '../lauf/strecken.js';
import { ausschnitt, spiele, zittern, standVon } from '../lauf/spiel.js';
import { kettenlauf } from '../typen/lauf.js';

const welt = (seed, length = 'long', difficulty = 3) => generateWorld({ seed, length, speedClass: 'super', difficulty, worldType: 'lauf' });
const notizen = (level) => WELT_BAU.get(level).notizen;

/** Das ganze Level mit einem Zitter-Satz laufen (Skripte aller Strecken hintereinander) */
function ganzerLauf(level, zitterVon) {
  const n = notizen(level);
  const skript = n.pruef.flatMap((s) => s.skript);
  const grid = level.rows.map((r) => r.split(''));
  const a = ausschnitt(grid, level.entities, { x0: 0, y0: 0, w: level.width, h: level.height }, { x: level.meta.start.x, y: level.meta.start.y });
  const r = spiele(a, skript, zitterVon(skript.length), { cls: 'super', maxT: 120 * 240 });
  const letzte = n.pruef[n.pruef.length - 1];
  const s = standVon(r.p);
  return { ...r, imZiel: r.ok && s.y === letzte.aus.row - 1 && s.x >= letzte.aus.x0 && s.x <= letzte.aus.x1 };
}

test('Lauflinie ist nur auf Wunsch baubar — Zufallsrunden bauen weiter mit Pfad', () => {
  assert.deepEqual([...ZUFALLS_TYPEN], ['pfad']);
  assert.equal(welt('lauf-a', 'short').meta.worldType, 'lauf');
});

test('Jedes Level: alle Strecken gebaut, Kettenlauf besteht, Graph hängt zusammen, Start ist sicher, Grenzen halten', () => {
  const faelle = [['short', 5], ['medium', 8], ['long', 12]];
  for (const [length, geplant] of faelle) {
    for (const seed of ['lauf-t1', 'lauf-t2', 'lauf-t3']) {
      const level = welt(seed, length);
      const n = notizen(level);
      const wo = `${seed}/${length}`;
      assert.equal(n.geplant, geplant, wo);
      // (Etagen-Level dürfen bis zu zwei Strecken früher enden, wenn für eine weitere Wende kein Platz mehr ist)
      assert.ok(n.strecken.length >= geplant - 2, `${wo}: nur ${n.strecken.length} von ${geplant} Strecken`);
      assert.equal(n.kettenlauf.ok, true, `${wo}: Kettenlauf ${JSON.stringify(n.kettenlauf.fehl)}`);
      const bericht = checkLevel(level, level.meta.limits);
      assert.equal(bericht.ok, true, `${wo}: Bewegungsgraph ${JSON.stringify(bericht.problems || bericht.fehler || '')}`);
      assert.equal(level.meta.reachedEnd, true, `${wo}: Ziel im Bewegungsgraph nicht erreichbar`);
      assert.equal(level.meta.repairs.length, 0, `${wo}: Reparaturen`);
      assert.deepEqual(pruefeStart(level.rows, level.entities, level.meta.start), [], wo);
      assert.ok(level.width <= LIMITS.maxWidth && level.height <= LIMITS.maxHeight, `${wo}: Größe ${level.width}×${level.height}`);
      assert.ok(level.entities.length <= LIMITS.maxElements, `${wo}: ${level.entities.length} Elemente`);
      assert.ok(level.meta.finish.length === 3, `${wo}: Ziel`);
    }
  }
});

test('Gleicher Seed, gleiches Level', () => {
  const a = welt('lauf-gleich');
  const b = welt('lauf-gleich');
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.rows, b.rows);
  assert.deepEqual(a.entities, b.entities);
  assert.notEqual(welt('lauf-anders').hash, a.hash);
});

/** Anteil der Läufe ohne Tod durchs ganze Level, mit frischem Zittern der Stärke `faktor` (1 = ±50 ms) */
function quote(seeds, stufe, faktor, je = 8) {
  let ok = 0;
  let alle = 0;
  for (const seed of seeds) {
    const level = welt(seed, 'long', stufe);
    const rng = createRng(`frisch:${seed}:${faktor}`, 'zittern');
    for (let k = 0; k < je; k++) {
      alle++;
      if (ganzerLauf(level, (n) => zittern(n, rng, faktor)).imZiel) ok++;
    }
  }
  return ok / alle;
}

test('Frische Menschen-Läufe: Wer so genau spielt, wie die Stufe verlangt, kommt ohne Tod durchs ganze Level — auch mit anderem Zittern als der Bau', () => {
  // (Stufe 3 baut mit ±40 ms. Messung 14.11.2026: 157 von 160.)
  const q = quote(['lauf-f1', 'lauf-f2', 'lauf-f3', 'lauf-f4'], 3, HAERTE[3].zitter, 10);
  assert.ok(q >= 0.9, `nur ${Math.round(q * 100)} % der Läufe`);
});

test('Härte-Leiter: Stufe 1 verzeiht, Stufe 3 bestraft Ungenauigkeit, Stufe 5 verlangt Präzision', () => {
  // Rückmeldung 14.11.2026: „gerne mehr Härte“. Gemessen (ohne Tod durchs ganze Level): Stufe 1 bei ±50 ms 100 %; Stufe 3
  // bei ±50 ms 88 %, bei ±80 ms 36 % (vor der Härte-Tabelle 99 % und 86 %); Stufe 5 bei ±50 ms 33 %.
  const seeds = ['lauf-h1', 'lauf-h2', 'lauf-h3'];
  const leicht = quote(seeds, 1, 1);
  const mittelGenau = quote(seeds, 3, 1);
  const mittelUngenau = quote(seeds, 3, 1.6);
  const schwer = quote(seeds, 5, 1);
  assert.ok(leicht >= 0.9, `Stufe 1: ${Math.round(leicht * 100)} %`);
  assert.ok(mittelUngenau <= 0.7, `Stufe 3 mit ±80 ms: ${Math.round(mittelUngenau * 100)} % (zu gnädig)`);
  assert.ok(mittelUngenau < mittelGenau, `Stufe 3: ungenau ${Math.round(mittelUngenau * 100)} %, genau ${Math.round(mittelGenau * 100)} %`);
  assert.ok(schwer < mittelGenau, `Stufe 5 ${Math.round(schwer * 100)} % gegen Stufe 3 ${Math.round(mittelGenau * 100)} %`);
});

test('Großformen: Es gibt Level geradeaus und Etagen-Level mit Wenden — dort läuft der Weg auch nach links', () => {
  const formen = {};
  let nachLinks = 0;
  for (let i = 0; i < 12; i++) {
    const n = notizen(welt(`lauf-g${i}`));
    formen[n.form] = (formen[n.form] || 0) + 1;
    if (n.form === 'strom') assert.equal(n.wenden, 0);
    const links = n.pruef.some((st) => st.skript.some((sch) => sch.dir < 0 && sch.a === 'sprung' && !sch.kick));
    if (n.wenden > 0) {
      assert.ok(links, `lauf-g${i}: ${n.wenden} Wenden, aber kein Sprung nach links`);
      assert.ok(n.strecken.some((name) => name === 'Wendekamin' || name === 'Wendesturz'));
      nachLinks++;
    }
  }
  for (const form of ['strom', 'hoch', 'runter']) assert.ok(formen[form] > 0, `Form ${form} kam nie vor (${JSON.stringify(formen)})`);
  assert.ok(nachLinks >= 4, `nur ${nachLinks} von 12 Leveln mit Richtungswechsel`);
});

test('Gegenprobe: Ohne Eingaben (oder nur „rechts halten“) kommt niemand ins Ziel', () => {
  const level = welt('lauf-gegen');
  const n = notizen(level);
  const grid = level.rows.map((r) => r.split(''));
  const a = ausschnitt(grid, level.entities, { x0: 0, y0: 0, w: level.width, h: level.height }, { x: level.meta.start.x, y: level.meta.start.y });
  const letzte = n.pruef[n.pruef.length - 1];
  // Nur laufen: ein einziger Schritt „bis ans Ende der Karte“
  const r = spiele(a, [{ a: 'lauf', dir: 1, bisX: level.width * 16 }], zittern(1, 'mitte'), { cls: 'super', maxT: 120 * 60 });
  const s = standVon(r.p);
  assert.ok(!(r.ok && s.y === letzte.aus.row - 1 && s.x >= letzte.aus.x0), 'nur rechts halten darf nicht reichen');
});

test('Abwechslung: Über mehrere Seeds kommt jede Streckenart vor, nie dieselbe zweimal hintereinander, höchstens zweimal je Level (Hindernislauf dreimal)', () => {
  const gesehen = new Set();
  for (let i = 0; i < 16; i++) {
    const n = notizen(welt(`lauf-v${i}`));
    for (let k = 0; k < n.strecken.length; k++) {
      gesehen.add(n.strecken[k]);
      if (k > 0) assert.notEqual(n.strecken[k], n.strecken[k - 1], `lauf-v${i}: ${n.strecken.join(' > ')}`);
    }
    // (Wenden so oft, wie die Karte Ränder hat; der Hindernislauf bis dreimal)
    for (const [name, zahl] of Object.entries(n.arten)) assert.ok(zahl <= (name === 'Hindernislauf' ? 3 : name.startsWith('Wende') ? 5 : 2), `lauf-v${i}: ${name} ${zahl}-mal`);
  }
  for (const name of [...Object.values(KETTEN_ARTEN).map((a) => a.name), 'Kamin', 'Sturzflug']) assert.ok(gesehen.has(name), `${name} kam nie vor (${[...gesehen].join(', ')})`);
});

test('Hindernisse statt Einerlei: höchstens 30 % schlichte Sprünge, nie mehr als 4 am Stück; Röhren, Sägen, Kristalle, Ringe, Kicks, Fallstufen, Boost-Streifen und Flut kommen vor', () => {
  // (Rückmeldung 14.11.2026: „ich drücke nur D und springe ab und zu … jeder Sprung fühlt sich wieder gleich an“ —
  // gemessen waren es 63 % schlichte Sprünge und bis zu 13 am Stück; nach dem Umbau 33 % und höchstens 5)
  const zuege = {};
  const elemente = {};
  let schritte = 0;
  let schlicht = 0;
  let folge = 0;
  for (let i = 0; i < 10; i++) {
    const level = welt(`lauf-h${i}`);
    const n = notizen(level);
    for (const [z, c] of Object.entries(n.zugArten)) zuege[z] = (zuege[z] || 0) + c;
    for (const e of level.entities) elemente[e.type] = (elemente[e.type] || 0) + 1;
    let lauf = 0;
    for (const st of n.pruef) for (const s of st.skript) {
      if (s.a === 'lauf') continue;
      schritte++;
      if (istSchlicht(s)) { schlicht++; lauf++; folge = Math.max(folge, lauf); } else lauf = 0;
    }
  }
  // (Messung 14.11.2026 nach der Härte-Tabelle: 13 % schlichte Sprünge, höchstens 2 am Stück)
  assert.ok(schlicht / schritte <= 0.3, `${Math.round((100 * schlicht) / schritte)} % schlichte Sprünge`);
  assert.ok(folge <= 4, `${folge} schlichte Sprünge am Stück`);
  for (const z of ['roehre', 'saege', 'eng', 'dash', 'ring', 'kick', 'fall', 'boost', 'walze']) assert.ok((zuege[z] || 0) > 0, `${z} kam nie vor (${JSON.stringify(zuege)})`);
  for (const e of ['spike', 'saw', 'crystal', 'ring', 'crumble', 'spring', 'boost', 'flut']) assert.ok((elemente[e] || 0) > 0, `kein ${e} (${JSON.stringify(elemente)})`);
});

test('Strecken einzeln: jede Bauart trägt in beide Richtungen; eine gescheiterte Strecke hinterlässt nichts', () => {
  const bau = (dir) => {
    const grid = Array.from({ length: 158 }, () => new Array(400).fill('.'));
    const B = neuerBau(grid, 'super', null, 3);
    const ein = dir > 0 ? { x0: 20, x1: 30, row: 80 } : { x0: 360, x1: 370, row: 80 };
    for (let x = ein.x0; x <= ein.x1; x++) grid[ein.row][x] = '#';
    return { grid, B, ein, startX: dir > 0 ? ein.x0 + 2 : ein.x1 - 2 };
  };
  const erster = (fn) => { for (let i = 0; i < 16; i++) { const r = fn(i); if (r) return r; } return null; };
  for (const dir of [1, -1]) {
    for (const art of Object.keys(KETTEN_ARTEN)) {
      const st = erster((i) => { const { B, ein, startX } = bau(dir); return baueKette(B, { rng: createRng(`k${i}`, art), ein, startX, dir, art, band: { oben: 54, unten: 100 } }); });
      assert.ok(st, `Kette ${art} ${dir > 0 ? '→' : '←'}`);
      assert.ok(st.skript.length >= 3);
    }
    for (const wende of [false, true]) {
      assert.ok(erster((i) => { const { B, ein, startX } = bau(dir); return baueKamin(B, { rng: createRng(`c${i}`, 'kamin'), ein, startX, dir, hoehe: 18, wende }); }), `Kamin ${wende ? 'Wende' : 'gerade'} ${dir > 0 ? '→' : '←'}`);
      assert.ok(erster((i) => { const { B, ein, startX } = bau(dir); return baueSturz(B, { rng: createRng(`d${i}`, 'sturz'), ein, startX, dir, riegel: 2, wende }); }), `Sturz ${wende ? 'Wende' : 'gerade'} ${dir > 0 ? '→' : '←'}`);
    }
  }
  // Versperrt: eine Wand direkt hinter der Kante — die Kette scheitert und nimmt alles zurück
  const { grid, B, ein, startX } = bau(1);
  for (let y = 40; y < 120; y++) for (let x = 33; x <= 60; x++) grid[y][x] = '#';
  const vorher = grid.map((r) => r.join('')).join('\n');
  assert.equal(baueKette(B, { rng: createRng('zu', 'kette'), ein, startX, dir: 1, art: 'huepfer', band: { oben: 64, unten: 100 } }), null);
  assert.equal(grid.map((r) => r.join('')).join('\n'), vorher);
  assert.equal(B.entities.length, 0);
});

test('Kettenlauf meldet, in welcher Strecke ein Lauf scheitert', () => {
  const level = welt('lauf-kl', 'medium');
  const n = notizen(level);
  const grid = level.rows.map((r) => r.split(''));
  const strecken = n.pruef.map((s) => ({ ...s, spielart: s.name }));
  assert.equal(kettenlauf(grid, level.entities, strecken, 'super', level.meta.start).ok, true);
  // Einen Stachel mitten auf die zweite Rastplattform: Der Lauf muss dort enden
  const ziel = strecken[1].aus;
  const kaputt = [...level.entities, ...Array.from({ length: ziel.x1 - ziel.x0 + 1 }, (_, i) => ({ type: 'spike', tx: ziel.x0 + i, ty: ziel.row - 1 }))];
  const r = kettenlauf(grid, kaputt, strecken, 'super', level.meta.start);
  assert.equal(r.ok, false);
  assert.ok(r.fehl.strecke <= 2, JSON.stringify(r.fehl));
});
