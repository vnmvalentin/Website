// guessWindow.js — gemeinsame Reglerfenster-Logik für Tempdle/Velocidle/Duratidle (NICHT
// Probabildle — Prozent hat mit 0-100 % einen physikalisch fixen Bereich, den zu "verkleinern"
// nichts bringen würde und nur verwirren würde).
//
// Ursprünglich hatten Tempdle/Velocidle EINE feste Skala für den ganzen Datensatz (z.B.
// Velocidle 0-3000 km/h) — bei einem Wert von 5 km/h quetscht das die Schätzung auf ein paar
// Pixel am linken Rand. Duratidles Lösung (Skalenobergrenze aus dem Istwert selbst ableiten)
// behebt das UX-Problem, hat aber naiv umgesetzt ein Leck: eine feste Formel wie
// "Obergrenze = Wert × 2,4" verrät durch die sichtbaren Reglergrenzen fast den Wert selbst
// (0-50 mit dem Wert immer nahe der Mitte → man lernt "die Antwort liegt bei ungefähr der
// Hälfte der oberen Grenze"). Der Nutzer wollte explizit: Skala pro Frage unterschiedlich
// UND unvorhersehbar, weder immer derselbe Bruchteil der Skala noch immer mittig.
//
// Die Lösung: statt einer festen Formel wird der Anteil, an dem der Istwert innerhalb der
// Skala liegt, pro Runde ZUFÄLLIG gezogen (positionFraction, breit gestreut zwischen 12 % und
// 75 %) — das bestimmt gleichzeitig sowohl die Fensterbreite als auch die Position des Werts
// darin, beides auf einen Schlag. Weil ein und dieselbe sichtbare Obergrenze (z.B. "50")
// je nach gezogenem Zufallswert von ganz unterschiedlichen echten Werten stammen kann (hier
// von ungefähr 6 bis 37), lässt sich aus den Reglergrenzen allein nichts Verlässliches mehr
// über den gesuchten Wert ablesen. Reines Math.random() reicht — die Antwort steht ohnehin
// schon vor dem Raten fest (siehe dleRoutes.js-Kommentar), das Reglerfenster ist nur
// Präsentation, keine sicherheitsrelevante Information.
// Ursprünglich 0,12-0,75 — bei einem niedrig gezogenen Anteil (z.B. 0,15) landete der Istwert
// nur ganz am linken Rand eines Fensters, das fast das Siebenfache seiner selbst maß. Der
// allergrößte Teil der sichtbaren Regler-Fläche lag dann in einem Bereich, in dem der Istwert
// ohnehin nie liegen konnte — jeder Pixel Mausbewegung bewegte den Wert entsprechend grob,
// echte Präzision beim Schätzen war kaum gefordert (Nutzer-Feedback: "man muss genauer
// bestimmen, der Balken soll kleiner sein"). Deutlich angehoben auf 0,35-0,9: das Fenster
// misst dadurch höchstens noch knapp das Dreifache des Istwerts (vorher bis zu 8,3-fach),
// Zufallsstreuung bleibt trotzdem erhalten — weiterhin verrät die sichtbare Obergrenze allein
// nichts Verlässliches über den gesuchten Wert (siehe Dateikopf-Kommentar).
const MIN_POSITION_FRACTION = 0.35;
const MAX_POSITION_FRACTION = 0.9;

