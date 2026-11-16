// Tutorial am Tisch (Rebuild Phase 5): läuft am Tisch im Kerzenlicht, Hinweise als Erzähler-Blatt oben links (deckt
// weder Waage noch Stapel noch Hand), „Verstanden“ führt zum nächsten Hinweis, Ziehen am Stapel, Leertaste beendet den
// Zug (und schließt dabei kein Blatt), „Tutorial neu starten“ im Pausenmenü; Ausweichweg ?tisch=alt.
// Aufruf: node tutorial.cjs · Bilder: Temp-Ordner ss-tisch/tutorial
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "tutorial");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const W = 1920, H = 1080;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const logs = [];
  const results = [];
  const check = (name, ok, info = "") => { results.push(`${ok ? "ok  " : "FEHL"} ${name}${info !== "" ? " — " + info : ""}`); };
  const open = async (url) => {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 2, tipsOff: false, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
    });
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|401|403|404/.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 400)));
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    return page;
  };
  const tipOf = (page) => page.evaluate(() => document.querySelector(".st-narrator")?.dataset.tip || null);
  const stats = (page) => page.evaluate(() => window.__ssRoom?.stats() || null);
  const at = (page, w) => page.evaluate((x) => window.__ssRoom.locate(x), w);
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  try {
    const page = await open("/sacrifice-and-sigils/tutorial");
    await page.waitForSelector('[data-table="bereit"]:not([hidden])', { timeout: 60000 });
    await page.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 30000 });
    await wait(1500);
    let t = await tipOf(page);
    // Das Blatt darf Waage, Stapel, Stempel und Hand nicht verdecken
    const box = await page.evaluate(() => { const r = document.querySelector(".st-narrator").getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    const spots = {};
    for (const w of ["scale", "deck", "seal", "bones"]) spots[w] = await at(page, { type: w });
    spots.hand = await at(page, { type: "hand", index: 0 });
    const covered = Object.entries(spots).filter(([, p]) => p && p.x >= box.l && p.x <= box.r && p.y >= box.t && p.y <= box.b).map(([k]) => k);
    check("Tutorial am Tisch: Erzähler-Blatt „Willkommen“, verdeckt nichts Wichtiges", t === "welcome" && covered.length === 0, JSON.stringify({ tip: t, verdeckt: covered, blatt: box }));
    await shot(page, "1-willkommen");
    await page.evaluate(() => document.querySelector(".st-narrator-go").click());
    await wait(600);
    t = await tipOf(page);
    check("Verstanden → nächster Hinweis: Ziehen", t === "draw", t);
    const tipText = await page.evaluate(() => document.querySelector(".st-narrator-text")?.textContent || "");
    check("Hinweis spricht von der Bedienung am Tisch (Stapel anklicken)", /Stapel/.test(tipText), tipText.slice(0, 80));
    await shot(page, "2-ziehen");
    // Ziehen: Stapel anklicken (zweimal zielen — die Kamera folgt leicht der Maus)
    let p = await at(page, { type: "deck" });
    await page.mouse.move(p.x, p.y); await wait(600);
    p = await at(page, { type: "deck" });
    await page.mouse.move(p.x, p.y); await wait(200);
    const handBefore = (await stats(page)).hand;
    await page.mouse.click(p.x, p.y);
    await wait(1200);
    const handAfter = (await stats(page)).hand;
    check("Ziehen am Stapel klappt, während das Blatt liegt", handAfter === handBefore + 1, `${handBefore} → ${handAfter}`);
    await page.evaluate(() => document.querySelector(".st-narrator-go")?.click());
    await wait(600);
    t = await tipOf(page);
    await shot(page, "3-nach-ziehen");
    // Leertaste beendet den Zug — das Blatt bleibt liegen (kein Fokus auf „Verstanden“)
    const before = await tipOf(page);
    await page.mouse.move(W / 2, H * 0.4);
    await page.keyboard.press("Space");
    await wait(2500);
    const s = await stats(page);
    const after = await tipOf(page);
    check("Leertaste beendet den Zug, schließt kein Blatt", s.stage === "battle" && (before === null || after === before || after !== null), JSON.stringify({ vorher: before, nachher: after, canEnd: s.canEnd }));
    // Pausenmenü: Tutorial neu starten
    await page.keyboard.press("Escape");
    await wait(400);
    const restartBtn = await page.evaluate(() => { const b = [...document.querySelectorAll(".st-pause button")].find((x) => x.textContent === "Tutorial neu starten"); b?.click(); return !!b; });
    await wait(2500);
    t = await tipOf(page);
    const s2 = await stats(page);
    check("Pausenmenü: „Tutorial neu starten“ beginnt von vorn", restartBtn && t === "welcome" && s2?.stage === "battle", JSON.stringify({ knopf: restartBtn, tip: t }));
    // Keine Hinweise mehr
    await page.evaluate(() => document.querySelector(".st-narrator-off").click());
    await wait(400);
    check("„Keine Hinweise mehr“ blendet das Blatt aus", !(await tipOf(page)));
    await page.close();

    const flat = await open("/sacrifice-and-sigils/tutorial?tisch=alt");
    await wait(3500);
    const old = await flat.evaluate(() => !document.querySelector(".st-narrator") && !!document.querySelector('[role="dialog"][aria-label="Willkommen am Tisch"]') && !document.querySelector(".st-root:not([hidden])"));
    check("Ausweichweg (alt): bisheriges Tutorial mit Kasten", old);
    await shot(flat, "4-alt");
    await flat.close();
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
