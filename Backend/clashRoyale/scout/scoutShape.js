// scoutShape.js — formt die Rohantworten der offiziellen Clash-Royale-API in das, was die Stats-Seiten unter
// /clash (Frontend: pages/ClashRoyale/scout/) anzeigen. Reine Funktionen ohne Netz und ohne Speicher — der Abruf
// liegt in scoutRoutes.js, die Auswertung der Kämpfe (Scouting-Bericht) im Frontend (scout/analysis.js).
//
// Warum hier und nicht im Browser: die Rohantwort eines Profils ist groß (jede der ~120 Karten trägt mehrere
// Bild-Adressen), und nur hier lassen sich die offiziellen Kartennamen sicher auf unsere Karten-IDs abbilden
// (core/cards.js). Karten, die wir noch nicht kennen (neue Veröffentlichung), fallen nicht weg: sie behalten Namen
// und Bild aus der API, nur ohne lokale ID.
//
// Alle Felder werden defensiv gelesen. Die API lässt Felder weg, statt sie leer zu liefern (kein Clan → `clan`
// fehlt ganz), und bekommt laufend neue dazu.

const { cardIdByOfficialName, ELIXIR_COST } = require('../core/cards');
const { normalizeTag, parseBattleTimeMs, roundsResult, resultOf } = require('../lib/crApi');

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === 'string' ? v : '');
const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

/**
 * Höchstes Kartenlevel im Spiel, abgelesen an den Karten selbst. Die API zählt Level je Seltenheit ab 1 (eine
 * legendäre Karte auf „Level 3" ist im Spiel Level 11); gewöhnliche Karten laufen bis zum echten Höchstlevel.
 * Anzeige-Level = level + (Höchstlevel − maxLevel der Karte). Aus den Daten gelesen statt fest verdrahtet, damit
 * eine Anhebung des Höchstlevels ohne Code-Änderung stimmt.
 */
function levelCap(cards) {
  let cap = 0;
  for (const c of Array.isArray(cards) ? cards : []) {
    const m = num(c?.maxLevel);
    if (m !== null && m > cap) cap = m;
  }
  return cap || null;
}

// Welche Form in einem Deck oder Kampf gespielt wird. Dort trägt eine Karte evolutionLevel nur, wenn ihre Sonderform
// aktiv ist: 1 = Evolution, 2 = Held (an echten Battlelogs geprüft, 14.11.2026: Barbarian Barrel hat eine Heldenform,
// stand aber ohne evolutionLevel im Deck; Berserker als Held mit 2). Die Bild-Adressen sagen nur, welche Formen es gibt.
// In der SAMMLUNG bedeutet dasselbe Feld etwas anderes — siehe shapeOwnedCard.
function activeForm(c) {
  const lvl = num(c?.evolutionLevel);
  if (!lvl) return null;
  const hasHero = !!c.iconUrls?.heroMedium;
  const hasEvo = !!c.iconUrls?.evolutionMedium;
  if (lvl === 2 && hasHero) return 'hero';
  if (hasEvo) return 'ev1';
  return hasHero ? 'hero' : null;
}

/**
 * Eine Karte aus Deck, Kampf oder Sammlung.
 * @param {object} c    Karte der API
 * @param {number|null} cap  Höchstlevel (levelCap)
 * @param {boolean} inDeck  Karte steht in einem Deck/Kampf — dann wird die aktive Form (Evolution/Held) mitgegeben
 */
function shapeCard(c, cap, inDeck = false) {
  if (!c || !c.name) return null;
  const id = cardIdByOfficialName(c.name);
  const level = num(c.level);
  const maxLevel = num(c.maxLevel);
  const lvl = level === null ? null : (cap && maxLevel !== null ? level + (cap - maxLevel) : level);
  const out = {
    id,
    name: c.name,
    lvl,
    elixir: num(c.elixirCost) ?? (id ? ELIXIR_COST[id] ?? null : null),
    rarity: cap1(str(c.rarity).toLowerCase()),
  };
  if (!id) out.icon = c.iconUrls?.medium || null;
  if (inDeck) {
    const variant = activeForm(c);
    if (variant) out.variant = variant;
  }
  return out;
}

/**
 * Karte der Sammlung: zusätzlich Stückzahl (Vorrat für die nächsten Level), Sternlevel und die Sonderformen.
 * In der Sammlung sind evolutionLevel/maxEvolutionLevel Bitfelder: 1 = Evolution, 2 = Held, 3 = beides (geprüft an
 * echten Profilen: Mirror 1/1, Wizard mit beiden Formen 3/3). forms: [{ id: 'ev1' | 'hero', owned }]
 */
