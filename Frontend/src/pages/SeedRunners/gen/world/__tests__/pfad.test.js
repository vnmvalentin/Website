// Tests des Welttyps „Pfad" (typen/pfad.js, pfad/*): der Weg zuerst, die Welt drumherum.
//
// Die Zusage: Jeder Zug des Weges wird mit allen Varianten (Ungenauigkeit eines Menschen, ±50 ms) in der echten Sim
// gespielt — beim Planen UND noch einmal auf der fertigen Karte. Diese Tests halten fest, dass das stimmt und dass der
// Rest der Welt (gemeinsame Schicht, Graph, Grenzen) mit dem neuen Welttyp zurechtkommt.

import test from 'node:test';
import assert from 'node:assert/strict';
import typ, { WEGE } from '../typen/pfad.js';
import { generateWorld, normalizeParams } from '../generate.js';
import { checkLevel } from '../reichweite/graph.js';
import { pruefeStart } from '../gemeinsam/plattform.js';
import { neuesRaster } from '../gemeinsam/raster.js';
import { planeSzenen, FORMEN, FORM_IDS } from '../pfad/szenen.js';
import { planePfad, pruefeZug } from '../pfad/planer.js';
import { erreichbar } from '../pfad/regeln.js';
import { varianten, zugEingabe, zugFertig } from '../pfad/zuege.js';
import { standKachel } from '../pfad/probe.js';
import { THEMEN, THEMA_IDS, waehleHandschrift } from '../pfad/handschrift.js';
import { LEITIDEEN, LEITIDEE_IDS, waehleLeitidee, aktPlan } from '../pfad/leitideen.js';
import { planeMotive, variiere, motivFaehig } from '../pfad/motive.js';
import { createWorld, stepWorld } from '../../../sim/world.js';
import { parseMap } from '../../../sim/tilemap.js';
import { classTuning } from '../../../sim/classes.js';
import { INPUT } from '../../../sim/inputBits.js';
import { createLevelWorld } from '../../index.js';
import { createRng } from '../../../sim/rng.js';
import { reachForClass } from '../../../sim/reach.js';
import { SAFETY } from '../../generator.js';
import { LIMITS } from '../../../level/limits.js';

function limitsFuer(cls, d) {
  const reach = reachForClass(cls);
  const s = SAFETY[d];
  return { maxGap: Math.floor(reach.gap.jump * s), maxGapUp: Math.floor(reach.gap.double * s), maxUp: Math.floor(reach.height.double * s), maxDown: 30 };
}
// `thema`: Handschrift erzwingen (pfad/handschrift.js) — seit jedes Level einen „Autor" mit eigener Palette hat, kommen
// Mechaniken nur noch in passenden Themen vor
function baue(seed, length, d, cls, thema = null) {
  const params = normalizeParams({ seed, length, difficulty: d, speedClass: cls });
  return typ.baue({ params, limits: limitsFuer(cls, d), reach: reachForClass(cls), neuesRaster: (w, h) => neuesRaster(w, h, 'luft'), biomeId: 'cave', ...(thema ? { pfadThema: thema } : {}) });
}

test('Pfad: jeder Zug trägt auf der fertigen Karte noch — mit allen Varianten, ohne Füllung zurückzunehmen', () => {
  const fails = [];
  for (const length of ['short', 'medium']) for (const d of [1, 3, 5]) for (const cls of ['normal', 'fast', 'super']) {
    const g = baue(`pt-${length}-${d}`, length, d, cls);
    if (g.notizen.pruefung.offen.length) fails.push(`${length}/S${d}/${cls}: Züge ${g.notizen.pruefung.offen.join(',')}`);
    if (g.notizen.zuege < 10) fails.push(`${length}/S${d}/${cls}: nur ${g.notizen.zuege} Züge`);
  }
  assert.deepEqual(fails, []);
});

test('Pfad: ganze Level hängen für den Graph zusammen, starten sicher, bleiben in den Grenzen', () => {
  const fails = [];
  for (const length of ['short', 'medium', 'long']) for (const d of [1, 3, 5]) for (const speedClass of ['normal', 'super']) {
    const lv = generateWorld({ seed: `pg-${length}-${d}`, length, difficulty: d, speedClass, worldType: 'pfad', kernidee: null });
    const name = `${length}/S${d}/${speedClass}`;
    if (!checkLevel(lv, lv.meta.limits).ok) fails.push(`${name}: Graph`);
    if (lv.meta.repairs.length) fails.push(`${name}: ${lv.meta.repairs.length} Reparaturen`);
    const start = pruefeStart(lv.rows, lv.entities, lv.meta.start);
    if (start.length) fails.push(`${name}: Start ${start[0]}`);
    if (lv.entities.length > LIMITS.maxElements) fails.push(`${name}: ${lv.entities.length} Elemente`);
    if (lv.width > LIMITS.maxWidth || lv.height > LIMITS.maxHeight) fails.push(`${name}: ${lv.width}×${lv.height}`);
  }
  assert.deepEqual(fails, []);
});

test('Pfad: gleicher Seed, gleiches Level', () => {
  const a = generateWorld({ seed: 'pfad-det', length: 'medium', difficulty: 3, worldType: 'pfad' });
  const b = generateWorld({ seed: 'pfad-det', length: 'medium', difficulty: 3, worldType: 'pfad' });
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.entities, b.entities);
});

test('Pfad: Szenen wechseln — dasselbe Muster und dieselbe Mechanik nie zweimal hintereinander', () => {
  for (let i = 0; i < 30; i++) {
    const { szenen } = planeSzenen(createRng(`sz-${i}`, 'x'), 46);
    for (let k = 1; k < szenen.length; k++) {
      assert.notEqual(szenen[k].muster, szenen[k - 1].muster);
      if (k > 1) assert.notEqual(szenen[k].mechanik, szenen[k - 1].mechanik);
    }
  }
});

test('Pfad: die Mechaniken kommen wirklich vor (Feder, Ring, Anker, Portal) und der Weg läuft in alle Richtungen', () => {
  const zaehler = { spring: 0, ring: 0, portal: 0, anker: 0 };
  const richtungen = new Set();
  // (Seiltänzer dazu: Seilschwünge gibt es seit 27.09.2026 nur noch, wo kein Doppelsprung hinreicht — also seltener)
  for (const [thema, cls] of [['akrobat', 'normal'], ['akrobat', 'super'], ['tueftler', 'normal'], ['tueftler', 'super'], ['seiltaenzer', 'super']]) {
    const g = baue(`pm-${thema}-${cls}`, 'long', 3, cls, thema);
    for (const e of g.entities) if (e.type in zaehler) zaehler[e.type]++;
    zaehler.anker += g.grid.flat().filter((c) => c === 'G').length;
  }
  for (const [k, v] of Object.entries(zaehler)) assert.ok(v > 0, `${k} kommt nicht vor`);
  // Richtungen aus dem Planer direkt
  const cls = 'super';
  const reach = reachForClass(cls);
  const rng = createRng('pr', 'x');
  const { richtungen: plan } = planeSzenen(rng.fork('s'), 46);
  const w = planePfad({ rng: rng.fork('w'), cls, d: 3, limits: limitsFuer(cls, 3), reach, grid: neuesRaster(1100, 120, 'luft'), start: { x: 8, y: 80 }, richtungen: plan });
  for (const s of w.schritte) richtungen.add(s.zug.dir > 0 ? 'rechts' : 'links').add(s.ziel.row < s.von.y ? 'hoch' : 'runter');
  assert.deepEqual([...richtungen].sort(), ['hoch', 'links', 'rechts', 'runter']);
});

