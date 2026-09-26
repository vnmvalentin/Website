// Verzeihlichkeit: Jeder Tastendruck (Sprung/Dash/Greifen) des Solver-Wegs wird um o Ticks verschoben; danach plant der
// Solver NEU (Strahlbreite 150). Gelingt das, war die Ungenauigkeit verzeihlich. Je Druck: Fenster = zusammenhängende
// verzeihliche Verschiebungen um 0 (früh nur, solange man im selben Boden/Luft-Zustand war).
// Aufruf: node verzeihlich.mjs chunk <id> <klasse>   |   node verzeihlich.mjs stockwerk <art> <klasse> <d> [seed]
const ROOT = new URL('../../../', import.meta.url).href;
const { CHUNK_BY_ID, generateSingle, createLevelWorld } = await import(ROOT + 'gen/index.js');
const { solveLevel, cloneWorld } = await import(ROOT + 'gen/solver.js');
const { stepWorld, createWorld } = await import(ROOT + 'sim/world.js');
const { parseMap } = await import(ROOT + 'sim/tilemap.js');
const { classTuning } = await import(ROOT + 'sim/classes.js');
const { INPUT } = await import(ROOT + 'sim/inputBits.js');
const { TILE } = await import(ROOT + 'sim/config.js');
const { createRng } = await import(ROOT + 'sim/rng.js');
const { reachForClass } = await import(ROOT + 'sim/reach.js');
const { SAFETY } = await import(ROOT + 'gen/generator.js');
const ST = await import(ROOT + 'gen/world/motive/stockwerke.js');

const AKTION = INPUT.JUMP | INPUT.DASH | INPUT.GRAPPLE;
const VERSATZ = [4, 8, 12];

function welt(level) { return createWorld(parseMap(level.rows, { entities: level.entities }), { tuning: classTuning(level.params.speedClass) }); }

/** Kann der Solver von diesem Zustand aus noch ins Ziel? (Zustand → Mini-Level geht nicht; also: Solver mit Startwelt) */
function rettbar(level, w, opts) {
  // solveLevel baut die Welt selbst; wir geben ihr einen Startzustand über opts.startWelt (siehe Patch unten)
  const r = solveLevel(level, { ...opts, startWelt: w });
  return r.solved;
}

export function pruefe(level, opts = {}) {
  const basis = solveLevel(level, opts);
  if (!basis.solved) return { ungeloest: true };
  const inp = basis.inputs;
  const druecke = [];
  for (let t = 0; t < inp.length; t++) if (inp[t] & ~(t ? inp[t - 1] : 0) & AKTION) druecke.push(t);
  // Zustände vor jedem nötigen Tick
  const noetig = new Set(); for (const t of druecke) for (let o = -12; o <= 0; o++) noetig.add(t + o);
  const st = []; const w = welt(level);
  for (let t = 0; t <= inp.length; t++) { if (noetig.has(t)) st[t] = cloneWorld(w); if (t < inp.length) stepWorld(w, inp[t]); }
  const erg = [];
  for (const t of druecke) {
    if (!st[t]) continue;
    const boden = st[t].player.onGround;
    const versuch = (o) => {
      let v; let seq;
      if (o < 0) { if (!st[t + o] || st[t + o].player.onGround !== boden) return null; v = cloneWorld(st[t + o]); seq = inp.slice(t, t + 30); }
      else { v = cloneWorld(st[t]); seq = Array(o).fill((inp[t - 1] ?? 0) & ~AKTION).concat(inp.slice(t, t + 30)); }
      for (const m of seq) { stepWorld(v, m); if (v.deaths) return false; if (v.finished) return true; }
      return rettbar(level, v, { ...opts, maxSteps: Math.min(400, opts.maxSteps ?? 400) });
    };
    let spaet = 0; for (const o of VERSATZ) { if (versuch(o)) spaet = o; else break; }
    let frueh = 0; let fruehMoeglich = true;
    for (const o of VERSATZ) { const r = versuch(-o); if (r === null) { fruehMoeglich = false; break; } if (r) frueh = o; else break; }
    erg.push({ t, taste: inp[t] & AKTION, x: Math.round(st[t].player.x / TILE), y: Math.round(st[t].player.y / TILE), frueh: fruehMoeglich ? frueh : '–', spaet });
  }
  // eng = weder früh noch spät ≥ 4 verzeihlich, bzw. Gesamtbreite < 8 Ticks
  const eng = erg.filter((e) => (typeof e.frueh === 'number' ? e.frueh : 0) + e.spaet < 8);
  return { druecke: erg.length, eng, alle: erg };
}

