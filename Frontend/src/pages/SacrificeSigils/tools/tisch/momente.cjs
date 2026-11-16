// Große Momente der Moorwanderung am Tisch (Rebuild Phase 6): Duell-Ankündigung (Paarungen als Zettel auf dem leeren
// Tisch, dann setzt sich das Gegenüber zum eigenen Duell) und Siegelbruch (Wachssiegel fällt und springt, Zeile unten).
// Ausweichweg ?tisch=alt zeigt die bisherigen Vollbild-Einblendungen.
// Aufruf: node momente.cjs · Bilder: Temp-Ordner ss-tisch/momente
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "momente");
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
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  try {
    // ── Duell-Ankündigung ──
    for (const extra of ["", "&players=6"]) {
      const page = await open("duelStart", extra);
      await page.waitForFunction(() => (window.__ssRoom?.stats().notes || []).some((n) => n.startsWith("paar:")), { timeout: 60000 }).catch(() => {});
      let s = await stats(page);
      const old = await page.evaluate(() => !!document.querySelector(".ss-fx-overlay"));
      check(`Duell-Ankündigung am Tisch (${extra || "4 Spieler"}): Zettel werden gelegt, niemand sitzt, keine Vollbild-Einblendung`,
        s?.stage === "camp" && s.seated === false && !old, JSON.stringify({ stage: s?.stage, paare: (s?.notes || []).length, sitzt: s?.seated, alt: old }));
      await wait(extra ? 2200 : 1400);
      s = await stats(page);
      const pairs = s.notes.filter((n) => n.startsWith("paar:")).length;
      check("Alle Paarungen liegen", pairs === (extra ? 3 : 2), `${pairs} Zettel`);
      await shot(page, `0-ankuendigung${extra.replace(/[&=]/g, "_")}`);
      await page.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 8000 }).catch(() => {});
      await wait(1500);
      s = await stats(page);
      check("Danach: eigenes Duell, das Gegenüber setzt sich an denselben Tisch", s.stage === "battle" && s.seated === true && s.sat > 0.99, JSON.stringify({ stage: s.stage, sitzt: s.seated, sat: s.sat }));
      if (!extra) await shot(page, "1-duell");
      await page.close();
    }
    // Klick überspringt
    {
      const page = await open("duelStart");
      await page.waitForFunction(() => (window.__ssRoom?.stats().notes || []).some((n) => n.startsWith("paar:")), { timeout: 60000 }).catch(() => {});
      await page.mouse.click(W / 2, H / 2);
      await page.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 1500 }).then(() => true).catch(() => false);
      const s = await stats(page);
      check("Klick auf den Tisch überspringt die Ankündigung", s.stage === "battle", s.stage);
      await page.close();
    }

    // ── Siegelbruch ──
    {
      const page = await open("sealBreak");
      await page.waitForFunction(() => window.__ssRoom?.stats().lifeSeal, { timeout: 60000 }).catch(() => {});
      let s = await stats(page);
      const banner = await page.evaluate(() => document.querySelector(".st-banner-low")?.textContent || "");
      const old = await page.evaluate(() => !!document.querySelector(".ss-fx-overlay"));
      check("Siegelbruch am Tisch: Wachssiegel liegt, Zeile unten, keine Vollbild-Einblendung", !!s?.lifeSeal && /Siegel bricht/.test(banner) && !old, JSON.stringify({ siegel: s?.lifeSeal, zeile: banner.slice(0, 80), alt: old }));
      await wait(500);
      await shot(page, "2-siegel-faellt");
      await wait(1000);
      s = await stats(page);
      check("Das Siegel springt in zwei Hälften", s.lifeSeal === "gebrochen", s.lifeSeal);
      await shot(page, "3-siegel-gebrochen");
      await wait(2200);
      s = await stats(page);
      const gone = await page.evaluate(() => !document.querySelector(".st-banner-low"));
      check("Nach 3 s ist es weg, der Tisch bleibt", s.lifeSeal === null && gone && !!s.stage, JSON.stringify({ siegel: s.lifeSeal, zeileWeg: gone, stage: s.stage }));
      await page.close();
    }

    // ── Ausweichweg ──
    {
      const page = await open("sealBreak", "&tisch=alt");
      await wait(4500);
      const old = await page.evaluate(() => !!document.querySelector(".ss-fx-overlay .ss-sealbreak") || !!document.querySelector(".ss-run-bar"));
      check("Ausweichweg (alt): bisherige Einblendung bzw. Fortschrittsleiste", old);
      await page.close();
    }
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
