// tools/goldShopBild.mjs
// Bild des Gold-Shops (11.11.): Seit man hineingehen kann, ist er kein offener Marktstand
// mehr, sondern ein kleines Haus mit Tür — dasselbe Haus wie das eigene (world/shed.png),
// nur mit goldenem Dach, gelben Blumen und einem Münzschild über der Tür. So passt es ohne
// neuen Bildlauf zum Pixel-Look, und die Tür sitzt an derselben Stelle (engine/hausTuer.js).
//
//   node src/pages/GardenGame/tools/goldShopBild.mjs                 → Vorschau neben dem Skript-Aufruf (gold_shop_vorschau.png)
//   node src/pages/GardenGame/tools/goldShopBild.mjs --uebernehmen   → schreibt public/garden-assets/world/gold_shop.png
// Danach ASSET_VERSION (engine/assetVersion.js) erhöhen.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const hier = path.dirname(fileURLToPath(import.meta.url));
const welt = path.resolve(hier, "../../../../public/garden-assets/world");
const uebernehmen = process.argv.includes("--uebernehmen");

// Rot → Gold: Helligkeit des roten Punkts wählt die Stufe (Schattierung bleibt erhalten)
const GOLD = [[112, 72, 14], [156, 108, 22], [200, 148, 32], [228, 176, 44], [246, 206, 84], [255, 232, 140]];

const { data, info } = await sharp(path.join(welt, "shed.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const setze = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
};

// Wo überhaupt umgefärbt wird: die Dachflächen links und rechts vom Giebeldreieck und die
// drei Blumenkästen. Das Holz hat rotbraune Konturen — ohne diese Grenzen bekäme es Goldsprenkel.
const KAESTEN = [[100, 96, 152, 114], [38, 164, 92, 184], [166, 164, 220, 184]];
const imDach = (x, y) => y < 140 && Math.abs(x - 128) > (y - 10) * 0.784 + 5;
const imKasten = (x, y) => KAESTEN.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (data[i + 3] < 40) continue;
    const x = (i / 4) % W, y = Math.floor(i / 4 / W);
    const dach = imDach(x, y);
    if (!dach && !imKasten(x, y)) continue;
    // Rot und (am Dach) die rosa Lichtkanten; Braun, Grün und Grau bleiben
    const rot = r >= 70 && r >= g * (dach ? 1.5 : 1.9) && r >= b * 1.4;
    const rosa = r > 190 && r > g * 1.2 && b > g * 0.8 && b < r * 0.85;
    if (!rot && !rosa) continue;
    const hell = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    const stufe = Math.max(0, Math.min(GOLD.length - 1, Math.round(((hell - 0.14) / 0.42) * (GOLD.length - 1))));
    [data[i], data[i + 1], data[i + 2]] = GOLD[stufe];
}

// Münzschild über der Tür: dunkler Rand, goldene Fläche, Lichtkante, Prägung
const MX = 132, MY = 127, R = 10;
for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
    const d = Math.hypot(x, y);
    if (d > R + 0.6) continue;
    let farbe = [228, 176, 44];
    if (d > R - 1.4) farbe = [59, 37, 22];
    else if (d > R - 3) farbe = [156, 108, 22];
    else if (x + y < -5) farbe = [255, 232, 140];
    setze(MX + x, MY + y, farbe);
}
// Prägung: kleine Krone
for (const [x, y, w, h] of [[-4, 1, 9, 3], [-4, -2, 2, 3], [0, -3, 1, 4], [3, -2, 2, 3]]) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) setze(MX + x + dx, MY + y + dy, [112, 72, 14]);
}
// Zwei Ketten zum Türsturz
for (const x of [MX - 6, MX + 6]) for (let y = MY - R - 5; y < MY - R + 1; y++) setze(x, y, y % 2 ? [59, 37, 22] : [138, 147, 156]);

const ziel = uebernehmen ? path.join(welt, "gold_shop.png") : path.resolve("gold_shop_vorschau.png");
await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(ziel);
console.log("geschrieben:", ziel);
