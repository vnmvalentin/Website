// crWinTrackerRoutes.js — Clash Royale Win Tracker: verknüpfte Accounts + OBS-Overlay
// mit Liga/Trophäen, Tagesstatistik (Profit, Win/Loss) und den letzten 5 Spielen.
const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../lib/winTrackerStore");

const CR_API_TOKEN = process.env.CLASH_ROYALE_API_TOKEN || "";
const CR_API_BASE = process.env.CLASH_ROYALE_API_BASE || "https://api.clashroyale.com/v1";
const MIN_SYNC_INTERVAL_MS = 30 * 1000;
const OVERLAY_TIMEZONE = "Europe/Berlin";

const TAG_CHARS = /^[0289PYLQGRJCUV]{3,12}$/;

function normalizeTag(raw) {
  const tag = String(raw || "").trim().toUpperCase().replace(/^#/, "").replace(/O/g, "0");
  return TAG_CHARS.test(tag) ? tag : null;
}

// "20260721T101530.000Z" (kompaktes API-Format) -> Unix-Millisekunden
function parseBattleTimeMs(bt) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/.exec(String(bt || ""));
  if (!m) return Date.now();
  const [, y, mo, d, h, mi, s, ms] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms);
}

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

function resultOf(team, opponent) {
  const tc = team?.trophyChange;
  if (typeof tc === "number" && tc !== 0) return tc > 0 ? "win" : "loss";
  const cf = team?.crowns ?? 0, ca = opponent?.crowns ?? 0;
  if (cf > ca) return "win";
  if (cf < ca) return "loss";
  return "draw";
}

async function fetchJson(url) {
  if (!CR_API_TOKEN) return null;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${CR_API_TOKEN}` },
      signal: ctrl.signal,
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`Royale API HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPlayer(tag) {
  const data = await fetchJson(`${CR_API_BASE}/players/%23${tag}`);
  if (!data || data.notFound) return data;
  const pol = data.currentPathOfLegendSeasonResult || null;
  return {
    name: data.name || "",
    trophies: data.trophies || 0,
    bestTrophies: data.bestTrophies || data.trophies || 0,
    // "Medaillen": Punktestand der laufenden Ranked-Season (Path of Legend) — im Gegensatz zu den
    // Lifetime-"Trophäen" oben startet dieser Wert jede Season wieder bei 0.
    seasonMedals: pol?.trophies || 0,
    leagueNumber: pol?.leagueNumber || 0,
    polRank: typeof pol?.rank === "number" ? pol.rank : null,
  };
}

async function fetchBattlelog(tag) {
  const data = await fetchJson(`${CR_API_BASE}/players/%23${tag}/battlelog`);
  if (!Array.isArray(data)) return [];
  return data.map((b) => {
    const team = b.team?.[0] || {};
    const opponent = b.opponent?.[0] || {};
    return {
      battleTime: b.battleTime,
      battleTimeMs: parseBattleTimeMs(b.battleTime),
      result: resultOf(team, opponent),
      trophyChange: typeof team.trophyChange === "number" ? team.trophyChange : 0,
      crownsFor: team.crowns ?? 0,
      crownsAgainst: opponent.crowns ?? 0,
      opponentName: opponent.name || "",
      gameMode: b.gameMode?.name || "",
    };
  });
}

// ── Prepared Statements ───────────────────────────────────────────────────────
const getAccountsByUser = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? ORDER BY created_at ASC");
const getAccountById = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE account_id = ?");
const getAccountByTag = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? AND player_tag = ?");
const getActiveAccountByUser = db.prepare("SELECT * FROM cr_wintracker_accounts WHERE user_id = ? AND is_active = 1");
const insertAccount = db.prepare(`INSERT INTO cr_wintracker_accounts
  (account_id, user_id, twitch_login, player_tag, player_name, trophies, best_trophies, season_medals, league_number, pol_rank, is_active, last_fetched, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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
  (user_id, overlay_key, show_daily_profit, show_win_loss_numbers, show_win_loss_percent, show_last5, track_mode, bg_color, bg_opacity, updated_at)
  VALUES (?, ?, 1, 1, 1, 1, 'medals', '#0c0c12', 88, ?)`);
const updateSettingsStmt = db.prepare(`UPDATE cr_wintracker_settings
  SET show_daily_profit = ?, show_win_loss_numbers = ?, show_win_loss_percent = ?, show_last5 = ?, track_mode = ?, bg_color = ?, bg_opacity = ?, updated_at = ? WHERE user_id = ?`);

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
  if (player && !player.notFound) {
    updatePlayerData.run(player.name || row.player_name, player.trophies, player.bestTrophies, player.seasonMedals, player.leagueNumber, player.polRank, Date.now(), row.account_id);
  } else {
    // Spieler-Request fehlgeschlagen/nicht gefunden: last_fetched trotzdem setzen, damit wir nicht
    // bei jedem Overlay-Poll erneut gegen die API laufen (Rate-Limit-Schutz).
    db.prepare("UPDATE cr_wintracker_accounts SET last_fetched = ? WHERE account_id = ?").run(Date.now(), row.account_id);
  }
  if (battles.length) insertBattles(row.account_id, battles);
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
      accounts: getAccountsByUser.all(userId).map(accountSummary),
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
    insertAccount.run(accountId, userId, String(req.twitchLogin || ""), tag, playerName, trophies, bestTrophies, seasonMedals, leagueNumber, polRank, isFirst ? 1 : 0, lastFetched, Date.now());

    const row = getAccountById.get(accountId);
    if (CR_API_TOKEN) {
      try {
        const battles = await fetchBattlelog(tag);
        if (battles.length) insertBattles(accountId, battles);
      } catch { /* Erst-Sync der Matches ist best-effort */ }
    }
    res.json({ ok: true, account: accountSummary(row) });
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
        trackMode: settings.track_mode === "trophies" ? "trophies" : "medals",
        bgColor: settings.bg_color || "#0c0c12",
        bgOpacity: typeof settings.bg_opacity === "number" ? settings.bg_opacity : 88,
      },
    });
  });

  return router;
};
