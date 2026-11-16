// Rast und Ergebnis am Tisch (Rebuild Phase 4): Rast (wer beginnt?) → Kampf am selben Tisch · letzter Kampf →
// Ergebnis am selben Tisch · Ergebnis → Kerze anzünden → Revanche (neuer Draft am selben Tisch) · volle Statistik.
// Aufruf: node nachkampf.cjs · Bilder: Temp-Ordner ss-tisch/nachkampf
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "nachkampf");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const W = 1920, H = 1080;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const logs = [];
  const results = [];
  const check = (name, ok, info = "") => { results.push(`${ok ? "ok  " : "FEHL"} ${name}${info !== "" ? " — " + info : ""}`); };
  const open = async (fixture, extra = "") => {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 2, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
    });
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|401|403|404/.test(m.text())) logs.push(`${fixture} ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push(`${fixture} pageerror: ` + String(e).slice(0, 400)));
    await page.goto(`${BASE}/sacrifice-and-sigils/uebung?fixture=${fixture}${extra}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
    await wait(2500);
    await page.mouse.move(20, H / 2);
    await page.evaluate(() => { window.__ssRoom.__marke = "anfang"; });
    return page;
  };
  const stats = (page) => page.evaluate(() => window.__ssRoom?.stats() || null);
  const toast = (page) => page.evaluate(() => document.querySelector(".st-toast")?.textContent || null);
  const same = (page) => page.evaluate(() => window.__ssRoom?.__marke === "anfang");
  const at = (page, what) => page.evaluate((w) => window.__ssRoom?.locate(w), what);
  const click = async (page, what) => { const p = await at(page, what); if (!p) return false; await page.mouse.move(p.x, p.y); await wait(350); await page.mouse.click(p.x, p.y); return true; };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const until = async (page, stage, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await stats(page))?.stage === stage) return true; await wait(300); } return false; };

  // ── Rast: wer beginnt? ──
  {
    const page = await open("interlude", "&ki=1");
    let s = await stats(page);
    check("Rast: läuft am Tisch", s?.stage === "interlude", JSON.stringify({ stage: s?.stage, ichEntscheide: s?.canEnd }));
    console.log("Rast-Hinweis:", await toast(page));
    await shot(page, "rast");
    if (s?.canEnd) {
      const p = await at(page, { type: "seal" });
      await page.mouse.move(p.x, p.y);
      await wait(500);
      check("Rast: Tooltip am eigenen Stempel", /beginne/i.test(await page.evaluate(() => document.querySelector(".ss-tip")?.textContent || "")), await page.evaluate(() => document.querySelector(".ss-tip")?.textContent));
      await page.mouse.click(p.x, p.y);
    }
    check("Rast: danach beginnt der Kampf", await until(page, "battle"));
    await wait(2500);
    s = await stats(page);
    check("Rast → Kampf: derselbe Tisch, Hand ausgeteilt", (await same(page)) && s?.hand > 0, `Hand ${s?.hand}`);
    await page.mouse.move(20, H / 2);
    await shot(page, "rast-danach-kampf");
    await page.close();
  }

  // ── Letzter Kampf → Ergebnis am selben Tisch ──
  {
    const page = await open("matchend", "&ki=1");
  // erst weiter, wenn der Kampf bedienbar ist (das Bauteil lädt beim ersten Mal nach)
    await page.waitForFunction(() => window.__ssRoom?.stats().canEnd, { timeout: 30000 });
    await page.keyboard.press("Space");
    check("Match-Ende: nach dem letzten Kampf kommt das Ergebnis", await until(page, "result", 30000));
    await wait(1800);
    const s = await stats(page);
    check("Match-Ende: derselbe Tisch, Kerzen aus", (await same(page)) && JSON.stringify(s?.candles) === "[false,false]", JSON.stringify(s?.candles));
    await page.mouse.move(20, H / 2);
    await shot(page, "ergebnis-niederlage");
    console.log("Ergebnis-Hinweis:", await toast(page));
    // Keine Statistik-Seite mehr; der Zettel „Aufstehen“ führt ins Hauptmenü (zweimal zielen: die Kamera folgt der Maus)
    await page.keyboard.press("Escape");
    await wait(300);
    await shot(page, "ergebnis-menue");
    const statsBtn = await page.evaluate(() => [...document.querySelectorAll(".st-pause button")].some((x) => /Statistik/.test(x.textContent)));
    await page.keyboard.press("Escape");
    await wait(300);
    let q = await at(page, { type: "note", id: "aufstehen" });
    await page.mouse.move(q.x, q.y); await wait(700);
    q = await at(page, { type: "note", id: "aufstehen" });
    await page.mouse.move(q.x, q.y); await wait(300);
    const standTip = await page.evaluate(() => document.querySelector(".ss-tip")?.textContent || "");
    await page.mouse.click(q.x, q.y);
    const home = await until(page, "menu", 15000);
    check("Ergebnis: keine Statistik mehr, Zettel „Aufstehen“ führt ins Hauptmenü am selben Tisch", !statsBtn && home && /Aufstehen/.test(standTip), JSON.stringify({ statistik: statsBtn, menue: home, tip: standTip }));
    await page.close();
  }

  // ── Ergebnis → Kerze anzünden → Revanche ──
  {
    const page = await open("result");
    let s = await stats(page);
    check("Ergebnis: steht am Tisch (direkt geladen)", s?.stage === "result", JSON.stringify({ stage: s?.stage, karte: s?.loose }));
    await shot(page, "ergebnis");
    const p = await at(page, { type: "candle", index: 0 });
    await page.mouse.move(p.x, p.y);
    await wait(500);
    const tip = await page.evaluate(() => document.querySelector(".ss-tip")?.textContent || null);
    check("Ergebnis: Tooltip an der Kerze", /Revanche/.test(tip || ""), tip);
    await page.mouse.click(p.x, p.y);
    check("Revanche: neuer Draft beginnt", await until(page, "draft"));
    await wait(1500);
    s = await stats(page);
    check("Revanche: derselbe Tisch, Kerzen brennen wieder, Karten liegen aus", (await same(page)) && s?.candles === null && s?.loose > 0, JSON.stringify({ kerzen: s?.candles, lose: s?.loose }));
    await page.mouse.move(20, H / 2);
    await shot(page, "revanche-draft");
    await page.close();
  }

  console.log(results.join("\n"));
  console.log(logs.length ? logs.slice(0, 12).join("\n") : "keine Konsolenfehler");
  await browser.close();
})().catch((e) => { console.error("Abbruch:", e); process.exit(1); });
