// Beschriftungen der Rundeneinstellungen — an einer Stelle, weil Startseite, Lobby und
// Ergebnis-Tabelle sie gemeinsam benutzen.
export const LENGTH_LABELS = {
  short: "Kurz (~1 min)",
  medium: "Mittel (~3 min)",
  long: "Lang (~5–8 min)",
};

// Eine Runde einer Serie (Phase 4): 'random' wie bisher, 'daily' das Tages-Level, 'custom' ein veröffentlichtes
// Level per Share-Code. Nur zur Anzeige — die Regeln stehen im Backend (roomManager.js).
export const ROUND_KIND_LABELS = {
  random: "Zufällig",
  daily: "Tages-Level",
  custom: "Eigenes Level",
};

// Spielmodus eines Raums (27.09.2026, Backend roomManager.js: settings.mode). Gilt für alle Runden einer Serie.
export const MODE_LABELS = {
  race: "Rennen",
  timeattack: "Zeitjagd · 10 Min",
};

export const MODE_HINTS = {
  race: "Wer zuerst im Ziel ist, gewinnt. Nach dem ersten Zieleinlauf bleiben den anderen 60 Sekunden.",
  timeattack: "Zehn Minuten für dasselbe Level, so viele Versuche du willst — die beste Zeit gewinnt. Enter startet einen neuen Versuch.",
};

// Hardcore (30.09.2026, Backend roomManager.js: settings.hardcore) — nur im Modus „Rennen“
export const HARDCORE_HINT = "Ein Tod und du bist raus: Wer in einer Runde einmal stirbt, ist sofort DNF. Zurück zum Checkpoint springen ist gesperrt.";
