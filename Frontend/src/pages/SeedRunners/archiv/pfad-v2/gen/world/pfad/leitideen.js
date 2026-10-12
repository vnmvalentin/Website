// Leitideen: Stufe 0 vor dem Szenenplan (26.09.2026: „jedes Level wie von einem anderen Menschen“ — die Handschrift gab
// jedem Level einen Stil, aber keine Absicht). Eine Leitidee ist EIN Satz, den das Level erzählt, in vier Akten
// (Kishōtenketsu):
//   Einführung  die Aufgabe allein, mit Luft dazwischen, eine Stufe leichter
//   Steigerung  dieselbe Aufgabe dichter und in Kombination
//   Twist       etwas Verwandtes, das die gelernte Regel umdreht (Boden fällt → Decke fällt)
//   Finale      beides zusammen, eine Stufe schwerer
// Der Twist ist je Idee FEST gewählt, nicht gewürfelt: Ein gewürfelter Twist wäre nur „Akt 3 mit anderer Aufgabe“.
//
// Je Akt:
//   mechaniken  Szenen-Mechaniken wie in szenen.js (Kombinationen mit „+“; der Planer nimmt je Zug einen Teil)
//   schlicht    Anteil der Szenen ohne Mechanik
//   dVersatz    Schwierigkeit dieses Akts relativ zur gewählten (Bröckelzeit, Einzelblock-Toleranz, Doppelsprünge …)
// Optional je Idee: `formen` — Gewichte der Großformen (mit denen des Autors multipliziert).
// Der Autor (handschrift.js) wird aus `autoren` gewürfelt und gibt nur noch den Stil (Plattformbreite, Stacheln, Grotten).

/** Anteil der Akte an der Zugzahl — die Einführung kurz, Steigerung und Finale lang */
export const AKT_ANTEILE = Object.freeze([0.2, 0.3, 0.2, 0.3]);
export const AKT_NAMEN = Object.freeze(['Einführung', 'Steigerung', 'Twist', 'Finale']);

