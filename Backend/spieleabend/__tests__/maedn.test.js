// Spieleabend: Mensch ärgere dich nicht — Regeln, Bot und Ablauf im Zimmer ohne Netz.
// Ausführen: npm test -- spieleabend (im Backend-Ordner)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../spiele/maedn");
const { createZimmer } = require("../zimmer");

// Würfel mit fester Folge: jede Zahl 1–6 wird zu dem Zufallswert, der sie würfelt
const wuerfel = (...zahlen) => {
  const folge = [...zahlen];
  return () => ((folge.shift() ?? 1) - 1) / 6 + 0.01;
};
const wirf = (z, p, zahl) => M.zug(z, p, { art: "wuerfeln" }, { random: wuerfel(zahl) });

function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test("Start: drei Versuche für eine 6, danach ist der Nächste dran", () => {
  const z = M.neu({ beginner: 0 });
  assert.equal(z.versuche, 3);
  wirf(z, 0, 2);
  assert.equal(z.amZug, 0);
  assert.equal(z.nochmal, true);
  wirf(z, 0, 5);
  assert.equal(z.amZug, 0);
  wirf(z, 0, 1);
  assert.equal(z.amZug, 1, "nach drei Fehlversuchen weiter");
  assert.equal(M.zug(z, 0, { art: "wuerfeln" }).ok, false, "Platz 0 ist nicht mehr dran");
});

test("6: Figur kommt automatisch heraus (einziger Zug), danach nochmal würfeln; Startfeld muss geräumt werden", () => {
  const z = M.neu({ beginner: 0 });
  wirf(z, 0, 6);
  assert.deepEqual(z.figuren[0], [0, -1, -1, -1], "eine Figur steht auf dem Startfeld");
  assert.equal(z.letzterZug.von, -1);
  assert.equal(z.amZug, 0, "nach der 6 nochmal");
  assert.equal(z.phase, "wuerfeln");
  assert.equal(z.versuche, 1, "jetzt ist eine Figur draußen: nur ein Versuch");
  // Startfeld räumen: mit der 4 muss die Figur vom Start weg (einziger Zug → automatisch)
  wirf(z, 0, 4);
  assert.deepEqual(z.figuren[0], [4, -1, -1, -1]);
  assert.equal(z.amZug, 1);
  assert.ok(M.animMs(z) > 950, "Würfel + Hüpfen");
});

test("Mit einer 6 und Figuren im Haus muss herausgekommen werden; sonst freie Wahl", () => {
  const z = M.neu({ beginner: 0 });
  z.figuren[0] = [5, 12, -1, -1];
  z.versuche = 1;
  wirf(z, 0, 6);
  assert.deepEqual(z.figuren[0], [5, 12, 0, -1], "Pflicht: herauskommen (eine Hausfigur genügt als Wahl → sofort)");
  // ohne Hausfigur: freie Wahl zwischen den Figuren draußen
  const w = M.neu({ beginner: 0 });
  w.figuren[0] = [5, 12, 40, 41];
  w.versuche = 1;
  wirf(w, 0, 2);
  assert.equal(w.phase, "ziehen");
  assert.deepEqual(w.optionen.map((o) => o.figur), [0, 1, 3], "41 → 43 im Ziel geht, 40 → 42 nicht (über 41)");
  assert.equal(M.zug(w, 0, { art: "ziehen", figur: 2 }).ok, false);
  assert.equal(M.zug(w, 0, { art: "ziehen", figur: 1 }).ok, true);
  assert.equal(w.figuren[0][1], 14);
  // nochmal würfeln: Startfeld besetzt, Haus nicht leer → die Startfigur muss weg
  wirf(z, 0, 3);
  assert.equal(z.figuren[0][2], 3, "Startfeld geräumt (einziger erlaubter Zug)");
});

test("Rauswerfen: wer auf einer fremden Figur landet, schickt sie ins Haus", () => {
  const z = M.neu({ beginner: 0 });
  // Platz 1 steht auf Rundenfeld 15 (= 5 Schritte ab seinem Start bei 10), Platz 0 auf Schritt 12
  z.figuren[1] = [5, -1, -1, -1];
  z.figuren[0] = [12, -1, -1, -1];
  z.versuche = 1;
  wirf(z, 0, 3);
  assert.equal(z.figuren[0][0], 15);
  assert.deepEqual(z.figuren[1], [-1, -1, -1, -1]);
  assert.deepEqual(z.letzterZug.geschlagen, { platz: 1, figur: 0, von: 5 });
  assert.ok(M.animMs(z) >= 950 + 3 * 170 + 650);
});

test("Ziel: nur mit passender Zahl, nicht über eigene Figuren; alle vier im Ziel gewinnt", () => {
  const z = M.neu({ beginner: 0 });
  z.figuren[0] = [41, 43, 42, 38];
  z.versuche = 1;
  // 38 + 6 = 44 > 43: zu weit; 38+1 = 39, 38+2 = 40 frei, 38+3 = 41 besetzt, 38+4 = 42 besetzt
  assert.equal(M._intern.zugFuer(z, 0, 3, 6), null);
  assert.equal(M._intern.zugFuer(z, 0, 3, 3), null, "eigene Figur im Ziel");
  assert.deepEqual(M._intern.zugFuer(z, 0, 3, 2), { figur: 3, nach: 40, schlaegt: null });
  assert.equal(M._intern.zugFuer(z, 0, 0, 1), null, "41 → 42 besetzt");
  const z2 = M.neu({ beginner: 0 });
  z2.figuren[0] = [43, 42, 41, 39];
  z2.versuche = 1;
  wirf(z2, 0, 1);
  assert.equal(z2.fertig, true);
  assert.equal(z2.sieger, 0);
  assert.deepEqual(M.ende(z2), { sieger: 0 });
});

