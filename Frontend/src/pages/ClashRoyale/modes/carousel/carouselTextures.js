// Prozedurale Texturen für das 3D-Jahrmarkt-Karussell (carousel/Carousel3D.jsx) — auf einem
// Canvas gemalt wie in Labyrinth, Pyramide und Fluss: kein Download, fester Zufallsstart.
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

/** Plattform von oben: Holzsegmente abwechselnd hell/dunkel, rot-goldener Rand. */
export function platformTexture(segments = 16) {
  const size = 1024;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(3);
  const m = size / 2;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? '#c99a62' : '#b5844f';
    ctx.beginPath();
    ctx.moveTo(m, m);
    ctx.arc(m, m, m, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  // Maserung als feine Ringe
  ctx.strokeStyle = 'rgba(90,55,20,0.18)';
  for (let r = 40; r < m; r += 14 + rand() * 10) {
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.arc(m, m, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Fugen zwischen den Segmenten
  ctx.strokeStyle = 'rgba(60,35,10,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(m, m);
    ctx.lineTo(m + Math.cos(a) * m, m + Math.sin(a) * m);
    ctx.stroke();
  }
  // Rand: rotes Band mit Goldkanten
  ctx.lineWidth = 34;
  ctx.strokeStyle = '#b3242b';
  ctx.beginPath();
  ctx.arc(m, m, m - 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#f2c14e';
  [m - 3, m - 37].forEach((r) => { ctx.beginPath(); ctx.arc(m, m, r, 0, Math.PI * 2); ctx.stroke(); });
  speckle(ctx, size, size, rand, 9000, 0.07);
  return toTexture(c);
}

/** Senkrechte Streifen fürs Zeltdach (Kegel-UV läuft einmal herum → Streifen strahlenförmig). */
export function stripeTexture(colors = ['#d8303a', '#fff4e0', '#2f6fd6', '#fff4e0'], bands = 16) {
  const w = 512, h = 64;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect((i / bands) * w, 0, w / bands + 1, h);
  }
  return toTexture(c);
}

/** Spielfilz auf den Tischen: tiefes Blau mit goldener Zierlinie. */
export function feltTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(17);
  ctx.fillStyle = '#1f3f7a';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rand, 9000, 0.09);
  ctx.strokeStyle = 'rgba(242,193,78,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, size - 20, size - 20);
  return toTexture(c);
}

/** Holz für Tischkanten und Beine. */
export function woodTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(29);
  ctx.fillStyle = '#8a5a2f';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(55,30,10,0.3)';
  for (let k = 0; k < 26; k++) {
    const y0 = rand() * size;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 30 + k) * 2.5);
    ctx.stroke();
  }
  speckle(ctx, size, size, rand, 2500, 0.08);
  return toTexture(c, { repeat: true });
}

/** Festplatz-Boden: heller Sand mit Kieseln und Fußspuren-Flecken. */
export function groundTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(53);
  ctx.fillStyle = '#d8c08c';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rand, 7000, 0.12);
  for (let i = 0; i < 40; i++) {
    const v = 150 + Math.round(rand() * 70);
    ctx.fillStyle = `rgba(${v},${Math.round(v * 0.9)},${Math.round(v * 0.75)},0.8)`;
    ctx.beginPath();
    ctx.ellipse(rand() * size, rand() * size, 2 + rand() * 4, 1.5 + rand() * 3, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, { repeat: true });
}

/** Kopfsteinpflaster für den Weg rund ums Karussell. */
export function cobbleTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(61);
  ctx.fillStyle = '#6f675c';
  ctx.fillRect(0, 0, size, size);
  const cell = 32;
  for (let y = 0; y < size; y += cell) {
    const off = (y / cell) % 2 ? cell / 2 : 0;
    for (let x = -cell; x < size + cell; x += cell) {
      const v = 150 + Math.round(rand() * 50);
      ctx.fillStyle = `rgb(${v},${Math.round(v * 0.95)},${Math.round(v * 0.88)})`;
      ctx.beginPath();
      ctx.roundRect(x + off + 2, y + 2, cell - 4, cell - 4, 8);
      ctx.fill();
    }
  }
  speckle(ctx, size, size, rand, 4000, 0.1);
  return toTexture(c, { repeat: true });
}

/** Grüner Haken im Kreis — schwebt über dem Namensschild, sobald jemand gewählt hat. */
export function checkTexture() {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b2a12';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(34, 66);
  ctx.lineTo(55, 87);
  ctx.lineTo(94, 44);
  ctx.stroke();
  return toTexture(c);
}
