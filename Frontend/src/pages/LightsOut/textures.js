// textures.js — alle Bilder des Spiels als Canvas gezeichnet (keine Dateien).
import * as THREE from 'three';
import { makeRng } from './maze';
import { drawSymbol } from './symbols';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

/** Feines Korn über eine ganze Fläche. */
function grain(ctx, w, h, rng, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(rng() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng()})`;
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
}

/** Fleck mit weichem Rand. */
function stain(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Alte Kachelwand unten, verputzter Beton oben, Wasserläufe. */
export function wallTexture(seed = 7) {
  const rng = makeRng(seed);
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#6d6a60';
  ctx.fillRect(0, 0, 512, 512);
  grain(ctx, 512, 512, rng, 9000, 0.12);
  // Kacheln im unteren Drittel
  const tileTop = 330;
  for (let y = tileTop; y < 512; y += 32) {
    for (let x = 0; x < 512; x += 64) {
      const v = 150 + Math.floor(rng() * 25);
      ctx.fillStyle = `rgb(${v - 10},${v},${v - 18})`;
      ctx.fillRect(x + 1, y + 1, 62, 30);
      if (rng() < 0.12) {
        ctx.strokeStyle = 'rgba(20,20,20,0.55)';
        ctx.beginPath();
        ctx.moveTo(x + rng() * 60, y + 2);
        ctx.lineTo(x + rng() * 60, y + 30);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = '#3a3832';
  ctx.fillRect(0, tileTop - 8, 512, 8);
  // Wasserläufe und Schimmel
  for (let i = 0; i < 14; i++) {
    const x = rng() * 512;
    const len = 80 + rng() * 300;
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(40,34,20,0.5)');
    g.addColorStop(1, 'rgba(40,34,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 3 + rng() * 6, len);
  }
  for (let i = 0; i < 10; i++) stain(ctx, rng() * 512, rng() * 512, 30 + rng() * 70, 'rgba(30,36,22,0.45)');
  stain(ctx, rng() * 512, 480, 120, 'rgba(20,16,12,0.6)');
  return toTexture(c);
}

export function floorTexture(seed = 11) {
  const rng = makeRng(seed);
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#2f2c28';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      const v = 58 + Math.floor(rng() * 22);
      ctx.fillStyle = (x + y) % 128 === 0 ? `rgb(${v},${v - 4},${v - 10})` : `rgb(${v - 18},${v - 20},${v - 24})`;
      ctx.fillRect(x + 2, y + 2, 60, 60);
    }
  }
  grain(ctx, 512, 512, rng, 12000, 0.18);
  for (let i = 0; i < 8; i++) stain(ctx, rng() * 512, rng() * 512, 40 + rng() * 90, 'rgba(12,10,8,0.55)');
  // Dunkle, eingetrocknete Spur
  stain(ctx, 300, 200, 50, 'rgba(60,8,6,0.5)');
  return toTexture(c);
}

export function ceilingTexture(seed = 13) {
  const rng = makeRng(seed);
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#3b3a37';
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, rng, 5000, 0.15);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) stain(ctx, rng() * 256, rng() * 256, 30 + rng() * 50, 'rgba(50,40,20,0.4)');
  return toTexture(c);
}

export function lockerTexture() {
  const rng = makeRng(5);
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#4a5651';
  ctx.fillRect(0, 0, 256, 512);
  grain(ctx, 256, 512, rng, 4000, 0.15);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 236, 492);
  // Lüftungsschlitze — durch die schaut man beim Verstecken
  ctx.fillStyle = '#0a0a0a';
  for (let i = 0; i < 7; i++) ctx.fillRect(60, 60 + i * 22, 136, 9);
  ctx.fillStyle = '#9a9a94';
  ctx.fillRect(200, 250, 14, 50);
  for (let i = 0; i < 6; i++) stain(ctx, rng() * 256, rng() * 512, 20 + rng() * 40, 'rgba(90,50,20,0.5)');
  return toTexture(c, false);
}

export function fuseBoxTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#6b6f73';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 240, 240);
  ctx.fillStyle = '#d8b62a';
  ctx.beginPath();
  ctx.moveTo(128, 30); ctx.lineTo(178, 110); ctx.lineTo(78, 110); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', 128, 102);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('HAUPTSTROM', 128, 150);
  // Drei Fassungen
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(48 + i * 60, 172, 40, 56);
  }
  return toTexture(c, false);
}

/** Sicherungskasten-Fassung mit eingesetzter Sicherung (für den Fortschritt). */
export function fuseSlotTexture() {
  const [c, ctx] = canvas(64, 64);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(8, 4, 48, 56);
  ctx.fillStyle = '#7a6012';
  ctx.fillRect(8, 26, 48, 12);
  return toTexture(c, false);
}

export function doorTexture(label = 'AUSGANG') {
  const rng = makeRng(3);
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#3e2f22';
  ctx.fillRect(0, 0, 256, 512);
  grain(ctx, 256, 512, rng, 5000, 0.2);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 228, 484);
  if (label) {
    ctx.fillStyle = '#c8c8c0';
    ctx.fillRect(40, 60, 176, 50);
    ctx.fillStyle = '#7a1a14';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 128, 98, 160);
  } else {
    // Haustür: Kassetten und ein Türknauf
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 6;
    ctx.strokeRect(40, 50, 176, 170);
    ctx.strokeRect(40, 270, 176, 190);
    ctx.fillStyle = '#a08a5a';
    ctx.beginPath();
    ctx.arc(206, 260, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 5; i++) stain(ctx, rng() * 256, rng() * 512, 30, 'rgba(0,0,0,0.4)');
  return toTexture(c, false);
}

/** Hingeschmierte Schrift für die Wände (transparenter Hintergrund). Lange Sprüche werden kleiner gesetzt, damit nichts abgeschnitten wird. */
export function writingTexture(text, seed) {
  const rng = makeRng(seed);
  const [c, ctx] = canvas(512, 256);
  ctx.translate(256, 128);
  ctx.rotate((rng() - 0.5) * 0.18);
  let size = 64;
  const font = () => { ctx.font = `bold ${size}px "Special Elite", Georgia, serif`; };
  font();
  // Platz lassen für die Drehung: höchstens 430 der 512 Pixel Breite
  while (ctx.measureText(text).width > 430 && size > 24) {
    size -= 2;
    font();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(110,14,10,0.9)';
  ctx.fillText(text, 0, 0);
  // Tropfen
  const w = ctx.measureText(text).width;
  for (let i = 0; i < 8; i++) {
    const x = (rng() - 0.5) * w;
    const len = 10 + rng() * 60;
    ctx.fillRect(x, size * 0.32, 3, len);
  }
  return toTexture(c, false);
}

/* ── Zahlenschloss (Wald) ─────────────────────────────────────────────── */

/**
 * In die Rinde geschnitzt: helles, frisch freigelegtes Holz, darin das Zeichen als dunkle Kerbe und
 * darunter die Ziffer, eingeritzt. Transparenter Rand (Rindenstücke ausgefranst).
 */
export function carvingTexture(symbol, digit, seed = 1) {
  const rng = makeRng(seed * 977 + 13);
  const [c, ctx] = canvas(256, 384);
  // ausgefranste helle Schnittfläche
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 1 + (rng() - 0.5) * 0.12;
    const x = 128 + Math.cos(a) * 112 * r;
    const y = 192 + Math.sin(a) * 178 * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(128, 192, 20, 128, 192, 190);
  g.addColorStop(0, '#b89a6e');
  g.addColorStop(0.8, '#8a6d48');
  g.addColorStop(1, '#4a3826');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Holzfasern
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(70,48,28,${0.08 + rng() * 0.16})`;
    ctx.lineWidth = 1 + rng() * 2;
    const x = rng() * 256;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rng() - 0.5) * 20, 130, x + (rng() - 0.5) * 20, 260, x + (rng() - 0.5) * 16, 384);
    ctx.stroke();
  }
  ctx.restore();
  // Kerben: dunkler Grund mit hellem Rand oben links (wirkt eingeschnitten)
  const draw = (fn) => {
    ctx.save(); ctx.translate(-2, -2); fn('rgba(230,210,170,0.55)'); ctx.restore();
    fn('#20140a');
  };
  draw((fill) => drawSymbol(ctx, symbol, 128, 140, 150, { fill }));
  ctx.font = 'bold 96px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  draw((fill) => { ctx.fillStyle = fill; ctx.fillText(String(digit), 128, 300); });
  return toTexture(c, false);
}

