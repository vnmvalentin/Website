// balancdle.js — "Die Waage": rate das exakte Gewicht eines Gegenstands, von der Büroklammer
// bis zum Konzertflügel. Mechanisch identisch zu Velocidle/Pricedle/Duratidle (eine Zahl ab
// einem echten Nullpunkt schätzen, unbegrenzt nach oben, keine sinnvolle negative Seite) — nur
// die geratene Größe ist ein Gewicht statt km/h oder Preis.
//
// Der kanonische Wert (hier `value`, was Schätzung und Punkteformel sehen) bleibt IMMER in
// Gramm — anders als Duratidles Sonderfall mit `unit` pro Runde. Die ANZEIGE wählt aber pro
// Runde automatisch zwischen Gramm und Kilogramm (ab 1000 g, siehe BalancdleRound.jsx's
// pickDisplayUnit): "190.000 g" für einen Löwen ist für niemanden intuitiv einschätzbar,
// "190 kg" dagegen schon. Diese Umrechnung passiert bewusst rein im Frontend, nicht hier —
// die bereits an Gramm-Größenordnungen kalibrierte Punkteformel (core/scoring.js) bekommt
// davon nichts mit. Der Datensatz bleibt trotzdem bewusst zwischen ~1 g und ~500 kg
// (Konzertflügel, Reitpferd) — nicht bis zu Elefanten/Blauwalen (mehrere Tonnen), weil sich
// so etwas aus Alltagserfahrung ohnehin kaum schätzen lässt (dieselbe Lektion wie bei den
// astronomischen Ausreißern, die aus Tempdle/Velocidle geflogen sind).
const entries = require('../../data/balancdle-entries.json');
const { seededPick, todayDateKey } = require('../dailySeed');

const ROUNDS_PER_GAME = 5;

const pool = entries.map((e) => ({
  id: `balancdle-${e.id}`,
  category: 'weight',
  label: e.label,
  description: e.description,
  value: e.weightG,
  image: e.image || null,
}));

function buildRounds(seedStr) {
  return seededPick(pool, ROUNDS_PER_GAME, seedStr).map((entry, index) => ({ index, ...entry }));
}

// Tagesrätsel: exakt reproduzierbar aus (Spiel-ID, Datum) — siehe dailySeed.js.
function dailyRounds(dateKey = todayDateKey()) {
  return { dateKey, rounds: buildRounds(`balancdle:${dateKey}`) };
}

// Übungsmodus: neue zufällige Runden bei jedem Aufruf, zählt nicht für die Bestenliste.
function practiceRounds() {
  return { rounds: buildRounds(`balancdle:practice:${Date.now()}:${Math.random()}`) };
}

// Deutlich kleiner als die geteilte Standard-Mindesttoleranz (core/scoring.js' MIN_TOLERANCE
// = 7 g): der Datensatz reicht von 0,03 g (Reiskorn) bis 6.000.000 g (Elefant) — für die
// federleichten Einträge überschreibt der Mindestwert von 7 die eigentlich vorgesehene, zum
// Istwert proportionale Toleranz (0,5 × Istwert) komplett. Ein 80 % danebenliegender Tipp bei
// einer Büroklammer (0,2 statt 1 g) gab dadurch 89 statt der für die meisten anderen Einträge
// üblichen ~20 Punkte — derselbe Effekt, der zuerst bei Duratidles Kamerablitz auffiel (siehe
// core/games/duratidle.js). Mit 0,1 verschwindet er für praktisch den gesamten Datensatz
// (Istwert ≥ 2 g reicht dafür schon), nur die allerkleinsten Einträge (Reiskorn, Heftklammer,
// Biene) bleiben minimal großzügiger als der Rest.
const MIN_TOLERANCE_WEIGHT = 0.1;

module.exports = { id: 'balancdle', unit: ' g', ROUNDS_PER_GAME, dailyRounds, practiceRounds, minTolerance: MIN_TOLERANCE_WEIGHT };
