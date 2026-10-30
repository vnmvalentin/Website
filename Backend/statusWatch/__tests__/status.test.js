// npm run test:status — läuft komplett lokal: Website, /api/health und Discord sind ein Fake-Server auf 127.0.0.1.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const { nextState, emptyState, FAIL_THRESHOLD } = require("../statusLogic");
const { buildStatusPayload, formatDuration } = require("../statusEmbed");
const { buildUpdatePayload, selectNewEntries } = require("../updateEmbed");
const { createWebhook, parseWebhookUrl } = require("../webhook");
const { createStatusWatcher } = require("../watcher");

const UP = { website: { ok: true }, server: { ok: true, uptimeS: 999, botReady: true }, maintenance: false };
const SERVER_DOWN = { website: { ok: true }, server: { ok: false }, maintenance: false };

function run(probes, start = 1_000_000) {
  let s = emptyState();
  probes.forEach((p, i) => (s = nextState(s, p, start + i * 30000)));
  return s;
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "statuswatch-test-"));
const quietLog = { warn() {}, error() {}, log() {} };

// --- Logik -------------------------------------------------------------------------------------------

test("einzelner Fehlschlag (Neustart) bleibt grün, erst ab Schwelle rot", () => {
  assert.equal(run([UP, SERVER_DOWN]).components.server.shown, "up");
  const probes = [UP, ...Array(FAIL_THRESHOLD).fill(SERVER_DOWN)];
  const s = run(probes);
  assert.equal(s.components.server.shown, "down");
  assert.equal(s.components.bot.shown, "down");
  assert.equal(s.overall, "down");
});

test("Wartung zeigt sofort gelb statt rot", () => {
  const s = run([UP, { ...SERVER_DOWN, maintenance: true }]);
  assert.equal(s.components.server.shown, "maintenance");
  assert.equal(s.overall, "maintenance");
});

test("Bot kurz nach Backend-Start = verbindet, später = offline", () => {
  const fresh = run([{ ...UP, server: { ok: true, uptimeS: 10, botReady: false } }]);
  assert.equal(fresh.components.bot.shown, "connecting");
  const old = { ...UP, server: { ok: true, uptimeS: 900, botReady: false } };
  assert.equal(run(Array(FAIL_THRESHOLD).fill(old)).components.bot.shown, "down");
});

test("Störung wird nach Erholung zur letzten Störung mit Dauer und Teilen", () => {
  const s = run([UP, ...Array(FAIL_THRESHOLD + 2).fill(SERVER_DOWN), UP]);
  assert.equal(s.overall, "up");
  assert.equal(s.incident, null);
  assert.equal(s.lastIncident.worst, "down");
  assert.deepEqual(s.lastIncident.components, ["server", "bot"]);
  assert.ok(s.lastIncident.end > s.lastIncident.start);
});

test("Status-Embed enthält Punkte, groben Grund und keine Details", () => {
  const s = run([UP, ...Array(FAIL_THRESHOLD).fill(SERVER_DOWN)]);
  const d = buildStatusPayload(s, 2_000_000).embeds[0].description;
  assert.match(d, /🟢 \*\*Website\*\* — Online/);
  assert.match(d, /🔴 \*\*Server\*\* — Ausfall · Spiele, Login und Overlays/);
  assert.match(d, /Zuletzt geprüft <t:2000:R>/);
  assert.equal(formatDuration(3 * 60000), "3 Min.");
  assert.equal(formatDuration(125 * 60000), "2 Std. 5 Min.");
});

// --- Updates -----------------------------------------------------------------------------------------

test("alle echten Update-Einträge passen in Discords Embed-Grenzen", async () => {
  const src = path.resolve(__dirname, "..", "..", "..", "Frontend", "src", "utils", "newData.js");
  const { NEWS_UPDATES } = await import(pathToFileURL(src).href);
  for (const entry of NEWS_UPDATES) {
    const e = buildUpdatePayload(entry, "https://example.org/updates").embeds[0];
    assert.ok(e.title.length <= 256, entry.version);
    assert.ok(e.description.length > 0 && e.description.length <= 4096, entry.version);
    assert.ok(e.title.length + e.description.length + e.footer.text.length <= 6000, entry.version);
  }
});