/** Messingschild am Zahlenschloss: die Reihenfolge der Zeichen, darunter drei Rädchen. */
export function codeLockTexture(symbols) {
  const rng = makeRng(31);
  const [c, ctx] = canvas(384, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#8c7442');
  g.addColorStop(1, '#5a4826');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 384, 256);
  grain(ctx, 384, 256, rng, 3000, 0.25);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 368, 240);
  // drei (allein) oder vier Zeichen (Koop) gleichmäßig verteilt
  const step = 330 / symbols.length;
  const size = Math.min(82, step - 22);
  symbols.forEach((s, i) => {
    const x = 27 + step * (i + 0.5);
    drawSymbol(ctx, s, x + 1.5, 86 + 1.5, size, { fill: 'rgba(255,240,200,0.35)' });
    drawSymbol(ctx, s, x, 86, size, { fill: '#1a1208' });
    ctx.fillStyle = '#1c1610';
    ctx.fillRect(x - 30, 160, 60, 64);
    ctx.fillStyle = '#6c6458';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, 194);
  });
  for (let i = 0; i < 6; i++) stain(ctx, rng() * 384, rng() * 256, 50, 'rgba(20,30,10,0.35)');
  return toTexture(c, false);
}

/** Jutesack als Kopf des Gärtners: grobes Gewebe, zwei schief vernähte Augenschlitze, Flecken. */
export function sackTexture() {
  const rng = makeRng(77);
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#6b5a40';
  ctx.fillRect(0, 0, 256, 256);
  // Gewebe
  for (let y = 0; y < 256; y += 3) {
    ctx.fillStyle = `rgba(30,22,12,${0.12 + rng() * 0.12})`;
    ctx.fillRect(0, y, 256, 1);
  }
  for (let x = 0; x < 256; x += 3) {
    ctx.fillStyle = `rgba(200,180,140,${0.06 + rng() * 0.08})`;
    ctx.fillRect(x, 0, 1, 256);
  }
  grain(ctx, 256, 256, rng, 4000, 0.3);
  for (let i = 0; i < 7; i++) stain(ctx, rng() * 256, rng() * 256, 20 + rng() * 40, 'rgba(40,10,6,0.45)');
  // Augenschlitze mit Kreuzstichen (vorn = Bildmitte, die Kugel-UV läuft einmal herum)
  ctx.strokeStyle = '#120c06';
  ctx.lineCap = 'round';
  for (const [ex, ey, rot] of [[106, 112, -0.2], [150, 108, 0.25]]) {
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(rot);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let k = -12; k <= 12; k += 6) {
      ctx.beginPath();
      ctx.moveTo(k - 3, -6);
      ctx.lineTo(k + 3, 6);
      ctx.stroke();
    }
    ctx.restore();
  }
  // vernähter Mund
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(108, 160);
  ctx.quadraticCurveTo(128, 168, 150, 158);
  ctx.stroke();
  for (let k = 0; k < 6; k++) {
    const x = 110 + k * 7.5;
    ctx.beginPath();
    ctx.moveTo(x, 155);
    ctx.lineTo(x + 2, 168);
    ctx.stroke();
  }
  const t = toTexture(c, true);
  return t;
}

