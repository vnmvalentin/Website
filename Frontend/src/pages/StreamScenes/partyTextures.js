// partyTextures.js — Texturen und LED-Wand-Inhalt für den Party-Saal (Stream Starting).
import { canvasTexture, noise, rng, spacing, fitText, FONT } from './sceneKit';

/** Weicher Rauch-Fleck (Nebel, CO2). */
export function smokeTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const r = rng(3);
    for (let i = 0; i < 18; i++) {
      const x = w / 2 + (r() - 0.5) * 40;
      const y = h / 2 + (r() - 0.5) * 40;
      const rad = 22 + r() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }).tex;
}

/** Flammen-Partikel: heller Kern, weicher Rand (additiv gezeichnet). */
export function flameTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }).tex;
}

/** Gitterträger (Truss): Rahmen mit Diagonalen, Rest durchsichtig (alphaTest). */
export function trussTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#c9ccd6';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(5, 5); ctx.lineTo(w - 5, h - 5);
    ctx.stroke();
  }, { repeat: [1, 1] });
}

/** Glänzender dunkler Hallenboden. */
export function concreteTexture(repeat) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.18, 21, 7000);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, h - 2, w, 2);
    ctx.fillRect(w - 2, 0, 2, h);
  }, { repeat }).tex;
}

export const LED_W = 1920;
export const LED_H = 1080;

/**
 * LED-Wand: STREAM STARTING, Countdown, Titel, Hinweis zum Mittanzen, dahinter ein
 * Equalizer im Takt. `pal` = [Farbe A, Farbe B] der aktuellen Lichtstimmung.
 * @param {{ countdown: string|null, title: string, dancers: number, pal: string[], beat: number, hype?: boolean }} s
 */
/** Fledermaus-Silhouette (Mitte x/y, Spannweite sz, Flügelschlag 0 … 1). */
function batShape(ctx, x, y, sz, flap) {
  const up = (flap - 0.5) * sz * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (const side of [-1, 1]) {
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + side * sz * 0.25, y - up - sz * 0.12, x + side * sz * 0.5, y - up);
    ctx.quadraticCurveTo(x + side * sz * 0.4, y - up * 0.4 + sz * 0.05, x + side * sz * 0.33, y + sz * 0.06);
    ctx.quadraticCurveTo(x + side * sz * 0.22, y + sz * 0.0, x + side * sz * 0.14, y + sz * 0.08);
    ctx.quadraticCurveTo(x + side * sz * 0.08, y + sz * 0.02, x, y + sz * 0.06);
  }
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y + sz * 0.02, sz * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

/** Halloween-Hintergrund der LED-Wand: Nachthimmel, Vollmond, Fledermäuse, Grabsteine. */
function drawHalloweenSky(ctx, t, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#120624');
  g.addColorStop(0.65, '#1c0a1e');
  g.addColorStop(1, '#2a0d08');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Mond mit Hof
  const mx = 1640, my = 190;
  const halo = ctx.createRadialGradient(mx, my, 60, mx, my, 330);
  halo.addColorStop(0, 'rgba(255,214,150,0.35)');
  halo.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 340, my - 340, 680, 680);
  ctx.fillStyle = '#ffe2a8';
  ctx.beginPath();
  ctx.arc(mx, my, 118, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,150,90,0.35)';
  for (const [dx, dy, r] of [[-38, -22, 26], [30, 36, 18], [44, -40, 12], [-10, 52, 10]]) {
    ctx.beginPath();
    ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fledermäuse ziehen über den Himmel
  ctx.fillStyle = '#0a0410';
  for (let i = 0; i < 7; i++) {
    const sp = 70 + i * 23;
    const x = ((t * sp + i * 413) % (w + 400)) - 200;
    const y = 120 + ((i * 97) % 260) + Math.sin(t * 1.7 + i) * 26;
    batShape(ctx, x, y, 70 + (i % 3) * 26, 0.5 + 0.5 * Math.sin(t * 12 + i * 2));
  }
  // Friedhof-Silhouette unten
  ctx.fillStyle = '#07030a';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h - 70);
  ctx.quadraticCurveTo(w * 0.25, h - 120, w * 0.5, h - 80);
  ctx.quadraticCurveTo(w * 0.75, h - 40, w, h - 95);
  ctx.lineTo(w, h);
  ctx.fill();
  for (const [x, gw, gh] of [[150, 70, 110], [330, 56, 80], [1560, 64, 120], [1770, 80, 96]]) {
    ctx.beginPath();
    ctx.moveTo(x - gw / 2, h);
    ctx.lineTo(x - gw / 2, h - gh + gw / 2);
    ctx.arc(x, h - gh + gw / 2, gw / 2, Math.PI, 0);
    ctx.lineTo(x + gw / 2, h);
    ctx.fill();
  }
}

