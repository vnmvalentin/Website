// npm test -- overlayVorlagen — Community-Vorlagen: Felder je Overlay, Namen, Grenzen, Übernahmen, Melden,
// Moderation, Löschen. Datenbank nur im Speicher, Router über einen kleinen Express-Server.
process.env.OVERLAY_VORLAGEN_DB = ":memory:";
delete process.env.BETREIBER_WEBHOOK_URL;
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const core = require("../core");
const store = require("../store");
const createRouter = require("../routes");

const ADMIN = "1";

function server() {
  const app = express();
  app.use((req, _res, next) => {
    const id = req.headers["x-user"];
    if (id) { req.twitchId = String(id); req.twitchLogin = `nutzer${id}`; }
    next();
  });
  const requireAuth = (req, res, next) => (req.twitchId ? next() : res.status(401).json({ code: "login" }));
  app.use("/api/vorlagen", createRouter({ requireAuth, optionalAuth: (_q, _r, n) => n(), isAdmin: (req) => req.twitchId === ADMIN }));
  return new Promise((resolve) => {
    const s = app.listen(0, () => {
      const base = `http://127.0.0.1:${s.address().port}/api/vorlagen`;
      const call = async (method, p, user, body) => {
        const r = await fetch(base + p, { method, headers: { "Content-Type": "application/json", ...(user ? { "x-user": user } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: r.status, json: await r.json() };
      };
      resolve({ call, close: () => s.close() });
    });
  });
}

test("Nur erlaubte Look-Felder, nur einfache Werte", () => {
  const s = core.sanitizeStyle("winChallenge", {
    boxBg: "#112233", accent: "#9146FF", opacity: 0.6, layout: "broadcast", titleAlign: "center",
    items: [{ name: "Inhalt" }], hostName: "x", boxBg2: "#fff", headerBg: "url(javascript:x)", titleColor: "x".repeat(30), boxWidth: 1e9,
  });
  assert.deepEqual(s, { boxBg: "#112233", accent: "#9146FF", opacity: 0.6, titleAlign: "center", layout: "broadcast" });
  assert.deepEqual(core.sanitizeStyle("twitch", { style: "classic", accent: "#ff0000", glass: false, radius: 6, modules: {} }), { style: "classic", accent: "#ff0000", glass: false, radius: 6 });
  assert.deepEqual(core.sanitizeStyle("winTracker", { overlayTheme: "royale", royalePanel: "red", borderColor: "", language: "en", chatEnabled: true }), { overlayTheme: "royale", royalePanel: "red", borderColor: "" });
  assert.equal(core.sanitizeStyle("winTracker", { language: "en" }), null, "nichts Brauchbares");
  assert.equal(core.sanitizeStyle("quatsch", { accent: "#fff" }), null);
  assert.equal(core.sanitizeStyle("twitch", ["#fff"]), null);
});

test("Namen", () => {
  assert.equal(core.cleanTitle("  Lila   Nacht \n"), "Lila Nacht");
  assert.equal(core.cleanTitle("ab"), null);
  assert.equal(core.cleanTitle("x".repeat(41)), null);
  assert.equal(core.cleanTitle("Mein Look www.spam.de"), null);
  assert.equal(core.cleanTitle("Look https://x"), null);
});

test("Teilen, Liste, Übernahmen, Grenzen", async () => {
  const { call, close } = await server();
  try {
    assert.equal((await call("POST", "/", null, { tool: "twitch", title: "Test", style: { accent: "#fff" } })).status, 401);
    let r = await call("POST", "/", "7", { tool: "twitch", title: "Kräftiges Lila", style: { accent: "#9146ff", style: "clean", modules: { poll: {} } } });
    assert.equal(r.status, 200);
    const id = r.json.vorlage.id;
    assert.deepEqual(r.json.vorlage.style, { accent: "#9146ff", style: "clean" }, "Inhalte fallen weg");
    assert.equal(r.json.vorlage.by, "nutzer7");
    assert.equal((await call("POST", "/", "7", { tool: "twitch", title: "Zweite", style: { accent: "#000" } })).json.code, "too_fast");
    assert.equal((await call("POST", "/", "7", { tool: "quatsch", title: "X X X", style: {} })).json.code, "bad_tool");
    assert.equal((await call("POST", "/", "8", { tool: "twitch", title: "x", style: { accent: "#000" } })).json.code, "bad_title");
    assert.equal((await call("POST", "/", "8", { tool: "twitch", title: "Leer", style: { modules: {} } })).json.code, "bad_style");

    // Übernahmen: einmal je Konto, eigene zählen nicht
    await call("POST", `/${id}/use`, "8");
    await call("POST", `/${id}/use`, "8");
    await call("POST", `/${id}/use`, "9");
    r = await call("POST", `/${id}/use`, "7");
    assert.equal(r.json.uses, 2);

    // Liste: öffentlich, sortiert, ohne Status für Fremde
    store.insert({ tool: "twitch", ownerId: "20", ownerName: "neu", title: "Neuer Look", style: { accent: "#123456" }, now: Date.now() + 1000 });
    r = await call("GET", "/?tool=twitch&sort=beliebt");
    assert.deepEqual(r.json.vorlagen.map((v) => v.title), ["Kräftiges Lila", "Neuer Look"]);
    assert.equal(r.json.vorlagen[0].status, undefined, "Fremde sehen keinen Status");
    r = await call("GET", "/?tool=twitch&sort=neu");
    assert.equal(r.json.vorlagen[0].title, "Neuer Look");
    r = await call("GET", "/?tool=twitch", "7");
    assert.equal(r.json.vorlagen.find((v) => v.id === id).own, true);

    // Grenze je Overlay
    for (let i = 0; i < core.MAX_PER_TOOL; i++) store.insert({ tool: "winChallenge", ownerId: "30", ownerName: "viel", title: `Look ${i}`, style: { accent: "#fff" }, now: 1 });
    assert.equal((await call("POST", "/", "30", { tool: "winChallenge", title: "Noch einer", style: { accent: "#fff" } })).json.code, "limit");
  } finally {
    close();
  }
});

test("Melden, Ausblenden, Prüfen, Löschen", async () => {
  const { call, close } = await server();
  try {
    const id = store.insert({ tool: "winTracker", ownerId: "40", ownerName: "zeigt", title: "Royale Gold", style: { overlayTheme: "royale" } });
    assert.equal((await call("POST", `/${id}/report`, "40")).json.code, "own");
    await call("POST", `/${id}/report`, "41");
    await call("POST", `/${id}/report`, "41");
    await call("POST", `/${id}/report`, "42");
    assert.equal(store.get(id).status, "public", "zwei verschiedene Meldungen: noch sichtbar");
    await call("POST", `/${id}/report`, "43");
    assert.equal(store.get(id).status, "hidden", "ab drei ausgeblendet");
    let r = await call("GET", "/?tool=winTracker");
    assert.equal(r.json.vorlagen.length, 0, "für alle anderen weg");
    r = await call("GET", "/?tool=winTracker", "40");
    assert.equal(r.json.vorlagen[0].status, "hidden", "der Besitzer sieht „wird geprüft“");
    assert.equal((await call("GET", `/${id}`, "41")).status, 404);
    assert.equal((await call("POST", `/${id}/use`, "41")).status, 404, "ausgeblendet lässt sich nicht übernehmen");

    // Betreiber
    assert.equal((await call("GET", "/gemeldet", "41")).status, 403);
    r = await call("GET", "/gemeldet", ADMIN);
    assert.equal(r.json.vorlagen[0].id, id);
    assert.equal(r.json.vorlagen[0].reports, 3);
    assert.equal((await call("POST", `/${id}/moderate`, "41", { action: "keep" })).status, 403);
    await call("POST", `/${id}/moderate`, ADMIN, { action: "keep" });
    assert.deepEqual([store.get(id).status, store.get(id).reports], ["public", 0]);
    await call("POST", `/${id}/moderate`, ADMIN, { action: "remove" });
    assert.equal(store.get(id).status, "removed");

    // Löschen: nur Besitzer oder Betreiber
    const id2 = store.insert({ tool: "twitch", ownerId: "50", ownerName: "x", title: "Weg damit", style: { accent: "#fff" } });
    assert.equal((await call("DELETE", `/${id2}`, "51")).status, 403);
    assert.equal((await call("DELETE", `/${id2}`, "50")).status, 200);
    assert.equal((await call("GET", `/${id2}`)).status, 404);
  } finally {
    close();
  }
});
