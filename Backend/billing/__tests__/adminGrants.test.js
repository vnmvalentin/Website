// npm test -- billing — Admin-Reiter „Abos“ (billing/adminGrants.js): vergeben, befristen, nehmen; nur der Betreiber
process.env.BILLING_DB = ":memory:";
process.env.STREAMER_TWITCH_ID = "owner-1";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const store = require("../billingStore");
const { isPremium } = require("../entitlements");
const { createAboAdminRouter } = require("../adminGrants");

const TAG = 24 * 60 * 60 * 1000;

async function mitServer(fn) {
  const uhr = { t: Date.UTC(2026, 10, 17) };
  const hinweise = [];
  const app = express();
  app.use(express.json());
  app.use("/abo", createAboAdminRouter({
    requireAuth: (req, res, next) => { req.twitchId = req.headers["x-wer"] || ""; return req.twitchId ? next() : res.status(401).json({ error: "Login" }); },
    istBetreiber: (req) => req.twitchId === "owner-1",
    twitchNutzer: async (login) => {
      if (login === "kaputt") throw new Error("Twitch 500");
      return login === "maxi_pro" ? { id: "4711", login: "maxi_pro", name: "Maxi_Pro" } : null;
    },
    benachrichtige: (id, info) => hinweise.push([id, info.bis]),
    now: () => uhr.t,
  }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${server.address().port}/abo`;
  const ruf = async (method, pfad, body, wer = "owner-1") => {
    const r = await fetch(basis + pfad, { method, headers: { "content-type": "application/json", "x-wer": wer }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  try {
    await fn({ ruf, uhr, hinweise });
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test("Abo-Vergabe: nur der Betreiber", async () => {
  await mitServer(async ({ ruf }) => {
    assert.equal((await ruf("GET", "/abos", null, "")).status, 401);
    assert.equal((await ruf("GET", "/abos", null, "jemand")).status, 403);
    assert.equal((await ruf("POST", "/abos", { login: "maxi_pro", tage: 30 }, "jemand")).status, 403);
    assert.equal(isPremium("4711"), false);
  });
});

test("Abo-Vergabe: Twitch-Name wird aufgelöst, befristet gilt bis zum Ablauf, Entfernen nimmt es sofort", async () => {
  await mitServer(async ({ ruf, uhr, hinweise }) => {
    assert.equal((await ruf("POST", "/abos", { login: "x", tage: 30 })).status, 400);
    assert.equal((await ruf("POST", "/abos", { login: "gibtsnicht", tage: 30 })).status, 404);
    assert.equal((await ruf("POST", "/abos", { login: "kaputt", tage: 30 })).status, 503);
    assert.equal((await ruf("POST", "/abos", { login: "maxi_pro", tage: -1 })).status, 400);

    const r = await ruf("POST", "/abos", { login: " @Maxi_Pro ", tage: 30, notiz: "Giveaway" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.neu, { twitchId: "4711", login: "maxi_pro", name: "Maxi_Pro", bis: uhr.t + 30 * TAG });
    assert.deepEqual(r.body.freischaltungen.map((g) => [g.twitchId, g.login, g.notiz, g.aktiv]), [["4711", "maxi_pro", "Giveaway", true]]);
    assert.deepEqual(hinweise, [["4711", uhr.t + 30 * TAG]]);
    assert.equal(isPremium("4711", uhr.t + 29 * TAG), true);
    assert.equal(isPremium("4711", uhr.t + 31 * TAG), false);

    // noch einmal vergeben = ändern (hier: dauerhaft), kein zweiter Eintrag
    const dauer = await ruf("POST", "/abos", { login: "maxi_pro", tage: 0 });
    assert.equal(dauer.body.freischaltungen.length, 1);
    assert.equal(dauer.body.freischaltungen[0].bis, 0);
    assert.equal(isPremium("4711", uhr.t + 4000 * TAG), true);

    const weg = await ruf("DELETE", "/abos/4711");
    assert.deepEqual(weg.body.freischaltungen, []);
    assert.equal(isPremium("4711", uhr.t), false);
    assert.equal((await ruf("DELETE", "/abos/kein-id")).status, 400);
  });
});

test("Abo-Vergabe: alte Freischaltungen ohne Namen bleiben lesbar, bezahlte Abos stehen in der Übersicht", async () => {
  store.setGrant("900", "von Hand");
  store.saveSubscription({ twitchId: "555", subscriptionId: "sub_x", plan: "premium", status: "active", currentPeriodEnd: 123, cancelAtPeriodEnd: true, updatedAt: 1 });
  await mitServer(async ({ ruf }) => {
    const l = (await ruf("GET", "/abos")).body;
    assert.deepEqual(l.freischaltungen.find((g) => g.twitchId === "900").login, "");
    assert.deepEqual(l.bezahlt, [{ twitchId: "555", status: "active", bis: 123, gekuendigt: true }]);
  });
  store.removeGrant("900");
});
