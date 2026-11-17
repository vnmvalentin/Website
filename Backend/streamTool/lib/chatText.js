// chatText.js — was der Chat-Bot für Murmelbahn und Subathon-Timer in den Twitch-Chat schreibt, auf Deutsch und Englisch.
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
    // Subathon-Timer (!subathon). time = "3:05:09", delta = "+5:00"
    subathon: {
      running: (time) => `Subathon: noch ${time} auf der Uhr.`,
      paused: (time) => `Der Subathon ist pausiert — noch ${time} übrig.`,
      ended: (time) => `Der Subathon ist vorbei — er lief ${time}.`,
      idle: "Der Subathon hat noch nicht begonnen.",
      added: (delta, time) => `${delta} — jetzt ${time} auf der Uhr.`,
      capped: (time) => `Die Obergrenze ist erreicht — ${time} auf der Uhr.`,
      started: (time) => `Der Subathon läuft — ${time} auf der Uhr.`,
      pausedNow: (time) => `Subathon angehalten bei ${time}.`,
      happyOn: (factor, minutes) => `Happy Hour! ${minutes} Minuten lang zählen Abos, Bits und Spenden ×${factor}.`,
      happyOff: "Die Happy Hour ist vorbei.",
    },
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
    subathon: {
      running: (time) => `Subathon: ${time} left on the clock.`,
      paused: (time) => `The subathon is paused — ${time} left.`,
      ended: (time) => `The subathon is over — it ran for ${time}.`,
      idle: "The subathon hasn't started yet.",
      added: (delta, time) => `${delta} — now ${time} on the clock.`,
      capped: (time) => `The cap is reached — ${time} on the clock.`,
      started: (time) => `The subathon is on — ${time} on the clock.`,
      pausedNow: (time) => `Subathon paused at ${time}.`,
      happyOn: (factor, minutes) => `Happy hour! For ${minutes} minutes, subs, bits and donations count ×${factor}.`,
      happyOff: "The happy hour is over.",
    },
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