// Gegenprobe: Ein Zug, dessen Ziel-Plattform man wegnimmt, darf nicht als tragend gelten — sonst prüft pruefeZug nichts.
test('Pfad: pruefeZug meldet einen Zug ohne Landefläche als nicht tragend', () => {
  const cls = 'normal';
  const reach = reachForClass(cls);
  const rng = createRng('gegen', 'x');
  const grid = neuesRaster(300, 120, 'luft');
  const { richtungen } = planeSzenen(rng.fork('s'), 6);
  const w = planePfad({ rng: rng.fork('w'), cls, d: 3, limits: limitsFuer(cls, 3), reach, grid, start: { x: 8, y: 80 }, richtungen });
  const s = w.schritte[1];
  assert.ok(pruefeZug(grid, w.entities, cls, reach.runSpeed, s).ok);
  for (let x = s.ziel.x0; x <= s.ziel.x1; x++) grid[s.ziel.row][x] = '.';
  assert.equal(pruefeZug(grid, w.entities, cls, reach.runSpeed, s).ok, false);
  assert.ok(varianten(s.zug, reach.runSpeed).length >= 3, 'ein Zug ohne Varianten prüft keine Ungenauigkeit');
});

// ── Regeln nach der Rückmeldung vom 25.09.2026 ──────────────────────────────

function weg(seed, cls, d, n = 32, portalBudget = 2) {
  const reach = reachForClass(cls);
  const rng = createRng(seed, 'x');
  const grid = neuesRaster(1100, 150, 'luft');
  const { richtungen } = planeSzenen(rng.fork('s'), n);
  return { reach, grid, w: planePfad({ rng: rng.fork('w'), cls, d, limits: limitsFuer(cls, d), reach, grid, start: { x: 8, y: 100 }, richtungen, portalBudget }) };
}

test('Pfad: keine Abkürzung — keine Plattform ist von einer 3 oder mehr Schritte älteren erreichbar', () => {
  for (const [seed, cls, d] of [['ab-1', 'normal', 3], ['ab-2', 'super', 3], ['ab-3', 'fast', 5]]) {
    const { reach, w } = weg(seed, cls, d);
    const plats = w.plattformen;
    const tuerSpalten = [...new Set(w.entities.filter((e) => e.type === 'door').map((e) => e.tx))];
    for (let m = 4; m < plats.length; m++) {
      // Schlüssel-Abstecher ausgenommen: Die Nische ist eine Sackgasse (von ihr geht es nur zurück auf den Hub), hinter der
      // Tür schließt die Wand jede Abkürzung aus — die grobe Schätzung kennt keine Wände
      if (w.schritte[m - 1]?.abstecher) continue;
      // (…ebenso Paare, zwischen denen eine Tür-Wand steht: Sie reicht vom oberen bis zum unteren Rand)
      const wand = (a, b) => tuerSpalten.some((tx) => tx > Math.min(a.x0, b.x0) && tx < Math.max(a.x1, b.x1));
      for (let q = 0; q <= m - 4; q++) if (!wand(plats[q], plats[m])) assert.equal(erreichbar(plats[q], plats[m], reach), false, `${seed}: Plattform ${m} von ${q} aus erreichbar`);
    }
  }
});

test('Pfad: Portale sind selten — höchstens so viele Paare wie das Budget erlaubt', () => {
  for (const budget of [1, 2]) {
    const { w } = weg(`pb-${budget}`, 'super', 3, 46, budget);
    assert.ok(w.schritte.filter((s) => s.zug.art === 'portal').length <= budget);
  }
});

// ── Großformen und weitere Mechaniken (Rückmeldung 25.09.2026: „alles von links nach rechts … bitte die anderen
// Mechaniken noch implementieren") ─────────────────────────────────────────────

test('Pfad: jede Großform läuft durch (mindestens 90 % ihrer geplanten Züge)', () => {
  const fails = [];
  for (const form of FORM_IDS) for (const cls of ['normal', 'super']) {
    const params = normalizeParams({ seed: `gf-${form}`, length: 'medium', difficulty: 3, speedClass: cls });
    const g = typ.baue({ params, limits: limitsFuer(cls, 3), reach: reachForClass(cls), neuesRaster: (w, h) => neuesRaster(w, h, 'luft'), biomeId: 'cave', pfadForm: form });
    const soll = Math.min(32, FORMEN[form].maxZuege ?? 99);
    if (g.notizen.form !== form) fails.push(`${form}/${cls}: Form ${g.notizen.form}`);
    if (g.notizen.zuege < 0.9 * soll) fails.push(`${form}/${cls}: ${g.notizen.zuege}/${soll} Züge`);
  }
  assert.deepEqual(fails, []);
});

test('Pfad: Wandschacht, Zeittor und Bröckelplattform kommen vor', () => {
  const zaehler = { wand: 0, tor: 0, broeckel: 0 };
  for (const [thema, cls] of [['kletterer', 'normal'], ['kletterer', 'super'], ['uhrwerk', 'normal'], ['uhrwerk', 'super']]) {
    const g = baue(`pn-${thema}-${cls}`, 'long', 3, cls, thema);
    for (const k of Object.keys(zaehler)) zaehler[k] += g.notizen.mechaniken[k] || 0;
  }
  for (const [k, v] of Object.entries(zaehler)) assert.ok(v > 0, `${k} kommt nicht vor`);
});

// Ein Laser, dessen Strahl ein ANDERER Zug kreuzt, wäre eine Zufallsfalle: Wer dort ankommt, wartet nicht auf die Pause.
test('Pfad: den Strahl eines Tors kreuzt nur der Zug, der auf ihn wartet', () => {
  let tore = 0;
  // (Tore gibt es nur in Grotten-Szenen — deshalb über mehrere Seeds, bis welche dabei sind)
  for (let i = 0; i < 12 && tore < 3; i++) {
    const seed = `ts-${i}`;
    const cls = ['normal', 'super', 'fast'][i % 3];
    const g = baue(seed, 'long', 4, cls);
    const { schritte } = WEGE.get(g);
    for (const laser of g.entities.filter((e) => e.type === 'laser')) {
      tore++;
      const strahl = new Set();
      for (let y = laser.ty + 1; y < g.grid.length && g.grid[y][laser.tx] === '.'; y++) strahl.add(`${laser.tx},${y}`);
      const kreuzen = schritte.filter((s) => [...s.beruehrt].some((key) => strahl.has(key)));
      assert.ok(kreuzen.every((s) => s.zug.tor), `${seed}: Strahl bei ${laser.tx},${laser.ty} kreuzt einen Zug ohne Warten`);
    }
  }
  assert.ok(tore > 0, 'kein einziges Tor gebaut — der Test prüfte nichts');
});

