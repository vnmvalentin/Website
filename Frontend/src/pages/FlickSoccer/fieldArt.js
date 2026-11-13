// fieldArt.js — das Aussehen der Spielfelder. Jedes Feld (engine/fields.js) nennt ein `theme`; hier steht, wie dessen
// Boden, Linien, Bande, Tore und Hindernisse gezeichnet werden: Rasen, Hallenparkett, Asphalt, Scheunenboden, Eis,
// Flippertisch, Weltraum, Sand, Kopfsteinpflaster, Tartanbahn. Alles flach (keine Verläufe, kein Leuchten) und in
// Feld-Einheiten. Der Hintergrund ändert sich während eines Spiels nie und wird deshalb einmal vorgezeichnet
// (render.js); was sich bewegt (Portal-Wirbel, aufblitzende Bumper), zeichnet drawFieldLive in jedem Bild darüber.
//
// Der eigene Rasen aus dem Profil (turf) gilt nur auf Rasenfeldern.

import { star } from './discArt.js';

const TAU = Math.PI * 2;
export const FRAME = 30; // dunkler Rand um Feld und Tore (dort liegen die Banden)

/** Zeichenbereich eines Feldes in Feld-Einheiten (Feld + Torkästen + Rand). */
export function worldOf(field) {
  return {
    x0: -field.GOAL_D - FRAME,
    y0: -FRAME,
    w: field.W + 2 * (field.GOAL_D + FRAME),
    h: field.H + 2 * FRAME,
  };
}

// kleiner fester Zufall: dasselbe Feld sieht immer gleich aus
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** Umriss der Spielfläche (ohne Torkästen) als Pfad; inset rückt ihn nach innen. */
export function pitchPath(ctx, f, inset = 0) {
  const { W, H } = f;
  const i = inset;
  ctx.beginPath();
  if (f.round > 0) {
    const r = Math.max(0, f.round - i);
    ctx.moveTo(i + r, i);
    ctx.arcTo(W - i, i, W - i, H - i, r);
    ctx.arcTo(W - i, H - i, i, H - i, r);
    ctx.arcTo(i, H - i, i, i, r);
    ctx.arcTo(i, i, W - i, i, r);
    ctx.closePath();
  } else if (f.cut > 0) {
    const c = f.cut + i * 0.4;
    ctx.moveTo(c, i);
    ctx.lineTo(W - c, i);
    ctx.lineTo(W - i, c);
    ctx.lineTo(W - i, H - c);
    ctx.lineTo(W - c, H - i);
    ctx.lineTo(c, H - i);
    ctx.lineTo(i, H - c);
    ctx.lineTo(i, c);
    ctx.closePath();
  } else {
    ctx.rect(i, i, W - 2 * i, H - 2 * i);
  }
}

// ── Rasen (mit dem eigenen Muster aus dem Profil) ─────────────────────────────────────────

export const TURF_COLORS = {
  streifen: { a: '#2f8a48', b: '#2a8043', line: 'rgb(255 255 255 / 0.9)' },
  karo: { a: '#2f8a48', b: '#287c40', line: 'rgb(255 255 255 / 0.9)' },
  kreise: { a: '#2f8a48', b: '#2a8043', line: 'rgb(255 255 255 / 0.9)' },
  nacht: { a: '#1c5d55', b: '#19544d', line: 'rgb(214 240 255 / 0.9)' },
  sand: { a: '#d8b76a', b: '#d0ae5f', line: 'rgb(255 255 255 / 0.95)' },
};

