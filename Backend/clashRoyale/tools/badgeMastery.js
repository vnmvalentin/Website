// badgeMastery.js — Baut Mastery-Abzeichen ALLER Stufen aus EINEM Screenshot (irgendeine Stufe, Hintergrund egal).
// Gedacht für neue Karten, deren Mastery-Bilder bei Supercell noch fehlen (API-Adresse liefert 404, z. B. Ronin,
// Minion Giant im Nov. 2026).
//
// So geht's: Porträt-Fläche je Stufe = Pixel, die sich zwischen den Mastery-Abzeichen verschiedener Karten
// unterscheiden (Streuung über 16 Karten); Rahmen = Median über diese Karten. Der Screenshot wird per Suche (Stufe,
// Maßstab, Versatz; grob → fein) auf den Rahmen gelegt, nur Rahmenpixel zählen. Dann wird das Porträt herausgenommen
// und in die Rahmen aller Stufen eingesetzt; vom Stern verdeckte Stellen füllt das nächste Porträt-Pixel.
// Braucht im Badge-Ordner Karten mit allen Stufen (npm run cr:badges).
//
// Aufruf (Backend): npm run cr:badge-mastery -- <screenshot.png> <BadgeName, z. B. MasteryRonin> [ausgabeOrdner] [stufen=10]
// Schreibt <BadgeName>__1 … __10.webp (überschreibt nur diese Dateien). Ergebnis bitte ansehen.
const { createRequire } = require('module');
const path = require('path');
const fs = require('fs');
const sharp = createRequire(path.join(__dirname, '../../../Frontend/package.json'))('sharp');
const D = path.join(__dirname, '../../../Frontend/src/assets/clashRoyale/badges') + path.sep;
const [shotArg, name, outArg, maxLvlArg] = process.argv.slice(2);
if (!shotArg || !/^Mastery[A-Za-z0-9_]+$/.test(name || '')) {
  console.error('Aufruf: npm run cr:badge-mastery -- <screenshot.png> <MasteryName> [ausgabeOrdner] [stufen=10]');
  process.exit(1);
}
const shotPath = path.resolve(process.env.INIT_CWD || process.cwd(), shotArg);
const outDir = outArg ? path.resolve(process.env.INIT_CWD || process.cwd(), outArg) : D;
const MAXL = Number(maxLvlArg || 10);
const N = 128;

