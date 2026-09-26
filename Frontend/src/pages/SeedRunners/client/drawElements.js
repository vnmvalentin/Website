// Zeichnen der Elemente. Reine Darstellung: liest Zustand aus den Element-Objekten und die Zeit aus
// `world.tick`, verändert nichts. Alles flach gefärbt (keine Verläufe, kein Weichzeichner) — Effekte
// wie Partikel und Screen Shake kommen in Phase 4 über den Ereignis-Verteiler (client/events.js).
//
// Der Aufrufer hat die Leinwand bereits auf Weltkoordinaten umgestellt (siehe render.js).
import { TILE } from '../sim/config.js';

const COLOR = {
  hazard: '#ff5a5a',
  hazardDark: '#8f2a2a',
  spring: '#f0b94a',
  ring: '#7dd3fc',
  crystal: '#a78bfa',
  wind: '#7dd3fc',
  gravity: '#c084fc',
  portalA: '#38bdf8',
  portalB: '#fb923c',
  red: '#e05a5a',
  blue: '#5a8be0',
  key: '#facc15',
  door: '#a07a3e',
  doorDark: '#6b4f26',
  mover: '#7f8cff',
  crumble: '#8a7a68',
  falling: '#6d6a7c',
};

// Farben der Schalter-Kanäle: [fest bei 0, fest bei 1]. Kanal 0 ist das alte Rot/Blau.
export const CHANNEL_COLORS = [
  ['#e05a5a', '#5a8be0'],
  ['#5ac878', '#e0b45a'],
  ['#c25ae0', '#5ae0d6'],
  ['#e0e05a', '#e05a9a'],
];

const DIR = {
  right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
  upRight: [0.7071, -0.7071], upLeft: [-0.7071, -0.7071], downRight: [0.7071, 0.7071], downLeft: [-0.7071, 0.7071],
};

