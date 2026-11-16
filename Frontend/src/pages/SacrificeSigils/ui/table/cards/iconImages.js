// ui/table/cards/iconImages.js — die Tusche-Icons (Sigils, Kosten, Klaue, Herz) als Bilder für das Canvas.
//
// Die Icons bleiben an EINER Stelle definiert (ui/icons/*.jsx, React-SVG). Für die 3D-Karten wird dasselbe SVG
// einmal in Text gerendert und als Bild geladen — so sehen Karten im Kartenbuch (DOM) und auf dem Tisch (Textur)
// garantiert gleich aus, ohne die Glyphen doppelt zu pflegen.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SigilIcon from "../../icons/SigilIcon.jsx";
import { BloodDrop, Bone, CandleStub, SaltCrystal, Claw, WaxHeart, SpecialMark, TideMark } from "../../icons/GameIcons.jsx";

const INK = "#1a1612";
/** Größe, in der die SVGs gerastert werden (reicht für 1024er Kartentexturen). */
const RASTER = 256;

/** @type {Map<string, Promise<HTMLImageElement | null>>} */
const pending = new Map();
/** @type {Map<string, HTMLImageElement | null>} */
const ready = new Map();

/** @param {string} key */
function elementFor(key) {
  const [kind, ...rest] = key.split("|");
  const arg = rest.join("|");
  switch (kind) {
    case "sigil": return createElement(SigilIcon, { sigil: arg, size: RASTER });
    case "aura": return createElement(SigilIcon, { sigil: arg, size: RASTER, aura: true });
    case "blood": return createElement(BloodDrop, { size: RASTER });
    case "bones": return createElement(Bone, { size: RASTER });
    case "wax": return createElement(CandleStub, { size: RASTER, lit: true });
    case "salt": return createElement(SaltCrystal, { size: RASTER });
    case "claw": return createElement(Claw, { size: RASTER });
    case "heart": return createElement(WaxHeart, { size: RASTER });
    case "special": return createElement(SpecialMark, { special: arg, size: RASTER });
    case "tide": return createElement(TideMark, { tide: arg, size: RASTER });
    default: return null;
  }
}

/** @param {string} key  z. B. "sigil|schwinge", "aura|hochwuchs", "blood", "claw", "special|flammenmass" */
export function loadIcon(key) {
  const hit = pending.get(key);
  if (hit) return hit;
  const el = elementFor(key);
  const p = new Promise((resolve) => {
    if (!el) { resolve(null); return; }
    let svg = renderToStaticMarkup(el);
    // Als eigenständiges Bild braucht das SVG seinen Namensraum und eine feste Tintenfarbe statt currentColor
    if (!svg.includes("xmlns=")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    svg = svg.replaceAll("currentColor", INK);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }).then((img) => {
    ready.set(key, img);
    return img;
  });
  pending.set(key, p);
  return p;
}

/** Bereits geladenes Icon (oder null). @param {string} key */
export function iconNow(key) {
  return ready.get(key) || null;
}

/** @param {string[]} keys */
export function loadIcons(keys) {
  return Promise.all([...new Set(keys)].map(loadIcon));
}
