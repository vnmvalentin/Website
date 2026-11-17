// spieleabend/spiele/zeichnen.js — „Zeichen-Hochstapler“: alle außer einem bekommen dasselbe Wort, reihum zeichnet
// jeder einen einzigen Strich (zwei Runden), dann zeigt jeder auf den Verdächtigen. Wird der Hochstapler gefunden,
// darf er das Wort raten — trifft er, gewinnt er trotzdem.
//
// Schnittstelle wie vierGewinnt.js, dazu:
//   ohneBots        Bots können nicht zeichnen: leere Stühle bleiben leer, ab minSpieler Menschen
//   neu/zug/tick    bekommen { random, jetzt } — Fristen laufen über die Uhr des Zimmers
//   tick(z, jetzt)  Fristen prüfen (Strich vorbei, Abstimmung vorbei …); true = Stand hat sich geändert
//   sicht(z, platz) je Empfänger: das Wort sieht nur, wer es kennen darf; wer Hochstapler ist, erst am Ende
//   verlassen(z, platz, jetzt)  jemand geht mitten im Spiel: wird übersprungen; geht der Hochstapler, endet die Runde
//   zug → { ok, live }: Strich-Stücke gehen als „live“ an die anderen (nicht als ganzer Zimmerstand)
//
// Ablauf (z.phase): wort (Rolle merken) → zeichnen (je Platz ein Strich, zwei Runden) → abstimmen → [raten] → ende.

const ZEIT = { wort: 6000, strich: 25000, abstimmen: 45000, raten: 30000 };
const RUNDEN = 2;
const MAX_PUNKTE = 400; // je Strich
const MAX_STUECK = 80; // je Nachricht

// Begriffe je Kategorie: der Hochstapler kennt nur die Kategorie
const WOERTER = {
  Tiere: ["Giraffe", "Elefant", "Pinguin", "Krokodil", "Schnecke", "Igel", "Eule", "Delfin", "Känguru", "Schmetterling", "Spinne", "Pferd", "Hai", "Schildkröte", "Flamingo"],
  Essen: ["Pizza", "Banane", "Brezel", "Spiegelei", "Erdbeere", "Eis", "Burger", "Karotte", "Nudeln", "Kuchen", "Ananas", "Pommes", "Popcorn", "Brot", "Zitrone"],
  Gegenstände: ["Regenschirm", "Brille", "Schere", "Kerze", "Schlüssel", "Gitarre", "Lampe", "Tasse", "Uhr", "Leiter", "Hammer", "Koffer", "Telefon", "Besen", "Kamera"],
  Orte: ["Strand", "Burg", "Leuchtturm", "Bahnhof", "Zirkus", "Wüste", "Kirche", "Spielplatz", "Bauernhof", "Insel", "Höhle", "Brücke", "Schwimmbad", "Vulkan", "Zelt"],
  Fahrzeuge: ["Fahrrad", "Rakete", "Hubschrauber", "Segelboot", "Traktor", "Feuerwehrauto", "Zug", "Roller", "U-Boot", "Heißluftballon", "Flugzeug", "Bus", "Skateboard", "Kutsche", "Ufo"],
  Berufe: ["Koch", "Pirat", "Astronaut", "Feuerwehrmann", "Zauberer", "Ritter", "Arzt", "Gärtner", "Maler", "Polizist", "Clown", "Taucher", "Detektiv", "Bäcker", "Cowboy"],
  Natur: ["Regenbogen", "Blitz", "Schneemann", "Baum", "Sonne", "Mond", "Wolke", "Berg", "Blume", "Pilz", "Kaktus", "Welle", "Stern", "Tornado", "Wasserfall"],
};

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z]/g, "");

