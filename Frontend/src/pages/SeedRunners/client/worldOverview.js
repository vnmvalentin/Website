// Übersichtsbild einer v2-Welt: das ganze Level auf einmal, klein gerastert.
//
// Das ist das Werkzeug, mit dem sich die Makro-Form überhaupt beurteilen lässt — im Spiel sieht man
// immer nur ein 480 × 270 großes Fenster und merkt nie, ob die Welt als Ganzes eine Form hat.
// Gezeichnet werden Gelände, Zonengrenzen, Höhenprofil und (optional) die erreichbaren Standflächen
// aus dem Bewegungsgraph — so sieht man auf einen Blick, wo eine Route abreißt.
//
// Reines Canvas-Zeichnen ohne React, damit es auch in Tests und späteren Werkzeugen (Seed-Galerie,
// Batch-Bilder) benutzt werden kann.
//
// Liegt unter client/ und NICHT unter gen/ — aus demselben Grund wie der Welten-Worker: Der Spiegel
// nach Backend/ kopiert gen/, und daraus entsteht der GEN-Fingerprint, an dem die Gültigkeit von
// Tagesrennen-Läufen hängt. Eine geänderte Debug-Farbe darf keine Bestenliste entwerten.

const COLOR = {
  bg: '#0b0b14',
  rock: '#2b2f3d',
  rockTop: '#49506a',
  profile: 'rgba(147, 197, 253, 0.55)',
  zone: 'rgba(255, 255, 255, 0.16)',
  shortcut: 'rgba(250, 204, 21, 0.55)',
  branch: '#fb923c',
  reach: 'rgba(74, 222, 128, 0.75)',
  start: '#4ade80',
  finish: '#f472b6',
  checkpoint: '#facc15',
};

/** Zeichen im Raster, die die Sim als Kachel/Element liest (glyphs.js) — Chunks bringen sie mit */
const GLYPH_COLOR = { I: "#7dd3fc", W: "#a3e635", ">": "#facc15", "<": "#facc15", "=": "#94a3b8", "^": "#f87171", P: "#4ade80", O: "#a3e635", D: "#22d3ee", F: "#d6b98c", T: "#fde047", K: "#fde047", Y: "#fde047", R: "#c084fc", B: "#c084fc", G: "#fef08a" };

/** Farbe je Elementtyp in der Übersicht — dieselbe Zuordnung erklärt die Legende in der Werkbank */
export const ENTITY_COLOR = {
  spike: '#f87171', saw: '#fb923c', laser: '#e879f9', spring: '#4ade80', mover: '#60a5fa',
  crystal: '#22d3ee', ring: '#a3e635', crumble: '#a8a29e', fallingBlock: '#d6b98c',
  switch: '#fde047', door: '#fde047', key: '#fde047', portal: '#c084fc', wind: '#7dd3fc',
  anchor: '#fef08a', other: '#ffffff',
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} level     Ergebnis von generateWorld()
 * @param {{ scale?: number, reachable?: Set<string>, showProfile?: boolean }} [opts]
 *   scale      Bildpunkte je Kachel (Standard 2)
 *   reachable  Menge "x,y" aus floodReachable(): wird als grüne Punkte gezeigt
 */
