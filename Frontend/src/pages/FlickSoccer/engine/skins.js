// engine/skins.js — Scheiben-Designs und wie man sie freischaltet. Zwei Sorten: Muster (die ersten neun — Teamfarbe mit
// Nummer, nur anders bemalt) und Motive (Münze, Puck, Auge … — die Scheibe sieht komplett anders aus). Bei jedem
// Design bleibt die Teamfarbe deutlich sichtbar, damit Rot und Blau immer unterscheidbar sind (discArt.js).
//
// Freigeschaltet wird über Erfolge, die nur in diesem Browser gezählt werden (stats.js) — reine Kosmetik, der Server
// prüft nur, ob die ID existiert. Die Schlüssel sind gespeicherte IDs: nie umbenennen, nur neue hinzufügen.
//
// need: { stat, count, label } — freigeschaltet, sobald stats[stat] >= count. Ohne need: immer frei.
// motif: true → Motiv-Scheibe (eigene Gruppe in der Auswahl).

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

  korken: { name: 'Kronkorken', motif: true },
  muenze: { name: 'Münze', motif: true, need: { stat: 'wins', count: 3, label: 'Gewinne 3 Partien' } },
  vinyl: { name: 'Schallplatte', motif: true, need: { stat: 'played', count: 10, label: 'Spiele 10 Partien' } },
  ziel: { name: 'Zielscheibe', motif: true, need: { stat: 'bankGoals', count: 3, label: 'Triff 3-mal über die Bande' } },
  puck: { name: 'Puck', motif: true, need: { stat: 'fieldsWon', count: 3, label: 'Gewinne auf 3 verschiedenen Feldern' } },
  jeton: { name: 'Jeton', motif: true, need: { stat: 'chaosWins', count: 1, label: 'Gewinne eine Chaos-Partie' } },
  grinser: { name: 'Grinser', motif: true, need: { stat: 'goals', count: 40, label: 'Schieße 40 Tore' } },
  keks: { name: 'Keks', motif: true, need: { stat: 'played', count: 25, label: 'Spiele 25 Partien' } },
  zahnrad: { name: 'Zahnrad', motif: true, need: { stat: 'tourStars', count: 6, label: 'Sammle 6 Sterne in der Tour' } },
  auge: { name: 'Auge', motif: true, need: { stat: 'tourStars', count: 15, label: 'Sammle 15 Sterne in der Tour' } },
  kompass: { name: 'Kompass', motif: true, need: { stat: 'customWins', count: 1, label: 'Gewinne mit einer eigenen Aufstellung' } },
  donut: { name: 'Donut', motif: true, need: { stat: 'chaosWins', count: 5, label: 'Gewinne 5 Chaos-Partien' } },
  planet: { name: 'Planet', motif: true, need: { stat: 'fieldsWon', count: 8, label: 'Gewinne auf 8 verschiedenen Feldern' } },
  wappen: { name: 'Wappen', motif: true, need: { stat: 'tourStars', count: 30, label: 'Sammle 30 Sterne in der Tour' } },
  schaedel: { name: 'Schädel', motif: true, need: { stat: 'winsProfi', count: 1, label: 'Besiege den Computer auf Profi' } },
  kristall: { name: 'Kristall', motif: true, need: { stat: 'tourStars', count: 50, label: 'Sammle 50 Sterne in der Tour' } },
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
