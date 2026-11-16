// leistung/leistungStore.js — Leistungswerte echter Besucher als Tagessummen (data/leistung.db, Env LEISTUNG_DB).
//
// Gespeichert wird nie ein einzelner Besuch: je Tag, Seite, Geräteklasse (Handy | PC | PC schwach) und Kennzahl nur
// Anzahl, Bewertungs-Zähler nach Googles Schwellen, Summe und eine grobe Verteilung (Fächer). Aus der Verteilung lässt
// sich der Wert schätzen, den 75 % der Besuche erreichen (p75, so wertet auch Google). Spiele: je Tag, Seite,
// Geräteklasse und Sparmodus die Summen der Messabschnitte (Zeit, Bilder, lange Bilder) und eine Verteilung der
// Bildrate je Abschnitt. Aufbewahrung 400 Tage.

const Database = require("better-sqlite3");
const { dataPath } = require("../lib/dataDir");

// Grenzen gut / verbesserungswürdig (darüber schlecht) — Googles Web-Vitals-Schwellen
const SCHWELLEN = { fcp: [1800, 3000], lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] };
// Obergrenzen der Fächer; das letzte Fach ist offen
const FAECHER = {
  fcp: [500, 1000, 1500, 1800, 2500, 3000, 4000, 6000, 10000],
  lcp: [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000, 10000],
  inp: [50, 100, 150, 200, 300, 400, 500, 750, 1000, 2000],
  cls: [0.01, 0.05, 0.1, 0.15, 0.25, 0.4, 0.6, 1],
};
// Plausible Höchstwerte; was darüber liegt, ist Messmüll (Tab im Hintergrund, Ruhezustand …)
const HOECHSTWERTE = { fcp: 60000, lcp: 60000, inp: 10000, cls: 10 };
const FPS_FAECHER = [15, 25, 35, 50, 58];
const METRIKEN = Object.keys(SCHWELLEN);
const GERAETE = ["Handy", "PC", "PC schwach"];
const AUFBEWAHRUNG_TAGE = 400;