/* ── Wald ─────────────────────────────────────────────────────────────── */

export function barkTexture() {
  const rng = makeRng(21);
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#6a6052';
  ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 140; i++) {
    const x = rng() * 256;
    const v = 40 + Math.floor(rng() * 70);
    ctx.strokeStyle = `rgba(${v},${v - 4},${v - 8},${0.4 + rng() * 0.5})`;
    ctx.lineWidth = 1 + rng() * 5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    let y = 0;
    let xx = x;
    while (y < 512) {
      y += 20 + rng() * 40;
      xx += (rng() - 0.5) * 8;
      ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  grain(ctx, 256, 512, rng, 4000, 0.2);
  for (let i = 0; i < 6; i++) stain(ctx, rng() * 256, rng() * 512, 20 + rng() * 40, 'rgba(50,70,40,0.4)');
  return toTexture(c);
}

export function forestFloorTexture() {
  const rng = makeRng(23);
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#4a4033';
  ctx.fillRect(0, 0, 512, 512);
  grain(ctx, 512, 512, rng, 14000, 0.25);
  // Laub
  for (let i = 0; i < 700; i++) {
    const x = rng() * 512;
    const y = rng() * 512;
    const r = 3 + rng() * 7;
    ctx.fillStyle = rng() < 0.5
      ? `rgba(${110 + rng() * 50},${70 + rng() * 30},35,0.75)`
      : `rgba(${70 + rng() * 30},${80 + rng() * 30},45,0.65)`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.5, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Zweige
  ctx.strokeStyle = 'rgba(20,14,8,0.8)';
  for (let i = 0; i < 40; i++) {
    const x = rng() * 512;
    const y = rng() * 512;
    const a = rng() * Math.PI;
    const len = 15 + rng() * 40;
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Verwitterte Bretterwand des Hauses; withWindow = vernageltes Fenster mit schwachem Licht dahinter. */
export function sidingTexture(withWindow) {
  const rng = makeRng(withWindow ? 31 : 29);
  const [c, ctx] = canvas(256, 512);
  for (let y = 0; y < 512; y += 32) {
    const v = 52 + Math.floor(rng() * 14);
    ctx.fillStyle = `rgb(${v - 6},${v - 2},${v + 4})`;
    ctx.fillRect(0, y, 256, 32);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, y + 29, 256, 3);
  }
  grain(ctx, 256, 512, rng, 5000, 0.2);
  for (let i = 0; i < 5; i++) stain(ctx, rng() * 256, rng() * 512, 30 + rng() * 50, 'rgba(10,12,14,0.5)');
  let glow = null;
  if (withWindow) {
    ctx.fillStyle = '#0d0a07';
    ctx.fillRect(70, 150, 116, 140);
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(124, 150, 8, 140);
    ctx.fillRect(70, 216, 116, 8);
    // Bretter quer davor
    ctx.fillStyle = '#5a4a38';
    ctx.save();
    ctx.translate(128, 220);
    ctx.rotate(0.2);
    ctx.fillRect(-80, -40, 160, 20);
    ctx.rotate(-0.4);
    ctx.fillRect(-80, 25, 160, 20);
    ctx.restore();
    const [e, ectx] = canvas(256, 512);
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, 256, 512);
    ectx.fillStyle = '#5a3412';
    ectx.fillRect(74, 154, 108, 132);
    glow = toTexture(e, false);
  }
  return { map: toTexture(c, false), glow };
}

/* ── Keller ───────────────────────────────────────────────────────────── */

export function brickTexture() {
  const rng = makeRng(41);
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#2a211d';
  ctx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 16; row++) {
    const off = row % 2 ? 32 : 0;
    for (let x = -64; x < 512; x += 64) {
      const v = 70 + Math.floor(rng() * 30);
      ctx.fillStyle = `rgb(${v + 20},${v - 20},${v - 30})`;
      ctx.fillRect(x + off + 2, row * 32 + 2, 60, 28);
    }
  }
  grain(ctx, 512, 512, rng, 10000, 0.2);
  // Feuchtigkeit von unten, Salzränder
  const g = ctx.createLinearGradient(0, 300, 0, 512);
  g.addColorStop(0, 'rgba(10,14,12,0)');
  g.addColorStop(1, 'rgba(10,14,12,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 300, 512, 212);
  for (let i = 0; i < 12; i++) stain(ctx, rng() * 512, rng() * 512, 30 + rng() * 60, 'rgba(200,200,180,0.12)');
  return toTexture(c);
}

/** Nasser Betonboden mit Pfützen; die Rauheit ist in den Pfützen niedrig (die Lampe spiegelt sich). */
export function wetFloorTextures() {
  const rng = makeRng(43);
  const [c, ctx] = canvas(512, 512);
  const [r, rctx] = canvas(256, 256);
  ctx.fillStyle = '#34322e';
  ctx.fillRect(0, 0, 512, 512);
  grain(ctx, 512, 512, rng, 14000, 0.2);
  rctx.fillStyle = '#e0e0e0';
  rctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6; i++) {
    const x = rng() * 512;
    const y = rng() * 512;
    const rx = 40 + rng() * 90;
    const ry = 20 + rng() * 50;
    ctx.fillStyle = 'rgba(14,16,16,0.6)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
    rctx.fillStyle = '#202020';
    rctx.beginPath();
    rctx.ellipse(x / 2, y / 2, rx / 2, ry / 2, 0, 0, Math.PI * 2);
    rctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 512, 512);
  const map = toTexture(c);
  const rough = new THREE.CanvasTexture(r);
  rough.wrapS = THREE.RepeatWrapping;
  rough.wrapT = THREE.RepeatWrapping;
  return { map, rough };
}

/* ── Die Monster ───────────────────────────────────────────────────────── */

function jagged(ctx, pts, rng, w, h) {
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const x = px + (rng() - 0.5) * w * 0.02;
    const y = py + (rng() - 0.5) * h * 0.01;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
}

/** Der Jäger (Anstalt): hager, zu lange Arme, fahle Maske. Gibt die Augenpositionen zurück. */
function drawHunter(ctx, w, h, rng) {
  const cx = w / 2;
  ctx.fillStyle = '#050506';
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.12, w * 0.11, h * 0.085, 0, 0, Math.PI * 2);
  ctx.fill();
  jagged(ctx, [
    [cx - w * 0.06, h * 0.19], [cx - w * 0.2, h * 0.24], [cx - w * 0.27, h * 0.36],
    [cx - w * 0.33, h * 0.55], [cx - w * 0.36, h * 0.74], [cx - w * 0.31, h * 0.78],
    [cx - w * 0.27, h * 0.6], [cx - w * 0.2, h * 0.42], [cx - w * 0.17, h * 0.62],
    [cx - w * 0.15, h * 0.99], [cx - w * 0.07, h * 0.99], [cx - w * 0.03, h * 0.7],
    [cx + w * 0.03, h * 0.7], [cx + w * 0.07, h * 0.99], [cx + w * 0.15, h * 0.99],
    [cx + w * 0.17, h * 0.62], [cx + w * 0.2, h * 0.42], [cx + w * 0.27, h * 0.6],
    [cx + w * 0.31, h * 0.8], [cx + w * 0.37, h * 0.77], [cx + w * 0.33, h * 0.55],
    [cx + w * 0.27, h * 0.36], [cx + w * 0.2, h * 0.24], [cx + w * 0.06, h * 0.19],
  ], rng, w, h);
  ctx.strokeStyle = '#050506';
  ctx.lineWidth = w * 0.012;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const hx = cx + side * w * 0.34;
    for (let f = 0; f < 4; f++) {
      ctx.beginPath();
      ctx.moveTo(hx + side * w * 0.01 * f, h * 0.76);
      ctx.lineTo(hx + side * w * (0.01 * f + 0.01) + (rng() - 0.5) * w * 0.02, h * (0.83 + rng() * 0.04));
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#b9b4a6';
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.125, w * 0.075, h * 0.065, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * w * 0.03, h * 0.11, w * 0.018, h * 0.016, side * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.158, w * 0.022, h * 0.022, 0, 0, Math.PI * 2);
  ctx.fill();
  return [[cx - w * 0.03, h * 0.11], [cx + w * 0.03, h * 0.11]];
}

