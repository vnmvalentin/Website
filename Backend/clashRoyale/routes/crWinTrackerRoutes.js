// crWinTrackerRoutes.js — Clash Royale Win Tracker: verknüpfte Accounts + OBS-Overlay
// mit Liga/Trophäen, Tagesstatistik (Profit, Win/Loss) und den letzten 5 Spielen.
const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../lib/winTrackerStore");

// Transport, Tag-Prüfung und die Battlelog-Umformung liegen im geteilten Client
// (lib/crApi.js) — sie waren vorher hier, in nuzlockeRoutes.js und im Modus-Scanner
// jeweils separat ausgeschrieben.
const {
  isConfigured, normalizeTag, fetchBattlelog: fetchBattlelogRaw, fetchPlayerSummary,
} = require("../lib/crApi");
// Kartenpool fürs Deck-Modul — dieselbe Liste, aus der auch die Icon-URLs im Frontend
// entstehen (1:1 synchron gehalten, siehe Kommentar dort).
const { ALL_CARDS } = require("../core/cards");

const MIN_SYNC_INTERVAL_MS = 30 * 1000;

// Eigener Token statt des geteilten CLASH_ROYALE_API_TOKEN (den nutzen weiterhin Nuzlocke und
// der Modus-Scanner): eigenes Rate-Limit-Kontingent, unabhängig von den anderen CR-Features.
// Fällt auf den geteilten Token zurück, falls der eigene (noch) nicht gesetzt ist — Win-Tracker
// bleibt so auch ohne die neue Variable funktionsfähig.
const WT_TOKEN = process.env.CLASH_ROYALE_API_TOKEN_WINTRACKER || process.env.CLASH_ROYALE_API_TOKEN || "";
// Alle Aufrufe unten laufen über diese beiden lokal token-gebundenen Wrapper statt direkt über
// den geteilten Client, ohne jeden einzelnen Aufruf anzufassen.
const fetchBattlelog = (tag, opts) => fetchBattlelogRaw(tag, { ...opts, token: WT_TOKEN });

// Rückwärtskompatibel: der bisherige Code prüft an mehreren Stellen auf CR_API_TOKEN
const CR_API_TOKEN = isConfigured(WT_TOKEN) ? "configured" : "";

// Beginn der aktuellen Session statt eines festen Tages-Resets um Mitternacht: eine Session endet
// erst, wenn SESSION_GAP_MS lang kein Ranked-Match mehr gespielt wurde. Eine Session von 23 bis
// 4 Uhr wird so nicht durch die Mitternacht zerschnitten — und wer seit Stunden pausiert, sieht
// beim nächsten Blick aufs Overlay wieder 0:0 statt liegengebliebener Werte vom letzten Play
// (das war der ursprüngliche Bug: ein Match kurz nach Mitternacht zählte sofort als "heute",
// obwohl es eigentlich noch zur Session des Vorabends gehörte).
const SESSION_GAP_MS = 4 * 60 * 60 * 1000; // 4h ohne Ranked-Match beendet die Session
const SESSION_LOOKBACK_MS = 24 * 60 * 60 * 1000; // Suchfenster für die Lücke — reicht für jede reale Session

const sessionBattlesDescStmt = db.prepare(`SELECT battle_time_ms FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms >= ? AND game_mode LIKE 'Ranked%' ORDER BY battle_time_ms DESC`);
// Manueller Session-Reset (Button im Editor, siehe POST /accounts/:id/reset-session unten): wirkt
// nur als UNTERE Schranke (Math.max in computeSessionStartMs/compute2v2SessionStartMs) — läuft die
// normale 4h-Lücken-Regel später ohnehin eine neue Session an, sticht sie den manuellen Reset
// automatisch wieder aus, kein Sonderfall nötig.
const getSessionResetAtStmt = db.prepare("SELECT session_reset_at FROM cr_wintracker_accounts WHERE account_id = ?");
const getSessionReset2v2AtStmt = db.prepare("SELECT session_reset_2v2_at FROM cr_wintracker_accounts WHERE account_id = ?");
const getSessionResetTrophyAtStmt = db.prepare("SELECT session_reset_trophy_at FROM cr_wintracker_accounts WHERE account_id = ?");

function computeSessionStartMs(accountId, nowMs = Date.now()) {
  const rows = sessionBattlesDescStmt.all(accountId, nowMs - SESSION_LOOKBACK_MS);
  let start;
  if (!rows.length || nowMs - rows[0].battle_time_ms > SESSION_GAP_MS) {
    start = nowMs; // keine/zu alte Matches -> leere Session ab jetzt
  } else {
    start = rows[0].battle_time_ms;
    for (let i = 1; i < rows.length; i++) {
      if (start - rows[i].battle_time_ms > SESSION_GAP_MS) break; // Lücke gefunden -> Session beginnt danach
      start = rows[i].battle_time_ms;
    }
  }
  return Math.max(start, getSessionResetAtStmt.get(accountId)?.session_reset_at || 0);
}

// fetchPlayer hieß hier schon immer so; fetchPlayerSummary im geteilten Client liefert
// exakt dieselbe Form (Name, Trophäen, Medaillen, Liga, Rang) — hier an WT_TOKEN gebunden.
const fetchPlayer = (tag) => fetchPlayerSummary(tag, WT_TOKEN);

