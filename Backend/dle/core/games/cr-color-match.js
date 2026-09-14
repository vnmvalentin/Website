// cr-color-match.js — "CR Color Match": aus dem Gedächtnis die Farbe einer markanten Stelle
// auf einer Clash-Royale-Karte treffen (Ausmal-Regler statt Zahlen-Skala, siehe
// CrColorMatchRound.jsx).
//
// Strukturell komplett anders als Tempdle & Co.: `answerType: 'color'` statt einer Zahl auf
// einer Skala (siehe dleRoutes.js, das je nach answerType zwischen core/scoring.js und
// core/colorScoring.js umschaltet) — ein RGB-Wert ist 3-dimensional, für ihn ergibt weder
// eine Skala noch ein Zahlen-Diff Sinn.
//
// Bildquelle: dieselbe offizielle Clash-Royale-API, die JEDE andere Clash-Royale-Seite dieses
// Projekts inzwischen für Kartenbilder nutzt (api-assets.clashroyale.com, URL-Mapping in
// clashRoyale/data/cardIconUrls.json, siehe clashRoyale/tools/cardIconSpiegel.js — früher
// cdn.royaleapi.com) — echtes Kartenbild wird NIE als Datei mitgeliefert (Supercells
// Fan-Content-Policy, siehe Frontend/src/pages/ClashRoyale/ui/CrIcons.jsx-Kommentar). Die
// Zielfarbe je Eintrag wurde einmalig direkt aus diesem echten Bild ausgelesen (Pixel-
// Mittelwert innerhalb der hinterlegten Fläche, nicht geraten) — siehe
// data/cr-color-match-entries.json für Koordinaten/Kontur und Farbwert.
//
// Welche Pixel "zur gefragten Fläche gehören" (`polygons`) wird per Hand mit
// tools/admin-lasso.html gezeichnet (freihändige Kontur, keine automatische Farb-Erkennung
// mehr — eine frühere Version versuchte das automatisch per Klick+Farbabstand-Schwelle, traf
// aber selbst mit Reglern zum Nachjustieren zuverlässig auch Nachbarbereiche, die nicht zur
// Fläche gehörten). Export bewusst NUR als Koordinatenliste (reine Geometrie, keine
// Bilddaten) — nie ein Bild, auch nicht lokal beim Kalibrieren.
//
// Kartenname kommt bewusst aus ALL_CARDS (core/cards.js) statt aus einem eigenen deutschen
// Namen im Datensatz — der Rest der Seite zeigt Clash-Royale-Karten überall unter ihrem
// offiziellen ENGLISCHEN Namen (z.B. "Rascals", nicht "Lausbuben"), das soll hier nicht
// abweichen. `bodyPart` im Datensatz bleibt der (deutsche) Freitext, welche Stelle der Karte
// gefragt ist — beides zusammen ergibt das Label ("Rascals: die Farbe ihrer Mützen").
//
// Bewusst NICHT im Datensatz: Karten ohne eine einzelne, aus dem Gedächtnis beschreibbare
// Farbfläche (z.B. stark gemusterte oder überwiegend graue/schwarze Rüstungen) — dieselbe
// "keine unschätzbaren Extreme"-Lektion wie bei den Zahl-Spielen, nur hier auf Farben
// übertragen: eine Frage nach einem nicht erinnerbaren Grauton wäre reiner Zufall.
const entries = require('../../data/cr-color-match-entries.json');
const { hexToRgb } = require('../colorScoring');
const { seededPick, todayDateKey } = require('../dailySeed');
const { ALL_CARDS } = require('../../../clashRoyale/core/cards');
// Offizielle Clash-Royale-API-Bild-URLs statt live von cdn.royaleapi.com (siehe
// clashRoyale/tools/cardIconSpiegel.js) — Kartenartwork wird weiterhin NIE als Datei
// mitgeliefert (siehe Dateikopf-Kommentar), nur die URL zum Live-Nachladen steht hier fest.
const CARD_ICON_URLS = require('../../../clashRoyale/data/cardIconUrls.json');

const ROUNDS_PER_GAME = 5;
const CARD_WIDTH = 150;
const CARD_HEIGHT = 180;

const cardNameById = new Map(ALL_CARDS.map((c) => [c.id, c.name]));

const pool = entries.map((e) => ({
  id: `cr-color-match-${e.id}`,
  category: 'color',
  label: `${cardNameById.get(e.cardId) || e.cardId}: ${e.bodyPart}`,
  description: e.description,
  value: hexToRgb(e.colorHex),
  image: CARD_ICON_URLS[e.cardId]?.base || null,
  markerX: e.x,
  markerY: e.y,
  // NEU (bevorzugt, wenn vorhanden): von Hand gezeichnete Konturen aus admin-lasso.html —
  // eine oder mehrere Polygone (für getrennte Flächen wie Rascals' zwei Mützen), jedes eine
  // Liste von {x,y}-Punkten. Pixelgenau, weil es keine automatische Farb-Erkennung mehr
  // braucht. Einträge, die noch nicht neu kalibriert sind, haben kein `polygons` und fallen
  // in CrColorMatchRound.jsx auf das alte punkt+schwellenwert-basierte Verfahren zurück (siehe
  // dortiger Kommentar) — nicht mehr ideal, aber besser als ein kaputter Eintrag, bis alle
  // Karten nachgezogen sind.
  ...(e.polygons ? { polygons: e.polygons } : {}),
  // Optionale Randkorrektur (in Pixeln, negativ = schrumpfen, positiv = wachsen) — falls die
  // gezeichnete Kontur in admin-lasso.html insgesamt etwas zu knapp oder zu großzügig war,
  // ohne dass neu gezeichnet werden musste.
  ...(e.edgeAdjust !== undefined ? { edgeAdjust: e.edgeAdjust } : {}),
  // Legacy-Felder (nur noch für Einträge ohne `polygons` relevant):
  ...(e.extraPoints ? { extraPoints: e.extraPoints } : {}),
  ...(e.windowRadius !== undefined ? { windowRadius: e.windowRadius } : {}),
  ...(e.targetFraction !== undefined ? { targetFraction: e.targetFraction } : {}),
  ...(e.minComponentSize !== undefined ? { minComponentSize: e.minComponentSize } : {}),
  imgWidth: CARD_WIDTH,
  imgHeight: CARD_HEIGHT,
}));

function buildRounds(seedStr) {
  return seededPick(pool, ROUNDS_PER_GAME, seedStr).map((entry, index) => ({ index, ...entry }));
}

// Tagesrätsel: exakt reproduzierbar aus (Spiel-ID, Datum) — siehe dailySeed.js.
function dailyRounds(dateKey = todayDateKey()) {
  return { dateKey, rounds: buildRounds(`cr-color-match:${dateKey}`) };
}

// Übungsmodus: neue zufällige Runden bei jedem Aufruf, zählt nicht für die Bestenliste.
function practiceRounds() {
  return { rounds: buildRounds(`cr-color-match:practice:${Date.now()}:${Math.random()}`) };
}

module.exports = { id: 'cr-color-match', unit: '', answerType: 'color', ROUNDS_PER_GAME, dailyRounds, practiceRounds };
