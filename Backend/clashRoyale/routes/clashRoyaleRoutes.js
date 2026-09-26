const express = require('express');
const crStreamerStore = require('../lib/crStreamerStore');

// ── Geteilte Bausteine ──────────────────────────────────────────────────────
// Diese Datei ist nur noch das Gerüst: Lobby-Verwaltung, Socket-Anbindung und die
// HTTP-Routen. Kartendaten und modusunabhängige Helfer liegen in clashRoyale/core/,
// die acht Spielmodi in clashRoyale/modes/ — jeder meldet sich dort selbst an der
// Registry an und bringt seine Einstellungen und Socket-Events mit.
const { ALL_CARDS, getCardPool, cardIdByOfficialName } = require('../core/cards');
const {
  lobbies, PLAYER_COLORS, LOBBY_DISCONNECT_GRACE_MS, MAX_PLAYERS_PER_LOBBY,
  generateCode, generateOverlayKey, generateBotId, findLobbyByOverlayKey,
  lobbyIsAbandoned, sanitizeLobby, getActiveLobbiesForAdmin, getPublicLobbies,
} = require('../core/lobbies');
const {
  applyModePreset, applySuggestedPreset, reapplyActivePreset, clearActivePreset,
} = require('../core/modePresets');
const { emitStreamerEvent, updateDeckFeeds, lastDeckFeedPayload } = require('../core/streamerFeed');
const { clearTurnTimer } = require('../core/timers');
const { emitClashError } = require('../core/errors');
const { teamPlayers } = require('../core/teams');
const { isConfigured: crApiConfigured, normalizeTag, fetchPlayerSummary, fetchPlayerCards } = require('../lib/crApi');
const { initCrTracking, startTracking, stopTracking, onPlayerLinked } = require('../core/crTracking');
const registry = require('../core/registry');
// Ausgelagerte Modi melden sich beim Laden selbst an der Registry an
require('../modes');

// ── Helpers ────────────────────────────────────────────────────────────────
// Mindestgröße des Kartenpools für den aktuellen Modus mit den aktuellen Einstellungen.
// Die Modi liefern ihre Formel selbst; ohne Angabe gilt kein Mindestpool.
function requiredPoolSize(lobby) {
  const activeCount = lobby.players.filter(p => !p.isSpectator).length;
  const mode = registry.modeForLobby(lobby);
  return mode?.requiredPool ? (mode.requiredPool(lobby, activeCount) ?? 0) : 0;
}

// Profilbild-Option "Twitch-Bild verwenden" (siehe Profil-System): der Client schickt dafür
// statt/neben `avatar` (Dateiname aus dem festen Satz) eine echte Bild-URL mit. Nur https
// und eine Längengrenze — mehr Prüfung braucht ein <img src> nicht, es wird nirgends
// ausgeführt, nur angezeigt.
function cleanAvatarUrl(u) {
  return typeof u === 'string' && /^https:\/\//.test(u) ? u.slice(0, 300) : null;
}

// Reconnect/Session-Übernahme: alle Spielreferenzen des jeweiligen Modus auf die neue ID umhängen
function remapGamePlayerId(game, oldId, newId) {
  if (!game || oldId === newId) return;
  registry.modeForGame(game)?.remapPlayerId?.(game, oldId, newId);
}

// Aktuellen Spielstand an EINEN Socket schicken (Reconnect, requestState, Admin-Zuschauer).
// Bewusst zentral: diese Fallunterscheidung lag vorher an vier Stellen kopiert vor und in
// dreien fehlten Modi — der Fallback rief dann buildGameState() auf, das auf g.grid zugreift,
// was es außerhalb von Snake nicht gibt (TypeError im Socket-Handler). Ein neuer Modus wird
// jetzt nur noch hier eingetragen.
function emitGameStateTo(socket, lobby, opts = {}) {
  if (!lobby.game) return;
  const mode = registry.modeForGame(lobby.game);
  const built = mode?.buildState?.(lobby, socket, opts);
  if (built) socket.emit(built.event, built.payload);
}

