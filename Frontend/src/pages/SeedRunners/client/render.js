// Zeichnen der Welt auf einen Canvas. Reine Darstellung: liest die Sim, verändert sie nie.
//
// Flache Farben, keine Verläufe, kein Weichzeichner, keine Schatten — passt zum Rest der Seite
// und ist auf Mittelklasse-Rechnern schnell genug, um auch mit vielen Elementen auf 60+ FPS
// zu bleiben. Gezeichnet wird nur, was im Sichtfenster liegt.
//
// Kacheln werden in GERÄTEPIXELN gerundet gezeichnet: Bei nicht ganzzahliger Skalierung
// (z.B. 2,37×) treffen benachbarte Kacheln sonst mit einem Bruchteil eines Pixels aufeinander,
// und es blitzen dünne Nähte durch. Kleinteile (Spieler, Anker) dürfen weich kantig bleiben.

import { TILE, PLAYER_W, PLAYER_H } from '../sim/config.js';
import { KIND } from '../sim/glyphs.js';
import { isSolid, kindAt } from '../sim/tilemap.js';
import { findGrappleTarget } from '../sim/player.js';
import { VIEW_W, VIEW_H } from './camera.js';
import { drawElements } from './drawElements.js';

const COLOR = {
  ice: '#3a6a86',
  iceTop: '#b4ecfb',
  sticky: '#34472b',
  stickyMark: '#8fc65a',
  conveyor: '#3a3646',
  conveyorMark: '#e4b04a',
  oneway: '#8a90b8',
  checkpointOff: '#52525b',
  checkpointOn: '#8b5cf6',
  finishA: '#22c55e',
  finishB: '#14532d',
  anchor: '#e4e4e7',
  anchorTarget: '#a78bfa',
  rope: '#e4e4e7',
  playerReady: '#a78bfa',
  playerSpent: '#5b5b73',
  playerEye: '#0b0b14',
  pipOn: '#e4e4e7',
  pipOff: '#3f3f52',
  pipDash: '#a78bfa',
  label: '#71717a',
};

/** Die Figur ohne Dash-Ladung: dieselbe Farbe, stark abgedunkelt und entsättigt — das Signal „Dash leer“ bleibt bei jeder
 *  Wunschfarbe erkennbar (vorher: violett ↔ grau) */
export function spentColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c, g) => Math.round(c * 0.38 + g * 0.62);
  const r = mix((n >> 16) & 255, 91);
  const g = mix((n >> 8) & 255, 91);
  const b = mix(n & 255, 115);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const DEFAULT_PALETTE = { bg: '#0b0b14', tile: '#23233a', tileTop: '#3d3d63', accent: '#a78bfa', far: '#101020' };

/** Passt den Canvas an seine CSS-Größe an (mit Pixeldichte); gibt den Skalierungsfaktor zurück. */
export function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round((canvas.clientWidth * dpr * VIEW_H) / VIEW_W));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return w / VIEW_W;
}

/**
 * Zeichnet die Kacheln des Sichtfensters (Gerätepixel, gerundet). Gemeinsam für das Spiel (drawFrame) und den
 * Level-Editor, damit beide dasselbe Bild zeigen.
 * @param scale        Geräte-Pixel pro Weltpixel
 * @param camX,camY    linke obere Ecke des Sichtfensters in Weltpixeln
 * @param viewW,viewH  Größe des Sichtfensters in Weltpixeln
 * @param tick         für die Förderband-Animation
 * @returns {{ tx0: number, tx1: number, ty0: number, ty1: number }} der sichtbare Kachelbereich
 */
