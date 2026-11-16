// npm test -- konto — /api/konto über HTTP mit den echten Middlewares aus konto/sitzung.js: Gast, Code, Discord
// (Attrappe statt discord.com), Verknüpfen und Zusammenführen, Spielstände, Löschen; dazu requireAuth für die
// Twitch-Bereiche. Speicher nur im Temp-Ordner.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const cookieParser = require("cookie-parser");

const { createKontoStore, tagVon } = require("../kontoStore");
const { createKontoRouter } = require("../kontoRoutes");
const { createSitzungsHelfer } = require("../sitzung");
const { createSessionStore } = require("../../lib/sessionStore");

const TAG = 24 * 60 * 60 * 1000;
const FRONTEND = "http://frontend.test";
const leise = { log() {}, warn() {}, error() {} };

// Discord-Attrappe: jede Anmeldung liefert den Nutzer, der gerade in `discordNutzer` steht
let discordNutzer = { id: "d100", username: "mia", global_name: "Mia", avatar: "abc" };
async function fakeFetch(url, opt = {}) {
  const antwort = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (url === "https://discord.com/api/oauth2/token") {
    const p = new URLSearchParams(opt.body);
    if (p.get("code") !== "gut") return antwort(400, { error: "invalid_grant" });
    return antwort(200, { access_token: "tok", token_type: "Bearer" });
  }
  if (url === "https://discord.com/api/users/@me") return antwort(200, discordNutzer);
  return antwort(404, {});
}

async function starteServer() {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "konto-http-"));
  const sessionStore = createSessionStore({ datei: path.join(ordner, "sessions.db") });
  const kontoStore = createKontoStore({ datei: path.join(ordner, "konten.db"), erfolgErlaubt: (s, id) => s === "worldflip" && id === "sieg" });
  const helfer = createSitzungsHelfer({ sessionStore, kontoStore, betreiberTwitchId: "999", lebensdauerMs: 30 * TAG, log: leise });
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.get("/api/nur-twitch", helfer.requireAuth, (req, res) => res.json({ twitchId: req.twitchId, kontoId: req.kontoId }));
  app.use("/api/konto", createKontoRouter({
    kontoStore, sessionStore,
    requireKonto: helfer.requireKonto, optionalKonto: helfer.optionalKonto,
    setzeSitzungsCookie: helfer.setzeSitzungsCookie, loescheSitzungsCookie: helfer.loescheSitzungsCookie,
    frontendUrl: FRONTEND,
    discord: { clientId: "cid", clientSecret: "geheim", redirectUri: `${FRONTEND}/api/konto/discord/callback` },
    fetchImpl: fakeFetch,
    log: leise,
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  return {
    basis, sessionStore, kontoStore,
    stop: () => { server.close(); sessionStore.close(); kontoStore.close(); },
  };
}

const cookieAus = (res, name) => {
  for (const c of res.headers.getSetCookie()) {
    const m = c.match(new RegExp(`^${name}=([^;]*)`));
    if (m) return m[1];
  }
  return null;
};
const mitCookie = (sid, extra = {}) => ({ ...extra, headers: { "Content-Type": "application/json", ...(extra.headers || {}), Cookie: `session=${sid}` } });
const json = (body, sid) => ({ method: "POST", headers: { "Content-Type": "application/json", ...(sid ? { Cookie: `session=${sid}` } : {}) }, body: JSON.stringify(body) });

/** Discord-Runde: start → (Attrappe) → callback. Liefert die Rücksprung-Adresse und ein neues Sitzungs-Cookie. */
async function discordRunde(basis, { sid, code = "gut", stateCookie = true, returnTo = "/flick-soccer" } = {}) {
  const start = await fetch(`${basis}/api/konto/discord/start?returnTo=${encodeURIComponent(returnTo)}`, { redirect: "manual", headers: sid ? { Cookie: `session=${sid}` } : {} });
  assert.equal(start.status, 302);
  const ziel = new URL(start.headers.get("location"));
  assert.equal(ziel.origin + ziel.pathname, "https://discord.com/api/oauth2/authorize");
  assert.equal(ziel.searchParams.get("scope"), "identify");
  const state = ziel.searchParams.get("state");
  const oauth = cookieAus(start, "konto_oauth");
  const cookies = [stateCookie ? `konto_oauth=${oauth}` : null, sid ? `session=${sid}` : null].filter(Boolean).join("; ");
  const cb = await fetch(`${basis}/api/konto/discord/callback?code=${code}&state=${state}`, { redirect: "manual", headers: cookies ? { Cookie: cookies } : {} });
  assert.equal(cb.status, 302);
  return { ort: new URL(cb.headers.get("location")), sid: cookieAus(cb, "session") };
}

test("ohne Anmeldung: /ich liefert null, Spielstände brauchen ein Konto", async () => {
  const s = await starteServer();
  try {
    assert.deepEqual(await (await fetch(`${s.basis}/api/konto/ich`)).json(), { konto: null });
    assert.equal((await fetch(`${s.basis}/api/konto/stand/worldflip`)).status, 401);
    assert.equal((await fetch(`${s.basis}/api/konto/katalog`)).status, 200);
  } finally {
    s.stop();
  }
});

test("Gast: Konto mit Code, zweites Gastkonto in derselben Sitzung abgelehnt, Twitch-Bereiche sagen 401", async () => {
  const s = await starteServer();
  try {
    const r = await fetch(`${s.basis}/api/konto/gast`, json({}));
    assert.equal(r.status, 200);
    const sid = cookieAus(r, "session");
    const { konto, code } = await r.json();
    assert.ok(sid && code);
    assert.equal(konto.gast, true);

    const ich = await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(sid))).json();
    assert.equal(ich.konto.id, konto.id);
    assert.equal((await fetch(`${s.basis}/api/konto/gast`, json({}, sid))).status, 409);

    const twitch = await fetch(`${s.basis}/api/nur-twitch`, mitCookie(sid));
    assert.equal(twitch.status, 401);
    assert.equal((await twitch.json()).twitchNoetig, true);
  } finally {
    s.stop();
  }
});