const raw = async (f) => (await sharp(f).resize(N, N).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;

(async () => {
  const files = fs.readdirSync(D);
  const all = new Set(files);
  const cards = [...new Set(files.filter((f) => /^Mastery.+__10\.webp$/.test(f)).map((f) => f.replace(/__10\.webp$/, '')))]
    .filter((c) => Array.from({ length: MAXL }, (_, i) => `${c}__${i + 1}.webp`).every((f) => all.has(f))).slice(0, 16);
  console.log('Vorlagen-Karten:', cards.length);

  // Je Stufe: Median-Rahmen (RGBA) + Porträt-Gewicht w (0 = Rahmen, 1 = Porträt) + Bounding-Box des Porträts
  const L = {};
  for (let l = 1; l <= MAXL; l++) {
    const imgs = await Promise.all(cards.map((c) => raw(`${D}${c}__${l}.webp`)));
    const frame = Buffer.alloc(N * N * 4);
    const w = new Float32Array(N * N);
    let x0 = N, y0 = N, x1 = 0, y1 = 0;
    for (let i = 0; i < N * N; i++) {
      let sd = 0;
      for (let ch = 0; ch < 4; ch++) {
        const vals = imgs.map((b) => b[i * 4 + ch]).sort((a, b) => a - b);
        frame[i * 4 + ch] = vals[vals.length >> 1];
        if (ch < 3) { const m = vals.reduce((a, b) => a + b, 0) / vals.length; sd += Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length); }
      }
      sd /= 3;
      const v = Math.min(1, Math.max(0, (sd - 10) / 18));
      w[i] = frame[i * 4 + 3] > 20 ? v : 0;
      if (w[i] > 0.5) { const x = i % N, y = (i / N) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    L[l] = { frame, w, box: [x0, y0, x1, y1] };
  }
  console.log('Porträt-Boxen je Stufe:', Object.entries(L).map(([l, v]) => `${l}:${v.box.join(',')}`).join('  '));

  // Screenshot auf den Rahmen legen: Fehler nur auf Rahmenpixeln (w ~ 0, deckend)
  const meta = await sharp(shotPath).metadata();
  let best = { err: Infinity };
  const scaled = new Map();
  const shotAt = async (s) => {
    const key = s.toFixed(3);
    if (!scaled.has(key)) {
      const W = Math.round(meta.width * s), H = Math.round(meta.height * s);
      scaled.set(key, { W, H, sb: await sharp(shotPath).resize(W, H).removeAlpha().raw().toBuffer() });
    }
    return scaled.get(key);
  };
  // Grob: alle Stufen, Maßstab in 0,03-Schritten, Versatz in 3er-Schritten; dann fein um den Fund herum
  const search = async (levels, scales, dxs, dys, kStep) => {
  for (const l of levels) {
    const { frame, w } = L[l];
    const idx = [];
    for (let i = 0; i < N * N; i += 1) if (w[i] < 0.05 && frame[i * 4 + 3] > 230) idx.push(i);
    for (const s of scales) {
      const { W, H, sb } = await shotAt(s);
      for (const dy of dys(H)) {
        for (const dx of dxs(W)) {
          let e = 0, n = 0;
          for (let k = 0; k < idx.length; k += kStep) {
            const i = idx[k], x = i % N, y = (i / N) | 0;
            const sx = x - dx, sy = y - dy;
            if (sx < 0 || sy < 0 || sx >= W || sy >= H) { e += 120; n++; continue; }
            const p = (sy * W + sx) * 3;
            e += (Math.abs(sb[p] - frame[i * 4]) + Math.abs(sb[p + 1] - frame[i * 4 + 1]) + Math.abs(sb[p + 2] - frame[i * 4 + 2])) / 3;
            n++;
          }
          e /= n;
          if (e < best.err) best = { err: e, l, s, dx, dy, W, H };
        }
      }
    }
  }
  };
  const range = (a, b, st) => { const r = []; for (let v = a; v <= b + 1e-9; v += st) r.push(Math.round(v * 1000) / 1000); return r; };
  await search(range(1, MAXL, 1), range(0.36, 0.78, 0.03), (W) => range(-W + 40, N - 40, 3), (H) => range(-H + 40, N - 40, 3), 9);
  console.log('grob:', best.l, best.s, best.dx, best.dy, best.err.toFixed(1));
  const g = { ...best };
  best = { err: Infinity };
  await search(range(Math.max(1, g.l - 1), Math.min(MAXL, g.l + 1), 1), range(g.s - 0.03, g.s + 0.03, 0.005),
    () => range(g.dx - 5, g.dx + 5, 1), () => range(g.dy - 5, g.dy + 5, 1), 2);
  console.log('Bester Abgleich:', JSON.stringify({ ...best, err: best.err.toFixed(1), s: best.s.toFixed(2) }));

  // Porträt in Vorlagen-Koordinaten der Fundstufe
  const sb = await sharp(shotPath).resize(best.W, best.H).removeAlpha().raw().toBuffer();
  const P = Buffer.alloc(N * N * 3);
  const ok = new Uint8Array(N * N);
  const wb = L[best.l].w;
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i / N) | 0, sx = x - best.dx, sy = y - best.dy;
    if (sx < 0 || sy < 0 || sx >= best.W || sy >= best.H) continue;
    const p = (sy * best.W + sx) * 3;
    P[i * 3] = sb[p]; P[i * 3 + 1] = sb[p + 1]; P[i * 3 + 2] = sb[p + 2];
    ok[i] = wb[i] > 0.6 ? 1 : 0; // nur echte Porträt-Pixel der Fundstufe (nicht Stern/Rahmen darüber)
  }
  // Lücken (z. B. unter dem Stern) mit dem nächsten gültigen Porträt-Pixel füllen
  const okIdx = []; for (let i = 0; i < N * N; i++) if (ok[i]) okIdx.push(i);
  const fill = (x, y) => {
    let bi = -1, bd = Infinity;
    for (const i of okIdx) { const d = (i % N - x) ** 2 + (((i / N) | 0) - y) ** 2; if (d < bd) { bd = d; bi = i; } }
    return bi;
  };
  const sample = (x, y) => {
    const xi = Math.max(0, Math.min(N - 1, Math.round(x))), yi = Math.max(0, Math.min(N - 1, Math.round(y)));
    let i = yi * N + xi;
    if (!ok[i]) i = fill(xi, yi);
    return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  };

  fs.mkdirSync(outDir, { recursive: true });
  const [bx0, by0, bx1, by1] = L[best.l].box;
  for (let l = 1; l <= MAXL; l++) {
    const { frame, w, box: [x0, y0, x1, y1] } = L[l];
    const out = Buffer.from(frame);
    for (let i = 0; i < N * N; i++) {
      if (w[i] <= 0) continue;
      const x = i % N, y = (i / N) | 0;
      // Porträt-Box dieser Stufe → Porträt-Box der Fundstufe
      const u = bx0 + ((x - x0) / Math.max(1, x1 - x0)) * (bx1 - bx0);
      const v = by0 + ((y - y0) / Math.max(1, y1 - y0)) * (by1 - by0);
      const c = sample(u, v);
      for (let ch = 0; ch < 3; ch++) out[i * 4 + ch] = Math.round(w[i] * c[ch] + (1 - w[i]) * frame[i * 4 + ch]);
    }
    await sharp(out, { raw: { width: N, height: N, channels: 4 } }).webp({ quality: 85 }).toFile(path.join(outDir, `${name}__${l}.webp`));
  }
  console.log('fertig', name);
})().catch((e) => { console.error(e); process.exit(1); });
