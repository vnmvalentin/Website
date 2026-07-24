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
