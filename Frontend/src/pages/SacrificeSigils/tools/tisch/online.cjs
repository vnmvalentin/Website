// Online-Match am neuen Tisch mit zwei Browsern und einem Zuschauer (Rebuild Phase 3).
// Vorher starten: node onlineServer.cjs (Prüf-Server auf 127.0.0.1:3001) und der Vite-Dev-Server.
// Prüft: Raum anlegen/beitreten, Masken, Zug des Gegenübers mit den Händen, Stundenglas, Gesten in beide Richtungen,
// Zuschauerblick, Verbindungsverlust und Rückkehr. Aufruf: node online.cjs · Bilder: Temp-Ordner ss-tisch/online
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "online");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const SERVER = process.env.SS_SERVER || "http://127.0.0.1:3001";
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
      try {
        if (!localStorage.getItem("ss_prefs_v1")) localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 2, tipsOff: true, table3d: true, newTable: true, mask: m, seenTips: [], name: n }));
      } catch {}
    }, name, mask);
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|ERR_CONNECTION|WebSocket/.test(m.text())) logs.push(`${name} ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push(`${name} pageerror: ` + String(e).slice(0, 400)));
    return { ctx, page, name };
  };
  const api = async (pathAndQuery) => (await fetch(SERVER + pathAndQuery)).json();
  const stats = (page) => page.evaluate(() => window.__ssRoom?.stats() || null);
  const pose = (page) => page.evaluate(() => window.__ssRoom?.pose || null);
  const toast = (page) => page.evaluate(() => document.querySelector(".st-toast")?.textContent || null);
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const ready = (page) => page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
  const idle = async (page, ms = 20000) => {
    // warten, bis die Abläufe durch sind (kein Ereignis mehr in den letzten 700 ms)
    const t0 = Date.now();
    let last = -1;
    while (Date.now() - t0 < ms) {
      const n = await page.evaluate(() => (window.__ssEvents || []).length);
      if (n === last) return;
      last = n;
      await wait(700);
    }
  };

  // ── Raum anlegen, beitreten, bereit ──
  const A = await seat("Anna", "rabe");
  await A.page.goto(`${BASE}/sacrifice-and-sigils/raum/neu`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await A.page.waitForFunction(() => /\/raum\/[A-Z0-9]{5}$/.test(location.pathname), { timeout: 30000 });
  const code = await A.page.evaluate(() => location.pathname.split("/").pop());
  const B = await seat("Bert", "mond");
  await B.page.goto(`${BASE}/sacrifice-and-sigils/raum/${code}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const clickReady = async (page) => { const flat = await page.evaluate(() => { const b = [...document.querySelectorAll("button.ss-seal")].find((x) => /Bereit/i.test(x.textContent)); b?.click(); return !!b; }); if (!flat) { await page.mouse.move(5, 5); await page.keyboard.press("Space"); } return true; };
  await A.page.waitForFunction(() => window.__ssRoom?.stats().stage === "lobby" || !!document.querySelector("button.ss-seal"), { timeout: 30000 });
  await B.page.waitForFunction(() => window.__ssRoom?.stats().stage === "lobby" || !!document.querySelector("button.ss-seal"), { timeout: 30000 });
  await wait(1500);
  await wait(500);
  // Anna wechselt in der Lobby über die Einstellungen die Maske (Rabe → Rinde): Bert muss später die neue sehen
  await A.page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Einstellungen" || b.textContent.trim() === "Einstellungen")?.click());
  await A.page.waitForSelector(".st-mask", { timeout: 20000 });
  await A.page.evaluate(() => [...document.querySelectorAll(".st-mask")].find((b) => /Rinde/.test(b.textContent)).click());
  await wait(300);
  await A.page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.trim() === "OK")?.click());
  await wait(400);
  check("Lobby: beide drücken Bereit", (await clickReady(A.page)) && (await clickReady(B.page)), `Raum ${code}`);
  await wait(1200);
  const start = await api(`/auto?code=${code}&turn=2`);
  check("Match läuft bis in den Kampf", start.phase === "battle", JSON.stringify(start));
  await Promise.all([ready(A.page), ready(B.page)]);
  await wait(2500);
  await Promise.all([idle(A.page), idle(B.page)]);

  // ── Masken und Stundenglas ──
  const sa = await stats(A.page);
  const sb = await stats(B.page);
  check("Masken: Anna sieht Berts Halbmond, Bert sieht Annas in der Lobby gewechselte Rinde", sa?.mask === "mond" && sb?.mask === "rinde", `${sa?.mask} / ${sb?.mask}`);
  check("Stundenglas: Zugzeit läuft bei beiden", sa?.timerSecs > 0 && sb?.timerSecs > 0 && Math.abs(sa.timerSecs - sb.timerSecs) <= 2, `${sa?.timerSecs} s / ${sb?.timerSecs} s`);

  // ── Zug des Gegenübers: die KI spielt für den, der dran ist; der andere sieht die Hände ──
  let state = await api(`/step?code=${code}&n=0`);
  const act = [A, B][state.active];
  const watch = [A, B][1 - state.active];
  check("Blick: wer dran ist, schaut aufs Brett; der andere zum Gegenüber", (await pose(act.page)) === "brett" && (await pose(watch.page)) === "gegenueber", `${await pose(act.page)} / ${await pose(watch.page)}`);
  await watch.page.evaluate(() => { window.__ssEvents = []; });
  const stepping = api(`/step?code=${code}&seat=${state.active}&n=8`);
  for (let i = 0; i < 14; i++) await shot(watch.page, `zug-${String(i).padStart(2, "0")}`);
  state = await stepping;
  await idle(watch.page);
  const seen = await watch.page.evaluate(() => (window.__ssEvents || []).map((e) => e.type));
  check("Zug des Gegenübers kommt an (ziehen … Zugende)", seen.includes("draw") && seen.includes("turnEnd"), [...new Set(seen)].join(","));
  await wait(600);
  check("Danach ist der Zuschauende dran (Blick aufs Brett)", (await pose(watch.page)) === "brett", await pose(watch.page));

  // ── Jetzt von Hand: ziehen und stempeln im Browser dessen, der dran ist ──
  const me = watch;          // ist jetzt am Zug
  const other = act;
  const at = (page, what) => page.evaluate((w) => window.__ssRoom?.locate(w), what);
  const click = async (page, what) => { const p = await at(page, what); if (p) { await page.mouse.move(p.x, p.y); await wait(150); await page.mouse.click(p.x, p.y); } await wait(700); return !!p; };
  await other.page.evaluate(() => { window.__ssEvents = []; });
  await click(me.page, { type: "deck" });
  await shot(me.page, "ich-gezogen");
  await me.page.keyboard.press("Space");
  for (let i = 0; i < 6; i++) await shot(other.page, `stempel-${i}`);
  await idle(other.page);
  const seen2 = await other.page.evaluate(() => (window.__ssEvents || []).map((e) => e.type));
  check("Ziehen und Stempeln per Klick/Leertaste kommt beim anderen an", seen2.includes("draw") && seen2.includes("attackPhase"), [...new Set(seen2)].join(","));
  check("Keine Fehlermeldung beim Handelnden", !(await toast(me.page)), await toast(me.page));

  // ── Gesten in beide Richtungen ──
  const g0 = (await stats(other.page)).oppGestures;
  await me.page.keyboard.press("g");
  await wait(250);
  await me.page.keyboard.press("2");
  await wait(900);
  const g1 = await stats(other.page);
  check("Geste Nicken kommt beim anderen an", g1.oppGestures === g0 + 1 && g1.lastGesture === "nicken", `${g1.oppGestures - g0} · ${g1.lastGesture}`);
  check("Eigene Geste kommt nicht zu einem selbst zurück", (await stats(me.page)).oppGestures === 0, (await stats(me.page)).oppGestures);
  await wait(600);
  await other.page.keyboard.press("g");
  await wait(250);
  await other.page.keyboard.press("4");
  await wait(250);
  const slot = await at(other.page, { type: "slot", row: "oppFront", lane: 1 });
  await other.page.mouse.click(slot.x, slot.y);
  await wait(700);
  const g2 = await stats(me.page);
  // Das Feld „gegenüber vorn“ des einen ist „eigene Front“ des anderen
  check("Geste Zeigen kommt mit dem richtigen Feld an", g2.lastGesture === "zeigen@ownFront:1", g2.lastGesture);
  await shot(me.page, "zeigen-empfangen");
  await shot(other.page, "zeigen-gesendet");

  // ── Zuschauer ──
  const C = await seat("Cora", "drei");
  await C.page.goto(`${BASE}/sacrifice-and-sigils/raum/${code}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await ready(C.page);
  await wait(2500);
  check("Zuschauer: sitzt seitlich am Tisch", (await pose(C.page)) === "seite", await pose(C.page));
  await shot(C.page, "zuschauer");
  const cs = await stats(C.page);
  check("Zuschauer: sieht die Maske dessen, der oben sitzt (Platz 1 = Bert)", cs?.mask === "mond", cs?.mask);
  await C.page.keyboard.press("g");
  await wait(250);
  check("Zuschauer: kein Gestenrad", (await C.page.evaluate(() => document.querySelectorAll(".st-wheel-item").length)) === 0);

  // ── Verbindung weg und wieder da ──
  await B.page.close();
  await wait(1500);
  const away = await stats(A.page);
  check("Verbindung weg: Gestalt sackt zusammen", away.away === true, String(away.away));
  await shot(A.page, "bert-weg");
  const B2 = await B.ctx.newPage();
  await B2.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  B2.on("pageerror", (e) => logs.push("Bert (zurück) pageerror: " + String(e).slice(0, 400)));
  await B2.goto(`${BASE}/sacrifice-and-sigils/raum/${code}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await ready(B2);
  await wait(2000);
  check("Rückkehr: Gestalt richtet sich auf", (await stats(A.page)).away === false);
  check("Rückkehr: Bert sitzt wieder am Tisch mit Annas Maske gegenüber", (await stats(B2))?.mask === "rinde", (await stats(B2))?.mask);
  await shot(B2, "bert-zurueck");
  await shot(A.page, "anna-am-ende");

  console.log(results.join("\n"));
  console.log(logs.length ? logs.slice(0, 12).join("\n") : "keine Konsolenfehler");
  await browser.close();
})().catch((e) => { console.error("Abbruch:", e); process.exit(1); });
