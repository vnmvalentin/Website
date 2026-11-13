#!/usr/bin/env node
// tools/farmArtUebernehmen.js — ausgewählte Vorschau-Bilder (npm run garden:art) ins Spiel übernehmen.
//
// AUFRUF
//   npm run garden:art:uebernehmen -- tomoffel=0 knoblauchzwiebel=1 kuerbini=2
//       <motiv>=<variante> → zuschneiden (Rand weg), auf höchstens 400 px verkleinern, als Palette-PNG
//       nach public/garden-assets/<ziel aus artMotive.js>. Ein vorhandenes Bild wird vorher nach
//       garden-art-vorschau/_backup/ kopiert (die Asset-Ordner sind teils unversioniert).
//   npm run garden:art:uebernehmen -- --tueten tomoffel,zitrange --tuete 1
//       Samentüten: leere Tüte (Motiv „samentuete“, Variante --tuete) + Bild der Sorte darauf
//       (Einmal-Ernte: plant.png, Dauerträger: fruit.png) → plants/<id>/seed_shop.png.
//       Die Sorten-Bilder müssen also vorher übernommen sein.
//   Tiere (art "tier"): schreibt animals/<id>.png (Vorschau) + animals/<id>/1.png und 2.png
//       (Laufbilder; Bild 2 wird aus dem Standbild berechnet, siehe laufBild).
//   Bodenbeläge (art "boden"): 256 px, nahtlos gemacht (siehe nahtlos), als JPG.
//   Schalter: --lora <stärke> (Standard 0.7, wie beim Erzeugen), --dry-run,
//     --vorschau <ordner> (Unterordner von garden-art-vorschau/, z. B. pixel_welt),
//     --pixel  echtes Pixelraster (Pixel-Look, 04.11.): 48 Bildpunkte je Kachel Spielgröße,
//              harte Kanten, begrenzte Palette, zweifach vergrößert gespeichert (siehe pixelBild).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { MOTIVE, MAX_PX_JE_ART } from "./artMotive.js";

const hier = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(hier, "../../../..");
const VORSCHAU = path.join(FRONTEND, "garden-art-vorschau");
// GARDEN_ASSETS_ZIEL: anderer Zielordner zum Ausprobieren (z. B. Laufbilder ansehen, ohne das Spiel zu ändern)
const ASSETS = process.env.GARDEN_ASSETS_ZIEL ? path.resolve(process.env.GARDEN_ASSETS_ZIEL) : path.join(FRONTEND, "public", "garden-assets");
const BACKEND_KATALOG = path.resolve(FRONTEND, "../Backend/garden/core/catalogue.js");
const MAX_PX = 400; // Bildschirmgröße liegt auch mit Zoom deutlich darunter (siehe Deko-Pipeline)

let vorschauOrdner = VORSCHAU;
const vorschauDatei = (id, lora, v) => path.join(vorschauOrdner, `${id}__${lora > 0 ? `lora${String(lora).replace(".", "")}` : "ohne"}${v ? `_v${v}` : ""}.png`);

async function speichere(buffer, zielRel, dryRun) {
  const ziel = path.join(ASSETS, zielRel);
  if (dryRun) return console.log(`  (dry-run) → ${zielRel}`);
  if (fs.existsSync(ziel)) {
    const backup = path.join(VORSCHAU, "_backup", `${Date.now()}_${zielRel.replaceAll("/", "__")}`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(ziel, backup);
  }
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, buffer);
  console.log(`  → ${zielRel} (${Math.round(buffer.length / 1024)} KB)`);
}

/**
 * Pixel-Look: wie groß ein Motiv im Raster wird (längste Seite in Bildpunkten). 48 je
 * Kachel Spielgröße — ein ackerfüllendes Motiv hat 48 (Wahl des Nutzers am 04.11., siehe
 * garden-art-vorschau/pixel/_raster_vergleich.png). Welt-Gebäude nach ihrer Zeichengröße
 * im Renderer: Läden bis 290 px (4,5 Kacheln), Schuppen 192, Missionsbrett 128, Briefkasten ~70.
 */
