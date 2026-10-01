// Emote-GIFs der CR-Minigames → animiertes WebP + Standbild (Frontend/src/assets/clashRoyale/emotes/).
//
// Aufruf (sharp ist KEINE Projekt-Abhängigkeit — einmalig in einem Hilfsordner installieren):
//   cd <hilfsordner> && npm i sharp
//   NODE_PATH=<hilfsordner>/node_modules node Backend/clashRoyale/tools/emotesBauen.cjs \
//     Frontend/src/assets/clashRoyale/emotes Frontend/src/assets/clashRoyale/emotes
// Danach neue IDs in EMOTE_IDS (Backend/clashRoyale/routes/clashRoyaleRoutes.js) eintragen.
//
// Ergebnis: animiertes WebP (192 px) + Standbild-WebP (128 px), alle gleich groß gerahmt.
// Optionaler 3. Parameter: Pfad für ein Vorschau-PNG aller Standbilder.
// • Begrenzungsrahmen = Vereinigung des sichtbaren Inhalts über ALLE Frames (Alpha > 24),
//   quadratisch gemacht und mittig — so wirkt jedes Emote ähnlich groß, egal wie viel
//   leeren Rand die GIF hatte, und nichts springt zwischen Frames.
// • Standbild = Frame mit dem meisten sichtbaren Inhalt (Frame 0 ist oft leer).
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const [src, dst, preview] = process.argv.slice(2);
const ANIM = 192, STILL = 128, PAD = 0.04; // 4 % Luft um den Inhalt
fs.mkdirSync(path.join(dst, 'anim'), { recursive: true });
fs.mkdirSync(path.join(dst, 'still'), { recursive: true });

(async () => {
  const report = [], stills = [];
  for (const file of fs.readdirSync(src).filter(f => /\.gif$/i.test(f)).sort()) {
    const id = file.replace(/\.gif$/i, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    const input = path.join(src, file);
    const meta = await sharp(input, { animated: true }).metadata();
    const { data, info } = await sharp(input, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = meta.pageHeight || info.height, P = meta.pages || 1;
    const frameBytes = W * H * 4;

    // Vereinigter Begrenzungsrahmen + Inhaltsmenge je Frame
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    const counts = [];
    for (let p = 0; p < P; p++) {
      let n = 0;
      const base = p * frameBytes;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (data[base + (y * W + x) * 4 + 3] > 24) {
          n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      counts.push(n);
    }
    if (x1 < 0) { report.push(`${id}: LEER — übersprungen`); continue; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const side = Math.ceil(Math.max(bw, bh) * (1 + 2 * PAD));
    const cx = x0 + bw / 2, cy = y0 + bh / 2;
    const left = Math.round(cx - side / 2), top = Math.round(cy - side / 2);
    // Quadrat darf über den Bildrand ragen → vorher transparent erweitern
    const ext = side;

    const frameSquare = async (p, size) => {
      const raw = data.subarray(p * frameBytes, (p + 1) * frameBytes);
      // extend und extract getrennt: in EINER sharp-Kette liefe extract vor extend
      const padded = await sharp(raw, { raw: { width: W, height: H, channels: 4 } })
        .extend({ top: ext, bottom: ext, left: ext, right: ext, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();
      return sharp(padded)
        .extract({ left: left + ext, top: top + ext, width: side, height: side })
        .resize(size, size)
        .png().toBuffer();
    };

    // Führende (fast) leere Frames weglassen — sonst ploppt das Emote am Rand erst leer auf
    // (bei GG z.B. fast eine halbe Sekunde). Ab dem ersten Frame mit ≥15 % des Höchstinhalts.
    const maxCount = Math.max(...counts);
    const first = Math.max(0, counts.findIndex(n => n >= maxCount * 0.15));
    const frames = [];
    for (let p = first; p < P; p++) frames.push(await frameSquare(p, ANIM));
    const allDelay = (meta.delay && meta.delay.length === P) ? meta.delay : Array(P).fill(70);
    const delay = allDelay.slice(first);
    const animOut = path.join(dst, 'anim', `${id}.webp`);
    await sharp(frames, { join: { animated: true } })
      .webp({ quality: 78, alphaQuality: 85, effort: 6, loop: 0, delay, smartSubsample: true })
      .toFile(animOut);

    const best = counts.indexOf(Math.max(...counts));
    const stillBuf = await sharp(await frameSquare(best, STILL)).webp({ quality: 85, alphaQuality: 90, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(dst, 'still', `${id}.webp`), stillBuf);
    stills.push({ id, buf: await sharp(stillBuf).png().toBuffer() });

    const kb = (f) => Math.round(fs.statSync(f).size / 1024);
    report.push(`${id.padEnd(20)} ${W}x${H} ${P}f → anim ${kb(animOut)} KB, ab Frame ${first}, Standbild Frame ${best} (${kb(path.join(dst, 'still', id + '.webp'))} KB), Inhalt ${bw}x${bh}`);
  }
  console.log(report.join('\n'));

  if (preview && stills.length) {
    const cols = 9, cell = 140;
    const comps = [];
    stills.forEach((s, i) => {
      comps.push({ input: s.buf, left: (i % cols) * cell + 6, top: Math.floor(i / cols) * cell + 2 });
      comps.push({ input: Buffer.from(`<svg width="${cell}" height="14"><text x="4" y="11" font-size="11" fill="#ff0" font-family="Arial">${s.id}</text></svg>`), left: (i % cols) * cell, top: Math.floor(i / cols) * cell + 124 });
    });
    await sharp({ create: { width: cols * cell, height: Math.ceil(stills.length / cols) * cell, channels: 4, background: '#1c5b96' } })
      .composite(comps).png().toFile(preview);
  }
})();
