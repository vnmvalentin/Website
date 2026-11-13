// progress.js — alles zum Freischalten außer den Scheiben-Designs (die liegen in engine/skins.js, weil der Server
// ihre IDs prüft): Ball-Designs, Torjubel und die Erfolge. Rein kosmetisch und nur im eigenen Browser —
// jeder sieht seinen eigenen Ball und Jubel, online wie offline.
//
// need: { stat, count, label } — frei, sobald stats[stat] >= count (stats = loadStats() aus stats.js, inklusive der
// abgeleiteten Zähler wie achievements, formationsPlayed, fieldsWon). Schlüssel sind gespeicherte IDs: nie umbenennen.

import { FIELD_IDS, FORMATION_IDS } from './engine/index.js';
import { TOUR_MAX_STARS, TOUR_STAGES } from './tour.js';
import { TRICK_COUNT } from './trickData.js';

export const BALLS = Object.freeze({
  klassik: { name: 'Klassik' },
  tennis: { name: 'Tennisball', need: { stat: 'played', count: 8, label: 'Spiele 8 Partien' } },
  melone: { name: 'Melone', need: { stat: 'trickDone', count: 3, label: 'Löse 3 Trickschüsse' } },
  basket: { name: 'Basketball', need: { stat: 'tourStars', count: 9, label: 'Sammle 9 Sterne in der Tour' } },
  bowling: { name: 'Bowlingkugel', need: { stat: 'posts', count: 15, label: 'Triff 15-mal den Pfosten' } },
  disco: { name: 'Discokugel', need: { stat: 'cardsPlayed', count: 15, label: 'Spiele 15 Karten aus' } },
  smiley: { name: 'Smiley', need: { stat: 'trickStars', count: 30, label: 'Sammle 30 Sterne bei den Trickschüssen' } },
  erde: { name: 'Erdkugel', need: { stat: 'fieldsWon', count: 10, label: 'Gewinne auf 10 verschiedenen Feldern' } },
  feuer: { name: 'Feuerball', need: { stat: 'tourStars', count: 40, label: 'Sammle 40 Sterne in der Tour' } },
  strand: { name: 'Strandball', need: { stat: 'goals', count: 5, label: 'Schieße 5 Tore' } },
  neon: { name: 'Neon', need: { stat: 'wins', count: 5, label: 'Gewinne 5 Partien' } },
  stern: { name: 'Sternball', need: { stat: 'goals', count: 25, label: 'Schieße 25 Tore' } },
  acht: { name: 'Achter', need: { stat: 'cleanSheets', count: 3, label: 'Gewinne 3-mal zu null' } },
  gold: { name: 'Goldball', need: { stat: 'achievements', count: 10, label: 'Schalte 10 Erfolge frei' } },
});

export const CELEBRATIONS = Object.freeze({
  konfetti: { name: 'Konfetti' },
  welle: { name: 'Druckwelle', need: { stat: 'bankGoals', count: 1, label: 'Triff einmal über die Bande' } },
  feuerwerk: { name: 'Feuerwerk', need: { stat: 'goals', count: 15, label: 'Schieße 15 Tore' } },
  sterne: { name: 'Sternenregen', need: { stat: 'maxGoals', count: 3, label: 'Schieße 3 Tore in einer Partie' } },
  pixel: { name: 'Klötzchen', need: { stat: 'trickDone', count: 5, label: 'Löse 5 Trickschüsse' } },
  explosion: { name: 'Torexplosion', need: { stat: 'chaosWins', count: 3, label: 'Gewinne 3 Chaos-Partien' } },
  schnee: { name: 'Schneegestöber', need: { stat: 'fieldsWon', count: 5, label: 'Gewinne auf 5 verschiedenen Feldern' } },
  muenzen: { name: 'Goldregen', need: { stat: 'wins', count: 25, label: 'Gewinne 25 Partien' } },
  herzen: { name: 'Herzen', need: { stat: 'trickStars', count: 15, label: 'Sammle 15 Sterne bei den Trickschüssen' } },
  vulkan: { name: 'Vulkan', need: { stat: 'tourStars', count: 20, label: 'Sammle 20 Sterne in der Tour' } },
});

export const DEFAULT_LOOK = Object.freeze({ ball: 'klassik', celebration: 'konfetti' });

export const CATALOGS = Object.freeze({ ball: BALLS, celebration: CELEBRATIONS });
export const CATALOG_LABEL = Object.freeze({ skin: 'Scheibe', ball: 'Ball', celebration: 'Torjubel', achievement: 'Erfolg' });

export function itemUnlocked(catalog, id, stats) {
  const item = catalog[id];
  if (!item) return false;
  if (!item.need) return true;
  return (Number(stats?.[item.need.stat]) || 0) >= item.need.count;
}

export function itemProgress(catalog, id, stats) {
  const item = catalog[id];
  if (!item?.need) return { have: 1, need: 1 };
  return { have: Math.min(item.need.count, Number(stats?.[item.need.stat]) || 0), need: item.need.count };
}

