// spiele.js — was der Browser über die Spiele des Spieleabends wissen muss: Farben der Plätze, Sitzordnung am Tisch,
// Kamera. Die Regeln selbst liegen nur auf dem Server (Backend/spieleabend/spiele/*.js).
//
// Der Tisch hat acht Positionen im Kreis (0 = vorne, dann gegen den Uhrzeigersinn je 45°). Jedes Spiel legt fest,
// auf welchen Positionen seine Stühle stehen; wer nicht mitspielt, läuft als Blob im Zimmer herum.

export const POSITIONEN = 8;

export const SPIELE = {
  vierGewinnt: {
    name: "4 gewinnt",
    kurz: "4 gewinnt",
    // Gegenüber: man schaut sich über das stehende Brett hinweg an
    stuehle: [0, 4],
    farben: [
      { name: "Rot", hex: "#e23a3a" },
      { name: "Gelb", hex: "#f4c20d" },
    ],
    // Kamera hinter dem eigenen Stuhl: Abstand vom Tischmittelpunkt, Höhe, Blickziel (Höhe über dem Tisch),
    // Ausschnitt (Breite, Höhe), der ins Bild passen muss
    kamera: { abstand: 4.5, hoehe: 2.1, ziel: 0.74, breite: 2.3, hoch: 1.9 },
    brettSchild: "unten", // Start/Ergebnis hängt unter dem Brett
  },
  maedn: {
    name: "Mensch ärgere dich nicht",
    kurz: "Mensch ärgere dich nicht",
    // Reihum im Uhrzeigersinn (von oben gesehen): vorne, links, gegenüber, rechts — so wie die Figuren laufen
    stuehle: [0, 6, 4, 2],
    farben: [
      { name: "Rot", hex: "#d93a32" },
      { name: "Blau", hex: "#2f6fd6" },
      { name: "Grün", hex: "#2f9e4a" },
      { name: "Gelb", hex: "#f2c21b" },
    ],
    // Brett liegt flach: Kamera schräg von oben
    kamera: { abstand: 4.8, hoehe: 4.2, ziel: 0.35, breite: 3.0, hoch: 3.2, steil: 30 },
    brettSchild: "mitte",
  },
  zeichnen: {
    name: "Zeichen-Hochstapler",
    kurz: "Zeichen-Hochstapler",
    // sechs Stühle gleichmäßig um den Tisch (Positionen dürfen Bruchteile sein)
    stuehle: [0, 4 / 3, 8 / 3, 4, 16 / 3, 20 / 3],
    farben: [
      { name: "Rot", hex: "#d93a32" },
      { name: "Blau", hex: "#2f6fd6" },
      { name: "Grün", hex: "#2f9e4a" },
      { name: "Lila", hex: "#8a4fd1" },
      { name: "Orange", hex: "#ee8a1f" },
      { name: "Türkis", hex: "#18a3a3" },
    ],
    // steil von oben auf das Blatt: zum Zeichnen braucht man es groß
    kamera: { abstand: 2.7, hoehe: 4.3, ziel: -0.1, breite: 2.9, hoch: 2.3, steil: 15 },
    brettSchild: "mitte",
    ohneBots: true,
  },
};

export const BOT_STUFEN = [
  { id: "leicht", name: "leicht" },
  { id: "mittel", name: "mittel" },
  { id: "schwer", name: "schwer" },
];

/**
 * Wer sitzt auf den Stühlen? Während einer Partie die Besetzung (mit Bots), sonst die Stuhlwahl im Wartestand.
 * → [{ person: id | null, bot: { name, skin } | null }]
 */
export function sitzende(view) {
  if (view.phase === "spiel" && view.partie) return view.partie.besetzung;
  return view.stuehle.map((id) => ({ person: id, bot: null }));
}
