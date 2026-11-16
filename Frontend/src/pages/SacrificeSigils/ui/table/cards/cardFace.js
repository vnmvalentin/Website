// ui/table/cards/cardFace.js — zeichnet eine Karte auf ein Canvas (Vorder- und Rückseite), als Textur für den 3D-Tisch.
//
// Gleicher Aufbau wie der DOM-Rahmen (ui/card/Card.jsx): Name und Kosten oben, Zeichnung, darunter Sigils, unten
// Angriff (Klaue) links und Leben (Wachsherz) rechts. Seltenheit über das Rahmenmaterial. Die Werte unten sind
// bewusst größer als im DOM-Rahmen: die Karte liegt schräg auf dem Tisch und muss aus der Entfernung lesbar sein.
// Entwurfsmaß 512 × 717 (5:7); andere Größen skalieren das Ganze.
import { CARDS } from "../../../engine/cards.js";
import { parseSigil } from "../../../engine/sigils/index.js";
import { artDataUri } from "../../../art/procedural.js";
import { iconNow, loadIcons } from "./iconImages.js";

export const FACE_W = 512;
export const FACE_H = 717;
const PAD = 24;
const RADIUS = 26;
const INK = "#1a1612";
const TITLE = "'IM Fell English SC', 'IM Fell English', Georgia, serif";
const NUM = "'IM Fell English', Georgia, serif";
const FONT_FAMILIES = ["IM Fell English SC", "IM Fell English"];

/** @type {Map<string, Promise<HTMLImageElement | null>>} */
const artCache = new Map();

/** @param {string} url @returns {Promise<HTMLImageElement | null>} */
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Zeichnung einer Karte: Datei aus public/media/cards, sonst das prozedurale Bild. @param {any} def */
function loadArt(def) {
  const hit = artCache.get(def.id);
  if (hit) return hit;
  const p = loadImage(`/media/cards/${def.id}.webp`)
    .then((img) => img || loadImage(`/media/cards/${def.id}.png`))
    .then((img) => img || loadImage(artDataUri(def)));
  artCache.set(def.id, p);
  return p;
}