// Erfolge: stat/count wie oben. Die Reihenfolge ist die Anzeige-Reihenfolge.
export const ACHIEVEMENTS = Object.freeze([
  { id: 'anpfiff', name: 'Anpfiff', desc: 'Spiele deine erste Partie', stat: 'played', count: 1 },
  { id: 'erstes_tor', name: 'Erstes Tor', desc: 'Schieße ein Tor', stat: 'goals', count: 1 },
  { id: 'torjaeger', name: 'Torjäger', desc: 'Schieße 25 Tore', stat: 'goals', count: 25 },
  { id: 'tormaschine', name: 'Tormaschine', desc: 'Schieße 100 Tore', stat: 'goals', count: 100 },
  { id: 'hattrick', name: 'Hattrick', desc: 'Drei Tore in einer Partie', stat: 'maxGoals', count: 3 },
  { id: 'bande', name: 'Bandenkünstler', desc: 'Triff über die Bande', stat: 'bankGoals', count: 1 },
  { id: 'blitzstart', name: 'Blitzstart', desc: 'Triff direkt mit dem Anstoß', stat: 'kickoffGoals', count: 1 },
  { id: 'weisse_weste', name: 'Weiße Weste', desc: 'Gewinne zu null (ab 2 Toren)', stat: 'cleanSheets', count: 1 },
  { id: 'pfostenpech', name: 'Pfostenpech', desc: 'Triff 10-mal den Pfosten', stat: 'posts', count: 10 },
  { id: 'lehrling', name: 'Lehrling', desc: 'Besiege den Computer auf Leicht', stat: 'winsEasy', count: 1 },
  { id: 'geselle', name: 'Geselle', desc: 'Besiege den Computer auf Mittel', stat: 'winsMedium', count: 1 },
  { id: 'meister', name: 'Meister', desc: 'Besiege den Computer auf Schwer', stat: 'winsHard', count: 1 },
  { id: 'profi', name: 'Profi-Bezwinger', desc: 'Besiege den Computer auf Profi', stat: 'winsProfi', count: 1 },
  { id: 'online', name: 'Auswärtssieg', desc: 'Gewinne ein Online-Spiel', stat: 'onlineWins', count: 1 },
  { id: 'serie', name: 'Seriensieger', desc: 'Gewinne 10 Partien', stat: 'wins', count: 10 },
  { id: 'taktiker', name: 'Taktiker', desc: 'Spiele jede Aufstellung einmal', stat: 'formationsPlayed', count: FORMATION_IDS.length },
  { id: 'weltenbummler', name: 'Weltenbummler', desc: 'Gewinne auf jedem Feld', stat: 'fieldsWon', count: FIELD_IDS.length },
  { id: 'chaot', name: 'Chaot', desc: 'Gewinne eine Chaos-Partie', stat: 'chaosWins', count: 1 },
  { id: 'kartenhai', name: 'Kartenhai', desc: 'Spiele 30 Karten aus', stat: 'cardsPlayed', count: 30 },
  { id: 'architekt', name: 'Architekt', desc: 'Gewinne mit einer eigenen Aufstellung', stat: 'customWins', count: 1 },
  { id: 'tour_start', name: 'Auf Tour', desc: 'Besiege deinen ersten Tour-Gegner', stat: 'tourWins', count: 1 },
  { id: 'tour_halb', name: 'Pokalsammler', desc: 'Besiege 10 Tour-Gegner', stat: 'tourWins', count: 10 },
  { id: 'tour_ganz', name: 'Tour-Sieger', desc: 'Besiege alle Tour-Gegner', stat: 'tourWins', count: TOUR_STAGES.length },
  { id: 'sterne', name: 'Sternenjäger', desc: 'Sammle 30 Sterne in der Tour', stat: 'tourStars', count: 30 },
  { id: 'perfekt', name: 'Makellos', desc: 'Hol in der Tour jeden Stern', stat: 'tourStars', count: TOUR_MAX_STARS },
  { id: 'trick_start', name: 'Kunstschütze', desc: 'Löse deinen ersten Trickschuss', stat: 'trickDone', count: 1 },
  { id: 'trick_halb', name: 'Trickkiste', desc: 'Löse 12 Trickschüsse', stat: 'trickDone', count: 12 },
  { id: 'trick_ganz', name: 'Zauberfuß', desc: 'Löse alle Trickschüsse', stat: 'trickDone', count: TRICK_COUNT },
  { id: 'trick_erster', name: 'Auf Anhieb', desc: 'Löse 10 Trickschüsse beim ersten Versuch', stat: 'trickFirstTry', count: 10 },
  { id: 'dauerbrenner', name: 'Dauerbrenner', desc: 'Spiele 50 Partien', stat: 'played', count: 50 },
]);

export function achievementDone(a, stats) {
  return (Number(stats?.[a.stat]) || 0) >= a.count;
}