test("Leere Plätze werden übersprungen", () => {
  const z = M.neu({ beginner: 1, aktiv: [true, false, true, false] });
  assert.equal(z.amZug, 2, "Platz 1 ist leer → Platz 2 beginnt");
  wirf(z, 2, 1);
  wirf(z, 2, 1);
  wirf(z, 2, 1);
  assert.equal(z.amZug, 0);
});

test("Bot: schlägt, wenn er kann, und spielt eine ganze Partie zu Ende", () => {
  const z = M.neu({ beginner: 0 });
  z.figuren[1] = [5, -1, -1, -1];
  z.figuren[0] = [12, 30, -1, -1];
  z.versuche = 1;
  wirf(z, 0, 3);
  // zwei Figuren können ziehen → Bot wählt
  const z2 = M.neu({ beginner: 0 });
  z2.figuren[1] = [5, -1, -1, -1];
  z2.figuren[0] = [12, 20, -1, -1];
  z2.versuche = 1;
  wirf(z2, 0, 3);
  assert.equal(z2.phase, "ziehen");
  for (const stufe of ["mittel", "schwer"]) assert.deepEqual(M.botZug(z2, 0, stufe, seeded(2)), { art: "ziehen", figur: 0 }, stufe);

  const random = seeded(9);
  const partie = M.neu({ beginner: 0 });
  let schritte = 0;
  while (!partie.fertig && schritte < 5000) {
    const p = partie.amZug;
    const a = M.botZug(partie, p, ["leicht", "mittel", "schwer", "mittel"][p], random);
    assert.equal(M.zug(partie, p, a, { random }).ok, true);
    schritte += 1;
  }
  assert.equal(partie.fertig, true, `Partie endet (nach ${schritte} Aktionen)`);
  assert.ok(partie.figuren[partie.sieger].every((s) => s >= 40));
});

test("Zimmer: MÄDN mit 4 Stühlen, leerer Stuhl bleibt leer, mindestens zwei am Tisch", () => {
  let t = 1_000_000;
  const sent = [];
  const zim = createZimmer({ send: (id, ev, data) => sent.push({ id, ev, data }), now: () => t, random: seeded(4) });
  const letzte = (id) => [...sent].reverse().find((m) => m.id === id && m.ev === "sa:zimmer")?.data;
  zim.erstellen("s1", { name: "Anna", token: "token-1-abcdef" });
  assert.equal(zim.leerLassen("s1", { platz: 1, leer: true }).ok, false, "4 gewinnt braucht beide Plätze");
  zim.platz("s1", { platz: 0 });
  assert.equal(zim.spielWaehlen("s1", { spiel: "maedn" }).ok, true);
  let v = letzte("s1");
  assert.equal(v.stuehle.length, 4);
  assert.deepEqual(v.stuehle, [1, null, null, null], "Anna sitzt weiter");
  for (const i of [1, 2, 3]) assert.equal(zim.leerLassen("s1", { platz: i, leer: true }).ok, true);
  assert.match(zim.start("s1").error, /mindestens 2/);
  zim.leerLassen("s1", { platz: 2, leer: false });
  assert.equal(zim.start("s1").ok, true);
  v = letzte("s1");
  assert.deepEqual(v.partie.besetzung.map((b) => (b.person ? "mensch" : b.bot ? "bot" : "leer")), ["mensch", "leer", "bot", "leer"]);
  assert.deepEqual(v.partie.sicht.aktiv, [true, false, true, false]);
  assert.equal(v.partie.sicht.amZug, 0);
  // Anna würfelt; danach rollt der Bot erst, wenn der Würfel im Browser liegt
  assert.equal(zim.zug("s1", { aktion: { art: "wuerfeln" } }).ok, true);
  const seq = letzte("s1").partie.sicht.letzterWurf.seq;
  for (let i = 0; i < 40 && letzte("s1").partie.sicht.amZug === 0; i += 1) {
    const s = letzte("s1").partie.sicht;
    if (s.phase === "ziehen") zim.zug("s1", { aktion: { art: "ziehen", figur: s.optionen[0].figur } });
    else zim.zug("s1", { aktion: { art: "wuerfeln" } });
  }
  assert.ok(letzte("s1").partie.sicht.letzterWurf.seq >= seq);
  assert.equal(letzte("s1").partie.sicht.amZug, 2, "Bot ist dran");
  const vorher = letzte("s1").partie.sicht.letzterWurf.seq;
  zim.tick();
  assert.equal(letzte("s1").partie.sicht.letzterWurf.seq, vorher, "Bot wartet auf die Animation");
  t += 5000;
  zim.tick();
  assert.ok(letzte("s1").partie.sicht.letzterWurf.seq > vorher, "Bot hat gewürfelt");
});
