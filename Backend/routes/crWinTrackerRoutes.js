// crWinTrackerRoutes.js — Clash Royale Win Tracker: verknüpfte Accounts + OBS-Overlay
// mit Liga/Trophäen, Tagesstatistik (Profit, Win/Loss) und den letzten 5 Spielen.
const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../lib/winTrackerStore");

// Transport, Tag-Prüfung und die Battlelog-Umformung liegen im geteilten Client
// (lib/crApi.js) — sie waren vorher hier, in nuzlockeRoutes.js und im Modus-Scanner
// jeweils separat ausgeschrieben.
const {
  isConfigured, normalizeTag, fetchBattlelog, fetchPlayerSummary,
} = require("../lib/crApi");

const MIN_SYNC_INTERVAL_MS = 30 * 1000;
const OVERLAY_TIMEZONE = "Europe/Berlin";

// Rückwärtskompatibel: der bisherige Code prüft an mehreren Stellen auf CR_API_TOKEN
const CR_API_TOKEN = isConfigured() ? "configured" : "";

// Start des aktuellen Tages (00:00 Ortszeit) als Unix-Millisekunden, ohne externe Zeitzonen-Library:
// Wall-Clock-Werte der Zielzeitzone werden als UTC interpretiert, um den aktuellen Offset zur echten
// UTC-Zeit zu bestimmen — daraus lässt sich die lokale Mitternacht exakt in UTC-ms zurückrechnen.
function startOfTodayMs(tz = OVERLAY_TIMEZONE, atMs = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(atMs)).map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour === 24 ? 0 : +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asUTC - atMs;
  const localMidnightAsUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, 0, 0, 0);
  return localMidnightAsUTC - offsetMs;
}

// fetchPlayer hieß hier schon immer so; fetchPlayerSummary im geteilten Client liefert
// exakt dieselbe Form (Name, Trophäen, Medaillen, Liga, Rang).
const fetchPlayer = fetchPlayerSummary;

