// render3d/tools/thumbs.mjs — fotografiert jede 3D-Figur der Besetzung als kleines Bild für den Kodex.
//
//   npm run dev                       (in einem zweiten Fenster — das Werkzeug braucht den laufenden Dev-Server)
//   npm run adventure:bilder          (oder: npm run adventure:bilder -- http://localhost:5199)
//
// Öffnet unsichtbar /adventures/probe3d/bilder (render3d/Thumbs3d.jsx), lässt dort Figur für Figur hinstellen und
// speichert das Bild nach public/media/av3d/bilder/<name>.png — mit durchsichtigem Grund, direkt aus der Zeichenfläche
// gelesen. Nötig nach Änderungen an der Besetzung (render3d/cast.js) oder an den Figuren (tools/bakeFigures.mjs).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const base = (process.argv[2] || "http://localhost:5173").replace(/\/$/, "");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../../public/media/av3d/bilder");
fs.mkdirSync(OUT, { recursive: true });

// Immer unsichtbar: ein sichtbares Fenster nimmt laufenden Spielen den Fokus
const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  await page.goto(`${base}/adventures/probe3d/bilder`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__thumbs, { timeout: 30000 });
  const count = await page.evaluate(() => window.__thumbs.count);
  let bytes = 0;
  for (let i = 0; i < count; i++) {
    const shot = await page.evaluate((n) => window.__thumbs.draw(n), i);
    const png = Buffer.from(shot.png.split(",")[1], "base64");
    fs.writeFileSync(path.join(OUT, `${shot.file}.png`), png);
    bytes += png.length;
  }
  console.log(`${count} Bilder, zusammen ${(bytes / 1024).toFixed(0)} KB → ${OUT}`);
} finally {
  await browser.close();
}
