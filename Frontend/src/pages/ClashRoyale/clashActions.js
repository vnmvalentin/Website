// Alle Lobby- und Spielaktionen an einer Stelle.
//
// Jede Aktion ist ein Einzeiler auf emitToLobby, der nur den Lobby-Code ergänzt. Der
// Wert dieser Datei ist nicht die Logik, sondern die Vollständigkeit: sie ist die
// einzige Stelle im Frontend, an der Socket-Event-Namen stehen. Vorher waren sie über
// 3000 Zeilen JSX verstreut, und beim Nachrüsten eines Modus fiel regelmäßig auf, dass
// ein Event irgendwo fehlte.
//
// Rückfragen (window.confirm) gehören bewusst NICHT hierher — die brauchen übersetzte
// Texte und sind damit Sache des jeweiligen Screens.

/**
 * @param {Function} emitToLobby  (event, payload) → sendet mit dem aktuellen Lobby-Code
 * @param {Function} setMyBid     Optimistische Anzeige des eigenen Gebots (Auktion)
 */
export function createClashActions(emitToLobby, setMyBid) {
  return {
    // ── Lobby-Verwaltung ────────────────────────────────────────────────────
    startGame: () => emitToLobby('clash:startGame'),
    restartLobby: () => emitToLobby('clash:restartLobby'),
    kickPlayer: (playerId) => emitToLobby('clash:kickPlayer', { playerId }),
    addBot: () => emitToLobby('clash:addBot'),
    setLobbyLocked: (locked) => emitToLobby('clash:setLobbyLocked', { locked }),
    setLobbyPublic: (isPublic) => emitToLobby('clash:setLobbyPublic', { isPublic }),

    // ── Clash-Royale-Account & Tracking ─────────────────────────────────────
    // Diese drei antworten per Ack, weil der Client auf das Ergebnis wartet: ob der Tag
    // gültig war bzw. ob das Tracking überhaupt starten konnte. Als Promise verpackt,
    // damit die Dialoge sie mit await benutzen können.
    linkCrAccount: (targetPlayerId, tag) => new Promise(resolve =>
      emitToLobby('clash:linkCrAccount', { targetPlayerId, tag }, resolve)),
    unlinkCrAccount: (targetPlayerId) =>
      emitToLobby('clash:unlinkCrAccount', { targetPlayerId }),
    setTracking: (enabled) => new Promise(resolve =>
      emitToLobby('clash:setTracking', { enabled }, resolve)),
    transferHost: (targetPlayerId) => emitToLobby('clash:transferHost', { targetPlayerId }),
    toggleSpectator: () => emitToLobby('clash:toggleSpectator'),
    setPlayerSpectator: (targetPlayerId, isSpectator) =>
      emitToLobby('clash:setPlayerSpectator', { targetPlayerId, isSpectator }),
    setMode: (mode) => emitToLobby('clash:setMode', { mode }),
    // ── Solo/Duo & Teams ─────────────────────────────────────────────────────
    setPartyMode: (partyMode) => emitToLobby('clash:setPartyMode', { partyMode }),
    switchTeam: (team, targetPlayerId) => emitToLobby('clash:switchTeam', { team, targetPlayerId }),
    applyPreset: (presetId) => emitToLobby('clash:applyModePreset', { presetId }),
    setExcludedCards: (cardIds) => emitToLobby('clash:setExcludedCards', { cardIds }),
    // Kartenpool auf die Schnittmenge der freigeschalteten Karten aller verknüpften Spieler
    // zuschneiden — per Ack, der Client zeigt Erfolg/Fehler direkt im Kartenpool-Dialog an.
    trimPoolToUnlocked: () => new Promise(resolve =>
      emitToLobby('clash:trimPoolToUnlocked', {}, resolve)),

    // ── Modusübergreifende Einstellungen ────────────────────────────────────
    setTimer: (seconds) => emitToLobby('clash:setTimer', { seconds }),
    setCardsPerRound: (count) => emitToLobby('clash:setCardsPerRound', { count }),

    // ── Snake Royale ────────────────────────────────────────────────────────
    setGridSize: (size) => emitToLobby('clash:setGridSize', { size }),
    pickCard: (cellIndex) => emitToLobby('clash:pickCard', { cellIndex }),

    // ── Elixir Auction ──────────────────────────────────────────────────────
    setStartElixir: (amount) => emitToLobby('clash:setStartElixir', { amount }),
    setShowElixir: (show) => emitToLobby('clash:setShowElixir', { show }),
    setMotherWitch: (enabled) => emitToLobby('clash:setMotherWitch', { enabled }),
    auctionBid: (cardIndex, amount) => {
      // Sofort anzeigen — die Bestätigung des Servers kommt erst mit der Auflösung
      // der Runde, bis dahin soll das eigene Gebot nicht "verschluckt" wirken.
      setMyBid?.({ cardIndex, amount });
      emitToLobby('clash:auction:bid', { cardIndex, amount });
    },
    motherWitchRespond: (accept) => emitToLobby('clash:motherWitch:respond', { accept }),

    // ── Elixir Auction 2v2 ───────────────────────────────────────────────────
    setTeamElixirPool: (amount) => emitToLobby('clash:setTeamElixirPool', { amount }),
    auction2v2SendHint: (cardIndex, tagIds) => emitToLobby('clash:auction2v2:hint', { cardIndex, tagIds }),
    auction2v2Bid: (cardIndex, amount) => emitToLobby('clash:auction2v2:bid', { cardIndex, amount }),

    // ── Bingo Royale ────────────────────────────────────────────────────────
    setTokenShopTimer: (seconds) => emitToLobby('clash:setTokenShopTimer', { seconds }),
    bingoPick: (cardIndex, bingoCell) => emitToLobby('clash:bingo:pick', { cardIndex, bingoCell }),
    bingoPowerup: (type, params) => emitToLobby('clash:bingo:powerup', { type, ...params }),
    // Live-Übertragung der Token-Shop-Auswahl an alle Mitspieler
    bingoTokenAction: (data) => emitToLobby('clash:bingo:tokenAction', { ...data }),

    // ── Blindes Karussell ───────────────────────────────────────────────────
    setCarouselCards: (count) => emitToLobby('clash:setCarouselCards', { count }),
    setCarouselReveal: (mode) => emitToLobby('clash:setCarouselReveal', { mode }),
    carouselFlip: (slotIdx) => emitToLobby('clash:carousel:flip', { slotIdx }),
    carouselPick: (slotIdx) => emitToLobby('clash:carousel:pick', { slotIdx }),

    // ── Elixir Rush ─────────────────────────────────────────────────────────
    setRushMarketSize: (count) => emitToLobby('clash:setRushMarketSize', { count }),
    setRushLifetime: (seconds) => emitToLobby('clash:setRushLifetime', { seconds }),
    setRushShowElixir: (show) => emitToLobby('clash:setRushShowElixir', { show }),
    setRushShowTimer: (show) => emitToLobby('clash:setRushShowTimer', { show }),
    rushBuy: (slotIdx, seq) => emitToLobby('clash:rush:buy', { slotIdx, seq }),

    // ── Elixir Rush 2v2 ──────────────────────────────────────────────────────
    setRush2v2MarketSize: (count) => emitToLobby('clash:setRush2v2MarketSize', { count }),
    setRush2v2Lifetime: (seconds) => emitToLobby('clash:setRush2v2Lifetime', { seconds }),
    setRush2v2MaxElixir: (amount) => emitToLobby('clash:setRush2v2MaxElixir', { amount }),
    rush2v2Buy: (slotIdx, seq) => emitToLobby('clash:rush2v2:buy', { slotIdx, seq }),

    // ── Karten-Evolution ────────────────────────────────────────────────────
    setEvolutionPickSeconds: (seconds) => emitToLobby('clash:setEvolutionPickSeconds', { seconds }),
    setEvolutionSabotageSeconds: (seconds) => emitToLobby('clash:setEvolutionSabotageSeconds', { seconds }),
    setEvolutionTokens: (count) => emitToLobby('clash:setEvolutionTokens', { count }),
    evoAction: (slotIdx, direction) => emitToLobby('clash:evo:action', { slotIdx, direction }),
    evoResolvePending: (chosenIndex) => emitToLobby('clash:evo:resolvePending', { chosenIndex }),
    evoLock: (slotIdx) => emitToLobby('clash:evo:lock', { slotIdx }),
    evoSabotage: (targetPlayerId, slotIdx) => emitToLobby('clash:evo:sabotage', { targetPlayerId, slotIdx }),

    // ── Angel Royale ────────────────────────────────────────────────────────
    setFishSpawnRate: (rate) => emitToLobby('clash:setFishSpawnRate', { rate }),
    setFishCooldown: (seconds) => emitToLobby('clash:setFishCooldown', { seconds }),
    setFishIdle: (seconds) => emitToLobby('clash:setFishIdle', { seconds }),
    fishCatch: (fishId) => emitToLobby('clash:fish:catch', { fishId }),

    // ── Dunkles Labyrinth ───────────────────────────────────────────────────
    setMazeTime: (seconds) => emitToLobby('clash:setMazeTime', { seconds }),
    // seq quittiert der Server zurück — daran hängt die Positions-Korrektur im Client
    mazeMove: (dir, seq) => emitToLobby('clash:maze:move', { dir, seq }),
    mazePickup: () => emitToLobby('clash:maze:pickup'),
    mazeDraftPick: (choice) => emitToLobby('clash:maze:draftPick', { choice }),
    mazeJokerPick: (cardId) => emitToLobby('clash:maze:jokerPick', { cardId }),
    mazeCloseDraft: () => emitToLobby('clash:maze:closeDraft'),

    // ── Fallensteller ───────────────────────────────────────────────────────
    setTrapDisguiseSeconds: (seconds) => emitToLobby('clash:setTrapDisguiseSeconds', { seconds }),
    setTrapDisguiseCount: (count) => emitToLobby('clash:setTrapDisguiseCount', { count }),
    setTrapGridSize: (size) => emitToLobby('clash:setTrapGridSize', { size }),
    trapChooseBadCard: (badCardIndex) => emitToLobby('clash:trap:chooseBadCard', { badCardIndex }),
    trapChooseTarget: (targetIndex) => emitToLobby('clash:trap:chooseTarget', { targetIndex }),
    trapClick: (cellIndex) => emitToLobby('clash:trap:click', { cellIndex }),

    // ── Pyramidendraft ──────────────────────────────────────────────────────
    setPyramidBlocks: (count) => emitToLobby('clash:setPyramidBlocks', { count }),
    setPyramidRows: (rows) => emitToLobby('clash:setPyramidRows', { rows }),
    pyramidPick: (row, col) => emitToLobby('clash:pyramid:pick', { row, col }),

    // ── Admin ───────────────────────────────────────────────────────────────
    adminSwapCard: (targetPlayerId, deckIndex, newCardId) =>
      emitToLobby('clash:admin:swapCard', { targetPlayerId, deckIndex, newCardId }),
  };
}
