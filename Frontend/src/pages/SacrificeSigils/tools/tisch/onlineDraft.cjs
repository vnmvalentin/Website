// Draft und Pfad online am Tisch mit zwei Browsern (Rebuild Phase 4; seit 15.11.2026 ohne Totem-Wahl nach dem Draft). Beide wählen per Klick — kein Zug kommt
// vom Server. Vorher starten wie bei online.cjs: onlineServer.cjs und ein Dev-Server, dessen /socket.io dorthin zeigt.
// Aufruf: node onlineDraft.cjs [shared|separate] · Bilder: Temp-Ordner ss-tisch/online-draft
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "online-draft");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const mode = process.argv[2] === "separate" ? "separate" : "shared";
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
  const at = (page, what) => page.evaluate((w) => window.__ssRoom?.locate(w), what);
  const click = async (page, what) => { const p = await at(page, what); if (!p) return false; await page.mouse.move(p.x, p.y); await wait(100); await page.mouse.click(p.x, p.y); return true; };
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${mode}-${name}.png`) });

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
  if (mode === "separate") {
    // Gastgeber stellt den Draft-Modus um (erstes Auswahlfeld mit dieser Option)
    // Gastgeber stellt um: am Tisch den Zettel „Draft“ anklicken (zweimal zielen, die Kamera folgt leicht der Maus),
    // in der flachen Lobby das Auswahlfeld
    const flatSel = await A.page.evaluate(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === "separate")); if (!s) return false; s.value = "separate"; s.dispatchEvent(new Event("change", { bubbles: true })); return true; });
    if (!flatSel) {
      for (let k = 0; k < 2; k++) { const p = await A.page.evaluate(() => window.__ssRoom.locate({ type: "note", id: "draftMode" })); await A.page.mouse.move(p.x, p.y); await wait(k ? 250 : 700); }
      const p = await A.page.evaluate(() => window.__ssRoom.locate({ type: "note", id: "draftMode" }));
      await A.page.mouse.click(p.x, p.y);
    }
    await wait(600);
  }
  const ready = async (page) => { const flat = await page.evaluate(() => { const b = [...document.querySelectorAll("button.ss-seal")].find((x) => /Bereit/i.test(x.textContent)); b?.click(); return !!b; }); if (!flat) { await page.mouse.move(5, 5); await page.keyboard.press("Space"); } return true; };
  await ready(A.page);
  await ready(B.page);
  await Promise.all([A.page.waitForSelector('[data-table="bereit"]', { timeout: 60000 }), B.page.waitForSelector('[data-table="bereit"]', { timeout: 60000 })]);
  await wait(2500);
  let sa = await stats(A.page);
  let sb = await stats(B.page);
  check(`Draft (${mode}) läuft bei beiden am Tisch`, sa?.stage === "draft" && sb?.stage === "draft", `${sa?.loose} / ${sb?.loose} Karten liegen aus`);
  check("Masken stehen schon im Draft", sa?.mask === "mond" && sb?.mask === "rabe", `${sa?.mask} / ${sb?.mask}`);
  check("Stundenglas läuft im Draft", (sa?.timerSecs ?? 0) > 0, `${sa?.timerSecs} s`);
  await shot(A.page, "a-start");

  // ── Draft: wer nehmen kann, nimmt die erste Karte ──
  let picks = 0;
  for (let guard = 0; guard < 120; guard++) {
    [sa, sb] = await Promise.all([stats(A.page), stats(B.page)]);
    if (sa?.stage !== "draft" && sb?.stage !== "draft") break;
    let did = false;
    for (const [s, P, other] of [[sa, A, B], [sb, B, A]]) {
      if (s?.stage === "draft" && s.pickable > 0) {
        await click(P.page, { type: "loose", index: 0 });
        picks++;
        did = true;
        if (picks === 1) { await wait(120); await shot(P.page, "nimmt"); for (let i = 0; i < 4; i++) await shot(other.page, `gegenueber-greift-${i}`); }
        await wait(450);
      }
    }
    if (!did) await wait(300);
  }
  [sa, sb] = await Promise.all([stats(A.page), stats(B.page)]);
  // Seit 15.11.2026 keine Totem-Wahl nach dem Draft: bei beiden liegt gleich die Pfadkarte (Totems gibt es am Schrein)
  await Promise.all([A.page, B.page].map((p) => p.waitForFunction(() => window.__ssRoom?.stats().stage === "map", { timeout: 20000 }).catch(() => {})));
  await wait(1200);
  const [ea, eb] = await Promise.all([stats(A.page), stats(B.page)]);
  check("Draft: beide haben 12 Karten gewählt, danach liegt bei beiden die Pfadkarte (kein Totem)", ea?.stage === "map" && eb?.stage === "map" && ea.totems === 0 && eb.totems === 0, `${picks} Griffe, danach ${ea?.stage} / ${eb?.stage}, Totems ${ea?.totems} / ${eb?.totems}`);
  await shot(A.page, "a-pfadkarte");

  // ── Pfad online: jeder geht seinen eigenen Weg (Marke anklicken, Szene spielen), bis der Kampf beginnt ──
  const walk = async (P) => {
    const s = await stats(P.page);
    if (!s) return false;
    if (s.stage === "map" && s.map && !s.map.done) {
      for (let st = 0; st < 3; st++) {
        const p = await at(P.page, { type: "node", lv: s.map.level, st });
        if (!p) continue;
        await P.page.mouse.move(p.x, p.y);
        await wait(200);
        await P.page.mouse.click(p.x, p.y);
        // die Figur läuft erst hin (rund 1,5 s), dann beginnt die Szene
        await wait(2200);
        const now = await stats(P.page);
        if (now?.stage !== "map" || now.map?.level !== s.map.level) return true;
      }
      return false;
    }
    if (s.stage === "scene") {
      if (s.notes.includes("weiter")) await click(P.page, { type: "note", id: "weiter" });
      else await click(P.page, { type: "loose", index: 0 });
      await wait(1400);
      return true;
    }
    return false;
  };
  let moves = 0;
  for (let guard = 0; guard < 60; guard++) {
    const [x, y] = await Promise.all([stats(A.page), stats(B.page)]);
    if (x?.stage === "battle" && y?.stage === "battle") break;
    const did = [await walk(A), await walk(B)];
    moves += did.filter(Boolean).length;
    if (!did.some(Boolean)) await wait(500);
  }
  const [fa, fb] = await Promise.all([stats(A.page), stats(B.page)]);
  check("Pfad online: beide gehen ihren Weg am Tisch, danach beginnt der Kampf bei beiden", fa?.stage === "battle" && fb?.stage === "battle", `${moves} Schritte und Szenen, danach ${fa?.stage} / ${fb?.stage}`);

  console.log(results.join("\n"));
  console.log(logs.length ? logs.slice(0, 12).join("\n") : "keine Konsolenfehler");
  await browser.close();
})().catch((e) => { console.error("Abbruch:", e); process.exit(1); });
