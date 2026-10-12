// engine/skins.js — Scheiben-Designs und wie man sie freischaltet. Die Teamfarbe bleibt bei jedem Design die
// Grundfarbe, damit Rot und Blau immer unterscheidbar sind; das Design ändert nur Muster und Emblem (render.js).
//
// Freigeschaltet wird über Erfolge, die nur in diesem Browser gezählt werden (stats.js) — reine Kosmetik, der Server
// prüft nur, ob die ID existiert. Die Schlüssel sind gespeicherte IDs: nie umbenennen, nur neue hinzufügen.
//
// need: { stat, count, label } — freigeschaltet, sobald stats[stat] >= count. Ohne need: immer frei.

export const SKINS = Object.freeze({
  klassik: { name: 'Klassik' },
  streifen: { name: 'Streifen', need: { stat: 'played', count: 3, label: 'Spiele 3 Partien' } },
  stern: { name: 'Stern', need: { stat: 'winsEasy', count: 1, label: 'Besiege den Computer auf Leicht' } },
  ringe: { name: 'Ringe', need: { stat: 'goals', count: 10, label: 'Schieße 10 Tore' } },
  halb: { name: 'Halbzeit', need: { stat: 'winsMedium', count: 1, label: 'Besiege den Computer auf Mittel' } },
  blitz: { name: 'Blitz', need: { stat: 'cleanSheets', count: 1, label: 'Gewinne zu null (ab 2 Toren)' } },
  karo: { name: 'Karo', need: { stat: 'onlineWins', count: 1, label: 'Gewinne ein Online-Spiel' } },
  metall: { name: 'Metall', need: { stat: 'winsHard', count: 1, label: 'Besiege den Computer auf Schwer' } },
  krone: { name: 'Krone', need: { stat: 'wins', count: 10, label: 'Gewinne 10 Partien' } },
});

export const SKIN_IDS = Object.freeze(Object.keys(SKINS));
export const DEFAULT_SKIN = 'klassik';

export function isSkin(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SKINS, id);
}

export function isUnlocked(id, stats) {
  const s = SKINS[id];
  if (!s) return false;
  if (!s.need) return true;
  return (Number(stats?.[s.need.stat]) || 0) >= s.need.count;
}

/** Fortschritt für die Anzeige: { have, need } (have gedeckelt auf need). */
export function skinProgress(id, stats) {
  const s = SKINS[id];
  if (!s?.need) return { have: 1, need: 1 };
  return { have: Math.min(s.need.count, Number(stats?.[s.need.stat]) || 0), need: s.need.count };
}

export function unlockedSkins(stats) {
  return SKIN_IDS.filter((id) => isUnlocked(id, stats));
}
