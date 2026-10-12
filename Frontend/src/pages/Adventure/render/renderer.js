// render/renderer.js — zeichnet den Spielzustand auf das Canvas. Liest nur, verändert das Spiel nicht (einzige
// Ausnahme: "gesehen"-Markierungen für die Minikarte). Weltkoordinaten in px; zoom passt die Sicht an die Fensterhöhe an.
//
// Seit Oktober 2026 im flachen Stil ohne Bilddateien: Figuren aus render/flat/figures.js, Boden, Hindernisse, Objekte
// und Geschosse aus render/flat/world.js.

import { drawFigure } from "./flat/figures.js";
import { drawWormBody, drawMound } from "./flat/creatures.js";
import { FLOORS, makeFloorTile, drawObstacle, drawInteractable, drawTeleporter as drawTeleporterFlat, drawCoin, drawHealOrb, drawProjectile, drawBurn, drawIceBlock } from "./flat/world.js";
import { drawPixelIcon } from "../ui/pixelCanvas.js";
import { RARITY, ITEMS } from "../data/items.js";
import { eliteColor } from "../engine/enemies.js";
import { priceOf, INTERACT_INFO } from "../engine/interact.js";
import { TELEPORTER_RADIUS } from "../engine/stage.js";
import { clamp } from "../engine/util.js";
import { getSettings } from "../ui/settings.js";

const FONT = '"Tiny5", "Silkscreen", monospace';