test("Spielstand: speichern, Konflikt eines zweiten Geräts, lesen; Abzeichen nur aus dem Katalog", async () => {
  const s = await starteServer();
  try {
    const sid = cookieAus(await fetch(`${s.basis}/api/konto/gast`, json({})), "session");
    const put = (body) => fetch(`${s.basis}/api/konto/stand/worldflip`, mitCookie(sid, { method: "PUT", body: JSON.stringify(body) }));
    assert.deepEqual((await (await put({ daten: { siege: 1 }, xp: 10, version: 0 })).json()).version, 1);
    const konflikt = await put({ daten: { siege: 0 }, xp: 0, version: 0 });
    assert.equal(konflikt.status, 409);
    assert.deepEqual((await konflikt.json()).stand.daten, { siege: 1 });
    assert.equal((await put({ daten: { x: 1 }, xp: -3, version: 1 })).status, 400);
    assert.equal((await fetch(`${s.basis}/api/konto/stand/gibts-nicht`, mitCookie(sid))).status, 404);

    const stand = await (await fetch(`${s.basis}/api/konto/stand/worldflip`, mitCookie(sid))).json();
    assert.deepEqual(stand.stand.daten, { siege: 1 });

    const erfolge = await (await fetch(`${s.basis}/api/konto/erfolge/worldflip`, json({ ids: ["sieg", "erfunden"] }, sid))).json();
    assert.deepEqual(erfolge, { neu: ["sieg"], abgelehnt: ["erfunden"] });
    const ich = await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(sid))).json();
    assert.equal(ich.konto.stufe.xp, 10);
    assert.equal(ich.konto.spiele[0].name, "Worldflip");
  } finally {
    s.stop();
  }
});

test("Wiederherstellungscode: auf einem anderen Gerät ins selbe Konto; falscher Code 404", async () => {
  const s = await starteServer();
  try {
    const r = await fetch(`${s.basis}/api/konto/gast`, json({}));
    const { konto, code } = await r.json();
    const neu = await fetch(`${s.basis}/api/konto/code`, json({ code: code.toLowerCase() }));
    assert.equal(neu.status, 200);
    assert.equal((await neu.json()).konto.id, konto.id);
    const sid2 = cookieAus(neu, "session");
    assert.ok(sid2 && sid2 !== cookieAus(r, "session"));
    assert.equal((await fetch(`${s.basis}/api/konto/code`, json({ code: "0000-0000-0000-0000" }))).status, 404);

    const neuerCode = await (await fetch(`${s.basis}/api/konto/code/neu`, json({}, sid2))).json();
    assert.notEqual(neuerCode.code, code);
    assert.equal((await fetch(`${s.basis}/api/konto/code`, json({ code }))).status, 404, "alter Code gilt nicht mehr");
  } finally {
    s.stop();
  }
});

test("Discord: Anmeldung legt ein Konto an; ohne passendes Prüf-Cookie oder bei Abbruch kein Konto", async () => {
  const s = await starteServer();
  try {
    discordNutzer = { id: "d100", username: "mia", global_name: "Mia", avatar: "abc" };
    const { ort, sid } = await discordRunde(s.basis);
    assert.equal(ort.origin, FRONTEND);
    assert.equal(ort.pathname, "/flick-soccer");
    assert.equal(ort.searchParams.get("konto"), "angemeldet");
    const ich = await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(sid))).json();
    assert.equal(ich.konto.name, "Mia");
    assert.equal(ich.konto.discord.id, "d100");
    assert.equal(ich.konto.avatar, "https://cdn.discordapp.com/avatars/d100/abc.png?size=128");

    // Gleiches Discord nochmal: dasselbe Konto
    const zweites = await discordRunde(s.basis);
    assert.equal((await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(zweites.sid))).json()).konto.id, ich.konto.id);

    const ohneCookie = await discordRunde(s.basis, { stateCookie: false });
    assert.equal(ohneCookie.ort.searchParams.get("konto"), "fehler");
    assert.equal(ohneCookie.ort.searchParams.get("grund"), "abgelaufen");
    assert.equal(ohneCookie.sid, null);

    const abgebrochen = await discordRunde(s.basis, { code: "schlecht" });
    assert.equal(abgebrochen.ort.searchParams.get("grund"), "discord");

    const fremdesZiel = await discordRunde(s.basis, { returnTo: "//boese.example/x" });
    assert.equal(fremdesZiel.ort.origin, FRONTEND);
    assert.equal(fremdesZiel.ort.pathname, "/profile");
  } finally {
    s.stop();
  }
});

