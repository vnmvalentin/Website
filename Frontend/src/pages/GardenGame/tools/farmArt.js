#!/usr/bin/env node
// tools/farmArt.js — Virtual-Farm-Bilder über eine lokal laufende ComfyUI-Instanz (Flux-dev).
//
// EINRICHTEN
//   Workflow in ComfyUI mit %PROMPT% im positiven Prompt bauen und per „Export (API)" als
//   Frontend/src/pages/GardenGame/tools/comfy-workflow.json speichern. Das Skript setzt pro Bild
//   Prompt, Seed (fest aus Motiv-ID + Variante), Bildgröße (EmptySD3LatentImage) und LoRA-Stärke ein.
//   ComfyUI mit --disable-dynamic-vram starten (sonst hängt ComfyUI 0.43 beim Laden).
//   Motive, Bildarten und Stil-Block: tools/artMotive.js.
//
// AUFRUF
//   npm run garden:art -- --varianten 3                 alle Motive, je 3 Seeds, LoRA 0.7 + Übersicht
//   npm run garden:art -- --only ziege,tomoffel --varianten 2
//   npm run garden:art -- --art frucht                  nur eine Bildart (pflanze|struktur|frucht|tier|stand|deko|boden|samen|symbol|gegenstand)
//   npm run garden:art -- --only apfel --variant 4      genau eine bestimmte Variante
//   npm run garden:art -- --vergleich                   LoRA ohne / 0.7 / 1.0 nebeneinander
//   Weitere Schalter: --lora <stärke>, --out <ordner> (Standard: garden-art-vorschau/ im Frontend,
//                     gitignored), --server <url>, --force, --dry-run
//   npm run garden:art -- --stilprobe --lora 0 --varianten 2   Stilrichtungen vergleichen (artStilprobe.js)
//   npm run garden:art -- --stil pixel --lora 0 --out garden-art-vorschau/pixel   echte Motive in einem Probe-Stil
//
// Ergebnis: <out>/<id>__<lora>[_v<n>].png (freigestellt, volle Größe) und <out>/_uebersicht.png.
// Übernommen ins Spiel wird erst nach Sichtung — dieses Skript schreibt nie nach public/garden-assets.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARTEN, MOTIVE, OHNE_FREISTELLEN, promptFuer } from "./artMotive.js";
import { STILPROBEN } from "./artStilprobe.js";

const hier = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(hier, "../../../..");
const TIMEOUT_MS = 10 * 60 * 1000;
const SEED_EINGAENGE = new Set(["seed", "noise_seed"]);

function argumente(argv) {
  const o = { workflow: path.join(hier, "comfy-workflow.json"), server: "http://127.0.0.1:8188", out: path.join(FRONTEND, "garden-art-vorschau"), only: null, art: null, lora: [0.7], varianten: [0], vergleich: false, force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const wert = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} braucht einen Wert`);
      return v;
    };
    const ganzzahl = (v) => Math.max(0, Math.floor(Number(v)) || 0);
    if (a === "--workflow") o.workflow = path.resolve(wert());
    else if (a === "--server") o.server = wert().replace(/\/+$/, "");
    else if (a === "--out") o.out = path.resolve(wert());
    else if (a === "--only") o.only = new Set(wert().split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--art") o.art = wert();
    else if (a === "--lora") o.lora = [Number(wert())];
    else if (a === "--vergleich") o.vergleich = true;
    else if (a === "--variant") o.varianten = [ganzzahl(wert())];
    else if (a === "--varianten") o.varianten = Array.from({ length: Math.max(1, ganzzahl(wert())) }, (_, n) => n);
    else if (a === "--stilprobe") o.stilprobe = true;
    else if (a === "--stil") o.stil = wert();
    else if (a === "--force") o.force = true;
    else if (a === "--dry-run") o.dryRun = true;
    else throw new Error(`Unbekannter Schalter: ${a}`);
  }
  if (o.vergleich) o.lora = [0, 0.7, 1];
  if (o.lora.some((x) => !(x >= 0 && x <= 1.5))) throw new Error("--lora erwartet eine Stärke zwischen 0 und 1.5");
  if (o.art && !ARTEN[o.art]) throw new Error(`Unbekannte Bildart: ${o.art} (vorhanden: ${Object.keys(ARTEN).join(", ")})`);
  return o;
}

/** FNV-1a → stabiler Seed je Motiv und Variante (Variante 0 = bisheriger Seed). */
function seedFuer(id, variant) {
  let h = 0x811c9dc5;
  for (const c of `farm|${id}|${variant}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

const dateiName = (id, lora, variant) => `${id}__${lora > 0 ? `lora${String(lora).replace(".", "")}` : "ohne"}${variant ? `_v${variant}` : ""}.png`;

function ladeWorkflow(file) {
  if (!fs.existsSync(file)) throw new Error(`Workflow fehlt: ${file}\nIn ComfyUI: Workflow → Export (API) und dort speichern.`);
  const wf = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(wf.nodes)) throw new Error("Das ist das normale Workflow-Format. Bitte „Export (API)“ benutzen.");
  if (!JSON.stringify(wf).includes("%PROMPT%")) throw new Error("Im Workflow steht nirgends %PROMPT% – bitte in den positiven Prompt schreiben.");
  return wf;
}

