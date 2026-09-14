// Klassische Trophäenstraße-Arenen (Goblin Stadium, Bone Pit, …) für den Trophäenmodus
// ("trophies" trackMode, zeigt player.trophies — siehe ausführlicher Kommentar an
// isTrophyRoadArena in crWinTrackerRoutes.js). Lokal gebündelt statt live verlinkt — dieselbe
// Quelle wie die Liga-Embleme in leagueIcons.js: RoyaleAPIs cr-api-assets-Repo
// (github.com/royaleapi/cr-api-assets/arenas/), dessen README ausdrücklich zum Klonen statt
// Live-Einbinden auffordert. Verkleinert auf 200px und als WebP komprimiert, exakt wie dort.
//
// Trophäengrenzen empirisch von clashroyale.fandom.com/wiki/Arenas übernommen (MediaWiki-API,
// nicht die eigentliche Wiki-Seite — die sitzt hinter einer Cloudflare-JS-Challenge, die
// api.php-Route nicht) UND gegen einen echten Account verifiziert: #U8Q0UUP hatte zum
// Prüfzeitpunkt genau 14000 Trophäen, die offizielle API lieferte dafür player.arena.name ===
// "Spirit Square" — exakt die letzte Arena der Liste (13.500-14.000). Ab Arena 15 (Miner's Mine)
// ist jede Stufe exakt 500 Trophäen breit; darunter (Arena 1-14) unregelmäßig 300/400 — beides
// direkt aus der Wiki-Tabelle übernommen, nicht durchgerechnet. Oberhalb von 14.000 Trophäen
// beginnt laut Wiki "Seasonal Trophy Road" (Arenen "Seasonal I", "Seasonal II", …, setzt jede
// Season zurück) — das ist NICHT mehr dasselbe wie die player.trophies-Lifetime-Zahl, dafür gibt
// es hier bewusst kein Bild (trophyArenaIcon gibt dann null zurück, das Overlay zeigt den
// bisherigen leeren Platzhalter statt zu raten).
//
// Bilder für Arena 25-32 (Lumberlove Cabin bis Spirit Square) kamen NICHT aus cr-api-assets (das
// Repo führt nur bis Arena 24 "Legendary Arena") — von Hand nachgetragen/ersetzt (auch 15-24
// korrigiert, siehe Dateidaten in assets/clashRoyale/arenas/).
import arena1 from '../../../assets/clashRoyale/arenas/arena1.webp';
import arena2 from '../../../assets/clashRoyale/arenas/arena2.webp';
import arena3 from '../../../assets/clashRoyale/arenas/arena3.webp';
import arena4 from '../../../assets/clashRoyale/arenas/arena4.webp';
import arena5 from '../../../assets/clashRoyale/arenas/arena5.webp';
import arena6 from '../../../assets/clashRoyale/arenas/arena6.webp';
import arena7 from '../../../assets/clashRoyale/arenas/arena7.webp';
import arena8 from '../../../assets/clashRoyale/arenas/arena8.webp';
import arena9 from '../../../assets/clashRoyale/arenas/arena9.webp';
import arena10 from '../../../assets/clashRoyale/arenas/arena10.webp';
import arena11 from '../../../assets/clashRoyale/arenas/arena11.webp';
import arena12 from '../../../assets/clashRoyale/arenas/arena12.webp';
import arena13 from '../../../assets/clashRoyale/arenas/arena13.webp';
import arena14 from '../../../assets/clashRoyale/arenas/arena14.webp';
import arena15 from '../../../assets/clashRoyale/arenas/arena15.webp';
import arena16 from '../../../assets/clashRoyale/arenas/arena16.webp';
import arena17 from '../../../assets/clashRoyale/arenas/arena17.webp';
import arena18 from '../../../assets/clashRoyale/arenas/arena18.webp';
import arena19 from '../../../assets/clashRoyale/arenas/arena19.webp';
import arena20 from '../../../assets/clashRoyale/arenas/arena20.webp';
import arena21 from '../../../assets/clashRoyale/arenas/arena21.webp';
import arena22 from '../../../assets/clashRoyale/arenas/arena22.webp';
import arena23 from '../../../assets/clashRoyale/arenas/arena23.webp';
import arena24 from '../../../assets/clashRoyale/arenas/arena24.webp';
import arena25 from '../../../assets/clashRoyale/arenas/arena25.webp';
import arena26 from '../../../assets/clashRoyale/arenas/arena26.webp';
import arena27 from '../../../assets/clashRoyale/arenas/arena27.webp';
import arena28 from '../../../assets/clashRoyale/arenas/arena28.webp';
import arena29 from '../../../assets/clashRoyale/arenas/arena29.webp';
import arena30 from '../../../assets/clashRoyale/arenas/arena30.webp';
import arena31 from '../../../assets/clashRoyale/arenas/arena31.webp';
import arena32 from '../../../assets/clashRoyale/arenas/arena32.webp';

