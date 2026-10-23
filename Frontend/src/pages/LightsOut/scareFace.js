// scareFace.js — die Fratze für den Jumpscare. Bewusst ohne three.js, damit das Hauptmenü leicht bleibt.
//
// Kein sauberes Comic-Gesicht: lang gezogen, Unterkiefer ausgehakt, schwarze
// Schlieren aus den Augen, Körnung und Verwischung darüber.
import { makeRng } from './maze';

/** Großes Gesicht für den Jumpscare, auf ein bestehendes Canvas. */
export function drawScareFace(target) {
  const ctx = target.getContext('2d');
  const w = target.width;
  const h = target.height;
  const rng = makeRng(Math.floor(Math.random() * 1e9));
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.42;
  const r = Math.min(w, h) * 0.36;

  // Kopf: schmal und viel zu lang, unten in den aufgerissenen Kiefer übergehend
  const skin = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.35, r * 0.05, cx, cy + r * 0.2, r * 1.5);
  skin.addColorStop(0, '#cfc8b6');
  skin.addColorStop(0.45, '#8f887a');
  skin.addColorStop(0.8, '#3a3630');
  skin.addColorStop(1, '#000');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.05);
  ctx.bezierCurveTo(cx + r * 0.85, cy - r * 1.05, cx + r * 0.8, cy + r * 0.2, cx + r * 0.55, cy + r * 0.75);
  ctx.bezierCurveTo(cx + r * 0.42, cy + r * 1.35, cx + r * 0.2, cy + r * 1.75, cx, cy + r * 1.75);
  ctx.bezierCurveTo(cx - r * 0.2, cy + r * 1.75, cx - r * 0.45, cy + r * 1.3, cx - r * 0.58, cy + r * 0.7);
  ctx.bezierCurveTo(cx - r * 0.82, cy + r * 0.1, cx - r * 0.85, cy - r * 1.05, cx, cy - r * 1.05);
  ctx.fill();

  // Augenhöhlen: unterschiedlich groß, weich ausgefranst
  const sockets = [[-0.3, -0.18, 0.21, 0.27], [0.31, -0.14, 0.19, 0.24]];
  for (const [ox, oy, rx, ry] of sockets) {
    const x = cx + ox * r;
    const y = cy + oy * r;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * Math.max(rx, ry) * 1.35);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.95)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r * rx * 1.35, r * ry * 1.35, ox * 0.6, 0, Math.PI * 2);
    ctx.fill();
    // Schwarze Schlieren nach unten
    for (let k = 0; k < 3; k++) {
      const sx = x + (rng() - 0.5) * r * rx;
      const len = r * (0.5 + rng() * 0.8);
      const sg = ctx.createLinearGradient(0, y, 0, y + len);
      sg.addColorStop(0, 'rgba(0,0,0,0.9)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(sx - r * 0.03, y);
      ctx.quadraticCurveTo(sx + (rng() - 0.5) * r * 0.1, y + len * 0.6, sx, y + len);
      ctx.quadraticCurveTo(sx + r * 0.02, y + len * 0.5, sx + r * 0.03, y);
      ctx.fill();
    }
    // Winziger Lichtpunkt tief in der Höhle
    ctx.fillStyle = 'rgba(230,226,214,0.9)';
    ctx.beginPath();
    ctx.arc(x + r * 0.02, y + r * 0.05, r * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mund: ausgehakter Kiefer, ein langer schwarzer Schlund
  const my = cy + r * 0.5;
  const mouth = ctx.createLinearGradient(0, my - r * 0.2, 0, my + r * 1.0);
  mouth.addColorStop(0, '#000');
  mouth.addColorStop(1, '#0a0303');
  ctx.fillStyle = mouth;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.2, my - r * 0.12);
  ctx.bezierCurveTo(cx - r * 0.05, my - r * 0.22, cx + r * 0.1, my - r * 0.2, cx + r * 0.22, my - r * 0.1);
  ctx.bezierCurveTo(cx + r * 0.3, my + r * 0.4, cx + r * 0.16, my + r * 0.95, cx + r * 0.02, my + r * 1.0);
  ctx.bezierCurveTo(cx - r * 0.14, my + r * 0.95, cx - r * 0.3, my + r * 0.4, cx - r * 0.2, my - r * 0.12);
  ctx.fill();
  // Ein paar unregelmäßige Zahnstümpfe oben im Schlund
  ctx.fillStyle = 'rgba(190,180,150,0.85)';
  for (let i = 0; i < 6; i++) {
    const tx = cx - r * 0.16 + i * r * 0.065 + (rng() - 0.5) * r * 0.02;
    const ty = my - r * 0.13 + Math.abs(i - 2.5) * r * 0.012;
    ctx.beginPath();
    ctx.moveTo(tx - r * 0.018, ty);
    ctx.lineTo(tx + r * 0.018, ty);
    ctx.lineTo(tx + (rng() - 0.5) * r * 0.02, ty + r * (0.05 + rng() * 0.07));
    ctx.closePath();
    ctx.fill();
  }

  // Adern: feine, halbtransparente Linien statt Zickzack
  ctx.strokeStyle = 'rgba(40,24,20,0.35)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    let x = cx + (rng() - 0.5) * r * 1.2;
    let y = cy + (rng() - 0.6) * r * 1.6;
    let a = rng() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 12; k++) {
      a += (rng() - 0.5) * 0.7;
      x += Math.cos(a) * r * 0.035;
      y += Math.sin(a) * r * 0.035;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Körnung und senkrechte Verwischung über alles
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 38;
    d[i] = Math.max(0, Math.min(255, d[i] + n + 6));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n - 4));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n - 6));
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.25;
  for (let k = 1; k <= 3; k++) ctx.drawImage(target, 0, k * 6);
  ctx.globalAlpha = 1;

  // Ränder ins Schwarze ziehen
  const v = ctx.createRadialGradient(cx, h / 2, Math.min(w, h) * 0.3, cx, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}
