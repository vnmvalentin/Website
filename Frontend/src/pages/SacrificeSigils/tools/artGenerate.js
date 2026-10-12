#!/usr/bin/env node
// tools/artGenerate.js — erzeugt Karten-Artworks per KI (OpenAI-Bild-API) aus den Prompts von artPromptLib.js.
// Lokal mit eigener GPU stattdessen: tools/artComfy.js (ComfyUI).
//
//   npm run art:generate -- --dry-run                 zeigt nur, welche Karten erzeugt würden (kostet nichts)
//   npm run art:generate -- --only bestien_aschbaer   eine Karte (Komma-Liste möglich) — erst so den Stil prüfen
//   npm run art:generate -- --tribe robben --limit 5  Stamm filtern, höchstens 5 Bilder
//   npm run art:generate -- --zirkel gezeiten         nur Gezeiten-Karten
//   Weitere Schalter: --force (vorhandene Bilder überschreiben), --quality low|medium|high (Standard medium),
//                     --model <name> (Standard gpt-image-1), --concurrency <n> (Standard 2)
//
// API-Schlüssel: OPENAI_API_KEY als Umgebungsvariable oder in Frontend/.env.local (per *.local gitignored):
//   OPENAI_API_KEY=sk-...
//
// Ergebnis: public/media/cards/<id>.webp — CardArt.jsx nimmt die Datei automatisch statt des prozeduralen SVG.
// Vorhandene Bilder werden übersprungen, ein abgebrochener Lauf kann also einfach neu gestartet werden.
// Ist `sharp` auffindbar, wird auf 480 px Breite verkleinert; sonst bleibt das Bild in API-Größe (1536×1024).
import fs from "node:fs";
import path from "node:path";
import { FRONTEND, loadSharp, promptFor, selectCards } from "./artPromptLib.js";

const API = "https://api.openai.com/v1/images/generations";
const TARGET_WIDTH = 480;

/** @param {string[]} argv */
function parseArgs(argv) {
  const o = { dryRun: false, quality: "medium", model: "gpt-image-1", concurrency: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} braucht einen Wert`);
      return v;
    };
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--quality") o.quality = val();
    else if (a === "--model") o.model = val();
    else if (a === "--concurrency") o.concurrency = Math.max(1, Math.min(6, Number(val()) || 1));
    else throw new Error(`Unbekannter Schalter: ${a}`);
  }
  if (!["low", "medium", "high"].includes(o.quality)) throw new Error("--quality muss low, medium oder high sein");
  return o;
}

function loadKey() {
  const envFile = path.join(FRONTEND, ".env.local");
  if (!process.env.OPENAI_API_KEY && fs.existsSync(envFile)) process.loadEnvFile(envFile);
  return process.env.OPENAI_API_KEY || null;
}

/** @param {string} key @param {any} o @param {string} prompt @returns {Promise<Buffer>} */
async function generate(key, o, prompt) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: o.model, prompt, size: "1536x1024", quality: o.quality, output_format: "webp", output_compression: 70, n: 1 }),
    });
    if (res.ok) {
      const json = await res.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error("Antwort ohne Bilddaten");
      return Buffer.from(b64, "base64");
    }
    const text = await res.text();
    // 429 (Rate-Limit) und 5xx lohnen einen neuen Versuch; alles andere (Schlüssel, Inhaltsfilter) nicht
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = 2000 * 2 ** attempt;
      console.warn(`  ${res.status}, neuer Versuch in ${wait / 1000} s …`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function main() {
  const { todo, rest, out } = selectCards(process.argv.slice(2));
  const o = parseArgs(rest);
  if (o.dryRun) {
    for (const c of todo) console.log(`  ${c.id}\n    ${promptFor(c)}`);
    return;
  }
  if (!todo.length) return;
  const key = loadKey();
  if (!key) {
    console.error("Kein OPENAI_API_KEY gefunden (Umgebungsvariable oder Frontend/.env.local).");
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(out, { recursive: true });
  const sharp = await loadSharp();
  if (!sharp) console.log(`(sharp nicht gefunden – Bilder bleiben in API-Größe)`);

  let next = 0;
  let ok = 0;
  const failed = [];
  const worker = async () => {
    while (next < todo.length) {
      const c = todo[next++];
      const n = next;
      try {
        let buf = await generate(key, o, promptFor(c));
        if (sharp) buf = await sharp(buf).resize({ width: TARGET_WIDTH }).webp({ quality: 72 }).toBuffer();
        fs.writeFileSync(path.join(out, `${c.id}.webp`), buf);
        ok += 1;
        console.log(`[${n}/${todo.length}] ${c.id} (${Math.round(buf.length / 1024)} KB)`);
      } catch (e) {
        failed.push(c.id);
        console.error(`[${n}/${todo.length}] ${c.id} FEHLER: ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.concurrency, todo.length) }, worker));
  console.log(`Fertig: ${ok} erzeugt, ${failed.length} fehlgeschlagen.${failed.length ? ` Erneut: --only ${failed.join(",")}` : ""}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
