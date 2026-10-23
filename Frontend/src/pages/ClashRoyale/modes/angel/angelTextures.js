// Prozedurale Texturen für den 3D-Fluss (angel/Angel3D.jsx) — auf einem Canvas gemalt wie im
// Labyrinth und in der Pyramide: kein Download, fester Zufallsstart.
import * as THREE from 'three';

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

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function speckle(ctx, w, h, rand, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

function toTexture(c, { repeat = false } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Holzplanken (Steg und Flöße): helle Bretter mit Maserung und dunklen Fugen. */
export function woodTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(11);
  const plank = size / 4;
  for (let i = 0; i < 4; i++) {
    const tone = 0.88 + rand() * 0.2;
    ctx.fillStyle = `rgb(${Math.round(176 * tone)},${Math.round(124 * tone)},${Math.round(72 * tone)})`;
    ctx.fillRect(0, i * plank, size, plank);
    // Maserung
    ctx.strokeStyle = 'rgba(90,52,20,0.28)';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      const y0 = i * plank + 6 + rand() * (plank - 12);
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 40 + k) * 2.2);
      ctx.stroke();
    }
    // Astloch
    if (rand() < 0.7) {
      ctx.fillStyle = 'rgba(80,45,15,0.45)';
      ctx.beginPath();
      ctx.ellipse(rand() * size, i * plank + plank / 2, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(55,30,10,0.75)';
    ctx.fillRect(0, i * plank, size, 3);
  }
  speckle(ctx, size, size, rand, 2500, 0.08);
  return toTexture(c, { repeat: true });
}

/** Gras für das Ufer. */
export function grassTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(23);
  ctx.fillStyle = '#5c9e3c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1600; i++) {
    const x = rand() * size, y = rand() * size;
    const g = 120 + Math.round(rand() * 80);
    ctx.strokeStyle = `rgba(${Math.round(g * 0.45)},${g},${Math.round(g * 0.3)},0.55)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y - 4 - rand() * 6);
    ctx.stroke();
  }
  speckle(ctx, size, size, rand, 1500, 0.08);
  return toTexture(c, { repeat: true });
}

/** Flussbett: heller Sand mit Kieseln — schimmert durch das Wasser. */
export function bedTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(37);
  ctx.fillStyle = '#d9c48f';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rand, 6000, 0.12);
  for (let i = 0; i < 70; i++) {
    const r = 3 + rand() * 9;
    const v = 120 + Math.round(rand() * 90);
    ctx.fillStyle = `rgb(${v},${Math.round(v * 0.93)},${Math.round(v * 0.82)})`;
    ctx.beginPath();
    ctx.ellipse(rand() * size, rand() * size, r, r * (0.6 + rand() * 0.3), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, { repeat: true });
}

/** Schilfbüschel (freigestellt, für Sprites am Ufer). */
export function reedTexture(seed = 5) {
  const w = 128, h = 256;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const rand = rng(seed);
  for (let i = 0; i < 9; i++) {
    const x0 = w / 2 + (rand() - 0.5) * 50;
    const top = 30 + rand() * 90;
    const bend = (rand() - 0.5) * 30;
    ctx.strokeStyle = rand() < 0.5 ? '#4f8a2e' : '#6aa63d';
    ctx.lineWidth = 3 + rand() * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, h);
    ctx.quadraticCurveTo(x0 + bend * 0.3, (h + top) / 2, x0 + bend, top);
    ctx.stroke();
    // Rohrkolben auf einigen Halmen
    if (rand() < 0.45) {
      ctx.fillStyle = '#6b4325';
      ctx.beginPath();
      ctx.ellipse(x0 + bend, top + 12, 4.5, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(c);
}

/** Seerosenblatt mit Kerbe, optional mit Blüte. */
export function lilyTexture(flower = false) {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const m = size / 2, r = size * 0.46;
  ctx.fillStyle = '#3f8f3a';
  ctx.beginPath();
  ctx.moveTo(m, m);
  ctx.arc(m, m, r, 0.25, Math.PI * 2 - 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(25,70,25,0.55)';
  ctx.lineWidth = 2;
  for (let a = 0.5; a < Math.PI * 2 - 0.3; a += 0.55) {
    ctx.beginPath();
    ctx.moveTo(m, m);
    ctx.lineTo(m + Math.cos(a) * r * 0.9, m + Math.sin(a) * r * 0.9);
    ctx.stroke();
  }
  if (flower) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#f9c6dc' : '#fbe3ee';
      ctx.beginPath();
      ctx.ellipse(m - 14 + Math.cos(a) * 9, m - 8 + Math.sin(a) * 9, 9, 5, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f4c542';
    ctx.beginPath();
    ctx.arc(m - 14, m - 8, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}

/** Weicher Schaumring (flach aufs Wasser gelegt, um Flöße und für Klick-Platscher). */
export function foamTexture() {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.28, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c);
}

/** Weicher Schatten unter einem Floß (abgerundetes Rechteck, nach außen auslaufend). */
export function shadowTexture() {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = 'rgba(0,25,35,1)';
  ctx.beginPath();
  ctx.roundRect(24, 24, size - 48, size - 48, 14);
  ctx.fill();
  return toTexture(c);
}

/** Champion-Abzeichen wie im 2D-Fluss: türkise Krone auf dunklem Plättchen. */
export function crownTexture() {
  const w = 60, h = 52;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 12);
  ctx.fill();
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.moveTo(10, 40);
  ctx.lineTo(10, 20);
  ctx.lineTo(20, 30);
  ctx.lineTo(30, 12);
  ctx.lineTo(40, 30);
  ctx.lineTo(50, 20);
  ctx.lineTo(50, 40);
  ctx.closePath();
  ctx.fill();
  return toTexture(c);
}

/** Kielwasser hinter Flitzern: zur einen Seite auslaufender, ausgefranster Schaumstreifen. */
export function wakeTexture() {
  const w = 256, h = 64;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const rand = rng(41);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.85)');
  for (let i = 0; i < 9; i++) {
    const y = 8 + (i * (h - 16)) / 8 + (rand() - 0.5) * 4;
    ctx.strokeStyle = g;
    ctx.lineWidth = 2 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(w * (0.15 + rand() * 0.4), y);
    ctx.lineTo(w, y + (rand() - 0.5) * 3);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Wassertropfen / Luftblase (runder, weicher Punkt). */
export function dropTexture() {
  const size = 64;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size * 0.42, size * 0.38, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(200,240,255,0.85)');
  g.addColorStop(1, 'rgba(200,240,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c);
}

/** Kartenname unter dem Floß: weiße Schrift mit dunkler Kontur, kein Hintergrund. */
export function labelTexture(text, color = '#ffffff') {
  const w = 512, h = 72;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  let size = 40;
  ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
  while (ctx.measureText(text).width > w - 24 && size > 20) {
    size -= 2;
    ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(6,24,36,0.9)';
  ctx.strokeText(text, w / 2, h / 2 + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 2);
  return toTexture(c);
}