function shapeOwnedCard(c, cap) {
  const card = shapeCard(c, cap);
  if (!card) return null;
  card.maxed = card.lvl !== null && cap ? card.lvl >= cap : false;
  card.count = num(c.count) ?? 0;
  const star = num(c.starLevel);
  if (star) card.star = star;
  const max = num(c.maxEvolutionLevel) ?? ((c.iconUrls?.evolutionMedium ? 1 : 0) | (c.iconUrls?.heroMedium ? 2 : 0));
  const own = num(c.evolutionLevel) || 0;
  const forms = [];
  if (max & 1) forms.push({ id: 'ev1', owned: (own & 1) === 1 });
  if (max & 2) forms.push({ id: 'hero', owned: (own & 2) === 2 });
  if (forms.length) card.forms = forms;
  return card;
}

// Laufende Modi im Profil (`progress`): der Schlüssel verrät den Modus, die Arena nur die Stufe darin.
const SEASONAL_KINDS = [
  [/^2v2league/i, '2v2'],
  [/^autochess/i, 'mergeTactics'],
  [/^seasonal-trophy-road/i, 'seasonalRoad'],
];

const shapeClanRef = (c) => (c && c.tag ? { tag: normalizeTag(c.tag) || '', name: str(c.name), badgeId: num(c.badgeId) } : null);

function shapeSeason(s) {
  if (!s || typeof s !== 'object') return null;
  const league = num(s.leagueNumber);
  if (!league && !num(s.trophies) && !num(s.rank)) return null;
  return { league: league || 0, medals: num(s.trophies) || 0, rank: num(s.rank) };
}

/**
 * Profil. `currentRank` kommt vom Aufrufer (crApi.resolvePolRank), weil die Platzierung im Profil außerhalb der
 * Top 1000 kein Live-Wert ist (siehe Kommentar dort).
 */
function shapePlayer(raw, { currentRank = null } = {}) {
  const cap = levelCap(raw.cards);
  const cur = shapeSeason(raw.currentPathOfLegendSeasonResult);
  if (cur) cur.rank = currentRank;
  const seasonal = [];
  for (const [key, entry] of Object.entries(raw.progress && typeof raw.progress === 'object' ? raw.progress : {})) {
    // "" ist ein Katalog-Rest; Modi ohne einen einzigen Punkt hat der Spieler nicht angefasst
    if (!key || !entry?.arena || !(num(entry.trophies) > 0 || num(entry.bestTrophies) > 0)) continue;
    seasonal.push({
      key,
      kind: (SEASONAL_KINDS.find(([re]) => re.test(key)) || [])[1] || null,
      rawName: str(entry.arena.rawName),
      name: str(entry.arena.name),
      trophies: num(entry.trophies) || 0,
      best: num(entry.bestTrophies) || num(entry.trophies) || 0,
    });
  }
  const ls = raw.leagueStatistics || {};
  return {
    tag: normalizeTag(raw.tag) || '',
    name: str(raw.name),
    expLevel: num(raw.expLevel) || 0,
    kingTowerLevel: num(raw.kingTowerLevel),
    collectionLevel: num(raw.collectionLevel),
    // Siege (positiv) bzw. Niederlagen (negativ) in Folge laut Spiel
    streak: num(raw.currentWinLoseStreak) || 0,
    trophies: num(raw.trophies) || 0,
    bestTrophies: num(raw.bestTrophies) || num(raw.trophies) || 0,
    legacyBest: num(raw.legacyTrophyRoadHighScore),
    arena: raw.arena ? { id: num(raw.arena.id), name: str(raw.arena.name) } : null,
    wins: num(raw.wins) || 0,
    losses: num(raw.losses) || 0,
    battleCount: num(raw.battleCount) || 0,
    threeCrownWins: num(raw.threeCrownWins) || 0,
    challengeMaxWins: num(raw.challengeMaxWins) || 0,
    challengeCardsWon: num(raw.challengeCardsWon) || 0,
    tournamentBattleCount: num(raw.tournamentBattleCount) || 0,
    tournamentCardsWon: num(raw.tournamentCardsWon) || 0,
    warDayWins: num(raw.warDayWins) || 0,
    clanCardsCollected: num(raw.clanCardsCollected) || 0,
    donations: num(raw.donations) || 0,
    donationsReceived: num(raw.donationsReceived) || 0,
    totalDonations: num(raw.totalDonations) || 0,
    starPoints: num(raw.starPoints) || 0,
    role: str(raw.role),
    clan: shapeClanRef(raw.clan),
    ranked: {
      current: cur,
      last: shapeSeason(raw.lastPathOfLegendSeasonResult),
      best: shapeSeason(raw.bestPathOfLegendSeasonResult),
    },
    seasonal,
    trophySeasons: {
      current: ls.currentSeason ? { trophies: num(ls.currentSeason.trophies), best: num(ls.currentSeason.bestTrophies) } : null,
      previous: ls.previousSeason ? { id: str(ls.previousSeason.id), trophies: num(ls.previousSeason.trophies), best: num(ls.previousSeason.bestTrophies) } : null,
      best: ls.bestSeason ? { id: str(ls.bestSeason.id), trophies: num(ls.bestSeason.trophies) } : null,
    },
    cap,
    deck: (Array.isArray(raw.currentDeck) ? raw.currentDeck : []).slice(0, 8).map((c) => shapeCard(c, cap, true)).filter(Boolean),
    deckTower: shapeCard(raw.currentDeckSupportCards?.[0], cap),
    favourite: shapeCard(raw.currentFavouriteCard, null),
    cards: (Array.isArray(raw.cards) ? raw.cards : []).map((c) => shapeOwnedCard(c, cap)).filter(Boolean),
    towerCards: (Array.isArray(raw.supportCards) ? raw.supportCards : []).map((c) => {
      const card = shapeOwnedCard(c, cap);
      if (card && !card.icon) card.icon = c.iconUrls?.medium || null; // Turmtruppen stehen nicht in unserer Kartenliste
      return card;
    }).filter(Boolean),
    badges: (Array.isArray(raw.badges) ? raw.badges : []).map((b) => ({
      name: str(b.name),
      level: num(b.level),
      maxLevel: num(b.maxLevel),
      progress: num(b.progress),
      target: num(b.target),
      icon: b.iconUrls?.large || null,
    })).filter((b) => b.name),
    achievements: (Array.isArray(raw.achievements) ? raw.achievements : []).map((a) => ({
      name: str(a.name), stars: num(a.stars) || 0, value: num(a.value) || 0, target: num(a.target) || 0, info: str(a.info),
    })).filter((a) => a.name),
  };
}

