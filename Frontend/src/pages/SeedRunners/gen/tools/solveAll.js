// Spielt Chunk-Templates mit dem Solver durch (siehe gen/solver.js).
//
//   npm run seedrunners:solve                       alle Chunks, Klasse "normal", 2 Varianten je Chunk
//   npm run seedrunners:solve -- wall-shaft         nur diesen Chunk (mehrere IDs möglich)
//   npm run seedrunners:solve -- --class all        alle drei Tempo-Klassen
//   npm run seedrunners:solve -- --samples 6        mehr Zufallsvarianten (Dehnung, Spiegelung, Timings)
//   npm run seedrunners:solve -- --beam 300         feste Suchbreite (Standard: 150, bei Fehlschlag 400, dann 900)
//   npm run seedrunners:solve -- --biome ice        Biom festlegen (Eis vereist die Böden)
//
// Beendet mit Exit-Code 1, wenn ein Chunk nicht gelöst wurde.
import { CHUNKS } from '../chunks/index.js';
import { generateSingle } from '../generator.js';
import { solveLevel } from '../solver.js';
import { SPEED_CLASS_IDS } from '../../sim/classes.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const ids = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const classes = flag('class', 'normal') === 'all' ? SPEED_CLASS_IDS : [flag('class', 'normal')];
const samples = Number(flag('samples', 2));
const beam = flag('beam') ? Number(flag('beam')) : undefined;
const biome = flag('biome', 'meadow');

const chunks = ids.length ? CHUNKS.filter((c) => ids.includes(c.id)) : CHUNKS;
if (ids.length && chunks.length !== ids.length) {
  console.error('Unbekannte Chunk-ID:', ids.filter((id) => !CHUNKS.some((c) => c.id === id)).join(', '));
  process.exit(2);
}

let failed = 0;
let total = 0;
const t0 = Date.now();
for (const tpl of chunks) {
  for (const speedClass of classes) {
    const results = [];
    for (let s = 0; s < samples; s++) {
      const level = generateSingle(tpl, { seed: `solve-${s}`, length: 'short', speedClass, biome });
      if (!level) { results.push('n/a'); continue; }
      total++;
      const start = Date.now();
      const r = solveLevel(level, { beam });
      const sec = ((Date.now() - start) / 1000).toFixed(1);
      if (r.solved) results.push(`ok ${(r.ticks / 120).toFixed(1)}s (${sec}s Suche${r.beam > 150 ? `, Beam ${r.beam}` : ''})`);
      else { failed++; results.push(`FEHLT (${sec}s Suche${r.error ? ', ' + r.error : ''}${r.reached ? `, weiteste Stelle Kachel ${r.reached.tx}/${r.reached.ty}` : ''})`); }
    }
    const bad = results.some((r) => r.startsWith('FEHLT'));
    console.log(`${bad ? 'x' : 'v'} ${tpl.id.padEnd(20)} ${speedClass.padEnd(7)} ${results.join(' | ')}`);
  }
}
console.log(`\n${total - failed}/${total} gelöst in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