const PIXEL_JE_KACHEL = 48;
const PIXEL_HOEHE_JE_ART = { pflanze: 48, struktur: 72, frucht: 24, tier: 48, stand: 216, deko: 48, gegenstand: 32, symbol: 32, figur: 64, samen: 24 };
const PIXEL_HOEHE_JE_MOTIV = { welt_shed: 144, welt_quest_board: 96, welt_mailbox: 56 };
const PIXEL_FARBEN = 32;
const PIXEL_VERGROESSERUNG = 2;

/**
 * Flux malt nur Pixel-OPTIK ohne festes Raster. Hier wird daraus ein echtes Raster:
 * Freistellrand weg → flächig auf die Zielgröße mitteln (cubic: keine Zufallspixel) →
 * Alpha hart (0/255) → Palette begrenzen → mit „nearest“ ganzzahlig vergrößern, damit die
 * Kanten beim Herunterrechnen im Spiel scharf bleiben.
 */
async function pixelBild(datei, hoehe) {
  const { data, info } = await sharp(datei).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] >= 32) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw new Error("leeres Bild");
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const s = hoehe / Math.max(w, h);
  const zw = Math.max(1, Math.round(w * s)), zh = Math.max(1, Math.round(h * s));
  const klein = await sharp(datei).ensureAlpha().extract({ left: x0, top: y0, width: w, height: h })
    .resize(zw, zh, { kernel: "cubic" }).raw().toBuffer();
  for (let i = 3; i < klein.length; i += 4) klein[i] = klein[i] >= 128 ? 255 : 0;
  const palette = await sharp(klein, { raw: { width: zw, height: zh, channels: 4 } })
    .png({ palette: true, colors: PIXEL_FARBEN, dither: 0 }).toBuffer();
  return sharp(palette).resize(zw * PIXEL_VERGROESSERUNG, zh * PIXEL_VERGROESSERUNG, { kernel: "nearest" })
    .png({ compressionLevel: 9, palette: true, colors: PIXEL_FARBEN, dither: 0 }).toBuffer();
}

const alsSpielbild = (input, max = MAX_PX) =>
  sharp(input).trim({ threshold: 1 }).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, effort: 10 }).toBuffer();

/**
 * Zaunfeld, das nebeneinander nahtlos weiterläuft: Latten über die Deckung je Spalte finden
 * (Latten sind hoch, Querbalken flach) und je eine halbe Latten-Lücke außerhalb der äußeren
 * Latten schneiden — dann ist der Abstand an der Naht derselbe wie zwischen den Latten.
 */
async function zaunFeld(datei) {
  const getrimmt = await sharp(datei).trim({ threshold: 1 }).toBuffer();
  const { data, info } = await sharp(getrimmt).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const deckung = new Array(w).fill(0);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] > 128) deckung[x]++;
  const schwelle = Math.max(...deckung) * 0.75;
  const mitten = [];
  for (let x = 0, start = -1; x <= w; x++) {
    const hoch = x < w && deckung[x] >= schwelle;
    if (hoch && start < 0) start = x;
    if (!hoch && start >= 0) {
      if (x - start > w * 0.02) mitten.push((start + x - 1) / 2);
      start = -1;
    }
  }
  if (mitten.length < 2) throw new Error(`Zaunfeld: nur ${mitten.length} Latte(n) erkannt — andere Variante wählen`);
  const abstand = (mitten[mitten.length - 1] - mitten[0]) / (mitten.length - 1);
  const links = Math.round(mitten[0] - abstand / 2);
  const breite = Math.round(abstand * mitten.length);
  if (links < 0 || links + breite > w) throw new Error("Zaunfeld: Querbalken reichen nicht weit genug über die äußeren Latten hinaus");
  const zuschnitt = await sharp(getrimmt).extract({ left: links, top: 0, width: breite, height: h }).toBuffer();
  return sharp(zuschnitt).resize({ width: MAX_PX, height: MAX_PX, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, effort: 10 }).toBuffer();
}

