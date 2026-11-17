import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { preview } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toAbsolute = (p) => path.resolve(__dirname, p);
// Build-Ordner, aus dem gelesen und in den geschrieben wird — für Probeläufe abweichend per PRERENDER_OUT_DIR
const OUT_DIR = process.env.PRERENDER_OUT_DIR || 'dist';
const DOMAIN = 'https://vnmvalentin.de';
const CONCURRENCY = 4;

const routesToPrerender = [
  '/',
  '/WinChallenge-Overlay',
  '/Bingo',
  '/tutorial/ytm-bot',
  '/fun',
  '/community',
  '/clash',
  // Kartenrätsel unter /clash (reine Browserspiele, Text + Kartenpool sind Inhalt)
  '/clash/kartenraten',
  '/clash/wer-bin-ich',
  '/clash/stats-duell',
  '/clash/zoom',
  '/clash/pixel',
  '/clash/wordle',
  '/clash/farbe',
  '/clash/viewer-games',
  '/clash/heute',
  '/tools',
  '/contact',
  // Clash Royale: die Minigame-Hubseite ist die wichtigste Unterseite überhaupt und war
  // bisher nur client-gerendert — ohne Prerender sieht ein Crawler nur ein leeres <div id="root">.
  '/clash-royale',
  '/clash-royale/win-tracker',
  '/nuzlocke',
  '/discord-bot',
  // Twitch-Overlay-Tools: hinter dem Login liegt nur die Konfiguration — der Text
  // oberhalb beschreibt das Tool und soll auffindbar sein.
  '/twitch-tools',
  // Sacrifice & Sigils: Startseite, Anleitung und Kartenbuch sind reine Inhaltsseiten (Spiel läuft erst nach Klick)
  '/sacrifice-and-sigils',
  '/sacrifice-and-sigils/anleitung',
  // Clash-Royale-Stats (Ausbauplan „cr-suche“): Übersichten mit Live-Daten. Die Kartenseiten und die meistgespielten
  // Decks findet FOLLOW unten über die Links auf diesen Seiten.
  '/clash/karten',
  '/clash/decks',
  '/clash/ranglisten',
  '/clash/crown-series',
  '/clash/baukasten',
  // Produktseiten der Streamer-Werkzeuge (Ausbauplan „produktseiten“, StreamerTools/productTexts.js)
  '/tools/win-tracker',
  '/tools/win-challenge',
  '/tools/twitch-overlays',
  // Einstiegsseite des Discord-Bots (Ausbauplan „discord-verzeichnis“, Discord/landingTexts.js)
  '/tools/discord-bot',
];

// Unterseiten, die das Vorrendern selbst über die Links einer fertigen Seite findet — wie ein Suchmaschinen-Crawler.
// Sie kommen samt englischer Fassung (?lang=en, wie bei allen Stats-Seiten) in die Sitemap. Spielerseiten fehlen
// bewusst: sie stehen auf noindex.
const FOLLOW = [
  { from: '/clash/karten', link: /^\/clash\/karten\/[a-z0-9-]+$/ },
  { from: '/clash/decks', link: /^\/clash\/decks\/[a-z0-9-]+(,[a-z0-9-]+){7}$/ },
];
// Was an Stats-Seiten in die Sitemap gehört (fehlende Einträge ergänzt extendSitemap), mit Gewicht
const SITEMAP_RULES = [
  { re: /^\/clash\/(karten|decks|ranglisten|crown-series|baukasten|heute)$/, priority: 0.8 },
  { re: /^\/clash\/karten\/./, priority: 0.6 },
  { re: /^\/clash\/decks\/./, priority: 0.5 },
  // Produktseiten: deutsch und ?lang=en
  { re: /^\/tools\/(win-tracker|win-challenge|twitch-overlays|discord-bot)$/, priority: 0.8 },
];

// ── Live-Daten der Stats-Seiten ─────────────────────────────────────────────
// Beim Vorrendern läuft kein Backend. Anfragen der /clash-Seiten an /api/clash/scout beantwortet deshalb der Live-Server
// (dieselbe öffentliche Route), je Adresse einmal geholt und für alle Seiten wiederverwendet. Der Server lässt 90 Abrufe
// pro Minute je Absender zu → nacheinander mit Abstand, bei 429 warten und neu versuchen. Ohne Netz (oder mit
// PRERENDER_LIVE_API=off) entstehen Kartenseiten ohne Live-Zahlen — ihre Kampfwerte stecken im Bundle —, Seiten, die
// nur aus Live-Daten bestehen (LIVE_REQUIRED), werden dann gar nicht geschrieben.
const LIVE_API = process.env.PRERENDER_LIVE_API !== 'off';
const LIVE_PREFIX = '/api/clash/scout/';
const LIVE_SPACING_MS = 750;
const LIVE_ROUTES = /^\/clash(\/|$)/;
const LIVE_REQUIRED = /^\/clash\/(decks|ranglisten|crown-series)(\/|$)/;
const API_DOWN = { status: 503, contentType: 'application/json', body: Buffer.from('{"ok":false,"key":"apiDown"}') };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const liveCache = new Map();
let liveQueue = Promise.resolve();

