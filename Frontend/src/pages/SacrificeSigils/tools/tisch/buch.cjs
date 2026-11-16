// Das Buch des Zeichners (Rebuild Phase 5): Hauptmenü → Kartenbuch am selben Tisch, Kapitel über die Lesebändchen,
// Umblättern (Pfeil, Taste, Mausrad), Filter verkleinern das Album, Karte anklicken → Kartenblatt, Verweis Regeln →
// Karten, Esc → Hauptmenü; Bilder in drei Größen; Ausweichweg ?tisch=alt.
// Aufruf: node buch.cjs · Bilder: Temp-Ordner ss-tisch/buch
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "buch");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const logs = [];
  const results = [];
  const check = (name, ok, info = "") => { results.push(`${ok ? "ok  " : "FEHL"} ${name}${info !== "" ? " — " + info : ""}`); };
  const open = async (W, H, url) => {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 2, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
    });
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|401|403|404/.test(m.text())) logs.push(`${W}x${H} ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push(`${W}x${H} pageerror: ` + String(e).slice(0, 400)));
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    return page;
  };
  const book = (page) => page.evaluate(() => {
    const n = [...document.querySelectorAll(".sb-num")].map((e) => e.textContent);
    const fl = document.querySelector(".sb-flow");
    const v = document.querySelector(".sb-view");
    return {
      chapter: fl?.dataset.chapter, nums: n, transform: fl?.style.transform, cards: document.querySelectorAll(".sb-slot").length,
      count: document.querySelector(".sb-count")?.textContent || "",
      // was auf dem sichtbaren Aufschlag liegt, darf nicht über den unteren Rand hinausragen
      clipped: (() => { const vb = v.getBoundingClientRect(); return [...document.querySelectorAll(".sb-slot, .sb-flow p, .sb-h2")].filter((e) => { const r = e.getBoundingClientRect(); return r.left >= vb.left - 1 && r.right <= vb.right + 1 && r.bottom > vb.bottom + 2 && r.top < vb.bottom; }).length; })(),
    };
  });
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  try {
    // ── Hauptmenü → Kartenbuch: derselbe Tisch ──
    const page = await open(1920, 1080, "/sacrifice-and-sigils");
    await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
    await wait(800);
    await page.evaluate(() => { window.__ssRoom.__marke = "menue"; });
    await page.click('[data-menu="codex"]');
    await page.waitForSelector(".sb-book", { timeout: 30000 });
    await wait(1500);
    const same = await page.evaluate(() => window.__ssRoom?.__marke === "menue" && window.__ssRoom.stats().stage === "book");
    const topbar = await page.evaluate(() => getComputedStyle(document.querySelector(".ss-topbar")).display);
    let b = await book(page);
    check("Menü → Kartenbuch: Buch über demselben Tisch, keine Website-Leiste", same && topbar === "none" && b.chapter === "karten", JSON.stringify({ same, topbar, kapitel: b.chapter }));
    check("Karten: Album mit Seitenzahlen, nichts ragt unten über die Seite", b.cards > 50 && b.nums[0] === "1" && b.nums[1] === "2" && b.clipped === 0, JSON.stringify(b));
    await shot(page, "1-karten-1920");
    // Umblättern: Pfeil, Taste, Mausrad
    await page.click('.sb-turn[aria-label^="Weiter"]');
    await wait(500);
    const p2 = await book(page);
    await page.keyboard.press("ArrowRight");
    await wait(500);
    const p3 = await book(page);
    await page.mouse.move(960, 540);
    await page.mouse.wheel({ deltaY: -120 });
    await wait(600);
    const p4 = await book(page);
    check("Umblättern: Pfeil, Taste →, Mausrad zurück", p2.nums[0] === "3" && p3.nums[0] === "5" && p4.nums[0] === "3" && p3.clipped === 0, [p2.nums, p3.nums, p4.nums].map((x) => x.join("/")).join(" · "));
    await shot(page, "2-karten-seite5");
    // Filter: Seltenheit „legendär“ → weniger Karten, zurück auf Seite 1
    await page.evaluate(() => { const s = document.querySelector('.sb-select[aria-label="Seltenheit"]'); const opt = [...s.options].find((o) => /legend/i.test(o.textContent)); s.value = opt.value; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await wait(500);
    b = await book(page);
    check("Filter: Seltenheit verkleinert das Album, Seite 1", b.cards > 0 && b.cards < 40 && b.nums[0] === "1", `${b.count} · ${b.nums.join("/")}`);
    await shot(page, "3-legendaer");
    // Karte anklicken → Kartenblatt; Esc schließt nur das Blatt
    await page.click(".sb-slot .ss-card");
    await wait(500);
    const detail = await page.evaluate(() => !!document.querySelector('[role="dialog"][aria-modal="true"]'));
    await page.keyboard.press("Escape");
    await wait(400);
    const stillBook = await page.evaluate(() => !!document.querySelector(".sb-book"));
    check("Karte anklicken öffnet das Kartenblatt, Esc schließt nur das Blatt", detail && stillBook);
    // Kapitel über die Lesebändchen
    for (const [label, chap] of [["Regeln", "regeln"], ["Sigils", "sigils"], ["Allerlei", "allerlei"]]) {
      await page.evaluate((l) => [...document.querySelectorAll(".sb-ribbon")].find((x) => x.textContent === l).click(), label);
      await wait(700);
      b = await book(page);
      const total = await page.evaluate(() => { const fl = document.querySelector(".sb-flow"); return fl.scrollWidth; });
      check(`Kapitel ${label}: aufgeschlagen, nichts abgeschnitten`, b.chapter === chap && b.nums[0] === "1" && b.clipped === 0, JSON.stringify({ seiten: b.nums, breite: total }));
      await shot(page, `4-${chap}`);
    }
    // Gezeiten-Zirkel im Allerlei-Kapitel
    await page.evaluate(() => [...document.querySelectorAll(".sb-zirkel .sb-word")].find((x) => /Gezeiten/.test(x.textContent)).click());
    await wait(500);
    const tide = await page.evaluate(() => [...document.querySelectorAll(".sb-h2")].some((h) => h.textContent === "Gezeiten"));
    check("Zirkel Gezeiten: Gezeiten-Abschnitt erscheint", tide);
    // Regeln: Verweis „Kartenbuch“ führt ins Kapitel Karten
    await page.evaluate(() => [...document.querySelectorAll(".sb-ribbon")].find((x) => x.textContent === "Regeln").click());
    await wait(500);
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      found = await page.evaluate(() => { const v = document.querySelector(".sb-view").getBoundingClientRect(); const r = [...document.querySelectorAll(".sb-flow .sb-ref")].find((x) => x.textContent === "Kartenbuch"); if (!r) return false; const q = r.getBoundingClientRect(); if (q.left < v.left || q.right > v.right) return false; r.click(); return true; });
      if (!found) { await page.keyboard.press("ArrowRight"); await wait(450); }
    }
    await wait(500);
    b = await book(page);
    check("Regeln: Verweis „Kartenbuch“ schlägt das Kapitel Karten auf", found && b.chapter === "karten", b.chapter);
    // Esc → Hauptmenü, derselbe Tisch
    await page.keyboard.press("Escape");
    const menu = await page.waitForFunction(() => window.__ssRoom?.stats().stage === "menu", { timeout: 15000 }).then(() => true, () => false);
    const sameMenu = await page.evaluate(() => window.__ssRoom?.__marke === "menue");
    check("Esc klappt das Buch zu: zurück im Hauptmenü am selben Tisch", menu && sameMenu);
    await page.close();

    // ── Anleitung direkt, andere Größen ──
    for (const [W, H] of [[1366, 768], [2560, 1440]]) {
      const pg = await open(W, H, "/sacrifice-and-sigils/anleitung");
      await pg.waitForSelector(".sb-book", { timeout: 60000 });
      await pg.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
      await wait(1500);
      const r = await book(pg);
      check(`${W}x${H} Anleitung im Buch, nichts abgeschnitten`, r.chapter === "regeln" && r.clipped === 0, JSON.stringify({ seiten: r.nums }));
      await shot(pg, `5-regeln-${W}x${H}`);
      await pg.evaluate(() => [...document.querySelectorAll(".sb-ribbon")].find((x) => x.textContent === "Karten").click());
      await wait(800);
      const k = await book(pg);
      check(`${W}x${H} Kartenalbum passt`, k.clipped === 0 && k.cards > 0, JSON.stringify({ karten: k.cards }));
      await shot(pg, `5-karten-${W}x${H}`);
      await pg.close();
    }
    // ── Ausweichweg ──
    const flat = await open(1920, 1080, "/sacrifice-and-sigils/kartenbuch?tisch=alt");
    await wait(2500);
    const isFlat = await flat.evaluate(() => !document.querySelector(".sb-book") && document.body.innerText.includes("Sigil-Lexikon"));
    check("Ausweichweg (alt): bisheriges Kartenbuch", isFlat);
    await flat.close();
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
