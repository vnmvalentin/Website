// Figur auf der Pfadkarte (Rückmeldung 15.11.2026): Ort anklicken → die Karte bleibt liegen, die Figur duckt sich,
// hüpft hin, federt nach, ein Ring breitet sich aus — erst danach beginnt die Szene. Bildfolge + Zeitpunkte.
// Aufruf: node figur.cjs · Bilder: Temp-Ordner ss-tisch/figur
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "figur");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const W = 1920, H = 1080;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const logs = [];
  const results = [];
  const check = (name, ok, info = "") => { results.push(`${ok ? "ok  " : "FEHL"} ${name}${info !== "" ? " — " + info : ""}`); };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 1, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
    });
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|401|403|404/.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 400)));
    await page.goto(`${BASE}/sacrifice-and-sigils/uebung?fixture=path`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.__ssRoom?.stats().stage === "map", { timeout: 60000 });
    await wait(2000);
    // erreichbare Marke der ersten Ebene suchen (die Figur steht am Start)
    let target = null;
    for (let st = 0; st < 7 && !target; st++) {
      const p = await page.evaluate((s) => window.__ssRoom.locate({ type: "node", lv: 0, st: s }), st);
      if (!p) continue;
      const pick = await page.evaluate((q) => window.__ssRoom.pickAtScreen(q.x, q.y), p);
      if (pick?.type === "node") target = { p, st };
    }
    if (!target) throw new Error("keine Marke gefunden");
    await page.mouse.move(target.p.x, target.p.y); await wait(700);
    const p2 = await page.evaluate((s) => window.__ssRoom.locate({ type: "node", lv: 0, st: s }), target.st);
    await page.mouse.move(p2.x, p2.y); await wait(300);
    await page.mouse.click(p2.x, p2.y);
    const t0 = Date.now();
    const seen = [];
    for (const ms of [120, 450, 750, 1050, 1300]) {
      while (Date.now() - t0 < ms) await wait(10);
      const st = await page.evaluate(() => window.__ssRoom.stats().stage);
      seen.push(`${ms}:${st}`);
      await page.screenshot({ path: path.join(OUT, `weg-${String(ms).padStart(4, "0")}.png`), clip: { x: 260, y: 0, width: 1400, height: 1080 } });
    }
    await page.waitForFunction(() => window.__ssRoom.stats().stage === "scene", { timeout: 10000 }).catch(() => {});
    const sceneAt = Date.now() - t0;
    check("Nach dem Klick bleibt die Karte liegen, bis die Figur angekommen ist; dann die Szene", seen.slice(0, 3).every((x) => x.endsWith(":map")) && sceneAt >= 1300 && sceneAt < 3500, `${seen.join(" ")} · Szene nach ${sceneAt} ms`);
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