// Kampfart → grobe Gruppe für Filter und Auswertung. Reihenfolge zählt: der Kampftyp ist verlässlicher als der
// Modusname (Trophäenstraße und Ranked teilen sich Modusnamen, siehe gameModeGroup im Win Tracker).
function modeGroup(type, modeName, teamSize, isLadderTournament) {
  if (/^(riverRace|boatBattle|clanWar)/i.test(type)) return 'war';
  // Crown Series: Kampftyp "unknown", nur der Modusname verrät sie (siehe lib/challengeModes.js)
  if (/^Competitive_Multideck/i.test(modeName)) return 'crown';
  if (type === 'pathOfLegend') return 'ranked';
  if (teamSize >= 2) return '2v2';
  // Trophäenstraße: klassisch Kampftyp "PvP", die Saison-Trophäenstraße kommt als "trail" mit Modus "Ladder"
  // (geprüft an echten Battlelogs, 15.11.2026 — lief vorher unter Events)
  if (type === 'PvP' || modeName === 'Ladder') return 'ladder';
  if (modeName.startsWith('Ranked1v1')) return 'ranked';
  if (isLadderTournament || /tournament/i.test(type)) return 'tournament';
  if (/challenge/i.test(type)) return 'challenge';
  // Freundschaftskampf: Kampfart "friendly"/"clanMate", über die Einladung im Spiel auch "quickplay" (geprüft
  // 15.11.2026: wiederholte Kämpfe gegen denselben Freund, Modus Friendly bzw. Draft_Competitive)
  if (/friendly|clanMate|quickplay/i.test(type)) return 'friendly';
  return 'party';
}

