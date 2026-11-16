// render/flat/figures.js — eine Stelle, über die Spielfeld (renderer.js) und Menüs (ui/FlatSprite.jsx) Figuren zeichnen.
// spec: { kind: "enemy" | "boss" | "hero" | "decoy", id, skin } · p: Animationswerte (siehe creatures.js)
//
// Aufblitzen (Treffer weiß, Spieler rot) braucht eine Zwischenfläche: die Figur wird dort gezeichnet, eingefärbt
// (source-atop) und dann übertragen. Nur solange eine Figur blitzt — sonst wird direkt gezeichnet.

import { CREATURES, BOSS_LOOK } from "./creatures.js";
import { drawHero, drawDecoy } from "./heroes.js";
import { SKINS } from "../../data/skins.js";
import { ENEMIES } from "../../data/enemies.js";

function paint(c, spec, p) {
  if (spec.kind === "hero") return drawHero(c, spec.id, { ...p, pal: spec.skin && SKINS[spec.skin] ? SKINS[spec.skin].pal : p.pal });
  if (spec.kind === "decoy") return drawDecoy(c);
  if (spec.kind === "boss") {
    const look = BOSS_LOOK[spec.id] || BOSS_LOOK.necromancer;
    return CREATURES[look.fig](c, { ...p, pal: { ...look.pal, ...p.pal }, boss: true });
  }
  // Gegner mit fig + pal (data/enemies.js) sind Farbvarianten einer vorhandenen Figur
  const def = ENEMIES[spec.id];
  if (def?.fig) return CREATURES[def.fig](c, { ...p, pal: { ...def.pal, ...p.pal } });
  return (CREATURES[spec.id] || CREATURES.slime)(c, p);
}

// ── Stempeln ────────────────────────────────────────────────────────────────
// Eine Horde aus hunderten Figuren jedes Bild neu aus Pfaden zu zeichnen ist zu teuer. Kleine Gegner im Normalzustand
// (laufen oder stehen, kein Angriff) werden darum einmal je Animationsschritt auf eine eigene Fläche gezeichnet und
// danach nur noch als Bild gestempelt. Die Animation läuft als Schleife über 2π Sekunden — alle Lauf-Formeln in
// creatures.js nutzen ganzzahlige Frequenzen, die Schleife schließt also ohne Sprung.
const STAMP_LOOP = Math.PI * 2;
const STAMP_FRAMES = Math.round(STAMP_LOOP * 12); // 12 Bilder pro Sekunde
const STAMP_MAX_RES = 1.25; // darüber wird hochskaliert (bei kleinen Figuren kaum sichtbar, spart viel Speicher)
const STAMP_MAX_BYTES = 80e6;
const FLASH_STEP = 9; // Aufblitzen dauert 0,08 s — dafür reicht jedes 9. Bild
const stamps = new Map();
let stampBytes = 0;

export function clearStamps() {
  stamps.clear();
  stampBytes = 0;
}

function bakeStamp(entry, spec, frame, move, flash) {
  const cv = document.createElement("canvas");
  cv.width = entry.W; cv.height = entry.H;
  const o = cv.getContext("2d");
  const k = (entry.size / 100) * entry.res;
  o.setTransform(k, 0, 0, k, entry.W / 2, entry.H - entry.size * 0.25 * entry.res);
  paint(o, spec, { t: (frame / STAMP_FRAMES) * STAMP_LOOP, move, atk: -1, pose: "move" });
  if (flash) {
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = "source-atop";
    o.globalAlpha = 0.75;
    o.fillStyle = "#ffffff";
    o.fillRect(0, 0, entry.W, entry.H);
  }
  stampBytes += entry.W * entry.H * 4;
  return cv;
}

// Wie drawFigure, aber aus dem Stempelvorrat: x, y = Fußpunkt, size = Figurenhöhe, t = Animationszeit der Figur,
// flash = gerade getroffen (weiß), res = Pixel pro Einheit der aktuellen Transformation
export function drawFigureStamp(c, spec, x, y, size, facing, t, move, flash, res) {
  const rq = Math.min(STAMP_MAX_RES, Math.max(0.5, Math.round(res * 8) / 8));
  const key = `${spec.id}|${Math.round(size * 4)}|${rq}`;
  let entry = stamps.get(key);
  if (!entry) {
    if (stampBytes > STAMP_MAX_BYTES) clearStamps();
    entry = { size, res: rq, W: Math.ceil(size * 2.4 * rq), H: Math.ceil(size * 1.6 * rq), sets: [[], [], [], []] };
    stamps.set(key, entry);
  }
  let frame = Math.floor((((t % STAMP_LOOP) + STAMP_LOOP) % STAMP_LOOP) / STAMP_LOOP * STAMP_FRAMES) % STAMP_FRAMES;
  if (flash) frame -= frame % FLASH_STEP;
  const set = entry.sets[(move ? 1 : 0) + (flash ? 2 : 0)];
  const img = set[frame] || (set[frame] = bakeStamp(entry, spec, frame, move, flash));
  const dw = entry.W / rq, dh = entry.H / rq;
  if (facing < 0) {
    c.save(); c.translate(x, y); c.scale(-1, 1);
    c.drawImage(img, -dw / 2, -(dh - size * 0.25), dw, dh);
    c.restore();
  } else c.drawImage(img, x - dw / 2, y - (dh - size * 0.25), dw, dh);
}

let scratch = null;

// x, y = Fußpunkt in den aktuellen Koordinaten von c; size = Figurenhöhe (100 Einheiten → size)
// overlay = { color, alpha } zum Aufblitzen; res = Pixel pro Einheit der aktuellen Transformation (Schärfe)
export function drawFigure(c, spec, x, y, size, facing, p, overlay = null, res = 1) {
  const k = size / 100;
  if (!overlay) {
    c.save(); c.translate(x, y); c.scale(k * (facing < 0 ? -1 : 1), k);
    paint(c, spec, p);
    c.restore();
    return;
  }
  const W = Math.ceil(size * 2.4 * res), H = Math.ceil(size * 1.6 * res);
  if (!scratch) scratch = document.createElement("canvas");
  if (scratch.width < W || scratch.height < H) { scratch.width = Math.max(W, scratch.width); scratch.height = Math.max(H, scratch.height); }
  const o = scratch.getContext("2d");
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, W, H);
  o.setTransform(k * res * (facing < 0 ? -1 : 1), 0, 0, k * res, W / 2, H - size * 0.25 * res);
  paint(o, spec, p);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = "source-atop";
  o.globalAlpha = overlay.alpha;
  o.fillStyle = overlay.color;
  o.fillRect(0, 0, W, H);
  o.globalAlpha = 1;
  o.globalCompositeOperation = "source-over";
  c.drawImage(scratch, 0, 0, W, H, x - W / res / 2, y - (H / res - size * 0.25), W / res, H / res);
}