const BODEN_PX = 256; // eine Kachel ist im Spiel ~90 px groß (64 px × Zoom 1.4)
const BODEN_BAND = 0.25; // Anteil der Kantenlänge, über den an jeder Kante überblendet wird

/**
 * Bodenbelag nahtlos machen: zuerst waagerecht, dann senkrecht. Je Richtung wird das Bild um
 * die halbe Länge verschoben (dessen Kanten stammen aus der Bildmitte und passen daher
 * aneinander) und an den Rändern über das Original geblendet. Die Naht des verschobenen
 * Bildes liegt dabei in der Mitte, wo das Original voll deckt — sie bleibt unsichtbar.
 * Getrennt je Richtung, weil eine gemeinsame Maske die Mittelnaht an den Rändern zeigen würde.
 */
function nahtlos(px, n, kanaele) {
  const band = Math.max(1, Math.round(n * BODEN_BAND));
  const gewicht = (d) => {
    const t = Math.min(1, d / band);
    return t * t * (3 - 2 * t); // weicher Übergang, 0 an der Kante
  };
  let a = Float32Array.from(px);
  for (const waagerecht of [true, false]) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const sx = waagerecht ? (x + n / 2) % n : x;
        const sy = waagerecht ? y : (y + n / 2) % n;
        const d = waagerecht ? Math.min(x, n - 1 - x) : Math.min(y, n - 1 - y);
        const w = gewicht(d);
        const o = (y * n + x) * kanaele;
        const q = (sy * n + sx) * kanaele;
        for (let c = 0; c < kanaele; c++) b[o + c] = a[o + c] * w + a[q + c] * (1 - w);
      }
    }
    a = b;
  }
  return Buffer.from(Uint8ClampedArray.from(a));
}

/**
 * Großflächige Helligkeitsunterschiede entfernen (Flux malt Ränder oft dunkler oder heller als
 * die Mitte). Ohne das bliebe nach dem Nahtlos-Machen ein Gitter aus hellen und dunklen
 * Kacheln sichtbar. Bild minus stark weichgezeichnete Fassung plus Mittelwert: feine Struktur
 * bleibt, das Gefälle verschwindet.
 */
async function glaette(data, n, kanaele) {
  const weich = await sharp(data, { raw: { width: n, height: n, channels: kanaele } }).blur(n / 6).raw().toBuffer();
  const mittel = new Array(kanaele).fill(0);
  for (let i = 0; i < data.length; i++) mittel[i % kanaele] += data[i];
  for (let c = 0; c < kanaele; c++) mittel[c] /= data.length / kanaele;
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(data[i] - weich[i] + mittel[i % kanaele])));
  return out;
}

/**
 * Bodenbelag: quadratisch zuschneiden, verkleinern, Helligkeit glätten, nahtlos machen, als JPG wie bisher.
 * `ausschnitt` (0–1, aus artMotive.js): nur die Bildmitte nehmen — bei schlichten Belägen
 * (Gras, Erde, Kies) malt Flux den Rand anders als die Mitte, das gäbe sonst ein Kachelgitter.
 */