function shapeSide(p, cap) {
  const rounds = Array.isArray(p?.rounds) ? p.rounds : [];
  // Duell (Crown Series, Clankriegs-Duell …): `cards` enthält alle gespielten Decks am Stück, jede Runde trägt ihr
  // eigenes Deck. `cards` ist das Deck der letzten Runde, `decks` alle Runden-Decks in Spielreihenfolge.
  const roundDecks = rounds
    .map((r) => (Array.isArray(r?.cards) ? r.cards.slice(0, 8).map((c) => shapeCard(c, cap, true)).filter(Boolean) : []))
    .filter((d) => d.length);
  const lastRound = rounds.length ? rounds[rounds.length - 1] : null;
  const deckRaw = Array.isArray(lastRound?.cards) && lastRound.cards.length ? lastRound.cards : p?.cards;
  const cards = (Array.isArray(deckRaw) ? deckRaw : []).slice(0, 8).map((c) => shapeCard(c, cap, true)).filter(Boolean);
  const levels = (roundDecks.length > 1 ? roundDecks.flat() : cards).map((c) => c.lvl).filter((l) => l !== null);
  return {
    ...(roundDecks.length > 1 ? { decks: roundDecks } : null),
    tag: normalizeTag(p?.tag) || '',
    name: str(p?.name),
    clan: shapeClanRef(p?.clan),
    cards,
    tower: shapeCard(p?.supportCards?.[0], cap),
    avgLevel: levels.length ? Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 100) / 100 : null,
    crowns: num(p?.crowns) || 0,
    leaked: num(p?.elixirLeaked),
    kingHp: num(p?.kingTowerHitPoints),
    princessHp: Array.isArray(p?.princessTowersHitPoints) ? p.princessTowersHitPoints.filter((h) => typeof h === 'number') : [],
    start: num(p?.startingTrophies),
    change: num(p?.trophyChange),
    rank: num(p?.globalRank),
  };
}

/**
 * Battlelog. Der abgefragte Spieler steht immer an team[0] — die API garantiert das nicht (siehe fetchBattlelog in
 * lib/crApi.js), deshalb wird per Tag gesucht.
 */
function shapeBattles(rawLog, selfTag, cap) {
  const self = normalizeTag(selfTag);
  if (!Array.isArray(rawLog)) return [];
  // Höchstlevel notfalls aus dem Log selbst (25 Kämpfe × 16 Karten enthalten praktisch immer eine gewöhnliche Karte)
  const useCap = cap || levelCap(rawLog.flatMap((b) => [...(b.team || []), ...(b.opponent || [])].flatMap((p) => p?.cards || [])));
  return rawLog.map((b) => {
    const teamRaw = Array.isArray(b.team) ? [...b.team] : [];
    const meIndex = teamRaw.findIndex((p) => normalizeTag(p?.tag) === self);
    if (meIndex > 0) teamRaw.unshift(teamRaw.splice(meIndex, 1)[0]);
    const oppRaw = Array.isArray(b.opponent) ? b.opponent : [];
    const me = teamRaw[0] || {};
    const opp = oppRaw[0] || {};
    const type = str(b.type);
    const modeName = str(b.gameMode?.name);
    const roundCount = Array.isArray(me.rounds) ? me.rounds.length : 0;
    const group = modeGroup(type, modeName, teamRaw.length, b.isLadderTournament === true);
    // Ranked-Liga, in der der Kampf lief (Battle.leagueNumber, neue Zählung 1–7 = UC — geprüft 15.11.2026 auf dem
    // Server: Spieler in Liga 4 hatte 3 und 4). Nur Ranked; andere Modi tragen das Feld auch, dort ohne Bedeutung.
    const rawLeague = group === 'ranked' ? num(b.leagueNumber) : null;
    const league = rawLeague >= 1 && rawLeague <= 7 ? rawLeague : null;
    return {
      t: parseBattleTimeMs(b.battleTime),
      type,
      mode: modeName,
      group,
      ...(league ? { league } : null),
      arena: str(b.arena?.name),
      result: roundsResult(me, opp) || resultOf(me, opp),
      rounds: roundCount > 1 ? me.rounds.map((r, i) => ({ f: num(r?.crowns) || 0, a: num(opp.rounds?.[i]?.crowns) || 0 })) : null,
      challengeWins: num(b.challengeWinCountBefore),
      challengeTitle: str(b.challengeTitle),
      team: teamRaw.map((p) => shapeSide(p, useCap)),
      opponent: oppRaw.map((p) => shapeSide(p, useCap)),
    };
  }).sort((a, b) => b.t - a.t);
}

