// modusBilder.js — Modus-Symbole (Frontend/src/assets/clashRoyale/modes/) hochskalieren und als WebP ablegen.
// Die Bilder aus dem Spiel bzw. aus Wikis sind oft nur 64 px groß; der Kampfverlauf zeigt sie mit 46 px, das Win-Tracker-
// Overlay mit 64 px — auf hochauflösenden Bildschirmen und vergrößerten OBS-Quellen wirkten sie verwaschen. Ein
// KI-Upscaler (ESRGAN, Real-ESRGAN „anime 6B“ — für Spielgrafik) zeichnet beim Vergrößern Kanten und Schrift nach.
//
// Ablauf je Bild, das kleiner als KLEIN px ist oder kein WebP (.avif/.png/.jpg, z. B. neu abgelegt):
//   1. als RGBA-PNG in einen Arbeitsordner (sharp kann avif lesen, Python hier nicht verlässlich)
//   2. modusHochskalieren.py rechnet ×4 auf der Grafikkarte (Python-Umgebung von ComfyUI: torch + spandrel)
//   3. auf höchstens ZIEL px verkleinern, WebP q90 → modes/<name>.webp; Original → modes/originale/ (nicht importiert)
// Bereits hochskalierte Bilder (≥ KLEIN px, WebP) bleiben unberührt — erneut laufen lassen bearbeitet nur Neues.
// Danach den Import in Frontend/src/pages/ClashRoyale/data/modeArt.js auf .webp umstellen bzw. das Bild dort zuordnen.
//
// Aufruf (Backend): npm run cr:mode-images [-- --nur bild1,bild2] [-- --probe]   (--probe: nur Vergleichsbild, nichts ersetzen)
// Pfade: COMFY_PYTHON (python.exe mit torch+spandrel), ESRGAN_MODEL (.pth) — Standard: die ComfyUI-Desktop-Installation.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { createRequire } = require("module");

const FRONTEND = path.join(__dirname, "../../../Frontend");
const MODES = path.join(FRONTEND, "src/assets/clashRoyale/modes");
const ORIG = path.join(MODES, "originale");
const sharp = createRequire(path.join(FRONTEND, "package.json"))("sharp");
const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData/Local");
const PYTHON = process.env.COMFY_PYTHON || path.join(LOCAL, "Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI/.venv/Scripts/python.exe");
const MODEL = process.env.ESRGAN_MODEL || path.join(LOCAL, "Comfy-Desktop/ComfyUI-Shared/models/upscale_models/RealESRGAN_x4plus_anime_6B.pth");
const KLEIN = 160; // darunter wird hochskaliert
const ZIEL = 192; // Verlauf 46 px, Overlay 64 px → reicht für 3× Vergrößerung

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : null; };
const NUR = (arg("nur") || "").split(",").map((s) => s.trim()).filter(Boolean);
const PROBE = process.argv.includes("--probe");

(async () => {
  for (const [what, p] of [["Python (COMFY_PYTHON)", PYTHON], ["Modell (ESRGAN_MODEL)", MODEL]]) {
    if (!fs.existsSync(p)) { console.error(`${what} nicht gefunden: ${p}`); process.exit(1); }
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "modusbilder-"));
  fs.mkdirSync(path.join(work, "in"));
  const todo = [];
  for (const f of fs.readdirSync(MODES).filter((n) => /\.(webp|avif|png|jpe?g)$/i.test(n)).sort()) {
    const base = f.replace(/\.[^.]+$/, "");
    if (NUR.length && !NUR.includes(base) && !NUR.includes(f)) continue;
    const src = fs.readFileSync(path.join(MODES, f));
    const m = await sharp(src).metadata();
    const notWebp = !/\.webp$/i.test(f);
    if (!notWebp && Math.max(m.width, m.height) >= KLEIN) continue;
    if (notWebp && fs.existsSync(path.join(MODES, `${base}.webp`))) { console.log(`ÜBERSPRUNGEN ${f}: ${base}.webp gibt es schon`); continue; }
    await sharp(src).ensureAlpha().png().toFile(path.join(work, "in", `${base}.png`));
    todo.push({ file: f, base, w: m.width, h: m.height });
  }
  if (!todo.length) { console.log("Nichts zu tun — alle Modus-Bilder sind schon groß genug und WebP."); return; }
  console.log(`${todo.length} Bilder: ${todo.map((t) => `${t.file} ${t.w}x${t.h}`).join(", ")}`);

  execFileSync(PYTHON, ["-I", path.join(__dirname, "modusHochskalieren.py"), MODEL, work], { stdio: "inherit" });

  if (PROBE) {
    // Vergleich: oben einfach vergrößert (wie der Browser), unten hochskaliert
    const S = 150; const comps = []; let x = 0;
    for (const t of todo) {
      const fit = { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } };
      comps.push({ input: await sharp(path.join(work, "in", `${t.base}.png`)).resize(S, S, { ...fit, kernel: "cubic" }).png().toBuffer(), left: x, top: 0 });
      comps.push({ input: await sharp(path.join(work, "out", `${t.base}.png`)).resize(S, S, fit).png().toBuffer(), left: x, top: S + 10 });
      x += S + 6;
    }
    const sheet = path.join(work, "vergleich.png");
    await sharp({ create: { width: x, height: 2 * S + 10, channels: 4, background: { r: 26, g: 42, b: 74, alpha: 1 } } }).composite(comps).png().toFile(sheet);
    console.log(`Vergleich (oben vorher, unten nachher): ${sheet}`);
    return;
  }

  fs.mkdirSync(ORIG, { recursive: true });
  for (const t of todo) {
    const out = await sharp(fs.readFileSync(path.join(work, "out", `${t.base}.png`)))
      .resize(ZIEL, ZIEL, { fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer();
    const backup = path.join(ORIG, t.file);
    if (!fs.existsSync(backup)) fs.copyFileSync(path.join(MODES, t.file), backup);
    if (!/\.webp$/i.test(t.file)) fs.unlinkSync(path.join(MODES, t.file));
    fs.writeFileSync(path.join(MODES, `${t.base}.webp`), out);
    const m = await sharp(out).metadata();
    console.log(`${t.file} → ${t.base}.webp ${m.width}x${m.height} ${(out.length / 1024).toFixed(1)} KB`);
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`Originale in ${path.relative(process.cwd(), ORIG)}. Imports in modeArt.js prüfen (.avif/.png → .webp).`);
})().catch((e) => { console.error(e); process.exit(1); });
