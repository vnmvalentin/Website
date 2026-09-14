// Lobby-Registrierung und modusunabhängige Helfer.
//
// Die lobbies-Map ist der einzige geteilte Zustand der gesamten Clash-Royale-Engine:
// Schlüssel ist der 6-stellige Lobby-Code, Wert das Lobby-Objekt mit players/game/Einstellungen.
// Bewusst modulweit — genau ein Prozess bedient alle Lobbys.

const { nanoid } = require('nanoid');
const registry = require('./registry');
const { presetsForLobby } = require('./modePresets');
const { trackingScoreFor } = require('./crTracking');

const lobbies = new Map();

// Die Liste gültiger Modi führt die Registry (registry.modeIds()) — sie ergibt sich
// aus den tatsächlich angemeldeten Modi, damit sie nicht getrennt gepflegt werden muss.

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316',
];

// Kurze Gnadenfrist bei Disconnect in der Lobby-Phase (Socket.io-Reconnects vergeben eine neue
// socket.id — ohne Gnadenfrist würde ein kurzer Netzwerk-Hänger die frisch erstellte Lobby sofort löschen).
const LOBBY_DISCONNECT_GRACE_MS = 30 * 1000;

const MAX_PLAYERS_PER_LOBBY = 8;

// Ohne I, O, 0 und 1 — die verwechselt man beim Vorlesen im Stream zu leicht
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Eigenes Geheimnis fürs lobbyeigene Deck-Overlay (siehe streamerFeed.js) — bewusst NICHT
// der Lobby-Code: der Code öffnet die Lobby selbst (wird zum Beitreten geteilt), der
// Overlay-Link ist nur lesbar und soll unabhängig davon weitergegeben werden können, ohne
// dabei aus Versehen auch den Beitritts-Code preiszugeben.
function generateOverlayKey() {
  return nanoid(14);
}

// Test-Bots: eine "bot-"-Vorsilbe genügt, damit man eine ID beim Debuggen sofort als Bot
// erkennt — Kollisionen mit echten socket.id-Werten sind wegen des Präfixes ausgeschlossen.
function generateBotId() {
  return `bot-${nanoid(10)}`;
}

// Lobbyeigenes Deck-Overlay: über die ganze Sitzung hinweg dieselbe Adresse, egal wie oft
// die Lobby neu startet — jeder Spieler kann sie kopieren, nicht nur ein eingeloggter
// Streamer (siehe crStreamerStore.js für die Variante pro Twitch-Account).
function findLobbyByOverlayKey(overlayKey) {
  if (!overlayKey) return null;
  for (const lobby of lobbies.values()) {
    if (lobby.overlayKey === overlayKey) return lobby;
  }
  return null;
}