export function drawOverview(ctx, level, opts = {}) {
  const s = opts.scale || 2;
  const { rows, width, height } = level;

  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, width * s, height * s);

  // Gelände: Oberkanten heller, damit die Form lesbar wird
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < width; x++) {
      const g = GLYPH_COLOR[row[x]];
      if (g) { ctx.fillStyle = g; ctx.fillRect(x * s, y * s, s, s); continue; }
      if (row[x] !== '#') continue;
      const top = y === 0 || rows[y - 1][x] !== '#';
      ctx.fillStyle = top ? COLOR.rockTop : COLOR.rock;
      ctx.fillRect(x * s, y * s, s, s);
    }
  }

  // Erreichbare Standflächen
  if (opts.reachable) {
    ctx.fillStyle = COLOR.reach;
    for (const k of opts.reachable) {
      const [x, y] = k.split(',');
      ctx.fillRect(Number(x) * s, Number(y) * s, s, s);
    }
  }

  // Höhenprofil der Hauptroute
  if (opts.showProfile !== false && level.layout?.profile) {
    ctx.strokeStyle = COLOR.profile;
    ctx.lineWidth = 1;
    ctx.beginPath();
    level.layout.profile.forEach((row, x) => {
      const px = x * s;
      const py = row * s;
      if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // Zonengrenzen und Beschriftung
  if (level.layout?.zones) {
    ctx.font = `${Math.max(9, s * 5)}px sans-serif`;
    ctx.textBaseline = 'top';
    for (const z of level.layout.zones) {
      ctx.strokeStyle = z.shortcut ? COLOR.shortcut : COLOR.zone;
      ctx.lineWidth = 1;
      ctx.strokeRect(z.x0 * s + 0.5, 0.5, z.w * s - 1, height * s - 1);
      ctx.fillStyle = z.shortcut ? COLOR.shortcut : 'rgba(255,255,255,0.45)';
      // Schmale Zonen (Schächte sind nur 14–22 Kacheln breit) bekommen nur so viel Text, wie
      // hineinpasst — sonst schreiben zwei Nachbarn übereinander und beide werden unlesbar.
      const room = z.w * s - 6;
      let label = z.name || z.kind;
      while (label.length > 1 && ctx.measureText(label).width > room) label = label.slice(0, -1);
      if (label !== (z.name || z.kind)) label = label.length > 2 ? `${label.slice(0, -1)}…` : '';
      if (label) ctx.fillText(label, z.x0 * s + 3, 3);
    }
  }

  // Die Trittsteine der Abkürzungen: Sie sehen im Gelände aus wie jeder andere Fels, und genau
  // deshalb waren sie hier nicht zu finden. Ob eine Verzweigung wirklich gebaut wurde, soll man
  // sehen können und nicht nur einer Kennzahl glauben müssen.
  if (level.layout?.shortcuts) {
    ctx.fillStyle = COLOR.branch;
    for (const cut of level.layout.shortcuts) {
      for (const p of cut.platforms) ctx.fillRect(p.x * s, p.y * s, p.w * s, 2 * s);
    }
  }

  // Elemente und Greifanker: ohne sie sieht eine Höhle mit 10 Sägen aus wie eine ohne — und "alle
  // Level sehen gleich aus" ließ sich gar nicht beurteilen, weil die Übersicht nur Fels zeigte.
  if (opts.showEntities !== false) {
    const px = Math.max(s, 3);
    for (const e of level.entities || []) {
      if (e.type === 'mover' && e.path) {
        ctx.strokeStyle = ENTITY_COLOR.mover;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((e.tx + e.path[0][0] + 0.5) * s, (e.ty + e.path[0][1] + 0.5) * s);
        for (const [dx, dy] of e.path.slice(1)) ctx.lineTo((e.tx + dx + 0.5) * s, (e.ty + dy + 0.5) * s);
        ctx.stroke();
      }
      ctx.fillStyle = ENTITY_COLOR[e.type] || ENTITY_COLOR.other;
      ctx.fillRect(e.tx * s + s / 2 - px / 2, e.ty * s + s / 2 - px / 2, px, px);
    }
    ctx.fillStyle = ENTITY_COLOR.anchor;
    for (const a of level.meta?.anchors || []) ctx.fillRect(a.x * s + s / 2 - px / 2, a.y * s + s / 2 - px / 2, px, px);
  }

  // Start, Ziel, Checkpoints
  const dot = (p, color, size = 3) => {
    if (!p) return;
    ctx.fillStyle = color;
    ctx.fillRect(p.x * s - size / 2, p.y * s - size / 2, Math.max(size, s), Math.max(size, s));
  };
  for (const cp of level.meta?.checkpoints || []) dot(cp, COLOR.checkpoint);
  for (const f of level.meta?.finish || []) dot(f, COLOR.finish);
  dot(level.meta?.start, COLOR.start, 4);
}

/** Passende Bildgröße für ein Level bei gegebener maximaler Breite */
export function overviewScale(level, maxPx) {
  return Math.max(1, Math.min(4, Math.floor(maxPx / level.width)));
}

/**
 * MINIKARTE für die Seed-Galerie: das ganze Level in eine feste Kachel gequetscht.
 *
 * Der Zweck ist ein Vergleich, kein Betrachten — zwei Welttypen müssen sich schon hier
 * unterscheiden lassen, sonst sind sie in Wahrheit derselbe Typ mit anderen Zahlen. Deshalb wird je
 * Bildpunkt abgetastet statt je Kachel gezeichnet: Bei starker Verkleinerung ginge sonst genau das
 * verloren, worauf es ankommt — dünne Stege, einzelne Inseln, die Silhouette.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} level
 * @param {{w: number, h: number}} kachel  Zielgröße in Bildpunkten
 */
export function drawMinikarte(ctx, level, kachel) {
  const { rows, width, height } = level;
  const s = Math.min(kachel.w / width, kachel.h / height);
  const bw = Math.max(1, Math.round(width * s));
  const bh = Math.max(1, Math.round(height * s));
  const ox = Math.floor((kachel.w - bw) / 2);
  const oy = Math.floor((kachel.h - bh) / 2);

  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, kachel.w, kachel.h);

  const bild = ctx.createImageData(bw, bh);
  const d = bild.data;
  const fels = [0x49, 0x50, 0x6a];
  const luft = [0x0b, 0x0b, 0x14];
  for (let py = 0; py < bh; py++) {
    const ty = Math.min(height - 1, Math.floor((py / bh) * height));
    const zeile = rows[ty];
    for (let px = 0; px < bw; px++) {
      const tx = Math.min(width - 1, Math.floor((px / bw) * width));
      const c = zeile[tx] === '#' ? fels : luft;
      const i = (py * bw + px) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(bild, ox, oy);

  // Elemente als 2-px-Punkte: Zwei Welten mit gleicher Silhouette, aber anderen Gefahren, sollen
  // sich auch in der Galerie unterscheiden lassen.
  for (const e of level.entities || []) {
    ctx.fillStyle = ENTITY_COLOR[e.type] || ENTITY_COLOR.other;
    ctx.fillRect(ox + Math.round((e.tx / width) * bw), oy + Math.round((e.ty / height) * bh), 2, 2);
  }

  // Start und Ziel als Anker fürs Auge — ohne sie sieht man der Karte die Laufrichtung nicht an.
  const punkt = (p, farbe) => {
    if (!p) return;
    ctx.fillStyle = farbe;
    ctx.fillRect(ox + Math.round((p.x / width) * bw) - 1, oy + Math.round((p.y / height) * bh) - 1, 3, 3);
  };
  punkt(level.meta?.start, COLOR.start);
  for (const f of level.meta?.finish || []) punkt(f, COLOR.finish);
}
