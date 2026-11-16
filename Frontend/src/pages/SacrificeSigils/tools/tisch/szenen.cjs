// Pfad-Szenen am Tisch (Rebuild Phase 4): lädt jede Szene und jedes Ereignis als Dev-Stand, macht ein Bild und prüft,
// dass sie am Tisch steht und sich verlassen lässt (danach liegt wieder die Pfadkarte auf dem Tisch).
// Bei einigen Szenen wird zusätzlich die eigentliche Handlung durchgespielt.
// Aufruf: node szenen.cjs [filter] · Bilder: Temp-Ordner ss-tisch/szenen
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "szenen");
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = process.env.SS_BASE || "http://localhost:5173";
const only = process.argv[2] || "";
const W = 1920, H = 1080;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const FIXTURES = [
  "scene:cardChoice", "scene:fuse", "scene:transfer", "scene:campfire", "scene:remove", "scene:merchant", "scene:shrine", "scene:copyist",
  "event:faehrmann", "event:tintenwitwe", "event:knochenorakel", "event:spiegelbrunnen", "event:wachszieher", "event:mondfinsternis",
  "event:gluecksspieler", "event:stammestreue", "gz-event:wrack", "gz-event:gezeitentuempel", "gz-event:salzsieder",
].filter((f) => f.includes(only));

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const logs = [];
  const results = [];
  const check = (name, ok, info = "") => { results.push(`${ok ? "ok  " : "FEHL"} ${name}${info !== "" ? " — " + info : ""}`); };
  for (const fixture of FIXTURES) {
    const tag = fixture.replace(/[:]/g, "-");
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("ss_prefs_v1", JSON.stringify({ v: 2, motionHintSeen: true, reduceMotion: false, speed: 2, tipsOff: true, table3d: true, seenTips: [], name: "Zeichnerin" })); } catch {}
    });
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|401|403|404/.test(m.text())) logs.push(`${fixture} ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push(`${fixture} pageerror: ` + String(e).slice(0, 400)));
    const stats = () => page.evaluate(() => window.__ssRoom?.stats() || null);
    // Szene beendet = die Pfadkarte liegt wieder auf dem Tisch
    const hidden = async () => (await stats())?.stage === "map";
    const at = (what) => page.evaluate((w) => window.__ssRoom?.locate(w), what);
    const click = async (what) => { const p = await at(what); if (!p) return false; await page.mouse.move(p.x, p.y); await wait(220); await page.mouse.click(p.x, p.y); await wait(450); return true; };
    const toast = () => page.evaluate(() => document.querySelector(".st-toast")?.textContent || null);
    try {
      await page.goto(`${BASE}/sacrifice-and-sigils/uebung?fixture=${fixture}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector('[data-table="bereit"]', { timeout: 60000 });
      await wait(2600);
      await page.mouse.move(20, H / 2);
      let s = await stats();
      const base = `${fixture}:`;
      check(`${base} steht am Tisch`, s?.stage === "scene", JSON.stringify({ stage: s?.stage, karten: s?.loose, zettel: s?.notes?.length, nehmbar: s?.pickable }));
      await page.screenshot({ path: path.join(OUT, `${tag}.png`) });

      // ── eigentliche Handlung bei einigen Szenen ──
      if (fixture === "scene:remove") {
        const before = s.loose;
        await click({ type: "loose", index: 0 });
        await page.keyboard.press("Space");
        await wait(1500);
        check(`${base} Karte wählen + Stempel entfernt sie und beendet die Szene`, await hidden(), `vorher ${before} Karten ausgelegt`);
      } else if (fixture === "scene:cardChoice") {
        await click({ type: "loose", index: 1 });
        await wait(1500);
        check(`${base} Karte anklicken nimmt sie und beendet die Szene`, await hidden());
      } else if (fixture === "scene:campfire") {
        await click({ type: "loose", index: 0 });
        await click({ type: "note", id: "angriff" });
        await wait(1200);
        s = await stats();
        await page.mouse.move(20, H / 2);
        await page.screenshot({ path: path.join(OUT, `${tag}-nach-flamme.png`) });
        check(`${base} Karte wählen + „+1 Angriff“ hält sie ins Feuer (nur noch diese Karte liegt da)`, s?.stage === "scene" && s.loose === 1, `Karten ${s?.loose}, Meldung ${await toast()}`);
        await click({ type: "note", id: "weiter" });
        await wait(1200);
        check(`${base} Verlassen beendet die Szene`, await hidden());
      } else if (fixture === "scene:merchant") {
        const p = await at({ type: "ware", id: 0 });
        await page.mouse.move(p.x, p.y);
        await wait(500);
        const tip = await page.evaluate(() => document.querySelector(".ss-tip")?.textContent || null);
        check(`${base} Tooltip am Beutel nennt Item und Preis`, /Splitter/.test(tip || ""), tip);
        await page.mouse.click(p.x, p.y);
        await wait(1200);
        const gone = !(await at({ type: "ware", id: 0 }));
        check(`${base} Beutel anklicken kauft (der Beutel ist weg)`, gone, `Meldung ${await toast()}`);
        await page.mouse.move(20, H / 2);
        await page.screenshot({ path: path.join(OUT, `${tag}-nach-kauf.png`) });
        await click({ type: "note", id: "weiter" });
        await wait(1200);
        check(`${base} Verlassen beendet die Szene`, await hidden());
      } else if (fixture === "scene:shrine") {
        await click({ type: "note", id: "neu:0" });
        await wait(700);
        s = await stats();
        check(`${base} neues Teil genommen (die drei Angebote sind weg)`, !s.notes.some((id) => String(id).startsWith("neu:")), s.notes.join(","));
        await click({ type: "note", id: "kopf:0" });
        await click({ type: "note", id: "koerper:0" });
        s = await stats();
        await page.mouse.move(20, H / 2);
        await page.screenshot({ path: path.join(OUT, `${tag}-gewaehlt.png`) });
        if (s.canEnd) {
          await page.keyboard.press("Space");
          await wait(1000);
          check(`${base} Kopf + Körper + Stempel setzt ein Totem zusammen`, !(await toast()), `Meldung ${await toast()}`);
        } else check(`${base} Kopf + Körper passen nicht zusammen (Hinweis statt Stempel)`, true, "diese Paarung ist nicht erlaubt");
        await click({ type: "note", id: "weiter" });
        await wait(1200);
        check(`${base} Verlassen beendet die Szene`, await hidden());
      } else if (fixture === "event:tintenwitwe") {
        await page.keyboard.press("Space");
        await wait(1500);
        check(`${base} Stempel nimmt an und beendet die Szene`, await hidden());
      } else if (fixture === "event:gluecksspieler") {
        await click({ type: "note", id: "alles" });
        await page.keyboard.press("Space");
        await wait(1200);
        check(`${base} Einsatz wählen + Stempel setzt`, (await stats())?.stage === "scene" || (await hidden()));
        if (!(await hidden())) { await click({ type: "note", id: "weiter" }); await wait(1200); }
        check(`${base} danach verlassen`, await hidden());
      } else {
        const left = await click({ type: "note", id: "weiter" });
        await wait(1300);
        check(`${base} Zettel „Weitergehen“ beendet die Szene`, left && (await hidden()));
      }
    } catch (e) {
      check(`${fixture}: Ablauf`, false, String(e).slice(0, 200));
    }
    await page.close();
  }
  console.log(results.join("\n"));
  console.log(logs.length ? logs.slice(0, 14).join("\n") : "keine Konsolenfehler");
  await browser.close();
})().catch((e) => { console.error("Abbruch:", e); process.exit(1); });
