// Ende der Moorwanderung am Tisch (Rebuild Phase 6): Blatt mit dem Sieger, Podest aus drei Holzblöcken (wachsen aus dem
// Tisch, Lebenssiegel obenauf), Namenszettel fächern Decks auf, Rangliste links, Kerze = neuer Run, „Aufstehen“.
// Ausweichweg ?tisch=alt. Aufruf: node runende.cjs · Bilder: Temp-Ordner ss-tisch/runende
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "runende");
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
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|401|403|404/.test(m.text())) logs.push(`${fixture}${extra} ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push(`${fixture}${extra} pageerror: ` + String(e).slice(0, 400)));
    await page.goto(`${BASE}/sacrifice-and-sigils/moorwanderung?fixture=${fixture}${extra}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    return page;
  };
  const stats = (page) => page.evaluate(() => window.__ssRoom?.stats() || null);
  const at = (page, w) => page.evaluate((x) => window.__ssRoom.locate(x), w);
  const aim = async (page, w) => {
    let p = await at(page, w);
    if (!p) return null;
    await page.mouse.move(p.x, p.y); await wait(700);
    p = await at(page, w);
    await page.mouse.move(p.x, p.y); await wait(400);
    return p;
  };
  const tip = (page) => page.evaluate(() => document.querySelector(".ss-tip")?.textContent || "");
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  try {
    for (const extra of ["", "&players=2", "&players=6"]) {
      const page = await open("over", extra);
      await page.waitForFunction(() => window.__ssRoom?.stats().stage === "result" && !document.querySelector(".st-root[hidden]"), { timeout: 60000 }).catch(() => {});
      await wait(400);
      await shot(page, `0-steigt${extra.replace(/[&=]/g, "_")}`);
      await wait(1800);
      let s = await stats(page);
      const n = extra === "&players=2" ? 2 : 3;
      const bar = await page.evaluate(() => !!document.querySelector(".ss-run-bar"));
      check(`Ende am Tisch (${extra || "4 Spieler"}): Podest mit ${n} Blöcken, Namenszettel, keine Fortschrittsleiste`,
        s?.stage === "result" && s.podium === n && s.notes.filter((x) => x.startsWith("platz:")).length === n && !bar, JSON.stringify({ stage: s?.stage, podest: s?.podium, zettel: s?.notes, leiste: bar }));
      await shot(page, `1-podest${extra.replace(/[&=]/g, "_")}`);
      if (extra) { await page.close(); continue; }
      await aim(page, { type: "note", id: "rangliste" });
      const t = await tip(page);
      check("Rangliste: Tooltip nennt alle mit Zahlen", (t.match(/Duelle/g) || []).length === 4, t.slice(0, 140));
      const first = s.notes.find((x) => x.startsWith("platz:"));
      await aim(page, { type: "note", id: first });
      const t2 = await tip(page);
      await page.mouse.down(); await page.mouse.up();
      await wait(900);
      s = await stats(page);
      check("Namenszettel anklicken fächert das Deck dieses Spielers auf", s.hand > 0, JSON.stringify({ tip: t2.slice(0, 80), karten: s.hand }));
      await shot(page, "2-deck");
      await page.keyboard.press("Escape");
      await wait(500);
      s = await stats(page);
      check("Esc legt es zurück", s.hand === 0, String(s.hand));
      const up = await aim(page, { type: "note", id: "aufstehen" });
      check("Zettel „Aufstehen“ liegt im Bild", !!up && up.x > 0 && up.x < W && up.y > 0 && up.y < H, JSON.stringify(up));
      // Neuer Run: eigene Kerze anklicken
      await aim(page, { type: "candle", index: 0 });
      const t3 = await tip(page);
      await page.mouse.down(); await page.mouse.up();
      await page.waitForFunction(() => window.__ssRoom?.stats().stage === "starter", { timeout: 10000 }).catch(() => {});
      s = await stats(page);
      check("Kerze anzünden: neuer Run beginnt am selben Tisch (Startdecks)", s.stage === "starter", JSON.stringify({ tip: t3.slice(0, 50), stage: s.stage }));
      await page.close();
    }
    const pa = await open("over", "&tisch=alt");
    await wait(4000);
    const old = await pa.evaluate(() => !!document.querySelector(".ss-podium"));
    check("Ausweichweg (alt): bisheriges Ergebnis mit Podium", old);
    await pa.close();
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
