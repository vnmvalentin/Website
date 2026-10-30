// statusWatch/statusEmbed.js — Zustand → Discord-Nachricht für #status.
// Alles öffentlich lesbar: deshalb nur grobe Gründe, keine Fehlermeldungen.
// <t:…:R> rendert Discord selbst als "vor X Minuten" und zählt live hoch — bleibt die Nachricht
// stehen, weil dieser Dienst hängt, sieht man das an einem alten "Zuletzt geprüft".

const DOT = { green: "🟢", yellow: "🟡", red: "🔴" };
const COLOR = { green: 0x57f287, yellow: 0xfee75c, red: 0xed4245 };

const LABELS = { website: "Website", server: "Server", bot: "Discord-Bot" };

// Je Teil und Stufe: Kurzwort + optionaler öffentlicher Grund
const TEXTS = {
  website: {
    up: ["Online"],
    slow: ["Langsam", "Seiten laden gerade verzögert"],
    down: ["Ausfall", "Website gerade nicht erreichbar"],
  },
  server: {
    up: ["Online"],
    maintenance: ["Wartung", "Update wird eingespielt, gleich wieder da"],
    down: ["Ausfall", "Spiele, Login und Overlays gerade nicht verfügbar"],
  },
  bot: {
    up: ["Online"],
    connecting: ["Verbindet", "kurz nach einem Neustart"],
    maintenance: ["Wartung", "startet nach dem Update neu"],
    down: ["Offline", "Befehle gerade nicht verfügbar"],
  },
};

const HEADLINE = {
  up: "Alle Systeme laufen",
  degraded: "Eingeschränkt",
  maintenance: "Wartung",
  down: "Störung",
};

function tone(level) {
  if (level === "up") return "green";
  if (level === "down") return "red";
  return "yellow";
}

const unix = (ms) => Math.floor(ms / 1000);

function formatDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "unter 1 Min.";
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (h < 24) return rest ? `${h} Std. ${rest} Min.` : `${h} Std.`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 Tag" : `${d} Tage`;
}

function componentLine(key, level) {
  const [word, reason] = TEXTS[key][level] || TEXTS[key].down;
  return `${DOT[tone(level)]} **${LABELS[key]}** — ${word}${reason ? ` · ${reason}` : ""}`;
}

function incidentLine(inc) {
  const parts = inc.components.map((c) => LABELS[c] || c).join(", ");
  const kind = inc.worst === "down" ? "Ausfall" : inc.maintenance ? "Wartung" : "Eingeschränkt";
  return `Letzte Störung: <t:${unix(inc.start)}:f> · ${formatDuration(inc.end - inc.start)} · ${kind} (${parts})`;
}

/**
 * @param {object} state aus statusLogic.nextState
 * @param {number} now   ms
 * @returns Webhook-Nutzlast (POST/PATCH)
 */
function buildStatusPayload(state, now) {
  const overallTone = state.overall === "down" ? "red" : state.overall === "up" ? "green" : "yellow";
  const lines = [
    `**${HEADLINE[state.overall] || HEADLINE.down}** · seit <t:${unix(state.since ?? now)}:R>`,
    "",
    componentLine("website", state.components.website.shown),
    componentLine("server", state.components.server.shown),
    componentLine("bot", state.components.bot.shown),
    "",
  ];
  if (state.lastIncident) lines.push(incidentLine(state.lastIncident));
  lines.push(`Zuletzt geprüft <t:${unix(now)}:R>`);

  return {
    content: "",
    embeds: [{ title: "Systemstatus", description: lines.join("\n"), color: COLOR[overallTone] }],
    allowed_mentions: { parse: [] },
  };
}

module.exports = { buildStatusPayload, formatDuration, TEXTS };