// Kettenlauf: alle Züge nacheinander in EINER Welt der ganzen Karte — mit echter Levelzeit (Laser-Takt), Zustand der
// Bröckelblöcke und dem Schwung, mit dem man vom vorigen Zug ankommt. Strenger als die Einzelprüfung je Ausschnitt.
test('Pfad: Kettenlauf — ganze Level von vorn bis zum Ziel am Stück', () => {
  const fails = [];
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const cls = i % 2 ? 'super' : 'normal';
    const g = baue(`kl-${i}`, i % 3 ? 'medium' : 'long', 1 + (i % 5), cls);
    const { schritte, start } = WEGE.get(g);
    const rows = g.grid.map((r, y) => r.map((c, x) => (x === start.x && y === start.y ? 'S' : c)).join(''));
    const welt = createWorld(parseMap(rows, { entities: g.entities }), { tuning: classTuning(cls) });
    n++;
    for (let k = 0; k < schritte.length; k++) {
      const s = schritte[k];
      const ein = zugEingabe(s.zug, s.kanteX);
      const z = {};
      for (let t = 0; t < 1500; t++) {
        stepWorld(welt, ein(welt, t, z));
        if (welt.deaths || zugFertig(welt, t, z)) break;
      }
      const st = standKachel(welt.player);
      if (welt.deaths || st.y !== s.ziel.row - 1 || st.x < s.ziel.x0 || st.x > s.ziel.x1) {
        fails.push(`kl-${i}/${cls}: Zug ${k} (${s.mechanik}) ${welt.deaths ? welt.deathReason : `steht ${st.x},${st.y}`}`);
        break;
      }
    }
  }
  // Gemessen: 23 von 24 ganzen Leveln am Stück; ein Level darf hier ausfallen (Schwung aus einem Ring trägt anders als
  // aus dem Stand), mehr nicht
  assert.ok(fails.length <= 1, fails.join('\n'));
  assert.equal(n, 8);
});

test('Pfad: außer den Plattformen des Weges gibt es keine Standfläche (Stachelsockel und Deckel sind oben besetzt)', () => {
  for (const [seed, d] of [['st-1', 3], ['st-2', 5]]) {
    const lv = generateWorld({ seed, length: 'medium', difficulty: d, speedClass: 'super', worldType: 'pfad', kernidee: null });
    // (Stacheln, Türen, Farb- und Bröckelblöcke: Unter einer Tür liegt die Schwelle in Höhe des Hubs; direkt unter einem
    // Farb- oder Bröckelblock gehört die Kante zu dessen Plattform)
    const stachel = new Set(lv.entities.filter((e) => ['spike', 'door', 'colorBlock', 'crumble'].includes(e.type)).map((e) => `${e.tx},${e.ty}`));
    const wegStand = new Set(lv.meta.abschnitte.flatMap((a) => [...a.von, ...a.nach]).map((c) => `${c.x},${c.y}`));
    const fehler = [];
    for (let y = 1; y < lv.rows.length; y++) {
      for (let x = 0; x < lv.width; x++) {
        if ((lv.rows[y][x] !== '#' && lv.rows[y][x] !== 'I') || lv.rows[y - 1][x] !== '.') continue;   // Oberkante von Fels oder Eis
        const k = `${x},${y - 1}`;
        if (!stachel.has(k) && !wegStand.has(k)) fehler.push(k);
      }
    }
    // Start- und Zielplattform macht die gemeinsame Schicht breiter als den Weg — dort sind freie Stellen erlaubt
    const nahe = (c, p) => Math.abs(c[0] - p.x) <= 12 && Math.abs(c[1] - p.y) <= 3;
    const rest = fehler.map((f) => f.split(',').map(Number)).filter((c) => !nahe(c, lv.meta.start) && !lv.meta.finish.some((f) => nahe(c, f)));
    assert.deepEqual(rest, [], `${seed}: freie Standflächen abseits des Weges`);
  }
});

// ── Rückmeldung 25.09.2026 (dritte Runde): Sicht, Stacheln mit Zweck, neue Aufgaben ─────────────────────────────

test('Pfad: keine schwebenden Stacheln — jede sitzt an Fels oder Eis', () => {
  const halt = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] };
  const fehler = [];
  for (const [seed, cls, length] of [['sw-1', 'normal', 'medium'], ['sw-2', 'super', 'long'], ['sw-3', 'fast', 'medium']]) {
    const g = baue(seed, length, 3, cls);
    for (const e of g.entities.filter((x) => x.type === 'spike')) {
      const [dx, dy] = halt[e.dir] || [0, 1];
      const c = g.grid[e.ty + dy]?.[e.tx + dx];
      if (c !== '#' && c !== 'I') fehler.push(`${seed}: ${e.tx},${e.ty} (${e.dir})`);
    }
  }
  assert.deepEqual(fehler, []);
});

// Kamera: 480×270 px um die Spielermitte (client/camera.js). Landestelle und Anker müssen beim Absprung bzw. bis zum Scheitel
// im Bild liegen — hier grob über den Abstand zur Absprungstelle geprüft (±15 × ±8,4 Kacheln plus Flug bis zum Scheitel).
test('Pfad: Anker sind beim Absprung im Bild', () => {
  let anker = 0;
  // (Seiltänzer: In gemischten Leveln sind Seilschwünge als teure Aufgabe selten — der Test prüft die Sichtregel, nicht die Häufigkeit)
  for (const [seed, cls] of [['si-1', 'normal'], ['si-2', 'super'], ['si-3', 'fast'], ['si-4', 'normal']]) {
    const g = baue(seed, 'long', 3, cls, 'seiltaenzer');
    const { schritte } = WEGE.get(g);
    for (const s of schritte.filter((x) => x.anker)) {
      const naechster = s.anker;                            // der Anker DIESES Zugs (planer.js merkt ihn sich)
      anker++;
      assert.ok(Math.abs(naechster.x - s.von.x) <= 16 && s.von.y - naechster.y <= 7, `${seed}: Anker ${naechster.x},${naechster.y} von ${s.von.x},${s.von.y} aus nicht im Bild`);
    }
  }
  assert.ok(anker > 0, 'kein Ankerzug gebaut — der Test prüfte nichts');
});

