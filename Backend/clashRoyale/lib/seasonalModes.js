// seasonalModes.js — saisonale Ranked-Modi (Spooky Chess League & Co.) automatisch erkennen.
//
// 2v2 Ranked wurde noch von Hand eingebaut (eigene Spalten, eigener trackMode). Supercell bringt
// aber fast jede Season einen neuen Leiterboard-Modus — ab Oktober 2026 z.B. "Spooky Chess League".
// Damit nicht jeder davon wieder API-Archäologie und neuen Code braucht, ordnet dieses Modul
// Battles und Profil-Fortschritt generisch einander zu.
//
// Die zwei Seiten, die zusammengehören (live geprüft am 05.10.2026 an echten Spielern):
//   Profil:  progress["SpookyChessTrail"] = { arena: { rawName: "SpookyChessTrailArena1", name: "Casual" }, trophies, bestTrophies }
//   Battle:  type "trail", gameMode.name "202610_Event_Spooky_Chess", arena.rawName "202410_Arena_Spooky_Chess", eventTag "#2CJUGQ8G"
// Ein gemeinsamer Präfix wie bei 2v2 ("2v2League_…" auf beiden Seiten) existiert hier NICHT. Was
// beide teilen, sind die Wörter: "Spooky" + "Chess". Regel: ein Battle gehört zu einem
// progress-Eintrag, wenn ALLE bedeutungstragenden Wörter des Eintrags-Schlüssels im Arena-Namen
// des Battles stehen. Bewusst die Arena und nicht der gameMode-Name: Challenges teilen sich gern
// Wörter mit Liga-Modi (z.B. "Chaos_1v1_MegaDraft_All" vs. eine "ChaosDraftLeague"), spielen aber in
// einer neutralen Arena ("Arena1") — genau wie bei 2v2, wo nur die Arena Ranked von Casual trennt.

// Wörter, die in fast jedem Schlüssel/Arena-Namen stehen und deshalb nichts unterscheiden.
const STOPWORDS = new Set([
  'arena', 'arenas', 'league', 'trail', 'season', 'seasonal', 'event', 'ranked', 'ladder', 'road', 'the',
]);

// Präfixe (siehe normalizeSeasonalPrefix in crWinTrackerRoutes.js), die NICHT generisch laufen:
// 2v2 Ranked hat seinen eigenen, auf die Eigenheiten der API abgestimmten Pfad, die saisonale
// Trophäenstraße steckt bereits im trackMode "trophies".
const EXCLUDED_PREFIXES = new Set(['2v2league', 'seasonal-trophy-road']);

// Qualifikationsphase einzelner Modi: solange der Account in dieser Stufe steht, zählt `trophies`
// die Siege bis zum Rang (Spooky Chess League, Okt. 2026: 15 Siege in "Casual", Nutzerangabe +
// passt zu den Live-Daten: +1 je Sieg, Niederlagen kosten nichts). Die API kennt dieses Ziel
// nicht — deshalb hier von Hand je Modus-Präfix. Ein neuer Modus mit anderem Ziel = eine Zeile.
const QUALIFY_GOALS = {
  spookychesstrail: { tier: 'casual', wins: 15 },
};

/** Siegziel der Qualifikation, falls der Modus gerade darin steht — sonst null. */
function qualifyGoal(prefix, arenaName) {
  const g = QUALIFY_GOALS[prefix];
  return g && String(arenaName || '').toLowerCase() === g.tier ? g.wins : null;
}

/** Ob ein Modus überhaupt eine Qualifikationsphase hat. */
const hasQualifyPhase = (prefix) => Object.prototype.hasOwnProperty.call(QUALIFY_GOALS, prefix);

/** Normalisierter Präfix: nur die Saison-Ziffern am Ende weg ("AutoChess_2026_Season_11" -> "autochess_2026_season"). */
function normalizeSeasonalPrefix(key) {
  return String(key || '').replace(/([_-]\d+)+$/, '').toLowerCase();
}

