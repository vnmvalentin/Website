// discArt.js — zeichnet eine Spielerscheibe in einem Design (engine/skins.js). Zwei Sorten:
//   Muster  Teamfarbe mit Nummer, nur anders bemalt (Klassik, Streifen, Stern …)
//   Motive  die Scheibe ist etwas ganz anderes (Kronkorken, Münze, Auge, Donut …)
// Bei jedem Design bleibt die Teamfarbe groß sichtbar (Fläche oder dicker Rand), damit man Rot und Blau auf einen
// Blick unterscheidet. Alles flach gezeichnet: keine Verläufe, kein Leuchten.
//
// Gezeichnet wird um (x, y) mit dem Radius PIECE.R; nichts ragt über den Rand hinaus (dort endet auch die Physik).

import { PIECE } from './engine/index.js';

export const TEAM_COLORS = [
  { main: '#ef4136', dark: '#b9281f', light: '#ff8a7f' },
  { main: '#2f7cf6', dark: '#1b55b3', light: '#86b4ff' },
];
const FONT = 'Archivo, "Inter", sans-serif';
const TAU = Math.PI * 2;
// Wohin Motive mit Augen schauen, wenn kein Ball in der Nähe ist (Vorschau)
const DEFAULT_LOOK = { x: 0.74, y: -0.42 };

export function setFont(ctx, weight, size, { italic = false, stretch = 'normal' } = {}) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
  if ('fontStretch' in ctx) ctx.fontStretch = stretch;
}

