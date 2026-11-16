// Moorwanderung am Tisch (Rebuild Phase 6): NPC-Kampf, Boss (Auftritt + Kampf) und Duell laufen am Tisch im
// Kerzenlicht; der NPC trägt eine Maske passend zu seiner Gestalt, Hausregel und Siegel liegen als Zettel links neben
// dem Brett; Aufgeben im Pausenmenü fragt nach dem ganzen Run. Ausweichweg ?tisch=alt.
// Aufruf: node moor.cjs · Bilder: Temp-Ordner ss-tisch/moor
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "moor");
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
    await page.goto(`${BASE}/sacrifice-and-sigils/moorwanderung?fixture=${fixture}${extra}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    return page;
  };
  const stats = (page) => page.evaluate(() => window.__ssRoom?.stats() || null);
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  try {
    for (const fx of ["fight", "boss", "duel"]) {
      const page = await open(fx);
      const atTable = await page.waitForFunction(() => window.__ssRoom?.stats().stage === "battle" && !document.querySelector(".st-root[hidden]"), { timeout: 60000 }).then(() => true, () => false);
      await wait(2500);
      const s = await stats(page);
      const bar = await page.evaluate(() => !!document.querySelector(".ss-gamebar"));
      check(`${fx}: Kampf am Tisch, keine alte Kopfzeile, Zettel „lauf“ liegt`, atTable && !bar && s?.notes !== undefined, JSON.stringify({ stage: s?.stage, maske: s?.mask, kopfzeile: bar }));
      // Zettel: Tooltip
      const p = await page.evaluate(() => window.__ssRoom.locate({ type: "note", id: "lauf" }));
      if (p) {
        await page.mouse.move(p.x, p.y); await wait(700);
        const q = await page.evaluate(() => window.__ssRoom.locate({ type: "note", id: "lauf" }));
        await page.mouse.move(q.x, q.y); await wait(400);
      }
      const tip = await page.evaluate(() => document.querySelector(".ss-tip")?.textContent || "");
      check(`${fx}: Zettel nennt Gegner${fx === "duel" ? "" : " und Hausregel"} und Siegel`, /siegel/i.test(tip) && (fx === "duel" || /Hausregel/.test(tip)), tip.slice(0, 120));
      await page.mouse.move(W / 2, H * 0.4);
      await wait(300);
      await shot(page, `${fx}`);
      // Pausenmenü: Aufgeben fragt nach dem ganzen Run
      await page.keyboard.press("Escape");
      await wait(300);
      await page.evaluate(() => [...document.querySelectorAll(".st-pause button")].find((b) => b.textContent.trim() === "Aufgeben")?.click());
      await wait(200);
      const ask = await page.evaluate(() => [...document.querySelectorAll(".st-pause .st-pause-row span")].map((e) => e.textContent).find((t) => /aufgeben/i.test(t)) || "");
      check(`${fx}: Aufgeben fragt nach dem ganzen Run`, /ganzen Run/.test(ask), ask);
      await page.close();
    }
    // NPC-Maske: verschiedene NPCs, verschiedene Masken (über mehrere Zirkel/Spielerzahlen)
    const masks = new Set();
    for (const extra of ["&players=2", "&players=3&zirkel=gezeiten", "&players=5"]) {
      const page = await open("fight", extra);
      await page.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 60000 }).catch(() => {});
      await wait(1200);
      masks.add((await stats(page))?.mask);
      await page.close();
    }
    check("NPCs tragen eigene Masken (nicht immer dieselbe)", masks.size >= 2, [...masks].join(", "));
    // Boss-Auftritt liegt über dem Tisch
    const pb = await open("bossStart");
    await pb.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 60000 }).catch(() => {});
    await wait(600);
    const intro = await pb.evaluate(() => { const e = document.querySelector(".ss-boss-intro"); if (!e) return null; const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e.contains(top); });
    await shot(pb, "boss-auftritt");
    check("Boss-Auftritt steht über dem Tisch", intro === true, String(intro));
    await pb.close();
    // Ausweichweg
    const pa = await open("fight", "&tisch=alt");
    await wait(4000);
    const old = await pa.evaluate(() => !!document.querySelector(".ss-gamebar") && !document.querySelector(".st-root:not([hidden])"));
    check("Ausweichweg (alt): bisheriger Kampfbildschirm mit Kopfzeile", old);
    await pa.close();
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
