// render/flat/figures.js — eine Stelle, über die Spielfeld (renderer.js) und Menüs (ui/FlatSprite.jsx) Figuren zeichnen.
// spec: { kind: "enemy" | "boss" | "hero" | "decoy", id, skin } · p: Animationswerte (siehe creatures.js)
//
// Aufblitzen (Treffer weiß, Spieler rot) braucht eine Zwischenfläche: die Figur wird dort gezeichnet, eingefärbt
// (source-atop) und dann übertragen. Nur solange eine Figur blitzt — sonst wird direkt gezeichnet.

import { CREATURES, BOSS_LOOK } from "./creatures.js";
import { drawHero, drawDecoy } from "./heroes.js";
import { SKINS } from "../../data/skins.js";

function paint(c, spec, p) {
  if (spec.kind === "hero") return drawHero(c, spec.id, { ...p, pal: spec.skin && SKINS[spec.skin] ? SKINS[spec.skin].pal : p.pal });
  if (spec.kind === "decoy") return drawDecoy(c);
  if (spec.kind === "boss") {
    const look = BOSS_LOOK[spec.id] || BOSS_LOOK.necromancer;
    return CREATURES[look.fig](c, { ...p, pal: { ...look.pal, ...p.pal }, boss: true });
  }
  return (CREATURES[spec.id] || CREATURES.slime)(c, p);
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
