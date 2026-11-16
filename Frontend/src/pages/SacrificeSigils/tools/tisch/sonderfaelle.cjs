// Prüft am neuen Tisch die selteneren Fälle (Fixtures „checks“ und „lose“): Abwerfen bei Handlimit, Seher, Pinzette,
// Item ohne Ziel, Item auf eigenes Feld, Vorpreschen, Totem unter dem Zeiger, Tauchen/Verwandlung am Zugende und die
// Niederlage (Kerzen verlöschen). Aufruf: node sonderfaelle.cjs · Bilder: Temp-Ordner ss-tisch/sonder
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "sonder");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const W = 1920, H = 1080;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const logs = [];
  const results = [];
  const check = (name, ok, info = "") => { results.push(`${ok ? "ok  " : "FEHL"} ${name}${info ? " — " + info : ""}`); };
  const open = async (fixture, extra = "") => {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 1, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
    });
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal/.test(m.text())) logs.push(`${fixture} ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push(`${fixture} pageerror: ` + String(e).slice(0, 400)));
    await page.goto(`${BASE}/sacrifice-and-sigils/uebung?fixture=${fixture}&tisch=neu${extra}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
    await wait(2000);
    return page;
  };
  const tools = (page) => {
    const at = (what) => page.evaluate((w) => window.__ssRoom?.locate(w), what);
    const click = async (what, opt = {}) => {
      const p = await at(what);
      if (!p) { logs.push("nicht gefunden: " + JSON.stringify(what)); return; }
      await page.mouse.move(p.x, p.y);
      await wait(200);
      await page.mouse.click(p.x, p.y, opt);
      await wait(opt.after ?? 900);
    };
    const info = () => page.evaluate(() => ({
      cards: window.__ssRoom?.stats().cards,
      toast: document.querySelector(".st-toast")?.textContent || null,
      tip: document.querySelector(".ss-tip")?.textContent || null,
      seer: !!document.querySelector('[role="dialog"][aria-label*="Seher"], .ss-seer'),
      choice: document.querySelector(".st-choice")?.textContent || null,
      banner: document.querySelector(".st-banner")?.textContent || null,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) => d.getAttribute("aria-label") || d.textContent.slice(0, 40)),
    }));
    let n = 0;
    const shot = (name) => page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, "0")}-${name}.png`) });
    return { at, click, info, shot };
  };

  // ── checks ──
  {
    const page = await open("checks");
    const { at, click, info, shot } = tools(page);
    const start = await info();
    // 1. Ziehen bei voller Hand → abwerfen
    await click({ type: "deck" }, { after: 1200 });
    let i = await info();
    check("Abwerfen: Hinweis erscheint", /Handlimit/.test(i.toast || ""), i.toast);
    await shot("abwerfen-hinweis");
    await click({ type: "hand", index: 8 }, { after: 1200 });
    i = await info();
    check("Abwerfen: Karte weg, Hinweis weg", i.cards === start.cards && !/Handlimit/.test(i.toast || ""), `Karten ${start.cards} → ${i.cards}, Meldung ${i.toast}`);
    // 2. Seher
    await click({ type: "hand", index: 0 });
    await click({ type: "slot", row: "ownFront", lane: 3 }, { after: 1500 });
    i = await info();
    await shot("seher");
    check("Seher: Auswahl erscheint", i.dialogs.length > 0, JSON.stringify(i.dialogs));
    const confirmed = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const btn = d && [...d.querySelectorAll("button")].find((b) => /Fertig|Best|Legen|Ordnung|So/i.test(b.textContent)) || d?.querySelector("button.ss-seal, button:last-of-type");
      if (btn) { btn.click(); return btn.textContent; }
      return null;
    });
    await wait(900);
    i = await info();
    check("Seher: bestätigt und geschlossen", !!confirmed && i.dialogs.length === 0, `Knopf „${confirmed}“, offen ${JSON.stringify(i.dialogs)}`);
    // 3. Pinzette
    await click({ type: "item", index: 0 });
    i = await info();
    check("Pinzette: Hinweis „Ziel antippen“", /Ziel/.test(i.toast || ""), i.toast);
    await click({ type: "slot", row: "oppFront", lane: 3 });
    i = await info();
    await shot("pinzette-wahl");
    check("Pinzette: Sigil-Auswahl erscheint", !!i.choice, i.choice);
    await page.evaluate(() => document.querySelector(".st-choice button")?.click());
    await wait(1200);
    i = await info();
    check("Pinzette: benutzt", !i.choice && !/Ziel/.test(i.toast || ""), i.toast);
    await shot("pinzette-danach");
    // 4. Item ohne Ziel (Blutphiole ist jetzt das erste)
    const before = await page.evaluate(() => window.__ssRoom.stats());
    await click({ type: "item", index: 0 }, { after: 1200 });
    i = await info();
    check("Blutphiole: ohne Ziel benutzt", !i.toast || !/Ziel/.test(i.toast), i.toast);
    // 5. Item auf eigenes Feld (Moorlaterne)
    await click({ type: "item", index: 0 });
    await shot("laterne-ziele");
    await click({ type: "slot", row: "ownBack", lane: 0 }, { after: 1500 });
    const after = await info();
    check("Moorlaterne: Karte erscheint auf dem eigenen Feld", after.cards === i.cards + 1, `Karten ${i.cards} → ${after.cards}`);
    void before;
    // 6. Vorpreschen
    await click({ type: "slot", row: "ownBack", lane: 2 }, { after: 1300 });
    await page.mouse.move(20, H / 2);
    await wait(300);
    await shot("vorgeprescht");
    i = await info();
    check("Vorpreschen: keine Fehlermeldung", !i.toast, i.toast);
    // 7. Totem unter dem Zeiger
    const tp = await at({ type: "totem", index: 0 });
    await page.mouse.move(tp.x, tp.y);
    await wait(700);
    i = await info();
    await shot("totem-zeiger");
    check("Totem: Tooltip erscheint", !!i.tip, i.tip);
    await page.mouse.move(20, H / 2);
    // 8. Zugende: Tauchen und Verwandlung
    await page.evaluate(() => { window.__ssEvents = []; });
    await page.keyboard.press("Space");
    for (let k = 0; k < 6; k++) { await wait(180); await shot(`zugende-${k}`); }
    await wait(1500);
    const types = await page.evaluate(() => (window.__ssEvents || []).map((e) => e.type));
    check("Zugende: Tauchen gespielt", types.includes("submerge"), types.join(","));
    check("Zugende: Verwandlung gespielt", types.includes("transform"));
    await shot("nach-zugende");
    await page.close();
  }

  // ── lose ──
  {
    const page = await open("lose", "&ki=1");
    const { info, shot } = tools(page);
    await page.keyboard.press("Space");
    let banner = null;
    for (let k = 0; k < 40 && !banner; k++) { await wait(300); banner = (await info()).banner; }
    check("Niederlage: Schriftzug", /Niederlage|verloren/i.test(banner || ""), banner);
    await wait(700);
    await shot("niederlage-kerzen");
    await wait(900);
    await shot("niederlage-dunkel");
    await page.close();
  }

  // ── Hotseat: zwei an einem Gerät, nach dem Zug wechselt die Tischseite ──
  {
    const page = await open("oppturn", "&hotseat=1");
    const { click, info, shot } = tools(page);
    const before = await page.evaluate(() => window.__ssRoom.stats());
    await page.keyboard.press("Space");
    await page.waitForFunction(() => [...document.querySelectorAll("button.ss-seal")].some((b) => /Ich bin/.test(b.textContent)), { timeout: 15000 }).catch(() => {});
    const curtain = await page.evaluate(() => { const b = [...document.querySelectorAll("button.ss-seal")].find((x) => /Ich bin/.test(x.textContent)); const t = b?.textContent || null; b?.click(); return t; });
    check("Hotseat: Übergabe-Vorhang liegt über dem Tisch", !!curtain, curtain);
    await wait(1800);
    const after = await page.evaluate(() => ({ ...window.__ssRoom.stats(), pose: window.__ssRoom.pose }));
    check("Hotseat: der zweite Spieler sitzt jetzt unten (Blick aufs Brett, andere Maske gegenüber)", after.pose === "brett" && after.mask !== before.mask, `${after.pose}, Maske ${before.mask} → ${after.mask}`);
    await shot("hotseat-zweiter");
    await click({ type: "deck" }, { after: 1200 });
    const i = await info();
    check("Hotseat: der zweite Spieler kann ziehen", !i.toast, i.toast);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => [...document.querySelectorAll("button.ss-seal")].some((b) => /Ich bin/.test(b.textContent)), { timeout: 15000 }).catch(() => {});
    check("Hotseat: nach seinem Zug kommt der Vorhang wieder", await page.evaluate(() => [...document.querySelectorAll("button.ss-seal")].some((b) => /Ich bin/.test(b.textContent))));
    await page.close();
  }

  console.log(results.join("\n"));
  console.log(logs.length ? logs.slice(0, 12).join("\n") : "keine Konsolenfehler");
  await browser.close();
})();
