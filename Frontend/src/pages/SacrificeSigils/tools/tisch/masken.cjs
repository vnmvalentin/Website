// Masken der Moorwanderung am Tisch (Rebuild Phase 6): vier eigene NPC-Masken (Kiemen, Muschel, Eisen, Schuppe),
// Bosse mit Dornenkrone, Phasenwechsel des Bosses (Hände heben, Sprung in der Maske, Fäuste auf den Tisch).
// Der Phasenwechsel wird hier direkt in der Szene ausgelöst (room.play) — ein Stand kurz vor dem Ende von Phase 1
// lässt sich nicht als Fixture abgreifen. Aufruf: node masken.cjs · Bilder: Temp-Ordner ss-tisch/masken
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "masken");
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
    // ── Boss: Krone, dann Phasenwechsel ──
    const page = await open("boss");
    await page.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector(".ss-boss-intro"), { timeout: 8000 }).catch(() => {});
    await wait(1500);
    let s = await stats(page);
    check("Boss sitzt mit Maske und Dornenkrone (Phase 1, kein Sprung)", s.seated && s.decor === "true|false", JSON.stringify({ maske: s.mask, schmuck: s.decor }));
    await page.mouse.move(5, 5);
    await page.evaluate(() => window.__ssRoom.setPose("gegenueber"));
    await wait(1200);
    await shot(page, "0-boss-krone");
    await page.screenshot({ path: path.join(OUT, "0-boss-krone-nah.png"), clip: { x: 760, y: 0, width: 400, height: 260, scale: 2 } });
    await page.evaluate(() => window.__ssRoom.play({ type: "bossPhase", phase: 2, seat: 1 }, 1600));
    await wait(700);
    s = await stats(page);
    check("Phasenwechsel: Sprung in der Maske erscheint", s.decor === "true|true", s.decor);
    await shot(page, "1-boss-sprung");
    await page.screenshot({ path: path.join(OUT, "1-boss-sprung-nah.png"), clip: { x: 760, y: 0, width: 400, height: 260, scale: 2 } });
    await wait(700);
    await shot(page, "2-boss-faeuste");
    await page.close();

    // ── NPC ohne Boss: keine Krone ──
    const pf = await open("fight");
    await pf.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 60000 }).catch(() => {});
    await wait(1500);
    s = await stats(pf);
    check("Gewöhnlicher NPC: kein Schmuck", s.decor === "false|false" || s.decor === "", JSON.stringify({ maske: s.mask, schmuck: s.decor }));
    // Die vier neuen Masken nacheinander
    await pf.mouse.move(5, 5);
    await pf.evaluate(() => window.__ssRoom.setPose("gegenueber"));
    await wait(1200);
    for (const id of ["kiemen", "muschel", "eisen", "schuppe"]) {
      await pf.evaluate((x) => window.__ssRoom.setMask(x), id);
      await wait(400);
      s = await stats(pf);
      check(`Maske „${id}“ lässt sich aufsetzen`, s.mask === id, s.mask);
      await pf.screenshot({ path: path.join(OUT, `3-maske-${id}.png`), clip: { x: 760, y: 0, width: 400, height: 260, scale: 2 } });
    }
    await pf.close();
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
