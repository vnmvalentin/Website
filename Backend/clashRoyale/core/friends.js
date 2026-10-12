// Freundesliste der Minigames — Live-Status und Versand an die Clients.
//
// Dauerhaft (Freundschaften, Anfragen, Visitenkarten) liegt alles in lib/crFriendsStore.js.
// Hier lebt nur, was sich ständig ändert und nach einem Neustart ohnehin falsch wäre:
//   - wer gerade die Minigames offen hat (viewers: Twitch-ID → Sockets, die "hello" gesagt haben)
//   - in welcher Lobby jemand steckt — das wird NICHT mitgeführt, sondern bei Bedarf aus der
//     lobbies-Map gelesen (players[].twitchId). So muss keiner der vielen Wege, auf denen man
//     eine Lobby betritt oder verlässt (erstellen, beitreten, Reconnect, Kick, Verlassen,
//     Disconnect-Frist …), etwas von Freunden wissen.
//
// Versand: ein kurzer Takt baut für jeden verbundenen Nutzer seinen Stand und schickt ihn nur,
// wenn er sich seit dem letzten Mal geändert hat. Änderungen an der Liste selbst (Anfrage,
// Annehmen, Entfernen) schieben die Routen sofort über pushState() an beide Seiten.
//
// Nur Twitch-Nutzer: ohne Login gibt es keine stabile Identität, an der eine Freundschaft
// hängen könnte (siehe "loggedIn: false" im Stand).
const store = require('../lib/crFriendsStore');
const profileStore = require('../lib/crProfileStore');
const { lobbies, MAX_PLAYERS_PER_LOBBY } = require('./lobbies');

const TICK_MS = 2500;
const room = (twitchId) => `crf:${twitchId}`;

/** Twitch-ID → Set der Socket-IDs, die gerade die Minigames offen haben */
const viewers = new Map();
/** Twitch-ID → zuletzt verschickter Stand (JSON), damit unveränderte Stände nicht erneut rausgehen */
const lastSent = new Map();
let ioRef = null;
let ticker = null;

/** Wer steckt gerade in welcher Lobby? Einmal pro Durchlauf aufgebaut statt pro Freund. */
function buildLobbyIndex() {
  const index = new Map();
  for (const lobby of lobbies.values()) {
    for (const p of lobby.players) {
      if (!p.twitchId || p.left || p.disconnected || p.isAdmin || p.isBot) continue;
      if (!index.has(String(p.twitchId))) index.set(String(p.twitchId), lobby);
    }
  }
  return index;
}

function lobbyInfo(lobby) {
  const playerCount = lobby.players.filter(p => !p.left && !p.isAdmin).length;
  const inGame = !!(lobby.started && lobby.game && !lobby.game.finished);
  // Beitreten nur, wo es auch über den Code ginge: nicht während einer Runde, nicht in
  // gesperrten/vollen Lobbys, nie in Turnier-Lobbys (die lassen nur die Match-Spieler rein).
  const joinable = !inGame && !lobby.locked && !lobby.tournament && playerCount < MAX_PLAYERS_PER_LOBBY;
  return {
    mode: lobby.mode,
    playerCount,
    maxPlayers: MAX_PLAYERS_PER_LOBBY,
    inGame,
    tournament: !!lobby.tournament,
    joinable,
    // Den Code bekommen Freunde nur, wenn sie damit auch hineinkommen — er ist bei privaten
    // Lobbys das einzige Schloss.
    code: joinable ? lobby.code : null,
  };
}

function statusOf(twitchId, lobbyIndex) {
  const lobby = lobbyIndex.get(String(twitchId));
  if (lobby) {
    const info = lobbyInfo(lobby);
    return { status: info.inGame ? 'game' : 'lobby', lobby: info };
  }
  return { status: viewers.has(String(twitchId)) ? 'online' : 'offline', lobby: null };
}

// Sortierung wie in Valorant: wer in einer Lobby ist zuerst, dann online, dann offline; darin alphabetisch.
const STATUS_RANK = { lobby: 0, game: 1, online: 2, offline: 3 };

