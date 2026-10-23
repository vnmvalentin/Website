// Prozedurale Texturen für den 3D-Auktionssaal (auction/Auction3D.jsx) — auf einem Canvas
// gemalt statt als Bilddatei geladen, wie im 3D-Labyrinth (maze/mazeTextures.js): kein
// zusätzlicher Download, und der Saal sieht bei jedem Laden gleich aus (fester Zufallsstart).
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

function toTexture(c, repeatX = 1, repeatY = repeatX) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

/** Holzdielen: warme, lange Bretter mit Maserung und dunklen Fugen. */
export function floorTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(77);
  const rows = 8;
  const bh = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 200;
    while (x < size) {
      const len = 180 + rand() * 220;
      const base = 105 + rand() * 30;
      ctx.fillStyle = `rgb(${base + 40},${base + 8},${base - 30})`;
      ctx.fillRect(x, r * bh, len, bh);
      // Maserung
      ctx.strokeStyle = 'rgba(40,18,6,0.28)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const gy = r * bh + 4 + rand() * (bh - 8);
        ctx.beginPath();
        ctx.moveTo(x, gy);
        for (let k = 0; k < len; k += 24) ctx.lineTo(x + k, gy + Math.sin(k / 30 + g) * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20,8,2,0.9)';
      ctx.fillRect(x, r * bh, 2, bh);
      x += len;
    }
    ctx.fillStyle = 'rgba(20,8,2,0.85)';
    ctx.fillRect(0, r * bh, size, 2);
  }
  speckle(ctx, size, size, rand, 6000, 0.08);
  return toTexture(c);
}