/**
 * Bedeutungstragende Wörter eines API-Namens. "2v2"/"1v1" bleiben am Stück (sonst zerfielen sie
 * beim Ziffern-Split), CamelCase wird getrennt, Zahlen und Füllwörter fallen weg.
 *   "SpookyChessTrailArena1"     -> spooky, chess
 *   "202410_Arena_Spooky_Chess"  -> spooky, chess
 *   "AutoChess_2026_Season_11"   -> auto, chess
 */
function nameTokens(raw) {
  const out = new Set();
  const rest = String(raw || '').replace(/\d+v\d+/gi, (m) => { out.add(m.toLowerCase()); return ' '; });
  for (const word of rest.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z]+/)) {
    const w = word.toLowerCase();
    if (w.length >= 2 && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

const isSubset = (small, big) => small.size > 0 && [...small].every((w) => big.has(w));

/** Wörter, an denen ein progress-Eintrag erkannt wird: aus dem Schlüssel, notfalls aus seiner Arena. */
function entryTokens(entry) {
  const fromKey = nameTokens(entry.key);
  return fromKey.size ? fromKey : nameTokens(entry.arenaRawName);
}

/** Nur die progress-Einträge, die generisch getrackt werden (ohne 2v2/Trophäenstraße/leere Schlüssel). */
function trackableEntries(seasonalProgress) {
  return (seasonalProgress || []).filter((p) => {
    const prefix = normalizeSeasonalPrefix(p.key);
    return prefix && !EXCLUDED_PREFIXES.has(prefix) && entryTokens(p).size > 0;
  });
}

/**
 * Präfix des saisonalen Modus, zu dem ein Battle gehört — oder null.
 * Passen mehrere Einträge, gewinnt der mit den meisten Wörtern (der spezifischere).
 * @param {{arenaRawName: string}} battle
 * @param {Array<{key: string, arenaRawName: string}>} entries  aus trackableEntries()
 */
function matchBattle(battle, entries) {
  const arena = nameTokens(battle?.arenaRawName);
  if (!arena.size) return null;
  let best = null, bestSize = 0;
  for (const e of entries) {
    const tokens = entryTokens(e);
    if (isSubset(tokens, arena) && tokens.size > bestSize) {
      best = normalizeSeasonalPrefix(e.key);
      bestSize = tokens.size;
    }
  }
  return best;
}

/**
 * Anzeigename aus GET /events (z.B. "Spooky Chess League"): zuerst über den eventTag eines
 * zugeordneten Battles (eindeutig), sonst über dieselbe Wort-Regel wie bei den Battles.
 * @param {{key: string, arenaRawName: string}} entry
 * @param {Array<{eventTag: string, title: string}>} events
 * @param {string} [eventTag]
 */
function labelFromEvents(entry, events, eventTag) {
  if (!Array.isArray(events)) return '';
  if (eventTag) {
    const byTag = events.find((e) => e?.eventTag === eventTag && e.title);
    if (byTag) return String(byTag.title);
  }
  const tokens = entryTokens(entry);
  const byWords = events.find((e) => e?.title && isSubset(tokens, nameTokens(e.title)));
  return byWords ? String(byWords.title) : '';
}

/** Notname, solange /events nichts liefert: "SpookyChessTrail" -> "Spooky Chess". */
function humanizeKey(key) {
  const words = String(key || '')
    .replace(/\d+v\d+/gi, (m) => ` ${m.toLowerCase()} `)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !/^\d+$/.test(w) && !STOPWORDS.has(w.toLowerCase()));
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || String(key || '');
}

module.exports = {
  EXCLUDED_PREFIXES,
  qualifyGoal,
  hasQualifyPhase,
  normalizeSeasonalPrefix,
  nameTokens,
  trackableEntries,
  matchBattle,
  labelFromEvents,
  humanizeKey,
};
