// Vom Draft bis in den ersten Kampf am Tisch (Rebuild Phase 4, Regel seit 15.11.2026): Draft (Fixture „draft“, die KI wählt mit) → Pfad mit Totem-Schrein auf Ebene 1
// → Pfad (Orte auf der Karte wählen, jede Szene am Tisch) → Kampf. Prüft dabei, dass der Tisch die ganze Zeit derselbe
// bleibt (dieselbe Szene, kein Neuaufbau). Aufruf: node vorkampf.cjs [draft|gz-draft]
// Bilder: Temp-Ordner ss-tisch/vorkampf
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "vorkampf");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const fixture = process.argv[2] || "draft";
const W = 1920, H = 1080;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  // SS_REDUCED=1: derselbe Weg mit „Animationen reduzieren“
  await page.evaluateOnNewDocument((reduced) => {
    try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: reduced, speed: 2, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
  }, process.env.SS_REDUCED === "1");
  const logs = [];
  const results = [];
  const check = (name, ok, info = "") => { results.push(`${ok ? "ok  " : "FEHL"} ${name}${info !== "" ? " — " + info : ""}`); };
  page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|401|403|404/.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push("pageerror: " + String(e).slice(0, 400)));
  await page.goto(`${BASE}/sacrifice-and-sigils/uebung?fixture=${fixture}&ki=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
  await wait(2500);
  // Dieselbe Szene über alle Phasen: eine Marke am Objekt muss bis in den Kampf überleben
  await page.evaluate(() => { window.__ssRoom.__marke = "draft"; });
  const stats = () => page.evaluate(() => window.__ssRoom?.stats() || null);
  const toast = () => page.evaluate(() => document.querySelector(".st-toast")?.textContent || null);
  const at = (what) => page.evaluate((w) => window.__ssRoom?.locate(w), what);
  const click = async (what, opt = {}) => {
    const p = await at(what);
    if (!p) return false;
    await page.mouse.move(p.x, p.y);
    await wait(120);
    await page.mouse.click(p.x, p.y, opt);
    return true;
  };
  let n = 0;
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${fixture}-${String(++n).padStart(2, "0")}-${name}.png`) });
  await page.mouse.move(20, H / 2);

  // ── Draft ──
  let s = await stats();
  check("Draft: läuft am Tisch", s?.stage === "draft", JSON.stringify({ stage: s?.stage, lose: s?.loose, hand: s?.hand, gegenueber: s?.oppHand }));
  await shot("draft-start");
  console.log("Draft-Hinweis:", await toast());
  const p0 = await at({ type: "loose", index: 0 });
  if (p0) { await page.mouse.move(p0.x, p0.y); await wait(500); await shot("draft-karte-unter-zeiger"); await page.mouse.click(p0.x, p0.y, { button: "right" }); await wait(400); }
  check("Draft: Rechtsklick zeigt das Kartenblatt", await page.evaluate(() => !!document.querySelector('[role="dialog"]')));
  await page.keyboard.press("Escape");
  await wait(300);
  const hand0 = s.hand;
  let picks = 0;
  let midShot = false;
  for (let guard = 0; guard < 80; guard++) {
    s = await stats();
    if (!s || s.stage !== "draft") break;
    if (s.pickable > 0) {
      await click({ type: "loose", index: 0 });
      picks++;
      if (!midShot && picks === 1) { await wait(160); await shot("draft-genommen-fliegt"); midShot = true; }
      await wait(650);
      if (picks === 2) await shot("draft-gegenueber-greift");
    } else await wait(350);
  }
  s = await stats();
  // Seit 15.11.2026 keine Totem-Wahl nach dem Draft: die Pfadkarte rollt sich gleich aus
  await page.waitForFunction(() => window.__ssRoom?.stats().stage === "map", { timeout: 20000 }).catch(() => {});
  s = await stats();
  check("Draft: bis zum Ende gespielt, danach gleich die Pfadkarte (keine Totem-Wahl mehr)", s?.stage === "map" && !!s.map, `${picks} eigene Griffe, Hand vorher ${hand0}, Phase jetzt ${s?.stage}`);
  check("Pfadkarte: derselbe Tisch wie im Draft (Szene nicht neu gebaut)", await page.evaluate(() => window.__ssRoom.__marke === "draft"));
  check("Nach dem Draft steht noch kein Totem auf dem Tisch", s?.totems === 0, `Totems: ${s?.totems}`);
  await page.mouse.move(20, H / 2);
  await wait(800);
  await shot("pfad-karte");

  // ── Ebene 1: den Totem-Schrein suchen (steht immer dort) und das erste Totem nehmen ──
  let shrineSt = -1;
  for (let st = 0; st < 3 && shrineSt < 0; st++) {
    const p = await at({ type: "node", lv: 0, st });
    if (!p) continue;
    await page.mouse.move(p.x, p.y);
    await wait(700);
    const q = await at({ type: "node", lv: 0, st });
    await page.mouse.move(q.x, q.y);
    await wait(400);
    const tip = await page.evaluate(() => document.querySelector(".ss-tip")?.textContent || "");
    if (/Totem-Schrein/.test(tip)) { shrineSt = st; await shot("schrein-vorschau"); await page.mouse.click(q.x, q.y); }
  }
  check("Ebene 1 hat einen Totem-Schrein", shrineSt >= 0, `Strang ${shrineSt}`);
  await page.waitForFunction(() => window.__ssRoom?.stats().stage === "scene", { timeout: 10000 }).catch(() => {});
  await wait(1200);
  await page.mouse.move(20, H / 2);
  await shot("schrein-erstes-totem");
  s = await stats();
  const offered = s?.notes?.filter((n) => n.startsWith("neu:")).length || 0;
  await click({ type: "note", id: "neu:0" });
  await wait(1200);
  s = await stats();
  check("Schrein: drei fertige Totems zur Wahl, Nehmen stellt das erste auf den Tisch", offered === 3 && s?.totems === 1, `Angebote ${offered}, Totems jetzt ${s?.totems}`);
  await shot("schrein-totem-steht");
  if (s?.notes?.includes("weiter")) { await click({ type: "note", id: "weiter" }); await wait(2200); }

  // ── Pfad: Marken auf der Karte anklicken, jede Szene am Tisch spielen (hier: nehmen oder weitergehen), bis der Kampf beginnt ──
  let scenes = 0;
  let steps = 0;
  let preview = null;
  for (let guard = 0; guard < 80; guard++) {
    s = await stats();
    if (s?.stage === "battle") break;
    if (s?.stage === "map" && s.map && !s.map.done) {
      // eine der bis zu drei Marken der aktuellen Ebene ist erreichbar: der Reihe nach probieren
      const lv = s.map.level;
      for (let st = 0; st < 3; st++) {
        const p = await at({ type: "node", lv, st });
        if (!p) continue;
        await page.mouse.move(p.x, p.y);
        await wait(450);
        if (!preview) { preview = await page.evaluate(() => document.querySelector(".ss-tip")?.textContent || null); if (preview) await shot("pfad-vorschau"); }
        await page.mouse.click(p.x, p.y);
        // die Figur läuft erst hin (rund 1,5 s), dann beginnt die Szene
        await wait(2300);
        const now = await stats();
        if (now?.stage !== "map" || now.map?.level !== lv) { steps++; break; }
      }
      continue;
    }
    if (s?.stage === "scene") {
      scenes++;
      if (scenes === 1) { await page.mouse.move(20, H / 2); await wait(600); await shot("pfad-szene"); }
      if (s.notes.includes("weiter")) await click({ type: "note", id: "weiter" });
      else await click({ type: "loose", index: 0 });
      await wait(1600);
      continue;
    }
    await wait(500);
  }
  check("Pfad: der Mauszeiger auf einer Marke zeigt, was dort wartet", !!preview, preview);
  check("Pfad: Orte auf der Karte gewählt", steps > 0, `${steps} Schritte`);
  s = await stats();
  check("Pfad: Szenen am Tisch gespielt, danach beginnt der Kampf", s?.stage === "battle" && scenes > 0, `${scenes} Szenen, Phase jetzt ${s?.stage}`);
  await wait(2500);
  s = await stats();
  check("Kampf: derselbe Tisch wie im Draft (Szene nie neu gebaut), Hand ausgeteilt", (await page.evaluate(() => window.__ssRoom.__marke === "draft")) && s?.hand > 0, `Hand ${s?.hand}`);
  await page.mouse.move(20, H / 2);
  await shot("kampf-beginnt");

  console.log(results.join("\n"));
  console.log(logs.length ? logs.slice(0, 12).join("\n") : "keine Konsolenfehler");
  await browser.close();
})().catch((e) => { console.error("Abbruch:", e); process.exit(1); });