function shapeClan(raw) {
  const members = (Array.isArray(raw.memberList) ? raw.memberList : []).map((m) => ({
    tag: normalizeTag(m.tag) || '',
    name: str(m.name),
    role: str(m.role),
    lastSeen: m.lastSeen ? parseBattleTimeMs(m.lastSeen) : null,
    expLevel: num(m.expLevel) || 0,
    trophies: num(m.trophies) || 0,
    arena: str(m.arena?.name),
    rank: num(m.clanRank),
    prevRank: num(m.previousClanRank),
    donations: num(m.donations) || 0,
    received: num(m.donationsReceived) || 0,
  }));
  return {
    tag: normalizeTag(raw.tag) || '',
    name: str(raw.name),
    description: str(raw.description),
    type: str(raw.type),
    badgeId: num(raw.badgeId),
    score: num(raw.clanScore) || 0,
    warTrophies: num(raw.clanWarTrophies) || 0,
    requiredTrophies: num(raw.requiredTrophies) || 0,
    donationsPerWeek: num(raw.donationsPerWeek) || 0,
    location: raw.location ? { id: num(raw.location.id), name: str(raw.location.name), code: str(raw.location.countryCode), isCountry: raw.location.isCountry === true } : null,
    memberCount: num(raw.members) ?? members.length,
    members,
  };
}

const shapeParticipant = (p) => ({
  tag: normalizeTag(p?.tag) || '',
  name: str(p?.name),
  fame: num(p?.fame) || 0,
  repair: num(p?.repairPoints) || 0,
  boatAttacks: num(p?.boatAttacks) || 0,
  decksUsed: num(p?.decksUsed) || 0,
  decksToday: num(p?.decksUsedToday) || 0,
});

const shapeRaceClan = (c) => ({
  tag: normalizeTag(c?.tag) || '',
  name: str(c?.name),
  badgeId: num(c?.badgeId),
  fame: num(c?.fame) || 0,
  repair: num(c?.repairPoints) || 0,
  periodPoints: num(c?.periodPoints) || 0,
  score: num(c?.clanScore) || 0,
  // nicht im Ziel = Zeitstempel kurz vor 1970 ("19691231T235959.000Z")
  finished: !!c?.finishTime && !/^19[67]/.test(str(c.finishTime)),
  participants: (Array.isArray(c?.participants) ? c.participants : []).map(shapeParticipant),
});

/** Laufender Clankrieg. null, wenn der Clan gerade in keinem steht. */
function shapeRiverRace(raw) {
  if (!raw || !raw.clan) return null;
  const clans = (Array.isArray(raw.clans) ? raw.clans : []).map((c) => {
    const shaped = shapeRaceClan(c);
    // Teilnehmerlisten fremder Clans sind lang und werden nicht gezeigt
    return { ...shaped, participants: undefined, active: shaped.participants.filter((p) => p.decksUsed > 0).length };
  });
  return {
    state: str(raw.state),
    periodType: str(raw.periodType),
    periodIndex: num(raw.periodIndex),
    sectionIndex: num(raw.sectionIndex),
    clan: shapeRaceClan(raw.clan),
    clans,
  };
}

/** Kriegsverlauf: je abgeschlossener Woche Platz und Punkte des eigenen Clans plus die Rangfolge. */
function shapeWarLog(raw, clanTag) {
  const self = normalizeTag(clanTag);
  return (Array.isArray(raw?.items) ? raw.items : []).map((it) => {
    const standings = (Array.isArray(it.standings) ? it.standings : []).map((s) => ({
      rank: num(s.rank),
      trophyChange: num(s.trophyChange),
      ...shapeRaceClan(s.clan),
    }));
    const own = standings.find((s) => s.tag === self) || null;
    return {
      season: num(it.seasonId),
      week: num(it.sectionIndex) !== null ? it.sectionIndex + 1 : null,
      date: it.createdDate ? parseBattleTimeMs(it.createdDate) : null,
      own: own ? { rank: own.rank, trophyChange: own.trophyChange, fame: own.fame, score: own.score, participants: own.participants } : null,
      standings: standings.map((s) => ({ rank: s.rank, tag: s.tag, name: s.name, badgeId: s.badgeId, fame: s.fame, trophyChange: s.trophyChange })),
    };
  });
}

function shapePlayerRanking(raw) {
  return (Array.isArray(raw?.items) ? raw.items : []).map((it) => ({
    tag: normalizeTag(it.tag) || '',
    name: str(it.name),
    rank: num(it.rank),
    score: num(it.eloRating) ?? num(it.trophies) ?? 0,
    expLevel: num(it.expLevel),
    clan: shapeClanRef(it.clan),
  })).filter((p) => p.tag);
}