// ── Socket ─────────────────────────────────────────────────────────────────
function registerClashRoyaleSocket(socket, io, { isAdmin = false, twitchId = null, twitchLogin = null } = {}) {
  // Host-Aktionen dürfen genauso vom (server-seitig verifizierten) Admin ausgeführt werden
  const canControl = (lobby) => lobby.host === socket.id || isAdmin;

  // Einziger Weg, den Lobby-Zustand zu verteilen. Davor zieht das gesetzte Preset seine
  // Werte an der aktuellen Spielerzahl nach — z.B. "Karten pro Runde" bei Auction/Bingo,
  // sobald jemand dazukommt. Ohne aktives Preset (Host hat selbst geschraubt) oder in einer
  // laufenden Runde ist das ein No-op.
  //
  // Läuft dieselbe Lobby öffentlich (oder war es gerade eben noch), geht zusätzlich die
  // komplette Browser-Liste an ALLE verbundenen Sockets raus — nicht nur an den Lobby-Raum.
  // So verschwindet/erscheint sie live im Hub, ohne dass wer im "Lobby beitreten"-Bildschirm
  // erst neu laden müsste. isPublicChanged fängt genau den Fall ab, in dem der Host gerade
  // von öffentlich auf privat umschaltet — danach ist lobby.isPublic schon false, die Liste
  // muss die Lobby aber trotzdem einmal noch verschwinden lassen.
  const broadcastLobby = (lobby, { isPublicChanged = false } = {}) => {
    reapplyActivePreset(lobby);
    io.to(lobby.code).emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    if (lobby.isPublic || isPublicChanged) io.emit('clash:publicLobbiesUpdate', getPublicLobbies());
  };

  // Lobby endgültig entfernen (verlassen, Admin-Abmeldung, abgelaufene Reconnect-Frist).
  // War sie öffentlich, muss der Lobby-Browser sie ebenfalls verlieren — danach gibt es
  // kein Lobby-Objekt mehr, über das broadcastLobby() das noch erledigen könnte.
  const removeLobby = (lobby) => {
    clearTurnTimer(lobby);
    lobbies.delete(lobby.code);
    if (lobby.isPublic) io.emit('clash:publicLobbiesUpdate', getPublicLobbies());
  };

  // Die Tracking-Schleife braucht io, das es erst hier gibt. initCrTracking() ist
  // idempotent (prüft auf einen laufenden Timer) und tut ohne API-Token gar nichts —
  // der Aufruf bei jeder Socket-Registrierung startet sie also genau einmal, ohne dass
  // index.js dafür angefasst werden muss.
  initCrTracking({
    lobbies,
    broadcastLobby: (lobby) => io.to(lobby.code).emit('clash:lobbyUpdate', sanitizeLobby(lobby)),
  });

  // ── Host-Einstellungen der Modi ──────────────────────────────────────────
  // Früher 17 fast identische Handler. Jetzt meldet jeder Modus seine Einstellungen
  // samt Event, Payload-Feld und Prüfung an der Registry an; das Gerüst hier ist für
  // alle gleich. Ein sanitize(), das undefined liefert, lehnt die Änderung ab.
  for (const { key, spec } of registry.settingEvents()) {
    socket.on(spec.event, (payload = {}) => {
      const lobby = lobbies.get(payload.code);
      if (!lobby || !canControl(lobby)) return;
      if (!spec.duringGame && lobby.started) return;
      const raw = payload[spec.payloadKey ?? 'value'];
      const value = spec.sanitize ? spec.sanitize(raw, lobby) : raw;
      if (value === undefined) return;
      lobby[key] = value;
      // Von Hand gesetzt: die Lobby folgt ab jetzt keinem Preset mehr
      clearActivePreset(lobby);
      broadcastLobby(lobby);
      spec.afterChange?.(lobby, io);
    });
  }

  // Socket-Events, die ein Modus selbst mitbringt (Bewegung im Labyrinth, Angeln, …)
  const modeCtx = { socket, io, canControl };
  for (const { event, handler } of registry.modeSocketHandlers()) {
    socket.on(event, (payload = {}) => handler(modeCtx, payload));
  }

  socket.on('clash:createLobby', ({ playerName, mode, timerSeconds = 60, cardsPerRound = 4, avatar = 'knight', avatarUrl }) => {
    if (!playerName?.trim()) return;
    const code = generateCode();
    const lobby = {
      code, overlayKey: generateOverlayKey(), mode: registry.getMode(mode) ? mode : 'snake', host: socket.id,
      partyMode: 'solo',
      timerSeconds: Math.max(15, Math.min(300, Number(timerSeconds) || 60)),
      cardsPerRound: Math.max(2, Math.min(12, Number(cardsPerRound) || 4)),
      // Standardwerte aller Modi (tokenShopTimerSeconds, gridSize, rush*, fish*, maze* …)
      ...registry.defaultSettings(),
      excludedCards: [],
      locked: false,
      isPublic: false,
      createdAt: Date.now(),
      players: [{
        id: socket.id, name: playerName.trim(), color: PLAYER_COLORS[0],
        avatar: avatar || 'knight', avatarUrl: cleanAvatarUrl(avatarUrl),
        deck: [], elixir: 100, isSpectator: false, twitchId: twitchId || null,
        teamId: null, teamSlot: null,
      }],
      started: false, game: null,
      history: [],
    };
    // Startzustand ist "Vorgeschlagen" — nicht die nackten Standardwerte der Modi. Sonst
    // stimmt der Anfangszustand nur zufällig mit einem Preset überein und im Client wäre
    // beim Öffnen der Lobby kein Preset markiert.
    applySuggestedPreset(lobby);
    lobbies.set(code, lobby);
    socket.join(code);
    socket.emit('clash:lobbyCreated', { code });
    broadcastLobby(lobby);
  });

  socket.on('clash:joinLobby', ({ code, playerName, avatar = 'knight', avatarUrl, auto = false }) => {
    const uCode = (code || '').toUpperCase();
    const lobby = lobbies.get(uCode);
    // auto = stiller Auto-Rejoin aus localStorage: bei ungültiger Sitzung keinen Fehler zeigen,
    // sondern dem Client nur signalisieren, dass er die gespeicherte Sitzung verwerfen soll
    if (!lobby) {
      if (auto) return socket.emit('clash:sessionExpired');
      return emitClashError(socket, 'lobbyNotFound');
    }
    if (!playerName?.trim())  return emitClashError(socket, 'nameRequired');
    const trimmedName = playerName.trim();

    // Reconnect/Übernahme: Spieler mit gleichem Namen während eines laufenden Spiels.
    // Auch bei noch aktiver alter Verbindung (z.B. zweiter Tab) wird die Sitzung übernommen,
    // statt einen Duplikat-Spieler zu erzeugen.
    if (lobby.started && lobby.game && !lobby.game.finished) {
      const dc = lobby.players.find(p => !p.left && !p.isAdmin && p.name === trimmedName);
      if (dc) {
        const oldId = dc.id;
        if (!dc.disconnected && oldId !== socket.id) {
          io.to(oldId).emit('clash:sessionTakeover');
          io.sockets.sockets.get(oldId)?.leave(uCode);
        }
        dc.id = socket.id;
        dc.disconnected = false;
        dc.disconnectedAt = null;
        dc.twitchId = twitchId || dc.twitchId || null;
        if (dc.wasHost) { lobby.host = socket.id; dc.wasHost = false; }
        if (lobby.host === oldId) lobby.host = socket.id;
        remapGamePlayerId(lobby.game, oldId, socket.id);
        socket.join(uCode);
        socket.emit('clash:lobbyJoined', { code: uCode, isHost: lobby.host === socket.id, reconnected: true });
        broadcastLobby(lobby);
        // Send current game state depending on mode
        socket.emit('clash:gameReconnect', { mode: lobby.game.type || 'snake' });
        emitGameStateTo(socket, lobby);
        return;
      }
      if (auto) return socket.emit('clash:sessionExpired');
      return emitClashError(socket, 'gameInProgress');
    }

    // Reconnect: gleicher Name war gerade in der Gnadenfrist (kurzer Netzwerk-Hänger, Tab-Reload, ...)
    const dcLobby = lobby.players.find(p => p.disconnected && !p.left && p.name === trimmedName);
    // Übernahme: gleicher Name, alte Verbindung noch aktiv (z.B. anderer Tab)
    const activeSame = !dcLobby
      ? lobby.players.find(p => !p.disconnected && !p.isAdmin && p.name === trimmedName && p.id !== socket.id)
      : null;
    if (dcLobby) {
      dcLobby.id = socket.id;
      dcLobby.disconnected = false;
      dcLobby.disconnectedAt = null;
      dcLobby.twitchId = twitchId || dcLobby.twitchId || null;
      if (dcLobby.wasHost) { lobby.host = socket.id; dcLobby.wasHost = false; }
    } else if (activeSame) {
      io.to(activeSame.id).emit('clash:sessionTakeover');
      io.sockets.sockets.get(activeSame.id)?.leave(uCode);
      if (lobby.host === activeSame.id) lobby.host = socket.id;
      activeSame.id = socket.id;
      activeSame.disconnected = false;
      activeSame.disconnectedAt = null;
      activeSame.twitchId = twitchId || activeSame.twitchId || null;
    } else {
      // Ab hier ist es ein NEUER Spieler — alle Reconnect- und Übernahmefälle sind oben
      // schon behandelt. Genau deshalb steht die Sperre hier und nicht weiter oben: eine
      // gesperrte Lobby soll niemanden aussperren, der bereits drin war und nur einen
      // Netzwerk-Hänger oder einen Tab-Reload hatte.
      if (lobby.locked) {
        if (auto) return socket.emit('clash:sessionExpired');
        return emitClashError(socket, 'lobbyLocked');
      }
      if (lobby.players.filter(p => !p.left).length >= MAX_PLAYERS_PER_LOBBY) {
        if (auto) return socket.emit('clash:sessionExpired');
        return emitClashError(socket, 'lobbyFull', { max: MAX_PLAYERS_PER_LOBBY });
      }
      if (!lobby.players.find(p => p.id === socket.id)) {
        lobby.players.push({
          id: socket.id, name: trimmedName,
          color: PLAYER_COLORS[lobby.players.length % PLAYER_COLORS.length],
          avatar: avatar || 'knight', avatarUrl: cleanAvatarUrl(avatarUrl),
          deck: [], elixir: lobby.startElixir ?? 100,
          isSpectator: false, twitchId: twitchId || null,
          teamId: null, teamSlot: null,
        });
      }
    }
    socket.join(uCode);
    socket.emit('clash:lobbyJoined', { code: uCode, isHost: lobby.host === socket.id });
    broadcastLobby(lobby);
    emitGameStateTo(socket, lobby);
  });

  // Test-Bot hinzufügen — verhält sich in der Lobby wie ein normaler Spieler (Host weist ihn
  // über dieselbe Team-UI zu, siehe clash:switchTeam), spielt sich aber selbst (siehe die
  // Bot-Zeitgeber in elixirAuction2v2.js/elixirRush2v2.js). Nur für die 2v2-Modi gedacht —
  // in Solo-Modi sitzt er nur untätig mit, richtet aber nichts an.
  socket.on('clash:addBot', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (lobby.players.filter(p => !p.left).length >= MAX_PLAYERS_PER_LOBBY) {
      return emitClashError(socket, 'lobbyFull', { max: MAX_PLAYERS_PER_LOBBY });
    }
    const botNum = lobby.players.filter(p => p.isBot).length + 1;
    lobby.players.push({
      id: generateBotId(), name: `Bot ${botNum}`,
      color: PLAYER_COLORS[lobby.players.length % PLAYER_COLORS.length],
      avatar: 'knight', avatarUrl: null,
      deck: [], elixir: 100, isSpectator: false, twitchId: null,
      teamId: null, teamSlot: null, isBot: true,
    });
    broadcastLobby(lobby);
  });

  socket.on('clash:kickPlayer', ({ code, playerId }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started || playerId === socket.id) return;
    const idx = lobby.players.findIndex(p => p.id === playerId);
    if (idx !== -1 && !lobby.players[idx].isAdmin) {
      lobby.players.splice(idx, 1);
      io.to(playerId).emit('clash:kicked');
      broadcastLobby(lobby);
    }
  });

  // Admin: erzwingt Zuschauer-Status eines beliebigen Spielers, auch während einer laufenden Runde
  socket.on('clash:setPlayerSpectator', ({ code, targetPlayerId, isSpectator }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    const target = lobby.players.find(p => p.id === targetPlayerId && !p.isAdmin);
    if (!target) return;
    target.isSpectator = !!isSpectator;
    broadcastLobby(lobby);
    // Der Modus zieht nach: eine Bietrunde kann jetzt vollständig sein, ein reaktivierter
    // Spieler braucht Elixier bzw. eine Position im Labyrinth.
    if (lobby.game) registry.modeForGame(lobby.game)?.onSpectatorChanged?.(lobby, io, target);
  });

  // Host (oder Admin) sperrt die Lobby: es kommt niemand Neues mehr rein.
  // Bewusst auch während einer laufenden Runde erlaubt — dann bleibt die Sperre für die
  // nächste Runde gesetzt, statt beim Rücksprung in die Lobby stillschweigend aufzugehen.
  socket.on('clash:setLobbyLocked', ({ code, locked }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    lobby.locked = !!locked;
    broadcastLobby(lobby);
  });

  // Host (oder Admin) macht die Lobby öffentlich/privat — öffentlich heißt: sie taucht im
  // Lobby-Browser des Hubs auf und ist von dort ohne Code anklickbar.
  socket.on('clash:setLobbyPublic', ({ code, isPublic }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    lobby.isPublic = !!isPublic;
    broadcastLobby(lobby, { isPublicChanged: true });
  });

  // Einmalige Anfrage der Liste — für den Erstaufbau des Lobby-Browsers im Hub, bevor
  // sich dort durch irgendeine Lobby-Änderung ein clash:publicLobbiesUpdate ergäbe.
  socket.on('clash:listPublicLobbies', (payload, ack) => {
    if (typeof ack === 'function') ack(getPublicLobbies());
  });

  // ── Clash-Royale-Account verknüpfen ──────────────────────────────────────
  // Jeder darf seinen eigenen Account verknüpfen; Host und Admin dürfen es zusätzlich
  // für alle anderen tun (praktisch, wenn im Stream reihum durchgegeben wird).
  // Der Tag wird vor dem Speichern gegen die API geprüft — ein Tippfehler soll nicht
  // erst beim Tracking als "keine Daten" auffallen. Das Ergebnis geht per Ack zurück,
  // damit der Dialog im Client eine konkrete Rückmeldung zeigen kann.
  socket.on('clash:linkCrAccount', async ({ code, targetPlayerId, tag }, ack) => {
    const done = (res) => { if (typeof ack === 'function') ack(res); };
    const lobby = lobbies.get(code);
    if (!lobby) return done({ ok: false, key: 'lobbyNotFound' });

    const targetId = targetPlayerId || socket.id;
    if (targetId !== socket.id && !canControl(lobby)) return done({ ok: false, key: 'noPermission' });
    const target = lobby.players.find(p => p.id === targetId && !p.isAdmin);
    if (!target) return done({ ok: false, key: 'lobbyNotFound' });

    if (!crApiConfigured()) return done({ ok: false, key: 'apiNotConfigured' });
    const clean = normalizeTag(tag);
    if (!clean) return done({ ok: false, key: 'invalidTag' });

    let profile;
    try {
      profile = await fetchPlayerSummary(clean);
    } catch {
      return done({ ok: false, key: 'tagLookupFailed' });
    }
    if (!profile || profile.notFound) return done({ ok: false, key: 'tagNotFound' });

    target.crTag = clean;
    target.crName = profile.name;
    // Läuft das Tracking schon, bekommt der Spieler sofort einen eigenen Startpunkt
    await onPlayerLinked(lobby, target);
    broadcastLobby(lobby);
    done({ ok: true, tag: clean, name: profile.name });
  });

  socket.on('clash:unlinkCrAccount', ({ code, targetPlayerId }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    const targetId = targetPlayerId || socket.id;
    if (targetId !== socket.id && !canControl(lobby)) return;
    const target = lobby.players.find(p => p.id === targetId && !p.isAdmin);
    if (!target) return;
    target.crTag = null;
    target.crName = null;
    if (lobby.tracking?.scores) delete lobby.tracking.scores[target.id];
    broadcastLobby(lobby);
  });

  // Tracking an/aus. Beim Einschalten merkt sich der Server den aktuellen Stand jedes
  // verknüpften Tags, damit nur ab jetzt gespielte Partien zählen (siehe crTracking.js).
  socket.on('clash:setTracking', async ({ code, enabled }, ack) => {
    const done = (res) => { if (typeof ack === 'function') ack(res); };
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return done({ ok: false, key: 'noPermission' });
    if (!enabled) {
      stopTracking(lobby);
      broadcastLobby(lobby);
      return done({ ok: true });
    }
    if (!crApiConfigured()) return done({ ok: false, key: 'apiNotConfigured' });
    const linked = lobby.players.filter(p => !p.isAdmin && !p.left && p.crTag);
    if (linked.length === 0) return done({ ok: false, key: 'noLinkedAccounts' });
    await startTracking(lobby);
    broadcastLobby(lobby);
    done({ ok: true });
  });

  // Kartenpool auf die Schnittmenge der freigeschalteten Karten aller verknüpften Spieler
  // zuschneiden: Karten, die mindestens einer von ihnen noch nicht besitzt, werden
  // ausgeschlossen. Einzelne nicht abrufbare Accounts werden übersprungen (nicht der ganze
  // Vorgang abgebrochen) — der Host erfährt über skippedCount, dass nicht alle einbezogen
  // wurden. fetchPlayerCards liefert nur tatsächlich freigeschaltete Karten (siehe dort).
  socket.on('clash:trimPoolToUnlocked', async ({ code }, ack) => {
    const done = (res) => { if (typeof ack === 'function') ack(res); };
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return done({ ok: false, key: 'noPermission' });
    if (!crApiConfigured()) return done({ ok: false, key: 'apiNotConfigured' });
    const linked = lobby.players.filter(p => !p.isAdmin && !p.left && p.crTag);
    if (linked.length === 0) return done({ ok: false, key: 'noLinkedAccounts' });

    const results = await Promise.all(linked.map(async (p) => {
      try {
        const res = await fetchPlayerCards(p.crTag);
        if (!res || res.notFound) return null;
        const ids = new Set(res.names.map(cardIdByOfficialName).filter(Boolean));
        return ids;
      } catch {
        return null;
      }
    }));
    const usable = results.filter(Boolean);
    if (usable.length === 0) return done({ ok: false, key: 'tagLookupFailed' });

    const kept = ALL_CARDS.filter(c => usable.every(ids => ids.has(c.id)));
    const keptSet = new Set(kept.map(c => c.id));
    lobby.excludedCards = ALL_CARDS.filter(c => !keptSet.has(c.id)).map(c => c.id);
    broadcastLobby(lobby);
    done({ ok: true, keptCount: kept.length, playersConsidered: usable.length, skippedCount: linked.length - usable.length });
  });

  // Host (oder Admin) überträgt den Host-Status an einen anderen Spieler
  socket.on('clash:transferHost', ({ code, targetPlayerId }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    const target = lobby.players.find(p => p.id === targetPlayerId && !p.isAdmin);
    if (!target) return;
    lobby.host = targetPlayerId;
    broadcastLobby(lobby);
  });

  socket.on('clash:setTimer', ({ code, seconds }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    lobby.timerSeconds = Math.max(5, Math.min(300, Number(seconds) || 60));
    clearActivePreset(lobby);
    broadcastLobby(lobby);
  });


  // Host (oder Admin) lädt ein fertiges Einstellungs-Preset des aktuellen Modus
  // ("Vorgeschlagen", "Blitz", "Chaos") — spart das Durchklicken aller Regler.
  socket.on('clash:applyModePreset', ({ code, presetId }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (!applyModePreset(lobby, presetId)) return;
    broadcastLobby(lobby);
  });

  // Host (oder Admin) wechselt den Spielmodus — nur in der Lobby-Phase, nie während einer laufenden Runde
  socket.on('clash:setMode', ({ code, mode }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    const target = registry.getMode(mode);
    if (!target) return;
    // Ein solo-only Modus ist in einer Duo-Lobby nicht wählbar und umgekehrt (Elixir Auction
    // 2v2 kennt z.B. kein Free-for-all-Bieten).
    if (!registry.modeAllowsParty(target, lobby.partyMode || 'solo')) return;
    lobby.mode = mode;
    // Der neue Modus bringt eigene Einstellungen mit, die noch niemand konfiguriert hat —
    // also mit seiner Empfehlung starten statt mit den Resten des vorherigen Modus.
    applySuggestedPreset(lobby);
    broadcastLobby(lobby);
  });

  // Host (oder Admin) schaltet zwischen Solo (Free-for-all) und Duo (2er-Teams) um. Der
  // aktuelle Modus bleibt nur bestehen, wenn er im neuen Party-Modus überhaupt wählbar ist —
  // sonst springt die Lobby auf den ersten passenden Modus, statt in einem unspielbaren
  // Zustand (z.B. Elixir Auction 2v2 im Solo-Modus) stehen zu bleiben.
  socket.on('clash:setPartyMode', ({ code, partyMode }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (partyMode !== 'solo' && partyMode !== 'duo') return;
    if (lobby.partyMode === partyMode) return;
    lobby.partyMode = partyMode;
    lobby.players.forEach(p => { p.teamId = null; p.teamSlot = null; });
    const currentMode = registry.getMode(lobby.mode);
    if (!registry.modeAllowsParty(currentMode, partyMode)) {
      const fallback = registry.allModes().find(m => registry.modeAllowsParty(m, partyMode));
      if (fallback) lobby.mode = fallback.id;
    }
    applySuggestedPreset(lobby);
    broadcastLobby(lobby);
  });

  // Spieler wählen ihr eigenes Team; Host/Admin dürfen zusätzlich andere umsetzen (gleiches
  // Muster wie clash:setPlayerSpectator). team: 'A' | 'B' | null (null = Team verlassen).
  socket.on('clash:switchTeam', ({ code, team, targetPlayerId }) => {
    const lobby = lobbies.get(code);
    if (!lobby || lobby.started || lobby.partyMode !== 'duo') return;
    const targetId = targetPlayerId || socket.id;
    if (targetId !== socket.id && !canControl(lobby)) return;
    const player = lobby.players.find(p => p.id === targetId && !p.isAdmin);
    if (!player) return;
    if (team === null) {
      player.teamId = null;
      player.teamSlot = null;
      broadcastLobby(lobby);
      return;
    }
    if (team !== 'A' && team !== 'B') return;
    const teams = teamPlayers(lobby);
    const alreadyInTeam = teams[team][0]?.id === player.id || teams[team][1]?.id === player.id;
    if (!alreadyInTeam && teams[team][0] && teams[team][1]) return; // Team schon voll
    player.teamId = team;
    player.teamSlot = teams[team][0] && teams[team][0].id !== player.id ? 2 : 1;
    broadcastLobby(lobby);
  });

  socket.on('clash:setCardsPerRound', ({ code, count }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    const n = Math.max(2, Math.min(12, Number(count) || 4));
    if (8 * n > getCardPool(lobby).length) return; // Pool reicht für 8 Runden × n Karten nicht
    lobby.cardsPerRound = n;
    clearActivePreset(lobby);
    broadcastLobby(lobby);
  });

  // Host (oder Admin) schließt Karten global vom Draft aus — gilt für alle Spielmodi dieser Lobby
  socket.on('clash:setExcludedCards', ({ code, cardIds }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (!Array.isArray(cardIds)) return;
    const validIds = new Set(ALL_CARDS.map(c => c.id));
    lobby.excludedCards = [...new Set(cardIds.filter(id => validIds.has(id)))];

    // Einstellungen automatisch nach unten anpassen, wenn der geschrumpfte Pool sie nicht mehr zulässt
    const poolSize = getCardPool(lobby).length;
    if (lobby.gridSize * lobby.gridSize > poolSize) {
      lobby.gridSize = Math.max(7, Math.min(11, Math.floor(Math.sqrt(poolSize))));
    }
    const maxPerRound = Math.floor(poolSize / 8); // Auction/Bingo: 8 Runden × Karten pro Runde
    if (lobby.cardsPerRound > maxPerRound) {
      lobby.cardsPerRound = Math.max(2, maxPerRound);
    }
    if (Math.floor(poolSize / lobby.carouselCardsPerTable) < 2) {
      // Größte Tischgröße wählen, die noch mind. 2 Spieler erlaubt
      const fitting = [...CAROUSEL_TABLE_SIZES].reverse().find(s => Math.floor(poolSize / s) >= 2);
      lobby.carouselCardsPerTable = fitting || 8;
    }

    broadcastLobby(lobby);
  });

  socket.on('clash:startGame', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby) || lobby.started) return;
    if (lobby.players.length < 2) return emitClashError(socket, 'needTwoPlayers');
    const mode = registry.modeForLobby(lobby);
    if (!mode) return emitClashError(socket, 'unknownMode');
    const poolSize = getCardPool(lobby).length;

    // Modusspezifische Startbedingung (z.B. Karussel: Pool muss für alle Tische reichen).
    // canStart() liefert { key, params } — der Client übersetzt anhand des Schlüssels.
    const blocked = mode.canStart?.(lobby, poolSize);
    if (blocked) return emitClashError(socket, blocked.key, blocked.params);

    const needed = requiredPoolSize(lobby);
    if (poolSize < needed) {
      return emitClashError(socket, 'poolTooSmall', { needed, available: poolSize });
    }
    lobby.started = true;
    mode.start(lobby, io);
    // Streamer-Automatik: z. B. OBS auf die Minigame-Szene schalten
    emitStreamerEvent(lobby, io, 'gameStart');
    // War die Lobby öffentlich gelistet, verschwindet sie jetzt aus dem Lobby-Browser —
    // mode.start() sendet den eigenen clash:*state-Event an den Raum, nicht broadcastLobby().
    if (lobby.isPublic) io.emit('clash:publicLobbiesUpdate', getPublicLobbies());
  });

  // Deck-Overlay (Browserquelle in OBS) meldet sich mit seinem Overlay-Key an
  socket.on('cr:deckoverlay:join', ({ overlayKey }) => {
    const cfg = crStreamerStore.findByOverlayKey(String(overlayKey || ''));
    if (!cfg) return socket.emit('cr:deckoverlay:error', { message: 'Overlay nicht gefunden' });
    socket.join(`croverlay:${cfg.overlayKey}`);
    socket.emit('cr:deckoverlay:state', {
      obs: cfg.obs,
      actions: cfg.actions,
      lastDecks: cfg.lastDecks,
    });
  });

  // Lobbyeigenes Deck-Overlay (siehe streamerFeed.js) — derselbe Key steht allen
  // Lobbymitgliedern über sanitizeLobby() zur Verfügung, kein Login nötig.
  socket.on('cr:lobbydeck:join', ({ overlayKey }) => {
    const lobby = findLobbyByOverlayKey(String(overlayKey || ''));
    if (!lobby) return socket.emit('cr:lobbydeck:error', { message: 'Overlay nicht gefunden' });
    socket.join(`crlobbydeck:${lobby.overlayKey}`);
    socket.emit('cr:lobbydeck:state', lastDeckFeedPayload(lobby));
  });



  socket.on('clash:requestState', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    socket.emit('clash:lobbyUpdate', sanitizeLobby(lobby));
    emitGameStateTo(socket, lobby);
  });

  // Explizites Verlassen (Leave-Button). Im Gegensatz zu einem Disconnect (Netzwerk-Hänger, Tab-Reload)
  // wirkt das SOFORT — auch während eines laufenden Spiels, ohne Reconnect-Fenster.
  // Der Ack-Callback erlaubt dem Client, erst NACH der Verarbeitung die Verbindung zu trennen.
  socket.on('clash:leaveLobby', ({ code }, ack) => {
    const done = () => { if (typeof ack === 'function') ack(); };
    const lobby = lobbies.get(code);
    if (!lobby) return done();
    const idx = lobby.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return done();
    const leavingPlayer = lobby.players[idx];
    const wasHost = lobby.host === socket.id;
    socket.leave(code);

    // Laufende Runde: aus dem Array darf nicht gespleißt werden (turnOrder hält Indizes),
    // aber der Spieler wird sofort als "gegangen" markiert: unsichtbar in der Lobby-Liste,
    // Zuschauer fürs Spiel, kein Reconnect-Fenster. Endgültig entfernt beim Lobby-Neustart.
    if (lobby.started && lobby.game && !lobby.game.finished) {
      leavingPlayer.left = true;
      leavingPlayer.disconnected = true;
      leavingPlayer.disconnectedAt = Date.now();
      leavingPlayer.isSpectator = true;

      if (lobby.players.filter(p => !p.isAdmin && !p.left).length === 0) {
        removeLobby(lobby);
        return done();
      }
      if (wasHost && !leavingPlayer.isAdmin) {
        const next = lobby.players.find(p => !p.left && !p.disconnected && !p.isAdmin);
        if (next) lobby.host = next.id;
      }
      broadcastLobby(lobby);

      // Spiel-Logik nachziehen (Zug überspringen, Runde auflösen, Figur entfernen …)
      registry.modeForGame(lobby.game)?.onPlayerLeft?.(lobby, io, socket.id);
      return done();
    }

    // Lobby-Phase oder Spielende: sofort komplett entfernen
    lobby.players.splice(idx, 1);
    if (lobbyIsAbandoned(lobby)) {
      removeLobby(lobby);
      return done();
    }
    if (wasHost && !leavingPlayer.isAdmin) {
      const nextHost = lobby.players.find(p => !p.isAdmin && !p.left);
      if (nextHost) lobby.host = nextHost.id;
    }
    broadcastLobby(lobby);
    done();
  });

  socket.on('clash:toggleSpectator', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby || lobby.started) return;
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player) return;
    player.isSpectator = !player.isSpectator;
    broadcastLobby(lobby);
  });








  // ── Karten-Evolution: Host-Einstellungen ────────────────────────────────────
  // Rundenzeiten: Runde 1 & 3 (Picken) teilen sich eine Einstellung, Runde 2 (Sabotage) hat











  socket.on('clash:requestHistory', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby) return;
    socket.emit('clash:historyData', lobby.history || []);
  });

  // Wird sowohl für "Erneut spielen" (nach Spielende) als auch "Spiel abbrechen"
  // (mitten in einer laufenden Runde, host- oder admin-only) genutzt.
  socket.on('clash:restartLobby', ({ code }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !canControl(lobby)) return;
    const wasCancelled = !!(lobby.started && lobby.game && !lobby.game.finished);
    clearTurnTimer(lobby);
    lobby.started = false;
    lobby.game = null;
    // Während des Spiels nur ausgeblendete (aktiv gegangene) Spieler jetzt endgültig entfernen
    lobby.players = lobby.players.filter(p => !p.left);
    lobby.players.forEach(p => { p.deck = []; p.elixir = lobby.startElixir ?? 100; p.bingoGrid = []; p.bingoTokens = 0; p.completedLines = []; p.tokenAbilities = []; });
    io.to(code).emit('clash:lobbyRestart', { cancelled: wasCancelled });
    broadcastLobby(lobby);
  });

  // Admin klinkt sich als sichtbarer, nicht mitspielender Zuschauer in eine beliebige Lobby ein
  socket.on('clash:adminJoinLobby', ({ code }) => {
    if (!isAdmin) return emitClashError(socket, 'noPermission');
    const uCode = (code || '').toUpperCase();
    const lobby = lobbies.get(uCode);
    if (!lobby) return emitClashError(socket, 'lobbyNotFound');

    if (!lobby.players.find(p => p.id === socket.id)) {
      lobby.players.push({
        id: socket.id, name: twitchLogin || 'Admin', color: '#ffffff', avatar: 'admin',
        deck: [], elixir: 0, isSpectator: true, isAdmin: true,
      });
    }
    socket.join(uCode);
    socket.emit('clash:lobbyJoined', { code: uCode, isHost: false, isAdmin: true });
    broadcastLobby(lobby);

    if (lobby.game) {
      socket.emit('clash:gameStart', { mode: lobby.mode });
      // Admin darf die verdeckten Gebote der Auktion sehen
      emitGameStateTo(socket, lobby, { revealBids: true });

      if (lobby.game.finished) {
        socket.emit('clash:gameOver', {
          players: lobby.players.filter(p => !p.isAdmin).map(p => ({
            id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
            deck: p.deck || [], isSpectator: p.isSpectator ?? false,
          })),
        });
      }
    }
  });

  // Admin: tauscht im Endscreen eine Deck-Karte eines Spielers gegen eine beliebige andere
  socket.on('clash:admin:swapCard', ({ code, targetPlayerId, deckIndex, newCardId }) => {
    if (!isAdmin) return emitClashError(socket, 'noPermission');
    const lobby = lobbies.get(code);
    if (!lobby?.game?.finished) return; // nur im Endscreen, nicht während einer laufenden Runde
    const target = lobby.players.find(p => p.id === targetPlayerId && !p.isAdmin);
    if (!target?.deck) return;
    const idx = Number(deckIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= target.deck.length) return;
    const newCard = ALL_CARDS.find(c => c.id === newCardId);
    if (!newCard) return;
    // Keine Duplikate im Deck
    if (target.deck.some((c, i) => i !== idx && c.id === newCard.id)) {
      return emitClashError(socket, 'cardAlreadyInDeck', { card: newCard.name, player: target.name });
    }
    // Champion-Limit (max. 2) gilt auch beim Admin-Tausch
    const champCount = target.deck.filter((c, i) => c.isChampion && i !== idx).length;
    if (newCard.isChampion && champCount >= 2) {
      return emitClashError(socket, 'championLimit');
    }
    target.deck[idx] = { ...newCard };
    // Letzten History-Eintrag mitkorrigieren, damit der Verlauf das finale Deck zeigt
    const hist = lobby.history?.[lobby.history.length - 1];
    const histPlayer = hist?.players.find(p => p.id === targetPlayerId);
    if (histPlayer?.deck?.[idx]) histPlayer.deck[idx] = { ...newCard };
    // Endscreen bei allen aktualisieren
    io.to(code).emit('clash:gameOver', {
      players: lobby.players.filter(p => !p.isAdmin).map(p => ({
        id: p.id, name: p.name, color: p.color, avatar: p.avatar || '',
        deck: p.deck || [], isSpectator: p.isSpectator ?? false,
      })),
    });
    broadcastLobby(lobby);
    // Korrigierte Decks auch ins globale Deck-Overlay übernehmen (ohne OBS-Event)
    updateDeckFeeds(lobby, io);
  });











  socket.on('disconnect', () => {
    for (const [code, lobby] of lobbies.entries()) {
      const idx = lobby.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;
      const player = lobby.players[idx];

      // Spieler hatte die Lobby bereits aktiv verlassen — nichts mehr zu tun
      // (endgültiges Entfernen passiert beim Lobby-Neustart)
      if (player.left) break;

      // Admin-Zuschauer: sofort entfernen, kein 5-Minuten-Reconnect-Slot nötig
      if (player.isAdmin) {
        lobby.players.splice(idx, 1);
        if (lobbyIsAbandoned(lobby)) {
          removeLobby(lobby);
        } else {
          broadcastLobby(lobby);
        }
        break;
      }

      // During active game: mark disconnected, keep slot for 5-minute reconnect window
      if (lobby.started && lobby.game && !lobby.game.finished) {
        player.disconnected    = true;
        player.disconnectedAt  = Date.now();
        if (lobby.host === socket.id) {
          player.wasHost = true;
          const next = lobby.players.find(p => p.id !== socket.id && !p.disconnected && !p.isAdmin);
          if (next) lobby.host = next.id;
        }
        broadcastLobby(lobby);

        // Zug überspringen bzw. Runde auflösen, falls die Verbindung den Ablauf blockiert
        registry.modeForGame(lobby.game)?.onPlayerDisconnected?.(lobby, io, socket.id);

        // Remove after 5 minutes if still disconnected
        setTimeout(() => {
          const l = lobbies.get(code);
          if (!l) return;
          const pi = l.players.findIndex(p => p.id === socket.id && p.disconnected && !p.left);
          if (pi === -1) return;
          // Läuft das Spiel noch, nicht aus dem Array spleißen (turnOrder hält Indizes!) —
          // nur ausblenden; endgültig entfernt wird beim Lobby-Neustart
          if (l.started && l.game && !l.game.finished) {
            l.players[pi].left = true;
            l.players[pi].isSpectator = true;
            // War das der Letzte, bleibt eine geisterhafte Lobby zurück — die räumen wir hier auf
            if (lobbyIsAbandoned(l)) { removeLobby(l); return; }
            broadcastLobby(l);
            return;
          }
          l.players.splice(pi, 1);
          if (lobbyIsAbandoned(l)) removeLobby(l);
          else broadcastLobby(l);
        }, 5 * 60 * 1000);
        break;
      }

      // Not in active game: kurze Gnadenfrist statt Sofort-Entfernung — ein simpler Reconnect
      // (Socket.io vergibt dabei eine neue socket.id) sollte die Lobby nicht sofort zerstören.
      player.disconnected   = true;
      player.disconnectedAt = Date.now();
      if (lobby.host === socket.id) {
        player.wasHost = true;
        const next = lobby.players.find(p => p.id !== socket.id && !p.disconnected && !p.isAdmin);
        if (next) lobby.host = next.id;
      }
      broadcastLobby(lobby);

      setTimeout(() => {
        const l = lobbies.get(code);
        if (!l) return;
        const pi = l.players.findIndex(p => p.id === socket.id && p.disconnected);
        if (pi === -1) return; // in der Zwischenzeit reconnected
        l.players.splice(pi, 1);
        if (lobbyIsAbandoned(l)) removeLobby(l);
        else broadcastLobby(l);
      }, LOBBY_DISCONNECT_GRACE_MS);
      break;
    }
  });

  // Disconnect: check if remaining active players all bid
  // (old duplicate restartLobby removed — now handled above with history preservation)
}

