// Path-of-Legend-Liga-Embleme. Die aktuelle Ranked-Leiter hat 7 Stufen (leagueNumber 1-7
// aus der API, 7 = Ultimate Champion). RoyaleAPI hostet die Embleme noch unter der alten
// 10-stufigen Nummerierung (die 3 inzwischen entfernten Challenger-Ligen kamen davor),
// daher der Offset +3 beim Bild-Lookup.
export const ULTIMATE_CHAMPION_LEAGUE = 7;

export function leagueIconUrl(leagueNumber) {
  const n = Math.round(leagueNumber) + 3;
  if (!leagueNumber || n < 1 || n > 10) return null;
  return `https://cdn.royaleapi.com/static/img/leagues/league${n}.png`;
}

export function leagueName(leagueNumber) {
  return leagueNumber === ULTIMATE_CHAMPION_LEAGUE ? "Ultimate Champion" : leagueNumber >= 1 ? `Liga ${leagueNumber}` : "Trophäenstraße";
}

// Unterhalb von Ultimate Champion zählt die Ranked-Leiter keine Medaillen, sondern Stufen:
// Liga 1-3 haben 11, Liga 4-6 haben 10. Erst in Liga 7 (UC) gibt es wieder Medaillen.
const LEAGUE_STEPS = { 1: 11, 2: 11, 3: 11, 4: 10, 5: 10, 6: 10 };

/** Anzahl der Stufen dieser Liga, 0 ab Ultimate Champion und außerhalb von Ranked. */
export const leagueStepCount = (leagueNumber) => LEAGUE_STEPS[Number(leagueNumber)] || 0;
