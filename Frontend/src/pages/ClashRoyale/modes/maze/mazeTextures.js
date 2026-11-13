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

/**
 * Mauerwerk im Clash-Royale-Stil: klobige, gemalte Quader in Blauviolett — heller Schein an der
 * Oberkante, dunkler Fuß, kräftige dunkle Fuge. Kein Rauschen, keine Risse (wirkte schmutzig statt
 * gemalt). Die Farbe ist bewusst hell genug, dass die Fackel ein klares, warmes Bild ergibt.
 */
export function wallTextures() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(1337);
  ctx.fillStyle = '#1b1740';
  ctx.fillRect(0, 0, size, size);
  const rows = 4, cols = 2;
  const bh = size / rows, bw = size / cols;
  const tones = [[96, 106, 188], [86, 94, 172], [108, 118, 200], [92, 100, 180]];
  for (let r = 0; r < rows; r++) {
    const shift = r % 2 ? bw / 2 : 0;
    // Farbe je Stein vorab ziehen: der Stein, der über den rechten Rand ragt, muss links gleich aussehen
    const rowTones = Array.from({ length: cols }, () => tones[Math.floor(rand() * tones.length)]);
    for (let i = -1; i <= cols; i++) {
      const [tr, tg, tb] = rowTones[((i % cols) + cols) % cols];
      const x = i * bw + shift + 5, y = r * bh + 5;
      const w = bw - 10, h = bh - 10;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 16);
      ctx.fillStyle = `rgb(${tr},${tg},${tb})`;
      ctx.fill();
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(210,225,255,0.42)');
      g.addColorStop(0.22, 'rgba(210,225,255,0.06)');
      g.addColorStop(0.7, 'rgba(20,14,70,0)');
      g.addColorStop(1, 'rgba(20,14,70,0.42)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(22,16,58,0.9)';
      ctx.stroke();
      // ein gemalter Lichttupfer je Stein
      ctx.fillStyle = 'rgba(225,235,255,0.08)';
      ctx.beginPath();
      ctx.ellipse(x + w * 0.28, y + h * 0.3, w * 0.13, h * 0.09, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return { map: toTexture(c), bump: toBump(c) };
}

/** Bodenplatten: große, helle Schieferplatten mit gemalter Kante — ruhiger als die Wand. */
export function floorTextures() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(4242);
  ctx.fillStyle = '#211c48';
  ctx.fillRect(0, 0, size, size);
  const n = 2;
  const s = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = rand() * 14;
      ctx.beginPath();
      ctx.roundRect(x * s + 6, y * s + 6, s - 12, s - 12, 20);
      ctx.fillStyle = `rgb(${118 + v},${116 + v},${168 + v})`;
      ctx.fill();
      const hl = ctx.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
      hl.addColorStop(0, 'rgba(230,235,255,0.22)');
      hl.addColorStop(0.5, 'rgba(230,235,255,0)');
      hl.addColorStop(1, 'rgba(24,16,70,0.26)');
      ctx.fillStyle = hl;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(26,20,64,0.85)';
      ctx.stroke();
    }
  }
  return { map: toTexture(c), bump: toBump(c) };
}

/** Decke: dunkles Blauviolett mit warmen Holzbalken (Kontur wie überall). */
export function ceilingTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2560';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2; i++) {
    const y = i * size / 2 + 20;
    const g = ctx.createLinearGradient(0, y, 0, y + 50);
    g.addColorStop(0, '#a56a36');
    g.addColorStop(1, '#6e421f');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, size, 50);
    ctx.fillStyle = 'rgba(43,28,16,0.9)';
    ctx.fillRect(0, y - 4, size, 4);
    ctx.fillRect(0, y + 50, size, 4);
  }
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