// ── Prepared Statements ───────────────────────────────────────────────────────
const getAccountsByUser = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? ORDER BY created_at ASC");
const getAccountById = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE account_id = ?");
const getAccountByTag = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? AND player_tag = ?");
const getActiveAccountByUser = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? AND is_active = 1");
const insertAccount = db.prepare(`INSERT INTO cr_wintracker_accounts
  (account_id, user_id, twitch_login, player_tag, player_name, trophies, best_trophies, season_medals, league_number, pol_rank, is_active, last_fetched, created_at, track_mode)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const updateAccountTrackMode = db.prepare("UPDATE cr_wintracker_accounts SET track_mode = ? WHERE account_id = ?");
const deleteAccountStmt = db.prepare("DELETE FROM cr_wintracker_accounts WHERE account_id = ?");
const deleteBattlesForAccount = db.prepare("DELETE FROM cr_wintracker_battles WHERE account_id = ?");
const updatePlayerData = db.prepare(`UPDATE cr_wintracker_accounts
  SET player_name = ?, trophies = ?, best_trophies = ?, season_medals = ?, league_number = ?, pol_rank = ?, last_fetched = ?
  WHERE account_id = ?`);
const deactivateAll = db.prepare("UPDATE cr_wintracker_accounts SET is_active = 0 WHERE user_id = ?");
const activateOne = db.prepare("UPDATE cr_wintracker_accounts SET is_active = 1 WHERE account_id = ?");

const insertBattleIgnore = db.prepare(`INSERT OR IGNORE INTO cr_wintracker_battles
  (account_id, battle_time, battle_time_ms, result, trophy_change, crowns_for, crowns_against, opponent_name, game_mode)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertBattles = db.transaction((accountId, battles) => {
  for (const b of battles) {
    insertBattleIgnore.run(accountId, b.battleTime, b.battleTimeMs, b.result, b.trophyChange, b.crownsFor, b.crownsAgainst, b.opponentName, b.gameMode);
  }
});
// Nur Ranked-Matches (game_mode "Ranked1v1...") zählen für die Tagesstatistik — dort werden
// Medaillen gewonnen/verloren. Friendlies & Co. beeinflussen Win/Loss und Win-Rate nicht.
const dailyStatsStmt = db.prepare(`SELECT
    COALESCE(SUM(trophy_change), 0) AS profit,
    COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
    COALESCE(SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END), 0) AS losses
  FROM cr_wintracker_battles WHERE account_id = ? AND battle_time_ms >= ? AND game_mode LIKE 'Ranked%'`);
const last5Stmt = db.prepare("SELECT * FROM cr_wintracker_battles WHERE account_id = ? ORDER BY battle_time_ms DESC LIMIT 5");

const getSettingsByUser = db.prepare("SELECT * FROM cr_wintracker_settings WHERE user_id = ?");
const getSettingsByOverlayKey = db.prepare("SELECT * FROM cr_wintracker_settings WHERE overlay_key = ?");
const insertSettings = db.prepare(`INSERT INTO cr_wintracker_settings
  (user_id, overlay_key, show_daily_profit, show_win_loss_numbers, show_win_loss_percent, show_last5, track_mode, bg_color, bg_opacity, last5_as_result, updated_at)
  VALUES (?, ?, 1, 1, 1, 1, 'medals', '#0c0c12', 88, 1, ?)`);
const updateSettingsStmt = db.prepare(`UPDATE cr_wintracker_settings
  SET show_daily_profit = ?, show_win_loss_numbers = ?, show_win_loss_percent = ?, show_last5 = ?, track_mode = ?, bg_color = ?, bg_opacity = ?, last5_as_result = ?, updated_at = ? WHERE user_id = ?`);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function normalizeBgColor(raw) {
  return HEX_COLOR_RE.test(String(raw || "")) ? raw : "#0c0c12";
}
function normalizeBgOpacity(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 88;
}
const updateOverlayKeyStmt = db.prepare("UPDATE cr_wintracker_settings SET overlay_key = ?, updated_at = ? WHERE user_id = ?");

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
  WHERE account_id = ? AND battle_time_ms > ? AND game_mode LIKE 'Ranked%' ORDER BY battle_time_ms ASC`);
const newestBattleMsStmt = db.prepare("SELECT COALESCE(MAX(battle_time_ms), 0) AS ms FROM cr_wintracker_battles WHERE account_id = ?");
const setLadderAnchorStmt = db.prepare("UPDATE cr_wintracker_accounts SET ladder_step = ?, ladder_league = ?, ladder_anchor_ms = ? WHERE account_id = ?");

// Anker auf das neueste bekannte Match legen: alles was danach gespielt wird, zählt weiter.
function reanchorLadder(accountId, step, leagueNumber) {
  const newest = newestBattleMsStmt.get(accountId)?.ms || 0;
  setLadderAnchorStmt.run(step, Number(leagueNumber) || 0, newest || Date.now(), accountId);
}

/**
 * Aktuelle Stufe des Accounts, aus dem Battlelog nachgezählt.
 * @returns `{ league, step, maxSteps, todayDelta }` oder null außerhalb der Ligen 1-6
 */
function computeLadder(row, dayStartMs = startOfTodayMs()) {
  const maxSteps = ladderStepCount(row.league_number);
  if (!maxSteps) return null;
  // Anker aus einer anderen Liga ist wertlos (Account von vor diesem Feature, oder Liga-
  // wechsel vor dem nächsten Sync): dann Stufe 1 zeigen, ohne alte Matches nachzuspielen.
  if (Number(row.ladder_league) !== Number(row.league_number)) {
    return { league: Number(row.league_number), step: 1, maxSteps, todayDelta: 0 };
  }
  let step = Math.max(1, Math.min(maxSteps, row.ladder_step || 1));
  let stepAtDayStart = step;
  let sawToday = false;
  for (const b of ladderBattlesStmt.all(row.account_id, row.ladder_anchor_ms || 0)) {
    if (!sawToday && b.battle_time_ms >= dayStartMs) { stepAtDayStart = step; sawToday = true; }
    if (b.result === "win") step = Math.min(maxSteps, step + 1);
    else if (b.result === "loss") step = Math.max(1, step - 1);
  }
  return { league: Number(row.league_number), step, maxSteps, todayDelta: step - stepAtDayStart };
}

// ── Getrackter Wert ───────────────────────────────────────────────────────────
const normalizeTrackMode = (raw) => (raw === "trophies" ? "trophies" : "medals");
// Jeder Account entscheidet selbst, ob Medaillen oder Trophäen getrackt werden. Ein leeres
// track_mode (Accounts von vor dieser Spalte) erbt die globale Voreinstellung.
const resolveTrackMode = (accountRow, settingsRow) =>
  accountRow?.track_mode ? normalizeTrackMode(accountRow.track_mode) : normalizeTrackMode(settingsRow?.track_mode);

// ── Serialisierung ────────────────────────────────────────────────────────────
function accountSummary(row, settingsRow) {
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
    trackMode: resolveTrackMode(row, settingsRow),
    // In den Ligen 1-6 gibt es Stufen statt Medaillen — null ab Ultimate Champion
    ladder: computeLadder(row),
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

async function syncAccount(row) {
  const [player, battles] = await Promise.all([fetchPlayer(row.player_tag), fetchBattlelog(row.player_tag)]);
  // Erst die Matches wegschreiben: der Anker unten soll das Aufstiegsspiel schon kennen.
  if (battles.length) insertBattles(row.account_id, battles);
  if (player && !player.notFound) {
    updatePlayerData.run(player.name || row.player_name, player.trophies, player.bestTrophies, player.seasonMedals, player.leagueNumber, player.polRank, Date.now(), row.account_id);
    // Liga gewechselt (Aufstieg, Season-Reset): in der neuen Liga geht es auf Stufe 1 los,
    // gezählt wird ab dem neuesten bekannten Match.
    if (Number(player.leagueNumber) !== Number(row.ladder_league)) {
      reanchorLadder(row.account_id, 1, player.leagueNumber);
    }
  } else {
    // Spieler-Request fehlgeschlagen/nicht gefunden: last_fetched trotzdem setzen, damit wir nicht
    // bei jedem Overlay-Poll erneut gegen die API laufen (Rate-Limit-Schutz).
    db.prepare("UPDATE cr_wintracker_accounts SET last_fetched = ? WHERE account_id = ?").run(Date.now(), row.account_id);
  }
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
      accounts: getAccountsByUser.all(userId).map(row => accountSummary(row, settings)),
      apiConfigured: !!CR_API_TOKEN,
      overlayKey: settings.overlay_key,
      settings: {
        showDailyProfit: !!settings.show_daily_profit,
        showWinLossNumbers: !!settings.show_win_loss_numbers,
        showWinLossPercent: !!settings.show_win_loss_percent,
        showLast5: !!settings.show_last5,
        trackMode: settings.track_mode === "trophies" ? "trophies" : "medals",
        bgColor: settings.bg_color || "#0c0c12",
        bgOpacity: typeof settings.bg_opacity === "number" ? settings.bg_opacity : 88,
        last5AsResult: settings.last5_as_result === null || settings.last5_as_result === undefined ? true : !!settings.last5_as_result,
      },
    });
  });

  router.put("/settings", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    getOrCreateSettings(userId);
    const s = req.body || {};
    updateSettingsStmt.run(
      s.showDailyProfit ? 1 : 0,
      s.showWinLossNumbers ? 1 : 0,
      s.showWinLossPercent ? 1 : 0,
      s.showLast5 ? 1 : 0,
      s.trackMode === "trophies" ? "trophies" : "medals",
      normalizeBgColor(s.bgColor),
      normalizeBgOpacity(s.bgOpacity),
      s.last5AsResult ? 1 : 0,
      Date.now(),
      userId
    );
    res.json({ ok: true });
  });

  router.post("/overlay/regenerate", requireAuth, (req, res) => {
    const userId = String(req.twitchId);
    getOrCreateSettings(userId);
    updateOverlayKeyStmt.run(nanoid(16), Date.now(), userId);
    res.json({ overlayKey: getSettingsByUser.get(userId).overlay_key });
  });

  router.post("/accounts", requireAuth, async (req, res) => {
    const userId = String(req.twitchId);
    const tag = normalizeTag(req.body?.tag);
    if (!tag) return res.status(400).json({ error: "Ungültiges Spieler-Kürzel (z.B. #2PP0V9YLL)" });
    if (getAccountByTag.get(userId, tag)) return res.status(400).json({ error: "Dieser Account ist bereits verknüpft" });

    let playerName = tag, trophies = 0, bestTrophies = 0, seasonMedals = 0, leagueNumber = 0, polRank = null, lastFetched = 0;
    if (CR_API_TOKEN) {
      try {
        const p = await fetchPlayer(tag);
        if (p?.notFound) return res.status(404).json({ error: "Kein Spieler mit diesem Kürzel gefunden" });
        if (p) {
          playerName = p.name || tag; trophies = p.trophies; bestTrophies = p.bestTrophies;
          seasonMedals = p.seasonMedals; leagueNumber = p.leagueNumber; polRank = p.polRank; lastFetched = Date.now();
        }
      } catch (e) {
        return res.status(502).json({ error: "Royale API nicht erreichbar — versuche es später erneut" });
      }
    }

    const isFirst = getAccountsByUser.all(userId).length === 0;
    const accountId = nanoid(12);
    // Neue Accounts starten mit der globalen Voreinstellung, lassen sich danach einzeln umstellen
    const settings = getOrCreateSettings(userId);
    insertAccount.run(accountId, userId, String(req.twitchLogin || ""), tag, playerName, trophies, bestTrophies, seasonMedals, leagueNumber, polRank, isFirst ? 1 : 0, lastFetched, Date.now(), normalizeTrackMode(settings.track_mode));

    if (CR_API_TOKEN) {
      try {
        const battles = await fetchBattlelog(tag);
        if (battles.length) insertBattles(accountId, battles);
      } catch { /* Erst-Sync der Matches ist best-effort */ }
    }
    // Stufen-Anker auf das neueste Match legen: die bereits gespielten Matches gehören zu
    // einer Stufe, die wir nicht kennen — der Nutzer korrigiert sie einmalig auf der Seite.
    reanchorLadder(accountId, 1, leagueNumber);
    res.json({ ok: true, account: accountSummary(getAccountById.get(accountId), settings) });
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
      res.json({ ok: true, account: accountSummary(getAccountById.get(row.account_id), getOrCreateSettings(row.user_id)) });
    } catch (e) {
      res.status(502).json({ error: "Royale API nicht erreichbar" });
    }
  });

  // Getrackter Wert dieses einen Accounts (Medaillen oder Trophäen) — das Overlay zeigt
  // immer den Wert des aktiven Accounts, jeder Account darf einen anderen tracken.
  router.put("/accounts/:accountId/track-mode", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    const mode = normalizeTrackMode(req.body?.trackMode);
    updateAccountTrackMode.run(mode, row.account_id);
    res.json({ ok: true, account: accountSummary(getAccountById.get(row.account_id), getOrCreateSettings(row.user_id)) });
  });

  // Aktuelle Stufe der Ranked-Leiter korrigieren. Die API liefert sie nicht mit, deshalb
  // setzt der Nutzer sie einmalig — danach zählt jedes Ranked-Match automatisch weiter.
  router.put("/accounts/:accountId/ladder-step", requireAuth, (req, res) => {
    const row = ownAccount(req, res);
    if (!row) return;
    const maxSteps = ladderStepCount(row.league_number);
    if (!maxSteps) return res.status(400).json({ error: "Dieser Account ist in keiner Liga mit Stufen (nur Liga 1-6)" });
    const raw = Number(req.body?.step);
    if (!Number.isFinite(raw)) return res.status(400).json({ error: "Ungültige Stufe" });
    reanchorLadder(row.account_id, Math.max(1, Math.min(maxSteps, Math.round(raw))), row.league_number);
    res.json({ ok: true, account: accountSummary(getAccountById.get(row.account_id), getOrCreateSettings(row.user_id)) });
  });

  // ========== Overlay (kein Login — read-only für OBS) ==========
  // Synct bei Bedarf (throttled) den aktiven Account und liefert Liga/Trophäen,
  // Tagesstatistik seit 00:00 Uhr sowie die letzten 5 Spiele.
  router.get("/overlay/:overlayKey", async (req, res) => {
    const settings = getSettingsByOverlayKey.get(req.params.overlayKey);
    if (!settings) return res.status(403).json({ error: "Ungültiger Overlay-Link" });

    let active = getActiveAccountByUser.get(settings.user_id);
    if (!active) return res.json({ hasAccount: false });

    if (CR_API_TOKEN && Date.now() - active.last_fetched > MIN_SYNC_INTERVAL_MS) {
      try { await syncAccount(active); } catch { /* stale Daten sind ok, nächster Poll versucht es erneut */ }
      active = getAccountById.get(active.account_id);
    }

    const dayStart = startOfTodayMs();
    const daily = dailyStatsStmt.get(active.account_id, dayStart);
    const wins = daily.wins || 0, losses = daily.losses || 0;

    res.json({
      hasAccount: true,
      playerName: active.player_name || active.player_tag,
      playerTag: active.player_tag,
      trophies: active.trophies,
      bestTrophies: active.best_trophies,
      seasonMedals: active.season_medals,
      leagueNumber: active.league_number,
      polRank: active.pol_rank,
      // Ligen 1-6: Stufen statt Medaillen (null ab Ultimate Champion)
      ladder: computeLadder(active, dayStart),
      daily: {
        profit: daily.profit || 0,
        wins,
        losses,
        winPct: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
      },
      last5: last5Stmt.all(active.account_id).map(battleRowToPublic),
      settings: {
        showDailyProfit: !!settings.show_daily_profit,
        showWinLossNumbers: !!settings.show_win_loss_numbers,
        showWinLossPercent: !!settings.show_win_loss_percent,
        showLast5: !!settings.show_last5,
        // Pro Account gewählt — nicht global: das Overlay folgt dem aktiven Account
        trackMode: resolveTrackMode(active, settings),
        bgColor: settings.bg_color || "#0c0c12",
        bgOpacity: typeof settings.bg_opacity === "number" ? settings.bg_opacity : 88,
        last5AsResult: settings.last5_as_result === null || settings.last5_as_result === undefined ? true : !!settings.last5_as_result,
      },
    });
  });

  return router;
};