// ── Stockwerk als Fenster ────────────────────────────────────────────────────
function stockwerkLevel(art, cls, d, seed) {
  const reach = reachForClass(cls); const s = SAFETY[d];
  const limits = { maxGap: Math.floor(reach.gap.jump * s), maxGapUp: Math.floor(reach.gap.double * s), maxUp: Math.floor(reach.height.double * s), maxDown: 30 };
  const motiv = ST.STOCKWERK_BY_ID[art];
  const rng = createRng(seed, 'x');
  const H = rng.intRange(motiv.hoehe[0], motiv.hoehe[1]);
  const W = 22; const WAND = 2; const einX = 8;
  const r = ST.neuerRaum(W, H);
  motiv.baue({ r, rng, limits, d, einX, seite: 'frei', erste: false, wandle: (x) => x, erlaubt: () => true });
  const OBEN = 6; const Wg = W + 2 * WAND; const Hg = OBEN + ST.DECKE + H + 3;
  const grid = Array.from({ length: Hg }, () => Array(Wg).fill('.'));
  const set = (g, x, y, ch) => { if (y >= 0 && y < Hg && x >= 0 && x < Wg) g[y][x] = ch; };
  const entities = [];
  ST.stempleStockwerk(grid, entities, r, OBEN, WAND, set);
  for (let y = OBEN + ST.DECKE + H; y < Hg; y++) for (let x = 0; x < Wg; x++) grid[y][x] = '#';
  for (let y = OBEN + ST.DECKE; y < OBEN + ST.DECKE + H; y++) for (const x of [0, 1, Wg - 2, Wg - 1]) grid[y][x] = 'I';
  grid[OBEN + ST.DECKE + H - 1][WAND + einX + 1] = 'S';
  // Ziel neben der Luke oben, auf der Seite mit mehr Platz
  const rechts = r.luke + ST.LUKE_BREITE + 2 <= W - 2;
  const zx = rechts ? WAND + r.luke + ST.LUKE_BREITE + 1 : WAND + r.luke - 2;
  grid[OBEN - 1][zx] = 'E';
  return { params: { speedClass: cls }, rows: grid.map((z) => z.join('')), entities };
}

// ── Ideen-Raum als Fenster (Startboden · Raum · Zielboden) ────────────────────
const IR = await import(ROOT + 'gen/world/motive/ideenraeume.js');
const HR = await import(ROOT + 'gen/world/motive/hoehlenraeume.js');
function raumLevel(raumId, variante, cls, d, seed) {
  const reach = reachForClass(cls); const s = SAFETY[d];
  const limits = { maxGap: Math.floor(reach.gap.jump * s), maxGapUp: Math.floor(reach.gap.double * s), maxUp: Math.floor(reach.height.double * s), maxDown: 30 };
  const m = IR.IDEEN_RAUM_BY_ID[raumId] || HR.RAUM_BY_ID[raumId];
  const inst = m.baue.call({ ...m, variante: () => variante }, { rng: createRng(seed, 'x'), limits, reach, d, fortschritt: 0.5, tier: 'normal', wandle: (x) => x, erlaubt: () => true });
  const F = HR.BODEN; const TOP = 12; const L = 12; const W = L + inst.w + 14;
  const g = Array.from({ length: TOP + inst.h + 2 }, () => Array(W).fill('.'));
  for (let y = TOP + F; y < g.length; y++) { for (let x = 0; x < L; x++) g[y][x] = '#'; for (let x = L + inst.w; x < W; x++) g[y][x] = '#'; }
  for (let y = 0; y < inst.h; y++) for (let x = 0; x < inst.w; x++) g[TOP + y][L + x] = inst.rows[y][x];
  g[TOP + F - 1][3] = 'S'; for (let i = 0; i < 3; i++) g[TOP + F - 1][L + inst.w + 6 + i] = 'E';
  return { params: { speedClass: cls }, rows: g.map((z) => z.join('')), entities: inst.entities.map(({ lx, ly, ...x }) => ({ ...x, tx: L + lx, ty: TOP + ly })) };
}

const [was, id, cls = 'normal', dArg = '3', seed = 's0'] = process.argv.slice(2);
if (was === 'chunk') {
  const level = generateSingle(CHUNK_BY_ID[id], { seed: 'vz-' + (process.env.VZSEED || '0'), length: 'short', speedClass: cls, biome: 'meadow' });
  const cx = level.placements.find((p) => p.kind === 'chunk').x0;
  const r = pruefe(level);
  console.log(JSON.stringify({ id, cls, druecke: r.druecke, ungeloest: r.ungeloest, eng: (r.eng || []).map((e) => ({ ...e, x: e.x - cx })) }));
} else if (was === 'raum') {
  const [raumId, variante] = id.split(':');
  const level = raumLevel(raumId, variante, cls, Number(dArg), seed);
  const r = pruefe(level, { geo: true, startDash: 0 });
  console.log(JSON.stringify({ raum: id, cls, d: Number(dArg), seed, druecke: r.druecke, ungeloest: r.ungeloest, eng: r.eng }));
} else if (was === 'stockwerk') {
  const level = stockwerkLevel(id, cls, Number(dArg), seed);
  const r = pruefe(level, { geo: true, startDash: 0 });
  console.log(JSON.stringify({ art: id, cls, d: Number(dArg), seed, druecke: r.druecke, ungeloest: r.ungeloest, eng: r.eng }));
}
