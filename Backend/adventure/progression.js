// adventure/progression.js — Account-Fortschritt von adVentures: XP aus Läufen, Stufen, und was ab welcher Stufe frei
// wird (Kits, zusätzliche Items im Kistenpool, Schwierigkeit, Startgeschenke). Einzige Quelle: das Frontend bekommt
// die Tabelle über /api/adventure/profile und rechnet nichts davon selbst.

const KIT_IDS = ["default", "knight", "ninja", "wizard", "bestmod", "cyber", "gh0stqq"];

const UNLOCK_TRACK = [
  { level: 1, kind: "kit", id: "default", label: "Kit: Abenteurer" },
  { level: 2, kind: "kit", id: "knight", label: "Kit: Ritter" },
  { level: 3, kind: "items", ids: ["orbitalklinge", "raketenwerfer"], label: "Items: Orbitalklinge, Raketenwerfer" },
  { level: 4, kind: "kit", id: "ninja", label: "Kit: Ninja" },
  { level: 5, kind: "difficulty", id: "hard", label: "Schwierigkeit: Albtraum" },
  { level: 5, kind: "items", ids: ["blitzschlag"], label: "Ausrüstung: Blitzschlag" },
  { level: 6, kind: "kit", id: "wizard", label: "Kit: Magier" },
  { level: 7, kind: "items", ids: ["gewitterkrone", "sternenkanone"], label: "Items: Gewitterkrone, Sternenkanone" },
  { level: 8, kind: "items", ids: ["granatgurt", "seelenernte"], label: "Granatgurt und Seelenernte" },
  { level: 9, kind: "kit", id: "bestmod", label: "Kit: Giftmischer" },
  { level: 10, kind: "perk", id: "startItems", value: 1, label: "Startgeschenk: 1 Item zu Beginn jedes Laufs" },
  { level: 11, kind: "items", ids: ["phoenixfeder"], label: "Item: Phönixfeder" },
  { level: 12, kind: "kit", id: "cyber", label: "Kit: Cyber-Söldner" },
  { level: 13, kind: "items", ids: ["meteorsplitter", "zeitkristall"], label: "Items: Meteorsplitter, Zeitkristall" },
  { level: 15, kind: "kit", id: "gh0stqq", label: "Kit: Baumeister" },
  { level: 17, kind: "perk", id: "startItems", value: 2, label: "Startgeschenk: 2 Items zu Beginn" },
  { level: 20, kind: "title", id: "legende", label: "Titel: Legende" },
];

const DIFFICULTY_XP = { easy: 0.8, normal: 1, hard: 1.4 };

// XP, um von Stufe L auf L+1 zu kommen
const xpForLevel = (L) => Math.round(200 + 120 * Math.pow(L - 1, 1.35));

function levelInfo(totalXp) {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp || 0));
  while (rest >= xpForLevel(level) && level < 99) { rest -= xpForLevel(level); level++; }
  return { level, into: rest, need: xpForLevel(level) };
}

function runXp({ kills, stagesCleared, bossesKilled, timeSec, won, difficulty }) {
  const base = kills + stagesCleared * 80 + bossesKilled * 100 + Math.floor(timeSec / 60) * 12 + (won ? 400 : 0);
  return Math.round(base * (DIFFICULTY_XP[difficulty] ?? 1));
}

// Punkte für die Bestenliste. Rechnet nur mit den Werten, die der Server schon gegen die echte Laufzeit geprüft hat.
// Welten und Bosse zählen am meisten (Fortschritt), Kills geben den Feinschliff, Albtraum zählt anderthalbfach,
// jede Albtraum+-Stufe noch einmal +25 %.
const DIFFICULTY_SCORE = { easy: 0.6, normal: 1, hard: 1.5 };

function runScore({ kills = 0, stagesCleared = 0, bossesKilled, timeSec = 0, won = false, difficulty, ascension = 0 }) {
  const bosses = bossesKilled ?? stagesCleared; // alte Bestwerte ohne Bosszahl: jede Welt hatte einen Boss
  const base = kills * 2 + stagesCleared * 500 + bosses * 400 + Math.floor(timeSec / 60) * 25 + (won ? 3000 : 0);
  return Math.round(base * (DIFFICULTY_SCORE[difficulty] ?? 1) * (1 + 0.25 * (ascension || 0)));
}

// Was ein Account mit dieser Stufe (und diesen alten Skin-Käufen) freigeschaltet hat
function unlocksFor(level, ownedSkins = []) {
  const reached = UNLOCK_TRACK.filter((u) => u.level <= level);
  const kits = new Set(reached.filter((u) => u.kind === "kit").map((u) => u.id));
  for (const s of ownedSkins) if (KIT_IDS.includes(s)) kits.add(s);
  const lockedItems = UNLOCK_TRACK.filter((u) => u.kind === "items" && u.level > level).flatMap((u) => u.ids);
  const difficulties = ["easy", "normal", ...reached.filter((u) => u.kind === "difficulty").map((u) => u.id)];
  const startItems = reached.filter((u) => u.kind === "perk" && u.id === "startItems").reduce((m, u) => Math.max(m, u.value), 0);
  const title = reached.some((u) => u.kind === "title") ? "Legende" : null;
  return { kits: KIT_IDS.filter((k) => kits.has(k)), lockedItems, difficulties, startItems, title };
}

module.exports = { KIT_IDS, UNLOCK_TRACK, DIFFICULTY_XP, xpForLevel, levelInfo, runXp, runScore, unlocksFor };
