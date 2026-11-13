// tour.js — die Tour: 20 Gegner in vier Pokalen, jeder mit eigenem Feld, eigener Scheibe und Spielweise. Ein Spiel
// gegen den Computer mit festen Regeln; für einen Sieg gibt es bis zu drei Sterne (starsFor). Der nächste Gegner wird
// frei, sobald der davor einmal besiegt ist. Fortschritt nur in diesem Browser (stats.js → tour).
//
// Der letzte Gegner jedes Pokals ist ein Endgegner mit Sonderregel: special = [Name, Erklärung], dazu je nach Regel
// handicap (Tore Vorsprung), rule (engine MATCH_RULES) oder turn (Zugzeit in Sekunden für den Spieler).
//
// Die IDs der Gegner sind gespeichert: nie umbenennen, nur neue anhängen.

export const TOUR_CUPS = Object.freeze([
  {
    id: 'kreis',
    name: 'Kreisliga',
    stages: [
      { id: 't01', name: 'Rasenmäher-Rudi', line: 'Mäht lieber, als zu schießen', level: 'easy', field: 'standard', goals: 2, formation: '2-2', skin: 'klassik' },
      { id: 't02', name: 'Hallen-Hanna', line: 'Kennt jede Diele in der Halle', level: 'easy', field: 'halle', goals: 2, formation: '3-1', skin: 'streifen' },
      { id: 't03', name: 'Pfosten-Paule', line: 'Trifft alles — nur nicht das Tor', level: 'easy', field: 'pfosten', goals: 3, formation: '1-2-1', skin: 'ringe' },
      { id: 't04', name: 'Sandra Sandsturm', line: 'Im tiefen Sand zu Hause', level: 'medium', field: 'strand', goals: 2, formation: 'zange', skin: 'keks' },
      { id: 't05', name: 'Käfig-Kalle', line: 'Chef vom Bolzplatz', level: 'medium', field: 'kaefig', goals: 3, formation: '2-1-1', skin: 'korken', boss: true, handicap: 1, special: ['Vorsprung', 'Kalle beginnt mit 1:0'] },
    ],
  },
  {
    id: 'stadt',
    name: 'Stadtpokal',
    stages: [
      { id: 't06', name: 'Frostbeule Finn', line: 'Rutscht schneller, als er denkt', level: 'medium', field: 'eisbahn', goals: 3, formation: 'V', skin: 'puck' },
      { id: 't07', name: 'Bauer Brömmel', line: 'Seine Tore sind so breit wie seine Scheune', level: 'medium', field: 'scheune', goals: 3, formation: '4-0', skin: 'muenze' },
      { id: 't08', name: 'Ritter Rost', line: 'Verschanzt sich hinter der Mauer', level: 'medium', field: 'burghof', goals: 3, formation: '3-1', skin: 'wappen' },
      { id: 't09', name: 'Flipper-Frieda', line: 'Lässt die Bumper für sich arbeiten', level: 'medium', field: 'flipper', goals: 3, formation: '1-3', skin: 'jeton' },
      { id: 't10', name: 'Der Joker', line: 'Spielt mit gezinkten Karten', level: 'hard', field: 'standard', goals: 3, chaos: true, formation: '2-2', skin: 'grinser', boss: true, rule: 'dauerchaos', special: ['Dauerchaos', 'Jeder Zug hat ein Ereignis — keine Pause'] },
    ],
  },
  {
    id: 'land',
    name: 'Landesliga',
    stages: [
      { id: 't11', name: 'Kurven-Carla', line: 'Spielt jede Bande im Bogen', level: 'hard', field: 'arena', goals: 3, formation: 'schraege', skin: 'vinyl' },
      { id: 't12', name: 'Professor Portal', line: 'Ist immer schon woanders', level: 'hard', field: 'wurmloch', goals: 3, formation: 'reverse-v', skin: 'planet' },
      { id: 't13', name: 'Eiskalte Edda', line: 'Karten auf Eis — nichts für schwache Nerven', level: 'hard', field: 'eisbahn', goals: 3, chaos: true, formation: '1-2-1', skin: 'kristall' },
      { id: 't14', name: 'Beton-Bernd', line: 'An ihm kommt keiner vorbei', level: 'hard', field: 'kaefig', goals: 5, formation: '4-0', skin: 'metall' },
      { id: 't15', name: 'Die Tilt-Maschine', line: 'Flipper, Karten, Chaos', level: 'hard', field: 'flipper', goals: 3, chaos: true, formation: '1-3', skin: 'zahnrad', boss: true, rule: 'schwer', special: ['Schwergewichte', 'Ihre Scheiben sind fast doppelt so schwer'] },
    ],
  },
  {
    id: 'meister',
    name: 'Meisterklasse',
    stages: [
      { id: 't16', name: 'Zielwasser-Zoe', line: 'Verzieht nie', level: 'profi', field: 'halle', goals: 3, formation: '2-1-1', skin: 'ziel' },
      { id: 't17', name: 'Der Navigator', line: 'Findet jeden Winkel', level: 'profi', field: 'arena', goals: 3, formation: 'V', skin: 'kompass' },
      { id: 't18', name: 'Das Auge', line: 'Sieht jeden Zug kommen', level: 'profi', field: 'wurmloch', goals: 3, chaos: true, formation: 'zange', skin: 'auge' },
      { id: 't19', name: 'Knochen-Knut', line: 'Hat noch nie einen Burghof verloren', level: 'profi', field: 'burghof', goals: 3, formation: '3-1', skin: 'schaedel' },
      { id: 't20', name: 'Der Meister', line: 'Das Finale: fünf Tore, keine Geschenke', level: 'profi', field: 'standard', goals: 5, formation: '2-2', skin: 'krone', boss: true, rule: 'tempo', turn: 10, special: ['Meisterschuss', 'Er schießt härter, und du hast nur 10 Sekunden pro Zug'] },
    ],
  },
]);

export const TOUR_STAGES = Object.freeze(
  TOUR_CUPS.flatMap((cup) => cup.stages.map((s) => ({ ...s, cup: cup.id, cupName: cup.name }))).map((s, index) => Object.freeze({ ...s, index })),
);
export const TOUR_MAX_STARS = TOUR_STAGES.length * 3;

export function tourStage(id) {
  return TOUR_STAGES.find((s) => s.id === id) || null;
}

/** Sterne für einen Sieg: 3 ohne Gegentor, 2 mit einem, sonst 1. Niederlage: 0. */
export function starsFor(won, conceded) {
  if (!won) return 0;
  if (conceded === 0) return 3;
  return conceded === 1 ? 2 : 1;
}

/** Ist der Gegner spielbar? Der erste immer, jeder weitere nach einem Sieg über den davor. tour: { id: Sterne } */
export function stageOpen(stage, tour) {
  if (!stage) return false;
  if (stage.index === 0) return true;
  return (Number(tour?.[TOUR_STAGES[stage.index - 1].id]) || 0) > 0;
}

/** Regeln einer Tour-Partie (für createMatch / normalizeSettings). */
export function stageSettings(stage) {
  return { goalsToWin: stage.goals, turnSeconds: stage.turn || 0, replay: false, field: stage.field, chaos: !!stage.chaos };
}

/** Start-Angaben einer Tour-Partie für FlickLocal (location.state). formation: eigene Aufstellung. */
export function tourConfig(stage, formation) {
  return {
    mode: 'ai', level: stage.level, settings: stageSettings(stage), formations: [formation, stage.formation], tour: stage.id,
    rule: stage.rule || null, handicap: stage.handicap || 0,
  };
}