// ── HTTP ───────────────────────────────────────────────────────────────────
function createClashRoyaleRouter({ requireAuth, STREAMER_TWITCH_ID } = {}) {
  const router = express.Router();

  router.get('/lobby/:code', (req, res) => {
    const lobby = lobbies.get(req.params.code.toUpperCase());
    if (!lobby) return res.status(404).json({ error: 'Lobby nicht gefunden' });
    res.json(sanitizeLobby(lobby));
  });

  // Öffentlich: Daten fürs lobbyeigene Deck-Overlay (der Key ist das Geheimnis, siehe
  // lobbies.js). Initial-Ladung + Polling-Fallback der Overlay-Seite; Live-Updates laufen
  // über den Socket-Handler cr:lobbydeck:join oben.
  router.get('/lobby-overlay/:overlayKey', (req, res) => {
    const lobby = findLobbyByOverlayKey(req.params.overlayKey);
    if (!lobby) return res.status(404).json({ error: 'Overlay nicht gefunden' });
    res.json(lastDeckFeedPayload(lobby));
  });

  if (requireAuth) {
    router.get('/admin/lobbies', requireAuth, (req, res) => {
      if (String(req.twitchId) !== String(STREAMER_TWITCH_ID)) {
        return res.status(403).json({ error: 'Access Denied' });
      }
      res.json(getActiveLobbiesForAdmin());
    });
  }

  return router;
}

module.exports = { createClashRoyaleRouter, registerClashRoyaleSocket, ALL_CARDS };