const zweistellig = (n) => String(n).padStart(2, "0");
const tagVon = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`;
};

function fachVon(grenzen, wert) {
  const i = grenzen.findIndex((g) => wert <= g);
  return i === -1 ? grenzen.length : i;
}

function liesFaecher(json, laenge) {
  try {
    const a = JSON.parse(json);
    if (Array.isArray(a) && a.length === laenge) return a.map((x) => Number(x) || 0);
  } catch {
    // kaputt → von vorn
  }
  return new Array(laenge).fill(0);
}

/** p75 aus einer Fächer-Verteilung: Obergrenze des Fachs, in dem der 75-%-Punkt liegt (vorsichtig nach oben) */
function p75(grenzen, faecher) {
  const n = faecher.reduce((s, x) => s + x, 0);
  if (!n) return null;
  const ziel = n * 0.75;
  let summe = 0;
  for (let i = 0; i < faecher.length; i++) {
    summe += faecher[i];
    if (summe >= ziel) return i < grenzen.length ? { wert: grenzen[i], offen: false } : { wert: grenzen[grenzen.length - 1], offen: true };
  }
  return { wert: grenzen[grenzen.length - 1], offen: true };
}

function bewertung(metrik, wert) {
  const [gut, mittel] = SCHWELLEN[metrik];
  if (wert <= gut) return "gut";
  return wert <= mittel ? "mittel" : "schlecht";
}

function createLeistungStore({ datei = process.env.LEISTUNG_DB || dataPath("leistung.db"), now = Date.now } = {}) {
  const db = new Database(datei);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS seiten_tag (
      tag TEXT NOT NULL, seite TEXT NOT NULL, geraet TEXT NOT NULL, metrik TEXT NOT NULL,
      n INTEGER NOT NULL DEFAULT 0, gut INTEGER NOT NULL DEFAULT 0, mittel INTEGER NOT NULL DEFAULT 0,
      schlecht INTEGER NOT NULL DEFAULT 0, summe REAL NOT NULL DEFAULT 0, faecher TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (tag, seite, geraet, metrik)
    );
    CREATE TABLE IF NOT EXISTS spiele_tag (
      tag TEXT NOT NULL, seite TEXT NOT NULL, geraet TEXT NOT NULL, sparmodus INTEGER NOT NULL,
      abschnitte INTEGER NOT NULL DEFAULT 0, ms REAL NOT NULL DEFAULT 0, bilder INTEGER NOT NULL DEFAULT 0,
      ueber33 INTEGER NOT NULL DEFAULT 0, ueber50 INTEGER NOT NULL DEFAULT 0, fps_faecher TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (tag, seite, geraet, sparmodus)
    );
  `);
  const st = {
    seiteGet: db.prepare("SELECT * FROM seiten_tag WHERE tag = ? AND seite = ? AND geraet = ? AND metrik = ?"),
    seiteSet: db.prepare(`INSERT INTO seiten_tag (tag, seite, geraet, metrik, n, gut, mittel, schlecht, summe, faecher)
      VALUES (@tag, @seite, @geraet, @metrik, @n, @gut, @mittel, @schlecht, @summe, @faecher)
      ON CONFLICT(tag, seite, geraet, metrik) DO UPDATE SET n = @n, gut = @gut, mittel = @mittel, schlecht = @schlecht,
      summe = @summe, faecher = @faecher`),
    spielGet: db.prepare("SELECT * FROM spiele_tag WHERE tag = ? AND seite = ? AND geraet = ? AND sparmodus = ?"),
    spielSet: db.prepare(`INSERT INTO spiele_tag (tag, seite, geraet, sparmodus, abschnitte, ms, bilder, ueber33, ueber50, fps_faecher)
      VALUES (@tag, @seite, @geraet, @sparmodus, @abschnitte, @ms, @bilder, @ueber33, @ueber50, @fpsFaecher)
      ON CONFLICT(tag, seite, geraet, sparmodus) DO UPDATE SET abschnitte = @abschnitte, ms = @ms, bilder = @bilder,
      ueber33 = @ueber33, ueber50 = @ueber50, fps_faecher = @fpsFaecher`),
    seitenAb: db.prepare("SELECT * FROM seiten_tag WHERE tag >= ?"),
    spieleAb: db.prepare("SELECT * FROM spiele_tag WHERE tag >= ?"),
    altSeiten: db.prepare("DELETE FROM seiten_tag WHERE tag < ?"),
    altSpiele: db.prepare("DELETE FROM spiele_tag WHERE tag < ?"),
  };

  /** Seiten-Kennzahlen eines Besuchs zählen; unbekannte oder unplausible Werte fallen still heraus */
  const erfasseSeite = db.transaction(({ seite, geraet, werte }) => {
    const tag = tagVon(now());
    let gezaehlt = 0;
    for (const metrik of METRIKEN) {
      const wert = Number(werte && werte[metrik]);
      if (!Number.isFinite(wert) || wert < 0 || wert > HOECHSTWERTE[metrik]) continue;
      const grenzen = FAECHER[metrik];
      const alt = st.seiteGet.get(tag, seite, geraet, metrik);
      const faecher = liesFaecher(alt && alt.faecher, grenzen.length + 1);
      faecher[fachVon(grenzen, wert)] += 1;
      const b = bewertung(metrik, wert);
      st.seiteSet.run({
        tag, seite, geraet, metrik,
        n: (alt ? alt.n : 0) + 1,
        gut: (alt ? alt.gut : 0) + (b === "gut" ? 1 : 0),
        mittel: (alt ? alt.mittel : 0) + (b === "mittel" ? 1 : 0),
        schlecht: (alt ? alt.schlecht : 0) + (b === "schlecht" ? 1 : 0),
        summe: (alt ? alt.summe : 0) + wert,
        faecher: JSON.stringify(faecher),
      });
      gezaehlt += 1;
    }
    return gezaehlt;
  });

  /** Einen Messabschnitt eines Spiels zählen (Zeit in ms, Bilder, lange Bilder) */
  const erfasseSpiel = db.transaction(({ seite, geraet, sparmodus, ms, bilder, ueber33, ueber50 }) => {
    const tag = tagVon(now());
    const spar = sparmodus ? 1 : 0;
    const alt = st.spielGet.get(tag, seite, geraet, spar);
    const faecher = liesFaecher(alt && alt.fps_faecher, FPS_FAECHER.length + 1);
    faecher[fachVon(FPS_FAECHER, bilder / (ms / 1000))] += 1;
    st.spielSet.run({
      tag, seite, geraet, sparmodus: spar,
      abschnitte: (alt ? alt.abschnitte : 0) + 1,
      ms: (alt ? alt.ms : 0) + ms,
      bilder: (alt ? alt.bilder : 0) + bilder,
      ueber33: (alt ? alt.ueber33 : 0) + ueber33,
      ueber50: (alt ? alt.ueber50 : 0) + ueber50,
      fpsFaecher: JSON.stringify(faecher),
    });
  });

  /**
   * Auswertung der letzten `tage` Tage, wahlweise nur eine Geräteklasse.
   * Seiten: je Seite und Kennzahl n, p75, Anteile gut/mittel/schlecht. Spiele: je Seite Minuten, Bildrate, Anteile
   * langer Bilder, Sparmodus-Anteil (nach Zeit) und die Verteilung der Bildrate je Abschnitt.
   */
  function auswertung({ tage = 30, geraet = "alle" } = {}) {
    const ab = tagVon(now() - (Math.max(1, Math.min(400, tage)) - 1) * 24 * 60 * 60 * 1000);
    const passt = (r) => geraet === "alle" || r.geraet === geraet;

    const seiten = new Map();
    for (const r of st.seitenAb.all(ab)) {
      if (!passt(r) || !SCHWELLEN[r.metrik]) continue;
      if (!seiten.has(r.seite)) seiten.set(r.seite, { seite: r.seite, messungen: 0, metriken: {} });
      const s = seiten.get(r.seite);
      const grenzen = FAECHER[r.metrik];
      const m = s.metriken[r.metrik] || (s.metriken[r.metrik] = { n: 0, gut: 0, mittel: 0, schlecht: 0, faecher: new Array(grenzen.length + 1).fill(0) });
      m.n += r.n;
      m.gut += r.gut;
      m.mittel += r.mittel;
      m.schlecht += r.schlecht;
      liesFaecher(r.faecher, grenzen.length + 1).forEach((x, i) => { m.faecher[i] += x; });
    }
    const seitenListe = [...seiten.values()].map((s) => {
      const metriken = {};
      for (const [metrik, m] of Object.entries(s.metriken)) {
        const p = p75(FAECHER[metrik], m.faecher);
        metriken[metrik] = { n: m.n, p75: p && p.wert, offen: Boolean(p && p.offen), bewertung: p ? bewertung(metrik, p.wert) : null, anteile: { gut: m.gut / m.n, mittel: m.mittel / m.n, schlecht: m.schlecht / m.n } };
        s.messungen = Math.max(s.messungen, m.n);
      }
      return { seite: s.seite, messungen: s.messungen, metriken };
    }).sort((a, b) => b.messungen - a.messungen);

    const spiele = new Map();
    for (const r of st.spieleAb.all(ab)) {
      if (!passt(r)) continue;
      if (!spiele.has(r.seite)) spiele.set(r.seite, { seite: r.seite, abschnitte: 0, ms: 0, msSpar: 0, bilder: 0, ueber33: 0, ueber50: 0, faecher: new Array(FPS_FAECHER.length + 1).fill(0) });
      const s = spiele.get(r.seite);
      s.abschnitte += r.abschnitte;
      s.ms += r.ms;
      if (r.sparmodus) s.msSpar += r.ms;
      s.bilder += r.bilder;
      s.ueber33 += r.ueber33;
      s.ueber50 += r.ueber50;
      liesFaecher(r.fps_faecher, FPS_FAECHER.length + 1).forEach((x, i) => { s.faecher[i] += x; });
    }
    const spieleListe = [...spiele.values()].map((s) => ({
      seite: s.seite,
      abschnitte: s.abschnitte,
      minuten: s.ms / 60000,
      fps: s.ms ? s.bilder / (s.ms / 1000) : 0,
      anteil33: s.bilder ? s.ueber33 / s.bilder : 0,
      anteil50: s.bilder ? s.ueber50 / s.bilder : 0,
      sparmodus: s.ms ? s.msSpar / s.ms : 0,
      fpsFaecher: s.faecher,
    })).sort((a, b) => b.minuten - a.minuten);

    return { tage, geraet, seiten: seitenListe, spiele: spieleListe, fpsGrenzen: FPS_FAECHER, schwellen: SCHWELLEN };
  }

  function aufraeumen() {
    const grenze = tagVon(now() - AUFBEWAHRUNG_TAGE * 24 * 60 * 60 * 1000);
    return st.altSeiten.run(grenze).changes + st.altSpiele.run(grenze).changes;
  }

  return { erfasseSeite, erfasseSpiel, auswertung, aufraeumen, close: () => db.close() };
}

module.exports = { createLeistungStore, SCHWELLEN, FAECHER, FPS_FAECHER, GERAETE, p75, bewertung };