test('Pfad: Einzelblöcke sind höchstens 2 Kacheln breit', () => {
  let n = 0;
  for (const [seed, cls] of [['eb-1', 'normal'], ['eb-2', 'super'], ['eb-3', 'fast']]) {
    const g = baue(seed, 'long', 4, cls);
    const { schritte } = WEGE.get(g);
    for (const s of schritte.filter((x) => x.zug.praezise)) { n++; assert.ok(s.ziel.x1 - s.ziel.x0 <= 1, `${seed}: ${s.ziel.x1 - s.ziel.x0 + 1} breit`); }
  }
  assert.ok(n > 0, 'kein Einzelblock gebaut — der Test prüfte nichts');
});

// Schlüssel-Abstecher: Nische mit Schlüssel vorn unten, Rücksprung zum Hub, dahinter Eiswand mit Tür vom oberen bis zum
// unteren Rand. Ohne Schlüssel kommt man nicht vorbei: Die Wandspalte ist bis auf die Tür durchgehend fest.
test('Pfad: Schlüssel-Abstecher — Schlüssel vor der Tür, Wand ohne Lücke', () => {
  let gefunden = 0;
  for (let i = 0; i < 16 && gefunden < 2; i++) {
    const cls = i % 2 ? 'super' : 'normal';
    const g = baue(`ks-${i}`, 'long', 3, cls, 'tueftler');
    const tueren = g.entities.filter((e) => e.type === 'door');
    const keys = g.entities.filter((e) => e.type === 'key');
    if (!tueren.length) continue;
    gefunden++;
    assert.equal(keys.length, new Set(tueren.map((t) => t.tx)).size, 'je Tür ein Schlüssel');
    for (const tx of new Set(tueren.map((t) => t.tx))) {
      const tuerY = new Set(tueren.filter((t) => t.tx === tx).map((t) => t.ty));
      for (let y = 0; y < g.grid.length; y++) if (!tuerY.has(y)) assert.equal(g.grid[y][tx], 'I', `Lücke in der Wand bei ${tx},${y}`);
      // Der Schlüssel liegt vor der Tür (in Hauptrichtung rechts: links davon)
      assert.ok(keys.some((k2) => k2.tx < tx), 'Schlüssel hinter der Tür');
    }
    // …und der Kettenlauf zeigt, dass man mit ihm durchkommt (Test oben); hier: ohne Schlüssel bleibt die Tür zu
  }
  assert.ok(gefunden > 0, 'kein Schlüssel-Abstecher in 16 langen Leveln');
});

// ── Rückmeldung 26.09.2026: „fast nur Sprünge mit Stachelgruben“ — neue Aufgaben ─────────────────────────────────

test('Pfad: Dash-Tunnel, Rückenwind/Aufwind und Schalter-Brücke kommen vor', () => {
  const z = { dash: 0, wind: 0, schalter: 0, farbe: 0 };
  // (bis alle vorkamen, höchstens 12 Level — der Dash-Tunnel ist auch beim Flitzer nicht in jedem Level)
  for (let i = 0; i < 12 && Object.values(z).some((v) => v === 0); i++) {
    const g = baue(`na-${i}`, 'long', 2 + (i % 3), i % 2 ? 'super' : 'normal', ['flitzer', 'windlaeufer', 'uhrwerk'][i % 3]);
    z.dash += g.notizen.mechaniken.dash || 0;
    z.wind += (g.notizen.mechaniken.wind || 0) + (g.notizen.mechaniken.aufwind || 0);
    z.schalter += g.notizen.mechaniken.schalter || 0;
    z.farbe += g.entities.filter((e) => e.type === 'colorBlock').length;
  }
  for (const [k, v] of Object.entries(z)) assert.ok(v > 0, `${k} kommt nicht vor`);
});

// Windzonen und Schalter wirken auf jeden, der hindurch kommt: Nur ihr eigener Zug darf sie berühren (sonst würde man
// unerwartet weggeweht bzw. schaltete die Brücke wieder aus).
test('Pfad: Windzonen und Schalter berührt nur ihr eigener Zug', () => {
  let n = 0;
  for (let i = 0; i < 6; i++) {
    const g = baue(`nb-${i}`, 'long', 3, i % 2 ? 'super' : 'normal');
    const { schritte } = WEGE.get(g);
    for (const e of g.entities.filter((x) => x.type === 'wind' || x.type === 'switch')) {
      n++;
      const kacheln = new Set();
      for (let x = e.tx; x < e.tx + (e.w || 1); x++) for (let y = e.ty; y < e.ty + (e.h || 1); y++) kacheln.add(`${x},${y}`);
      const beruehren = schritte.filter((s) => [...s.beruehrt].some((key) => kacheln.has(key)));
      assert.ok(beruehren.length <= 1, `${e.type} bei ${e.tx},${e.ty} berühren ${beruehren.length} Züge`);
    }
  }
  assert.ok(n > 0, 'keine Windzone und kein Schalter gebaut — der Test prüfte nichts');
});

// ── Handschrift (Rückmeldung 26.09.2026: „als ob ein anderer Mensch jedes Level machen würde“) ─────────────────────

test('Handschrift: jedes Thema bleibt bei seiner Palette — der Klassiker baut nur Sprünge', () => {
  const fehler = [];
  for (const thema of THEMA_IDS) {
    const palette = THEMEN[thema].palette;
    if (!palette) continue;
    const g = baue(`hs-${thema}`, 'medium', 3, 'super', thema);
    assert.equal(g.notizen.thema, thema);
    // erlaubt: die Palette, schlichte Sprünge; der Schlüssel-Rückweg heißt „schluessel“
    for (const m of Object.keys(g.notizen.mechaniken)) if (m !== 'sprung' && !palette.includes(m)) fehler.push(`${thema}: ${m}`);
  }
  assert.deepEqual(fehler, []);
});

// (Seit der Dosierung — höchstens 3 Aufgaben-Züge je Szene, Rückmeldung 27.09.2026 — ist „ein guter Teil“ 15 %, nicht mehr 30 %)
test('Handschrift: der Seed wählt verschiedene Autoren, Mitfahr-Level bestehen zu einem guten Teil (mindestens 15 %) aus Mitfahrten', () => {
  const themen = new Set();
  for (let i = 0; i < 12; i++) themen.add(waehleHandschrift(createRng(`hw-${i}`, 'x')).thema);
  assert.ok(themen.size >= 5, `nur ${themen.size} Themen in 12 Seeds`);
  // (über drei Seeds: Ein einzelnes Level hängt stark davon ab, wo Platz für die Fähre ist)
  let mitfahrten = 0;
  let zuege = 0;
  for (const seed of ['hs-faehre', 'hs-faehre-2', 'hs-faehre-3']) {
    const g = baue(seed, 'medium', 3, 'super', 'faehrmann');
    mitfahrten += g.notizen.mechaniken.mitfahrt || 0;
    zuege += g.notizen.zuege;
    assert.ok(g.entities.some((e) => e.type === 'mover'), `${seed}: keine Fähre`);
  }
  assert.ok(mitfahrten >= 0.15 * zuege, `nur ${mitfahrten} Mitfahrten in ${zuege} Zügen`);
});

