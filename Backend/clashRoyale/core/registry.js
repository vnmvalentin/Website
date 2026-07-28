// Modus-Registry.
//
// Jeder Spielmodus meldet sich hier mit einem Deskriptor an. Das Grundgerüst (Lobby-
// Verwaltung, Socket-Handler) fragt danach nur noch die Registry, statt an einem Dutzend
// Stellen `else if (mode === '…')` zu führen. Genau diese verstreuten Ketten hatten dazu
// geführt, dass card-evolution, angel-royale und dark-maze in je einer davon fehlten und
// der Fallback in einen TypeError lief.
//
// Deskriptor (alle Felder außer id/start optional):
//
//   id            Modus-Kennung, identisch mit lobby.mode
//   gameType      Wert von lobby.game.type; Snake setzt historisch keinen → weglassen
//   settings      { feldName: SettingSpec } — modus-EXKLUSIVE Lobby-Einstellungen.
//                 Von mehreren Modi genutzte Felder (timerSeconds, cardsPerRound …)
//                 bleiben Teil der Lobby-Grundausstattung.
//   requiredPool(lobby, activeCount) -> number|null   Mindestgröße des Kartenpools
//   canStart(lobby, poolSize) -> string|null          Fehlermeldung statt Start
//   start(lobby, io)                                  Spiel aufsetzen und broadcasten
//   buildState(lobby, socket, opts) -> payload        Stand für EINEN Socket
//   remapPlayerId(game, oldId, newId)                 Reconnect: neue socket.id einhängen
//   onTimerExpire(lobby, io)                          Rundentimer abgelaufen
//   onPlayerLeft(lobby, io, playerId)                 Spieler hat aktiv verlassen
//   onPlayerDisconnected(lobby, io, playerId)         Verbindung weg (Reconnect möglich)
//   onSpectatorChanged(lobby, io, player)             Zuschauerstatus umgeschaltet
//   socketHandlers { event: fn(ctx, payload) }        modus-eigene Socket-Events;
//                 ctx = { socket, io, canControl }. Die Handler prüfen ihre
//                 Vorbedingungen selbst — so wie vorher als freistehende Handler.
//
// SettingSpec:
//   default       Startwert einer frischen Lobby
//   event         Socket-Event, mit dem der Host das Feld setzt (optional)
//   payloadKey    Feldname im Event-Payload (Standard: 'value')
//   duringGame    true = auch während einer laufenden Runde änderbar (Standard: false)
//   sanitize(v, lobby) -> Wert | undefined            undefined lehnt die Änderung ab
//   afterChange(lobby, io)                            Zusatzarbeit nach der Änderung

const modes = new Map();

function registerMode(descriptor) {
  if (!descriptor?.id) throw new Error('Modus-Deskriptor braucht eine id');
  if (typeof descriptor.start !== 'function') throw new Error(`Modus ${descriptor.id} braucht start()`);
  if (modes.has(descriptor.id)) throw new Error(`Modus ${descriptor.id} ist bereits registriert`);

  // Ein Einstellungsfeld darf nur einem Modus gehören — sonst überschreiben sich die
  // Standardwerte gegenseitig, je nach Registrierungsreihenfolge.
  for (const key of Object.keys(descriptor.settings || {})) {
    for (const other of modes.values()) {
      if (other.settings?.[key]) {
        throw new Error(`Einstellung "${key}" ist bereits von Modus ${other.id} belegt`);
      }
    }
  }

  modes.set(descriptor.id, descriptor);
  return descriptor;
}

const getMode = (id) => modes.get(id) || null;

// lobby.game.type ist bei Snake historisch nicht gesetzt — dort auf 'snake' zurückfallen
const modeForGame = (game) => (game ? modes.get(game.type || 'snake') || null : null);

const modeForLobby = (lobby) => (lobby ? modes.get(lobby.mode) || null : null);

const modeIds = () => [...modes.keys()];

const allModes = () => [...modes.values()];

function eachSetting(fn) {
  for (const mode of modes.values()) {
    for (const [key, spec] of Object.entries(mode.settings || {})) fn(key, spec, mode);
  }
}

const specDefault = (spec) => (typeof spec.default === 'function' ? spec.default() : spec.default);

// Standardwerte aller Modi für eine frisch erstellte Lobby
function defaultSettings() {
  const out = {};
  eachSetting((key, spec) => { out[key] = specDefault(spec); });
  return out;
}

// Einstellungen aller Modi für den Client. Bewusst ?? statt ||, damit gültige
// Nullwerte erhalten bleiben — der Angel-Cooldown 0 ("kein Cooldown") ist ein echter
// Wert und darf nicht auf den Standard zurückfallen.
function publicSettings(lobby) {
  const out = {};
  eachSetting((key, spec) => { out[key] = lobby[key] ?? specDefault(spec); });
  return out;
}

// Spezifikation einer einzelnen Modus-Einstellung (für Presets: dieselbe sanitize()-Prüfung
// wie beim manuellen Setzen über den Socket-Handler)
function getSettingSpec(key) {
  let found = null;
  eachSetting((k, spec) => { if (k === key) found = spec; });
  return found;
}

// Alle Einstellungen mit Socket-Event, für die generische Handler-Registrierung
function settingEvents() {
  const out = [];
  eachSetting((key, spec) => { if (spec.event) out.push({ key, spec }); });
  return out;
}

// Modus-eigene Socket-Events, flach über alle Modi
function modeSocketHandlers() {
  const out = [];
  for (const mode of modes.values()) {
    for (const [event, handler] of Object.entries(mode.socketHandlers || {})) {
      out.push({ event, handler, mode });
    }
  }
  return out;
}

module.exports = {
  registerMode,
  getMode,
  modeForGame,
  modeForLobby,
  modeIds,
  allModes,
  defaultSettings,
  publicSettings,
  getSettingSpec,
  settingEvents,
  modeSocketHandlers,
};
