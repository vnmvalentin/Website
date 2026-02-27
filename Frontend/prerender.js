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

      // 3. CLEANUP-SCRIPT (Aggressive Version)
      await page.evaluate((currentRoute) => {
        // A. TITEL BEREINIGEN
        const titles = Array.from(document.querySelectorAll('title'));
        
        // SPEZIAL-CHECK: Wenn wir NICHT auf der Startseite sind...
        if (currentRoute !== '/' && currentRoute !== '') {
            titles.forEach(t => {
                // ...lösche den Home-Titel gnadenlos, egal wo er steht
                if (t.innerText.includes("Home - vnmvalentin")) {
                    t.remove();
                }
            });
        }

        // Falls immer noch Doppelte da sind: Nur den letzten behalten
        const remainingTitles = Array.from(document.querySelectorAll('title'));
        if (remainingTitles.length > 1) {
             const last = remainingTitles[remainingTitles.length - 1];
             remainingTitles.forEach(t => {
                 if (t !== last) t.remove();
             });
        }

        // B. META TAGS BEREINIGEN (Description, OG & Twitter)
        // Wir suchen nach ALLEN möglichen Duplikaten
        const metaTypes = [
            'name="description"', 
            'name="keywords"',
            'property="og:title"', 
            'property="og:description"', 
            'property="og:url"',
            'property="og:image"',
            'property="og:type"',
            'name="twitter:card"',
            'name="twitter:title"',
            'name="twitter:description"',
            'name="twitter:image"'
        ];
        
        metaTypes.forEach(selector => {
            const tags = Array.from(document.querySelectorAll(`meta[${selector}]`));
            if (tags.length > 1) {
                // Wir behalten nur den LETZTEN Tag (das ist der von React/Unterseite)
                for (let i = 0; i < tags.length - 1; i++) {
                    tags[i].remove();
                }
            }
        });
        
        // C. Canonical Fix (Slash am Ende entfernen für Unterseiten)
        const canonicals = Array.from(document.querySelectorAll('link[rel="canonical"]'));
        if (canonicals.length > 0) {
            const lastCanonical = canonicals[canonicals.length - 1];
            // Erst aufräumen
            canonicals.forEach(c => { if (c !== lastCanonical) c.remove(); });
            
            // Dann fixen
            let href = lastCanonical.getAttribute('href');
            if (href && href !== 'https://vnmvalentin.de' && href !== 'https://vnmvalentin.de/' && href.endsWith('/')) {
                lastCanonical.setAttribute('href', href.slice(0, -1));
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