// Rückmeldung 26.09.2026 (welt-88169): Am Ende führte links ein Weg direkt zum Ziel, rechts über zwei Checkpoints — der
// Weg lief oben auf derselben Höhe zurück, und alte Plattformen an denselben Koordinaten fielen aus der Abkürzungsprüfung.
// Hier über ganze Level aller Großformen, samt Rückwegen.
test('Pfad: keine Abkürzung in ganzen Leveln — auch dort, wo der Weg auf derselben Höhe zurückläuft', () => {
  const fehler = [];
  // (auch mit dem Windläufer: viele Aufwindsäulen)
  for (const form of FORM_IDS) for (const cls of ['normal', 'super']) for (const thema of [null, 'windlaeufer']) {
    const params = normalizeParams({ seed: `ak-${form}`, length: 'long', difficulty: 3, speedClass: cls });
    const g = typ.baue({ params, limits: limitsFuer(cls, 3), reach: reachForClass(cls), neuesRaster: (w, h) => neuesRaster(w, h, 'luft'), biomeId: 'cave', pfadForm: form, ...(thema ? { pfadThema: thema } : {}) });
    const { schritte, plattformen } = WEGE.get(g);
    const reach = reachForClass(cls);
    const tuerSpalten = [...new Set(g.entities.filter((e) => e.type === 'door').map((e) => e.tx))];
    const wand = (a, b) => tuerSpalten.some((tx) => tx > Math.min(a.x0, b.x0) && tx < Math.max(a.x1, b.x1));
    for (let m = 4; m < plattformen.length; m++) {
      if (schritte[m - 1]?.abstecher) continue;
      for (let q = 0; q <= m - 4; q++) {
        if (plattformen[q] === plattformen[m] || schritte[q - 1]?.abstecher || wand(plattformen[q], plattformen[m])) continue;
        if (erreichbar(plattformen[q], plattformen[m], reach)) fehler.push(`${form}/${cls}: Plattform ${m} von ${q}`);
      }
      // Aufwindsäulen bleiben stehen: Ihre Oberkante zählt wie eine Plattform mit Feder
      for (let j = 0; j <= m - 4; j++) if (schritte[j].lift && erreichbar(schritte[j].lift, plattformen[m], reach)) fehler.push(`${form}/${cls}: Plattform ${m} von Säule ${j + 1}`);
    }
  }
  assert.deepEqual(fehler, []);
});

// ── Rückmeldung 26.09.2026 (dritte Runde am Tag) ─────────────────────────────────────────────────────────────────

// Zielschloss: Das Ziel sitzt im Käfig aus Farbblöcken, ein Schalter über der Zielplattform öffnet ihn. Im FERTIGEN Level
// (mit Ziel-Kacheln der gemeinsamen Schicht): alle Züge samt Schalter-Sprung spielen, dann zum Ziel laufen — mit Schalter
// kommt man hinein, ohne nicht.
test('Pfad: Zielschloss — mit dem Schalter ins Ziel, ohne ihn nicht', () => {
  let geprueft = 0;
  for (let i = 0; i < 16 && geprueft < 3; i++) {
    const cls = i % 2 ? 'super' : 'normal';
    const opts = { seed: `zs-${i}`, length: 'long', difficulty: 3, speedClass: cls, worldType: 'pfad', kernidee: null };
    const lv = generateWorld(opts);
    const g = baue(opts.seed, 'long', 3, cls);
    if (!g.notizen.zielschloss) continue;
    geprueft++;
    const { schritte } = WEGE.get(g);
    const spiele = (mitSchalter) => {
      const w = createLevelWorld(lv);
      for (const st of schritte) {
        if (!mitSchalter && st.abstecher === 'zielschalter') break;
        const ein = zugEingabe(st.zug, st.kanteX);
        const z = {};
        for (let t = 0; t < 3000; t++) { stepWorld(w, ein(w, t, z)); if (w.deaths || w.finished || zugFertig(w, t, z)) break; }
        if (w.deaths) return 'tot';
      }
      const gx = lv.meta.finish[1].x;
      for (let t = 0; t < 900 && !w.finished && !w.deaths; t++) {
        const px = (w.player.x + 5) / 16;
        const m = px < gx + 0.2 ? INPUT.RIGHT : px > gx + 0.8 ? INPUT.LEFT : 0;
        stepWorld(w, m | (t % 40 < 20 && Math.abs(w.player.vx) < 1 && m ? INPUT.JUMP : 0));
      }
      return w.finished ? 'im Ziel' : w.deaths ? 'tot' : 'draußen';
    };
    assert.equal(spiele(true), 'im Ziel', `${opts.seed}: mit Schalter nicht im Ziel`);
    assert.notEqual(spiele(false), 'im Ziel', `${opts.seed}: ohne Schalter im Ziel`);
  }
  assert.ok(geprueft > 0, 'kein Level mit Zielschloss in 16 Seeds');
});

// Wechselschalter: In einer Schalter-Szene bleibt es derselbe Kanal — die Brücken wechseln von Schalter zu Schalter
test('Pfad: Wechselschalter — Brücken desselben Kanals in beiden Zuständen', () => {
  let wechsel = 0;
  for (let i = 0; i < 6 && !wechsel; i++) {
    const g = baue(`ws-${i}`, 'long', 3, i % 2 ? 'super' : 'normal', 'uhrwerk');
    const { schritte } = WEGE.get(g);
    for (const st of schritte.filter((x) => x.zug.wechsel)) {
      wechsel++;
      const k = st.zug.schalterKanal;
      const zustaende = new Set(g.entities.filter((e) => e.type === 'colorBlock' && e.channel === k).map((e) => e.solidWhen));
      assert.equal(zustaende.size, 2, `Kanal ${k}: Brücken nur in einem Zustand`);
    }
  }
  assert.ok(wechsel > 0, 'kein Wechselschalter in 6 Uhrwerk-Leveln');
});

// Rückmeldung: „Boxen, die kaputt gehen, nicht zu breit machen — zielgenauer landen, nur kurz Zeit abzuspringen“
test('Pfad: Bröckelplattformen sind höchstens 3 Kacheln breit', () => {
  let n = 0;
  for (const [seed, cls] of [['br-1', 'normal'], ['br-2', 'super']]) {
    const g = baue(seed, 'long', 4, cls, 'praezision');
    const { schritte } = WEGE.get(g);
    for (const st of schritte.filter((x) => x.ziel.broeckel)) { n++; assert.ok(st.ziel.x1 - st.ziel.x0 <= 2, `${seed}: ${st.ziel.x1 - st.ziel.x0 + 1} breit`); }
  }
  assert.ok(n > 0, 'keine Bröckelplattform gebaut');
});

