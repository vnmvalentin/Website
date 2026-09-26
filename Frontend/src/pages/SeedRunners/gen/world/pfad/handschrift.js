// Handschrift: Jedes Level soll wirken, als hätte es ein anderer Mensch gebaut (Rückmeldung 26.09.2026: „jedes Level wie
// ein komplett eigenes … als ob ein anderer Mensch jedes Level machen würde. Wie eine eigene Handschrift“).
//
// Der Seed wählt einen „Autor": ein Thema (welche Mechaniken er überhaupt benutzt — manche nur eine einzige, etwa nur
// Mitfahr-Plattformen oder nur Einzelblöcke, einer gar keine) und dazu seine Eigenheiten, jede für sich gewürfelt:
//   schlicht    Anteil der Szenen ganz ohne Mechanik
//   szenen      wie lang seine Szenen sind (kurze, abwechslungsreiche oder lange, ruhige)
//   plattform   schmale, normale oder breite Landeflächen
//   stacheln    wie dicht er Landekanten mit Stacheln besetzt; tiefe: wie knapp der Grubenboden unter dem Sprung liegt
//   saeulen     wie oft Plattformen auf Felssäulen stehen statt zu schweben; grotte: wie oft eine Decke über der Szene hängt
//   formen      welche Großformen er bevorzugt
// Planer, Szenenplan und Füllung lesen daraus; ohne Handschrift gilt das bisherige Verhalten („Allrounder").

/** Die Themen: Palette der Mechaniken (null = alle), Gewicht, feste Eigenheiten */
export const THEMEN = Object.freeze({
  allrounder: { palette: null, gewicht: 2, schlicht: [0.1, 0.25] },
  klassiker: { palette: [], gewicht: 0.6, schlicht: [1, 1], plattform: ['schmal', 'normal'] },
  praezision: { palette: ['einzelblock', 'broeckel', 'flach'], gewicht: 1, schlicht: [0.05, 0.15], plattform: ['schmal'], stacheln: [1.1, 1.4] },
  // (meidet den Absturz — bergab gibt es keine Mitfahrt — und den engen Turm; gemessen: 3 Mitfahrten in 32 Zügen)
  faehrmann: { palette: ['mitfahrt'], gewicht: 1, schlicht: [0.1, 0.25], szenen: [4, 8], formen: { absturz: 0.05, turm: 0.3, strom: 2, halle: 1.5 } },
  // (ohne Ringe: seit den Ring-Ketten waren 45 % der Züge Ringe, mehr als Böen — dafür Böen durchs Nadelöhr)
  windlaeufer: { palette: ['wind', 'aufwind', 'nadeloehr', 'boee'], gewicht: 1, schlicht: [0.1, 0.2] },
  uhrwerk: { palette: ['tor', 'broeckel', 'schalter', 'boee'], gewicht: 1, schlicht: [0.1, 0.2], grotte: [0.5, 0.9], zielschloss: 0.8 },
  kletterer: { palette: ['wand', 'feder', 'aufwind', 'mitfahrt', 'deckel', 'kette'], gewicht: 1, schlicht: [0.1, 0.2], formen: { turm: 4, halle: 2, welle: 1.5 } },
  akrobat: { palette: ['greifen', 'ring', 'feder', 'kopfueber'], gewicht: 1.5, schlicht: [0.1, 0.2], saeulen: [0.1, 0.4] },
  // „Flappy-Seil“: Schwung um Schwung durch enge Lücken (Rückmeldung 27.09.2026)
  seiltaenzer: { palette: ['greifen', 'nadeloehr', 'ring', 'flappy'], gewicht: 1, schlicht: [0.05, 0.15], formen: { strom: 2, welle: 1.5, turm: 0.3 } },
  tueftler: { palette: ['schalter', 'schluessel', 'portal', 'einzelblock'], gewicht: 1, schlicht: [0.1, 0.25], zielschloss: 0.85 },
  flitzer: { palette: ['dash', 'ring', 'broeckel', 'wind', 'dashsprung', 'kette'], gewicht: 1, schlicht: [0.05, 0.15], plattform: ['normal', 'breit'] },
});
export const THEMA_IDS = Object.freeze(Object.keys(THEMEN));

const PLATTFORM = { schmal: { vorn: [0, 2], rand: 1 }, normal: { vorn: [1, 4], rand: null }, breit: { vorn: [3, 6], rand: 2 } };

/**
 * @param {object} rng
 * @param {string} [themaId]  erzwingen (Tests, Werkbank); sonst würfelt der Seed
 */
export function waehleHandschrift(rng, themaId = null) {
  const id = THEMEN[themaId] ? themaId : rng.weighted(THEMA_IDS, THEMA_IDS.map((t) => THEMEN[t].gewicht));
  const t = THEMEN[id];
  const zwischen = (b, fallback) => { const [a, c] = b || fallback; return a + (c - a) * rng.range(0, 1); };
  const kurz = rng.range(0, 1) < 0.5;
  const plattformArt = rng.pick(t.plattform || ['schmal', 'normal', 'normal', 'breit']);
  return {
    thema: id,
    palette: t.palette,
    schlicht: zwischen(t.schlicht, [0.1, 0.25]),
    szenen: t.szenen || (kurz ? [3, 5] : [5, 9]),
    plattform: { art: plattformArt, ...PLATTFORM[plattformArt] },
    stacheln: zwischen(t.stacheln, [0.6, 1.3]),
    tiefe: rng.intRange(-1, 2),
    saeulen: zwischen(t.saeulen, [0.25, 0.9]),
    grotte: zwischen(t.grotte, [0, 0.6]),
    formen: t.formen || {},
    // Zielschloss: das Ziel im Käfig, ein Schalter darüber öffnet ihn — Tüftler und Uhrwerk fast immer, sonst manchmal
    zielschalter: rng.range(0, 1) < (t.zielschloss ?? 0.35),
  };
}
