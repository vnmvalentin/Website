// Spieleabend: 4-gewinnt-Regeln, Bot und Zimmer-Ablauf ohne Netz. Ausführen: npm test -- spieleabend (im Backend-Ordner)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const V = require("../spiele/vierGewinnt");
const { createZimmer, MAX_AM_TISCH, WEG_MS } = require("../zimmer");

// Steine der Reihe nach setzen (Platz 0 beginnt)
function partie(spalten, beginner = 0) {
  const z = V.neu({ beginner });
  for (const s of spalten) assert.equal(V.zug(z, z.amZug, { spalte: s }).ok, true, `Spalte ${s}`);
  return z;
}

// Zufall mit Startwert, damit Bot-Tests immer gleich laufen
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test("4 gewinnt: Steine fallen nach unten, waagrecht gewinnt, Gewinnreihe wird gemeldet", () => {
  const z = partie([0, 0, 1, 1, 2, 2, 3]);
  assert.equal(z.brett[5][0], 1);
  assert.equal(z.brett[4][0], 2);
  assert.equal(z.fertig, true);
  assert.equal(z.sieger, 0);
  assert.deepEqual(z.reihe, [[5, 0], [5, 1], [5, 2], [5, 3]]);
  assert.deepEqual(V.ende(z), { sieger: 0 });
  assert.equal(V.amZug(z), null);
  assert.equal(V.zug(z, 1, { spalte: 4 }).ok, false, "nach dem Ende kein Zug mehr");
});

test("4 gewinnt: senkrecht und schräg, falscher Spieler, volle Spalte, ungültige Spalte", () => {
  assert.equal(partie([3, 4, 3, 4, 3, 4, 3]).sieger, 0);
  // Diagonale für Platz 1 (Gelb) von (5,1) bis (2,4)
  const d = partie([0, 1, 2, 2, 3, 4, 3, 3, 4, 0, 4, 4], 0);
  assert.equal(d.sieger, 1);
  const z = V.neu();
  assert.equal(V.zug(z, 1, { spalte: 0 }).ok, false, "Platz 1 ist nicht dran");
  for (let i = 0; i < 6; i += 1) V.zug(z, z.amZug, { spalte: 6 });
  assert.equal(V.zug(z, z.amZug, { spalte: 6 }).error, "Die Spalte ist voll.");
  assert.equal(V.zug(z, z.amZug, { spalte: 7 }).ok, false);
  assert.equal(V.zug(z, z.amZug, { spalte: "x" }).ok, false);
});

test("4 gewinnt: volles Brett ohne Reihe ist unentschieden", () => {
  // Spaltenweise füllen mit Muster, das nie vier gleiche ergibt
  const z = V.neu();
  const folge = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  for (const s of folge) assert.equal(V.zug(z, z.amZug, { spalte: s }).ok, true);
  assert.equal(z.fertig, true);
  assert.equal(z.sieger, null);
  assert.deepEqual(V.ende(z), { sieger: null });
});

test("Bot: nimmt den Gewinnzug, blockt die Drohung — auf jeder Stufe", () => {
  for (const stufe of V.STUFEN) {
    // Platz 0 hat drei unten (0,1,2), Platz 1 ist dran → muss 3 blocken
    const block = partie([0, 6, 1, 6, 2]);
    assert.equal(V.botZug(block, 1, stufe, seeded(3)).spalte, 3, `${stufe} blockt`);
    // Platz 1 hat drei senkrecht in 6 und ist dran → gewinnt dort
    const sieg = partie([0, 6, 1, 6, 0, 6, 5]);
    assert.equal(V.botZug(sieg, 1, stufe, seeded(5)).spalte, 6, `${stufe} gewinnt`);
  }
});

test("Bot: „schwer“ schlägt „leicht“ meistens und rechnet schnell", () => {
  const random = seeded(42);
  let siegeSchwer = 0;
  let langsamster = 0;
  for (let n = 0; n < 6; n += 1) {
    const z = V.neu({ beginner: n % 2 });
    const stufe = (p) => (p === 0 ? "schwer" : "leicht");
    while (!z.fertig) {
      const t0 = Date.now();
      const a = V.botZug(z, z.amZug, stufe(z.amZug), random);
      if (stufe(z.amZug) === "schwer") langsamster = Math.max(langsamster, Date.now() - t0);
      assert.equal(V.zug(z, z.amZug, a).ok, true);
    }
    if (z.sieger === 0) siegeSchwer += 1;
  }
  assert.ok(siegeSchwer >= 5, `schwer gewann nur ${siegeSchwer}/6`);
  assert.ok(langsamster < 400, `ein Zug brauchte ${langsamster} ms`);
});