export function star(ctx, x, y, R, rIn, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? rIn : R;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function disc(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function ring(ctx, x, y, r, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

/** Nummer mit dunkler Kontur (lesbar auf jedem Untergrund). */
function numberText(ctx, x, y, number, size, fill = '#fff', outline = null, outlineWidth = 5) {
  setFont(ctx, 900, size, { italic: true, stretch: 'expanded' });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outline;
    ctx.strokeText(String(number), x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(String(number), x, y);
}

// ── Muster ────────────────────────────────────────────────────────────────────────────────

/** Muster eines Designs, geschnitten auf die Teamfläche (Radius rb). */
function drawPattern(ctx, x, y, r, rb, skin, col) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rb, 0, TAU);
  ctx.clip();
  if (skin === 'streifen') {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.3)';
    ctx.lineWidth = 6;
    for (let k = -2 * r; k <= 2 * r; k += 14) {
      ctx.beginPath();
      ctx.moveTo(x + k - r, y + r);
      ctx.lineTo(x + k + r, y - r);
      ctx.stroke();
    }
  } else if (skin === 'ringe') {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.55)';
    ctx.lineWidth = 3;
    for (const f of [0.76, 0.64]) {
      ctx.beginPath();
      ctx.arc(x, y, r * f, 0, TAU);
      ctx.stroke();
    }
  } else if (skin === 'halb') {
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.moveTo(x - r, y + r);
    ctx.lineTo(x + r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.closePath();
    ctx.fill();
  } else if (skin === 'karo') {
    ctx.fillStyle = col.dark;
    const s = 11;
    for (let i = -4; i < 4; i++) {
      for (let j = -4; j < 4; j++) if ((i + j) % 2 === 0) ctx.fillRect(x + i * s, y + j * s, s, s);
    }
  }
  // schräger Glanzstreifen wie auf einem lackierten Puck (flach, kein Verlauf)
  ctx.fillStyle = 'rgb(255 255 255 / 0.12)';
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.2);
  ctx.lineTo(x - r * 0.2, y - r);
  ctx.lineTo(x + r * 0.15, y - r);
  ctx.lineTo(x - r, y + r * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Muster-Scheibe: Rand, Teamfläche, Muster, Innenkreis, Emblem, Nummer. */
function drawPatternDisc(ctx, x, y, col, number, skin) {
  const r = PIECE.R;
  const rim = skin === 'metall' ? '#c3cbc6' : skin === 'krone' ? '#e9c24a' : '#f4f6f4';
  disc(ctx, x, y, r, rim);
  if (skin === 'metall' || skin === 'krone') {
    // geriffelter Rand
    ctx.strokeStyle = skin === 'metall' ? 'rgb(40 50 45 / 0.45)' : 'rgb(120 80 0 / 0.45)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86);
      ctx.lineTo(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98);
      ctx.stroke();
    }
  }
  const rb = r * 0.84;
  disc(ctx, x, y, rb, col.main);
  drawPattern(ctx, x, y, r, rb, skin, col);

  // Innenkreis (Kontrast für die Nummer)
  // Bei „Halbzeit" bleibt er offen, sonst würde er die Teilung verdecken (die Nummer hat ohnehin eine Kontur)
  const ri = skin === 'ringe' ? r * 0.5 : r * 0.6;
  ctx.beginPath();
  ctx.arc(x, y, ri, 0, TAU);
  if (skin === 'halb') {
    ctx.strokeStyle = 'rgb(255 255 255 / 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.fillStyle = col.dark;
    ctx.fill();
  }
  if (skin === 'metall') {
    ctx.strokeStyle = '#c3cbc6';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Embleme hinter der Nummer
  let numY = y + r * 0.03;
  let numSize = Math.round(r * 0.74);
  if (skin === 'stern') {
    ctx.fillStyle = 'rgb(255 255 255 / 0.26)';
    star(ctx, x, y + r * 0.04, ri * 0.98, ri * 0.42);
    ctx.fill();
    numSize = Math.round(r * 0.6);
  } else if (skin === 'blitz') {
    ctx.fillStyle = '#c8f03c';
    ctx.globalAlpha *= 0.55;
    ctx.beginPath();
    ctx.moveTo(x + ri * 0.2, y - ri * 0.95);
    ctx.lineTo(x - ri * 0.55, y + ri * 0.12);
    ctx.lineTo(x - ri * 0.02, y + ri * 0.12);
    ctx.lineTo(x - ri * 0.22, y + ri * 0.95);
    ctx.lineTo(x + ri * 0.55, y - ri * 0.18);
    ctx.lineTo(x + ri * 0.02, y - ri * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha /= 0.55;
    numSize = Math.round(r * 0.56);
  } else if (skin === 'krone') {
    const cw = ri * 1.1;
    const cy = y - ri * 0.42;
    ctx.fillStyle = '#e9c24a';
    ctx.beginPath();
    ctx.moveTo(x - cw / 2, cy + ri * 0.22);
    ctx.lineTo(x - cw / 2, cy - ri * 0.2);
    ctx.lineTo(x - cw / 4, cy);
    ctx.lineTo(x, cy - ri * 0.32);
    ctx.lineTo(x + cw / 4, cy);
    ctx.lineTo(x + cw / 2, cy - ri * 0.2);
    ctx.lineTo(x + cw / 2, cy + ri * 0.22);
    ctx.closePath();
    ctx.fill();
    numY = y + ri * 0.3;
    numSize = Math.round(r * 0.5);
  }
  numberText(ctx, x, numY, number, numSize, '#fff', col.dark);
}

// ── Motive ────────────────────────────────────────────────────────────────────────────────
// Jede Funktion zeichnet die ganze Scheibe: (ctx, x, y, r, col, number, look). look = Einheitsvektor zum Ball.

const MOTIFS = {
  // Kronkorken: gezackter Blechrand, Teamfarbe als lackierte Kappe
  korken(ctx, x, y, r, col, number) {
    const teeth = 21;
    ctx.fillStyle = '#d5dbd7';
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * TAU;
      const rr = i % 2 ? r * 0.88 : r;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    // Falze zwischen den Zacken
    ctx.strokeStyle = 'rgb(30 40 36 / 0.35)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < teeth; i++) {
      const a = ((i + 0.5) / teeth) * TAU;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.76, y + Math.sin(a) * r * 0.76);
      ctx.lineTo(x + Math.cos(a) * r * 0.88, y + Math.sin(a) * r * 0.88);
      ctx.stroke();
    }
    disc(ctx, x, y, r * 0.76, col.main);
    ring(ctx, x, y, r * 0.6, 2.5, 'rgb(255 255 255 / 0.85)');
    // Glanzbogen oben links
    ctx.strokeStyle = 'rgb(255 255 255 / 0.3)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, Math.PI * 1.08, Math.PI * 1.45);
    ctx.stroke();
    ctx.lineCap = 'butt';
    numberText(ctx, x, y + r * 0.03, number, Math.round(r * 0.66), '#fff', col.dark);
  },

  // Münze: Gold mit Perlrand, die Nummer geprägt; Teamfarbe als dicker Rand
  muenze(ctx, x, y, r, col, number) {
    disc(ctx, x, y, r, col.main);
    disc(ctx, x, y, r * 0.84, '#e5bd45');
    ring(ctx, x, y, r * 0.8, 2, '#b98f25');
    ctx.fillStyle = '#b98f25';
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68, 1.7, 0, TAU);
      ctx.fill();
    }
    disc(ctx, x, y, r * 0.54, '#f1d067');
    // Prägung: heller Versatz oben links, dunkle Zahl
    numberText(ctx, x - 1, y + r * 0.03 - 1, number, Math.round(r * 0.7), '#fbe9a6');
    numberText(ctx, x + 0.6, y + r * 0.03 + 0.8, number, Math.round(r * 0.7), '#a67c18');
  },

  // Schallplatte: schwarze Rillen, Etikett in Teamfarbe
  vinyl(ctx, x, y, r, col, number) {
    disc(ctx, x, y, r, col.main);
    disc(ctx, x, y, r * 0.9, '#15171a');
    for (const f of [0.82, 0.74, 0.66, 0.58]) ring(ctx, x, y, r * f, 1.2, 'rgb(255 255 255 / 0.13)');
    // Lichtkeil über den Rillen
    ctx.fillStyle = 'rgb(255 255 255 / 0.1)';
    for (const a0 of [-2.5, 0.64]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r * 0.9, a0, a0 + 0.42);
      ctx.closePath();
      ctx.fill();
    }
    disc(ctx, x, y, r * 0.48, col.main);
    ring(ctx, x, y, r * 0.48, 1.5, col.dark);
    numberText(ctx, x, y + r * 0.02, number, Math.round(r * 0.56), '#fff', col.dark, 4);
  },

  // Zielscheibe: Ringe in Weiß und Teamfarbe
  ziel(ctx, x, y, r, col) {
    const cols = [col.dark, '#f4f6f4', col.main, '#f4f6f4', col.main];
    [1, 0.84, 0.64, 0.44, 0.24].forEach((f, i) => disc(ctx, x, y, r * f, cols[i]));
    disc(ctx, x, y, r * 0.09, '#f4f6f4');
  },

  // Puck: schwarzes Hartgummi mit geriffelter Kante und Teamstreifen
  puck(ctx, x, y, r, col, number) {
    disc(ctx, x, y, r, '#1b1e21');
    ctx.strokeStyle = 'rgb(255 255 255 / 0.2)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
      ctx.lineTo(x + Math.cos(a) * r * 0.99, y + Math.sin(a) * r * 0.99);
      ctx.stroke();
    }
    ring(ctx, x, y, r * 0.76, r * 0.16, col.main);
    disc(ctx, x, y, r * 0.58, '#24282c');
    numberText(ctx, x, y + r * 0.03, number, Math.round(r * 0.7), '#f4f6f4');
  },

  // Jeton: Spielchip mit Keilrand
  jeton(ctx, x, y, r, col, number) {
    disc(ctx, x, y, r, col.main);
    ctx.fillStyle = '#f4f6f4';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a - 0.17) * r * 0.76, y + Math.sin(a - 0.17) * r * 0.76);
      ctx.arc(x, y, r, a - 0.17, a + 0.17);
      ctx.lineTo(x + Math.cos(a + 0.17) * r * 0.76, y + Math.sin(a + 0.17) * r * 0.76);
      ctx.closePath();
      ctx.fill();
    }
    disc(ctx, x, y, r * 0.76, col.dark);
    ctx.setLineDash([5, 4.4]);
    ring(ctx, x, y, r * 0.66, 2, 'rgb(255 255 255 / 0.8)');
    ctx.setLineDash([]);
    disc(ctx, x, y, r * 0.54, col.main);
    numberText(ctx, x, y + r * 0.03, number, Math.round(r * 0.64), '#fff', col.dark, 4);
  },

  // Grinser: ein Gesicht in Teamfarbe, die Augen folgen dem Ball
  grinser(ctx, x, y, r, col, number, look) {
    disc(ctx, x, y, r, '#f4f6f4');
    disc(ctx, x, y, r * 0.88, col.main);
    for (const side of [-1, 1]) {
      const ex = x + side * r * 0.32;
      const ey = y - r * 0.2;
      disc(ctx, ex, ey, r * 0.21, '#fff');
      disc(ctx, ex + look.x * r * 0.09, ey + look.y * r * 0.09, r * 0.105, '#12161a');
    }
    // breites Grinsen mit Zahnreihe
    ctx.fillStyle = '#12161a';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y + r * 0.2);
    ctx.quadraticCurveTo(x, y + r * 0.34, x + r * 0.5, y + r * 0.2);
    ctx.quadraticCurveTo(x, y + r * 0.86, x - r * 0.5, y + r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - r * 0.5, y + r * 0.2, r, r * 0.17);
    ctx.restore();
  },

  // Keks: Schokostückchen, Zuckerguss-Rand in Teamfarbe
  keks(ctx, x, y, r, col) {
    disc(ctx, x, y, r, col.main);
    disc(ctx, x, y, r * 0.86, '#cf9552');
    ring(ctx, x, y, r * 0.8, 2.5, '#b87b3c');
    ctx.fillStyle = '#4b2c18';
    const chips = [[-0.38, -0.34, 0.13], [0.3, -0.42, 0.1], [0.05, -0.02, 0.14], [-0.46, 0.2, 0.1], [0.44, 0.1, 0.12], [-0.1, 0.48, 0.12], [0.3, 0.5, 0.08]];
    for (const [cx, cy, cr] of chips) {
      ctx.beginPath();
      ctx.arc(x + cx * r, y + cy * r, cr * r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgb(255 236 200 / 0.5)';
    for (const [cx, cy] of [[-0.14, -0.5], [0.52, -0.18], [-0.26, 0.24], [0.14, 0.26]]) {
      ctx.beginPath();
      ctx.arc(x + cx * r, y + cy * r, 1.6, 0, TAU);
      ctx.fill();
    }
  },

  // Zahnrad: zehn Zähne, Nabe mit Nummer
  zahnrad(ctx, x, y, r, col, number) {
    const teeth = 10;
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU;
      const w = (TAU / teeth) * 0.27;
      ctx.lineTo(x + Math.cos(a - w * 1.5) * r * 0.8, y + Math.sin(a - w * 1.5) * r * 0.8);
      ctx.lineTo(x + Math.cos(a - w) * r, y + Math.sin(a - w) * r);
      ctx.lineTo(x + Math.cos(a + w) * r, y + Math.sin(a + w) * r);
      ctx.lineTo(x + Math.cos(a + w * 1.5) * r * 0.8, y + Math.sin(a + w * 1.5) * r * 0.8);
    }
    ctx.closePath();
    ctx.fill();
    disc(ctx, x, y, r * 0.74, col.main);
    ring(ctx, x, y, r * 0.74, 2, 'rgb(255 255 255 / 0.5)');
    // Schraubenköpfe
    ctx.fillStyle = col.dark;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58, r * 0.07, 0, TAU);
      ctx.fill();
    }
    disc(ctx, x, y, r * 0.42, '#f4f6f4');
    numberText(ctx, x, y + r * 0.02, number, Math.round(r * 0.5), col.dark);
  },

  // Auge: die Iris in Teamfarbe folgt dem Ball
  auge(ctx, x, y, r, col, number, look) {
    disc(ctx, x, y, r, col.dark);
    disc(ctx, x, y, r * 0.86, '#f6f3ea');
    // feine Äderchen am Rand
    ctx.strokeStyle = 'rgb(200 60 50 / 0.35)';
    ctx.lineWidth = 1.2;
    for (const a of [0.5, 2.2, 3.6, 5.3]) {
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.84, y + Math.sin(a) * r * 0.84);
      ctx.lineTo(x + Math.cos(a + 0.12) * r * 0.66, y + Math.sin(a + 0.12) * r * 0.66);
      ctx.stroke();
    }
    const ix = x + look.x * r * 0.26;
    const iy = y + look.y * r * 0.26;
    disc(ctx, ix, iy, r * 0.5, col.main);
    ring(ctx, ix, iy, r * 0.5, 2, col.dark);
    ctx.strokeStyle = 'rgb(255 255 255 / 0.28)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(ix + Math.cos(a) * r * 0.27, iy + Math.sin(a) * r * 0.27);
      ctx.lineTo(ix + Math.cos(a) * r * 0.45, iy + Math.sin(a) * r * 0.45);
      ctx.stroke();
    }
    disc(ctx, ix + look.x * r * 0.05, iy + look.y * r * 0.05, r * 0.23, '#0d1012');
    disc(ctx, ix - r * 0.14, iy - r * 0.16, r * 0.085, '#fff');
  },

  // Kompass: die Nadel zeigt zum Ball
  kompass(ctx, x, y, r, col, number, look) {
    disc(ctx, x, y, r, col.main);
    disc(ctx, x, y, r * 0.84, '#f2ecd9');
    ctx.strokeStyle = '#3a3528';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const big = i % 4 === 0;
      ctx.lineWidth = big ? 2.4 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * (big ? 0.62 : 0.7), y + Math.sin(a) * r * (big ? 0.62 : 0.7));
      ctx.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
      ctx.stroke();
    }
    const nx = -look.y;
    const ny = look.x;
    const tip = r * 0.66;
    const half = r * 0.17;
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.moveTo(x + look.x * tip, y + look.y * tip);
    ctx.lineTo(x + nx * half, y + ny * half);
    ctx.lineTo(x - nx * half, y - ny * half);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a3528';
    ctx.beginPath();
    ctx.moveTo(x - look.x * tip, y - look.y * tip);
    ctx.lineTo(x + nx * half, y + ny * half);
    ctx.lineTo(x - nx * half, y - ny * half);
    ctx.closePath();
    ctx.fill();
    disc(ctx, x, y, r * 0.09, '#f2ecd9');
  },

  // Donut: Glasur in Teamfarbe, Streusel, echtes Loch (man sieht das Feld hindurch)
  donut(ctx, x, y, r, col) {
    const hole = r * 0.27;
    const withHole = (outer, fill, wobble = 0) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      if (wobble) {
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * TAU;
          const rr = outer + Math.sin(a * 7) * wobble;
          if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
      } else {
        ctx.arc(x, y, outer, 0, TAU);
      }
      ctx.moveTo(x + hole, y);
      ctx.arc(x, y, hole, 0, TAU, true);
      ctx.fill('evenodd');
    };
    withHole(r, '#d9a25c');
    withHole(r * 0.83, col.main, r * 0.045);
    ring(ctx, x, y, hole + 1.5, 3, '#d9a25c');
    const cols = ['#fff', '#ffd84a', col.dark, '#fff', col.light, '#ffd84a', '#fff', col.dark, '#ffd84a', '#fff'];
    cols.forEach((c, i) => {
      const a = (i / cols.length) * TAU + 0.3;
      const rr = r * (i % 2 ? 0.48 : 0.66);
      ctx.save();
      ctx.translate(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      ctx.rotate(a * 2.3 + i);
      ctx.fillStyle = c;
      ctx.fillRect(-r * 0.085, -r * 0.03, r * 0.17, r * 0.06);
      ctx.restore();
    });
  },

  // Planet: gestreifte Kugel mit Ring vor dunklem Himmel
  planet(ctx, x, y, r, col) {
    disc(ctx, x, y, r, col.main);
    disc(ctx, x, y, r * 0.88, '#10141d');
    ctx.fillStyle = 'rgb(255 255 255 / 0.75)';
    for (const [sx, sy] of [[-0.62, -0.42], [0.58, 0.5], [0.5, -0.6], [-0.5, 0.58]]) {
      ctx.beginPath();
      ctx.arc(x + sx * r, y + sy * r, 1.3, 0, TAU);
      ctx.fill();
    }
    const ringPath = () => {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.82, r * 0.24, -0.38, 0, TAU);
    };
    // hinterer Ringbogen, dann die Kugel, dann der vordere
    ctx.strokeStyle = '#e9dcc0';
    ctx.lineWidth = 3.4;
    ringPath();
    ctx.stroke();
    const pr = r * 0.5;
    disc(ctx, x, y, pr, col.main);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, pr, 0, TAU);
    ctx.clip();
    ctx.fillStyle = col.dark;
    ctx.fillRect(x - pr, y - pr * 0.5, pr * 2, pr * 0.3);
    ctx.fillRect(x - pr, y + pr * 0.38, pr * 2, pr * 0.24);
    ctx.fillStyle = col.light;
    ctx.fillRect(x - pr, y - pr * 0.08, pr * 2, pr * 0.2);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - r, y + r * 0.02, r * 2, r);
    ctx.rotate(0);
    ctx.clip();
    ctx.strokeStyle = '#e9dcc0';
    ctx.lineWidth = 3.4;
    ctx.translate(x, y);
    ctx.rotate(-0.38);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82, r * 0.24, 0, 0.05, Math.PI - 0.05);
    ctx.stroke();
    ctx.restore();
  },

  // Wappen: Schild mit Sparren und Nummer
  wappen(ctx, x, y, r, col, number) {
    disc(ctx, x, y, r, '#f4f6f4');
    disc(ctx, x, y, r * 0.86, col.dark);
    const shield = (k) => {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.52 * k, y - r * 0.56 * k);
      ctx.lineTo(x + r * 0.52 * k, y - r * 0.56 * k);
      ctx.lineTo(x + r * 0.52 * k, y + r * 0.02 * k);
      ctx.quadraticCurveTo(x + r * 0.5 * k, y + r * 0.5 * k, x, y + r * 0.72 * k);
      ctx.quadraticCurveTo(x - r * 0.5 * k, y + r * 0.5 * k, x - r * 0.52 * k, y + r * 0.02 * k);
      ctx.closePath();
    };
    ctx.fillStyle = '#f4f6f4';
    shield(1.08);
    ctx.fill();
    ctx.fillStyle = col.main;
    shield(0.94);
    ctx.fill();
    ctx.save();
    shield(0.94);
    ctx.clip();
    ctx.fillStyle = '#f4f6f4';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y + r * 0.36);
    ctx.lineTo(x, y + r * 0.08);
    ctx.lineTo(x + r * 0.6, y + r * 0.36);
    ctx.lineTo(x + r * 0.6, y + r * 0.52);
    ctx.lineTo(x, y + r * 0.24);
    ctx.lineTo(x - r * 0.6, y + r * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    numberText(ctx, x, y - r * 0.2, number, Math.round(r * 0.5), '#fff', col.dark, 4);
  },

  // Schädel: Knochenweiß auf Schwarz, Augenhöhlen in Teamfarbe
  schaedel(ctx, x, y, r, col) {
    disc(ctx, x, y, r, col.main);
    disc(ctx, x, y, r * 0.86, '#17191c');
    ctx.fillStyle = '#ece8dc';
    ctx.beginPath();
    ctx.arc(x, y - r * 0.12, r * 0.5, 0, TAU);
    ctx.fill();
    ctx.fillRect(x - r * 0.29, y + r * 0.2, r * 0.58, r * 0.34);
    for (const side of [-1, 1]) {
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.ellipse(x + side * r * 0.21, y - r * 0.1, r * 0.14, r * 0.16, side * 0.25, 0, TAU);
      ctx.fill();
      disc(ctx, x + side * r * 0.21, y - r * 0.09, r * 0.055, '#17191c');
    }
    ctx.fillStyle = '#17191c';
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.1);
    ctx.lineTo(x - r * 0.07, y + r * 0.25);
    ctx.lineTo(x + r * 0.07, y + r * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - r * 0.29, y + r * 0.36, r * 0.58, r * 0.03);
    for (const k of [-0.145, 0, 0.145]) ctx.fillRect(x + k * r - r * 0.015, y + r * 0.36, r * 0.03, r * 0.18);
  },

  // Kristall: geschliffener Stein aus Dreiecken in den Tönen der Teamfarbe
  kristall(ctx, x, y, r, col) {
    disc(ctx, x, y, r, '#15181c');
    const n = 8;
    const outer = r * 0.9;
    const inner = r * 0.46;
    const pt = (i, rr, shift = 0) => {
      const a = ((i + shift) / n) * TAU - Math.PI / 2;
      return [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
    };
    const tri = (a, b, c, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fill();
    };
    const shades = [col.light, col.main, col.dark, col.main];
    for (let i = 0; i < n; i++) {
      // äußerer Kranz: je Kante ein Dreieck nach innen und eines nach außen
      tri(pt(i, outer), pt(i + 1, outer), pt(i, inner, 0.5), shades[i % 4]);
      tri(pt(i, outer), pt(i, inner, 0.5), pt(i - 1, inner, 0.5), shades[(i + 2) % 4]);
    }
    // Tafel in der Mitte
    ctx.fillStyle = col.light;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [px, py] = pt(i, inner, 0.5);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
    ctx.beginPath();
    ctx.moveTo(x - inner * 0.55, y - inner * 0.1);
    ctx.lineTo(x - inner * 0.1, y - inner * 0.6);
    ctx.lineTo(x + inner * 0.1, y - inner * 0.45);
    ctx.lineTo(x - inner * 0.4, y + inner * 0.08);
    ctx.closePath();
    ctx.fill();
  },
};

/**
 * Scheibe ohne Schatten und Auswahlringe. look: Einheitsvektor { x, y } zum Ball (für Motive, die hinschauen).
 */
export function drawDiscBody(ctx, x, y, team, number, skin = 'klassik', look = null) {
  const col = TEAM_COLORS[team];
  const motif = MOTIFS[skin];
  if (motif) motif(ctx, x, y, PIECE.R, col, number, look || DEFAULT_LOOK);
  else drawPatternDisc(ctx, x, y, col, number, skin);
}