export function drawLedWall(ctx, t, s) {
  const w = LED_W, h = LED_H;
  const spooky = s.theme === 'halloween';
  if (spooky) drawHalloweenSky(ctx, t, w, h);
  else {
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, w, h);
  }

  // Equalizer: 48 Balken von unten, Höhe aus überlagerten Wellen + Taktschlag
  const bars = 48;
  const bw = w / bars;
  const kick = Math.max(0, 1 - (s.beat % 1) * 2.2);
  for (let i = 0; i < bars; i++) {
    const x = i * bw;
    const center = 1 - Math.abs(i - bars / 2) / (bars / 2);
    let f = 0.5 + 0.5 * Math.sin(i * 0.45 + t * 2.1) * Math.sin(i * 0.13 - t * 1.3);
    let bh = h * (0.12 + 0.3 * f * (0.5 + center * 0.5) + 0.12 * kick * center);
    if (s.audio) {
      // Echte Musik: Mitte = Bass, dann Mitten, außen Höhen — etwas Bewegung bleibt
      const a = s.audio;
      const band = center > 0.66 ? a.bass : center > 0.33 ? a.mid : a.high;
      f = 0.75 * band + 0.25 * f;
      bh = h * (0.08 + 0.55 * f * (0.55 + center * 0.45));
    }
    ctx.fillStyle = i % 2 ? s.pal[0] : s.pal[1];
    ctx.globalAlpha = s.hype ? 0.5 : 0.28;
    for (let y = h - 8; y > h - bh; y -= 22) ctx.fillRect(x + 4, y - 16, bw - 8, 16);
  }
  ctx.globalAlpha = 1;

  // Feine Zeilen wie bei einer echten LED-Wand
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = spooky ? 'rgba(255,190,110,0.85)' : 'rgba(255,255,255,0.6)';
  ctx.font = `800 36px ${FONT}`;
  spacing(ctx, 16);
  ctx.fillText(spooky ? 'HAPPY HALLOWEEN' : 'GLEICH LIVE', w / 2, 250);
  ctx.fillStyle = spooky ? '#ff8a1e' : '#fff';
  ctx.font = `900 168px ${FONT}`;
  spacing(ctx, 10);
  ctx.fillText('STREAM STARTING', w / 2, 380);
  spacing(ctx, 0);

  if (s.countdown) {
    ctx.font = `800 150px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(s.countdown, w / 2, 570);
  } else {
    ctx.font = `700 64px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText("Gleich geht's los", w / 2, 560);
  }
  if (s.title) {
    ctx.font = `600 46px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(fitText(ctx, s.title, 1500), w / 2, 700);
  }

  // Laufender Song (YTMusicApp)
  if (s.song) {
    ctx.font = `600 40px ${FONT}`;
    ctx.fillStyle = s.pal[1];
    const line = s.song.artist ? `${s.song.artist}  —  ${s.song.title}` : s.song.title;
    ctx.fillText(fitText(ctx, `NOW PLAYING  ·  ${line}`, 1700), w / 2, s.title ? 780 : 720);
  }

  // Hinweis unten
  ctx.font = `700 40px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const hint = s.hype
    ? `VOLLE TANZFLÄCHE  ·  ${s.dancers} Leute tanzen mit`
    : s.dancers > 0
    ? `${s.dancers} auf der Tanzfläche  ·  Schreib in den Chat und tanz mit`
    : 'Schreib in den Chat und komm auf die Tanzfläche';
  ctx.fillText(hint, w / 2, 860);
}