function abstand(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Trifft der Rateversuch das Wort? Groß/klein, Umlaute und ein Tippfehler (ab 5 Buchstaben) zählen nicht. */
function getroffen(versuch, wort) {
  const a = norm(versuch);
  const b = norm(wort);
  if (!a) return false;
  if (a === b) return true;
  return b.length >= 5 && abstand(a, b) <= 1;
}

function neu({ beginner = 0, aktiv = [], random = Math.random, jetzt = Date.now() } = {}) {
  const plaetze = aktiv.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
  const kategorien = Object.keys(WOERTER);
  const kategorie = kategorien[Math.floor(random() * kategorien.length)];
  const liste = WOERTER[kategorie];
  // Reihenfolge: ab dem Beginner im Kreis
  const start = plaetze.findIndex((p) => p >= beginner);
  const reihe = start <= 0 ? plaetze : [...plaetze.slice(start), ...plaetze.slice(0, start)];
  return {
    aktiv: aktiv.slice(),
    weg: [],
    reihenfolge: reihe,
    kategorie,
    wort: liste[Math.floor(random() * liste.length)],
    hochstapler: plaetze[Math.floor(random() * plaetze.length)],
    phase: "wort",
    frist: jetzt + ZEIT.wort,
    zugNr: 0, // wievielter Strich (über beide Runden)
    striche: [], // { platz, punkte: [[x, y], …] }
    stimmen: {}, // platz -> platz
    geraten: null,
    richtig: false,
    erwischt: false,
    fertig: false,
    sieger: null,
    siegerListe: [],
    grund: null, // "weg" wenn der Hochstapler gegangen ist
  };
}

const dabei = (z) => z.reihenfolge.filter((p) => !z.weg.includes(p));
const zeichner = (z) => z.reihenfolge[z.zugNr % z.reihenfolge.length];
const amZug = (z) => (z.fertig ? null : z.phase === "zeichnen" ? zeichner(z) : z.phase === "raten" ? z.hochstapler : null);

function naechsterStrich(z, jetzt) {
  z.zugNr += 1;
  // Gegangene werden übersprungen
  while (z.zugNr < z.reihenfolge.length * RUNDEN && z.weg.includes(zeichner(z))) z.zugNr += 1;
  if (z.zugNr >= z.reihenfolge.length * RUNDEN) {
    z.phase = "abstimmen";
    z.frist = jetzt + ZEIT.abstimmen;
  } else {
    z.frist = jetzt + ZEIT.strich;
  }
}

function beende(z) {
  z.fertig = true;
  z.phase = "ende";
  z.frist = null;
  const hochstaplerGewinnt = z.grund === "weg" ? false : !z.erwischt || z.richtig;
  z.sieger = hochstaplerGewinnt ? z.hochstapler : null;
  z.siegerListe = hochstaplerGewinnt ? [z.hochstapler] : dabei(z).filter((p) => p !== z.hochstapler);
}

function auszaehlen(z, jetzt) {
  const zahl = {};
  for (const ziel of Object.values(z.stimmen)) zahl[ziel] = (zahl[ziel] || 0) + 1;
  const max = Math.max(0, ...Object.values(zahl));
  const vorn = Object.keys(zahl).filter((p) => zahl[p] === max).map(Number);
  // erwischt nur bei eindeutiger Mehrheit gegen den Hochstapler
  z.erwischt = max > 0 && vorn.length === 1 && vorn[0] === z.hochstapler;
  if (z.erwischt) {
    z.phase = "raten";
    z.frist = jetzt + ZEIT.raten;
  } else beende(z);
}

function punkteSaeubern(roh) {
  if (!Array.isArray(roh)) return [];
  const out = [];
  for (const p of roh.slice(0, MAX_STUECK)) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const [x, y] = p;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push([Math.round(Math.max(0, Math.min(1, x)) * 1000) / 1000, Math.round(Math.max(0, Math.min(1, y)) * 1000) / 1000]);
  }
  return out;
}

function zug(z, platz, aktion, { jetzt = Date.now() } = {}) {
  if (z.fertig) return { ok: false, error: "Die Runde ist vorbei." };
  const art = aktion?.art;
  if (art === "strich") {
    if (z.phase !== "zeichnen" || zeichner(z) !== platz) return { ok: false, error: "Du bist nicht dran." };
    let strich = z.striche[z.zugNr];
    if (!strich) {
      strich = { platz, punkte: [] };
      z.striche[z.zugNr] = strich;
    }
    const neu = punkteSaeubern(aktion.punkte).slice(0, MAX_PUNKTE - strich.punkte.length);
    strich.punkte.push(...neu);
    if (aktion.fertig || strich.punkte.length >= MAX_PUNKTE) {
      naechsterStrich(z, jetzt);
      return { ok: true };
    }
    // Zwischenstück: nur weiterreichen, kein ganzer Zimmerstand
    return { ok: true, live: { art: "strich", platz, nr: z.zugNr, punkte: neu } };
  }
  if (art === "stimme") {
    if (z.phase !== "abstimmen") return { ok: false, error: "Gerade wird nicht abgestimmt." };
    const ziel = Number(aktion.platz);
    if (!dabei(z).includes(platz)) return { ok: false, error: "Du spielst nicht mit." };
    if (ziel === platz || !dabei(z).includes(ziel)) return { ok: false, error: "Für diesen Platz geht das nicht." };
    z.stimmen[platz] = ziel;
    if (dabei(z).every((p) => z.stimmen[p] !== undefined)) auszaehlen(z, jetzt);
    return { ok: true };
  }
  if (art === "raten") {
    if (z.phase !== "raten" || platz !== z.hochstapler) return { ok: false, error: "Raten darf nur der Hochstapler." };
    z.geraten = String(aktion.wort || "").trim().slice(0, 40);
    z.richtig = getroffen(z.geraten, z.wort);
    beende(z);
    return { ok: true };
  }
  return { ok: false, error: "Unbekannter Zug." };
}

