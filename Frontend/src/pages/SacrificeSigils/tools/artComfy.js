#!/usr/bin/env node
// tools/artComfy.js — erzeugt Karten-Artworks mit der eigenen GPU über eine lokal laufende ComfyUI-Instanz.
//
// EINRICHTEN
//   1. In ComfyUI einen Text-zu-Bild-Workflow bauen und darin Platzhalter eintragen:
//        %PROMPT%    im positiven Prompt (CLIP Text Encode)            — Pflicht
//        %NEGATIVE%  im negativen Prompt – nur bei Modellen mit cfg > 1 (SDXL); bei Flux (cfg 1.0) den Node leer lassen
//        %ID%        im filename_prefix des Save-Image-Nodes (optional, nur für ComfyUIs eigenen output-Ordner)
//      Seeds (Eingänge „seed“ / „noise_seed“) setzt das Skript pro Karte fest aus der Karten-ID:
//      dieselbe Karte ergibt beim erneuten Lauf dasselbe Bild. Mit --keep-seed bleibt der Seed aus dem Workflow.
//   2. Workflow → Export (API) als Frontend/src/pages/SacrificeSigils/tools/comfy-workflow.json speichern
//      (nicht das normale „Save“ – das API-Format ist ein Objekt aus Nodes mit class_type).
//   3. ComfyUI starten (Standard http://127.0.0.1:8188).
//
// AUFRUF
//   npm run art:comfy -- --only bestien_aschbaer           erst eine Karte, Stil prüfen
//   npm run art:comfy -- --tribe robben --limit 5
//   npm run art:comfy -- --zirkel gezeiten
//   Weitere Schalter: --force (vorhandene überschreiben), --workflow <datei>, --server <url>, --keep-seed, --dry-run,
//                     --variant <n> (neuer Seed für die gewählten Karten, z. B. --only x --force --variant 2),
//                     --crop-bottom <prozent> (schneidet unten einen Streifen ab, z. B. 8 gegen Signaturen in der Ecke;
//                     braucht sharp), --out <ordner> (Zielordner statt public/media/cards, z. B. für Tests)
//
// Ergebnis: public/media/cards/<id>.webp (mit sharp, auf 480 px verkleinert) bzw. <id>.png ohne sharp.
// CardArt.jsx nimmt beides automatisch. Vorhandene Bilder werden übersprungen – Abbrechen und neu starten geht jederzeit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashParts } from "../engine/rng.js";
import { NEGATIVE, loadSharp, promptFor, selectCards } from "./artPromptLib.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const TARGET_WIDTH = 480;
const SEED_INPUTS = new Set(["seed", "noise_seed"]);
const TIMEOUT_MS = 10 * 60 * 1000; // ein Bild; der erste Lauf lädt noch das Modell