export const LEITIDEEN = Object.freeze({
  taktwerk: {
    name: 'Taktwerk',
    satz: 'Schalter kippen die Welt um — erst in Ruhe, dann mitten im Sprung; im Twist tickt die Uhr (Tore, Böen im Takt), im Finale beides zugleich.',
    autoren: { uhrwerk: 3, tueftler: 2, allrounder: 1 },
    zielschloss: true,
    akte: [
      { mechaniken: ['schalter'], schlicht: 0.15, dVersatz: -1 },
      { mechaniken: ['schalter', 'schalter+broeckel'], schlicht: 0.05, dVersatz: 0 },
      { mechaniken: ['tor', 'boee'], schlicht: 0.05, dVersatz: 0 },
      { mechaniken: ['schalter+tor', 'schalter+boee'], schlicht: 0, dVersatz: 1 },
    ],
  },
  broeckelkaskade: {
    name: 'Bröckelkaskade',
    satz: 'Der Boden hält nicht — erst einzelne Bröckelblöcke, dann ganze Ketten; im Twist hält der Boden wieder — winzig, federnd oder als Luke, die man herunterholt; im Finale beides.',
    autoren: { praezision: 3, flitzer: 2, uhrwerk: 1 },
    zielschloss: false,
    akte: [
      { mechaniken: ['broeckel'], schlicht: 0.15, dVersatz: -1 },
      { mechaniken: ['broeckel', 'einzelblock+broeckel'], schlicht: 0.05, dVersatz: 0 },
      // (Feder dazu: In Turm- und Absturz-Etappen gelangen Einzelblock und Deckel kaum — gemessen: ein Twist ganz ohne Aufgabe)
      { mechaniken: ['einzelblock', 'feder', 'deckel'], schlicht: 0.05, dVersatz: 0 },
      { mechaniken: ['einzelblock+broeckel', 'dash+broeckel', 'deckel'], schlicht: 0, dVersatz: 1 },
    ],
  },
  boeenwelt: {
    name: 'Böenwelt',
    satz: 'Der Wind trägt — erst stetig, dann nur in Böen, auf die man warten muss; im Twist wird es eng, im Finale fliegt man mit der Böe durchs Nadelöhr.',
    autoren: { windlaeufer: 3, akrobat: 1, allrounder: 1 },
    zielschloss: false,
    akte: [
      { mechaniken: ['wind'], schlicht: 0.15, dVersatz: -1 },
      { mechaniken: ['boee', 'wind', 'aufwind', 'aufwind+ring'], schlicht: 0.05, dVersatz: 0 },
      // (ohne Ring: In der Kombination gewann fast immer der Ring, der Twist bestand aus Ringen)
      { mechaniken: ['nadeloehr'], schlicht: 0.05, dVersatz: 0 },
      { mechaniken: ['boee+nadeloehr', 'wind+nadeloehr', 'aufwind+nadeloehr'], schlicht: 0, dVersatz: 1 },
    ],
  },
  // (Rückmeldung 27.09.2026: „Flappy Bird mit den Grapplern, wo man perfekt durch Lücken schwingen muss“)
  seilakt: {
    name: 'Seilakt',
    satz: 'Von Anker zu Anker — erst einzelne Schwünge, dann ganze Seilketten durch enge Lücken; im Twist tragen Ringe statt Seile, im Finale die längsten Seilketten.',
    autoren: { seiltaenzer: 3, akrobat: 2 },
    // (Welle kaum: Sie kennt nur Bergauf/Bergab, dort passt keine Seilkette — der Szenenplan nahm dann Ringe)
    formen: { strom: 3, welle: 0.2, absturz: 0.1, turm: 0.2 },
    zielschloss: false,
    akte: [
      { mechaniken: ['greifen'], schlicht: 0.15, dVersatz: -1 },
      { mechaniken: ['flappy', 'flappy', 'greifen+nadeloehr'], schlicht: 0.05, dVersatz: 0 },
      { mechaniken: ['ring', 'ring+nadeloehr'], schlicht: 0.05, dVersatz: 0 },
      // (nur Seilketten: In „flappy+ring“ gewann fast immer der Ring — er gelingt viel öfter)
      { mechaniken: ['flappy'], schlicht: 0, dVersatz: 1 },
    ],
  },
  // (Rückmeldung 27.09.2026: „Chain-Kristalle und Schwerkraft-Zonen, kombiniert — kopfüber schwere Sprünge“)
  schwerelos: {
    name: 'Schwerelos',
    satz: 'Oben ist unten — kopfüber über Stachelstreifen und winzige Deckenblöcke; im Twist geht es von Kristall zu Kristall nach oben, im Finale beides.',
    autoren: { akrobat: 2, flitzer: 2, allrounder: 1 },
    // (kein Turm: Die Kopfüber-Passage braucht Breite)
    formen: { strom: 3, welle: 0.6, absturz: 0.6, turm: 0.2 },
    zielschloss: false,
    akte: [
      { mechaniken: ['kopfueber'], schlicht: 0.15, dVersatz: -1 },
      { mechaniken: ['kopfueber', 'ring'], schlicht: 0.05, dVersatz: 0 },
      { mechaniken: ['kette', 'dashsprung'], schlicht: 0.05, dVersatz: 0 },
      { mechaniken: ['kopfueber', 'kette'], schlicht: 0, dVersatz: 1 },
    ],
  },
  // (Rückmeldung 26.09.2026: Fallblöcke nur als Werkzeug — auslösen, damit sie den Weg frei machen)
  brueckenbauer: {
    name: 'Brückenbauer',
    satz: 'Den Weg baut man sich selbst — Platten auslösen: als Brücke über die Grube, als offene Luke nach oben; im Twist lässt ein Schalter die Brücke erscheinen, im Finale beides.',
    autoren: { uhrwerk: 2, tueftler: 2, flitzer: 1, allrounder: 1 },
    // (Brücken brauchen waagerechte Züge — gemessen: Welle > Turm > Absturz hatte einen einzigen Brückenblock; Turm für die Deckel)
    formen: { strom: 3, turm: 0.6, welle: 0.2, absturz: 0.3 },
    zielschloss: false,
    akte: [
      { mechaniken: ['bruecke'], schlicht: 0.2, dVersatz: -1 },
      { mechaniken: ['bruecke', 'deckel', 'bruecke+broeckel'], schlicht: 0.1, dVersatz: 0 },
      { mechaniken: ['schalter'], schlicht: 0.05, dVersatz: 0 },
      { mechaniken: ['schalter+bruecke', 'deckel', 'bruecke+broeckel'], schlicht: 0, dVersatz: 1 },
    ],
  },
});
export const LEITIDEE_IDS = Object.freeze(Object.keys(LEITIDEEN));

/** Anteil der Level mit Leitidee; der Rest bleibt freie Handschrift (sonst wären es nur drei Arten von Level) */
const ANTEIL = 0.6;

/**
 * @param {object} rng
 * @param {string|null} [wunsch]  Id erzwingen; 'keine' erzwingt ein Level ohne Leitidee
 * @returns {object|null} die Leitidee samt `id`
 */
export function waehleLeitidee(rng, wunsch) {
  if (wunsch === 'keine') return null;
  if (LEITIDEEN[wunsch]) return { id: wunsch, ...LEITIDEEN[wunsch] };
  if (rng.range(0, 1) >= ANTEIL) return null;
  const id = rng.pick(LEITIDEE_IDS);
  return { id, ...LEITIDEEN[id] };
}

/**
 * Akt-Einteilung über die ganze Zugzahl: welcher Akt bei Zug i gilt und wie viele Züge er noch hat
 * @returns {{ akt: (i:number) => object, rest: (i:number) => number }}
 */
export function aktPlan(idee, zuegeGesamt) {
  const grenzen = [];
  let summe = 0;
  for (const a of AKT_ANTEILE) { summe += a; grenzen.push(Math.round(zuegeGesamt * summe)); }
  const index = (i) => { const k = grenzen.findIndex((g) => i < g); return k < 0 ? grenzen.length - 1 : k; };
  return {
    akt: (i) => { const k = index(i); return { index: k, name: AKT_NAMEN[k], ...idee.akte[k] }; },
    akte: idee.akte,
    rest: (i) => Math.max(0, grenzen[index(i)] - i),
  };
}