// ── Zimmer ─────────────────────────────────────────────────────────────────────────────────

function aufbau() {
  let t = 1_000_000;
  const sent = [];
  const z = createZimmer({ send: (id, ev, data) => sent.push({ id, ev, data }), now: () => t, random: seeded(7) });
  const letzte = (id) => [...sent].reverse().find((m) => m.id === id && m.ev === "sa:zimmer")?.data;
  return { z, sent, letzte, vor: (ms) => { t += ms; } };
}
const TOKEN = (n) => `token-${n}-abcdef`;

// Anna und Ben setzen sich (neue Leute stehen zuerst im Zimmer)
function zuZweit(z) {
  const { code } = z.erstellen("s1", { name: "Anna", token: TOKEN(1) });
  z.beitreten("s2", { code, name: "Ben", token: TOKEN(2) });
  z.platz("s1", { platz: 0 });
  z.platz("s2", { platz: 1 });
  return code;
}

test("Zimmer: Wer kommt, steht im Zimmer (jeder an einer anderen Stelle), setzt sich selbst; ab 7 wird zugeschaut", () => {
  const { z, letzte } = aufbau();
  const { code } = z.erstellen("s1", { name: "Anna", token: TOKEN(1), skin: { c: 2, h: 3, f: 1 } });
  assert.match(code, /^[A-Z2-9]{5}$/);
  let v = letzte("s1");
  assert.equal(v.host, true);
  assert.equal(v.spiel, "vierGewinnt");
  assert.deepEqual(v.stuehle, [null, null], "niemand sitzt automatisch");
  assert.deepEqual(v.leute[0].skin, { c: 2, h: 3, f: 1 });
  const o1 = v.leute[0].ort;
  assert.ok(Math.hypot(o1.x, o1.z) > 6, "steht an der Tür, nicht am Tisch");
  assert.equal(o1.r, Math.PI, "schaut ins Zimmer");

  assert.equal(z.beitreten("s2", { code: code.toLowerCase(), name: "Ben", token: TOKEN(2) }).ok, true);
  v = letzte("s2");
  assert.equal(v.host, false);
  assert.notDeepEqual(v.leute[1].ort, o1, "Ben landet woanders");
  assert.equal(z.platz("s2", { platz: 1 }).ok, true);
  z.beitreten("s3", { code, name: "Cem", token: TOKEN(3) });
  assert.deepEqual(letzte("s3").stuehle, [null, 2]);
  for (let i = 4; i <= MAX_AM_TISCH + 1; i += 1) z.beitreten(`s${i}`, { code, name: `P${i}`, token: TOKEN(i) });
  v = letzte("s1");
  assert.equal(v.leute.length, MAX_AM_TISCH);
  assert.equal(v.zuschauer, 1);
  assert.equal(letzte(`s${MAX_AM_TISCH + 1}`).du, null, "der Siebte schaut zu");
  assert.equal(z.beitreten("sx", { code: "ZZZZZ", name: "X", token: TOKEN(99) }).fehlt, true);
  assert.equal(z.erstellen("sy", { name: "X", token: "kurz" }).ok, false, "Token wird geprüft");
});

test("Zimmer: Stühle wechseln, nur der Gastgeber startet, leerer Stuhl → Bot, der Bot zieht nach der Fallzeit", () => {
  const { z, letzte, vor } = aufbau();
  zuZweit(z);
  assert.equal(z.platz("s2", { platz: 0 }).error, "Der Platz ist besetzt.");
  assert.equal(z.platz("s2", { platz: null }).ok, true);
  assert.deepEqual(letzte("s2").stuehle, [1, null]);
  assert.equal(z.start("s2").error, "Das macht der Gastgeber.");
  assert.equal(z.botStufe("s1", { stufe: "schwer" }).ok, true);
  assert.equal(z.start("s1").ok, true);
  let v = letzte("s1");
  assert.equal(v.phase, "spiel");
  assert.equal(v.partie.besetzung[0].person, 1);
  assert.ok(v.partie.besetzung[1].bot?.name, "Bot sitzt auf dem freien Stuhl");
  assert.equal(v.partie.sicht.amZug, 0, "erste Partie: Platz 0 beginnt");
  assert.equal(z.platz("s2", { platz: 1 }).ok, false, "während der Partie keine Stuhlwechsel");
  assert.equal(z.zug("s2", { aktion: { spalte: 3 } }).error, "Du spielst nicht mit.");
  assert.equal(z.zug("s1", { aktion: { spalte: 3 } }).ok, true);
  z.tick();
  assert.equal(letzte("s1").partie.sicht.zuege, 1, "Bot wartet, bis der Stein gefallen ist");
  vor(2000);
  z.tick();
  v = letzte("s1");
  assert.equal(v.partie.sicht.zuege, 2, "Bot hat gezogen");
  assert.equal(v.partie.sicht.amZug, 0);
});

