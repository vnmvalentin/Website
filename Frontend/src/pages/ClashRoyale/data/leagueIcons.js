// Path-of-Legend-Liga-Embleme + das Medaillen-/Rating-Symbol. Lokal gebündelt (statt live von
// cdn.royaleapi.com) — dieselbe Bilder, aber verkleinert (200px statt 512px) und als WebP
// komprimiert (siehe Backend/clashRoyale/tools/cardIconSpiegel.js-Kommentar zum selben Thema
// bei den Kartenbildern: das sind reine UI-/Rang-Abzeichen, keine Kartenkunst — anders als bei
// den Karten selbst spricht hier nichts dagegen, sie lokal mitzuliefern, siehe die bereits
// vorher lokal gebündelten UI-Symbole in assets/clashRoyale/ui/). Quelle: RoyaleAPIs eigenes
// cr-api-assets-Repo (github.com/royaleapi/cr-api-assets/arenas/), dessen README ausdrücklich
// zum Klonen statt Live-Einbinden auffordert ("Please clone this repo and not use these assets
// directly as if it's a CDN.").
import league0 from '../../../assets/clashRoyale/leagues/league0.webp';
import league1 from '../../../assets/clashRoyale/leagues/league1.webp';
import league2 from '../../../assets/clashRoyale/leagues/league2.webp';
import league3 from '../../../assets/clashRoyale/leagues/league3.webp';
import league4 from '../../../assets/clashRoyale/leagues/league4.webp';
import league5 from '../../../assets/clashRoyale/leagues/league5.webp';
import league6 from '../../../assets/clashRoyale/leagues/league6.webp';
import league7 from '../../../assets/clashRoyale/leagues/league7.webp';
import league8 from '../../../assets/clashRoyale/leagues/league8.webp';
import league9 from '../../../assets/clashRoyale/leagues/league9.webp';
import league10 from '../../../assets/clashRoyale/leagues/league10.webp';
import ratingIcon from '../../../assets/clashRoyale/leagues/rating.webp';

// RoyaleAPI hostet die Embleme noch unter der alten 10-stufigen Nummerierung (die 3 inzwischen
// entfernten Challenger-Ligen kamen davor) — daher der Offset +3 beim Bild-Lookup unten.
const LEAGUE_BADGES = { 1: league1, 2: league2, 3: league3, 4: league4, 5: league5, 6: league6, 7: league7, 8: league8, 9: league9, 10: league10 };
// league0 wird von leagueIconUrl() nicht erreicht (n startet bei leagueNumber=1 → n=4), bleibt
// aber importiert für den Fall, dass irgendwo doch mal Liga 0 (unterhalb Liga 1) auftaucht.
void league0;

// Die aktuelle Ranked-Leiter hat 7 Stufen (leagueNumber 1-7 aus der API, 7 = Ultimate Champion).
export const ULTIMATE_CHAMPION_LEAGUE = 7;

export function leagueIconUrl(leagueNumber) {
  const n = Math.round(leagueNumber) + 3;
  if (!leagueNumber || n < 1 || n > 10) return null;
  return LEAGUE_BADGES[n] || null;
}

// lang ist optional (Standard 'de') — nur der Win-Tracker (Editor + Overlay) übergibt hier
// 'en', alle anderen Aufrufer bleiben unverändert deutsch.
export function leagueName(leagueNumber, lang) {
  if (leagueNumber === ULTIMATE_CHAMPION_LEAGUE) return "Ultimate Champion";
  if (leagueNumber >= 1) return lang === "en" ? `League ${leagueNumber}` : `Liga ${leagueNumber}`;
  return lang === "en" ? "Trophy Road" : "Trophäenstraße";
}

// Das offizielle Medaillen-/Rating-Symbol (Ranked/Path of Legend) — unterscheidet sich bewusst
// vom Trophäen-Pokal der Trophäenstraße.
export const MEDAL_ICON_URL = ratingIcon;

// Unterhalb von Ultimate Champion zählt die Ranked-Leiter keine Medaillen, sondern Stufen:
// Liga 1-3 haben 11, Liga 4-6 haben 10. Erst in Liga 7 (UC) gibt es wieder Medaillen.
const LEAGUE_STEPS = { 1: 11, 2: 11, 3: 11, 4: 10, 5: 10, 6: 10 };

/** Anzahl der Stufen dieser Liga, 0 ab Ultimate Champion und außerhalb von Ranked. */
export const leagueStepCount = (leagueNumber) => LEAGUE_STEPS[Number(leagueNumber)] || 0;
