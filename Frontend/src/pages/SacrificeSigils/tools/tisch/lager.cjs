// Lager der Moorwanderung am Tisch (Rebuild Phase 6): allein am Tisch, Lager-Blatt mit Feuerschale, Zettel je
// Nachbartisch, Mitspieler-Zettel, Deck auffächern; Zettel anklicken = an den Nachbartisch schauen (fremder Kampf am
// eigenen Brett, Gestalt setzt sich, Blick von der Seite), „Zurück ins Lager“. Ausweichweg ?tisch=alt.
// Aufruf: node lager.cjs · Bilder: Temp-Ordner ss-tisch/lager
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "lager");
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
    let watched = false;
    for (const extra of ["", "&players=6", "&players=3&zirkel=gezeiten", "&players=5"]) {
      const page = await open("camp", extra);
      await page.waitForFunction(() => window.__ssRoom?.stats().stage === "camp" && !document.querySelector(".st-root[hidden]"), { timeout: 60000 }).catch(() => {});
      await wait(2000);
      let s = await stats(page);
      const tables = (s?.notes || []).filter((n) => n.startsWith("tisch:"));
      check(`Lager am Tisch (${extra || "4 Spieler"}): niemand gegenüber, Zettel je Nachbartisch, keine Fortschrittsleiste`,
        s?.stage === "camp" && s.seated === false && !(await page.evaluate(() => !!document.querySelector(".ss-run-bar"))),
        JSON.stringify({ stage: s?.stage, sitzt: s?.seated, tische: tables.length }));
      await shot(page, `0-lager${extra.replace(/[&=]/g, "_")}`);
      if (!extra) {
        await aim(page, { type: "note", id: "mitspieler" });
        const t = await tip(page);
        check("Mitspieler-Zettel: Tooltip nennt Siegel und was sie tun", /Siegeln/.test(t), t.slice(0, 120));
        await aim(page, { type: "deck", pile: "main" });
        await page.mouse.down(); await page.mouse.up();
        await wait(900);
        s = await stats(page);
        check("Stapel anklicken fächert das Deck auf", s.hand > 0, `Handkarten: ${s.hand}`);
        await shot(page, "1-deck");
        await page.keyboard.press("Escape");
        await wait(500);
        s = await stats(page);
        check("Esc legt das Deck zurück", s.hand === 0, `Handkarten: ${s.hand}`);
        if (s.notes.includes("totem")) {
          await aim(page, { type: "note", id: "totem" });
          await page.mouse.down(); await page.mouse.up();
          await wait(600);
          const benchOpen = await page.evaluate(() => !!document.querySelector('[aria-label="Totems umbauen"]'));
          await shot(page, "1-werkbank");
          await page.keyboard.press("Escape");
          await wait(400);
          const benchClosed = await page.evaluate(() => !document.querySelector('[aria-label="Totems umbauen"]') && !document.querySelector(".st-pause"));
          check("Zettel „Totems umbauen“ öffnet die Werkbank, Esc schließt sie (ohne Pausenmenü)", benchOpen && benchClosed, JSON.stringify({ offen: benchOpen, zu: benchClosed }));
        } else check("Zettel „Totems umbauen“ liegt (Probe hat Totem-Teile)", false, JSON.stringify(s.notes));
      }
      if (!tables.length || watched) { await page.close(); continue; }
      // An den Nachbartisch schauen
      await aim(page, { type: "note", id: tables[0] });
      const t2 = await tip(page);
      await page.mouse.down(); await page.mouse.up();
      await page.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 8000 }).catch(() => {});
      await wait(2200);
      s = await stats(page);
      check("Zettel anklicken: fremder Kampf auf dem eigenen Brett, Gestalt sitzt, Blick von der Seite",
        s.stage === "battle" && s.seated === true && s.sat > 0.99 && s.pose === "seite" && s.cards - s.hand - s.loose - s.oppHand > 0,
        JSON.stringify({ tip: t2.slice(0, 70), stage: s.stage, sitzt: s.seated, blick: s.pose, karten: s.cards - s.hand - s.loose - s.oppHand, maske: s.mask }));
      await shot(page, "2-nachbartisch");
      const zur = await aim(page, { type: "note", id: "zurueck" });
      check("Zettel „Zurück ins Lager“ ist im Bild", !!zur && zur.x > 0 && zur.x < W && zur.y > 0 && zur.y < H, JSON.stringify(zur));
      await page.mouse.down(); await page.mouse.up();
      await page.waitForFunction(() => window.__ssRoom?.stats().stage === "camp", { timeout: 8000 }).catch(() => {});
      await wait(1500);
      s = await stats(page);
      check("Zurück ins Lager: Gestalt steht auf, Lager liegt wieder", s.stage === "camp" && s.seated === false, JSON.stringify({ stage: s.stage, sitzt: s.seated }));
      // Zweiter Weg zurück: Esc → Pausenmenü → „Zurück ins Lager“
      await aim(page, { type: "note", id: tables[0] });
      await page.mouse.down(); await page.mouse.up();
      await page.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 8000 }).catch(() => {});
      await wait(800);
      await page.mouse.move(5, 5);
      await page.keyboard.press("Escape");
      await wait(400);
      const btn = await page.$$eval(".st-pause button", (bs) => bs.map((b) => b.textContent));
      await page.evaluate(() => [...document.querySelectorAll(".st-pause button")].find((b) => /Zurück ins Lager/.test(b.textContent))?.click());
      await wait(1200);
      s = await stats(page);
      check("Pausenmenü am Nachbartisch: „Zurück ins Lager“, kein Aufgeben", s.stage === "camp" && btn.some((b) => /Zurück ins Lager/.test(b)) && !btn.some((b) => /aufgeben/i.test(b)), JSON.stringify(btn));
      watched = true;
      await page.close();
    }
    if (!watched) check("In keiner Probe lief ein Kampf an einem Nachbartisch", false);

    // Ausweichweg
    const pa = await open("camp", "&tisch=alt");
    await wait(4000);
    const old = await pa.evaluate(() => !document.querySelector(".st-root:not([hidden])") && !!document.querySelector(".ss-run-bar"));
    check("Ausweichweg (alt): bisheriges Lager mit Fortschrittsleiste", old);
    await pa.close();
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
