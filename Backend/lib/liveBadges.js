// liveBadges.js — der kleine Punkt in der Navigation ("es gibt eine Abstimmung,
// bei der du noch nicht mitgemacht hast").
//
// Früher bekam JEDE verbundene Socket bei jeder Stimme die komplette polls.json
// bzw. giveaways.json geschickt — auch OBS-Overlays und Clash-Royale-Spieler, die
// damit nichts zu tun haben. Das skaliert doppelt schlecht: mit der Zahl der
// Verbindungen UND mit der Zahl der Teilnehmer.
//
// Jetzt gilt:
//   Raum "polls" / "giveaways" -> Vollpayload, nur für die, die die Seite offen haben
//   Raum "badges"              -> zwei Booleans pro Socket (~40 Byte)
//
// Die Twitch-ID kommt vom Client. Das ist bewusst KEINE Sicherheitsgrenze: es
// entscheidet nur, ob ein Punkt angezeigt wird. Wer sich eine fremde ID unterschiebt,
// sieht bei sich einen Punkt mehr oder weniger — mehr nicht.
const fs = require("fs");
const path = require("path");

const POLLS_FILE = path.join(__dirname, "../data/polls.json");
const GIVEAWAYS_FILE = path.join(__dirname, "../data/giveaways.json");

const ROOM_POLLS = "polls";
const ROOM_GIVEAWAYS = "giveaways";
const ROOM_BADGES = "badges";

function readJsonArray(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("[liveBadges] konnte " + path.basename(file) + " nicht lesen:", e.message);
    return [];
  }
}

/**
 * Reduziert die Rohdaten auf das, was der Punkt braucht: pro noch laufendem
 * Eintrag nur die Menge der IDs, die schon mitgemacht haben.
 */
function collectOpenItems() {
  const now = Date.now();

  const polls = readJsonArray(POLLS_FILE)
    .filter((p) => new Date(p?.endDate).getTime() > now)
    .map((p) => new Set(Object.keys(p?.votes || {})));

  const giveaways = readJsonArray(GIVEAWAYS_FILE)
    .filter((g) => Number(g?.endDate) > now)
    .map((g) => new Set(Object.keys(g?.participants || {})));

  return { polls, giveaways };
}

/** @returns {{polls: boolean, giveaways: boolean}} */
function badgesFor(open, userId) {
  const id = userId ? String(userId) : null;
  // Nicht eingeloggt: jede offene Aktion ist "noch nicht erledigt"
  const anyOpen = (sets) => sets.some((done) => !id || !done.has(id));
  return { polls: anyOpen(open.polls), giveaways: anyOpen(open.giveaways) };
}

/** Schickt jeder Socket im badges-Raum ihren eigenen Zwei-Bit-Stand. */
function broadcast(io) {
  if (!io) return;
  const room = io.sockets.adapter.rooms.get(ROOM_BADGES);
  if (!room || room.size === 0) return;

  // Dateien einmal lesen, nicht pro Socket
  const open = collectOpenItems();
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.emit("badges:update", badgesFor(open, socket.data?.badgeUserId));
  }
}

/** Im bestehenden connection-Handler aufrufen (wie registerClashRoyaleSocket). */
function registerLiveBadgesSocket(socket) {
  // Vollpayload nur auf Wunsch (Abstimmungs-/Giveaway-Seite)
  socket.on("feed:join", (feed) => {
    if (feed === ROOM_POLLS || feed === ROOM_GIVEAWAYS) socket.join(feed);
  });
  socket.on("feed:leave", (feed) => {
    if (feed === ROOM_POLLS || feed === ROOM_GIVEAWAYS) socket.leave(feed);
  });

  // Nav-Punkt: nur zwei Booleans, dafür für jeden Besucher
  socket.on("badges:subscribe", (payload) => {
    socket.data.badgeUserId = payload && payload.userId ? String(payload.userId) : null;
    socket.join(ROOM_BADGES);
    socket.emit("badges:update", badgesFor(collectOpenItems(), socket.data.badgeUserId));
  });
}

module.exports = {
  registerLiveBadgesSocket,
  broadcast,
  badgesFor,
  collectOpenItems,
  ROOM_POLLS,
  ROOM_GIVEAWAYS,
  ROOM_BADGES,
};