/** Der Beobachter (Wald): sehr dünn, Tierschädel mit Geweih, Arme bis zu den Knien. */
function drawWatcher(ctx, w, h, rng) {
  const cx = w / 2;
  ctx.fillStyle = '#060605';
  ctx.strokeStyle = '#060605';
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.lineWidth = w * 0.022;
    let x = cx + side * w * 0.05;
    let y = h * 0.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      const nx = x + side * w * (0.06 + rng() * 0.04);
      const ny = y - h * (0.025 + rng() * 0.015);
      ctx.lineTo(nx, ny);
      ctx.moveTo(nx, ny);
      ctx.lineTo(nx - side * w * 0.02, ny - h * (0.03 + rng() * 0.02));
      ctx.moveTo(nx, ny);
      x = nx;
      y = ny;
    }
    ctx.stroke();
  }
  jagged(ctx, [
    [cx - w * 0.035, h * 0.19], [cx - w * 0.12, h * 0.22], [cx - w * 0.16, h * 0.3],
    [cx - w * 0.2, h * 0.5], [cx - w * 0.21, h * 0.72], [cx - w * 0.17, h * 0.72],
    [cx - w * 0.15, h * 0.5], [cx - w * 0.11, h * 0.38], [cx - w * 0.1, h * 0.6],
    [cx - w * 0.08, h * 0.995], [cx - w * 0.04, h * 0.995], [cx - w * 0.02, h * 0.66],
    [cx + w * 0.02, h * 0.66], [cx + w * 0.04, h * 0.995], [cx + w * 0.08, h * 0.995],
    [cx + w * 0.1, h * 0.6], [cx + w * 0.11, h * 0.38], [cx + w * 0.15, h * 0.5],
    [cx + w * 0.17, h * 0.72], [cx + w * 0.21, h * 0.72], [cx + w * 0.2, h * 0.5],
    [cx + w * 0.16, h * 0.3], [cx + w * 0.12, h * 0.22], [cx + w * 0.035, h * 0.19],
  ], rng, w, h);
  // Tierschädel: oben breit, zur Schnauze hin schmal
  ctx.fillStyle = '#c9c2ae';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.06, h * 0.09);
  ctx.quadraticCurveTo(cx, h * 0.07, cx + w * 0.06, h * 0.09);
  ctx.lineTo(cx + w * 0.03, h * 0.19);
  ctx.quadraticCurveTo(cx, h * 0.2, cx - w * 0.03, h * 0.19);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#000';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * w * 0.025, h * 0.112, w * 0.016, h * 0.014, side * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(cx - w * 0.006, h * 0.15, w * 0.012, h * 0.025);
  return [[cx - w * 0.025, h * 0.112], [cx + w * 0.025, h * 0.112]];
}

