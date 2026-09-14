// Fehlermeldungen der Clash-Royale-Engine.
//
// Bis hierher schickte der Server fertige deutsche Sätze an den Client. Das Frontend ist
// aber zweisprachig — englische Spieler bekamen mitten in einer englischen Oberfläche
// "Max. 2 Champions pro Deck!" zu sehen.
//
// Jetzt geht zu jedem Fehler ein SCHLÜSSEL plus seine Platzhalter mit:
//
//     { key: 'championLimit', params: {}, message: 'Max. 2 Champions pro Deck!' }
//
// Der Client übersetzt anhand des Schlüssels. Das deutsche `message` bleibt bewusst
// erhalten: Es ist die Rückfallebene für Schlüssel, die ein Client noch nicht kennt
// (z.B. ein alter, offener Tab nach einem Deploy) — ohne sie stünde dort gar nichts.

const MESSAGES = {
  // ── Lobby / Beitritt ──────────────────────────────────────────────────────
  lobbyNotFound: () => 'Lobby nicht gefunden',
  nameRequired: () => 'Bitte Namen eingeben',
  gameInProgress: () => 'Spiel läuft bereits',
  lobbyLocked: () => 'Lobby ist gesperrt',
  lobbyFull: ({ max }) => `Lobby voll (max. ${max})`,
  noPermission: () => 'Keine Berechtigung',

  // ── Spielstart ────────────────────────────────────────────────────────────
  needTwoPlayers: () => 'Mindestens 2 Spieler benötigt',
  unknownMode: () => 'Unbekannter Spielmodus',
  poolTooSmall: ({ needed, available }) =>
    `Kartenpool zu klein: ${needed} Karten benötigt, nur ${available} verfügbar. Schließe weniger Karten aus!`,
  carouselTooManyPlayers: ({ perTable, maxPlayers, poolSize }) =>
    `Bei ${perTable} Karten pro Tisch sind max. ${maxPlayers} Spieler möglich (Kartenpool: ${poolSize})!`,
  teamsNotReady: () => 'Beide Teams brauchen genau 2 Spieler (Slot 1 + Slot 2)!',

  // ── Modusübergreifend ─────────────────────────────────────────────────────
  championLimit: () => 'Max. 2 Champions pro Deck!',
  deckFull: () => 'Dein Deck ist bereits voll!',
  cardTaken: () => 'Diese Karte ist bereits vergeben!',

  // ── Snake Royale ──────────────────────────────────────────────────────────
  cardNotAdjacent: () => 'Karte nicht benachbart',

  // ── Elixir Auction ────────────────────────────────────────────────────────
  championLimitBid: () => 'Du hast bereits 2 Champions — kein weiterer möglich!',

  // ── Bingo Royale ──────────────────────────────────────────────────────────
  cardAlreadyPicked: () => 'Karte bereits gewählt',
  cellOccupied: () => 'Feld bereits belegt',
  attributeCellRequired: () => 'Die Karte passt auf ein freies Attribut-Feld — dort muss sie platziert werden!',
  invalidPowerup: () => 'Ungültiges Power-Up',

  // ── Blindes Karussell ─────────────────────────────────────────────────────
  noRevealsLeft: () => 'Keine Aufdeckungen mehr übrig in dieser Runde!',
  alreadyPicked: () => 'Du hast bereits gewählt!',
  revealBeforePick: ({ needed, done }) =>
    `Erst aufdecken, dann nehmen — ${done}/${needed} Aufdeckungen genutzt.`,

  // ── Karten-Evolution ──────────────────────────────────────────────────────
  cardLocked: () => 'Diese Karte ist gelockt.',
  cannotUpgrade: () => 'Diese Karte kann nicht weiter aufgewertet werden.',
  notEnoughTokens: () => 'Nicht genug Evolution-Tokens.',
  notEnoughTokensLock: () => 'Nicht genug Tokens zum Locken.',
  notEnoughTokensSabotage: () => 'Nicht genug Tokens zum Sabotieren.',
  championLimitEvolution: () => 'Champion-Limit erreicht (max. 2).',
  notEnoughOfRarity: ({ rarity }) => `Nicht genug ${rarity}-Karten im Pool (2 nötig).`,
  noneOfRarityLeft: ({ rarity }) => `Keine ${rarity}-Karten mehr im Pool.`,
  poolEmpty: () => 'Keine Karten mehr im Pool.',
  alreadyPending: () => 'Du hast bereits eine offene Wahl.',

  // ── Fallensteller ─────────────────────────────────────────────────────────
  trapGridTooSmall: ({ active, disguiseCount, gridSize }) =>
    `Bei ${disguiseCount} Falle(n) pro Spieler und ${active} Spielern reicht ein ${gridSize}er-Raster nicht — größeres Raster wählen oder weniger Fallen pro Spieler!`,

  // ── Account-Verknüpfung / Tracking ────────────────────────────────────────
  apiNotConfigured: () => 'Die Clash-Royale-API ist auf diesem Server nicht eingerichtet.',
  invalidTag: () => 'Ungültiger Spieler-Tag. Er steht im Spiel unter deinem Namen im Profil.',
  tagNotFound: () => 'Zu diesem Tag wurde kein Spieler gefunden.',
  tagLookupFailed: () => 'Der Tag konnte gerade nicht geprüft werden — bitte später erneut versuchen.',
  noLinkedAccounts: () => 'Kein Spieler hat bisher einen Clash-Royale-Account verknüpft.',

  // ── Admin ─────────────────────────────────────────────────────────────────
  cardAlreadyInDeck: ({ card, player }) => `${card} ist bereits im Deck von ${player}`,
};

/** Fehler-Nutzlast bauen — für Stellen, die ihn nicht selbst verschicken (z.B. canStart). */
function clashError(key, params = {}) {
  const build = MESSAGES[key];
  return {
    key,
    params,
    // Kein passender Eintrag? Dann lieber den Schlüssel zeigen als eine leere Blase —
    // so fällt ein vergessener Text im Test sofort auf.
    message: build ? build(params) : key,
  };
}

/** Fehler an genau einen Socket schicken. */
function emitClashError(socket, key, params = {}) {
  socket.emit('clash:error', clashError(key, params));
}

module.exports = { clashError, emitClashError, MESSAGES };