function shapeClanRanking(raw) {
  return (Array.isArray(raw?.items) ? raw.items : []).map((it) => ({
    tag: normalizeTag(it.tag) || '',
    name: str(it.name),
    rank: num(it.rank),
    prevRank: num(it.previousRank),
    score: num(it.clanScore) ?? 0,
    members: num(it.members),
    badgeId: num(it.badgeId),
    location: it.location ? { name: str(it.location.name), code: str(it.location.countryCode) } : null,
  })).filter((c) => c.tag);
}

function shapeClanSearch(raw) {
  return (Array.isArray(raw?.items) ? raw.items : []).map((it) => ({
    tag: normalizeTag(it.tag) || '',
    name: str(it.name),
    badgeId: num(it.badgeId),
    score: num(it.clanScore) || 0,
    warTrophies: num(it.clanWarTrophies) || 0,
    members: num(it.members) || 0,
    location: it.location ? { name: str(it.location.name), code: str(it.location.countryCode) } : null,
  })).filter((c) => c.tag);
}

/**
 * Kartenkatalog des Spiels (/cards): jede Karte mit Seltenheit, Elixier, Bild und ihren Sonderformen samt Bild,
 * dazu die Turmtruppen. Daraus zeigen die Stats-Seiten, was es gibt — auch Karten, Evolutionen und Helden, die
 * nach dem letzten Stand unserer eigenen Kartenliste erschienen sind. maxEvolutionLevel ist ein Bitfeld
 * (1 = Evolution, 2 = Held); fehlt es, entscheiden die Bild-Adressen.
 */
function shapeCatalog(raw) {
  const entry = (c, tower) => {
    if (!c || !c.name) return null;
    const icons = c.iconUrls || {};
    const max = num(c.maxEvolutionLevel) ?? ((icons.evolutionMedium ? 1 : 0) | (icons.heroMedium ? 2 : 0));
    const out = {
      id: tower ? null : cardIdByOfficialName(c.name),
      name: c.name,
      rarity: cap1(str(c.rarity).toLowerCase()),
      elixir: num(c.elixirCost),
      icon: icons.medium || null,
    };
    if ((max & 1) && icons.evolutionMedium) out.ev1 = icons.evolutionMedium;
    if ((max & 2) && icons.heroMedium) out.hero = icons.heroMedium;
    return out;
  };
  return {
    cards: (Array.isArray(raw?.items) ? raw.items : []).map((c) => entry(c, false)).filter(Boolean),
    towers: (Array.isArray(raw?.supportItems) ? raw.supportItems : []).map((c) => entry(c, true)).filter(Boolean),
  };
}

/**
 * Namen aus einem aufbereiteten Battlelog für den Namens-Index: alle Beteiligten (ohne Trophäen — die kennt nur das
 * Profil), mit der Kampfzeit als Zeitpunkt, zu dem der Name galt — so landen Umbenennungen bei den früheren Namen.
 */
function battleNames(battles) {
  const names = [];
  for (const b of Array.isArray(battles) ? battles : []) {
    for (const p of [...b.team, ...b.opponent]) {
      if (p.tag && p.name) names.push({ tag: p.tag, name: p.name, clan: p.clan?.name || '', at: b.t });
    }
  }
  return names;
}

/**
 * Zuletzt gespieltes Ranked-Deck je Spieler aus einem Battlelog — des abgefragten Spielers UND seiner Gegner
 * (jeder Kampf zeigt auch deren Deck). Für die Ranglisten: die API liefert dort keine Decks.
 * @returns {Array<{ tag: string, t: number, cards: Array }>}  je Tag der neueste Kampf
 */
function rankedDecks(battles) {
  const newest = new Map();
  for (const b of Array.isArray(battles) ? battles : []) {
    if (b.group !== 'ranked') continue;
    for (const p of [b.team[0], b.opponent[0]]) {
      if (!p?.tag || p.cards.length !== 8) continue;
      const known = newest.get(p.tag);
      if (!known || b.t > known.t) newest.set(p.tag, { tag: p.tag, t: b.t, cards: p.cards, tower: p.tower || null });
    }
  }
  return [...newest.values()];
}

module.exports = {
  rankedDecks, battleNames, shapeCatalog,
  levelCap, shapeCard, shapePlayer, shapeBattles, shapeClan, shapeRiverRace, shapeWarLog,
  shapePlayerRanking, shapeClanRanking, shapeClanSearch, modeGroup,
};