/** Füllt das Rechteck (0,0)–(w,h) mit dem Rasenmuster. */
export function paintTurf(ctx, turf, w, h) {
  const c = TURF_COLORS[turf] || TURF_COLORS.streifen;
  ctx.fillStyle = c.a;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c.b;
  if (turf === 'karo') {
    const n = 14;
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j * s < h; j++) if ((i + j) % 2) ctx.fillRect(i * s, j * s, s + 0.5, s + 0.5);
  } else if (turf === 'kreise') {
    const step = 46;
    const max = Math.hypot(w, h) / 2;
    for (let r = Math.ceil(max / step) * step; r > 0; r -= step) {
      ctx.fillStyle = Math.round(r / step) % 2 ? c.b : c.a;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, TAU);
      ctx.fill();
    }
  } else {
    // Längsstreifen + leichtes Karo (Standard, Nachtspiel, Strand)
    const stripes = 14;
    for (let i = 1; i < stripes; i += 2) ctx.fillRect((w / stripes) * i, 0, w / stripes + 0.5, h);
    ctx.fillStyle = 'rgb(0 0 0 / 0.045)';
    const rows = 8;
    for (let j = 1; j < rows; j += 2) ctx.fillRect(0, (h / rows) * j, w, h / rows);
  }
}

// ── Böden der anderen Felder ──────────────────────────────────────────────────────────────

function paintParkett(ctx, f) {
  const { W, H } = f;
  ctx.fillStyle = '#c99b5c';
  ctx.fillRect(0, 0, W, H);
  const rnd = lcg(7);
  const row = 24;
  const tones = ['#c4955a', '#cfa265', '#bf8f52', '#d2a66a'];
  for (let y = 0, j = 0; y < H; y += row, j++) {
    // Dielen in versetzten Längen
    let x = -((j * 67) % 150);
    while (x < W) {
      const len = 130 + Math.floor(rnd() * 90);
      ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
      ctx.fillRect(x, y, len, row);
      ctx.fillStyle = 'rgb(70 40 10 / 0.22)';
      ctx.fillRect(x + len - 1, y, 1.4, row);
      x += len;
    }
    ctx.fillStyle = 'rgb(70 40 10 / 0.16)';
    ctx.fillRect(0, y, W, 1.2);
  }
}