// Ist niemand mehr da, der die Lobby am Leben hält? Spieler mit left=true bleiben während
// einer laufenden Runde im Array (turnOrder hält Indizes!), sind aber effektiv weg — sie
// dürfen eine leere Lobby nicht am Leben halten. Admin-Beobachter zählen ebenfalls nicht.
function lobbyIsAbandoned(lobby) {
  return lobby.players.filter(p => !p.isAdmin && !p.left).length === 0;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Lobby-Zustand für die Clients. Wird auch aus den Modi heraus aufgerufen (z.B. wenn ein
// Pick das Deck verändert), deshalb liegt die Funktion im Core und nicht in der Route.
function sanitizeLobby(lobby) {
  return {
    code: lobby.code,
    // Lesbar für alle Lobbymitglieder — öffnet nur das Deck-Overlay (siehe oben), nicht
    // die Lobby selbst, ist also kein Geheimnis auf demselben Niveau wie der Code.
    overlayKey: lobby.overlayKey,
    mode: lobby.mode,
    // 'solo' (Standard) | 'duo' — schaltet um, welche Modi wählbar sind (registry.
    // modeAllowsParty) und ob die Spielerliste Teams zeigt.
    partyMode: lobby.partyMode || 'solo',
    host: lobby.host,
    timerSeconds: lobby.timerSeconds,
    tokenShopTimerSeconds: lobby.tokenShopTimerSeconds ?? 60,
    cardsPerRound: lobby.cardsPerRound || 4,
    // Modus-eigene Einstellungen liefert die Registry — ein neuer Modus bringt seine
    // Felder selbst mit und muss hier nicht mehr eingetragen werden
    ...registry.publicSettings(lobby),
    // Fertige Einstellungs-Sätze des aktuellen Modus ("Vorgeschlagen", "Blitz", "Chaos") mit
    // ihren konkreten Werten: der Client baut daraus die Buttons und erkennt am Wertevergleich,
    // welches Preset gerade aktiv ist — so muss er die Werte nicht doppelt pflegen.
    modePresets: presetsForLobby(lobby),
    // Welches Preset gerade gesetzt ist (null, sobald der Host einen Regler selbst anfasst).
    // Der Client hebt danach den passenden Button hervor — auch wenn ein einzelner
    // Preset-Wert am Kartenpool gescheitert ist und deshalb nicht exakt übernommen wurde.
    activePresetId: lobby.activePresetId ?? null,
    excludedCards: lobby.excludedCards || [],
    // Gesperrte Lobby: keine NEUEN Spieler mehr. Bewusst auch für Gäste sichtbar —
    // wer den Code hat und nicht reinkommt, soll den Grund sehen statt eine
    // kommentarlose Fehlermeldung.
    locked: !!lobby.locked,
    // Öffentlich = taucht im Lobby-Browser auf ("Lobby beitreten" im Hub) und ist dort
    // ohne Code anklickbar. Intern hat die Lobby weiterhin einen Code (Raum-Mechanismus,
    // Einladungslink) — "ohne Code" heißt für den Spieler nur: nicht selbst eintippen.
    isPublic: !!lobby.isPublic,
    // Damit die Lobby "3/8 Spieler" anzeigen kann, ohne die Zahl im Client zu doppeln
    maxPlayers: MAX_PLAYERS_PER_LOBBY,
    // Tracking über die offizielle API (siehe crTracking.js). Die internen Zeitstempel
    // (cursors) bleiben bewusst hier — der Client braucht nur an/aus und die Stände.
    trackingEnabled: !!lobby.tracking?.enabled,
    trackingStartedAt: lobby.tracking?.startedAt ?? null,
    historyCount: lobby.history?.length || 0,
    // Aktiv gegangene Spieler tauchen in der Lobby-Liste nicht mehr auf
    players: lobby.players.filter(p => !p.left).map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || 'knight',
      // Profilbild-Option "Twitch-Bild verwenden" — echte Bild-URL statt eines der festen
      // Avatare; null wenn nicht gesetzt, dann greift PlayerAvatar auf `avatar` zurück.
      avatarUrl: p.avatarUrl || null,
      deck: p.deck || [], elixir: p.elixir ?? (lobby.startElixir ?? 100),
      isSpectator: p.isSpectator ?? false, disconnected: p.disconnected ?? false,
      isAdmin: p.isAdmin ?? false,
      // Test-Bot statt echter Verbindung (siehe generateBotId) — steuert sich in den
      // Duo-2v2-Modi selbst, damit man nicht für jeden Test 4 echte Leute braucht.
      isBot: p.isBot ?? false,
      // Duo-Team-Zuordnung (siehe core/teams.js) — null solange partyMode 'solo' ist oder
      // der Spieler noch keinem Team beigetreten ist.
      teamId: p.teamId ?? null, teamSlot: p.teamSlot ?? null,
      // Verknüpfter Clash-Royale-Account. Der Tag ist öffentlich (er steht im Spielprofil
      // und wird zum Zuschauen weitergegeben), enthält also nichts Schützenswertes.
      crTag: p.crTag || null,
      crName: p.crName || null,
      crScore: trackingScoreFor(lobby, p.id),
    })),
    started: lobby.started,
  };
}

// ── Admin: Übersicht aller aktuell laufenden Lobbys ─────────────────────────
function getActiveLobbiesForAdmin() {
  return [...lobbies.values()]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(l => {
      const realPlayers = l.players.filter(p => !p.isAdmin && !p.left);
      const hostPlayer = l.players.find(p => p.id === l.host);
      return {
        code: l.code,
        mode: l.mode,
        phase: !l.started ? 'lobby' : (l.game?.finished ? 'finished' : 'playing'),
        playerCount: realPlayers.length,
        hostName: hostPlayer?.name || '—',
        createdAt: l.createdAt || null,
      };
    });
}

// ── Lobby-Browser: öffentliche, offene Lobbies ──────────────────────────────
// Gezeigt im Hub unter "Lobby beitreten" — jeder Besucher sieht diese Liste, auch ohne
// Login. Der Code steht mit drin (anders als bei getActiveLobbiesForAdmin sind das nur
// Lobbies, die der Host SELBST als öffentlich markiert hat — ihr Code ist kein Geheimnis
// mehr, der Host will ja gefunden werden). Gesperrte/gestartete Lobbies fehlen: gesperrt
// nimmt ohnehin niemanden mehr auf, gestartet ist nichts mehr zum Beitreten da.
function getPublicLobbies() {
  return [...lobbies.values()]
    .filter(l => l.isPublic && !l.locked && !l.started)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(l => {
      const realPlayers = l.players.filter(p => !p.isAdmin && !p.left);
      const hostPlayer = l.players.find(p => p.id === l.host);
      return {
        code: l.code,
        mode: l.mode,
        playerCount: realPlayers.length,
        maxPlayers: MAX_PLAYERS_PER_LOBBY,
        hostName: hostPlayer?.name || '—',
        createdAt: l.createdAt || null,
      };
    });
}

module.exports = {
  lobbies,
  PLAYER_COLORS,
  LOBBY_DISCONNECT_GRACE_MS,
  MAX_PLAYERS_PER_LOBBY,
  generateCode,
  generateOverlayKey,
  generateBotId,
  findLobbyByOverlayKey,
  lobbyIsAbandoned,
  shuffle,
  getPublicLobbies,
  sanitizeLobby,
  getActiveLobbiesForAdmin,
};