export function drawTiles(ctx, scale, map, camX, camY, viewW, viewH, palette, tick) {
  const tx0 = Math.max(0, Math.floor(camX / TILE));
  const tx1 = Math.min(map.w - 1, Math.ceil((camX + viewW) / TILE));
  const ty0 = Math.max(0, Math.floor(camY / TILE));
  const ty1 = Math.min(map.h - 1, Math.ceil((camY + viewH) / TILE));
  const sx = (wx) => Math.round((wx - camX) * scale);
  const sy = (wy) => Math.round((wy - camY) * scale);
  const edge = Math.max(1, Math.round(scale * 1.5));

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const kind = kindAt(map, tx, ty);
      if (kind === KIND.AIR) continue;
      const x = sx(tx * TILE);
      const y = sy(ty * TILE);
      const w = sx((tx + 1) * TILE) - x;
      const h = sy((ty + 1) * TILE) - y;

      if (kind === KIND.ONEWAY) {
        ctx.fillStyle = COLOR.oneway;
        ctx.fillRect(x, y, w, Math.max(edge * 2, Math.round(scale * 4)));
        continue;
      }

      const exposedTop = !isSolid(map, tx, ty - 1);
      if (kind === KIND.ICE) {
        ctx.fillStyle = COLOR.ice;
        ctx.fillRect(x, y, w, h);
        if (exposedTop) { ctx.fillStyle = COLOR.iceTop; ctx.fillRect(x, y, w, edge * 2); }
      } else if (kind === KIND.STICKY) {
        ctx.fillStyle = COLOR.sticky;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = COLOR.stickyMark;
        // Streifen an den freien Seiten: dort klebt man
        for (const [nx, side] of [[-1, 'l'], [1, 'r']]) {
          if (isSolid(map, tx + nx, ty)) continue;
          const bx = side === 'l' ? x : x + w - edge * 2;
          for (let k = 0; k < 4; k++) ctx.fillRect(bx, y + Math.round((k * h) / 4) + edge, edge * 2, Math.max(1, Math.round(h / 8)));
        }
      } else if (kind === KIND.CONVEYOR_R || kind === KIND.CONVEYOR_L) {
        ctx.fillStyle = COLOR.conveyor;
        ctx.fillRect(x, y, w, h);
        if (exposedTop) {
          // wandernde Pfeilspitzen auf der Oberfläche
          ctx.fillStyle = COLOR.conveyorMark;
          const dir = kind === KIND.CONVEYOR_R ? 1 : -1;
          const off = ((tick * 0.35 * dir) % 8 + 8) % 8;
          for (let k = 0; k < 2; k++) {
            const mx = x + Math.round(((k * 8 + off) % TILE) * scale);
            ctx.fillRect(mx, y + edge, Math.max(1, Math.round(scale * 2)), Math.max(1, Math.round(scale * 2)));
          }
          ctx.fillRect(x, y, w, edge);
        }
      } else {
        ctx.fillStyle = palette.tile;
        ctx.fillRect(x, y, w, h);
        if (exposedTop) {
          ctx.fillStyle = palette.tileTop;
          ctx.fillRect(x, y, w, edge);
        }
      }
    }
  }
  return { tx0, tx1, ty0, ty1 };
}

/** Checkpoint-Fahne mit Mast; `pulse` (0..1) lässt sie kurz größer wehen, `active` färbt sie */
export function drawCheckpointFlag(ctx, cp, active, pulse = 0) {
  ctx.fillStyle = active ? COLOR.checkpointOn : COLOR.checkpointOff;
  const bx = cp.tx * TILE + 5;
  const by = (cp.ty + 1) * TILE;
  ctx.fillRect(bx, by - 14, 1.5, 14);                              // Fahnenstange
  ctx.fillRect(bx + 1.5, by - 14, 7 + pulse * 5, 5 + pulse * 2);   // Fahne
}

/** Zielkachel: schachbrettartig blinkend */
export function drawFinishTile(ctx, f, tick) {
  ctx.fillStyle = (f.tx + f.ty + Math.floor(tick / 40)) % 2 === 0 ? COLOR.finishA : COLOR.finishB;
  ctx.fillRect(f.tx * TILE, f.ty * TILE, TILE, TILE);
}