async function fetchLive(pathAndQuery) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Eigene Kennung: Skript-Kennungen wie Nodes „node“ weist die Stats-Schnittstelle ab (scoutRoutes.js, SCRIPT_UA)
      const res = await fetch(DOMAIN + pathAndQuery, { headers: { 'user-agent': 'vnmvalentin-prerender' }, signal: AbortSignal.timeout(20000) });
      if (res.status === 429) { await sleep(25000); continue; }
      return { status: res.status, contentType: res.headers.get('content-type') || 'application/json', body: Buffer.from(await res.arrayBuffer()) };
    } catch { /* Netz weg oder Zeit abgelaufen — noch einmal */ }
  }
  console.log(`⚠️ Live-Daten nicht erreichbar: ${pathAndQuery}`);
  return API_DOWN;
}

function liveApi(pathAndQuery) {
  if (!LIVE_API) return Promise.resolve(API_DOWN);
  if (!liveCache.has(pathAndQuery)) {
    const job = liveQueue.then(() => fetchLive(pathAndQuery));
    liveQueue = job.then(() => sleep(LIVE_SPACING_MS));
    liveCache.set(pathAndQuery, job);
  }
  return liveCache.get(pathAndQuery);
}

// ── Sitemap ─────────────────────────────────────────────────────────────────
// public/sitemap.xml bleibt die von Hand gepflegte Grundlage; hier kommen nur fehlende Stats-Seiten dazu, jeweils
// deutsch (kanonisch, ohne Parameter) und englisch (?lang=en) mit gegenseitigen hreflang-Verweisen.
function extendSitemap(routes) {
  const file = toAbsolute(`${OUT_DIR}/sitemap.xml`);
  let xml;
  try { xml = fs.readFileSync(file, 'utf8'); } catch {
    console.error('⚠️ sitemap.xml fehlt im Build — keine Einträge ergänzt');
    return;
  }
  const have = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
  const day = new Date().toISOString().slice(0, 10);
  const esc = (s) => s.replace(/&/g, '&amp;');
  const entries = [];
  for (const route of [...routes].sort()) {
    const rule = SITEMAP_RULES.find((r) => r.re.test(route));
    const de = DOMAIN + route;
    if (!rule || have.has(de)) continue;
    const en = `${de}?lang=en`;
    const alternates = [['de', de], ['en', en], ['x-default', de]]
      .map(([lang, href]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${esc(href)}"/>`).join('\n    ');
    for (const [loc, prio] of [[de, rule.priority], [en, Math.max(0.1, rule.priority - 0.2)]]) {
      entries.push(`  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${day}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${prio.toFixed(1)}</priority>\n    ${alternates}\n  </url>`);
    }
  }
  if (!entries.length) return;
  // Ohne Kommentar-Marke: dist/ bleibt kommentarfrei (scripts/kommentareEntfernen.js)
  xml = xml.replace('</urlset>', `${entries.join('\n')}\n</urlset>`);
  fs.writeFileSync(file, xml);
  console.log(`🗺️ Sitemap: ${entries.length} Einträge ergänzt`);
}

(async () => {
  console.log('🚀 Starte optimiertes Prerendering...');
  const failedRoutes = [];
  // Selbst gefundene Seiten (FOLLOW) und Seiten ohne Live-Daten: fehlen sie, fehlt nur diese eine — der Build läuft weiter
  const skippedRoutes = [];
  const writtenRoutes = [];
  const known = new Set(routesToPrerender);
  const queue = routesToPrerender.map((route) => ({ route, found: false }));

  const server = await preview({
    preview: { port: 8080, open: false },
    build: { outDir: OUT_DIR },
    configFile: false,
    logLevel: 'error',
  });

  const url = server.resolvedUrls.local[0];
  const origin = new URL(url).origin;
  const browser = await puppeteer.launch({ headless: true });

  async function renderRoute({ route, found }) {
    const page = await browser.newPage();
    const skip = (why) => { skippedRoutes.push(route); console.log(`⚠️ ${route}: ${why} — übersprungen.`); };
    let liveFailed = false;

    try {
      // Stats-Seiten: ihre Datenabrufe beantwortet der Live-Server (liveApi oben)
      if (LIVE_ROUTES.test(route)) {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          let u = null;
          try { u = new URL(req.url()); } catch { /* data:/blob:-Adressen */ }
          if (!u || u.origin !== origin || !u.pathname.startsWith(LIVE_PREFIX)) {
            req.continue().catch(() => {});
            return;
          }
          liveApi(u.pathname + u.search)
            .then((r) => {
              if (r.status >= 400) liveFailed = true;
              return req.respond({ status: r.status, contentType: r.contentType, body: r.body });
            })
            .catch(() => req.abort().catch(() => {}));
        });
      }

      // 1. Seite laden. /clash-royale hält eine offene Socket.io-Verbindung — dort wird
      // 'networkidle0' nie erreicht, deshalb nach einem Timeout einfach weiterlaufen.
      await page.goto(`${url}${route.substring(1)}`, { waitUntil: 'networkidle0', timeout: 15000 })
        .catch(async () => {
          console.log(`⚠️ networkidle0 Timeout für ${route} — nutze domcontentloaded`);
          await page.goto(`${url}${route.substring(1)}`, { waitUntil: 'domcontentloaded' });
          await new Promise(r => setTimeout(r, 2500)); // React Zeit geben, die Metadaten zu setzen
        });
      
      // 1b. Auf nachgeladene Routen warten (React.lazy in App.jsx).
      // Solange der Chunk unterwegs ist, rendert React den Suspense-Fallback. Würden wir
      // jetzt schon abgreifen, stünde im ausgelieferten HTML nur "Lädt…" — für Crawler
      // wäre die Seite damit leer. Der Marker kommt aus PageFallback in App.jsx.
      await page.waitForFunction(
        () => !document.querySelector('[data-page-fallback]'),
        { timeout: 20000 }
      ).catch(() => {
        console.error(`❌ ${route}: Suspense-Fallback wurde nicht aufgelöst (Chunk nicht geladen?)`);
      });

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
        // Fallback-Tags aus index.html (data-default) wegräumen, sobald React einen echten
        // Wert dafür geliefert hat. Wichtig für den Titel: React 19 hängt seinen <title>
        // VOR den bestehenden, "den letzten behalten" würde also den Fallback wählen.
        const dropDefaults = (selector) => {
            const all = Array.from(document.querySelectorAll(selector));
            const real = all.filter(el => !el.hasAttribute('data-default'));
            if (real.length > 0) all.forEach(el => { if (el.hasAttribute('data-default')) el.remove(); });
            else real.forEach(el => el.removeAttribute('data-default'));
            // Übrig gebliebene data-default-Tags sind der einzige Wert — Markierung entfernen
            document.querySelectorAll(`${selector}[data-default]`).forEach(el => el.removeAttribute('data-default'));
        };

        // A. TITEL BEREINIGEN
        dropDefaults('head > title');

        // SPEZIAL-CHECK: Wenn wir NICHT auf der Startseite sind...
        if (currentRoute !== '/' && currentRoute !== '') {
            Array.from(document.querySelectorAll('head > title')).forEach(t => {
                // ...lösche den Home-Titel gnadenlos, egal wo er steht
                if (t.textContent.includes("Home - vnmvalentin")) {
                    t.remove();
                }
            });
        }

        // Falls immer noch Doppelte da sind: Nur den letzten behalten
        const remainingTitles = Array.from(document.querySelectorAll('head > title'));
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
            'name="robots"',
            'property="og:title"',
            'property="og:description"',
            'property="og:url"',
            'property="og:image"',
            'property="og:type"',
            'property="og:site_name"',
            'property="og:locale"',
            'name="twitter:card"',
            'name="twitter:title"',
            'name="twitter:description"',
            'name="twitter:image"'
        ];
        
        metaTypes.forEach(selector => {
            dropDefaults(`meta[${selector}]`);
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

      // Harte Bremse: Lieber der Build scheitert, als dass eine leere oder halbfertige
      // Seite online geht. Das würde erst im Ranking auffallen, nicht im Test.
      // Zwei getrennte Fehlerbilder:
      //   a) Chunk noch unterwegs  → der Suspense-Fallback steht im HTML
      //   b) Chunk-Download kaputt → LazyRouteBoundary zeigt die Fehlermeldung
      //   c) irgendetwas anderes   → #root bleibt praktisch leer
      const rootLength = await page.evaluate(
        () => document.getElementById('root')?.innerHTML.length ?? 0
      );
      const problem =
        html.includes('data-page-fallback') ? 'enthält nur den Ladeplatzhalter'
        : html.includes('data-page-error') ? 'zeigt die Ladefehler-Meldung'
        : rootLength < 500 ? `hat ein praktisch leeres #root (${rootLength} Zeichen)`
        : null;
      if (problem) {
        if (found) { skip(problem); return; }
        failedRoutes.push(route);
        console.error(`❌ ${route}: ${problem} — wird NICHT geschrieben.`);
        return;
      }
      // Eine gefundene Seite, die sich selbst aus dem Index nimmt (z. B. unbekannte Karte), gehört weder auf die Platte
      // noch in die Sitemap; Seiten, die nur aus Live-Daten bestehen, zeigten ohne sie bloß eine Fehlermeldung
      if (found && /<meta name="robots" content="noindex/.test(html)) { skip('steht auf noindex'); return; }
      if (liveFailed && LIVE_REQUIRED.test(route)) { skip('Live-Daten fehlen'); return; }

      const htmlPath = route === '/'
        ? 'index.html' 
        : `${route.substring(1)}/index.html`;
      
      const filePath = toAbsolute(`${OUT_DIR}/${htmlPath}`);
      const dirPath = path.dirname(filePath);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      fs.writeFileSync(filePath, html);
      writtenRoutes.push(route);
      console.log(`✅ Prerendered & Cleaned: ${route}`);

      // Unterseiten über die Links dieser Seite finden (FOLLOW) — sie landen hinten in der Warteschlange
      const follow = FOLLOW.find((f) => f.from === route);
      if (follow) {
        const hrefs = await page.$$eval('a[href]', (links) => links.map((a) => a.getAttribute('href') || ''));
        let added = 0;
        for (const href of hrefs) {
          const target = href.split(/[?#]/)[0];
          if (!follow.link.test(target) || known.has(target)) continue;
          known.add(target);
          queue.push({ route: target, found: true });
          added++;
        }
        console.log(`🔎 ${route}: ${added} Unterseiten gefunden`);
      }

    } catch (e) {
      if (found) skip(`Fehler ${e?.message || e}`);
      else console.error(`❌ Fehler bei ${route}:`, e);
    } finally {
      await page.close();
    }
  }

  // Die Startseite zuerst und allein: ihre fertige index.html liefert die Vorschau danach als Hülle aller übrigen
  // Adressen aus — während sie geschrieben wird, soll keine andere Seite sie laden. Danach mehrere Tabs gleichzeitig.
  if (queue[0]?.route === '/') await renderRoute(queue.shift());
  let active = 0;
  const worker = async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) {
        // Leer heißt erst fertig, wenn kein Tab mehr läuft — eine laufende Seite kann noch Unterseiten nachschieben
        if (!active) return;
        await sleep(100);
        continue;
      }
      active++;
      try { await renderRoute(job); } finally { active--; }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await browser.close();
  // server.close() statt server.httpServer.close(): erstens die öffentliche, awaitbare
  // Vite-API (echtes Promise, räumt auch das intern eigene Zeug mit auf, nicht nur den
  // rohen HTTP-Server), zweitens der eigentliche Grund für den Fix hier — vorher lief
  // server.httpServer.close() OHNE await nebenher, während direkt danach process.exit()
  // den Prozess sofort hart beendete. Auf Windows reißt das den TCP-Server-Handle (und
  // ggf. noch nicht ganz geschlossene Puppeteer-Pipes) mitten aus dem Schließen — genau
  // das löst den libuv-Absturz "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
  // aus (dieselbe Windows-Eigenheit wie der Kommentar an closeDb() in garden/store/farms.js).
  await server.close();

  extendSitemap(writtenRoutes);
  if (skippedRoutes.length) {
    console.log(`\n⚠️ Übersprungen (nicht vorgerendert, nicht in der Sitemap): ${skippedRoutes.join(', ')}`);
  }

  if (failedRoutes.length) {
    console.error(`\n💥 Prerendering fehlgeschlagen für: ${failedRoutes.join(', ')}`);
    // process.exitCode statt process.exit(1): setzt nur den Exit-Code, der Prozess beendet
    // sich von selbst, sobald die Event-Loop leer ist — kein hartes Abwürgen mehr, das
    // browser.close()/server.close() oben ohnehin schon vollständig abgewartet haben.
    process.exitCode = 1;
  } else {
    console.log('🎉 Prerendering erfolgreich abgeschlossen!');
  }
})();