// Aufsteigend sortiert nach min-Trophäen — arenaIconForTrophies() sucht rückwärts den ersten
// Eintrag, dessen min <= trophies ist.
const ARENAS = [
  { min: 0, name: 'Goblin Stadium', icon: arena1 },
  { min: 300, name: 'Bone Pit', icon: arena2 },
  { min: 600, name: 'Barbarian Bowl', icon: arena3 },
  { min: 1000, name: 'Spell Valley', icon: arena4 },
  { min: 1300, name: "Builder's Workshop", icon: arena5 },
  { min: 1600, name: "P.E.K.K.A.'s Playhouse", icon: arena6 },
  { min: 2000, name: 'Royal Arena', icon: arena7 },
  { min: 2300, name: 'Frozen Peak', icon: arena8 },
  { min: 2600, name: 'Jungle Arena', icon: arena9 },
  { min: 3000, name: 'Hog Mountain', icon: arena10 },
  { min: 3400, name: 'Electro Valley', icon: arena11 },
  { min: 3800, name: 'Spooky Town', icon: arena12 },
  { min: 4200, name: "Rascal's Hideout", icon: arena13 },
  { min: 4600, name: 'Serenity Peak', icon: arena14 },
  { min: 5000, name: "Miner's Mine", icon: arena15 },
  { min: 5500, name: "Executioner's Kitchen", icon: arena16 },
  { min: 6000, name: 'Royal Crypt', icon: arena17 },
  { min: 6500, name: 'Silent Sanctuary', icon: arena18 },
  { min: 7000, name: 'Dragon Spa', icon: arena19 },
  { min: 7500, name: 'Boot Camp', icon: arena20 },
  { min: 8000, name: 'Clash Fest', icon: arena21 },
  { min: 8500, name: 'PANCAKES!', icon: arena22 },
  { min: 9000, name: 'Valkalla', icon: arena23 },
  { min: 9500, name: 'Legendary Arena', icon: arena24 },
  { min: 10000, name: 'Lumberlove Cabin', icon: arena25 },
  { min: 10500, name: 'Royal Road', icon: arena26 },
  { min: 11000, name: 'Musketeer Street', icon: arena27 },
  { min: 11500, name: 'Summit of Heroes', icon: arena28 },
  { min: 12000, name: 'Magic Academy', icon: arena29 },
  { min: 12500, name: 'Ultimate Clash Pit', icon: arena30 },
  { min: 13000, name: 'Little Prince’s Tavern', icon: arena31 },
  { min: 13500, name: 'Spirit Square', icon: arena32 },
];

// Obergrenze von arena32 (Spirit Square, 13.500-14.000) — 14.000 selbst ist NOCH Spirit Square
// (die letzte/höchste klassische Arena, dort deckelt die Trophäenstraße), erst ECHT darüber
// beginnt "Seasonal Trophy Road" (siehe Kommentar oben), für die es kein Bild gibt. Deshalb
// striktes ">" statt ">=" unten. WICHTIG bleibt die Deckelung selbst: ohne sie würde die Suche
// für JEDEN Trophäenstand darüber beim letzten bekannten Eintrag hängen bleiben und fälschlich
// "Spirit Square" zurückgeben, statt gar kein Bild zu zeigen.
const KNOWN_CEILING = 14000;

/** Arena-Icon für einen Trophäenstand, oder null (kein Bild bekannt — siehe Kommentar oben). */
export function trophyArenaIcon(trophies) {
  const n = Number(trophies) || 0;
  if (n > KNOWN_CEILING) return null;
  for (let i = ARENAS.length - 1; i >= 0; i--) {
    if (n >= ARENAS[i].min) return ARENAS[i].icon;
  }
  return null;
}

/** Arena-Name für einen Trophäenstand, oder '' (kein bekannter Name — siehe Kommentar oben). */
export function trophyArenaName(trophies) {
  const n = Number(trophies) || 0;
  if (n > KNOWN_CEILING) return '';
  for (let i = ARENAS.length - 1; i >= 0; i--) {
    if (n >= ARENAS[i].min) return ARENAS[i].name;
  }
  return '';
}