test("Zimmer: Partie bis zum Ende, Brett bleibt stehen, nächste Partie beginnt der andere", () => {
  const { z, letzte, vor } = aufbau();
  zuZweit(z);
  z.start("s1");
  for (const [s, spalte] of [["s1", 0], ["s2", 6], ["s1", 1], ["s2", 6], ["s1", 2], ["s2", 6], ["s1", 3]]) {
    assert.equal(z.zug(s, { aktion: { spalte } }).ok, true);
  }
  let v = letzte("s2");
  assert.equal(v.phase, "lobby", "nach dem Ende wieder Wartestand");
  assert.equal(v.partie.laeuft, false);
  assert.equal(v.partie.sicht.sieger, 0);
  assert.equal(v.partie.sicht.reihe.length, 4, "Gewinnreihe für das Leuchten");
  vor(5000);
  z.tick();
  assert.equal(z.start("s1").ok, true);
  v = letzte("s2");
  assert.equal(v.partie.nr, 2);
  assert.equal(v.partie.sicht.amZug, 1, "zweite Partie: Platz 1 beginnt");
  assert.equal(v.partie.sicht.zuege, 0);
});

test("Zimmer: Verbindung weg → Platz bleibt, am Zug vertritt ein Bot; Gehen → Bot übernimmt, Gastgeber wechselt", () => {
  const { z, letzte, vor, sent } = aufbau();
  const code = zuZweit(z);
  z.start("s1");
  z.zug("s1", { aktion: { spalte: 3 } });
  z.trennen("s2");
  let v = letzte("s1");
  assert.equal(v.leute.find((p) => p.name === "Ben").connected, false);
  vor(3000);
  z.tick();
  assert.equal(letzte("s1").partie.sicht.zuege, 1, "erst warten");
  vor(WEG_MS);
  z.tick();
  assert.equal(letzte("s1").partie.sicht.zuege, 2, "Bot zieht für den Getrennten");
  // Ben kommt zurück (gleicher Token): gleiche Figur, gleicher Platz
  z.beitreten("s2b", { code, name: "Ben", token: TOKEN(2) });
  v = letzte("s2b");
  assert.equal(v.du, 2);
  assert.equal(v.leute.length, 2);
  // Anna geht: Ben wird Gastgeber, Annas Stuhl spielt ein Bot weiter
  z.verlassen("s1");
  v = letzte("s2b");
  assert.equal(v.host, true);
  assert.equal(v.phase, "spiel");
  assert.ok(v.partie.besetzung[0].bot, "Bot übernimmt Annas Stuhl");
  assert.ok(sent.some((m) => m.ev === "sa:hinweis" && /Anna ist gegangen/.test(m.data.text)));
  // Ben geht auch: niemand mehr da, Zimmer verschwindet
  z.verlassen("s2b");
  assert.equal(z._rooms.size, 0);
});

test("Zimmer: Name und Aussehen ändern, Spiel wählen nur im Wartestand, Gastgeber kann abbrechen", () => {
  const { z, letzte } = aufbau();
  z.erstellen("s1", { name: "  Anna   Lena ", token: TOKEN(1) });
  assert.equal(letzte("s1").leute[0].name, "Anna Lena");
  assert.equal(z.profil("s1", { name: "", skin: { c: 40, h: 2, f: 1.5 } }).ok, true);
  const { ort, ...rest } = letzte("s1").leute[0];
  assert.deepEqual(rest, { id: 1, name: "Gast", skin: { c: 0, h: 2, f: 0 }, connected: true, bauch: 0, schnee: 0 });
  assert.ok(ort);
  assert.equal(z.spielWaehlen("s1", { spiel: "schach" }).ok, false);
  assert.equal(z.spielWaehlen("s1", { spiel: "vierGewinnt" }).ok, true);
  z.start("s1");
  assert.deepEqual(letzte("s1").partie.besetzung[0].person, 1, "niemand saß: der Gastgeber setzt sich beim Start");
  assert.equal(z.spielWaehlen("s1", { spiel: "vierGewinnt" }).ok, false, "nicht während der Partie");
  assert.equal(z.beenden("s1").ok, true);
  const v = letzte("s1");
  assert.equal(v.phase, "lobby");
  assert.equal(v.partie, null);
});

