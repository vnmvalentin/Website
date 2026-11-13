// scene/cardArt.js — malt die Karten von Worldflip auf Canvas (keine Bilddateien). Dieselben Canvas dienen als
// 3D-Textur (tableScene.js) und als Bild in der Oberfläche (Regeln, Menü).
//
// Zwei Sorten, auf einen Blick zu unterscheiden:
//   Zahlenkarten   helle Weltfarbe mit einer kleinen Landschaft der Welt, große schräge Zahl, weißer Rahmen
//   Effektkarten   dunkler Grund mit Strahlenkranz, Symbol im Medaillon, Namensband, Rahmen in der Weltfarbe
//                  (Karten, die immer passen: Strahlen in allen vier Weltfarben)
import { WORLDS, KINDS } from '../engine/index.js';

export const CARD_W = 320;
export const CARD_H = 464;
const FONT = '"Rubik", "Arial Black", "Segoe UI", sans-serif'; // Rubik lädt die Hülle (ui/Shell.jsx)
const INK = '#121118';
const CREAM = '#f4eedf';
const canvases = new Map();
const CX = CARD_W / 2;

// ── Landschaft je Welt (Zahlenkarten) ───────────────────────────────────────────────────────────
function scenery(ctx, w) {
  const { deep, dark } = WORLDS[w];
  const poly = (color, pts) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  if (w === 0) {
    // Vulkan: zwei Kegel, glühender Krater, Lavastrom
    poly(deep, [[-10, 474], [60, 300], [96, 318], [126, 290], [190, 474]]);
    poly(dark, [[110, 474], [214, 246], [236, 262], [258, 244], [340, 400], [340, 474]]);
    poly('#ffc93e', [[214, 246], [236, 262], [258, 244], [250, 258], [236, 274], [222, 258]]);
    poly('#ffc93e', [[230, 270], [244, 270], [262, 474], [224, 474]]);
    ctx.fillStyle = '#ffc93e';
    for (const [x, y, r] of [[200, 196, 7], [262, 172, 5], [236, 138, 6], [286, 214, 4]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (w === 1) {
    // Ozean: Sonne und drei Wellenbänder
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.arc(236, 150, 74, 0, Math.PI * 2);
    ctx.fill();
    [[300, deep, 30, 0], [356, dark, 38, 1.6], [412, deep, 46, 3.1]].forEach(([y, color, len, ph]) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-10, 474);
      for (let x = -10; x <= 330; x += 6) ctx.lineTo(x, y + Math.sin(x / len + ph) * 15);
      ctx.lineTo(330, 474);
      ctx.closePath();
      ctx.fill();
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const [x, y] of [[40, 336], [190, 322], [110, 396], [250, 388]]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 18, y - 10, x + 36, y);
      ctx.stroke();
    }
  } else if (w === 2) {
    // Dschungel: Lianen von oben, große Blätter von unten
    ctx.strokeStyle = deep;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    for (const [x, len, sway] of [[52, 150, 16], [118, 96, -12], [262, 176, 14], [214, 70, -8]]) {
      ctx.beginPath();
      ctx.moveTo(x, -6);
      ctx.bezierCurveTo(x + sway, len * 0.4, x - sway, len * 0.7, x + sway * 0.5, len);
      ctx.stroke();
    }
    const leaf = (x, y, rot, size, color) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(size * 0.6, -size * 0.3, size * 0.7, -size * 0.9, 0, -size * 1.5);
      ctx.bezierCurveTo(-size * 0.7, -size * 0.9, -size * 0.6, -size * 0.3, 0, 0);
      ctx.fill();
      ctx.restore();
    };
    leaf(40, 480, -0.5, 120, deep);
    leaf(292, 484, 0.55, 130, deep);
    leaf(110, 492, 0.1, 110, dark);
    leaf(220, 494, -0.25, 96, dark);
    leaf(166, 500, 0.02, 70, deep);
  } else {
    // Kosmos: Sterne, Ringplanet, Kristalle
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, r] of [[46, 96, 3], [92, 168, 2], [270, 80, 3], [286, 230, 2], [60, 262, 2.5], [150, 60, 2], [222, 300, 2]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = deep;
    ctx.beginPath();
    ctx.arc(232, 156, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(232, 160, 104, 24, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    poly(dark, [[-10, 474], [30, 340], [70, 474]]);
    poly(deep, [[50, 474], [104, 300], [150, 474]]);
    poly(dark, [[170, 474], [214, 366], [252, 474]]);
    poly(deep, [[236, 474], [290, 320], [340, 474]]);
  }
}

// Rasterpunkte wie im Comic, oben links kräftig, zur Mitte hin kleiner
function halftone(ctx, color) {
  ctx.fillStyle = color;
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9 - y; x += 1) {
      const r = 6.5 - (x + y) * 0.75;
      if (r <= 0.6) continue;
      ctx.beginPath();
      ctx.arc(26 + x * 20 + (y % 2) * 10, 26 + y * 18, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── Symbole der Effektkarten, um (0, 0) gezeichnet, etwa 160 px groß ───────────────────────────
const ICONS = {
  sturm(ctx) {
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    for (const [y, len, r] of [[-46, 60, 21], [0, 88, 25], [46, 46, 19]]) {
      ctx.beginPath();
      ctx.moveTo(-76, y);
      ctx.lineTo(-76 + len, y);
      ctx.arc(-76 + len, y - r, r, Math.PI / 2, -Math.PI * 0.85, true);
      ctx.stroke();
    }
  },
  kipp(ctx) {
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    for (const rot of [0, Math.PI]) {
      ctx.save();
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.arc(0, 0, 58, -Math.PI * 0.92, -Math.PI * 0.18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(76, -40);
      ctx.lineTo(52, 4);
      ctx.lineTo(22, -42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  },
  meteor(ctx) {
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    for (const [dx, dy, len] of [[-10, -36, 66], [14, -14, 90], [40, 10, 58]]) {
      ctx.beginPath();
      ctx.moveTo(dx - 10, dy + 10);
      ctx.lineTo(dx + len * 0.7, dy - len * 0.7);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(-36, 38, 42, 0, Math.PI * 2);
    ctx.fill();
  },
  walze(ctx) {
    ctx.beginPath();
    ctx.moveTo(4, -84);
    ctx.bezierCurveTo(30, -44, 64, -14, 52, 34);
    ctx.bezierCurveTo(44, 66, 18, 82, 0, 82);
    ctx.bezierCurveTo(-18, 82, -46, 66, -52, 34);
    ctx.bezierCurveTo(-56, 8, -40, -10, -30, -34);
    ctx.bezierCurveTo(-22, -12, -12, -6, -6, -14);
    ctx.bezierCurveTo(4, -30, 0, -56, 4, -84);
    ctx.fill();
  },
  frost(ctx) {
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i += 1) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -78);
      ctx.moveTo(0, -46);
      ctx.lineTo(-20, -66);
      ctx.moveTo(0, -46);
      ctx.lineTo(20, -66);
      ctx.stroke();
      ctx.restore();
    }
  },
  welle(ctx) {
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-78, 26);
    ctx.bezierCurveTo(-52, -60, 22, -70, 46, -14);
    ctx.bezierCurveTo(56, 12, 32, 34, 10, 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-78, 64);
    ctx.quadraticCurveTo(-58, 46, -38, 64);
    ctx.quadraticCurveTo(-18, 82, 2, 64);
    ctx.quadraticCurveTo(22, 46, 42, 64);
    ctx.quadraticCurveTo(62, 82, 80, 64);
    ctx.stroke();
  },
  schild(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -80);
    ctx.lineTo(60, -54);
    ctx.lineTo(60, 6);
    ctx.bezierCurveTo(60, 44, 30, 68, 0, 82);
    ctx.bezierCurveTo(-30, 68, -60, 44, -60, 6);
    ctx.lineTo(-60, -54);
    ctx.closePath();
    ctx.fill();
    for (const side of [-1, 1]) {
      for (const y of [-40, -8, 24]) {
        ctx.beginPath();
        ctx.moveTo(side * 56, y - 12);
        ctx.lineTo(side * 84, y);
        ctx.lineTo(side * 56, y + 12);
        ctx.closePath();
        ctx.fill();
      }
    }
  },
  saat(ctx) {
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 56);
    ctx.lineTo(0, -8);
    ctx.stroke();
    for (const [side, size] of [[1, 1], [-1, 0.78]]) {
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.bezierCurveTo(side * 10 * size, -62 * size, side * 62 * size, -74 * size, side * 74 * size, -70 * size);
      ctx.bezierCurveTo(side * 76 * size, -30 * size, side * 46 * size, 2, 0, -6);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, 66, 34, 17, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  tausch(ctx) {
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    for (const [y, dir] of [[-32, 1], [32, -1]]) {
      ctx.beginPath();
      ctx.moveTo(-60 * dir, y);
      ctx.lineTo(34 * dir, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(78 * dir, y);
      ctx.lineTo(34 * dir, y - 32);
      ctx.lineTo(34 * dir, y + 32);
      ctx.closePath();
      ctx.fill();
    }
  },
  strahl(ctx) {
    ctx.beginPath();
    [[16, -86], [-48, 8], [-8, 8], [-24, 86], [50, -16], [8, -16]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  },
  portal(ctx) {
    ctx.lineWidth = 16;
    for (const r of [74, 45, 16]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  finsternis(ctx) {
    ctx.beginPath();
    ctx.arc(-6, 0, 74, Math.PI * 0.32, Math.PI * 1.68);
    ctx.arc(42, 0, 63, Math.PI * 1.44, Math.PI * 0.56, true);
    ctx.closePath();
    ctx.fill();
  },
  zuender(ctx) {
    ctx.beginPath();
    for (let i = 0; i < 20; i += 1) {
      const r = i % 2 ? 44 : i % 4 ? 70 : 88;
      const a = (i / 20) * Math.PI * 2 - Math.PI / 2;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  },
};

function frame(ctx, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(11, 11, CARD_W - 22, CARD_H - 22, 22);
  ctx.stroke();
  // Glanzstreifen
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(15, 15, CARD_W - 30, CARD_H - 30, 18);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.moveTo(190, 0);
  ctx.lineTo(260, 0);
  ctx.lineTo(70, CARD_H);
  ctx.lineTo(0, CARD_H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Eckmarke: Zahl oder kleines Symbol auf einem Plättchen
function corner(ctx, card, plate, ink) {
  ctx.fillStyle = plate;
  ctx.beginPath();
  ctx.roundRect(24, 24, 56, 62, 12);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  if (card.k === 'n') {
    ctx.font = `900 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(card.n), 52, 58);
  } else {
    ctx.save();
    ctx.translate(52, 55);
    ctx.scale(0.25, 0.25);
    ICONS[card.k](ctx);
    ctx.restore();
  }
}
function corners(ctx, card, plate, ink) {
  corner(ctx, card, plate, ink);
  ctx.save();
  ctx.translate(CARD_W, CARD_H);
  ctx.rotate(Math.PI);
  corner(ctx, card, plate, ink);
  ctx.restore();
}

function paintNumber(ctx, card) {
  const w = WORLDS[card.w];
  ctx.fillStyle = w.color;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  scenery(ctx, card.w);
  halftone(ctx, 'rgba(255,255,255,0.16)');
  // große schräge Zahl mit dunkler Kontur
  ctx.save();
  ctx.translate(CX, CARD_H / 2 - 6);
  ctx.transform(1, 0, -0.14, 1, 0, 0);
  ctx.rotate(-0.05);
  ctx.font = `900 270px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.fillStyle = w.dark;
  ctx.fillText(String(card.n), 12, 14);
  ctx.strokeStyle = w.dark;
  ctx.lineWidth = 26;
  ctx.strokeText(String(card.n), 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(card.n), 0, 0);
  ctx.restore();
  frame(ctx, '#ffffff');
  corners(ctx, card, w.dark, '#ffffff');
}

function rays(ctx, colorOf) {
  const count = 16;
  for (let i = 0; i < count; i += 1) {
    const color = colorOf(i, count);
    if (!color) continue;
    const a0 = (i / count) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / count) * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(CX, 204);
    ctx.lineTo(CX + Math.cos(a0) * 520, 204 + Math.sin(a0) * 520);
    ctx.lineTo(CX + Math.cos(a1) * 520, 204 + Math.sin(a1) * 520);
    ctx.closePath();
    ctx.fill();
  }
}

function ribbon(ctx, text, bg, ink) {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(30, 352, CARD_W - 60, 54, 10);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 30;
  do {
    ctx.font = `900 ${size}px ${FONT}`;
    size -= 1;
  } while (ctx.measureText(text).width > CARD_W - 84 && size > 14);
  ctx.fillText(text, CX, 381);
}

function paintEffect(ctx, card) {
  const wild = card.w < 0;
  const w = wild ? null : WORLDS[card.w];
  ctx.fillStyle = wild ? INK : w.dark;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  if (wild) {
    // Strahlen in allen vier Weltfarben: passt in jede Welt
    rays(ctx, (i, count) => (i % 2 ? null : WORLDS[Math.floor((i / count) * 4)].deep));
  } else {
    rays(ctx, (i) => (i % 2 ? null : w.deep));
  }
  // Medaillon
  ctx.fillStyle = wild ? INK : w.color;
  ctx.beginPath();
  ctx.arc(CX, 204, 106, 0, Math.PI * 2);
  ctx.fill();
  if (wild) {
    for (let q = 0; q < 4; q += 1) {
      ctx.strokeStyle = WORLDS[q].color;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(CX, 204, 106, (q * Math.PI) / 2 - Math.PI / 2 + 0.05, ((q + 1) * Math.PI) / 2 - Math.PI / 2 - 0.05);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(CX, 204, 106, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Symbol mit Schlagschatten
  for (const [dx, dy, col] of [[7, 8, wild ? '#000000' : w.dark], [0, 0, '#ffffff']]) {
    ctx.save();
    ctx.translate(CX + dx, 204 + dy);
    ctx.scale(0.92, 0.92);
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ICONS[card.k](ctx);
    ctx.restore();
  }
  ribbon(ctx, KINDS[card.k].name.toUpperCase(), wild ? CREAM : '#ffffff', wild ? INK : w.dark);
  frame(ctx, wild ? CREAM : w.color);
  corners(ctx, card, wild ? CREAM : w.color, wild ? INK : '#ffffff');
}

function paintBack(ctx) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.save();
  ctx.translate(0, 28);
  rays(ctx, (i) => (i % 2 ? null : '#1d1b27'));
  ctx.restore();
  frame(ctx, CREAM);
  ctx.strokeStyle = 'rgba(244,238,223,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(26, 26, CARD_W - 52, CARD_H - 52, 12);
  ctx.stroke();
  // Windrad aus den vier Weltfarben
  ctx.translate(CX, CARD_H / 2);
  for (let w = 0; w < 4; w += 1) {
    ctx.fillStyle = WORLDS[w].color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -118);
    ctx.lineTo(80, -80);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = WORLDS[w].deep;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(80, -80);
    ctx.lineTo(44, -22);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(Math.PI / 2);
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
}

export const cardKey = (card) => (card ? `${card.w}:${card.k}:${card.n || 0}` : 'back');

/** Canvas einer Karte (null = Rückseite). Wird einmal gemalt und dann wiederverwendet. */
export function cardCanvas(card) {
  const key = cardKey(card);
  let cv = canvases.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = CARD_W;
    cv.height = CARD_H;
    const ctx = cv.getContext('2d');
    if (!card) paintBack(ctx);
    else if (card.k === 'n') paintNumber(ctx, card);
    else paintEffect(ctx, card);
    canvases.set(key, cv);
  }
  return cv;
}

/** Nach dem Laden der Spielschrift neu malen lassen (die ersten Karten könnten mit der Ersatzschrift gemalt sein). */
export function clearCardArt() {
  canvases.clear();
}