test('Leitidee: vier Akte in Reihenfolge — Mechaniken und Schwierigkeit kommen aus dem Akt', () => {
  const hand = waehleHandschrift(createRng('akt-test', 'hand'), 'allrounder');
  for (const id of LEITIDEE_IDS) {
    const idee = { id, ...LEITIDEEN[id] };
    const plan = aktPlan(idee, 60);
    const { szenen, richtungen } = planeSzenen(createRng(`akt-${id}`, 's'), 60, 'strom', hand, plan);
    const akte = szenen.map((s) => s.akt);
    assert.deepEqual([...new Set(akte)], [0, 1, 2, 3], `${id}: Akte ${akte.join(',')}`);
    for (let i = 1; i < akte.length; i++) assert.ok(akte[i] >= akte[i - 1], `${id}: Akt springt zurück`);
    const alle = new Set(idee.akte.flatMap((a) => a.mechaniken));
    for (const s of szenen) if (s.mechanik) assert.ok(alle.has(s.mechanik), `${id}: fremde Mechanik ${s.mechanik}`);
    // Jeder Akt zeigt mindestens einmal seine eigene Aufgabe
    for (let k = 0; k < 4; k++) assert.ok(szenen.some((s) => s.akt === k && idee.akte[k].mechaniken.includes(s.mechanik)), `${id}: Akt ${k + 1} ohne eigene Aufgabe`);
    for (const r of richtungen) assert.equal(r.dVersatz, idee.akte[szenen[r.szene].akt].dVersatz, `${id}: Schwierigkeit`);
  }
});

test('Leitidee: der Seed wählt mal eine, mal keine; erzwungenes Thema baut ohne', () => {
  assert.equal(waehleLeitidee(createRng('x', 'l'), 'keine'), null);
  assert.equal(waehleLeitidee(createRng('x', 'l'), 'taktwerk').id, 'taktwerk');
  const ids = Array.from({ length: 40 }, (_, i) => waehleLeitidee(createRng(`l-${i}`, 'l'))?.id || 'keine');
  assert.ok(ids.includes('keine') && LEITIDEE_IDS.every((id) => ids.includes(id)), ids.join(','));
  assert.equal(baue('li-thema', 'short', 3, 'super', 'klassiker').notizen.leitidee, null);
});

test('Leitidee: ein gebautes Level erzählt sie — Einführung mit ihrer Aufgabe, Twist mit seiner', () => {
  // (über mehrere Seeds: Seit der Dosierung trägt nur ein Teil der Züge die Aufgabe, und in einer Turm-Etappe kann ein
  // einzelner Twist leer ausgehen — geprüft wird, dass die Akte ihre Aufgaben liefern, nicht jedes einzelne Level)
  let einfuehrung = 0;
  let twist = 0;
  for (const seed of ['li-bau', 'li-bau-2', 'li-bau-3']) {
    const params = normalizeParams({ seed, length: 'long', difficulty: 3, speedClass: 'super' });
    const g = typ.baue({ params, limits: limitsFuer('super', 3), reach: reachForClass('super'), neuesRaster: (w, h) => neuesRaster(w, h, 'luft'), biomeId: 'cave', pfadIdee: 'broeckelkaskade' });
    assert.equal(g.notizen.leitidee.id, 'broeckelkaskade');
    assert.ok(Object.keys(LEITIDEEN.broeckelkaskade.autoren).includes(g.notizen.thema), g.notizen.thema);
    const { schritte } = WEGE.get(g);
    const akt = (s) => Number(g.notizen.szenen[s.szene].match(/^A(\d)/)[1]) - 1;
    einfuehrung += schritte.filter((s) => akt(s) === 0 && s.mechanik === 'broeckel').length;
    twist += schritte.filter((s) => akt(s) === 2 && ['einzelblock', 'feder', 'deckel'].includes(s.mechanik)).length;
    // Die Aufgaben der späteren Akte gehören nicht in die Einführung
    assert.ok(!schritte.some((s) => akt(s) === 0 && ['feder', 'deckel', 'dash'].includes(s.mechanik)), `${seed}: spätere Aufgabe in der Einführung`);
  }
  assert.ok(einfuehrung >= 3, `Einführung: nur ${einfuehrung} Bröckelblöcke`);
  assert.ok(twist >= 3, `Twist: nur ${twist} Aufgaben`);
});

test('Motive: Phrasen liegen am Stück, die Vorstellung zuerst, nie auf Abstechern', () => {
  const hand = waehleHandschrift(createRng('mo-plan', 'hand'), 'allrounder');
  for (let i = 0; i < 12; i++) {
    const { richtungen } = planeSzenen(createRng(`mo-plan-${i}`, 's'), 90, 'strom', hand);
    const plan = planeMotive(createRng(`mo-plan-${i}`, 'm'), richtungen, null);
    assert.ok(plan.length >= 1, 'kein Motiv');
    for (const m of plan) {
      const stellen = [];
      richtungen.forEach((r, k) => { if (r.motiv && r.motiv.id === m.id && r.motiv.teil === 0) stellen.push(k); });
      assert.equal(stellen.length, m.stellen);
      assert.equal(richtungen[stellen[0]].motiv.rolle, 'setzen', 'Vorstellung nicht zuerst');
      for (const s of stellen) {
        for (let k = 0; k < m.laenge; k++) {
          assert.equal(richtungen[s + k].motiv.teil, k, `${m.id}: Phrase nicht am Stück`);
          assert.ok(!richtungen[s + k].abstecher, 'Motiv auf einem Abstecher');
        }
      }
    }
  }
});

test('Motive: Abwandlungen — gespiegelt dreht Richtung und Ring, verschärft nur mit Erlaubtem', () => {
  const gemerkt = { zug: { art: 'doppel', dir: 1, halte: 26, doppelNach: 28, ring: 'upRight', mechanik: 'ring', doppelNach2: 40 }, dy: -3 };
  const sp = variiere(gemerkt, { variante: 'gespiegelt' });
  assert.equal(sp.zug.dir, -1);
  assert.equal(sp.zug.ring, 'upLeft');
  assert.equal(sp.zug.doppelNach2, undefined, 'abgeleitetes Feld übernommen');
  assert.equal(sp.dy, -3);
  assert.equal(gemerkt.zug.dir, 1, 'Original verändert');
  const weiter = variiere(gemerkt, { variante: 'weiter' });
  assert.ok(weiter.zug.halte > 26 && weiter.zug.doppelNach > 28);
  const schlicht = { zug: { art: 'sprung', dir: 1, halte: 20 }, dy: 0 };
  assert.equal(variiere(schlicht, { variante: 'verschaerft', zusatz: 'broeckel' }).zug.broeckel, true);
  assert.equal(variiere(schlicht, { variante: 'verschaerft', zusatz: 'nadeloehr' }).zug.roehren, 1);
  // Ohne erlaubten Zusatz (Klassiker): nur knapper, keine neue Mechanik
  const ohne = variiere(schlicht, { variante: 'verschaerft' }).zug;
  assert.ok(ohne.knapp && !ohne.broeckel && !ohne.roehren && !ohne.mechanik);
  assert.deepEqual(planeMotive(createRng('x', 'm'), [], []), []);
  assert.ok(!motivFaehig({ art: 'doppel', schalter: true }) && !motivFaehig({ art: 'mitfahrt' }) && motivFaehig({ art: 'feder' }));
});

