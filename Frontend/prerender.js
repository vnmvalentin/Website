// prerender.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { preview } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toAbsolute = (p) => path.resolve(__dirname, p);

// HIER DEINE ROUTEN EINTRAGEN, DIE VORSCHAUEN BRAUCHEN:
const routesToPrerender = [
  '/',
  '/WinChallenge-Overlay',
  '/Bingo',
  '/Packs',
  '/Abstimmungen',
  '/Giveaways',
  '/avards-2026',
  '/tutorial/ytm-songrequest'
];

(async () => {
  console.log('🚀 Starte Prerendering...');

  // 1. Starte den lokalen Preview-Server von Vite (damit wir die Seite besuchen können)
  const server = await preview({
    preview: { port: 8080, open: false },
    build: { outDir: 'dist' },
    configFile: false,
    logLevel: 'error',
  });
  
  const url = server.resolvedUrls.local[0];
  console.log(`🌐 Server läuft auf ${url}`);

  // 2. Starte einen unsichtbaren Chrome Browser
  const browser = await puppeteer.launch({ headless: true });

  for (const route of routesToPrerender) {
    const page = await browser.newPage();
    
    // Besuche die Seite
    try {
      await page.goto(`${url}${route.substring(1)}`, { waitUntil: 'networkidle0' });
      
      // WICHTIG: Warte kurz, damit React 19 den <title> setzen kann
      await new Promise(r => setTimeout(r, 1000));

      // Hole das fertige HTML
      const html = await page.content();

      // Berechne den Pfad im 'dist' Ordner
      // z.B. /WinChallenge-Overlay -> dist/WinChallenge-Overlay/index.html
      const htmlPath = route === '/' 
        ? 'index.html' 
        : `${route.substring(1)}/index.html`;
      
      const filePath = toAbsolute(`dist/${htmlPath}`);
      const dirPath = path.dirname(filePath);

      // Ordner erstellen, falls nicht existent
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Datei speichern
      fs.writeFileSync(filePath, html);
      console.log(`✅ Prerendered: ${route} -> ${htmlPath}`);
      
    } catch (e) {
      console.error(`❌ Fehler bei ${route}:`, e);
    } finally {
      await page.close();
    }
  }

  // Alles beenden
  await browser.close();
  server.httpServer.close();
  console.log('🎉 Fertig!');
  process.exit(0);
})();