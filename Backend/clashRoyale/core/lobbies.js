// Lobby-Registrierung und modusunabhängige Helfer.
//
// Die lobbies-Map ist der einzige geteilte Zustand der gesamten Clash-Royale-Engine:
// Schlüssel ist der 6-stellige Lobby-Code, Wert das Lobby-Objekt mit players/game/Einstellungen.
// Bewusst modulweit — genau ein Prozess bedient alle Lobbys.

const registry = require('./registry');
const { presetsForLobby } = require('./modePresets');

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
    mode: lobby.mode,
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
    historyCount: lobby.history?.length || 0,
    // Aktiv gegangene Spieler tauchen in der Lobby-Liste nicht mehr auf
    players: lobby.players.filter(p => !p.left).map(p => ({
      id: p.id, name: p.name, color: p.color, avatar: p.avatar || 'knight',
      deck: p.deck || [], elixir: p.elixir ?? (lobby.startElixir ?? 100),
      isSpectator: p.isSpectator ?? false, disconnected: p.disconnected ?? false,
      isAdmin: p.isAdmin ?? false,
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

module.exports = {
  lobbies,
  PLAYER_COLORS,
  LOBBY_DISCONNECT_GRACE_MS,
  MAX_PLAYERS_PER_LOBBY,
  generateCode,
  lobbyIsAbandoned,
  shuffle,
  sanitizeLobby,
  getActiveLobbiesForAdmin,
};