// ── Prepared Statements ───────────────────────────────────────────────────────
const getAccountsByUser = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? ORDER BY created_at ASC");
const getAccountById = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE account_id = ?");
const getAccountByTag = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? AND player_tag = ?");
const getActiveAccountByUser = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? AND is_active = 1");
// Für den Hintergrund-Sync (siehe startBackgroundSync unten): alle aktiven Accounts über alle
// Nutzer hinweg — nur die aktiven, weil nur die tatsächlich ein Overlay speisen.
const getAllActiveAccounts = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE is_active = 1");
const insertAccount = db.prepare(`INSERT INTO cr_wintracker_accounts
  (account_id, user_id, twitch_login, player_tag, player_name, trophies, best_trophies, season_medals, league_number, pol_rank, is_active, last_fetched, created_at, track_mode, clan_name, clan_badge_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const updateAccountTrackMode = db.prepare("UPDATE cr_wintracker_accounts SET track_mode = ? WHERE account_id = ?");
const deleteAccountStmt = db.prepare("DELETE FROM cr_wintracker_accounts WHERE account_id = ?");
const deleteBattlesForAccount = db.prepare("DELETE FROM cr_wintracker_battles WHERE account_id = ?");
const updatePlayerData = db.prepare(`UPDATE cr_wintracker_accounts
  SET player_name = ?, trophies = ?, best_trophies = ?, season_medals = ?, league_number = ?, pol_rank = ?, clan_name = ?, clan_badge_id = ?, last_fetched = ?
  WHERE account_id = ?`);
// 2v2 Ranked: eigene Spalten, unabhängig vom 1v1-Block oben (siehe Migration in winTrackerStore.js).
const updateLeague2v2Stmt = db.prepare("UPDATE cr_wintracker_accounts SET league2v2_trophies = ?, league2v2_best_trophies = ? WHERE account_id = ?");
const setLeague2v2TrophiesAtStmt = db.prepare("UPDATE cr_wintracker_accounts SET league2v2_trophies_at = ? WHERE account_id = ?");
const deactivateAll = db.prepare("UPDATE cr_wintracker_accounts SET is_active = 0 WHERE user_id = ?");
const activateOne = db.prepare("UPDATE cr_wintracker_accounts SET is_active = 1 WHERE account_id = ?");
const setSessionResetStmt = db.prepare("UPDATE cr_wintracker_accounts SET session_reset_at = ? WHERE account_id = ?");
const setSessionReset2v2Stmt = db.prepare("UPDATE cr_wintracker_accounts SET session_reset_2v2_at = ? WHERE account_id = ?");
const setSessionResetTrophyStmt = db.prepare("UPDATE cr_wintracker_accounts SET session_reset_trophy_at = ? WHERE account_id = ?");
const updateRankedDeckStmt = db.prepare("UPDATE cr_wintracker_accounts SET ranked_deck = ?, ranked_deck_at = ? WHERE account_id = ?");
const updateTrophyDeckStmt = db.prepare("UPDATE cr_wintracker_accounts SET trophy_deck = ?, trophy_deck_at = ? WHERE account_id = ?");
const updateLeague2v2DeckStmt = db.prepare("UPDATE cr_wintracker_accounts SET league2v2_deck = ?, league2v2_deck_at = ? WHERE account_id = ?");

// UPSERT statt "OR IGNORE": 2v2-Ranked-Deltas werden rückwirkend aus dem Kontostand VOR dem Match
// berechnet (siehe applyLeague2v2Deltas), der wiederum von einem separaten, PARALLEL laufenden
// Profil-Request abhängt (Promise.all in syncAccount) — kommt dieser Request minimal vor dem
// echten Kontostand-Update bei Supercell an (Race, meist direkt nach einem gerade beendeten
// Match), landet für das NEUESTE Match einmalig trophy_change=0 in der DB. Mit "OR IGNORE" blieb
// dieser falsche Nullwert für immer stehen, auch wenn der übernächste Sync (jetzt mit aktuellerem
// Kontostand) für dasselbe, dann nicht mehr neueste Match den richtigen Wert berechnet hätte —
// genau das Bild, das als "Session-Profit nach Reset hinkt ein Match hinterher" auffiel. Ein
// UPSERT lässt jeden späteren, besser informierten Sync das schon gespeicherte Match korrigieren,
// solange es noch in den letzten ~25 Battlelog-Einträgen auftaucht.
const upsertBattleStmt = db.prepare(`INSERT INTO cr_wintracker_battles
  (account_id, battle_time, battle_time_ms, result, trophy_change, crowns_for, crowns_against, opponent_name, game_mode, battle_arena)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(account_id, battle_time) DO UPDATE SET
    result = excluded.result,
    trophy_change = excluded.trophy_change,
    crowns_for = excluded.crowns_for,
    crowns_against = excluded.crowns_against,
    opponent_name = excluded.opponent_name,
    game_mode = excluded.game_mode,
    battle_arena = excluded.battle_arena`);
const insertBattles = db.transaction((accountId, battles) => {
  for (const b of battles) {
    upsertBattleStmt.run(accountId, b.battleTime, b.battleTimeMs, b.result, b.trophyChange, b.crownsFor, b.crownsAgainst, b.opponentName, b.gameMode, b.arenaRawName || "");
  }
});

// 2v2 Ranked ("2v2League_<season>Arena…") teilt sich den gameMode-Namen "TeamVsTeam" mit einem
// gewöhnlichen 2v2-Freundschaftsspiel — nur arena.rawName verrät die laufende Ranked-Season.
// Präfix-Check statt fester Season-String: bleibt über künftige Season-Wechsel hinweg gültig
// (siehe extractLeague2v2Progress in crApi.js für dieselbe Logik auf der Profil-Seite).
const isLeague2v2Arena = (rawName) => /^2v2league/i.test(rawName || "");
// Trophäenmodus ("trophies" trackMode zeigt player.trophies/bestTrophies im Kopf) entspricht
// KEINEM eigenen Spielmodus mehr, sondern dem "Seasonal Trophy Road"-Eintrag in progress (siehe
// extractAllSeasonalProgress in crApi.js) — empirisch an zwei echten Accounts geprüft: player.
// trophies war beide Male IDENTISCH mit progress["seasonal-trophy-road-<season>"].trophies, und
// KEIN Account hatte auch nur EIN Match mit game_mode "Ladder..." (der früher hier stand — dieser
// Modus scheint mit dem Ranked-Umbau komplett verschwunden zu sein). arena.rawName dieses
// Fortschritts beginnt mit "SeasonalArenas_" — bewusst NUR darüber erkannt, nicht über gameMode,
// weil unklar ist, unter welchem gameMode-Namen ein einzelnes Trophy-Road-Match läuft (genau wie
// bei 2v2 League reicht die Arena als eindeutiges Signal, siehe isLeague2v2Arena).
const isTrophyRoadArena = (rawName) => /^seasonalarenas/i.test(rawName || "");

// ── Beobachtungsliste künftiger Ranked-Modi ──────────────────────────────────────────────────
// "2v2 Ranked" war ursprünglich reine API-Archäologie (echten Account gesucht, der es gerade
// spielt, Battlelog von Hand durchsucht). Damit der nächste neue Modus nicht denselben Aufwand
// braucht, merkt sich jeder Sync automatisch JEDEN progress-Eintrag, der noch keinem bekannten
// Modus zugeordnet ist — rein beobachtend, löst noch kein Overlay-Verhalten aus (siehe
// cr_wintracker_discovered_modes in winTrackerStore.js).
const upsertDiscoveredModeStmt = db.prepare(`
  INSERT INTO cr_wintracker_discovered_modes (prefix, sample_key, arena_name, first_seen_at, last_seen_at, sample_count)
  VALUES (?, ?, ?, ?, ?, 1)
  ON CONFLICT(prefix) DO UPDATE SET last_seen_at = excluded.last_seen_at, arena_name = excluded.arena_name, sample_count = sample_count + 1
`);
// Saisonale Ranked-Modi, die als eigener trackMode gebaut sind: normalisierter progress-Präfix
// (siehe normalizeSeasonalPrefix) -> trackMode. Solche Modi gibt es nur, solange Supercell den
// progress-Eintrag liefert — fehlt er, verschwindet der Modus aus der Übersicht (siehe
// availableTrackModes). Live geprüft am 25.09.2026: nach dem Ende von 2v2 Ranked fehlt
// "2v2League_<season>" komplett in progress. Ein künftiger neuer Modus braucht hier nur eine Zeile.
const SEASONAL_TRACK_MODES = { "2v2league": "2v2" };
// Bereits bekannte/bewusst uninteressante Modi — die gebauten aus SEASONAL_TRACK_MODES, dazu
// "seasonal-trophy-road", das nur den ohnehin schon getrackten trophies-Wert dupliziert.
const KNOWN_SEASONAL_PREFIXES = new Set([...Object.keys(SEASONAL_TRACK_MODES), "seasonal-trophy-road"]);
// NUR die abschließende Saison-/Datums-Ziffernfolge vom Schlüsselende entfernen
// ("2v2League_202609" -> "2v2league", "seasonal-trophy-road-202609" -> "seasonal-trophy-road")
// — bewusst NICHT jede Ziffer im String (ein früherer Versuch tat das und zerstörte dabei
// "2v2" selbst zu "v", weil auch die Ziffer "2" mitten im Namen als "Saisonzahl" verschwand).
// Bleibt bei sonst unveränderter Season-Nummerierung über Monatswechsel hinweg ein einziger
// Eintrag; ändert sich die Ziffernfolge NICHT am Ende, sondern mittendrin (z.B. ein Jahres-
// wechsel bei "AutoChess_2026_Season_11" -> "..._2027_Season_1"), entsteht einmalig ein neuer
// Eintrag — für eine reine Beobachtungsliste unschädlich, kein Korrektheitsproblem.
function normalizeSeasonalPrefix(key) {
  return String(key || "").replace(/([_-]\d+)+$/, "").toLowerCase();
}
function recordDiscoveredModes(seasonalProgress) {
  const now = Date.now();
  for (const p of seasonalProgress || []) {
    const prefix = normalizeSeasonalPrefix(p.key);
    if (!prefix || KNOWN_SEASONAL_PREFIXES.has(prefix)) continue;
    upsertDiscoveredModeStmt.run(prefix, p.key, p.arenaName || "", now, now);
  }
}

const setSeasonalPrefixesStmt = db.prepare("UPDATE cr_wintracker_accounts SET seasonal_prefixes = ? WHERE account_id = ?");
// Nur nach einem ERFOLGREICHEN Profil-Abruf aufrufen — ein API-Fehler darf einen laufenden Modus
// nicht als "vorbei" markieren.
function recordSeasonalPrefixes(accountId, seasonalProgress) {
  const prefixes = [...new Set((seasonalProgress || []).map((p) => normalizeSeasonalPrefix(p.key)).filter(Boolean))];
  setSeasonalPrefixesStmt.run(JSON.stringify(prefixes), accountId);
}

// Welche trackModes für diesen Account gerade existieren: medals/trophies immer, saisonale
// Modi (SEASONAL_TRACK_MODES) nur, solange ihr progress-Eintrag beim letzten Abruf da war.
function availableTrackModes(row) {
  let prefixes = null;
  try { prefixes = JSON.parse(row?.seasonal_prefixes || "null"); } catch { prefixes = null; }
  const seasonal = Object.entries(SEASONAL_TRACK_MODES)
    .filter(([prefix]) => !Array.isArray(prefixes) || prefixes.includes(prefix))
    .map(([, mode]) => mode);
  return ["medals", "trophies", ...seasonal];
}

// 2v2-Ranked-Matches liefern in der API kein trophyChange (das Feld fehlt schlicht) — anders als
// bei Ranked1v1 zählen hier stattdessen aufeinanderfolgende startingTrophies-Werte ein echtes,
// variables Elo-artiges Auf/Ab (empirisch bestätigt: ~+10 bis +30 bei Sieg, ~-25 bis -50 bei
// Niederlage). Mutiert die übergebenen Battle-Objekte VOR dem Wegschreiben (battles kommt
// newest-first von fetchBattlelog): der aktuelle Kontostand (frisch vom Spielerprofil) ist der
// "Nach-Wert" des neuesten Matches, jedes ältere Match erbt als "Nach-Wert" den startingTrophies-
// Wert seines direkten Nachfolgers.
//
// startingTrophies fehlt aber nicht nur bei der bekannten Profil-Race (siehe UPSERT-Kommentar
// oben) — die API liefert es strukturell NUR für team[0] eines 2v2-Matches, nie für team[1]
// (empirisch an zwei echten, gerade verbündeten Accounts bestätigt: dieselbe Begegnung liefert
// bei BEIDEN Spielern team[1] ohne startingTrophies, unabhängig davon wer abfragt — es gibt also
// keinen alternativen Query-Winkel, der den Wert doch noch liefert). Landet der getrackte Spieler
// bei einem Match auf team[1], ist sein Kontostand VOR diesem Match für uns permanent unbekannbar
// — und damit auch der "Nach-Wert" (= Kontostand VOR dem direkten Vorgänger-Match) kaputt. Ohne
// afterValid würde der Code hier stur mit dem alten (zu weit in der Zukunft liegenden) `after`
// weiterrechnen und für das Vorgänger-Match einen erfundenen, falschen Sprung ausgeben statt
// ehrlich 0 zu zeigen. Sobald ein Match wieder ein echtes startingTrophies liefert, ist das ein
// frischer, gültiger Anker — die Kette erholt sich ab dort korrekt von selbst.
function applyLeague2v2Deltas(battles, currentTrophies) {
  let after = currentTrophies || 0;
  let afterValid = true;
  for (const b of battles) {
    if (b.gameMode !== "TeamVsTeam" || !isLeague2v2Arena(b.arenaRawName)) continue;
    const start = typeof b.startingTrophies === "number" ? b.startingTrophies : null;
    b.trophyChange = afterValid && start !== null ? after - start : 0;
    afterValid = start !== null;
    if (start !== null) after = start;
  }
}
// Ein einzelnes echtes Ranked-Match bewegt nie annähernd so viele Medaillen wie eine
// Einordnung/ein Ligasprung (z.B. Liga 6 -> Ultimate Champion): dort liefert die offizielle API
// einen einzelnen Battlelog-Eintrag mit einer stark überhöhten trophyChange (Platzierung, kein
// normaler Sieg). Ohne Filter zählte diese eine Zeile ungebremst in die Tagesstatistik/den
// Stufenzähler mit (Bug: Overlay zeigte z.B. "+713" statt nach dem Aufstieg bei 0 anzufangen).
const PLACEMENT_JUMP_THRESHOLD = 100;

// Nur Ranked-Matches (game_mode "Ranked1v1...") zählen für die Session-Statistik — dort werden
// Medaillen gewonnen/verloren. Friendlies & Co. beeinflussen Win/Loss und Win-Rate nicht.
const dailyStatsStmt = db.prepare(`SELECT
    COALESCE(SUM(trophy_change), 0) AS profit,
    COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
    COALESCE(SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END), 0) AS losses
  FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms >= ? AND game_mode LIKE 'Ranked%' AND ABS(trophy_change) < ${PLACEMENT_JUMP_THRESHOLD}`);
// Wie dailyStatsStmt/ladderBattlesStmt: nur echte Ranked-Matches der LAUFENDEN Session zählen
// (battle_time_ms >= Session-Beginn), Platzierungssprünge raus. Vorher zeigte "letzte 5 Spiele"
// einfach die letzten 5 Matches überhaupt — auch welche von VOR dem Session-Reset, die in der
// Sessionstatistik längst nicht mehr mitzählten. Kann also auch weniger als 5 Einträge liefern,
// wenn die Session noch jung ist — bewusst kein Auffüllen mit älteren Spielen.
const last5Stmt = db.prepare(`SELECT * FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms >= ? AND game_mode LIKE 'Ranked%' AND ABS(trophy_change) < ${PLACEMENT_JUMP_THRESHOLD}
  ORDER BY battle_time_ms DESC LIMIT 5`);

// ── 2v2 Ranked: eigene Session-/Tages-/Letzte-5-Statistik ────────────────────────────────────
// Eigene, parallele Statements statt die obigen umzubauen: die Ranked1v1/Trophy-Road-Abfragen
// bleiben so unangetastet (kein Risiko für bestehendes Verhalten), 2v2 filtert stattdessen auf
// battle_arena (siehe isLeague2v2Arena) statt game_mode.
//
// PLACEMENT_JUMP_THRESHOLD gilt HIER GENAUSO, nur aus einem anderen Grund als bei Ranked1v1: 2v2
// kennt zwar keine Liga-Aufstiegssprünge, aber applyLeague2v2Deltas() berechnet jeden Delta
// rückwirkend aus startingTrophies-Werten aufeinanderfolgender Matches (siehe dort) — fehlt
// AUCH NUR EIN 2v2-Match in den letzten ~30 Battlelog-Einträgen (z.B. weil dazwischen genug
// andere Modi gespielt wurden, dass es aus dem Fenster gerutscht ist), bricht die Kette und
// produziert einen erfundenen Riesensprung (empirisch an einem echten Account gesehen: eine
// Niederlage kam als "+121" raus, der folgende Sieg als "-120"). sessionBattlesDesc2v2Stmt
// bewusst OHNE diesen Filter: für die reine Lückenerkennung (hat seit X Minuten ein Match
// stattgefunden) zählt auch ein Match mit kaputtem Delta als "hier war noch etwas los".
const sessionBattlesDesc2v2Stmt = db.prepare(`SELECT battle_time_ms FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms >= ? AND battle_arena LIKE '2v2League%' ORDER BY battle_time_ms DESC`);
const daily2v2Stmt = db.prepare(`SELECT
    COALESCE(SUM(trophy_change), 0) AS profit,
    COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
    COALESCE(SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END), 0) AS losses
  FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms >= ? AND battle_arena LIKE '2v2League%' AND ABS(trophy_change) < ${PLACEMENT_JUMP_THRESHOLD}`);
const last5_2v2Stmt = db.prepare(`SELECT * FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms >= ? AND battle_arena LIKE '2v2League%' AND ABS(trophy_change) < ${PLACEMENT_JUMP_THRESHOLD}
  ORDER BY battle_time_ms DESC LIMIT 5`);

/** Wie computeSessionStartMs, aber für 2v2 Ranked (battle_arena statt game_mode). */
function compute2v2SessionStartMs(accountId, nowMs = Date.now()) {
  const rows = sessionBattlesDesc2v2Stmt.all(accountId, nowMs - SESSION_LOOKBACK_MS);
  let start;
  if (!rows.length || nowMs - rows[0].battle_time_ms > SESSION_GAP_MS) {
    start = nowMs;
  } else {
    start = rows[0].battle_time_ms;
    for (let i = 1; i < rows.length; i++) {
      if (start - rows[i].battle_time_ms > SESSION_GAP_MS) break;
      start = rows[i].battle_time_ms;
    }
  }
  return Math.max(start, getSessionReset2v2AtStmt.get(accountId)?.session_reset_2v2_at || 0);
}

// ── Trophäenmodus ("Seasonal Trophy Road"): eigene Session-/Tages-/Letzte-5-Statistik ────────
// Lief bisher fälschlich über dailyStatsStmt/last5Stmt mit (die sind Ranked1v1-Medaillen) — beide
// Modi teilten sich so dieselbe Sessionstatistik, obwohl es zwei unabhängige Fortschritte sind
// (siehe isTrophyRoadArena oben für die Herkunft der Unterscheidung). Eigene, parallele Statements
// wie bei 2v2, aus demselben Grund: die Ranked1v1-Abfragen bleiben unangetastet.
const sessionBattlesDescTrophyStmt = db.prepare(`SELECT battle_time_ms FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms >= ? AND battle_arena LIKE 'SeasonalArenas%' ORDER BY battle_time_ms DESC`);
const dailyTrophyStmt = db.prepare(`SELECT
    COALESCE(SUM(trophy_change), 0) AS profit,
    COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
    COALESCE(SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END), 0) AS losses
  FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms >= ? AND battle_arena LIKE 'SeasonalArenas%' AND ABS(trophy_change) < ${PLACEMENT_JUMP_THRESHOLD}`);
const last5TrophyStmt = db.prepare(`SELECT * FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms >= ? AND battle_arena LIKE 'SeasonalArenas%' AND ABS(trophy_change) < ${PLACEMENT_JUMP_THRESHOLD}
  ORDER BY battle_time_ms DESC LIMIT 5`);

/** Wie computeSessionStartMs, aber für den Trophäenmodus (battle_arena statt game_mode). */
function computeTrophySessionStartMs(accountId, nowMs = Date.now()) {
  const rows = sessionBattlesDescTrophyStmt.all(accountId, nowMs - SESSION_LOOKBACK_MS);
  let start;
  if (!rows.length || nowMs - rows[0].battle_time_ms > SESSION_GAP_MS) {
    start = nowMs;
  } else {
    start = rows[0].battle_time_ms;
    for (let i = 1; i < rows.length; i++) {
      if (start - rows[i].battle_time_ms > SESSION_GAP_MS) break;
      start = rows[i].battle_time_ms;
    }
  }
  return Math.max(start, getSessionResetTrophyAtStmt.get(accountId)?.session_reset_trophy_at || 0);
}

const getSettingsByUser = db.prepare("SELECT * FROM cr_wintracker_settings WHERE user_id = ?");
const getSettingsByOverlayKey = db.prepare("SELECT * FROM cr_wintracker_settings WHERE overlay_key = ?");
const insertSettings = db.prepare(`INSERT INTO cr_wintracker_settings
  (user_id, overlay_key, show_daily_profit, show_win_loss_numbers, show_win_loss_percent, show_last5, track_mode, bg_color, bg_opacity, last5_as_result, updated_at)
  VALUES (?, ?, 1, 1, 1, 1, 'medals', '#0c0c12', 88, 0, ?)`);
// track_mode wird hier bewusst nicht mehr gesetzt — es gibt keine globale Voreinstellung mehr,
// die Spalte bleibt auf ihrem Tabellen-Default stehen (siehe resolveTrackMode/insertAccount).
const updateSettingsStmt = db.prepare(`UPDATE cr_wintracker_settings
  SET show_daily_profit = ?, show_win_loss_numbers = ?, show_win_loss_percent = ?, show_last5 = ?, bg_color = ?, bg_opacity = ?, last5_style = ?,
      show_deck = ?, show_profile = ?, deck_placement = ?, last5_direction = ?, last5_new_badge = ?, language = ?,
      chat_channel = ?, chat_enabled = ?, bg_gradient = ?, bg_color_2 = ?, border_color = ?, paginate_overlay = ?, paginate_interval_s = ?,
      show_clan = ?, updated_at = ? WHERE user_id = ?`);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function normalizeBgColor(raw) {
  return HEX_COLOR_RE.test(String(raw || "")) ? raw : "#0c0c12";
}
function normalizeBgOpacity(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 88;
}
function normalizeBgColor2(raw) {
  return HEX_COLOR_RE.test(String(raw || "")) ? raw : "#1a1a2e";
}
// Leer ("") ist ein gültiger, eigener Zustand — "automatisch" (der bisherige, von bg_opacity
// abgeleitete dezente weiße Rand) statt eines Fallback-Hex-Werts, siehe Migration in
// winTrackerStore.js.
function normalizeBorderColor(raw) {
  const v = String(raw || "");
  return v === "" || HEX_COLOR_RE.test(v) ? v : "";
}
const updateOverlayKeyStmt = db.prepare("UPDATE cr_wintracker_settings SET overlay_key = ?, updated_at = ? WHERE user_id = ?");

// ── Overlay-Designer: Darstellung der letzten 5 Spiele + Deck-Platzierung ───────────────────
// Der Kopfbereich (Name/Liga/Hauptwert) ist fix oben. Direkt darunter folgt EIN Modul, das
// Sessionstatistik und letzte 5 Spiele zusammenfasst (siehe OverlayPreview.jsx/
// WinTrackerOverlayPage.jsx) — nichts mehr sortierbar zwischen den beiden, daher kein
// module_order mehr nötig. Nur das Deck kann noch woanders hin: im Stapel direkt über
// ("top") oder unter ("bottom") das Session-Modul, oder als eigene Spalte neben allem
// ("left"/"right").
const LAST5_STYLES = ["result", "delta", "dot"];
function normalizeLast5Style(raw) {
  return LAST5_STYLES.includes(raw) ? raw : "result";
}
const DECK_PLACEMENTS = ["top", "bottom", "left", "right"];
function normalizeDeckPlacement(raw) {
  return DECK_PLACEMENTS.includes(raw) ? raw : "top";
}
const LAST5_DIRECTIONS = ["newestLeft", "newestRight"];
function normalizeLast5Direction(raw) {
  return LAST5_DIRECTIONS.includes(raw) ? raw : "newestLeft";
}
// Sprache von Editor-Seite UND Overlay-Inhalt — eine einzige Einstellung für beides (siehe
// winTrackerStore.js-Migration).
const LANGUAGES = ["de", "en"];
function normalizeLanguage(raw) {
  return LANGUAGES.includes(raw) ? raw : "de";
}
function normalizeChatChannel(raw) {
  return String(raw || "").trim().toLowerCase().replace(/^#/, "").slice(0, 30);
}
// 2-30s: schneller als 2s ist kaum noch lesbar, länger als 30s widerspricht dem Zweck (die Karte
// SOLL ja gerade kompakt bleiben statt den ganzen Inhalt lang stehen zu lassen).
function normalizePaginateIntervalS(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(2, Math.min(30, Math.round(n))) : 6;
}

function getOrCreateSettings(userId) {
  let row = getSettingsByUser.get(userId);
  if (!row) {
    insertSettings.run(userId, nanoid(16), Date.now());
    row = getSettingsByUser.get(userId);
  }
  return row;
}

// ── Ranked-Leiter (Ligen 1-6) ─────────────────────────────────────────────────
// Unterhalb von Ultimate Champion gibt es keine Medaillen, sondern Stufen: Sieg +1,
// Niederlage -1 — auf Stufe 1 einer Liga kann man aber nicht weiter fallen. Die API
// liefert die Stufe nicht mit (currentPathOfLegendSeasonResult.trophies bleibt dort 0),
// deshalb zählen wir sie selbst aus dem gesammelten Battlelog: ab einem Ankerpunkt
// (ladder_step in ladder_league seit ladder_anchor_ms) werden alle Ranked-Matches
// der Reihe nach durchgespielt. Der Anker wird neu gesetzt, wenn der Nutzer die Stufe
// korrigiert oder die Liga wechselt (Auf-/Abstieg, Season-Reset).
const LADDER_STEPS = { 1: 11, 2: 11, 3: 11, 4: 10, 5: 10, 6: 10 };
const ladderStepCount = (leagueNumber) => LADDER_STEPS[Number(leagueNumber)] || 0;

const ladderBattlesStmt = db.prepare(`SELECT result, battle_time_ms FROM cr_wintracker_battles
  WHERE account_id = ? AND battle_time_ms > ? AND game_mode LIKE 'Ranked%' AND ABS(trophy_change) < ${PLACEMENT_JUMP_THRESHOLD}
  ORDER BY battle_time_ms ASC`);
const newestBattleMsStmt = db.prepare("SELECT COALESCE(MAX(battle_time_ms), 0) AS ms FROM cr_wintracker_battles WHERE account_id = ?");
const setLadderAnchorStmt = db.prepare("UPDATE cr_wintracker_accounts SET ladder_step = ?, ladder_league = ?, ladder_anchor_ms = ?, ladder_bonus_start = ? WHERE account_id = ?");
const setSessionClimbStmt = db.prepare("UPDATE cr_wintracker_accounts SET session_climb = ?, session_climb_anchor_ms = ? WHERE account_id = ?");
const setLeague2v2SessionAnchorStmt = db.prepare("UPDATE cr_wintracker_accounts SET league2v2_session_anchor_trophies = ?, league2v2_session_anchor_ms = ? WHERE account_id = ?");

// Anker auf das neueste bekannte Match legen: alles was danach gespielt wird, zählt weiter.
// bonusStart ist der Season-Reset-Bonus, der ab hier verbraucht wird (siehe computeLadder) — 0
// für einen Ligawechsel/eine Korrektur ohne (verbleibenden) Bonus.
function reanchorLadder(accountId, step, leagueNumber, bonusStart = 0) {
  const newest = newestBattleMsStmt.get(accountId)?.ms || 0;
  setLadderAnchorStmt.run(step, Number(leagueNumber) || 0, newest || Date.now(), Math.max(0, bonusStart || 0), accountId);
}

// Kumulativer Session-Stufenzähler: Sieg +1, Niederlage -1 — bewusst OHNE den Season-Bonus-
// Multiplikator und ohne Deckelung an maxSteps, weil er (anders als ladder_step) über
// Liga-Grenzen hinweg weiterlaufen soll und dafür nicht an eine einzelne Liga gebunden sein
// darf. Wird bei jedem Sync inkrementell nachgezogen (nur wirklich neue Matches seit dem
// letzten Aufruf, siehe session_climb_anchor_ms) — ein Ligawechsel setzt NUR ladder_anchor_ms
// zurück (für die "aktuelle Stufe"-Anzeige), diesen Zähler hier nicht.
function updateSessionClimb(row) {
  const sessionStartMs = computeSessionStartMs(row.account_id);
  let anchorMs = row.session_climb_anchor_ms || 0;
  let climb = row.session_climb || 0;
  // Neue Session (>SESSION_GAP_MS Pause) oder allererster Lauf: von vorn zählen.
  if (anchorMs < sessionStartMs) {
    climb = 0;
    // -1: ladderBattlesStmt filtert auf "battle_time_ms > anchorMs" (strikt), aber
    // sessionStartMs IST bereits der Zeitstempel des ERSTEN Spiels der Session (siehe
    // computeSessionStartMs) — kein bereits verarbeiteter Punkt DAVOR wie sonst bei diesem
    // Anker üblich. Ohne das "-1" fiel genau dieses erste Spiel durchs Raster (">" statt ">="),
    // obwohl last5Stmt/dailyStatsStmt (beide ">=") es korrekt mitzählten — sichtbar z.B. als
    // "2 Siege in den letzten 5 Spielen" aber nur "+1" beim Session-Profit.
    anchorMs = sessionStartMs - 1;
  }
  let newestMs = anchorMs;
  for (const b of ladderBattlesStmt.all(row.account_id, anchorMs)) {
    if (b.result === "win") climb += 1;
    else if (b.result === "loss") climb -= 1;
    newestMs = Math.max(newestMs, b.battle_time_ms);
  }
  if (newestMs !== (row.session_climb_anchor_ms || 0) || climb !== (row.session_climb || 0)) {
    setSessionClimbStmt.run(climb, newestMs, row.account_id);
  }
}

// 2v2-Tagesprofit als reiner Kontostand-Anker statt eines aus einzelnen Matches aufsummierten
// Zählers — anders als bei Ranked1v1 oben (wo jedes Match zuverlässig sein eigenes +1/-1 liefert)
// kann 2v2 pro Match KEIN verlässliches trophyChange herleiten (battlelog liefert
// startingTrophies strukturell nur für team[0], siehe applyLeague2v2Deltas). Profit/letzte-5
// hängen deshalb bewusst NICHT von einzelnen Matches ab: league2v2_session_anchor_trophies ist
// der Kontostand VOR dem ersten Match der laufenden Session, Profit = aktueller Kontostand minus
// dieser Anker. row.league2v2_trophies ist hier bewusst der VOR diesem Sync gültige, bereits
// BESTÄTIGTE Kontostand (league2v2_trophies wird nie geschrieben, solange battlelog das
// jeweilige Match noch nicht kennt, siehe battlelogStale in syncAccount) — genau der Wert, der
// galt, BEVOR das erste Match der neuen Session gespielt wurde (angenommen, kontinuierliches
// Syncen fängt jedes Match einzeln ein — reale Match-Abstände liegen bei 113-392s, komfortabel
// über dem 90s-Sync-Intervall, siehe SYNC_LOOP_INTERVAL_MS).
function updateLeague2v2SessionAnchor(row) {
  const sessionStartMs = compute2v2SessionStartMs(row.account_id);
  if ((row.league2v2_session_anchor_ms || 0) < sessionStartMs) {
    setLeague2v2SessionAnchorStmt.run(row.league2v2_trophies || 0, sessionStartMs, row.account_id);
  }
}

/** Reiner Lesezugriff, wie sessionClimbFor — null (Profit noch unbekannt) statt eines veralteten
 *  Werts der vorigen Session, solange noch kein Sync für die aktuelle Session gelaufen ist. */
function league2v2SessionAnchorFor(row, sessionStartMs) {
  return (row.league2v2_session_anchor_ms || 0) < sessionStartMs ? null : (row.league2v2_session_anchor_trophies || 0);
}

// Reiner Lesezugriff für computeLadder — schreibt NICHT (das macht ausschließlich
// updateSessionClimb bei einem Sync). Ist der gespeicherte Stand älter als der aktuelle
// Session-Beginn, ist noch kein Sync für die neue Session gelaufen: dann 0 zeigen statt des
// veralteten Werts der vorigen Session.
function sessionClimbFor(row, sessionStartMs) {
  return (row.session_climb_anchor_ms || 0) < sessionStartMs ? 0 : (row.session_climb || 0);
}

/**
 * Aktuelle Stufe des Accounts, aus dem Battlelog nachgezählt.
 * @returns `{ league, step, maxSteps, sessionDelta, bonusRemaining }` oder null außerhalb der Ligen 1-6
 */
function computeLadder(row, sessionStartMs = computeSessionStartMs(row.account_id)) {
  const maxSteps = ladderStepCount(row.league_number);
  if (!maxSteps) return null;
  // Anker aus einer anderen Liga ist wertlos (Account von vor diesem Feature, oder Liga-
  // wechsel vor dem nächsten Sync): dann Stufe 1 zeigen, ohne alte Matches nachzuspielen.
  if (Number(row.ladder_league) !== Number(row.league_number)) {
    return { league: Number(row.league_number), step: 1, maxSteps, sessionDelta: sessionClimbFor(row, sessionStartMs), bonusRemaining: 0 };
  }
  let step = Math.max(1, Math.min(maxSteps, row.ladder_step || 1));
  // Season-Reset-Bonus (siehe reanchorLadder/syncAccount): so lange er nicht aufgebraucht ist,
  // ersetzt er bei einem Sieg den normalen +1-Gewinn durch seinen eigenen, größeren Wert und
  // sinkt danach um 1 — eine Niederlage verbraucht ihn nicht, sie bleibt bei -1 wie immer.
  let bonus = Math.max(0, row.ladder_bonus_start || 0);
  for (const b of ladderBattlesStmt.all(row.account_id, row.ladder_anchor_ms || 0)) {
    if (b.result === "win") {
      step = Math.min(maxSteps, step + (bonus > 0 ? bonus : 1));
      if (bonus > 0) bonus -= 1;
    } else if (b.result === "loss") {
      step = Math.max(1, step - 1);
    }
  }
  // sessionDelta kommt aus dem kumulativen Session-Zähler (session_climb), NICHT mehr aus
  // "step - Stand zu Sessionbeginn" — der lief bei jedem Liga-Aufstieg auf 0 zurück, weil
  // ladder_anchor_ms dabei neu gesetzt wird (siehe reanchorLadder). session_climb bleibt über
  // Liga-Wechsel hinweg erhalten und wird separat bei jedem Sync fortgeschrieben
  // (updateSessionClimb) — genau der "insgesamt heute geklettert"-Wert, den das Overlay zeigt.
  return { league: Number(row.league_number), step, maxSteps, sessionDelta: sessionClimbFor(row, sessionStartMs), bonusRemaining: bonus };
}

// Manuelle "+"/"-"-Korrektur über eine Ligagrenze hinweg: an Stufe maxSteps nochmal "+" bzw. an
// Stufe 1 nochmal "-" soll wie ein echter Auf-/Abstieg wirken statt an der Kante hängen zu
// bleiben. Unten (Liga 1) ist Schluss — tiefer gibt es in diesem Modell nichts. Oben endet die
// Stufenzählung an der Schwelle zu Liga 7 (Ultimate Champion): dort gibt es keine Stufen mehr,
// das Overlay zeigt ab dann wieder Medaillen (siehe ladderStepCount/computeLadder).
function resolveManualLadderStep(league, step) {
  let lg = Number(league) || 1;
  while (true) {
    const max = ladderStepCount(lg);
    if (!max || step <= max) break;
    if (lg >= 6) { lg = 7; step = 1; break; }
    step -= max;
    lg += 1;
  }
  while (step < 1 && lg > 1) {
    lg -= 1;
    step += ladderStepCount(lg);
  }
  return { league: lg, step: Math.max(1, step) };
}

// ── Getrackter Wert ───────────────────────────────────────────────────────────
const normalizeTrackMode = (raw) => (raw === "trophies" || raw === "2v2" ? raw : "medals");
// Jeder Account entscheidet selbst, ob Medaillen, Trophäen oder 2v2 Ranked getrackt werden
// (Umschalter im Tab "Accounts"). Es gibt bewusst keine globale Voreinstellung mehr dafür — neue
// Accounts starten immer mit Ranked/Medaillen, wer etwas anderes will, stellt es am Account
// selbst um.
const resolveTrackMode = (accountRow) =>
  accountRow?.track_mode ? normalizeTrackMode(accountRow.track_mode) : "medals";

// ── Deck pro Modus ────────────────────────────────────────────────────────────
// Die offizielle API kennt kein "aktuelles Deck pro Modus" — nur den Battlelog. Das Deck wird
// deshalb aus den Karten des jeweils neuesten Ranked1v1- bzw. Ladder-Matches abgeleitet (dieselbe
// gameMode-Unterscheidung, die die Tagesstatistik oben schon nach Ranked-Matches filtert).
const normalizeCardName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const CARD_BY_NAME = new Map(ALL_CARDS.map((c) => [normalizeCardName(c.name), c.id]));

function gameModeGroup(b) {
  // Arena-Prüfung ZUERST: 2v2 League und Trophy Road teilen sich ihren gameMode-Namen mit einem
  // anderen Modus (2v2 mit gewöhnlichem 2v2-Friendly; Trophy Road vermutlich mit Ranked1v1, siehe
  // isTrophyRoadArena) — nur arena.rawName unterscheidet sie zuverlässig. Käme die gameMode-Prüfung
  // zuerst, würde ein Trophy-Road-Match mit "Ranked1v1..."-gameMode fälschlich als "ranked"
  // einsortiert, bevor die Arena-Prüfung überhaupt zum Zug kommt.
  const arenaRaw = b?.arenaRawName || "";
  if (isTrophyRoadArena(arenaRaw)) return "trophy";
  const n = String(b?.gameMode || "");
  if (n.startsWith("Ranked1v1")) return "ranked";
  if (n === "TeamVsTeam" && isLeague2v2Arena(arenaRaw)) return "2v2";
  return null;
}

// "variant" fürs Deck-Modul: welches CDN-Bild (cdn.royaleapi.com/.../cards-150/{id}{-variant}.png)
// gezeigt werden soll. cardVariant() prüft primär, OB iconUrls.evolutionMedium bzw. .heroMedium
// in der Karten-Antwort stehen — das sind reine KATALOG-Fakten der Kartenart ("hat diese Karte
// überhaupt eine Evo-/Hero-Form im Spiel"), KEIN Signal dafür, ob genau DIESE Karte im Deck auch
// tatsächlich in einem Evo-/Hero-Slot steht — das entscheidet erst mapDeckCards() über die
// Slot-Position (siehe SPECIAL_SLOT_COUNT unten). NUR wenn eine Karte BEIDE Formen im Katalog hat
// (hasHero && hasEvo, z.B. Valkyrie), kommt zusätzlich evolutionLevel als Unterscheidungsmerkmal
// dazu — Details dazu direkt bei der Auflösung unten.
//   - iconUrls.evolutionMedium/.heroMedium stehen bei einer Karte IMMER oder NIE — über tausende
//     Kämpfe/Decks hinweg nie gemischt (u.a. Knight, Giant, Wizard, Musketeer, Mini P.E.K.K.A.,
//     Valkyrie, Ice Golem, Goblins, Mega Minion, Barbarian Barrel, Magic Archer, Dark Prince,
//     Bowler, Tombstone, Balloon, Berserker) — WEIL es Katalog-Fakten sind: "hat Barbarian Barrel
//     im aktuellen Spielstand eine Hero-Form" ist unabhängig von jedem einzelnen Deck immer
//     dieselbe Antwort. Ob ein Spieler sie in SEINEM Deck tatsächlich als Hero eingesetzt hat,
//     steht dort nicht drin — nachgewiesen an einem echten Account, dessen Barbarian Barrel in
//     einem normalen Slot stand und trotzdem fälschlich als Hero gerendert wurde, bis die
//     Slot-Beschränkung unten dazukam.
// Champions brauchen keinen Suffix — ihr Kartenbild unter der Basis-id ist bereits die einzige
// Darstellung (kein "-hero" für z.B. skeleton-king, das 404t).
//
// Hero UND Evo gleichzeitig (hasHero && hasEvo): seit dem März-2026-Rework sind Evo-, Hero- und
// Wild-Slot drei GETRENNTE, sich gegenseitig AUSSCHLIESSENDE Deck-Plätze (1 Evo + 1 Hero + 1
// Wild-Slot für eins von beiden) — eine Karte kann im selben Deck nicht gleichzeitig als Hero
// UND als Evolution stehen. Die API liefert iconUrls.heroMedium/.evolutionMedium trotzdem BEIDE,
// sobald der Spieler beide Formen im Katalog freigeschaltet hat (z.B. Valkyrie: Evolution schon
// länger, Hero-Form erst seit dem August-2026-Update) — das sagt nur "beides vorhanden", nicht
// welche der beiden Formen im Wild-Slot tatsächlich gespielt wurde.
//
// Auflösung über evolutionLevel: Evolution hat KEIN Sternesystem (nicht hochlevelbar) — ist eine
// Evolution aktiv, steht evolutionLevel deshalb immer auf 1 (reine "aktiv"-Markierung, kein
// echter Stufenwert). Hero-Karten haben dagegen ein echtes, hochlevelbares Sternesystem — ist
// stattdessen der Hero aktiv, zeigt evolutionLevel den tatsächlichen Hero-Stern (>= 1, meist > 1
// nach etwas Investition). Also: evolutionLevel > 1 → Hero aktiv, sonst (1 oder fehlend) →
// Evolution. Nachgewiesen an einem echten Account über mehrere Matches: eine reine Hero-Karte
// ohne Evo-Option (Ice Wizard) zeigte ihren Hero-Stern konstant über jedes Match hinweg, während
// Valkyrie (beide Formen freigeschaltet) zwischen 1 und 2 wechselte — exakt synchron zu den vom
// Spieler bestätigten Deck-Wechseln zwischen Evo und Hero auf demselben Slot. Bleibt eine
// theoretische Lücke: liegt jemandes echter Hero-Stern zufällig bei genau 1, würde das fälschlich
// als Evolution gelesen — dafür gibt es sonst kein Signal in der API.
function cardVariant(c) {
  const hasHero = !!(c?.iconUrls && c.iconUrls.heroMedium);
  const hasEvo = !!(c?.iconUrls && c.iconUrls.evolutionMedium);
  if (hasHero && hasEvo) {
    return typeof c.evolutionLevel === "number" && c.evolutionLevel > 1 ? "hero" : "ev1";
  }
  if (hasEvo) return "ev1";
  if (hasHero) return "hero";
  return null;
}

// Nur die ersten 3 Karten im zurückgegebenen Array sind die Sonder-Slots: Slot 1 (Index 0)
// bekommt seine Evolution, Slot 2 (Index 1) ist Hero-oder-Champion, Slot 3 (Index 2) ist der
// Mixed-Slot (Evo/Hero/Champion). In den übrigen 5 Slots rendert eine Karte immer normal, AUCH
// wenn sie (an sich, als Kartentyp) eine Evo- oder Hero-Form hätte — Champions können dort gar
// nicht stehen. Nachgewiesen an einem echten Deck: Barbarian Barrel hat zwar eine Hero-Form im
// Spiel, wurde aber fälschlich als Hero gerendert, obwohl sie in einem normalen Slot (Index ≥ 3)
// stand, weil iconUrls.heroMedium unabhängig vom Slot als Katalog-Fakt der Karte mitkommt (siehe
// cardVariant-Kommentar) — die Slot-Position selbst steht nirgends explizit in der API-Antwort,
// nur implizit in der Reihenfolge des cards-Arrays.
const SPECIAL_SLOT_COUNT = 3;

function mapDeckCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.slice(0, 8).map((c, i) => {
    // Die API liefert rarity klein geschrieben ("champion", "rare", ...) — die lokale
    // Kartenliste (und RARITY_COLOR im Frontend) nutzt Großschreibung.
    const rarity = String(c?.rarity || "").toLowerCase();
    return {
      id: CARD_BY_NAME.get(normalizeCardName(c?.name)) || null,
      name: c?.name || "",
      level: typeof c?.level === "number" ? c.level : null,
      maxLevel: typeof c?.maxLevel === "number" ? c.maxLevel : null,
      rarity: rarity ? rarity[0].toUpperCase() + rarity.slice(1) : "",
      variant: i < SPECIAL_SLOT_COUNT ? cardVariant(c) : null,
    };
  });
}

/** Unter den frisch geholten Battles je Modus-Gruppe das neueste Match finden. */
function findLatestDeckBattles(battles) {
  const latest = { ranked: null, trophy: null, "2v2": null };
  for (const b of battles || []) {
    const group = gameModeGroup(b);
    if (!group) continue;
    if (!latest[group] || b.battleTimeMs > latest[group].battleTimeMs) latest[group] = b;
  }
  return latest;
}

/** Deck-Spalten aktualisieren, wenn unter den frisch geholten Battles ein mindestens ebenso
 *  neues Match der jeweiligen Gruppe dabei war (Vergleich gegen den zuletzt gespeicherten
 *  Zeitstempel). Bewusst ">=" statt ">": das battlelog liefert bei jedem Sync die aktuell
 *  gültigen Kartendaten fürs selbe Match neu — bleibt es das gleiche neueste Match (kein neues
 *  gespielt), wird trotzdem neu gemappt. Sonst würde eine Korrektur an mapDeckCards()/cardVariant()
 *  (z.B. der evolutionLevel-Bugfix) nie mehr greifen, bis der Spieler ein neues Match spielt —
 *  Nutzer müssten den Account jedes Mal neu verknüpfen, um ein bereits gespeichertes Deck
 *  aufzufrischen. */
function applyDeckUpdates(accountId, row, battles) {
  const latest = findLatestDeckBattles(battles);
  if (latest.ranked && latest.ranked.battleTimeMs >= (row.ranked_deck_at || 0)) {
    updateRankedDeckStmt.run(JSON.stringify(mapDeckCards(latest.ranked.cards)), latest.ranked.battleTimeMs, accountId);
  }
  if (latest.trophy && latest.trophy.battleTimeMs >= (row.trophy_deck_at || 0)) {
    updateTrophyDeckStmt.run(JSON.stringify(mapDeckCards(latest.trophy.cards)), latest.trophy.battleTimeMs, accountId);
  }
  if (latest["2v2"] && latest["2v2"].battleTimeMs >= (row.league2v2_deck_at || 0)) {
    updateLeague2v2DeckStmt.run(JSON.stringify(mapDeckCards(latest["2v2"].cards)), latest["2v2"].battleTimeMs, accountId);
  }
}

function parseDeckJson(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Deck passend zum getrackten Wert: Ranked-Deck bei "medals", Trophy-Road-Deck bei "trophies",
 *  eigenes 2v2-Ranked-Deck bei "2v2". */
function resolveDeck(row, trackMode) {
  if (trackMode === "2v2") {
    const cards = parseDeckJson(row.league2v2_deck);
    if (!cards.length) return null;
    return { mode: "2v2", cards, updatedAt: row.league2v2_deck_at || 0 };
  }
  const isRanked = trackMode !== "trophies";
  const cards = parseDeckJson(isRanked ? row.ranked_deck : row.trophy_deck);
  if (!cards.length) return null;
  return { mode: isRanked ? "ranked" : "trophy", cards, updatedAt: (isRanked ? row.ranked_deck_at : row.trophy_deck_at) || 0 };
}

// ── Serialisierung ────────────────────────────────────────────────────────────
function accountSummary(row) {
  return {
    accountId: row.account_id,
    playerTag: row.player_tag,
    playerName: row.player_name || row.player_tag,
    trophies: row.trophies,
    bestTrophies: row.best_trophies,
    seasonMedals: row.season_medals,
    leagueNumber: row.league_number,
    polRank: row.pol_rank,
    isActive: !!row.is_active,
    lastFetched: row.last_fetched,
    trackMode: resolveTrackMode(row),
    // Modi, die es gerade gibt — beendete saisonale Ranked-Modi fehlen (siehe availableTrackModes).
    availableModes: availableTrackModes(row),
    // In den Ligen 1-6 gibt es Stufen statt Medaillen — null ab Ultimate Champion
    ladder: computeLadder(row),
    // Deck des getrackten Modus (Ranked-, Trophy-Road- oder 2v2-Ranked-Deck) — null, solange noch
    // kein passendes Match gesynct wurde.
    deck: resolveDeck(row, resolveTrackMode(row)),
    // 2v2 Ranked: eigener Medaillen-Stand, unabhängig von medals/trophies oben (0/0 = noch nie
    // gesynct oder das saisonale 2v2-Ranked-Fenster läuft gerade nicht, siehe
    // extractLeague2v2Progress in crApi.js).
    league2v2Trophies: row.league2v2_trophies || 0,
    league2v2BestTrophies: row.league2v2_best_trophies || 0,
    // Clan-Header-Zusatz (siehe show_clan in settings) — clanName leer heißt "kein Clan".
    clanName: row.clan_name || "",
    clanBadgeId: row.clan_badge_id ?? null,
  };
}

function battleRowToPublic(row) {
  return {
    battleTime: row.battle_time,
    result: row.result,
    trophyChange: row.trophy_change,
    crownsFor: row.crowns_for,
    crownsAgainst: row.crowns_against,
    opponentName: row.opponent_name,
    gameMode: row.game_mode,
  };
}

/**
 * Schaltet track_mode IMMER automatisch auf den Modus des zuletzt gespielten Matches um (kein
 * Opt-in mehr — der Nutzer wählt nichts, das Overlay zeigt einfach, was zuletzt gespielt wurde).
 * Braucht dafür KEINE eigene "zuletzt gespielter Modus"-Spalte — die drei Deck-Zeitstempel
 * (ranked_deck_at/trophy_deck_at/league2v2_deck_at, siehe applyDeckUpdates) SIND bereits genau
 * das: Zeitstempel des neuesten bekannten Matches je Gruppe, monoton wachsend über jeden Sync
 * hinweg. Deren Maximum ist also "zuletzt gespielter Modus" — läuft idempotent bei jedem Sync mit,
 * kein Sonderfall für "gerade nichts Neues gespielt" nötig (dann bleibt das Maximum unverändert,
 * kein Schreibzugriff). Account frisch aus der DB übergeben (NACH applyDeckUpdates), sonst würden
 * die soeben aktualisierten Zeitstempel noch fehlen.
 */
function autoSwitchTrackMode(row) {
  const at = { medals: row.ranked_deck_at || 0, trophies: row.trophy_deck_at || 0, "2v2": row.league2v2_deck_at || 0 };
  // Beendete saisonale Modi (siehe availableTrackModes) scheiden aus — sonst bliebe ein Account nach
  // dem Ende von 2v2 Ranked ewig auf "2v2" stehen, weil das zuletzt gespielte Match eines war.
  const available = availableTrackModes(row);
  let newestMode = null, newestAt = 0;
  for (const mode of available) {
    if ((at[mode] || 0) > newestAt) { newestAt = at[mode]; newestMode = mode; }
  }
  const current = resolveTrackMode(row);
  const target = newestMode || (available.includes(current) ? current : "medals");
  if (target !== current) {
    updateAccountTrackMode.run(target, row.account_id);
  }
}

async function syncAccount(row) {
  const [player, battles] = await Promise.all([fetchPlayer(row.player_tag), fetchBattlelog(row.player_tag)]);
  // 2v2-Ranked-Matches liefern kein trophyChange — vor dem Wegschreiben aus dem aktuellen
  // Kontostand (frisch vom Profil, sonst der zuletzt gespeicherte) nachrechnen.
  const currentLeague2v2Trophies = player && !player.notFound && player.league2v2
    ? player.league2v2.trophies
    : row.league2v2_trophies || 0;
  applyLeague2v2Deltas(battles, currentLeague2v2Trophies);

  // Direkter Profil-Diff statt battlelog-startingTrophies für neue 2v2-Matches seit dem letzten
  // Sync, überall dort wo sich die fehlenden Randwerte auf DIESE Weise bestimmen lassen —
  // battlelog liefert startingTrophies strukturell NUR für team[0] (siehe Kommentar an
  // applyLeague2v2Deltas), landet der getrackte Spieler auf team[1], bleibt trophyChange dort
  // sonst dauerhaft 0, obwohl wir den echten Wert oft trotzdem kennen.
  //
  // Mathematisch: newLeague2v2Battles ist neueste-zuerst, M Einträge lang. Zwischen/um sie herum
  // gibt es M+1 "Randwerte" (bounds[0..M]) — der Kontostand an den jeweiligen Match-Grenzen:
  //   bounds[0]     = aktueller Kontostand NACH dem neuesten Match (player.league2v2.trophies)
  //   bounds[1..M]  = Kontostand VOR newLeague2v2Battles[k-1] — das IST exakt dessen eigenes
  //                   startingTrophies, wenn battlelog es kennt (team[0]). Fehlt es UND es ist
  //                   der ÄLTESTE Randwert (k===M, vor dem ältesten neuen Match), springt
  //                   row.league2v2_trophies vom letzten Sync ein — derselbe Kontostand, den wir
  //                   dort ohnehin schon kennen, unabhängig von battlelog.
  // newLeague2v2Battles[i].trophyChange = bounds[i] - bounds[i+1], für i=0..M-1 — berechenbar
  // GENAU dann, wenn BEIDE seiner eigenen Randwerte bekannt sind. Fehlt irgendwo ein Randwert
  // (ein Match auf team[1], dessen startingTrophies NICHT der äußerste Rand ist), bleiben nur die
  // zwei direkt angrenzenden Matches unberechenbar (ehrlich 0) — alle weiter entfernten, durch
  // einen ANDEREN echten startingTrophies-Wert wieder verankerten Matches bleiben korrekt. Bei
  // einem einzigen neuen Match (M=1) reduziert sich das exakt auf den alten Spezialfall (bounds[0]
  // und bounds[1]=bounds[M], sonst nichts dazwischen).
  // bounds[0] zählt nur, wenn sich player.league2v2.trophies gegenüber dem letzten Sync auch
  // WIRKLICH verändert hat — sonst nicht von "hat /players das Match noch nicht eingeholt"
  // unterscheidbar (dieselbe Unschärfe wie bei league2v2Stale weiter unten): sonst würde hier
  // fälschlich eine 0 bestätigt statt ehrlich unbekannt zu bleiben.
  const newLeague2v2Battles = (battles || []).filter(
    (b) => gameModeGroup(b) === "2v2" && b.battleTimeMs > (row.league2v2_deck_at || 0)
  );
  if (newLeague2v2Battles.length >= 1 && player && !player.notFound && player.league2v2) {
    const M = newLeague2v2Battles.length;
    const profileMoved = player.league2v2.trophies !== (row.league2v2_trophies || 0);
    const bounds = new Array(M + 1).fill(null);
    bounds[0] = profileMoved ? player.league2v2.trophies : null;
    for (let k = 1; k <= M; k++) {
      const ownStart = newLeague2v2Battles[k - 1].startingTrophies;
      if (typeof ownStart === "number") bounds[k] = ownStart;
      else if (k === M) bounds[k] = row.league2v2_trophies || 0;
    }
    for (let i = 0; i < M; i++) {
      if (typeof bounds[i] === "number" && typeof bounds[i + 1] === "number") {
        newLeague2v2Battles[i].trophyChange = bounds[i] - bounds[i + 1];
      }
    }
  }

  // Erst die Matches wegschreiben: der Anker unten soll das Aufstiegsspiel schon kennen.
  if (battles.length) insertBattles(row.account_id, battles);
  // Deck pro Modus aus denselben frisch geholten Battles ableiten (die DB-Zeilen tragen die
  // Karten nicht mit) — unabhängig davon, ob der Spieler-Request unten klappt.
  applyDeckUpdates(row.account_id, row, battles);

  // 2v2 STALE erkannt: ein neues 2v2-Match kam gerade rein (battleTimeMs > der bisher bekannte
  // league2v2_deck_at-Stand), aber player.league2v2.trophies ist noch EXAKT derselbe Wert wie
  // beim letzten Sync — Supercells /players-Endpunkt hat das Match offenbar noch nicht
  // eingeholt, obwohl /battlelog es schon zeigt (derselbe Wettlauf wie im Kommentar an
  // applyLeague2v2Deltas). trophy_change für dieses Match bleibt dann vorübergehend falsch, bis
  // ein SPÄTERER Sync die echten Werte liefert (dank UPSERT in insertBattles selbstkorrigierend,
  // siehe dort) — das lässt sich nicht vermeiden, wir kennen den richtigen Wert schlicht noch
  // nicht. Was sich vermeiden lässt: unnötig lang auf die Korrektur warten. Deshalb hier
  // last_fetched NICHT auf "jetzt" vorrücken, sondern auf dem alten (bereits abgelaufenen) Stand
  // belassen — der nächste Overlay-Poll (alle 15s) löst dann sofort einen neuen Sync-Versuch aus,
  // statt die volle MIN_SYNC_INTERVAL_MS-Bremse (30s) abzuwarten.
  const newest2v2 = findLatestDeckBattles(battles)["2v2"];
  const league2v2Stale = !!(player && !player.notFound && player.league2v2 && newest2v2
    && newest2v2.battleTimeMs > (row.league2v2_deck_at || 0)
    && player.league2v2.trophies === (row.league2v2_trophies || 0));

  // Spiegelbild von league2v2Stale: player.league2v2.trophies hat sich GEGENÜBER dem letzten Sync
  // bereits geändert (das Match ist bei Supercells /players-Endpunkt also längst angekommen), aber
  // /battlelog zeigt dafür noch KEIN passendes neues Match (newest2v2 fehlt oder ist nicht neuer
  // als der bisher bekannte Stand) — /players lief diesmal VOR /battlelog durch. Genau dieses
  // Bild meldete ein Nutzer live: Liga-Trophäen im Overlay sprangen sofort, Win/Loss+Tagesprofit
  // (aus SUM(trophy_change) über die noch fehlenden battlelog-Einträge, siehe applyLeague2v2Deltas)
  // erst viele Sekunden später. Ohne diesen Zweig würde last_fetched trotzdem auf "jetzt" gesetzt
  // und der nächste Sync-Versuch erst nach der vollen MIN_SYNC_INTERVAL_MS-Bremse (30s) folgen,
  // statt schon beim nächsten Overlay-Poll (15s) erneut nachzusehen.
  // Bezugspunkt ist league2v2_trophies_at (Match-Stand beim letzten Schreiben der Trophäen), NICHT
  // league2v2_deck_at: applyDeckUpdates oben hat deck_at schon auf das neueste Match vorgerückt.
  // Hinkte das Profil beim ersten Sync noch hinterher (league2v2Stale), hätte ein deck_at-Vergleich
  // beim nächsten Sync — Profil jetzt aufgeholt — "kein neueres Match als bekannt" ergeben, die
  // Trophäen wären für immer zurückgehalten worden (live: 2336 statt 2305, kein Sync änderte das).
  const battlelogStale = !!(player && !player.notFound && player.league2v2
    && player.league2v2.trophies !== (row.league2v2_trophies || 0)
    && !(newest2v2 && newest2v2.battleTimeMs > (row.league2v2_trophies_at || 0)));

  if (player && !player.notFound) {
    const fetchedAt = (league2v2Stale || battlelogStale) ? (row.last_fetched || 0) : Date.now();
    updatePlayerData.run(player.name || row.player_name, player.trophies, player.bestTrophies, player.seasonMedals, player.leagueNumber, player.polRank, player.clan?.name || "", player.clan?.badgeId ?? null, fetchedAt, row.account_id);
    recordDiscoveredModes(player.seasonalProgress);
    recordSeasonalPrefixes(row.account_id, player.seasonalProgress);
    // battlelogStale zurückhalten statt schreiben: der Overlay-Trophäenwert (league2v2_trophies)
    // soll erst zusammen mit dem passenden Match sichtbar werden, nie einzeln vorauseilen — genau
    // das Bild, das gemeldet wurde (Trophäen springen, Win/Loss+Profit hinken hinterher). Bleibt
    // hier ungeschrieben, vergleicht der nächste Sync player.league2v2.trophies weiterhin gegen
    // denselben alten row.league2v2_trophies-Stand, bis /battlelog nachzieht — dann werden Trophäen
    // UND das Match im selben Sync-Durchlauf übernommen. Betrifft bewusst nur die 2v2-Liga-Spalten,
    // nicht updatePlayerData oben (Name/Leiter-Trophäen/Medaillen/Liga) — die haben keine
    // battlelog-Gegenstelle und laufen unabhängig weiter.
    if (player.league2v2 && !battlelogStale) {
      updateLeague2v2Stmt.run(player.league2v2.trophies, player.league2v2.bestTrophies, row.account_id);
      // Anker nur mitziehen, wenn sich der Kontostand wirklich bewegt hat — ein Match, dessen
      // Trophäen das Profil noch nicht zeigt (league2v2Stale), bleibt so "noch nicht eingerechnet",
      // bis sie ankommen.
      if (newest2v2 && player.league2v2.trophies !== (row.league2v2_trophies || 0)) {
        setLeague2v2TrophiesAtStmt.run(newest2v2.battleTimeMs, row.account_id);
      }
    }
    // Liga gewechselt (Aufstieg, Season-Reset): in der neuen Liga geht es auf Stufe 1 los,
    // gezählt wird ab dem neuesten bekannten Match.
    const oldLeague = Number(row.ladder_league);
    const newLeague = Number(player.leagueNumber);
    if (newLeague !== oldLeague) {
      // Innerhalb einer Season kann die Liga nur steigen, nie sinken (kein Downrank) — ein
      // Rückgang ist deshalb immer ein Season-Reset, und oldLeague war der in dieser Season
      // höchste erreichte Stand. Wer dort ankam, startet die neue Season (immer in Liga 1) mit
      // einem Bonus von (oldLeague - 1), der mit jedem Sieg um 1 sinkt (z.B. Ultimate Champion,
      // Liga 7 -> Bonus 6,5,4,3,2, danach wieder normale +1-Gewinne).
      let bonusStart = 0;
      if (newLeague < oldLeague) {
        bonusStart = Math.max(0, oldLeague - 1);
      } else {
        // Normaler Aufstieg innerhalb der Season: ein noch nicht verbrauchter Bonus gilt
        // saisonweit und bleibt über den Ligawechsel hinweg erhalten.
        const before = computeLadder(row);
        bonusStart = before ? before.bonusRemaining : 0;
      }
      reanchorLadder(row.account_id, 1, newLeague, bonusStart);
    }
  } else {
    // Spieler-Request fehlgeschlagen/nicht gefunden: last_fetched trotzdem setzen, damit wir nicht
    // bei jedem Overlay-Poll erneut gegen die API laufen (Rate-Limit-Schutz).
    db.prepare("UPDATE cr_wintracker_accounts SET last_fetched = ? WHERE account_id = ?").run(Date.now(), row.account_id);
  }
  // WICHTIG: bewusst der URSPRÜNGLICHE row-Parameter, NICHT freshRow unten — row.league2v2_trophies
  // muss der Kontostand VOR diesem Sync sein (siehe ausführlicher Kommentar an
  // updateLeague2v2SessionAnchor). freshRow.league2v2_trophies könnte durch updateLeague2v2Stmt
  // oben bereits den NEUEN Wert tragen — als Anker damit einen Schritt zu spät (nach statt vor dem
  // ersten Match der neuen Session).
  updateLeague2v2SessionAnchor(row);
  // Kumulativer Stufenzähler — unabhängig vom Liga-Anker oben, damit er beim Aufstieg nicht auf
  // 0 zurückfällt (siehe updateSessionClimb). Frische Zeile laden: league_number kann sich im
  // Block oben gerade erst geändert haben (und für autoSwitchTrackMode unten die soeben von
  // applyDeckUpdates geschriebenen Deck-Zeitstempel).
  const freshRow = getAccountById.get(row.account_id);
  updateSessionClimb(freshRow);
  autoSwitchTrackMode(freshRow);
}

/**
 * Account für einen Nutzer verknüpfen — geteilte Logik zwischen dem POST-/accounts-Endpoint und
 * dem Chat-Befehl "!tracker add #TAG" (siehe winTrackerChat.js), damit beide exakt denselben
 * Erstbefüllungs-Ablauf durchlaufen (Spielerdaten, Battlelog, Deck, Stufen-Anker).
 * @returns `{ ok: true, account }` oder `{ ok: false, status, error }`
 */
async function addAccountForUser(userId, twitchLogin, rawTag) {
  const tag = normalizeTag(rawTag);
  if (!tag) return { ok: false, status: 400, error: "Ungültiges Spieler-Kürzel (z.B. #2PP0V9YLL)" };
  if (getAccountByTag.get(userId, tag)) return { ok: false, status: 400, error: "Dieser Account ist bereits verknüpft" };

  let playerName = tag, trophies = 0, bestTrophies = 0, seasonMedals = 0, leagueNumber = 0, polRank = null, lastFetched = 0;
  let league2v2Trophies = 0, league2v2BestTrophies = 0, clanName = "", clanBadgeId = null, seasonalProgress = null;
  if (CR_API_TOKEN) {
    try {
      const p = await fetchPlayer(tag);
      if (p?.notFound) return { ok: false, status: 404, error: "Kein Spieler mit diesem Kürzel gefunden" };
      if (p) {
        playerName = p.name || tag; trophies = p.trophies; bestTrophies = p.bestTrophies;
        seasonMedals = p.seasonMedals; leagueNumber = p.leagueNumber; polRank = p.polRank; lastFetched = Date.now();
        if (p.league2v2) { league2v2Trophies = p.league2v2.trophies; league2v2BestTrophies = p.league2v2.bestTrophies; }
        if (p.clan) { clanName = p.clan.name || ""; clanBadgeId = p.clan.badgeId ?? null; }
        recordDiscoveredModes(p.seasonalProgress);
        seasonalProgress = p.seasonalProgress;
      }
    } catch {
      return { ok: false, status: 502, error: "Royale API nicht erreichbar — versuche es später erneut" };
    }
  }

  const isFirst = getAccountsByUser.all(userId).length === 0;
  const accountId = nanoid(12);
  // Stellt sicher, dass der Nutzer eine Settings-Zeile (u.a. overlay_key) hat.
  getOrCreateSettings(userId);
  // Startwert "medals" ist nur eine Platzhalter-Voreinstellung, bevor wir wissen, was zuletzt
  // gespielt wurde — autoSwitchTrackMode() unten korrigiert das sofort anhand der frisch geholten
  // Battles, falls die zuletzt gespielte Partie tatsächlich ein anderer Modus war.
  insertAccount.run(accountId, userId, String(twitchLogin || ""), tag, playerName, trophies, bestTrophies, seasonMedals, leagueNumber, polRank, isFirst ? 1 : 0, lastFetched, Date.now(), "medals", clanName, clanBadgeId);
  if (league2v2Trophies || league2v2BestTrophies) {
    updateLeague2v2Stmt.run(league2v2Trophies, league2v2BestTrophies, accountId);
  }
  if (seasonalProgress) recordSeasonalPrefixes(accountId, seasonalProgress);

  if (CR_API_TOKEN) {
    try {
      const battles = await fetchBattlelog(tag);
      applyLeague2v2Deltas(battles, league2v2Trophies);
      if (battles.length) insertBattles(accountId, battles);
      // Deck-Erstbefüllung — sonst bliebe das Deck-Modul bis zum nächsten Sync leer.
      applyDeckUpdates(accountId, { ranked_deck_at: 0, trophy_deck_at: 0, league2v2_deck_at: 0 }, battles);
      // Die 2v2-Trophäen oben kommen frisch vom Profil und gehören zu diesem Match-Stand — Anker
      // setzen, damit die Zurückhaltung in syncAccount (battlelogStale) von Anfang an greift.
      const newest2v2 = findLatestDeckBattles(battles)["2v2"];
      if (newest2v2) setLeague2v2TrophiesAtStmt.run(newest2v2.battleTimeMs, accountId);
      // track_mode direkt auf den zuletzt gespielten Modus stellen, statt bis zum ersten
      // regulären Sync bei "medals" hängenzubleiben — frische Zeile laden, sonst fehlen die
      // gerade von applyDeckUpdates geschriebenen Zeitstempel.
      autoSwitchTrackMode(getAccountById.get(accountId));
    } catch { /* Erst-Sync der Matches ist best-effort */ }
  }
  // Stufen-Anker auf das neueste Match legen: die bereits gespielten Matches gehören zu
  // einer Stufe, die wir nicht kennen — der Nutzer korrigiert sie einmalig auf der Seite.
  reanchorLadder(accountId, 1, leagueNumber);
  return { ok: true, account: accountSummary(getAccountById.get(accountId)) };
}

// ── Hintergrund-Sync ─────────────────────────────────────────────────────────
// Bisher wurde nur gesynct, wenn jemand das Overlay offen hatte (Poll alle 15s, throttled auf
// MIN_SYNC_INTERVAL_MS) oder manuell auf "Aktualisieren" klickte. Die offizielle API liefert im
// Battlelog aber nur die letzten ~25 Spiele — lief ein Account über Stunden ohne offenes Overlay
// (z.B. off-stream gegrindet), fielen ältere Spiele aus diesem Fenster, bevor sie je gespeichert
// wurden, und die Tagesstatistik (Win/Loss seit 00:00) zählte dauerhaft zu wenig, ganz ohne dass
// ein späterer Sync das noch nachholen könnte — die Spiele sind bei Supercell schlicht nicht mehr
// abrufbar. Deshalb synct dieser Loop serverseitig alle aktiven Accounts regelmäßig, unabhängig
// davon, ob gerade ein Overlay/die Seite offen ist.
// 90s statt ursprünglich 5 Minuten — empirisch geprüfte Cache-Control-Header der offiziellen API
// (/players: max-age=60, /battlelog: max-age=33) setzen ohnehin eine harte Untergrenze, unterhalb
// derer ein erneuter Request für denselben Account nur dieselbe gecachte Antwort zurückbekommt;
// schneller als ~60s zu pollen bringt also nichts. 90s bleibt knapp darüber und trotzdem weit
// unter der Dauer eines einzelnen Matches (auch 2v2 nicht unter ~1-2 Minuten), das
// battlelog-Fenster (~25 Spiele) kann dabei nicht vollaufen, bevor der nächste Durchlauf greift.
// Kein offiziell dokumentiertes Requests/Sekunde-Limit gefunden (die Response trägt keine
// x-ratelimit-*-Header, anders als beim RoyaleAPI-Proxy) — SYNC_LOOP_CONCURRENCY/-BATCH_SPACING
// unten bleiben als Vorsichtsmaßnahme bestehen, unabhängig von diesem Intervall.
const SYNC_LOOP_INTERVAL_MS = 90 * 1000;
const SYNC_LOOP_FIRST_DELAY_MS = 60 * 1000; // nicht direkt beim Serverstart
// Nicht mehr streng nacheinander (das wären bei 50 aktiven Accounts allein schon 10s reine
// Wartezeit, plus die tatsächliche Netzwerkzeit jedes Requests obendrauf) — stattdessen ein
// kleiner Pool gleichzeitiger Syncs, dazwischen eine kurze Pause. Bei 50 Accounts sind das nur
// noch 10 Wellen à SYNC_LOOP_BATCH_SPACING_MS statt 50 Einzel-Pausen — bleibt aber weiterhin
// weit entfernt von "alle auf einen Schlag", was das Rate-Limit der offiziellen API sprengen
// könnte. Beides zusammen (90s-Zyklus, harmlose Sekunden pro Welle) macht das für jede bei einem
// einzelnen Streamer realistische Account-Zahl unproblematisch.
const SYNC_LOOP_CONCURRENCY = 5;
const SYNC_LOOP_BATCH_SPACING_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let syncLoopTimer = null;

async function runBackgroundSyncOnce() {
  const rows = getAllActiveAccounts.all();
  for (let i = 0; i < rows.length; i += SYNC_LOOP_CONCURRENCY) {
    const batch = rows.slice(i, i + SYNC_LOOP_CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      try {
        await syncAccount(row);
      } catch (e) {
        console.warn(`[win-tracker] Hintergrund-Sync fehlgeschlagen (#${row.player_tag}):`, e.message);
      }
    }));
    if (i + SYNC_LOOP_CONCURRENCY < rows.length) await sleep(SYNC_LOOP_BATCH_SPACING_MS);
  }
  return rows.length;
}

