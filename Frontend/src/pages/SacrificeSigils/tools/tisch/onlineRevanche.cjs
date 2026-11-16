// Ergebnis und Revanche online am Tisch mit zwei Browsern (Rebuild Phase 4): Anna gibt im Kampf auf → beide sehen das
// Ergebnis am selben Tisch → Bert zündet eine Kerze an (Anna sieht seine brennen) → Anna auch → neuer Draft.
// Vorher starten wie bei online.cjs: onlineServer.cjs und ein Dev-Server, dessen /socket.io dorthin zeigt.
// Aufruf: node onlineRevanche.cjs · Bilder: Temp-Ordner ss-tisch/online-revanche
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "online-revanche");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const SERVER = process.env.SS_SERVER || "http://127.0.0.1:3001";
const W = 1600, H = 900;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const logs = [];
  const results = [];
  const check = (name, ok, info = "") => { results.push(`${ok ? "ok  " : "FEHL"} ${name}${info !== "" ? " — " + info : ""}`); };
  const seat = async (name, mask) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((n, m) => {
      try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 2, tipsOff: true, table3d: true, mask: m, seenTips: [], name: n })); } catch {}
    }, name, mask);
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|ERR_CONNECTION|WebSocket|401|403|404/.test(m.text())) logs.push(`${name} ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push(`${name} pageerror: ` + String(e).slice(0, 400)));
    return { page, name };
  };
  const stats = (page) => page.evaluate(() => window.__ssRoom?.stats() || null);
  const toast = (page) => page.evaluate(() => document.querySelector(".st-toast")?.textContent || null);
  const until = async (page, stage, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await stats(page))?.stage === stage) return true; await wait(300); } return false; };
  const candle = async (page) => { const p = await page.evaluate(() => window.__ssRoom.locate({ type: "candle", index: 0 })); await page.mouse.move(p.x, p.y); await wait(200); await page.mouse.click(p.x, p.y); };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  const A = await seat("Anna", "rabe");
  await A.page.goto(`${BASE}/sacrifice-and-sigils/raum/neu`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await A.page.waitForFunction(() => /\/raum\/[A-Z0-9]{5}$/.test(location.pathname), { timeout: 30000 });
  const code = await A.page.evaluate(() => location.pathname.split("/").pop());
  const B = await seat("Bert", "mond");
  await B.page.goto(`${BASE}/sacrifice-and-sigils/raum/${code}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await A.page.waitForFunction(() => window.__ssRoom?.stats().stage === "lobby" || !!document.querySelector("button.ss-seal"), { timeout: 30000 });
  await B.page.waitForFunction(() => window.__ssRoom?.stats().stage === "lobby" || !!document.querySelector("button.ss-seal"), { timeout: 30000 });
  await wait(1500);
  await wait(500);
  const ready = async (page) => { const flat = await page.evaluate(() => { const b = [...document.querySelectorAll("button.ss-seal")].find((x) => /Bereit/i.test(x.textContent)); b?.click(); return !!b; }); if (!flat) { await page.mouse.move(5, 5); await page.keyboard.press("Space"); } return true; };
  await ready(A.page);
  await ready(B.page);
  await wait(1500);
  const st = await (await fetch(`${SERVER}/auto?code=${code}&turn=2`)).json();
  check("Match läuft bis in den Kampf", st.phase === "battle", JSON.stringify(st));
  await Promise.all([until(A.page, "battle", 60000), until(B.page, "battle", 60000)]);
  await wait(3000);
  await Promise.all([A.page, B.page].map((p) => p.evaluate(() => { window.__ssRoom.__marke = "kampf"; })));

  // Anna gibt über das Pausenmenü auf
  await A.page.keyboard.press("Escape");
  await wait(300);
  await A.page.evaluate(() => [...document.querySelectorAll(".st-pause button")].find((b) => b.textContent.trim() === "Aufgeben")?.click());
  await wait(300);
  await A.page.evaluate(() => [...document.querySelectorAll(".st-pause .st-pause-row button")].find((b) => b.textContent.trim() === "Aufgeben")?.click());
  const [ra, rb] = await Promise.all([until(A.page, "result"), until(B.page, "result")]);
  check("Aufgeben: beide sehen das Ergebnis am Tisch", ra && rb);
  await wait(1500);
  check("Ergebnis: derselbe Tisch wie im Kampf (bei beiden)", (await A.page.evaluate(() => window.__ssRoom.__marke === "kampf")) && (await B.page.evaluate(() => window.__ssRoom.__marke === "kampf")));
  await shot(A.page, "anna-ergebnis");
  await shot(B.page, "bert-ergebnis");
  console.log("Anna:", await toast(A.page), "· Bert:", await toast(B.page));

  // Bert will eine Revanche: bei ihm brennt die linke (eigene), bei Anna die rechte (seine)
  await candle(B.page);
  await wait(1200);
  const [sa, sb] = await Promise.all([stats(A.page), stats(B.page)]);
  check("Revanche: Berts Kerze brennt — bei ihm links, bei Anna rechts", JSON.stringify(sb.candles) === "[true,false]" && JSON.stringify(sa.candles) === "[false,true]", `${JSON.stringify(sb.candles)} / ${JSON.stringify(sa.candles)}`);
  await shot(A.page, "anna-bert-will");
  console.log("Anna:", await toast(A.page), "· Bert:", await toast(B.page));
  await candle(A.page);
  const [da, db] = await Promise.all([until(A.page, "draft"), until(B.page, "draft")]);
  check("Revanche: beide wollen — neuer Draft am selben Tisch", da && db && (await A.page.evaluate(() => window.__ssRoom.__marke === "kampf")));
  await wait(1500);
  await shot(A.page, "anna-neuer-draft");

  console.log(results.join("\n"));
  console.log(logs.length ? logs.slice(0, 12).join("\n") : "keine Konsolenfehler");
  await browser.close();
})().catch((e) => { console.error("Abbruch:", e); process.exit(1); });
