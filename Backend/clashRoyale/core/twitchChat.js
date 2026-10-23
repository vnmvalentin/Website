// Twitch-Chat stimmt mit ab — "Chat draftet für den Streamer".
//
// Ein eingeloggter Streamer schaltet in seiner Lobby den Chat ein (lobby.twitchChat). Ist er
// im Pyramidendraft am Zug und gehört der Zug dem Chat (siehe chatOwnsTurn in
// modes/pyramidDraft.js), öffnet der Modus eine Abstimmung (lobby.game.chatVote). Zuschauer
// tippen einfach die Nummer der Karte in den Chat ("3" oder "!3"); hier wird mitgezählt.
//
// Kein eigener Twitch-Connect: Die Zeilen kommen über die gemeinsame IRC-Verbindung aus
// lib/winchallengeIrc.js (wie Win-Tracker und Murmelbahn). Dieses Modul kennt die Verbindung
// nicht direkt — winchallengeIrc meldet sich per attachIrc() an. So bleibt core/ frei von
// lib/-Abhängigkeiten, und Prüfstände ohne IRC laufen trotzdem.

// Lazy: core/lobbies.js braucht dieses Modul selbst (publicChatInfo in sanitizeLobby)
const allLobbies = () => require('./lobbies').lobbies.values();

// Welcher Modus den Chat nutzt — bewusst nur der Pyramidendraft: rundenbasiert mit Zugtimer,
// verträgt also die 2–10 s Stream-Verzögerung. Echtzeitmodi (Rush, Angeln …) taugen dafür nicht.
const CHAT_MODES = new Set(['pyramid-draft']);

