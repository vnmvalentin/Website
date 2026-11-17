// Twitch-Erweiterung „Win Tracker“ (Ausbauplan „twitch-erweiterung“, Frontend/twitch-extension/): Twitchs Regeln für
// das Paket (Helfer in jeder Seite, kein Inline-Skript, relative Pfade, keine data:-Bilder, kein public/), Texte in
// beiden Sprachen, Datenquelle der Karte (gedrosselt, Sprache des Zuschauers, Zustände) und das Zip.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { missingKeys } from "../../../i18n/core.js";

const ext = (rel) => new URL(`../../../../twitch-extension/${rel}`, import.meta.url);
const read = (rel) => fs.readFileSync(ext(rel), "utf8");

test("Paket: jede Seite lädt Twitchs Helfer zuerst, kein Inline-Skript", () => {
  for (const page of ["panel.html", "config.html"]) {
    const html = read(page);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length >= 2, page);
    assert.match(scripts[0][1], /src="https:\/\/extension-files\.twitch\.tv\/helper\/v1\/twitch-ext\.min\.js"/, `${page}: Helfer zuerst`);
    for (const [, attrs, body] of scripts) {
      assert.ok(/\ssrc=/.test(attrs), `${page}: Skript ohne src`);
      assert.equal(body.trim(), "", `${page}: Inline-Skript`);
    }
  }
});

test("Paket: relative Pfade, kein public/, keine data:-Bilder, Datenmodul der Karte getauscht", () => {
  const cfg = read("vite.config.js");
  assert.match(cfg, /base: "\.\/"/);
  assert.match(cfg, /publicDir: false/);
  assert.match(cfg, /assetsInlineLimit: 0/);
  assert.match(cfg, /winTrackerApi/);
  assert.match(cfg, /normalizePath\(path\.join\(here, "src", "extApi\.js"\)\)/, "sonst doppelt im Paket");
  // Die Karte muss ihre Daten weiter über getOverlayData holen — sonst greift der Tausch nicht
  const card = fs.readFileSync(new URL("../../ClashRoyale/WinTracker/WinTrackerOverlayPage.jsx", import.meta.url), "utf8");
  assert.match(card, /import \{ getOverlayData \} from "\.\/winTrackerApi";/);
  assert.match(card, /useParams\(\)/);
  // Kein Tailwind in der Karte: die Erweiterung bringt kein Website-CSS mit (inline-Styles)
  assert.equal(/className=/.test(card), false, "Karte nutzt className — das Panel hätte dafür kein CSS");
  const pkg = JSON.parse(fs.readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts["twitch-ext:build"], /twitch-extension\/vite\.config\.js.*pack\.mjs/);
  for (const f of ["fonts/inter-latin.woff2", "fonts/lilita-one-latin.woff2"]) assert.ok(fs.statSync(ext(f)).size > 5000, f);
});

test("Texte: Deutsch und Englisch vollständig", async () => {
  const { EXT_TEXTS } = await import("../../../../twitch-extension/src/texts.js");
  assert.deepEqual(EXT_TEXTS.langs, ["de", "en"]);
  assert.deepEqual(missingKeys(EXT_TEXTS.dict("de"), EXT_TEXTS.dict("en")), []);
  assert.deepEqual(missingKeys(EXT_TEXTS.dict("en"), EXT_TEXTS.dict("de")), []);
  assert.equal(EXT_TEXTS.dict("en").config.missingSteps.length, 3);
});

test("Datenquelle: Token im Kopf, höchstens alle 30 s, Sprache des Zuschauers, Zustände", async () => {
  const calls = [];
  let reply = { ok: true, tracker: true, state: { hasAccount: true, settings: { language: "de", trackMode: "medals" } } };
  let authCb = null;
  globalThis.window = {
    location: { search: "?language=en-gb&mode=viewer" },
    Twitch: { ext: { onAuthorized: (cb) => { authCb = cb; }, onContext: () => {}, onVisibilityChanged: () => {} } },
  };
  globalThis.fetch = async (url, opts) => { calls.push({ url, auth: opts.headers.Authorization }); return { ok: true, status: 200, json: async () => structuredClone(reply) }; };
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const twitch = await import("../../../../twitch-extension/src/twitch.js");
    const api = await import("../../../../twitch-extension/src/extApi.js");
    assert.equal(twitch.initTwitch(), true);
    assert.equal(twitch.viewerLang(), "en");
    const seen = [];
    api.subscribeStatus((s) => seen.push(s.phase));
    const first = api.getOverlayData("egal");
    authCb({ token: "TOKEN1" });
    const s1 = await first;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://vnmvalentin.de/api/twitch-ext/panel");
    assert.equal(calls[0].auth, "Bearer TOKEN1");
    assert.equal(s1.settings.language, "en", "Sprache des Zuschauers statt der des Overlays");
    assert.deepEqual(seen, ["ok"]);
    // Die Karte fragt alle 8 s — innerhalb von 30 s dieselbe Antwort ohne Abruf
    now += 8000; await api.getOverlayData();
    now += 8000; await api.getOverlayData();
    assert.equal(calls.length, 1);
    now += 15000;
    reply = { ok: true, tracker: false, state: { hasAccount: false } };
    await api.getOverlayData();
    assert.equal(calls.length, 2);
    assert.deepEqual(seen, ["ok", "no_tracker"]);
  } finally {
    Date.now = realNow;
    delete globalThis.window;
  }
});

test("Zip: Dateien ohne umschließenden Ordner, Inhalt kommt unverändert wieder heraus", async () => {
  const { buildZip } = await import("../../../../twitch-extension/scripts/pack.mjs");
  const files = [
    { name: "twitch-extension/panel.html", data: Buffer.from("<!doctype html>".repeat(50)) },
    { name: "assets/bild.webp", data: Buffer.from([1, 2, 3, 4, 5]) },
  ];
  const zip = buildZip(files);
  // Zentralverzeichnis vom Ende lesen und jede Datei auspacken
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 2);
  let p = zip.readUInt32LE(end + 16);
  for (const f of files) {
    assert.equal(zip.readUInt32LE(p), 0x02014b50);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const offset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    assert.equal(name, f.name);
    const localNameLen = zip.readUInt16LE(offset + 26);
    const body = zip.subarray(offset + 30 + localNameLen, offset + 30 + localNameLen + size);
    const data = method === 8 ? zlib.inflateRawSync(body) : body;
    assert.deepEqual(Buffer.from(data), f.data);
    assert.equal(crc, zlib.crc32(f.data));
    p += 46 + nameLen;
  }
});
