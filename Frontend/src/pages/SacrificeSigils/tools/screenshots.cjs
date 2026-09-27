// tools/screenshots.cjs — Pflicht-Screenshots (Runde 2, D2). Voraussetzung: vite dev auf :5199 (npx vite --port 5199),
// Socket-Server auf :3001, Playwright global. Aufruf: node screenshots.cjs, danach node toWebp.cjs <ordner>.
// SIZES / ONLY / OUT / REPORT per Umgebungsvariable einschränkbar.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.env.OUT || require('path').resolve(__dirname, '../../../../../docs/sacrifice-and-sigils/screenshots');
const BASE = 'http://localhost:5199/sacrifice-and-sigils';
const SIZES = (process.env.SIZES || '2560x1440,1920x1080,1366x768,1280x720,1024x768,768x1024,390x844,844x390,360x640').split(',').map((s) => s.split('x').map(Number));
const EVENTS = ['faehrmann', 'tintenwitwe', 'knochenorakel', 'spiegelbrunnen', 'wachszieher', 'mondfinsternis', 'gluecksspieler', 'stammestreue'];
const SCENES = ['cardChoice', 'fuse', 'transfer', 'campfire', 'remove', 'merchant', 'shrine', 'copyist'];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const PREFS = { v: 2, name: 'Zeichnerin', speed: 2, tipsOff: true, motionHintSeen: true };

const screens = [
  { id: 'home', url: '/' },
  { id: 'settings', url: '/', act: async (p) => { await p.click('button[aria-label="Einstellungen"]'); await p.waitForTimeout(400); } },
  { id: 'lobby', url: '/', act: async (p) => { await p.click('.ss-menu-item:has-text("erstellen")'); await p.waitForTimeout(300); await p.click('main button.ss-seal'); await p.waitForURL(/raum/); await p.waitForTimeout(1500); } },
  ...['draft', 'extras', 'path', 'battle', 'result'].map((f) => ({ id: f, url: `/uebung?fixture=${f}`, wait: 2500 })),
  ...SCENES.map((k) => ({ id: `scene-${k}`, url: `/uebung?fixture=scene:${k}`, wait: 2200 })),
  ...EVENTS.map((e) => ({ id: `event-${e}`, url: `/uebung?fixture=event:${e}`, wait: 2200 })),
  { id: 'tutorial-tip', url: '/tutorial', prefs: { ...PREFS, tipsOff: false, seenTips: [] }, wait: 2500 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const report = [];
  for (const [w, h] of SIZES) {
    const touch = w < 1024 || h < 500;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: touch, deviceScaleFactor: 1 });
    for (const sc of screens) {
      if (ONLY && !ONLY.includes(sc.id)) continue;
      const p = await ctx.newPage();
      p.setDefaultTimeout(6000);
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      try {
        await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
        await p.evaluate((pr) => localStorage.setItem('ss_prefs_v1', JSON.stringify(pr)), sc.prefs || PREFS);
        await p.goto(BASE + sc.url, { waitUntil: 'networkidle' });
        await p.waitForTimeout(sc.wait || 1000);
        if (sc.act) await sc.act(p);
        // Laufende Animationen abschließen
        const skip = await p.$('button[aria-label="Alle Animationen überspringen"]'); if (skip) await skip.click().catch(() => {});
        await p.waitForTimeout(500);
        const file = `${OUT}/${sc.id}-${w}x${h}.png`;
        await p.screenshot({ path: file });
        const issues = await p.evaluate(({ touch }) => {
          const out = [];
          const de = document.documentElement;
          if (de.scrollWidth > innerWidth + 1) out.push(`horizontal scroll ${de.scrollWidth}>${innerWidth}`);
          const vis = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && el.offsetParent !== null; };
          for (const el of document.querySelectorAll('button, a, [role="button"], input, select')) {
            if (!vis(el) || el.closest('[aria-hidden="true"]')) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30);
            // Nur Dinge, die in der Seite (nicht in scrollenden Bereichen) außerhalb liegen
            const inScroller = (() => { for (let n = el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return true; } return false; })();
            if (!inScroller && (r.right > innerWidth + 1 || r.left < -1)) out.push(`offscreen-x: ${label}`);
            // Checkbox/Slider zählen über ihr Label
            const tgt = (el.type === 'checkbox' || el.type === 'range') && el.closest('label') ? el.closest('label').getBoundingClientRect() : r;
            if (touch && (tgt.height < 44 || (tgt.width < 44 && el.type !== 'range')) && !el.closest('.ss-hand, .ss-table, svg, .ss-draft-card, .ss-card')) out.push(`small ${Math.round(tgt.width)}x${Math.round(tgt.height)}: ${label}`);
          }
          return out;
        }, { touch });
        const docH = await p.evaluate(() => document.documentElement.scrollHeight);
        report.push({ screen: sc.id, size: `${w}x${h}`, docHeight: docH, issues, errors });
      } catch (e) {
        report.push({ screen: sc.id, size: `${w}x${h}`, error: String(e.message || e).slice(0, 200) });
      }
      await p.close();
    }
    await ctx.close();
    console.log('done', w, h); fs.writeFileSync(process.env.REPORT || 'screenshot-report.json', JSON.stringify(report, null, 1));
  }
  fs.writeFileSync(process.env.REPORT || 'screenshot-report.json', JSON.stringify(report, null, 1));
  await b.close();
})();
