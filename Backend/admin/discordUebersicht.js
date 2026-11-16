// admin/discordUebersicht.js — Zahlen des Discord-Bots für den Admin-Reiter „Discord-Bot“ (GET /api/admin/discord).
// Liest nur den Zwischenspeicher des discord.js-Clients: kostet keine Anfrage an Discord und geht auch, wenn der Bot
// gerade neu verbindet (dann nur { bereit: false }).

const TAG_MS = 24 * 60 * 60 * 1000;

function discordUebersicht(client, jetzt = Date.now()) {
  if (!client || typeof client.isReady !== "function" || !client.isReady()) return { bereit: false, at: jetzt };
  const server = [...client.guilds.cache.values()].map((g) => ({
    id: String(g.id),
    name: String(g.name || ""),
    mitglieder: Number(g.memberCount) || 0,
    beigetreten: Number(g.joinedTimestamp) || null,
  }));
  server.sort((a, b) => b.mitglieder - a.mitglieder);
  const neuSeit = (tage) => server.filter((g) => g.beigetreten && jetzt - g.beigetreten <= tage * TAG_MS).length;
  const ping = Number(client.ws?.ping);
  return {
    bereit: true,
    name: client.user?.username || null,
    server: server.length,
    mitglieder: server.reduce((s, g) => s + g.mitglieder, 0),
    neu7: neuSeit(7),
    neu30: neuSeit(30),
    // -1 bis zum ersten Herzschlag nach dem Start
    ping: Number.isFinite(ping) && ping >= 0 ? Math.round(ping) : null,
    onlineSeit: client.readyTimestamp || null,
    liste: server.slice(0, 100),
    at: jetzt,
  };
}

module.exports = { discordUebersicht };
