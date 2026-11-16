// Dauerlauf am neuen Tisch: spielt einen ganzen Kampf (ziehen, erste spielbare Karte legen, Zug beenden), bis der
// Kampf endet und die nächste Phase kommt. Prüft dabei Konsolenfehler und Bildzeiten. Aufruf: node soak.cjs [fixture]
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "soak");
require("fs").mkdirSync(OUT, { recursive: true });
const fixture = process.argv[2] || "showcase";
const W = 1920, H = 1080;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 2, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
    // Bildzeiten mitschreiben
    window.__frames = [];
    let last = performance.now();
    const f = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 400)));
  await page.goto(`${process.env.SS_BASE || "http://localhost:5173"}/sacrifice-and-sigils/uebung?fixture=${fixture}&tisch=neu&ki=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
  await wait(2000);
  await page.screenshot({ path: path.join(OUT, `${fixture}-start.png`) });
  const at = (what) => page.evaluate((w) => window.__ssRoom?.locate(w), what);
  const clickAt = async (what) => { const p = await at(what); if (p) { await page.mouse.click(p.x, p.y); } return !!p; };
  const alive = () => page.evaluate(() => !!document.querySelector("[data-table]"));
  const info = () => page.evaluate(() => ({ pose: window.__ssRoom?.pose, cards: window.__ssRoom?.stats().cards, toast: document.querySelector(".st-toast")?.textContent || null, banner: document.querySelector(".st-banner")?.textContent || null }));
  let turns = 0;
  for (; turns < 30 && await alive(); turns++) {
    // warten, bis ich dran bin (Blick „brett“)
    for (let i = 0; i < 60 && await alive(); i++) { if ((await info()).pose === "brett") break; await wait(500); }
    if (!await alive()) break;
    await wait(600);
    await clickAt({ type: turns % 2 ? "sideDeck" : "deck" });
    await wait(900);
    // erste Handkarte versuchen: nehmen, auf ein freies Frontfeld legen (klappt nur bei Karten ohne Opfer)
    await clickAt({ type: "hand", index: 0 });
    await wait(300);
    for (let lane = 0; lane < 4; lane++) { await clickAt({ type: "slot", row: "ownFront", lane }); await wait(120); }
    await page.mouse.click(W / 2, H / 2, { button: "right" });
    await wait(200);
    await page.keyboard.press("Space");
    await wait(1500);
    const i = await info();
    console.log(`Zug ${turns + 1}`, JSON.stringify(i));
    if (turns === 1) await page.screenshot({ path: path.join(OUT, `${fixture}-zug2.png`) });
    if (i.banner) { await page.screenshot({ path: path.join(OUT, `${fixture}-ende.png`) }); }
  }
  await wait(4000);
  await page.screenshot({ path: path.join(OUT, `${fixture}-danach.png`) });
  const frames = await page.evaluate(() => { const d = window.__frames.slice(120).sort((a, b) => a - b); return { n: d.length, p50: +d[Math.floor(d.length * 0.5)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), p99: +d[Math.floor(d.length * 0.99)].toFixed(1), max: +d[d.length - 1].toFixed(1), over33: d.filter((x) => x > 33).length }; });
  console.log("Züge", turns, "Tisch noch da:", await alive(), "Phase danach:", await page.evaluate(() => document.querySelector(".ss-gamebar .ss-title")?.textContent || document.title));
  console.log("Bildzeiten ms", JSON.stringify(frames));
  console.log(logs.length ? logs.slice(0, 12).join("\n") : "keine Konsolenfehler");
  await browser.close();
})();