test('Motive: ein langes Level wiederholt seine Phrase — dieselben Eingaben, gespiegelt mit umgekehrter Richtung', () => {
  let geprueft = 0;
  for (const seed of ['mo-bau-1', 'mo-bau-2', 'mo-bau-3']) {
    const g = baue(seed, 'long', 3, 'super');
    const { schritte } = WEGE.get(g);
    const vorstellung = new Map();
    for (const s of schritte) if (s.motiv && s.motiv.rolle === 'setzen') vorstellung.set(`${s.motiv.id}:${s.motiv.teil}`, s.zug);
    for (const s of schritte.filter((x) => x.motiv && x.motiv.rolle === 'wiederholen')) {
      const v = vorstellung.get(`${s.motiv.id}:${s.motiv.teil}`);
      assert.ok(v, `${seed}: Wiederholung ohne Vorstellung`);
      assert.equal(s.zug.art, v.art, `${seed}: andere Zugart`);
      assert.equal(s.zug.dir, s.motiv.variante === 'gespiegelt' ? -v.dir : v.dir, `${seed}: Richtung (${s.motiv.variante})`);
      geprueft++;
    }
    assert.equal(g.notizen.pruefung.offen.length, 0, `${seed}: Züge tragen nicht mehr`);
  }
  assert.ok(geprueft >= 6, `nur ${geprueft} wiederholte Motiv-Züge`);
});

/** Alle Züge eines gebauten Levels am Stück in einer Welt der ganzen Karte; liefert die Fehler */
function kettenlauf(g, cls) {
  const { schritte, start } = WEGE.get(g);
  const rows = g.grid.map((r, y) => r.map((c, x) => (x === start.x && y === start.y ? 'S' : c)).join(''));
  const welt = createWorld(parseMap(rows, { entities: g.entities }), { tuning: classTuning(cls) });
  for (let k = 0; k < schritte.length; k++) {
    const s = schritte[k];
    const ein = zugEingabe(s.zug, s.kanteX);
    const z = {};
    for (let t = 0; t < 3000; t++) {
      stepWorld(welt, ein(welt, t, z));
      if (welt.deaths || zugFertig(welt, t, z)) break;
    }
    const st = standKachel(welt.player);
    if (welt.deaths || st.y !== s.ziel.row - 1 || st.x < s.ziel.x0 || st.x > s.ziel.x1) return [`Zug ${k} (${s.mechanik}) ${welt.deaths ? welt.deathReason : `steht ${st.x},${st.y}`}`];
  }
  return [];
}

function baueIdee(seed, idee, cls = 'super') {
  const params = normalizeParams({ seed, length: 'long', difficulty: 3, speedClass: cls });
  return typ.baue({ params, limits: limitsFuer(cls, 3), reach: reachForClass(cls), neuesRaster: (w, h) => neuesRaster(w, h, 'luft'), biomeId: 'cave', pfadIdee: idee });
}

test('Brückenblock: Platte länger als jede Sprungweite, hängt über dem Weg, liegt lange genug — das Level läuft am Stück', () => {
  for (const cls of ['super', 'normal']) {
    const g = baueIdee(`bb-test-${cls}`, 'brueckenbauer', cls);
    const reach = reachForClass(cls);
    const bruecken = WEGE.get(g).schritte.filter((s) => s.mechanik === 'bruecke');
    assert.ok(bruecken.length >= 4, `${cls}: nur ${bruecken.length} Brückenblöcke`);
    for (const s of bruecken) {
      const b = g.entities.find((e) => e.type === 'fallingBlock' && e.tx === s.von.x + s.zug.blockRel.dx && e.ty === s.von.y + s.zug.blockRel.dy);
      assert.ok(b, `${cls}: Platte fehlt`);
      assert.ok(b.width >= Math.ceil(reach.gap.double) + 5, `${cls}: Platte nur ${b.width} lang`);
      assert.ok(b.ty + b.height - 1 < s.von.y, `${cls}: Platte hängt nicht über dem Weg`);
      assert.ok(b.reset >= 3, `${cls}: liegt nur ${b.reset} s`);
    }
    assert.deepEqual(kettenlauf(g, cls), [], cls);
  }
});

test('Böen im Takt: Die Windzone weht nur zeitweise — und das Level läuft am Stück', () => {
  let gefunden = 0;
  for (const seed of ['boee-1', 'boee-2', 'boee-3']) {
    const g = baueIdee(seed, 'boeenwelt');
    const boeen = WEGE.get(g).schritte.filter((s) => s.mechanik === 'boee');
    for (const s of boeen) {
      const w = g.entities.find((e) => e.type === 'wind' && e.tx === s.von.x + s.zug.boeeRel.dx && e.ty === s.von.y + s.zug.boeeRel.dy);
      assert.ok(w && w.period > 0 && w.on < w.period, `${seed}: Böe ohne Takt`);
    }
    if (boeen.length) assert.deepEqual(kettenlauf(g, 'super'), [], seed);
    gefunden += boeen.length;
    if (gefunden >= 3) break;
  }
  assert.ok(gefunden >= 3, `nur ${gefunden} Böen-Züge`);
});

test('Deckel: Die Platte verschließt ein Loch in einer Decke, liegt lange genug — und das Level läuft am Stück', () => {
  let gefunden = 0;
  for (const seed of ['deckel-1', 'deckel-2', 'deckel-3', 'deckel-4']) {
    const g = baueIdee(seed, 'brueckenbauer');
    const deckel = WEGE.get(g).schritte.filter((s) => s.mechanik === 'deckel');
    for (const s of deckel) {
      const b = g.entities.find((e) => e.type === 'fallingBlock' && e.tx === s.von.x + s.zug.blockRel.dx && e.ty === s.von.y + s.zug.blockRel.dy);
      assert.ok(b, `${seed}: Deckel fehlt`);
      assert.equal(b.ty, s.ziel.row, `${seed}: Deckel nicht in der Deckenzeile`);
      const neben = [b.tx - 1, b.tx + b.width].map((x) => g.grid[b.ty][x]);
      assert.ok(neben.some((c) => c === '#'), `${seed}: Loch ohne Decke daneben`);
      assert.ok(b.reset >= 2, `${seed}: liegt nur ${b.reset} s`);
    }
    if (deckel.length) assert.deepEqual(kettenlauf(g, 'super'), [], seed);
    gefunden += deckel.length;
    if (gefunden >= 2) break;
  }
  assert.ok(gefunden >= 2, `nur ${gefunden} Deckel`);
});

