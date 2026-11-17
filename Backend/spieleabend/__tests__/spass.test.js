// Spieleabend: was man im Zimmer anstellen kann — Gesten, Licht, Fenster und Schneebälle, Limo mit Schluckauf, Sofa,
// die Katze. Ausführen: npm test -- spieleabend (im Backend-Ordner)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createZimmer, HICKS_MS, SCHNEE_HAND, RAD } = require("../zimmer");
const { katzeTick, streicheln, neueKatze, ORTE } = require("../katze");

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function aufbau() {
  let t = 1_000_000;
  const sent = [];
  const z = createZimmer({ send: (id, ev, data) => sent.push({ id, ev, data }), now: () => t, random: seeded(11) });
  const letzte = (id) => [...sent].reverse().find((m) => m.id === id && m.ev === "sa:zimmer")?.data;
  const { code } = z.erstellen("s1", { name: "Anna", token: "token-1-abcdef" });
  z.beitreten("s2", { code, name: "Ben", token: "token-2-abcdef" });
  return { z, sent, letzte, code, vor: (ms) => { t += ms; } };
}
const an = (sent, id, ev) => sent.filter((m) => m.id === id && m.ev === ev).map((m) => m.data);

test("Gesten-Rad: alle Gesten gehen an die anderen; zeigen braucht einen Punkt, der im Zimmer bleibt", () => {
  const { z, sent, vor } = aufbau();
  sent.length = 0;
  for (const art of RAD) {
    const daten = art === "zeigen" ? { art, punkt: { x: 2, y: 0.5, z: -99 } } : { art };
    assert.equal(z.geste("s1", daten).ok, true, art);
    vor(1300);
  }
  const bei = an(sent, "s2", "sa:geste");
  assert.deepEqual(bei.map((g) => g.art), RAD);
  assert.deepEqual(bei.find((g) => g.art === "zeigen").punkt, { x: 2, y: 0.5, z: -8 }, "auf das Zimmer begrenzt");
  assert.equal(z.geste("s1", { art: "zeigen" }).ok, false, "ohne Punkt");
  assert.equal(z.geste("s1", { art: "zeigen", punkt: { x: "a", y: 0, z: 0 } }).ok, false);
});

test("Licht: Schalter für alle, nicht als Stroboskop; Hinweis sagt, wer es war", () => {
  const { z, sent, letzte, vor } = aufbau();
  assert.equal(letzte("s2").licht, true);
  z.licht("s2");
  assert.equal(letzte("s1").licht, false);
  assert.ok(sent.some((m) => m.ev === "sa:hinweis" && /Ben macht das Licht aus/.test(m.data.text)));
  z.licht("s1");
  assert.equal(letzte("s1").licht, false, "zu schnell hintereinander zählt nicht");
  vor(1300);
  z.licht("s1");
  assert.equal(letzte("s2").licht, true);
});

test("Fenster und Schnee: nur am offenen Fenster und davor; drei Bälle, jeder Wurf auf jemanden oder an eine Stelle", () => {
  const { z, sent, letzte, vor } = aufbau();
  assert.equal(z.schneeHolen("s1").error, "Erst das Fenster öffnen.");
  z.fenster("s2");
  assert.equal(letzte("s1").fenster, true);
  assert.equal(z.schneeHolen("s1").error, "Geh näher ans Fenster.", "Anna steht noch an der Tür");
  z.ort("s1", { x: 0.2, z: -6.6, r: Math.PI });
  const r = z.schneeHolen("s1");
  assert.equal(r.ok, true);
  assert.equal(r.schnee, SCHNEE_HAND);
  assert.equal(letzte("s2").leute[0].schnee, SCHNEE_HAND, "die anderen sehen den Schnee in der Hand");
  sent.length = 0;
  assert.equal(z.geste("s1", { art: "schnee", ziel: 2 }).ok, true);
  assert.equal(z.geste("s1", { art: "schnee", ziel: 2 }).ok, false, "kurze Pause zwischen Würfen");
  vor(500);
  assert.equal(z.geste("s1", { art: "schnee", ziel: 1 }).ok, false, "nicht auf sich selbst (und ohne Punkt)");
  assert.equal(z.geste("s1", { art: "schnee", punkt: { x: 1, y: 0, z: 1 } }).ok, true);
  vor(500);
  assert.equal(z.geste("s1", { art: "schnee", ziel: 2 }).ok, true);
  vor(500);
  assert.equal(z.geste("s1", { art: "schnee", ziel: 2 }).error, "Keine Schneebälle mehr — hol neuen am Fenster.");
  const wuerfe = an(sent, "s2", "sa:geste");
  assert.deepEqual(wuerfe.map((g) => [g.ziel ?? "punkt", g.schnee]), [[2, 2], ["punkt", 1], [2, 0]]);
  z.fenster("s1");
  assert.equal(letzte("s1").fenster, false, "zu");
  z.fenster("s2");
  assert.equal(letzte("s1").fenster, false, "nicht im Dauerfeuer auf und zu");
  vor(1000);
  z.fenster("s2");
  assert.equal(letzte("s1").fenster, true);
});

