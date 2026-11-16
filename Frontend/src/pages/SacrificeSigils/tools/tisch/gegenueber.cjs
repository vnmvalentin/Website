// Prüft die Gestalt gegenüber (Rebuild Phase 3): ihre Hände führen den Zug der KI aus, dazu die sechs Gesten,
// die Masken, das Stundenglas und das Zusammensacken bei Verbindungsverlust.
// Aufruf: node gegenueber.cjs [zug|gesten|masken|glas|alles] · Bilder: Temp-Ordner ss-tisch/gegenueber
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "gegenueber");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const what = process.argv[2] || "alles";
const W = 1920, H = 1080;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const logs = [];
  const open = async (fixture, extra = "") => {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 1, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
    });
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal/.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 400)));
    await page.goto(`${BASE}/sacrifice-and-sigils/uebung?fixture=${fixture}&tisch=neu${extra}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
    await wait(2200);
    await page.mouse.move(20, H / 2);
    return page;
  };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  if (what === "zug" || what === "alles") {
    // Zug der KI: Bildfolge, dazu die Zeitpunkte der Ereignisse
    const page = await open("oppturn", "&ki=1");
    await page.evaluate(() => { window.__ssEvents = []; });
    await page.keyboard.press("Space");
    const t0 = Date.now();
    for (let i = 0; i < 44; i++) await shot(page, `zug-${String(i).padStart(2, "0")}`);
    const ev = await page.evaluate(() => window.__ssEvents);
    const first = ev[0]?.t ?? 0;
    console.log("Bildfolge über", Date.now() - t0, "ms ·", ev.map((e) => `${Math.round(e.t - first)}:${e.type}`).join(" "));
    await page.close();
  }

  if (what === "gesten" || what === "alles") {
    const page = await open("showcase");
    await page.evaluate(() => window.__ssRoom.setPose("gegenueber"));
    await wait(1400);
    for (const [id, target, times] of [["klopfen", null, [220, 180, 200]], ["nicken", null, [300, 300]], ["kopfschuetteln", null, [250, 250]],
      ["zeigen", { row: "ownFront", lane: 1 }, [450, 500]], ["haende", null, [450, 400]], ["verbeugen", null, [550, 400]]]) {
      await page.evaluate((g, tg) => window.__ssRoom.gesture(g, "opp", tg), id, target);
      let n = 0;
      for (const ms of times) { await wait(ms); await shot(page, `geste-${id}-${++n}`); }
      await wait(1500);
    }
    // Eigene Gesten über das Rad (Taste G, dann 1–6); „Zeigen“ braucht danach ein Ziel
    await page.evaluate(() => window.__ssRoom.setPose("brett"));
    await wait(1300);
    await page.keyboard.press("g");
    await wait(300);
    await shot(page, "rad");
    const rad = await page.evaluate(() => [...document.querySelectorAll(".st-wheel-item")].map((b) => b.textContent));
    console.log("Rad:", rad.join(" | "));
    await page.keyboard.press("4");
    await wait(300);
    console.log("nach Wahl „Zeigen“:", await page.evaluate(() => document.querySelector(".st-toast")?.textContent));
    const p = await page.evaluate(() => window.__ssRoom.locate({ type: "slot", row: "oppFront", lane: 2 }));
    await page.mouse.click(p.x, p.y);
    await wait(350);
    await shot(page, "eigene-zeigen");
    console.log("nach dem Zeigen:", await page.evaluate(() => document.querySelector(".st-toast")?.textContent || "(keine Meldung)"));
    await wait(1400);
    // Rechtsklick auf den leeren Tisch öffnet das Rad am Zeiger
    await page.mouse.click(400, 300, { button: "right" });
    await wait(300);
    console.log("Rad nach Rechtsklick:", await page.evaluate(() => document.querySelectorAll(".st-wheel-item").length));
    await shot(page, "rad-rechtsklick");
    await page.keyboard.press("Escape");
    await wait(200);
    console.log("Rad nach Esc:", await page.evaluate(() => document.querySelectorAll(".st-wheel-item").length));
    // Gegen die KI antwortet die Gestalt auf eine Verbeugung
    await page.evaluate(() => window.__ssRoom.setPose("gegenueber"));
    await wait(1300);
    await page.keyboard.press("g");
    await page.keyboard.press("6");
    await wait(1700);
    await shot(page, "ki-antwortet");
    await page.close();
  }

  if (what === "masken" || what === "alles") {
    const page = await open("showcase");
    await page.evaluate(() => window.__ssRoom.setPose("gegenueber"));
    await wait(1400);
    for (const id of ["wachs", "rabe", "geweih", "mond", "rinde", "drei"]) {
      await page.evaluate((m) => window.__ssRoom.setMask(m), id);
      await wait(250);
      await page.screenshot({ path: path.join(OUT, `maske-${id}.png`), clip: { x: 660, y: 0, width: 600, height: 420 } });
    }
    await page.close();
  }

  if (what === "glas" || what === "alles") {
    const page = await open("showcase");
    const clip = { x: 1500, y: 220, width: 380, height: 300 };
    const set = (tm) => page.evaluate((x) => window.__ssRoom.setTimer(x), tm);
    await set({ remaining: 50000, total: 60000, key: "a" });
    await wait(900);
    await page.screenshot({ path: path.join(OUT, "glas-1-voll.png"), clip });
    await set({ remaining: 15000, total: 60000, key: "a" });
    await wait(1200);
    await page.screenshot({ path: path.join(OUT, "glas-2-15s.png"), clip });
    await set({ remaining: 6000, total: 60000, key: "a" });
    await wait(1200);
    await page.screenshot({ path: path.join(OUT, "glas-3-6s.png"), clip });
    await set({ remaining: 60000, total: 60000, key: "b" });
    await wait(220);
    await page.screenshot({ path: path.join(OUT, "glas-4-dreht.png"), clip });
    await wait(900);
    await page.screenshot({ path: path.join(OUT, "glas-5-neu.png"), clip });
    // Verbindung weg: Gestalt sackt zusammen, ihre Kerze flackert
    await page.evaluate(() => { window.__ssRoom.setPose("gegenueber"); window.__ssRoom.setPresence({ away: true }); });
    await wait(1800);
    await shot(page, "weg");
    await page.evaluate(() => window.__ssRoom.setPresence({ away: false }));
    await wait(1200);
    await shot(page, "wieder-da");
    // Zuschauerblick
    await page.evaluate(() => window.__ssRoom.setPose("seite"));
    await wait(1500);
    await shot(page, "seite");
    await page.close();
  }

  console.log(logs.length ? logs.slice(0, 12).join("\n") : "keine Konsolenfehler");
  await browser.close();
})();