/** Wandbespannung im Clash-Royale-Blau: Rautenmuster wie der Website-Hintergrund, goldene Nieten. */
export function wallTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rand = rng(31);
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#2f63c0');
  g.addColorStop(1, '#244f9e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const step = 128;
  for (let y = 0; y <= size; y += step) {
    for (let x = 0; x <= size; x += step) {
      // Raute: oben hell, unten dunkel — dieselbe Kissen-Optik wie das Karo der Website
      const d = (ox, oy) => { ctx.beginPath(); ctx.moveTo(x + ox, y + oy - step / 2 + 6); ctx.lineTo(x + ox + step / 2 - 6, y + oy); ctx.lineTo(x + ox, y + oy + step / 2 - 6); ctx.lineTo(x + ox - step / 2 + 6, y + oy); ctx.closePath(); };
      d(0, 0);
      const rg = ctx.createLinearGradient(x, y - step / 2, x, y + step / 2);
      rg.addColorStop(0, 'rgba(120,180,255,0.32)');
      rg.addColorStop(1, 'rgba(10,30,80,0.32)');
      ctx.fillStyle = rg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(12,32,80,0.65)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(x, y - step / 2 + 3, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  speckle(ctx, size, size, rand, 5000, 0.07);
  return toTexture(c);
}

/** Samtvorhang: senkrechte Falten aus hellen und dunklen Bahnen. */
export function curtainTexture() {
  const w = 256, h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  const folds = 6;
  for (let i = 0; i <= folds * 2; i++) {
    const p = i / (folds * 2);
    g.addColorStop(p, i % 2 ? '#3d7fe0' : '#173d82');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(0,0,0,0.45)');
  shade.addColorStop(0.25, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  // Goldborte mit Fransen
  ctx.fillStyle = '#e8b33f';
  ctx.fillRect(0, h * 0.93, w, h * 0.025);
  ctx.fillStyle = '#c98f22';
  for (let x = 2; x < w; x += 7) ctx.fillRect(x, h * 0.955, 3, h * 0.04);
  return toTexture(c);
}

/** Auktionstafel: dunkler grüner Filz mit feinem Korn und goldener Schrift „AUKTION“ oben. */
export function boardTexture(title) {
  const w = 1024, h = 640;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const rand = rng(5);
  const g = ctx.createRadialGradient(w / 2, h * 0.45, 40, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, '#1d4a94');
  g.addColorStop(1, '#0f2756');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, rand, 20000, 0.06);
  ctx.strokeStyle = 'rgba(232,190,100,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(26, 26, w - 52, h - 52);
  if (title) {
  ctx.font = '64px "Lilita One", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,10,0,0.8)';
  ctx.strokeText(title, w / 2, 78);
  ctx.fillStyle = '#f2c95c';
  ctx.fillText(title, w / 2, 78);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Kartenrückseite: violett mit Elixier-Raute, wie verdeckte Karten im Spiel. */
export function cardBackTexture() {
  const w = 256, h = 320;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a0f33';
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 22);
  ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6d28d9');
  g.addColorStop(1, '#3b0f7a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(14, 14, w - 28, h - 28, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  for (let i = -h; i < w + h; i += 26) {
    ctx.beginPath();
    ctx.moveTo(i, 14);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }
  ctx.fillStyle = '#e879f9';
  ctx.strokeStyle = '#2a0a4a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w / 2, h / 2 - 54);
  ctx.lineTo(w / 2 + 40, h / 2);
  ctx.lineTo(w / 2, h / 2 + 54);
  ctx.lineTo(w / 2 - 40, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Messingschild unter einer Karte (Kartenname, Gebot, Gewinner). `tone` färbt die Fläche:
 * 'brass' (Standard), 'mine' (eigenes Gebot, Magenta), 'locked' (Champion-Limit, Rot) oder
 * eine Spielerfarbe als CSS-Farbe für den Gewinner.
 */
export function plaqueTexture(text, tone = 'brass') {
  const w = 512, h = 112;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const tones = {
    brass: ['#d8a94a', '#8a5a1a', '#3b2405'],
    mine: ['#e879f9', '#a21caf', '#3b0743'],
    locked: ['#f87171', '#991b1b', '#3a0606'],
  };
  const [light, dark, edge] = tones[tone] || [tone, tone, '#0b0b14'];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 22);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, 16);
  ctx.fill();
  if (!tones[tone]) {
    // Spielerfarbe: dunkler Schleier, damit weiße Schrift auf jeder Farbe lesbar bleibt
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 16, 16);
    ctx.fill();
  }
  let size = 54;
  ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
  while (ctx.measureText(text).width > w - 50 && size > 26) {
    size -= 2;
    ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 9;
  // Runde Ecken an der Kontur: mit spitzen Ecken (Standard „miter“) standen an Buchstaben wie
  // dem „w“ in „Bowler“ dunkle Zacken unter der Schrift heraus
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10,5,0,0.85)';
  ctx.strokeText(text, w / 2, h / 2 + 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Stempel „VERKAUFT!“ in der Gewinnerfarbe — schräg aufgesetzt wird er im 3D gedreht. */
export function stampTexture(text, color) {
  const w = 512, h = 160;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(6,10,24,0.72)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.roundRect(10, 10, w - 20, h - 20, 26);
  ctx.fill();
  ctx.stroke();
  let size = 76;
  ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
  while (ctx.measureText(text).width > w - 70 && size > 34) {
    size -= 2;
    ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000000';
  ctx.strokeText(text, w / 2, h / 2 + 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Abgerundeter Rahmen (weißer Ring, innen durchsichtig) — eingefärbt über die Materialfarbe. */
export function frameRingTexture() {
  const w = 256, h = 320;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.roundRect(10, 10, w - 20, h - 20, 26);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Runenring um den Zauberspiegel: zwei feine Kreise mit Runenzeichen dazwischen (weiß, wird eingefärbt). */
export function runeRingTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  [0.47, 0.39].forEach((r) => { ctx.beginPath(); ctx.arc(cx, cx, size * r, 0, Math.PI * 2); ctx.stroke(); });
  const rand = rng(13);
  const runes = 22;
  for (let i = 0; i < runes; i++) {
    const a = (i / runes) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * size * 0.43, cx + Math.sin(a) * size * 0.43);
    ctx.rotate(a + Math.PI / 2);
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    // Jede Rune: ein senkrechter Strich mit zwei zufälligen Ästen — wirkt wie eine alte Schrift
    ctx.moveTo(0, -14); ctx.lineTo(0, 14);
    const s1 = rand() < 0.5 ? -1 : 1, s2 = rand() < 0.5 ? -1 : 1;
    ctx.moveTo(0, -6 + rand() * 6); ctx.lineTo(s1 * 10, -14 + rand() * 8);
    ctx.moveTo(0, 4 + rand() * 6); ctx.lineTo(s2 * 10, 2 + rand() * 12);
    ctx.stroke();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Runde Avatar-Plakette (Kopf einer Bieterfigur): Bild kreisrund ausgeschnitten, dicker Rand in
 * der Spielerfarbe. Das Bild lädt nach — die Textur aktualisiert sich dann selbst.
 */
export function avatarBadgeTexture(url, color) {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (img) => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color || '#888888';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 18, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1b2a44';
    ctx.fillRect(0, 0, size, size);
    if (img) ctx.drawImage(img, 18, 18, size - 36, size - 36);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
    tex.needsUpdate = true;
  };
  draw(null);
  if (url) {
    const img = new Image();
    img.onload = () => draw(img);
    img.src = url;
  }
  return tex;
}

/**
 * Wimpel mit Krone (Rot/Blau wie die Seiten in der Arena), unten als Schwalbenschwanz ausgeschnitten.
 * `crownUrl`: Kronenbild aus dem Spiel (red_crown/blue_crown) — lädt nach, die Textur
 * aktualisiert sich dann selbst. Ohne Bild wird eine Krone gemalt.
 */
export function bannerTexture(color, crownUrl = null) {
  const w = 256, h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const shape = () => { ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(w - 8, 0); ctx.lineTo(w - 8, h - 10); ctx.lineTo(w / 2, h - 90); ctx.lineTo(8, h - 10); ctx.closePath(); };
  const drawCloth = () => {
    ctx.clearRect(0, 0, w, h);
    shape();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    shape();
    ctx.clip();
    const shade = ctx.createLinearGradient(0, 0, w, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.25)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    shade.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    shape();
    ctx.strokeStyle = '#f2c14e';
    ctx.lineWidth = 14;
    ctx.stroke();
  };
  drawCloth();
  if (crownUrl) {
    const img = new Image();
    img.onload = () => {
      drawCloth();
      // Breite fest, Höhe nach Seitenverhältnis — Krone mittig im oberen Teil des Wimpels
      const cw = 190, ch = cw * (img.height / img.width);
      ctx.drawImage(img, (w - cw) / 2, 190 - ch / 2, cw, ch);
      tex.needsUpdate = true;
    };
    img.src = crownUrl;
    return tex;
  }
  // Krone (gemalt, nur ohne Bild)
  ctx.fillStyle = '#f7c948';
  ctx.strokeStyle = '#7a4a08';
  ctx.lineWidth = 8;
  ctx.beginPath();
  const cx = w / 2, cy = 190;
  ctx.moveTo(cx - 70, cy + 50); ctx.lineTo(cx - 80, cy - 30); ctx.lineTo(cx - 35, cy + 5); ctx.lineTo(cx, cy - 55);
  ctx.lineTo(cx + 35, cy + 5); ctx.lineTo(cx + 80, cy - 30); ctx.lineTo(cx + 70, cy + 50); ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = '#fff3c4';
  [[cx - 80, cy - 30], [cx, cy - 55], [cx + 80, cy - 30]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); });
  tex.needsUpdate = true;
  return tex;
}

/** Zauberspiegel-Glas: dunkles, grünstichiges Glas mit Schliere. */
export function mirrorGlassTexture() {
  const w = 256, h = 384;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h / 2, h * 0.6);
  g.addColorStop(0, '#16302a');
  g.addColorStop(1, '#03080a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(180,255,220,0.12)';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.9);
  ctx.lineTo(w * 0.85, h * 0.1);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
