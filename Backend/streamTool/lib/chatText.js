// chatText.js — was der Chat-Bot für die Murmelbahn in den Twitch-Chat schreibt, auf Deutsch und Englisch.
//
// Sprache = die Sprache der Overlays (config.language, gesetzt im Editor der Twitch-Overlays): Chat und Overlay lesen
// dieselben Zuschauer. Die Befehle selbst (!murmel, !murmeltop) bleiben in jeder Sprache gleich — die Zuschauer haben
// sie gelernt, und ein Sprachwechsel soll sie nicht entwerten.

const TEXTS = {
  de: {
    open: (cmd) => `Die Murmelbahn ist offen — mit ${cmd} bist du dabei.`,
    cancelledTooFew: "Zu wenige Murmeln am Start — das Rennen fällt aus.",
    tooFew: "Für ein Rennen braucht es mindestens zwei Murmeln.",
    winner: (name, wins) => `${name} gewinnt das Murmelrennen!${wins > 1 ? ` Das ist Sieg Nr. ${wins}.` : ""}`,
    top: (entries) => `Murmel-Bestenliste: ${entries}`,
    topEmpty: "Noch hat niemand ein Murmelrennen gewonnen.",
    rewardTitle: "Murmelrennen starten",
  },
  en: {
    open: (cmd) => `The marble run is open — type ${cmd} to join.`,
    cancelledTooFew: "Not enough marbles at the start — the race is off.",
    tooFew: "A race needs at least two marbles.",
    winner: (name, wins) => `${name} wins the marble race!${wins > 1 ? ` That's win #${wins}.` : ""}`,
    top: (entries) => `Marble leaderboard: ${entries}`,
    topEmpty: "Nobody has won a marble race yet.",
    // gleich wie rewardDefaultTitle im Editor (Frontend/src/pages/StreamTool/editorI18n.js)
    rewardTitle: "Start marble race",
  },
};

/** Sprache des Kanals aus seiner Overlay-Konfiguration; alles Unbekannte ist Deutsch. */
function chatLang(row) {
  try {
    const lang = JSON.parse((row && row.config) || "{}").language;
    return lang === "en" ? "en" : "de";
  } catch {
    return "de";
  }
}

/** Die Chat-Texte für diesen Kanal. */
function chatText(row) {
  return TEXTS[chatLang(row)];
}

module.exports = { chatText, chatLang, CHAT_TEXTS: TEXTS };