test("Discord bekommt nur die Überschriften, nicht die Stichpunkte", () => {
  const entry = {
    date: "1.1.2026",
    version: "v1: Test",
    sections: [
      { title: "Neue Games: *Lights Out*", items: ["Geheimer Stichpunkt"] },
      { title: "Recap", items: ["Noch ein Stichpunkt"] },
    ],
  };
  const e = buildUpdatePayload(entry, "https://example.org/updates").embeds[0];
  assert.equal(e.title, "v1 – Test");
  assert.equal(e.fields, undefined);
  assert.match(e.description, /^• Neue Games: \\\*Lights Out\\\*\n• Recap\n\n\[Alle Details auf der Website\]\(https:\/\/example\.org\/updates\)$/);
  assert.doesNotMatch(e.description, /Stichpunkt/);
});

test("sehr viele Überschriften werden gekürzt statt abgeschnitten", () => {
  const sections = Array.from({ length: 60 }, (_, i) => ({ title: `Abschnitt ${i} ${"x".repeat(150)}`, items: [] }));
  const e = buildUpdatePayload({ date: "1.1.2026", version: "v1: Test", sections }, "u").embeds[0];
  assert.ok(e.description.length <= 4096);
  assert.match(e.description, /… und \d+ weitere/);
});

test("Auswahl neuer Updates", () => {
  const entries = [{ version: "c" }, { version: "b" }, { version: "a" }];
  assert.deepEqual(selectNewEntries(entries, null).map((e) => e.version), ["c"]);
  assert.deepEqual(selectNewEntries(entries, ["a"]).map((e) => e.version), ["b", "c"]);
  assert.deepEqual(selectNewEntries(entries, ["c", "b", "a"]), []);
});

test("Webhook-URL wird geprüft", () => {
  assert.ok(parseWebhookUrl("https://discord.com/api/webhooks/123/abc-DEF_9"));
  assert.equal(parseWebhookUrl("https://discord.com/channels/1/2"), null);
  assert.throws(() => createWebhook(""));
});

// --- Durchlauf gegen Fake-Server ---------------------------------------------------------------------

function startFake() {
  const fake = { site: true, health: true, botReady: true, messages: new Map(), calls: [], nextId: 100 };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const url = req.url.split("?")[0];
      const json = (status, data) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      if (url === "/") {
        if (!fake.site) return res.writeHead(502).end("Bad Gateway");
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end('<html><div id="root"></div></html>');
      }
      if (url === "/api/health") {
        if (!fake.health) return res.writeHead(502).end();
        return json(200, { ok: true, uptimeS: 999, bot: { ready: fake.botReady } });
      }
      const m = url.match(/^\/api\/webhooks\/1\/tok(?:\/messages\/(\w+))?$/);
      if (!m) return json(404, { code: 0 });
      fake.calls.push({ method: req.method, id: m[1], payload: body ? JSON.parse(body) : null });
      if (req.method === "POST") {
        const id = String(fake.nextId++);
        fake.messages.set(id, JSON.parse(body));
        return json(200, { id });
      }
      if (req.method === "PATCH") {
        if (!fake.messages.has(m[1])) return json(404, { code: 10008, message: "Unknown Message" });
        fake.messages.set(m[1], JSON.parse(body));
        return json(200, { id: m[1] });
      }
      json(405, {});
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      fake.base = `http://127.0.0.1:${server.address().port}`;
      fake.close = () => new Promise((r) => server.close(r));
      resolve(fake);
    })
  );
}

