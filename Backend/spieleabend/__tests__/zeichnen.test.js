// Spieleabend: Zeichen-Hochstapler — Rollen, Striche, Fristen, Abstimmung, Raten; dazu der Ablauf im Zimmer.
// Ausführen: npm test -- spieleabend (im Backend-Ordner)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Z = require("../spiele/zeichnen");
const { createZimmer } = require("../zimmer");

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const T0 = 1_000_000;
const runde = (n = 4, seed = 3) => Z.neu({ beginner: 0, aktiv: Array.from({ length: 6 }, (_, i) => i < n), random: seeded(seed), jetzt: T0 });
// einen ganzen Strich für den, der dran ist
const strich = (z, t) => Z.zug(z, z.reihenfolge[z.zugNr % z.reihenfolge.length], { art: "strich", punkte: [[0.1, 0.1], [0.5, 0.6]], fertig: true }, { jetzt: t });

test("Rollen: alle außer einem sehen das Wort, der Hochstapler nur die Kategorie, Zuschauer nichts", () => {
  const z = runde(4);
  assert.equal(z.phase, "wort");
  const h = z.hochstapler;
  assert.ok(z.reihenfolge.includes(h));
  for (const p of z.reihenfolge) {
    const s = Z.sicht(z, p);
    assert.equal(s.kategorie, z.kategorie);
    assert.equal(s.hochstapler, null, "wer Hochstapler ist, bleibt geheim");
    if (p === h) {
      assert.equal(s.rolle, "hochstapler");
      assert.equal(s.wort, null);
    } else {
      assert.equal(s.rolle, "kuenstler");
      assert.equal(s.wort, z.wort);
    }
  }
  assert.equal(Z.sicht(z, null).wort, null);
  assert.ok(Z._intern.WOERTER[z.kategorie].includes(z.wort));
});

test("Zeichnen: Rolle merken, dann reihum ein Strich, zwei Runden; Stücke gehen live, verpasste Frist überspringt", () => {
  const z = runde(3);
  assert.equal(Z.tick(z, T0 + 1000), false);
  assert.equal(Z.tick(z, T0 + Z.ZEIT.wort), true);
  assert.equal(z.phase, "zeichnen");
  const erster = Z.amZug(z);
  assert.equal(erster, z.reihenfolge[0]);
  const andere = z.reihenfolge[1];
  assert.equal(Z.zug(z, andere, { art: "strich", punkte: [[0, 0]] }).ok, false, "nicht dran");
  const r = Z.zug(z, erster, { art: "strich", punkte: [[0.1, 0.2], [2, -1], ["x", 1], [0.3, 0.3]] });
  assert.deepEqual(r.live, { art: "strich", platz: erster, nr: 0, punkte: [[0.1, 0.2], [1, 0], [0.3, 0.3]] }, "Zahlen begrenzt, Unsinn verworfen");
  assert.equal(Z.amZug(z), erster, "Strich läuft noch");
  assert.equal(Z.zug(z, erster, { art: "strich", punkte: [[0.4, 0.4]], fertig: true }, { jetzt: T0 + 7000 }).ok, true);
  assert.equal(Z.amZug(z), andere);
  // andere verpasst die Frist
  assert.equal(Z.tick(z, T0 + 7000 + Z.ZEIT.strich - 10), false);
  assert.equal(Z.tick(z, T0 + 7000 + Z.ZEIT.strich + 10), true);
  assert.equal(Z.amZug(z), z.reihenfolge[2]);
  let t = T0 + 100000;
  while (z.phase === "zeichnen") strich(z, (t += 1000));
  assert.equal(z.phase, "abstimmen");
  assert.equal(z.zugNr, 6, "3 Plätze × 2 Runden");
  assert.equal(Z.sicht(z, 0).striche.length, 5, "der verpasste Strich fehlt");
  assert.deepEqual(Z.sicht(z, 0).striche[0].punkte, [[0.1, 0.2], [1, 0], [0.3, 0.3], [0.4, 0.4]]);
});

function bisAbstimmung(n = 4, seed = 3) {
  const z = runde(n, seed);
  Z.tick(z, T0 + Z.ZEIT.wort);
  let t = T0 + 10000;
  while (z.phase === "zeichnen") strich(z, (t += 1000));
  return z;
}

test("Abstimmung: eindeutig gegen den Hochstapler → er darf raten; trifft er (auch mit Tippfehler), gewinnt er", () => {
  const z = bisAbstimmung(4);
  const h = z.hochstapler;
  const kuenstler = z.reihenfolge.filter((p) => p !== h);
  assert.equal(Z.zug(z, kuenstler[0], { art: "stimme", platz: kuenstler[0] }).ok, false, "nicht für sich selbst");
  for (const p of kuenstler) assert.equal(Z.zug(z, p, { art: "stimme", platz: h }).ok, true);
  assert.equal(Z.sicht(z, h).gestimmt.length, 3);
  assert.equal(Z.sicht(z, kuenstler[0]).meineStimme, h);
  Z.zug(z, h, { art: "stimme", platz: kuenstler[0] });
  assert.equal(z.phase, "raten", "alle haben gestimmt");
  assert.equal(Z.sicht(z, kuenstler[1]).hochstapler, h, "jetzt ist es raus");
  assert.equal(Z.zug(z, kuenstler[0], { art: "raten", wort: "x" }).ok, false, "nur der Hochstapler rät");
  const vertippt = z.wort.length >= 5 ? z.wort.slice(0, -1) + "x" : z.wort.toUpperCase();
  assert.equal(Z.zug(z, h, { art: "raten", wort: vertippt }).ok, true);
  assert.equal(z.fertig, true);
  assert.equal(z.richtig, true);
  assert.equal(z.sieger, h);
  assert.deepEqual(z.siegerListe, [h]);
  assert.equal(Z.sicht(z, kuenstler[0]).wort, z.wort);
});

