// Beschriftungen der Rundeneinstellungen — an einer Stelle, weil Startseite, Lobby und
// Ergebnis-Tabelle sie gemeinsam benutzen.
export const LENGTH_LABELS = {
  short: "Kurz (~1 min)",
  medium: "Mittel (~3 min)",
  long: "Lang (~5–8 min)",
};

export const SEED_MODE_LABELS = {
  random: "Zufall",
  daily: "Tages-Seed",
  custom: "Eigener Seed",
};

export const SEED_MODE_HINTS = {
  random: "Bei jedem Start ein neues Level.",
  daily: "Alle bekommen heute dasselbe Level wie im Tagesrennen — Biom und Seed stehen dafür fest.",
  custom: "Derselbe Seed ergibt bei allen exakt dasselbe Level — auch an einem anderen Tag.",
};

// Eine Runde einer Serie (Phase 4): 'random' wie bisher, 'daily' das Tages-Level, 'custom' ein veröffentlichtes
// Level per Share-Code. Nur zur Anzeige — die Regeln stehen im Backend (roomManager.js).
export const ROUND_KIND_LABELS = {
  random: "Zufällig",
  daily: "Tages-Level",
  custom: "Eigenes Level",
};
