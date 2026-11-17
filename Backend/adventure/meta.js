// adventure/meta.js — alles, was über einen einzelnen Lauf hinaus motiviert: Erfolge (schalten Farbvarianten der Kits
// frei), Albtraum+ (Aufstiegsstufen nach einem Sieg auf Albtraum), Tageslauf (gleicher Seed für alle) und die Kalender-
// Schlüssel für Tages-/Wochenbestenlisten. Einzige Quelle — das Frontend bekommt die Definitionen über /profile.

const crypto = require("crypto");
const { KIT_IDS } = require("./progression");

// Farbvarianten. Die Färbung selbst steht im Frontend (data/skins.js); hier nur, welche es gibt.
const SKIN_IDS = ["schatten", "frost", "gold"];

// Kill-Erfolge: vor dem Horde-Umbau 1000 (ein Lauf hatte ~2.000 Kills), seitdem 5.000 (ein Lauf hat ~14.000). Die ids
// bleiben, wer den Erfolg schon hat, behält ihn.
const HORDE_KILLS = 5000;

// test(r, x): r = vom Server geprüftes Ergebnis, x = vom Client gemeldete Zusatzwerte (gedeckelt, nur für Kosmetik)
const GENERAL = [
  { id: "ersterBoss", name: "Erster Boss", desc: "Besiege einen Boss.", test: (r) => r.bossesKilled >= 1 },
  { id: "dreiWelten", name: "Weit gereist", desc: "Schaffe 3 Welten in einem Lauf.", test: (r) => r.stagesCleared >= 3 },
  { id: "sieg", name: "Drachentöter", desc: "Besiege Thunderwing.", test: (r) => r.won },
  { id: "siegAlbtraum", name: "Albtraumbezwinger", desc: "Gewinne auf Albtraum.", test: (r) => r.won && r.difficulty === "hard" },
  { id: "schnell", name: "Eilbote", desc: "Gewinne in unter 20 Minuten.", test: (r) => r.won && r.timeSec < 1200 },
  { id: "kills1000", name: "Horde gebrochen", desc: "5.000 Kills in einem Lauf.", test: (r) => r.kills >= HORDE_KILLS },
  { id: "evolution", name: "Verwandlung", desc: "Entwickle eine Waffe weiter.", test: (r, x) => x.evolutions >= 1 },
  { id: "evolution3", name: "Arsenal", desc: "3 Evolutionen in einem Lauf.", test: (r, x) => x.evolutions >= 3 },
  { id: "champions5", name: "Championjäger", desc: "Besiege 5 Champions in einem Lauf.", test: (r, x) => x.champions >= 5 },
  { id: "zyklus2", name: "Noch einmal", desc: "Erreiche Zyklus 2.", test: (r, x) => x.loop >= 1 },
  { id: "tageslauf", name: "Tagwerk", desc: "Schaffe im Tageslauf mindestens eine Welt.", test: (r) => r.mode === "daily" && r.stagesCleared >= 1 },
  { id: "sparsam", name: "Asket", desc: "Schaffe 3 Welten mit höchstens 10 Items.", test: (r, x) => r.stagesCleared >= 3 && x.itemCount <= 10 },
  { id: "aufstieg", name: "Über den Albtraum hinaus", desc: "Gewinne auf Albtraum+ 1.", test: (r) => r.won && r.ascension >= 1 },
  { id: "aufstieg5", name: "Unmöglich, wirklich", desc: "Gewinne auf Albtraum+ 5.", test: (r) => r.won && r.ascension >= 5 },
  // Seit dem Horde-Umbau (November 2026). Schwellen am Test-Bot gemessen: ein Sieg hat 16.000–23.000 Kills, die beste
  // Serie liegt dann bei 3.500–8.000, pro Lauf fallen 2–6 Kolosse; 30.000 Kills und der erste Segen brauchen Zyklus 2.
  // Seit 16.11.2026 reißt die Serie nach 1,0 s statt 2,5 s: beste Serie je Lauf ~600–4.700, deshalb „Unaufhaltsam“ bei
  // 2.500 statt 5.000. Die id bleibt serie5000 (gespeichert bei allen, die ihn schon haben).
  { id: "serie1000", name: "Im Rausch", desc: "Halte eine Kill-Serie von 1.000.", test: (r, x) => x.bestStreak >= 1000 },
  { id: "serie5000", name: "Unaufhaltsam", desc: "Halte eine Kill-Serie von 2.500.", test: (r, x) => x.bestStreak >= 2500 },
  { id: "kills15000", name: "Schnitter", desc: "15.000 Kills in einem Lauf.", test: (r) => r.kills >= 15000 },
  { id: "kills30000", name: "Weltenbrand", desc: "30.000 Kills in einem Lauf.", test: (r) => r.kills >= 30000 },
  { id: "kolosse5", name: "Riesentöter", desc: "Fälle 5 Kolosse in einem Lauf.", test: (r, x) => x.giants >= 5 },
  { id: "sechsWaffen", name: "Wandelndes Arsenal", desc: "Trage sechs Waffen gleichzeitig.", test: (r, x) => (x.weapons || []).length >= 6 },
  { id: "segen", name: "Gesegnet", desc: "Baue alles aus und wähle einen Segen.", test: (r, x) => x.boons >= 1 },
  // Tiefe (November 2026, „av-meta“): nach dem Sieg weiterreisen. Sechs Welten je Zyklus — gezählt an den vom Server
  // geprüften geschafften Welten (Tiefe = geschaffte Welten + 1). Am Test-Bot: Sieger enden meist in Zyklus 2–3.
  { id: "zyklus3", name: "Dritter Zyklus", desc: "Erreiche Zyklus 3.", test: (r) => r.stagesCleared >= 12 },
  { id: "tiefe15", name: "Tiefer als tief", desc: "Erreiche Tiefe 15.", test: (r) => r.stagesCleared >= 14 },
  { id: "zyklus4", name: "Vierter Zyklus", desc: "Erreiche Zyklus 4.", test: (r) => r.stagesCleared >= 18 },
  { id: "tiefe20", name: "Bodenlos", desc: "Erreiche Tiefe 20.", test: (r) => r.stagesCleared >= 19 },
];

