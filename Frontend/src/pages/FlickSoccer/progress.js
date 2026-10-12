// progress.js — alles zum Freischalten außer den Scheiben-Designs (die liegen in engine/skins.js, weil der Server
// ihre IDs prüft): Ball-Designs, Rasenmuster, Torjubel und die Erfolge. Rein kosmetisch und nur im eigenen Browser —
// jeder sieht seinen eigenen Ball, Rasen und Jubel, online wie offline.
//
// need: { stat, count, label } — frei, sobald stats[stat] >= count (stats = loadStats() aus stats.js, inklusive der
// abgeleiteten Zähler wie achievements, formationsPlayed, fieldsWon). Schlüssel sind gespeicherte IDs: nie umbenennen.

import { FIELD_IDS, FORMATION_IDS } from './engine/index.js';

export const BALLS = Object.freeze({
  klassik: { name: 'Klassik' },
  strand: { name: 'Strandball', need: { stat: 'goals', count: 5, label: 'Schieße 5 Tore' } },
  neon: { name: 'Neon', need: { stat: 'wins', count: 5, label: 'Gewinne 5 Partien' } },
  stern: { name: 'Sternball', need: { stat: 'goals', count: 25, label: 'Schieße 25 Tore' } },
  acht: { name: 'Achter', need: { stat: 'cleanSheets', count: 3, label: 'Gewinne 3-mal zu null' } },
  gold: { name: 'Goldball', need: { stat: 'achievements', count: 10, label: 'Schalte 10 Erfolge frei' } },
});

export const TURFS = Object.freeze({
  streifen: { name: 'Streifen' },
  karo: { name: 'Karo', need: { stat: 'played', count: 5, label: 'Spiele 5 Partien' } },
  kreise: { name: 'Kreise', need: { stat: 'played', count: 15, label: 'Spiele 15 Partien' } },
  nacht: { name: 'Nachtspiel', need: { stat: 'onlineWins', count: 3, label: 'Gewinne 3 Online-Spiele' } },
  sand: { name: 'Strand', need: { stat: 'wins', count: 15, label: 'Gewinne 15 Partien' } },
});

export const CELEBRATIONS = Object.freeze({
  konfetti: { name: 'Konfetti' },
  welle: { name: 'Druckwelle', need: { stat: 'bankGoals', count: 1, label: 'Triff einmal über die Bande' } },
  feuerwerk: { name: 'Feuerwerk', need: { stat: 'goals', count: 15, label: 'Schieße 15 Tore' } },
  sterne: { name: 'Sternenregen', need: { stat: 'maxGoals', count: 3, label: 'Schieße 3 Tore in einer Partie' } },
});

export const DEFAULT_LOOK = Object.freeze({ ball: 'klassik', turf: 'streifen', celebration: 'konfetti' });

export const CATALOGS = Object.freeze({ ball: BALLS, turf: TURFS, celebration: CELEBRATIONS });
export const CATALOG_LABEL = Object.freeze({ skin: 'Scheibe', ball: 'Ball', turf: 'Rasen', celebration: 'Torjubel', achievement: 'Erfolg' });

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
  { id: 'online', name: 'Auswärtssieg', desc: 'Gewinne ein Online-Spiel', stat: 'onlineWins', count: 1 },
  { id: 'serie', name: 'Seriensieger', desc: 'Gewinne 10 Partien', stat: 'wins', count: 10 },
  { id: 'taktiker', name: 'Taktiker', desc: 'Spiele jede Aufstellung einmal', stat: 'formationsPlayed', count: FORMATION_IDS.length },
  { id: 'weltenbummler', name: 'Weltenbummler', desc: 'Gewinne auf jedem Feld', stat: 'fieldsWon', count: FIELD_IDS.length },
  { id: 'chaot', name: 'Chaot', desc: 'Gewinne eine Chaos-Partie', stat: 'chaosWins', count: 1 },
  { id: 'dauerbrenner', name: 'Dauerbrenner', desc: 'Spiele 50 Partien', stat: 'played', count: 50 },
]);

export function achievementDone(a, stats) {
  return (Number(stats?.[a.stat]) || 0) >= a.count;
}