test("Limo: Schluckauf kommt vom Server an alle (auch an den Trinker), hört nach einer Weile auf", () => {
  const { z, sent, vor } = aufbau();
  assert.equal(z.geste("s1", { art: "limo" }).ok, true);
  sent.length = 0;
  for (let i = 0; i < (HICKS_MS + 8000) / 200; i += 1) {
    vor(200);
    z.tick();
  }
  const hickserAnna = an(sent, "s1", "sa:geste").filter((g) => g.art === "hicks" && g.id === 1);
  const hickserBen = an(sent, "s2", "sa:geste").filter((g) => g.art === "hicks" && g.id === 1);
  assert.ok(hickserAnna.length >= 3 && hickserAnna.length <= 9, `${hickserAnna.length} Hickser`);
  assert.equal(hickserBen.length, hickserAnna.length, "beide sehen dieselben");
  sent.length = 0;
  for (let i = 0; i < 50; i += 1) {
    vor(200);
    z.tick();
  }
  assert.equal(sent.filter((m) => m.data?.art === "hicks").length, 0, "vorbei");
});

test("Sofa: drei Plätze, nicht doppelt, nicht vom Spielstuhl aus; wer einen Stuhl nimmt, steht vom Sofa auf", () => {
  const { z, letzte } = aufbau();
  assert.deepEqual(letzte("s1").sofa, [null, null, null]);
  assert.equal(z.sofa("s1", { platz: 1 }).ok, true);
  assert.equal(z.sofa("s2", { platz: 1 }).error, "Da sitzt schon jemand.");
  assert.equal(z.sofa("s2", { platz: 3 }).ok, false);
  assert.deepEqual(letzte("s2").sofa, [null, 1, null]);
  z.platz("s2", { platz: 0 });
  assert.equal(z.sofa("s2", { platz: 0 }).error, "Erst vom Spielstuhl aufstehen.");
  z.platz("s1", { platz: 1 });
  assert.deepEqual(letzte("s2").sofa, [null, null, null], "Anna ist vom Sofa an den Tisch");
  z.platz("s1", { platz: null });
  z.sofa("s1", { platz: 2 });
  z.sofa("s1", { platz: null });
  assert.deepEqual(letzte("s1").sofa, [null, null, null]);
  z.sofa("s1", { platz: 0 });
  z.verlassen("s1");
  assert.deepEqual(letzte("s2").sofa, [null, null, null], "wer geht, macht Platz");
});

