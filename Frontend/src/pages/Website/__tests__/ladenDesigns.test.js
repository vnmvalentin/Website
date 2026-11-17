// npm test -- Website — Designs aus dem Laden in den Spielen (Spur D, Anschluss kosmetik-artikel): Jedes Design, das ein
// Spiel als „aus dem Laden“ führt, ist ein gültiger Artikel desselben Spiels im Katalog des Servers
// (Backend/laden/katalog.js — ohne Datenbank, gefahrlos per require lesbar), und umgekehrt hat jeder Artikel ein Design.
// Dazu die Regeln: gekauft = wählbar, nicht gekauft = nie (auch nicht über Erfolge), fremde Blobs zeigen alles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKINS, SKIN_IDS, isUnlocked } from "../../FlickSoccer/engine/skins.js";
import { FREIE_HUETE, LADEN_HUETE, SKIN_HATS, eigenerSkin, hutErlaubt, normalizeSkin, randomSkin, waehlbareHuete } from "../../Worldflip/skins.js";
import { ZIER, eigeneZier, merkeZier, sauberZier, zierErlaubt } from "../../Blobby/zier.js";
import { ladenBesitzSofort } from "../../../utils/spielstand.js";
import { HUT_IDS } from "../../GardenGame/engine/huete.js";

const require = createRequire(import.meta.url);
const { ARTIKEL, gueltigeArtikel } = require("../../../../../Backend/laden/katalog.js");
// Farm: Katalog am Server (ohne Abhängigkeiten), gezeichnet im Browser (engine/huete.js)
const { RESKIN_KATALOG } = require("../../../../../Backend/garden/core/reskins.js");
const FARM_LADEN = Object.values(RESKIN_KATALOG).flat().filter((e) => e.laden);
const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../public");

function speicher(start = {}) {
  const m = new Map(Object.entries(start).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// Was die Spiele aus dem Laden führen: [Artikel-ID, Spiel]
const IM_SPIEL = [
  ...SKIN_IDS.filter((id) => SKINS[id].laden).map((id) => [SKINS[id].laden, "flick-soccer"]),
  ...Object.values(LADEN_HUETE).map((id) => [id, "worldflip"]),
  ...ZIER.filter((z) => z.laden).map((z) => [z.laden, "blobby"]),
  ...FARM_LADEN.map((e) => [e.laden, "garden"]),
];

test("Farm: jeder Laden-Hut wird im Browser gezeichnet", () => {
  assert.ok(FARM_LADEN.length >= 2);
  for (const e of FARM_LADEN) assert.ok(HUT_IDS.includes(e.id), e.id);
});

test("Spiel ↔ Katalog: jedes Laden-Design ist ein gültiger Artikel seines Spiels, jeder Artikel hat ein Design", () => {
  const gueltig = gueltigeArtikel(ARTIKEL, { error: (m) => assert.fail(m) });
  const nachId = new Map(gueltig.map((a) => [a.id, a]));
  for (const [id, spiel] of IM_SPIEL) {
    assert.ok(nachId.has(id), `${id} fehlt im Katalog`);
    assert.equal(nachId.get(id).spiel, spiel, id);
  }
  const imSpiel = new Set(IM_SPIEL.map(([id]) => id));
  for (const a of gueltig) {
    assert.ok(imSpiel.has(a.id), `${a.id}: kein Spiel zeigt dieses Design`);
    assert.equal(a.preisCent, 199, `${a.id}: Preis wie gewählt`);
    assert.ok(a.text?.de && a.text?.en, `${a.id}: Text DE/EN`);
    assert.ok(fs.existsSync(path.join(PUBLIC, a.bild)), `${a.id}: Bild ${a.bild} fehlt`);
  }
});

test("Flick Soccer: Laden-Scheiben nur mit Kauf, nie über Statistik", () => {
  const viel = { played: 999, wins: 999, goals: 999, tourStars: 999, trickDone: 99 };
  for (const id of SKIN_IDS.filter((x) => SKINS[x].laden)) {
    assert.equal(isUnlocked(id, viel), false, `${id} ohne Kauf`);
    assert.equal(isUnlocked(id, viel, new Set(["anderes"])), false);
    assert.equal(isUnlocked(id, {}, new Set([SKINS[id].laden])), true, `${id} mit Kauf`);
  }
  assert.equal(isUnlocked("klassik", {}), true, "freie Scheiben bleiben frei");
});

test("Worldflip/Spieleabend: Laden-Hüte nur mit Kauf wählbar, fremde Blobs zeigen sie, Bots würfeln sie nie", () => {
  assert.equal(SKIN_HATS.length, FREIE_HUETE + Object.keys(LADEN_HUETE).length);
  assert.ok(Number(Object.keys(LADEN_HUETE)[0]) === FREIE_HUETE);
  assert.ok(SKIN_HATS.length <= 32, "der Server lässt Hut-Nummern bis 31 durch");
  const krone = Number(Object.keys(LADEN_HUETE).find((h) => LADEN_HUETE[h] === "wf-hut-krone"));
  assert.equal(hutErlaubt(krone, new Set()), false);
  assert.equal(hutErlaubt(krone, new Set(["wf-hut-krone"])), true);
  assert.equal(waehlbareHuete(new Set()).length, FREIE_HUETE);
  assert.ok(waehlbareHuete(new Set(["wf-hut-krone"])).includes(krone));
  assert.equal(eigenerSkin({ c: 2, h: krone, f: 3 }, new Set()).h, 1, "eigener Skin ohne Kauf: Spitzhut");
  assert.equal(eigenerSkin({ c: 2, h: krone, f: 3 }, new Set(["wf-hut-krone"])).h, krone);
  assert.equal(normalizeSkin({ c: 2, h: krone, f: 3 }).h, krone, "andere am Tisch sehen den Hut");
  let zufall = 0;
  const random = () => (zufall = (zufall + 0.137) % 1);
  for (let i = 0; i < 200; i++) assert.ok(randomSkin([], random).h < FREIE_HUETE);
});

test("Blobby: Accessoire gemerkt im Browser, nur solange gekauft; Zahlen vom Server gesäubert", () => {
  const s = speicher({ "laden.besitz.blobby": ["bv-zier-sonnenbrille"] });
  assert.deepEqual([...ladenBesitzSofort("blobby", s)], ["bv-zier-sonnenbrille"]);
  merkeZier(1, s);
  assert.equal(eigeneZier(s), 1);
  merkeZier(2, s);
  assert.equal(eigeneZier(s), 0, "Strohhut nicht gekauft");
  assert.equal(eigeneZier(speicher({ blobby_zier: "1" })), 0, "ohne Besitz-Merker: ohne");
  assert.equal(zierErlaubt(0, new Set()), true);
  for (const x of [99, -1, 1.5, "1", null]) assert.equal(sauberZier(x), 0, String(x));
  assert.equal(sauberZier(2), 2);
});
