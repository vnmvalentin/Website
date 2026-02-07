import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { preview } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toAbsolute = (p) => path.resolve(__dirname, p);

const routesToPrerender = [
  '/',
  '/WinChallenge-Overlay',
  '/Bingo',
  '/Packs',
  '/tutorial/ytm-songrequest'
];

(async () => {
  console.log('🚀 Starte optimiertes Prerendering...');

  const server = await preview({
    preview: { port: 8080, open: false },
    build: { outDir: 'dist' },
    configFile: false,
    logLevel: 'error',
  });
  
  const url = server.resolvedUrls.local[0];
  const browser = await puppeteer.launch({ headless: true });

  for (const route of routesToPrerender) {
    const page = await browser.newPage();
    
    try {
      // 1. Seite laden
      await page.goto(`${url}${route.substring(1)}`, { waitUntil: 'networkidle0' });
      
      // 2. Warten bis React 19 Metadaten gesetzt hat
      // Wir prüfen, ob ein Titel vorhanden ist, der NICHT der Default "Home" ist (außer auf Home)
      if (route !== '/') {
        await page.waitForFunction(() => 
          document.title !== "Home - vnmvalentin" && document.title.length > 0, 
          { timeout: 5000 }
        ).catch(() => console.log(`⚠️ Timeout beim Titel-Check für ${route}, fahre fort...`));
      }

      // 3. CLEANUP-SCRIPT: Entferne doppelte Tags und korrigiere Canonical
      await page.evaluate((currentRoute) => {
        const heads = document.head;
        const titles = heads.querySelectorAll('title');
        const canonicals = heads.querySelectorAll('link[rel="canonical"]');
        
        // Behalte nur den LETZTEN Titel (den React 19 gesetzt hat)
        if (titles.length > 1) {
          for (let i = 0; i < titles.length - 1; i++) titles[i].remove();
        }

        // Korrigiere Canonical URLs (kein Trailing Slash!)
        canonicals.forEach((link, index) => {
          if (index < canonicals.length - 1) {
            link.remove(); // Entferne Duplikate
          } else {
            let href = link.getAttribute('href');
            if (href && href.endsWith('/') && href !== 'https://vnmvalentin.de/') {
              link.setAttribute('href', href.slice(0, -1));
            }
          }
        });
      }, route);

      const html = await page.content();

      const htmlPath = route === '/' 
        ? 'index.html' 
        : `${route.substring(1)}/index.html`;
      
      const filePath = toAbsolute(`dist/${htmlPath}`);
      const dirPath = path.dirname(filePath);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(filePath, html);
      console.log(`✅ Prerendered & Cleaned: ${route}`);
      
    } catch (e) {
      console.error(`❌ Fehler bei ${route}:`, e);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.httpServer.close();
  console.log('🎉 Prerendering erfolgreich abgeschlossen!');
  process.exit(0);
})();