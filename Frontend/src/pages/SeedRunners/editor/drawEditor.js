// Zeichnet die Editor-Ansicht. Kacheln und Elemente kommen aus denselben Funktionen wie im Spiel
// (client/render.js, client/drawElements.js) — was der Editor zeigt, ist, was gespielt wird. Darüber liegen die
// Hilfen des Editors (Gitter, Verknüpfungen, Pfade, Auswahl, Warnmarker) in Bildschirmpixeln.
//
// Reine Darstellung: verändert weder Dokument noch Welt.

import { TILE, PLAYER_W, PLAYER_H } from '../sim/config.js';
import { ELEMENT_SCHEMA, normalizeParams, footprintOf } from '../sim/elements/schema.js';
import { drawTiles, drawCheckpointFlag, drawFinishTile, drawAnchorDot } from '../client/render.js';
import { drawElements, CHANNEL_COLORS } from '../client/drawElements.js';
import { footprintRect } from './ops.js';

const OUTSIDE = '#07070c';
const ACCENT = '#a78bfa';
const ERROR = '#f87171';
const WARN = '#fbbf24';
const ERASE = '#f87171';

const footprintCache = new Map();

/** Fläche eines frisch gesetzten Elements (für die Vorschau am Zeiger) */
export function defaultFootprint(type) {
  if (!footprintCache.has(type)) {
    const given = type === 'mover' ? { path: [[0, 0], [6, 0]] } : type === 'portal' ? { id: 'a', pair: 'b' } : {};
    const res = normalizeParams(type, given);
    footprintCache.set(type, res.ok ? footprintOf(type, res.clean) : { w: 1, h: 1 });
  }
  return footprintCache.get(type);
}

/** Mittelpunkt einer Kachel in Weltpixeln */
const cellCenter = (tx, ty) => [(tx + 0.5) * TILE, (ty + 0.5) * TILE];

/** Mitte des Elements (für Verknüpfungslinien) in Weltpixeln */
function elementCenter(el) {
  const r = footprintRect(el);
  return [((r.x0 + r.x1 + 1) / 2) * TILE, ((r.y0 + r.y1 + 1) / 2) * TILE];
}

/** Position von Pfadpunkt `pt` als Kachel: die Kachel, in der der Griff sitzt */
export const pathCell = (el, pt) => [el.tx + pt[0], el.ty + pt[1]];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} s  siehe Aufrufer (EditorCanvas.jsx): cssW, cssH, dpr, view, doc, preview, palette, tool, brush,
 *                    hover, drag, selection, selectedEl, pathEdit, markers, showGrid, showLinks, showPaths, time
 */