test("Zimmer: Laufen — Position wird begrenzt und nur an die anderen geschickt; Gesten mit Pause", () => {
  const { z, sent, letzte, vor } = aufbau();
  const { code } = z.erstellen("s1", { name: "Anna", token: TOKEN(1) });
  z.beitreten("s2", { code, name: "Ben", token: TOKEN(2) });
  sent.length = 0;
  assert.equal(z.ort("s1", { x: 2.345, z: -99, r: -1 }).ok, true);
  const an = sent.filter((m) => m.ev === "sa:ort");
  assert.deepEqual(an.map((m) => m.id), ["s2"], "nicht an sich selbst, kein ganzer Zimmerstand");
  assert.deepEqual(an[0].data, { id: 1, x: 2.35, z: -7.4, r: 5.28 });
  assert.equal(sent.some((m) => m.ev === "sa:zimmer"), false);
  assert.equal(z.ort("s1", { x: "a", z: 1, r: 0 }).ok, false);
  z.beitreten("s3", { code, name: "Cem", token: TOKEN(3) });
  assert.deepEqual(letzte("s3").leute[0].ort, { x: 2.35, z: -7.4, r: 5.28 }, "Neue sehen, wo Anna steht");
  sent.length = 0;
  assert.equal(z.geste("s1", { art: "chips" }).ok, true);
  assert.equal(z.geste("s1", { art: "chips" }).ok, false, "nicht im Dauerfeuer");
  assert.equal(z.geste("s1", { art: "tanz" }).ok, false);
  vor(1500);
  assert.equal(z.geste("s1", { art: "winken" }).ok, true);
  assert.deepEqual(sent.filter((m) => m.ev === "sa:geste").map((m) => [m.id, m.data.art]), [["s2", "chips"], ["s3", "chips"], ["s2", "winken"], ["s3", "winken"]]);
});

test("Zimmer: Chips machen dick (bis MAX_BAUCH, einer mehr: platzt), der Bauch baut nach und nach ab; Kissen nur auf echte Ziele", () => {
  const { MAX_BAUCH, BAUCH_ERST_MS, BAUCH_DANN_MS } = require("../zimmer");
  const { z, sent, letzte, vor } = aufbau();
  const { code } = z.erstellen("s1", { name: "Anna", token: TOKEN(1) });
  z.beitreten("s2", { code, name: "Ben", token: TOKEN(2) });
  for (let i = 0; i < MAX_BAUCH; i += 1) {
    z.geste("s1", { art: "chips" });
    vor(1300);
  }
  const chipsAnBen = () => sent.filter((m) => m.ev === "sa:geste" && m.id === "s2" && m.data.art === "chips");
  assert.equal(chipsAnBen().at(-1).data.bauch, MAX_BAUCH, "so dick wird man");
  const r = z.geste("s1", { art: "chips" });
  assert.equal(r.platzt, true, "einer zu viel: platzt");
  assert.equal(r.bauch, 0);
  assert.equal(chipsAnBen().at(-1).data.platzt, true, "die anderen sehen es");
  vor(1300);
  for (let i = 0; i < MAX_BAUCH; i += 1) {
    z.geste("s1", { art: "chips" });
    vor(1300);
  }
  z.platz("s1", { platz: 0 }); // löst einen Zimmerstand aus
  assert.equal(letzte("s2").leute[0].bauch, MAX_BAUCH, "Neue sehen den Bauch im Zimmerstand");
  vor(BAUCH_ERST_MS - 1300);
  z.tick();
  assert.equal(letzte("s2").leute[0].bauch, MAX_BAUCH - 1, "nach der Pause der erste Abbau");
  vor(BAUCH_DANN_MS);
  z.tick();
  assert.equal(letzte("s2").leute[0].bauch, MAX_BAUCH - 2);
  sent.length = 0;
  assert.equal(z.geste("s1", { art: "hau", ziel: 1 }).ok, false, "nicht sich selbst");
  assert.equal(z.geste("s1", { art: "hau", ziel: 99 }).ok, false, "nur Leute im Zimmer");
  assert.equal(z.geste("s1", { art: "hau", ziel: 2 }).ok, true);
  assert.equal(z.geste("s1", { art: "hau", ziel: 2 }).ok, false, "kurze Pause zwischen Hieben");
  vor(700);
  assert.equal(z.geste("s1", { art: "hau", ziel: 2 }).ok, true);
  assert.deepEqual(sent.filter((m) => m.ev === "sa:geste").map((m) => [m.id, m.data.art, m.data.ziel]), [["s2", "hau", 2], ["s2", "hau", 2]]);
});