/** Greifanker; `targeted` legt den Ring um den, den ein Druck auf die Grapple-Taste jetzt greifen würde */
export function drawAnchorDot(ctx, a, targeted) {
  ctx.fillStyle = COLOR.anchor;
  ctx.beginPath();
  ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
  ctx.fill();
  if (targeted) {
    ctx.strokeStyle = COLOR.anchorTarget;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 7, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * Geister (client/ghost.js): halbtransparente Läufer mit ihrem Namen. Nach dem Ziel verschwinden sie.
 * @param ghosts  [{ world, name, color, finished }]
 */
export function drawGhosts(ctx, ghosts, alpha) {
  for (const g of ghosts) {
    if (g.finished && g.world.finished) continue;
    const p = g.world.player;
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = g.color;
    ctx.fillRect(x, y, PLAYER_W, PLAYER_H);
    ctx.globalAlpha = 0.8;
    ctx.font = '6px Inter, sans-serif';
    ctx.textAlign = 'center';
    if (g.name) ctx.fillText(g.name, x + PLAYER_W / 2, y - 3);
    ctx.globalAlpha = 1;
  }
}

/**
 * @param ctx    2D-Kontext
 * @param scale  Geräte-Pixel pro Weltpixel (aus fitCanvas)
 * @param world  Sim-Welt
 * @param cam    Kamera
 * @param alpha  Bruchteil bis zum nächsten Tick, für die Interpolation
 * @param opts   { aim: {x,y} (Zielrichtung für die Ankeranzeige), showWarps, palette, juice, ghosts, playerColor }
 *               playerColor: Farbe der eigenen Figur (Einstellungen bzw. Raumfarbe); ohne Angabe das bisherige Violett
 *               juice (client/juice.js): Hintergrund, Partikel, Bildschütteln, Squash & Stretch, Einblendungen
 */
export function drawFrame(ctx, scale, world, cam, alpha, opts = {}) {
  const { map } = world;
  const p = world.player;
  const palette = opts.palette || DEFAULT_PALETTE;
  const juice = opts.juice;
  const shake = juice ? juice.shake : null;
  const camX = cam.x + (shake ? shake.x : 0);
  const camY = cam.y + (shake ? shake.y : 0);
  const tick = world.tick;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, VIEW_W * scale, VIEW_H * scale);
  juice?.drawBackground(ctx, scale, camX, camY, tick);

  // ── Kacheln (Gerätepixel, gerundet) ──
  const { tx0, tx1 } = drawTiles(ctx, scale, map, camX, camY, VIEW_W, VIEW_H, palette, tick);

  // ── Weltobjekte in Weltkoordinaten ──
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);

  drawElements(ctx, world, palette, camX, camX + VIEW_W);

  for (let i = 0; i < map.checkpoints.length; i++) {
    const cp = map.checkpoints[i];
    if (cp.tx < tx0 - 1 || cp.tx > tx1 + 1) continue;
    const pulse = juice ? juice.flagPulse(i + 1) : 0;   // frisch erreicht: Fahne weht kurz größer
    drawCheckpointFlag(ctx, cp, i + 1 <= world.checkpointIndex, pulse);
  }

  for (const f of map.finish) {
    if (f.tx < tx0 - 1 || f.tx > tx1 + 1) continue;
    drawFinishTile(ctx, f, tick);
  }

  // Anker: der, den ein Druck auf die Grapple-Taste jetzt greifen würde, bekommt einen Ring
  const aim = opts.aim || { x: 0, y: 0 };
  const target = p.grapple ? null : findGrappleTarget(world, aim.x, aim.y);
  for (let i = 0; i < map.anchors.length; i++) {
    const a = map.anchors[i];
    if (a.tx < tx0 - 1 || a.tx > tx1 + 1) continue;
    drawAnchorDot(ctx, a, !!target && target.index === i);
  }

  if (opts.ghosts && opts.ghosts.length) drawGhosts(ctx, opts.ghosts, alpha);

  // ── Spieler (zwischen vorigem und aktuellem Tick gemischt) ──
  const px = p.prevX + (p.x - p.prevX) * alpha;
  const py = p.prevY + (p.y - p.prevY) * alpha;
  const flip = p.gd < 0;   // kopfüber in einer Gravitationszone: Figur und Anzeige stehen auf dem Kopf

  if (p.grapple) {
    ctx.strokeStyle = COLOR.rope;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + PLAYER_W / 2, py + PLAYER_H / 2);
    ctx.lineTo(p.grapple.ax, p.grapple.ay);
    ctx.stroke();
  }

  juice?.drawParticles(ctx, 'back');

  // Squash & Stretch: die Figur wird um die Füße (kopfüber: um den Scheitel) gestaucht oder gestreckt.
  // Die Hitbox der Sim bleibt unverändert — das ist nur das Bild.
  const sq = juice ? juice.squash : null;
  const bw = PLAYER_W * (sq ? sq.sx : 1);
  const bh = PLAYER_H * (sq ? sq.sy : 1);
  const bx = px + PLAYER_W / 2 - bw / 2;
  const by = flip ? py : py + PLAYER_H - bh;
  const farbe = /^#[0-9a-f]{6}$/i.test(opts.playerColor || '') ? opts.playerColor : null;
  ctx.fillStyle = p.dashCharges > 0 ? (farbe || COLOR.playerReady) : (farbe ? spentColor(farbe) : COLOR.playerSpent);
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = COLOR.playerEye;
  ctx.fillRect(bx + (p.facing > 0 ? bw - 4 : 2), flip ? by + bh - 5 : by + 3, 2, 2);

  // Anzeige, was noch übrig ist: Luftsprünge (hell) und Dash-Ladungen (violett) als Punkte
  const pips = [];
  for (let i = 0; i < world.cfg.airJumps; i++) pips.push(i < p.airJumps ? COLOR.pipOn : COLOR.pipOff);
  for (let i = 0; i < world.cfg.dashCharges; i++) pips.push(i < p.dashCharges ? (farbe || COLOR.pipDash) : COLOR.pipOff);
  const pipW = 3;
  const pipStart = px + PLAYER_W / 2 - (pips.length * (pipW + 1) - 1) / 2;
  pips.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(pipStart + i * (pipW + 1), flip ? py + PLAYER_H + 4 : py - 6, pipW, 2);
  });

  // Schlüssel in der Tasche
  for (let i = 0; i < world.flags.keys; i++) {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(px + PLAYER_W + 2 + i * 4, flip ? py + PLAYER_H - 4 : py, 3, 3);
  }

  juice?.drawParticles(ctx, 'front');

  // ── Dev: Warp-Marken beschriften ──
  if (opts.showWarps) {
    ctx.fillStyle = COLOR.label;
    ctx.font = '8px Inter, sans-serif';
    ctx.textAlign = 'center';
    for (const [digit, pos] of Object.entries(map.warps)) {
      if (pos.x < camX - 20 || pos.x > camX + VIEW_W + 20) continue;
      ctx.fillText(digit, pos.x + PLAYER_W / 2, pos.y + PLAYER_H + 9);
    }
  }

  // ── Einblendungen und Blitze in Bildschirmkoordinaten ──
  if (juice) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    juice.drawOverlay(ctx, scale, camX, camY);
  }
}
