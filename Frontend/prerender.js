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
      // 3. CLEANUP-SCRIPT: Brutales Aufräumen von Duplikaten
      await page.evaluate((currentRoute) => {
        // A. TITEL BEREINIGEN
        // Wir nehmen an, der LETZTE Titel im DOM ist der korrekte (von React gesetzte)
        const titles = Array.from(document.querySelectorAll('title'));
        if (titles.length > 1) {
            // Alle entfernen außer dem allerletzten
            for (let i = 0; i < titles.length - 1; i++) {
                titles[i].remove();
            }
        }

        // B. META TAGS BEREINIGEN (Description & OG)
        // Wir suchen nach Duplikaten bei property="og:..." und name="description"
        const metaTypes = ['name="description"', 'property="og:title"', 'property="og:description"', 'property="og:url"'];
        
        metaTypes.forEach(selector => {
            const tags = Array.from(document.querySelectorAll(`meta[${selector}]`));
            if (tags.length > 1) {
                // Auch hier: Wir behalten nur den letzten (den von React 19)
                for (let i = 0; i < tags.length - 1; i++) {
                    tags[i].remove();
                }
            }
        });

        // C. CANONICAL BEREINIGEN & FIXEN
        const canonicals = Array.from(document.querySelectorAll('link[rel="canonical"]'));
        if (canonicals.length > 0) {
            // Alle außer dem letzten entfernen
            for (let i = 0; i < canonicals.length - 1; i++) {
                canonicals[i].remove();
            }
            
            // FIX: Canonical auf "No-Slash" zwingen
            const link = document.querySelector('link[rel="canonical"]');
            if (link) {
                let href = link.getAttribute('href');
                // Wenn nicht Root und endet auf Slash -> Slash entfernen
                if (href !== 'https://vnmvalentin.de' && href !== 'https://vnmvalentin.de/' && href.endsWith('/')) {
                    link.setAttribute('href', href.slice(0, -1));
                }
            }
        }
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