function paintAsphalt(ctx, f) {
  const { W, H } = f;
  ctx.fillStyle = '#3b3f45';
  ctx.fillRect(0, 0, W, H);
  const rnd = lcg(21);
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgb(255 255 255 / 0.07)' : 'rgb(0 0 0 / 0.16)';
    ctx.fillRect(rnd() * W, rnd() * H, 1.5 + rnd() * 2, 1.5 + rnd() * 2);
  }
  // geflickte Stellen und Risse
  ctx.fillStyle = 'rgb(0 0 0 / 0.12)';
  ctx.fillRect(W * 0.62, H * 0.14, 120, 70);
  ctx.fillRect(W * 0.16, H * 0.66, 90, 110);
  ctx.strokeStyle = 'rgb(0 0 0 / 0.35)';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  for (const [sx, sy, n] of [[W * 0.3, H * 0.1, 7], [W * 0.75, H * 0.6, 6], [W * 0.46, H * 0.82, 5]]) {
    ctx.beginPath();
    let x = sx;
    let y = sy;
    ctx.moveTo(x, y);
    for (let k = 0; k < n; k++) {
      x += 14 + rnd() * 26;
      y += (rnd() - 0.4) * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function paintStroh(ctx, f) {
  const { W, H } = f;
  ctx.fillStyle = '#b8894a';
  ctx.fillRect(0, 0, W, H);
  // breite Bodenbretter quer
  ctx.fillStyle = 'rgb(60 30 5 / 0.14)';
  for (let x = 0; x < W; x += 72) ctx.fillRect(x, 0, 2, H);
  const rnd = lcg(33);
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const a = rnd() * Math.PI;
    const len = 7 + rnd() * 13;
    ctx.strokeStyle = rnd() < 0.62 ? 'rgb(240 214 130 / 0.55)' : 'rgb(120 84 36 / 0.4)';
    ctx.lineWidth = 1.2 + rnd();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function paintEis(ctx, f) {
  const { W, H } = f;
  ctx.fillStyle = '#e4f0f6';
  ctx.fillRect(0, 0, W, H);
  const rnd = lcg(55);
  // Kufenspuren
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 150; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const a = rnd() * TAU;
    const len = 30 + rnd() * 90;
    const bend = (rnd() - 0.5) * 50;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgb(110 150 180 / 0.2)' : 'rgb(255 255 255 / 0.7)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, y + Math.sin(a) * len * 0.5 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

function paintFlipper(ctx, f) {
  const { W, H } = f;
  ctx.fillStyle = '#171b38';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgb(255 255 255 / 0.045)';
  ctx.lineWidth = 2;
  for (let k = -H; k < W; k += 28) {
    ctx.beginPath();
    ctx.moveTo(k, H);
    ctx.lineTo(k + H, 0);
    ctx.stroke();
  }
  // Pfeilbahnen zu den Toren
  for (const side of [0, 1]) {
    const dir = side === 0 ? -1 : 1;
    ctx.fillStyle = side === 0 ? 'rgb(255 79 154 / 0.2)' : 'rgb(63 208 224 / 0.2)';
    for (let k = 0; k < 4; k++) {
      const x = W / 2 + dir * (170 + k * 62);
      ctx.beginPath();
      ctx.moveTo(x, H / 2 - 40);
      ctx.lineTo(x + dir * 26, H / 2);
      ctx.lineTo(x, H / 2 + 40);
      ctx.lineTo(x + dir * 12, H / 2 + 40);
      ctx.lineTo(x + dir * 38, H / 2);
      ctx.lineTo(x + dir * 12, H / 2 - 40);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Sterne in den Ecken
  ctx.fillStyle = 'rgb(255 216 74 / 0.5)';
  for (const [sx, sy] of [[110, 90], [W - 110, 90], [110, H - 90], [W - 110, H - 90]]) {
    star(ctx, sx, sy, 30, 13);
    ctx.fill();
  }
}

function paintWeltraum(ctx, f) {
  const { W, H } = f;
  ctx.fillStyle = '#0a0d1e';
  ctx.fillRect(0, 0, W, H);
  // ferne Planeten
  ctx.fillStyle = '#231f4a';
  ctx.beginPath();
  ctx.arc(W * 0.8, H * 0.2, 74, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2e2960';
  ctx.beginPath();
  ctx.arc(W * 0.8 - 18, H * 0.2 - 16, 52, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#12233a';
  ctx.beginPath();
  ctx.arc(W * 0.16, H * 0.78, 46, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgb(120 150 255 / 0.07)';
  ctx.lineWidth = 1.5;
  for (let x = 100; x < W; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 80; y < H; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  const rnd = lcg(77);
  for (let i = 0; i < 260; i++) {
    const big = rnd() < 0.08;
    ctx.fillStyle = `rgb(${big ? '190 220 255' : '255 255 255'} / ${0.25 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, big ? 2.1 : 0.7 + rnd() * 0.8, 0, TAU);
    ctx.fill();
  }
}

function paintSand(ctx, f) {
  const { W, H } = f;
  ctx.fillStyle = '#e2c27c';
  ctx.fillRect(0, 0, W, H);
  // Windrippen
  ctx.strokeStyle = 'rgb(150 110 50 / 0.17)';
  ctx.lineWidth = 2.2;
  for (let y = 18; y < H; y += 30) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 20) {
      const yy = y + Math.sin(x / 70 + y) * 6;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  const rnd = lcg(91);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgb(255 244 210 / 0.5)' : 'rgb(140 100 45 / 0.25)';
    ctx.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
  }
  // Strandgut: Seestern und Muscheln (nur Zeichnung)
  ctx.fillStyle = '#e2703d';
  star(ctx, W * 0.86, H * 0.84, 22, 9);
  ctx.fill();
  ctx.fillStyle = '#f6ead2';
  for (const [sx, sy] of [[W * 0.1, H * 0.14], [W * 0.63, H * 0.1]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 11, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }
}

function paintStein(ctx, f) {
  const { W, H } = f;
  ctx.fillStyle = '#5c5955';
  ctx.fillRect(0, 0, W, H);
  const rnd = lcg(13);
  const tones = ['#7d7a75', '#75726d', '#86837e', '#6f6c68', '#7a7670'];
  const cw = 46;
  const ch = 34;
  for (let y = 0, j = 0; y < H; y += ch, j++) {
    for (let x = j % 2 ? -cw / 2 : 0; x < W; x += cw) {
      ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, cw - 4, ch - 4, 7);
      ctx.fill();
    }
  }
  // Moos in den Fugen
  ctx.fillStyle = 'rgb(84 128 62 / 0.28)';
  for (const [mx, my, mr] of [[W * 0.2, H * 0.2, 46], [W * 0.72, H * 0.76, 58], [W * 0.88, H * 0.18, 34], [W * 0.36, H * 0.86, 30]]) {
    ctx.beginPath();
    ctx.ellipse(mx, my, mr, mr * 0.6, 0.4, 0, TAU);
    ctx.fill();
  }
}

function paintTartan(ctx, f) {
  const { W, H } = f;
  ctx.fillStyle = '#b4472f';
  ctx.fillRect(0, 0, W, H);
  const rnd = lcg(29);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgb(255 255 255 / 0.05)' : 'rgb(60 10 0 / 0.14)';
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  // Laufbahnen am Rand
  ctx.strokeStyle = 'rgb(255 255 255 / 0.5)';
  ctx.lineWidth = 2.2;
  for (const inset of [22, 44, 66]) {
    pitchPath(ctx, f, inset);
    ctx.stroke();
  }
  // Rasen-Innenfeld
  ctx.save();
  pitchPath(ctx, f, 66);
  ctx.clip();
  paintTurf(ctx, 'streifen', W, H);
  ctx.restore();
}

// ── Themen ────────────────────────────────────────────────────────────────────────────────
// outside: Umgebung · frame: Bande · line: Hauptlinien · goal/net/post: Torkasten · marks: Art der Feldlinien

const THEMES = {
  rasen: { outside: '#0d1612', frame: '#1d2b25', goal: '#10221a', net: 'rgb(255 255 255 / 0.28)', post: '#f4f6f4', marks: 'fussball' },
  parkett: {
    outside: '#15110c', frame: '#4a321c', line: '#f6f3ea', goal: '#2b1d10', net: 'rgb(255 255 255 / 0.32)', post: '#f4f6f4',
    marks: 'halle', paint: paintParkett,
  },
  asphalt: {
    outside: '#101214', frame: '#7c858d', line: '#f0c52e', goal: '#1f2226', net: 'rgb(200 210 220 / 0.4)', post: '#c9d0d6',
    marks: 'fussball', circle: 'rgb(255 255 255 / 0.85)', paint: paintAsphalt,
  },
  stroh: {
    outside: '#2b1711', frame: '#8a3023', line: 'rgb(250 244 224 / 0.9)', goal: '#4d3320', net: 'rgb(30 15 5 / 0.45)', post: '#e8d9b0',
    marks: 'fussball', dash: [26, 7], planks: true, paint: paintStroh,
  },
  eis: {
    outside: '#0d1419', frame: '#f4f6f4', kick: '#f2c230', line: 'rgb(70 110 150 / 0.4)', goal: '#c4d9e6', net: 'rgb(60 100 140 / 0.45)', post: '#d9363e',
    marks: 'hockey', paint: paintEis,
  },
  flipper: {
    outside: '#0a0b18', frame: '#2c3260', lights: true, line: '#ff4f9a', circle: '#3fd0e0', goal: '#0e1026', net: 'rgb(255 216 74 / 0.4)', post: '#ffd84a',
    marks: 'fussball', paint: paintFlipper,
  },
  weltraum: {
    outside: '#05060e', frame: '#3b4676', line: 'rgb(160 205 255 / 0.85)', goal: '#070914', net: 'rgb(160 205 255 / 0.3)', post: '#bcd9ff',
    marks: 'fussball', paint: paintWeltraum,
  },
  sand: {
    outside: '#1c7ea6', waves: true, frame: '#f1e6c8', line: 'rgb(255 255 255 / 0.92)', goal: '#b8975a', net: 'rgb(255 255 255 / 0.5)', post: '#ffffff',
    marks: 'fussball', paint: paintSand,
  },
  stein: {
    outside: '#181715', frame: '#3d3a37', blocks: '#58544f', line: 'rgb(255 255 255 / 0.78)', goal: '#2a2826', net: 'rgb(255 255 255 / 0.22)', post: '#d8d3c8',
    marks: 'fussball', paint: paintStein,
  },
  tartan: {
    outside: '#12100e', frame: '#ece7dc', line: 'rgb(255 255 255 / 0.92)', goal: '#3a1a12', net: 'rgb(255 255 255 / 0.36)', post: '#ffffff',
    marks: 'fussball', paint: paintTartan,
  },
};

function themeOf(f) {
  return THEMES[f.theme] || THEMES.rasen;
}

// ── Linien ────────────────────────────────────────────────────────────────────────────────

function marksFussball(ctx, f, th, line) {
  const { W, H, GOAL_W } = f;
  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  ctx.lineWidth = 3.2;
  if (th.dash) ctx.setLineDash(th.dash);
  pitchPath(ctx, f, 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  // Strafräume wachsen mit dem Tor mit
  const boxD = W * 0.16;
  const boxH = Math.min(H - 40, Math.max(H * 0.6, GOAL_W + 90));
  const smallD = W * 0.065;
  const smallH = Math.min(H - 80, Math.max(H * 0.42, GOAL_W + 50));
  const arcR = f.CENTER_R * 0.95;
  for (const side of [0, 1]) {
    const sx = side === 0 ? 0 : W;
    const dir = side === 0 ? 1 : -1;
    ctx.strokeRect(Math.min(sx, sx + dir * boxD), (H - boxH) / 2, boxD, boxH);
    ctx.strokeRect(Math.min(sx, sx + dir * smallD), (H - smallH) / 2, smallD, smallH);
    const spotX = sx + dir * W * 0.11;
    ctx.beginPath();
    ctx.arc(spotX, H / 2, 4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    const a = Math.acos(Math.min(1, (boxD - W * 0.11) / arcR));
    if (side === 0) ctx.arc(spotX, H / 2, arcR, -a, a);
    else ctx.arc(spotX, H / 2, arcR, Math.PI - a, Math.PI + a);
    ctx.stroke();
    if (f.cut === 0 && f.round === 0) {
      for (const cy of [0, H]) {
        ctx.beginPath();
        const start = side === 0 ? (cy === 0 ? 0 : -Math.PI / 2) : cy === 0 ? Math.PI / 2 : Math.PI;
        ctx.arc(sx, cy, 16, start, start + Math.PI / 2);
        ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]);
  // Mittelkreis (auf manchen Feldern in einer zweiten Farbe)
  ctx.strokeStyle = th.circle || line;
  ctx.fillStyle = th.circle || line;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, f.CENTER_R, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 5, 0, TAU);
  ctx.fill();
}

// Sporthalle: weiße Hauptlinien, Torraum als Halbkreis, dazu die bunten Linien anderer Sportarten
function marksHalle(ctx, f, th) {
  const { W, H, GOAL_W } = f;
  // fremde Linien zuerst (liegen „unter" den Fußball-Linien)
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = 'rgb(44 111 214 / 0.75)';
  ctx.strokeRect(46, 46, W - 92, H - 92);
  ctx.strokeStyle = 'rgb(40 150 90 / 0.7)';
  for (const x of [W * 0.33, W * 0.67]) {
    ctx.beginPath();
    ctx.moveTo(x, 46);
    ctx.lineTo(x, H - 46);
    ctx.stroke();
  }
  const r = GOAL_W / 2 + 62;
  ctx.setLineDash([14, 9]);
  ctx.strokeStyle = 'rgb(226 85 47 / 0.9)';
  for (const side of [0, 1]) {
    ctx.beginPath();
    if (side === 0) ctx.arc(0, H / 2, r + 44, -Math.PI / 2, Math.PI / 2);
    else ctx.arc(W, H / 2, r + 44, Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = th.line;
  ctx.fillStyle = th.line;
  ctx.lineWidth = 3.4;
  ctx.strokeRect(1.7, 1.7, W - 3.4, H - 3.4);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, f.CENTER_R, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 5, 0, TAU);
  ctx.fill();
  for (const side of [0, 1]) {
    ctx.beginPath();
    if (side === 0) ctx.arc(0, H / 2, r, -Math.PI / 2, Math.PI / 2);
    else ctx.arc(W, H / 2, r, Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(side === 0 ? r + 22 : W - r - 22, H / 2, 4, 0, TAU);
    ctx.fill();
  }
}

// Eishockey: rote Mittellinie, zwei blaue Linien, Bullykreise, blaue Torräume
function marksHockey(ctx, f, th) {
  const { W, H, GOAL_W } = f;
  const red = '#d9363e';
  const blue = '#2f6fd0';
  ctx.lineWidth = 7;
  ctx.strokeStyle = blue;
  for (const x of [W * 0.32, W * 0.68]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.strokeStyle = red;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = blue;
  ctx.fillStyle = blue;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, f.CENTER_R, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = red;
  ctx.fillStyle = red;
  for (const [cx, cy] of [[W * 0.17, H * 0.24], [W * 0.17, H * 0.76], [W * 0.83, H * 0.24], [W * 0.83, H * 0.76]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, TAU);
    ctx.fill();
  }
  // Torlinien und Torräume
  ctx.lineWidth = 2.4;
  for (const side of [0, 1]) {
    const x = side === 0 ? 0 : W;
    ctx.fillStyle = 'rgb(60 140 220 / 0.26)';
    ctx.beginPath();
    if (side === 0) ctx.arc(x, H / 2, GOAL_W / 2 + 8, -Math.PI / 2, Math.PI / 2);
    else ctx.arc(x, H / 2, GOAL_W / 2 + 8, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = th.line;
  ctx.lineWidth = 2;
  pitchPath(ctx, f, 1);
  ctx.stroke();
}

const MARKS = { fussball: marksFussball, halle: marksHalle, hockey: marksHockey };

// ── Hindernisse ───────────────────────────────────────────────────────────────────────────

function drawBumper(ctx, b, kick) {
  ctx.fillStyle = 'rgb(0 0 0 / 0.34)';
  ctx.beginPath();
  ctx.ellipse(b.x + 1.5, b.y + 5, b.r, b.r * 0.97, 0, 0, TAU);
  ctx.fill();
  const fill = (rr, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, rr, 0, TAU);
    ctx.fill();
  };
  if (kick) {
    // Flipper-Bumper: weißer Ring, pinker Kragen, gelbe Kappe mit Stern
    fill(b.r, '#f4f6f4');
    fill(b.r * 0.84, '#ff4f9a');
    fill(b.r * 0.62, '#ffd84a');
    ctx.fillStyle = '#171b38';
    star(ctx, b.x, b.y, b.r * 0.42, b.r * 0.18);
    ctx.fill();
  } else {
    fill(b.r, '#f4f6f4');
    fill(b.r * 0.72, '#1d2b25');
    fill(b.r * 0.28, '#c8f03c');
  }
}

const PORTAL_COLORS = ['#a06bff', '#35d6c3'];

function drawPortalBase(ctx, p, i) {
  ctx.fillStyle = '#04050b';
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = PORTAL_COLORS[i % 2];
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r + 2, 0, TAU);
  ctx.stroke();
}

function drawInnerWall(ctx, w, th) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgb(0 0 0 / 0.35)';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(w[0] + 2, w[1] + 4);
  ctx.lineTo(w[2] + 2, w[3] + 4);
  ctx.stroke();
  ctx.strokeStyle = th.frame;
  ctx.beginPath();
  ctx.moveTo(w[0], w[1]);
  ctx.lineTo(w[2], w[3]);
  ctx.stroke();
  // Mauersteine
  ctx.strokeStyle = th.blocks || 'rgb(255 255 255 / 0.25)';
  ctx.lineWidth = 9;
  ctx.lineCap = 'butt';
  ctx.setLineDash([16, 5]);
  ctx.beginPath();
  ctx.moveTo(w[0], w[1]);
  ctx.lineTo(w[2], w[3]);
  ctx.stroke();
  ctx.setLineDash([]);
  // Turm am freien Ende (das Ende, das nicht an der Bande liegt)
  for (const [ex, ey] of [[w[0], w[1]], [w[2], w[3]]]) {
    ctx.fillStyle = th.frame;
    ctx.beginPath();
    ctx.arc(ex, ey, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = th.blocks || 'rgb(255 255 255 / 0.25)';
    ctx.beginPath();
    ctx.arc(ex, ey, 5.5, 0, TAU);
    ctx.fill();
  }
}

// ── Ganzer Hintergrund ────────────────────────────────────────────────────────────────────

/** Zeichnet das ruhende Feld: Umgebung, Bande, Boden, Tore, Linien, Hindernisse. turf: eigener Rasen (Rasenfelder). */
export function drawBackground(ctx, f, turf) {
  const { W, H, GOAL_D, GOAL_W, G0, G1 } = f;
  const th = themeOf(f);
  const world = worldOf(f);
  const grass = f.theme === 'rasen';
  const line = grass ? (TURF_COLORS[turf] || TURF_COLORS.streifen).line : th.line;

  // Umgebung
  ctx.fillStyle = th.outside;
  ctx.fillRect(world.x0, world.y0, world.w, world.h);
  if (th.waves) {
    // Strand: Wellen rund ums Feld
    ctx.strokeStyle = 'rgb(255 255 255 / 0.3)';
    ctx.lineWidth = 2;
    for (let y = world.y0 + 6; y < world.y0 + world.h; y += 13) {
      ctx.beginPath();
      for (let x = world.x0; x <= world.x0 + world.w; x += 16) {
        const yy = y + Math.sin(x / 22 + y) * 2.4;
        if (x === world.x0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  // Bande: Rahmen um Spielfläche und Torkästen
  ctx.lineJoin = 'round';
  ctx.strokeStyle = th.frame;
  ctx.fillStyle = th.frame;
  ctx.lineWidth = 16;
  pitchPath(ctx, f, 0);
  ctx.stroke();
  ctx.fillRect(-GOAL_D - 8, G0 - 8, GOAL_D + 8, GOAL_W + 16);
  ctx.fillRect(W, G0 - 8, GOAL_D + 8, GOAL_W + 16);
  if (th.blocks) {
    // Burgmauer: einzelne Quader
    ctx.strokeStyle = th.blocks;
    ctx.lineWidth = 10;
    ctx.setLineDash([20, 6]);
    pitchPath(ctx, f, -3);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (th.lights) {
    // Flipper: Lämpchen auf der Bande
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.setLineDash([0.1, 26]);
    ctx.strokeStyle = '#ffd84a';
    pitchPath(ctx, f, -4);
    ctx.stroke();
    ctx.lineDashOffset = 13;
    ctx.strokeStyle = '#f4f6f4';
    ctx.stroke();
    ctx.lineDashOffset = 0;
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
  }

  // Boden und Linien, auf die Spielfläche geschnitten
  ctx.save();
  pitchPath(ctx, f, 0);
  ctx.clip();
  if (grass) paintTurf(ctx, turf, W, H);
  else th.paint(ctx, f);
  (MARKS[th.marks] || marksFussball)(ctx, f, th, line);
  if (th.kick) {
    // Eisbahn: gelbe Fußleiste an der Bande
    ctx.strokeStyle = th.kick;
    ctx.lineWidth = 5;
    pitchPath(ctx, f, 0);
    ctx.stroke();
  }
  ctx.restore();

  // Torkästen mit Netz
  for (const side of [0, 1]) {
    const x = side === 0 ? -GOAL_D : W;
    ctx.fillStyle = th.goal;
    ctx.fillRect(x, G0, GOAL_D, GOAL_W);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, G0, GOAL_D, GOAL_W);
    ctx.clip();
    ctx.strokeStyle = th.net;
    ctx.lineWidth = 1.4;
    if (th.planks) {
      // Scheunentor: Bretter statt Netz
      ctx.lineWidth = 2;
      for (let k = 0; k <= GOAL_W; k += 20) {
        ctx.beginPath();
        ctx.moveTo(x, G0 + k);
        ctx.lineTo(x + GOAL_D, G0 + k);
        ctx.stroke();
      }
    } else {
      for (let k = 0; k <= GOAL_W; k += 11) {
        ctx.beginPath();
        ctx.moveTo(x, G0 + k);
        ctx.lineTo(x + GOAL_D, G0 + k);
        ctx.stroke();
      }
      for (let k = 0; k <= GOAL_D; k += 11) {
        ctx.beginPath();
        ctx.moveTo(x + k, G0);
        ctx.lineTo(x + k, G1);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Torrahmen
    ctx.strokeStyle = th.post;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const back = side === 0 ? -GOAL_D : W + GOAL_D;
    const mouth = side === 0 ? 0 : W;
    ctx.moveTo(mouth, G0);
    ctx.lineTo(back, G0);
    ctx.lineTo(back, G1);
    ctx.lineTo(mouth, G1);
    ctx.stroke();
  }

  // Pfosten
  for (const [px, py] of [[0, G0], [0, G1], [W, G0], [W, G1]]) {
    ctx.beginPath();
    ctx.arc(px, py, 6.5, 0, TAU);
    ctx.fillStyle = th.post;
    ctx.fill();
  }

  for (const w of f.inner) drawInnerWall(ctx, w, th);
  f.portals.forEach((p, i) => drawPortalBase(ctx, p, i));
  for (const b of f.bumpers) drawBumper(ctx, b, b.kick > 0);
}

/**
 * Was sich auf dem Feld bewegt, in jedem Bild über dem Hintergrund: Wirbel in den Portalen, aufblitzende Bumper.
 * bumperHits: { index: Zeitpunkt des letzten Treffers } · time: ms
 */
export function drawFieldLive(ctx, f, time, bumperHits = null) {
  f.portals.forEach((p, i) => {
    const color = PORTAL_COLORS[i % 2];
    const spin = (time / 700) * (i % 2 ? -1 : 1);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const rr = p.r * (0.3 + k * 0.24);
      ctx.lineWidth = 3.2 - k * 0.5;
      ctx.globalAlpha = 0.9 - k * 0.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, spin * (1 + k * 0.4) + k * 2.1, spin * (1 + k * 0.4) + k * 2.1 + Math.PI * 1.1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, TAU);
    ctx.fill();
  });
  if (!bumperHits) return;
  f.bumpers.forEach((b, i) => {
    const hit = bumperHits[i];
    if (hit === undefined) return;
    const k = (time - hit) / 260;
    if (k < 0 || k >= 1) return;
    // Kappe blitzt weiß auf, ein Ring springt ab
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.84, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 5 * (1 - k);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 4 + k * 26, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

/** Umriss der bespielbaren Fläche samt Torkästen als Pfad (für die leuchtende Gummibande und die Eis-Schicht). */
export function playAreaPath(ctx, f) {
  const { W, H, G0, G1, GOAL_D: D } = f;
  pitchPath(ctx, f, 0);
  ctx.rect(-D, G0, D, G1 - G0);
  ctx.rect(W, G0, D, G1 - G0);
}
