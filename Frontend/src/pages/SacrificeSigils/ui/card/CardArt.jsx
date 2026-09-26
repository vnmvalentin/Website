// ui/card/CardArt.jsx — Artwork einer Karte.
// 1. Liegt public/assets/cards/<id>.webp oder .png vor, wird die Datei benutzt (echtes Artwork einfach ablegen).
// 2. Sonst das prozedurale SVG (deterministisch aus art.seed, im Speicher gecacht).
import React, { useEffect, useState } from "react";
import { artDataUri } from "../../art/procedural.js";

/** @type {Map<string, string|null|Promise<string|null>>} */
const probed = new Map();

/** @param {string} url */
function tryLoad(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? url : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** @param {string} id */
function probe(id) {
  const hit = probed.get(id);
  if (hit !== undefined) return hit;
  const p = tryLoad(`/assets/cards/${id}.webp`)
    .then((u) => u || tryLoad(`/assets/cards/${id}.png`))
    .then((u) => {
      probed.set(id, u);
      return u;
    });
  probed.set(id, p);
  return p;
}

/**
 * @param {{ def: any, className?: string }} props def = Kartendefinition (id, tribe, rarity, cursed, art)
 */
export default function CardArt({ def, className = "" }) {
  const cached = probed.get(def.id);
  const [file, setFile] = useState(typeof cached === "string" ? cached : null);
  useEffect(() => {
    let alive = true;
    const r = probe(def.id);
    if (r instanceof Promise) r.then((u) => alive && setFile(u));
    else setFile(r);
    return () => { alive = false; };
  }, [def.id]);
  const src = file || artDataUri(def);
  return <img className={`ss-card-art ${className}`} src={src} alt="" draggable={false} decoding="async" />;
}