// Gültige Stimme: nur eine Zahl, optional mit "!" oder "#" davor. Alles andere (auch "3 bitte")
// fällt durch — so stimmt niemand aus Versehen mit einem normalen Satz ab.
const VOTE_RE = /^\s*[!#]?(\d{1,2})\s*$/;

// Stimmenstand höchstens so oft an die Lobby schicken — in einem großen Chat kommen sonst
// Dutzende Updates pro Sekunde
const TALLY_THROTTLE_MS = 350;

let ioRef = null;
let irc = null; // { refresh(): Promise, status(): {configured, connected, joined[]}, say(channel, text) }

function setIo(io) { ioRef = io; }

/** lib/winchallengeIrc.js meldet sich hier an (siehe dort, Modulende). */
function attachIrc(api) { irc = api; }

const normalizeChannel = (ch) => String(ch || '').trim().toLowerCase().replace(/^#/, '');

/** Spieler, für den der Chat draftet (der Streamer, über seine Twitch-ID — übersteht Reconnects). */
function chatOwner(lobby) {
  const cfg = lobby?.twitchChat;
  if (!cfg?.ownerTwitchId) return null;
  return lobby.players.find(p => !p.left && !p.isAdmin && String(p.twitchId || '') === String(cfg.ownerTwitchId)) || null;
}

/** Chat ist eingeschaltet, der Modus passt und der Streamer ist noch in der Lobby. */
function chatActive(lobby) {
  return !!(lobby?.twitchChat && CHAT_MODES.has(lobby.mode) && chatOwner(lobby));
}

/** Alle Kanäle, in denen der Bot wegen einer Lobby mitlesen soll (für syncChannels). */
function getChatChannels() {
  const out = new Set();
  for (const lobby of allLobbies()) {
    if (chatActive(lobby)) out.add(normalizeChannel(lobby.twitchChat.channel));
  }
  return [...out];
}

/** Kanalliste neu abgleichen (Bot betritt/verlässt Kanäle). Ohne IRC ein No-op. */
function refreshChannels() {
  if (!irc) return Promise.resolve();
  return Promise.resolve(irc.refresh()).catch(() => {});
}

/**
 * Verbindungsstand für die Lobby-Anzeige:
 *   'joined'  Bot liest im Kanal mit
 *   'pending' Bot verbunden, Kanal noch nicht betreten (Beitritt läuft)
 *   'offline' kein Bot konfiguriert/verbunden — Stimmen kommen nicht an
 */
function chatStatus(lobby) {
  if (!lobby?.twitchChat) return null;
  const st = irc?.status?.();
  if (!st?.connected) return 'offline';
  return (st.joined || []).includes(normalizeChannel(lobby.twitchChat.channel)) ? 'joined' : 'pending';
}

/** Kurze Ansage im Chat (Abstimmung offen / Ergebnis) — nur wenn der Streamer das will. */
function announce(lobby, text) {
  if (!lobby?.twitchChat || lobby.chatAnnounce === false || !irc?.say || !text) return;
  try { irc.say(lobby.twitchChat.channel, text); } catch { /* Ansage ist Bonus */ }
}

// ── Abstimmung ───────────────────────────────────────────────────────────────

let voteSeq = 0;

/** Neue Abstimmung mit `optionCount` Wahlmöglichkeiten (1 … optionCount) anlegen. */
function createVote(optionCount, meta = {}) {
  return {
    id: ++voteSeq,
    optionCount,
    votes: new Map(),               // Chatter (Login) → gewählte Nummer
    counts: Array(optionCount).fill(0),
    total: 0,
    tallyTimer: null,
    ...meta,
  };
}

function clearVote(vote) {
  if (vote?.tallyTimer) clearTimeout(vote.tallyTimer);
  if (vote) vote.tallyTimer = null;
}

/** Stand ohne interne Felder — für den Spielzustand und die Live-Updates. */
function publicTally(vote) {
  return vote ? { voteId: vote.id, counts: [...vote.counts], total: vote.total } : null;
}

/**
 * Gewinner auslosen: meiste Stimmen, bei Gleichstand Los unter den Gleichauf-Liegenden,
 * ohne eine einzige Stimme Los unter allen. Liefert die Nummer (1-basiert).
 */
function winningOption(vote, rng = Math.random) {
  const max = Math.max(0, ...vote.counts);
  const pool = vote.counts.map((c, i) => (c === max ? i + 1 : null)).filter(Boolean);
  return pool[Math.floor(rng() * pool.length)];
}

function scheduleTally(lobby, vote) {
  if (vote.tallyTimer || !ioRef) return;
  vote.tallyTimer = setTimeout(() => {
    vote.tallyTimer = null;
    if (lobby.game?.chatVote !== vote) return;
    ioRef.to(lobby.code).emit('clash:chatVote:tally', publicTally(vote));
  }, TALLY_THROTTLE_MS);
}

// Abonnenten zählen inkl. Gründer/VIP/Mods/Broadcaster — die sollen bei "nur Subs" nicht
// ausgerechnet ausgeschlossen sein.
function isSubLike(tags) {
  if (tags.subscriber === true || tags.subscriber === '1' || tags.mod === true || tags.mod === '1') return true;
  const b = tags.badges;
  if (b && typeof b === 'object') {
    return ['subscriber', 'founder', 'vip', 'moderator', 'broadcaster'].some(k => b[k] != null);
  }
  return false;
}

/**
 * Eine Chatzeile aus winchallengeIrc. Muss billig bleiben: fast jede Zeile ist keine Zahl und
 * fällt schon an der Regex heraus, bevor überhaupt eine Lobby angeschaut wird.
 */
function onChatMessage(channel, tags, message) {
  const m = VOTE_RE.exec(String(message || ''));
  if (!m) return;
  const ch = normalizeChannel(channel);
  const voter = String(tags?.username || tags?.['user-id'] || '').toLowerCase();
  if (!voter) return;
  const n = Number(m[1]);
  for (const lobby of allLobbies()) {
    const vote = lobby.game?.chatVote;
    if (!vote || !lobby.twitchChat || normalizeChannel(lobby.twitchChat.channel) !== ch) continue;
    if (n < 1 || n > vote.optionCount) continue;
    if (lobby.chatVoters === 'subs' && !isSubLike(tags || {})) continue;
    const prev = vote.votes.get(voter);
    if (prev === n) continue;
    if (prev) vote.counts[prev - 1]--;
    else vote.total++;
    vote.votes.set(voter, n);
    vote.counts[n - 1]++;
    scheduleTally(lobby, vote);
  }
}

/** Für sanitizeLobby: was der Client über den Chat wissen darf (keine Twitch-ID). */
function publicChatInfo(lobby) {
  if (!lobby?.twitchChat) return null;
  const owner = chatOwner(lobby);
  return {
    channel: lobby.twitchChat.channel,
    ownerPlayerId: owner?.id || null,
    ownerName: owner?.name || lobby.twitchChat.ownerName || null,
    status: chatStatus(lobby),
  };
}

module.exports = {
  CHAT_MODES,
  setIo,
  attachIrc,
  chatOwner,
  chatActive,
  getChatChannels,
  refreshChannels,
  chatStatus,
  announce,
  createVote,
  clearVote,
  publicTally,
  winningOption,
  onChatMessage,
  publicChatInfo,
  normalizeChannel,
};