/** Der Lauscher (Keller): gebückt und breit, keine Augen — nur ein senkrechter Mund. */
function drawListener(ctx, w, h, rng) {
  const cx = w / 2;
  ctx.fillStyle = '#070606';
  jagged(ctx, [
    [cx - w * 0.1, h * 0.36], [cx - w * 0.3, h * 0.4], [cx - w * 0.4, h * 0.55],
    [cx - w * 0.44, h * 0.8], [cx - w * 0.47, h * 0.99], [cx - w * 0.39, h * 0.99],
    [cx - w * 0.33, h * 0.75], [cx - w * 0.25, h * 0.68], [cx - w * 0.22, h * 0.99],
    [cx - w * 0.13, h * 0.99], [cx - w * 0.08, h * 0.78], [cx + w * 0.08, h * 0.78],
    [cx + w * 0.13, h * 0.99], [cx + w * 0.22, h * 0.99], [cx + w * 0.25, h * 0.68],
    [cx + w * 0.33, h * 0.75], [cx + w * 0.39, h * 0.99], [cx + w * 0.47, h * 0.99],
    [cx + w * 0.44, h * 0.8], [cx + w * 0.4, h * 0.55], [cx + w * 0.3, h * 0.4],
    [cx + w * 0.1, h * 0.36],
  ], rng, w, h);
  ctx.fillStyle = '#8f8676';
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.38, w * 0.13, h * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.39, w * 0.03, h * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d6cdb4';
  for (let i = 0; i < 6; i++) {
    const y = h * (0.35 + i * 0.015);
    ctx.fillRect(cx - w * 0.03, y, w * 0.012, h * 0.004);
    ctx.fillRect(cx + w * 0.018, y + h * 0.006, w * 0.012, h * 0.004);
  }
  return [];
}