export function drawEditor(ctx, s) {
  const { cssW, cssH, dpr, view, doc, preview, palette } = s;
  const zoom = view.zoom;
  const scale = zoom * dpr;
  const viewW = cssW / zoom;
  const viewH = cssH / zoom;
  const { map, world } = preview;

  // Bildschirmposition (CSS-Pixel) einer Weltposition
  const px = (wx) => (wx - view.x) * zoom;
  const py = (wy) => (wy - view.y) * zoom;
  const tilePx = TILE * zoom;

  // ── Hintergrund und Kacheln ──
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = OUTSIDE;
  ctx.fillRect(0, 0, cssW * dpr, cssH * dpr);
  const x0 = Math.max(0, px(0));
  const y0 = Math.max(0, py(0));
  const x1 = Math.min(cssW, px(doc.width * TILE));
  const y1 = Math.min(cssH, py(doc.height * TILE));
  if (x1 > x0 && y1 > y0) {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(x0 * dpr, y0 * dpr, (x1 - x0) * dpr, (y1 - y0) * dpr);
  }
  drawTiles(ctx, scale, map, view.x, view.y, viewW, viewH, palette, 0);

  // ── Elemente und Markierungen in Weltkoordinaten ──
  ctx.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
  if (world) drawElements(ctx, world, palette, view.x, view.x + viewW);
  const inView = (tx) => tx * TILE >= view.x - TILE && tx * TILE <= view.x + viewW + TILE;
  for (const cp of map.checkpoints) if (inView(cp.tx)) drawCheckpointFlag(ctx, cp, false);
  for (const f of map.finish) if (inView(f.tx)) drawFinishTile(ctx, f, 0);
  for (const a of map.anchors) if (inView(a.tx)) drawAnchorDot(ctx, a, false);
  if (!preview.startFixed && map.start) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(map.start.x, map.start.y, PLAYER_W, PLAYER_H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0b0b14';
    ctx.fillRect(map.start.x + PLAYER_W - 4, map.start.y + 3, 2, 2);
  }

  // ── Hilfen in CSS-Pixeln ──
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = 'miter';

  const rectPx = (tx, ty, w, h) => [px(tx * TILE), py(ty * TILE), w * tilePx, h * tilePx];
  const strokeCells = (r, color, width = 1.5, dash = null) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    const [x, y, w, h] = rectPx(r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1);
    ctx.strokeRect(x + width / 2, y + width / 2, w - width, h - width);
    ctx.setLineDash([]);
  };
  const fillCells = (r, color) => {
    ctx.fillStyle = color;
    const [x, y, w, h] = rectPx(r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1);
    ctx.fillRect(x, y, w, h);
  };

  // Gitter
  if (s.showGrid && tilePx >= 10) {
    const tx0 = Math.max(0, Math.floor(view.x / TILE));
    const tx1 = Math.min(doc.width, Math.ceil((view.x + viewW) / TILE));
    const ty0 = Math.max(0, Math.floor(view.y / TILE));
    const ty1 = Math.min(doc.height, Math.ceil((view.y + viewH) / TILE));
    ctx.lineWidth = 1;
    for (let tx = tx0; tx <= tx1; tx++) {
      ctx.strokeStyle = tx % 10 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
      const x = Math.round(px(tx * TILE)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, Math.max(0, py(ty0 * TILE)));
      ctx.lineTo(x, Math.min(cssH, py(ty1 * TILE)));
      ctx.stroke();
    }
    for (let ty = ty0; ty <= ty1; ty++) {
      ctx.strokeStyle = ty % 10 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)';
      const y = Math.round(py(ty * TILE)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, px(tx0 * TILE)), y);
      ctx.lineTo(Math.min(cssW, px(tx1 * TILE)), y);
      ctx.stroke();
    }
  }

  // Levelrand
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px(0) + 0.5, py(0) + 0.5, doc.width * tilePx, doc.height * tilePx);

  // Portal-Verbindungen
  if (s.showLinks) {
    const byId = new Map(doc.elements.filter((e) => e.type === 'portal').map((e) => [e.id, e]));
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#38bdf8';
    for (const e of byId.values()) {
      const mate = byId.get(e.pair);
      if (!mate || e.id > mate.id) continue;
      const [ax, ay] = cellCenter(e.tx, e.ty);
      const [bx, by] = cellCenter(mate.tx, mate.ty);
      ctx.beginPath();
      ctx.moveTo(px(ax), py(ay));
      ctx.lineTo(px(bx), py(by));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Schalter ↔ Farbblöcke des gewählten Elements
  const sel = s.selectedEl;
  if (s.showLinks && sel && (sel.type === 'switch' || sel.type === 'colorBlock')) {
    const channel = sel.channel || 0;
    const other = sel.type === 'switch' ? 'colorBlock' : 'switch';
    ctx.lineWidth = 1;
    ctx.strokeStyle = CHANNEL_COLORS[channel][0];
    ctx.globalAlpha = 0.7;
    let n = 0;
    const [sx, sy] = elementCenter(sel);
    for (const e of doc.elements) {
      if (e.type !== other || (e.channel || 0) !== channel || n++ > 200) continue;
      const [ex, ey] = elementCenter(e);
      ctx.beginPath();
      ctx.moveTo(px(sx), py(sy));
      ctx.lineTo(px(ex), py(ey));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Pfade
  if (s.showPaths || s.pathEdit) {
    for (const e of doc.elements) {
      if (!e.path || e.path.length < 2) continue;
      const active = sel && sel.tx === e.tx && sel.ty === e.ty;
      if (!active && !s.showPaths) continue;
      ctx.strokeStyle = active ? '#fde68a' : 'rgba(253,230,138,0.35)';
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath();
      e.path.forEach((pt, i) => {
        const [tx, ty] = pathCell(e, pt);
        const [wx, wy] = cellCenter(tx, ty);
        if (i === 0) ctx.moveTo(px(wx), py(wy));
        else ctx.lineTo(px(wx), py(wy));
      });
      ctx.stroke();
      if (active) {
        const size = s.pathEdit ? 10 : 7;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        e.path.forEach((pt, i) => {
          const [tx, ty] = pathCell(e, pt);
          const [wx, wy] = cellCenter(tx, ty);
          ctx.fillStyle = i === 0 ? ACCENT : '#fde68a';
          ctx.fillRect(px(wx) - size / 2, py(wy) - size / 2, size, size);
          if (s.pathEdit) {
            ctx.fillStyle = '#0b0b14';
            ctx.fillText(String(i + 1), px(wx), py(wy) + 3.5);
          }
        });
      }
    }
  }

  // Warnmarker
  for (const m of s.markers || []) {
    if (m.tx === undefined) continue;
    const [x, y, w] = rectPx(m.tx, m.ty, 1, 1);
    if (x + w < 0 || y + w < 0 || x > cssW || y > cssH) continue;
    const size = Math.max(6, tilePx * 0.4);
    ctx.fillStyle = m.level === 'error' ? ERROR : WARN;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w - size, y);
    ctx.lineTo(x + w, y + size);
    ctx.closePath();
    ctx.fill();
  }

  // Auswahl
  if (s.selection) {
    const r = s.selection;
    fillCells(r, 'rgba(167,139,250,0.14)');
    strokeCells(r, ACCENT, 1.5, [6, 4]);
  }
  if (sel) {
    const fp = footprintRect(sel);
    strokeCells(fp, '#ffffff', 1.5);
  }

  // Ziehen (Rechteck füllen / Auswahl aufziehen)
  if (s.drag) {
    const color = s.drag.erase ? ERASE : ACCENT;
    fillCells(s.drag.rect, s.drag.erase ? 'rgba(248,113,113,0.2)' : 'rgba(167,139,250,0.22)');
    strokeCells(s.drag.rect, color, 1.5);
  }

  // Zeiger: was ein Klick jetzt täte
  if (s.hover && !s.playing) {
    const { x, y } = s.hover;
    const one = { x0: x, y0: y, x1: x, y1: y };
    if (s.tool === 'eraser') {
      strokeCells(one, ERASE, 1.5);
    } else if ((s.tool === 'brush' || s.tool === 'rect') && s.brush) {
      if (s.brush.kind === 'element') {
        const fp = defaultFootprint(s.brush.type);
        strokeCells({ x0: x, y0: y, x1: x + fp.w - 1, y1: y + fp.h - 1 }, ELEMENT_SCHEMA[s.brush.type] ? '#ffffff' : ACCENT, 1.5, [4, 3]);
      } else if (s.tool === 'brush') {
        fillCells(one, 'rgba(255,255,255,0.28)');
        strokeCells(one, '#ffffff', 1);
      } else {
        strokeCells(one, '#ffffff', 1);
      }
    } else {
      strokeCells(one, 'rgba(255,255,255,0.55)', 1);
    }
  }

  // Lineale: alle 10 Kacheln eine Zahl am oberen und linken Rand
  if (tilePx >= 8) {
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'left';
    const tx0 = Math.max(0, Math.ceil(view.x / TILE / 10) * 10);
    for (let tx = tx0; tx <= doc.width && px(tx * TILE) < cssW; tx += 10) ctx.fillText(String(tx), px(tx * TILE) + 3, 11);
    const ty0 = Math.max(0, Math.ceil(view.y / TILE / 10) * 10);
    for (let ty = ty0; ty <= doc.height && py(ty * TILE) < cssH; ty += 10) ctx.fillText(String(ty), 3, py(ty * TILE) + 11);
  }
}