// Pro Kit drei Erfolge, jeder schaltet eine Farbvariante dieses Kits frei
const PER_KIT = [
  { skin: "schatten", name: "Schattenhaut", desc: "Schaffe 3 Welten mit diesem Kit.", test: (r) => r.stagesCleared >= 3 },
  { skin: "frost", name: "Frostgeboren", desc: "5.000 Kills in einem Lauf mit diesem Kit.", test: (r) => r.kills >= HORDE_KILLS },
  { skin: "gold", name: "Goldener Held", desc: "Gewinne mit diesem Kit.", test: (r) => r.won },
];

const ACHIEVEMENTS = [
  ...GENERAL,
  ...KIT_IDS.flatMap((kit) => PER_KIT.map((a) => ({
    id: `${a.skin}_${kit}`, kit, skin: a.skin, name: a.name, desc: a.desc, test: (r, x) => r.kitId === kit && a.test(r, x),
  }))),
];

// Für /profile: ohne Testfunktionen
const ACHIEVEMENT_DEFS = ACHIEVEMENTS.map(({ test: _t, ...rest }) => rest);

function newAchievements(owned, result, extra) {
  const have = new Set(owned || []);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.test(result, extra));
}

const skinUnlocked = (achievements, kitId, skin) => !skin || (SKIN_IDS.includes(skin) && (achievements || []).includes(`${skin}_${kitId}`));

// Albtraum+: Stufe n gilt zusammen mit allen darunter, nur auf Albtraum. Die Wirkung steht im Frontend (engine/ascension.js).
const ASCENSIONS = [
  { level: 1, label: "Gegner haben 20 % mehr Leben" },
  { level: 2, label: "Kisten und Schreine kosten 25 % mehr" },
  { level: 3, label: "Elite doppelt so häufig, Champions öfter" },
  { level: 4, label: "Nur halbe Regeneration" },
  { level: 5, label: "Bosse mit 30 % mehr Leben, Raserei schon ab 65 %" },
];
const MAX_ASCENSION = ASCENSIONS.length;

// Kalender in deutscher Zeit: Tageslauf wechselt um Mitternacht in Berlin, die Woche beginnt am Montag
function dayKey(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function weekKey(now = new Date()) {
  const [y, m, d] = dayKey(now).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7; // Montag = 0
  date.setUTCDate(date.getUTCDate() - dow + 3); // Donnerstag derselben Woche bestimmt das ISO-Jahr
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((date - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// Gleicher Seed für alle an einem Tag
function dailySeed(day) {
  const h = crypto.createHash("sha256").update(`adventures-daily-${day}`).digest();
  return (h.readUInt32BE(0) % (2 ** 31 - 2)) + 1;
}

module.exports = {
  SKIN_IDS, ACHIEVEMENTS, ACHIEVEMENT_DEFS, newAchievements, skinUnlocked,
  ASCENSIONS, MAX_ASCENSION, dayKey, weekKey, dailySeed,
};
