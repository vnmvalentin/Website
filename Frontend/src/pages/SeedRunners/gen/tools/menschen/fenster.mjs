// Fenster-Prüfwerkzeug für die Ideen-Räume: Startboden · Raum · Zielboden, gelöst mit dem echten Solver.
// Aufruf: node fenster.mjs <raum> <variante> <modus> [seeds=3] [klassen=normal,fast,super] [stufen=1,2,3,4,5]
//   modus: normal | unten (oberer Weg zugemauert) | oben (unterer Weg zu/tödlich) | ohneSchluessel (Gegenprobe)
const ROOT = new URL('../../../', import.meta.url).href;
const { IDEEN_RAUM_BY_ID, PLATTE_H } = await import(ROOT + 'gen/world/motive/ideenraeume.js');
const { BODEN: F, RAUM_BY_ID } = await import(ROOT + 'gen/world/motive/hoehlenraeume.js');
const { createRng } = await import(ROOT + 'sim/rng.js');
const { reachForClass } = await import(ROOT + 'sim/reach.js');
const { SAFETY } = await import(ROOT + 'gen/generator.js');
const { solveLevel } = await import(ROOT + 'gen/solver.js');

const [raumId, variante, modus = 'normal', seedsArg = '3', klassenArg = 'normal,fast,super', stufenArg = '1,2,3,4,5'] = process.argv.slice(2);
const lim = (cls, d) => { const r = reachForClass(cls), s = SAFETY[d]; return { maxGap: Math.floor(r.gap.jump * s), maxGapUp: Math.floor(r.gap.double * s), maxUp: Math.floor(r.height.double * s), maxDown: 30 }; };

function fenster(inst) {
  const TOP = 12, L = 12, R = 14;
  const W = L + inst.w + R, Hh = TOP + inst.h + 2;
  const g = Array.from({ length: Hh }, () => Array(W).fill('.'));
  for (let y = TOP + F; y < Hh; y++) { for (let x = 0; x < L; x++) g[y][x] = '#'; for (let x = L + inst.w; x < W; x++) g[y][x] = '#'; }
  for (let y = 0; y < inst.h; y++) for (let x = 0; x < inst.w; x++) g[TOP + y][L + x] = inst.rows[y][x];
  for (let y = TOP + inst.h; y < Hh; y++) for (let x = 0; x < inst.w; x++) if (inst.rows[inst.h - 1][x] === '#') g[y][L + x] = '#';
  g[TOP + F - 1][3] = 'S';
  for (let i = 0; i < 3; i++) g[TOP + F - 1][L + inst.w + 6 + i] = 'E';
  const entities = inst.entities.map(({ lx, ly, ...s }) => ({ ...s, tx: L + lx, ty: TOP + ly }));
  return { g, entities, L, TOP };
}

function mauere(fw, inst, modus) {
  const { g, L, TOP } = fw;
  const set = (x, y, ch) => { g[TOP + y][L + x] = ch; };
  const info = inst.tpl.info;
  if (modus === 'ohneSchluessel') { for (const row of g) for (let x = 0; x < row.length; x++) if (row[x] === 'K') row[x] = '.'; return; }
  if (inst.tpl.variante === 'platte') {
    if (modus === 'unten') {
      for (const l of info.luecken) for (let k = 0; k < l.w; k++) { set(l.x + k, F - PLATTE_H, '#'); set(l.x + k, F - PLATTE_H + 1, '#'); }
      for (let y = -TOP; y < F - PLATTE_H; y++) set(info.a, y, 'I');   // bis zum Fensterrand: sonst „sieht" die Umweg-Heuristik einen Weg über die Säule
      fw.entities = fw.entities.filter((e) => !(e.type === 'spike' && e.ty === TOP + F - PLATTE_H - 1));
    }
    if (modus === 'oben') for (let x = info.schacht; x < info.schacht + 4; x++) set(x, F, '#');
  }
  if (inst.tpl.variante === 'schlucht') {
    if (modus === 'unten') fw.entities = fw.entities.filter((e) => e.type !== 'crumble');
    if (modus === 'oben') {
      for (let x = info.x0; x < info.x0 + info.span; x++) fw.entities.push({ type: 'spike', tx: L + x, ty: TOP + F + info.tief - 1 });
      for (const st of info.stufen) for (let k = 0; k < 2; k++) fw.entities.push({ type: 'spike', tx: L + st.x + k, ty: TOP + st.y - 1 });
    }
  }
}

const raum = IDEEN_RAUM_BY_ID[raumId] || RAUM_BY_ID[raumId];
raum.variante = () => variante;
const out = { raumId, variante, modus, ok: 0, fail: [], ticks: [] };
const t0 = Date.now();
for (const cls of klassenArg.split(',')) for (const d of stufenArg.split(',').map(Number)) for (let i = 0; i < Number(seedsArg); i++) {
  const ctx = { rng: createRng(`f-${raumId}-${variante}-${cls}-${d}-${i}`, 'x'), limits: lim(cls, d), reach: reachForClass(cls), d, fortschritt: 0.5, tier: 'normal', wandle: (s) => s, erlaubt: () => true };
  const inst = raum.baue(ctx);
  const fw = fenster(inst);
  if (modus !== 'normal') mauere(fw, inst, modus);
  const level = { params: { speedClass: cls }, rows: fw.g.map((r) => r.join('')), entities: fw.entities };
  let r = solveLevel(level, { geo: true, startDash: 0, maxSteps: 500 });
  if (!r.solved && modus !== 'ohneSchluessel') r = solveLevel(level, { geo: true, startDash: 0, maxSteps: 700, beam: 2500 });
  const name = `${cls}/S${d}/#${i}`;
  if (r.solved) { out.ok++; out.ticks.push(r.ticks); } else out.fail.push(`${name} reached=${JSON.stringify(r.reached)}`);
}
out.n = out.ok + out.fail.length;
out.sek = Math.round((Date.now() - t0) / 1000);
out.ticksMittel = out.ticks.length ? Math.round(out.ticks.reduce((a, b) => a + b, 0) / out.ticks.length) : null;
delete out.ticks;
console.log(JSON.stringify(out));
