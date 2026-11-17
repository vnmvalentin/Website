// Hauptmenü am Tisch (Rebuild Phase 5): Bild in mehreren Größen, leerer Platz gegenüber, Karten des Tages,
// Untermenüs (Beitreten, Übung), Übung starten → am selben Weg in den Draft; Ausweichweg ?tisch=alt.
// Aufruf: node menue.cjs · Bilder: Temp-Ordner ss-tisch/menue
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "menue");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = [[1920, 1080], [2560, 1440], [1366, 768], [1280, 1000]];

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const logs = [];
  const results = [];
  const check = (name, ok, info = "") => { results.push(`${ok ? "ok  " : "FEHL"} ${name}${info !== "" ? " — " + info : ""}`); };
  const open = async (W, H, { name = "Zeichnerin", query = "" } = {}) => {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((n) => {
      try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 2, tipsOff: true, table3d: true, seenTips: [], name: n })); } catch {}
    }, name);
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|401|403|404/.test(m.text())) logs.push(`${W}x${H} ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push(`${W}x${H} pageerror: ` + String(e).slice(0, 400)));
    await page.goto(`${BASE}/sacrifice-and-sigils${query}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    return page;
  };
  const stats = (page) => page.evaluate(() => window.__ssRoom?.stats() || null);

  try {
    // ── Bild in allen Größen ──
    for (const [W, H] of SIZES) {
      const page = await open(W, H);
      await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
      await wait(2200);
      const s = await stats(page);
      const lines = await page.$$eval(".sm-line", (els) => els.map((e) => e.textContent));
      const topbar = await page.evaluate(() => { const t = document.querySelector(".ss-topbar"); return t ? getComputedStyle(t).display : "fehlt"; });
      const fits = await page.evaluate(() => { const r = document.querySelector(".sm-root"); return r.scrollHeight <= r.clientHeight + 1; });
      check(`${W}x${H} Menü am Tisch`, s?.stage === "menu" && s?.pose === "raum" && s?.seated === false && s?.loose === 3 && lines.length === 7,
        JSON.stringify({ stage: s?.stage, pose: s?.pose, seated: s?.seated, karten: s?.loose, zeilen: lines.length }));
      check(`${W}x${H} keine Website-Leiste, Menü passt ohne Scrollen`, topbar === "none" && fits, `Leiste ${topbar}, passt ${fits}`);
      await page.screenshot({ path: path.join(OUT, `menue-${W}x${H}.png`) });
      if (W === 1920) {
        // Zeiger auf eine Menüzeile: Erklärzeile erscheint
        const line = await page.$('[data-menu="practice"]');
        await line.hover();
        await wait(250);
        const hint = await page.$eval(".sm-hint", (e) => e.textContent);
        check("Zeiger auf Zeile zeigt eine Erklärzeile", /KI/.test(hint), hint);
        // Zeiger auf eine Karte des Tages: Tooltip; anklicken: Kartenblatt
        const p = await page.evaluate(() => window.__ssRoom.locate({ type: "loose", index: 1 }));
        await page.mouse.move(p.x, p.y);
        await wait(500);
        const tip = await page.evaluate(() => document.querySelector(".ss-tip")?.textContent || "");
        check("Karte des Tages: Tooltip", /Karte des Tages/.test(tip), tip.slice(0, 60));
        await page.screenshot({ path: path.join(OUT, "menue-karte-hover.png") });
        await page.mouse.click(p.x, p.y);
        await wait(600);
        const detail = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
        check("Karte anklicken öffnet das Kartenblatt", detail);
        await page.keyboard.press("Escape");
        await wait(300);
        // Beitreten: Code-Feld, falscher Code → Meldung, Esc → zurück
        await page.click('[data-menu="join"]');
        await wait(200);
        await page.type("#sm-code", "AB");
        await page.click('[data-menu="join-go"]');
        await wait(200);
        const err = await page.evaluate(() => document.querySelector(".sm-err")?.textContent || "");
        check("Beitreten mit falschem Code meldet sich", /fünf Zeichen/.test(err), err);
        await page.screenshot({ path: path.join(OUT, "menue-beitreten.png") });
        await page.keyboard.press("Escape");
        await wait(200);
        check("Esc führt zurück ins Hauptmenü", (await page.$$(".sm-line")).length === 7);
        // Einstellungen öffnen sich ohne Leiste
        await page.click(".sm-foot .sm-quiet");
        await wait(300);
        const settings = await page.evaluate(() => { const d = document.querySelector('[role="dialog"][aria-label="Einstellungen"]'); return !!d && d.getBoundingClientRect().width > 0; });
        check("Einstellungen öffnen sich", settings);
        await page.screenshot({ path: path.join(OUT, "menue-einstellungen.png") });
        await page.keyboard.press("Escape");
        await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="Einstellungen"] button.ss-btn')?.click());
        await wait(200);
        // Übung: Gegner + Zirkel wählen, starten → Draft am Tisch (Gezeiten)
        await page.click('[data-menu="practice"]');
        await wait(250);
        await page.evaluate(() => {
          const by = (label, text) => [...document.querySelectorAll(`.sm-pick[aria-label="${label}"] .sm-word`)].find((b) => b.textContent === text)?.click();
          by("Gegner", "Leicht");
          by("Zirkel", "Gezeiten");
          by("Siege", "1");
        });
        await wait(200);
        await page.screenshot({ path: path.join(OUT, "menue-uebung.png") });
        await page.click('[data-menu="practice-go"]');
        await page.waitForFunction(() => location.pathname.endsWith("/uebung") && window.__ssRoom?.stats().stage === "draft", { timeout: 60000 });
        await wait(1500);
        const d = await stats(page);
        const opp = await page.evaluate(() => document.title);
        check("Übung startet am Tisch im Draft", d?.stage === "draft" && d?.seated === true && d?.loose > 0, JSON.stringify({ stage: d?.stage, seated: d?.seated, karten: d?.loose, titel: opp }));
        await page.screenshot({ path: path.join(OUT, "uebung-draft.png") });
      }
      await page.close();
    }
    // ── Vom Tisch ins Kartenbuch: seit Phase 5 liegt das Buch auf demselben Tisch (TableBook) — die Szene bleibt ──
    {
      const page = await open(1920, 1080);
      await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
      await wait(800);
      await page.click('[data-menu="codex"]');
      await wait(600);
      await wait(4800);
      const book = await page.evaluate(() => ({ shown: document.querySelector(".st-root")?.hidden === false, book: !!document.querySelector(".sb-book"), room: !!window.__ssRoom }));
      check("Ins Kartenbuch: Buch auf demselben Tisch, Szene bleibt", book.shown && book.book && book.room, JSON.stringify(book));
      // zurück ins Menü: der Tisch wird neu gedeckt
      await page.goBack();
      const again = await page.waitForFunction(() => window.__ssRoom?.stats().stage === "menu", { timeout: 30000 }).then(() => true, () => false);
      check("Zurück ins Menü: Tisch steht wieder", again);
      await page.close();
    }
    // ── Ohne Namen: Tisch eröffnen fragt nach dem Namen ──
    {
      const page = await open(1920, 1080, { name: "" });
      await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
      await wait(800);
      const input = await page.$("#sm-name");
      await page.click('[data-menu="create"]');
      await wait(200);
      const err = await page.evaluate(() => document.querySelector(".sm-err")?.textContent || "");
      const focused = await page.evaluate(() => document.activeElement?.id);
      check("Ohne Namen: Tisch eröffnen fragt nach dem Namen", !!input && /heißt du/.test(err) && focused === "sm-name", `${err} · Fokus ${focused}`);
      await page.screenshot({ path: path.join(OUT, "menue-ohne-name.png") });
      await page.close();
    }
    // ── Ausweichweg: bisheriger Tisch, hochkant ──
    for (const [W, H, q, name] of [[1920, 1080, "?tisch=alt", "alt"], [390, 844, "", "hochkant"]]) {
      const page = await open(W, H, { query: q });
      await wait(2500);
      const flat = await page.evaluate(() => !!document.querySelector(".ss-menu-item") && !document.querySelector(".st-root:not([hidden])"));
      check(`Ausweichweg (${name}): bisheriges Menü`, flat);
      await page.screenshot({ path: path.join(OUT, `ausweich-${name}.png`) });
      await page.close();
    }
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
