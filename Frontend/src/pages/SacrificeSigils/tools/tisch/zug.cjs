// Spielt am neuen Tisch einen Zug durch (Karte mit Opfer legen, Zug beenden) und macht Bilder. Nur lesen/klicken.
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "play");
require("fs").mkdirSync(OUT, { recursive: true });
const tag = process.argv[2] || "p";
const [W, H] = (process.argv[3] || "1920x1080").split("x").map(Number);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 1, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
  });
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 400)));
  await page.goto((process.env.SS_BASE || "http://localhost:5173") + "/sacrifice-and-sigils/uebung?fixture=showcase&tisch=neu&ki=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  try { await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 }); } catch { logs.push("nicht bereit: " + await page.evaluate(() => document.querySelector("[data-table]")?.dataset.table)); }
  await wait(2500);
  let n = 0;
  const shot = async (name) => page.screenshot({ path: path.join(OUT, `${tag}-${String(++n).padStart(2, "0")}-${name}.png`) });
  const at = (what) => page.evaluate((w) => window.__ssRoom?.locate(w), what);
  const click = async (what, opt = {}) => {
    const p = await at(what);
    if (!p) { logs.push("nicht gefunden: " + JSON.stringify(what)); return; }
    await page.mouse.move(p.x, p.y);
    await wait(250);
    await page.mouse.click(p.x, p.y, opt);
    await wait(opt.after ?? 500);
  };
  const state = () => page.evaluate(() => ({ toast: document.querySelector(".st-toast")?.textContent || null, stats: window.__ssRoom?.stats(), pose: window.__ssRoom?.pose }));
  await page.mouse.move(20, H / 2);
  await shot("start");
  console.log("start", JSON.stringify(await state()));

  // Handkarte 0 (Aschbär, 3 Blut) nehmen
  await click({ type: "hand", index: 0 });
  await shot("genommen");
  console.log("genommen", JSON.stringify(await state()));
  // Opfer: Moorling (Lane 0), Mondluchs (Lane 1), Holzgolem (Lane 2)
  await click({ type: "slot", row: "ownFront", lane: 0 });
  await click({ type: "slot", row: "ownFront", lane: 1 });
  await shot("zwei-opfer");
  await click({ type: "slot", row: "ownFront", lane: 2 });
  await page.mouse.move(20, H / 2);
  await wait(300);
  await shot("blut-reicht");
  console.log("blut", JSON.stringify(await state()));
  // Legen auf das Feld des Mondluchs
  await click({ type: "slot", row: "ownFront", lane: 1 }, { after: 300 });
  await shot("gelegt-laeuft");
  await wait(7000);
  await page.mouse.move(20, H / 2);
  await shot("gelegt");
  console.log("gelegt", JSON.stringify(await state()));
  // Zug beenden über den Stempel
  await click({ type: "seal" }, { after: 200 });
  await shot("stempel");
  await wait(1800);
  await shot("angriff");
  await wait(5000);
  await shot("gegner-zug");
  console.log("gegner", JSON.stringify(await state()));
  await wait(16000);
  await page.mouse.move(20, H / 2);
  await shot("wieder-dran");
  console.log("dran", JSON.stringify(await state()));
  // Ziehen vom Hauptdeck, dann Pausenmenü
  await click({ type: "deck" }, { after: 1500 });
  await page.mouse.move(20, H / 2);
  await shot("gezogen");
  await page.keyboard.press("Escape");
  await wait(400);
  await shot("pause");
  await page.keyboard.press("Escape");
  // Karte ansehen (Rechtsklick auf eine Feldkarte)
  await click({ type: "slot", row: "oppFront", lane: 2 }, { button: "right" });
  await shot("ansehen");
  console.log(logs.length ? logs.join("\n") : "keine Konsolenfehler");
  await browser.close();
})();
