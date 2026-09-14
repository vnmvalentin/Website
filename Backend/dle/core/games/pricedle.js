// pricedle.js — "Der Preisvergleich": rate den exakten Einführungspreis eines Produkts, vom
// Apple I bis zur PlayStation 5. Mechanisch identisch zu Velocidle (eine Zahl ab einem
// echten Nullpunkt schätzen, unbegrenzt nach oben) — nur die geratene Größe ist ein Preis in
// US-Dollar statt km/h.
//
// Bewusst EINE einzige Währung (US-Dollar) für den kompletten Datensatz statt pro Eintrag
// unterschiedlicher Landeswährungen — anders als bei Duratidles Einheiten (wo Sekunden bis
// Jahre sich nicht sinnvoll auf eine gemeinsame Einheit bringen ließen) ist das hier möglich,
// weil praktisch alle einflussreichen Technik-Produkte zuerst in den USA vermarktet wurden
// und ihr US-Einführungspreis gut dokumentiert ist. Eine einzige Einheit hält Pricedle so
// einfach wie Tempdle/Velocidle statt Duratidles Sonderfall mit `unit` pro Runde.
//
// Bewusst NICHT im Datensatz: extrem teure Einzelanschaffungen (Autos im fünf- oder
// sechsstelligen Bereich, Immobilien, …) — dieselbe Lektion wie bei den astronomischen
// Ausreißern, die aus Tempdle/Velocidle geflogen sind: die Punkteformel (core/scoring.js)
// deckelt die Toleranz bei 500, bei einem Wert von z.B. 100.000 $ wäre das eine bedeutungslos
// enge Marge von 0,5 %.
const entries = require('../../data/pricedle-entries.json');
const { seededPick, todayDateKey } = require('../dailySeed');

const ROUNDS_PER_GAME = 5;

const pool = entries.map((e) => ({
  id: `pricedle-${e.id}`,
  category: 'price',
  label: e.label,
  description: e.description,
  value: e.priceUsd,
  image: e.image || null,
}));

function buildRounds(seedStr) {
  return seededPick(pool, ROUNDS_PER_GAME, seedStr).map((entry, index) => ({ index, ...entry }));
}

// Tagesrätsel: exakt reproduzierbar aus (Spiel-ID, Datum) — siehe dailySeed.js.
function dailyRounds(dateKey = todayDateKey()) {
  return { dateKey, rounds: buildRounds(`pricedle:${dateKey}`) };
}

// Übungsmodus: neue zufällige Runden bei jedem Aufruf, zählt nicht für die Bestenliste.
function practiceRounds() {
  return { rounds: buildRounds(`pricedle:practice:${Date.now()}:${Math.random()}`) };
}

module.exports = { id: 'pricedle', unit: ' $', ROUNDS_PER_GAME, dailyRounds, practiceRounds };