async function bodenBild(datei, ausschnitt = 1) {
  const meta = await sharp(datei).metadata();
  const seite = Math.round(Math.min(meta.width, meta.height) * ausschnitt);
  const { data, info } = await sharp(datei)
    .extract({ left: Math.round((meta.width - seite) / 2), top: Math.round((meta.height - seite) / 2), width: seite, height: seite })
    .resize(BODEN_PX, BODEN_PX)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const flach = await glaette(data, BODEN_PX, info.channels);
  return sharp(nahtlos(flach, BODEN_PX, info.channels), { raw: { width: BODEN_PX, height: BODEN_PX, channels: info.channels } })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

/**
 * Wo die Beine anfangen (Anteil der Bildhöhe von oben) — Vögel stehen auf langen Beinen
 * unter einem runden Körper, Vierbeiner haben den Bauch etwas höher.
 */
const BEIN_START = { huhn: 0.72, ente: 0.74, phoenix: 0.72, schwein: 0.72, schaf: 0.74, waschbaer: 0.66 };
const ZWEIBEINER = new Set(["huhn", "ente", "phoenix"]);

/**
 * Zweites Laufbild aus dem Standbild berechnen: unterhalb von BEIN_START werden die Zeilen
 * zunehmend seitlich verschoben, hinten in die eine, vorne in die andere Richtung (Scheren-
 * schritt). Der Körper darüber bleibt pixelgleich — anders als bei Flux-Bild-zu-Bild, das
 * die Beinstellung nicht ändert, dafür aber Fell und Flecken (getestet, flackert).
 */
async function laufBild(id, rgba, w, h) {
  const y0 = Math.round(h * (BEIN_START[id] ?? 0.62));
  const maxVersatz = w * 0.06;
  const out = Buffer.from(rgba);
  // Gewicht je Spalte: hinten (links, Tier schaut nach rechts) +1, vorne -1, weicher Übergang
  // in der Mitte. Zweibeiner: beide Beine stehen mittig, also gemeinsam ein Bein vor.
  const gewicht = (x) => {
    if (ZWEIBEINER.has(id)) return -1;
    const t = (x / w - 0.35) / 0.3; // 0..1 im mittleren Drittel
    return Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
  };
  for (let y = y0; y < h; y++) {
    const tiefe = (y - y0) / Math.max(1, h - 1 - y0);
    for (let x = 0; x < w; x++) {
      const sx = x - gewicht(x) * maxVersatz * tiefe;
      const x1 = Math.floor(sx);
      const f = sx - x1;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = x1 >= 0 && x1 < w ? rgba[(y * w + x1) * 4 + c] : 0;
        const b = x1 + 1 >= 0 && x1 + 1 < w ? rgba[(y * w + x1 + 1) * 4 + c] : 0;
        out[o + c] = Math.round(a * (1 - f) + b * f);
      }
    }
  }
  return out;
}

/**
 * Tier: Standbild + berechnetes Laufbild auf EINER gemeinsamen Leinwand (gleich groß, unten
 * bündig). Der Renderer passt jedes Bild einzeln in seine Box ein — wären die beiden Bilder
 * unterschiedlich groß, würde das Tier bei jedem Schritt wachsen und schrumpfen.
 * Bild 1 ist zugleich das Vorschaubild (animals/<id>.png) für Rucksack und Brutkasten.
 */
