// Pfad der Moorwanderung am Tisch (Rebuild Phase 6): Karte am Tisch, gegenüber sitzt niemand, Mitspieler-Zettel,
// Orte anklicken → Szene (nach dem Weg der Figur) oder Kampf (die Gestalt des NPCs setzt sich an denselben Tisch),
// Belohnung nach einem Kampf am Tisch. Ausweichweg ?tisch=alt.
// Aufruf: node moorpfad.cjs · Bilder: Temp-Ordner ss-tisch/moorpfad
const puppeteer = require("puppeteer");
const path = require("path");
const OUT = path.join(require("os").tmpdir(), "ss-tisch", "moorpfad");
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
    page.on("console", (m) => { if (m.type() === "error" && !/Twitch|500 \(Internal|401|403|404/.test(m.text())) logs.push(`${fixture} ${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => logs.push(`${fixture} pageerror: ` + String(e).slice(0, 400)));
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
    // ── Startdeck ──
    {
      const ps = await open("starter");
      await ps.waitForFunction(() => window.__ssRoom?.stats().stage === "starter" && !document.querySelector(".st-root[hidden]"), { timeout: 60000 }).catch(() => {});
      await wait(1800);
      let st = await stats(ps);
      check("Startdeck am Tisch: drei Auslagen à 8 Karten, drei Schilder", st?.stage === "starter" && st.loose === 24 && st.notes.length === 3 && st.seated === false, JSON.stringify({ stage: st?.stage, karten: st?.loose, schilder: st?.notes }));
      await shot(ps, "0-startdeck");
      await aim(ps, { type: "note", id: st.notes[1] });
      const t0 = await tip(ps);
      await ps.mouse.down(); await ps.mouse.up();
      await wait(500);
      st = await stats(ps);
      check("Schild anklicken wählt das Deck (Karten heben sich, Stempel bereit)", st.picked === 8 && st.canEnd, JSON.stringify({ gehoben: st.picked, stempel: st.canEnd, tip: t0.slice(0, 60) }));
      await shot(ps, "0-startdeck-gewaehlt");
      await ps.mouse.move(5, 5);
      await ps.keyboard.press("Space");
      await wait(1500);
      const done = await ps.evaluate(() => document.querySelector(".st-toast")?.textContent || "");
      const after = await stats(ps);
      check("Stempel: Deck gewählt — warten auf die anderen oder (haben alle gewählt) gleich die Pfadkarte am selben Tisch", (/gewählt/.test(done) && after.canEnd === false) || after.stage === "map", JSON.stringify({ stage: after.stage, hinweis: done }));
      await ps.close();
    }

    // ── Pfad ──
    const page = await open("path");
    await page.waitForFunction(() => window.__ssRoom?.stats().stage === "map" && !document.querySelector(".st-root[hidden]"), { timeout: 60000 });
    await wait(2200);
    let s = await stats(page);
    check("Run-Pfad am Tisch, gegenüber sitzt niemand, Mitspieler-Zettel liegt", s.stage === "map" && s.seated === false && s.notes !== undefined, JSON.stringify({ stage: s.stage, sitzt: s.seated, ebene: s.map?.level }));
    await aim(page, { type: "note", id: "mitspieler" });
    const t1 = await tip(page);
    check("Mitspieler-Zettel: Tooltip nennt Siegel und Status", /Siegeln/.test(t1), t1.slice(0, 120));
    await shot(page, "1-pfad");
    // Orte der aktuellen Ebene: erst einen ohne Kampf suchen (Szene), sonst den ersten erreichbaren
    const lv = s.map.level;
    const nodes = [];
    for (let st = 0; st < 3; st++) {
      const p = await aim(page, { type: "node", lv, st });
      if (!p) continue;
      const pick = await page.evaluate((q) => window.__ssRoom.pickAtScreen(q.x, q.y), p);
      nodes.push({ st, text: await tip(page), node: pick?.type === "node" });
    }
    const reach = nodes.filter((n) => n.node && /hierhin/.test(n.text));
    check("Orte zeigen beim Zeigen, was dort wartet", reach.length > 0, nodes.map((n) => n.text.slice(0, 40)).join(" | "));
    await page.evaluate(() => { window.__ssRoom.__marke = "pfad"; });
    const fightFirst = reach.find((n) => /Kampf|Boss|Elite|Hausregel/.test(n.text)) || reach[0];
    const p = await aim(page, { type: "node", lv, st: fightFirst.st });
    await page.mouse.click(p.x, p.y);
    await wait(400);
    const during = await stats(page);
    await page.waitForFunction(() => ["battle", "scene"].includes(window.__ssRoom?.stats().stage), { timeout: 15000 }).catch(() => {});
    await wait(2200);
    s = await stats(page);
    const same = await page.evaluate(() => window.__ssRoom?.__marke === "pfad");
    if (s.stage === "battle") {
      check("Kampf-Ort: derselbe Tisch, die Gestalt des NPCs setzt sich mit Maske", same && s.seated === true && s.sat > 0.99 && !!s.mask, JSON.stringify({ gleich: same, sitzt: s.seated, maske: s.mask }));
    } else {
      check("Szenen-Ort: Karte bleibt kurz liegen (Figur läuft), dann die Szene am selben Tisch", during.stage === "map" && s.stage === "scene" && same, JSON.stringify({ direkt: during.stage, danach: s.stage, gleich: same }));
    }
    await page.mouse.move(W / 2, H * 0.4);
    await shot(page, `2-${s.stage}`);
    await page.close();

    // ── Kampf-Ort: in mehreren Proben einen erreichbaren Kampf suchen; die Gestalt des NPCs setzt sich an denselben Tisch ──
    let fought = false;
    for (const extra of ["&players=2", "&players=3", "&zirkel=gezeiten", "&players=5", "&players=6&zirkel=gezeiten"]) {
      if (fought) break;
      const pf = await open("path", extra);
      await pf.waitForFunction(() => window.__ssRoom?.stats().stage === "map", { timeout: 60000 }).catch(() => {});
      await wait(1800);
      const lv2 = (await stats(pf))?.map?.level ?? 0;
      for (let st = 0; st < 3 && !fought; st++) {
        const q = await aim(pf, { type: "node", lv: lv2, st });
        if (!q) continue;
        const text = await tip(pf);
        if (!/hierhin/.test(text) || !/Kampf|Boss/.test(text)) continue;
        await pf.evaluate(() => { window.__ssRoom.__marke = "pfad"; });
        await pf.mouse.click(q.x, q.y);
        await pf.waitForFunction(() => window.__ssRoom?.stats().stage === "battle", { timeout: 15000 }).catch(() => {});
        await wait(2500);
        const b = await stats(pf);
        const same = await pf.evaluate(() => window.__ssRoom?.__marke === "pfad");
        check("Kampf-Ort: derselbe Tisch, die Gestalt des NPCs setzt sich mit Maske", b?.stage === "battle" && same && b.seated === true && b.sat > 0.99 && !!b.mask, JSON.stringify({ probe: extra, stage: b?.stage, gleich: same, sitzt: b?.seated, maske: b?.mask }));
        await pf.mouse.move(W / 2, H * 0.4);
        await wait(300);
        await shot(pf, "4-kampf-npc-sitzt");
        fought = true;
      }
      await pf.close();
    }
    if (!fought) check("Kampf-Ort: in keiner Probe ein erreichbarer Kampf gefunden", false);

    // ── Belohnung nach einem Kampf ──
    const pr = await open("reward");
    await pr.waitForFunction(() => window.__ssRoom?.stats().stage === "scene", { timeout: 60000 }).catch(() => {});
    await wait(1800);
    let r = await stats(pr);
    check("Belohnung am Tisch: drei Karten liegen aus", r?.stage === "scene" && r.loose === 3, JSON.stringify({ stage: r?.stage, karten: r?.loose }));
    await shot(pr, "3-belohnung");
    await aim(pr, { type: "loose", index: 0 });
    await pr.mouse.down(); await pr.mouse.up();
    await pr.waitForFunction(() => window.__ssRoom?.stats().stage === "map", { timeout: 10000 }).catch(() => {});
    r = await stats(pr);
    check("Belohnung: Karte nehmen, zurück auf die Karte", r?.stage === "map", r?.stage);
    await pr.close();

    // ── Ausweichweg ──
    const pa = await open("path", "&tisch=alt");
    await wait(4000);
    const old = await pa.evaluate(() => !document.querySelector(".st-root:not([hidden])") && !!document.querySelector(".ss-run-bar"));
    check("Ausweichweg (alt): bisheriger Pfad mit Fortschrittsleiste", old);
    await pa.close();
  } catch (e) {
    results.push("ABBRUCH " + String(e).slice(0, 400));
  }
  await browser.close();
  console.log(results.join("\n"));
  console.log(logs.length ? "\nKonsole:\n" + logs.join("\n") : "\nKonsole: sauber");
  console.log("Bilder:", OUT);
})();