test("Discord verknüpfen: Gast bekommt Discord; ein zweiter Gast mit demselben Discord wird zusammengeführt", async () => {
  const s = await starteServer();
  try {
    discordNutzer = { id: "d200", username: "tom", global_name: null, avatar: null };
    const g1 = cookieAus(await fetch(`${s.basis}/api/konto/gast`, json({})), "session");
    const k1 = (await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(g1))).json()).konto.id;
    await fetch(`${s.basis}/api/konto/stand/worldflip`, mitCookie(g1, { method: "PUT", body: JSON.stringify({ daten: { von: "g1" }, xp: 5, version: 0 }) }));
    const r1 = await discordRunde(s.basis, { sid: g1 });
    assert.equal(r1.ort.searchParams.get("konto"), "verknuepft");
    assert.equal(r1.sid, null, "beim Verknüpfen keine neue Sitzung");
    assert.equal((await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(g1))).json()).konto.name, "tom");

    const g2 = cookieAus(await fetch(`${s.basis}/api/konto/gast`, json({})), "session");
    const k2 = (await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(g2))).json()).konto.id;
    const r2 = await discordRunde(s.basis, { sid: g2 });
    assert.equal(r2.ort.searchParams.get("konto"), "zusammengefuehrt");
    // Beide Sitzungen zeigen aufs bleibende Konto (das aktuelle, weil keins Twitch hat); der Spielstand ist dabei
    const a = (await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(g1))).json()).konto;
    const b = (await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(g2))).json()).konto;
    assert.equal(a.id, k2);
    assert.equal(b.id, k2);
    assert.notEqual(k1, k2);
    assert.equal(a.spiele[0].spiel, "worldflip");
  } finally {
    s.stop();
  }
});

test("Trennen, Name, Sprache, Konto löschen", async () => {
  const s = await starteServer();
  try {
    discordNutzer = { id: "d300", username: "ela", global_name: "Ela", avatar: null };
    const { sid } = await discordRunde(s.basis);
    const trennen = await fetch(`${s.basis}/api/konto/trennen`, json({ art: "discord" }, sid));
    assert.equal(trennen.status, 409, "letzter Anmeldeweg");
    await fetch(`${s.basis}/api/konto/code/neu`, json({}, sid));
    assert.equal((await fetch(`${s.basis}/api/konto/trennen`, json({ art: "discord" }, sid))).status, 200);

    const name = await (await fetch(`${s.basis}/api/konto/name`, json({ name: "Ela K." }, sid))).json();
    assert.equal(name.konto.name, "Ela K.");
    assert.equal((await fetch(`${s.basis}/api/konto/name`, json({ name: "x" }, sid))).status, 400);
    const sprache = await fetch(`${s.basis}/api/konto/sprache`, mitCookie(sid, { method: "PUT", body: JSON.stringify({ sprache: "en" }) }));
    assert.equal((await sprache.json()).sprache, "en");

    assert.equal((await fetch(`${s.basis}/api/konto`, mitCookie(sid, { method: "DELETE", body: "{}" }))).status, 400);
    assert.equal((await fetch(`${s.basis}/api/konto`, mitCookie(sid, { method: "DELETE", body: JSON.stringify({ bestaetigt: true }) }))).status, 200);
    assert.deepEqual(await (await fetch(`${s.basis}/api/konto/ich`, mitCookie(sid))).json(), { konto: null });
  } finally {
    s.stop();
  }
});

test("alte Twitch-Sitzung bekommt beim ersten Gebrauch ihr Konto — es zählt nicht als neues Konto", async () => {
  const s = await starteServer();
  try {
    const alt = s.sessionStore.create("123", "valentin");
    const r = await (await fetch(`${s.basis}/api/nur-twitch`, mitCookie(alt))).json();
    assert.equal(r.twitchId, "123");
    assert.match(r.kontoId, /^k/);
    assert.equal(s.sessionStore.get(alt).kontoId, r.kontoId);
    assert.equal(s.kontoStore.kontoVonLink("twitch", "123"), r.kontoId);
    const heute = tagVon(Date.now());
    assert.equal(s.kontoStore.wiederkehr({ von: heute, bis: heute }).neu, 0);
  } finally {
    s.stop();
  }
});