async function tierBilder(id, standDatei, zielRel, dryRun) {
  const { data, info } = await sharp(await sharp(standDatei).trim({ threshold: 1 }).toBuffer())
    .resize({ width: MAX_PX, height: MAX_PX, fit: "inside", withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Seitlicher Rand, damit verschobene Füße nicht abgeschnitten werden.
  const rand = Math.ceil(info.width * 0.06);
  const w = info.width + 2 * rand;
  const h = info.height;
  const breit = await sharp(data, { raw: info })
    .extend({ left: rand, right: rand, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw().toBuffer();
  const alsPng = (raw) => sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9, palette: true, effort: 10 }).toBuffer();
  const eins = await alsPng(breit);
  const zwei = await alsPng(await laufBild(id, breit, w, h));
  await speichere(eins, zielRel, dryRun);
  await speichere(eins, `animals/${id}/1.png`, dryRun);
  await speichere(zwei, `animals/${id}/2.png`, dryRun);
}

/** Ob eine Sorte Einmal-Ernte ist — aus dem Server-Katalog (eine Quelle der Wahrheit). */
async function istEinmalErnte(seedId) {
  const { createRequire } = await import("node:module");
  const { SEED_CATALOGUE } = createRequire(import.meta.url)(BACKEND_KATALOG);
  const s = SEED_CATALOGUE.find((x) => x.id === seedId);
  if (!s) throw new Error(`Sorte ${seedId} steht nicht im Katalog`);
  return s.singleUse !== false;
}

/** Tüte + Sortenbild: Bild sitzt mittig im unteren, leeren Bereich der Tüte. */
async function tuete(seedId, tuetenDatei, dryRun) {
  const quelle = path.join(ASSETS, "plants", seedId, (await istEinmalErnte(seedId)) ? "plant.png" : "fruit.png");
  if (!fs.existsSync(quelle)) throw new Error(`${seedId}: ${path.relative(ASSETS, quelle)} fehlt — erst das Sortenbild übernehmen`);
  const leer = await sharp(tuetenDatei).trim({ threshold: 1 }).toBuffer();
  const { width: W, height: H } = await sharp(leer).metadata();
  const bild = await sharp(quelle).trim({ threshold: 1 }).resize({ width: Math.round(W * 0.66), height: Math.round(H * 0.5), fit: "inside" }).toBuffer();
  const { width: bw, height: bh } = await sharp(bild).metadata();
  const fertig = await sharp(leer).composite([{ input: bild, left: Math.round((W - bw) / 2), top: Math.round(H * 0.58 - bh / 2) }]).png().toBuffer();
  await speichere(await alsSpielbild(fertig), `plants/${seedId}/seed_shop.png`, dryRun);
}

async function main() {
  const argv = process.argv.slice(2);
  let lora = 0.7, dryRun = false, tueten = [], tuetenVariante = 0, pixel = false;
  const auswahl = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--lora") lora = Number(argv[++i]);
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--tueten") tueten = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--tuete")tuetenVariante = Math.max(0, Math.floor(Number(argv[++i])) || 0);
    else if (a === "--pixel") pixel = true;
    else if (a === "--vorschau") vorschauOrdner = path.join(VORSCHAU, String(argv[++i] || ""));
    else if (/^[a-z0-9_]+=\d+$/i.test(a)) {
      const [id, v] = a.split("=");
      auswahl.push({ id, v: Number(v) });
    } else throw new Error(`Unbekanntes Argument: ${a} (erwartet motiv=variante, --tueten, --tuete, --lora, --dry-run)`);
  }
  if (!auswahl.length && !tueten.length) throw new Error("Nichts ausgewählt. Beispiel: tomoffel=0 kuerbini=2");

  for (const { id, v } of auswahl) {
    const m = MOTIVE.find((x) => x.id === id);
    if (!m) throw new Error(`Unbekanntes Motiv: ${id}`);
    if (!m.ziel) throw new Error(`${id} hat kein ziel in artMotive.js — wohin soll es?`);
    const datei = vorschauDatei(id, lora, v);
    if (!fs.existsSync(datei)) throw new Error(`Vorschau fehlt: ${path.basename(datei)}`);
    console.log(`${id} v${v}`);
    if (pixel && m.art !== "tier" && m.art !== "boden") {
      const hoehe = PIXEL_HOEHE_JE_MOTIV[id] ?? PIXEL_HOEHE_JE_ART[m.art] ?? PIXEL_JE_KACHEL;
      await speichere(await pixelBild(datei, hoehe), m.ziel, dryRun);
      continue;
    }
    if (m.art === "tier") {
      await tierBilder(id, datei, m.ziel, dryRun);
      continue;
    }
    if (m.art === "boden") {
      await speichere(await bodenBild(datei, Number(process.env.BODEN_AUSSCHNITT) || m.ausschnitt || 1), m.ziel, dryRun);
      continue;
    }
    await speichere(m.zaunFeld ? await zaunFeld(datei) : await alsSpielbild(datei, MAX_PX_JE_ART[m.art] ?? MAX_PX), m.ziel, dryRun);
  }
  if (tueten.length) {
    const leer = vorschauDatei("samentuete", lora, tuetenVariante);
    if (!fs.existsSync(leer)) throw new Error(`Leere Tüte fehlt: ${path.basename(leer)} — erst npm run garden:art -- --only samentuete`);
    for (const id of tueten) {
      console.log(`Tüte ${id}`);
      await tuete(id, leer, dryRun);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