function triangle(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

const DRAW = {
  spike(ctx, el) {
    // Ein-/ausfahrende Spikes stehen nur so weit heraus, wie `out` sagt (0 = ganz in der Kachel).
    // Die Sockelplatte bleibt sichtbar, damit man die Kachel auch eingefahren als Falle erkennt.
    const out = el.out === undefined ? 1 : el.out;
    if (el.period) {
      ctx.fillStyle = COLOR.hazardDark;
      const base = 2;
      if (el.dir === 'up') ctx.fillRect(el.x, el.y + el.h - base, el.w, base);
      else if (el.dir === 'down') ctx.fillRect(el.x, el.y, el.w, base);
      else if (el.dir === 'right') ctx.fillRect(el.x, el.y, base, el.h);
      else ctx.fillRect(el.x + el.w - base, el.y, base, el.h);
    }
    if (out <= 0) return;
    ctx.fillStyle = el.deadly === false ? COLOR.hazardDark : COLOR.hazard;
    // Drei Zacken entlang der Fläche, die Spitzen zeigen von der Wand weg
    const n = 3;
    for (let i = 0; i < n; i++) {
      if (el.dir === 'up') {
        const x = el.x + (i * el.w) / n;
        const tipY = el.y + el.h - el.h * out;
        triangle(ctx, x, el.y + el.h, x + el.w / n, el.y + el.h, x + el.w / (2 * n), tipY);
      } else if (el.dir === 'down') {
        const x = el.x + (i * el.w) / n;
        triangle(ctx, x, el.y, x + el.w / n, el.y, x + el.w / (2 * n), el.y + el.h * out);
      } else if (el.dir === 'right') {
        const y = el.y + (i * el.h) / n;
        triangle(ctx, el.x, y, el.x, y + el.h / n, el.x + el.w * out, y + el.h / (2 * n));
      } else {
        const y = el.y + (i * el.h) / n;
        const tipX = el.x + el.w - el.w * out;
        triangle(ctx, el.x + el.w, y, el.x + el.w, y + el.h / n, tipX, y + el.h / (2 * n));
      }
    }
  },

  saw(ctx, el, world) {
    const spin = world.tick * 0.16;
    const teeth = 8;
    // Bahn andeuten (Pfad-Säge): dünne Linie, damit man die Bewegung vorhersehen kann. Zuerst, damit
    // sie hinter den Sägen liegt — bei einer Kette wären sonst Striche über den Blättern.
    if (el.mode === 'path' && el.pathData) {
      ctx.strokeStyle = 'rgba(255, 90, 90, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      el.pathData.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    }
    // Mehrere Sägen auf derselben Bahn: jeder Körper wird gleich gezeichnet (el.bodies, siehe saw.js)
    for (const b of el.bodies || [el]) {
      ctx.fillStyle = COLOR.hazard;
      for (let i = 0; i < teeth; i++) {
        const a = spin + (i * Math.PI * 2) / teeth;
        const a2 = a + Math.PI / teeth;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a - 0.22) * el.r * 0.8, b.y + Math.sin(a - 0.22) * el.r * 0.8);
        ctx.lineTo(b.x + Math.cos(a2) * el.r * 1.18, b.y + Math.sin(a2) * el.r * 1.18);
        ctx.lineTo(b.x + Math.cos(a + 0.22) * el.r * 0.8, b.y + Math.sin(a + 0.22) * el.r * 0.8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, el.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOR.hazardDark;
      ctx.beginPath();
      ctx.arc(b.x, b.y, el.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  laser(ctx, el) {
    // Drehender Strahl: als Linie vom Emitter aus, Länge kommt aus der Sim (el.len, am Block gestoppt)
    if (el.spin) {
      const ex = el.ox + el.ax * el.len;
      const ey = el.oy + el.ay * el.len;
      ctx.strokeStyle = el.on ? COLOR.hazard : el.warn ? 'rgba(255, 90, 90, 0.7)' : 'rgba(255, 90, 90, 0.14)';
      ctx.lineWidth = el.on ? el.th : 1;
      ctx.beginPath();
      ctx.moveTo(el.ox, el.oy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = el.on ? COLOR.hazard : COLOR.hazardDark;
      ctx.fillRect(el.tx * TILE + 3, el.ty * TILE + 3, TILE - 6, TILE - 6);
      return;
    }
    // Immer eine ganz schwache Bahn, sonst weiß man nicht, wohin der Strahl geht
    ctx.fillStyle = 'rgba(255, 90, 90, 0.12)';
    ctx.fillRect(el.bx, el.by, el.bw, el.bh);
    if (el.on) {
      ctx.fillStyle = COLOR.hazard;
      ctx.fillRect(el.bx - (el.bh < el.bw ? 0 : 1), el.by - (el.bh < el.bw ? 1 : 0), el.bw + (el.bh < el.bw ? 0 : 2), el.bh + (el.bh < el.bw ? 2 : 0));
    } else if (el.warn) {
      ctx.fillStyle = 'rgba(255, 90, 90, 0.7)';
      if (el.bw > el.bh) ctx.fillRect(el.bx, el.by + el.bh / 2 - 0.5, el.bw, 1);
      else ctx.fillRect(el.bx + el.bw / 2 - 0.5, el.by, 1, el.bh);
    }
    // Mündung des Emitters
    ctx.fillStyle = el.on ? COLOR.hazard : COLOR.hazardDark;
    ctx.fillRect(el.tx * TILE + 4, el.ty * TILE + 4, TILE - 8, TILE - 8);
  },

  fallingBlock(ctx, el, world) {
    const shake = el.st === 1 ? (world.tick % 4 < 2 ? -1 : 1) : 0;
    ctx.fillStyle = COLOR.falling;
    ctx.fillRect(el.x + shake, el.y, el.bw, el.bh);
    ctx.fillStyle = '#8b879c';
    ctx.fillRect(el.x + shake, el.y, el.bw, 2);
    // Zwei Augen je Kachelbreite, damit auch breite Blöcke sofort als "fällt gleich" lesbar sind
    ctx.fillStyle = COLOR.hazardDark;
    for (let i = 0; i < el.bw / TILE; i++) {
      ctx.fillRect(el.x + shake + i * TILE + 3, el.y + 6, 3, 3);
      ctx.fillRect(el.x + shake + i * TILE + 10, el.y + 6, 3, 3);
    }
    // Große Blöcke bekommen Nieten an den unteren Ecken (sie sollen "schwer" wirken)
    if (el.bw > TILE || el.bh > TILE) {
      ctx.fillStyle = '#4d4a5c';
      ctx.fillRect(el.x + shake + 2, el.y + el.bh - 4, 2, 2);
      ctx.fillRect(el.x + shake + el.bw - 4, el.y + el.bh - 4, 2, 2);
    }
  },

  mover(ctx, el, world, palette) {
    ctx.fillStyle = COLOR.mover;
    ctx.fillRect(el.x, el.y, el.w, el.h);
    ctx.fillStyle = palette.tileTop;
    ctx.fillRect(el.x, el.y, el.w, 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    for (let x = el.x + 3; x < el.x + el.w - 2; x += TILE) ctx.fillRect(x, el.y + 4, 2, 2);
  },

  crumble(ctx, el, world) {
    if (el.st === 2) {
      ctx.strokeStyle = 'rgba(138, 122, 104, 0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(el.x + 0.5, el.y + 0.5, TILE - 1, TILE - 1);
      return;
    }
    const shake = el.st === 1 ? (world.tick % 3 === 0 ? 1 : -1) * 0.7 : 0;
    ctx.fillStyle = COLOR.crumble;
    ctx.fillRect(el.x + shake, el.y, TILE, TILE);
    ctx.fillStyle = '#a99a86';
    ctx.fillRect(el.x + shake, el.y, TILE, 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(el.x + shake + 4, el.y + 3);
    ctx.lineTo(el.x + shake + 8, el.y + 9);
    ctx.lineTo(el.x + shake + 6, el.y + 14);
    ctx.stroke();
  },

  spring(ctx, el) {
    const side = el.dir === 'left' || el.dir === 'right';
    if (side) {
      // Wandpad: schmaler Streifen an der Wand, Schrägstriche zeigen in Abstoßrichtung
      const dx = el.dir === 'right' ? 1 : -1;
      ctx.fillStyle = '#5b5670';
      ctx.fillRect(dx > 0 ? el.x : el.x + el.w - 3, el.y + 1, 3, el.h - 2);
      ctx.fillStyle = COLOR.spring;
      ctx.fillRect(dx > 0 ? el.x + 3 : el.x, el.y + 1, el.w - 3, el.h - 2);
    } else {
      ctx.fillStyle = '#5b5670';
      ctx.fillRect(el.x + 2, el.y + 3, el.w - 4, 3);
      ctx.fillStyle = COLOR.spring;
      ctx.fillRect(el.x + 1, el.y, el.w - 2, 2);
      ctx.strokeStyle = COLOR.spring;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(el.x + 4, el.y + 2);
      ctx.lineTo(el.x + 6, el.y + 5);
      ctx.lineTo(el.x + 9, el.y + 2);
      ctx.lineTo(el.x + 11, el.y + 5);
      ctx.stroke();
    }
    // Richtungspfeil über dem Pad, damit Schrägpads und Wandpads sofort lesbar sind
    if (el.dir !== 'up') {
      const [dx, dy] = el.dir === 'left' || el.dir === 'right' ? [el.dir === 'right' ? 1 : -1, -0.5] : DIR[el.dir];
      const cx = el.x + el.w / 2;
      const cy = side ? el.y + el.h / 2 : el.y - 4;
      ctx.fillStyle = COLOR.spring;
      triangle(ctx,
        cx + dx * 4, cy + dy * 4,
        cx - dx * 1 - dy * 3, cy - dy * 1 + dx * 3,
        cx - dx * 1 + dy * 3, cy - dy * 1 - dx * 3);
    }
  },

  ring(ctx, el) {
    ctx.globalAlpha = el.cd > 0 ? 0.3 : 1;
    ctx.strokeStyle = COLOR.ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(el.x, el.y, el.r, 0, Math.PI * 2);
    ctx.stroke();
    const [dx, dy] = DIR[el.dir] || DIR.right;
    ctx.fillStyle = COLOR.ring;
    triangle(ctx,
      el.x + dx * 5, el.y + dy * 5,
      el.x - dx * 2 - dy * 4, el.y - dy * 2 + dx * 4,
      el.x - dx * 2 + dy * 4, el.y - dy * 2 - dx * 4);
    ctx.globalAlpha = 1;
  },

  crystal(ctx, el) {
    ctx.globalAlpha = el.taken ? 0.15 : 1;
    ctx.fillStyle = COLOR.crystal;
    ctx.beginPath();
    ctx.moveTo(el.x, el.y - el.r);
    ctx.lineTo(el.x + el.r * 0.7, el.y);
    ctx.lineTo(el.x, el.y + el.r);
    ctx.lineTo(el.x - el.r * 0.7, el.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ddd6fe';
    ctx.fillRect(el.x - 1, el.y - el.r + 2, 2, 3);
    ctx.globalAlpha = 1;
  },

  wind(ctx, el, world) {
    // Böen: aus = nur ein schwacher Rahmen (Vorwarnung: blinkt), an = volle Strichchen
    if (!el.on) {
      ctx.strokeStyle = el.warn && world.tick % 12 < 6 ? 'rgba(125, 211, 252, 0.7)' : 'rgba(125, 211, 252, 0.18)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(el.x + 0.5, el.y + 0.5, el.w - 1, el.h - 1);
      ctx.setLineDash([]);
      return;
    }
    ctx.fillStyle = 'rgba(125, 211, 252, 0.07)';
    ctx.fillRect(el.x, el.y, el.w, el.h);
    // Strichchen, die in Windrichtung wandern (innerhalb des Rechtecks umlaufend)
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.35)';
    ctx.lineWidth = 1;
    const vertical = Math.abs(el.ay) >= Math.abs(el.ax);
    const sign = Math.sign(vertical ? el.ay : el.ax) || 1;
    const spacing = 22;
    const shift = (world.tick * 0.7 * sign) % spacing;
    ctx.beginPath();
    if (vertical) {
      for (let x = el.x + 6; x < el.x + el.w - 2; x += 10) {
        for (let k = 0; k * spacing < el.h; k++) {
          const off = (((k * spacing + shift) % el.h) + el.h) % el.h;
          ctx.moveTo(x, el.y + off);
          ctx.lineTo(x, el.y + Math.min(el.h, off + 6));
        }
      }
    } else {
      for (let y = el.y + 6; y < el.y + el.h - 2; y += 10) {
        for (let k = 0; k * spacing < el.w; k++) {
          const off = (((k * spacing + shift) % el.w) + el.w) % el.w;
          ctx.moveTo(el.x + off, y);
          ctx.lineTo(el.x + Math.min(el.w, off + 6), y);
        }
      }
    }
    ctx.stroke();
  },

  gravityZone(ctx, el, world) {
    ctx.fillStyle = 'rgba(192, 132, 252, 0.07)';
    ctx.fillRect(el.x, el.y, el.w, el.h);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(el.x + 0.5, el.y + 0.5, el.w - 1, el.h - 1);
    ctx.setLineDash([]);
    // Pfeile nach oben: hier fällt man aufwärts
    ctx.fillStyle = 'rgba(192, 132, 252, 0.5)';
    const phase = (world.tick * 0.5) % 24;
    for (let x = el.x + 10; x < el.x + el.w - 4; x += 20) {
      for (let y = el.y + el.h - phase; y > el.y; y -= 24) triangle(ctx, x, y - 6, x - 3, y, x + 3, y);
    }
  },

  portal(ctx, el, world) {
    const pair = Math.min(el.i, el.mate);
    ctx.globalAlpha = el.armed ? 1 : 0.45;
    ctx.strokeStyle = pair === el.i ? COLOR.portalA : COLOR.portalB;
    ctx.lineWidth = 2;
    const pulse = 1 + Math.sin(world.tick * 0.1) * 0.06;
    ctx.beginPath();
    ctx.ellipse(el.x, el.y, el.r * 0.6 * pulse, el.r * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },

  switch(ctx, el, world) {
    ctx.fillStyle = '#4a4660';
    ctx.fillRect(el.x, el.y + el.h - 4, el.w, 4);
    // Der Streifen zeigt den Zustand des eigenen Kanals: die Farbe der Blöcke, die gerade fest sind
    ctx.fillStyle = CHANNEL_COLORS[el.channel][(world.flags.sw >> el.channel) & 1];
    ctx.fillRect(el.x + 2, el.y + el.h - 8, el.w - 4, 4);
  },

  colorBlock(ctx, el) {
    const color = CHANNEL_COLORS[el.channel][el.solidWhen];
    if (el.on) {
      ctx.fillStyle = color;
      ctx.fillRect(el.x, el.y, el.w, el.h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(el.x, el.y, el.w, 2);
    } else {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.strokeRect(el.x + 1.5, el.y + 1.5, el.w - 3, el.h - 3);
      ctx.globalAlpha = 1;
    }
  },

  key(ctx, el) {
    if (el.taken) return;
    ctx.fillStyle = COLOR.key;
    ctx.beginPath();
    ctx.arc(el.x - 2, el.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(el.x, el.y - 1, 6, 2);
    ctx.fillRect(el.x + 4, el.y, 2, 3);
  },

  door(ctx, el) {
    if (el.open) return;
    ctx.fillStyle = COLOR.door;
    ctx.fillRect(el.x, el.y, el.w, el.h);
    ctx.fillStyle = COLOR.doorDark;
    ctx.fillRect(el.x + 5, el.y, 2, el.h);
    ctx.fillRect(el.x + 11, el.y, 2, el.h);
    ctx.fillStyle = COLOR.key;
    ctx.fillRect(el.x + el.w - 6, el.y + el.h / 2 - 1, 3, 3);
  },
};

/** Elemente im Sichtfenster zeichnen. `left`/`right` sind die sichtbaren Weltkoordinaten (x). */
export function drawElements(ctx, world, palette, left, right) {
  const margin = 4 * TILE;
  for (const el of world.elements) {
    const draw = DRAW[el.type];
    if (!draw) continue;
    // Grobes Aussortieren außerhalb des Bildes: fast alle Elemente haben x/tx
    const ex = el.bx !== undefined ? el.bx : el.x !== undefined ? el.x : el.tx * TILE;
    const ew = el.bw !== undefined ? el.bw : el.w || TILE;
    if (ex + ew < left - margin || ex > right + margin) continue;
    draw(ctx, el, world, palette);
  }
}
