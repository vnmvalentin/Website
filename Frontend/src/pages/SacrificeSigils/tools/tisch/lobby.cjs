// Lobby am Tisch (Rebuild Phase 5) mit zwei Browsern und einem Zuschauer:
// Anna öffnet im Hauptmenü einen Tisch (dieselbe Szene vom Menü bis ins Match), der Platz gegenüber ist leer →
// Bert setzt sich (bei Anna kommt die Gestalt mit seiner Maske an den Tisch) → Anna stellt Zettel um (Bert sieht es,
// kann selbst nicht umstellen) → Geste in der Lobby → beide stempeln → Draft am selben Tisch. Bert steht vorher einmal
// auf und setzt sich wieder.
// Vorher starten wie bei online.cjs: onlineServer.cjs (SS_PORT) und ein Dev-Server, dessen /socket.io dorthin zeigt.
// Aufruf: node lobby.cjs · Bilder: Temp-Ordner ss-tisch/lobby
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "lobby");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const W = 1920, H = 1080;
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
    return { page, name, ctx };
  };
  const stats = (page) => page.evaluate(() => window.__ssRoom?.stats() || null);
  const toast = (page) => page.evaluate(() => document.querySelector(".st-toast")?.textContent || null);
  const until = async (page, fn, ms = 20000, arg) => { try { await page.waitForFunction(fn, { timeout: ms, polling: 200 }, arg); return true; } catch { return false; } };
  const at = (page, what) => page.evaluate((w) => window.__ssRoom.locate(w), what);
  // zweimal zielen: die Kamera folgt leicht der Maus (Parallaxe) — im flachen Lobby-Blick rückt der Gegenstand dabei
  const click = async (page, what) => {
    let p = await at(page, what);
    if (!p) return false;
    await page.mouse.move(p.x, p.y);
    await wait(700);
    p = await at(page, what);
    await page.mouse.move(p.x, p.y);
    await wait(250);
    await page.mouse.click(p.x, p.y);
    await wait(350);
    return true;
  };
  const tip = (page) => page.evaluate(() => document.querySelector(".ss-tip")?.textContent || "");
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

  try {
    // ── Anna: Hauptmenü → Tisch eröffnen ──
    const A = await seat("Anna", "rabe");
    await A.page.goto(`${BASE}/sacrifice-and-sigils`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await A.page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
    await wait(800);
    await A.page.evaluate(() => { window.__ssRoom.__marke = "menue"; });
    await A.page.click('[data-menu="create"]');
    await A.page.waitForFunction(() => /\/raum\/[A-Z0-9]{5}$/.test(location.pathname), { timeout: 30000 });
    const code = await A.page.evaluate(() => location.pathname.split("/").pop());
    const inLobby = await until(A.page, () => window.__ssRoom?.stats().stage === "lobby", 20000);
    await wait(1500);
    let s = await stats(A.page);
    const same = await A.page.evaluate(() => window.__ssRoom?.__marke === "menue");
    check("Menü → Lobby: derselbe Tisch, Platz gegenüber leer", inLobby && same && s.seated === false && s.pose === "lobby", JSON.stringify({ stage: s?.stage, gleich: same, sitzt: s?.seated, blick: s?.pose, zettel: s?.notes }));
    check("Lobby: sechs Zettel zum Umstellen (Gastgeber)", s.notes.length === 6, s.notes.join(","));
    const bar = await A.page.evaluate(() => document.querySelector(".sl-code")?.textContent);
    check("Lobby: Code steht oben", bar === code, bar);
    check("Lobby: Hinweis ohne Gegenüber", /niemand gegenüber/.test(await toast(A.page) || ""), await toast(A.page));
    await shot(A.page, "1-allein");

    // ── Bert setzt sich ──
    const B = await seat("Bert", "mond");
    await B.page.goto(`${BASE}/sacrifice-and-sigils/raum/${code}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await until(B.page, () => window.__ssRoom?.stats().stage === "lobby", 30000);
    const sat = await until(A.page, () => window.__ssRoom.stats().sat > 0.99, 10000);
    await wait(400);
    s = await stats(A.page);
    check("Bert setzt sich: bei Anna kommt die Gestalt mit seiner Maske an den Tisch", sat && s.seated && s.mask === "mond", JSON.stringify({ sitzt: s.seated, maske: s.mask }));
    const sb = await stats(B.page);
    check("Bert sieht Anna gegenüber (Maske Rabe), keine Zettel zum Umstellen", sb.seated && sb.mask === "rabe" && sb.notes.length === 0, JSON.stringify({ sitzt: sb.seated, maske: sb.mask, zettel: sb.notes }));
    await shot(A.page, "2-anna-bert-sitzt");
    await shot(B.page, "2-bert");

    // ── Anna stellt um: Zirkel → Gezeiten, Zugzeit ──
    await click(A.page, { type: "note", id: "turnTimer" });
    const tipA = await tip(A.page);
    await click(A.page, { type: "note", id: "zirkel" });
    await wait(800);
    const zb = await until(B.page, () => window.__ssRoom.stats().zirkel === "gezeiten", 8000);
    check("Anna stellt den Zirkel um: bei Bert liegt der Treibholz-Tisch", zb && (await stats(A.page)).zirkel === "gezeiten");
    check("Zettel-Tooltip nennt den nächsten Wert", /Anklicken/.test(tipA), tipA.slice(0, 80));
    await B.page.mouse.move(1, 1);
    await click(B.page, { type: "note", id: "draftMode" });
    check("Bert kann nicht umstellen (Meldung)", /Gastgeber/.test(await toast(B.page) || ""), await toast(B.page));
    await shot(B.page, "3-bert-gezeiten");

    // ── Geste in der Lobby: Bert nickt, Anna sieht es ──
    const before = (await stats(A.page)).oppGestures;
    await B.page.keyboard.press("g");
    await wait(300);
    const wheelItems = await B.page.$$eval(".st-wheel-item", (els) => els.map((e) => e.textContent));
    await B.page.keyboard.press("2");
    const nod = await until(A.page, (n) => window.__ssRoom.stats().oppGestures > n, 5000, before);
    check("Geste in der Lobby (ohne Zeigen) kommt an", nod && wheelItems.length === 5 && !wheelItems.some((t) => /zeigen/i.test(t)), wheelItems.join(" | "));

    // ── Bert steht auf und setzt sich wieder ──
    await B.page.evaluate(() => [...document.querySelectorAll(".sl-bar button")].find((b) => b.textContent.trim() === "Aufstehen")?.click());
    const gone = await until(A.page, () => window.__ssRoom.stats().sat < 0.01, 10000);
    check("Bert steht auf: die Gestalt verschwindet bei Anna", gone);
    await B.page.goto(`${BASE}/sacrifice-and-sigils/raum/${code}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const back = await until(A.page, () => window.__ssRoom.stats().sat > 0.99, 30000);
    check("Bert setzt sich wieder", back);

    // ── Beide stempeln ──
    await until(B.page, () => window.__ssRoom?.stats().stage === "lobby", 30000);
    // erst nach der Kamerafahrt klicken (sonst stimmt die Lage des Stempels auf dem Bildschirm noch nicht)
    await wait(1800);
    await click(B.page, { type: "seal" });
    const stamped = await until(B.page, () => /Warte, bis/.test(document.querySelector(".st-toast")?.textContent || ""), 5000);
    await wait(900);
    await shot(A.page, "4-bert-bereit");
    s = await stats(B.page);
    check("Bert stempelt: er ist bereit und wartet auf Anna", stamped, await toast(B.page));
    await A.page.evaluate(() => { window.__ssRoom.__marke2 = "lobby"; });
    await A.page.keyboard.press("Space");
    const draftA = await until(A.page, () => window.__ssRoom?.stats().stage === "draft", 30000);
    const draftB = await until(B.page, () => window.__ssRoom?.stats().stage === "draft", 30000);
    const sameA = await A.page.evaluate(() => window.__ssRoom?.__marke === "menue" && window.__ssRoom?.__marke2 === "lobby");
    await wait(1800);
    s = await stats(A.page);
    check("Beide bereit: Draft beginnt am selben Tisch (seit dem Hauptmenü nie neu gebaut)", draftA && draftB && sameA && s.loose > 0 && s.zirkel === "gezeiten", JSON.stringify({ stage: s.stage, gleich: sameA, karten: s.loose, zirkel: s.zirkel }));
    await shot(A.page, "5-draft");

    // ── Zuschauer ──
    const C = await seat("Cora", "wachs");
    await C.page.goto(`${BASE}/sacrifice-and-sigils/raum/${code}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const watch = await until(C.page, () => !!window.__ssRoom && ["draft", "lobby"].includes(window.__ssRoom.stats().stage), 30000);
    await wait(1500);
    await shot(C.page, "6-zuschauer");
    check("Zuschauer kommt an den Tisch", watch, JSON.stringify(await stats(C.page)).slice(0, 120));
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
