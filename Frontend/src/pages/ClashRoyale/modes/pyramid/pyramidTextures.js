// Prozedurale Texturen für die 3D-Pyramide (pyramid/Pyramid3D.jsx) — auf Canvas gemalt, kein
// Download, fester Zufallsstart. Die meisten Oberflächen liefern { map, normalMap }: Farbe und
// ein mitgemaltes Höhenbild (hell = hoch), aus dem kit.normalFromHeight die Normal-Map macht.
// So fangen Fugen, Kanten und eingeritzte Hieroglyphen echtes Licht.
import * as THREE from 'three';
import { normalFromHeight, rng } from '../scene3d/kit';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Farb- und Höhen-Canvas gleicher Größe. */
function pair(w, h = w) {
  const c = canvas(w, h), hc = canvas(w, h);
  const ctx = c.getContext('2d'), hctx = hc.getContext('2d');
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, w, h);
  return { c, ctx, hc, hctx, w, h };
}

function toTexture(c, rx = 1, ry = rx) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 8;
  return tex;
}

function finish(p, strength, rx = 1, ry = rx) {
  return { map: toTexture(p.c, rx, ry), normalMap: normalFromHeight(p.hc, strength, rx, ry) };
}

function speckle(ctx, w, h, rand, amount, alpha, size = 2) {
  for (let i = 0; i < amount; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * size, 1 + rand() * size);
  }
}

