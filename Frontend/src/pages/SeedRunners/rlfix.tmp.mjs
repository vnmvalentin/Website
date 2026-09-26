import { CHUNK_BY_ID, generateSingle, createLevelWorld } from './gen/index.js';
import { stepWorld } from './sim/world.js';
import { INPUT } from './sim/inputBits.js';
import { TILE, PLAYER_W } from './sim/config.js';
const { RIGHT: R, JUMP: J } = INPUT;
const lang = (b) => { let x = 0, c = 0; for (const v of b) { c = v ? c + 1 : 0; x = Math.max(x, c); } return x; };
// Menschlicher Weg: Sprung in den Ring (Haltedauer h), danach nur rechts halten — und Variante mit Doppelsprung (lang gehalten)
for (const cls of ['normal', 'fast', 'super']) for (const seed of ['rt-0', 'rt-1']) {
  const lv = generateSingle(CHUNK_BY_ID['ring-launch'], { seed, length: 'short', speedClass: cls, biome: 'meadow' });
  const cx = lv.placements.find((p) => p.kind === 'chunk').x0; const lauf = { normal: 139, fast: 182, super: 231 }[cls];
  const erg = [];
  for (const mitDJ of [false, true]) { let best = 0;
    for (const halte of [8, 12, 16, 20, 30]) { const bits = [];
      for (let o = -60; o <= 8; o += 2) { const w = createLevelWorld(lv); let an = null, ring = null, ok = 0; let u = 0;
        const e = w.emit.bind(w); w.emit = (n, d) => { if (n === 'ring' && ring === null) ring = u; return e(n, d); };
        for (; u < 2400; u++) { const p = w.player; if (an === null && p.x + PLAYER_W >= (cx + 10) * TILE + o) an = u;
          let m = R; if (an !== null && u - an < halte) m |= J; if (mitDJ && ring !== null && u - ring >= 40 && u - ring < 100) m |= J;
          stepWorld(w, m); if (w.deaths) break; if (w.finished) { ok = 1; break; } }
        bits.push(ok); }
      best = Math.max(best, lang(bits) * 2); }
    erg.push(`${mitDJ ? 'mit Doppelsprung' : 'nur Ring'}: ${(best / lauf * 1000).toFixed(0)} ms`); }
  console.log(cls.padEnd(6), seed, erg.join(' | '));
}
