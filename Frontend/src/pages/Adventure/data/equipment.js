// data/equipment.js — Ausrüstung: ein einzelner Slot (Taste Q), mit Abklingzeit. Das sind die früheren Powerups, die man
// jetzt im Lauf in Ausrüstungstruhen findet statt sie zu kaufen. Eine neue Ausrüstung ersetzt die alte, die
// alte bleibt am Boden liegen. Die Wirkung steht in engine/abilities.js (useEquipment), das Symbol in ui/pixelIcons.js.

export const EQUIPMENT = {
  heiltrank: { name: "Heiltrank", cd: 45, desc: "Heilt 50 % deines Lebens." },
  schutzschild: { name: "Schutzschild", cd: 40, desc: "3 s unverwundbar." },
  wirbelwind: { name: "Wirbelwind", cd: 35, desc: "3 s Klingenwirbel um dich (12 × 200 %)." },
  koeder: { name: "Köder", cd: 40, desc: "Stellt einen Köder auf, der 6 s alle Gegner anzieht." },
  granatgurt: { name: "Granatgurt", cd: 30, desc: "Fünf Granaten rund um den Zeiger (je 400 %)." },
  hyperfeuer: { name: "Hyperfeuer", cd: 40, desc: "6 s doppeltes Angriffstempo." },
  speedboots: { name: "Speedboots", cd: 30, desc: "6 s doppeltes Lauftempo." },
  blitzschlag: { name: "Blitzschlag", cd: 25, desc: "Blitz am Zeiger: 1000 % Flächenschaden." },
};

export const EQUIPMENT_IDS = Object.keys(EQUIPMENT);
