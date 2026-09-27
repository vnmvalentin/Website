// Runde 2, D3: Keine Emojis (und keine Emoji-artigen Symbolzeichen wie Schwerter, Herzen, Sanduhren, Häkchen) im Modus.
// Icons sind Tusche-SVGs (ui/icons). Erlaubt bleibt der typografische Pfeil „→“ in Fließtexten; Kommentare zählen nicht.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = new RegExp("[\\u2190\\u2191\\u2193-\\u21FF\\u2300-\\u23FF\\u2460-\\u24FF\\u25A0-\\u27BF\\u2900-\\u29FF\\u2B00-\\u2BFF\\u{1F000}-\\u{1FAFF}]|\\uFE0F|\\u200D", "gu");

/** @param {string} dir @returns {string[]} */
function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(jsx?|css|md|json)$/.test(f) ? [p] : [];
  });
}

/** Kommentare entfernen (Zeilen bleiben erhalten), damit Zier-Linien in Kommentaren nicht zählen. @param {string} src */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

test("Keine Emojis oder Symbolzeichen im Modus (Quelltexte, Texte, Daten)", () => {
  const hits = [];
  for (const p of files(ROOT)) {
    const raw = readFileSync(p, "utf8");
    const src = /\.(jsx?|css)$/.test(p) ? stripComments(raw) : raw;
    src.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(FORBIDDEN)) hits.push(`${relative(ROOT, p)}:${i + 1} ${JSON.stringify(m[0])}`);
    });
  }
  assert.deepEqual(hits, [], `Gefundene Zeichen:\n${hits.join("\n")}`);
});

test("Emoji-Prüfung schlägt bei Emojis wirklich an", () => {
  // Krone, Schwerter, Herz, Sanduhr, Schild, Pfeil, Pause, Häkchen als Codepunkte, damit diese Datei selbst sauber bleibt
  for (const ch of [0x1f451, 0x2694, 0x2665, 0x29d7, 0x26e8, 0x21e1, 0x23f8, 0x2713].map((c) => String.fromCodePoint(c))) assert.match(ch, new RegExp(FORBIDDEN.source, "u"), ch);
  assert.doesNotMatch("Draft → Pfad · Runde 1 / 6 – Überlauf", new RegExp(FORBIDDEN.source, "u"));
});