test("Prüfer: postet einmal, bearbeitet danach, postet neu wenn gelöscht", async () => {
  const fake = await startFake();
  const dir = tmpDir();
  let clock = 5_000_000;
  const make = () =>
    createStatusWatcher({
      websiteUrl: `${fake.base}/`,
      healthUrl: `${fake.base}/api/health`,
      webhook: createWebhook(`${fake.base}/api/webhooks/1/tok`),
      stateFile: path.join(dir, "status_state.json"),
      maintenanceFile: path.join(dir, "maintenance.json"),
      now: () => clock,
      log: quietLog,
    });
  try {
    let w = make();
    await w.tick();
    assert.deepEqual(fake.calls.map((c) => c.method), ["POST"]);
    assert.match(fake.messages.get("100").embeds[0].description, /Alle Systeme laufen/);

    // Gleicher Stand, keine Minute vergangen → keine Bearbeitung
    clock += 30000;
    await w.tick();
    assert.equal(fake.calls.length, 1);

    // Server fällt aus → nach Schwelle rot, dieselbe Nachricht wird bearbeitet
    fake.health = false;
    for (let i = 0; i < FAIL_THRESHOLD; i++) {
      clock += 30000;
      await w.tick();
    }
    assert.ok(fake.calls.slice(1).every((c) => c.method === "PATCH" && c.id === "100"));
    assert.match(fake.messages.get("100").embeds[0].description, /Server\*\* — Ausfall/);
    assert.equal(fake.messages.get("100").embeds[0].color, 0xed4245);

    // Neustart des Prüfers führt dieselbe Nachricht fort
    fake.health = true;
    w = make();
    clock += 30000;
    await w.tick();
    assert.equal(fake.calls.at(-1).id, "100");
    assert.match(fake.messages.get("100").embeds[0].description, /Letzte Störung/);

    // Jemand löscht die Nachricht → neu posten
    fake.messages.delete("100");
    clock += 61000;
    await w.tick();
    assert.equal(fake.calls.at(-1).method, "POST");
    assert.equal(w.getState().messageId, "101");

    // Wartungsfenster von deploy.sh
    fs.writeFileSync(path.join(dir, "maintenance.json"), JSON.stringify({ until: clock + 120000 }));
    fake.health = false;
    clock += 30000;
    await w.tick();
    assert.match(fake.messages.get("101").embeds[0].description, /🟡 \*\*Server\*\* — Wartung/);
  } finally {
    await fake.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function runPostUpdates(env, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, "..", "postUpdates.js")], {
      env: { ...process.env, ...env },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (out += c));
    child.on("close", (code) => resolve({ code, out }));
    child.stdin.end(JSON.stringify(input));
  });
}

test("postUpdates: erst nur das neueste, danach nur Neues, nichts doppelt", async () => {
  const fake = await startFake();
  const dir = tmpDir();
  const env = {
    STATUS_DATA_DIR: dir,
    DISCORD_UPDATES_WEBHOOK_URL: `${fake.base}/api/webhooks/1/tok`,
    FRONTEND_URL: "https://example.org/",
  };
  const entry = (v) => ({ date: "1.1.2026", version: `${v}: Titel`, sections: [{ title: "Neu", items: ["Etwas"] }] });
  try {
    let r = await runPostUpdates(env, { entries: [entry("v2"), entry("v1")] });
    assert.equal(r.code, 0, r.out);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].payload.embeds[0].title, "v2 – Titel");
    assert.equal(fake.calls[0].payload.embeds[0].url, "https://example.org/updates");

    r = await runPostUpdates(env, { entries: [entry("v2"), entry("v1")] });
    assert.equal(fake.calls.length, 1, r.out);

    r = await runPostUpdates(env, { entries: [entry("v4"), entry("v3"), entry("v2")] });
    assert.deepEqual(fake.calls.slice(1).map((c) => c.payload.embeds[0].title), ["v3 – Titel", "v4 – Titel"]);

    r = await runPostUpdates(env, { nope: true });
    assert.equal(r.code, 1);
  } finally {
    await fake.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