// Rundet auf die nächste "glatte" 1/2/5/10-fache Zehnerpotenz auf — Standardtrick aus der
// Diagramm-Achsenbeschriftung, hier für Reglergrenzen zweckentfremdet.
export function niceCeil(target) {
  if (!(target > 0)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / magnitude;
  let nice;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

function randomPositionFraction(rng) {
  return MIN_POSITION_FRACTION + rng() * (MAX_POSITION_FRACTION - MIN_POSITION_FRACTION);
}

// Für Größen mit echtem, bedeutungsvollem Nullpunkt (Geschwindigkeit, Dauer): Fenster ist
// immer [0, max], nur `max` variiert pro Runde.
export function halfLineWindow(value, rng = Math.random) {
  const magnitude = Math.max(Math.abs(value), 1e-9);
  const max = niceCeil(magnitude / randomPositionFraction(rng));
  return { min: 0, max };
}

// Für Größen mit echtem Nullpunkt, aber OHNE natürliche obere/untere Grenze in beide
// Richtungen (Temperatur: negativ und positiv beide sinnvoll, 0 °C ist der einzige fixe
// Bezug). Die "Gegenseite" (die Richtung, in der der Istwert NICHT liegt) bekommt eine davon
// unabhängige Zufallsspanne — sie hat ja nichts mit dem gesuchten Wert zu tun, muss aber
// trotzdem genug Raum bieten, um dort plausibel daneben zu raten.
//
// `hardMax`/`hardMin` (optional): für Größen, die zwar in beide Richtungen sinnvoll sind,
// aber trotzdem eine reale Grenze haben (Inventiondle: ein Erfindungsjahr kann nicht in der
// Zukunft liegen) — ohne diese Deckelung könnte die generische Kopfraum-Formel bei einem
// Wert nahe der Grenze (z.B. Jahr 2007) ein Fenster bis Jahr 5000 oder mehr aufspannen, weil
// sie "wie viel Luft nach oben lassen wir" nur relativ zum Istwert denkt, nicht absolut — ein
// Regler, der bis "5000 n. Chr." reicht, wirkt fürs Raten eines vergangenen Ereignisses
// einfach absurd (siehe InventiondleRound.jsx-Kommentar). Tempdle & Co. lassen beide
// Parameter weg (Infinity) und verhalten sich exakt wie zuvor.
export function centeredWindow(value, rng = Math.random, { hardMax = Infinity, hardMin = -Infinity } = {}) {
  const magnitude = Math.max(Math.abs(value), 1e-9);
  const relevantExtent = niceCeil(magnitude / randomPositionFraction(rng));
  const oppositeExtent = niceCeil(20 + rng() * 280);
  if (value >= 0) {
    return { min: Math.max(-oppositeExtent, hardMin), max: Math.min(relevantExtent, hardMax) };
  }
  return { min: Math.max(-relevantExtent, hardMin), max: Math.min(oppositeExtent, hardMax) };
}

// Rundet einen Regler-Rohwert auf ~3 signifikante Stellen, orientiert an dessen EIGENER
// Größenordnung, statt immer auf eine ganze Einheit. Ohne das bleibt der Regler bei kleinen
// Istwerten (und damit bei kleinen, pro Runde gezogenen Reglerfenstern, siehe
// halfLineWindow/centeredWindow oben) über viele Roh-Schritte hinweg auf "0" hängen — die
// Log-Skala komprimiert dort sehr fein, eine feste Rundung auf ganze Zahlen wirft diese
// Feinheit aber sofort wieder weg und lässt den Regler sich wie hakend/blockierend anfühlen
// (genau das gemessene Symptom: bis zu 80 von 1000 Roh-Schritten ohne jede sichtbare
// Änderung der Anzeige). Dieselbe Idee wie Probabildles distanzbasierte Rundung (siehe
// ProbabildleRound.jsx), nur bezogen auf den Abstand von 0 statt von einem Rand bei 0/100 %.
//
// Bewusst ÜBER `toPrecision` statt der ursprünglichen "Math.round(value/step)*step"-Formel:
// Letztere erzeugte bei kleinen Schrittweiten (z.B. step=0,001) klassische
// Gleitkomma-Artefakte — 19 * 0,001 ergibt in JS z.B. 0.019000000000000003 statt 0,019 —,
// die dann UNFORMATIERT im Zahlen-Eingabefeld auftauchten (z.B. Balancdle zeigte bei
// niedrigen Werten plötzlich "1,9000000 g" statt "1,9 g"). `toPrecision` rechnet stattdessen
// über die Dezimal-STRING-Darstellung, das Ergebnis ist garantiert sauber.
//
// Unter 10 bleibt das (feine 3-signifikante-Stellen-Rundung nötig, sonst ließen sich winzige
// Istwerte wie ein 0,03-g-Reiskorn oder ein 1-ms-Kamerablitz mit dem Regler gar nicht treffen).
// AB 10 aufwärts war dieselbe 3-signifikante-Stellen-Logik aber selbst das Problem: sie
// erzeugte bei Werten wie 92,3 oder gar 9,35 unnötige Nachkommastellen, obwohl die echten
// Datensatz-Werte in diesem Bereich praktisch immer glatte, runde Zahlen sind — reine
// Scheingenauigkeit, die zudem bei Balancdles Gramm→kg-Anzeige krumme Werte wie "1,23 kg"
// statt "1,2 kg" erzeugte (Nutzer-Feedback: "diese 2 Nachkommastellen bei hohen Werten mag
// ich gar nicht, die Skala sollte da eher in ganzen Schritten laufen"). Deshalb jetzt: 10 bis
// 99 runden auf echte Ganzzahl-Schritte, darüber auf eine an die jeweils EIGENE Größenordnung
// angepasste Zehnerstufe (100er-Bereich → Schritt 10, 1.000er-Bereich → Schritt 100, …) — so
// bleiben auch Werte im Millionenbereich (z.B. ein 6.000.000-g-Elefant) ohne bedeutungslose
// Einer-Präzision, aber immer noch fein genug, um nah am Istwert genau zu treffen.
export function roundToAdaptiveStep(value) {
  if (value === 0) return 0;
  const abs = Math.abs(value);
  if (abs < 10) return Number(value.toPrecision(3));
  if (abs < 100) return Math.round(value);
  const magnitude = Math.pow(10, Math.floor(Math.log10(abs)) - 1);
  return Math.round(value / magnitude) * magnitude;
}

// Log-Skala auf einer Halblinie [0, max] — 0 am linken Rand, `max` am rechten.
export function halfLineNormPos(v, max) {
  const clamped = Math.max(0, Math.min(max, v));
  return Math.log10(1 + clamped) / Math.log10(1 + max);
}
export function halfLineNormPosToValue(p, max) {
  const clamped = Math.max(0, Math.min(1, p));
  return Math.pow(10, clamped * Math.log10(1 + max)) - 1;
}

// Log-Skala auf einer Vollgeraden [min, max] mit fester Mitte bei 0 — jede Seite für sich
// logarithmisch gestaucht (siehe TempdleRound.jsx-Kommentarkopf zur Begründung).
export function centeredNormPos(v, { min, max }) {
  const clamped = Math.max(min, Math.min(max, v));
  if (clamped >= 0) {
    const t = Math.log10(1 + clamped) / Math.log10(1 + max);
    return 0.5 + 0.5 * t;
  }
  const t = Math.log10(1 + Math.abs(clamped)) / Math.log10(1 + Math.abs(min));
  return 0.5 - 0.5 * t;
}
export function centeredNormPosToValue(p, { min, max }) {
  const clamped = Math.max(0, Math.min(1, p));
  if (clamped >= 0.5) {
    const t = (clamped - 0.5) / 0.5;
    return Math.pow(10, t * Math.log10(1 + max)) - 1;
  }
  const t = (0.5 - clamped) / 0.5;
  return -(Math.pow(10, t * Math.log10(1 + Math.abs(min))) - 1);
}