/** Fristen: Rolle gezeigt → zeichnen; Strich vorbei → nächster; Abstimmung vorbei → auszählen; Raten vorbei → Ende. */
function tick(z, jetzt) {
  if (z.fertig || !z.frist || jetzt < z.frist) return false;
  if (z.phase === "wort") {
    z.phase = "zeichnen";
    z.zugNr = -1;
    naechsterStrich(z, jetzt);
  } else if (z.phase === "zeichnen") naechsterStrich(z, jetzt);
  else if (z.phase === "abstimmen") auszaehlen(z, jetzt);
  else if (z.phase === "raten") {
    z.geraten = z.geraten || "";
    beende(z);
  }
  return true;
}

function verlassen(z, platz, jetzt = Date.now()) {
  if (z.fertig || z.weg.includes(platz)) return;
  z.weg.push(platz);
  delete z.stimmen[platz];
  for (const [p, ziel] of Object.entries(z.stimmen)) if (ziel === platz) delete z.stimmen[p];
  if (platz === z.hochstapler) {
    z.grund = "weg";
    beende(z);
    return;
  }
  if (z.phase === "zeichnen" && zeichner(z) === platz) naechsterStrich(z, jetzt);
  else if (z.phase === "abstimmen" && dabei(z).every((p) => z.stimmen[p] !== undefined)) auszaehlen(z, jetzt);
}

const ende = (z) => (z.fertig ? { sieger: z.sieger } : null);
// Bots zeichnen nicht; diese Fristen-Wartezeit nutzt das Zimmer, wenn jemand mit getrennter Verbindung dran ist
const animMs = () => 300;

/** Getrennt und am Zug: Strich auslassen bzw. nicht raten. */
function botZug(z) {
  if (z.phase === "zeichnen") return { art: "strich", punkte: [], fertig: true };
  if (z.phase === "raten") return { art: "raten", wort: "" };
  return null;
}

function sicht(z, platz = null) {
  const spielt = platz !== null && z.reihenfolge.includes(platz);
  const offen = z.fertig || z.phase === "raten";
  const zahl = {};
  for (const ziel of Object.values(z.stimmen)) zahl[ziel] = (zahl[ziel] || 0) + 1;
  return {
    phase: z.phase,
    amZug: amZug(z),
    frist: z.frist,
    reihenfolge: z.reihenfolge,
    runden: RUNDEN,
    zugNr: z.zugNr,
    aktiv: z.aktiv,
    weg: z.weg,
    striche: z.striche.filter(Boolean).map((s) => ({ platz: s.platz, punkte: s.punkte })),
    kategorie: z.kategorie,
    rolle: spielt ? (platz === z.hochstapler ? "hochstapler" : "kuenstler") : null,
    wort: z.fertig || (spielt && platz !== z.hochstapler) ? z.wort : null,
    gestimmt: Object.keys(z.stimmen).map(Number),
    meineStimme: spielt && z.stimmen[platz] !== undefined ? z.stimmen[platz] : null,
    stimmen: offen ? zahl : null,
    hochstapler: offen ? z.hochstapler : null,
    erwischt: offen ? z.erwischt : null,
    geraten: z.fertig ? z.geraten : null,
    richtig: z.fertig ? z.richtig : null,
    grund: z.grund,
    fertig: z.fertig,
    sieger: z.sieger,
    siegerListe: z.siegerListe,
  };
}

module.exports = {
  id: "zeichnen",
  name: "Zeichen-Hochstapler",
  plaetze: 6,
  minSpieler: 3,
  ohneBots: true,
  ZEIT,
  neu,
  amZug,
  zug,
  tick,
  verlassen,
  ende,
  sicht,
  botZug,
  animMs,
  _intern: { getroffen, norm, WOERTER, punkteSaeubern },
};
