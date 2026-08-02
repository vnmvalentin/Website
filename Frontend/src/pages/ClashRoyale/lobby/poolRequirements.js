// Wie viele Karten der Pool für einen Modus mindestens enthalten muss.
//
// Der Server prüft dasselbe noch einmal in requiredPoolSize() (Backend/routes/
// clashRoyaleRoutes.js) und lehnt einen Start sonst ab. Diese Kopie im Client dient
// nur dazu, den Startknopf vorher zu sperren und zu erklären, warum — man soll nicht
// erst nach dem Klick erfahren, dass zu viele Karten gesperrt sind.
//
// Beide Stellen müssen zusammenpassen: ändert sich im Backend die Formel eines Modus,
// gehört sie hier nachgezogen.

const REQUIREMENTS = {
  snake: (lobby) => {
    const grid = lobby?.gridSize || 11;
    return grid * grid;
  },
  'shadow-carousel': (lobby, active) => active * (lobby?.carouselCardsPerTable || 8),
  'elixir-rush': (lobby, active) => active * 8 + (lobby?.rushMarketSize || 5),
  'angel-royale': (_lobby, active) => active * 8 + 6,
  'dark-maze': (_lobby, active) => active * 8 + 2,
  // Start ist reine Wildcards — echte Karten kommen erst on demand, kein Mindestpool
  'card-evolution': () => 0,
};

/** Standard für Auction/Bingo: 8 Runden à "Karten pro Runde". */
const defaultRequirement = (lobby, active) => {
  const perRound = Math.max(active || 2, lobby?.cardsPerRound || active || 2);
  return 8 * perRound;
};

export function requiredPoolFor(lobby, activeCount) {
  const fn = REQUIREMENTS[lobby?.mode] || defaultRequirement;
  return fn(lobby, activeCount);
}

/**
 * Startbedingungen der Lobby an einem Ort.
 * Das Karussell wird bewusst NICHT über poolTooSmall abgedeckt: dort ist nicht der
 * Pool zu klein, sondern die Spielerzahl zu groß für die gewählte Tischgröße — das
 * ist eine andere Meldung und eine andere Abhilfe.
 */
export function lobbyReadiness(lobby, activeCount, poolSize, canControlLobby) {
  const cardsPerTable = lobby?.carouselCardsPerTable || 8;
  const carouselMaxPlayers = Math.min(8, Math.floor(poolSize / cardsPerTable));
  const carouselTooMany = lobby?.mode === 'shadow-carousel' && activeCount > carouselMaxPlayers;

  const requiredPool = requiredPoolFor(lobby, activeCount);
  const poolTooSmall = lobby?.mode !== 'shadow-carousel'
    && lobby?.mode !== 'card-evolution'
    && poolSize < requiredPool;

  return {
    requiredPool,
    poolTooSmall,
    carouselMaxPlayers,
    carouselTooMany,
    canStart: !!canControlLobby && activeCount >= 2 && !carouselTooMany && !poolTooSmall,
  };
}
