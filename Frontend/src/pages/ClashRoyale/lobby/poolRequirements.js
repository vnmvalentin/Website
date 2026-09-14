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
  'trap-setter': (lobby, active) => active * 8 + (lobby?.trapGridSize || 9),
  // Vom Host gewählte Rastergröße (falls gesetzt und groß genug), sonst die kleinste
  // Dreieckszahl n(n+1)/2 für 8 Runden × (aktiv + Blockrate) — 1:1 aus
  // resolvedPyramidRows() in Backend/clashRoyale/modes/pyramidDraft.js.
  'pyramid-draft': (lobby, active) => {
    const blocks = [0, 1, 2, 3].includes(lobby?.pyramidBlocksPerRound) ? lobby.pyramidBlocksPerRound : 1;
    const needed = 8 * (Math.max(1, active) + blocks);
    let minRows = 1, total = 1;
    while (total < needed) { minRows++; total += minRows; }
    const n = Number.isInteger(lobby?.pyramidRows) ? Math.max(minRows, lobby.pyramidRows) : minRows;
    return (n * (n + 1)) / 2;
  },
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

// 2v2-Modi brauchen beide Teams vollständig (Slot 1 + Slot 2) — eine reine Spielerzahl-Prüfung
// (>= 2) würde z.B. 3 Spieler in Team A und 1 in Team B fälschlich als startbereit zeigen.
// Spiegelbild von isDuoTeamsReady() in Backend/clashRoyale/core/teams.js.
function teamsReady(lobby) {
  if (lobby?.partyMode !== 'duo') return true;
  const players = lobby?.players || [];
  return ['A', 'B'].every(letter => {
    const slots = new Set(
      players.filter(p => p.teamId === letter && !p.isSpectator).map(p => p.teamSlot)
    );
    return slots.has(1) && slots.has(2);
  });
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
  const teamsNotReady = !teamsReady(lobby);

  return {
    requiredPool,
    poolTooSmall,
    carouselMaxPlayers,
    carouselTooMany,
    teamsNotReady,
    canStart: !!canControlLobby && activeCount >= 2 && !carouselTooMany && !poolTooSmall && !teamsNotReady,
  };
}
