// Motive: 1–2 Signatur-Phrasen je Welt, die abgewandelt wiederkehren (26.09.2026, Schritt 2 nach den Leitideen).
//
// Eine Phrase sind 2–3 aufeinanderfolgende Züge. Ein einzelner Sprung fiele unter 90 nicht auf; dieselbe FOLGE von Eingaben
// ergibt dieselbe Geometrie (gleiche Abstände, gleiche Bögen) — die erkennt man wieder. Der Planer (planer.js) merkt sich
// die Züge der Vorstellung und spielt sie an den Wiederholungen erneut, abgewandelt:
//   gleich       unverändert
//   gespiegelt   in die andere Richtung (Ringe mit)
//   weiter       länger gehalten: weiter und höher
//   knapp        ohne Sicherheitsfläche — Landung so breit wie die Streuung, höchstens 3 Kacheln
// Scheitert die Abwandlung, kommt die Phrase unverändert („gleich“); erst danach würfelt der Planer normal.
//   verschaerft  mit Zusatz: Bröckel-Landung oder Nadelöhr (nur, was die Palette des Levels hergibt), sonst knapp
// Passt eine Abwandlung nicht in die Welt, würfelt der Planer nach wenigen Versuchen normal weiter: Lösbarkeit geht vor.

/** Nur Züge ohne eigenen Zustand: Schalter (Kanäle), Tor (Takt), Mitfahrt, Wand, Portal hängen an ihrem Ort */
export function motivFaehig(zug) {
  return ['sprung', 'doppel', 'fall', 'feder'].includes(zug.art) && !zug.tor && !zug.schalter && !zug.sofort;
}

/** Abgeleitete Felder, die der Planer beim Bauen in den Zug schreibt — sie gehören nicht ins Motiv */
const ABGELEITET = ['doppelNach2', 'roehrenGesetzt', 'torRel', 'schalterKanal', 'schalterZiel', 'wechsel', 'zielPunkt', 'moverWeg', 'moverRel', 'schwelle', 'boeeRel', 'blockRel', 'roehrenX', 'greif', 'seilRel'];

/** Eingaben eines Zugs, als unabhängige Kopie */
export function motivKopie(zug) {
  const z = JSON.parse(JSON.stringify(zug));
  for (const k of ABGELEITET) delete z[k];
  return z;
}

const SPIEGEL = { left: 'right', right: 'left', upLeft: 'upRight', upRight: 'upLeft', up: 'up' };

/**
 * Einen gemerkten Motiv-Zug abwandeln.
 * @param {{zug: object, dy: number}} gemerkt
 * @param {{variante: string, zusatz?: string}} mark
 * @returns {{zug: object, dy: number}}
 */
export function variiere(gemerkt, mark) {
  const z = motivKopie(gemerkt.zug);
  const schwung = !!z.ring || z.greifNach != null || z.art === 'feder';
  // Knapp: Landefläche genau so breit wie die Streuung (höchstens 3 Kacheln, planer.js), mit ±33 ms geprüft
  const knapp = () => { if (!schwung && z.art !== 'fall') { z.knapp = true; z.toleranz = 4; } };
  if (mark.variante === 'gespiegelt') {
    z.dir = -z.dir;
    if (z.ring) z.ring = SPIEGEL[z.ring];
  } else if (mark.variante === 'weiter') {
    if (z.halte != null) z.halte = Math.min(34, z.halte + 6);
    if (z.greifHalte != null) z.greifHalte += 10;
    if (z.doppelNach != null) z.doppelNach += 4;
  } else if (mark.variante === 'knapp') {
    knapp();
  } else if (mark.variante === 'verschaerft') {
    if (mark.zusatz === 'broeckel' && !schwung && z.art !== 'fall' && !z.fallblock) z.broeckel = true;
    else if (mark.zusatz === 'nadeloehr') { z.roehren = z.greifNach != null ? 2 : 1; if (!z.mechanik) z.mechanik = 'nadeloehr'; }
    else knapp();
  }
  return { zug: z, dy: gemerkt.dy };
}

/**
 * Wo die Phrasen liegen (Anteil an allen Zügen) und wie sie wiederkehren. Abgestimmt auf die Akte der Leitideen
 * (20/30/20/30 %): vorgestellt in Einführung bzw. Steigerung, wiederholt in Steigerung und Finale — der Twist (50–70 %)
 * bleibt frei, sonst verdrängte die Phrase seine Aufgabe.
 */
const PLAN = {
  A: [['setzen', 0.1, 'gleich'], ['wiederholen', 0.36, 'gespiegelt'], ['wiederholen', 0.78, 'weiter'], ['wiederholen', 0.92, 'verschaerft']],
  B: [['setzen', 0.26, 'gleich'], ['wiederholen', 0.44, 'gespiegelt'], ['wiederholen', 0.85, 'knapp']],
};

/**
 * Motive in den Richtungsplan eintragen (`eintrag.motiv = {id, teil, rolle, variante, zusatz}`).
 * @param {object} rng
 * @param {object[]} richtungen  Plan aus planeSzenen (wird verändert)
 * @param {string[]|null} palette  erlaubte Mechaniken des Levels (null = alle) — für den Zusatz „verschärft“
 * @returns {{id: string, laenge: number, stellen: number}[]}
 */
export function planeMotive(rng, richtungen, palette) {
  const n = richtungen.length;
  const frei = (i) => i >= 3 && i < n - 3 && typeof richtungen[i] === 'object' && !richtungen[i].abstecher && !richtungen[i].motiv;
  const zusaetze = ['broeckel', 'nadeloehr'].filter((m) => !palette || palette.includes(m));
  const ids = rng.range(0, 1) < 0.5 ? ['A', 'B'] : ['A'];
  const ergebnis = [];
  for (const id of ids) {
    const laenge = rng.intRange(2, 3);
    let stellen = 0;
    for (const [rolle, anteil, variante] of PLAN[id]) {
      // Die Vorstellung muss liegen, sonst gibt es nichts zu wiederholen
      if (rolle === 'wiederholen' && stellen === 0) break;
      const mitte = Math.round(n * (anteil + rng.range(-0.03, 0.03)));
      let start = -1;
      for (let d = 0; d < 8 && start < 0; d++) {
        for (const s of [mitte + d, mitte - d]) {
          if (Array.from({ length: laenge }, (_, k) => s + k).every(frei)) { start = s; break; }
        }
      }
      if (start < 0) continue;
      const zusatz = variante === 'verschaerft' && zusaetze.length ? rng.pick(zusaetze) : null;
      // (Verschärft nur der letzte Zug der Phrase — auf allen lag sonst dieselbe Aufgabe mehrfach hintereinander, gemessen
      // 4× Nadelöhr am Stück; Dosierung, Rückmeldung 27.09.2026)
      for (let k = 0; k < laenge; k++) {
        const letzter = k === laenge - 1;
        const v = variante === 'verschaerft' && !letzter ? 'gleich' : variante;
        richtungen[start + k].motiv = { id, teil: k, rolle, variante: v, ...(zusatz && letzter ? { zusatz } : {}) };
      }
      // Die Nachbarn einer Wiederholung schlicht: Ihre eigene Aufgabe verlängerte sonst die der Phrase
      if (rolle === 'wiederholen') {
        for (const nb of [richtungen[start - 1], richtungen[start + laenge]]) if (nb && typeof nb === 'object' && !nb.abstecher && !nb.motiv) nb.mechanik = '';
      }
      stellen++;
    }
    if (stellen) ergebnis.push({ id, laenge, stellen });
  }
  return ergebnis;
}