/* ── Ansichten von hinten und von der Seite ────────────────────────────── */

/** Jäger von hinten: gleiche Gestalt, Hinterkopf statt Maske. */
function drawHunterBack(ctx, w, h, rng) {
  drawHunter(ctx, w, h, rng);
  ctx.fillStyle = '#050506';
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.125, w * 0.085, h * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wirbelsäule zeichnet sich ab
  ctx.strokeStyle = 'rgba(40,40,44,0.9)';
  ctx.lineWidth = w * 0.01;
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.22);
  ctx.lineTo(w / 2, h * 0.62);
  ctx.stroke();
  return [];
}

/** Jäger im Profil, Blick nach rechts (+x). Ein Bein vorn, eins hinten, Arm hängt weit vor. */
function drawHunterSide(ctx, w, h, rng) {
  const cx = w / 2;
  ctx.fillStyle = '#050506';
  jagged(ctx, [
    [cx - w * 0.02, h * 0.19], [cx + w * 0.1, h * 0.22], [cx + w * 0.14, h * 0.32],
    [cx + w * 0.2, h * 0.5], [cx + w * 0.26, h * 0.76], [cx + w * 0.22, h * 0.78],
    [cx + w * 0.14, h * 0.55], [cx + w * 0.1, h * 0.45], [cx + w * 0.08, h * 0.68],
    [cx + w * 0.2, h * 0.99], [cx + w * 0.13, h * 0.99], [cx + w * 0.01, h * 0.74],
    [cx - w * 0.12, h * 0.99], [cx - w * 0.19, h * 0.99], [cx - w * 0.07, h * 0.68],
    [cx - w * 0.1, h * 0.4], [cx - w * 0.09, h * 0.24],
  ], rng, w, h);
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.03, h * 0.12, w * 0.085, h * 0.085, 0.15, 0, Math.PI * 2);
  ctx.fill();
  // Maske nur vorn sichtbar
  ctx.fillStyle = '#b9b4a6';
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.085, h * 0.125, w * 0.035, h * 0.06, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.09, h * 0.11, w * 0.012, h * 0.014, 0, 0, Math.PI * 2);
  ctx.fill();
  return [];
}

