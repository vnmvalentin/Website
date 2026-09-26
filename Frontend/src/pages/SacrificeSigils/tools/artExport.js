#!/usr/bin/env node
// tools/artExport.js — rendert alle prozeduralen Artworks als SVG nach public/assets/cards/generated/ (Vorschau/Referenz).
//   npm run art:export
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_CARDS } from "../data/cards/index.js";
import { renderArtSvg } from "../art/procedural.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..", "..", "..", "..", "public", "assets", "cards", "generated");
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const card of ALL_CARDS) {
  fs.writeFileSync(path.join(out, `${card.id}.svg`), renderArtSvg(card));
  n += 1;
}
// Übersichtsseite zum Durchblättern
const tiles = ALL_CARDS.map((c) => `<figure><img src="${c.id}.svg" loading="lazy"><figcaption>${c.name}<br><small>${c.id} · ${c.art.silhouette}</small></figcaption></figure>`).join("\n");
fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Artworks</title><style>body{background:#1d140e;color:#e8dfcc;font:13px Georgia;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:16px}img{width:100%;aspect-ratio:100/76;display:block;border:2px solid #b08d57}figure{margin:0}small{opacity:.6}</style>${tiles}`);
console.log(`${n} Artworks nach ${path.relative(process.cwd(), out)} geschrieben.`);
