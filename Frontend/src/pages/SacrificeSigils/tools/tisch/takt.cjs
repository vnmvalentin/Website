// Misst den Takt am neuen Tisch: vier Angreifer, Zug beenden per Leertaste. Macht dabei eine Bildfolge des Angriffs.
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "takt");
require("fs").mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fixture = process.argv[2] || "attack4";
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 1, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
    window.__frames = [];
    let last = performance.now();
    const f = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 400)));
  await page.goto(`${process.env.SS_BASE || "http://localhost:5173"}/sacrifice-and-sigils/uebung?fixture=${fixture}&tisch=neu`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
  await wait(2500);
  await page.mouse.move(30, 500);
  // erst weiter, wenn der Kampf bedienbar ist (das Bauteil lädt beim ersten Mal nach)
  await page.waitForFunction(() => window.__ssRoom?.stats().canEnd, { timeout: 30000 });
  await page.evaluate(() => { window.__ssEvents = []; window.__frames.length = 0; });
  await page.keyboard.press("Space");
  // Bildfolge der ersten 2,4 s
  for (let i = 0; i < 12; i++) { await page.screenshot({ path: path.join(OUT, `${fixture}-${String(i).padStart(2, "0")}.png`) }); }
  await wait(2500);
  const ev = await page.evaluate(() => window.__ssEvents);
  const t0 = ev.find((e) => e.type === "attackPhase")?.t ?? ev[0]?.t;
  const line = ev.map((e) => `${Math.round(e.t - t0)}:${e.type}`).join("  ");
  console.log(line);
  const attacks = ev.filter((e) => e.type === "attack");
  const firstHit = ev.find((e) => ["damage", "scale", "shield"].includes(e.type) && e.t > (attacks[0]?.t ?? 0));
  const end = ev.find((e) => e.type === "turnEnd");
  console.log("Angreifer:", attacks.length, "· erster Stoß → Treffer:", attacks[0] && firstHit ? Math.round(firstHit.t - attacks[0].t) + " ms" : "-", "· Angriffsphase gesamt:", end ? Math.round(end.t - t0) + " ms" : "-");
  const frames = await page.evaluate(() => { const d = window.__frames.slice().sort((a, b) => a - b); return { n: d.length, p50: +d[Math.floor(d.length * 0.5)].toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1), over20: d.filter((x) => x > 20).length }; });
  console.log("Bildzeiten ms (mit Screenshots)", JSON.stringify(frames));
  console.log(logs.length ? logs.slice(0, 10).join("\n") : "keine Konsolenfehler");
  await browser.close();
})();