export default class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cam = { x: 0, y: 0, init: false };
    this.zoom = 1;
    this.w = canvas.width;
    this.h = canvas.height;
    this.dpr = 1;
    this.patterns = new Map();
    this.time = 0;
    this.minimapSize = 190;
  }

  resize(cssW, cssH) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = cssW;
    this.h = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.zoom = clamp(Math.min(cssH / 800, cssW / 1250), 0.6, 2.4);
  }

  screenToWorld(sx, sy) {
    return { x: this.cam.x + sx / this.zoom, y: this.cam.y + sy / this.zoom };
  }

  get viewW() { return this.w / this.zoom; }
  get viewH() { return this.h / this.zoom; }

  updateCamera(g, dt) {
    const p = g.player;
    const vw = this.viewW, vh = this.viewH;
    let tx = p.x - vw / 2, ty = p.y - vh / 2;
    const pad = 120;
    tx = g.world.w + pad * 2 < vw ? (g.world.w - vw) / 2 : clamp(tx, -pad, g.world.w - vw + pad);
    ty = g.world.h + pad * 2 < vh ? (g.world.h - vh) / 2 : clamp(ty, -pad, g.world.h - vh + pad);
    if (!this.cam.init || this.cam.stage !== g.stageIndex + g.loop * 10) {
      this.cam.x = tx; this.cam.y = ty; this.cam.init = true; this.cam.stage = g.stageIndex + g.loop * 10;
    }
    const k = 1 - Math.exp(-dt * 12);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  // ── Hauptzeichnung ────────────────────────────────────────────────────────
  draw(g, dt) {
    this.time += dt;
    this.updateCamera(g, dt);
    const ctx = this.ctx;
    const s = this.dpr * this.zoom;
    const shake = getSettings().shake ? g.fx.shake : 0;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = FLOORS[g.biome.id]?.outside || "#0d0c10";
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.setTransform(s, 0, 0, s, (-this.cam.x + sx) * s, (-this.cam.y + sy) * s);
    this.view = { x0: this.cam.x - 80, y0: this.cam.y - 80, x1: this.cam.x + this.viewW + 80, y1: this.cam.y + this.viewH + 80 };

    this.biomeId = g.biome.id;
    this.drawFloor(g);
    this.drawZones(g);
    this.drawHazards(g);
    this.drawTeleporter(g);
    this.drawInteractables(g);
    this.drawWalls(g);
    this.drawPickups(g);
    this.drawActors(g);
    this.drawProjectiles(g);
    this.drawFx(g);
    this.drawPrices(g);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawPointers(g);
    this.drawMinimap(g);
    this.drawStatusTint(g);
  }

  visible(x, y, r = 0) {
    const v = this.view;
    return x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;
  }

  drawFloor(g) {
    const ctx = this.ctx;
    const id = g.biome.id;
    let pat = this.patterns.get(id);
    if (!pat) { pat = ctx.createPattern(makeFloorTile(id), "repeat"); this.patterns.set(id, pat); }
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, g.world.w, g.world.h);
    // Rand: dunkler Streifen nach innen
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 24;
    ctx.strokeRect(12, 12, g.world.w - 24, g.world.h - 24);
  }
  // ── Flächen und Telegraphen ───────────────────────────────────────────────
  drawZones(g) {
    const ctx = this.ctx;
    for (const z of g.zones) {
      if (!this.visible(z.x, z.y, z.r)) continue;
      const fade = Math.min(1, z.t / 0.6);
      ctx.save();
      ctx.globalAlpha = fade;
      if (z.kind === "arrows") {
        ctx.fillStyle = "rgba(230,220,190,0.12)";
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(230,220,190,0.4)"; ctx.lineWidth = 2; ctx.stroke();
        for (let i = 0; i < 7; i++) {
          const a = (this.time * 3 + i * 1.7) % (Math.PI * 2);
          const rr = ((i * 37 + this.time * 160) % z.r);
          const ax = z.x + Math.cos(a * 3.1 + i) * rr, ay = z.y + Math.sin(a * 2.3 + i) * rr;
          drawProjectile(ctx, "proj_arrow", ax, ay - 10, Math.PI / 2, 22, this.time);
        }
      } else {
        const col = z.kind === "fire" ? "255,110,40" : z.kind === "poison" ? "120,220,80" : z.friendly ? "130,230,90" : "150,60,210";
        ctx.fillStyle = `rgba(${col},${z.kind === "poison" ? 0.22 : 0.35})`;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
        if (z.kind === "fire") drawBurn(ctx, z.x + Math.sin(this.time * 3 + z.x) * z.r * 0.4, z.y + z.r * 0.3, 1.1, this.time);
      }
      ctx.restore();
    }
  }

  drawHazards(g) {
    const ctx = this.ctx;
    for (const h of g.hazards) {
      if (h.delay > 1.15) continue; // lange Ketten (Todeskreuz) zeigen nur, was gleich kommt
      const prog = clamp(1 - h.delay / Math.min(h.maxDelay || 1, 1.15), 0, 1);
      const col = h.color || "#ff4a3a";
      ctx.save();
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      if (h.shape === "circle") {
        if (!this.visible(h.x, h.y, h.r)) { ctx.restore(); continue; }
        ctx.globalAlpha = h.friendly ? 0.1 : 0.16;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = h.friendly ? 0.22 : 0.32;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r * prog, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.stroke();
        if (h.meteor) {
          const fall = (1 - prog) * 420;
          drawProjectile(ctx, "proj_fireball", h.x + fall * 0.4, h.y - fall, Math.PI * 0.62, 50 + h.r * 0.25, this.time);
        }
        // Mörsergranate: fliegt im Bogen vom Kobold zum Einschlagkreis
        if (h.lob) {
          const k = clamp(1 - h.delay / h.maxDelay, 0, 1);
          const lx = h.lob.x + (h.x - h.lob.x) * k, ly = h.lob.y + (h.y - h.lob.y) * k - Math.sin(k * Math.PI) * 240;
          ctx.globalAlpha = 1;
          drawProjectile(ctx, "proj_grenade", lx, ly, this.time * 8, 22, this.time);
        }
        // Schwertregen: Klinge fällt von oben
        if (h.sword) {
          const fall = (1 - prog) * 420;
          ctx.globalAlpha = 1;
          ctx.save(); ctx.translate(h.x, h.y - fall);
          ctx.fillStyle = "#c9c3d1"; ctx.beginPath(); ctx.moveTo(-6, -70); ctx.lineTo(6, -70); ctx.lineTo(4, -6); ctx.lineTo(0, 4); ctx.lineTo(-4, -6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#8a8396"; ctx.fillRect(-16, -78, 32, 7);
          ctx.fillStyle = "#2a2632"; ctx.fillRect(-4, -96, 8, 18);
          ctx.restore();
        }
        if (h.boulder) {
          const fall = (1 - prog) * 480;
          drawObstacle(ctx, { x: h.x, y: h.y - fall, r: 36, sprite: "rock" }, this.biomeId);
        }
      } else if (h.shape === "line") {
        const a = Math.atan2(h.y2 - h.y, h.x2 - h.x);
        const len = Math.hypot(h.x2 - h.x, h.y2 - h.y);
        ctx.translate(h.x, h.y);
        ctx.rotate(a);
        ctx.globalAlpha = 0.16;
        ctx.fillRect(0, -h.w / 2, len, h.w);
        ctx.globalAlpha = 0.34;
        ctx.fillRect(0, -h.w / 2, len * prog, h.w);
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -h.w / 2, len, h.w);
      } else if (h.shape === "ring") {
        ctx.globalAlpha = 0.2;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.arc(h.x, h.y, h.rIn, 0, Math.PI * 2, true); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawTeleporter(g) {
    const t = g.teleporter;
    if (t.state === "locked") return;
    const ctx = this.ctx;
    if (t.state === "charging") {
      ctx.save();
      ctx.strokeStyle = "rgba(217,71,58,0.55)";
      ctx.setLineDash([18, 14]);
      ctx.lineDashOffset = -this.time * 30;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(t.x, t.y, TELEPORTER_RADIUS, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(217,71,58,0.05)";
      ctx.fill();
      ctx.strokeStyle = "#f0a33c";
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(t.x, t.y, 86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t.charge); ctx.stroke();
      ctx.restore();
    }
    if (this.visible(t.x, t.y, 140)) drawTeleporterFlat(ctx, t, this.time);
  }
  drawInteractables(g) {
    const p = g.player;
    for (const o of g.interactables) {
      if (Math.abs(o.x - p.x) < 900 && Math.abs(o.y - p.y) < 700) o.seen = true;
      if (this.visible(o.x, o.y, 100)) drawInteractable(this.ctx, o, this.time);
    }
  }
  drawPrices(g) {
    const ctx = this.ctx;
    const p = g.player;
    ctx.save();
    ctx.font = `16px ${FONT}`;
    ctx.textAlign = "center";
    for (const o of g.interactables) {
      if (o.used || Math.abs(o.x - p.x) > 340 || Math.abs(o.y - p.y) > 300) continue;
      const price = priceOf(g, o);
      const label = price ? `${price}` : INTERACT_INFO[o.type].name;
      const y = o.y - (o.type.endsWith("Shrine") || o.type === "sacrificeAltar" ? 100 : 48);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(10,9,13,0.9)";
      ctx.strokeText(label, o.x, y);
      ctx.fillStyle = price && p.gold < price ? "#ff8a6a" : "#f5cf4a";
      ctx.fillText(label, o.x, y);
    }
    ctx.restore();
  }

  drawWalls(g) {
    const ctx = this.ctx;
    for (const w of g.walls) {
      const a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      ctx.save();
      ctx.translate(w.x1, w.y1);
      ctx.rotate(a);
      ctx.globalAlpha = Math.min(1, w.t / 0.4);
      ctx.fillStyle = "#5b5146";
      ctx.fillRect(0, -w.w / 2, len, w.w);
      ctx.fillStyle = "#7a6d5d";
      for (let x = 0; x < len; x += 28) ctx.fillRect(x + 2, -w.w / 2 + 3, 24, w.w / 2 - 4);
      ctx.strokeStyle = "#1a1612";
      ctx.lineWidth = 3;
      ctx.strokeRect(0, -w.w / 2, len, w.w);
      ctx.restore();
    }
  }

  drawPickups(g) {
    const ctx = this.ctx;
    for (const k of g.pickups) {
      if (!this.visible(k.x, k.y, 30)) continue;
      if (k.type === "gold") {
        drawCoin(ctx, k.x, k.y, 12 + Math.min(8, Math.log2(1 + k.value) * 1.3));
      } else if (k.type === "heal") {
        drawHealOrb(ctx, k.x, k.y);
      } else if (k.type === "item") {
        const def = ITEMS[k.id];
        const col = RARITY[def.rarity].color;
        const bob = Math.sin(this.time * 4 + k.x) * 4;
        ctx.save();
        ctx.translate(k.x, k.y - 14 + bob);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath(); ctx.ellipse(0, 22 - bob, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#0a090d";
        ctx.fillRect(-13, -13, 26, 26);
        ctx.fillStyle = col;
        ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(-10, -10, 20, 5);
        ctx.restore();
        // Lichtsäule, damit Items auch zwischen Gegnern auffallen
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = col;
        ctx.fillRect(k.x - 3, k.y - 120, 6, 104);
        ctx.restore();
      } else if (k.type === "equipment") {
        const bob = Math.sin(this.time * 3 + k.y) * 3;
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath(); ctx.ellipse(k.x, k.y + 16, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#f0a33c"; ctx.beginPath(); ctx.arc(k.x, k.y - 6 + bob, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#2a2632"; ctx.beginPath(); ctx.arc(k.x, k.y - 6 + bob, 17, 0, Math.PI * 2); ctx.fill();
        drawPixelIcon(ctx, k.id, k.x - 13, k.y - 19 + bob, 26);
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#f0a33c";
        ctx.fillRect(k.x - 3, k.y - 120, 6, 100);
        ctx.restore();
      }
    }
  }

  // ── Figuren (nach y sortiert, damit vorne über hinten liegt) ──────────────
  drawActors(g) {
    const list = [];
    for (const o of g.obstacles) if (this.visible(o.x, o.y, o.r * 2)) list.push({ y: o.y + o.r * 0.4, o, kind: "obstacle" });
    for (const e of g.enemies) if (this.visible(e.x, e.y - (e.jumpH || 0), e.r * 3)) list.push({ y: e.y, e, kind: "enemy" });
    for (const al of g.allies) if (this.visible(al.x, al.y, 40)) list.push({ y: al.y, a: al, kind: "ally" });
    list.push({ y: g.player.y, kind: "player" });
    list.sort((a, b) => a.y - b.y);
    // Schatten zuerst, damit kein Schatten über einer Figur liegt
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    for (const it of list) {
      if (it.kind === "enemy") { const e = it.e; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * 0.9, e.r * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
      if (it.kind === "player") { const p = g.player; ctx.beginPath(); ctx.ellipse(p.x, p.y + 20, 18, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const it of list) {
      if (it.kind === "obstacle") drawObstacle(ctx, it.o, g.biome.id);
      else if (it.kind === "enemy") this.drawEnemy(g, it.e);
      else if (it.kind === "ally") this.drawAlly(g, it.a);
      else this.drawPlayer(g);
    }
  }

  drawEnemy(g, e) {
    if (e.isBoss) return this.drawBoss(g, e);
    const ctx = this.ctx;
    const size = e.r * 2.7;
    const spawnK = Math.min(1, e.spawnT / 0.25);
    ctx.save();
    ctx.globalAlpha = spawnK;

    // Ansturm-Bahn sichtbar machen
    if (e.state === "aim") {
      ctx.strokeStyle = "rgba(255,90,60,0.6)";
      ctx.lineWidth = e.r * 1.2;
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.aimAngle) * 460, e.y + Math.sin(e.aimAngle) * 460); ctx.stroke();
      ctx.globalAlpha = spawnK;
    }
    if (e.elite) {
      ctx.lineWidth = 3;
      e.affixes.forEach((a, i) => {
        ctx.strokeStyle = eliteColor(a);
        ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * (1.05 + i * 0.2), e.r * (0.38 + i * 0.08), 0, 0, Math.PI * 2); ctx.stroke();
      });
    }
    const scaleIn = e.state === "fuse" ? 1 + Math.sin(this.time * 30) * 0.08 : 1;
    if (e.hidden) { drawMound(ctx, e.x, e.y + e.r * 0.5, e.r * 1.2, this.time, false); ctx.restore(); return; }
    const p = { t: this.time + e.uid * 0.37, move: e.moving, atk: e.attackAnimT < 0.45 ? e.attackAnimT / 0.45 : -1, pose: e.state };
    const overlay = e.flash > 0 ? { color: "#ffffff", alpha: 0.75 } : e.state === "fuse" && Math.sin(this.time * 30) > 0 ? { color: "#ff5a3a", alpha: 0.35 } : null;
    drawFigure(ctx, { kind: "enemy", id: e.isEgg ? "egg" : e.type }, e.x, e.y + e.r * 0.9, size * scaleIn, e.facing, p, overlay, this.dpr * this.zoom);
    if (e.freezeT > 0) drawIceBlock(ctx, e.x, e.y + e.r * 0.9, size * 0.75, size * 0.8);
    if (e.burnT > 0) drawBurn(ctx, e.x + Math.sin(this.time * 7 + e.uid) * e.r * 0.4, e.y - e.r * 0.6, 1.3, this.time);
    ctx.restore();

    if (e.champion) {
      const w = 90;
      const y = e.y - size - 10;
      ctx.fillStyle = "rgba(10,9,13,0.9)";
      ctx.fillRect(e.x - w / 2 - 2, y - 2, w + 4, 9);
      ctx.fillStyle = "#f5cf4a";
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 5);
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(10,9,13,0.9)";
      ctx.strokeText("Champion", e.x, y - 6);
      ctx.fillStyle = "#f5cf4a";
      ctx.fillText("Champion", e.x, y - 6);
    } else if (e.hp < e.maxHp && !e.isEgg) {
      const w = e.elite ? 46 : 34;
      const y = e.y - size + e.r * 0.4;
      ctx.fillStyle = "rgba(10,9,13,0.85)";
      ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 6);
      ctx.fillStyle = e.elite ? eliteColor(e.elite) : "#d9473a";
      ctx.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
      if (e.poison?.length) { ctx.fillStyle = "#9be05a"; ctx.fillRect(e.x - w / 2, y + 5, Math.min(w, e.poison.length * 4), 2); }
    }
    if (e.isEgg) {
      ctx.fillStyle = "#f5cf4a";
      ctx.font = `14px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(Math.ceil(e.hatchT), e.x, e.y - e.r - 14);
    }
  }
  drawBoss(g, e) {
    const ctx = this.ctx;
    const size = e.r * 2.7;
    const lift = e.jumpH || 0;
    // Schatten am Boden (wird beim Sprung kleiner)
    const shadowK = 1 - Math.min(0.6, lift / 600);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * 1.1 * shadowK, e.r * 0.36 * shadowK, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    if (e.introT > 0 && e.bossId !== "thunderwing") {
      // Auftritt: wächst aus dem Boden
      const k = clamp(1 - e.introT / 2.2, 0, 1);
      ctx.translate(e.x, e.y + e.r);
      ctx.scale(1, 0.15 + 0.85 * k);
      ctx.translate(-e.x, -(e.y + e.r));
    }
    if (e.fade) ctx.globalAlpha = 0.35;
    if (e.spinning) {
      ctx.translate(e.x, e.y - size * 0.35);
      ctx.rotate(this.time * 14);
      ctx.translate(-e.x, -(e.y - size * 0.35));
    }
    if (e.hidden) { ctx.restore(); drawMound(ctx, e.x, e.y + e.r * 0.4, e.r * 1.3, this.time, g.biome.id === "lava"); return; }
    if (e.trail?.length > 1) drawWormBody(ctx, e.trail, e.r, this.time);
    const p = { t: this.time + e.uid * 0.37, move: e.pose === "run" || e.pose === "walk", atk: e.pose === "attack" ? (this.time * 2.2) % 1 : -1, pose: e.pose };
    drawFigure(ctx, { kind: "boss", id: e.bossId }, e.x, e.y + e.r * 0.9 - lift, size, e.facing, p, e.flash > 0 ? { color: "#ffffff", alpha: 0.6 } : null, this.dpr * this.zoom);
    ctx.restore();
    if (e.phase2) {
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(this.time * 6) * 0.1;
      ctx.strokeStyle = "#ff5a4a";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * 1.25, e.r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  drawAlly(g, al) {
    const ctx = this.ctx;
    const fade = Math.min(1, (al.life - al.t) / 0.5);
    ctx.save();
    ctx.globalAlpha = fade;
    if (al.kind === "decoy") {
      drawFigure(ctx, { kind: "decoy" }, al.x, al.y + 22, 56, 1, { t: this.time });
    } else if (al.kind === "turret") {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.ellipse(al.x, al.y + 14, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2a2632"; ctx.fillRect(al.x - 14, al.y - 6, 28, 20);
      ctx.fillStyle = "#5ee0ff"; ctx.fillRect(al.x - 10, al.y - 2, 20, 4);
      ctx.save();
      ctx.translate(al.x, al.y - 10);
      ctx.rotate(al.aim || 0);
      ctx.fillStyle = "#37323f"; ctx.fillRect(-8, -7, 16, 14);
      ctx.fillStyle = "#8a8098"; ctx.fillRect(6, -3, 16, 6);
      ctx.restore();
    } else if (al.kind === "skeleton") {
      const at = al.attackT ?? 9;
      drawFigure(ctx, { kind: "enemy", id: "skeletonwarrior" }, al.x, al.y + 20, 56, al.facing,
        { t: this.time + al.uid * 0.37, move: al.moving, atk: at < 0.4 ? at / 0.4 : -1, pal: { bone: "#cfeeff", dark: "#8ec6e6", eye: "#5ee0ff", shield: "#3f7fd6" } });
    }
    ctx.restore();
  }
  drawPlayer(g) {
    const p = g.player;
    const ctx = this.ctx;
    if (!p.alive) return;
    const blink = p.buffs.invuln > 0 && !p.buffs.bubble && Math.floor(this.time * 16) % 2 === 0;
    const lift = p.dash?.leap ? Math.sin((p.dash.t / p.dash.dur) * Math.PI) * 90 : 0;

    // Glutaura (unter allem anderen)
    const auraId = p.weapons.hoellenherz ? "hoellenherz" : "glutaura";
    const aura = p.weapons[auraId] && p.weaponState[auraId];
    if (aura?.r) {
      ctx.save();
      const flick = 0.5 + Math.sin(this.time * 9) * 0.08;
      ctx.globalAlpha = 0.14 * flick * 2;
      ctx.fillStyle = "#ff6a3a";
      ctx.beginPath(); ctx.arc(p.x, p.y, aura.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#ff9a5a";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -this.time * 40;
      ctx.beginPath(); ctx.arc(p.x, p.y, aura.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // Kreisende Waffen
    for (const id of ["feuerkugeln", "sonnenkranz", "kriegsrad"]) {
      const orbs = (p.weapons[id] && p.weaponState[id]?.orbs) || [];
      const sun = id === "sonnenkranz";
      for (const o of orbs) {
        if (id === "kriegsrad") this.drawBoomerang({ x: o.x, y: o.y, r: 18 });
        else if (sun) { ctx.fillStyle = "#ffd84a"; ctx.beginPath(); ctx.arc(o.x, o.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#fff3a0"; ctx.beginPath(); ctx.arc(o.x - 3, o.y - 3, 6, 0, Math.PI * 2); ctx.fill(); }
        else drawProjectile(ctx, "proj_fireball", o.x, o.y, this.time * 6, 30, this.time);
      }
    }

    // Orbitalklingen
    if (p.items.orbitalklinge) {
      const n = p.items.orbitalklinge;
      for (let i = 0; i < n; i++) {
        const ang = (p.orbitAngle || 0) + (Math.PI * 2 * i) / n;
        drawProjectile(ctx, "proj_shuriken", p.x + Math.cos(ang) * 95, p.y + Math.sin(ang) * 95, 0, 30, this.time);
      }
    }
    // Klingenwirbel
    if (p.spin) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spinAngle || 0);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#cfe8ff";
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.spin.r, -12); ctx.lineTo(p.spin.r, 12); ctx.fill();
      }
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, p.spin.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (p.items.frostfell) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#a8e4ff";
      ctx.beginPath(); ctx.arc(p.x, p.y, 220, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    if (!blink) {
      const at = p.attackAnimT;
      drawFigure(ctx, { kind: "hero", id: g.kitId, skin: this.skin }, p.x, p.y + 22 - lift, 60, p.facing,
        { t: this.time, move: p.moving, atk: at < 0.22 ? at / 0.22 : -1 }, p.hurtFlash > 0 ? { color: "#ff3a2a", alpha: 0.55 } : null, this.dpr * this.zoom);
    }

    if (p.buffs.bubble > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(120,200,255,0.8)";
      ctx.fillStyle = "rgba(120,200,255,0.12)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (p.buffs.guard > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(230,220,190,0.7)";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 34, p.aim - 0.9, p.aim + 0.9); ctx.stroke();
      ctx.restore();
    }
    if (p.shield > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(120,200,255,0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 32, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (p.status.freezeT > 0) drawIceBlock(ctx, p.x, p.y + 22, 48, 58);
    if (p.status.burnT > 0) drawBurn(ctx, p.x + Math.sin(this.time * 7) * 10, p.y - 24, 1.3, this.time);

    // Zielhilfe: kurze Linie in Schussrichtung
    ctx.save();
    ctx.strokeStyle = "rgba(240,230,210,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aim) * 34, p.y + Math.sin(p.aim) * 34);
    ctx.lineTo(p.x + Math.cos(p.aim) * 50, p.y + Math.sin(p.aim) * 50);
    ctx.stroke();
    ctx.restore();

    this.drawPlayerBar(p, lift);
  }

  // Kleine Lebensleiste direkt unter der Figur — man muss im Getümmel nicht nach oben links schauen
  drawPlayerBar(p, lift) {
    const ctx = this.ctx;
    const w = 46, h = 5;
    const x = p.x - w / 2, y = p.y + 27 - lift;
    const hpK = clamp(p.hp / p.stats.maxHp, 0, 1);
    ctx.fillStyle = "rgba(10,9,13,0.85)";
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = "#3a1a1e";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hpK < 0.3 ? (Math.floor(this.time * 6) % 2 ? "#ff5a4a" : "#c7392f") : "#7be06b";
    ctx.fillRect(x, y, Math.round(w * hpK), h);
    if (p.shield > 0 && p.stats.shieldMax > 0) {
      ctx.fillStyle = "#5ec8ff";
      ctx.fillRect(x, y + h - 2, Math.round(w * clamp(p.shield / p.stats.maxHp, 0, 1)), 2);
    }
  }

  drawProjectiles(g) {
    const ctx = this.ctx;
    for (const b of g.pBullets) {
      if (!this.visible(b.x, b.y, 20)) continue;
      if (b.look === "dagger") { this.drawDagger(b); continue; }
      if (b.look === "boomerang") { this.drawBoomerang(b); continue; }
      drawProjectile(ctx, b.sprite, b.x, b.y, Math.atan2(b.vy, b.vx), b.r * 3.2, this.time);
    }
    for (const b of g.eBullets) {
      if (!this.visible(b.x, b.y, 20)) continue;
      drawProjectile(ctx, b.sprite, b.x, b.y, Math.atan2(b.vy, b.vx), b.r * 2.8 * (b.scale || 1), this.time);
    }
  }
  // Waffen ohne eigenes Bild: als Pixelform gezeichnet (Klinge + Griff, Bumerang als Winkel)
  drawDagger(b) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = "#0a090d";
    ctx.fillRect(-13, -4, 28, 8);
    ctx.fillStyle = "#e8e2d4";
    ctx.fillRect(-2, -2, 15, 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-2, -2, 15, 1);
    ctx.fillStyle = "#c9a06b";
    ctx.fillRect(-4, -4, 2, 8);
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(-11, -1.5, 7, 3);
    ctx.restore();
  }

  drawBoomerang(b) {
    const ctx = this.ctx;
    const s = b.r / 13;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(this.time * 16);
    ctx.scale(s, s);
    ctx.lineCap = "square";
    ctx.strokeStyle = "#0a090d";
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(0, 0); ctx.lineTo(14, -10); ctx.stroke();
    ctx.strokeStyle = "#c9a06b";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = "#f0d3a0";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-13, -11); ctx.lineTo(0, -2); ctx.lineTo(13, -11); ctx.stroke();
    ctx.restore();
  }

  drawFx(g) {
    const ctx = this.ctx;
    const fx = g.fx;
    for (const s of fx.slashes) {
      const k = s.t / s.life;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      // Bogen, der beim Ausholen von innen nach außen wächst
      const reach = s.len * Math.min(1, 0.35 + k * 2.2);
      ctx.fillStyle = "rgba(232,226,212,0.28)";
      ctx.beginPath();
      ctx.moveTo(0, -s.half * 0.4);
      ctx.quadraticCurveTo(reach * 0.55, -s.half * 1.6, reach, 0);
      ctx.quadraticCurveTo(reach * 0.55, s.half * 0.7, 0, s.half * 0.4);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -s.half * 0.4);
      ctx.quadraticCurveTo(reach * 0.55, -s.half * 1.6, reach, 0);
      ctx.stroke();
      ctx.restore();
    }
    for (const r of fx.rings) {
      const k = r.t / r.life;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.6 + 0.4 * k), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const p of fx.particles) {
      if (!this.visible(p.x, p.y)) continue;
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const b of fx.bolts) {
      ctx.save();
      ctx.globalAlpha = 1 - b.t / b.life;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      b.points.forEach((pt, i) => {
        const jx = i === 0 || i === b.points.length - 1 ? 0 : (Math.random() - 0.5) * 18;
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x + jx, pt.y + jx * 0.5);
      });
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    const showDmg = getSettings().damageNumbers;
    for (const t of fx.texts) {
      if (!this.visible(t.x, t.y) || (t.dmg && !showDmg)) continue;
      const k = t.t / t.life;
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `${t.size}px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(10,9,13,0.9)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  // ── Bildschirm: Zeiger, Minikarte, Zustandsfärbung ────────────────────────
  drawPointers(g) {
    const ctx = this.ctx;
    const targets = [];
    const t = g.teleporter;
    if (t.discovered && t.state !== "locked") targets.push({ x: t.x, y: t.y, color: t.state === "ready" ? "#86d05f" : t.state === "charging" ? "#d9473a" : "#f0a33c" });
    if (g.boss && !g.boss.dead) targets.push({ x: g.boss.x, y: g.boss.y, color: "#ff5a4a" });
    for (const tg of targets) {
      const sx = (tg.x - this.cam.x) * this.zoom;
      const sy = (tg.y - this.cam.y) * this.zoom;
      const m = 46;
      if (sx > m && sx < this.w - m && sy > m && sy < this.h - m) continue;
      const cx = this.w / 2, cy = this.h / 2;
      const ang = Math.atan2(sy - cy, sx - cx);
      const px = clamp(cx + Math.cos(ang) * this.w, m, this.w - m);
      const py = clamp(cy + Math.sin(ang) * this.h, m, this.h - m);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.fillStyle = tg.color;
      ctx.strokeStyle = "#0a090d";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
    }
  }

  drawMinimap(g) {
    if (g.biome.final) return;
    const ctx = this.ctx;
    const size = this.minimapSize;
    const pad = 16;
    const x0 = this.w - size - pad, y0 = this.h - size - pad - 4;
    const k = size / Math.max(g.world.w, g.world.h);
    ctx.save();
    ctx.fillStyle = "rgba(10,9,13,0.78)";
    ctx.fillRect(x0 - 4, y0 - 4, size + 8, size + 8);
    ctx.fillStyle = "rgba(31,28,37,0.9)";
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = "rgba(239,230,210,0.12)";
    for (const o of g.obstacles) ctx.fillRect(x0 + o.x * k - 1, y0 + o.y * k - 1, 2, 2);
    for (const o of g.interactables) {
      if (!o.seen || o.used) continue;
      ctx.fillStyle = o.type === "bigChest" ? "#86d05f" : o.type === "equipChest" ? "#f0a33c" : o.type === "chest" ? "#f5cf4a" : o.type === "curseShrine" ? "#a07bff" : o.type === "sacrificeAltar" ? "#d9473a" : "#5ec8ff";
      ctx.fillRect(x0 + o.x * k - 2, y0 + o.y * k - 2, 4, 4);
    }
    ctx.fillStyle = "rgba(217,71,58,0.85)";
    for (const e of g.enemies) {
      if (!e.aggro) continue;
      const big = e.isBoss || e.champion;
      if (e.champion) ctx.fillStyle = "#f5cf4a";
      ctx.fillRect(x0 + e.x * k - (big ? 2 : 1), y0 + e.y * k - (big ? 2 : 1), big ? 5 : 2, big ? 5 : 2);
      if (e.champion) ctx.fillStyle = "rgba(217,71,58,0.85)";
    }
    const t = g.teleporter;
    if (t.discovered) {
      ctx.fillStyle = t.state === "ready" ? "#86d05f" : "#d9473a";
      ctx.fillRect(x0 + t.x * k - 4, y0 + t.y * k - 4, 8, 8);
      ctx.strokeStyle = "#0a090d"; ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + t.x * k - 4, y0 + t.y * k - 4, 8, 8);
    }
    // Sichtfenster + Spieler
    ctx.strokeStyle = "rgba(239,230,210,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + this.cam.x * k, y0 + this.cam.y * k, this.viewW * k, this.viewH * k);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x0 + g.player.x * k - 3, y0 + g.player.y * k - 3, 6, 6);
    ctx.restore();
  }

  drawStatusTint(g) {
    const p = g.player;
    const ctx = this.ctx;
    // Blutmond: roter Schleier; Fluch: violetter Rand
    if (g.horde?.blood > 0) {
      ctx.save();
      const fade = Math.min(1, g.horde.blood / 2, (30 - g.horde.blood) / 2 + 0.2);
      ctx.globalAlpha = 0.13 * fade * (0.85 + Math.sin(this.time * 2) * 0.15);
      ctx.fillStyle = "#b0101a";
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    if (g.curse) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#5a2a9a";
      ctx.lineWidth = 18;
      ctx.strokeRect(0, 0, this.w, this.h);
      ctx.restore();
    }
    const low = p.hp / p.stats.maxHp;
    if (low < 0.3 && p.alive) {
      ctx.save();
      ctx.globalAlpha = (0.3 - low) * 1.6 * (0.7 + Math.sin(this.time * 5) * 0.3);
      ctx.strokeStyle = "#d9473a";
      ctx.lineWidth = 26;
      ctx.strokeRect(0, 0, this.w, this.h);
      ctx.restore();
    }
  }
}
