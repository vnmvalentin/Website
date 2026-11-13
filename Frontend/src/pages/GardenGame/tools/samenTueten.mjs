#!/usr/bin/env node
// tools/samenTueten.mjs — Samentüten im Pixel-Look, im Code gezeichnet (06.11.).
//
// Jede Sorte bekommt eine Papiertüte mit gezackter Oberkante, einem Rand in der Farbe
// ihrer Seltenheit, ihrer Pflanze (plant.png bzw. fruit.png) im Sichtfenster und ihrem
// Samen (seed.png) unten rechts. Ersetzt die zusammengesetzten Tüten aus
// farmArtUebernehmen.js --tueten (gemalte Tüte + Bild), die nicht zum Pixel-Look passten.
//
// AUFRUF
//   node src/pages/GardenGame/tools/samenTueten.mjs                 → Vorschau nach garden-art-vorschau/code_tueten/
//   node src/pages/GardenGame/tools/samenTueten.mjs --uebernehmen   → plants/<id>/seed_shop.png (alt nach _backup/)
//   … --nur tomate,kiwi   nur diese Sorten
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const hier = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(hier, "../../../..");
const PFLANZEN = path.join(FRONTEND, "public", "garden-assets", "plants");
const VORSCHAU = path.join(FRONTEND, "garden-art-vorschau", "code_tueten");
const BACKUP = path.join(FRONTEND, "garden-art-vorschau", "_backup");
const { SEED_CATALOGUE } = createRequire(import.meta.url)(path.resolve(FRONTEND, "../Backend/garden/core/catalogue.js"));

const W = 40, H = 52, SKALA = 4; // Bildpunkte der Tüte, gespeichert vierfach (160×208)
const RAND_FARBE = {
    COMMON: ["#9a9488", "#6f6a60"], UNCOMMON: ["#5faa45", "#3f7a35"], RARE: ["#4a82c8", "#2f5a9a"],
    EPIC: ["#9a68d8", "#6a40a8"], LEGENDARY: ["#e0a82a", "#a87414"], MYTHIC: ["#e0609a", "#a83a6a"],
};
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function tueteRoh(rarity) {
    const d = new Uint8ClampedArray(W * H * 4);
    const px = (x, y, c) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const [r, g, b] = hex(c);
        const i = (y * W + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    };
    const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
    const [rand, randDunkel] = RAND_FARBE[rarity] || RAND_FARBE.COMMON;
    const UMRISS = "#3b2516";
    // Körper
    rect(1, 5, W - 2, H - 6, "#f3e3c3");
    rect(W - 4, 5, 3, H - 6, "#e3cfa8");             // Schatten rechts
    // gezackte, gefaltete Oberkante
    for (let x = 1; x < W - 1; x++) {
        const zacke = x % 4 < 2 ? 1 : 3;
        rect(x, zacke, 1, 5 - zacke, "#e8d7a8");
        px(x, 4, "#c9b48a");
    }
    rect(1, 5, W - 2, 1, "#c9b48a");
    // Rand in der Seltenheitsfarbe
    rect(3, 8, W - 6, 2, rand);
    rect(3, H - 5, W - 6, 2, randDunkel);
    rect(3, 8, 2, H - 11, rand);
    rect(W - 5, 8, 2, H - 11, randDunkel);
    // Sichtfenster für die Pflanze
    rect(6, 11, W - 12, 27, "#fffaf0");
    rect(6, 37, W - 12, 1, "#e8d7a8");
    // Etikettband unten
    rect(6, 40, W - 12, 6, rand);
    rect(6, 40, W - 12, 1, "#ffffff");
    // Umriss
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3]) continue;
        const nachbar = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const nx = x + dx, ny = y + dy;
            return nx >= 0 && ny >= 0 && nx < W && ny < H && d[(ny * W + nx) * 4 + 3] && !(d[(ny * W + nx) * 4] === hex(UMRISS)[0] && d[(ny * W + nx) * 4 + 1] === hex(UMRISS)[1]);
        });
        if (nachbar) px(x, y, UMRISS);
    }
    return d;
}

async function einpassen(datei, w, h) {
    // Rand weg, dann mit harten Kanten in w×h einpassen
    const zugeschnitten = await sharp(datei).ensureAlpha().trim({ threshold: 0 }).toBuffer();
    return sharp(zugeschnitten).resize(w, h, { fit: "contain", kernel: "nearest", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function tuete(seed) {
    const ordner = path.join(PFLANZEN, seed.id);
    const pflanze = path.join(ordner, seed.singleUse === false ? "fruit.png" : "plant.png");
    const samen = path.join(ordner, "seed.png");
    const roh = tueteRoh(seed.rarity);
    const basis = await sharp(Buffer.from(roh.buffer), { raw: { width: W, height: H, channels: 4 } })
        .resize(W * SKALA, H * SKALA, { kernel: "nearest" }).png().toBuffer();
    const teile = [];
    if (fs.existsSync(pflanze)) teile.push({ input: await einpassen(pflanze, 24 * SKALA, 24 * SKALA), left: 8 * SKALA, top: 12 * SKALA });
    if (fs.existsSync(samen)) teile.push({ input: await einpassen(samen, 9 * SKALA, 9 * SKALA), left: (W - 15) * SKALA, top: 31 * SKALA });
    return sharp(basis).composite(teile).png({ palette: true, colours: 64 }).toBuffer();
}

const args = process.argv.slice(2);
const uebernehmen = args.includes("--uebernehmen");
const nur = args.includes("--nur") ? new Set(args[args.indexOf("--nur") + 1].split(",")) : null;
fs.mkdirSync(VORSCHAU, { recursive: true });
let n = 0;
for (const seed of SEED_CATALOGUE) {
    if (nur && !nur.has(seed.id)) continue;
    if (!fs.existsSync(path.join(PFLANZEN, seed.id))) { console.log(`  (übersprungen, kein Ordner) ${seed.id}`); continue; }
    const buf = await tuete(seed);
    fs.writeFileSync(path.join(VORSCHAU, `${seed.id}.png`), buf);
    if (uebernehmen) {
        const ziel = path.join(PFLANZEN, seed.id, "seed_shop.png");
        if (fs.existsSync(ziel)) {
            fs.mkdirSync(BACKUP, { recursive: true });
            fs.copyFileSync(ziel, path.join(BACKUP, `${Date.now()}_plants__${seed.id}__seed_shop.png`));
        }
        fs.writeFileSync(ziel, buf);
    }
    n++;
}
console.log(`${n} Tüten gezeichnet${uebernehmen ? " und übernommen" : ""} → ${VORSCHAU}`);
