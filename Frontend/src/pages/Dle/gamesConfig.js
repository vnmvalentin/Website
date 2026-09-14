// gamesConfig.js — Katalog aller -dle-Spiele für den Hub (Kachel-Menü).
//
// Dieselbe Dopplung wie bei Clash Royale (siehe ClashRoyale/modesConfig.js vs.
// clashRoyale/core/registry.js): die Backend-Spiel-IDs, die WIRKLICH Rundenlogik haben,
// stehen in Backend/dle/core/games/index.js. Hier kommen zusätzlich die Spiele dazu, die
// im Hub schon als Kachel sichtbar sind, aber noch "Bald verfügbar" zeigen — deren `status`
// unten muss beim Fertigstellen auf 'live' wechseln UND ein Backend-Spielmodul bekommen.
import { Thermometer, Gauge, Percent, Timer, History, Tag, Scale, Palette } from 'lucide-react';

export const DLE_GAMES = [
  {
    id: 'tempdle',
    name: 'Tempdle',
    subtitle: 'Das Thermometer',
    icon: Thermometer,
    description: 'Schätze die exakte Temperatur eines Phänomens — vom Schmelzpunkt eines Elements bis zur Lava eines Vulkans.',
    status: 'live',
  },
  {
    id: 'velocidle',
    name: 'Velocidle',
    subtitle: 'Der Tacho',
    icon: Gauge,
    description: 'Schätze Geschwindigkeiten — von der Weinbergschnecke bis zur Lichtgeschwindigkeit.',
    status: 'live',
  },
  {
    id: 'probabildle',
    name: 'Probabildle',
    subtitle: 'Die Prozent-Skala',
    icon: Percent,
    description: 'Ordne die statistische Wahrscheinlichkeit von Ereignissen auf einer logarithmischen Skala ein.',
    status: 'live',
  },
  {
    id: 'duratidle',
    name: 'Duratidle',
    subtitle: 'Die Stoppuhr',
    icon: Timer,
    description: 'Schätze die exakte Dauer von Dingen — vom kürzesten Krieg der Geschichte bis zur Lebenszeit einer Fruchtfliege.',
    status: 'live',
  },
  {
    id: 'inventiondle',
    name: 'Inventiondle',
    subtitle: 'Der Zeitstrahl',
    icon: History,
    description: 'Schätze das exakte Erfindungsjahr — vom Rad bis zum ersten Touchscreen-Smartphone.',
    status: 'live',
  },
  {
    id: 'pricedle',
    name: 'Pricedle',
    subtitle: 'Der Preisvergleich',
    icon: Tag,
    description: 'Schätze den exakten Einführungspreis legendärer Technik-Produkte, vom Apple I bis zur PlayStation 5.',
    status: 'live',
  },
  {
    id: 'balancdle',
    name: 'Balancdle',
    subtitle: 'Die Waage',
    icon: Scale,
    description: 'Schätze das exakte Gewicht eines Gegenstands — von der Büroklammer bis zum Konzertflügel.',
    status: 'live',
  },
  {
    id: 'cr-color-match',
    name: 'CR Color Match',
    subtitle: 'Clash Royale',
    icon: Palette,
    description: 'Färbe eine markante Stelle einer Clash-Royale-Karte so ein, wie du sie in Erinnerung hast.',
    // Absichtlich gesperrt: die Flächen-Kalibrierung (siehe Backend/dle/tools/admin-lasso.html)
    // ist noch nicht für alle Karten sauber nachgezogen — zurück auf 'live' stellen, sobald das
    // fertig ist. CrColorMatchPage.jsx sperrt direkte Links zusätzlich zur Hub-Kachel.
    status: 'coming-soon',
  },
];

export function getDleGame(id) {
  return DLE_GAMES.find((g) => g.id === id) || null;
}