/** Lauscher von hinten: gebückter Rücken mit Wirbeln, kein Gesicht. */
function drawListenerBack(ctx, w, h, rng) {
  drawListener(ctx, w, h, rng);
  ctx.fillStyle = '#0c0b0a';
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.38, w * 0.14, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(70,64,56,0.9)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(w / 2, h * (0.46 + i * 0.045), w * 0.02, h * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return [];
}

/** Lauscher im Profil, Kopf rechts unten: kriecht fast auf allen vieren. */
function drawListenerSide(ctx, w, h, rng) {
  const cx = w / 2;
  ctx.fillStyle = '#070606';
  jagged(ctx, [
    [cx - w * 0.42, h * 0.62], [cx - w * 0.3, h * 0.5], [cx - w * 0.05, h * 0.46],
    [cx + w * 0.2, h * 0.5], [cx + w * 0.3, h * 0.58], [cx + w * 0.26, h * 0.7],
    [cx + w * 0.3, h * 0.99], [cx + w * 0.24, h * 0.99], [cx + w * 0.16, h * 0.74],
    [cx + w * 0.06, h * 0.74], [cx + w * 0.1, h * 0.99], [cx + w * 0.04, h * 0.99],
    [cx - w * 0.04, h * 0.76], [cx - w * 0.22, h * 0.74], [cx - w * 0.2, h * 0.99],
    [cx - w * 0.27, h * 0.99], [cx - w * 0.32, h * 0.74], [cx - w * 0.42, h * 0.99],
    [cx - w * 0.48, h * 0.99], [cx - w * 0.44, h * 0.72],
  ], rng, w, h);
  ctx.fillStyle = '#8f8676';
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.33, h * 0.63, w * 0.12, h * 0.055, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.41, h * 0.66, w * 0.035, h * 0.02, 0.25, 0, Math.PI * 2);
  ctx.fill();
  return [];
}

const VIEWS = {
  hunter: { front: drawHunter, back: drawHunterBack, side: drawHunterSide },
  watcher: { front: drawWatcher, back: drawWatcher, side: drawWatcher },
  listener: { front: drawListener, back: drawListenerBack, side: drawListenerSide },
};

/**
 * Textur + Leuchtkarte (nur die Augen) je Ansicht für ein Monster als Billboard.
 * Die Seitenansicht schaut nach rechts (+x) — für links wird sie gespiegelt.
 * @returns {{ front: {map, emissive}, back: {map, emissive}, side: {map, emissive} }}
 */
export function creatureViews(kind = 'hunter') {
  const W = 256;
  const H = 512;
  const set = VIEWS[kind] || VIEWS.hunter;
  const out = {};
  for (const view of ['front', 'back', 'side']) {
    const [c, ctx] = canvas(W, H);
    const eyes = set[view](ctx, W, H, makeRng(99));
    const [e, ectx] = canvas(W, H);
    ectx.fillStyle = '#000';
    ectx.fillRect(0, 0, W, H);
    for (const [x, y] of eyes) {
      ectx.fillStyle = '#ffffff';
      ectx.beginPath();
      ectx.arc(x, y, W * 0.006, 0, Math.PI * 2);
      ectx.fill();
    }
    out[view] = { map: toTexture(c, false), emissive: toTexture(e, false) };
  }
  return out;
}

/* ── Wald: Kronen, Büsche, Straße, Dach ────────────────────────────────── */