/** Hintergrund-Entfernung aus dem Workflow nehmen: Save Image bekommt direkt das VAE-Decode-Bild. */
function ohneFreistellen(wf) {
  const decode = Object.keys(wf).find((k) => wf[k]?.class_type === "VAEDecode");
  if (!decode) throw new Error("Workflow ohne VAEDecode — kann Freistellen nicht abschalten");
  for (const [k, n] of Object.entries(wf)) {
    if (["RemoveBackground", "LoadBackgroundRemovalModel", "InvertMask", "JoinImageWithAlpha"].includes(n?.class_type)) delete wf[k];
    else if (n?.class_type === "SaveImage") n.inputs.images = [decode, 0];
  }
}

/** Prompt, Seed, Größe und LoRA-Stärke in eine Kopie des Workflows setzen. */
let STIL_WAHL = null; // --stil <name>, siehe promptFuer
function fuelle(wf, motiv, lora, variant) {
  const out = structuredClone(wf);
  const prompt = promptFuer(motiv, lora > 0, STIL_WAHL);
  // seedVon: Motivreihen, die dieselbe Figur zeigen sollen (Fellfarben der Katze), teilen sich den Seed.
  const seed = seedFuer(motiv.seedVon || motiv.id, variant);
  for (const node of Object.values(out)) {
    if (!node?.inputs) continue;
    for (const [k, v] of Object.entries(node.inputs)) {
      if (typeof v === "string") node.inputs[k] = v.replaceAll("%PROMPT%", prompt).replaceAll("%ID%", motiv.id);
      else if (typeof v === "number" && SEED_EINGAENGE.has(k)) node.inputs[k] = seed;
    }
    if (node.class_type === "EmptySD3LatentImage" || node.class_type === "EmptyLatentImage") {
      node.inputs.width = motiv.breite || 1024;
      node.inputs.height = motiv.hoehe || 1024;
    }
    if (node.class_type === "LoraLoaderModelOnly" || node.class_type === "LoraLoader") {
      node.inputs.strength_model = lora;
      if ("strength_clip" in node.inputs) node.inputs.strength_clip = lora;
    }
  }
  if (OHNE_FREISTELLEN.has(motiv.art)) ohneFreistellen(out);
  return { workflow: out, prompt };
}