/** @param {string[]} argv */
function parseArgs(argv) {
  const o = { workflow: path.join(here, "comfy-workflow.json"), server: "http://127.0.0.1:8188", keepSeed: false, dryRun: false, cropBottom: 0, variant: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} braucht einen Wert`);
      return v;
    };
    if (a === "--workflow") o.workflow = path.resolve(val());
    else if (a === "--server") o.server = val().replace(/\/+$/, "");
    else if (a === "--keep-seed") o.keepSeed = true;
    else if (a === "--variant") o.variant = Math.max(0, Math.floor(Number(val())) || 0);
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--crop-bottom") o.cropBottom = Number(val());
    else throw new Error(`Unbekannter Schalter: ${a}`);
  }
  if (!(o.cropBottom >= 0 && o.cropBottom <= 40)) throw new Error("--crop-bottom erwartet Prozent zwischen 0 und 40");
  return o;
}

/**
 * Rohbild → Kartenbild: optional unten einen Streifen abschneiden (Signatur in der Ecke), verkleinern, WebP.
 * @param {any} sharp @param {Buffer} png @param {number} cropBottom Prozent der Höhe
 */
async function toCardImage(sharp, png, cropBottom) {
  let img = sharp(png);
  if (cropBottom > 0) {
    const { width, height } = await sharp(png).metadata();
    img = img.extract({ left: 0, top: 0, width, height: Math.max(1, Math.round(height * (1 - cropBottom / 100))) });
  }
  return img.resize({ width: TARGET_WIDTH }).webp({ quality: 72 }).toBuffer();
}

/** Workflow laden und prüfen, dass er im API-Format ist und %PROMPT% enthält. @param {string} file */
function loadWorkflow(file) {
  if (!fs.existsSync(file)) throw new Error(`Workflow fehlt: ${file}\nIn ComfyUI: Workflow → Export (API) und dort speichern.`);
  const wf = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(wf.nodes)) throw new Error("Das ist das normale Workflow-Format. Bitte in ComfyUI „Export (API)“ benutzen.");
  if (!Object.values(wf).some((n) => n && typeof n === "object" && "class_type" in n)) throw new Error("Keine Nodes mit class_type gefunden – ist das ein API-Export?");
  if (!JSON.stringify(wf).includes("%PROMPT%")) throw new Error("Im Workflow steht nirgends %PROMPT% – bitte in den positiven Prompt schreiben.");
  return wf;
}

/** Platzhalter und Seed für eine Karte einsetzen (tiefe Kopie). @param {any} wf @param {any} card @param {boolean} keepSeed */
function fillWorkflow(wf, card, keepSeed, variant = 0) {
  // Variante 0 = bisheriger Seed (bereits erzeugte Bilder bleiben reproduzierbar), jede andere Zahl würfelt neu
  const seed = (variant ? hashParts("comfy", card.id, variant) : hashParts("comfy", card.id)) % 2 ** 32;
  const sub = (/** @type {string} */ s) => s.replaceAll("%PROMPT%", promptFor(card)).replaceAll("%NEGATIVE%", NEGATIVE).replaceAll("%ID%", card.id);
  const out = structuredClone(wf);
  for (const node of Object.values(out)) {
    if (!node?.inputs) continue;
    for (const [k, v] of Object.entries(node.inputs)) {
      if (typeof v === "string") node.inputs[k] = sub(v);
      else if (!keepSeed && typeof v === "number" && SEED_INPUTS.has(k)) node.inputs[k] = seed;
    }
  }
  return out;
}

/** @param {string} url @param {RequestInit} [init] */
async function json(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

/** Workflow einreihen, auf das Ergebnis warten und das erste Bild holen. @returns {Promise<Buffer>} */
async function render(server, workflow) {
  const queued = await json(`${server}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: "sacrifice-sigils-art" }) });
  if (queued.node_errors && Object.keys(queued.node_errors).length) throw new Error(`Workflow-Fehler: ${JSON.stringify(queued.node_errors).slice(0, 500)}`);
  const id = queued.prompt_id;
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 1000));
    const entry = (await json(`${server}/history/${id}`))[id];
    if (!entry) continue;
    if (entry.status?.status_str === "error") throw new Error(`ComfyUI meldet einen Fehler: ${JSON.stringify(entry.status.messages || []).slice(0, 500)}`);
    const img = Object.values(entry.outputs || {}).flatMap((o) => o.images || []).find((x) => x.type === "output") || Object.values(entry.outputs || {}).flatMap((o) => o.images || [])[0];
    if (!img) {
      if (entry.status?.completed) throw new Error("Fertig, aber kein Bild in den Ausgaben – hat der Workflow einen Save-Image-Node?");
      continue;
    }
    const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || "", type: img.type || "output" });
    const res = await fetch(`${server}/view?${q}`);
    if (!res.ok) throw new Error(`Bild konnte nicht geladen werden (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Zeitüberschreitung (10 min)");
}

async function main() {
  const { todo, rest, out } = selectCards(process.argv.slice(2));
  const o = parseArgs(rest);
  const wf = loadWorkflow(o.workflow);
  if (o.dryRun) {
    for (const c of todo) console.log(`  ${c.id}\n    ${promptFor(c)}`);
    return;
  }
  if (!todo.length) return;
  try {
    await json(`${o.server}/system_stats`);
  } catch {
    console.error(`ComfyUI unter ${o.server} nicht erreichbar – läuft es? (anderer Port: --server http://127.0.0.1:<port>)`);
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(out, { recursive: true });
  const sharp = await loadSharp();
  if (!sharp) console.log("(sharp nicht gefunden – Bilder werden unverkleinert als PNG gespeichert, das sind je ~1–2 MB)");
  if (!sharp && o.cropBottom) console.log("(--crop-bottom braucht sharp und wird ignoriert)");

  let ok = 0;
  const failed = [];
  for (const [i, c] of todo.entries()) {
    const t0 = Date.now();
    try {
      const png = await render(o.server, fillWorkflow(wf, c, o.keepSeed, o.variant));
      const [ext, buf] = sharp ? ["webp", await toCardImage(sharp, png, o.cropBottom)] : ["png", png];
      fs.writeFileSync(path.join(out, `${c.id}.${ext}`), buf);
      ok += 1;
      console.log(`[${i + 1}/${todo.length}] ${c.id} (${Math.round(buf.length / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      failed.push(c.id);
      console.error(`[${i + 1}/${todo.length}] ${c.id} FEHLER: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Fertig: ${ok} erzeugt, ${failed.length} fehlgeschlagen.${failed.length ? ` Erneut: --only ${failed.join(",")}` : ""}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
