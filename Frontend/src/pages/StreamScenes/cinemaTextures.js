// cinemaTextures.js — gemalte Texturen für das Kino (Stream-Ending-Szene).
// Alles Canvas, keine Bilddateien: lädt sofort und sieht in jeder Auflösung gleich aus.
import { canvasTexture, noise, rng, spacing, FONT } from './sceneKit';

/** Kinoteppich: dunkles Bordeaux mit kleinem goldenen Rautenmuster. */
export function carpetTexture(repeat) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a0f17';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.18, 3, 5000);
    ctx.strokeStyle = 'rgba(214,168,92,0.35)';
    ctx.lineWidth = 2;
    const s = 64;
    for (let y = 0; y <= h; y += s) {
      for (let x = 0; x <= w; x += s) {
        ctx.beginPath();
        ctx.moveTo(x, y - 12); ctx.lineTo(x + 12, y); ctx.lineTo(x, y + 12); ctx.lineTo(x - 12, y);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(214,168,92,0.25)';
    for (let y = s / 2; y < h; y += s) for (let x = s / 2; x < w; x += s) ctx.fillRect(x - 2, y - 2, 4, 4);
  }, { repeat }).tex;
}

/** Akustik-Wandpaneele: Stoffbahnen mit dunklen Fugen. */
export function wallTexture(repeat) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#231a1f';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.12, 11, 9000);
    const r = rng(5);
    for (let x = 0; x < w; x += 128) {
      ctx.fillStyle = `rgba(255,255,255,${0.01 + r() * 0.025})`;
      ctx.fillRect(x + 4, 0, 120, h);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, 0, 4, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, h - 3, w, 3);
  }, { repeat }).tex;
}

/** Roter Samt für Vorhang und Sitze: senkrechte Faserstreifen. */
export function velvetTexture(repeat, base = '#6b0f1a') {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.18})` : `rgba(255,120,120,${r() * 0.06})`;
      ctx.fillRect(r() * w, 0, 1 + r() * 3, h);
    }
    noise(ctx, w, h, 0.1, 23, 3000);
  }, { repeat }).tex;
}

/** Dunkles Holz mit Messing-Druckplatte für die Saaltüren. */
export function doorTexture() {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2b1c16';
    ctx.fillRect(0, 0, w, h);
    const r = rng(31);
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '120,80,50'},${0.08 + r() * 0.12})`;
      ctx.lineWidth = 1 + r() * 2;
      const x = r() * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (r() - 0.5) * 30, h * 0.3, x + (r() - 0.5) * 30, h * 0.7, x + (r() - 0.5) * 20, h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    // Bullauge
    ctx.fillStyle = '#0d0b0a';
    ctx.beginPath(); ctx.arc(w / 2, 150, 46, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b08a4a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(w / 2, 150, 50, 0, Math.PI * 2); ctx.stroke();
    // Druckplatte
    ctx.fillStyle = '#b08a4a';
    ctx.fillRect(w / 2 - 22, 270, 44, 110);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(w / 2 - 22, 370, 44, 10);
  }).tex;
}

/** Leuchtschild (AUSGANG, SAAL 1). */
export function signTexture(text, { fg = '#ffffff', bg = '#0f7a3a', w = 512, h = 128 } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = fg;
    ctx.font = `800 ${Math.round(h * 0.5)}px ${FONT}`;
    spacing(ctx, Math.round(h * 0.08));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 3);
    spacing(ctx, 0);
  }).tex;
}

const POSTERS = [
  { title: 'CHAT\nGEGEN ALLE', tag: 'Jeden Abend live', bg: '#14213d', fg: '#fca311', shape: 'circle' },
  { title: 'DER LETZTE\nRAID', tag: 'Sie kamen zu fünfzig', bg: '#3d0c11', fg: '#f8f0e3', shape: 'bars' },
  { title: 'HYPE\nTRAIN', tag: 'Nächster Halt: Level 5', bg: '#0f3d3e', fg: '#e8d5b5', shape: 'rails' },
  { title: 'NOCH EINE\nRUNDE', tag: 'Eine noch. Wirklich.', bg: '#2b2147', fg: '#f2c14e', shape: 'stripes' },
];

/** Filmplakat im Leuchtkasten (Flur). */
export function posterTexture(index) {
  const p = POSTERS[index % POSTERS.length];
  return canvasTexture(400, 600, (ctx, w, h) => {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p.fg;
    ctx.globalAlpha = 0.9;
    if (p.shape === 'circle') {
      ctx.beginPath(); ctx.arc(w / 2, 200, 130, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.bg; ctx.beginPath(); ctx.arc(w / 2 + 40, 180, 110, 0, Math.PI * 2); ctx.fill();
    } else if (p.shape === 'bars') {
      for (let i = 0; i < 9; i++) ctx.fillRect(40 + i * 37, 320 - (i % 3) * 60 - i * 12, 22, 400);
    } else if (p.shape === 'rails') {
      ctx.lineWidth = 10; ctx.strokeStyle = p.fg;
      ctx.beginPath(); ctx.moveTo(150, 360); ctx.lineTo(195, 60); ctx.moveTo(250, 360); ctx.lineTo(205, 60); ctx.stroke();
      for (let i = 0; i < 8; i++) { const y = 340 - i * 36; const s = 1 - i * 0.1; ctx.fillRect(w / 2 - 70 * s, y, 140 * s, 8); }
    } else {
      for (let i = -6; i < 12; i++) { ctx.save(); ctx.translate(i * 44, 0); ctx.rotate(-0.5); ctx.fillRect(0, 0, 18, 700); ctx.restore(); }
      ctx.fillStyle = p.bg; ctx.fillRect(0, 360, w, h);
    }
    ctx.globalAlpha = 1;
    noise(ctx, w, h, 0.12, index + 40, 4000);
    ctx.fillStyle = p.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `900 54px ${FONT}`;
    p.title.split('\n').forEach((l, i) => ctx.fillText(l, w / 2, 440 + i * 58));
    ctx.font = `600 20px ${FONT}`;
    ctx.globalAlpha = 0.75;
    ctx.fillText(p.tag, w / 2, 560);
    ctx.globalAlpha = 1;
  }).tex;
}

/** Weicher Lichtfleck (für Wandleuchten und Flurdecke). */
export function lightPoolTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,200,140,0.55)');
    g.addColorStop(0.4, 'rgba(255,190,120,0.18)');
    g.addColorStop(1, 'rgba(255,180,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }).tex;
}