async function json(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function rendere(server, workflow) {
  const q = await json(`${server}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: "virtual-farm-art" }) });
  if (q.node_errors && Object.keys(q.node_errors).length) throw new Error(`Workflow-Fehler: ${JSON.stringify(q.node_errors).slice(0, 500)}`);
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 1000));
    const e = (await json(`${server}/history/${q.prompt_id}`))[q.prompt_id];
    if (!e) continue;
    if (e.status?.status_str === "error") throw new Error(`ComfyUI meldet einen Fehler: ${JSON.stringify(e.status.messages || []).slice(0, 500)}`);
    const bilder = Object.values(e.outputs || {}).flatMap((o) => o.images || []);
    const img = bilder.find((x) => x.type === "output") || bilder[0];
    if (!img) {
      if (e.status?.completed) throw new Error("Fertig, aber kein Bild – hat der Workflow einen Save-Image-Node?");
      continue;
    }
    const p = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || "", type: img.type || "output" });
    const res = await fetch(`${server}/view?${p}`);
    if (!res.ok) throw new Error(`Bild konnte nicht geladen werden (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Zeitüberschreitung (10 min)");
}

/** Übersicht: eine Zeile je Motiv, eine Spalte je LoRA/Variante, auf Karomuster (zeigt Transparenz). */
async function uebersicht(sharp, out, motive, spalten) {
  const Z = 300, RAND = 12, KOPF = 34, LINKS = 150;
  const breite = LINKS + spalten.length * (Z + RAND);
  const hoehe = KOPF + motive.length * (Z + RAND);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}"><defs><pattern id="k" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#eceae4"/><rect width="10" height="10" fill="#dedbd2"/><rect x="10" y="10" width="10" height="10" fill="#dedbd2"/></pattern></defs><rect width="100%" height="100%" fill="url(#k)"/>`
    + spalten.map((s, i) => `<text x="${LINKS + i * (Z + RAND) + Z / 2}" y="24" font-family="Arial" font-size="18" text-anchor="middle" fill="#333">${esc(s.titel)}</text>`).join("")
    + motive.map((m, i) => `<text x="10" y="${KOPF + i * (Z + RAND) + Z / 2}" font-family="Arial" font-size="17" fill="#333">${esc(m.id)}</text><text x="10" y="${KOPF + i * (Z + RAND) + Z / 2 + 22}" font-family="Arial" font-size="14" fill="#777">${esc(m.art)}</text>`).join("")
    + `</svg>`;
  const teile = [];
  for (const [zi, m] of motive.entries()) {
    for (const [si, s] of spalten.entries()) {
      const f = path.join(out, dateiName(m.id, s.lora, s.variant));
      if (!fs.existsSync(f)) continue;
      const input = await sharp(f).resize(Z, Z, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      teile.push({ input, left: LINKS + si * (Z + RAND), top: KOPF + zi * (Z + RAND) });
    }
  }
  const ziel = path.join(out, "_uebersicht.png");
  await sharp(Buffer.from(svg)).composite(teile).png().toFile(ziel);
  return ziel;
}

async function main() {
  const o = argumente(process.argv.slice(2));
  STIL_WAHL = o.stil || null;
  const QUELLE = o.stilprobe ? STILPROBEN : MOTIVE;
  if (o.only) for (const id of o.only) if (!QUELLE.some((m) => m.id === id)) throw new Error(`Unbekanntes Motiv: ${id} (vorhanden: ${QUELLE.map((m) => m.id).join(", ")})`);
  const motive = QUELLE.filter((m) => (!o.only || o.only.has(m.id)) && (!o.art || m.art === o.art));
  const spalten = o.lora.flatMap((lora) => o.varianten.map((variant) => ({ lora, variant, titel: `${lora > 0 ? `LoRA ${lora}` : "ohne LoRA"}${o.varianten.length > 1 || variant ? ` · v${variant}` : ""}` })));
  const wf = ladeWorkflow(o.workflow);
  const auftraege = motive.flatMap((m) => spalten.map((s) => ({ m, ...s })));
  if (o.dryRun) {
    for (const { m, lora, variant } of auftraege) console.log(`${dateiName(m.id, lora, variant)} (${m.breite || 1024}×${m.hoehe || 1024})\n  ${fuelle(wf, m, lora, variant).prompt}`);
    return;
  }
  try {
    await json(`${o.server}/system_stats`);
  } catch {
    throw new Error(`ComfyUI unter ${o.server} nicht erreichbar – läuft es?`);
  }
  fs.mkdirSync(o.out, { recursive: true });
  let ok = 0;
  const fehler = [];
  for (const [i, { m, lora, variant }] of auftraege.entries()) {
    const name = dateiName(m.id, lora, variant);
    const ziel = path.join(o.out, name);
    if (fs.existsSync(ziel) && !o.force) {
      console.log(`[${i + 1}/${auftraege.length}] ${name} gibt es schon (--force zum Überschreiben)`);
      continue;
    }
    const t0 = Date.now();
    try {
      fs.writeFileSync(ziel, await rendere(o.server, fuelle(wf, m, lora, variant).workflow));
      ok++;
      console.log(`[${i + 1}/${auftraege.length}] ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      fehler.push(name);
      console.error(`[${i + 1}/${auftraege.length}] ${name} FEHLER: ${e instanceof Error ? e.message : e}`);
      // ComfyUI weg (Absturz)? Dann nicht noch zig Aufträge ins Leere schicken.
      if (/fetch failed|ECONNREFUSED/.test(String(e?.message || e))) {
        console.error("ComfyUI antwortet nicht mehr – Abbruch. Neu starten und denselben Befehl wiederholen (Fertiges wird übersprungen).");
        break;
      }
    }
  }
  const sharp = await import("sharp").then((x) => x.default).catch(() => null);
  if (sharp && motive.length) console.log(`Übersicht: ${await uebersicht(sharp, o.out, motive, spalten)}`);
  console.log(`Fertig: ${ok} erzeugt, ${fehler.length} fehlgeschlagen. Ordner: ${o.out}`);
  if (fehler.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
