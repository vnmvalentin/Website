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
export function drawLedWall(ctx, t, s) {
  const w = LED_W, h = LED_H;
  ctx.fillStyle = '#05050a';
  ctx.fillRect(0, 0, w, h);

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
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `800 36px ${FONT}`;
  spacing(ctx, 16);
  ctx.fillText('GLEICH LIVE', w / 2, 250);
  ctx.fillStyle = '#fff';
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