/** Fichte: gestufte, ausgefranste Äste (transparenter Hintergrund). */
export function pineCrownTexture(seed = 61) {
  const rng = makeRng(seed);
  const [c, ctx] = canvas(256, 512);
  const tiers = 9;
  for (let t = 0; t < tiers; t++) {
    const top = 10 + t * 52;
    const half = 22 + t * 12;
    const v = 22 + Math.floor(rng() * 14);
    ctx.fillStyle = `rgb(${v - 6},${v + 14},${v - 4})`;
    ctx.beginPath();
    ctx.moveTo(128, top);
    for (let k = 0; k <= 10; k++) {
      const x = 128 + half * (k / 10);
      const y = top + 80 + (k % 2 ? -14 : 0) + rng() * 10;
      ctx.lineTo(x, y);
    }
    for (let k = 10; k >= 0; k--) {
      const x = 128 - half * (k / 10);
      const y = top + 80 + (k % 2 ? -14 : 0) + rng() * 10;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // hellere Nadelspitzen
    ctx.strokeStyle = 'rgba(80,110,70,0.5)';
    ctx.lineWidth = 2;
    for (let n = 0; n < 14; n++) {
      const x = 128 + (rng() - 0.5) * half * 1.6;
      const y = top + 40 + rng() * 40;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 12, y + 8);
      ctx.stroke();
    }
  }
  return toTexture(c, false);
}

/** Laubbaum: Krone aus vielen Blattbüscheln, Lücken lassen das Licht durch. */
export function leafCrownTexture(seed = 63) {
  const rng = makeRng(seed);
  const [c, ctx] = canvas(512, 512);
  // Äste
  ctx.strokeStyle = '#2a2219';
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    ctx.lineWidth = 6 - i * 0.4;
    ctx.beginPath();
    ctx.moveTo(256, 512);
    ctx.quadraticCurveTo(256 + (rng() - 0.5) * 120, 330, 256 + (rng() - 0.5) * 380, 120 + rng() * 220);
    ctx.stroke();
  }
  for (let i = 0; i < 420; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 200;
    const x = 256 + Math.cos(a) * r * 1.1;
    const y = 230 + Math.sin(a) * r * 0.85;
    const s = 8 + rng() * 18;
    const tone = rng();
    ctx.fillStyle = tone < 0.15
      ? `rgba(${90 + rng() * 40},${60 + rng() * 20},25,0.95)`
      : `rgba(${30 + rng() * 25},${50 + rng() * 30},${22 + rng() * 14},0.95)`;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.7, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, false);
}

/** Busch bzw. Farn am Boden. */
export function bushTexture(seed = 65) {
  const rng = makeRng(seed);
  const [c, ctx] = canvas(256, 128);
  for (let i = 0; i < 26; i++) {
    const x0 = 128 + (rng() - 0.5) * 60;
    const ang = -Math.PI / 2 + (rng() - 0.5) * 2.4;
    const len = 50 + rng() * 60;
    const v = 30 + Math.floor(rng() * 30);
    ctx.strokeStyle = `rgb(${v - 4},${v + 18},${v - 6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, 128);
    const ex = x0 + Math.cos(ang) * len;
    const ey = 128 + Math.sin(ang) * len;
    ctx.quadraticCurveTo(x0 + Math.cos(ang) * len * 0.5, 128 + Math.sin(ang) * len * 0.8, ex, ey);
    ctx.stroke();
    // Fiedern
    ctx.fillStyle = `rgb(${v - 4},${v + 22},${v - 4})`;
    for (let k = 1; k < 9; k++) {
      const t = k / 9;
      const px = x0 + (ex - x0) * t;
      const py = 128 + (ey - 128) * t;
      ctx.beginPath();
      ctx.ellipse(px, py, 7 * (1 - t) + 2, 2.5, ang + 1.2, 0, Math.PI * 2);
      ctx.ellipse(px, py, 7 * (1 - t) + 2, 2.5, ang - 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(c, false);
}

/** Schotterweg mit Reifenspuren. */
export function roadTexture() {
  const rng = makeRng(67);
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#4b463e';
  ctx.fillRect(0, 0, 256, 256);
  grain(ctx, 256, 256, rng, 9000, 0.35);
  for (const x of [70, 186]) {
    ctx.fillStyle = 'rgba(30,26,22,0.45)';
    ctx.fillRect(x - 14, 0, 28, 256);
  }
  ctx.fillStyle = 'rgba(60,80,40,0.35)';
  ctx.fillRect(118, 0, 20, 256);
  return toTexture(c);
}

/** Dachschindeln. */
export function roofTexture() {
  const rng = makeRng(69);
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#22201e';
  ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) {
    for (let x = (row % 2) * 16; x < 256; x += 32) {
      const v = 34 + Math.floor(rng() * 18);
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 4})`;
      ctx.fillRect(x + 1, row * 16 + 1, 30, 14);
    }
  }
  grain(ctx, 256, 256, rng, 3000, 0.2);
  return toTexture(c);
}