test("Rauswerfen: nur der Gastgeber, nicht sich selbst; wer fliegt, erfährt es und kommt nicht wieder herein", () => {
  const { z, sent, letzte, code } = aufbau();
  assert.equal(z.kicken("s2", { person: 1 }).error, "Das macht der Gastgeber.");
  assert.equal(z.kicken("s1", { person: 1 }).error, "Dich selbst kannst du nicht hinauswerfen.");
  assert.equal(z.kicken("s1", { person: 99 }).ok, false);
  assert.equal(z.kicken("s1", { person: 2 }).ok, true);
  assert.ok(sent.some((m) => m.id === "s2" && m.ev === "sa:rausgeworfen" && m.data.von === "Anna"));
  assert.deepEqual(letzte("s1").leute.map((p) => p.name), ["Anna"]);
  assert.ok(sent.some((m) => m.ev === "sa:hinweis" && /Ben wurde hinausgeworfen/.test(m.data.text)));
  const wieder = z.beitreten("s2b", { code, name: "Ben", token: "token-2-abcdef" });
  assert.equal(wieder.ok, false);
  assert.equal(wieder.raus, true);
  assert.equal(z.beitreten("s3", { code, name: "Cem", token: "token-3-abcdef" }).ok, true, "andere dürfen weiter kommen");
});

test("Katze: streift umher, legt sich auf freie Stühle, springt herunter, wenn sich jemand setzt; Streicheln → schnurren", () => {
  const { z, sent, letzte, vor } = aufbau();
  const katzen = () => sent.filter((m) => m.ev === "sa:katze" && m.id === "s1").map((m) => m.data);
  const modi = new Set();
  for (let i = 0; i < 2000; i += 1) {
    vor(200);
    z.tick();
  }
  for (const k of katzen()) modi.add(k.modus);
  assert.ok(modi.has("ort") && modi.has("stuhl") && modi.has("betteln") && modi.has("fensterbank"), [...modi].join(","));
  for (const k of katzen()) if (k.modus === "ort") assert.ok(k.ort >= 0 && k.ort < ORTE);
  // aufs Streicheln reagiert sie
  z.katze("s2");
  const k = katzen().at(-1);
  assert.equal(k.modus, "schnurren");
  assert.equal(k.von, 2);
  const imStand = letzte("s1").katze;
  assert.ok(imStand && typeof imStand.nr === "number" && imStand.bis === undefined, "Zimmerstand hat die Katze, ohne interne Zeiten");
});

test("Katze (Modul): Stuhl besetzt → runter; Fenster auf → runter von der Fensterbank; nach Streicheln auf dem Stuhl weiterdösen", () => {
  const rnd = seeded(3);
  let t = 0;
  const room = { spiel: "vierGewinnt", phase: "lobby", partie: null, stuehle: [null, null], sofa: [null, null, null], fenster: false, leute: [{ id: 1, connected: true }] };
  room.katze = { ...neueKatze(t, rnd), modus: "stuhl", stuhl: 1, bis: 99999 };
  assert.equal(katzeTick(room, t, rnd), false, "bleibt liegen");
  room.stuehle[1] = 1;
  assert.equal(katzeTick(room, t, rnd), true);
  assert.notEqual(room.katze.modus === "stuhl" && room.katze.stuhl === 1, true, "springt herunter");
  room.stuehle[1] = null;
  room.katze = { ...room.katze, modus: "fensterbank", bis: 99999 };
  room.fenster = true;
  assert.equal(katzeTick(room, t, rnd), true);
  assert.notEqual(room.katze.modus, "fensterbank");
  room.katze = { ...room.katze, modus: "stuhl", stuhl: 0, bis: 99999 };
  assert.equal(streicheln(room, { id: 1 }, t, rnd), true);
  assert.deepEqual([room.katze.modus, room.katze.stuhl, room.katze.von], ["schnurren", 0, 1]);
  assert.equal(streicheln(room, { id: 1 }, t + 100, rnd), false, "nicht im Dauerfeuer");
  t += 5000;
  katzeTick(room, t, rnd);
  assert.deepEqual([room.katze.modus, room.katze.stuhl], ["stuhl", 0], "döst weiter");
  // Bots der letzten Partie sitzen noch: kein freier Stuhl für die Katze
  room.partie = { spiel: "vierGewinnt", besetzung: [{ person: null, bot: { name: "Kiesel" } }, { person: null, bot: null }] };
  room.katze = { ...room.katze, modus: "stuhl", stuhl: 0, bis: 99999 };
  assert.equal(katzeTick(room, t, rnd), true, "auf dem Bot-Platz liegt sie nicht");
});
