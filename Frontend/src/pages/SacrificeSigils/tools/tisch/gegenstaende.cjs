// Prüft am neuen Tisch: Item mit Ziel (Schere), Item ohne Ziel (Blutphiole), Hammer, Tooltip, Abbrechen per Rechtsklick.
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "tools");
require("fs").mkdirSync(OUT, { recursive: true });
const W = 1920, H = 1080;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 2, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
  });
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 400)));
  await page.goto((process.env.SS_BASE || "http://localhost:5173") + "/sacrifice-and-sigils/uebung?fixture=showcase&tisch=neu", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
  await wait(2000);
  const at = (what) => page.evaluate((w) => window.__ssRoom?.locate(w), what);
  const click = async (what, opt = {}) => { const p = await at(what); await page.mouse.move(p.x, p.y); await wait(250); await page.mouse.click(p.x, p.y, opt); await wait(700); };
  const info = () => page.evaluate(() => ({ cards: window.__ssRoom?.stats().cards, toast: document.querySelector(".st-toast")?.textContent || null, tip: document.querySelector(".ss-tip")?.textContent || null }));
  let n = 0;
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`) });
  console.log("start", JSON.stringify(await info()));
  // Schere: Item wählen, gegnerische Karte treffen
  await click({ type: "item", index: 0 });
  await shot("schere-gewaehlt");
  console.log("schere gewählt", JSON.stringify(await info()));
  await click({ type: "slot", row: "oppFront", lane: 3 });
  await wait(1500);
  await shot("schere-benutzt");
  console.log("schere benutzt", JSON.stringify(await info()));
  // Hammer: nehmen, abbrechen per Rechtsklick, wieder nehmen, eigene Karte zerstören
  await click({ type: "hammer" });
  await shot("hammer-aktiv");
  await page.mouse.click(W / 2, H * 0.3, { button: "right" });
  await wait(400);
  await click({ type: "hammer" });
  await click({ type: "slot", row: "ownFront", lane: 0 });
  await wait(1800);
  await shot("hammer-benutzt");
  console.log("hammer benutzt", JSON.stringify(await info()));
  // Totem unter dem Zeiger: Tooltip und Aufleuchten
  const p = await at({ type: "scale" });
  await page.mouse.move(p.x, p.y - 20);
  await wait(500);
  console.log("waage", JSON.stringify(await info()));
  await shot("tooltip-waage");
  console.log(logs.length ? logs.slice(0, 10).join("\n") : "keine Konsolenfehler");
  await browser.close();
})();