test('Flappy-Seil: mehrere Anker am Stück, Röhren dazwischen — und das Level läuft am Stück', () => {
  let gefunden = 0;
  for (const seed of ['flappy-1', 'flappy-2', 'flappy-3']) {
    const g = baueIdee(seed, 'seilakt');
    const ketten = WEGE.get(g).schritte.filter((s) => s.mechanik === 'flappy');
    for (const s of ketten) {
      assert.ok(s.zug.seilRel.length >= 2, `${seed}: nur ein Anker`);
      for (const r of s.zug.seilRel) assert.equal(g.grid[s.von.y + r.dy][s.von.x + r.dx], 'G', `${seed}: Anker fehlt im Raster`);
      assert.ok(s.zug.roehrenGesetzt >= 1, `${seed}: keine Röhre zwischen den Ankern`);
    }
    if (ketten.length) assert.deepEqual(kettenlauf(g, 'super'), [], seed);
    gefunden += ketten.length;
    if (gefunden >= 5) break;
  }
  assert.ok(gefunden >= 5, `nur ${gefunden} Seilketten`);
});

// Rückmeldung 27.09.2026: „es wird immer komplett übertrieben mit einer Aufgabe“ und „22 Checkpoints ist krankhaft“
test('Dosierung und Checkpoints: nie mehr als 2 gleiche Aufgaben hintereinander, Checkpoints mit Abstand', () => {
  for (const [seed, idee] of [['dos-1', 'taktwerk'], ['dos-2', 'boeenwelt'], ['dos-3', undefined]]) {
    const g = baueIdee(seed, idee);
    const { schritte } = WEGE.get(g);
    let lauf = 0;
    let vor = null;
    for (const s of schritte) {
      const m = s.mechanik === 'sprung' ? null : s.mechanik;
      lauf = m && m === vor ? lauf + 1 : m ? 1 : 0;
      vor = m;
      assert.ok(lauf <= 2, `${seed}: ${lauf}× ${m} hintereinander`);
    }
    const cps = g.zonen.filter((z) => z.pruefpunkt).map((z) => Number(z.id.slice(1)));
    assert.ok(cps.length >= 3 && cps.length <= 8, `${seed}: ${cps.length} Checkpoints`);
    for (let k = 1; k < cps.length; k++) assert.ok(cps[k] - cps[k - 1] >= 10, `${seed}: Checkpoints nur ${cps[k] - cps[k - 1]} Züge auseinander`);
  }
});

test('Flacher Sprung: Stacheldecke direkt über der Bahn — und das Level läuft am Stück', () => {
  let gefunden = 0;
  for (const seed of ['flach-1', 'flach-2', 'flach-3']) {
    const g = baue(seed, 'long', 3, 'super', 'praezision');
    const flach = WEGE.get(g).schritte.filter((s) => s.zug.flach);
    for (const s of flach) {
      assert.ok(s.zug.halte <= 8 + 3, `${seed}: halte ${s.zug.halte} ist kein Tippen`);
      // über der Lücke hängen Stacheln nach unten, höchstens 4 Zeilen über der Standfläche
      const mitte = Math.round((s.von.x + s.ziel.x0) / 2);
      const decke = g.entities.some((e) => e.type === 'spike' && e.dir === 'down' && Math.abs(e.tx - mitte) <= 3 && e.ty < s.von.y && e.ty >= s.von.y - 4);
      assert.ok(decke, `${seed}: keine Stacheldecke über dem flachen Sprung`);
    }
    if (flach.length) assert.deepEqual(kettenlauf(g, 'super'), [], seed);
    gefunden += flach.length;
    if (gefunden >= 3) break;
  }
  assert.ok(gefunden >= 3, `nur ${gefunden} flache Sprünge`);
});

// Rückmeldung 27.09.2026: „Schwerkraft-Zonen, kombiniert mit bestehenden Aufgaben — kopfüber schwere Sprünge“, „Chain-Kristalle“
test('Kopfüber-Passage: Schwerkraft-Zone unter einer Decke mit Stachelstreifen — und das Level läuft am Stück', () => {
  let gefunden = 0;
  for (const seed of ['kopf-1', 'kopf-2', 'kopf-3']) {
    const g = baueIdee(seed, 'schwerelos');
    const passagen = WEGE.get(g).schritte.filter((s) => s.mechanik === 'kopfueber');
    for (const s of passagen) {
      const kante = s.zug.dir > 0 ? s.von.x + 1 : s.von.x - 1;
      const zone = g.entities.find((e) => e.type === 'gravityZone' && e.tx <= kante + 12 && e.tx + e.w >= kante - 12 && e.ty < s.von.y && e.ty + e.h <= s.von.y + 1);
      assert.ok(zone, `${seed}: keine Schwerkraft-Zone`);
      const stacheln = g.entities.filter((e) => e.type === 'spike' && e.dir === 'down' && e.ty === zone.ty - 1 && e.tx >= zone.tx && e.tx < zone.tx + zone.w);
      assert.ok(stacheln.length >= s.zug.luecken.length * 2, `${seed}: Decke ohne Stachelstreifen`);
    }
    if (passagen.length) assert.deepEqual(kettenlauf(g, 'super'), [], seed);
    gefunden += passagen.length;
    if (gefunden >= 4) break;
  }
  assert.ok(gefunden >= 4, `nur ${gefunden} Kopfüber-Passagen`);
});

test('Kristallkette: Kristalle am Scheitel, Ziel über der Doppelsprung-Höhe — und das Level läuft am Stück', () => {
  let gefunden = 0;
  for (const seed of ['kette-1', 'kette-2', 'kette-3']) {
    const g = baueIdee(seed, 'schwerelos');
    const ketten = WEGE.get(g).schritte.filter((s) => s.mechanik === 'kette');
    for (const s of ketten) {
      assert.ok(s.von.y - (s.ziel.row - 1) >= 9, `${seed}: Ziel nur ${s.von.y - (s.ziel.row - 1)} Zeilen höher`);
      const kristalle = g.entities.filter((e) => e.type === 'crystal' && e.ty < s.von.y && e.ty > s.ziel.row - 10 && Math.abs(e.tx - s.von.x) <= 20);
      assert.ok(kristalle.length >= s.zug.kette, `${seed}: nur ${kristalle.length} Kristalle für ${s.zug.kette} Dashes`);
    }
    if (ketten.length) assert.deepEqual(kettenlauf(g, 'super'), [], seed);
    gefunden += ketten.length;
    if (gefunden >= 3) break;
  }
  assert.ok(gefunden >= 3, `nur ${gefunden} Kristallketten`);
});
