// Prozedurale Texturen fürs 3D-Labyrinth — auf einem Canvas gemalt statt als Bilddatei geladen:
// kein zusätzlicher Download, und jede Runde sieht gleich aus (fester Zufallsstartwert).
import * as THREE from 'three';

/** Kleiner deterministischer Zufall (mulberry32), damit die Steine nicht bei jedem Laden springen. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Feines Rauschen über die ganze Fläche — nimmt den Flächen das Glatte. */
function speckle(ctx, size, rand, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
}

function toTexture(c, repeat = 1) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  return tex;
}

/** Graustufen-Kopie als Höhenkarte (bumpMap): Fugen tief, Steinflächen hoch. */
function toBump(c) {
  const b = canvas(c.width);
  const ctx = b.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.6)';
  ctx.drawImage(c, 0, 0);
  const tex = new THREE.CanvasTexture(b);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Mauerwerk: versetzte Quader in kühlem Schiefergrau, dunkle Fugen, unten etwas Moos. */
export function wallTextures() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(1337);
  ctx.fillStyle = '#17161f';
  ctx.fillRect(0, 0, size, size);
  const rows = 6;
  const bh = size / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 3;
    const bw = size / cols;
    const shift = r % 2 ? bw / 2 : 0;
    for (let i = -1; i <= cols; i++) {
      const x = i * bw + shift + 3, y = r * bh + 3;
      const w = bw - 6, h = bh - 6;
      const base = 46 + rand() * 26;
      const tint = rand() * 8;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, `rgb(${base + 4},${base + 10 + tint},${base + 26})`);
      g.addColorStop(1, `rgb(${base - 18},${base - 14},${base - 4})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();
      // Risse
      ctx.strokeStyle = 'rgba(10,10,16,0.55)';
      ctx.lineWidth = 1.2;
      if (rand() < 0.45) {
        ctx.beginPath();
        let cx = x + rand() * w, cy = y + rand() * h * 0.3;
        ctx.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) { cx += (rand() - 0.5) * 30; cy += rand() * 18; ctx.lineTo(cx, cy); }
        ctx.stroke();
      }
    }
  }
  // Moos und Feuchtigkeit am Fuß der Wand
  const moss = ctx.createLinearGradient(0, size * 0.72, 0, size);
  moss.addColorStop(0, 'rgba(40,70,40,0)');
  moss.addColorStop(1, 'rgba(40,70,40,0.35)');
  ctx.fillStyle = moss;
  ctx.fillRect(0, size * 0.72, size, size * 0.28);
  speckle(ctx, size, rand, 9000, 0.12);
  return { map: toTexture(c), bump: toBump(c) };
}

/** Bodenplatten: unregelmäßige Steinplatten, warm-dunkel, mit Fugen. */
export function floorTextures() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(4242);
  ctx.fillStyle = '#100f14';
  ctx.fillRect(0, 0, size, size);
  const n = 4;
  const s = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 34 + rand() * 18;
      ctx.fillStyle = `rgb(${v + 6},${v + 2},${v})`;
      ctx.beginPath();
      ctx.roundRect(x * s + 4, y * s + 4, s - 8, s - 8, 10);
      ctx.fill();
      const hl = ctx.createRadialGradient(x * s + s * 0.35, y * s + s * 0.3, 4, x * s + s / 2, y * s + s / 2, s * 0.7);
      hl.addColorStop(0, 'rgba(255,255,255,0.06)');
      hl.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = hl;
      ctx.fillRect(x * s + 4, y * s + 4, s - 8, s - 8);
    }
  }
  speckle(ctx, size, rand, 12000, 0.14);
  return { map: toTexture(c), bump: toBump(c) };
}

/** Decke: grobe Balken über dunklem Stein — oben soll es eng und finster wirken. */
export function ceilingTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(99);
  ctx.fillStyle = '#0b0a0e';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2; i++) {
    const y = i * size / 2 + 20;
    const g = ctx.createLinearGradient(0, y, 0, y + 50);
    g.addColorStop(0, '#2a1d14');
    g.addColorStop(1, '#140d09');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, size, 50);
  }
  speckle(ctx, size, rand, 4000, 0.15);
  return toTexture(c);
}

/** Weicher, runder Lichtschein (für Halos, Funken, Staub) — additiv gezeichnet. */
export function glowTexture() {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Namensschild über einem Mitspieler: weiße Schrift mit Kontur in der Spielerfarbe. */
export function labelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 64px "Lilita One", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, 256, 64);
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