/** Weiche Flecken (Verwitterung): große, sehr blasse Kreise in Hell und Dunkel. */
function blotches(ctx, w, h, rand, n, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = 10 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = rand() < 0.5 ? '40,20,5' : '255,240,210';
    g.addColorStop(0, `rgba(${v},${alpha * rand()})`);
    g.addColorStop(1, `rgba(${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Eingeritztes Zeichen (Auge, Henkelkreuz, Vogel, Welle, Käfer, Feder): Kerbe in Farbe und Höhe. */
function glyph(p, kind, x, y, s, paint) {
  const path = (ctx) => {
    ctx.beginPath();
    if (kind === 0) { // Auge
      ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.8, s, 0); ctx.quadraticCurveTo(0, s * 0.6, -s, 0);
      ctx.moveTo(s * 0.2, 0); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.3, s * 0.35); ctx.lineTo(-s * 0.5, s);
      ctx.moveTo(s * 0.2, s * 0.3); ctx.quadraticCurveTo(s * 0.5, s * 0.9, s * 0.9, s * 0.7);
    } else if (kind === 1) { // Henkelkreuz
      ctx.ellipse(0, -s * 0.55, s * 0.3, s * 0.4, 0, 0, Math.PI * 2);
      ctx.moveTo(0, -s * 0.15); ctx.lineTo(0, s);
      ctx.moveTo(-s * 0.55, 0); ctx.lineTo(s * 0.55, 0);
    } else if (kind === 2) { // Vogel
      ctx.moveTo(-s * 0.6, s * 0.8); ctx.lineTo(-s * 0.2, 0); ctx.lineTo(s * 0.5, -s * 0.2);
      ctx.lineTo(s * 0.7, -s * 0.6); ctx.moveTo(-s * 0.2, 0); ctx.lineTo(s * 0.6, s * 0.4);
      ctx.moveTo(-s * 0.2, s * 0.4); ctx.lineTo(-s * 0.3, s);
    } else if (kind === 3) { // Wasserwelle
      for (let k = -1; k <= 1; k++) {
        ctx.moveTo(-s, k * s * 0.45);
        for (let i = 0; i <= 4; i++) ctx.lineTo(-s + (i * s) / 2, k * s * 0.45 + (i % 2 ? -s * 0.2 : s * 0.2));
      }
    } else if (kind === 4) { // Skarabäus
      ctx.ellipse(0, s * 0.1, s * 0.45, s * 0.6, 0, 0, Math.PI * 2);
      ctx.moveTo(0, -s * 0.5); ctx.lineTo(0, s * 0.7);
      ctx.moveTo(-s * 0.45, -s * 0.2); ctx.lineTo(-s, -s * 0.6);
      ctx.moveTo(s * 0.45, -s * 0.2); ctx.lineTo(s, -s * 0.6);
    } else { // Feder
      ctx.moveTo(0, s); ctx.quadraticCurveTo(s * 0.5, 0, s * 0.1, -s);
      ctx.quadraticCurveTo(-s * 0.4, 0, 0, s);
    }
  };
  [p.ctx, p.hctx].forEach((ctx, i) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path(ctx);
    if (i === 0) {
      if (paint) { ctx.strokeStyle = paint; ctx.lineWidth = s * 0.34; ctx.stroke(); }
      ctx.strokeStyle = 'rgba(60,32,10,0.6)';
      ctx.lineWidth = s * 0.16;
    } else {
      ctx.strokeStyle = '#4a4a4a';
      ctx.lineWidth = s * 0.26;
    }
    ctx.stroke();
    ctx.restore();
  });
}

const PIGMENTS = ['rgba(37,99,170,0.55)', 'rgba(170,50,30,0.5)', 'rgba(30,120,95,0.5)', 'rgba(210,150,40,0.55)'];

/**
 * Hieroglyphenband als Aufkleber (transparent) für die Foto-Steinwände: zwei Zeilen bemalter,
 * eingeritzter Zeichen zwischen Linien. 1024×256, kachelt in x.
 */
export function glyphBandTexture(rx = 1) {
  const p = pair(1024, 256);
  p.ctx.clearRect(0, 0, 1024, 256);
  const rand = rng(404);
  for (let line = 0; line < 2; line++) {
    const ly = 66 + line * 124;
    for (let k = 0; k < 12; k++) glyph(p, Math.floor(rand() * 6), 42 + k * 85, ly, 30, PIGMENTS[Math.floor(rand() * PIGMENTS.length)]);
  }
  [4, 128, 250].forEach((ly) => {
    p.ctx.fillStyle = 'rgba(60,32,10,0.55)'; p.ctx.fillRect(0, ly - 2, 1024, 4);
    p.hctx.fillStyle = '#505050'; p.hctx.fillRect(0, ly - 2, 1024, 4);
  });
  // senkrechte Trenner wie Spalten einer Inschrift
  for (let k = 0; k <= 12; k++) {
    p.ctx.fillStyle = 'rgba(60,32,10,0.3)'; p.ctx.fillRect(k * 85, 6, 2, 244);
  }
  return finish(p, 2.8, rx, 1);
}

/** Gemalter Fries unter der Decke: Kheker-Bündel über blau/rot/goldenen Bändern. 1024×128. */
export function friezeTexture(rx = 1) {
  const p = pair(1024, 128);
  p.ctx.fillStyle = '#c99a55';
  p.ctx.fillRect(0, 0, 1024, 128);
  const bands = [['#1f4f8c', 92, 8], ['#c9a227', 100, 6], ['#9b2f1e', 106, 8], ['#c9a227', 114, 4], ['#1f4f8c', 118, 10]];
  bands.forEach(([c, y, h]) => { p.ctx.fillStyle = c; p.ctx.fillRect(0, y, 1024, h); });
  const colors = ['#1f4f8c', '#9b2f1e', '#2b7a62', '#c9a227'];
  for (let i = 0; i < 32; i++) {
    const x = i * 32 + 16;
    const col = colors[i % colors.length];
    // Kheker: Stab mit Knoten und Kugelkopf
    p.ctx.fillStyle = col;
    p.ctx.fillRect(x - 5, 22, 10, 64);
    p.ctx.beginPath(); p.ctx.arc(x, 18, 8, 0, Math.PI * 2); p.ctx.fill();
    p.ctx.fillStyle = '#c9a227';
    p.ctx.fillRect(x - 7, 44, 14, 5);
    p.ctx.fillRect(x - 7, 62, 14, 5);
    p.hctx.fillStyle = '#a8a8a8';
    p.hctx.fillRect(x - 5, 22, 10, 64);
    p.hctx.beginPath(); p.hctx.arc(x, 18, 8, 0, Math.PI * 2); p.hctx.fill();
  }
  const rand = rng(5);
  blotches(p.ctx, 1024, 128, rand, 30, 0.16);
  speckle(p.ctx, 1024, 128, rand, 6000, 0.1);
  return finish(p, 1.6, rx, 1);
}

/** Sternendecke wie in Grabkammern: tiefblau mit goldenen fünfzackigen Sternen. */
export function starCeiling(rx, ry) {
  const p = pair(256);
  const rand = rng(12);
  p.ctx.fillStyle = '#152a52';
  p.ctx.fillRect(0, 0, 256, 256);
  blotches(p.ctx, 256, 256, rand, 30, 0.2);
  const star = (ctx, x, y, r) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.42 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const x = c * 64 + 32 + (r % 2) * 32, y = r * 64 + 32;
      p.ctx.fillStyle = '#e2b84a';
      star(p.ctx, x % 256, y, 12);
      p.hctx.fillStyle = '#a0a0a0';
      star(p.hctx, x % 256, y, 12);
    }
  }
  speckle(p.ctx, 256, 256, rand, 3000, 0.12);
  return finish(p, 1.2, rx, ry);
}

/** Papyrussäule: senkrechte Bündel-Kanneluren, oben bemalte Bänder. Breite = Umfang. */
export function columnTexture() {
  const p = pair(256, 512);
  const rand = rng(3);
  const g = p.ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#d8ab66');
  g.addColorStop(1, '#b98a4c');
  p.ctx.fillStyle = g;
  p.ctx.fillRect(0, 0, 256, 512);
  // Kanneluren (8 Bündel um den Umfang)
  for (let x = 0; x < 256; x++) {
    const v = 128 + Math.cos((x / 256) * Math.PI * 2 * 8) * 70;
    p.hctx.fillStyle = `rgb(${v},${v},${v})`;
    p.hctx.fillRect(x, 70, 1, 442);
    p.ctx.fillStyle = `rgba(80,45,15,${0.12 + 0.12 * Math.cos((x / 256) * Math.PI * 2 * 8)})`;
    p.ctx.fillRect(x, 70, 1, 442);
  }
  // Bemalte Bänder unter dem Kapitell
  [['#1f4f8c', 0, 14], ['#c9a227', 14, 6], ['#9b2f1e', 20, 12], ['#c9a227', 32, 6], ['#2b7a62', 38, 12], ['#c9a227', 50, 6], ['#1f4f8c', 56, 14]].forEach(([c, y, h]) => {
    p.ctx.fillStyle = c; p.ctx.fillRect(0, y, 256, h);
    p.hctx.fillStyle = y % 2 ? '#909090' : '#a0a0a0'; p.hctx.fillRect(0, y, 256, h);
  });
  // senkrechte Inschrift-Kartusche
  for (let k = 0; k < 5; k++) glyph(p, Math.floor(rand() * 6), 64, 140 + k * 64, 16, PIGMENTS[k % 4]);
  blotches(p.ctx, 256, 512, rand, 30, 0.14);
  speckle(p.ctx, 256, 512, rand, 9000, 0.1);
  return finish(p, 2.4);
}

/**
 * Geflügelte Sonnenscheibe (transparent): goldene Scheibe mit zwei Uräen, Flügel in Blau, Rot,
 * Grün. Für die Wandmalerei hinter der Pyramide und den Türsturz am Eingang. 1024×320.
 */
export function wingedSunTexture() {
  const W = 1024, H = 320;
  const p = pair(W, H);
  p.hctx.clearRect(0, 0, W, H);
  p.hctx.fillStyle = '#808080';
  p.hctx.fillRect(0, 0, W, H);
  const ctx = p.ctx;
  const cx = W / 2, cy = H * 0.46;
  [-1, 1].forEach((side) => {
    const rows = [['#1f4f8c', 0], ['#9b2f1e', 1], ['#2b7a62', 2], ['#c9a227', 3]];
    rows.forEach(([col, k]) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      const y0 = cy - 46 + k * 26;
      ctx.moveTo(cx + side * 70, y0);
      ctx.quadraticCurveTo(cx + side * 300, y0 - 70 + k * 14, cx + side * (470 - k * 40), y0 - 40 + k * 28);
      ctx.lineTo(cx + side * (470 - k * 40), y0 - 18 + k * 30);
      ctx.quadraticCurveTo(cx + side * 300, y0 - 30 + k * 18, cx + side * 70, y0 + 24);
      ctx.closePath();
      ctx.fill();
      // Federstriche
      ctx.strokeStyle = 'rgba(20,10,0,0.35)';
      ctx.lineWidth = 2;
      for (let f = 1; f < 14; f++) {
        const t = f / 14;
        const x = cx + side * (70 + t * (400 - k * 40));
        ctx.beginPath(); ctx.moveTo(x, y0 - 30 * t + k * 4); ctx.lineTo(x + side * 6, y0 + 20 - t * 10); ctx.stroke();
      }
    });
  });
  // Sonnenscheibe
  const g = ctx.createRadialGradient(cx - 18, cy - 20, 6, cx, cy, 70);
  g.addColorStop(0, '#ffe7a0');
  g.addColorStop(0.6, '#d8a032');
  g.addColorStop(1, '#8a5a12');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, 66, 0, Math.PI * 2); ctx.fill();
  // Uräen (Kobras) links und rechts der Scheibe
  [-1, 1].forEach((side) => {
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.ellipse(cx + side * 78, cy + 30, 12, 34, side * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + side * 78, cy - 8, 9, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  // Höhe: Scheibe erhaben, Flügel leicht
  p.hctx.drawImage(p.c, 0, 0);
  const hi = p.hctx.getImageData(0, 0, W, H);
  for (let i = 0; i < hi.data.length; i += 4) {
    const a = hi.data[i + 3] / 255;
    const v = 128 + a * 60;
    hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = v;
    hi.data[i + 3] = 255;
  }
  p.hctx.putImageData(hi, 0, 0);
  const rand = rng(8);
  ctx.globalCompositeOperation = 'source-atop';
  blotches(ctx, W, H, rand, 50, 0.22);
  speckle(ctx, W, H, rand, 9000, 0.14);
  ctx.globalCompositeOperation = 'source-over';
  const map = new THREE.CanvasTexture(p.c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const normalMap = normalFromHeight(p.hc, 2.2);
  normalMap.wrapS = normalMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normalMap };
}

/** Weicher, runder Lichtpunkt (Funken, Staub) — additiv gezeichnet. */
export function sparkTexture() {
  const c = canvas(64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,200,0.6)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Rotes Verbotszeichen (Kreis + Schrägstrich) auf transparentem Grund — liegt über blockierten Karten. */
export function forbiddenTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const m = size / 2, r = size * 0.4;
  const ring = (color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(m, m, r, 0, Math.PI * 2);
    ctx.stroke();
    const d = r * Math.SQRT1_2;
    ctx.beginPath();
    ctx.moveTo(m - d, m - d);
    ctx.lineTo(m + d, m + d);
    ctx.stroke();
  };
  ring('rgba(20,5,0,0.85)', 34);
  ring('#dc2626', 22);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
