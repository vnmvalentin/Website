// ── Streamer-Integration (OBS-Automatiken + Deck-Overlays) ──────────────────
// Zwei unabhängige Deck-Overlay-Wege teilen sich hier dieselbe Payload:
//   1. Pro Lobby (lobby.overlayKey, siehe lobbies.js): läuft für die komplette Sitzung,
//      jeder Spieler kann den Link kopieren (Endscreen-Button) — kein Login nötig.
//   2. Pro Twitch-Account (crStreamerStore.js): Spieler, die beim Verbinden per
//      Session-Cookie eingeloggt waren, tragen ihre (serverseitig verifizierte) twitchId.
//      Für jeden solchen Spieler mit Streamer-Konfiguration feuern Lobby-Ereignisse
//      zusätzlich Events an sein persönliches Deck-Overlay, das als Browserquelle in OBS
//      läuft und dort lokal Szenen/Quellen schaltet (Automatiken, siehe StreamerConfigPanel).
//
// Fehler werden hier bewusst geschluckt und nur geloggt: ein kaputtes Overlay-Setup
// eines einzelnen Zuschauers darf niemals den Spielablauf der ganzen Lobby stoppen.

const crStreamerStore = require('../lib/crStreamerStore');

function lobbyStreamerIds(lobby) {
  const ids = new Set();
  for (const p of lobby.players) {
    if (p.twitchId && !p.left) ids.add(String(p.twitchId));
  }
  return [...ids];
}

function emitStreamerEvent(lobby, io, eventName) {
  for (const tid of lobbyStreamerIds(lobby)) {
    try {
      const cfg = crStreamerStore.getConfig(tid);
      if (!cfg?.overlayKey) continue;
      io.to(`croverlay:${cfg.overlayKey}`).emit('cr:streamer:event', {
        event: eventName,
        lobbyCode: lobby.code,
        mode: lobby.mode,
      });
    } catch (e) {
      console.error('[cr streamer] event failed:', e.message);
    }
  }
}

function buildDeckFeedPayload(lobby) {
  return {
    at: Date.now(),
    lobbyCode: lobby.code,
    mode: lobby.mode,
    players: lobby.players
      .filter(p => !p.isAdmin && !p.left && !p.isSpectator && (p.deck || []).length > 0)
      .map(p => ({
        name: p.name,
        color: p.color,
        avatar: p.avatar || '',
        deck: (p.deck || []).map(c => ({
          id: c.id, name: c.name, rarity: c.rarity, isChampion: !!c.isChampion,
        })),
      })),
  };
}

// Was ein Overlay beim Verbinden und beim Polling bekommt: die zuletzt FERTIGEN Decks
// (siehe updateDeckFeeds), nie den laufenden Spielstand — sonst zeigte ein neu geladenes
// Overlay mitten im Draft halbe Decks, obwohl es live erst am Spielende aktualisiert wird.
function lastDeckFeedPayload(lobby) {
  return lobby.lastDeckFeed
    || { at: Date.now(), lobbyCode: lobby.code, mode: lobby.mode, players: [] };
}

// Nur am Spielende aufrufen (notifyDraftComplete, Admin-Kartentausch im Endscreen) — die
// Overlays sollen fertige Decks zeigen, keine Zwischenstände.
function updateDeckFeeds(lobby, io) {
  const payload = buildDeckFeedPayload(lobby);
  if (!payload.players.length) return;
  lobby.lastDeckFeed = payload;

  // Lobbyeigenes Deck-Overlay (siehe lobbies.js: findLobbyByOverlayKey) — unabhängig vom
  // Twitch-Login einzelner Spieler, ein Schlüssel pro Lobby statt pro Account. Läuft
  // parallel zur Pro-Streamer-Schleife unten, die weiterhin die alten Accounts bedient.
  if (lobby.overlayKey) {
    io.to(`crlobbydeck:${lobby.overlayKey}`).emit('cr:lobbydeck:update', payload);
  }

  for (const tid of lobbyStreamerIds(lobby)) {
    try {
      const cfg = crStreamerStore.setLastDecks(tid, payload);
      if (!cfg?.overlayKey) continue; // kein Streamer-Setup für diesen Spieler
      io.to(`croverlay:${cfg.overlayKey}`).emit('cr:deckoverlay:update', payload);
    } catch (e) {
      console.error('[cr streamer] deck feed failed:', e.message);
    }
  }
}

function notifyDraftComplete(lobby, io) {
  emitStreamerEvent(lobby, io, 'draftEnd');
  updateDeckFeeds(lobby, io);
}

module.exports = {
  lobbyStreamerIds,
  emitStreamerEvent,
  buildDeckFeedPayload,
  lastDeckFeedPayload,
  updateDeckFeeds,
  notifyDraftComplete,
};