function card(twitchId) {
  const u = store.getUser(twitchId);
  return u || { id: String(twitchId), login: '', name: '?', avatarId: null, avatarUrl: null };
}

function buildState(twitchId, lobbyIndex = buildLobbyIndex()) {
  const me = card(twitchId);
  const friends = store.friendIds(twitchId)
    .map(id => ({ ...card(id), ...statusOf(id, lobbyIndex) }))
    .sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || a.name.localeCompare(b.name));
  return {
    loggedIn: true,
    me: { ...me, ...statusOf(twitchId, lobbyIndex), lobby: null },
    friends,
    incoming: store.incomingIds(twitchId).map(card),
    outgoing: store.outgoingIds(twitchId).map(card),
  };
}

function send(twitchId, state) {
  if (!ioRef) return;
  const json = JSON.stringify(state);
  lastSent.set(String(twitchId), json);
  ioRef.to(room(twitchId)).emit('clash:friends:state', state);
}

/** Stand sofort an alle offenen Tabs dieses Nutzers schicken (nach Änderungen an der Liste). */
function pushState(twitchId) {
  if (!viewers.has(String(twitchId))) return;
  try { send(twitchId, buildState(twitchId)); }
  catch (e) { console.error('[cr-friends] pushState:', e.message); }
}

function tick() {
  if (!viewers.size) return;
  try {
    const index = buildLobbyIndex();
    for (const id of viewers.keys()) {
      const state = buildState(id, index);
      if (JSON.stringify(state) !== lastSent.get(id)) send(id, state);
    }
  } catch (e) {
    console.error('[cr-friends] Takt:', e.message);
  }
}

function startTicker() {
  if (ticker) return;
  ticker = setInterval(tick, TICK_MS);
  ticker.unref?.();
}

/** Eigene Visitenkarte, bevorzugt aus dem gemeldeten Stand des Clients, sonst aus dem Profil. */
function cleanHello(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    name: typeof p.name === 'string' ? p.name : '',
    avatarId: typeof p.avatarId === 'string' ? p.avatarId : '',
    avatarUrl: typeof p.avatarUrl === 'string' ? p.avatarUrl : '',
  };
}

function registerFriendsSocket(socket, io, { twitchId = null, twitchLogin = null } = {}) {
  ioRef = io;
  startTicker();
  const id = twitchId ? String(twitchId) : null;

  // Der Hub meldet sich bei jedem (Re-)Connect und wenn sich Name/Avatar ändern.
  socket.on('clash:friends:hello', (payload) => {
    if (!id) return socket.emit('clash:friends:state', { loggedIn: false });
    try {
      store.upsertUser(id, { login: twitchLogin || '', ...cleanHello(payload) });
      if (!viewers.has(id)) viewers.set(id, new Set());
      viewers.get(id).add(socket.id);
      socket.join(room(id));
      // Immer schicken, auch wenn unverändert — ein frisch geöffneter Tab hat noch gar nichts.
      send(id, buildState(id));
    } catch (e) {
      console.error('[cr-friends] hello:', e.message);
    }
  });

  socket.on('disconnect', () => {
    if (!id) return;
    const set = viewers.get(id);
    if (!set) return;
    set.delete(socket.id);
    if (!set.size) { viewers.delete(id); lastSent.delete(id); }
  });
}

/** Ziel einer Anfrage über den Twitch-Namen finden. Zuerst die Visitenkarten der Freundesliste,
 *  sonst das CR-Profil (dort steht jeder, der die Minigames schon mit Twitch geöffnet hat). */
function resolveLogin(login) {
  const known = store.findUserByLogin(login);
  if (known) return known;
  const profile = profileStore.findProfileByLogin(login);
  if (!profile) return null;
  store.upsertUser(profile.twitchId, {
    login: profile.twitchLogin, name: profile.displayName || profile.twitchLogin, avatarId: profile.avatarId,
  });
  return store.getUser(profile.twitchId);
}

module.exports = { registerFriendsSocket, buildState, pushState, resolveLogin };