test("Abstimmung: Gleichstand oder falscher Verdacht → Hochstapler gewinnt; falsch geraten → Künstler gewinnen", () => {
  const z = bisAbstimmung(4, 5);
  const h = z.hochstapler;
  const k = z.reihenfolge.filter((p) => p !== h);
  Z.zug(z, k[0], { art: "stimme", platz: h });
  Z.zug(z, k[1], { art: "stimme", platz: k[2] });
  Z.zug(z, k[2], { art: "stimme", platz: k[1] });
  Z.zug(z, h, { art: "stimme", platz: k[0] });
  assert.equal(z.fertig, true, "keine eindeutige Mehrheit gegen ihn");
  assert.equal(z.erwischt, false);
  assert.equal(z.sieger, h);

  const y = bisAbstimmung(3, 9);
  const hy = y.hochstapler;
  const ky = y.reihenfolge.filter((p) => p !== hy);
  for (const p of ky) Z.zug(y, p, { art: "stimme", platz: hy });
  // der Hochstapler stimmt nicht: die Frist zählt aus
  assert.equal(Z.tick(y, T0 + 10 ** 7), true);
  assert.equal(y.phase, "raten");
  Z.zug(y, hy, { art: "raten", wort: "Quatschwort" });
  assert.equal(y.richtig, false);
  assert.equal(y.sieger, null);
  assert.deepEqual(y.siegerListe.sort(), ky.sort());
});

test("Gehen mitten im Spiel: wer zeichnen müsste, wird übersprungen; geht der Hochstapler, endet die Runde", () => {
  const z = runde(4, 11);
  Z.tick(z, T0 + Z.ZEIT.wort);
  const h = z.hochstapler;
  const dran = Z.amZug(z);
  const nicht = z.reihenfolge.find((p) => p !== h && p !== dran);
  Z.verlassen(z, nicht, T0 + 7000);
  let t = T0 + 8000;
  const gezeichnet = [];
  while (z.phase === "zeichnen") {
    gezeichnet.push(Z.amZug(z));
    strich(z, (t += 1000));
  }
  assert.ok(!gezeichnet.includes(nicht), "Gegangene zeichnen nicht mehr");
  const y = runde(4, 11);
  Z.tick(y, T0 + Z.ZEIT.wort);
  Z.verlassen(y, y.hochstapler, T0 + 7000);
  assert.equal(y.fertig, true);
  assert.equal(y.grund, "weg");
  assert.equal(y.sieger, null);
});

test("Zimmer: Zeichen-Hochstapler ohne Bots ab drei, Striche gehen live an die anderen, Fristen über tick", () => {
  let t = 2_000_000;
  const sent = [];
  const zim = createZimmer({ send: (id, ev, data) => sent.push({ id, ev, data }), now: () => t, random: seeded(4) });
  const letzte = (id) => [...sent].reverse().find((m) => m.id === id && m.ev === "sa:zimmer")?.data;
  const { code } = zim.erstellen("s1", { name: "Anna", token: "token-1-abcdef" });
  zim.beitreten("s2", { code, name: "Ben", token: "token-2-abcdef" });
  zim.spielWaehlen("s1", { spiel: "zeichnen" });
  zim.platz("s1", { platz: 0 });
  zim.platz("s2", { platz: 1 });
  assert.match(zim.start("s1").error, /mindestens 3/, "zu zweit geht es nicht, Bots zeichnen nicht");
  zim.beitreten("s3", { code, name: "Cem", token: "token-3-abcdef" });
  zim.platz("s3", { platz: 2 });
  assert.equal(zim.start("s1").ok, true);
  let v = letzte("s1");
  assert.deepEqual(v.partie.besetzung.map((b) => (b.person ? "mensch" : b.bot ? "bot" : "leer")), ["mensch", "mensch", "mensch", "leer", "leer", "leer"]);
  const wortSichten = ["s1", "s2", "s3"].map((s) => letzte(s).partie.sicht.wort);
  assert.equal(wortSichten.filter((w) => w === null).length, 1, "genau einer kennt das Wort nicht");
  t += 6500;
  zim.tick();
  v = letzte("s1");
  assert.equal(v.partie.sicht.phase, "zeichnen");
  const dran = v.partie.sicht.amZug;
  const sock = ["s1", "s2", "s3"][dran];
  sent.length = 0;
  assert.equal(zim.zug(sock, { aktion: { art: "strich", punkte: [[0.2, 0.2], [0.3, 0.4]] } }).ok, true);
  const live = sent.filter((m) => m.ev === "sa:live");
  assert.equal(live.length, 2, "an die beiden anderen");
  assert.ok(!live.some((m) => m.id === sock), "nicht an den Zeichner selbst");
  assert.equal(sent.some((m) => m.ev === "sa:zimmer"), false, "kein ganzer Zimmerstand für ein Strich-Stück");
  zim.zug(sock, { aktion: { art: "strich", punkte: [], fertig: true } });
  assert.notEqual(letzte("s1").partie.sicht.amZug, dran, "nächster ist dran");
});
