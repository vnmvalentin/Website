#!/usr/bin/env node
// tools/artPrompts.js — erzeugt art-prompts.md mit einem Bildprompt pro Karte (Motiv, Stamm, Stimmung, einheitlicher Stil).
//   npm run art:prompts
// Die fertigen Bilder als public/media/cards/<id>.webp (oder .png) ablegen — der Renderer nimmt sie dann automatisch.
// Automatisch per KI erzeugen: npm run art:generate (siehe tools/artGenerate.js).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_CARDS } from "../data/cards/index.js";
import { de } from "../i18n/de.js";
import { NEGATIVE, STYLE, promptFor, sigilNames, zirkelOf } from "./artPromptLib.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..", "art-prompts.md");

const lines = [
  "# Sacrifice & Sigils – Bildprompts",
  "",
  "Ein Prompt pro Karte. Einheitlicher Stil-Suffix am Ende jedes Prompts. Fertige Bilder als `public/media/cards/<id>.webp` ablegen (Seitenverhältnis 100:76).",
  "",
  `**Stil:** ${STYLE}`,
  "",
];
let tribe = "";
for (const c of ALL_CARDS) {
  if (c.tribe !== tribe) {
    tribe = c.tribe;
    lines.push(`## ${de.tribes[tribe]?.name || tribe}`, "");
  }
  const sig = sigilNames(c);
  lines.push(`### ${c.name} (\`${c.id}\`)`);
  lines.push(`> „${c.flavor}“${sig.length ? ` · Sigils: ${sig.join(", ")}` : ""}`);
  lines.push("");
  lines.push("```");
  lines.push(promptFor(c));
  lines.push("```");
  lines.push("");
}
fs.writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`${ALL_CARDS.length} Prompts nach ${path.relative(process.cwd(), out)} geschrieben.`);

// Dieselben Prompts als CSV (z. B. für ComfyUI-Batch-Nodes oder eine Tabelle); UTF-8 mit BOM, damit Excel Umlaute erkennt
const csvOut = path.resolve(here, "..", "art-prompts.csv");
const cell = (/** @type {string} */ v) => `"${String(v).replace(/"/g, '""')}"`;
const rows = [["id", "name", "stamm", "zirkel", "seltenheit", "prompt", "negative"].join(",")];
for (const c of ALL_CARDS) rows.push([c.id, c.name, c.tribe, zirkelOf(c), c.rarity, promptFor(c), NEGATIVE].map(cell).join(","));
const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);
fs.writeFileSync(csvOut, BOM + rows.join(CRLF) + CRLF);
console.log(`${ALL_CARDS.length} Zeilen nach ${path.relative(process.cwd(), csvOut)} geschrieben.`);