let fontsReady = null;
/** Die Kartenschriften müssen geladen sein, bevor ins Canvas geschrieben wird (sonst steht dort die Ersatzschrift). */
function ensureFonts() {
  if (!fontsReady) {
    fontsReady = (async () => {
      if (typeof document === "undefined" || !document.fonts?.load) return;
      // Die Hülle hängt das Schriften-Stylesheet erst beim Start ein. Solange es nicht da ist, kennt das Dokument
      // die Familien nicht und fonts.load() wäre sofort „fertig“ — also erst auf die Familien warten.
      const known = (family) => [...document.fonts].some((f) => f.family.replace(/["']/g, "") === family);
      const t0 = performance.now();
      while (!FONT_FAMILIES.every(known) && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 50));
      await Promise.race([
        Promise.all(FONT_FAMILIES.map((family) => document.fonts.load(`48px "${family}"`, "Aä1ß"))),
        new Promise((r) => setTimeout(r, 4000)),
      ]);
    })().catch(() => {});
  }
  return fontsReady;
}

/** Kleiner Zufall mit Startwert (Papierkorn je Karte gleich). @param {string} text */
function seeded(text) {
  let a = 2166136261;
  for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 16777619);
  a >>>= 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Icon in eine Höhe einpassen, linke obere Ecke bei (x, y). Gibt die gezeichnete Breite zurück. */
function drawIcon(ctx, key, x, y, h) {
  const img = iconNow(key);
  if (!img) return 0;
  const w = (img.naturalWidth / img.naturalHeight) * h;
  ctx.drawImage(img, x, y, w, h);
  return w;
}

function iconWidth(key, h) {
  const img = iconNow(key);
  return img ? (img.naturalWidth / img.naturalHeight) * h : 0;
}

/** Pergament mit Lichtfleck, Korn und dunklem Rand. */
function paper(ctx, id) {
  ctx.fillStyle = "#d9c9a3";
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  let g = ctx.createRadialGradient(FACE_W * 0.25, FACE_H * 0.1, 0, FACE_W * 0.25, FACE_H * 0.1, FACE_W * 0.9);
  g.addColorStop(0, "rgba(255,255,255,0.3)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  g = ctx.createRadialGradient(FACE_W * 0.8, FACE_H * 0.95, 0, FACE_W * 0.8, FACE_H * 0.95, FACE_W * 0.95);
  g.addColorStop(0, "rgba(110,80,30,0.3)");
  g.addColorStop(1, "rgba(110,80,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  const r = seeded(id);
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = `rgba(${90 + r() * 40},${66 + r() * 30},${34 + r() * 20},${0.04 + r() * 0.1})`;
    ctx.fillRect(r() * FACE_W, r() * FACE_H, 1 + r() * 2.4, 1 + r() * 2.4);
  }
  // Fasern
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const x = r() * FACE_W;
    const y = r() * FACE_H;
    ctx.strokeStyle = `rgba(120,95,55,${0.06 + r() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 30, x + (r() - 0.5) * 110, y + (r() - 0.5) * 50);
    ctx.stroke();
  }
  // Rand dunkelt nach (Schatten eines Rahmens, der außerhalb der Karte liegt)
  ctx.save();
  ctx.shadowColor = "rgba(95,65,25,0.7)";
  ctx.shadowBlur = 46;
  ctx.lineWidth = 40;
  ctx.strokeStyle = "#000";
  ctx.strokeRect(-20, -20, FACE_W + 40, FACE_H + 40);
  ctx.restore();
}

/** Rahmen nach Seltenheit. Gibt die Rahmenbreite zurück. */
function frame(ctx, rarity) {
  const corner = (flip) => {
    // Messingbeschlag: Winkel in der Ecke mit Nietkopf
    ctx.save();
    if (flip) { ctx.translate(FACE_W, 0); ctx.scale(-1, 1); }
    const s = 78;
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, "#d4b27a");
    g.addColorStop(1, "#6b5230");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(s, 0); ctx.lineTo(s, s * 0.3); ctx.lineTo(s * 0.3, s * 0.3); ctx.lineTo(s * 0.3, s); ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(60,40,15,0.7)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#e8cf9c";
    ctx.beginPath();
    ctx.arc(s * 0.15, s * 0.15, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  if (rarity === "uncommon") {
    const b = 17;
    ctx.save();
    roundRect(ctx, b / 2, b / 2, FACE_W - b, FACE_H - b, RADIUS - b / 2);
    ctx.lineWidth = b;
    ctx.strokeStyle = "#5a3d24";
    ctx.stroke();
    // Holzmaserung im Rahmen
    ctx.clip();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = i % 3 ? "rgba(110,76,46,0.55)" : "rgba(40,26,14,0.5)";
      const o = i * 4 - 20;
      ctx.beginPath();
      ctx.moveTo(o, 0); ctx.lineTo(o + 16, FACE_H);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#d9c9a3";
    return b;
  }
  if (rarity === "rare" || rarity === "legendary") {
    const b = rarity === "legendary" ? 18 : 15;
    roundRect(ctx, b / 2, b / 2, FACE_W - b, FACE_H - b, RADIUS - b / 2);
    ctx.lineWidth = b;
    const g = ctx.createLinearGradient(0, 0, FACE_W, FACE_H);
    if (rarity === "legendary") { g.addColorStop(0, "#e2c27c"); g.addColorStop(0.5, "#b88f48"); g.addColorStop(1, "#d8b56c"); }
    else { g.addColorStop(0, "#c4a069"); g.addColorStop(0.5, "#96743f"); g.addColorStop(1, "#b08d57"); }
    ctx.strokeStyle = g;
    ctx.stroke();
    roundRect(ctx, b, b, FACE_W - b * 2, FACE_H - b * 2, RADIUS - b);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#5d4424";
    ctx.stroke();
    corner(false);
    corner(true);
    return b;
  }
  const b = 6;
  roundRect(ctx, b / 2, b / 2, FACE_W - b, FACE_H - b, RADIUS - b / 2);
  ctx.lineWidth = b;
  ctx.strokeStyle = "#8f7b55";
  ctx.stroke();
  return b;
}

/** Text einpassen: Schrift verkleinern, bis er in die Breite passt. Gibt die Schriftgröße zurück. */
function fitFont(ctx, text, family, max, min, width) {
  let size = max;
  for (; size > min; size -= 2) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= width) break;
  }
  ctx.font = `${size}px ${family}`;
  return size;
}

/** Kosten oben rechts. Gibt die belegte Breite zurück. */
function drawCost(ctx, cost, right, top) {
  if (!cost || (cost.type === "blood" && cost.amount === 0)) return 0;
  if (cost.type === "blood") {
    const h = 50;
    const w = iconWidth("blood", h);
    const step = w * 0.82;
    const total = step * (cost.amount - 1) + w;
    for (let i = 0; i < cost.amount; i++) drawIcon(ctx, "blood", right - total + i * step, top, h);
    return total;
  }
  const key = cost.type === "bones" ? "bones" : cost.type === "salt" ? "salt" : "wax";
  const h = 46;
  ctx.font = `50px ${NUM}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  const text = String(cost.amount);
  const tw = ctx.measureText(text).width;
  ctx.fillText(text, right, top + 44);
  const iw = iconWidth(key, h);
  drawIcon(ctx, key, right - tw - iw - 4, top + 2, h);
  return tw + iw + 6;
}

/**
 * @typedef {{ wick?: number | null, stunned?: boolean, glued?: number, shield?: boolean, meta?: number | null }} FaceState
 *   Zustand einer Einheit auf dem Feld, der als Marke auf der Zeichnung steht
 * @typedef {{ card: any, attack?: number | null, health?: number | null, maxHealth?: number | null, auras?: string[], state?: FaceState }} FaceInfo
 *   card = aufgelöste Karte (baseId, cost, sigils, mods …); attack/health/maxHealth = Stand auf dem Feld, sonst Grundwerte
 */

/** Schlüssel für „sieht diese Karte noch gleich aus?“ — ändert er sich, wird das Bild neu gezeichnet. @param {FaceInfo} info */
export function faceKey(info) {
  const c = info.card;
  return JSON.stringify([c.baseId || c.id, c.mods || [], c.cost, c.sigils, c.tide ?? null, c.cursed || false,
    info.attack ?? null, info.health ?? null, info.maxHealth ?? null, info.auras || [], info.state || null]);
}

/** Kleines Papierschild mit Text auf der Zeichnung. Gibt die Breite zurück. */
function chip(ctx, text, x, y, { alignRight = false, bg = "#e6d8b6", fg = INK, size = 27 } = {}) {
  ctx.font = `${size}px ${TITLE}`;
  const w = ctx.measureText(text).width + 18;
  const h = size + 12;
  const left = alignRight ? x - w : x;
  ctx.fillStyle = bg;
  ctx.fillRect(left, y, w, h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#3a2d20";
  ctx.strokeRect(left, y, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + 9, y + h / 2 + 1);
  return w;
}

/** Marken auf der Zeichnung: Gezeiten-Bindung, Lagerfeuer, Kopie, Naht, Kerzendocht und Zustände der Einheit. */
function drawMarks(ctx, card, def, state, box) {
  const mods = card.mods || [];
  const tide = card.tide !== undefined ? card.tide : def.tide || null;
  if (mods.some((m) => m.kind === "fuse")) {
    // Naht der Verschmelzung quer durch die Zeichnung
    ctx.save();
    ctx.strokeStyle = "#3a2a1a";
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.moveTo(box.x + box.w / 2, box.y);
    ctx.lineTo(box.x + box.w / 2, box.y + box.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    for (let y = box.y + 24; y < box.y + box.h - 10; y += 46) {
      ctx.beginPath();
      ctx.moveTo(box.x + box.w / 2 - 16, y);
      ctx.lineTo(box.x + box.w / 2 + 16, y + 14);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (tide) {
    ctx.fillStyle = "#e6d8b6";
    ctx.fillRect(box.x + 10, box.y + 10, 52, 52);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#3a2d20";
    ctx.strokeRect(box.x + 10, box.y + 10, 52, 52);
    drawIcon(ctx, `tide|${tide}`, box.x + 14, box.y + 14, 44);
  }
  if (mods.some((m) => m.kind === "mark" && (m.mark === "copied" || m.mark === "mirrored"))) {
    chip(ctx, "Kopie", box.x + box.w - 10, box.y + 10, { alignRight: true, fg: "#8e1b1b" });
  }
  // oben rechts untereinander: Zustände der Einheit
  let y = box.y + 10;
  const stateChip = (text) => { chip(ctx, text, box.x + box.w - 10, y, { alignRight: true }); y += 46; };
  if (state.meta != null) stateChip(`Verwandlung ${state.meta}`);
  if (state.stunned) stateChip("setzt aus");
  if (state.glued > 0) stateChip(`Leim ${state.glued}`);
  if (state.shield) stateChip("Schild");
  // unten links: Lagerfeuer-Narbe
  const fire = mods.filter((m) => m.kind === "campfire").reduce((a, m) => ({ attack: a.attack + (m.attack || 0), health: a.health + (m.health || 0) }), { attack: 0, health: 0 });
  if (fire.attack > 0 || fire.health > 0) {
    chip(ctx, `+${fire.attack}/+${fire.health}`, box.x + 10, box.y + box.h - 50, { bg: "#5a2410", fg: "#fbe3b0" });
  }
  // unten rechts: Kerzendocht mit Zähler (bei 1 rot, bei 0 erloschen)
  if (state.wick != null) {
    const w = 92;
    const x = box.x + box.w - w - 10;
    const yy = box.y + box.h - 66;
    ctx.fillStyle = state.wick <= 0 ? "#3a3128" : state.wick <= 1 ? "#b3302a" : "#f2b54a";
    ctx.fillRect(x, yy, w, 56);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#3a2d20";
    ctx.strokeRect(x, yy, w, 56);
    drawIcon(ctx, "wax", x + 8, yy + 5, 46);
    ctx.font = `50px ${NUM}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = state.wick <= 1 ? "#fff2e0" : "#2a1a08";
    ctx.fillText(String(state.wick), x + w - 10, yy + 46);
  }
}

/** Alles laden, was die Karten brauchen (Schriften, Zeichnungen, Icons). @param {FaceInfo[]} infos */
export async function prepareFaces(infos) {
  const keys = ["claw", "heart", "blood", "bones", "wax", "salt"];
  const arts = [];
  for (const info of infos) {
    const def = CARDS[info.card.baseId] || CARDS[info.card.id] || info.card;
    arts.push(loadArt({ ...def, cursed: info.card.cursed || def.cursed }));
    for (const s of info.card.sigils || def.sigils || []) keys.push(`sigil|${s}`);
    for (const s of info.auras || []) keys.push(`aura|${s}`);
    const special = info.card.special ?? (typeof def.attack === "object" ? def.attack.special : null);
    if (special) keys.push(`special|${special}`);
    const tide = info.card.tide !== undefined ? info.card.tide : def.tide || null;
    if (tide) keys.push(`tide|${tide}`);
  }
  await Promise.all([ensureFonts(), loadIcons(keys), ...arts]);
}

/**
 * Vorderseite zeichnen. Vorher `prepareFaces` abwarten.
 * @param {FaceInfo} info @param {{ width?: number }} [opt]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderCardFace(info, opt = {}) {
  const width = opt.width || FACE_W;
  const k = width / FACE_W;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(FACE_H * k);
  const ctx = canvas.getContext("2d");
  ctx.scale(k, k);

  const card = info.card;
  const def = CARDS[card.baseId] || CARDS[card.id] || card;
  const rarity = def.rarity || "common";
  const cursed = card.cursed || def.cursed;
  const baseAttack = typeof def.attack === "number" ? def.attack : 0;
  const special = card.special ?? (typeof def.attack === "object" ? def.attack.special : null);
  const atk = info.attack ?? (typeof card.attack === "number" ? card.attack : baseAttack);
  const hp = info.health ?? card.health ?? def.health;
  const maxHp = info.maxHealth ?? hp;
  const sigils = card.sigils || def.sigils || [];
  const auras = (info.auras || []).filter((a) => !sigils.some((s) => parseSigil(s).id === parseSigil(a).id));
  const art = await loadArt({ ...def, cursed });

  // Alles außerhalb der runden Ecken bleibt durchsichtig (die Karte wird mit alphaTest ausgeschnitten)
  ctx.save();
  roundRect(ctx, 0, 0, FACE_W, FACE_H, RADIUS);
  ctx.clip();
  paper(ctx, def.id || card.baseId || "card");
  if (rarity === "legendary") {
    // Warmer Schimmer von unten statt der glimmenden Aura des DOM-Rahmens
    const g = ctx.createLinearGradient(0, FACE_H, 0, FACE_H * 0.55);
    g.addColorStop(0, "rgba(200,120,30,0.28)");
    g.addColorStop(1, "rgba(200,120,30,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FACE_W, FACE_H);
  }
  const b = frame(ctx, rarity);
  const left = PAD + b * 0.4;
  const right = FACE_W - PAD - b * 0.4;
  const top = PAD + b * 0.4;

  // ── Kopf: Kosten rechts, Name links (eine Zeile, notfalls kleiner) ──
  const costW = drawCost(ctx, card.cost || def.cost, right, top - 2);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const name = def.name || card.name || "";
  const nameW = right - left - (costW ? costW + 12 : 0);
  const size = fitFont(ctx, name, TITLE, 52, 30, nameW);
  ctx.fillText(name, left, top + 26 + size * 0.36);

  // ── Zeichnung ──
  const winY = top + 64;
  const winW = right - left;
  const winH = Math.round(winW * 0.76);
  ctx.fillStyle = "#cdbb8f";
  ctx.fillRect(left, winY, winW, winH);
  if (art) {
    // wie object-fit: cover
    const s = Math.max(winW / art.naturalWidth, winH / art.naturalHeight);
    const sw = winW / s;
    const sh = winH / s;
    ctx.drawImage(art, (art.naturalWidth - sw) / 2, (art.naturalHeight - sh) / 2, sw, sh, left, winY, winW, winH);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#3a2d20";
  ctx.strokeRect(left, winY, winW, winH);
  drawMarks(ctx, card, def, info.state || {}, { x: left, y: winY, w: winW, h: winH });

  // ── Sigils: eine Reihe unter der Zeichnung ──
  const all = [...sigils.slice(0, 4).map((s) => `sigil|${s}`), ...auras.slice(0, 2).map((s) => `aura|${s}`)];
  const bandTop = winY + winH + 12;
  const statH = 104;
  const bandH = FACE_H - PAD - b * 0.4 - statH - bandTop;
  if (all.length) {
    const gap = 8;
    const s = Math.min(bandH, 112, (winW - gap * (all.length - 1)) / all.length);
    let x = FACE_W / 2 - (s * all.length + gap * (all.length - 1)) / 2;
    const y = bandTop + (bandH - s) / 2;
    for (const key of all) {
      drawIcon(ctx, key, x, y, s);
      x += s + gap;
    }
  }

  // ── Werte: Angriff links, Leben rechts ──
  const base = FACE_H - PAD - b * 0.4 - 8;
  const numColor = (cls) => (cls === "up" ? "#5f5a0c" : cls === "down" ? "#b32a20" : INK);
  const atkCls = special ? "" : atk > baseAttack ? "up" : atk < baseAttack ? "down" : "";
  const hpCls = hp < maxHp ? "down" : hp > def.health ? "up" : hp < def.health ? "down" : "";
  ctx.textBaseline = "alphabetic";
  const cw = drawIcon(ctx, "claw", left - 2, base - 74, 74);
  ctx.textAlign = "left";
  if (special && info.attack == null) {
    drawIcon(ctx, `special|${special}`, left + cw + 6, base - 70, 66);
  } else {
    ctx.font = `110px ${NUM}`;
    ctx.fillStyle = numColor(atkCls);
    ctx.fillText(String(atk), left + cw + 2, base);
  }
  const hw = iconWidth("heart", 66);
  drawIcon(ctx, "heart", right - hw, base - 68, 66);
  ctx.font = `110px ${NUM}`;
  ctx.textAlign = "right";
  ctx.fillStyle = numColor(hpCls);
  ctx.fillText(String(hp), right - hw - 6, base);

  if (cursed) {
    // Tintenadern vom Rand her
    const r = seeded(`${def.id}cursed`);
    ctx.strokeStyle = "rgba(18,8,8,0.8)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const side = i % 4;
      let x = side === 0 ? 0 : side === 1 ? FACE_W : r() * FACE_W;
      let y = side === 2 ? 0 : side === 3 ? FACE_H : r() * FACE_H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let step = 0; step < 4; step++) {
        x += (FACE_W / 2 - x) * 0.14 + (r() - 0.5) * 50;
        y += (FACE_H / 2 - y) * 0.14 + (r() - 0.5) * 50;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  return canvas;
}

/**
 * Rückseite: dunkles Leder mit Messingrand, Ringen und Wachssiegel.
 * @param {{ width?: number, side?: boolean }} [opt]  side = Nebendeck (heller, rötlicher Rand)
 */
export async function renderCardBack(opt = {}) {
  await ensureFonts();
  const width = opt.width || FACE_W;
  const k = width / FACE_W;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round(FACE_H * k);
  const ctx = canvas.getContext("2d");
  ctx.scale(k, k);
  ctx.save();
  roundRect(ctx, 0, 0, FACE_W, FACE_H, RADIUS);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, FACE_W, FACE_H);
  g.addColorStop(0, opt.side ? "#4a2a1e" : "#3b281a");
  g.addColorStop(1, opt.side ? "#24120c" : "#1e140d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FACE_W, FACE_H);
  ctx.lineWidth = 2;
  ctx.strokeStyle = opt.side ? "rgba(214,150,120,0.26)" : "rgba(176,141,87,0.26)";
  for (let r = 110; r < 520; r += 26) {
    ctx.beginPath();
    ctx.arc(FACE_W / 2, FACE_H / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 70;
  ctx.lineWidth = 40;
  ctx.strokeStyle = "#000";
  ctx.strokeRect(-20, -20, FACE_W + 40, FACE_H + 40);
  ctx.restore();
  const b = 15;
  roundRect(ctx, b / 2, b / 2, FACE_W - b, FACE_H - b, RADIUS - b / 2);
  ctx.lineWidth = b;
  ctx.strokeStyle = opt.side ? "#c98f72" : "#b08d57";
  ctx.stroke();
  // Wachssiegel
  const wax = ctx.createRadialGradient(FACE_W / 2 - 18, FACE_H / 2 - 20, 6, FACE_W / 2, FACE_H / 2, 84);
  wax.addColorStop(0, "#b3302a");
  wax.addColorStop(1, "#6e1414");
  ctx.fillStyle = wax;
  ctx.beginPath();
  ctx.arc(FACE_W / 2, FACE_H / 2, 82, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(40,6,6,0.7)";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(FACE_W / 2, FACE_H / 2, 64, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(240,190,170,0.28)";
  ctx.stroke();
  ctx.font = `56px ${TITLE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f3d9c0";
  ctx.fillText("S&S", FACE_W / 2, FACE_H / 2 + 4);
  ctx.restore();
  return canvas;
}