/** Regelmäßiger Sync im Hintergrund. Ohne konfigurierten Token passiert gar nichts. */
function startBackgroundSync() {
  if (!CR_API_TOKEN || syncLoopTimer) return false;
  const run = () => runBackgroundSyncOnce().catch((e) => console.warn("[win-tracker] Hintergrund-Sync:", e.message));
  setTimeout(run, SYNC_LOOP_FIRST_DELAY_MS);
  syncLoopTimer = setInterval(run, SYNC_LOOP_INTERVAL_MS);
  return true;
}

module.exports = function createCrWinTrackerRouter({ requireAuth } = {}) {
  const router = express.Router();

  function ownAccount(req, res) {
    const row = getAccountById.get(req.params.accountId);
    if (!row || row.user_id !== String(req.twitchId)) {
      res.status(404).json({ error: "Account nicht gefunden" });
      return null;
    }
    return row;
  }

  // ── Eigene Accounts + Einstellungen ───────────────────────────────────────
  router.get("/me", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    const settings = getOrCreateSettings(userId);
    res.json({
      accounts: getAccountsByUser.all(userId).map(row => accountSummary(row)),
      apiConfigured: !!CR_API_TOKEN,
      overlayKey: settings.overlay_key,
      settings: {
        showDailyProfit: !!settings.show_daily_profit,
        showWinLossNumbers: !!settings.show_win_loss_numbers,
        showWinLossPercent: !!settings.show_win_loss_percent,
        showLast5: !!settings.show_last5,
        bgColor: settings.bg_color || "#0c0c12",
        bgOpacity: typeof settings.bg_opacity === "number" ? settings.bg_opacity : 88,
        bgGradient: !!settings.bg_gradient,
        bgColor2: settings.bg_color_2 || "#1a1a2e",
        // "" = automatisch (dezenter weißer Rand, von bgOpacity abgeleitet) — siehe
        // normalizeBorderColor.
        borderColor: settings.border_color || "",
        last5Style: normalizeLast5Style(settings.last5_style),
        showDeck: settings.show_deck === null || settings.show_deck === undefined ? true : !!settings.show_deck,
        showProfile: settings.show_profile === null || settings.show_profile === undefined ? true : !!settings.show_profile,
        deckPlacement: normalizeDeckPlacement(settings.deck_placement),
        last5Direction: normalizeLast5Direction(settings.last5_direction),
        last5NewBadge: settings.last5_new_badge === null || settings.last5_new_badge === undefined ? true : !!settings.last5_new_badge,
        language: normalizeLanguage(settings.language),
        showClan: !!settings.show_clan,
        chatChannel: settings.chat_channel || "",
        chatEnabled: !!settings.chat_enabled,
        paginateOverlay: !!settings.paginate_overlay,
        paginateIntervalS: normalizePaginateIntervalS(settings.paginate_interval_s),
      },
    });
  });

  // Beobachtungsliste künftiger Ranked-Modi (siehe recordDiscoveredModes) — rein informativ,
  // account-unabhängig (die Daten stammen aus JEDEM Sync über alle Nutzer hinweg, nicht nur die
  // eigenen). Kein eigener Login-Zwang wäre technisch nötig, requireAuth bleibt trotzdem dran,
  // damit das nicht öffentlich abrufbar ist.
  router.get("/discovered-modes", requireAuth, (req, res) => {
    const rows = db.prepare("SELECT prefix, sample_key, arena_name, first_seen_at, last_seen_at, sample_count FROM cr_wintracker_discovered_modes ORDER BY last_seen_at DESC").all();
    res.json({ modes: rows });
  });

  router.put("/settings", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    getOrCreateSettings(userId);
    const s = req.body || {};
    // Kanal kommt vom eigenen Twitch-Login der Session, nicht mehr aus einem Freitextfeld —
    // ein Tippfehler oder ein Speichern, das den Kanal-Wert nicht mitnimmt (siehe alte
    // chatChannelInput-Race im Frontend), konnte den Befehl sonst unbemerkt tot aussehen lassen
    // ("Aktiv in #kanal" in der UI, aber nie wirklich gespeichert). req.twitchLogin kommt aus der
    // Auth-Session, kann also nicht vom Client verfälscht werden.
    const chatChannel = normalizeChatChannel(req.twitchLogin);
    updateSettingsStmt.run(
      s.showDailyProfit ? 1 : 0,
      s.showWinLossNumbers ? 1 : 0,
      s.showWinLossPercent ? 1 : 0,
      s.showLast5 ? 1 : 0,
      normalizeBgColor(s.bgColor),
      normalizeBgOpacity(s.bgOpacity),
      normalizeLast5Style(s.last5Style),
      s.showDeck ? 1 : 0,
      s.showProfile ? 1 : 0,
      normalizeDeckPlacement(s.deckPlacement),
      normalizeLast5Direction(s.last5Direction),
      s.last5NewBadge ? 1 : 0,
      normalizeLanguage(s.language),
      chatChannel,
      // Ohne hinterlegten Kanal kann der Befehl ohnehin nicht greifen — verhindert ein
      // "aktiv" ohne Kanal, das den Bot unnötig in getTrackerChannels() aufscheinen ließe.
      s.chatEnabled && chatChannel ? 1 : 0,
      s.bgGradient ? 1 : 0,
      normalizeBgColor2(s.bgColor2),
      normalizeBorderColor(s.borderColor),
      s.paginateOverlay ? 1 : 0,
      normalizePaginateIntervalS(s.paginateIntervalS),
      s.showClan ? 1 : 0,
      Date.now(),
      userId
    );
    // Kanal-Joins des gemeinsamen IRC-Bots sofort abgleichen (kein Neustart nötig).
    try { require("../../lib/winchallengeIrc").refreshChannels(); } catch { /* IRC optional */ }
    res.json({ ok: true });
  });

  router.post("/overlay/regenerate", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    getOrCreateSettings(userId);
    updateOverlayKeyStmt.run(nanoid(16), Date.now(), userId);
    res.json({ overlayKey: getSettingsByUser.get(userId).overlay_key });
  });

  router.post("/accounts", requireAuth, async (req, res) => {
    const result = await addAccountForUser(String(req.twitchId), req.twitchLogin, req.body?.tag);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true, account: result.account });
  });

  router.delete("/accounts/:accountId", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    deleteBattlesForAccount.run(row.account_id);
    deleteAccountStmt.run(row.account_id);
    if (row.is_active) {
      const rest = getAccountsByUser.all(row.user_id);
      if (rest.length) activateOne.run(rest[0].account_id);
    }
    res.json({ ok: true });
  });

  router.post("/accounts/:accountId/activate", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    deactivateAll.run(row.user_id);
    activateOne.run(row.account_id);
    res.json({ ok: true });
  });

  router.post("/accounts/:accountId/refresh", requireAuth, async (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    if (!CR_API_TOKEN) return res.status(400).json({ error: "Royale API ist nicht konfiguriert" });
    try {
      await syncAccount(row);
      res.json({ ok: true, account: accountSummary(getAccountById.get(row.account_id)) });
    } catch (e) {
      res.status(502).json({ error: "Royale API nicht erreichbar" });
    }
  });

  // Kein manueller Modus-Endpoint mehr: track_mode wird IMMER von autoSwitchTrackMode() bei jedem
  // Sync gesetzt (siehe dort) — ein manueller PUT wäre spätestens beim nächsten Sync ohnehin
  // wieder überschrieben, also nur scheinbar funktional. Ersatzlos entfernt (mitsamt "!tracker
  // mode" in winTrackerChat.js und der Auswahl im Editor).

  // Aktuelle Stufe der Ranked-Leiter korrigieren. Die API liefert sie nicht mit, deshalb
  // setzt der Nutzer sie einmalig — danach zählt jedes Ranked-Match automatisch weiter.
  // Ein Sprung über die Ligagrenze (Stufe > maxSteps bzw. < 1) zieht die Liga selbst mit, statt
  // an der Kante zu clampen — praktisch, wenn der Nutzer per "+"/"-" einen tatsächlichen Auf-
  // oder Abstieg nachträgt, den der Tracker (noch) nicht selbst mitgezählt hat.
  router.put("/accounts/:accountId/ladder-step", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    const maxSteps = ladderStepCount(row.league_number);
    if (!maxSteps) return res.status(400).json({ error: "Dieser Account ist in keiner Liga mit Stufen (nur Liga 1-6)" });
    const raw = Number(req.body?.step);
    if (!Number.isFinite(raw)) return res.status(400).json({ error: "Ungültige Stufe" });
    // Ein noch nicht verbrauchter Season-Bonus bleibt bei einer reinen Korrektur erhalten.
    const before = computeLadder(row);
    const bonusStart = before ? before.bonusRemaining : 0;
    const { league: newLeague, step: newStep } = resolveManualLadderStep(row.league_number, Math.round(raw));
    if (newLeague !== Number(row.league_number)) {
      // league_number ist sonst allein der API vorbehalten (updatePlayerData) — hier bewusst
      // vorgezogen, damit computeLadder sofort die richtige Liga zeigt. Ein späterer Sync
      // gleicht es ohnehin gegen die echten Serverdaten ab, falls die Korrektur daneben lag.
      db.prepare("UPDATE cr_wintracker_accounts SET league_number = ? WHERE account_id = ?").run(newLeague, row.account_id);
    }
    reanchorLadder(row.account_id, newStep, newLeague, bonusStart);
    res.json({ ok: true, account: accountSummary(getAccountById.get(row.account_id)) });
  });

  // Manueller Session-Reset: setzt den Sessionbeginn auf "jetzt", ohne auf die automatische
  // 4h-Pausen-Regel zu warten (siehe computeSessionStartMs/compute2v2SessionStartMs/
  // computeTrophySessionStartMs oben) — für wer vor Stream-Start schon ein paar Spiele gespielt
  // hat und die nicht in Profit/Win-Loss/letzte 5 sehen will. Jeder Modus hat seine eigene Session
  // (siehe gameModeGroup) — "ranked" ist NUR noch medals, trophies/2v2 haben eigene scopes.
  router.post("/accounts/:accountId/reset-session", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    const rawScope = req.body?.scope;
    const scope = rawScope === "2v2" || rawScope === "trophies" ? rawScope : "ranked";
    const now = Date.now();
    if (scope === "2v2") setSessionReset2v2Stmt.run(now, row.account_id);
    else if (scope === "trophies") setSessionResetTrophyStmt.run(now, row.account_id);
    else setSessionResetStmt.run(now, row.account_id);
    res.json({ ok: true, account: accountSummary(getAccountById.get(row.account_id)) });
  });

  // ========== Overlay (kein Login — read-only für OBS) ==========
  // Synct bei Bedarf (throttled) den aktiven Account und liefert Liga/Trophäen,
  // Session-Statistik (Reset nach SESSION_GAP_MS Pause) sowie die letzten 5 Spiele.
  router.get("/overlay/:overlayKey", async (req, res) => {
    const settings = getSettingsByOverlayKey.get(req.params.overlayKey);
    if (!settings) return res.status(403).json({ error: "Ungültiger Overlay-Link" });

    let active = getActiveAccountByUser.get(settings.user_id);
    if (!active) return res.json({ hasAccount: false });

    if (CR_API_TOKEN && Date.now() - active.last_fetched > MIN_SYNC_INTERVAL_MS) {
      try { await syncAccount(active); } catch { /* stale Daten sind ok, nächster Poll versucht es erneut */ }
      active = getAccountById.get(active.account_id);
    }

    const trackMode = resolveTrackMode(active);
    const is2v2 = trackMode === "2v2";
    const isTrophyMode = trackMode === "trophies";
    // Jeder Modus hat seine eigene Session/Statistik (siehe daily2v2Stmt/last5_2v2Stmt bzw.
    // dailyTrophyStmt/last5TrophyStmt oben) — medals bleibt bei den ursprünglichen Ranked1v1-
    // Statements. trophies lief früher fälschlich MIT über dieselben Ranked1v1-Abfragen wie
    // medals (zwei unabhängige Fortschritte teilten sich eine Statistik).
    //
    // medals-Sonderfall Liga 6 -> Ultimate Champion MITTEN in einer laufenden Session: unterhalb
    // von UC zeigt das Overlay Stufen (ladder.sessionDelta), dailyStatsStmt/last5Stmt laufen zwar
    // im Hintergrund schon mit, werden aber nicht angezeigt. Die einzelnen Ranked-Matches tragen
    // aber von Anfang an ihr echtes trophyChange (Supercell führt intern offenbar durchgehend
    // Medaillen, auch unterhalb UC — nur die Stufenanzeige blendet das aus). Sobald computeLadder
    // ab UC null liefert, schwenkt das Overlay auf dailyStatsStmt/last5Stmt um — ohne Anpassung
    // hier zählte das dann rückwirkend ALLE Stufen-Siege dieser Session mit ihrem echten
    // trophyChange (Bug: 7 Stufen-Siege vor dem Aufstieg erschienen instant als "+210", jedes
    // davon in "letzte 5" plötzlich als "+30" statt der bis dahin gezeigten Stufe). ladder_anchor_ms
    // wird bei JEDEM Liga-Wechsel neu gesetzt (siehe reanchorLadder in syncAccount) — ist die
    // aktuelle Liga schon UC, ist das exakt der Aufstiegszeitpunkt; Math.max mit dem normalen
    // Sessionbeginn verschiebt profit/last5 dann auf "ab dem Aufstieg", ohne Stufen-1-6- oder
    // trophies/2v2-Sessions anzufassen (dort bleibt sessionStart unverändert).
    const sessionStart = is2v2 ? compute2v2SessionStartMs(active.account_id)
      : isTrophyMode ? computeTrophySessionStartMs(active.account_id)
      : (() => {
          const base = computeSessionStartMs(active.account_id);
          const inUC = ladderStepCount(active.league_number) === 0;
          return inUC ? Math.max(base, active.ladder_anchor_ms || 0) : base;
        })();
    const daily = is2v2 ? daily2v2Stmt.get(active.account_id, sessionStart)
      : isTrophyMode ? dailyTrophyStmt.get(active.account_id, sessionStart)
      : dailyStatsStmt.get(active.account_id, sessionStart);
    const wins = daily.wins || 0, losses = daily.losses || 0;
    // 2v2-Profit kommt NICHT aus SUM(trophy_change) wie bei den anderen Modi (daily.profit oben),
    // sondern direkt aus dem Kontostand-Anker (siehe updateLeague2v2SessionAnchor) — unabhängig
    // davon, ob battlelog für einzelne Matches ein trophyChange kennt. wins/losses bleiben aus
    // daily2v2Stmt (crowns-basiert, nie vom team[0]/team[1]-Problem betroffen, siehe
    // applyLeague2v2Deltas). null, solange seit dem aktuellen Sessionbeginn noch kein Sync
    // gelaufen ist — dann zeigt das Overlay vorübergehend 0, bis der nächste Sync den Anker setzt.
    const league2v2Anchor = is2v2 ? league2v2SessionAnchorFor(active, sessionStart) : null;
    const league2v2Profit = league2v2Anchor === null ? 0 : (active.league2v2_trophies || 0) - league2v2Anchor;

    res.json({
      hasAccount: true,
      playerName: active.player_name || active.player_tag,
      playerTag: active.player_tag,
      trophies: active.trophies,
      bestTrophies: active.best_trophies,
      seasonMedals: active.season_medals,
      leagueNumber: active.league_number,
      polRank: active.pol_rank,
      // Clan-Header-Zusatz (siehe show_clan in settings) — clanName leer heißt "kein Clan".
      clanName: active.clan_name || "",
      clanBadgeId: active.clan_badge_id ?? null,
      // 2v2 Ranked: eigener Medaillen-Stand, unabhängig von trophies/seasonMedals oben.
      league2v2Trophies: active.league2v2_trophies || 0,
      league2v2BestTrophies: active.league2v2_best_trophies || 0,
      // Ligen 1-6: Stufen statt Medaillen (null ab Ultimate Champion) — computeLadder ist
      // 1v1-Ranked-spezifisch (greift nur bei league_number 1-6) und braucht daher IMMER den
      // Ranked1v1-Sessionbeginn, unabhängig davon, welchen Modus der aktive Account gerade trackt
      // (medals ist der einzige, bei dem sessionStart oben bereits der Ranked1v1-Wert ist).
      ladder: computeLadder(active, trackMode === "medals" ? sessionStart : computeSessionStartMs(active.account_id)),
      daily: {
        profit: is2v2 ? league2v2Profit : (daily.profit || 0),
        wins,
        losses,
        winPct: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
      },
      // Der SQL-Query liefert immer "neueste zuerst"; last5Direction entscheidet nur noch, ob
      // die Anzeige das so übernimmt (newestLeft, Standard: neuestes Spiel rutscht links rein,
      // drückt den Rest nach rechts) oder umdreht (newestRight: chronologisch, neuestes rechts).
      last5: (() => {
        const stmt = is2v2 ? last5_2v2Stmt : isTrophyMode ? last5TrophyStmt : last5Stmt;
        const rows = stmt.all(active.account_id, sessionStart).map(battleRowToPublic);
        return normalizeLast5Direction(settings.last5_direction) === "newestRight" ? rows.reverse() : rows;
      })(),
      // Deck des getrackten Modus — null, solange kein passendes Match gesynct wurde
      // (dann blendet das Overlay das Modul einfach aus).
      deck: resolveDeck(active, trackMode),
      settings: {
        showDailyProfit: !!settings.show_daily_profit,
        showWinLossNumbers: !!settings.show_win_loss_numbers,
        showWinLossPercent: !!settings.show_win_loss_percent,
        showLast5: !!settings.show_last5,
        // Pro Account gewählt — nicht global: das Overlay folgt dem aktiven Account
        trackMode,
        bgColor: settings.bg_color || "#0c0c12",
        bgOpacity: typeof settings.bg_opacity === "number" ? settings.bg_opacity : 88,
        bgGradient: !!settings.bg_gradient,
        bgColor2: settings.bg_color_2 || "#1a1a2e",
        // "" = automatisch (dezenter weißer Rand, von bgOpacity abgeleitet) — siehe
        // normalizeBorderColor.
        borderColor: settings.border_color || "",
        last5Style: normalizeLast5Style(settings.last5_style),
        showDeck: settings.show_deck === null || settings.show_deck === undefined ? true : !!settings.show_deck,
        showProfile: settings.show_profile === null || settings.show_profile === undefined ? true : !!settings.show_profile,
        deckPlacement: normalizeDeckPlacement(settings.deck_placement),
        last5Direction: normalizeLast5Direction(settings.last5_direction),
        last5NewBadge: settings.last5_new_badge === null || settings.last5_new_badge === undefined ? true : !!settings.last5_new_badge,
        language: normalizeLanguage(settings.language),
        showClan: !!settings.show_clan,
        paginateOverlay: !!settings.paginate_overlay,
        paginateIntervalS: normalizePaginateIntervalS(settings.paginate_interval_s),
      },
    });
  });

  return router;
};

// Wie createWinchallengeRouter in winchallengeRoutes.js: der Export ist die Router-Factory
// selbst, mit zusätzlichen Funktionen als Eigenschaft dran — kein zweiter Require-Pfad nötig.
module.exports.startBackgroundSync = startBackgroundSync;
module.exports.runBackgroundSyncOnce = runBackgroundSyncOnce;
// Vom Chat-Befehl "!tracker add #TAG" genutzt (siehe winTrackerChat.js) — dieselbe
// Erstbefüllungs-Logik wie POST /accounts, kein zweites Mal ausgeschrieben.
module.exports.addAccountForUser = addAccountForUser;
module.exports.accountSummary = accountSummary;
// Für die Startup-Logzeile in index.js — als Zahl statt eines zweiten, von Hand gepflegten
// Textbausteins ("alle X min/s"), sonst genau das Problem, das schon einmal auftrat: der Wert
// wurde geändert, aber eine ANDERE Stelle sagte im Log weiter den alten.
module.exports.SYNC_LOOP_INTERVAL_MS = SYNC_LOOP_INTERVAL_MS;
