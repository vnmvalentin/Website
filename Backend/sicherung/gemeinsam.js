// sicherung/gemeinsam.js — Namen und Datumsregel, die Sicherung (sicherung.js), Zeitplan (plan.js) und Abholer
// (holen.js) teilen. Bewusst ohne SQLite-Abhängigkeit: der Statuswächter lädt nur plan.js und braucht better-sqlite3 nicht.

/** Ordner in data/, in dem die Sicherungen liegen */
const ORDNER = "sicherungen";
/** Letzter Versuch und letzte erfolgreiche Sicherung, liegt in ORDNER */
const STAND = "stand.json";
/** Inhaltsverzeichnis einer Sicherung (Dateien, Größen, Prüfsummen), liegt in jedem Sicherungsordner */
const MANIFEST = "manifest.json";
/** Ordnername einer Sicherung: Datum in Serverzeit, bei einem Fehlschlag neben einer guten Sicherung mit -fehler */
const ORDNER_NAME = /^(\d{4})-(\d{2})-(\d{2})(-fehler)?$/;

const zweistellig = (n) => String(n).padStart(2, "0");

/** Datum in Serverzeit als JJJJ-MM-TT (Name des Sicherungsordners) */
function datumVon(d) {
  return `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`;
}

module.exports = { ORDNER, STAND, MANIFEST, ORDNER_NAME, zweistellig, datumVon };
